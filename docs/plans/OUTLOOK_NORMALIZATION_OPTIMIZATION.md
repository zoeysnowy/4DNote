# Outlook 同步 Normalization 优化计划

**版本**: v1.0  
**创建日期**: 2025-12-22  
**优先级**: P0-P2  
**关联文档**: [EVENTSERVICE_ARCHITECTURE.md](../architecture/EVENTSERVICE_ARCHITECTURE.md), [OUTLOOK_SYNC_TO_NODES.md](../OUTLOOK_SYNC_TO_NODES.md)

---

## 📋 优化清单总览

| 优化点 | 优先级 | 状态 | 预计工作量 |
|--------|--------|------|-----------|
| [MsoList 伪列表识别](#1-msolist-伪列表陷阱处理) | **P0** ⚠️ | 待开发 | 2-3 天 |
| [样式白名单清洗](#2-样式白名单清洗策略) | **P0** ⚠️ | 待开发 | 1-2 天 |
| [CID 图片修复](#3-cid-附件图片处理) | **P1** | 待开发 | 2-3 天 |
| [空行去噪](#4-空行与布局去噪) | **P2** | 待开发 | 0.5-1 天 |
| [回写兼容性](#5-回写-outlook-兼容性) | **P2** | 待开发 | 1-2 天 |

**总计**: 6.5-11 天工作量（按优先级可分阶段实施）

---

## 1. 🚨 MsoList 伪列表陷阱处理

### 核心痛点

**问题描述**：  
Outlook（尤其是桌面版，基于 Word 引擎）不生成标准的 `<ul>/<li>` 或 `<ol>/<li>` 标签，而是使用带有特殊样式的 `<p>` 标签来渲染列表。

**典型 HTML 示例**：
```html
<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">
  <![if !supportLists]>
  <span style="mso-list:Ignore">1.<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>
  <![endif]>
  会议纪要第一点
</p>
<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">
  <![if !supportLists]>
  <span style="mso-list:Ignore">a.<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp;&nbsp;</span></span>
  <![endif]>
  子项目
</p>
```

**当前风险**：  
- ❌ Slate 编辑器显示为一堆普通段落，前面带着 "1.", "a." 等奇怪文本
- ❌ 无法识别缩进层级 (Depth)
- ❌ bulletLevel 信息丢失

### 解决方案

#### 识别策略

```typescript
// OutlookSyncService.ts 或 serialization.ts
function isMsoListParagraph(element: HTMLElement): boolean {
  const className = element.className || '';
  const style = element.getAttribute('style') || '';
  
  return className.includes('MsoListParagraph') || 
         style.includes('mso-list:');
}

function extractMsoListLevel(element: HTMLElement): number {
  const style = element.getAttribute('style') || '';
  const match = style.match(/mso-list:.*?level(\d+)/);
  
  if (match) {
    return parseInt(match[1], 10);
  }
  
  return 1; // 默认层级
}

function extractMsoListType(element: HTMLElement): 'numbered' | 'bullet' {
  // 检查 mso-list 标记中的 Ignore 内容
  const ignoreSpan = element.querySelector('[style*="mso-list:Ignore"]');
  if (ignoreSpan) {
    const text = ignoreSpan.textContent || '';
    // 如果包含数字 (1., 2., i., a.)，判断为有序列表
    if (/^[\d\w]+\.$/.test(text.trim())) {
      return 'numbered';
    }
  }
  
  // 默认为无序列表
  return 'bullet';
}
```

#### 重构为 Slate 节点

```typescript
function parseMsoListToSlate(htmlElements: HTMLElement[]): SlateNode[] {
  const slateNodes: SlateNode[] = [];
  let currentList: SlateNode | null = null;
  
  for (const element of htmlElements) {
    if (isMsoListParagraph(element)) {
      const level = extractMsoListLevel(element);
      const listType = extractMsoListType(element);
      
      // 清理文本内容（移除 mso-list:Ignore 部分）
      const textContent = cleanMsoListText(element);
      
      const listItem: SlateNode = {
        type: 'list-item',
        bulletLevel: level - 1, // mso level 从 1 开始，Slate 从 0 开始
        children: [{ text: textContent }]
      };
      
      // 如果是同一个列表的延续，追加到 currentList
      if (currentList && currentList.listType === listType) {
        currentList.children.push(listItem);
      } else {
        // 新列表
        currentList = {
          type: listType === 'numbered' ? 'numbered-list' : 'bullet-list',
          listType,
          children: [listItem]
        };
        slateNodes.push(currentList);
      }
    } else {
      // 非列表段落，终止当前列表
      currentList = null;
      slateNodes.push(parseNormalParagraph(element));
    }
  }
  
  return slateNodes;
}

function cleanMsoListText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  
  // 移除 mso-list:Ignore 标记
  const ignoreSpans = clone.querySelectorAll('[style*="mso-list:Ignore"]');
  ignoreSpans.forEach(span => span.remove());
  
  // 移除条件注释 <![if !supportLists]>
  let html = clone.innerHTML;
  html = html.replace(/<!\[if !supportLists\]>[\s\S]*?<!\[endif\]>/gi, '');
  
  return html.trim();
}
```

#### 集成点

- **normalizeHtml()** (serialization.ts): 在 HTML → Slate 转换前，预处理 MsoListParagraph
- **htmlToSlate()**: 调用 `parseMsoListToSlate()` 替代标准列表解析

---

## 2. 🧹 样式白名单清洗策略

### 核心痛点

**问题描述**：  
Outlook HTML 携带大量内联样式（字体 11pt、Calibri、黑色文本等）。如果不清洗，会导致：
- ❌ **黑底黑字**问题：深色模式下黑色文字看不见
- ❌ 字体不统一：Calibri vs 系统默认字体
- ❌ 垃圾 marks 污染：`{ fontSize: "11pt", fontFamily: "Calibri", color: "#000000" }`

### 解决方案

#### 样式白名单定义

```typescript
// serialization.ts
const ALLOWED_TEXT_STYLES = {
  // ✅ 保留的样式
  'font-weight': ['bold', '700', '800', '900'],
  'font-style': ['italic'],
  'text-decoration': ['underline', 'line-through'],
  'background-color': true, // 高亮色保留
  
  // ❌ 强制剔除
  'color': false,           // 剔除所有文本颜色（适配主题）
  'font-family': false,     // 使用系统默认字体
  'font-size': false,       // 使用编辑器默认大小
  'line-height': false,
  'margin': false,
  'padding': false
};

const ALLOWED_HIGHLIGHT_COLORS = [
  // 只保留明显的高亮色
  '#ffff00', // 黄色
  '#00ff00', // 绿色
  '#ff00ff', // 紫色
  // ... 其他非黑/非白的颜色
];
```

#### 清洗逻辑

```typescript
function sanitizeInlineStyle(element: HTMLElement): void {
  const style = element.style;
  const cleanedStyles: Record<string, string> = {};
  
  // 遍历所有样式属性
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    const value = style.getPropertyValue(prop);
    
    if (ALLOWED_TEXT_STYLES[prop]) {
      if (Array.isArray(ALLOWED_TEXT_STYLES[prop])) {
        // 检查值是否在允许列表中
        if (ALLOWED_TEXT_STYLES[prop].includes(value)) {
          cleanedStyles[prop] = value;
        }
      } else if (ALLOWED_TEXT_STYLES[prop] === true) {
        // 特殊处理 background-color
        if (prop === 'background-color' && isAllowedHighlight(value)) {
          cleanedStyles[prop] = value;
        }
      }
    }
  }
  
  // 清空原样式，应用白名单样式
  element.removeAttribute('style');
  Object.entries(cleanedStyles).forEach(([prop, value]) => {
    element.style.setProperty(prop, value);
  });
}

function isAllowedHighlight(color: string): boolean {
  const normalized = normalizeColor(color); // rgb() → hex
  return ALLOWED_HIGHLIGHT_COLORS.includes(normalized) &&
         normalized !== '#000000' && 
         normalized !== '#ffffff';
}
```

#### Slate Marks 清洗

```typescript
function sanitizeSlateMarks(node: SlateNode): void {
  if ('text' in node) {
    // 文本节点，清洗 marks
    const allowedMarks: Record<string, any> = {};
    
    if (node.bold) allowedMarks.bold = true;
    if (node.italic) allowedMarks.italic = true;
    if (node.underline) allowedMarks.underline = true;
    if (node.strikethrough) allowedMarks.strikethrough = true;
    
    // 高亮色特殊处理
    if (node.backgroundColor && isAllowedHighlight(node.backgroundColor)) {
      allowedMarks.backgroundColor = node.backgroundColor;
    }
    
    // 清空所有 marks，只保留白名单
    Object.keys(node).forEach(key => {
      if (key !== 'text' && !allowedMarks[key]) {
        delete node[key];
      }
    });
  }
  
  if ('children' in node) {
    node.children.forEach(sanitizeSlateMarks);
  }
}
```

#### 集成点

- **htmlToSlate()**: 在解析 HTML 前，对所有元素调用 `sanitizeInlineStyle()`
- **normalizeEvent()**: 在保存前，对 Slate JSON 调用 `sanitizeSlateMarks()`

---

## 3. 🖼 CID 附件图片处理

### 核心痛点

**问题描述**：  
Outlook 内嵌图片使用 `cid:` 协议（Content-ID），例如：
```html
<img src="cid:image001.png@01DB1234.56789ABC">
```

**当前风险**：  
- ❌ Slate 无法渲染 `cid:` 协议图片，显示为裂图
- ❌ 丢失会议截图、流程图等重要视觉信息

### 解决方案

#### 方案 A：转存本地对象存储（推荐）

```typescript
// OutlookSyncService.ts
interface OutlookAttachment {
  contentId: string;        // "image001.png@01DB1234.56789ABC"
  contentType: string;      // "image/png"
  name: string;             // "screenshot.png"
  contentBytes: string;     // Base64 编码的二进制数据
}

async function processCidImages(
  html: string, 
  attachments: OutlookAttachment[]
): Promise<string> {
  // 1. 提取所有 cid: 引用
  const cidRegex = /src="cid:([^"]+)"/g;
  const cidMatches = Array.from(html.matchAll(cidRegex));
  
  // 2. 为每个 CID 找到对应的附件
  const cidMap = new Map<string, string>(); // cid -> local URL
  
  for (const match of cidMatches) {
    const cid = match[1];
    const attachment = attachments.find(att => att.contentId === cid);
    
    if (attachment) {
      // 3. 转存到对象存储
      const localUrl = await saveAttachmentToStorage(attachment);
      cidMap.set(cid, localUrl);
    }
  }
  
  // 4. 替换 HTML 中的 cid:
  let processedHtml = html;
  cidMap.forEach((localUrl, cid) => {
    processedHtml = processedHtml.replace(
      new RegExp(`src="cid:${escapeRegex(cid)}"`, 'g'),
      `src="${localUrl}"`
    );
  });
  
  return processedHtml;
}

async function saveAttachmentToStorage(attachment: OutlookAttachment): Promise<string> {
  // 解码 Base64
  const binary = atob(attachment.contentBytes);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  const blob = new Blob([bytes], { type: attachment.contentType });
  
  // 保存到 IndexedDB 对象存储
  const fileId = `outlook-attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await storageManager.saveFile(fileId, blob);
  
  // 返回本地 URL（通过 URL.createObjectURL 或自定义协议）
  return `4dnote://local/${fileId}`;
}
```

#### 方案 B：Base64 内联（轻量场景）

```typescript
async function inlineCidAsBase64(
  html: string, 
  attachments: OutlookAttachment[]
): Promise<string> {
  const cidRegex = /src="cid:([^"]+)"/g;
  const cidMatches = Array.from(html.matchAll(cidRegex));
  
  let processedHtml = html;
  
  for (const match of cidMatches) {
    const cid = match[1];
    const attachment = attachments.find(att => att.contentId === cid);
    
    if (attachment) {
      // 直接嵌入 Base64（适合小图片 < 100KB）
      const base64Url = `data:${attachment.contentType};base64,${attachment.contentBytes}`;
      processedHtml = processedHtml.replace(
        new RegExp(`src="cid:${escapeRegex(cid)}"`, 'g'),
        `src="${base64Url}"`
      );
    }
  }
  
  return processedHtml;
}
```

#### 集成点

- **OutlookSyncService.fetchEventFromOutlook()**: 调用 MS Graph API 时，同时获取 `event.attachments`
- **normalizeHtml()**: 在 HTML → Slate 转换前，调用 `processCidImages()`

---

## 4. 🧱 空行与布局去噪

### 核心痛点

**问题描述**：  
Outlook 用户用多个"空回车"排版，HTML 里充满：
```html
<p>&nbsp;</p>
<p class="MsoNormal"><o:p>&nbsp;</o:p></p>
<p><br></p>
```

**当前风险**：  
- ❌ 笔记里出现大片无意义空行
- ❌ 影响阅读体验和 AI 摘要质量

### 解决方案

#### 连续空行折叠

```typescript
function collapseEmptyParagraphs(slateNodes: SlateNode[]): SlateNode[] {
  const result: SlateNode[] = [];
  let consecutiveEmptyCount = 0;
  
  for (const node of slateNodes) {
    const isEmpty = isEmptyParagraph(node);
    
    if (isEmpty) {
      consecutiveEmptyCount++;
      
      // 最多保留 1 个空行
      if (consecutiveEmptyCount === 1) {
        result.push(node);
      }
    } else {
      consecutiveEmptyCount = 0;
      result.push(node);
    }
  }
  
  return result;
}

function isEmptyParagraph(node: SlateNode): boolean {
  if (node.type !== 'paragraph') return false;
  
  const text = Node.string(node);
  return text.trim() === '' || text === '\u00A0'; // &nbsp;
}
```

#### 剔除 Outlook XML 遗留物

```typescript
function cleanOutlookXmlTags(html: string): string {
  // 移除 Office XML 命名空间标签
  return html
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, '')   // <o:p> 标签
    .replace(/<w:sdtPr>[\s\S]*?<\/w:sdtPr>/gi, '') // Word 结构化文档属性
    .replace(/xmlns:o="[^"]*"/gi, '')         // xmlns 声明
    .replace(/xmlns:w="[^"]*"/gi, '');
}
```

#### 集成点

- **normalizeHtml()**: 先调用 `cleanOutlookXmlTags()`，再解析为 Slate
- **htmlToSlate()**: 转换完成后调用 `collapseEmptyParagraphs()`

---

## 5. 🔄 回写 Outlook 兼容性

### 核心痛点

**问题描述**：  
4DNote → Outlook 时，如果生成的 HTML 过于"现代"（Flexbox、CSS Grid、div 嵌套），Outlook 的 Word 引擎会渲染崩坏。

**典型问题**：  
- ❌ Flexbox 布局被忽略，内容错位
- ❌ CSS 变量不支持
- ❌ `<style>` 块被剔除

### 解决方案

#### Outlook Compat Mode

```typescript
// serialization.ts
function slateToHtmlWithOutlookCompat(slateNodes: SlateNode[]): string {
  const html = slateToHtml(slateNodes); // 标准转换
  
  return wrapWithOutlookCompatWrapper(html);
}

function wrapWithOutlookCompatWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <style>
    /* Outlook-safe 样式 */
    p { margin: 0; padding: 0; }
    .4dnote-list-item { margin-left: 20px; }
  </style>
</head>
<body style="font-family: Arial, sans-serif; font-size: 11pt; color: #000000;">
  ${content}
</body>
</html>
  `.trim();
}
```

#### Table 布局替代 Flexbox

```typescript
function renderMultiColumnWithTable(columns: string[]): string {
  // ❌ 不要用 Flexbox：
  // <div style="display: flex;">...</div>
  
  // ✅ 使用 Table：
  const cells = columns.map(col => `<td style="padding: 5px;">${col}</td>`).join('');
  return `
    <table border="0" cellspacing="0" cellpadding="0" width="100%">
      <tr>${cells}</tr>
    </table>
  `;
}
```

#### 内联 CSS 强化

```typescript
function inlineAllStyles(html: string): string {
  // 使用 juice 或 inline-css 库
  // 将 <style> 块中的 CSS 规则内联到元素的 style 属性
  
  // 示例（需安装 juice）:
  // import juice from 'juice';
  // return juice(html);
  
  return html; // 占位
}
```

#### 集成点

- **EventService.serializeEventDescription()**: 调用 `slateToHtmlWithOutlookCompat()`
- **OutlookSyncService.pushEventToOutlook()**: 确保 description 使用兼容模式 HTML

---

## 🎯 实施计划

### 阶段 1：P0 优化（必须完成）

**目标**：解决黑底黑字和列表识别问题（用户体验 P0）

**工作项**：
1. ✅ 实现 MsoList 识别与解析
2. ✅ 实现样式白名单清洗
3. ✅ 编写单元测试（覆盖 10+ Outlook HTML 样本）
4. ✅ 在 test-completemeta-v2.html 中验证

**预计时间**：3-5 天  
**交付物**：
- `serialization.ts` 新增 `parseMsoListToSlate()`, `sanitizeInlineStyle()`
- `test/fixtures/outlook-html-samples.html`（测试样本）

### 阶段 2：P1 优化（重要功能）

**目标**：支持图片同步

**工作项**：
1. ✅ 实现 CID 图片映射
2. ✅ 集成对象存储（IndexedDB）
3. ✅ 处理图片尺寸限制（大图压缩/裁剪）

**预计时间**：2-3 天  
**交付物**：
- `OutlookSyncService.processCidImages()`
- StorageManager 新增 `saveFile()`, `getFileUrl()`

### 阶段 3：P2 优化（体验提升）

**目标**：去噪和回写兼容

**工作项**：
1. ✅ 空行折叠
2. ✅ Outlook Compat Mode HTML 生成
3. ✅ 回写测试（Outlook 桌面版 + 网页版）

**预计时间**：1-2 天  
**交付物**：
- `collapseEmptyParagraphs()`, `wrapWithOutlookCompatWrapper()`
- Outlook 渲染测试报告

---

## 📊 测试策略

### 1. 单元测试

**测试样本收集**：
- 从真实 Outlook 邮件中提取 10+ HTML 样本
- 覆盖场景：有序列表、无序列表、多层嵌套、图片、空行、富文本

**测试框架**：
```typescript
describe('Outlook Normalization', () => {
  it('should parse MsoListParagraph as bullet-list', () => {
    const html = `<p class="MsoListParagraph" style="mso-list:l0 level1">项目 1</p>`;
    const slate = htmlToSlate(html);
    
    expect(slate[0].type).toBe('bullet-list');
    expect(slate[0].children[0].bulletLevel).toBe(0);
  });
  
  it('should remove black text color for dark mode compatibility', () => {
    const html = `<span style="color: #000000;">黑色文字</span>`;
    const slate = htmlToSlate(html);
    
    expect(slate[0].children[0].color).toBeUndefined();
  });
});
```

### 2. 集成测试

**测试流程**：
1. 从 Outlook 获取真实邮件（MS Graph API）
2. 运行 normalize 流程
3. 渲染到 Slate 编辑器
4. 检查视觉效果（列表缩进、颜色、图片）
5. 回写到 Outlook
6. 验证 Outlook 渲染是否正常

### 3. 视觉回归测试

**工具**：Playwright + Percy

**检查点**：
- 深色模式下文本可见性
- 列表层级缩进正确
- 图片显示正常
- 无多余空行

---

## ⚠️ 风险与缓解

### 风险 1：MsoList 识别误判

**风险**：将非列表的 `<p>` 误识别为列表

**缓解**：
- 严格检查 `mso-list` 和 `MsoListParagraph` 同时存在
- 添加 fallback 逻辑：如果解析失败，降级为普通段落
- 用户反馈机制：允许手动标记"这不是列表"

### 风险 2：样式白名单过于严格

**风险**：剔除了用户有意设置的颜色（如红色警告文本）

**缓解**：
- 扩展白名单：保留非黑/非白的明显颜色（红、黄、绿、蓝）
- 添加配置选项：用户可选择"保留所有颜色"（高级模式）

### 风险 3：CID 图片存储膨胀

**风险**：大量高清截图导致 IndexedDB 爆满

**缓解**：
- 图片压缩：超过 500KB 自动压缩到 80% 质量
- 定期清理：删除 30 天前的未引用图片
- 云存储迁移：提供 OneDrive/S3 集成选项

---

## 📚 参考资料

- [Outlook HTML and CSS Support](https://learn.microsoft.com/en-us/previous-versions/office/developer/exchange-server-2010/aa338201(v=exchg.140))
- [MSO List Styles Deep Dive](https://www.campaignmonitor.com/css/list-element/mso-list/)
- [Email Client CSS Support Matrix](https://www.caniemail.com/)
- [MS Graph API - Attachments](https://learn.microsoft.com/en-us/graph/api/resources/attachment)

---

## ✅ 验收标准

### P0 功能验收

- ✅ 从 Outlook 导入的列表正确显示为缩进列表（非普通段落）
- ✅ 深色模式下所有文本可见（无黑底黑字）
- ✅ 富文本样式保留（加粗、斜体、下划线）

### P1 功能验收

- ✅ 邮件中的图片正常显示（非裂图）
- ✅ 图片可在 Slate 编辑器中编辑/删除

### P2 功能验收

- ✅ 无连续 3 个以上的空行
- ✅ 回写到 Outlook 后，在桌面版和网页版渲染一致

---

**下一步**: 是否开始实施阶段 1（P0 优化）？
