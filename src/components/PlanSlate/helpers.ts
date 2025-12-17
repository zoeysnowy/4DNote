/**
 * 插入辅助函数 - 用于 FloatingBar 集成
 */

import { Editor, Transforms, Node, Element, Path, Range, Text as SlateText } from 'slate';
import { ReactEditor } from 'slate-react';
import { TagNode, DateMentionNode, TextNode, EventLineNode } from './types';

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
    console.log('[insertTag] 开始插入 Tag:', tagName);
    console.log('[insertTag] 当前 selection:', editor.selection);
    
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
      console.log('[insertTag] 无 selection，设置焦点');
      ReactEditor.focus(editor as ReactEditor);
      // 不再强制设置选区，让编辑器恢复上次光标位置
    }
    
    // 如果此时仍然没有 selection，说明编辑器状态异常，直接返回
    if (!editor.selection) {
      console.warn('[insertTag] No selection after focus, aborting');
      return false;
    }
    
    // 插入 tag 节点
    Transforms.insertNodes(editor, tagNode as any);
    console.log('[insertTag] tag 插入后 selection:', JSON.stringify(editor.selection));
    
    // 插入后光标在 void 元素内部: [段落, 0, tagIndex, 0]
    // void 元素路径就是去掉最后的 0: [段落, 0, tagIndex]
    if (editor.selection) {
      const voidPath = editor.selection.anchor.path.slice(0, -1); // [段落, 0, tagIndex]
      console.log('[insertTag] void 元素路径:', JSON.stringify(voidPath));
      
      // normalizeNode 会在 void 后插入空格文本节点: [段落, 0, tagIndex+1]
      // 光标移到空格文本节点内 offset: 1
      const paragraphPath = voidPath.slice(0, -1);
      const voidIndex = voidPath[voidPath.length - 1];
      const spaceTextNodePath = [...paragraphPath, voidIndex + 1]; // 文本节点路径，不是 [x,x,x,0]
      
      Transforms.select(editor, {
        anchor: { path: spaceTextNodePath, offset: 1 },
        focus: { path: spaceTextNodePath, offset: 1 },
      });
      console.log('[insertTag] 光标已设置到空格后 path:', JSON.stringify(spaceTextNodePath), 'offset: 1');
    }
    
    return true;
  } catch (err) {
    console.error('[insertTag] Failed:', err);
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
      console.warn('[insertEmoji] No selection after focus, aborting');
      return false;
    }
    
    Transforms.insertText(editor, emoji + ' ');
    
    // 🔧 确保插入后编辑器保持焦点
    setTimeout(() => {
      if (!ReactEditor.isFocused(editor as ReactEditor)) {
        ReactEditor.focus(editor as ReactEditor);
        console.log('[insertEmoji] 恢复编辑器焦点');
      }
    }, 100); // 🔧 增加延迟到 100ms，确保在 FloatingBar 关闭后执行
    
    return true;
  } catch (err) {
    console.error('[insertEmoji] Failed:', err);
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
    
    console.log('[insertDateMention] 创建 DateMention 节点', {
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
      console.warn('[insertDateMention] No selection after focus, aborting');
      return false;
    }
    
    Transforms.insertNodes(editor, dateMentionNode as any);
    
    // 🔥 Gemini方案：插入空格后，normalizeNode会确保dateMention后总有空格
    Transforms.insertText(editor, ' ');
    
    // 🔧 确保插入后编辑器保持焦点
    setTimeout(() => {
      if (!ReactEditor.isFocused(editor as ReactEditor)) {
        ReactEditor.focus(editor as ReactEditor);
        console.log('[insertDateMention] 恢复编辑器焦点');
      }
    }, 100); // 🔧 增加延迟到 100ms，确保在 FloatingBar 关闭后执行
    
    return true;
  } catch (err) {
    console.error('[insertDateMention] Failed:', err);
    return false;
  }
}

/**
 * 插入 EventMention 元素（事件引用）
 */
