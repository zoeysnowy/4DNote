/**
 * SlateCore - 统一导出
 * 
 * 共享的 Slate 编辑器核心功能层
 * 提供给 PlanSlateEditor 和 ModalSlate 使用
 * 
 * @version 1.0.0
 * @date 2025-11-29
 */

// ==================== 类型 ====================
export type {
  CustomEditor,
  TextNode,
  ParagraphNode,
  TagNode,
  DateMentionNode,
  TimestampDividerElement,
  SharedElement,
  CustomText,
  SlateEditorConfig,
} from './types';

// ==================== 服务 ====================
export { EventLogTimestampService } from './services/timestampService';

// ==================== 操作工具 ====================
// Inline 元素
export {
  insertTag,
  insertEmoji,
  insertDateMention,
  insertVoidElement,
} from './operations/inlineHelpers';

// 格式化
export {
  applyTextFormat,
  getActiveFormats,
  clearAllFormats,
  toggleFormat,
} from './operations/formatting';

// Bullet 操作
export {
  increaseBulletLevel,
  decreaseBulletLevel,
  toggleBullet,
  handleBulletBackspace,
  handleBulletEnter,
  detectBulletTrigger,
  applyBulletAutoConvert,
  getBulletChar,
  BULLET_TRIGGERS,
  BULLET_CHARS,
} from './operations/bulletOperations';

// 剪贴板操作
export {
  extractBulletItems,
  generatePlainText,
  generateHTML,
  generateClipboardData,
  parsePlainTextBullets,
  parseHTMLBullets,
  detectPlatform,
  adjustFormatForPlatform,
} from './operations/clipboardHelpers';
export type { BulletItem, ClipboardData } from './operations/clipboardHelpers';
export type { TextFormat } from './operations/formatting';

// 节点操作
export {
  findNodeByType,
  isNodeEmpty,
  getParentPath,
  getSiblingPath,
  isAncestorPath,
  isValidPath,
  getNodeIndex,
  isNodeType,
  getNodeText,
  findChildrenByType,
} from './operations/nodeOperations';

// 段落操作
export {
  moveParagraphUp,
  moveParagraphDown,
  insertSoftBreak,
  swapNodes,
  canMoveUp,
  canMoveDown,
} from './operations/paragraphOperations';
export type { ParagraphMoveOptions } from './operations/paragraphOperations';

// ==================== 序列化 ====================
export {
  jsonToSlateNodes,
  slateNodesToJson,
  createEmptyParagraph,
  createTextParagraph,
  createBulletParagraph,
} from './serialization/jsonSerializer';
