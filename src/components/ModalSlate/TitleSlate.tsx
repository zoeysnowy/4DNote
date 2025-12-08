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

export const TitleSlate: React.FC<TitleSlateProps> = ({
  eventId,
  content,
  onChange,
  placeholder = '输入标题...',
  className = '',
  readOnly = false,
  autoFocus = false,
  hideEmoji = true // 默认隐藏 emoji
}) => {
  // 创建 Slate 编辑器实例（只创建一次，永不重建）
  const editorRef = useRef<Editor | null>(null);
  if (!editorRef.current) {
    editorRef.current = withHistory(withReact(createEditor()));
  }
  const editor = editorRef.current;

  // 🔧 解析 content 的辅助函数（参考 LogSlate）
  const parseContent = useCallback((content: string): Descendant[] => {
    if (!content || content.trim() === '') {
      return [{ type: 'paragraph', children: [{ text: '' }] }] as Descendant[];
    }
    
    try {
      const parsed = slateJsonToNodes(content);
      
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

  // 🔧 初始值（只在首次渲染时使用，不依赖 content）
  const initialValue = useMemo(() => parseContent(content), []);

  // ❌ 删除 value state（不受控组件，不需要）
  const isInitializedRef = useRef(false);
  const lastContentRef = useRef(content);
  const pendingChangesRef = useRef<string | null>(null); // 🔥 缓存待保存的 JSON（blur-to-save 模式）
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
    
    // 首次初始化
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      lastContentRef.current = content;
      console.log('✅ [TitleSlate] 首次初始化完成');
      return;
    }
    
    // 🔥 如果正在编辑，跳过外部 content 同步，避免重置编辑器
    if (isEditingRef.current) {
      console.log('⏭️ [TitleSlate] 正在编辑中，跳过外部 content 同步');
      return;
    }
    
    // 🔥 如果有待保存的变化，跳过外部 content 同步，避免丢失用户输入
    if (pendingChangesRef.current) {
      console.log('⏭️ [TitleSlate] 有待保存变化，跳过外部 content 同步');
      return;
    }
    
    // 只在 content 真正变化时才同步
    if (content !== lastContentRef.current) {
      console.warn('⚠️ [TitleSlate] content 变化，重置编辑器！这会导致 DOM 错误！', {
        oldContent: lastContentRef.current,
        newContent: content
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
    }
  }, [eventId]); // 🔥 只监听 eventId，切换事件时才重置编辑器（学习 ModalSlate）

  // 🔥 blur-to-save 模式：缓存变化，失焦时保存（学习 PlanSlate 架构）
  const handleChange = useCallback((newValue: Descendant[]) => {
    const isAstChange = editor.operations.some(
      (op) => op.type !== 'set_selection'
    );
    
    if (isAstChange) {
      // 标记正在编辑
      isEditingRef.current = true;
      
      // 🔥 缓存变化，不立即调用 onChange（等失焦时保存）
      try {
        const json = slateNodesToJsonCore(newValue);
        pendingChangesRef.current = json;
        console.log('💾 [TitleSlate] 变化已缓存，等待失焦保存');
      } catch (error) {
        console.error('[TitleSlate] 序列化失败:', error);
      }
    }
  }, [editor]);
  // 🔥 失焦时保存缓存的变化（blur-to-save 模式）
  const handleBlur = useCallback(() => {
    console.log('🎯 [TitleSlate] 失焦，保存变化');
    
    // 如果有待保存的变化，立即保存
    if (pendingChangesRef.current) {
      console.log('💾 [TitleSlate] 保存缓存的变化:', pendingChangesRef.current.slice(0, 50));
      onChange(pendingChangesRef.current);
      pendingChangesRef.current = null;
    }
    
    // 标记编辑结束
    isEditingRef.current = false;
  }, [onChange]);

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
    let textContent = props.children;

    // 如果 hideEmoji 启用，过滤掉 emoji
    if (hideEmoji && leaf.text) {
      const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g;
      const filteredText = leaf.text.replace(emojiRegex, '').trim();
      if (filteredText !== leaf.text) {
        textContent = <>{filteredText}</>;
      }
    }

    let children = <>{textContent}</>;
    
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
    
    return <span {...props.attributes}>{children}</span>;
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
          onClick={() => {
            console.log('🖱️ [TitleSlate] 点击编辑器', {
              readOnly,
              hasSelection: !!editor.selection,
              valueLength: value.length,
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
          }}
          onFocus={() => {
            console.log('🎯 [TitleSlate] 聚焦编辑器', {
              readOnly,
              valueLength: value.length
            });
            // 🔧 获得焦点时立即标记为编辑中
            isEditingRef.current = true;
          }}
          onKeyDown={(event) => {
            console.log('⌨️ [TitleSlate] 键盘输入:', {
              key: event.key,
              readOnly,
              hasSelection: !!editor.selection
            });
            // 拦截 Enter 键
            if (event.key === 'Enter') {
              event.preventDefault();
              return;
            }
            
            // 处理快捷键
            if (event.ctrlKey || event.metaKey) {
              switch (event.key) {
                case 'b':
                  event.preventDefault();
                  slateApplyTextFormat(editor, 'bold');
                  break;
                case 'i':
                  event.preventDefault();
                  slateApplyTextFormat(editor, 'italic');
                  break;
                case 'u':
                  event.preventDefault();
                  slateApplyTextFormat(editor, 'underline');
                  break;
              }
            }
          }}
        />
      </Slate>
    </div>
  );
};
