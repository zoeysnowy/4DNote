/**
 * PlanSlate - 统一的单实例 Slate 编辑器
 * 
 * 核心特性：
 * 1. 单个 Slate 实例，支持跨行文字选择
 * 2. 智能键盘事件处理（Enter、Tab、Shift+Enter 等）
 * 3. 富文本复制粘贴，保留缩进和格式
 * 4. 与 PlanManager 完全兼容
 * 
 * 🔍 调试模式：在浏览器控制台运行以下命令开启详细日志
 * ```javascript
 * window.SLATE_DEBUG = true
 * localStorage.setItem('SLATE_VERBOSE_LOG', 'true') // 开启详细日志
 * localStorage.removeItem('SLATE_VERBOSE_LOG') // 关闭详细日志
 * ```
 * 然后刷新页面或在编辑器中输入内容，查看详细的调试日志
 */

// 🔧 日志控制开关 - 可在控制台动态调整
const ENABLE_VERBOSE_LOG = typeof window !== 'undefined' && localStorage.getItem('SLATE_VERBOSE_LOG') === 'true';
const vlog = ENABLE_VERBOSE_LOG ? console.log.bind(console) : () => {};

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { createEditor, Descendant, Editor, Transforms, Range, Point, Node, Element as SlateElement, Text as SlateText, Path } from 'slate';
import { Slate, Editable, withReact, RenderElementProps, RenderLeafProps, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import { EventLineNode, ParagraphNode, TagNode, DateMentionNode, TextNode, CustomEditor } from '@frontend/components/PlanSlate/types';
import { EventLineElement } from '@frontend/components/PlanSlate/EventLineElement';

// ✅ 从 SlateCore 导入共享元素组件
import { TagElementComponent } from '@frontend/components/SlateCore/elements/TagElement';
import DateMentionElement from '@frontend/components/SlateCore/elements/DateMentionElement';
import { EventMentionElement } from '@frontend/components/SlateCore/elements/EventMentionElement';
// TimestampDividerElement 已废弃 - 使用 Block-Level Timestamp (paragraph.createdAt)

// ✅ 从 SlateCore 导入共享服务
import { EventLogTimestampService } from '@frontend/components/SlateCore/services/timestampService';
import { EventHistoryService } from '@backend/EventHistoryService'; // 🆕 v2.20.0: 检查事件历史
import { hasTaskFacet } from '@frontend/utils/eventFacets';

// ✅ 从 SlateCore 导入共享操作工具（备用，后续可能使用）
import {
  moveParagraphUp as slateMoveParagraphUp,
  moveParagraphDown as slateMoveParagraphDown,
} from '@frontend/components/SlateCore/operations/paragraphOperations';

import {
  handleBulletBackspace,
  handleBulletEnter,
  detectBulletTrigger,
  applyBulletAutoConvert,
  getBulletChar,
} from '@frontend/components/SlateCore/operations/bulletOperations';

import {
  extractBulletItems,
  generateClipboardData,
  parsePlainTextBullets,
  parseHTMLBullets,
} from '@frontend/components/SlateCore/operations/clipboardHelpers';

import UnifiedDateTimePicker from '@frontend/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker';

// 🆕 v2.20.0: EventTree Engine for Tab/Shift+Tab optimization
import { EventTreeAPI } from '@backend/eventTree';
import { UnifiedMentionMenu } from '@frontend/components/shared/UnifiedMentionMenu';
import { SlateErrorBoundary } from '@frontend/components/PlanSlate/ErrorBoundary';
import { EventService } from '@backend/EventService';
import { EventHub } from '@backend/EventHub';
// 🆕 v2.17: EventIdPool 已删除，直接使用 UUID 生成
import { generateEventId } from '@frontend/utils/idGenerator';
import { parseNaturalLanguage } from '@frontend/utils/naturalLanguageTimeDictionary';
import {
  planItemsToSlateNodes,
  slateNodesToPlanItems,
  createEmptyEventLine,
  slateNodesToRichHtml,
  parseExternalHtml,
  setEventLineLevel,  // 🔥 v2.20.0: 统一层级更新函数
} from './serialization';
import { insertDateMention, insertEventMention, insertTag } from '@frontend/components/PlanSlate/helpers';
// 🆕 v2.21.0: 会话态管理 Hook
import { usePlanSlateSession } from '@frontend/components/PlanSlate/hooks/usePlanSlateSession';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';
import {
  initDebug,
  isDebugEnabled,
  logKeyDown,
  logSelection,
  logDOMChange,
  logValueChange,
  logOperation,
  logError,
  logFocus,
  logEditorSnapshot,
  startPerformanceMark,
  endPerformanceMark,
} from './debugLogger';
import './PlanSlate.css';

// 🔍 初始化调试系统
initDebug();

/**
 * 安全地设置编辑器焦点和选区
 * 
 * 防止在空节点上调用 Editor.start() 导致的错误：
 * "Cannot get the start point in the node at path [] because it has no start text node."
 */
const safeFocusEditor = (editor: Editor, path?: number[]) => {
  try {
    // 先聚焦编辑器
    ReactEditor.focus(editor);
    
    // 如果没有指定路径，或编辑器为空，直接返回
    if (!path || editor.children.length === 0) {
      return;
    }
    
    // 检查节点是否存在
    const [nodeIndex] = path;
    if (nodeIndex >= editor.children.length) {
      console.warn('[safeFocusEditor] Invalid path:', path);
      return;
    }
    
    const node = editor.children[nodeIndex];
    
    // 检查节点是否有文本内容
    const hasText = (n: any): boolean => {
      if (!n) return false;
      if (typeof n === 'string') return n.length > 0;
      if ('text' in n) return typeof n.text === 'string';
      if ('children' in n && Array.isArray(n.children)) {
        return n.children.some((child: any) => hasText(child));
      }
      return false;
    };
    
    if (!hasText(node)) {
      console.warn('[safeFocusEditor] Node at path has no text:', path);
      return;
    }
    
    // 设置选区
    const start = Editor.start(editor, path);
    Transforms.select(editor, {
      anchor: start,
      focus: start,
    });
  } catch (err) {
    console.error('[safeFocusEditor] Failed to focus editor:', err);
  }
};

const getCurrentEventIdFromSelection = (editor: Editor): string | null => {
  try {
    if (!editor.selection) return null;
    const match = Editor.above(editor, {
      match: n => (n as any).type === 'event-line',
    });
    if (!match) return null;
    const [eventLineNode] = match;
    const eventId = (eventLineNode as any)?.eventId;
    return typeof eventId === 'string' && eventId.length > 0 ? eventId : null;
  } catch {
    return null;
  }
};

export interface PlanSlateProps {
  items: any[];  // PlanItem[]
  onChange: (items: any[]) => void;
  onFocus?: (lineId: string) => void;
  onEditorReady?: (editor: any) => void;  // 🆕 改为接收 editor 实例（含 syncFromExternal 方法）
  onDeleteRequest?: (lineId: string) => void;  // 🆕 删除请求回调（通知外部删除）
  onSave?: (eventId: string, updates: any) => void;  // 🆕 保存事件回调
  onTimeClick?: (eventId: string, anchor: HTMLElement) => void;  // 🆕 时间点击回调
  onMoreClick?: (eventId: string) => void;  // 🆕 More 图标点击回调
  getEventStatus?: (eventId: string, metadata?: any) => Promise<'new' | 'updated' | 'done' | 'missed' | 'deleted' | undefined>; // 🆕 获取事件状态 - ✅ 改为异步版本（已废弃，使用 eventStatusMap）
  eventStatusMap?: Map<string, 'new' | 'updated' | 'done' | 'missed' | 'deleted' | undefined>; // 🆕 事件状态映射表（同步访问）
  eventId?: string;  // 🆕 当前编辑的事件ID（用于 timestamp 功能）
  enableTimestamp?: boolean;  // 🆕 是否启用 timestamp 自动插入
  className?: string;
}

// 🆕 暴露给外部的编辑器接口
export interface PlanSlateHandle {
  syncFromExternal: (items: any[]) => void;  // 从外部同步内容
  getEditor: () => Editor;  // 获取 Slate Editor 实例
  insertTag: (tagId: string, tagName: string, color: string, emoji: string) => boolean; // 🆕 插入标签命令
  insertEmoji: (emoji: string) => boolean; // 🆕 插入Emoji命令
  insertDateMention: (startTime: string, endTime?: string, displayText?: string) => boolean; // 🆕 插入DateMention命令
  flushPendingChanges: () => void; // 🆕 立即保存待处理的变更
}

// 自定义编辑器配置
const withCustom = (editor: CustomEditor) => {
  const { isInline, isVoid, normalizeNode, insertBreak, deleteBackward, deleteForward } = editor;

  editor.isInline = element => {
    const e = element as any;
    return (e.type === 'tag' || e.type === 'dateMention' || e.type === 'event-mention') ? true : isInline(element);
  };

  editor.isVoid = element => {
    const e = element as any;
    return (e.type === 'tag' || e.type === 'dateMention' || e.type === 'event-mention') ? true : isVoid(element);
  };

  // 🆕 v2.20.0: 自定义 deleteBackward 处理跨行选区删除
  editor.deleteBackward = (...args) => {
    const { selection } = editor;
    
    // 如果有选中内容（非折叠选区），允许跨 event-line 删除
    if (selection && !Range.isCollapsed(selection)) {
      console.log('[deleteBackward] 跨行删除选中内容', {
        anchor: selection.anchor,
        focus: selection.focus,
        isExpanded: !Range.isCollapsed(selection)
      });
      
      try {
        // 使用 Slate 的 Transforms.delete 删除选中内容
        Transforms.delete(editor, { at: selection });
        console.log('[deleteBackward] ✅ 跨行删除成功');
        return; // 阻止默认行为
      } catch (e) {
        console.error('[deleteBackward] ❌ 跨行删除失败:', e);
        // 失败时执行默认行为
      }
    }
    
    // 折叠选区或删除失败时，执行默认行为
    deleteBackward(...args);
  };

  // 🆕 v2.20.0: 自定义 deleteForward 处理跨行选区删除
  editor.deleteForward = (...args) => {
    const { selection } = editor;
    
    // 如果有选中内容（非折叠选区），允许跨 event-line 删除
    if (selection && !Range.isCollapsed(selection)) {
      console.log('[deleteForward] 跨行删除选中内容', {
        anchor: selection.anchor,
        focus: selection.focus,
        isExpanded: !Range.isCollapsed(selection)
      });
      
      try {
        // 使用 Slate 的 Transforms.delete 删除选中内容
        Transforms.delete(editor, { at: selection });
        console.log('[deleteForward] ✅ 跨行删除成功');
        return; // 阻止默认行为
      } catch (e) {
        console.error('[deleteForward] ❌ 跨行删除失败:', e);
        // 失败时执行默认行为
      }
    }
    
    // 折叠选区或删除失败时，执行默认行为
    deleteForward(...args);
  };

  // 🆕 拦截 insertBreak（Enter 键）以继承 bullet 属性
  editor.insertBreak = () => {
    const { selection } = editor;
    
    if (selection) {
      // 查找当前段落节点
      const [paragraphNode] = Editor.nodes(editor, {
        match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
      });
      
      if (paragraphNode) {
        const [node] = paragraphNode;
        const para = node as any;
        
        // 如果当前段落有 bullet 属性，在分割后继承
        if (para.bullet) {
          const bulletLevel = para.bulletLevel || 0;
          
          // 执行默认的分割操作
          insertBreak();
          
          // 为新段落设置 bullet 属性
          const [newParagraphNode] = Editor.nodes(editor, {
            match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
          });
          
          if (newParagraphNode) {
            Transforms.setNodes(editor, { 
              bullet: true, 
              bulletLevel: bulletLevel 
            } as any);
          }
          
          return;
        }
      }
    }
    
    // 默认行为
    insertBreak();
  };

  // 🔥 normalizeNode 确保 void inline 元素后面总有空格
  editor.normalizeNode = entry => {
    const [node, path] = entry;

    // 检查 tag 或 dateMention 元素
    if (SlateElement.isElement(node) && (node.type === 'tag' || node.type === 'dateMention')) {
      const tagInfo = node.type === 'tag' ? (node as any).tagName : 'dateMention';
      console.log('%c[normalizeNode] 检查 void 元素', 'background: #673AB7; color: white;', {
        type: (node as any).type,
        tagName: tagInfo,
        path: JSON.stringify(path),
      });
      
      // 获取父节点和当前节点在父节点中的索引
      const parentPath = Path.parent(path);
      const parent = Node.get(editor, parentPath);
      const nodeIndex = path[path.length - 1];
      
      if (!SlateElement.isElement(parent)) {
        console.log('%c[normalizeNode] 父节点不是元素', 'background: #FFC107; color: black;');
        normalizeNode(entry);
        return;
      }
      
      // 检查下一个兄弟节点
      const nextSiblingIndex = nodeIndex + 1;
      const nextSibling = nextSiblingIndex < parent.children.length 
        ? parent.children[nextSiblingIndex] 
        : null;
      
      console.log('%c[normalizeNode] 下一个兄弟节点信息', 'background: #2196F3; color: white;', {
        nodeIndex,
        nextSiblingIndex,
        hasNextSibling: !!nextSibling,
        isText: nextSibling ? SlateText.isText(nextSibling) : false,
        text: nextSibling && SlateText.isText(nextSibling) ? nextSibling.text : 'N/A',
        startsWithSpace: nextSibling && SlateText.isText(nextSibling) ? nextSibling.text.startsWith(' ') : false,
      });

      // 如果后面没有节点，或者下一个节点不是文本节点，或者不以空格开头
      const needsSpace = !nextSibling || 
                        !SlateText.isText(nextSibling) || 
                        !nextSibling.text.startsWith(' ');
      
      if (needsSpace) {
        console.log('%c[normalizeNode] ⚠️ 检测到 void 元素后缺少空格，准备修复', 'background: #FF5722; color: white;', {
          type: (node as any).type,
          path: JSON.stringify(path),
          reason: !nextSibling ? 'no-next-sibling' : 
                  !SlateText.isText(nextSibling) ? 'not-text' : 
                  'no-space',
        });

        // 💾 保存当前光标位置
        const currentSelection = editor.selection;
        
        //  在 void 元素之后插入空格文本节点
        Editor.withoutNormalizing(editor, () => {
          const insertPath = [...parentPath, nextSiblingIndex];
          
          console.log('%c[normalizeNode] 插入空格文本节点', 'background: #4CAF50; color: white;', {
            insertPath: JSON.stringify(insertPath),
            hasSelection: !!currentSelection,
            currentSelectionPath: currentSelection?.anchor.path,
            currentSelectionOffset: currentSelection?.anchor.offset,
          });
          
          // 如果下一个节点是文本但不以空格开头，在文本开头插入空格
          if (nextSibling && SlateText.isText(nextSibling)) {
            Transforms.insertText(editor, ' ', { 
              at: { path: insertPath, offset: 0 } 
            });
            
            // 🔧 只在光标原本在文本节点开头时才调整偏移
            // ⚠️ 不要在其他情况下移动光标！
            if (currentSelection && 
                Range.isCollapsed(currentSelection) &&
                currentSelection.anchor.path.join(',') === insertPath.join(',') &&
                currentSelection.anchor.offset === 0) {
              Transforms.select(editor, {
                anchor: { path: insertPath, offset: 1 },
                focus: { path: insertPath, offset: 1 },
              });
              console.log('%c[normalizeNode] 光标原本在文本开头，已调整 offset +1', 'background: #4CAF50; color: white;');
            } else {
              console.log('%c[normalizeNode] 光标不在插入位置，保持不变', 'background: #2196F3; color: white;');
            }
          } else {
            // 否则插入新的空格文本节点
            Transforms.insertNodes(
              editor,
              { text: ' ' },
              { at: insertPath }
            );
            
            // 🔧 不移动光标！让 Slate 自动处理
            // insertTag 已经通过 Transforms.insertText(' ') 将光标定位到正确位置
            console.log('%c[normalizeNode] 插入新空格节点，光标位置由 Slate 自动处理', 'background: #2196F3; color: white;');
          }
        });
        
        console.log('%c[normalizeNode] ✅ 空格已插入', 'background: #4CAF50; color: white;');
        
        // 由于修改了树，立即返回让 Slate 重新 normalize
        return;
      }
      
      console.log('%c[normalizeNode] ✅ void 元素后已有空格，无需修复', 'background: #4CAF50; color: white;');
    }

    // 🆕 v1.8.4: Bullet 层级规范化 - 确保层级连续
    // 注意：这个检查在删除操作后也会自动触发
    if (SlateElement.isElement(node) && node.type === 'event-line') {
      const eventLine = node as EventLineNode;
      
      // 只处理 eventlog 模式的 bullet 行
      if (eventLine.mode === 'eventlog') {
        const paragraphs = eventLine.children || [];
        const paragraph = paragraphs[0] as any;
        
        if (paragraph?.bullet) {
          const currentLevel = eventLine.level || 0;
          
          // 查找前面最近的 bullet 行
          const allLines = Array.from(Editor.nodes(editor, {
            at: [],
            match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'event-line',
          }));
          
          const currentIndex = allLines.findIndex(([, p]) => Path.equals(p, path));
          let previousLevel = -1;
          
          for (let i = currentIndex - 1; i >= 0; i--) {
            const [prevNode] = allLines[i];
            const prevLine = prevNode as EventLineNode;
            if (prevLine.mode === 'eventlog') {
              const prevParas = prevLine.children || [];
              const prevPara = prevParas[0] as any;
              if (prevPara?.bullet) {
                previousLevel = prevLine.level || 0;
                break;
              }
            }
          }
          
          // 规则 1: 第一个 bullet 行必须是 level 0
          if (previousLevel === -1 && currentLevel > 0) {
            console.log('%c[normalizeNode] 🔧 第一个 bullet 行降级为 level 0', 'background: #FF9800; color: white;', {
              currentLevel,
            });
            
            setEventLineLevel(editor, path, 0);  // 🔥 使用统一函数
            Transforms.setNodes(editor, { bulletLevel: 0 } as any, { at: [...path, 0] });
            return; // 修复一个问题后返回
          }
          
          // 规则 2: 当前层级不能比前一个层级高出 1 以上
          if (previousLevel >= 0 && currentLevel > previousLevel + 1) {
            const normalizedLevel = previousLevel + 1;
            
            console.log('%c[normalizeNode] 🔧 修正 bullet 层级跳跃', 'background: #FF9800; color: white;', {
              currentLevel,
              previousLevel,
              normalizedLevel,
            });
            
            setEventLineLevel(editor, path, normalizedLevel);  // 🔥 使用统一函数
            Transforms.setNodes(editor, { bulletLevel: normalizedLevel } as any, { at: [...path, 0] });
            return; // 修复一个问题后返回
          }
        }
      }
    }

    // 对于其他节点，执行默认的 normalize
    normalizeNode(entry);
  };

  return editor;
};

/**
 * 🆕 v1.8.4: 删除行后自动调整后续 bullet 行的层级
 * 规则：按 eventId 分组，每个 event 内部独立检查
 * 1. 每个 event 的第一个 bullet 行必须是 level 0
 * 2. 当前层级不能比前一个层级高出 1 以上
 */
function adjustBulletLevelsAfterDelete(editor: CustomEditor) {
  // 🔥 严谨修复：Transforms 是同步的，删除后 editor.children 已是最新状态，无需 setTimeout
  console.log('%c[删除后调整] 开始检查 bullet 层级', 'background: #9C27B0; color: white;');
  
  const allLines = Array.from(Editor.nodes(editor, {
      at: [],
      match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'event-line',
    }));
    
    // 按 eventId 分组收集 bullet 行
    const eventGroups = new Map<string, Array<{
      lineNode: EventLineNode;
      linePath: number[];
      currentLevel: number;
      currentBulletLevel: number;
    }>>();
    
    for (const [lineNode, linePath] of allLines) {
      const line = lineNode as EventLineNode;
      
      // 只处理 eventlog 模式的 bullet 行
      if (line.mode !== 'eventlog') continue;
      
      const paragraphs = line.children || [];
      const paragraph = paragraphs[0] as any;
      if (!paragraph?.bullet) continue;
      
      const eventId = line.eventId;
      if (!eventGroups.has(eventId)) {
        eventGroups.set(eventId, []);
      }
      
      eventGroups.get(eventId)!.push({
        lineNode: line,
        linePath: linePath as number[],
        currentLevel: line.level || 0,
        currentBulletLevel: paragraph.bulletLevel || 0,
      });
    }
    
    console.log('%c[删除后调整] 按 event 分组', 'background: #2196F3; color: white;', {
      eventCount: eventGroups.size,
      groups: Array.from(eventGroups.entries()).map(([eventId, lines]) => ({
        eventId: eventId.slice(-10),
        bulletCount: lines.length,
        levels: lines.map(l => l.currentLevel),
      })),
    });
    
    let totalAdjustments = 0;
    
    // 对每个 event 的 bullet 行独立检查
    for (const [eventId, bulletLines] of eventGroups) {
      if (bulletLines.length === 0) continue;
      
      let needsAdjustment = false;
      
      for (let i = 0; i < bulletLines.length; i++) {
        const current = bulletLines[i];
        const previous = i > 0 ? bulletLines[i - 1] : null;
        
        let newLevel: number | null = null;
        
        // 规则 1: 每个 event 的第一个 bullet 行必须是 level 0
        if (i === 0 && current.currentLevel > 0) {
          newLevel = 0;
          console.log('%c[删除后调整] Event 第一行降级为 level 0', 'background: #FF9800; color: white;', {
            eventId: eventId.slice(-10),
            bulletIndex: i,
            oldLevel: current.currentLevel,
          });
        }
        // 规则 2: 当前层级不能比前一个层级高出 1 以上
        else if (previous && current.currentLevel > previous.currentLevel + 1) {
          newLevel = previous.currentLevel + 1;
          console.log('%c[删除后调整] 修正层级跳跃', 'background: #FF9800; color: white;', {
            eventId: eventId.slice(-10),
            bulletIndex: i,
            oldLevel: current.currentLevel,
            previousLevel: previous.currentLevel,
            newLevel,
          });
        }
        
        // 执行调整
        if (newLevel !== null) {
          needsAdjustment = true;
          totalAdjustments++;
          
          // 同时更新 EventLine.level 和 paragraph.bulletLevel
          setEventLineLevel(editor, current.linePath, newLevel);  // 🔥 使用统一函数
          Transforms.setNodes(editor, { bulletLevel: newLevel } as any, { at: [...current.linePath, 0] });
          
          // 更新当前记录，供后续行参考
          current.currentLevel = newLevel;
        }
      }
    }
    
    if (totalAdjustments > 0) {
      console.log('%c[删除后调整] ✅ Bullet 层级已修正', 'background: #4CAF50; color: white;', {
        调整次数: totalAdjustments,
      });
    } else {
      console.log('%c[删除后调整] ℹ️ 无需调整', 'background: #607D8B; color: white;');
    }
}

export const PlanSlate: React.FC<PlanSlateProps> = ({
  items,
  onChange,
  onFocus,
  onEditorReady,
  onDeleteRequest,  // 🆕 删除请求回调
  onSave,  // 🆕 保存回调
  onTimeClick,  // 🆕 时间点击回调
  onMoreClick,  // 🆕 More 图标点击回调
  getEventStatus,  // 🆕 获取事件状态（已废弃）
  eventStatusMap,  // 🆕 事件状态映射表（新方案）
  eventId,  // 🆕 当前事件ID
  enableTimestamp = false,  // 🆕 是否启用 timestamp
  className = '',
}) => {
  // 🔍 版本标记 - 用于验证代码是否被加载
  // console.log('%c[PlanSlate v2.15] 组件加载 - 包含 itemsHash 详细日志', 'background: #4ECDC4; color: white; font-weight: bold; padding: 4px 8px;');
  
  // 🆕 Debug: 检查 timestamp 相关的 props
  // console.log('[PlanSlate] 初始化参数:', {
  //   eventId,
  //   enableTimestamp,
  //   hasItems: !!items,
  //   itemsLength: items?.length || 0,
  //   eventIdType: typeof eventId,
  //   enableTimestampType: typeof enableTimestamp
  // });
  
  // 🆕 Debug: 监听 eventId 和 enableTimestamp 的变化
  React.useEffect(() => {
    console.log('[PlanSlate] Props 变化:', { eventId, enableTimestamp });
  }, [eventId, enableTimestamp]);
  // 🔍 组件挂载日志
  React.useEffect(() => {
    if (isDebugEnabled()) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
      window.console.log(`%c[🚀 ${timestamp}] PlanSlate - 调试模式已开启`, 
        'background: #4CAF50; color: white; padding: 4px 8px; border-radius: 3px; font-weight: bold;');
      window.console.log(`%c关闭调试: localStorage.removeItem('SLATE_DEBUG') 然后刷新`, 
        'color: #9E9E9E; font-style: italic;');
    } else {
      window.console.log('%c💡 开启调试: 在控制台运行 window.SLATE_DEBUG = true 然后刷新（会自动保存）', 
        'color: #9E9E9E; font-style: italic;');
      window.console.log('%c💡 开启 useEventTime 调试: window.USE_EVENT_TIME_DEBUG = true', 
        'color: #9E9E9E; font-style: italic;');
    }
    
    return () => {
      if (isDebugEnabled()) {
        window.console.log(`%c[👋 ${new Date().toISOString().split('T')[1].slice(0, 12)}] PlanSlate unmounted`, 
          'background: #f44336; color: white; padding: 4px 8px; border-radius: 3px;');
      }
    };
  }, [items.length]);
  
  // 创建编辑器实例
  const editor = useMemo(() => withCustom(withHistory(withReact(createEditor() as CustomEditor))), []);
  
  // 🆕 v2.3: 暴露编辑器实例到全局（供 DateMentionElement 使用）
  useEffect(() => {
    (window as any).__slateEditor = editor;
    return () => {
      delete (window as any).__slateEditor;
    };
  }, [editor]);
  
  // 🆕 v2.20.1: bulletLevel 完全派生（单一真相源）
  // bulletLevel 不再存储，完全由 EventTreeAPI 从树结构计算
  // 优势：永远一致，无需手动同步，Tab/Shift+Tab 更简单
  const bulletLevels = useMemo(() => {
    console.log('[PlanSlate] 🔄 Recalculating bullet levels for', items.length, 'events');
    const startTime = performance.now();
    const levels = EventTreeAPI.calculateAllBulletLevels(items);
    const endTime = performance.now();
    console.log(`[PlanSlate] ✅ Bullet levels calculated in ${(endTime - startTime).toFixed(2)}ms`);
    return levels;
  }, [items]); // 只依赖真相源：items（树结构变化时自动重算）
  
  // Helper: 获取事件的 bulletLevel
  const getBulletLevel = useCallback((eventId: string): number => {
    return bulletLevels.get(eventId) ?? 0;
  }, [bulletLevels]);
  
  // 🆕 增强的 value：始终在末尾添加一个 placeholder 提示行
  // 🛡️ PERFORMANCE FIX: 添加深度比较避免不必要的重计算
  const prevItemsHashRef = useRef<string>('');
  
  const itemsHash = useMemo(() => {
    const hash = items.map((item, index) => {
      // 🔧 修复：正确处理 EventTitle 对象
      const titleStr = typeof item.title === 'string' 
        ? item.title 
        : (item.title?.simpleTitle || item.title?.colorTitle || '');
      
      // 🔧 包含更多字段，确保 eventlog、tags、时间 变化也能触发更新
      const tagsStr = (item.tags || []).join(',');
      
      // 🔧 修复：稳定的 EventLog 序列化策略
      const eventlog = (item as any).eventlog;
      const eventlogType = typeof eventlog;
      const isObject = eventlogType === 'object' && eventlog !== null;
      
      // 策略：使用 slateJson 长度作为 hash key（更稳定）
      const eventlogStr = isObject 
        ? `obj:${(eventlog.slateJson || '[]').length}:${(eventlog.plainText || '').substring(0, 20)}`
        : `str:${(eventlog || '').length}:${(eventlog || '').substring(0, 20)}`;
      
      if (index < 5) {  // 只记录前5个事件
        // console.log(`[itemsHash] Event[${index}] ${titleStr}:`, {
        //   eventlogType,
        //   isObject,
        //   slateJsonLength: isObject ? eventlog.slateJson?.length : 0,
        //   plainTextLength: isObject ? eventlog.plainText?.length : 0,
        //   eventlogStr
        // });
      }
      
      // 🔧 包含时间字段：startTime、endTime、dueDateTime、isAllDay
      const timeStr = `${item.startTime || ''}-${item.endTime || ''}-${item.dueDateTime || ''}-${item.isAllDay ? '1' : '0'}`;
      
      const itemHash = `${item.id}-${titleStr}-${tagsStr}-${eventlogStr}-${timeStr}-${item.updatedAt}`;
      
      // 🔍 记录 Event[3] 的完整 hash
      if (index === 3) {
        // console.log('%c[itemsHash] Event[3] 完整 hash:', 'background: #FF6B6B; color: white; padding: 2px 6px;', {
        //   itemHash,
        //   id: item.id.slice(-10),
        //   titleStr,
        //   tagsStr,
        //   eventlogStr,
        //   timeStr,
        //   updatedAt: item.updatedAt
        // });
      }
      
      return itemHash;
    }).join('|');
    
    // 🛡️ 优化：如果 hash 未变化，返回之前的引用（避免触发 useEffect）
    if (hash === prevItemsHashRef.current) {
      // console.log('%c[⏭️ itemsHash 未变化，使用缓存]', 'background: #2196F3; color: white; padding: 2px 6px;');
      return prevItemsHashRef.current;
    }
    
    // console.log('%c[🔍 itemsHash 重新计算]', 'background: #9C27B0; color: white; padding: 2px 6px;', {
    //   itemsLength: items.length,
    //   hashLength: hash.length,
    //   hashPreview: hash.substring(0, 100) + '...',
    //   hasChanged: hash !== prevItemsHashRef.current,
    //   changedCount: hash.split('|').filter((h, i) => h !== prevItemsHashRef.current.split('|')[i]).length
    // });
    
    prevItemsHashRef.current = hash;
    return hash;
  }, [items]);
  
  const enhancedValue = useMemo(() => {
    // 🚨 DIAGNOSIS: 记录 enhancedValue 计算过程
    vlog('🔍 [诊断] enhancedValue 重新计算:', {
      items数量: items.length,
      itemsHash: itemsHash.substring(0, 50) + '...',
      时间戳: formatTimeForStorage(new Date())
    });
    
    const baseNodes = planItemsToSlateNodes(items);
    
    // 🚨 DIAGNOSIS: 检测 planItemsToSlateNodes 返回空数组
    if (baseNodes.length === 0 && items.length > 0) {
      vlog('🔴 [诊断] planItemsToSlateNodes 返回空数组！', {
        items数量: items.length,
        items示例: items.slice(0, 3).map(i => ({ id: i.id, title: i.title?.simpleTitle?.substring(0, 20) || '' }))
      });
    }
    
    // 🔥 v2.20.0: 检查是否已经存在 placeholder，避免重复添加
    const hasPlaceholder = baseNodes.some(n => n.eventId === '__placeholder__');
    
    if (hasPlaceholder) {
      vlog('✅ [诊断] baseNodes 已包含 placeholder，不添加新的');
      return baseNodes;
    }
    
    // 🎯 v1.8: 在末尾添加一个特殊的 placeholder 行（第 i+1 行）
    // 这一行不可编辑，只显示提示文字，点击时会在它之前插入新行
    const placeholderLine: EventLineNode = {
      type: 'event-line',
      eventId: '__placeholder__',
      lineId: '__placeholder__',
      level: 0,
      mode: 'title',
      children: [
        {
          type: 'paragraph',
          children: [{ text: '' }], // 内容为空
        },
      ],
      metadata: {
        isPlaceholder: true, // 🔧 标记为 placeholder
      } as any,
    };
    
    const result = [...baseNodes, placeholderLine];
    
    // 🚨 DIAGNOSIS: 记录 enhancedValue 最终结果
    vlog('📊 [诊断] enhancedValue 计算完成:', {
      baseNodes数量: baseNodes.length,
      最终数量: result.length,
      items数量: items.length
    });
    
    return result;
  }, [itemsHash]); // 使用itemsHash代替items直接依赖
  
  // ✅ P0修复：移除value冗余状态，Slate内部已有editor.children
  // Slate的单一数据源：editor.children
  // 不再维护value state，避免双重状态导致Selection丢失
  
  // 🆕 v1.8: 移除 shouldShowPlaceholder，改为在 renderLinePrefix 中渲染
  
  // 🔥 标志位：跳过 syncFromExternal 触发的 onChange（因为是外部同步，不需要回调）
  const skipNextOnChangeRef = React.useRef(false);
  
  // 🆕 DOM 变化监控
  const editorContainerRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!isDebugEnabled() || !editorContainerRef.current) return;
    
    // 🔧 只监听 Slate 编辑器区域（[contenteditable="true"]），过滤掉 checkbox 等元素
    const slateEditable = editorContainerRef.current.querySelector('[contenteditable="true"]');
    if (!slateEditable) {
      console.warn('[MutationObserver] 未找到 Slate 编辑器区域');
      return;
    }
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // 🔧 过滤掉 checkbox 的变化（target 是 input 元素）
        if (mutation.target instanceof HTMLInputElement) {
          return; // 跳过 checkbox
        }
        
        if (mutation.type === 'childList') {
          logDOMChange('子节点变化', {
            addedNodes: mutation.addedNodes.length,
            removedNodes: mutation.removedNodes.length,
            target: mutation.target.nodeName,
          });
        } else if (mutation.type === 'characterData') {
          logDOMChange('文本内容变化', {
            oldValue: mutation.oldValue,
            newValue: mutation.target.textContent,
          });
        } else if (mutation.type === 'attributes') {
          logDOMChange('属性变化', {
            attributeName: mutation.attributeName,
            oldValue: mutation.oldValue,
          });
        }
      });
    });
    
    // ✅ 只监听 Slate 编辑器的 contenteditable 区域
    observer.observe(slateEditable, {
      childList: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeOldValue: true,
      subtree: true,
    });
    
    return () => observer.disconnect();
  }, []);
  
  // 🔧 不需要单独的初始化逻辑，直接通过 useState 和后续的 enhancedValue useEffect 处理
  const isInitializedRef = React.useRef(false);
  
  // 🔥 智能增量更新：逐个比较 items，只更新变化的 Events
  
  // ✅ P0修复：监听 enhancedValue 变化，使用Transforms API更新编辑器
  useEffect(() => {
    const currentChildren = editor.children as EventLineNode[];
    
    console.log('%c[🔍 enhancedValue useEffect 触发]', 'background: #E91E63; color: white; padding: 2px 6px;', {
      isInitialized: isInitializedRef.current,
      enhancedValueLength: enhancedValue.length,
      currentChildrenLength: currentChildren.length
    });
    
    // 🔥 首次初始化：只标记，不更新（editor已通过initialValue初始化）
    if (!isInitializedRef.current) {
      console.log('%c[🎉 首次初始化] 标记为已初始化', 'background: #4CAF50; color: white; padding: 2px 6px;', {
        enhancedValueLength: enhancedValue.length,
        currentChildrenLength: currentChildren.length
      });
      isInitializedRef.current = true;
      return; // ✅ 首次初始化完成，直接返回
    }
    
    // 🔥 后续更新：检查用户是否正在编辑
    
    const hasSelection = !!editor.selection;
    const hasPendingChanges = !!pendingChangesRef.current;
    
    if (!hasSelection && !hasPendingChanges) {
      // 🔄 用户未在编辑，直接替换整个内容
      console.log('%c[🔄 同步 enhancedValue] 用户未编辑，全量更新', 'background: #4CAF50; color: white; padding: 2px 6px;', {
        oldLength: currentChildren.length,
        newLength: enhancedValue.length
      });
      
      // 🔧 安全检查：确保 enhancedValue 不为空，且与当前内容不同
      if (enhancedValue.length > 0) {
        // 🔍 对比 enhancedValue 和当前内容是否真的不同
        const isDifferent = enhancedValue.length !== currentChildren.length || 
          !enhancedValue.every((node, i) => node.eventId === currentChildren[i]?.eventId);
        
        if (!isDifferent) {
          console.log('%c[⏭️ 同步跳过] enhancedValue 与当前内容相同，无需更新', 'background: #2196F3; color: white; padding: 2px 6px;');
          return;
        }
        
        skipNextOnChangeRef.current = true;
        
        // ✅ P0修复：使用 Slate Transforms API 直接更新内容（避免重新挂载）
        Editor.withoutNormalizing(editor, () => {
          // 删除所有旧内容
          editor.children.splice(0, editor.children.length);
          // 插入新内容
          editor.children.push(...enhancedValue);
          // 触发编辑器更新
          editor.onChange();
        });
        
        console.log('%c[✅ 同步完成] Transforms API 已调用', 'background: #4CAF50; color: white; padding: 2px 6px;', {
          newLength: enhancedValue.length,
          skipNextOnChange: skipNextOnChangeRef.current
        });
      } else {
        console.warn('%c[⚠️ 同步跳过] enhancedValue 为空，保持当前内容', 'background: #FF9800; color: white;');
      }
    } else {
      // 🔧 用户正在编辑时，不做任何更新，避免干扰编辑
      console.log('%c[🔄 同步跳过] 用户正在编辑，延迟更新', 'background: #FF9800; color: white; padding: 2px 6px;', {
        hasSelection,
        hasPendingChanges
      });
    }
  }, [enhancedValue, editor]); // 依赖 enhancedValue，items 变化时重新计算
  
  // 🔥 订阅 window.eventsUpdated 事件，接收增量更新通知
  useEffect(() => {
    if (!isInitializedRef.current) return;
    
    const handleEventUpdated = async (e: any) => {
      const { eventId, isDeleted, isNewEvent, updateId, isLocalUpdate, originComponent } = e.detail || {};
      
      console.log('%c[📡 eventsUpdated] 收到事件', 'background: #9C27B0; color: white; padding: 2px 6px;', {
        eventId: eventId?.slice(-10),
        isDeleted,
        isNewEvent,
        originComponent
      });
      
      // 🚫 循环更新防护：跳过本组件相关的更新（已乐观更新过了）
      // ✅ BulletLevel → EventTree: Tab/Shift+Tab 触发的更新会被跳过
      if (isLocalUpdate || 
          originComponent === 'PlanManager' || 
          recentlySavedEventsRef.current.has(eventId) ||
          (updateId && EventService.isLocalUpdate(eventId, updateId))) {
        console.log('%c[⏭️ 跳过] 本组件相关的更新（已乐观更新）', 'background: #FF9800; color: white; padding: 2px 6px;', {
          eventId: eventId?.slice(-10),
          reason: isLocalUpdate ? 'isLocalUpdate' : 
                  originComponent === 'PlanManager' ? 'originComponent=PlanManager' :
                  recentlySavedEventsRef.current.has(eventId) ? 'recentlySaved' : 'isLocalUpdate(eventId)'
        });
        return;
      }
      
      // ✅ 只处理其他组件的更新
      console.log('%c[📡 外部更新] 来自其他组件', 'background: #2196F3; color: white; padding: 2px 6px;', {
        eventId: eventId?.slice(-10),
        originComponent
      });
      
      // 🔥 增量处理新增/删除事件
      if (isDeleted) {
        console.log('[📡 eventsUpdated] 删除事件，增量移除节点');
        
        // ✅ P0修复：使用editor.children代替value
        const currentChildren = editor.children as EventLineNode[];
        
        // 找到所有匹配的节点索引
        const nodesToDelete: number[] = [];
        currentChildren.forEach((node, index) => {
          const eventLine = node as EventLineNode;
          if (eventLine.eventId === eventId) {
            nodesToDelete.push(index);
          }
        });
        
        if (nodesToDelete.length > 0) {
          skipNextOnChangeRef.current = true;
          Editor.withoutNormalizing(editor, () => {
            // 从后往前删除（避免索引变化）
            nodesToDelete.reverse().forEach(index => {
              Transforms.removeNodes(editor, { at: [index] });
            });
          });
          
          // 🆕 v1.8.4: 外部同步删除后，自动调整 bullet 层级
          adjustBulletLevelsAfterDelete(editor);
        }
        
        return;
      }
      
      if (isNewEvent) {
        console.log('[📡 eventsUpdated] 新增事件，增量插入节点');
        
        // 从 items 中找到新事件
        const newItem = items.find(item => item.id === eventId);
        if (!newItem) {
          console.warn('[📡 eventsUpdated] 找不到新事件:', eventId);
          return;
        }
        
        // 转换为 Slate 节点
        const newNodes = planItemsToSlateNodes([newItem]);
        if (newNodes.length === 0) return;
        
        // ✅ P0修复：使用editor.children代替value
        const currentChildren = editor.children as EventLineNode[];
        // 在 placeholder 之前插入（placeholder 总是最后一个节点）
        const insertIndex = currentChildren.length - 1; // placeholder 的索引
        
        skipNextOnChangeRef.current = true;
        Editor.withoutNormalizing(editor, () => {
          Transforms.insertNodes(editor, newNodes as any, { at: [insertIndex] });
        });
        
        return;
      }
      
      // 🔥 增量更新：检测用户是否正在编辑这个 Event
      if (pendingChangesRef.current && editor.selection) {
        const currentPath = editor.selection.anchor.path[0];
        // ✅ P0修复：使用editor.children代替value
        const currentChildren = editor.children as EventLineNode[];
        const currentNode = currentChildren[currentPath] as EventLineNode;
        
        console.log(`%c[🔍 增量更新检查]`, 'background: #FFC107; color: black; padding: 2px 6px;', {
          hasPendingChanges: !!pendingChangesRef.current,
          hasSelection: !!editor.selection,
          currentPath,
          currentEventId: currentNode?.eventId,
          incomingEventId: eventId,
          willSkip: currentNode?.eventId === eventId
        });
        
        if (currentNode?.eventId === eventId) {
          console.log(`%c[⏭️ 跳过 Slate 更新] 用户正在编辑 Event: ${eventId}`, 'color: #FF9800;');
          console.log(`%c[ℹ️ UI 应该通过 useEventTime hook 自动更新]`, 'color: #2196F3;');
          return;
        }
      }
      
      // ✅ P0修复：使用editor.children代替value
      const currentChildren = editor.children as EventLineNode[];
      
      // 查找需要更新的节点
      const nodesToUpdate: number[] = [];
      currentChildren.forEach((node, index) => {
        const eventLine = node as EventLineNode;
        if (eventLine.eventId === eventId) {
          nodesToUpdate.push(index);
        }
      });
      
      console.log(`%c[🔍 查找节点]`, 'background: #E91E63; color: white; padding: 2px 6px;', {
        eventId,
        totalNodes: currentChildren.length,
        nodesToUpdate,
        nodesToUpdateCount: nodesToUpdate.length,
      });

      if (nodesToUpdate.length === 0) return;
      
      // 🔥 直接从 EventService 获取最新数据
      const updatedEvent = await EventService.getEventById(eventId);
      if (!updatedEvent) return;
      
      console.log(`%c[📝 增量更新] Event: ${eventId}`, 'background: #2196F3; color: white; padding: 2px 6px;');
      
      // 🔧 只更新 metadata 字段，不覆盖 children（避免破坏光标）
      // 🆕 同时更新 children 中的 DateMentionNode
      Editor.withoutNormalizing(editor, () => {
        nodesToUpdate.forEach(index => {
          // ✅ P0修复：使用editor.children代替value
          const currentNode = currentChildren[index] as EventLineNode;
          
          // 构建新的 metadata（从 EventService 获取）
          const newMetadata = {
            startTime: updatedEvent.startTime,
            endTime: updatedEvent.endTime,
            dueDateTime: updatedEvent.dueDateTime,
            isAllDay: updatedEvent.isAllDay,
            timeSpec: updatedEvent.timeSpec,
            emoji: updatedEvent.emoji,
            color: updatedEvent.color,
            isCompleted: updatedEvent.isCompleted,
            isTask: hasTaskFacet(updatedEvent),
            type: updatedEvent.type,
            checkType: updatedEvent.checkType || 'once', // 🔧 FIX: 添加 checkType 字段
            checked: updatedEvent.checked, // 🔧 FIX: 同步 checked 数组
            unchecked: updatedEvent.unchecked, // 🔧 FIX: 同步 unchecked 数组
            calendarIds: updatedEvent.calendarIds,
            source: updatedEvent.source,
            syncStatus: updatedEvent.syncStatus,
            externalId: updatedEvent.externalId,
            fourDNoteSource: updatedEvent.fourDNoteSource,
            createdAt: updatedEvent.createdAt,
            updatedAt: updatedEvent.updatedAt,
          };
          
          // 只更新 metadata，保持 children 不变
          console.log('%c[✏️ 更新 Slate metadata]', 'background: #2196F3; color: white; padding: 2px 6px;', {
            eventId: eventId?.slice(-10),
            checked: newMetadata.checked,
            unchecked: newMetadata.unchecked,
            oldChecked: currentNode.metadata?.checked,
            oldUnchecked: currentNode.metadata?.unchecked,
          });
          Transforms.setNodes(editor, { metadata: newMetadata } as any, { at: [index] });
          
          // 🆕 更新 children 中的 DateMentionNode
          // 遍历所有 paragraph 节点，找到 dateMention 节点并更新
          console.log(`%c[🔍 检查 DateMention]`, 'background: #FF9800; color: white; padding: 2px 6px;', {
            eventId,
            paragraphsCount: currentNode.children.length,
            children: currentNode.children,
          });
          
          currentNode.children.forEach((paragraph, paragraphIndex) => {
            console.log(`%c[🔍 Paragraph ${paragraphIndex}]`, 'background: #FFC107; color: black; padding: 2px 6px;', {
              childrenCount: paragraph.children.length,
              children: paragraph.children,
            });
            
            paragraph.children.forEach((child, childIndex) => {
              console.log(`%c[🔍 Child ${childIndex}]`, 'background: #FFEB3B; color: black; padding: 2px 6px;', {
                hasType: 'type' in child,
                type: 'type' in child ? child.type : 'no-type',
                child,
              });
              
              // 类型守卫：检查是否是 DateMentionNode
              if ('type' in child && child.type === 'dateMention') {
                const dateMentionNode = child as DateMentionNode;
                console.log(`%c[📅 找到 DateMention]`, 'background: #8BC34A; color: white; padding: 2px 6px;', {
                  eventId: dateMentionNode.eventId,
                  matchesEventId: dateMentionNode.eventId === eventId,
                  startDate: dateMentionNode.startDate,
                  endDate: dateMentionNode.endDate,
                });
                
                // 🔥 移除自动同步逻辑：不再自动更新 DateMention 的时间
                // DateMention 应该保持原始时间，让用户通过 hover popover 手动选择是否更新
                // 只有用户点击"更新"按钮时，才同步到 TimeHub 的最新时间
                
                // if (dateMentionNode.eventId === eventId) {
                //   const dateMentionPath = [index, paragraphIndex, childIndex];
                //   const newDateMention = {
                //     startDate: updatedEvent.startTime || dateMentionNode.startDate,
                //     endDate: updatedEvent.endTime || dateMentionNode.endDate,
                //   };
                //   
                //   console.log(`%c[📅 更新 DateMention]`, 'background: #4CAF50; color: white; padding: 2px 6px;', {
                //     path: dateMentionPath,
                //     旧startDate: dateMentionNode.startDate,
                //     新startDate: newDateMention.startDate,
                //     旧endDate: dateMentionNode.endDate,
                //     新endDate: newDateMention.endDate,
                //   });
                //   
                //   Transforms.setNodes(
                //     editor,
                //     newDateMention as any,
                //     { at: dateMentionPath }
                //   );
                // }
              }
            });
          });
        });
      });
      
      // ✅ P0修复：移除setValue调用，Slate内部已通过editor.onChange()触发重渲染
      console.log('%c[🔄 强制重新渲染]', 'background: #FF5722; color: white; padding: 2px 6px;', {
        eventId: eventId?.slice(-10),
        skipNextOnChange: true,
        editorChildrenCount: editor.children.length
      });
      skipNextOnChangeRef.current = true;
      editor.onChange(); // 触发Slate重新渲染
    };
    
    window.addEventListener('eventsUpdated', handleEventUpdated);
    return () => window.removeEventListener('eventsUpdated', handleEventUpdated);
  }, [items, editor, enhancedValue]);
  
  // ==================== 内容变化处理 ====================
  
  // 🆕 自动保存定时器
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = React.useRef<Descendant[] | null>(null);
  const hasDeleteOperationRef = React.useRef<boolean>(false); // 🆕 v2.20.0: 追踪删除操作
  
  // 🆕 v2.21.0: 统一的会话态管理（替代8个useState）
  const { state: session, actions: sessionActions } = usePlanSlateSession();

  // 记录打开 @ 搜索菜单时的“当前事件ID”（用于 UnifiedMentionMenu 自动创建双向链接）
  const searchCurrentEventIdRef = useRef<string | null>(null);
  
  // 🔄 向后兼容：保留原有的ref名称
  const mentionAnchorRef = useRef<HTMLElement | null>(session.mention.anchor);
  
  // 🆕 v1.8: 跟踪最近保存的事件ID，避免增量更新覆盖
  const recentlySavedEventsRef = React.useRef<Set<string>>(new Set());
  
  // 🕐 Timestamp 服务
  const timestampServiceRef = useRef(new EventLogTimestampService());
  
  // 🧪 Manual timestamp insertion for testing (expose to window for debugging)
  useEffect(() => {
    if (isDebugEnabled() && typeof window !== 'undefined') {
      (window as any).insertTimestamp = (eventId: string) => {
        try {
          timestampServiceRef.current.insertTimestamp(editor, undefined, eventId);
        } catch (error) {
          console.error('[Timestamp Debug] 插入失败:', error);
        }
      };
      console.log('%c💡 调试命令可用: window.insertTimestamp("test-event-id")', 'color: #FF9800; font-weight: bold;');
    }
  }, [editor]);
  
  const handleEditorChange = useCallback((newValue: Descendant[]) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    
    // 🔥 调试：记录每次 onChange 的选区状态
    // console.log('%c[🔄 onChange]', 'background: #2196F3; color: white; padding: 2px 6px;', {
    //   timestamp,
    //   hasSelection: !!editor.selection,
    //   selection: editor.selection ? {
    //     anchor: editor.selection.anchor,
    //     focus: editor.selection.focus
    //   } : null,
    //   operations: editor.operations.map(op => op.type)
    // });
    
    // 🆕 v1.8.4: 检测是否有删除节点操作
    const hasRemoveNode = editor.operations.some(op => op.type === 'remove_node');
    
    if (hasRemoveNode) {
      const removeOps = editor.operations.filter(op => op.type === 'remove_node');
      console.log('%c[🔍 检测到删除操作]', 'background: #FF5722; color: white;', {
        operations: removeOps,
        删除数量: removeOps.length,
        删除后剩余节点: newValue.length,
      });
      
      // 🆕 v2.20.0: 标记有删除操作，强制保存空内容
      hasDeleteOperationRef.current = true;
      
      // 删除后自动调整 bullet 层级
      adjustBulletLevelsAfterDelete(editor);
    }
    
    // 🎯 跳过外部同步触发的 onChange
    if (skipNextOnChangeRef.current) {
      skipNextOnChangeRef.current = false;
      if (isDebugEnabled()) {
        window.console.log(`%c[⏭️ ${timestamp}] 跳过外部同步的 onChange`, 'color: #9E9E9E;');
      }
      return;
    }
    
    // 🔥 检测是否只是选区变化（光标移动），而非内容变化
    const isOnlySelectionChange = editor.operations.every(
      op => op.type === 'set_selection'
    );
    
    if (isOnlySelectionChange) {
      if (isDebugEnabled()) {
        window.console.log(`%c[⏭️ ${timestamp}] 跳过纯选区变化`, 'color: #9E9E9E;');
      }
      return;
    }
    
    // 使用增强的调试工具记录变化
    const newValueAsNodes = newValue as unknown as EventLineNode[];
    logValueChange(editor.children as EventLineNode[], newValueAsNodes);
    
    // ✅ P0修复：移除setValue调用，Slate内部已通过editor.children维护状态
    // 不再需要同步到外部state，避免双重状态
    
    // 🆕 检测@提及触发
    if (editor.selection && Range.isCollapsed(editor.selection)) {
      try {
        const { anchor } = editor.selection;
        const [node] = Editor.node(editor, anchor.path);
        
        if (SlateText.isText(node)) {
          const textBeforeCursor = node.text.slice(0, anchor.offset);
          const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
          
          if (atMatch) {
            const text = atMatch[1];
            console.log('[@ Mention] 检测到@输入:', text);
            
            // 🔍 优先级1: 尝试时间解析（只在有输入时）
            if (text.length > 0) {
              const parsed = parseNaturalLanguage(text);
              console.log('[@ Mention] 解析结果:', { 
                text, 
                parsed,
                hasDaterRange: !!parsed?.dateRange,
                hasTimePeriod: !!parsed?.timePeriod,
                hasPointInTime: !!parsed?.pointInTime,
              });
              
              if (parsed && parsed.matched) {
                // ✅ 时间解析成功 → 显示时间选择器
                console.log('[@ Mention] 时间解析成功 - 详细信息:', {
                  dateRange: parsed.dateRange,
                  timePeriod: parsed.timePeriod,
                  pointInTime: parsed.pointInTime,
                });
                
                // 🆕 v2.21.0: 准备打开时间选择器（关闭搜索菜单）
                sessionActions.closeSearch();
                
                // 提取开始和结束时间
                let startTime: Date | undefined;
                let endTime: Date | undefined;
                
                // 优先检查复合解析结果（日期+时间段组合）
                if (parsed.dateRange && parsed.timePeriod) {
                  // 情况1: "下周二下午3点" - dateRange提供日期，timePeriod提供时间
                  const baseDate = parsed.dateRange.start.toDate();
                  startTime = new Date(baseDate);
                  startTime.setHours(parsed.timePeriod.startHour, parsed.timePeriod.startMinute, 0, 0);
                  
                  if (parsed.timePeriod.endHour > 0 || parsed.timePeriod.endMinute > 0) {
                    endTime = new Date(baseDate);
                    endTime.setHours(parsed.timePeriod.endHour, parsed.timePeriod.endMinute, 0, 0);
                  }
                  console.log('[@ Mention] 日期+时间段组合:', { baseDate, startTime, endTime });
                } else if (parsed.dateRange) {
                  // 情况2: 纯日期范围 "下周"
                  startTime = parsed.dateRange.start.toDate();
                  endTime = parsed.dateRange.end?.toDate();
                } else if (parsed.pointInTime) {
                  // 情况3: 精确时间点 "明天10点"
                  startTime = parsed.pointInTime.date.toDate();
                } else if (parsed.timePeriod) {
                  // 情况4: 纯时间段 "下午3点"（今天）
                  const period = parsed.timePeriod;
                  const baseDate = new Date();
                  baseDate.setHours(period.startHour, period.startMinute, 0, 0);
                  startTime = baseDate;
                  
                  if (period.endHour > 0 || period.endMinute > 0) {
                    const endDate = new Date();
                    endDate.setHours(period.endHour, period.endMinute, 0, 0);
                    endTime = endDate;
                  }
                }
                
                if (startTime) {
                  // 创建虚拟 anchor 元素用于 Tippy 定位
                  const domRange = ReactEditor.toDOMRange(editor, editor.selection);
                  const rect = domRange.getBoundingClientRect();
                  
                  if (!mentionAnchorRef.current) {
                    const anchor = document.createElement('span');
                    anchor.style.position = 'absolute';
                    anchor.style.width = '1px';
                    anchor.style.height = '1px';
                    document.body.appendChild(anchor);
                    mentionAnchorRef.current = anchor;
                  }
                  
                  mentionAnchorRef.current.style.top = `${rect.bottom}px`;
                  mentionAnchorRef.current.style.left = `${rect.left}px`;
                  
                  // 🆕 v2.21.0: 原子操作打开mention picker
                  sessionActions.openMention('time', mentionAnchorRef.current, startTime, endTime);
                } else {
                  sessionActions.closeMention();
                }
              } else if (text.length >= 0) {
                // 🔍 优先级2: 时间解析失败 → 显示搜索菜单（包括空查询 @）
                console.log('[@ Mention] 时间解析失败，触发搜索菜单:', text);
                console.log('[@ Mention] 准备显示搜索菜单，状态:', {
                  mentionType: 'search',
                  searchQuery: text,
                  showSearchMenu: true
                });
                
                // 记录当前事件ID（用于创建双向链接）
                searchCurrentEventIdRef.current = getCurrentEventIdFromSelection(editor);
                // 🆕 v2.21.0: 原子操作打开搜索菜单
                sessionActions.openSearch(text);
                
                // 创建虚拟 anchor 元素用于 Tippy 定位
                const domRange = ReactEditor.toDOMRange(editor, editor.selection);
                const rect = domRange.getBoundingClientRect();
                
                if (!mentionAnchorRef.current) {
                  const anchor = document.createElement('span');
                  anchor.style.position = 'absolute';
                  anchor.style.width = '1px';
                  anchor.style.height = '1px';
                  document.body.appendChild(anchor);
                  mentionAnchorRef.current = anchor;
                }
                
                mentionAnchorRef.current.style.top = `${rect.bottom}px`;
                mentionAnchorRef.current.style.left = `${rect.left}px`;
              }
            } else {
              // 空输入（只输入 @），显示搜索菜单
              console.log('[@ Mention] 空输入，显示搜索菜单');
              
              // 记录当前事件ID（用于创建双向链接）
              searchCurrentEventIdRef.current = getCurrentEventIdFromSelection(editor);
              // 🆕 v2.21.0: 原子操作打开搜索菜单
              sessionActions.openSearch('');
              
              // 创建虚拟 anchor 元素用于 Tippy 定位
              const domRange = ReactEditor.toDOMRange(editor, editor.selection);
              const rect = domRange.getBoundingClientRect();
              
              if (!mentionAnchorRef.current) {
                const anchor = document.createElement('span');
                anchor.style.position = 'absolute';
                anchor.style.width = '1px';
                anchor.style.height = '1px';
                document.body.appendChild(anchor);
                mentionAnchorRef.current = anchor;
              }
              
              mentionAnchorRef.current.style.top = `${rect.bottom}px`;
              mentionAnchorRef.current.style.left = `${rect.left}px`;
            }
          } else {
            // 没有检测到 @，关闭所有菜单
            sessionActions.closeMention();
            sessionActions.closeSearch();
            searchCurrentEventIdRef.current = null;
          }
        } else {
          // 不是文本节点
          if (session.mention.isOpen || session.search.isOpen) {
            console.log('[@ Mention] 不在文本节点，清除状态');
            sessionActions.closeMention();
            sessionActions.closeSearch();
            searchCurrentEventIdRef.current = null;
          }
        }
      } catch (err) {
        console.error('[@ Mention] 检测失败:', err);
      }
    }
    
    // ⚡️ [LOCAL-FIRST FIX] 立即保存到内存层（Transient Buffer）
    // 架构原则：UI -> Service (0ms) -> DB (Service 内部防抖)
    pendingChangesRef.current = newValue;
    
    // 🆕 v2.10.1: 当用户正在输入 @ 提及时，暂停保存
    // 等用户确认 DateMention 后，会调用 flushPendingChanges() 手动保存
    if (session.mention.isOpen) {
      if (isDebugEnabled()) {
        console.log(`%c[⏸️ ${timestamp}] @ 提及输入中，暂停自动保存`, 
          'background: #FF9800; color: white; padding: 2px 6px; border-radius: 2px;');
      }
      return;
    }
    
    // ⚡️ [CRITICAL FIX] 移除 2000ms 延迟，立即保存到 EventService
    // EventService 的 Transient Buffer 会立即接管数据（内存安全）
    // StorageManager 内部会处理 IO 防抖（200-500ms 合并写入）
    if (isDebugEnabled()) {
      console.log(`%c[💾 ${timestamp}] 立即保存到内存层`, 
        'background: #4CAF50; color: white; padding: 2px 6px; border-radius: 2px;');
    }
    
    // 🔥 FIX v2.21.1: 删除操作时必须传入 newValue，确保正确反映删除后状态
    // 否则 flushPendingChanges 会读取 pendingChangesRef，可能包含已删除的节点
    if (hasRemoveNode) {
      console.log('%c[💾 删除操作] 强制传入最新状态', 'background: #E91E63; color: white;', {
        newValue数量: newValue.length,
      });
      flushPendingChanges(newValue as Descendant[]);
    } else {
      flushPendingChanges();
    }
    
    // 🔥 立即通知焦点变化（用于 FloatingBar 和 TagPicker）
    if (onFocus && editor.selection) {
      try {
        const match = Editor.above(editor, {
          match: n => (n as any).type === 'event-line',
        });
        
        if (match) {
          const [node] = match;
          const eventLine = node as unknown as EventLineNode;
          onFocus(eventLine.lineId);
        }
      } catch (err) {
        // 忽略错误
      }
    }
  }, [onChange, onFocus, editor]);
  
  // 🆕 立即保存函数（用于 Enter 和失焦）
  // 🔥 方案 A：支持直接传入最新节点（消除对异步 onChange 的依赖）
  const flushPendingChanges = useCallback((directNodes?: Descendant[]) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    
    // 🔥 优先使用直接传入的最新节点（editor.children），否则兜底使用 Ref
    const nodesToSave = (directNodes || pendingChangesRef.current) as unknown as EventLineNode[];
    
    if (nodesToSave) {
      console.log('[flushPendingChanges] 💾 立即保存触发:', {
        数据来源: directNodes ? 'editor.children (同步)' : 'pendingChangesRef (异步)',
        节点数量: nodesToSave.length,
        节点详情: nodesToSave.map(n => ({
          eventId: n.eventId?.slice(-8) || n.eventId,
          mode: n.mode,
          isPlaceholder: (n.metadata as any)?.isPlaceholder,
          parentEventId: (n.metadata as any)?.parentEventId?.slice(-8),
          children: JSON.stringify(n.children).slice(0, 80)
        }))
      });
      
      if (isDebugEnabled()) {
        console.log(`%c[💾 立即保存] 触发`, 
          'background: #FF9800; color: white; padding: 2px 6px; border-radius: 2px;');
      }
      
      // 只过滤 placeholder，保留所有真实节点（包括空白节点）
      const filteredNodes = nodesToSave.filter(node => {
        if ((node.metadata as any)?.isPlaceholder || node.eventId === '__placeholder__') {
          return false;
        }
        return true;
      });
      
      // 重置删除标志
      hasDeleteOperationRef.current = false;
      
      const planItems = slateNodesToPlanItems(filteredNodes);
      
      // 检测 eventlog 行删除
      planItems.forEach(item => {
        const hasDescriptionNode = nodesToSave.some(node => {
          const eventLine = node as EventLineNode;
          return (eventLine.eventId === item.eventId || eventLine.lineId.startsWith(item.id)) 
                 && eventLine.mode === 'eventlog';
        });
        
        if (!hasDescriptionNode && item.description) {
          item.description = '';
        }
      });
      
      // 🆕 v1.8.4: 记录保存的事件ID，避免增量更新覆盖
      // 延长保护时间窗口到 3 秒，确保外部同步返回时不会覆盖
      planItems.forEach(item => {
        recentlySavedEventsRef.current.add(item.id);
        console.log('%c[🛡️ 保护] 标记事件为刚保存', 'background: #4CAF50; color: white;', {
          eventId: item.id.slice(-10),
          保护时长: '3秒',
        });
      });
      // 3秒后清除（给外部同步足够时间）
      setTimeout(() => {
        planItems.forEach(item => {
          recentlySavedEventsRef.current.delete(item.id);
          console.log('%c[🛡️ 解除] 移除事件保护', 'background: #9E9E9E; color: white;', {
            eventId: item.id.slice(-10),
          });
        });
      }, 3000);
      
      onChange(planItems);
      pendingChangesRef.current = null;
    }
    
    // 🕐 Timestamp 自动插入检测
    const hasTextInsertion = editor.operations.some(op => 
      op.type === 'insert_text' && (op as any).text.trim().length > 0
    );
    
    console.log('[Timestamp Debug] 操作检测:', {
      operations: editor.operations.map(op => ({ type: op.type, text: op.type === 'insert_text' ? (op as any).text : undefined })),
      hasTextInsertion,
      hasSelection: !!editor.selection,
      enableTimestamp,
      eventId
    });
    
    // 🆕 逐一检查所有条件
    console.log('[Timestamp Debug] 条件检查:', {
      hasTextInsertion,
      enableTimestamp,
      eventId,
      eventIdTruthy: !!eventId,
      allConditionsMet: hasTextInsertion && enableTimestamp && eventId
    });

    if (hasTextInsertion && enableTimestamp && eventId) {
      console.log('[Timestamp Debug] 所有条件满足，进行 eventId 检查:', {
        eventId,
        isPlaceholder: eventId === '__placeholder__',
        shouldInsert: timestampServiceRef.current.shouldInsertTimestamp({ eventId })
      });
      
      if (eventId !== '__placeholder__' && timestampServiceRef.current.shouldInsertTimestamp({ eventId })) {
        console.log('[Timestamp] 需要插入时间戳', { eventId: eventId.slice(-8) });
        
        // 🔥 严谨修复：同步插入，避免竞态问题（用户快速打字时光标可能移走）
        try {
          timestampServiceRef.current.insertTimestamp(editor, undefined, eventId);
        } catch (error) {
          console.error('[Timestamp] 插入失败:', error);
        }
      } else {
        console.log('[Timestamp Debug] 跳过插入:', {
          isPlaceholder: eventId === '__placeholder__',
          shouldInsert: timestampServiceRef.current.shouldInsertTimestamp({ eventId })
        });
      }
    } else {
      console.log('[Timestamp Debug] 条件不满足，跳过时间戳检测');
    }
    
  }, [onChange]);
  
  // 通知编辑器就绪（传递带 syncFromExternal 和 flushPendingChanges 方法的对象）
  useEffect(() => {
    // 暴露调试接口到全局
    if (isDebugEnabled() && typeof window !== 'undefined') {
      (window as any).slateEditorSnapshot = () => logEditorSnapshot(editor);
      console.log('%c💡 调试命令可用: window.slateEditorSnapshot()', 'color: #4CAF50; font-weight: bold;');
    }
    
    if (onEditorReady) {
      onEditorReady({
        // 🔥 全量替换（用于初始化或重置）
        syncFromExternal: (newItems: any[]) => {
          logOperation('外部全量同步', { itemCount: newItems.length });
          
          const baseNodes = planItemsToSlateNodes(newItems);
          
          // 🆕 v1.8: 添加 placeholder 行到末尾
          const placeholderLine: EventLineNode = {
            type: 'event-line',
            eventId: '__placeholder__',
            lineId: '__placeholder__',
            level: 0,
            mode: 'title',
            children: [
              {
                type: 'paragraph',
                children: [{ text: '' }],
              },
            ],
            metadata: {
              isPlaceholder: true,
            } as any,
          };
          
          const newNodes = [...baseNodes, placeholderLine];
          
          // ✅ P0修复：使用Transforms API替代setValue + setEditorKey
          skipNextOnChangeRef.current = true;
          Editor.withoutNormalizing(editor, () => {
            // 删除所有旧内容
            editor.children.splice(0, editor.children.length);
            // 插入新内容
            editor.children.push(...newNodes);
            // 触发编辑器更新
            editor.onChange();
          });
        },
        
        getEditor: () => editor,
        
        // 🆕 暴露 flushPendingChanges 到外部
        flushPendingChanges,
      });
    }
  }, [editor, onEditorReady, flushPendingChanges]);
  
  // ==================== 焦点变化处理 ====================
  
  // 🆕 @提及搜索框变化回调（实时更新解析结果）
  const handleMentionSearchChange = useCallback((text: string, parsed: { start?: Date; end?: Date } | null) => {
    // 🆕 v2.21.0: 更新mention query
    sessionActions.updateMentionQuery(text);
    
    // 更新初始时间（如果解析成功）
    if (parsed && parsed.start && session.mention.anchor) {
      sessionActions.openMention('time', session.mention.anchor, parsed.start, parsed.end);
    }
  }, [session.mention.anchor, sessionActions]);
  
  // 🆕 @提及选择时间
  const handleMentionSelect = useCallback(async (startStr: string, endStr?: string, allDay?: boolean, userInputText?: string) => {
    if (!editor.selection) return;
    
    try {
      // 🔧 使用 UnifiedDateTimePicker 传递的完整文本，回退到 session.mention.query
      const finalUserText = userInputText || session.mention.query || '';
      console.log('[@ Mention] 确认插入:', { startStr, endStr, userInputText, finalUserText });
      
      // 找到@符号的位置
      const { anchor } = editor.selection;
      const [node, path] = Editor.node(editor, anchor.path);
      
      if (SlateText.isText(node)) {
        const textBeforeCursor = node.text.slice(0, anchor.offset);
        const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
        
        if (atMatch) {
          const atStartOffset = anchor.offset - atMatch[0].length;
          // 🔧 不再使用 atMatch[1]，因为它只是 @ 后的文本，可能不完整
          // const userInputText = atMatch[1]; // 旧代码
          
          // 删除整个 @xxx 文本（包括 @ 符号和用户输入）
          Transforms.delete(editor, {
            at: {
              anchor: { path, offset: atStartOffset },
              focus: { path, offset: anchor.offset }, // 删除到光标位置
            },
          });
          
          // 不需要移动光标，删除后光标已经在正确位置
          
          // 获取当前事件ID
          const match = Editor.above(editor, {
            match: n => (n as any).type === 'event-line',
          });
          
          let eventId: string | undefined;
          if (match) {
            const [eventLineNode] = match;
            eventId = (eventLineNode as EventLineNode).eventId;
            console.log('[@ Mention] 找到父 event-line', { eventId });
          } else {
            console.warn('[@ Mention] 未找到父 event-line，eventId 为 undefined', {
              selection: editor.selection,
              currentPath: editor.selection ? Path.parent(editor.selection.anchor.path) : null,
            });
          }
          
          // 🔧 [架构修复] 新事件创建时，不调用 TimeHub.setEventTime()
          // 原因：
          // 1. 事件还不存在于 EventService，TimeHub.setEventTime() 会失败
          // 2. serialization.ts 会从 DateMention 节点读取时间，传递给 EventService.createEvent()
          // 3. EventService 创建成功后触发 eventsUpdated，TimeHub 自动更新缓存
          
          // 只有已存在的事件才需要调用 TimeHub.setEventTime()
          if (eventId) {
            const { EventService } = await import('@backend/EventService');
            const existing = EventService.getEventById(eventId);
            
            if (existing) {
              // 已存在的事件：通过 TimeHub 更新时间
              const { TimeHub } = await import('@backend/TimeHub');
              await TimeHub.setEventTime(eventId, {
                start: startStr,
                end: endStr,
                kind: endStr ? 'range' : 'fixed',
                source: 'picker',
                rawText: finalUserText, // 🔧 使用完整的用户输入文本
              });
              console.log('[@ Mention] 已存在事件，TimeHub 写入成功:', { eventId, startStr, endStr });
            } else {
              // 新事件：由 serialization.ts 从 DateMention 读取时间
              console.log('[@ Mention] 新事件，时间将由 DateMention 节点提供:', { eventId, startStr, endStr });
            }
          }
          
          // Step 2: 插入 DateMention UI 节点
          insertDateMention(editor, startStr, endStr, false, eventId, finalUserText); // 🔧 使用完整文本
          
          console.log('[@ Mention] 插入成功, displayHint:', finalUserText);
          
          // 🔥 立即保存，触发事件创建/更新
          flushPendingChanges();
        }
      }
      
      // 清除状态
      sessionActions.closeMention();
    } catch (err) {
      console.error('[@ Mention] 插入失败:', err);
      sessionActions.closeMention();
    }
  }, [editor, session.mention.query, flushPendingChanges]);
  
  // 🆕 @提及关闭
  const handleMentionClose = useCallback(() => {
    console.log('[@ Mention] 关闭');
    sessionActions.closeMention();
    
    // 🆕 v2.10.1: 关闭 Picker 时，删除 @xxx 文本（用户取消输入）
    if (editor.selection && Range.isCollapsed(editor.selection)) {
      try {
        const { anchor } = editor.selection;
        const [node, path] = Editor.node(editor, anchor.path);
        
        if (SlateText.isText(node)) {
          const textBeforeCursor = node.text.slice(0, anchor.offset);
          const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
          
          if (atMatch) {
            const atStartOffset = anchor.offset - atMatch[0].length;
            
            // 删除整个 @xxx 文本
            Transforms.delete(editor, {
              at: {
                anchor: { path, offset: atStartOffset },
                focus: { path, offset: anchor.offset },
              },
            });
            
            console.log('[@ Mention] 已删除未确认的 @xxx 文本');
          }
        }
      } catch (err) {
        console.error('[@ Mention] 清理文本失败:', err);
      }
    }
  }, [editor]);
  
  // 🔍 Unified Mention 搜索结果选择
  const handleSearchSelect = useCallback(async (item: any) => {
    if (!editor.selection) return;
    
    try {
      console.log('[Unified Mention] 选中项:', item);
      
      // 找到 @xxx 文本的位置并删除
      const { anchor } = editor.selection;
      const [node, path] = Editor.node(editor, anchor.path);
      
      if (SlateText.isText(node)) {
        const textBeforeCursor = node.text.slice(0, anchor.offset);
        const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
        
        if (atMatch) {
          const atStartOffset = anchor.offset - atMatch[0].length;
          
          // 删除 @xxx 文本
          Transforms.delete(editor, {
            at: {
              anchor: { path, offset: atStartOffset },
              focus: { path, offset: anchor.offset },
            },
          });
          
          const eventId: string | undefined =
            searchCurrentEventIdRef.current || getCurrentEventIdFromSelection(editor) || undefined;
          
          // 根据不同类型插入不同的节点
          console.log('[Unified Mention] 处理类型:', item.type, '数据:', item);
          
          switch (item.type) {
            case 'event':
              // 插入事件提及元素
              console.log('[Unified Mention] 插入事件:', item.id, item.title, 'currentEventId:', eventId);
              // 双向链接由 UnifiedMentionMenu（基于 currentEventId）负责创建，这里仅插入 mention 节点
              insertEventMention(editor, item.id, item.title);
              break;
              
            case 'tag':
              // ✅ 使用 insertTag 助手函数插入完整标签（包含 ID、颜色、emoji）
              console.log('[Unified Mention] 插入标签 - item.id:', item.id);
              console.log('[Unified Mention] 插入标签 - metadata:', item.metadata);
              const tagId = item.metadata?.tagId || `tag-${item.id}`;
              const tagName = item.metadata?.tagName || item.id;
              console.log('[Unified Mention] 实际参数 - tagId:', tagId, 'tagName:', tagName);
              const success = insertTag(
                editor,
                tagId,
                tagName,
                item.metadata?.tagColor,
                item.metadata?.tagEmoji,
                false // mentionOnly
              );
              if (!success) {
                console.warn('[Unified Mention] insertTag 失败，回退到手动插入');
                Transforms.insertText(editor, `#${item.id} `);
              }
              break;
              
            case 'time':
              // 插入时间提及
              if (item.metadata?.pointInTime?.date) {
                // 有精确时间点
                const startDate = item.metadata.pointInTime.date.format('YYYY-MM-DD HH:mm:ss');
                insertDateMention(editor, startDate, undefined, false, eventId, item.title);
              } else if (item.id) {
                // 时间预设（今天、明天等）
                const now = new Date();
                let targetDate: Date;
                
                switch (item.id) {
                  case 'today':
                    targetDate = now;
                    break;
                  case 'tomorrow':
                    targetDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    break;
                  case 'nextWeek':
                    targetDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    break;
                  default:
                    targetDate = now;
                }
                
                const startDate = formatTimeForStorage(targetDate);
                insertDateMention(editor, startDate, undefined, false, eventId, item.title);
              }
              break;
              
            case 'ai':
              // TODO: 触发 AI 助手
              Transforms.insertText(editor, `🤖 ${item.title}`);
              console.log('[Unified Mention] AI 助手触发:', item.metadata?.prompt);
              break;
              
            case 'new':
              // 创建新页面
              Transforms.insertText(editor, item.title);
              console.log('[Unified Mention] 创建新页面:', item.title);
              break;
          }
          
          // 立即保存
          flushPendingChanges();
        }
      }
      
      // 关闭搜索菜单
      sessionActions.closeSearch();
      searchCurrentEventIdRef.current = null;
    } catch (err) {
      console.error('[Unified Mention] 插入失败:', err);
      sessionActions.closeSearch();
      searchCurrentEventIdRef.current = null;
    }
  }, [editor, flushPendingChanges]);
  
  const handleClick = useCallback((event: React.MouseEvent) => {
    // 🔧 防止在编辑器为空时处理点击
    try {
      if (!editor.children || editor.children.length === 0) {
        event.preventDefault();
        return;
      }
      
      // 记录点击事件
      logFocus('click', editor, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      
      // 通知焦点变化
      if (onFocus && editor.selection) {
        const match = Editor.above(editor, {
          match: n => (n as any).type === 'event-line',
        });
        
        if (match) {
          const [node] = match;
          const eventLine = node as unknown as EventLineNode;
          
          // 跳过 placeholder 行
          if (!((eventLine.metadata as any)?.isPlaceholder || eventLine.eventId === '__placeholder__')) {
            onFocus(eventLine.lineId);
          }
        }
      }
    } catch (err) {
      // 忽略选区错误
      logError('handleClick', err);
      event.preventDefault();
    }
  }, [onFocus, editor]);
  
  // ==================== 段落移动功能 ====================
  
  /**
   * 移动标题行及其所有关联的 eventlog 段落
   * @param editor Slate 编辑器实例
   * @param titleLineIndex 标题行的索引
   * @param direction 移动方向 ('up' | 'down')
   */
  const moveTitleWithEventlogs = (editor: Editor, titleLineIndex: number, direction: 'up' | 'down') => {
    const nodes = Array.from(Editor.nodes(editor, { at: [] }));
    const eventLines = nodes
      .filter(([node]) => (node as any).type === 'event-line')
      .map(([node, path]) => ({ node: node as unknown as EventLineNode, path: path as number[] }));
    
    const titleLine = eventLines[titleLineIndex];
    if (!titleLine || titleLine.node.mode !== 'title') {
      console.warn('[moveTitleWithEventlogs] 当前不是标题行');
      return;
    }
    
    const titleEventId = titleLine.node.eventId;
    
    // 找到该标题的所有 eventlog 行（相同 eventId 且 mode='eventlog'）
    const relatedEventlogs: number[] = [];
    for (let i = titleLineIndex + 1; i < eventLines.length; i++) {
      const line = eventLines[i].node;
      if (line.eventId === titleEventId && line.mode === 'eventlog') {
        relatedEventlogs.push(i);
      } else {
        break; // 遇到其他事件，停止查找
      }
    }
    
    const eventGroupIndices = [titleLineIndex, ...relatedEventlogs];
    const eventGroupSize = eventGroupIndices.length;
    
    // 边界检查
    if (direction === 'up') {
      if (titleLineIndex === 0) {
        console.log('[moveTitleWithEventlogs] 已在第一行，无法上移');
        return;
      }
      
      // 找到上一个标题行的起始位置
      let targetIndex = titleLineIndex - 1;
      
      // 跳过上一个事件的 eventlog 行，找到它的标题行
      while (targetIndex > 0 && eventLines[targetIndex].node.mode === 'eventlog') {
        targetIndex--;
      }
      
      // 移动整个事件组到目标位置
      Editor.withoutNormalizing(editor, () => {
        // 1. 提取所有节点
        const nodesToMove = eventGroupIndices.map(idx => eventLines[idx].node);
        
        // 2. 删除原位置的节点（从后往前删除，避免索引变化）
        for (let i = eventGroupIndices.length - 1; i >= 0; i--) {
          Transforms.removeNodes(editor, { at: [eventGroupIndices[i]] });
        }
        
        // 3. 插入到目标位置
        nodesToMove.forEach((node, offset) => {
          Transforms.insertNodes(editor, node as unknown as Node, {
            at: [targetIndex + offset],
          });
        });
        
        // 4. 恢复光标到移动后的标题行
        // 🔥 使用 requestAnimationFrame 等待 React 渲染完成
        requestAnimationFrame(() => {
          Transforms.select(editor, {
            anchor: { path: [targetIndex, 0, 0], offset: 0 },
            focus: { path: [targetIndex, 0, 0], offset: 0 },
          });
          
          // 🆕 v2.16: 移动后更新 position 和 parentEventId
          updateEventPositionAndParent(titleLine.node.eventId, [targetIndex]);
        });
      });
      
      console.log(`[moveTitleWithEventlogs] 上移事件组 (${eventGroupSize} 行): ${titleLineIndex} → ${targetIndex}`);
    } else {
      // 向下移动
      const lastEventlogIndex = relatedEventlogs.length > 0 ? relatedEventlogs[relatedEventlogs.length - 1] : titleLineIndex;
      
      // 检查是否是最后一个事件
      if (lastEventlogIndex >= eventLines.length - 1) {
        console.log('[moveTitleWithEventlogs] 已在最后，无法下移');
        return;
      }
      
      // 找到下一个事件的所有行（标题 + eventlog）
      let nextTitleIndex = lastEventlogIndex + 1;
      
      // 跳过 placeholder
      if (eventLines[nextTitleIndex].node.eventId === '__placeholder__') {
        console.log('[moveTitleWithEventlogs] 无法移动到 placeholder 后');
        return;
      }
      
      // 找到下一个事件的所有 eventlog 行
      const nextEventId = eventLines[nextTitleIndex].node.eventId;
      let nextEventEndIndex = nextTitleIndex;
      
      for (let i = nextTitleIndex + 1; i < eventLines.length; i++) {
        const line = eventLines[i].node;
        if (line.eventId === nextEventId && line.mode === 'eventlog') {
          nextEventEndIndex = i;
        } else {
          break;
        }
      }
      
      const nextEventSize = nextEventEndIndex - nextTitleIndex + 1;
      const targetIndex = titleLineIndex + nextEventSize;
      
      // 移动整个事件组到目标位置
      Editor.withoutNormalizing(editor, () => {
        // 1. 提取所有节点
        const nodesToMove = eventGroupIndices.map(idx => eventLines[idx].node);
        
        // 2. 删除原位置的节点（从后往前删除）
        for (let i = eventGroupIndices.length - 1; i >= 0; i--) {
          Transforms.removeNodes(editor, { at: [eventGroupIndices[i]] });
        }
        
        // 3. 插入到目标位置
        nodesToMove.forEach((node, offset) => {
          Transforms.insertNodes(editor, node as unknown as Node, {
            at: [targetIndex + offset],
          });
        });
        
        // 4. 恢复光标到移动后的标题行
        // 🔥 使用 requestAnimationFrame 等待 React 渲染完成
        requestAnimationFrame(() => {
          Transforms.select(editor, {
            anchor: { path: [targetIndex, 0, 0], offset: 0 },
            focus: { path: [targetIndex, 0, 0], offset: 0 },
          });
          
          // 🆕 v2.16: 移动后更新 position 和 parentEventId
          updateEventPositionAndParent(titleLine.node.eventId, [targetIndex]);
        });
      });
      
      console.log(`[moveTitleWithEventlogs] 下移事件组 (${eventGroupSize} 行): ${titleLineIndex} → ${targetIndex}`);
    }
  };
  
  /**
   * 移动 eventlog 段落（不移动标题行）
   * @param editor Slate 编辑器实例
   * @param eventlogLineIndex eventlog 行的索引
   * @param direction 移动方向 ('up' | 'down')
   */
  const moveEventlogParagraph = (editor: Editor, eventlogLineIndex: number, direction: 'up' | 'down') => {
    const nodes = Array.from(Editor.nodes(editor, { at: [] }));
    const eventLines = nodes
      .filter(([node]) => (node as any).type === 'event-line')
      .map(([node, path]) => ({ node: node as unknown as EventLineNode, path: path as number[] }));
    
    const currentLine = eventLines[eventlogLineIndex];
    if (!currentLine || currentLine.node.mode !== 'eventlog') {
      console.warn('[moveEventlogParagraph] 当前不是 eventlog 行');
      return;
    }
    
    // 边界检查
    if (direction === 'up') {
      if (eventlogLineIndex === 0) {
        console.log('[moveEventlogParagraph] 已在第一行，无法上移');
        return;
      }
      
      const targetIndex = eventlogLineIndex - 1;
      const targetLine = eventLines[targetIndex].node;
      
      // 不能移动到标题行之前
      if (targetLine.mode === 'title') {
        console.log('[moveEventlogParagraph] 无法移动到标题行之前');
        return;
      }
      
      // 交换节点
      Editor.withoutNormalizing(editor, () => {
        const currentNode = currentLine.node;
        const targetNode = targetLine;
        
        // 1. 删除当前节点
        Transforms.removeNodes(editor, { at: [eventlogLineIndex] });
        
        // 2. 删除目标节点
        Transforms.removeNodes(editor, { at: [targetIndex] });
        
        // 3. 插入当前节点到目标位置
        Transforms.insertNodes(editor, currentNode as unknown as Node, { at: [targetIndex] });
        
        // 4. 插入目标节点到原位置
        Transforms.insertNodes(editor, targetNode as unknown as Node, { at: [eventlogLineIndex] });
        
        // 5. 恢复光标
        // 🔥 使用 requestAnimationFrame 等待 React 渲染完成
        requestAnimationFrame(() => {
          Transforms.select(editor, {
            anchor: { path: [targetIndex, 0, 0], offset: 0 },
            focus: { path: [targetIndex, 0, 0], offset: 0 },
          });
        });
      });
      
      console.log(`[moveEventlogParagraph] 上移段落: ${eventlogLineIndex} ↔ ${targetIndex}`);
    } else {
      // 向下移动
      if (eventlogLineIndex >= eventLines.length - 1) {
        console.log('[moveEventlogParagraph] 已在最后一行，无法下移');
        return;
      }
      
      const targetIndex = eventlogLineIndex + 1;
      const targetLine = eventLines[targetIndex].node;
      
      // 跳过 placeholder
      if (targetLine.eventId === '__placeholder__') {
        console.log('[moveEventlogParagraph] 无法移动到 placeholder 后');
        return;
      }
      
      // 不能移动到其他事件的标题行
      if (targetLine.mode === 'title') {
        console.log('[moveEventlogParagraph] 无法移动到其他事件的标题行后');
        return;
      }
      
      // 交换节点
      Editor.withoutNormalizing(editor, () => {
        const currentNode = currentLine.node;
        const targetNode = targetLine;
        
        // 1. 删除目标节点
        Transforms.removeNodes(editor, { at: [targetIndex] });
        
        // 2. 删除当前节点
        Transforms.removeNodes(editor, { at: [eventlogLineIndex] });
        
        // 3. 插入目标节点到原位置
        Transforms.insertNodes(editor, targetNode as unknown as Node, { at: [eventlogLineIndex] });
        
        // 4. 插入当前节点到目标位置
        Transforms.insertNodes(editor, currentNode as unknown as Node, { at: [targetIndex] });
        
        // 5. 恢复光标
        // 🔥 使用 requestAnimationFrame 等待 React 渲染完成
        requestAnimationFrame(() => {
          Transforms.select(editor, {
            anchor: { path: [targetIndex, 0, 0], offset: 0 },
            focus: { path: [targetIndex, 0, 0], offset: 0 },
          });
        });
      });
      
      console.log(`[moveEventlogParagraph] 下移段落: ${eventlogLineIndex} ↔ ${targetIndex}`);
    }
  };
  
  // ==================== Position 计算工具函数 ====================
  
  /**
   * 🆕 v2.16: 计算两个 position 之间的中间值（用于插入）
   */
  const calculatePositionBetween = (before: number | undefined, after: number | undefined): number => {
    const POSITION_GAP = 1000; // 默认间隔
    
    let result: number;
    if (before === undefined && after === undefined) {
      result = POSITION_GAP; // 第一个事件
    } else if (before === undefined) {
      result = after! - POSITION_GAP; // 在最前面插入
    } else if (after === undefined) {
      result = before + POSITION_GAP; // 在最后面插入
    } else {
      result = (before + after) / 2; // 中间位置
    }
    
    console.log('[📍 Position] calculatePositionBetween:', {
      before,
      after,
      result,
      场景: before === undefined && after === undefined ? '第一个' : 
            before === undefined ? '最前面' : 
            after === undefined ? '最后面' : '中间'
    });
    
    return result;
  };
  
  /**
   * 🆕 v2.16: 更新事件的 position 和 parentEventId（移动后调用）
   */
  const updateEventPositionAndParent = async (eventId: string, newPath: number[]) => {
    try {
      const newIndex = newPath[0];
      const allNodes = Array.from(Editor.nodes(editor, {
        at: [],
        match: n => !Editor.isEditor(n) && (n as any).type === 'event-line' && (n as any).mode === 'title'
      }));
      
      const titleNodes = allNodes.map(([node, path]) => ({
        node: node as unknown as EventLineNode,
        path: path as number[],
        index: (path as number[])[0]
      }));
      
      // 找到当前事件
      const currentNode = titleNodes.find(n => n.index === newIndex);
      if (!currentNode) return;
      
      const currentLevel = currentNode.node.level || 0;
      
      // 计算新的 parentEventId（向上查找同级或上一级事件）
      let newParentEventId: string | undefined = undefined;
      
      if (currentLevel > 0) {
        // 向上查找父事件（level 比当前小 1 的最近事件）
        for (let i = newIndex - 1; i >= 0; i--) {
          const prevNode = titleNodes.find(n => n.index === i);
          if (prevNode && (prevNode.node.level || 0) === currentLevel - 1) {
            newParentEventId = prevNode.node.eventId;
            break;
          }
        }
      }
      
      // 计算新的 position（在同级事件中的位置）
      // 找到同级事件（相同 parentEventId 和 level）
      const siblings = titleNodes.filter(n => 
        n.node.eventId !== eventId &&
        (n.node.level || 0) === currentLevel &&
        (n.node.metadata?.parentEventId || undefined) === newParentEventId
      );
      
      // 找到前后位置的同级事件
      const beforeSibling = siblings.filter(n => n.index < newIndex).pop();
      const afterSibling = siblings.find(n => n.index > newIndex);
      
      const beforePos = beforeSibling?.node.metadata?.position;
      const afterPos = afterSibling?.node.metadata?.position;
      const newPosition = calculatePositionBetween(beforePos, afterPos);
      
      console.log('[updateEventPositionAndParent] 📍 计算新位置:', {
        eventId: eventId.slice(-8),
        newIndex,
        currentLevel,
        newParentEventId: newParentEventId?.slice(-8),
        beforePos,
        afterPos,
        newPosition,
        siblingsCount: siblings.length
      });
      
      // 更新数据库
      await EventService.updateEvent(eventId, {
        parentEventId: newParentEventId,
        position: newPosition
      });
      
      // 更新 Slate 节点的 metadata
      Editor.withoutNormalizing(editor, () => {
        Transforms.setNodes(
          editor,
          {
            metadata: {
              ...currentNode.node.metadata,
              parentEventId: newParentEventId,
              position: newPosition
            }
          } as any,
          { at: newPath }
        );
      });
      
      console.log('[updateEventPositionAndParent] ✅ 已更新:', {
        eventId: eventId.slice(-8),
        parentEventId: newParentEventId?.slice(-8) || 'ROOT',
        position: newPosition
      });
    } catch (error) {
      console.error('[updateEventPositionAndParent] ❗ 更新失败:', error);
    }
  };

  // ==================== BulletLevel → EventTree 辅助函数 ====================
  
  /**
   * 查找 EventLine 节点的路径
   */
  const findPathForEventLine = useCallback((eventLine: EventLineNode): Path | null => {
    try {
      for (let i = 0; i < editor.children.length; i++) {
        const [node] = Editor.node(editor, [i]);
        if (node === eventLine || (node as any).eventId === eventLine.eventId) {
          return [i];
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }, [editor]);
  
  /**
   * 在指定路径查找 EventLine（用于 ID 更新后重新查找）
   */
  const findEventLineAtPath = useCallback((path: Path): EventLineNode | null => {
    try {
      const [node] = Editor.node(editor, path);
      const eventLine = node as unknown as EventLineNode;
      if (eventLine && eventLine.type === 'event-line') {
        return eventLine;
      }
      return null;
    } catch (error) {
      return null;
    }
  }, [editor]);
  
  /**
   * 找到上一个 EventLine 节点（用于 Tab 键查找父事件）
   */
  const findPreviousEventLine = useCallback((currentPath: Path): EventLineNode | null => {
    const currentIndex = currentPath[0];
    if (currentIndex === 0) return null;
    
    // 向上查找最近的 EventLine
    for (let i = currentIndex - 1; i >= 0; i--) {
      try {
        const [node] = Editor.node(editor, [i]);
        if (
          SlateElement.isElement(node) &&
          (node as any).type === 'event-line' &&
          (node as any).mode === 'title'
        ) {
          return node as unknown as EventLineNode;
        }
      } catch (e) {
        // 节点不存在，继续向上查找
      }
    }
    
    return null;
  }, [editor]);
  
  /**
   * 找到指定层级的父事件（用于 Shift+Tab 键查找新父事件）
   * 🔥 修复逻辑：新父事件应该是当前父事件的父事件（祖父事件），而非向上第一个同级事件
   */
  const findParentEventLineAtLevel = useCallback((currentPath: Path, targetLevel: number): EventLineNode | null => {
    const currentIndex = currentPath[0];
    
    // 🔍 获取当前事件的父事件 ID
    const [currentNode] = Editor.node(editor, currentPath);
    const currentEventLine = currentNode as unknown as EventLineNode;
    const currentParentId = currentEventLine.metadata?.parentEventId;
    
    if (!currentParentId) {
      // 当前事件已经是根事件，Shift+Tab 后仍为根事件
      return null;
    }
    
    // 🔍 向上查找当前父事件节点
    let parentEventLine: EventLineNode | null = null;
    for (let i = currentIndex - 1; i >= 0; i--) {
      try {
        const [node] = Editor.node(editor, [i]);
        const eventLine = node as unknown as EventLineNode;
        if (eventLine.type === 'event-line' && 
            eventLine.mode === 'title' && 
            eventLine.eventId === currentParentId) {
          parentEventLine = eventLine;
          break;
        }
      } catch (e) {
        // 节点不存在，继续向上查找
      }
    }
    
    if (!parentEventLine) {
      // 未找到当前父事件（数据不一致），变为根事件
      console.warn('[Shift+Tab] ⚠️ Parent event not found in editor, setting to root');
      return null;
    }
    
    // 🔥 新父事件 = 当前父事件的父事件（祖父事件）
    const newParentId = parentEventLine.metadata?.parentEventId;
    
    if (!newParentId) {
      // 当前父事件是根事件，降级后也变为根事件
      return null;
    }
    
    // 🔍 向上查找祖父事件节点
    for (let i = currentIndex - 1; i >= 0; i--) {
      try {
        const [node] = Editor.node(editor, [i]);
        const eventLine = node as unknown as EventLineNode;
        if (eventLine.type === 'event-line' && 
            eventLine.mode === 'title' && 
            eventLine.eventId === newParentId) {
          return eventLine;
        }
      } catch (e) {
        // 节点不存在，继续向上查找
      }
    }
    
    // 未找到祖父事件（数据不一致），变为根事件
    console.warn('[Shift+Tab] ⚠️ Grandparent event not found in editor, setting to root');
    return null;
  }, [editor]);
  
  // ==================== 键盘事件处理 ====================
  
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const { selection } = editor;

    // IME 组字时，部分浏览器会先发 keyCode=229 / key='Process'
    // 若此时做结构变更（例如 placeholder 转换），可能导致“第一个字被吃掉”
    const isImeComposingKey = (event as any).keyCode === 229 || event.key === 'Process';
    
    // 🔍 记录所有键盘事件
    if (!event.nativeEvent?.isComposing && !isImeComposingKey) {
      logKeyDown(event, editor);
    }
    
    if (!selection) return;
    
    // IME 组字中，不处理快捷键
    if (event.nativeEvent?.isComposing || isImeComposingKey) return;
    
    // 🎯 空格键触发 Bullet 自动检测
    // 🔥 严谨修复：拦截式（不让空格上屏再“擦屁股”）
    if (event.key === ' ') {
      // 同步检测触发字符（光标前的字符）
      const trigger = detectBulletTrigger(editor);
      if (trigger) {
        console.log('[PlanSlate] 🎯 检测到 Bullet 触发字符:', trigger);
        // 阻止空格上屏
        event.preventDefault();
        // 同步转换为 bullet
        applyBulletAutoConvert(editor, trigger);
        return;
      }
    }
    
    // 🆕 @提及激活时，拦截 Enter 和 Escape 键
    console.log('[@ Mention DEBUG] handleKeyDown:', { 
      key: event.key, 
      showMentionPicker: session.mention.isOpen,
      mentionInitialStart: session.mention.initialStart ? formatTimeForStorage(session.mention.initialStart) : undefined,
      mentionInitialEnd: session.mention.initialEnd ? formatTimeForStorage(session.mention.initialEnd) : undefined
    });
    
    if (session.mention.isOpen) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        console.log('[@ Mention] Enter 键被拦截，触发选择');
        // 直接调用 handleMentionSelect，使用当前解析的时间
        if (session.mention.initialStart) {
          handleMentionSelect(
            formatTimeForStorage(session.mention.initialStart),
            session.mention.initialEnd ? formatTimeForStorage(session.mention.initialEnd) : undefined
          );
        }
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleMentionClose();
        return;
      }
      // 其他键让用户继续输入，实时更新解析结果
    }
    
    // 🆕 让数字键 1-9 和 Escape 冒泡到外层（用于 FloatingBar 交互）
    // 不 preventDefault，让这些键传递到 document 层的监听器
    if (/^[1-9]$/.test(event.key) || event.key === 'Escape') {
      return; // 不处理，让事件冒泡
    }
    
    // 🆕 Shift+Alt+↑/↓ - 移动标题或 eventlog 段落
    if (event.shiftKey && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      
      const match = Editor.above(editor, {
        match: n => (n as any).type === 'event-line',
      });
      
      if (!match) return;
      const [currentNode, currentPath] = match;
      const eventLine = currentNode as unknown as EventLineNode;
      
      const direction = event.key === 'ArrowUp' ? 'up' : 'down';
      
      // 根据 mode 决定移动逻辑
      if (eventLine.mode === 'title') {
        // 标题行：移动整个事件（标题 + 所有 eventlog）
        moveTitleWithEventlogs(editor, currentPath[0], direction);
      } else {
        // Eventlog 行：只移动当前段落
        moveEventlogParagraph(editor, currentPath[0], direction);
      }
      
      return;
    }
    
    // 获取当前 event-line 节点和路径
    const match = Editor.above(editor, {
      match: n => (n as any).type === 'event-line',
    });
    
    if (!match) return;
    const [currentNode, currentPath] = match;
    const eventLine = currentNode as unknown as EventLineNode;
    
    // 🆕 v1.8: 如果在 placeholder 行，将其转换成真实事件
    if ((eventLine.metadata as any)?.isPlaceholder || eventLine.eventId === '__placeholder__') {
      // 🔥 FIX: 允许导航键离开 placeholder（ArrowUp 回到上一行）
      // 但阻止 ArrowDown 进入 placeholder（已在后面处理）
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // 允许向上、向左、向右导航离开 placeholder
        return;
      }
      
      if (event.key === 'Escape') {
        event.preventDefault();
        return;
      }
      
      // ArrowDown 保持拦截（避免进入更下方的 placeholder）
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        return;
      }
      
      // 🔥 Tab键：先转换成真实事件，然后继续执行缩进逻辑
      if (event.key === 'Tab') {
        const newEventId = generateEventId();
        
        Transforms.setNodes(editor, {
          eventId: newEventId,
          lineId: newEventId,
          metadata: {
            ...(eventLine.metadata || {}),
            isPlaceholder: undefined, // 移除placeholder标记
          }
        } as any, { at: currentPath });
        
        logOperation('Placeholder转换成真实事件（Tab缩进）', { 
          oldEventId: eventLine.eventId,
          newEventId,
          key: event.key 
        });
        
        // 继续执行Tab缩进逻辑（不return）
      } else {
        // 🔧 IME 组字的首个 keydown（229/Process）不做结构变更，避免吃首字
        if (isImeComposingKey) {
          return;
        }

        // 其他按键：用户开始输入，将placeholder转换成真实事件
        const newEventId = generateEventId();
        
        Transforms.setNodes(editor, {
          eventId: newEventId,
          lineId: newEventId,
          metadata: {
            ...(eventLine.metadata || {}),
            isPlaceholder: undefined, // 移除placeholder标记
          }
        } as any, { at: currentPath });
        
        logOperation('Placeholder转换成真实事件', { 
          oldEventId: eventLine.eventId,
          newEventId,
          key: event.key 
        });
        
        // 让正常的输入处理继续
        return;
      }
    }
    
    // 🆕 Backspace 键 - 在空的 bullet 段落删除 bullet
    if (event.key === 'Backspace') {
      try {
        const [paragraphNode] = Editor.nodes(editor, {
          match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
        });
        
        if (paragraphNode) {
          const [node, path] = paragraphNode;
          const para = node as any;
          
          // 如果段落有 bullet 且内容为空（只有一个空文本节点）
          if (para.bullet && para.children.length === 1) {
            const textNode = para.children[0];
            if (textNode.text === '' || (selection?.anchor.offset === 0 && selection?.focus.offset === 0)) {
              event.preventDefault();
              // 移除 bullet 属性
              Transforms.setNodes(editor, { bullet: undefined, bulletLevel: undefined } as any, {
                at: path,
              });
              return;
            }
          }
        }
      } catch (e) {
        // 忽略错误，继续默认行为
      }
    }
    
    // Enter 键 - 创建新的 EventLine 或 Eventlog 行
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      
      // 🔥 立即保存当前内容
      flushPendingChanges();
      
      // 🔧 获取当前光标位置的文本内容
      const { selection } = editor;
      let textAfterCursor = '';
      let textBeforeCursor = '';
      
      if (selection) {
        try {
          // 获取当前段落节点
          const [paragraphNode, paragraphPath] = Editor.node(editor, selection.anchor.path.slice(0, -1));
          const paragraphText = Node.string(paragraphNode);
          const cursorOffset = selection.anchor.offset;
          
          // 分割文本
          textBeforeCursor = paragraphText.substring(0, cursorOffset);
          textAfterCursor = paragraphText.substring(cursorOffset);
          
          console.log('[Enter] 文本分割:', { textBeforeCursor, textAfterCursor, cursorOffset });
        } catch (e) {
          console.warn('[Enter] 获取文本失败:', e);
        }
      }
      
      let insertIndex = currentPath[0] + 1;
      let newLine: EventLineNode;
      
      // 🆕 如果当前是 eventlog 行，继续创建 eventlog 行（同一个 eventId）
      if (eventLine.mode === 'eventlog') {
        // 🆕 检查当前段落是否有 bullet 属性
        let paragraphProps: any = {};
        try {
          const [paragraphNode] = Editor.nodes(editor, {
            match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
          });
          if (paragraphNode) {
            const para = paragraphNode[0] as any;
            if (para.bullet) {
              paragraphProps = { bullet: true, bulletLevel: para.bulletLevel || 0 };
            }
          }
        } catch (e) {
          // 忽略错误
        }
        
        newLine = {
          type: 'event-line',
          eventId: eventLine.eventId, // 🔧 共享同一个 eventId
          lineId: `${eventLine.lineId}-${Date.now()}`, // 生成唯一 lineId
          level: eventLine.level,
          mode: 'eventlog',
          children: [{ type: 'paragraph', ...paragraphProps, children: [{ text: textAfterCursor }] }], // 🔧 使用光标后的文字
          metadata: eventLine.metadata, // 继承 metadata
        };
        
        // 🔧 删除当前行光标后的文字
        if (textAfterCursor && selection) {
          try {
            Transforms.delete(editor, {
              at: {
                anchor: selection.anchor,
                focus: Editor.end(editor, selection.anchor.path.slice(0, -1))
              }
            });
          } catch (e) {
            console.warn('[Enter] 删除光标后文字失败:', e);
          }
        }
        
        logOperation('Enter (eventlog) - 创建新 eventlog 行', {
          currentLine: currentPath[0],
          eventId: eventLine.eventId,
          newLineId: newLine.lineId.slice(-10) + '...',
          textAfterCursor: textAfterCursor.substring(0, 20) + (textAfterCursor.length > 20 ? '...' : ''),
        }, 'background: #9C27B0; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;');
      } else {
        // Title 行：查找所有属于同一个 eventId 的 eventlog 行，在最后一个之后插入
        const baseEventId = eventLine.eventId;
        
        // ✅ P0修复：使用editor.children代替value
        const currentChildren = editor.children as EventLineNode[];
        
        // 查找所有 eventlog 行（lineId 包含 '-desc' 的都是同一个 event 的 eventlog）
        let lastEventlogIndex = currentPath[0];
        try {
          for (let i = currentPath[0] + 1; i < currentChildren.length; i++) {
            const nextNode = currentChildren[i];
            if (nextNode.type === 'event-line') {
              // 检查是否属于同一个 event 的 eventlog 行
              // eventlog 行的 eventId 格式: "abc" 或 lineId 格式: "abc-desc", "abc-desc-1234"
              const isEventlogOfSameEvent = 
                nextNode.mode === 'eventlog' && 
                (nextNode.eventId === baseEventId || 
                 nextNode.lineId?.startsWith(`${baseEventId}-desc`));
              
              if (isEventlogOfSameEvent) {
                // 找到属于同一个 event 的 eventlog 行
                lastEventlogIndex = i;
              } else {
                // 遇到其他 event 的行，停止查找
                break;
              }
            }
          }
        } catch (e) {
          console.warn('[Enter] 查找 eventlog 行失败:', e);
        }
        
        // 新行插入在最后一个 eventlog 行之后
        insertIndex = lastEventlogIndex + 1;
        
        logOperation('Enter (title) - 创建新 event', {
          currentLine: currentPath[0],
          lastEventlogIndex,
          insertIndex,
          eventId: baseEventId,
        }, 'background: #2196F3; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;');
        
        // 创建新的 title 行（新 event）
        // 🆕 v2.16: 计算新行的 position（在同级事件中的位置）
        const currentLevel = eventLine.level || 0;
        
        // 🔧 FIX: 根据 level 查找正确的父事件（不能直接复制 metadata.parentEventId）
        // 新行与当前行同级，所以父事件也应该相同
        // 但要确保父事件是真实存在的（向上查找 level-1 的最近事件）
        let parentEventId = eventLine.metadata?.parentEventId;
        
        if (currentLevel > 0) {
          // 向上查找 level-1 的最近事件作为父事件
          for (let i = currentPath[0] - 1; i >= 0; i--) {
            const prevNode = currentChildren[i];
            if (prevNode.type === 'event-line' && prevNode.mode === 'title') {
              const prevLevel = prevNode.level || 0;
              if (prevLevel === currentLevel - 1) {
                parentEventId = prevNode.eventId;
                console.log('[Enter] 🔍 找到父事件:', {
                  currentLevel,
                  parentLevel: prevLevel,
                  parentEventId: parentEventId?.slice(-8),
                  searchedLines: currentPath[0] - i
                });
                break;
              }
            }
          }
        } else {
          // 顶层事件，没有父事件
          parentEventId = undefined;
        }
        
        // 获取所有同级事件
        const allTitleNodes = Array.from(Editor.nodes(editor, {
          at: [],
          match: n => !Editor.isEditor(n) && (n as any).type === 'event-line' && (n as any).mode === 'title'
        }));
        
        const siblings = allTitleNodes.filter(([node, path]) => {
          const n = node as any;
          return (n.level || 0) === currentLevel &&
                 (n.metadata?.parentEventId || undefined) === parentEventId;
        });
        
        // 新行插入在当前行之后，找到当前位置和下一个同级的 position
        const currentSibling = siblings.find(([node, path]) => (path as number[])[0] === currentPath[0]);
        const currentSiblingIndex = currentSibling ? siblings.indexOf(currentSibling) : -1;
        const nextSibling = currentSiblingIndex >= 0 ? siblings[currentSiblingIndex + 1] : undefined;
        
        const beforePos = (eventLine.metadata?.position) || undefined;
        const afterPos = nextSibling ? ((nextSibling[0] as any).metadata?.position || undefined) : undefined;
        const newPosition = beforePos !== undefined && afterPos !== undefined 
          ? (beforePos + afterPos) / 2 
          : beforePos !== undefined 
            ? beforePos + 1000 
            : 1000;
        
        // 🆕 v2.16: createEmptyEventLine 现在接受 parentEventId 和 position 参数
        newLine = createEmptyEventLine(currentLevel, parentEventId, newPosition);
        
        // 🔧 将光标后的文字添加到新行
        if (textAfterCursor) {
          newLine.children = [{ type: 'paragraph', children: [{ text: textAfterCursor }] }];
        }
        
        // 🔧 删除当前行光标后的文字
        if (textAfterCursor && selection) {
          try {
            Transforms.delete(editor, {
              at: {
                anchor: selection.anchor,
                focus: Editor.end(editor, selection.anchor.path.slice(0, -1))
              }
            });
          } catch (e) {
            console.warn('[Enter] 删除光标后文字失败:', e);
          }
        }
        
        console.log('[🆕 Position] 创建新事件:', {
          eventId: newLine.eventId.slice(-8),
          level: currentLevel,
          parentEventId: parentEventId?.slice(-8),
          position: newPosition,
          metadata_position: newLine.metadata?.position,
          确认position存入metadata: newLine.metadata?.position === newPosition,
          textAfterCursor: textAfterCursor.substring(0, 20) + (textAfterCursor.length > 20 ? '...' : ''),
          afterPos,
          newPosition,
          siblingsCount: siblings.length
        });
        
        logOperation('Enter (title) - 创建新 title 行', {
          currentLine: currentPath[0],
          insertIndex,
          newLineId: newLine.lineId.slice(-10) + '...',
        }, 'background: #4CAF50; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;');
      }
      
      if (isDebugEnabled()) {
        window.console.log('创建新行:', {
          insertIndex,
          newLineId: newLine.lineId.slice(-10),
          inheritedLevel: newLine.level,
          mode: newLine.mode,
        });
      }
      
      Transforms.insertNodes(editor, newLine as unknown as Node, {
        at: [insertIndex],
      });
      
      // 🔧 直接选中新行的开始位置，不使用 safeFocusEditor
      try {
        if (isDebugEnabled()) {
          window.console.log('设置光标到新行:', { path: [insertIndex, 0, 0] });
        }
        
        Transforms.select(editor, {
          anchor: { path: [insertIndex, 0, 0], offset: 0 },
          focus: { path: [insertIndex, 0, 0], offset: 0 },
        });
        
        if (isDebugEnabled()) {
          window.console.log('光标设置后位置:', editor.selection);
          window.console.groupEnd();
        }
      } catch (err) {
        if (isDebugEnabled()) {
          window.console.error('设置光标失败:', err);
          window.console.groupEnd();
        }
      }
      
      return;
    }
    
    // Shift+Enter - 切换 Eventlog 模式
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      
      if (eventLine.mode === 'title') {
        // 🔧 创建 Eventlog 行，继承标题行的 metadata（包含 checkType 等信息）
        const descLine: EventLineNode = {
          type: 'event-line',
          eventId: eventLine.eventId,
          lineId: `${eventLine.lineId}-desc`,
          level: eventLine.level,
          mode: 'eventlog',
          metadata: eventLine.metadata, // 🔧 继承 metadata，确保 eventlog 能正确计算占位符宽度
          children: [{ type: 'paragraph', children: [{ text: '' }] }],
        };
        
        console.log('[Shift+Enter] 创建 eventlog 行:', {
          titleEventId: eventLine.eventId?.slice(-8),
          titleLineId: eventLine.lineId,
          newEventlogLineId: descLine.lineId,
          titleLevel: eventLine.level,
          eventlogLevel: descLine.level,
          hasMetadata: !!descLine.metadata,
          checkType: descLine.metadata?.checkType
        });
        
        Transforms.insertNodes(editor, descLine as unknown as Node, {
          at: [currentPath[0] + 1],
        });
        
        // 聚焦新创建的 Eventlog 行（使用安全方法）
        safeFocusEditor(editor, [currentPath[0] + 1, 0, 0]);
      } else {
        // Description -> Title: 转换当前行
        Transforms.setNodes(
          editor,
          { mode: 'title' } as unknown as Partial<Node>,
          { at: currentPath }
        );
      }
      return;
    }
    
    // Tab 键 - 区分两种情况：bullet缩进 vs event层级变化
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      
      // 🔍 检查当前光标是否在 bullet paragraph 内
      const { selection } = editor;
      let isInBulletParagraph = false;
      let currentParagraphPath: Path | null = null;
      
      if (selection) {
        try {
          const [paragraphNode, paragraphPath] = Editor.node(editor, selection.anchor.path.slice(0, -1));
          if (SlateElement.isElement(paragraphNode) && (paragraphNode as any).type === 'paragraph') {
            if ((paragraphNode as any).bullet === true) {
              isInBulletParagraph = true;
              currentParagraphPath = paragraphPath;
            }
          }
        } catch (e) {
          // 忽略错误
        }
      }
      
      // 🔧 情况1: 在 bullet paragraph 内 → 增加 bulletLevel
      if (isInBulletParagraph && currentParagraphPath && eventLine.mode === 'eventlog') {
        const paragraphNode = Node.get(editor, currentParagraphPath) as any;
        const currentBulletLevel = paragraphNode.bulletLevel || 0;
        const newBulletLevel = Math.min(currentBulletLevel + 1, 4); // 最大4级
        
        console.log('[Tab] 🎯 Bullet indent:', {
          mode: 'eventlog',
          currentBulletLevel,
          newBulletLevel,
          paragraphPath: currentParagraphPath
        });
        
        Transforms.setNodes(
          editor,
          { bulletLevel: newBulletLevel } as any,
          { at: currentParagraphPath }
        );
        
        return;
      }
      
      // 🔧 情况2: 在 title 行或非 bullet 内容 → 改变 event line 层级
      console.log('[Tab] 🎯 Event line indent (create parent-child relationship)');
      
      // 🎯 步骤 1: 找到上一行（潜在父事件）
      const previousEventLine = findPreviousEventLine(currentPath);
        
        if (!previousEventLine || !previousEventLine.eventId) {
          console.warn('[Tab] ⚠️ No previous event line, cannot indent');
          return;
        }
      
        let currentEventId = eventLine.eventId;
        if (!currentEventId) {
          console.warn('[Tab] ⚠️ Current event has no eventId, cannot create relationship');
          return;
        }
        
        // 🔥 v2.15: 详细调试 - 检查当前行和上一行的完整信息
        console.log('[Tab] 🔍 Current line info:', {
          eventId: currentEventId,
          lineId: eventLine.lineId,
          level: eventLine.level,
          mode: eventLine.mode,
          metadata: eventLine.metadata,
          isTempId: currentEventId.startsWith('line-'),
          isRealId: currentEventId.startsWith('event_')
        });
        
        const previousEventId = previousEventLine.eventId;
        const previousLevel = previousEventLine.level || 0;
        const newBulletLevel = previousLevel + 1;
        
        // 🔍 调试：打印详细的行信息
        console.log('[Tab] 📋 Parent-Child relationship details:', {
          current: {
            id: currentEventId,
            idSuffix: currentEventId.slice(-8),
            currentLevel: eventLine.level || 0,
            newLevel: newBulletLevel,
            path: currentPath
          },
          parent: {
            id: previousEventId,
            idSuffix: previousEventId.slice(-8),
            level: previousLevel,
            isTemp: previousEventId.startsWith('line-')
          }
        });
        
        // 🎯 步骤 2: 检查层级限制
        if (newBulletLevel > 5) {
          console.warn('[Tab] ⚠️ Max bullet level (5) reached');
          return;
        }
        
        // 🔧 使用 EventTreeAPI.reparent 实现Tab缩进
        const executeTabIndent = async (
          currentEventId: string,
          previousEventId: string,
          newBulletLevel: number,
          currentPath: Path,
          oldLevel: number
        ) => {
          try {
            // ⚡ Step 1: 乐观更新 Slate Editor 状态
            Editor.withoutNormalizing(editor, () => {
              console.log('[Tab] 🔥 Updating Slate metadata (optimistic):', {
                currentEventId: currentEventId.slice(-8),
                previousEventId: previousEventId.slice(-8),
                oldLevel,
                newLevel: newBulletLevel
              });
              
              // 更新层级
              setEventLineLevel(editor, currentPath, newBulletLevel);
              
              // 更新parentEventId
              const currentNode = Node.get(editor, currentPath) as EventLineNode;
              Transforms.setNodes(
                editor,
                { 
                  metadata: {
                    ...currentNode.metadata,
                    parentEventId: previousEventId,
                  }
                } as unknown as Partial<Node>,
                { at: currentPath }
              );
              
              // 更新子段落的bulletLevel
              try {
                const paragraphs = Array.from(Node.children(editor, currentPath));
                paragraphs.forEach(([para, paraPath], index) => {
                  if (SlateElement.isElement(para) && (para as any).bullet) {
                    const oldBulletLevel = (para as any).bulletLevel || 0;
                    Transforms.setNodes(
                      editor,
                      { bulletLevel: oldBulletLevel } as any,
                      { at: [...currentPath, index] }
                    );
                  }
                });
              } catch (e) {
                console.warn('[Tab] 更新段落bulletLevel失败:', e);
              }
            });
            
            console.log('[Tab] ⚡ Optimistic update complete');
            
            // ✅ Step 2: 使用 EventTreeAPI.reparent 计算影响范围
            const allEvents = await EventService.getAllEvents();
            const currentEvent = allEvents.find(e => e.id === currentEventId);
            const oldParentId = currentEvent?.parentEventId;
            
            const reparentResult = EventTreeAPI.reparent({
              nodeId: currentEventId,
              oldParentId: oldParentId,
              newParentId: previousEventId,
              newPosition: 0,
            }, allEvents);
            
            console.log('[Tab] 📊 Reparent result:', {
              nodesToUpdate: reparentResult.nodesToUpdate.length,
              affectedParents: reparentResult.affectedParents,
              affectedSubtree: reparentResult.affectedSubtree.length
            });
            
            // ✅ Step 3: 批量更新数据库（父子关系）
            await EventHub.batchUpdate(reparentResult.nodesToUpdate, {
              source: 'PlanSlate/Tab',
              skipSync: false
            });
            
            // ✅ v2.20.1: bulletLevel 自动派生，无需手动更新
            // bulletLevel 会在下次 items 变化时通过 useMemo 自动重算
            // 性能提升：从 2 次批量更新减少到 1 次
            
            console.log('[Tab] ✅ Persisted parent-child relationship (bulletLevel will auto-derive)');
            
            // ✅ Step 6: 立即刷新debounce
            flushPendingChanges(editor.children);
            
          } catch (error) {
            console.error('[Tab] ❌ Failed to persist:', error);
            
            // 🔄 回滚Slate状态
            Editor.withoutNormalizing(editor, () => {
              setEventLineLevel(editor, currentPath, oldLevel);
              const currentNode = Node.get(editor, currentPath) as EventLineNode;
              const oldParentId = currentNode.metadata?.parentEventId;
              Transforms.setNodes(
                editor,
                { 
                  metadata: {
                    ...currentNode.metadata,
                    parentEventId: oldParentId,
                  }
                } as unknown as Partial<Node>,
                { at: currentPath }
              );
            });
            
            console.warn('[Tab] 🔄 Rollback optimistic update');
          }
        };
        
        // 🆕 v2.16: 池化ID系统 - 所有事件都使用真实ID
        // createEmptyEventLine 已经从池中分配了真实ID，无需检测临时ID
        
        // 真实 ID，直接执行
        console.log('[Tab] 🎯 Creating parent-child relationship:', {
          child: currentEventId.slice(-8),
          parent: previousEventId.slice(-8),
          oldLevel: eventLine.level,
          newLevel: newBulletLevel
        });
        
      // 使用立即执行异步函数
      executeTabIndent(currentEventId, previousEventId, newBulletLevel, currentPath, eventLine.level || 0);
      
      return;
    }
    
    // 🔧 使用 EventTreeAPI.reparent 实现Shift+Tab解缩进
    const executeShiftTabOutdent = async (
      currentEventId: string,
      newParentEventId: string | undefined,
      newLevel: number,
      currentPath: Path,
      oldLevel: number
    ) => {
      try {
        // ⚡ Step 1: 乐观更新 Slate Editor 状态
        Editor.withoutNormalizing(editor, () => {
          console.log('[Shift+Tab] 🔥 Updating Slate metadata (optimistic):', {
            currentEventId: currentEventId.slice(-8),
            newParentEventId: newParentEventId?.slice(-8) || 'ROOT',
            oldLevel,
            newLevel
          });
          
          // 更新层级
          setEventLineLevel(editor, currentPath, newLevel);
          
          // 更新parentEventId
          const finalNode = Node.get(editor, currentPath) as EventLineNode;
          Transforms.setNodes(
            editor,
            { 
              metadata: {
                ...finalNode.metadata,
                parentEventId: newParentEventId,
              }
            } as unknown as Partial<Node>,
            { at: currentPath }
          );
          
          // 更新子段落的bulletLevel
          try {
            const paragraphs = Array.from(Node.children(editor, currentPath));
            paragraphs.forEach(([para, paraPath], index) => {
              if (SlateElement.isElement(para) && (para as any).bullet) {
                const oldBulletLevel = (para as any).bulletLevel || 0;
                Transforms.setNodes(
                  editor,
                  { bulletLevel: oldBulletLevel } as any,
                  { at: [...currentPath, index] }
                );
              }
            });
          } catch (e) {
            console.warn('[Shift+Tab] 更新段落bulletLevel失败:', e);
          }
        });
        
        console.log('[Shift+Tab] ⚡ Optimistic update complete');
        
        // ✅ Step 2: 使用 EventTreeAPI.reparent 计算影响范围
        const allEvents = await EventService.getAllEvents();
        const currentEvent = allEvents.find(e => e.id === currentEventId);
        const oldParentId = currentEvent?.parentEventId;
        
        // 计算新的position
        const allTitleNodes = Array.from(Editor.nodes(editor, {
          at: [],
          match: n => !Editor.isEditor(n) && (n as any).type === 'event-line' && (n as any).mode === 'title'
        }));
        
        const currentIndex = currentPath[0];
        const newSiblings = allTitleNodes.filter(([node, path]) => {
          const n = node as any;
          const idx = (path as number[])[0];
          return idx !== currentIndex &&
            (n.level || 0) === newLevel &&
            (n.metadata?.parentEventId || undefined) === newParentEventId;
        });
        
        const siblingBefore = newSiblings.filter(([node, path]) => (path as number[])[0] < currentIndex).pop();
        const siblingAfter = newSiblings.find(([node, path]) => (path as number[])[0] > currentIndex);
        const beforePos = siblingBefore ? (siblingBefore[0] as any).metadata?.position : undefined;
        const afterPos = siblingAfter ? (siblingAfter[0] as any).metadata?.position : undefined;
        const newPosition = calculatePositionBetween(beforePos, afterPos);
        
        const reparentResult = EventTreeAPI.reparent({
          nodeId: currentEventId,
          oldParentId: oldParentId,
          newParentId: newParentEventId,
          newPosition: newPosition,
        }, allEvents);
        
        console.log('[Shift+Tab] 📊 Reparent result:', {
          nodesToUpdate: reparentResult.nodesToUpdate.length,
          affectedParents: reparentResult.affectedParents,
          affectedSubtree: reparentResult.affectedSubtree.length,
          newPosition
        });
        
        // ✅ Step 3: 批量更新数据库（父子关系）
        await EventHub.batchUpdate(reparentResult.nodesToUpdate, {
          source: 'PlanSlate/Shift+Tab',
          skipSync: false
        });
        
        // ✅ v2.20.1: bulletLevel 自动派生，无需手动更新
        // bulletLevel 会在下次 items 变化时通过 useMemo 自动重算
        // 性能提升：从 2 次批量更新减少到 1 次
        
        console.log('[Shift+Tab] ✅ Persisted parent-child relationship (bulletLevel will auto-derive)');
        
      } catch (error) {
        console.error('[Shift+Tab] ❌ Failed to persist:', error);
        
        // 🔄 回滚Slate状态
        Editor.withoutNormalizing(editor, () => {
          setEventLineLevel(editor, currentPath, oldLevel);
          const currentNode = Node.get(editor, currentPath) as EventLineNode;
          const oldParentId = currentNode.metadata?.parentEventId;
          Transforms.setNodes(
            editor,
            { 
              metadata: {
                ...currentNode.metadata,
                parentEventId: oldParentId,
              }
            } as unknown as Partial<Node>,
            { at: currentPath }
          );
        });
        
        console.warn('[Shift+Tab] 🔄 Rollback optimistic update');
      }
    };

    // Shift+Tab - 解除父子关系（乐观更新 + 异步持久化）
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      
      // 🔍 检查当前光标是否在 bullet paragraph 内
      const { selection } = editor;
      let isInBulletParagraph = false;
      let currentParagraphPath: Path | null = null;
      
      if (selection) {
        try {
          const [paragraphNode, paragraphPath] = Editor.node(editor, selection.anchor.path.slice(0, -1));
          if (SlateElement.isElement(paragraphNode) && (paragraphNode as any).type === 'paragraph') {
            if ((paragraphNode as any).bullet === true) {
              isInBulletParagraph = true;
              currentParagraphPath = paragraphPath;
            }
          }
        } catch (e) {
          // 忽略错误
        }
      }
      
      // 🔧 情况1: 在 bullet paragraph 内 → 减少 bulletLevel
      if (isInBulletParagraph && currentParagraphPath && eventLine.mode === 'eventlog') {
        const paragraphNode = Node.get(editor, currentParagraphPath) as any;
        const currentBulletLevel = paragraphNode.bulletLevel || 0;
        
        if (currentBulletLevel === 0) {
          // 已经是最小层级，移除bullet
          console.log('[Shift+Tab] 🎯 Remove bullet (bulletLevel = 0)');
          
          Transforms.setNodes(
            editor,
            { bullet: undefined, bulletLevel: undefined } as any,
            { at: currentParagraphPath }
          );
        } else {
          const newBulletLevel = currentBulletLevel - 1;
          
          console.log('[Shift+Tab] 🎯 Bullet outdent:', {
            mode: 'eventlog',
            currentBulletLevel,
            newBulletLevel,
            paragraphPath: currentParagraphPath
          });
          
          Transforms.setNodes(
            editor,
            { bulletLevel: newBulletLevel } as any,
            { at: currentParagraphPath }
          );
        }
        
        return;
      }
      
      // 🔧 情况2: 在eventlog的非bullet内容 → 转换为新的独立event（新eventId）
      if (eventLine.mode === 'eventlog') {
        console.log('[Shift+Tab] 🎯 Convert eventlog to new title (new eventId)');
        
        // 创建新的event（与当前行同级，继承父事件关系）
        // 🆕 v2.17: 直接使用 UUID 生成
        const newEventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newLineId = `${newEventId}-title`;
        const currentLevel = eventLine.level || 0;
        const parentEventId = eventLine.metadata?.parentEventId;
        
        // 计算position（在同级事件中的位置）
        const allTitleNodes = Array.from(Editor.nodes(editor, {
          at: [],
          match: n => !Editor.isEditor(n) && (n as any).type === 'event-line' && (n as any).mode === 'title'
        }));
        
        const siblings = allTitleNodes.filter(([node, path]) => {
          const n = node as any;
          return (n.level || 0) === currentLevel &&
                 (n.metadata?.parentEventId || undefined) === parentEventId;
        });
        
        // 新event插入在当前行之后
        const nextSibling = siblings.find(([node, path]) => (path as number[])[0] > currentPath[0]);
        const currentSibling = siblings.filter(([node, path]) => (path as number[])[0] < currentPath[0]).pop();
        
        const beforePos = currentSibling ? (currentSibling[0] as any).metadata?.position : undefined;
        const afterPos = nextSibling ? (nextSibling[0] as any).metadata?.position : undefined;
        const newPosition = beforePos !== undefined && afterPos !== undefined 
          ? (beforePos + afterPos) / 2 
          : beforePos !== undefined 
            ? beforePos + 1000 
            : 1000;
        
        // 转换当前行为新的title行
        Transforms.setNodes(
          editor,
          { 
            mode: 'title',
            eventId: newEventId,
            lineId: newLineId,
            level: currentLevel,
            metadata: {
              ...eventLine.metadata,
              parentEventId: parentEventId,
              position: newPosition,
              checkType: eventLine.metadata?.checkType || 'once',
            }
          } as unknown as Partial<Node>,
          { at: currentPath }
        );
        
        console.log('[Shift+Tab] ✅ Converted to new title:', {
          newEventId: newEventId.slice(-8),
          level: currentLevel,
          parentEventId: parentEventId?.slice(-8),
          position: newPosition
        });
        
        return;
      }
      
      // 🔧 情况3: 在 title 行 → 改变 event line 层级
      console.log('[Shift+Tab] 🎯 Event line outdent (remove parent-child relationship)');
      
      let currentEventId = eventLine.eventId;
      const currentLevel = eventLine.level || 0;
      
      // Title 模式：减少层级（解除父子关系）
      if (currentLevel === 0) {
        console.warn('[Shift+Tab] ⚠️ Already at root level');
        return;
      }
      
      if (!currentEventId) {
        console.warn('[Shift+Tab] ⚠️ Current event has no eventId');
        return;
      }
      
      const newLevel = currentLevel - 1;
      
      // 🔧 获取当前父事件 ID
      const currentParentId = eventLine.metadata?.parentEventId;
      
      // 🔥 查找新父事件（当前父事件的父事件，即祖父事件）
      const newParentEventLine = findParentEventLineAtLevel(currentPath, newLevel);
      let newParentEventId = newParentEventLine?.eventId || undefined;
      
      // 🆕 v2.17: 详细日志显示父子关系变化
      console.log('[Shift+Tab] 🎯 Decreasing level:', {
        eventId: currentEventId.slice(-8),
        oldLevel: currentLevel,
        newLevel: newLevel,
        oldParentId: currentParentId?.slice(-8) || 'ROOT',
        newParentId: newParentEventId?.slice(-8) || 'ROOT',
        change: `${currentParentId?.slice(-8) || 'ROOT'} → ${newParentEventId?.slice(-8) || 'ROOT'}`
      });
      
      // 使用立即执行异步函数
      executeShiftTabOutdent(currentEventId, newParentEventId, newLevel, currentPath, currentLevel);
      
      return;
    }
    
    // 兼容旧的 bullet 段落处理（保留）
    if (event.key === 'Tab' && event.shiftKey) {
      const [paragraphNode] = Editor.nodes(editor, {
        match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
      });
      
      if (paragraphNode) {
        const [para] = paragraphNode;
        const paragraph = para as any;
        
        if (paragraph.bullet) {
          const currentBulletLevel = paragraph.bulletLevel || 0;
          
          if (currentBulletLevel > 0) {
            // Level 0 再按 Shift+Tab 就取消 bullet
            Transforms.setNodes(editor, { bullet: undefined, bulletLevel: undefined } as any, {
              match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
            });
          }
          
          return;
        }
      }
      
      // 🆕 如果是 eventlog 行，Shift+Tab 转换为 title 行
      if (eventLine.mode === 'eventlog') {
        const newLineId = eventLine.lineId.replace('-desc', ''); // 移除 -desc 后缀
        
        Transforms.setNodes(
          editor,
          { 
            mode: 'title',
            lineId: newLineId, // 🔧 修复：更新 lineId，避免数据写入错误字段
          } as unknown as Partial<Node>,
          { at: currentPath }
        );
        
        return;
      }
      
      // Title 行：减少缩进
      const newLevel = Math.max(eventLine.level - 1, 0);
      
      Transforms.setNodes(
        editor,
        { level: newLevel } as unknown as Partial<Node>,
        { at: currentPath }
      );
      
      return;
    }
    
    // Delete/Backspace - 在行首时删除当前行
    if ((event.key === 'Backspace' || event.key === 'Delete') && Range.isCollapsed(selection)) {
      // 安全检查：确保节点有效
      try {
        const paragraph = eventLine.children[0];
        if (!paragraph) return;
        
        const text = Node.string(paragraph as unknown as Node);
        const startPoint = Editor.start(editor, currentPath);
        
        // ✅ P0修复：使用editor.children代替value
        const currentChildren = editor.children as EventLineNode[];
        
        // 如果内容为空且在行首，删除当前行
        if (!text && Point.equals(selection.anchor, startPoint)) {
          event.preventDefault();
          
          logOperation('Backspace - 删除空行', {
            totalLines: currentChildren.length,
            currentLine: currentPath[0],
            lineId: eventLine.lineId.slice(-10) + '...',
            isLastLine: currentPath[0] === currentChildren.length - 1,
          }, 'background: #f44336; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;');
          
          // 🆕 v1.8: 检查是否是倒数第二行（下一行是 placeholder）
          const isSecondToLast = currentPath[0] === currentChildren.length - 2;
          const nextNode = isSecondToLast ? currentChildren[currentPath[0] + 1] : null;
          const nextIsPlaceholder = nextNode && 
            ((nextNode.metadata as any)?.isPlaceholder || nextNode.eventId === '__placeholder__');
          
          // 🔧 如果只剩下当前行和 placeholder，清空当前行而不删除
          if (currentChildren.length === 2 && nextIsPlaceholder) {
            if (isDebugEnabled()) {
              window.console.log('操作: 清空倒数第二行（最后一个真实行）');
            }
            // 重置为空行
            Transforms.delete(editor, {
              at: {
                anchor: startPoint,
                focus: Editor.end(editor, currentPath),
              },
            });
            return;
          }
          
          // 🔧 修复：如果是最后一行（placeholder），不允许删除
          if ((eventLine.metadata as any)?.isPlaceholder || eventLine.eventId === '__placeholder__') {
            if (isDebugEnabled()) {
              window.console.log('操作: 阻止删除 placeholder 行');
            }
            return;
          }
        
          // 多行时删除当前行
          if (currentChildren.length > 2 || (currentChildren.length > 1 && !nextIsPlaceholder)) {
            if (isDebugEnabled()) {
              window.console.log('操作: 删除当前行');
              window.console.log('删除前光标:', editor.selection);
            }
            
            Transforms.removeNodes(editor, { at: currentPath });
            
            // 🆕 v1.8.4: 删除后自动调整后续 bullet 层级
            adjustBulletLevelsAfterDelete(editor);
            
            // 🆕 v1.8: 如果删除后光标在 placeholder 行，移动到上一行
            // 🔥 使用 requestAnimationFrame 等待 React 渲染完成
            requestAnimationFrame(() => {
              if (editor.selection) {
                const match = Editor.above(editor, {
                  match: n => (n as any).type === 'event-line',
                });
                
                if (match) {
                  const [node, path] = match;
                  const line = node as unknown as EventLineNode;
                  
                  if ((line.metadata as any)?.isPlaceholder || line.eventId === '__placeholder__') {
                    // 光标在 placeholder，移动到上一行末尾
                    if (path[0] > 0) {
                      const prevPath = [path[0] - 1];
                      const prevEnd = Editor.end(editor, prevPath);
                      Transforms.select(editor, prevEnd);
                      
                      if (isDebugEnabled()) {
                        window.console.log('光标从 placeholder 移动到上一行末尾');
                      }
                    }
                  }
                }
              }
            });
            
            if (isDebugEnabled()) {
              window.console.log('删除后光标:', editor.selection);
              window.console.log('删除后总行数:', currentChildren.length - 1);
              window.console.groupEnd();
            }
          }
          return;
        }
      } catch (err) {
        // 如果路径无效，忽略错误
        if (isDebugEnabled()) {
          window.console.warn('Editor.start() 失败，节点可能为空:', err);
        }
      }
    }
    
    // 格式化快捷键
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 'b':
          event.preventDefault();
          Editor.addMark(editor, 'bold', true);
          return;
        case 'i':
          event.preventDefault();
          Editor.addMark(editor, 'italic', true);
          return;
        case 'u':
          event.preventDefault();
          Editor.addMark(editor, 'underline', true);
          return;
      }
    }
    
    // ✅ P0修复：使用editor.children代替value
    const currentChildren = editor.children as EventLineNode[];
    
    // 🆕 v1.8: ArrowDown - 处理 placeholder 行
    if (event.key === 'ArrowDown') {
      // 检查下一行是否是 placeholder
      if (currentPath[0] === currentChildren.length - 2) {
        const nextNode = currentChildren[currentPath[0] + 1];
        if (nextNode && ((nextNode.metadata as any)?.isPlaceholder || nextNode.eventId === '__placeholder__')) {
          // 避免进入 placeholder，保持在当前行末尾
          event.preventDefault();
          const endPoint = Editor.end(editor, currentPath);
          Transforms.select(editor, endPoint);
          return;
        }
      }
    }
  }, [editor, handleMentionSelect, handleMentionClose]);
  
  // ==================== 复制粘贴增强 ====================
  
  const handleCopy = useCallback((event: React.ClipboardEvent) => {
    const { selection } = editor;
    if (!selection) return;
    
    event.preventDefault();
    
    // 获取选中的节点
    const fragment = Editor.fragment(editor, selection);
    
    // 🆕 使用 SlateCore 的 Bullet 剪贴板增强
    const bulletItems = extractBulletItems(editor, fragment);
    if (bulletItems.length > 0) {
      // 如果包含 Bullet 项，使用增强的剪贴板数据
      const clipboardData = generateClipboardData(bulletItems);
      event.clipboardData.setData('text/html', clipboardData['text/html']);
      event.clipboardData.setData('text/plain', clipboardData['text/plain']);
      console.log('📋 复制 Bullet 列表:', bulletItems.length, '个项目');
    } else {
      // 回退到原有逻辑（EventLine 富文本）
      const richHtml = slateNodesToRichHtml(fragment as unknown as EventLineNode[]);
      event.clipboardData.setData('text/html', richHtml);
      event.clipboardData.setData('text/plain', Editor.string(editor, selection));
    }
  }, [editor]);
  
  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    event.preventDefault();
    
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    
    // 🆕 优先尝试解析 Bullet 格式
    let bulletItems = null;
    if (html) {
      bulletItems = parseHTMLBullets(html);
    }
    if (!bulletItems && text) {
      bulletItems = parsePlainTextBullets(text);
    }
    
    if (bulletItems && bulletItems.length > 0) {
      // 插入 Bullet 节点
      const bulletNodes = bulletItems.map(item => ({
        type: 'paragraph',
        bullet: true,
        bulletLevel: item.level,
        children: [{ text: item.text, ...item.marks }],
      }));
      
      const { selection } = editor;
      if (selection) {
        Transforms.insertNodes(editor, bulletNodes as any);
        console.log('📋 粘贴 Bullet 列表:', bulletItems.length, '个项目');
      }
    } else if (html) {
      // 回退到原有逻辑（EventLine HTML）
      const nodes = parseExternalHtml(html);
      const { selection } = editor;
      if (selection) {
        Transforms.insertNodes(editor, nodes as unknown as Node);
      }
    } else if (text) {
      // 纯文本插入
      Transforms.insertText(editor, text);
    }
  }, [editor]);
  
  // ==================== 渲染函数 ====================
  
  // 🆕 v1.8: Placeholder 点击处理 - 在它之前创建新行
  const handlePlaceholderClick = useCallback(() => {
    try {
      // 找到 placeholder 行的路径
      const placeholderPath = editor.children.findIndex(
        (node: any) => node.eventId === '__placeholder__' || node.metadata?.isPlaceholder
      );
      
      if (placeholderPath === -1) return;

      // 🔧 防止重复创建空行：如果 placeholder 上方已经有一个空行，直接聚焦它
      const prevIndex = placeholderPath - 1;
      if (prevIndex >= 0) {
        const prevNode = editor.children[prevIndex] as any;
        const prevIsPlaceholder = (prevNode?.metadata as any)?.isPlaceholder || prevNode?.eventId === '__placeholder__';
        if (!prevIsPlaceholder) {
          const prevText = Node.string(prevNode as unknown as Node);
          if (!prevText || prevText.trim() === '') {
            requestAnimationFrame(() => {
              safeFocusEditor(editor, [prevIndex, 0, 0]);
            });
            logOperation('Placeholder clicked - 复用上方空行（不创建新行）', { prevIndex });
            return;
          }
        }
      }
      
      // 在 placeholder 之前插入新行
      const newLine = createEmptyEventLine(0);
      const insertPath = [placeholderPath];
      
      Transforms.insertNodes(editor, newLine as any, { at: insertPath });
      
      // 聚焦到新行
      // 🔥 使用 requestAnimationFrame 等待 DOM 更新
      requestAnimationFrame(() => {
        safeFocusEditor(editor, insertPath);
      });
      
      logOperation('Placeholder clicked - 创建新行', { insertPath });
    } catch (err) {
      logError('handlePlaceholderClick', err);
    }
  }, [editor]);
  
  const renderElement = useCallback((props: RenderElementProps) => {
    const element = props.element as any;
    
    switch (element.type) {
      case 'event-line':
        const eventLineElement = element as EventLineNode;
        // ✅ 从 eventStatusMap 同步读取状态（替代异步的 getEventStatus）
        const eventStatus = eventStatusMap && eventLineElement.eventId 
          ? eventStatusMap.get(eventLineElement.eventId) 
          : undefined;
        return (
          <EventLineElement
            {...props}
            element={eventLineElement}
            onSave={onSave}
            onTimeClick={onTimeClick}
            onMoreClick={onMoreClick}
            onPlaceholderClick={handlePlaceholderClick}
            eventStatus={eventStatus}
          />
        );
      case 'paragraph':
        const para = element as any;
        if (para.bullet) {
          const level = para.bulletLevel || 0;
          // Bullet paragraph rendering - 使用 CSS ::before 伪元素渲染符号
          return (
            <div className="slate-bullet-paragraph" data-level={level} {...props.attributes}>
              {props.children}
            </div>
          );
        }
        return <div {...props.attributes}>{props.children}</div>;
      case 'tag':
        return <TagElementComponent {...props} />;
      case 'dateMention':
        return <DateMentionElement {...props} />;
      case 'event-mention':
        return (
          <EventMentionElement 
            {...props} 
            element={element}
            onMentionClick={(eventId) => {
              console.log('[PlanSlate] 点击事件 Mention:', eventId);
              // TODO: 实现跳转逻辑（例如滚动到事件位置）
            }}
          />
        );
      default:
        return <div {...props.attributes}>{props.children}</div>;
    }
  }, [onSave, onTimeClick, onMoreClick, handlePlaceholderClick, eventStatusMap]);
  
  const renderLeaf = useCallback((props: RenderLeafProps) => {
    let { children } = props;
    const leaf = props.leaf as TextNode;
    
    // 🆕 检查是否是 @ 提及文本（高亮显示）
    if (session.mention.isOpen && editor.selection) {
      try {
        const { anchor } = editor.selection;
        const [node] = Editor.node(editor, anchor.path);
        
        if (SlateText.isText(node) && node === leaf) {
          const textBeforeCursor = node.text.slice(0, anchor.offset);
          const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
          
          if (atMatch) {
            // 高亮 @ 和后面的文本
            const atStart = anchor.offset - atMatch[0].length;
            const atEnd = anchor.offset;
            const leafText = (leaf as any).text || '';
            
            // 如果当前 leaf 包含 @ 提及部分
            if (atStart >= 0 && atEnd <= leafText.length) {
              const before = leafText.slice(0, atStart);
              const mention = leafText.slice(atStart, atEnd);
              const after = leafText.slice(atEnd);
              
              children = (
                <>
                  {before}
                  <span style={{ 
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#3b82f6',
                    fontWeight: 500,
                    borderRadius: '2px',
                    padding: '0 2px',
                  }}>
                    {mention}
                  </span>
                  {after}
                </>
              );
            }
          }
        }
      } catch (err) {
        // 忽略错误，使用默认渲染
      }
    }
    
    if (leaf.bold) {
      children = <strong>{children}</strong>;
    }
    if (leaf.italic) {
      children = <em>{children}</em>;
    }
    if (leaf.underline) {
      children = <u>{children}</u>;
    }
    if (leaf.strikethrough) {
      children = <s>{children}</s>;
    }
    
    // 🆕 文字颜色和背景色
    const hasColorStyle = leaf.color || leaf.backgroundColor;
    if (hasColorStyle) {
      const style: React.CSSProperties = {};
      if (leaf.color) style.color = leaf.color;
      if (leaf.backgroundColor) style.backgroundColor = leaf.backgroundColor;
      children = <span style={style}>{children}</span>;
    }
    
    return <span {...props.attributes}>{children}</span>;
  }, [session.mention.isOpen, editor]);
  
  // ==================== 渲染 ====================
  
  // 🆕 Gray text placeholder 点击处理
  const handleGrayTextClick = useCallback(() => {
    try {
      // 🔧 确保编辑器有内容
      if (!editor.children || editor.children.length === 0) {
        console.warn('[handleGrayTextClick] Editor is empty');
        return;
      }
      
      // 延迟聚焦，确保 DOM 已更新
      // 🔥 使用 requestAnimationFrame 等待渲染完成
      requestAnimationFrame(() => {
        // 使用安全的焦点设置方法
        safeFocusEditor(editor, [0, 0, 0]);
      });
    } catch (err) {
      console.error('[handleGrayTextClick] Error:', err);
    }
  }, [editor]);
  

  return (
    <SlateErrorBoundary>
      <div 
        ref={editorContainerRef}
        className={`unified-slate-editor ${className}`} 
        style={{ position: 'relative' }}
      >
        {/* 🔧 v1.8: 移除绝对定位的 placeholder，改用最后一行的 renderLinePrefix */}
        
        {/* ✅ P0修复：始终渲染编辑器（至少有 placeholder） */}
        {enhancedValue.length > 0 ? (
          <Slate 
            editor={editor} 
            initialValue={enhancedValue as unknown as Descendant[]} 
            onChange={handleEditorChange}
          >
            <Editable
              renderElement={renderElement}
              renderLeaf={renderLeaf}
              onKeyDown={handleKeyDown}
              onClick={handleClick}
              onCopy={handleCopy}
              onPaste={handlePaste}
              onBlur={() => {
                // 🔥 失焦时立即保存
                flushPendingChanges();
              }}
              placeholder=""
              spellCheck={false}
              className="unified-editable"
            />
            
            {/* 🆕 @提及选择器 - 直接使用 UnifiedDateTimePicker（绝对定位） */}
            {session.mention.isOpen && session.mention.type === 'time' && session.mention.anchor && (
              <div
                style={{
                  position: 'fixed',
                  top: `${session.mention.anchor.style.top}`,
                  left: `${session.mention.anchor.style.left}`,
                  zIndex: 10000,
                }}
              >
                <UnifiedDateTimePicker
                  useTimeHub={true} // 🔧 启用 TimeHub 模式，确保使用 onApplied 回调
                  initialStart={session.mention.initialStart}
                  initialEnd={session.mention.initialEnd}
                  initialText={session.mention.query} // 🔧 传递用户在 @ 后输入的初始文本
                  onSearchChange={handleMentionSearchChange} // 🆕 实时更新解析结果
                  onApplied={handleMentionSelect}
                  onClose={handleMentionClose}
                />
              </div>
            )}
            
            {/* 🔍 Unified Mention 搜索菜单（事件/标签/AI搜索） */}
            {session.search.isOpen && mentionAnchorRef.current && (
              <div
                style={{
                  position: 'fixed',
                  top: mentionAnchorRef.current.style.top || '0px',
                  left: mentionAnchorRef.current.style.left || '0px',
                  zIndex: 10000,
                }}
              >
                <UnifiedMentionMenu
                  query={session.search.query}
                  onSelect={handleSearchSelect}
                  onClose={() => {
                    sessionActions.closeSearch();
                    searchCurrentEventIdRef.current = null;
                  }}
                  context="editor"
                  currentEventId={searchCurrentEventIdRef.current || undefined}
                />
              </div>
            )}
          </Slate>
        ) : (
          <div style={{ padding: '8px 16px', color: '#9ca3af' }}>
            加载中...
          </div>
        )}
      </div>
    </SlateErrorBoundary>
  );
};
