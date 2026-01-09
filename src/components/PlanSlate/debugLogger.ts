/**
 * Slate 编辑器调试日志工具
 * 
 * 使用方法：
 * 1. 在浏览器控制台运行：window.SLATE_DEBUG = true; localStorage.setItem('SLATE_DEBUG', 'true')
 * 2. 刷新页面
 * 3. 开始编辑，查看详细日志
 * 
 * 关闭调试：
 * window.SLATE_DEBUG = false; localStorage.removeItem('SLATE_DEBUG')
 */

import { Editor, Node, Range, Point, Path } from 'slate';
import { EventLineNode } from './types';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

// 时间戳格式化
const getTimestamp = () => formatTimeForStorage(new Date()).split(' ')[1].slice(0, 12);

// 检查是否启用调试
export const isDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  return (window as any).SLATE_DEBUG === true;
};

// 初始化调试（从 localStorage 恢复）
export const initDebug = () => {
  if (typeof window === 'undefined') return;
  
  try {
    const saved = localStorage.getItem('SLATE_DEBUG');
    if (saved === 'true') {
      (window as any).SLATE_DEBUG = true;
      console.log(
        '%c[🚀] SLATE_DEBUG 已启用',
        'background: #2196F3; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;'
      );
      console.log(
        '%c💡 提示：关闭调试请运行: window.SLATE_DEBUG = false; localStorage.removeItem("SLATE_DEBUG")',
        'color: #666; font-size: 11px;'
      );
    }
  } catch (e) {
    // ignore
  }
};

// ==================== 键盘事件日志 ====================

export interface KeyboardEventInfo {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
}

export const logKeyDown = (event: React.KeyboardEvent, editor: Editor) => {
  if (!isDebugEnabled()) return;
  
  const timestamp = getTimestamp();
  const { selection } = editor;
  
  // 获取按键信息
  const keyInfo: KeyboardEventInfo = {
    key: event.key,
    code: event.code,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    isComposing: event.nativeEvent?.isComposing || false,
  };
  
  // 构建按键显示字符串
  const modifiers = [];
  if (keyInfo.ctrlKey) modifiers.push('Ctrl');
  if (keyInfo.shiftKey) modifiers.push('Shift');
  if (keyInfo.altKey) modifiers.push('Alt');
  if (keyInfo.metaKey) modifiers.push('Meta');
  const keyDisplay = modifiers.length > 0 
    ? `${modifiers.join('+')}+${keyInfo.key}`
    : keyInfo.key;
  
  console.group(
    `%c[⌨️ ${timestamp}] ${keyDisplay}`,
    'background: #FF9800; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;'
  );
  
  console.log('📋 按键信息:', keyInfo);
  
  // 记录当前选区和节点信息
  if (selection) {
    logSelection(editor, selection);
  }
  
  console.groupEnd();
};

// ==================== 光标/选区日志 ====================