export function insertEventMention(
  editor: Editor,
  eventId: string,
  eventTitle: string,
  currentEventId?: string
): boolean {
  try {
    const eventMentionNode = {
      type: 'event-mention',
      eventId,
      eventTitle,
      children: [{ text: '' }],
    };
    
    console.log('[insertEventMention] 创建 EventMention 节点', {
      eventId,
      eventTitle,
      currentEventId,
      fullNode: eventMentionNode
    });
    
    // 🔧 只在没有选区时才设置焦点
    if (!editor.selection) {
      ReactEditor.focus(editor as ReactEditor);
    }
    
    // 如果此时仍然没有 selection，说明编辑器状态异常，直接返回
    if (!editor.selection) {
      console.warn('[insertEventMention] No selection after focus, aborting');
      return false;
    }
    
    Transforms.insertNodes(editor, eventMentionNode as any);
    
    // 插入空格
    Transforms.insertText(editor, ' ');
    
    // 🔥 创建双向链接（如果提供了 currentEventId）
    if (currentEventId && currentEventId !== eventId) {
      import('../../services/EventService').then(({ EventService }) => {
        EventService.addLink(currentEventId, eventId).then(result => {
          if (result.success) {
            console.log('✅ [insertEventMention] 双向链接已创建:', {
              from: currentEventId,
              to: eventId
            });
          } else {
            console.error('❌ [insertEventMention] 双向链接创建失败:', result.error);
          }
        });
      });
    }
    
    // 🔧 确保插入后编辑器保持焦点
    setTimeout(() => {
      if (!ReactEditor.isFocused(editor as ReactEditor)) {
        ReactEditor.focus(editor as ReactEditor);
      }
    }, 10);
    
    return true;
  } catch (err) {
    console.error('[insertEventMention] Failed:', err);
    return false;
  }
}

/**
 * 将 Slate fragment 转换为 HTML（内部使用）
 */
function slateFragmentToHtml(fragment: (TextNode | TagNode | DateMentionNode)[]): string {
  // 🔧 安全检查
  if (!fragment || !Array.isArray(fragment)) {
    console.warn('[helpers.slateFragmentToHtml] fragment 不是数组', { fragment });
    return '';
  }
  
  return fragment.map(node => {
    if ('text' in node) {
      let text = node.text;
      if (!text) return '';
      if (node.bold) text = `<strong>${text}</strong>`;
      if (node.italic) text = `<em>${text}</em>`;
      if (node.underline) text = `<u>${text}</u>`;
      if (node.strikethrough) text = `<s>${text}</s>`;
      if (node.color) text = `<span style="color: ${node.color}">${text}</span>`;
      return text;
    } else if (node.type === 'tag') {
      const attrs = [
        `data-type="tag"`,
        `data-tag-id="${node.tagId}"`,
        `data-tag-name="${node.tagName}"`,
        node.tagColor ? `data-tag-color="${node.tagColor}"` : '',
        node.tagEmoji ? `data-tag-emoji="${node.tagEmoji}"` : '',
        node.mentionOnly ? `data-mention-only="true"` : '',
      ].filter(Boolean).join(' ');
      
      const emoji = node.tagEmoji ? node.tagEmoji + ' ' : '';
      return `<span ${attrs} contenteditable="false" class="inline-tag">${emoji}${node.tagName}</span>`;
    } else if (node.type === 'dateMention') {
      const attrs = [
        `data-type="dateMention"`,
        `data-start-date="${node.startDate}"`,
        node.endDate ? `data-end-date="${node.endDate}"` : '',
        node.eventId ? `data-event-id="${node.eventId}"` : '',  // 🆕 保存 eventId
        node.originalText ? `data-original-text="${node.originalText}"` : '',  // 🆕 保存原始输入
        node.isOutdated ? `data-is-outdated="true"` : '',  // 🆕 保存过期状态
        node.mentionOnly ? `data-mention-only="true"` : '',
      ].filter(Boolean).join(' ');
      
      const startDate = new Date(node.startDate);
      const endDate = node.endDate ? new Date(node.endDate) : null;
      const dateText = formatDateForDisplay(startDate, endDate);
      
      return `<span ${attrs} contenteditable="false" class="inline-date">📅 ${dateText}</span>`;
    }
    return '';
  }).join('');
}

/**
 * 格式化日期显示
 */
