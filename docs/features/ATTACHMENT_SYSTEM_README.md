# 附件系统快速上手指南

> **版本**: v1.0.0  
> **更新日期**: 2025-12-02  
> **状态**: ✅ 集成完成，可用于生产

---

## 🚀 快速开始

### 1. 导入组件

```tsx
import { AttachmentViewContainer } from './components/AttachmentViewContainer';
import { AttachmentViewMode } from './types';
```

### 2. 基础使用

```tsx
function MyComponent({ event }) {
  return (
    <AttachmentViewContainer
      eventId={event.id}
      attachments={event.eventlog.attachments}
    />
  );
}
```

### 3. 完整示例

```tsx
<AttachmentViewContainer
  eventId="event-123"
  attachments={attachments}
  initialMode={AttachmentViewMode.GALLERY}
  onAttachmentClick={(att, idx) => console.log('点击:', att)}
  onAttachmentDelete={async (id) => {
    await attachmentService.deleteAttachment(id);
  }}
  onTranscriptUpdate={async (id, summary) => {
    await attachmentService.updateTranscript(id, summary);
  }}
  onNavigate={(eventId) => {
    window.location.href = `/event/${eventId}`;
  }}
/>
```

---

## 📚 组件列表

### 主容器

- **AttachmentViewContainer** - 集成所有查看模式的主容器

### 查看模式组件

| 组件 | 用途 | 支持类型 |
|-----|------|---------|
| `GalleryView` | 图片画廊 | 🖼️ IMAGE |
| `VideoStreamView` | 视频播放器 | 🎥 VIDEO |
| `AudioStreamView` | 音频播放器 | 🎵 AUDIO |
| `TranscriptView` | 转录查看器 | 🎤 VOICE_RECORDING |
| `DocumentLibView` | 文档库 | 📄 DOCUMENT |
| `TreeNavigationView` | 树形导航 | 🌳 SUB_EVENT |
| `BookmarkView` | 网页剪藏 | 🔖 WEB_CLIP |

---

## 🎯 查看模式

### 可用模式

```typescript
enum AttachmentViewMode {
  EDITOR = 'editor',           // ✏️ 编辑器（默认）
  GALLERY = 'gallery',         // 🖼️ 图册模式
  VIDEO_STREAM = 'video-stream', // 🎥 视频流
  AUDIO_STREAM = 'audio-stream', // 🎵 音频流
  TRANSCRIPT = 'transcript',   // 🎤 转录文本
  DOCUMENT_LIB = 'document-lib', // 📄 文档库
  TREE_NAV = 'tree-nav',       // 🌳 树形导航
  BOOKMARK = 'bookmark',       // 🔖 书签
}
```

### 自动模式选择

```typescript
const getInitialMode = (attachments: Attachment[]) => {
  const types = attachments.map(a => a.type);
  
  if (types.includes('image')) return AttachmentViewMode.GALLERY;
  if (types.includes('video')) return AttachmentViewMode.VIDEO_STREAM;
  if (types.includes('audio')) return AttachmentViewMode.AUDIO_STREAM;
  
  return AttachmentViewMode.EDITOR;
};
```

---

## 🔧 API 参考

### AttachmentViewContainer Props

| 属性 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| `eventId` | `string` | ✅ | 事件 ID |
| `attachments` | `Attachment[]` | ✅ | 附件列表 |
| `initialMode` | `AttachmentViewMode` | ❌ | 初始查看模式（默认: EDITOR） |
| `onAttachmentClick` | `(att, idx) => void` | ❌ | 点击附件回调 |
| `onAttachmentUpdate` | `(id, updates) => void` | ❌ | 更新附件回调 |
| `onAttachmentDelete` | `(id) => void` | ❌ | 删除附件回调 |
| `onTranscriptUpdate` | `(id, summary) => void` | ❌ | 转录更新回调 |
| `onNavigate` | `(eventId) => void` | ❌ | 导航到事件回调 |
| `className` | `string` | ❌ | 自定义类名 |

---

## 💡 使用场景

### 场景 1: 事件详情页

```tsx
import { AttachmentViewContainer } from '@/components/attachments';

export function EventDetailPage({ event }) {
  return (
    <div>
      <h1>{event.title}</h1>
      <AttachmentViewContainer
        eventId={event.id}
        attachments={event.eventlog.attachments}
      />
    </div>
  );
}
```

