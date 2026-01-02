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

  // Enter 行为：段内换行（不创建新 paragraph）
  insertSoftBreak,
  
  // 序列化
  jsonToSlateNodes as slateJsonToNodes,
  slateNodesToJson as slateNodesToJsonCore,
} from '../SlateCore';

// 共享元素组件
import { TagElementComponent } from '../SlateCore/elements/TagElement';
import DateMentionElement from '../SlateCore/elements/DateMentionElement';
import { EventMentionElement } from '../SlateCore/elements/EventMentionElement';
// TimestampDividerElement 已废弃 - 使用 Block-Level Timestamp (paragraph.createdAt)

// UnifiedMentionMenu
import { UnifiedMentionMenu } from '../UnifiedMentionMenu';
import { MentionItem } from '../../services/search/UnifiedSearchIndex';

// 类型兼容
type CustomElement = ParagraphNode | TagNode | DateMentionNode | EventMentionNode;
type CustomText = TextNode;

// 导入 EventHistoryService 获取创建时间
import { EventHistoryService } from '../../services/EventHistoryService';
import { EventService } from '../../services/EventService';
import { formatTimeForStorage } from '../../utils/timeUtils';

// 样式复用 PlanSlate 的样式
import './ModalSlate.css';

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

const ModalSlateComponent: React.ForwardRefRenderFunction<ModalSlateRef, ModalSlateProps> = (props, ref) => {
  const {
    content,
    parentEventId,
    onChange,
    enableTimestamp = false,
    placeholder = '开始编写...',
    className = '',
    readOnly = false
  } = props;

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
      return (e.type === 'tag' || e.type === 'dateMention' || e.type === 'eventMention') ? true : isVoid(element);
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
      
      // ✅ v2.21.1: 使用 requestAnimationFrame 替代 setTimeout
      requestAnimationFrame(() => {
        ReactEditor.focus(editor);
        // 移动光标到末尾
        Transforms.select(editor, Editor.end(editor, []));
      });
    }
  }), [editor, applyTextFormat, enableTimestamp, parentEventId]);
  
  // 记录已添加 timestamp 的 content (必须在 initialValue 之前定义)
  const timestampAddedForContentRef = useRef<string | null>(null);
  
  // 🔥 [PERFORMANCE FIX] 使用 ref 缓存上次的 content，避免每次输入都重新解析
  const lastParsedContentRef = useRef<string>('');
  const cachedNodesRef = useRef<Descendant[]>([{ type: 'paragraph', children: [{ text: '' }] }] as any);
  
  // 🔥 只在 content 真正变化时才重新解析（排除 onChange 循环）
  const initialValue = useMemo(() => {
    // 如果 content 没变，直接返回缓存
    if (content === lastParsedContentRef.current) {
      console.log('[ModalSlate] ⚡ 使用缓存节点，跳过解析', {
        contentPreview: content?.substring(0, 100),
        cachedNodesCount: cachedNodesRef.current?.length,
        parentEventId
      });
      return cachedNodesRef.current;
    }
    
    console.log('[ModalSlate] 🔄 初始化/重置编辑器，解析 content:', {
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 200),
      parentEventId,
      lastParsedContentPreview: lastParsedContentRef.current?.substring(0, 100)
    });
    
    try {
      let nodes = slateJsonToNodes(content);
      
      // 🔧 验证节点是否有效
      if (!Array.isArray(nodes) || nodes.length === 0) {
        console.warn('[ModalSlate] ⚠️ 解析结果为空，使用默认段落');
        nodes = [{ type: 'paragraph', children: [{ text: '' }] }] as any;
      }
      
      // 🔧 验证每个节点的结构
      nodes = nodes.map((node: any, index) => {
        if (!node || typeof node !== 'object') {
          console.error('[ModalSlate] ❌ 无效节点:', { index, node });
          return { type: 'paragraph', children: [{ text: '' }] };
        }
        
        // 确保每个节点都有 children
        if (!node.children || !Array.isArray(node.children)) {
          console.warn('[ModalSlate] ⚠️ 节点缺少 children:', { index, nodeType: node.type });
          return { ...node, children: [{ text: '' }] };
        }
        
        // 确保 children 中至少有一个文本节点
        if (node.children.length === 0) {
          return { ...node, children: [{ text: '' }] };
        }
        
        return node;
      });
      
      console.log('[ModalSlate] ✅ 解析成功:', {
        nodeCount: nodes.length,
        firstNodeType: (nodes[0] as any)?.type,
        hasTimestamp: nodes.some((n: any) => n.type === 'paragraph' && n.createdAt)
      });
    
      // 如果启用 timestamp 且这个 content 还没添加过 timestamp
      if (enableTimestamp && parentEventId && timestampAddedForContentRef.current !== content) {
        const hasActualContent = nodes.some((node: any) => {
          if (node.type === 'paragraph') {
            return node.children?.some((child: any) => child.text?.trim());
          }
          return node.type !== 'paragraph';
        });
        
        // ✅ Block-Level: 检查第一个 paragraph 是否有 createdAt
        const firstParagraph = nodes.find((node: any) => node.type === 'paragraph') as any;
        const hasTimestamp = !!(firstParagraph && firstParagraph.createdAt);
        
        if (hasActualContent && !hasTimestamp) {
          // 🚀 [PERFORMANCE FIX] 直接从 EventService 同步获取创建时间（避免异步查询）
          const event = (EventService as any).getEventById?.(parentEventId);
          let createTime: Date | null = null;
          
          if (event?.createdAt) {
            createTime = new Date(event.createdAt);
            console.log('[ModalSlate] 使用 event.createdAt:', event.createdAt);
          } else if (event?.updatedAt) {
            createTime = new Date(event.updatedAt);
            console.log('[ModalSlate] fallback 到 event.updatedAt:', event.updatedAt);
          }
          
          if (createTime) {
            console.log('[ModalSlate] 在 initialValue 中添加 Block-Level timestamp:', createTime);
            
            // ✅ 为第一个 paragraph 添加 createdAt
            if (firstParagraph) {
              firstParagraph.createdAt = createTime.getTime();
            }
            
            // 标记这个 content 已经添加过 timestamp
            timestampAddedForContentRef.current = content;
          }
        }
      }
      
      // 🔧 更新缓存
      lastParsedContentRef.current = content;
      cachedNodesRef.current = nodes;
      
      return nodes;
    } catch (error) {
      console.error('[ModalSlate] ❌ 解析 content 失败:', error, {
        contentLength: content?.length,
        contentPreview: content?.substring(0, 500)
      });
      // 返回默认空段落
      const fallbackNodes = [{ type: 'paragraph', children: [{ text: '' }] }] as any;
      lastParsedContentRef.current = content;
      cachedNodesRef.current = fallbackNodes;
      return fallbackNodes;
    }
  }, [content, parentEventId]); // ✅ 依赖 content 和 parentEventId，但通过 ref 缓存避免重复解析
  
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
      
      // ✅ Block-Level: 扫描所有 paragraph，找到最新的 createdAt
      const paragraphsWithTimestamp = editor.children
        .filter((node: any) => node.type === 'paragraph' && node.createdAt)
        .map((node: any) => ({ timestamp: node.createdAt }));
      
      if (paragraphsWithTimestamp.length > 0) {
        const lastTimestamp = paragraphsWithTimestamp[paragraphsWithTimestamp.length - 1];
        const lastTime = new Date(lastTimestamp.timestamp);
        timestampServiceRef.current.updateLastEditTime(parentEventId, lastTime);
        console.log('[ModalSlate] 从内容中恢复 lastEditTime (Block-Level):', lastTime);
      }
    }
  }, [enableTimestamp, parentEventId, editor]);
  
  // ✅ Block-Level: 初始化时为无 timestamp 的内容添加 createdAt
  useEffect(() => {
    if (enableTimestamp && parentEventId && timestampServiceRef.current && !contentLoadedRef.current) {
      // 检查是否有实际内容（不只是空段落）
      const hasActualContent = editor.children.some((node: any) => {
        if (node.type === 'paragraph') {
          return node.children?.some((child: any) => child.text?.trim());
        }
        return node.type !== 'paragraph';
      });
      
      // ✅ 检查第一个 paragraph 是否已有 createdAt
      const firstParagraph = editor.children.find((node: any) => node.type === 'paragraph') as any;
      const hasTimestamp = !!(firstParagraph && firstParagraph.createdAt);
      
      // 如果有内容但第一个 paragraph 没有 timestamp，添加 createdAt
      if (hasActualContent && !hasTimestamp && firstParagraph) {
        console.log('[ModalSlate] 有内容但无 Block-Level timestamp，添加 createdAt');

        void (async () => {
          // 从 EventHistoryService 或 event 获取创建时间
          const createLogs = EventHistoryService.queryHistory({
            eventId: parentEventId,
            operations: ['create'],
            limit: 1
          });

          let createTime: Date | null = null;

          if (createLogs[0]) {
            createTime = new Date(createLogs[0].timestamp);
            console.log('[ModalSlate] 从 EventHistory 获取创建时间:', createTime);
          } else {
            // Fallback: 使用 event.createdAt / event.updatedAt
            try {
              const event = await EventService.getEventById(parentEventId);
              if (event?.createdAt) {
                createTime = new Date(event.createdAt);
                console.log('[ModalSlate] 使用 event.createdAt:', event.createdAt);
              } else if (event?.updatedAt) {
                createTime = new Date(event.updatedAt);
                console.log('[ModalSlate] fallback 到 event.updatedAt:', event.updatedAt);
              }
            } catch (err) {
              console.warn('[ModalSlate] 读取 event 创建时间失败:', err);
            }
          }

          if (createTime) {
            // ✅ 为第一个 paragraph 添加 createdAt
            const path = ReactEditor.findPath(editor, firstParagraph);
            Editor.withoutNormalizing(editor, () => {
              Transforms.setNodes(
                editor,
                { createdAt: createTime.getTime() } as any,
                { at: path }
              );
            });

            // 更新 timestampService
            timestampServiceRef.current?.updateLastEditTime(parentEventId, createTime);

            console.log('[ModalSlate] Block-Level timestamp 初始化完成');
          }
        })();
      }
      // ✅ 如果已有 timestamp，更新 timestampService
      else if (hasTimestamp && firstParagraph) {
        const lastTime = new Date(firstParagraph.createdAt);
        timestampServiceRef.current.updateLastEditTime(parentEventId, lastTime);
        console.log('[ModalSlate] 从 Block-Level timestamp 恢复 lastEditTime:', lastTime);
      }
      
      contentLoadedRef.current = true;
    }
  }, [editor, enableTimestamp, parentEventId]);
  
  /**
   * ✅ Block-Level: 检查当前 paragraph 前面是否有带 createdAt 的 paragraph
   */
  const hasPrecedingTimestamp = useCallback((element: any, allNodes: any[]) => {
    try {
      const path = ReactEditor.findPath(editor, element);
      if (!path) return false;
      
      // 检查前面是否有 paragraph 带 createdAt
      for (let i = path[0] - 1; i >= 0; i--) {
        const checkElement = allNodes[i];
        if (checkElement && checkElement.type === 'paragraph' && checkElement.createdAt) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      // 回退检查
      const currentIndex = allNodes.indexOf(element);
      if (currentIndex > 0) {
        for (let i = currentIndex - 1; i >= 0; i--) {
          const checkElement = allNodes[i];
          if (checkElement && checkElement.type === 'paragraph' && checkElement.createdAt) {
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
        
        // ✅ [Block-Level Timestamp] 检查是否有 createdAt 元数据
        const hasBlockTimestamp = !!(para.createdAt && typeof para.createdAt === 'number');
        const shouldShowTimestamp = hasBlockTimestamp && enableTimestamp;
        
        // ✅ [Block-Level Timestamp] 检查是否应该绘制 preline
        const needsPreline = (() => {
          if (!enableTimestamp) return false;
          // 只要当前 paragraph 有 createdAt 就显示 preline
          return hasBlockTimestamp;
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
        
        // 🆕 格式化时间戳显示
        const timestampDisplay = shouldShowTimestamp 
          ? formatDateTime(new Date(para.createdAt))
          : null;
        
        return (
          <div
            {...props.attributes}
            className={`slate-paragraph ${needsPreline ? 'with-preline' : ''} ${isBullet ? 'bullet-paragraph' : ''} ${shouldShowTimestamp ? 'with-timestamp' : ''}`}
            style={{
              position: 'relative',
              paddingLeft: needsPreline ? '20px' : '0',
              minHeight: needsPreline ? '20px' : 'auto',
              paddingTop: shouldShowTimestamp ? '28px' : '0'
            }}
          >
            {/* 🆕 Block-Level Timestamp 显示 */}
            {shouldShowTimestamp && (
              <div
                contentEditable={false}
                style={{
                  position: 'absolute',
                  left: needsPreline ? '20px' : '0',
                  top: '0',
                  fontSize: '12px',
                  color: '#999',
                  userSelect: 'none',
                  opacity: 0.7,
                  zIndex: 1,
                  whiteSpace: 'nowrap'  // 🔧 确保 "| 14min later" 和时间戳在同一行
                }}
              >
                {timestampDisplay}
              </div>
            )}
            {needsPreline && (
              <div
                className="paragraph-preline"
                contentEditable={false}
                style={{
                  position: 'absolute',
                  left: '8px',
                  top: shouldShowTimestamp ? '0' : '-28px',
                  bottom: isLastContentParagraph ? '-8px' : '0',
                  width: '2px',
                  background: '#e5e7eb',
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
                  top: shouldShowTimestamp ? '28px' : '0',
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
              zIndex: 2,
              whiteSpace: 'pre-wrap'
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
        
      default:
        return (
          <div {...props.attributes}>
            {props.children}
          </div>
        );
    }
  }, [editor, enableTimestamp]);
  
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
   * ✅ Block-Level: 处理编辑器聚焦 - 检查并为新段落添加 timestamp
   */
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (enableTimestamp && timestampServiceRef.current && parentEventId) {
      // 🔧 检查光标是否在已有 createdAt 的段落中
      const { selection } = editor;
      if (selection) {
        try {
          const [paraMatch] = Editor.nodes(editor, {
            at: selection,
            match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === 'paragraph',
          });
          
          if (paraMatch) {
            const [node] = paraMatch as [any, any];
            if (node.createdAt) {
              console.log('[ModalSlate] 光标在已有 timestamp 的段落中，不插入新 timestamp');
              return;
            }
          }
        } catch (error) {
          console.error('[ModalSlate] 检查 timestamp 段落失败:', error);
        }
      }
      
      // 检查是否需要插入新的 timestamp（基于 5 分钟间隔）
      const shouldInsert = timestampServiceRef.current.shouldInsertTimestamp({
        contextId: parentEventId,
        eventId: parentEventId
      });
      
      if (shouldInsert) {
        console.log('[ModalSlate] 聚焦时可能需要 timestamp（等待用户输入）');
        // 不提前插入，等用户输入时在 handleChange 中插入
        setPendingTimestamp(true);
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
   * ✅ Block-Level: 处理编辑器失焦 - 立即保存
   */
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    
    // ✅ Block-Level: 不需要清理空 timestamp，只需要保存
    setPendingTimestamp(false);
    
    // 立即保存当前内容（取消防抖）
    flushPendingChanges();
  }, [flushPendingChanges]);

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
   * ✅ Block-Level: 处理编辑器内容变化
   */
  // 用于追踪 timestamp 数量变化，触发重新渲染
  const [, forceUpdate] = useState({});
  const timestampCountRef = useRef(0);

  const handleChange = useCallback((newValue: Descendant[]) => {
    console.log('[ModalSlate] 内容变化:', newValue);
    
    // ✅ Block-Level: 检测带 createdAt 的 paragraph 数量变化
    const currentTimestampCount = newValue.filter((node: any) => node.type === 'paragraph' && node.createdAt).length;
    if (currentTimestampCount !== timestampCountRef.current) {
      console.log('[ModalSlate] 🔄 Timestamp 数量变化:', timestampCountRef.current, '→', currentTimestampCount);
      timestampCountRef.current = currentTimestampCount;
      forceUpdate({});
    }
    
    // 🔍 检测 @ 符号以显示 Mention Menu
    checkForMentionTrigger();
    
    // ✅ Block-Level: 如果有等待的 timestamp，检查用户是否真正输入了内容
    if (pendingTimestamp && enableTimestamp && timestampServiceRef.current && parentEventId) {
      // 检查当前光标所在的 paragraph 是否有内容
      const { selection } = editor;
      if (selection) {
        try {
          const [paraMatch] = Editor.nodes(editor, {
            at: selection,
            match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === 'paragraph',
          });
          
          if (paraMatch) {
            const [node, path] = paraMatch as [any, any];
            const paraText = SlateNode.string(node).trim();
            
            // 用户输入了内容，为当前 paragraph 添加 createdAt
            if (paraText && !node.createdAt) {
              const shouldInsert = timestampServiceRef.current.shouldInsertTimestamp({
                contextId: parentEventId,
                eventId: parentEventId
              });
              
              if (shouldInsert) {
                timestampServiceRef.current.insertBlockLevelTimestamp(editor, path, parentEventId);
                console.log('[ModalSlate] 用户输入，为 paragraph 添加 Block-Level timestamp');
              }
              
              setPendingTimestamp(false);
            }
          }
        } catch (error) {
          console.error('[ModalSlate] 检查 paragraph 失败:', error);
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
  }, [pendingTimestamp, onChange, enableTimestamp, parentEventId, checkForMentionTrigger, editor]);
  
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
      slatMoveParagraphUp(editor, currentPath);
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
      slateMoveParagraphDown(editor, currentPath);
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
      // ✅ v2.21.1: 使用 queueMicrotask 替代 setTimeout(0)
      queueMicrotask(() => {
        checkForMentionTrigger();
      });
    }
    
    // 🎯 空格键触发 Bullet 自动检测
    if (event.key === ' ') {
      console.log('[ModalSlate] 🔍 空格键按下，准备检测 Bullet 触发');
      // ✅ v2.21.1: 使用 queueMicrotask 替代 setTimeout(0)
      queueMicrotask(() => {
        console.log('[ModalSlate] 🔍 开始检测...');
        const trigger = detectBulletTrigger(editor);
        console.log('[ModalSlate] 🔍 检测结果:', trigger);
        if (trigger) {
          console.log('[ModalSlate] 🎯 检测到 Bullet 触发字符:', trigger);
          applyBulletAutoConvert(editor, trigger);
        } else {
          console.log('[ModalSlate] ❌ 未检测到触发字符');
        }
      });
    }
    
    // ✅ ModalSlate EventLog：Enter 默认“段内换行”，避免换行就 split 成新 paragraph（新 node）
    // - Ctrl/Meta+Enter：保留创建新段落（新时间块）的能力
    // - Bullet 段落：仍按 bullet 规则处理（Enter 继承/空行取消）
    if (event.key === 'Enter' && !event.shiftKey) {
      const scheduleTimestampIfNeeded = () => {
        if (!enableTimestamp || !timestampServiceRef.current || !parentEventId) return;

        queueMicrotask(() => {
          const shouldInsert = timestampServiceRef.current!.shouldInsertTimestamp({
            contextId: parentEventId,
            eventId: parentEventId,
          });

          if (!shouldInsert) return;

          const { selection } = editor;
          if (!selection) return;

          try {
            const [match] = Editor.nodes(editor, {
              at: selection,
              match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === 'paragraph',
            });

            if (match) {
              const [node, path] = match as [any, any];
              if (!node.createdAt) {
                timestampServiceRef.current!.insertBlockLevelTimestamp(editor, path, parentEventId);
              }
            }
          } catch (error) {
            console.error('[ModalSlate] 添加 Block-Level timestamp 失败:', error);
          }
        });
      };

      const [paraMatch] = Editor.nodes(editor, {
        match: (n: any) => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'paragraph',
      });
      const para = (paraMatch?.[0] as any) || null;
      const isBullet = !!para?.bullet;

      if (isBullet) {
        // Bullet：保持 OneNote 风格 Enter 行为
        const handled = handleBulletEnter(editor);
        if (handled) {
          event.preventDefault();
          scheduleTimestampIfNeeded();
          return;
        }
        // 空 bullet 行：handleBulletEnter 会取消 bullet 并返回 false，这里交给默认 Enter 创建新行
        scheduleTimestampIfNeeded();
      } else {
        // 普通段落：Enter = 软换行（不创建新段落）
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          insertSoftBreak(editor);
          return;
        }

        // Ctrl/Meta+Enter：创建新段落（允许新时间块），并按规则补 timestamp
        scheduleTimestampIfNeeded();
      }
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
        eventEmoji: typeof item.icon === 'string' ? item.icon : undefined,
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
  
  // ✅ Block-Level: 检查是否有 timestamp，用于控制 placeholder 显示
  const hasTimestamp = editor.children.some((node: any) => node.type === 'paragraph' && node.createdAt);
  
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
};

export const ModalSlate = forwardRef(ModalSlateComponent);
ModalSlate.displayName = 'ModalSlate';