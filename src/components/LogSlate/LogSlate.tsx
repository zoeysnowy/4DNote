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
import { TagElementComponent } from '../SlateCore/elements/TagElement';
import DateMentionElement from '../SlateCore/elements/DateMentionElement';
import { TimestampDividerElement } from '../SlateCore/elements/TimestampDividerElement';
import { EventMentionElement } from '../SlateCore/elements/EventMentionElement';

// 导入 SlateCore 格式化操作
import { applyTextFormat, toggleFormat } from '../SlateCore/operations/formatting';
import { insertTag, insertEmoji } from '../SlateCore/operations/inlineHelpers';

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
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [hashtagSearch, setHashtagSearch] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const lastValueRef = useRef(value);
  const pendingValueRef = useRef<string | null>(null); // 缓存待保存的内容
  const isEditingRef = useRef(false); // 标记是否正在编辑
  
  // 创建编辑器实例（只创建一次）
  if (!editorRef.current) {
    const baseEditor = withHistory(createEditor());
    
    // 🆕 添加自定义插件：自动添加timestamp和末尾虚拟节点
    const withTimestampAndTrailing = (editor: Editor) => {
      const { normalizeNode, apply } = editor;
      
      // 拦截操作，在插入新paragraph时自动添加createdAt
      editor.apply = (operation) => {
        if (enableTimestamp && eventId && mode === 'eventlog' && operation.type === 'insert_node') {
          const node = operation.node as any;
          if (node.type === 'paragraph' && !node.createdAt) {
            // 给新插入的paragraph添加createdAt
            node.createdAt = Date.now();
            console.log('[LogSlate] 🆕 自动添加 createdAt 到新 paragraph:', new Date(node.createdAt).toLocaleString());
          }
        }
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
        
        // 🆕 如果是 eventlog 模式且启用 timestamp，自动添加末尾虚拟节点
        if (enableTimestamp && mode === 'eventlog') {
          const lastNode = nodes[nodes.length - 1] as any;
          const lastText = lastNode?.children?.[0]?.text || '';
          
          // 如果最后节点有内容，添加虚拟节点
          if (lastText.trim() !== '') {
            nodes = [...nodes, {
              type: 'paragraph',
              children: [{ text: '' }],
            } as Descendant];
            console.log('[LogSlate] 📦 parseValue 添加末尾虚拟节点（静态处理）');
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
        const isEmptyOrSignature = !paragraphText;
        
        // 🔧 title 模式永不显示 timestamp（避免标题中出现时间戳）
        // 🔧 空段落或签名段落不显示 timestamp
        const shouldShowTimestamp = hasBlockTimestamp && mode !== 'title' && !isEmptyOrSignature;
        
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
                  whiteSpace: 'nowrap'
                }}
              >
                {formatDateTime(new Date(para.createdAt))}
              </div>
              <p {...props.attributes} style={{ margin: 0 }}>{props.children}</p>
            </div>
          );
        }
        
        // TimeLog 模式（无时间戳）：直接渲染段落
        if (!showPreline) {
          return <p {...props.attributes}>{props.children}</p>;
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
        // 🔧 title 模式永不显示 timestamp
        // 🔧 空段落或签名段落不显示 timestamp
        const shouldShowTimestampWithPreline = showPreline && hasBlockTimestamp && mode !== 'title' && !isEmptyOrSignature;
        
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
                  opacity: 0.7
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
      case 'timestamp-divider': {
        // 🔧 兼容旧格式 timestamp-divider（逐步废弃）
        // TimeLog 模式：timestamp 左对齐，无 paddingLeft
        if (!showPreline) {
          const node = element as any;
          return (
            <div
              {...props.attributes}
              contentEditable={false}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                marginBottom: '0',
                paddingTop: '8px',
                paddingBottom: '4px',
                opacity: 0.7,
                userSelect: 'none'
              }}
            >
              <span 
                style={{
                  fontSize: '12px',
                  color: '#999',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                  zIndex: 1
                }}
              >
                {node.displayText || new Date(node.timestamp).toLocaleString()}
              </span>
              {props.children}
            </div>
          );
        }
        
        // LogTab/ModalSlate 模式：保持原样式（带 paddingLeft）
        return <TimestampDividerElement {...props} />;
      }
      case 'event-mention':
        return <EventMentionElement {...props} />;
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
    if (autoFocus && editor) {
      try {
        ReactEditor.focus(editor);
      } catch (err) {
        console.error('[LogSlate] Failed to focus:', err);
      }
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
          placeholder={placeholder}
          readOnly={readOnly}
          className={`log-slate-editable ${mode}-editable`}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            console.log('🔍 [LogSlate] onBlur 触发', {
              mode,
              hasPendingValue: pendingValueRef.current !== null,
              pendingValueLength: pendingValueRef.current?.length,
              isEditing: isEditingRef.current
            });
            
            // 失焦时保存缓存的内容
            if (pendingValueRef.current !== null) {
              console.log('📤 [LogSlate] 调用 onChange', {
                valueLength: pendingValueRef.current.length
              });
              onChange(pendingValueRef.current);
              pendingValueRef.current = null;
            } else {
              console.warn('⚠️ [LogSlate] 没有待保存的内容');
            }
            
            // 标记编辑结束
            isEditingRef.current = false;
            
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
