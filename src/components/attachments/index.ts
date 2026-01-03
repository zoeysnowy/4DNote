/**
 * 附件系统组件导出
 * 
 * 包含所有附件查看模式组件：
 * - AttachmentViewContainer: 主容器（集成所有模式）
 * - AttachmentViewModeSwitcher: 模式切换器
 * - GalleryView: 图片画廊
 * - VideoStreamView: 视频播放器
 * - AudioStreamView: 音频播放器
 * - TranscriptView: 转录查看器
 * - DocumentLibView: 文档库
 * - TreeNavigationView: 树形导航
 * - BookmarkView: 网页剪藏
 */

// 主容器
export { AttachmentViewContainer } from './AttachmentViewContainer';

// 模式切换器
export { AttachmentViewModeSwitcher } from './AttachmentViewModeSwitcher';

// 各种查看模式组件
export { GalleryView } from './GalleryView';
export { VideoStreamView } from './VideoStreamView';
export { AudioStreamView } from './AudioStreamView';
export { TranscriptView } from './TranscriptView';
export { DocumentLibView } from './DocumentLibView';
export { TreeNavigationView } from './TreeNavigationView';
export { BookmarkView } from './BookmarkView';

// 其他附件相关组件（如果存在）
export { AttachmentUploader } from './AttachmentUploader';