export const logSelection = (editor: Editor, selection: Range) => {
  if (!isDebugEnabled()) return;
  
  try {
    const { anchor, focus } = selection;
    const isCollapsed = Range.isCollapsed(selection);
    
    // 获取当前节点
    const currentNode = Editor.above(editor, {
      match: n => (n as any).type === 'event-line',
    });
    
    if (currentNode) {
      const [node, path] = currentNode;
      const eventLine = node as unknown as EventLineNode;
      const text = Node.string(node as unknown as Node);
      
      console.log('📍 光标位置:', {
        '节点路径': path,
        'Line ID': eventLine.lineId ? eventLine.lineId.slice(-10) + '...' : '(无ID)',
        '显示模式': eventLine.mode === 'title' ? '标题行' : '描述行',
        '缩进层级': eventLine.level,
        '当前文本': text ? `"${text}"` : '(空)',
        '文本长度': text.length,
      });
      
      console.log('🎯 选区详情:', {
        '类型': isCollapsed ? '光标' : '选区',
        'Anchor': `[${anchor.path.join(',')}] offset:${anchor.offset}`,
        'Focus': `[${focus.path.join(',')}] offset:${focus.offset}`,
        '是否折叠': isCollapsed,
      });
      
      // 如果是选区，显示选中的文本
      if (!isCollapsed) {
        try {
          const selectedText = Editor.string(editor, selection);
          console.log('📝 选中文本:', {
            '内容': `"${selectedText}"`,
            '长度': selectedText.length,
          });
        } catch (e) {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ 记录选区信息失败:', err);
  }
};

// ==================== DOM 变化日志 ====================

export const logDOMChange = (description: string, details?: any) => {
  if (!isDebugEnabled()) return;
  
  const timestamp = getTimestamp();
  console.log(
    `%c[🔄 ${timestamp}] DOM: ${description}`,
    'background: #9C27B0; color: white; padding: 2px 8px; border-radius: 3px;',
    details || ''
  );
};

// ==================== 内容变化日志 ====================

export const logValueChange = (
  oldValue: EventLineNode[],
  newValue: EventLineNode[],
  description?: string
) => {
  if (!isDebugEnabled()) return;
  
  const timestamp = getTimestamp();
  
  console.group(
    `%c[📝 ${timestamp}] 内容变化${description ? ': ' + description : ''}`,
    'background: #4CAF50; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;'
  );
  
  // 统计变化
  const oldCount = oldValue.length;
  const newCount = newValue.length;
  const diff = newCount - oldCount;
  
  console.log('📊 变化统计:', {
    '旧节点数': oldCount,
    '新节点数': newCount,
    '变化': diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '0',
  });
  
  // 比较节点详情
  if (oldCount !== newCount) {
    console.log('📋 节点数量变化');
  }
  
  // 显示每个节点的状态
  console.log('📄 新节点列表:');
  newValue.forEach((node, index) => {
    const text = Node.string(node as unknown as Node);
    console.log(`  ${index}. [${node.mode === 'title' ? '标题' : '描述'}] ${node.lineId.slice(-10)}... "${text}" (L${node.level})`);
  });
  
  console.groupEnd();
};

// ==================== 操作日志（Enter、Tab、Delete 等）====================

export const logOperation = (
  operation: string,
  details: any,
  style?: string
) => {
  if (!isDebugEnabled()) return;
  
  const timestamp = getTimestamp();
  const defaultStyle = 'background: #00BCD4; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;';
  
  console.group(
    `%c[⚡ ${timestamp}] ${operation}`,
    style || defaultStyle
  );
  
  console.log('📋 操作详情:', details);
  
  console.groupEnd();
};

// ==================== 错误日志 ====================

export const logError = (context: string, error: any, additionalInfo?: any) => {
  if (!isDebugEnabled()) return;
  
  const timestamp = getTimestamp();
  
  console.group(
    `%c[❌ ${timestamp}] 错误: ${context}`,
    'background: #F44336; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;'
  );
  
  console.error('错误信息:', error);
  
  if (additionalInfo) {
    console.log('附加信息:', additionalInfo);
  }
  
  console.groupEnd();
};

// ==================== 焦点变化日志 ====================

export const logFocus = (
  event: 'focus' | 'blur' | 'click',
  editor: Editor,
  additionalInfo?: any
) => {
  if (!isDebugEnabled()) return;
  
  const timestamp = getTimestamp();
  const emoji = event === 'focus' ? '🎯' : event === 'blur' ? '💤' : '🖱️';
  
  console.group(
    `%c[${emoji} ${timestamp}] ${event.toUpperCase()}`,
    'background: #607D8B; color: white; padding: 2px 8px; border-radius: 3px;'
  );
  
  if (editor.selection) {
    logSelection(editor, editor.selection);
  }
  
  if (additionalInfo) {
    console.log('附加信息:', additionalInfo);
  }
  
  console.groupEnd();
};

// ==================== 结构化日志（用于复杂操作）====================

export const logStructure = (title: string, structure: any) => {
  if (!isDebugEnabled()) return;
  
  const timestamp = getTimestamp();
  
  console.group(
    `%c[🏗️ ${timestamp}] ${title}`,
    'background: #795548; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;'
  );
  
  console.log(structure);
  
  console.groupEnd();
};

// ==================== 性能日志 ====================

const performanceMarks = new Map<string, number>();

export const startPerformanceMark = (label: string) => {
  if (!isDebugEnabled()) return;
  performanceMarks.set(label, performance.now());
};

export const endPerformanceMark = (label: string) => {
  if (!isDebugEnabled()) return;
  
  const start = performanceMarks.get(label);
  if (start) {
    const duration = performance.now() - start;
    console.log(
      `%c[⏱️] ${label}: ${duration.toFixed(2)}ms`,
      'color: #FF5722; font-weight: bold;'
    );
    performanceMarks.delete(label);
  }
};

// ==================== 辅助工具 ====================

// 显示完整的编辑器状态快照
export const logEditorSnapshot = (editor: Editor, label?: string) => {
  if (!isDebugEnabled()) return;
  
  const timestamp = getTimestamp();
  
  console.group(
    `%c[📸 ${timestamp}] 编辑器快照${label ? ': ' + label : ''}`,
    'background: #3F51B5; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;'
  );
  
  console.log('📄 所有节点:');
  editor.children.forEach((node, index) => {
    const eventLine = node as any;
    if (eventLine.type === 'event-line') {
      const text = Node.string(node as unknown as Node);
      console.log(
        `  ${index}. [${eventLine.mode}] ID:${eventLine.lineId.slice(-10)} L${eventLine.level} "${text}"`
      );
    }
  });
  
  if (editor.selection) {
    console.log('🎯 当前选区:');
    logSelection(editor, editor.selection);
  } else {
    console.log('🎯 当前选区: 无');
  }
  
  console.log('📊 统计:', {
    '总节点数': editor.children.length,
    '是否有选区': !!editor.selection,
  });
  
  console.groupEnd();
};
