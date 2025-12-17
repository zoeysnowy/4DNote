# 活动海报识别功能使用指南

## 功能概述

EventEditModalV2 现在支持上传活动海报图片，自动识别其中的二维码和活动信息。

## 功能特性

### 1. 图片上传
- 📸 支持上传多张图片
- 支持格式：JPG、PNG、WEBP等常见图片格式
- 位置：Event Log 编辑器上方的工具栏

### 2. 智能识别

#### 二维码识别
- ✅ 自动识别图片中的所有二维码
- ✅ 提取二维码内容和类型（URL、文本、电话等）
- ✅ 智能分析二维码用途：
  - 报名链接
  - 视频号
  - 公众号文章
  - 下载链接
  - 群聊邀请
- ✅ 生成建议操作（如"报名"、"观看视频"）

#### 活动信息提取（未来功能）
- OCR 文字识别
- LLM 智能提取：
  - 活动标题
  - 时间
  - 地点
  - 主办方
  - 描述
- 自动填充到事件表单

### 3. 二维码保存
- 💾 二维码图片保存为 base64 格式
- 存储在 EventLog.qrCodes 数组中
- 每个二维码包含：
  - 唯一 ID
  - 内容和类型
  - 提取的链接
  - 元数据（标题、描述、建议操作）
  - 图片数据（可下载）
  - 提取时间

### 4. 二维码展示
- 📱 卡片式列表展示
- 显示二维码缩略图
- 显示标题、描述、链接
- 操作按钮：
  - 💾 下载二维码图片
  - 🔗 打开链接
  - ❌ 删除

## 使用方法

### 上传海报识别

1. 打开事件编辑窗口（EventEditModalV2）
2. 切换到详细视图（📝 展开日志）
3. 在 Event Log 区域上方找到"📸 上传海报"按钮
4. 点击按钮选择图片，或拖拽图片到按钮上
5. 等待处理（显示"⏳ 处理中..."）
6. 查看识别结果：
   - 绿色提示显示识别到的二维码数量
   - 二维码列表显示在编辑器下方

### 从 HTML 提取

如果 EventLog 中已经有 HTML 内容（包含图片）：

1. 点击"🔍 提取HTML图片"按钮
2. 系统自动从 HTML 中提取所有图片
3. 对每张图片进行二维码识别
4. 显示提取结果

### 下载二维码

1. 在二维码列表中找到目标二维码
2. 点击"💾"按钮
3. 图片自动下载到本地

### 打开链接

1. 找到带链接的二维码
2. 点击"🔗"按钮
3. 在新标签页中打开链接

### 删除二维码

1. 点击二维码卡片右侧的"❌"按钮
2. 二维码从列表中移除

## 数据结构

### EventLog.qrCodes

```typescript
qrCodes?: QRCodeInfo[] = [
  {
    id: "qr_1734432000_0",
    content: "https://example.com/signup",
    type: "url",
    url: "https://example.com/signup",
    metadata: {
      title: "报名链接",
      description: "活动或课程报名",
      action: "报名"
    },
    imageData: "data:image/png;base64,...", // 可下载
    extractedAt: "2024-12-17T10:30:00.000Z"
  }
]
```

## 技术架构

### 工作流程

```
用户上传图片
    ↓
EventExtractionWorkflow.execute()
    ↓
OCRTool (文字识别) ─┬─→ QRCodeTool (二维码识别)
                    │
                    ↓
          LLM 提取事件信息
                    ↓
          分析报名需求
                    ↓
          生成建议任务
                    ↓
    返回：qrCodes + extractedEvent + suggestedTasks
```

### 核心组件

1. **htmlImageExtractor.ts** - HTML 图片提取工具
   - 从 HTML 字符串中提取 `<img>` 标签
   - 转换 URL/base64 为 Blob

2. **EventExtractionWorkflow.ts** - 事件提取工作流
   - 集成 OCRTool 和 QRCodeTool
   - LangGraph 状态管理
   - 条件路由

3. **QRCodeTool.ts** - 二维码识别工具
   - qrcode-reader + jimp 实现
   - 智能类型分析
   - 图片区域提取

4. **QRCodeDisplay.tsx** - 二维码展示组件
   - 卡片式布局
   - 操作按钮
   - 响应式设计

## 示例场景

### 场景 1：报名活动

1. 上传活动海报
2. 识别到报名二维码
3. 点击"报名"链接，打开报名页面
4. 下载二维码分享给朋友

### 场景 2：整理活动信息

1. 上传多张活动海报
2. 系统自动提取：
   - 活动标题 → Event.title
   - 时间 → Event.startTime/endTime
   - 地点 → Event.location
   - 二维码 → EventLog.qrCodes
3. 一键保存，无需手动输入

### 场景 3：从已有记录提取

1. 粘贴活动推文到 EventLog
2. 推文包含活动海报图片（HTML `<img>`）
3. 点击"提取HTML图片"
4. 自动识别二维码

## 注意事项

1. **图片质量**：清晰的图片识别率更高
2. **二维码大小**：二维码需占一定比例才能识别
3. **网络访问**：如果图片是URL，需要网络连接
4. **处理时间**：多张图片或大图需要较长时间
5. **OCR配置**：需要配置腾讯云OCR密钥（可选，有mock）

## 未来规划

- [ ] 集成真实的腾讯云 OCR
- [ ] UI 优化：进度条、拖拽上传
- [ ] 批量下载所有二维码
- [ ] 导出二维码为 PDF
- [ ] 支持更多二维码类型（vCard、WiFi等）
- [ ] 自动生成报名提醒任务
- [ ] 二维码扫描记录

## 常见问题

### Q: 为什么没有识别到二维码？

A: 可能原因：
- 图片质量不清晰
- 二维码太小或变形
- 图片格式不支持
- 尝试调整图片大小或重新拍照

### Q: 可以识别哪些类型的二维码？

A: 支持所有标准二维码，特别优化了：
- URL 链接
- 微信公众号/视频号
- 报名链接
- 下载链接

### Q: 二维码保存在哪里？

A: 保存在 EventLog.qrCodes 数组中，随事件一起保存到 localStorage

### Q: 可以导出二维码吗？

A: 可以，点击每个二维码的下载按钮即可

## 相关文档

- [AI_FRAMEWORK_PHASE2_REPORT.md](./AI_FRAMEWORK_PHASE2_REPORT.md) - Phase 2 完成报告
- [AI_TaskManager_PRD.md](./PRD/AI_TaskManager_PRD.md) - AI 任务管理器 PRD
- [EventLog 架构](./architecture/EVENTLOG_ARCHITECTURE.md)

## 技术支持

如有问题，请查看：
- 控制台日志（F12）
- [EventEditModalV2.tsx](../src/components/EventEditModal/EventEditModalV2.tsx) 源代码
- [QRCodeTool.ts](../src/ai/tools/qrcode/QRCodeTool.ts) 实现细节

---

**创建时间**: 2024-12-17  
**负责人**: Zoey Gong  
**状态**: ✅ 已实现