function formatDateForDisplay(start: Date, end: Date | null): string {
  if (!end || start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString('zh-CN');
  }
  return `${start.toLocaleDateString('zh-CN')} - ${end.toLocaleDateString('zh-CN')}`;
}

/**
 * 获取当前编辑器某一行的 HTML 内容
 * 用于 FloatingBar 插入后更新 PlanItem
 */
export function getEditorHTML(editor: Editor): string {
  try {
    // 获取当前选区所在的 event-line
    const { selection } = editor;
    if (!selection) return '';
    
    const match = Editor.above(editor, {
      match: n => (n as any).type === 'event-line',
    });
    
    if (!match) return '';
    
    const [node] = match;
    const eventLine = node as unknown as EventLineNode;
    
    // 获取 paragraph 的 children
    if (eventLine.children && eventLine.children[0]) {
      const paragraph = eventLine.children[0];
      if (paragraph.children) {
        return slateFragmentToHtml(paragraph.children);
      }
    }
    
    return '';
  } catch (err) {
    console.error('[getEditorHTML] Failed:', err);
    return '';
  }
}

/**
 * 应用文本格式化命令
 */
export function applyTextFormat(editor: Editor, command: string, value?: string): boolean {
  console.log('[applyTextFormat] 🎨 执行格式化命令:', {
    command,
    value,
    isFocused: ReactEditor.isFocused(editor as ReactEditor),
    selection: editor.selection,
    hasSelection: !!editor.selection,
    isCollapsed: editor.selection ? Range.isCollapsed(editor.selection) : null,
  });
  
  // 🚨 关键检查：必须有选区才能应用格式
  if (!editor.selection) {
    console.error('[applyTextFormat] ❌ 无选区，无法应用格式');
    return false;
  }
  
  // 🚨 如果选区是折叠的（光标位置），也无法应用到已有文本
  if (Range.isCollapsed(editor.selection)) {
    console.warn('[applyTextFormat] ⚠️ 选区已折叠（无选中文本），mark只会影响下次输入');
  }
  
  try {
    // 🔧 确保编辑器有焦点
    if (!ReactEditor.isFocused(editor as ReactEditor)) {
      console.log('[applyTextFormat] ⚠️ 编辑器未聚焦，尝试聚焦...');
      ReactEditor.focus(editor as ReactEditor);
    }
    
    switch (command) {
      case 'bold':
        // 🔄 Toggle 逻辑：如果已经有 bold，则移除；否则添加
        const currentMarks = Editor.marks(editor);
        if (currentMarks?.bold) {
          Editor.removeMark(editor, 'bold');
        } else {
          Editor.addMark(editor, 'bold', true);
        }
        break;
      case 'italic':
        // 🔄 Toggle 逻辑
        const italicMarks = Editor.marks(editor);
        if (italicMarks?.italic) {
          Editor.removeMark(editor, 'italic');
        } else {
          Editor.addMark(editor, 'italic', true);
        }
        break;
      case 'underline':
        // 🔄 Toggle 逻辑
        const underlineMarks = Editor.marks(editor);
        if (underlineMarks?.underline) {
          Editor.removeMark(editor, 'underline');
        } else {
          Editor.addMark(editor, 'underline', true);
        }
        break;
      case 'strikeThrough':
        // 🔄 Toggle 逻辑
        const strikeMarks = Editor.marks(editor);
        if (strikeMarks?.strikethrough) {
          Editor.removeMark(editor, 'strikethrough');
        } else {
          Editor.addMark(editor, 'strikethrough', true);
        }
        break;
      case 'textColor':
        // 🆕 应用文本颜色
        if (value) {
          const beforeMarks = Editor.marks(editor);
          console.log('[applyTextFormat] ✅ 添加文本颜色 mark:', { 
            color: value,
            应用前的marks: beforeMarks 
          });
          Editor.addMark(editor, 'color', value);
          const afterMarks = Editor.marks(editor);
          console.log('[applyTextFormat] 📊 应用后 marks:', afterMarks);
          
          // 🔍 调试：检查选区中的节点
          if (editor.selection) {
            const nodes = Array.from(Editor.nodes(editor, {
              at: editor.selection,
              match: n => SlateText.isText(n),
            }));
            console.log('[applyTextFormat] 🔍 选区中的文本节点:', {
              nodeCount: nodes.length,
              nodes: nodes.map(([node]) => ({
                text: (node as any).text,
                marks: node
              }))
            });
          }
        } else {
          console.log('[applyTextFormat] ❌ 移除文本颜色 mark');
          Editor.removeMark(editor, 'color');
        }
        break;
      case 'backgroundColor':
        // 🆕 应用背景颜色
        if (value) {
          const beforeMarks = Editor.marks(editor);
          console.log('[applyTextFormat] ✅ 添加背景颜色 mark:', { 
            backgroundColor: value,
            应用前的marks: beforeMarks 
          });
          Editor.addMark(editor, 'backgroundColor', value);
          const afterMarks = Editor.marks(editor);
          console.log('[applyTextFormat] 📊 应用后 marks:', afterMarks);
        } else {
          console.log('[applyTextFormat] ❌ 移除背景颜色 mark');
          Editor.removeMark(editor, 'backgroundColor');
        }
        break;
      case 'removeFormat':
        // 移除所有格式（包括颜色）
        Editor.removeMark(editor, 'bold');
        Editor.removeMark(editor, 'italic');
        Editor.removeMark(editor, 'underline');
        Editor.removeMark(editor, 'strikethrough');
        Editor.removeMark(editor, 'color');
        Editor.removeMark(editor, 'backgroundColor');
        break;
      case 'toggleBulletList':
        toggleBulletList(editor);
        break;
      case 'increaseBulletLevel':
        adjustBulletLevel(editor, 1);
        break;
      case 'decreaseBulletLevel':
        adjustBulletLevel(editor, -1);
        break;
      default:
        console.warn('[applyTextFormat] Unknown command:', command);
        return false;
    }
    
    return true;
  } catch (err) {
    console.error('[applyTextFormat] Failed:', err);
    return false;
  }
}