### 场景 2: 只读模式

```tsx
<AttachmentViewContainer
  eventId={event.id}
  attachments={event.eventlog.attachments}
  // 不传 onAttachmentDelete 即为只读模式
  onAttachmentClick={(att) => openPreview(att)}
/>
```

### 场景 3: 带上传功能

```tsx
function AttachmentManager({ eventId }) {
  const [attachments, setAttachments] = useState([]);

  const handleUpload = async (files) => {
    const results = await attachmentService.batchUpload(eventId, files);
    setAttachments([...attachments, ...results]);
  };

  return (
    <>
      <input type="file" multiple onChange={e => handleUpload(e.target.files)} />
      <AttachmentViewContainer eventId={eventId} attachments={attachments} />
    </>
  );
}
```

---

## 🎨 布局模式

每个查看组件都支持多种布局：

### GalleryView
- `grid` - 网格布局（默认）
- `masonry` - 瀑布流
- `timeline` - 时间轴

### VideoStreamView
- `grid` - 视频墙
- `list` - 列表模式
- `theater` - 剧场模式（主视频 + 播放列表）

### AudioStreamView
- `podcast` - 播客模式（推荐）
- `compact` - 紧凑列表
- `waveform` - 波形可视化

### DocumentLibView
- `grid` - 文档卡片
- `list` - 详细列表
- `preview` - 预览模式（左侧列表 + 右侧预览）

---

## 🔌 集成 Slate.js

```tsx
import { AttachmentViewContainer } from './components/AttachmentViewContainer';
import { SlateEditor } from './components/SlateEditor';

function EventEditor({ event }) {
  const [showAttachments, setShowAttachments] = useState(false);

  return (
    <div className="editor-container">
      <SlateEditor value={event.eventlog.description} />
      
      <button onClick={() => setShowAttachments(!showAttachments)}>
        📎 附件 ({event.eventlog.attachments.length})
      </button>

      {showAttachments && (
        <AttachmentViewContainer
          eventId={event.id}
          attachments={event.eventlog.attachments}
        />
      )}
    </div>
  );
}
```

---

## 🧪 测试

### 运行测试页面

```bash
# 浏览器打开
open test-attachment-system.html

# 或通过 HTTP 服务器
npx http-server . -p 8080
# 访问 http://localhost:8080/test-attachment-system.html
```

### 功能测试清单

- [ ] 模式切换（8 种模式）
- [ ] 附件点击事件
- [ ] 附件删除（确认框）
- [ ] 转录编辑（保存/取消）
- [ ] 视频播放控制
- [ ] 音频播放控制
- [ ] 搜索和筛选
- [ ] 响应式布局

---

## 📖 示例代码

完整示例请查看：
- `src/examples/attachment-integration-examples.tsx` - 6 个集成示例
- `test-attachment-system.html` - 交互式测试页面

---

## 🐛 已知问题

### 待完成功能

1. **编辑器模式** - 尚未集成 Slate.js
2. **PDF 预览** - 需要 PDF.js 库
3. **音频波形** - 需要 WaveSurfer.js
4. **图谱可视化** - 需要 D3.js

### 解决方案

```typescript
// 临时占位符已提供，等待库集成
// 参考文档: docs/ATTACHMENT_SYSTEM_INTEGRATION.md
```

---

## 🚀 下一步

### P1 任务（本周）

1. **Slate.js 媒体插件** (6-8h)
   - withImages
   - withVideos
   - withAudio
   - withDocuments

2. **上传/编辑 Modal** (6-8h)
   - 批量上传 UI
   - 元数据编辑表单
   - 进度显示

3. **AttachmentService 完善** (4-6h)
   - 缩略图生成
   - EXIF 提取
   - OCR 文本提取

---

## 📚 相关文档

- [集成完成报告](./docs/ATTACHMENT_SYSTEM_INTEGRATION.md)
- [开发计划](./docs/STORAGE_NEXT_STEPS.md)
- [存储架构](./docs/architecture/STORAGE_ARCHITECTURE.md)

---

## 💬 支持

如有问题，请查看：
1. 文档: `docs/ATTACHMENT_SYSTEM_INTEGRATION.md`
2. 示例: `src/examples/attachment-integration-examples.tsx`
3. 测试: `test-attachment-system.html`

---

## 📄 许可证

MIT License © 2025 4DNote Team
