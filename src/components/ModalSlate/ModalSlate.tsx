/**
 * ModalSlate - 轻量化的 Slate 编辑器
 * 
 * 设计目标：
 * - 为 EventEditModal 等单事件编辑场景优化
 * - 移除 PlanManager 特定功能（event-line、多事件管理）
 * - 保留核心编辑功能（FloatingToolbar、timestamp插入、inline elements）
 * - 简化数据流：content string ↔ Slate nodes
 * 
 * 架构差异：
 * PlanSlate: Event[] → PlanItem[] → event-line nodes (多事件管理)
 * ModalSlate:  content string → paragraph nodes (单内容编辑)
 */

import React, { useCallback, useMemo, useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { 
  createEditor, 
  Descendant, 
  Editor, 
  Transforms, 
  Text,
  Node as SlateNode,
  Element as SlateElement,
  Range,
  Path
} from 'slate';
import { 
  Slate, 
  Editable, 
  withReact, 
  ReactEditor,
  RenderElementProps, 
  RenderLeafProps 
} from 'slate-react';
import { withHistory } from 'slate-history';

// ✅ 从 SlateCore 导入共享类型和功能
import type { 
  ParagraphNode,
  TimestampDividerElement as TimestampDividerType,
  TextNode,
  TagNode,
  DateMentionNode,
  EventMentionNode
} from '../SlateCore/types';

import {
  // 服务
  EventLogTimestampService,
  
  // 操作工具
  applyTextFormat as slateApplyTextFormat,
  detectBulletTrigger,
  applyBulletAutoConvert,
  getBulletChar,
  handleBulletBackspace,
  handleBulletEnter,
  extractBulletItems,
  generateClipboardData,
  parsePlainTextBullets,
  parseHTMLBullets,
  moveParagraphUp as slatMoveParagraphUp,
  moveParagraphDown as slateMoveParagraphDown,
  
  // 序列化
  jsonToSlateNodes as slateJsonToNodes,
  slateNodesToJson as slateNodesToJsonCore,
} from '../SlateCore';

// 共享元素组件
import { TagElementComponent } from '../SlateCore/elements/TagElement';
import DateMentionElement from '../SlateCore/elements/DateMentionElement';
import { EventMentionElement } from '../SlateCore/elements/EventMentionElement';
import { TimestampDividerElement } from '../SlateCore/elements/TimestampDividerElement';

// UnifiedMentionMenu
import { UnifiedMentionMenu } from '../UnifiedMentionMenu';
import { MentionItem } from '../../services/search/UnifiedSearchIndex';

// 类型兼容
type CustomElement = ParagraphNode | TagNode | DateMentionNode | EventMentionNode | TimestampDividerType;
type CustomText = TextNode;

// 导入 EventHistoryService 获取创建时间
import { EventHistoryService } from '../../services/EventHistoryService';

// 样式复用 PlanSlate 的样式
import './ModalSlate.css';

/**
 * 格式化日期时间为 "YYYY-MM-DD HH:mm:ss" 格式
 */
function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export interface ModalSlateProps {
  /** Slate JSON 内容 (来自 event.eventlog) */
  content: string;
  
  /** 父事件 ID (用于 timestamp 上下文) */
  parentEventId: string;
  
  /** 内容变化回调 - 返回 Slate JSON 字符串 */
  onChange: (slateJson: string) => void;
  
  /** 是否启用 timestamp 自动插入 */
  enableTimestamp?: boolean;
  
  /** 占位符文本 */
  placeholder?: string;
  
  /** CSS 类名 */
  className?: string;
  
  /** 是否只读 */
  readOnly?: boolean;
  
  /** FloatingBar 容器 ref（可选，用于定位） */
  floatingBarContainerRef?: React.RefObject<HTMLElement>;
}

export interface ModalSlateRef {
  /** Slate Editor 实例 */
  editor: Editor;
  
  /** 应用文本格式化（支持 bullet point） */
  applyTextFormat: (command: string) => boolean;
}

// 转换函数现在从 serialization.ts 导入

/**
 * 创建 timestamp divider 节点
 */
const createTimestampDivider = (timestamp: Date): TimestampDividerType => {
  return {
    type: 'timestamp-divider',
    timestamp: timestamp.toISOString(),
    displayText: timestamp.toLocaleString(),
    children: [{ text: '' }]
  };
};

export const ModalSlate = forwardRef<ModalSlateRef, ModalSlateProps>((
  {
    content,
    parentEventId,
    onChange,
    enableTimestamp = false,
    placeholder = '开始编写...',
    className = '',
    readOnly = false
  },
  ref
) => {
  // 创建 Slate 编辑器实例
  const editor = useMemo(() => {
    let editorInstance = withReact(createEditor());
    
    // 自定义编辑器配置
    const { isInline, isVoid, normalizeNode } = editorInstance;
    
    // 配置 inline 元素
    editorInstance.isInline = element => {
      const e = element as any;
      return (e.type === 'tag' || e.type === 'dateMention' || e.type === 'eventMention') ? true : isInline(element);
    };
    
    // 配置 void 元素
    editorInstance.isVoid = element => {
      const e = element as any;
      return (e.type === 'tag' || e.type === 'dateMention' || e.type === 'eventMention' || e.type === 'timestamp-divider') ? true : isVoid(element);
    };
    
    // 🔥 normalizeNode 确保 void inline 元素后面总有空格
    editorInstance.normalizeNode = entry => {
      const [node, path] = entry;
      
      // 检查 tag/dateMention/eventMention 元素
      if (SlateElement.isElement(node) && ('type' in node) && (node.type === 'tag' || node.type === 'dateMention' || node.type === 'eventMention')) {
        // 获取父节点和当前节点在父节点中的索引
        const parentPath = path.slice(0, -1);
        const parent = SlateNode.get(editorInstance, parentPath);
        const nodeIndex = path[path.length - 1];
        
        if (!SlateElement.isElement(parent)) {
          normalizeNode(entry);
          return;
        }
        
        // 检查下一个兄弟节点
        const nextSiblingIndex = nodeIndex + 1;
        const nextSibling = nextSiblingIndex < parent.children.length 
          ? parent.children[nextSiblingIndex] 
          : null;
        
        // 如果后面没有节点，或者下一个节点不是文本节点，或者不以空格开头
        const needsSpace = !nextSibling || 
                          !Text.isText(nextSibling) || 
                          !nextSibling.text.startsWith(' ');
        
        if (needsSpace) {
          // 💾 保存当前光标位置
          const currentSelection = editorInstance.selection;
          
          // 在 void 元素之后插入空格文本节点
          Editor.withoutNormalizing(editorInstance, () => {
            const insertPath = [...parentPath, nextSiblingIndex];
            
            // 如果下一个节点是文本但不以空格开头，在文本开头插入空格
            if (nextSibling && Text.isText(nextSibling)) {
              Transforms.insertText(editorInstance, ' ', { 
                at: { path: insertPath, offset: 0 } 
              });
              
              // 🔧 只在光标原本在文本节点开头时才调整偏移
              if (currentSelection && 
                  Range.isCollapsed(currentSelection) &&
                  currentSelection.anchor.path.join(',') === insertPath.join(',') &&
                  currentSelection.anchor.offset === 0) {
                Transforms.select(editorInstance, {
                  anchor: { path: insertPath, offset: 1 },
                  focus: { path: insertPath, offset: 1 },
                });
              }
            } else {
              // 否则插入新的空格文本节点
              Transforms.insertNodes(
                editorInstance,
                { text: ' ' },
                { at: insertPath }
              );
            }
          });
          
          // 由于修改了树，立即返回让 Slate 重新 normalize
          return;
        }
      }
      
      // 默认 normalize 行为
      normalizeNode(entry);
    };
    
    // 应用 History 插件
    editorInstance = withHistory(editorInstance);
    
    // console.log('[ModalSlate] 创建编辑器实例（已配置 isInline, isVoid, normalizeNode）');
    return editorInstance;
  }, []);
  
  /**
   * 应用文本格式化（使用 SlateCore）
   */
  const applyTextFormat = useCallback((command: string): boolean => {
    try {
      // 对于 bullet 相关命令，保留原有逻辑以支持 pendingTimestamp
      if (command === 'toggleBulletList') {
        const [paraMatch] = Editor.nodes(editor, {
          match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
        });
        
        if (paraMatch) {
          const [node] = paraMatch;
          const para = node as any;
          
          if (para.bullet) {
            // 已是 bullet，取消
            Transforms.setNodes(editor, { bullet: undefined, bulletLevel: undefined } as any);
          } else {
            // 设置为 bullet（默认 level 0）
            Transforms.setNodes(editor, { bullet: true, bulletLevel: 0 } as any);
            
            // 🔥 清除 pendingTimestamp 标记，bullet 算作有效内容
            setPendingTimestamp(false);
            console.log('[ModalSlate] 插入 bullet，清除 pendingTimestamp');
          }
        }
        return true;
      }
      
      // 其他格式化命令使用 SlateCore
      const result = slateApplyTextFormat(editor, command);
      return result;
    } catch (err) {
      console.error('[ModalSlate.applyTextFormat] Failed:', err);
      return false;
    }
  }, [editor]);
  
  // 暴露 editor 实例和方法给父组件
  useImperativeHandle(ref, () => ({
    editor,
    applyTextFormat,
    insertTimestampAndFocus: () => {
      if (!enableTimestamp || !parentEventId || !timestampServiceRef.current) {
        return;
      }

      // 触发插入 timestamp（会自动调用 triggerTimestamp）
      setPendingTimestamp(true);
      
      // 延迟聚焦到编辑器
      setTimeout(() => {
        ReactEditor.focus(editor);
        // 移动光标到末尾
        Transforms.select(editor, Editor.end(editor, []));
      }, 100);
    }
  }), [editor, applyTextFormat, enableTimestamp, parentEventId]);
  
  // 记录已添加 timestamp 的 content (必须在 initialValue 之前定义)
  const timestampAddedForContentRef = useRef<string | null>(null);
  
  // 将 Slate JSON 字符串转换为 Slate nodes（使用 SlateCore）
  const initialValue = useMemo(() => {
    let nodes = slateJsonToNodes(content);
    // console.log('[ModalSlate] 解析内容为节点:', { content, nodes });
    
    // 如果启用 timestamp 且这个 content 还没添加过 timestamp
    if (enableTimestamp && parentEventId && timestampAddedForContentRef.current !== content) {
      const hasActualContent = nodes.some((node: any) => {
        if (node.type === 'paragraph') {
          return node.children?.some((child: any) => child.text?.trim());
        }
        return node.type !== 'paragraph';
      });
      
      const hasTimestamp = nodes.some((node: any) => node.type === 'timestamp-divider');
      
      if (hasActualContent && !hasTimestamp) {
        // 从 EventHistoryService 获取创建时间
        let createLog = EventHistoryService.queryHistory({
          eventId: parentEventId,
          operations: ['create'],
          limit: 1
        })[0];
        
        // 🔧 如果没有创建日志，使用 event.createdAt 或 event.updatedAt 作为 fallback
        if (!createLog) {
          const event = EventService.getEventById(parentEventId);
          if (event) {
            if (event.createdAt) {
              createLog = {
                id: 'fallback-' + parentEventId,
                eventId: parentEventId,
                operation: 'create',
                timestamp: event.createdAt,
                source: 'fallback-createdAt',
                changes: []
              } as any;
              console.log('[ModalSlate initialValue] 使用 event.createdAt fallback:', event.createdAt);
            } else if (event.updatedAt) {
              createLog = {
                id: 'fallback-' + parentEventId,
                eventId: parentEventId,
                operation: 'create',
                timestamp: event.updatedAt,
                source: 'fallback-updatedAt',
                changes: []
              } as any;
              console.log('[ModalSlate initialValue] 使用 event.updatedAt fallback:', event.updatedAt);
            }
          }
        }
        
        if (createLog) {
          const createTime = new Date(createLog.timestamp);
          console.log('[ModalSlate] 在 initialValue 中添加 timestamp:', createTime);
          
          // ✅ 使用 Time Architecture 规范格式
          const timestampStr = formatDateTime(createTime);
          
          // 在开头插入 timestamp（不插入 preline，由 renderElement 动态绘制）
          nodes = [
            {
              type: 'timestamp-divider',
              timestamp: timestampStr,  // ✅ 不再使用 toISOString()
              displayText: timestampStr,
              isFirstOfDay: true,
              children: [{ text: '' }]
            },
            ...nodes
          ] as any;
          
          // 标记这个 content 已经添加过 timestamp
          timestampAddedForContentRef.current = content;
        }
      }
    }
    
    return nodes;
  }, [content, enableTimestamp, parentEventId]); // 依赖 content，内容变化时重新解析
  
  // 自动保存定时器
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastContentRef = useRef<string>(content);
  
  // 🔧 监听外部 content 变化，但只在必要时同步（避免循环更新导致光标乱跳）
  // 
  // 问题：如果每次 onChange 回调都更新父组件，父组件又通过 props 传回来，
  // 就会触发这个 useEffect，导致编辑器被重置，光标丢失。
  // 
  // 解决方案：只在真正的外部变化时才同步（例如切换事件、初始加载）
  // 使用 parentEventId 作为依赖，只有切换事件时才重置编辑器
  const isInitialMount = useRef(true);
  
  useEffect(() => {
    // 初次挂载时跳过（由 initialValue 处理）
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastContentRef.current = content;
      return;
    }
    
    // 只在外部内容真正不同时才同步（排除 onChange 循环回来的情况）
    const currentContent = slateNodesToJsonCore(editor.children);
    const contentChanged = content !== currentContent;
    const notFromSelf = content !== lastContentRef.current;
    
    if (content && contentChanged && notFromSelf) {
      console.log('[ModalSlate] 🔄 外部 content 变化（可能是切换事件），更新编辑器');
      console.log('当前内容长度:', currentContent.length);
      console.log('新内容长度:', content.length);
      
      const nodes = slateJsonToNodes(content);
      
      // 使用 withoutNormalizing 包裹，提高性能
      Editor.withoutNormalizing(editor, () => {
        // 删除所有内容
        Transforms.delete(editor, {
          at: {
            anchor: Editor.start(editor, []),
            focus: Editor.end(editor, [])
          }
        });
        
        // 插入新内容
        Transforms.insertNodes(editor, nodes, { at: [0] });
      });
      
      lastContentRef.current = content;
    }
  }, [parentEventId]); // 🔧 只监听 parentEventId，切换事件时才重置编辑器
  
  // Timestamp 相关状态
  const timestampServiceRef = useRef<EventLogTimestampService | null>(null);
  const [pendingTimestamp, setPendingTimestamp] = useState<boolean>(false);
  const [isFocused, setIsFocused] = useState(false); // 追踪编辑器聚焦状态
  const contentLoadedRef = useRef<boolean>(false);
  
  // @ Mention Menu 状态
  const [mentionMenu, setMentionMenu] = useState<{
    visible: boolean;
    query: string;
    position: { x: number; y: number };
    atSignRange: Range | null; // 存储 @ 符号的位置
  } | null>(null);
  
  // 初始化 timestamp 服务
  useEffect(() => {
    if (enableTimestamp && parentEventId) {
      timestampServiceRef.current = new EventLogTimestampService();
      // console.log('[ModalSlate] 初始化 EventLogTimestampService');
      
      // 如果内容中已有 timestamp，提取最后一个并设置为 lastEditTime
      const timestamps = editor.children.filter((node: any) => node.type === 'timestamp-divider') as any[];
      if (timestamps.length > 0) {
        const lastTimestamp = timestamps[timestamps.length - 1];
        const lastTime = new Date(lastTimestamp.timestamp);
        timestampServiceRef.current.updateLastEditTime(parentEventId, lastTime);
        // console.log('[ModalSlate] 从内容中恢复 lastEditTime:', lastTime);
      }
    }
  }, [enableTimestamp, parentEventId, editor]);
  
  // 从加载的内容中提取最后一个 timestamp，并初始化 timestampService
  // 如果有内容但没有 timestamp，插入初始 timestamp + preline
  useEffect(() => {
    if (enableTimestamp && parentEventId && timestampServiceRef.current && !contentLoadedRef.current) {
      // 检查是否有实际内容（不只是空段落）
      const hasActualContent = editor.children.some((node: any) => {
        if (node.type === 'paragraph') {
          return node.children?.some((child: any) => child.text?.trim());
        }
        return node.type !== 'paragraph';
      });
      
      // 扫描所有 timestamp 节点
      let lastTimestamp: Date | null = null;
      let hasTimestamp = false;
      
      for (const node of editor.children) {
        const element = node as any;
        if (element.type === 'timestamp-divider' && element.timestamp) {
          hasTimestamp = true;
          try {
            const timestampDate = new Date(element.timestamp);
            if (!lastTimestamp || timestampDate > lastTimestamp) {
              lastTimestamp = timestampDate;
            }
          } catch (error) {
            console.warn('[ModalSlate] 解析 timestamp 失败:', element.timestamp);
          }
        }
      }
      
      // 如果有内容但没有 timestamp，插入初始 timestamp（不插入 preline，由 renderElement 动态绘制）
      if (hasActualContent && !hasTimestamp) {
        // console.log('[ModalSlate] 有内容但无 timestamp，插入初始 timestamp');
        
        // 从 EventHistoryService 获取创建时间
        const createLogs = EventHistoryService.queryHistory({
          eventId: parentEventId,
          operations: ['create'],
          limit: 1
        });
        
        // console.log('[ModalSlate] 查询创建日志:', {
        //   eventId: parentEventId,
        //   foundLogs: createLogs.length,
        //   allHistoryCount: EventHistoryService.queryHistory({}).length,
        //   firstLog: createLogs[0]
        // });
        
        let createLog = createLogs[0];
        
        // 🔧 如果没有创建日志，尝试从 eventlog 的 timestamp 节点补录
        if (!createLog) {
          // console.log('[ModalSlate] 未找到创建日志，尝试从 timestamp 节点补录');
          const event = EventService.getEventById(parentEventId);
          if (event && event.eventlog) {
            const backfilledCount = EventService.backfillEventHistoryFromTimestamps(
              parentEventId, 
              event.eventlog
            );
            
            if (backfilledCount > 0) {
              console.log('[ModalSlate] 补录成功，重新查询创建日志');
              // 重新查询
              const retryLogs = EventHistoryService.queryHistory({
                eventId: parentEventId,
                operations: ['create'],
                limit: 1
              });
              createLog = retryLogs[0];
            } else {
              // 🔧 补录失败（eventlog 中没有 timestamp 节点），使用 event.createdAt 作为 fallback
              console.log('[ModalSlate] 补录失败，使用 event.createdAt 作为 fallback');
              if (event.createdAt) {
                // 创建一个临时的 createLog 对象
                createLog = {
                  id: 'fallback-' + parentEventId,
                  eventId: parentEventId,
                  operation: 'create',
                  timestamp: event.createdAt,
                  source: 'fallback-createdAt',
                  changes: []
                } as any;
                console.log('[ModalSlate] 使用 event.createdAt:', event.createdAt);
              } else if (event.updatedAt) {
                // 如果连 createdAt 都没有，使用 updatedAt
                createLog = {
                  id: 'fallback-' + parentEventId,
                  eventId: parentEventId,
                  operation: 'create',
                  timestamp: event.updatedAt,
                  source: 'fallback-updatedAt',
                  changes: []
                } as any;
                console.log('[ModalSlate] 使用 event.updatedAt:', event.updatedAt);
              }
            }
          }
        }
        
        if (createLog) {
          const createTime = new Date(createLog.timestamp);
          console.log('[ModalSlate] 找到创建时间:', createTime);
          
          // 创建 timestamp 节点（使用创建时间）
          const timestampNode = {
            type: 'timestamp-divider',
            timestamp: createTime.toISOString(),
            displayText: formatDateTime(createTime),
            isFirstOfDay: true,
            children: [{ text: '' }]
          };
          
          // 使用 Editor.withoutNormalizing 避免中间状态
          Editor.withoutNormalizing(editor, () => {
            // 在编辑器开头插入 timestamp（不插入 preline）
            Transforms.insertNodes(editor, timestampNode as any, { at: [0] });
          });
          
          // 更新 timestampService 的最后编辑时间
          timestampServiceRef.current.updateLastEditTime(parentEventId, createTime);
          
          console.log('[ModalSlate] 初始 timestamp 插入完成');
        } else {
          // console.warn('[ModalSlate] 未找到创建日志，跳过初始 timestamp 插入');
        }
      }
      // 如果找到现有 timestamp，更新 timestampService 的最后编辑时间
      else if (lastTimestamp) {
        // console.log('[ModalSlate] 从内容中提取到最后 timestamp:', lastTimestamp);
        timestampServiceRef.current.updateLastEditTime(parentEventId, lastTimestamp);
      }
      
      contentLoadedRef.current = true;
    }
  }, [editor, enableTimestamp, parentEventId]);
  
  /**
   * 检查当前元素前面是否有 timestamp，并计算到前一个 timestamp 的距离
   */
  const hasPrecedingTimestamp = useCallback((element: any, allNodes: any[]) => {
    try {
      const path = ReactEditor.findPath(editor, element);
      if (!path) return false;
      
      // 检查前面是否有 timestamp
      let hasTimestamp = false;
      for (let i = path[0] - 1; i >= 0; i--) {
        const checkElement = allNodes[i];
        if (checkElement && checkElement.type === 'timestamp-divider') {
          hasTimestamp = true;
          break;
        }
      }
      
      return hasTimestamp;
    } catch (error) {
      // 回退检查
      const currentIndex = allNodes.indexOf(element);
      if (currentIndex > 0) {
        for (let i = currentIndex - 1; i >= 0; i--) {
          const checkElement = allNodes[i];
          if (checkElement && checkElement.type === 'timestamp-divider') {
            return true;
          }
        }
      }
    }
    return false;
  }, [editor]);



  /**
   * 渲染元素组件
   */
  const renderElement = useCallback((props: RenderElementProps) => {
    const { element } = props;
    const para = element as any;
    
    switch (para.type) {
      case 'paragraph':
        // 检查是否是 bullet 段落
        const isBullet = para.bullet === true;
        const bulletLevel = para.bulletLevel ?? 0;
        
        // 检查是否应该绘制 preline
        const needsPreline = (() => {
          try {
            const path = ReactEditor.findPath(editor, element);
            if (!path) return false;
            
            // 🔧 向上查找最近的 timestamp（必须是紧邻的，中间不能有其他非 paragraph 节点）
            let hasTimestamp = false;
            let timestampIndex = -1;
            
            for (let i = path[0] - 1; i >= 0; i--) {
              const node = editor.children[i] as any;
              if (node.type === 'timestamp-divider') {
                hasTimestamp = true;
                timestampIndex = i;
                break;
              }
              // 如果遇到非 paragraph 且非 timestamp 的节点，停止查找
              if (node.type !== 'paragraph') {
                break;
              }
            }
            
            if (!hasTimestamp) return false;
            
            // 🔧 检查 timestamp 和当前段落之间是否只有 paragraph 节点（确保连续性）
            for (let i = timestampIndex + 1; i < path[0]; i++) {
              const node = editor.children[i] as any;
              if (node.type !== 'paragraph') {
                return false; // 中间有其他类型节点，不属于这个 timestamp 组
              }
            }
            
            // 如果有内容，显示 preline
            const hasContent = (element as any).children?.some((child: any) => child.text?.trim());
            if (hasContent) return true;
            
            // 空段落：只有当它紧跟在 timestamp 之后（或中间只有空 paragraph）时才显示 preline
            return true;
          } catch {
            return false;
          }
        })();
        
        // 检查是否是最后一个非空段落（光标可能到达过的最远位置）
        const isLastContentParagraph = (() => {
          try {
            const path = ReactEditor.findPath(editor, element);
            if (!path) return false;
            
            // 检查当前位置之后是否还有非空内容
            for (let i = path[0] + 1; i < editor.children.length; i++) {
              const nextNode = editor.children[i] as any;
              if (nextNode.type === 'paragraph' && nextNode.children?.[0]?.text?.trim()) {
                return false; // 后面还有内容
              }
            }
            return true; // 这是最后一个有内容的段落
          } catch {
            return false;
          }
        })();
        
        // 计算 bullet 符号（使用 SlateCore 的统一符号）
        const bulletSymbol = isBullet ? getBulletChar(bulletLevel) : null;
        
        return (
          <div
            {...props.attributes}
            className={`slate-paragraph ${needsPreline ? 'with-preline' : ''} ${isBullet ? 'bullet-paragraph' : ''}`}
            style={{
              position: 'relative',
              paddingLeft: needsPreline ? '20px' : '0',
              minHeight: needsPreline ? '20px' : 'auto'
            }}
          >
            {needsPreline && isFocused && (
              <div
                className="paragraph-preline"
                contentEditable={false}
                style={{
                  position: 'absolute',
                  left: '8px',
                  top: '-20px', // 向上延伸到 timestamp（调整为更自然的位置）
                  bottom: isLastContentParagraph ? '-8px' : '0',
                  width: '1px',
                  background: '#d1d5db',
                  zIndex: 0,
                  pointerEvents: 'none'
                }}
              />
            )}
            {isBullet && bulletSymbol && (
              <span
                className="bullet-symbol"
                contentEditable={false}
                style={{
                  position: 'absolute',
                  left: needsPreline ? `${20 + bulletLevel * 24}px` : `${bulletLevel * 24}px`,
                  top: '0',
                  userSelect: 'none',
                  color: '#6b7280',
                  fontWeight: 'bold',
                  zIndex: 1
                }}
              >
                {bulletSymbol}
              </span>
            )}
            <div style={{ 
              paddingLeft: isBullet ? `${bulletLevel * 24 + 18}px` : '0',
              position: 'relative',
              zIndex: 2
            }}>
              {props.children}
            </div>
          </div>
        );
        
      case 'tag':
        return <TagElementComponent {...props} />;
        
      case 'date-mention':
        return <DateMentionElement {...props} />;
        
      case 'eventMention':
        return <EventMentionElement {...props} element={props.element as any} />;
        
      case 'timestamp-divider':
        return <TimestampDividerElement {...props} />;
        
      default:
        return (
          <div {...props.attributes}>
            {props.children}
          </div>
        );
    }
  }, [hasPrecedingTimestamp, editor]);
  
  /**
   * 渲染叶子节点（文本格式）
   */
  const renderLeaf = useCallback((props: RenderLeafProps) => {
    let { children } = props;
    const { leaf } = props as { leaf: CustomText };
    
    if (leaf.bold) children = <strong>{children}</strong>;
    if (leaf.italic) children = <em>{children}</em>;
    if (leaf.underline) children = <u>{children}</u>;
    if (leaf.strikethrough) children = <s>{children}</s>;
    if ((leaf as any).code) children = <code>{children}</code>;
    
    // 文本颜色和背景颜色
    if (leaf.color || leaf.backgroundColor) {
      const style: React.CSSProperties = {};
      if (leaf.color) style.color = leaf.color;
      if (leaf.backgroundColor) style.backgroundColor = leaf.backgroundColor;
      children = <span style={style}>{children}</span>;
    }
    
    return <span {...props.attributes}>{children}</span>;
  }, []);
  
  /**
   * 处理编辑器聚焦 - 检查并插入 timestamp
   */
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (enableTimestamp && timestampServiceRef.current && parentEventId) {
      // 🔧 检查光标是否在已有 timestamp 的段落组中
      const { selection } = editor;
      if (selection) {
        try {
          const [paraMatch] = Editor.nodes(editor, {
            at: selection,
            match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === 'paragraph',
          });
          
          if (paraMatch) {
            const [, path] = paraMatch;
            // 向上查找是否有 timestamp
            let hasTimestampAbove = false;
            for (let i = path[0] - 1; i >= 0; i--) {
              const node = editor.children[i] as any;
              if (node.type === 'timestamp-divider') {
                hasTimestampAbove = true;
                break;
              }
              if (node.type !== 'paragraph') {
                break; // 遇到其他类型节点，停止
              }
            }
            
            if (hasTimestampAbove) {
              console.log('[ModalSlate] 光标在已有 timestamp 的段落组中，不插入新 timestamp');
              return;
            }
          }
        } catch (error) {
          console.error('[ModalSlate] 检查 timestamp 段落组失败:', error);
        }
      }
      
      // 检查是否需要插入新的 timestamp（基于 5 分钟间隔）
      const shouldInsert = timestampServiceRef.current.shouldInsertTimestamp({
        contextId: parentEventId,
        eventId: parentEventId
      });
      
      if (shouldInsert) {
        console.log('[ModalSlate] 聚焦时插入 timestamp（等待用户输入）');
        
        // 创建 timestamp 节点
        const timestampNode = timestampServiceRef.current.createTimestampDivider(parentEventId);
        
        // 立即插入 timestamp + 空段落，不管是否有内容
        timestampServiceRef.current.insertTimestamp(editor, timestampNode, parentEventId);
        
        setPendingTimestamp(true); // 标记有等待用户输入的 timestamp
      } else {
        console.log('[ModalSlate] 聚焦但距上次编辑未超过 5 分钟，不插入 timestamp');
      }
    }
  }, [enableTimestamp, editor, parentEventId]);

  /**
   * 立即保存函数（用于失焦等场景）
   */
  const flushPendingChanges = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    
    const newContent = slateNodesToJsonCore(editor.children);
    if (newContent !== lastContentRef.current) {
      lastContentRef.current = newContent;
      onChange(newContent);
      console.log('[ModalSlate] 💾 立即保存:', newContent.slice(0, 100) + '...');
    }
  }, [editor, onChange]);

  /**
   * 处理编辑器失焦 - 清理空的 timestamp 并立即保存
   */
  const handleBlur = useCallback(() => {
    setIsFocused(false); // 清除聚焦状态
    // Step 1: 清理空 timestamp
    if (pendingTimestamp && timestampServiceRef.current) {
      console.log('[ModalSlate] 失焦时检查是否需要清理空 timestamp');
      
      // 查找最后一个 timestamp 后是否有实际内容
      let lastTimestampIndex = -1;
      for (let i = editor.children.length - 1; i >= 0; i--) {
        const node = editor.children[i] as any;
        if (node.type === 'timestamp-divider') {
          lastTimestampIndex = i;
          break;
        }
      }
      
      // 如果找到了 timestamp，检查它后面是否有内容
      if (lastTimestampIndex !== -1) {
        let hasContentAfterTimestamp = false;
        for (let i = lastTimestampIndex + 1; i < editor.children.length; i++) {
          const node = editor.children[i] as any;
          // 有文本内容算作"有内容"
          // ⚠️ 空 bullet 不算内容，会被一起清理
          if (node.type === 'paragraph' && node.children?.[0]?.text?.trim()) {
            hasContentAfterTimestamp = true;
            break;
          }
        }
        
        // 如果 timestamp 后面没有内容，删除这个 timestamp 和后面的空段落
        if (!hasContentAfterTimestamp) {
          console.log('[ModalSlate] 用户未输入内容，删除本次插入的 timestamp');
          timestampServiceRef.current.removeEmptyTimestamp(editor);
        } else {
          console.log('[ModalSlate] 用户已输入内容，保留 timestamp');
        }
      }
      
      setPendingTimestamp(false);
    }
    
    // Step 2: 立即保存当前内容（取消防抖）
    flushPendingChanges();
  }, [pendingTimestamp, editor, flushPendingChanges]);

  /**
   * 处理 @ 监听和 Mention Menu 交互
   */
  const checkForMentionTrigger = useCallback(() => {
    const { selection } = editor;
    if (!selection || !Range.isCollapsed(selection)) {
      return;
    }

    const [start] = Range.edges(selection);
    const wordBefore = Editor.before(editor, start, { unit: 'word' });
    const before = wordBefore && Editor.before(editor, wordBefore);
    const beforeRange = before && Editor.range(editor, before, start);
    const beforeText = beforeRange && Editor.string(editor, beforeRange);
    const beforeMatch = beforeText && beforeText.match(/@(\w*)$/);

    if (beforeMatch) {
      const [, query] = beforeMatch;
      
      // 计算菜单位置
      const domSelection = window.getSelection();
      const domRange = domSelection?.getRangeAt(0);
      const rect = domRange?.getBoundingClientRect();
      
      if (rect) {
        setMentionMenu({
          visible: true,
          query: query || '',
          position: { x: rect.left, y: rect.bottom + 5 },
          atSignRange: beforeRange
        });
      }
    } else {
      setMentionMenu(null);
    }
  }, [editor]);

  /**
   * 处理编辑器内容变化
   */
  // 用于追踪 timestamp 数量变化，触发重新渲染
  const [, forceUpdate] = useState({});
  const timestampCountRef = useRef(0);

  const handleChange = useCallback((newValue: Descendant[]) => {
    console.log('[ModalSlate] 内容变化:', newValue);
    
    // 🔍 检测 timestamp 数量变化（可能是删除或添加）
    const currentTimestampCount = newValue.filter((node: any) => node.type === 'timestamp-divider').length;
    if (currentTimestampCount !== timestampCountRef.current) {
      console.log('[ModalSlate] 🔄 Timestamp 数量变化:', timestampCountRef.current, '→', currentTimestampCount);
      timestampCountRef.current = currentTimestampCount;
      // 强制重新渲染所有段落（更新 preline 状态）
      forceUpdate({});
    }
    
    // 🔍 检测 @ 符号以显示 Mention Menu
    checkForMentionTrigger();
    
    // 如果有等待的 timestamp，检查用户是否真正输入了内容
    if (pendingTimestamp) {
      // 查找最后一个 timestamp 后是否有实际内容
      let lastTimestampIndex = -1;
      for (let i = newValue.length - 1; i >= 0; i--) {
        const node = newValue[i] as any;
        if (node.type === 'timestamp-divider') {
          lastTimestampIndex = i;
          break;
        }
      }
      
      // 检查 timestamp 后是否有内容
      if (lastTimestampIndex !== -1) {
        const hasContentAfterTimestamp = newValue.slice(lastTimestampIndex + 1).some((node: any) => {
          return node.type === 'paragraph' && node.children?.[0]?.text?.trim();
        });
        
        // 只有当用户真正输入了内容时，才清除 pendingTimestamp
        if (hasContentAfterTimestamp) {
          setPendingTimestamp(false);
          
          // 用户开始输入，确认这个 timestamp，更新最后编辑时间
          if (enableTimestamp && timestampServiceRef.current && parentEventId) {
            timestampServiceRef.current.updateLastEditTime(parentEventId);
            console.log('[ModalSlate] 用户输入确认 timestamp，更新最后编辑时间');
          }
        }
      }
    }
    
    // 防抖保存
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    autoSaveTimerRef.current = setTimeout(() => {
      const newContent = slateNodesToJsonCore(newValue);
      if (newContent !== lastContentRef.current) {
        lastContentRef.current = newContent;
        onChange(newContent);
        console.log('[ModalSlate] 自动保存 Slate JSON:', newContent.slice(0, 100) + '...');
      }
    }, 2000);
  }, [pendingTimestamp, onChange, enableTimestamp, parentEventId, checkForMentionTrigger]);
  
  /**
   * 向上移动当前段落（使用 SlateCore）
   */
  const moveParagraphUp = useCallback(() => {
    const { selection } = editor;
    if (!selection) return;
    
    // 获取当前段落路径
    const [paraMatch] = Editor.nodes(editor, {
      match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
    });
    
    if (paraMatch) {
      const [, currentPath] = paraMatch;
      slatMoveParagraphUp(editor, currentPath, {
        skipTypes: ['timestamp-divider'],
      });
    }
  }, [editor]);
  
  /**
   * 向下移动当前段落（使用 SlateCore）
   */
  const moveParagraphDown = useCallback(() => {
    const { selection } = editor;
    if (!selection) return;
    
    // 获取当前段落路径
    const [paraMatch] = Editor.nodes(editor, {
      match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
    });
    
    if (paraMatch) {
      const [, currentPath] = paraMatch;
      slateMoveParagraphDown(editor, currentPath, {
        skipTypes: ['timestamp-divider'],
      });
    }
  }, [editor]);

  /**
   * 处理键盘事件
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // IME 组字中，不处理快捷键
    if (event.nativeEvent?.isComposing) return;
    
    // 🔍 监听 @ 字符输入
    if (event.key === '@') {
      // 延迟检测，等待 @ 插入到编辑器
      setTimeout(() => {
        checkForMentionTrigger();
      }, 0);
    }
    
    // 🎯 空格键触发 Bullet 自动检测
    if (event.key === ' ') {
      console.log('[ModalSlate] 🔍 空格键按下，准备检测 Bullet 触发');
      // 延迟执行，等待空格插入到编辑器后再检测
      setTimeout(() => {
        console.log('[ModalSlate] 🔍 开始检测...');
        const trigger = detectBulletTrigger(editor);
        console.log('[ModalSlate] 🔍 检测结果:', trigger);
        if (trigger) {
          console.log('[ModalSlate] 🎯 检测到 Bullet 触发字符:', trigger);
          applyBulletAutoConvert(editor, trigger);
        } else {
          console.log('[ModalSlate] ❌ 未检测到触发字符');
        }
      }, 0);
    }
    
    // 🆕 Enter 键：检查是否需要插入 timestamp
    if (event.key === 'Enter' && !event.shiftKey && enableTimestamp && timestampServiceRef.current && parentEventId) {
      // 延迟检查，等待新段落创建后
      setTimeout(() => {
        const shouldInsert = timestampServiceRef.current!.shouldInsertTimestamp({
          contextId: parentEventId,
          eventId: parentEventId
        });
        
        if (shouldInsert) {
          console.log('[ModalSlate] 回车后插入 timestamp（距上次编辑 ≥ 5 分钟）');
          
          // 保存当前光标位置
          const { selection } = editor;
          if (!selection) return;
          
          // 创建 timestamp 节点
          const timestampNode = timestampServiceRef.current!.createTimestampDivider(parentEventId);
          
          // 在当前段落之前插入 timestamp
          try {
            const [paraMatch] = Editor.nodes(editor, {
              at: selection,
              match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === 'paragraph',
            });
            
            if (paraMatch) {
              const [, path] = paraMatch;
              Editor.withoutNormalizing(editor, () => {
                Transforms.insertNodes(editor, timestampNode as any, { at: [path[0]] });
              });
              
              // 更新最后编辑时间
              timestampServiceRef.current!.updateLastEditTime(parentEventId);
            }
          } catch (error) {
            console.error('[ModalSlate] 插入 timestamp 失败:', error);
          }
        }
      }, 0);
    }
    
    // Shift+Alt+↑/↓ - 移动段落
    if (event.shiftKey && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      
      if (event.key === 'ArrowUp') {
        moveParagraphUp();
      } else {
        moveParagraphDown();
      }
      return;
    }
    
    // 文本格式化快捷键
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
    
    // Backspace 删除 bullet 机制（使用 SlateCore）
    if (event.key === 'Backspace') {
      const { selection } = editor;
      if (selection && Range.isCollapsed(selection)) {
        const [paraMatch] = Editor.nodes(editor, {
          match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
        });
        
        if (paraMatch) {
          const [node, path] = paraMatch;
          const para = node as any;
          
          if (para.bullet && selection.anchor.offset === 0) {
            const handled = handleBulletBackspace(editor, path, selection.anchor.offset);
            if (handled) {
              event.preventDefault();
              return;
            }
          }
        }
      }
    }
    
    // Backspace/Delete 禁止删除 timestamp
    if (event.key === 'Backspace' || event.key === 'Delete') {
      const { selection } = editor;
      if (!selection) return;
      
      // 检查是否试图删除 timestamp
      const [nodeEntry] = Editor.nodes(editor, {
        match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'timestamp-divider',
      });
      
      if (nodeEntry) {
        event.preventDefault();
        console.log('[ModalSlate] ⛔ 禁止删除 timestamp');
        return;
      }
    }
    
    // Tab/Shift+Tab 调整 bullet 层级
    if (event.key === 'Tab') {
      event.preventDefault();
      
      // 获取当前段落节点
      const [paraMatch] = Editor.nodes(editor, {
        match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
      });
      
      if (paraMatch) {
        const [node] = paraMatch;
        const para = node as any;
        
        if (para.bullet) {
          const currentLevel = para.bulletLevel || 0;
          
          if (event.shiftKey) {
            // Shift+Tab: 减少层级
            if (currentLevel > 0) {
              Transforms.setNodes(editor, { bulletLevel: currentLevel - 1 } as any);
            } else {
              // Level 0 再减少就取消 bullet
              Transforms.setNodes(editor, { bullet: undefined, bulletLevel: undefined } as any);
            }
          } else {
            // Tab: 增加层级（最多 5 层 0-4）
            if (currentLevel < 4) {
              Transforms.setNodes(editor, { bulletLevel: currentLevel + 1 } as any);
            }
          }
        }
      }
      return;
    }
  }, [editor, moveParagraphUp, moveParagraphDown, checkForMentionTrigger, enableTimestamp, parentEventId]);
  
  /**
   * 处理 Mention 选择
   */
  const handleMentionSelect = useCallback(async (item: MentionItem) => {
    if (!mentionMenu || !mentionMenu.atSignRange) return;
    
    // 只处理事件类型的 mention
    if (item.type === 'event') {
      // 删除 @ 和查询文本
      Transforms.delete(editor, { at: mentionMenu.atSignRange });
      
      // 插入 EventMention 节点
      const eventMention: EventMentionNode = {
        type: 'eventMention',
        eventId: item.id,
        eventTitle: item.title,
        eventEmoji: item.emoji,
        children: [{ text: '' }]
      };
      
      Transforms.insertNodes(editor, eventMention);
      
      // 移动光标到 mention 后面
      Transforms.move(editor);
      
      console.log('[ModalSlate] 插入 EventMention:', { eventId: item.id, title: item.title });
    }
    
    // 关闭菜单
    setMentionMenu(null);
  }, [editor, mentionMenu]);
  
  /**
   * 处理 Mention Menu 关闭
   */
  const handleMentionClose = useCallback(() => {
    setMentionMenu(null);
  }, []);
  
  /**
   * 处理复制 - 生成多格式剪贴板数据
   */
  const handleCopy = useCallback((event: React.ClipboardEvent) => {
    try {
      const { selection } = editor;
      if (!selection || Range.isCollapsed(selection)) {
        return; // 无选区，使用默认复制
      }

      // 获取选区内的节点
      const fragment = Editor.fragment(editor, selection);
      
      // 提取 Bullet 项
      const bulletItems = extractBulletItems(editor, fragment);
      
      if (bulletItems.length === 0) {
        return; // 没有 bullet，使用默认复制
      }

      // 生成多格式剪贴板数据
      const clipboardData = generateClipboardData(bulletItems);
      
      // 设置到剪贴板
      event.clipboardData.setData('text/plain', clipboardData['text/plain']);
      event.clipboardData.setData('text/html', clipboardData['text/html']);
      
      event.preventDefault();
      console.log('[ModalSlate] 📋 复制 Bullet 内容:', bulletItems.length, '项');
    } catch (err) {
      console.error('[ModalSlate] 复制失败:', err);
    }
  }, [editor]);

  /**
   * 处理粘贴 - 解析多格式内容
   */
  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    try {
      const clipboardData = event.clipboardData;
      
      // 优先尝试 HTML 解析
      if (clipboardData.types.includes('text/html')) {
        const html = clipboardData.getData('text/html');
        const bulletItems = parseHTMLBullets(html);
        
        if (bulletItems.length > 0) {
          event.preventDefault();
          
          // 插入解析后的 Bullet 项
          bulletItems.forEach(item => {
            const paragraph: ParagraphNode = {
              type: 'paragraph',
              bullet: true,
              bulletLevel: item.level,
              children: [{ text: item.text, ...item.marks }],
            };
            
            Transforms.insertNodes(editor, paragraph);
          });
          
          console.log('[ModalSlate] 📋 粘贴 HTML Bullet 内容:', bulletItems.length, '项');
          return;
        }
      }
      
      // 回退到纯文本解析
      if (clipboardData.types.includes('text/plain')) {
        const plainText = clipboardData.getData('text/plain');
        const bulletItems = parsePlainTextBullets(plainText);
        
        if (bulletItems.length > 0) {
          event.preventDefault();
          
          // 插入解析后的 Bullet 项
          bulletItems.forEach(item => {
            const paragraph: ParagraphNode = {
              type: 'paragraph',
              bullet: true,
              bulletLevel: item.level,
              children: [{ text: item.text }],
            };
            
            Transforms.insertNodes(editor, paragraph);
          });
          
          console.log('[ModalSlate] 📋 粘贴纯文本 Bullet 内容:', bulletItems.length, '项');
          return;
        }
      }
      
      // 如果都不是 bullet 格式，使用默认粘贴
    } catch (err) {
      console.error('[ModalSlate] 粘贴失败:', err);
    }
  }, [editor]);
  
  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);
  
  // 检查是否有 timestamp，用于控制 placeholder 显示
  const hasTimestamp = editor.children.some((node: any) => node.type === 'timestamp-divider');
  
  return (
    <div 
      className={`light-slate-editor ${className}`} 
      style={{ 
        position: 'relative',
        background: 'transparent',
        border: 'none'
      }}
    >
      
      <Slate
        editor={editor}
        initialValue={initialValue}
        onValueChange={handleChange}
      >
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          onKeyDown={handleKeyDown}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={hasTimestamp ? '' : placeholder}
          readOnly={readOnly}
          className="slate-editable"
          style={{ 
            position: 'relative', 
            zIndex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none'
          }}
        />
        
        {/* FloatingToolbar 暂时移除，避免复杂依赖 */}
        {/* {!readOnly && (
          <FloatingToolbar 
            editor={editor}
            showAddTask={false}
            showTimePicker={true}
            showMoreActions={false}
          />
        )} */}
      </Slate>
      
      {/* UnifiedMentionMenu */}
      {mentionMenu && mentionMenu.visible && (
        <UnifiedMentionMenu
          query={mentionMenu.query}
          onSelect={handleMentionSelect}
          onClose={handleMentionClose}
          context="editor"
          position={mentionMenu.position}
          currentEventId={parentEventId}
        />
      )}
    </div>
  );
});

ModalSlate.displayName = 'ModalSlate';