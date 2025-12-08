# 标题序列化问题修复说明

## 问题描述

用户报告两个问题：
1. ❌ 点击 syncMode 下拉框时，出现"已保存"提示（不应该触发自动保存）
2. ❌ 标题无法保存，显示为乱码：`[{"type":"paragraph","children":[{"text":"..."}]}]`

## 根本原因

### 问题 1: 自动保存误触发
- **原因**: useEffect 在 Modal 打开时立即触发，此时 `initialSnapshotRef.current` 还未设置
- **影响**: 任何初始化操作（如点击下拉框）都会被误判为"数据变更"，触发自动保存

### 问题 2: 标题多重序列化
- **原因**: 数据流中多次进行 JSON.stringify()，导致嵌套包装
- **数据流**:
  ```
  用户输入 "测试标题"
  → formData.title = JSON.stringify([{type:'paragraph'...}])  // 第一次序列化
  → EventService.normalizeTitle 收到字符串，当作 simpleTitle
  → simpleTitle = '[{type:"paragraph"...}]'  // 当作纯文本
  → 保存到数据库
  → 下次读取时，再次包装
  → simpleTitle = '[{"type":"paragraph","children":[{"text":"[{\\"type...}]"}]}]'  // 双重嵌套
  ```
- **实际日志**: 用户数据显示 **三重嵌套**
  ```
  simpleTitle: '[{"type":"paragraph","children":[{"text":"[{\\"type...👿 测试标题能否保存\\"}]}]"}]}]'
  ```

## 修复方案

### 修复 1: 自动保存初始化检查 ✅

**文件**: `src/components/EventEditModal/EventEditModalV2.tsx` (line ~487)

**变更**:
```typescript
// ❌ 旧代码：没有检查初始化状态
useEffect(() => {
  const timer = setTimeout(() => {
    handleAutoSave();
  }, 5000);
  return () => clearTimeout(timer);
}, [formData]);

// ✅ 新代码：添加初始化检查
useEffect(() => {
  // 🔧 防止初始化时触发自动保存
  if (!initialSnapshotRef.current) {
    return;
  }
  
  const timer = setTimeout(() => {
    handleAutoSave();
  }, 5000);
  return () => clearTimeout(timer);
}, [formData]);
```

### 修复 2: EventService.normalizeTitle 智能检测 ✅

**文件**: `src/services/EventService.ts` (lines 1883-1905, 1943-1969)

**变更 A: Scenario 0 - 字符串输入检测**
```typescript
// ❌ 旧代码：直接把字符串当作 simpleTitle
if (typeof titleInput === 'string') {
  return {
    simpleTitle: titleInput,  // ⚠️ 可能是 Slate JSON 字符串！
    colorTitle: titleInput,
    fullTitle: this.simpleTitleToFullTitle(titleInput)
  };
}

// ✅ 新代码：检测是否为 Slate JSON
if (typeof titleInput === 'string') {
  try {
    const parsed = JSON.parse(titleInput);
    // 如果是数组（Slate Document），说明是 fullTitle
    if (Array.isArray(parsed)) {
      const { colorTitle: ct, formatMap } = this.fullTitleToColorTitle(titleInput);
      return {
        fullTitle: titleInput,  // 作为 fullTitle 处理
        colorTitle: ct,
        simpleTitle: this.colorTitleToSimpleTitle(ct),  // 提取纯文本
        formatMap
      };
    }
  } catch {
    // 解析失败，说明是纯文本
  }
  
  // 纯文本处理
  return {
    simpleTitle: titleInput,
    colorTitle: titleInput,
    fullTitle: this.simpleTitleToFullTitle(titleInput)
  };
}
```

**变更 B: Scenario 3 - simpleTitle 检测**
```typescript
// ❌ 旧代码：直接把 simpleTitle 当作纯文本
else if (simpleTitle && colorTitle === undefined && fullTitle === undefined) {
  result.simpleTitle = simpleTitle;
  result.colorTitle = simpleTitle;  // ⚠️ 可能是 Slate JSON 字符串！
  result.fullTitle = this.simpleTitleToFullTitle(simpleTitle);
}

// ✅ 新代码：检测 simpleTitle 是否为 Slate JSON
else if (simpleTitle && colorTitle === undefined && fullTitle === undefined) {
  try {
    const parsed = JSON.parse(simpleTitle);
    if (Array.isArray(parsed)) {
      // simpleTitle 是 Slate JSON，进行修复
      console.warn('⚠️ [normalizeTitle] simpleTitle 包含 Slate JSON，进行修复');
      const { colorTitle: ct, formatMap } = this.fullTitleToColorTitle(simpleTitle);
      result.fullTitle = simpleTitle;  // 作为 fullTitle
      result.colorTitle = ct;
      result.simpleTitle = this.colorTitleToSimpleTitle(ct);  // 提取纯文本
      result.formatMap = formatMap;
    } else {
      // 不是数组，当作纯文本处理
      result.simpleTitle = simpleTitle;
      result.colorTitle = simpleTitle;
      result.fullTitle = this.simpleTitleToFullTitle(simpleTitle);
    }
  } catch {
    // 解析失败，说明是纯文本
    result.simpleTitle = simpleTitle;
    result.colorTitle = simpleTitle;
    result.fullTitle = this.simpleTitleToFullTitle(simpleTitle);
  }
}
```

