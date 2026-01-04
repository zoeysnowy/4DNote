/**
 * LogSlate - TimeLog 专用的 Slate 编辑器
 * 
 * 功能：
 * 1. 支持标题和正文的富文本编辑
 * 2. 标题使用 colorTitle (Slate JSON)
 * 3. 正文使用 eventlog (Slate JSON)
 * 4. 共享 SlateCore 的元素和服务
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { createEditor, Descendant, Editor, Transforms, Node, Range } from 'slate';
import { Slate, Editable, withReact, RenderElementProps, RenderLeafProps, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';

// 导入 SlateCore 共享组件
import { TagElementComponent } from '@frontend/components/SlateCore/elements/TagElement';
import DateMentionElement from '@frontend/components/SlateCore/elements/DateMentionElement';
import { EventMentionElement } from '@frontend/components/SlateCore/elements/EventMentionElement';
// TimestampDividerElement 已废弃 - 使用 Block-Level Timestamp (paragraph.createdAt)

// 导入 SlateCore 格式化操作
import { applyTextFormat, toggleFormat } from '@frontend/components/SlateCore/operations/formatting';
import { insertTag, insertEmoji } from '@frontend/components/SlateCore/operations/inlineHelpers';
import { insertSoftBreak } from '@frontend/components/SlateCore/operations/paragraphOperations';

// 🆕 导入 TimestampService
import { EventLogTimestampService } from '@frontend/components/SlateCore/services/timestampService';

// 导入菜单组件
import { MentionMenu } from './MentionMenu';

import './LogSlate.css';

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

interface LogSlateProps {
  mode: 'title' | 'eventlog';
  value: string; // Slate JSON 字符串
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  onEnter?: () => void; // Enter 键回调（标题模式）
  onEscape?: () => void; // Escape 键回调
  onBlur?: () => void; // 失焦回调
  showToolbar?: boolean; // 是否显示工具栏（默认 eventlog 模式显示）
  enableMention?: boolean; // 是否启用 @ 提及（默认启用）
  enableHashtag?: boolean; // 是否启用 # 标签（默认启用）
  showPreline?: boolean; // 是否显示 preline（默认 true，TimeLog 中为 false）
  enableTimestamp?: boolean; // 🆕 是否启用自动 timestamp（首次输入时自动添加）
  eventId?: string; // 🆕 事件ID（用于timestamp）
}

export const LogSlate: React.FC<LogSlateProps> = ({
  mode,
  value,
  onChange,
  onBlur,
  placeholder,
  className = '',
  readOnly = false,
  autoFocus = false,
  onEnter,
  onEscape,
  showToolbar = mode === 'eventlog', // eventlog 模式默认显示工具栏
  enableMention = true,
  enableHashtag = true,
  showPreline = true, // 默认显示 preline（TimeLog 中传 false）
  enableTimestamp = false, // 🆕 默认不启用自动 timestamp
  eventId, // 🆕 事件ID
}) => {
  const editorRef = useRef<Editor | null>(null);
  const didAutoFocusRef = useRef(false);
  const isFocusedRef = useRef(false);
  const insertedTimestampThisFocusRef = useRef(false);
  const applyingTimestampRef = useRef(false);
  const lastParagraphPathRef = useRef<string>('');
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [hashtagSearch, setHashtagSearch] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const lastValueRef = useRef(value);
  const pendingValueRef = useRef<string | null>(null); // 缓存待保存的内容
  const isEditingRef = useRef(false); // 标记是否正在编辑
  
  // 🆕 TimestampService 实例（用于 5 分钟间隔判断）
  const timestampServiceRef = useRef<EventLogTimestampService | null>(null);
  if (!timestampServiceRef.current) {
    timestampServiceRef.current = new EventLogTimestampService();
  }
  
  // 创建编辑器实例（只创建一次）
  if (!editorRef.current) {
    const baseEditor = withHistory(createEditor());
    
    // 🆕 添加自定义插件：自动添加timestamp和末尾虚拟节点
    const withTimestampAndTrailing = (editor: Editor) => {
      const { normalizeNode, apply } = editor;
      
      // 🆕 获取最后一个 timestamp（用于判断是否需要新 timestamp）
      const getLastTimestamp = (): number | null => {
        for (let i = editor.children.length - 1; i >= 0; i--) {
          const node = editor.children[i] as any;
          if (node.type === 'paragraph' && node.createdAt) {
            return node.createdAt;
          }
        }
        return null;
      };
      
      // 🆕 判断是否应该创建新 timestamp（距离上次 > 5 分钟）
      const shouldCreateNewTimestamp = (): boolean => {
        const lastTimestamp = getLastTimestamp();
        if (!lastTimestamp) return true; // 没有历史 timestamp，创建新的
        
        const now = Date.now();
        const timeDiff = now - lastTimestamp;
        const fiveMinutes = 5 * 60 * 1000;
        
        return timeDiff >= fiveMinutes;
      };
      
      // 拦截操作：NOT 自动添加 createdAt（由光标插入事件控制）
      editor.apply = (operation) => {
        // 🔥 移除自动添加逻辑，改为由 handleChange 监听光标插入
        apply(operation);
      };
      
      editor.normalizeNode = (entry) => {
        const [node, path] = entry;
        
        // 如果是根节点且为空，添加一个空段落
        if (path.length === 0 && editor.children.length === 0) {
          Transforms.insertNodes(editor, {
            type: 'paragraph',
            children: [{ text: '' }],
          } as any, { at: [0] });
          return;
        }
        
        // 🆕 确保末尾始终有虚拟空段落（在根节点 normalize 时检查）
        if (path.length === 0 && enableTimestamp && mode === 'eventlog' && editor.children.length > 0) {
          const lastChild = editor.children[editor.children.length - 1] as any;
          
          if (lastChild && lastChild.type === 'paragraph') {
            const lastText = Node.string(lastChild);
            
            // 如果最后节点有内容，添加虚拟节点
            if (lastText.trim() !== '') {
              Transforms.insertNodes(editor, {
                type: 'paragraph',
                children: [{ text: '' }],
                // 不添加createdAt，等待用户输入时再添加
              } as any, { at: [editor.children.length] });
              console.log('[LogSlate] ✅ normalizeNode 添加末尾虚拟节点');
              return;
            }
          }
        }
        
        normalizeNode(entry);
      };
      
      return editor;
    };
    
    editorRef.current = withReact(withTimestampAndTrailing(baseEditor));
  }
  
  const editor = editorRef.current;

  // TimeLog(eventlog + showPreline=false) 下，Slate 的 placeholder 会使用绝对定位渲染，
  // 可能与 block-level timestamp 的绝对定位层叠；因此直接禁用。
  const effectivePlaceholder = useMemo(() => {
    if (mode === 'eventlog' && showPreline === false) return undefined;
    return placeholder;
  }, [mode, showPreline, placeholder]);
  
  // 解析值为 Slate 节点
  const parseValue = useCallback((val: string): Descendant[] => {
    try {
      if (!val || val.trim() === '') {
        return [
          {
            type: 'paragraph',
            children: [{ text: '' }],
          },
        ] as Descendant[];
      }
      
      const parsed = JSON.parse(val);
      
      // 验证是否是有效的 Slate 节点数组
      if (Array.isArray(parsed) && parsed.length > 0) {
        let nodes = parsed as Descendant[];

        // 🆕 eventlog + timestamp：仅当最后一个段落“确实有内容”时，追加一个末尾虚拟空段落，
        // 避免无意义的空行/placeholder 叠加（尤其是 timestamp-only 段落）。
        if (enableTimestamp && mode === 'eventlog') {
          const last = nodes[nodes.length - 1] as any;
          const isParagraph = last?.type === 'paragraph';
          const lastText = isParagraph ? Node.string(last).trim() : '';
          const lastHasCreatedAt = isParagraph && !!last?.createdAt;
          const lastHasNonTextChild = (() => {
            if (!isParagraph) return false;
            const children = Array.isArray(last.children) ? last.children : [];
            return children.some((c: any) => c && typeof c === 'object' && typeof c.text !== 'string');
          })();

          const lastIsVisuallyEmpty = isParagraph && lastText === '' && !lastHasNonTextChild;

          // 只有“最后段落有内容（文本或内联节点）”时才追加空段落；
          // 若最后段落是 timestamp-only（createdAt + 空文本），不再追加。
          if (!lastIsVisuallyEmpty && !(lastHasCreatedAt && lastText === '')) {
            nodes = [
              ...nodes,
              {
                type: 'paragraph',
                children: [{ text: '' }],
              } as Descendant,
            ];
          }
        }
        
        return nodes;
      }
      
      // 如果不是数组或为空，返回默认值
      return [
        {
          type: 'paragraph',
          children: [{ text: '' }],
        },
      ] as Descendant[];
    } catch (err) {
      console.error('[LogSlate] Failed to parse value:', err);
      // JSON 解析失败，尝试作为纯文本处理
      return [
        {
          type: 'paragraph',
          children: [{ text: val || '' }],
        },
      ] as Descendant[];
    }
  }, [enableTimestamp, mode]);
  
  // 初始值（只在首次渲染时使用）
  const initialValue = useMemo(() => parseValue(value), []);

  // 失焦保存前的轻量清理：移除空段落（包括末尾 placeholder）
  const cleanupSlateJson = useCallback((json: string): string => {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return json;

      const isEmptyParagraph = (node: any): boolean => {
        if (!node || node.type !== 'paragraph') return false;

        // 有 block-level timestamp 的 paragraph 不能当“空段落”清掉
        if (node.createdAt && typeof node.createdAt === 'number') return false;

        const children = Array.isArray(node.children) ? node.children : [];
        if (children.length === 0) return true;

        let hasNonWhitespaceText = false;
        let hasNonTextChild = false;

        for (const child of children) {
          if (child && typeof child.text === 'string') {
            if (child.text.trim() !== '') {
              hasNonWhitespaceText = true;
              break;
            }
          } else if (child && typeof child === 'object') {
            // tag / mention 等：不视为空
            hasNonTextChild = true;
            break;
          }
        }

        return !hasNonWhitespaceText && !hasNonTextChild;
      };

      const cleaned = (parsed as any[]).filter((node) => {
        if (!node) return false;
        if (node.type !== 'paragraph') return true;
        return !isEmptyParagraph(node);
      });

      return JSON.stringify(cleaned);
    } catch {
      return json;
    }
  }, []);
  
  // 同步外部 value 变化到编辑器
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastValueRef.current = value;
      return;
    }
    
    // 🔥 如果正在编辑，跳过外部 value 同步，避免重置编辑器
    if (isEditingRef.current) {
      console.log('[LogSlate] 正在编辑中，跳过外部 value 同步');
      return;
    }
    
    // 只在 value 真正变化时才同步
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      const newContent = parseValue(value);
      
      // 确保新内容不为空，防止崩溃
      if (newContent.length === 0) {
        newContent.push({
          type: 'paragraph',
          children: [{ text: '' }],
        } as Descendant);
      }
      
      // 清空编辑器并插入新内容
      Editor.withoutNormalizing(editor, () => {
        // 删除所有现有节点
        for (let i = editor.children.length - 1; i >= 0; i--) {
          Transforms.removeNodes(editor, { at: [i] });
        }
        // 插入新内容
        Transforms.insertNodes(editor, newContent, { at: [0] });
      });
    }
  }, [value, editor, parseValue]);
  
  // 处理内容变化
  const handleChange = useCallback((newValue: Descendant[]) => {
    const isAstChange = editor.operations.some(
      (op) => op.type !== 'set_selection'
    );

    const hasSplitNode = editor.operations.some((op) => op.type === 'split_node');
    const hasTextEdit = editor.operations.some((op) => op.type === 'insert_text' || op.type === 'remove_text');
    const hasStructuralEdit = editor.operations.some(
      (op) => op.type === 'insert_node' || op.type === 'remove_node' || op.type === 'merge_node'
    );
    
    if (isAstChange) {
      // 标记正在编辑
      isEditingRef.current = true;
      
      // 确保 editor 始终有内容，防止崩溃
      if (newValue.length === 0) {
        newValue = [{
          type: 'paragraph',
          children: [{ text: '' }],
        }] as Descendant[];
      }
      
      // 🆕 确保末尾虚拟节点（在内容变化时主动检查）
      if (enableTimestamp && eventId && mode === 'eventlog' && newValue.length > 0) {
        const lastChild = newValue[newValue.length - 1] as any;
        const lastText = Node.string(lastChild);
        
        // 如果最后节点有内容，需要添加虚拟节点
        if (lastText.trim() !== '') {
          console.log('[LogSlate] 📝 handleChange 检测到需要虚拟节点，触发 normalize');
          // 手动触发 normalize，让 normalizeNode 添加虚拟节点
          Editor.normalize(editor, { force: true });
        }
      }
      
      const json = JSON.stringify(newValue);
      // 🔥 只缓存，不立即调用 onChange（避免触发父组件重新渲染）
      pendingValueRef.current = json;
    }

    // ✅ timestamp（对齐你的设计）：
    // - timestamp 基于 paragraph.createdAt 渲染
    // - 触发点：光标进入“新空段落”（鼠标点击或 Enter split_node 产生新段落）
    // - 规则：只有在 eventlog 失焦超过 5min（按 service 规则）后，才允许创建新的 timestamp
    // - 防抖：同一次 focus 会话只创建一次 timestamp，避免“每次换行都插”
    // - 写入 createdAt 必须保留 selection，避免光标回跳
    if (enableTimestamp && eventId && mode === 'eventlog' && timestampServiceRef.current) {
      // 只要发生了真实文本编辑，就认为“这次会话在编辑中”
      if (isAstChange && (hasTextEdit || hasStructuralEdit)) {
        isEditingRef.current = true;
      }

      // selection 变化或 split_node 后：尝试在“新空段落”上补 createdAt
      if (editor.selection && !applyingTimestampRef.current) {
        const selectionSnapshot = editor.selection;
        const { anchor } = selectionSnapshot;

        try {
          const paragraphPath = anchor.path.slice(0, -1);
          const paragraphPathKey = JSON.stringify(paragraphPath);
          const movedToDifferentParagraph = paragraphPathKey !== lastParagraphPathRef.current;
          lastParagraphPathRef.current = paragraphPathKey;

          // 仅在：
          // - 用户进入了不同段落（跨行移动/点击） 或者
          // - 刚 split_node（回车生成新段落）
          // 时才做判断，避免每个 selection 变化都写节点
          if (movedToDifferentParagraph || hasSplitNode) {
            const [currentNode, currentPath] = Editor.node(editor, paragraphPath) as [any, any];

            const isEmptyParagraph = currentNode?.type === 'paragraph' && Node.string(currentNode).trim() === '';
            const hasCreatedAt = !!currentNode?.createdAt;

            if (isEmptyParagraph && !hasCreatedAt) {
              // 同一次 focus 会话只允许插一次 timestamp
              if (!insertedTimestampThisFocusRef.current) {
                const shouldInsert = timestampServiceRef.current.shouldInsertTimestamp({
                  contextId: eventId,
                  eventId
                });

                if (shouldInsert) {
                  applyingTimestampRef.current = true;
                  try {
                    Editor.withoutNormalizing(editor, () => {
                      // 🧹 TimeLog 体验修复：避免 timestamp 上方残留空段落导致光标“靠下/空一行”
                      // 仅清理当前段落前面紧挨着的空 paragraph（无文本、无 createdAt）
                      try {
                        if (
                          mode === 'eventlog' &&
                          showPreline === false &&
                          Array.isArray(currentPath) &&
                          currentPath.length === 1
                        ) {
                          let i = currentPath[0] - 1;
                          while (i >= 0) {
                            const prev = editor.children[i] as any;
                            if (!prev || prev.type !== 'paragraph') break;
                            const prevText = Node.string(prev).trim();
                            const prevHasCreatedAt = !!prev.createdAt;
                            if (prevText === '' && !prevHasCreatedAt) {
                              Transforms.removeNodes(editor, { at: [i] });
                              i--;
                              continue;
                            }
                            break;
                          }
                        }
                      } catch {
                        // ignore
                      }

                      timestampServiceRef.current!.insertBlockLevelTimestamp(editor, currentPath, eventId);
                      try {
                        Transforms.select(editor, selectionSnapshot);
                      } catch {
                        // ignore
                      }
                    });
                    insertedTimestampThisFocusRef.current = true;
                  } finally {
                    applyingTimestampRef.current = false;
                  }
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }
    
    // 检测 @ 提及触发
    if (enableMention && editor.selection) {
      const { anchor } = editor.selection;
      const [node] = Editor.node(editor, anchor.path);
      const text = (node as any).text || '';
      const beforeCursor = text.slice(0, anchor.offset);
      const match = beforeCursor.match(/@(\w*)$/);
      
      if (match) {
        setMentionSearch(match[1]);
      } else {
        setMentionSearch(null);
      }
    }
    
    // 检测 # 标签触发
    if (enableHashtag && editor.selection) {
      const { anchor } = editor.selection;
      const [node] = Editor.node(editor, anchor.path);
      const text = (node as any).text || '';
      const beforeCursor = text.slice(0, anchor.offset);
      const match = beforeCursor.match(/#([\w\u4e00-\u9fa5]*)$/);
      
      if (match) {
        setHashtagSearch(match[1]);
      } else {
        setHashtagSearch(null);
      }
    }
    
    // 显示/隐藏浮动工具栏
    if (showToolbar && editor.selection && !Range.isCollapsed(editor.selection)) {
      setShowFloatingToolbar(true);
    } else {
      setShowFloatingToolbar(false);
    }
  }, [editor, onChange, enableMention, enableHashtag, showToolbar, enableTimestamp, eventId, mode]);
  
  // 渲染元素
  const renderElement = useCallback((props: RenderElementProps) => {
    const { element } = props;
    const para = element as any;
    
    switch (para.type) {
      case 'paragraph': {
        // 🆕 [Block-Level Timestamp] 检查是否有时间戳元数据
        const hasBlockTimestamp = !!(para.createdAt && typeof para.createdAt === 'number');
        
        // 🔧 检查段落内容是否为空
        const paragraphText = para.children?.map((child: any) => child.text || '').join('').trim();
        const isEmptyParagraph = !paragraphText;
        
        // 🆕 显示时间戳逻辑：
        // - TimeLog 模式（showPreline=false）：允许空段落显示（用户插入光标后应立即看到 timestamp）
        // - 其他模式：保持原逻辑（有 createdAt 就显示）
        // - title 模式：永不显示 timestamp
        const shouldShowTimestamp = hasBlockTimestamp && mode !== 'title';
        
        // TimeLog 模式（showPreline = false）：显示浅灰色时间戳
        if (!showPreline && shouldShowTimestamp) {
          return (
            <div
              style={{
                position: 'relative',
                paddingTop: '28px'
              }}
            >
              {/* 🆕 Block-Level Timestamp 显示（浅灰色） */}
              <div
                contentEditable={false}
                style={{
                  position: 'absolute',
                  left: '0',
                  top: '8px',
                  fontSize: '12px',
                  color: '#999',
                  opacity: 0.7,
                  userSelect: 'none',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap'
                }}
              >
                {formatDateTime(new Date(para.createdAt))}
              </div>
              <p {...props.attributes} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{props.children}</p>
            </div>
          );
        }
        
        // TimeLog 模式（无时间戳）：直接渲染段落
        if (!showPreline) {
          // ⚠️ 关键：TimeLog 里必须移除 <p> 默认 margin，否则光标会“空一行”看起来偏下
          return (
            <p {...props.attributes} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {props.children}
            </p>
          );
        }
        
        // LogTab/ModalSlate 模式：显示 preline（基于 Block-Level Timestamp）
        const needsPreline = (() => {
          try {
            if (!editorRef.current) return false;
            const editor = editorRef.current;
            const path = ReactEditor.findPath(editor, element);
            if (!path) return false;
            
            // 向上查找最近的有 createdAt 的 paragraph
            let hasPrecedingTimestamp = false;
            
            for (let i = path[0] - 1; i >= 0; i--) {
              const node = editor.children[i] as any;
              // 如果找到有 createdAt 的 paragraph，表示需要 preline
              if (node.type === 'paragraph' && node.createdAt) {
                hasPrecedingTimestamp = true;
                break;
              }
              // 如果遇到其他类型节点，停止查找
              if (node.type !== 'paragraph') {
                break;
              }
            }
            
            return hasPrecedingTimestamp;
          } catch {
            return false;
          }
        })();
        
        // 🆕 显示时间戳（LogTab 模式）
        // 同样：有 createdAt 就显示（包括空段落）
        const shouldShowTimestampWithPreline = showPreline && hasBlockTimestamp && mode !== 'title';
        
        return (
          <div
            {...props.attributes}
            style={{
              position: 'relative',
              paddingLeft: needsPreline ? '20px' : '0',
              minHeight: needsPreline ? '20px' : 'auto',
              paddingTop: shouldShowTimestampWithPreline ? '28px' : '0'
            }}
          >
            {/* 🆕 Block-Level Timestamp 显示（LogTab 模式） */}
            {shouldShowTimestampWithPreline && (
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
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {formatDateTime(new Date(para.createdAt))}
              </div>
            )}
            {needsPreline && (
              <div
                contentEditable={false}
                style={{
                  position: 'absolute',
                  left: '8px',
                  top: shouldShowTimestamp ? '0' : '-28px',
                  bottom: '0',
                  width: '2px',
                  background: '#e5e7eb',
                  zIndex: 0,
                  pointerEvents: 'none'
                }}
              />
            )}
            <p style={{ margin: 0 }}>{props.children}</p>
          </div>
        );
      }
      case 'tag':
        return <TagElementComponent {...props} />;
      case 'date-mention':
        return <DateMentionElement {...props} />;
      case 'event-mention':
        return <EventMentionElement {...(props as any)} />;
      default:
        return <div {...props.attributes}>{props.children}</div>;
    }
  }, [showPreline]);
  
  // 渲染叶子节点
  const renderLeaf = useCallback((props: RenderLeafProps) => {
    let { children } = props;
    const { leaf } = props;
    
    if ((leaf as any).bold) {
      children = <strong>{children}</strong>;
    }
    if ((leaf as any).italic) {
      children = <em>{children}</em>;
    }
    if ((leaf as any).underline) {
      children = <u>{children}</u>;
    }
    if ((leaf as any).strikethrough) {
      children = <s>{children}</s>;
    }
    if ((leaf as any).code) {
      children = <code>{children}</code>;
    }
    if ((leaf as any).color) {
      children = <span style={{ color: (leaf as any).color }}>{children}</span>;
    }
    if ((leaf as any).backgroundColor) {
      children = <span style={{ backgroundColor: (leaf as any).backgroundColor }}>{children}</span>;
    }
    
    return <span {...props.attributes}>{children}</span>;
  }, []);
  
  // 键盘事件处理
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // 标题模式下，Enter 键保存
    if (mode === 'title' && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (onEnter) {
        onEnter();
      }
      return;
    }
    
    // Escape 键取消
    if (event.key === 'Escape') {
      event.preventDefault();
      if (onEscape) {
        onEscape();
      }
      return;
    }

    // ✅ TimeLog（showPreline=false）模式：Enter 作为“段内换行”而不是新段落
    // - Enter: 插入 "\n"（soft break）
    // - Ctrl/Meta+Enter: 保持默认行为（新段落，用于显式开启新块/新时间段）
    if (
      mode === 'eventlog' &&
      showPreline === false &&
      event.key === 'Enter' &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      try {
        insertSoftBreak(editor);
      } catch {
        // ignore
      }
      return;
    }
    
    // @ 键触发提及
    if (enableMention && event.key === '@' && !mentionSearch) {
      // 将在输入后通过 onChange 检测
    }
    
    // # 键触发标签
    if (enableHashtag && event.key === '#' && !hashtagSearch) {
      // 将在输入后通过 onChange 检测
    }
    
    // 格式化快捷键
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'b':
          event.preventDefault();
          toggleFormat(editor, 'bold');
          break;
        case 'i':
          event.preventDefault();
          toggleFormat(editor, 'italic');
          break;
        case 'u':
          event.preventDefault();
          toggleFormat(editor, 'underline');
          break;
      }
    }
  }, [mode, onEnter, onEscape, enableMention, enableHashtag, mentionSearch, hashtagSearch, editor]);
  
  // 自动聚焦
  useEffect(() => {
    if (!editor) return;
    // 允许多次进入编辑态时重复 autoFocus（例如通过菜单打开/关闭同一行标题）
    if (!autoFocus) {
      didAutoFocusRef.current = false;
      return;
    }
    if (didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;

    const attemptFocusAndSelect = (retries: number) => {
      requestAnimationFrame(() => {
        try {
          ReactEditor.focus(editor as ReactEditor);
        } catch (err) {
          console.error('[LogSlate] Failed to focus:', err);
        }

        try {
          // 极端情况下（快速切换/卸载-挂载边界）可能出现空文档：先补一个段落，再选区
          if (editor.children.length === 0) {
            Transforms.insertNodes(
              editor,
              {
                type: 'paragraph',
                children: [{ text: '' }],
              } as any,
              { at: [0] }
            );
          }

          // autoFocus 是“显式进入编辑态”的信号：强制把光标放到末尾，
          // 避免 editor.selection 处于陈旧/无效状态导致“placeholder 消失但无光标”。
          Transforms.select(editor, Editor.end(editor, []));
        } catch (err) {
          try {
            // 兜底：末尾选区失败时尝试选到开头
            Transforms.select(editor, Editor.start(editor, []));
          } catch (err2) {
            console.error('[LogSlate] Failed to select:', err, err2);
          }
        }

        if (!editor.selection && retries > 0) {
          attemptFocusAndSelect(retries - 1);
        }
      });
    };

    try {
      // 下一帧聚焦 + 把光标放到末尾：
      // - 避免用户进入编辑时“光标在句首”的错觉
      // - 也给末尾虚拟节点一个更自然的默认输入点
      // - 额外重试一次，避免渲染/DOM 时序导致的选区丢失
      attemptFocusAndSelect(1);
    } catch (err) {
      console.error('[LogSlate] Failed to schedule focus:', err);
    }
  }, [autoFocus, editor]);
  
  // 工具栏命令处理
  const handleToolbarCommand = useCallback((command: string, value?: any) => {
    console.log('[LogSlate] Toolbar command:', command, value);
    
    switch (command) {
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strikeThrough':
      case 'textColor':
      case 'backgroundColor':
        applyTextFormat(editor, command, value);
        break;
      case 'insertTag':
        if (value) {
          insertTag(editor, value.id, value.name, value.color, value.emoji);
        }
        break;
      case 'insertEmoji':
        if (value) {
          insertEmoji(editor, value);
        }
        break;
    }
  }, [editor]);
  
  // 处理 @ 提及选择
  const handleMentionSelect = useCallback((item: any) => {
    if (!editor.selection) return;
    
    // 删除输入的 @xxx 文本
    const { anchor } = editor.selection;
    const [node] = Editor.node(editor, anchor.path);
    const text = (node as any).text || '';
    const beforeCursor = text.slice(0, anchor.offset);
    const match = beforeCursor.match(/@(\w*)$/);
    
    if (match) {
      const matchLength = match[0].length;
      Transforms.delete(editor, {
        distance: matchLength,
        reverse: true,
      });
    }
    
    // 插入事件提及节点
    const mentionNode = {
      type: 'event-mention',
      eventId: item.id,
      eventTitle: item.name,
      children: [{ text: '' }],
    };
    
    Transforms.insertNodes(editor, mentionNode as any);
    Transforms.move(editor);
    
    setMentionSearch(null);
    ReactEditor.focus(editor as ReactEditor);
  }, [editor]);
  
  // 处理 # 标签选择
  const handleHashtagSelect = useCallback((item: any) => {
    if (!editor.selection) return;
    
    // 删除输入的 #xxx 文本
    const { anchor } = editor.selection;
    const [node] = Editor.node(editor, anchor.path);
    const text = (node as any).text || '';
    const beforeCursor = text.slice(0, anchor.offset);
    const match = beforeCursor.match(/#([\w\u4e00-\u9fa5]*)$/);
    
    if (match) {
      const matchLength = match[0].length;
      Transforms.delete(editor, {
        distance: matchLength,
        reverse: true,
      });
    }
    
    // 插入标签节点
    insertTag(editor, item.id, item.name, item.color, item.emoji);
    
    setHashtagSearch(null);
    ReactEditor.focus(editor as ReactEditor);
  }, [editor]);
  
  return (
    <div className={`log-slate-wrapper ${mode}-mode ${className}`}>
      <Slate editor={editor} initialValue={initialValue} onChange={handleChange}>
        {/* TODO: 实现简化的格式化工具栏 */}
        {/* {showToolbar && showFloatingToolbar && !readOnly && (
          <SimpleToolbar onCommand={handleToolbarCommand} />
        )} */}
        
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          placeholder={effectivePlaceholder}
          readOnly={readOnly}
          className={`log-slate-editable ${mode}-editable`}
          onFocus={() => {
            isFocusedRef.current = true;
            insertedTimestampThisFocusRef.current = false;
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            console.log('🔍 [LogSlate] onBlur 触发', {
              mode,
              hasPendingValue: pendingValueRef.current !== null,
              pendingValueLength: pendingValueRef.current?.length,
              isEditing: isEditingRef.current
            });

            const hadRealEdit = pendingValueRef.current !== null || isEditingRef.current;

            // 标记编辑结束（必须在触发 onChange 之前，避免外部 value 同步被“正在编辑”拦截）
            isEditingRef.current = false;

            // 失焦时保存缓存的内容（先清理空节点，避免 placeholder/空行落盘与残留 UI）
            if (pendingValueRef.current !== null) {
              const cleanedJson = cleanupSlateJson(pendingValueRef.current);
              console.log('📤 [LogSlate] 调用 onChange（已清理空节点）', {
                valueLength: cleanedJson.length
              });
              onChange(cleanedJson);
              pendingValueRef.current = null;

              // 同步清理到当前 editor，避免 blur 后仍看到空段落
              try {
                const cleanedNodes = JSON.parse(cleanedJson);
                if (Array.isArray(cleanedNodes)) {
                  Editor.withoutNormalizing(editor, () => {
                    for (let i = editor.children.length - 1; i >= 0; i--) {
                      Transforms.removeNodes(editor, { at: [i] });
                    }
                    Transforms.insertNodes(editor, cleanedNodes as any, { at: [0] });
                  });
                }
              } catch {
                // ignore
              }
            } else {
              console.warn('⚠️ [LogSlate] 没有待保存的内容');
            }

            // ✅ 对齐规则：以 blur 作为“失焦时间”基准（用于 5min 规则）
            if (enableTimestamp && eventId && mode === 'eventlog' && timestampServiceRef.current) {
              // 只有发生真实编辑才更新时间，避免“点一下就把 5min 窗口重置”
              if (hadRealEdit) {
                timestampServiceRef.current.updateLastEditTime(eventId, new Date());
              }
            }
            isFocusedRef.current = false;
            insertedTimestampThisFocusRef.current = false;
            
            // 调用外部 onBlur
            console.log('📞 [LogSlate] 调用外部 onBlur', { hasExternalBlur: !!onBlur });
            onBlur?.();
          }}
        />
        
        {/* @ 提及菜单 */}
        {mentionSearch !== null && (
          <MentionMenu
            type="mention"
            search={mentionSearch}
            onSelect={handleMentionSelect}
            onClose={() => setMentionSearch(null)}
          />
        )}
        
        {/* # 标签菜单 */}
        {hashtagSearch !== null && (
          <MentionMenu
            type="hashtag"
            search={hashtagSearch}
            onSelect={handleHashtagSelect}
            onClose={() => setHashtagSearch(null)}
          />
        )}
      </Slate>
    </div>
  );
};
