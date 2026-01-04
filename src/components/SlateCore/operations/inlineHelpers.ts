/**
 * SlateCore - Inline 元素插入辅助函数
 * 
 * 提供统一的 inline 元素插入功能（Tag、DateMention、Emoji）
 * 用于 FloatingToolbar 集成
 * 
 * @version 1.0.0
 * @date 2025-11-29
 */

import { Editor, Transforms, Range, Text as SlateText } from 'slate';
import { ReactEditor } from 'slate-react';
import { TagNode, DateMentionNode } from '@frontend/components/SlateCore/types';

/**
 * 插入 Tag 元素
 */
export function insertTag(
  editor: Editor,
  tagId: string,
  tagName: string,
  tagColor?: string,
  tagEmoji?: string,
  mentionOnly?: boolean
): boolean {
  try {
    console.log('[SlateCore.insertTag] 开始插入 Tag:', tagName);
    console.log('[SlateCore.insertTag] 当前 selection:', editor.selection);
    
    const tagNode: TagNode = {
      type: 'tag',
      tagId,
      tagName,
      tagColor,
      tagEmoji,
      mentionOnly,
      children: [{ text: '' }],
    };
    
    // 🔧 只在没有选区时才设置焦点
    if (!editor.selection) {
      console.log('[SlateCore.insertTag] 无 selection，设置焦点');
      ReactEditor.focus(editor as ReactEditor);
      // 不再强制设置选区，让编辑器恢复上次光标位置
    }
    
    // 如果此时仍然没有 selection，说明编辑器状态异常，直接返回
    if (!editor.selection) {
      console.warn('[SlateCore.insertTag] No selection after focus, aborting');
      return false;
    }
    
    // 插入 tag 节点
    Transforms.insertNodes(editor, tagNode as any);
    console.log('[SlateCore.insertTag] tag 插入后 selection:', JSON.stringify(editor.selection));
    
    // 插入后光标在 void 元素内部: [段落, 0, tagIndex, 0]
    // void 元素路径就是去掉最后的 0: [段落, 0, tagIndex]
    if (editor.selection) {
      const voidPath = editor.selection.anchor.path.slice(0, -1); // [段落, 0, tagIndex]
      console.log('[SlateCore.insertTag] void 元素路径:', JSON.stringify(voidPath));
      
      // normalizeNode 会在 void 后插入空格文本节点: [段落, 0, tagIndex+1]
      // 光标移到空格文本节点内 offset: 1
      const paragraphPath = voidPath.slice(0, -1);
      const voidIndex = voidPath[voidPath.length - 1];
      const spaceTextNodePath = [...paragraphPath, voidIndex + 1]; // 文本节点路径，不是 [x,x,x,0]
      
      Transforms.select(editor, {
        anchor: { path: spaceTextNodePath, offset: 1 },
        focus: { path: spaceTextNodePath, offset: 1 },
      });
      console.log('[SlateCore.insertTag] 光标已设置到空格后 path:', JSON.stringify(spaceTextNodePath), 'offset: 1');
    }
    
    return true;
  } catch (err) {
    console.error('[SlateCore.insertTag] Failed:', err);
    return false;
  }
}

/**
 * 插入 Emoji
 */
export function insertEmoji(editor: Editor, emoji: string): boolean {
  try {
    // 🔧 只在没有选区时才设置焦点
    if (!editor.selection) {
      ReactEditor.focus(editor as ReactEditor);
    }
    
    // 如果此时仍然没有 selection，说明编辑器状态异常，直接返回
    if (!editor.selection) {
      console.warn('[SlateCore.insertEmoji] No selection after focus, aborting');
      return false;
    }
    
    Transforms.insertText(editor, emoji + ' ');
    
    // 🔧 确保插入后编辑器保持焦点
    setTimeout(() => {
      if (!ReactEditor.isFocused(editor as ReactEditor)) {
        ReactEditor.focus(editor as ReactEditor);
        console.log('[SlateCore.insertEmoji] 恢复编辑器焦点');
      }
    }, 100); // 🔧 增加延迟到 100ms，确保在 FloatingBar 关闭后执行
    
    return true;
  } catch (err) {
    console.error('[SlateCore.insertEmoji] Failed:', err);
    return false;
  }
}

