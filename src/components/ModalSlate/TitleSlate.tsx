/**
 * TitleSlate - 标题专用的 Slate 编辑器
 * 
 * 设计目标：
 * - 单行编辑（禁止换行）
 * - 支持富文本格式（颜色、粗体、斜体等）
 * - 支持 Tag 元素
 * - 自动宽度调整
 * - 集成 FloatingToolbar
 * 
 * 与 ModalSlate 的区别：
 * - TitleSlate: 单行标题，禁止换行，无 timestamp
 * - ModalSlate: 多段落内容，支持换行，有 timestamp
 */

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { 
  createEditor, 
  Descendant, 
  Editor, 
  Transforms, 
  Text,
  Node as SlateNode,
  Element as SlateElement,
  Range
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

// 从 SlateCore 导入共享类型
import type { 
  ParagraphNode,
  TextNode,
  TagNode
} from '../SlateCore/types';

import {
  applyTextFormat as slateApplyTextFormat,
  jsonToSlateNodes as slateJsonToNodes,
  slateNodesToJson as slateNodesToJsonCore,
} from '../SlateCore';

// 共享元素组件
import { TagElementComponent } from '../SlateCore/elements/TagElement';

import './TitleSlate.css';

type CustomElement = ParagraphNode | TagNode;
type CustomText = TextNode;

export interface TitleSlateProps {
  /** 事件 ID（用于检测切换事件） */
  eventId: string;
  
  /** Slate JSON 内容 (fullTitle) */
  content: string;
  
  /** 内容变化回调 - 返回 Slate JSON 字符串 */
  onChange: (slateJson: string) => void;
  
  /** 占位符文本 */
  placeholder?: string;
  
  /** CSS 类名 */
  className?: string;
  
  /** 是否只读 */
  readOnly?: boolean;
  
  /** 是否自动聚焦 */
  autoFocus?: boolean;
  
  /** 是否隐藏 emoji (emoji 单独显示时使用) */
  hideEmoji?: boolean;
}

const TitleSlateComponent: React.FC<TitleSlateProps> = ({
  eventId,
  content,
  onChange,
  placeholder = '输入标题...',
  className = '',
  readOnly = false,
  autoFocus = false,
  hideEmoji = true // 默认隐藏 emoji
}) => {
  // 🎬 组件mount日志
  console.log('🎬 [TitleSlate] 组件正在mount/render', { 
    eventId, 
    readOnly, 
    autoFocus
  });
  
  // 创建 Slate 编辑器实例（只创建一次，永不重建）
  const editorRef = useRef<Editor | null>(null);
  if (!editorRef.current) {
    editorRef.current = withHistory(withReact(createEditor()));
  }
  const editor = editorRef.current;

  // 🔧 解析 content 的辅助函数（参考 LogSlate）
  const parseContent = useCallback((content: string): Descendant[] => {
    console.log('🔍 [TitleSlate.parseContent] 开始解析:', { 
      content, 
      type: typeof content,
      isString: typeof content === 'string',
      length: content?.length 
    });
    
    if (!content || content.trim() === '') {
      return [{ type: 'paragraph', children: [{ text: '' }] }] as Descendant[];
    }
    
    try {
      const parsed = slateJsonToNodes(content);
      console.log('✅ [TitleSlate.parseContent] 解析成功:', parsed);
      
      // 验证解析结果
      if (!parsed || parsed.length === 0) {
        return [{ type: 'paragraph', children: [{ text: '' }] }] as Descendant[];
      }
      
      // 确保第一个节点有 children
      const firstNode = parsed[0] as any;
      if (!firstNode.children || firstNode.children.length === 0) {
        return [{ type: 'paragraph', children: [{ text: '' }] }] as Descendant[];
      }
      
      // 确保只有一个段落
      if (parsed.length > 1) {
        // 合并所有段落
        const mergedChildren: any[] = [];
        parsed.forEach(node => {
          if (SlateElement.isElement(node) && node.type === 'paragraph' && (node as any).children) {
            mergedChildren.push(...(node as any).children);
          }
        });
        
        // 确保合并后有内容
        if (mergedChildren.length === 0) {
          mergedChildren.push({ text: '' });
        }
        
        return [{ type: 'paragraph', children: mergedChildren }] as Descendant[];
      }
      return parsed;
    } catch (error) {
      console.error('❌ [TitleSlate] 解析失败:', error, content);
      return [{ type: 'paragraph', children: [{ text: '' }] }] as Descendant[];
    }
  }, []);

  // 🔧 初始值（只在首次渲染时使用，后续通过 useEffect 更新）
  const initialValue = useMemo(() => parseContent(content), []);

  // ❌ 删除 value state（不受控组件，不需要）
  const isInitializedRef = useRef(false);
  const hasLoadedContentRef = useRef(false); // 🔧 标记是否已加载过非空内容
  const lastContentRef = useRef(content);
  const isEditingRef = useRef(false); // 标记是否正在编辑

  // 🔄 同步外部 content 变化到编辑器（完全参考 LogSlate）
  useEffect(() => {
    console.log('🔍 [TitleSlate useEffect] 触发:', {
      isInitialized: isInitializedRef.current,
      isEditing: isEditingRef.current,
      contentChanged: content !== lastContentRef.current,
      lastContent: lastContentRef.current?.substring(0, 50),
      newContent: content?.substring(0, 50)
    });
    
    // 🔧 Cleanup: 检测组件是否被unmount
    return () => {
      console.log('💀 [TitleSlate] useEffect cleanup - 组件可能被unmount或依赖项变化', {
        isEditing: isEditingRef.current
      });
    };
  }, [eventId]); // 依赖项只有eventId
  
  useEffect(() => {
    console.log('🔍 [TitleSlate content sync useEffect] 触发:', {
      isInitialized: isInitializedRef.current,
      isEditing: isEditingRef.current,
      contentChanged: content !== lastContentRef.current,
      lastContent: lastContentRef.current?.substring(0, 50),
      newContent: content?.substring(0, 50)
    });
    
    // 🔧 首次初始化时（还未获得焦点），允许更新内容
    if (!isInitializedRef.current && content !== lastContentRef.current) {
      console.log('🎨 [TitleSlate] 首次初始化，更新编辑器内容');
      lastContentRef.current = content;
      const newValue = parseContent(content);
      
      // 清空编辑器并插入新内容
      Editor.withoutNormalizing(editor, () => {
        // 删除所有现有节点
        for (let i = editor.children.length - 1; i >= 0; i--) {
          Transforms.removeNodes(editor, { at: [i] });
        }
        // 插入新内容
        Transforms.insertNodes(editor, newValue, { at: [0] });
      });
      return;
    }
    
    // 🔥 如果正在编辑，跳过外部 content 同步，避免重置编辑器
    // 🔧 但是！如果还没加载过内容（首次从空到有内容），允许更新
    if (isEditingRef.current && hasLoadedContentRef.current) {
      console.log('⏭️ [TitleSlate] 正在编辑中，跳过外部 content 同步');
      return;
    }
    
    // 只在 content 真正变化时才同步
    if (content !== lastContentRef.current) {
      console.warn('⚠️ [TitleSlate] content 变化，重置编辑器！', {
        oldContent: lastContentRef.current?.substring(0, 50),
        newContent: content?.substring(0, 50)
      });
      lastContentRef.current = content;
      const newValue = parseContent(content);
      
      // 清空编辑器并插入新内容
      Editor.withoutNormalizing(editor, () => {
        // 删除所有现有节点
        for (let i = editor.children.length - 1; i >= 0; i--) {
          Transforms.removeNodes(editor, { at: [i] });
        }
        // 插入新内容
        Transforms.insertNodes(editor, newValue, { at: [0] });
      });
      
      // 🔧 标记已加载过内容（非空内容）
      if (content && content !== '[{"type":"paragraph","children":[{"text":""}]}]') {
        hasLoadedContentRef.current = true;
      }
    }
  }, [content, eventId]); // 🔧 监听 content 和 eventId，允许首次初始化时更新

  // 🔥 实时保存模式：AST 变化时立即序列化并通过 onChange 向上抛出
  const handleChange = useCallback((newValue: Descendant[]) => {
    const isAstChange = editor.operations.some(
      (op) => op.type !== 'set_selection'
    );
    
    // 🔧 [2024-12-09] 监控 selection 变化，检测失焦和光标跳转
    const hasSelectionChange = editor.operations.some(
      (op) => op.type === 'set_selection'
    );
    
    if (hasSelectionChange) {
      const hasSelection = !!editor.selection;
      console.log('🎯 [TitleSlate handleChange] Selection 变化', {
        hasSelection,
        selection: editor.selection,
        operations: editor.operations.map(op => ({
          type: op.type,
          path: (op as any).path,
          offset: (op as any).offset,
          newProperties: (op as any).newProperties
        })),
        isEditing: isEditingRef.current
      });
      
      if (!hasSelection && isEditingRef.current) {
        console.error('🚨 [TitleSlate] Selection 被清空！可能导致失焦', {
          operations: editor.operations.map(op => op.type),
          isEditing: isEditingRef.current
        });
      }
    }
    
    if (isAstChange) {
      // 🔧 延迟标记正在编辑,避免 autoFocus 触发 content sync 立即重置
      // 只有真正有内容变化时才标记(不是 set_selection)
      setTimeout(() => {
        isEditingRef.current = true;
      }, 0);
      
      // 🔥 直接序列化并通过 onChange 向上抛出（与 ModalSlate 保持一致，避免 IME + blur 导致的 selection 错位）
      try {
        const json = slateNodesToJsonCore(newValue);
        console.log('💾 [TitleSlate] 实时保存变化:', json.slice(0, 80));
        onChange(json);
      } catch (error) {
        console.error('[TitleSlate] 序列化失败:', error);
      }
    }
  }, [editor, onChange]);
  // 🔥 聚焦时标记为编辑状态
  const handleFocus = useCallback(() => {
    console.log('🎯 [TitleSlate] 聚焦,标记为编辑状态');
    isEditingRef.current = true;
  }, []);
  
  // 🔧 [2024-12-09] onClick handler 使用 useCallback 避免每次渲染创建新函数
  const handleClick = useCallback(() => {
    console.log('🖱️ [TitleSlate] 点击编辑器', {
      readOnly,
      hasSelection: !!editor.selection,
      childrenLength: editor.children.length,
      editorChildren: editor.children
    });
    
    // 🔧 点击时立即标记为编辑中，防止 Layer 2 auto-save 触发 content 同步
    isEditingRef.current = true;
    
    // 🔥 如果没有选区，手动设置光标到开头
    if (!editor.selection) {
      console.log('⚠️ [TitleSlate] 没有选区，手动设置光标');
      try {
        Transforms.select(editor, {
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [0, 0], offset: 0 }
        });
        ReactEditor.focus(editor);
      } catch (err) {
        console.error('❌ [TitleSlate] 设置光标失败:', err);
      }
    }
  }, [editor, readOnly]);
  
  // 🔧 [2024-12-09] onFocus handler 使用 useCallback
  const handleFocusEvent = useCallback(() => {
    console.log('🎯 [TitleSlate] 聚焦编辑器', {
      readOnly,
      childrenLength: editor.children.length
    });
    // 🔧 获得焦点时标记为已初始化和编辑中
    isInitializedRef.current = true;
    handleFocus(); // 🔧 调用 handleFocus 标记编辑状态
  }, [editor, readOnly, handleFocus]);
  
  // 🔧 [2024-12-09] Composition handlers 使用 useCallback

  
  // 🔧 目前 TitleSlate 不处理快捷键和 Enter，交给上层或默认行为
  // 保持实现简单，最大程度减少对 IME 的干扰

  // 🔥 失焦：仅标记编辑结束，不再参与保存逻辑（保存已在 handleChange 完成）
  const handleBlur = useCallback((event: React.FocusEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    const activeEl = document.activeElement as HTMLElement | null;
    console.log('🎯 [TitleSlate] 失焦', {
      relatedTarget: relatedTarget?.tagName,
      relatedTargetClass: relatedTarget?.className,
      activeElement: activeEl?.tagName,
      activeElementClass: activeEl?.className,
      activeElementId: activeEl?.id
    });

    isEditingRef.current = false;
  }, []);

  // 渲染元素
  // 渲染元素
  const renderElement = useCallback((props: RenderElementProps) => {
    const element = props.element as CustomElement;
    
    switch (element.type) {
      case 'paragraph':
        return <p {...props.attributes}>{props.children}</p>;
      
      case 'tag':
        return <TagElementComponent {...props} element={element as TagNode} />;
      
      default:
        return <p {...props.attributes}>{props.children}</p>;
    }
  }, []);

  // 渲染文本叶子节点
  const renderLeaf = useCallback((props: RenderLeafProps) => {
    const leaf = props.leaf as CustomText;
    
    // 在标题行且 hideEmoji 为 true 时，用 CSS 类隐藏 emoji
    // 不修改 props.children，保持 Slate 文本完整性
    let children = <>{props.children}</>;
    
    // 应用文本格式
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
    if (leaf.code) {
      children = <code>{children}</code>;
    }
    
    // 应用颜色样式
    const style: React.CSSProperties = {};
    if (leaf.color) {
      style.color = leaf.color;
    }
    if (leaf.backgroundColor) {
      style.backgroundColor = leaf.backgroundColor;
    }
    
    if (Object.keys(style).length > 0) {
      children = <span style={style}>{children}</span>;
    }
    
    // 如果需要隐藏 emoji，给最外层 span 加一个特殊类名
    const className = hideEmoji ? 'hide-emoji-leaf' : undefined;
    
    return <span {...props.attributes} className={className}>{children}</span>;
  }, [hideEmoji]);

  return (
    <div className={`title-slate-container ${className}`}>
      <Slate editor={editor} initialValue={initialValue} onChange={handleChange}>
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          placeholder={placeholder}
          readOnly={readOnly}
          autoFocus={autoFocus}
          className="title-slate-editable"
          onBlur={handleBlur}
          onClick={handleClick}
          onFocus={handleFocusEvent}
        />
      </Slate>
    </div>
  );
};

// 🔧 [2024-12-09] 使用 React.memo 优化，避免父组件重渲染时 TitleSlate 不必要的重渲染
// 特别是在 IME composition 期间，任何重渲染都会导致光标位置错误
export const TitleSlate = React.memo(TitleSlateComponent, (prevProps, nextProps) => {
  // 如果 eventId 变化，需要重新渲染
  if (prevProps.eventId !== nextProps.eventId) {
    console.log('🔄 [TitleSlate memo] eventId 变化，需要重新渲染');
    return false;
  }
  
  // 如果 content 变化，需要重新渲染
  if (prevProps.content !== nextProps.content) {
    console.log('🔄 [TitleSlate memo] content 变化，需要重新渲染');
    return false;
  }
  
  // 如果 readOnly 变化，需要重新渲染
  if (prevProps.readOnly !== nextProps.readOnly) {
    console.log('🔄 [TitleSlate memo] readOnly 变化，需要重新渲染');
    return false;
  }
  
  // 其他 props 变化（如 onChange, placeholder 等）不触发重渲染
  // 因为 onChange 已经用 useCallback 包装，placeholder 已经用 useMemo 缓存
  console.log('⏭️ [TitleSlate memo] props 未变化，跳过重新渲染');
  return true;
});