### 修复 3: EventEditModalV2 title 处理优化 ✅

**文件**: `src/components/EventEditModal/EventEditModalV2.tsx` (lines 1064-1084)

**变更**:
```typescript
// ❌ 旧代码：没有明确说明 finalTitle 的格式
let finalTitle = formData.title;

// ✅ 新代码：明确 finalTitle 是 Slate JSON 字符串（fullTitle）
let finalTitle: string | EventTitle;

if (!formData.title || !formData.title.trim()) {
  // 使用标签名称作为标题
  if (formData.tags && formData.tags.length > 0) {
    const firstTag = TagService.getTagById(formData.tags[0]);
    if (firstTag) {
      const tagTitleText = `${firstTag.emoji || ''}${firstTag.name}事项`.trim();
      // 将纯文本转换为 Slate JSON
      finalTitle = JSON.stringify([{ type: 'paragraph', children: [{ text: tagTitleText }] }]);
    }
  }
} else {
  // ✅ formData.title 已经是 Slate JSON 字符串（fullTitle）
  // 直接传递给 EventService，让 normalizeTitle 自动生成完整的 EventTitle 对象
  finalTitle = formData.title;
}

console.log('📝 [EventEditModalV2] finalTitle (Slate JSON):', finalTitle);
```

## 数据迁移脚本

**文件**: `scripts/fix-title-serialization.js`

**功能**:
- 检测所有事件的 `title.simpleTitle` 是否包含 Slate JSON
- 递归解析多重嵌套的 JSON 字符串
- 提取纯文本，重新生成完整的 EventTitle 对象
- 自动备份原始数据

**使用方法**:
```bash
node scripts/fix-title-serialization.js
```

## 测试验证

### 测试场景 1: 新建事件
1. 打开 EventEditModal
2. 输入标题："👿 测试标题能否保存"
3. 保存
4. 重新打开该事件
5. ✅ 预期结果: 标题显示为"👿 测试标题能否保存"，而不是 JSON 字符串

### 测试场景 2: 编辑现有事件
1. 打开已有事件（带有损坏标题的事件）
2. 编辑标题
3. 保存
4. 重新打开
5. ✅ 预期结果: 标题正确显示，不再有多重嵌套

### 测试场景 3: 自动保存不误触发
1. 打开 EventEditModal
2. 点击 syncMode 下拉框
3. ✅ 预期结果: 不显示"已保存"提示

### 测试场景 4: TimeCalendar 显示
1. 在 TimeCalendar 页面查看事件
2. ✅ 预期结果: 标题显示为纯文本，不是 JSON 字符串

## 技术细节

### EventTitle 三层架构 (v2.14)

```typescript
interface EventTitle {
  /** Slate JSON - 完整富文本，包含所有格式和元素 */
  fullTitle?: string;
  
  /** Slate JSON 或 HTML - 简化版，无 tag 元素，保留格式 */
  colorTitle?: string;
  
  /** 纯文本 - 用于搜索、同步、简单显示 */
  simpleTitle?: string;
  
  /** 富文本格式映射 - 用于从纯文本恢复格式 */
  formatMap?: TextFormatSegment[];
}
```

### 数据流（修复后）

```
用户输入 "👿 测试标题"
  ↓
formData.title = JSON.stringify([{type:'paragraph', children:[{text:"👿 测试标题"}]}])
  ↓ (保存时)
finalTitle = formData.title (Slate JSON 字符串)
  ↓
EventService.normalizeTitle(finalTitle)
  ↓ (Scenario 0: 检测到字符串是 Slate JSON)
{
  fullTitle: finalTitle,
  colorTitle: "👿 测试标题" (HTML/简化 JSON),
  simpleTitle: "👿 测试标题" (纯文本)
}
  ↓ (存储到数据库)
event.title = {
  fullTitle: '[{"type":"paragraph","children":[{"text":"👿 测试标题"}]}]',
  colorTitle: '[{"type":"paragraph","children":[{"text":"👿 测试标题"}]}]',
  simpleTitle: "👿 测试标题"
}
  ↓ (下次读取)
formData 初始化检测到 fullTitle 是 Slate JSON，直接使用
  ↓
显示: "👿 测试标题" ✅
```

## 相关文件

- `src/components/EventEditModal/EventEditModalV2.tsx`
- `src/services/EventService.ts`
- `src/utils/calendarUtils.ts`
- `scripts/fix-title-serialization.js`

## 版本信息

- 修复版本: 2025-01-XX
- 涉及 PR: #XXX
- 相关 Issue: #XXX