/**
 * 插入 DateMention 元素
 */
export function insertDateMention(
  editor: Editor,
  startDate: string,  // ✅ 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
  endDate?: string,   // ✅ 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
  mentionOnly?: boolean,
  eventId?: string,  // 🆕 添加 eventId 参数，用于 TimeHub 同步
  displayHint?: string  // 🆕 用户输入的原始文本（如"下周二下午3点"）
): boolean {
  try {
    const dateMentionNode: DateMentionNode = {
      type: 'dateMention',
      startDate,
      endDate,
      mentionOnly,
      eventId,  // 🆕 保存 eventId
      originalText: displayHint,  // 🆕 v2.3: 保存用户原始输入文本
      isOutdated: false,  // 🆕 v2.3: 初始时不过期
      children: [{ text: '' }],  // DateMention 是 void 元素，children 必须为空文本
    };
    
    console.log('[SlateCore.insertDateMention] 创建 DateMention 节点', {
      eventId,
      startDate,
      endDate,
      displayHint,
      fullNode: dateMentionNode
    });
    
    // 🔧 只在没有选区时才设置焦点
    if (!editor.selection) {
      ReactEditor.focus(editor as ReactEditor);
    }
    
    // 如果此时仍然没有 selection，说明编辑器状态异常，直接返回
    if (!editor.selection) {
      console.warn('[SlateCore.insertDateMention] No selection after focus, aborting');
      return false;
    }
    
    Transforms.insertNodes(editor, dateMentionNode as any);
    
    // 🔥 Gemini方案：插入空格后，normalizeNode会确保dateMention后总有空格
    Transforms.insertText(editor, ' ');
    
    // 🔧 确保插入后编辑器保持焦点
    setTimeout(() => {
      if (!ReactEditor.isFocused(editor as ReactEditor)) {
        ReactEditor.focus(editor as ReactEditor);
        console.log('[SlateCore.insertDateMention] 恢复编辑器焦点');
      }
    }, 100); // 🔧 增加延迟到 100ms，确保在 FloatingBar 关闭后执行
    
    return true;
  } catch (err) {
    console.error('[SlateCore.insertDateMention] Failed:', err);
    return false;
  }
}

/**
 * 插入 Void 元素（通用）
 * 
 * 提供统一的 void 元素插入逻辑，自动处理光标和空格
 */
export function insertVoidElement(
  editor: Editor,
  node: any,
  options?: {
    focusAfter?: boolean;
    addSpaceAfter?: boolean;
  }
): boolean {
  try {
    const { focusAfter = true, addSpaceAfter = true } = options || {};
    
    // 🔧 只在没有选区时才设置焦点
    if (!editor.selection) {
      ReactEditor.focus(editor as ReactEditor);
    }
    
    // 如果此时仍然没有 selection，说明编辑器状态异常，直接返回
    if (!editor.selection) {
      console.warn('[SlateCore.insertVoidElement] No selection after focus, aborting');
      return false;
    }
    
    // 插入节点
    Transforms.insertNodes(editor, node);
    
    // 插入空格
    if (addSpaceAfter) {
      Transforms.insertText(editor, ' ');
    }
    
    // 确保保持焦点
    if (focusAfter) {
      setTimeout(() => {
        if (!ReactEditor.isFocused(editor as ReactEditor)) {
          ReactEditor.focus(editor as ReactEditor);
        }
      }, 100);
    }
    
    return true;
  } catch (err) {
    console.error('[SlateCore.insertVoidElement] Failed:', err);
    return false;
  }
}