/**
 * 切换 Bullet List
 */
function toggleBulletList(editor: Editor): void {
  const [paraMatch] = Editor.nodes(editor, {
    match: (n: any) => !Editor.isEditor(n) && Element.isElement(n) && (n as any).type === 'paragraph',
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
    }
  }
}

/**
 * 调整 Bullet 层级
 * @param delta +1 增加层级，-1 减少层级
 */
function adjustBulletLevel(editor: Editor, delta: number): void {
  const [paraMatch] = Editor.nodes(editor, {
    match: (n: any) => !Editor.isEditor(n) && Element.isElement(n) && (n as any).type === 'paragraph',
  });
  
  if (paraMatch) {
    const [node] = paraMatch;
    const para = node as any;
    
    if (para.bullet) {
      const currentLevel = para.bulletLevel || 0;
      const newLevel = currentLevel + delta;
      
      if (newLevel < 0) {
        // Level 0 再减少就取消 bullet
        Transforms.setNodes(editor, { bullet: undefined, bulletLevel: undefined } as any);
      } else if (newLevel <= 4) {
        // 最多 5 层 (0-4)
        Transforms.setNodes(editor, { bulletLevel: newLevel } as any);
      }
      // 超过 4 不处理
    }
  }
}

/**
 * 提取指定行的所有标签 ID
 * @param editor Slate 编辑器实例
 * @param lineId 行 ID
 * @returns 标签 ID 数组
 */
export function extractTagsFromLine(editor: Editor, lineId: string): string[] {
  try {
    // 查找指定的 event-line 节点
    const lineNode = editor.children.find((node: any) => {
      return node.lineId === lineId || node.lineId === lineId.replace('-desc', '');
    });

    if (!lineNode) {
      return [];
    }

    // 扫描所有子节点，提取 type='tag' 的元素
    const tagIds = new Set<string>();
    const descendants = Array.from(Node.descendants(lineNode as any));
    
    descendants.forEach((entry: any) => {
      const [node] = entry;
      if (node.type === 'tag' && node.tagId) {
        tagIds.add(node.tagId);
      }
    });

    return Array.from(tagIds);
  } catch (err) {
    console.error('[extractTagsFromLine] Failed:', err);
    return [];
  }
}
