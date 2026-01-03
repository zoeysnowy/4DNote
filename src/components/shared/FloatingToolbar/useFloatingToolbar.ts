import { useEffect, useState, useCallback, RefObject } from 'react';
import { logger } from '@frontend/utils/logger';
import { FloatingBarMode } from './types';

const FloatingToolbarLogger = logger.module('FloatingToolbar');

export interface FloatingToolbarPosition {
  top: number;
  left: number;
  show: boolean;
}

export interface UseFloatingToolbarOptions {
  /** 编辑区域的 ref */
  editorRef: RefObject<HTMLElement>;
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 工具栏菜单项数量（用于数字键选择） */
  menuItemCount?: number;
  /** 数字键选择回调 */
  onMenuSelect?: (index: number) => void;
  /** 子选择器是否打开（textColor/bgColor picker），打开时不拦截数字键 */
  isSubPickerOpen?: boolean;
}

export interface UseFloatingToolbarReturn {
  position: FloatingToolbarPosition;
  mode: FloatingBarMode;              // 🆕 当前显示模式
  toolbarActive: boolean;
  showToolbar: () => void;
  hideToolbar: () => void;
  getSelectedText: () => string;
  applyFormat: (command: string, value?: string) => void;
}

/**
 * 浮动工具栏 Hook
 * 支持两种显示模式：
 * 1. menu_floatingbar - 双击 Alt 触发，显示完整菜单（tag, emoji, dateRange, priority, color, addTask）
 * 2. text_floatingbar - 选中文字触发，显示文本格式菜单（bold, italic, underline 等）
 * 3. hidden - 隐藏状态
 * 
 * 只有在编辑器内有焦点（编辑状态激活）时，快捷键才会生效
 */
export function useFloatingToolbar(options: UseFloatingToolbarOptions): UseFloatingToolbarReturn {
  const { editorRef, enabled = true, menuItemCount = 5, onMenuSelect, isSubPickerOpen = false } = options;

  const [position, setPosition] = useState<FloatingToolbarPosition>({
    top: 0,
    left: 0,
    show: false,
  });

  // 🆕 FloatingBar 显示模式
  const [mode, setMode] = useState<FloatingBarMode>('hidden');

  // 双击 Alt 检测状态
  const [lastAltPressTime, setLastAltPressTime] = useState<number>(0);
  const [toolbarActive, setToolbarActive] = useState<boolean>(false); // 工具栏是否已呼出（等待数字键选择）

  // 计算工具栏位置（基于当前选区或光标）
  const calculatePosition = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // 如果选区为空（没有选中文本）
    if (rect.width === 0 && rect.height === 0) {
      return null;
    }

    // 工具栏显示在选区下方，水平居中
    const TOOLBAR_OFFSET = 8; // 距离选区底部的偏移
    const top = rect.bottom + window.scrollY + TOOLBAR_OFFSET;
    const left = rect.left + window.scrollX + rect.width / 2;

    return { top, left };
  }, []);

  // 显示工具栏
  const showToolbar = useCallback(() => {
    const pos = calculatePosition();
    if (pos) {
      setPosition({
        top: pos.top,
        left: pos.left,
        show: true,
      });
    }
  }, [calculatePosition]);

  // 隐藏工具栏
  const hideToolbar = useCallback(() => {
    setPosition((prev) => ({ ...prev, show: false }));
    setMode('hidden'); // 🆕 隐藏时重置模式
  }, []);

  // 监听鼠标选中 - 触发 text_floatingbar 模式
  const handleMouseUp = useCallback(() => {
    if (!enabled) return;

    // 延迟检查，确保选区已更新
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (selectedText) {
        showToolbar();
        setMode('text_floatingbar'); // 🆕 选中文字时切换为文本格式模式
        setToolbarActive(true); // 🆕 激活工具栏，支持数字键选择
        FloatingToolbarLogger.log('📝 [FloatingToolbar] 文本选中，切换为 text_floatingbar 模式');
      } else {
        // 只有在不是 menu_floatingbar 模式时才隐藏
        // （避免双击 Alt 后，鼠标点击导致工具栏消失）
        setMode((prev: FloatingBarMode) => prev === 'menu_floatingbar' ? prev : 'hidden');
        if (mode !== 'menu_floatingbar') {
          hideToolbar();
        }
      }
    }, 10);
  }, [enabled, showToolbar, hideToolbar, mode]);

  // 🆕 监听选区变化 - 支持键盘选中（Shift + 方向键）+ 光标移动时关闭 FloatingBar
  const handleSelectionChange = useCallback(() => {
    if (!enabled) return;

    // 延迟检查，确保选区已更新
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      
      // 检查选区是否在编辑器内
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as HTMLElement;
        const isInEditor = editorRef.current?.contains(element);
        
        if (!isInEditor) return;
      }

      if (selectedText) {
        showToolbar();
        setMode('text_floatingbar');
        setToolbarActive(true); // 🆕 激活工具栏，支持数字键选择
        FloatingToolbarLogger.log('⌨️ [FloatingToolbar] 键盘选中文本，切换为 text_floatingbar 模式');
      } else {
        // 🔧 光标位置变化（无选中文字）时，关闭所有类型的 FloatingBar
        if (mode !== 'hidden') {
          hideToolbar();
          setMode('hidden');
          setToolbarActive(false);
          FloatingToolbarLogger.log('🔄 [FloatingToolbar] 光标位置变化，关闭 FloatingBar');
        }
      }
    }, 10);
  }, [enabled, editorRef, showToolbar, hideToolbar, mode]);

  // 监听快捷键：双击 Alt 呼出工具栏，按数字键 1-9 选择菜单
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // 🔧 ESC 键应该在任何时候都能关闭 FloatingBar（不受编辑器焦点限制）
      if (mode !== 'hidden' && event.key === 'Escape') {
        event.preventDefault();
        hideToolbar();
        setToolbarActive(false);
        FloatingToolbarLogger.log('🚫 [FloatingToolbar] ESC 取消工具栏');
        return;
      }

      // 检查是否在编辑器区域内
      const target = event.target as HTMLElement;
      const isInEditor = editorRef.current?.contains(target);
      
      // 只有在编辑器内（编辑状态激活时）才响应快捷键
      if (!isInEditor) return;

      // 1. 检测双击 Alt 键
      if (event.key === 'Alt') {
        event.preventDefault();
        
        const now = Date.now();
        const timeSinceLastPress = now - lastAltPressTime;
        
        // 双击检测：两次按键间隔小于 500ms
        if (timeSinceLastPress < 500) {
          FloatingToolbarLogger.log('🎯 [FloatingToolbar] 双击 Alt 检测成功 - 切换 menu_floatingbar 模式');
          
          // 显示工具栏 - 优先在光标位置显示
          const selection = window.getSelection();
          
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            
            // 如果有选中文本，使用选区位置
            if (selection.toString().trim()) {
              const rect = range.getBoundingClientRect();
              // 显示在选区左侧的下方
              setPosition({
                top: rect.bottom + window.scrollY + 8,
                left: rect.left + window.scrollX,
                show: true,
              });
            } else {
              // 没有选中文本，使用光标位置
              // 尝试多种方法获取光标位置
              let cursorRect: DOMRect | null = null;
              
              // 方法1: 使用新的 range
              try {
                const cursorRange = document.createRange();
                cursorRange.setStart(range.startContainer, range.startOffset);
                cursorRange.collapse(true);
                cursorRect = cursorRange.getBoundingClientRect();
                FloatingToolbarLogger.log('📍 [FloatingToolbar] 方法1 cursorRect:', cursorRect);
              } catch (e) {
                FloatingToolbarLogger.warn('⚠️ [FloatingToolbar] 方法1 失败:', e);
              }
              
              // 方法2: 如果方法1失败或返回无效矩形，使用 activeElement
              if (!cursorRect || (cursorRect.width === 0 && cursorRect.height === 0)) {
                const activeElement = document.activeElement as HTMLElement;
                if (activeElement) {
                  cursorRect = activeElement.getBoundingClientRect();
                  FloatingToolbarLogger.log('📍 [FloatingToolbar] 方法2 activeElement rect:', cursorRect);
                }
              }
              
              if (cursorRect && cursorRect.height > 0) {
                // 显示在光标的右下方，偏移一些距离避免挡住文本
                setPosition({
                  top: cursorRect.bottom + window.scrollY + 8,
                  left: cursorRect.left + window.scrollX + 20,
                  show: true,
                });
              } else {
                FloatingToolbarLogger.warn('⚠️ [FloatingToolbar] 无法获取有效的光标位置');
                // 降级方案：在屏幕中间偏右位置显示
                setPosition({
                  top: window.scrollY + 100,
                  left: window.scrollX + 200,
                  show: true,
                });
              }
            }
            
            setMode('menu_floatingbar'); // 🆕 切换为菜单模式
            setToolbarActive(true);
            FloatingToolbarLogger.log('✅ [FloatingToolbar] 工具栏已呼出 (menu_floatingbar)，等待数字键选择');
          } else {
            FloatingToolbarLogger.warn('⚠️ [FloatingToolbar] 无法获取光标位置');
          }
          
          // 重置计时器
          setLastAltPressTime(0);
        } else {
          // 记录本次按键时间
          setLastAltPressTime(now);
        }
        
        return;
      }

      // 2. 如果工具栏已激活或处于菜单模式或文本模式，监听数字键 1-9
      // 🔑 关键：如果子选择器（颜色选择器）已打开，不拦截数字键，让子选择器自己处理
      if (!isSubPickerOpen && (toolbarActive || mode === 'menu_floatingbar' || mode === 'text_floatingbar') && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        event.stopPropagation(); // 🔧 阻止事件冒泡到 Slate 编辑器
        
        const menuIndex = parseInt(event.key) - 1;
        
        // 检查是否在菜单范围内
        if (menuIndex < menuItemCount) {
          FloatingToolbarLogger.log(`🎯 [FloatingToolbar] 选择菜单项 ${event.key} (索引 ${menuIndex}, 模式: ${mode}, timestamp: ${event.timeStamp})`);
          
          // 触发菜单选择回调
          if (onMenuSelect) {
            onMenuSelect(menuIndex);
          }
          
          // 不再隐藏工具栏，只是取消激活状态
          // 这样工具栏保持显示，用户可以与打开的 picker 交互
          setToolbarActive(false);
          FloatingToolbarLogger.log('✅ [FloatingToolbar] 菜单已打开，工具栏保持显示');
        } else {
          FloatingToolbarLogger.warn(`⚠️ [FloatingToolbar] 菜单索引 ${menuIndex} 超出范围 (最大 ${menuItemCount - 1})`);
        }
        
        return;
      }
    },
    [enabled, editorRef, lastAltPressTime, toolbarActive, mode, menuItemCount, onMenuSelect, calculatePosition, hideToolbar, isSubPickerOpen]
  );

  // 监听点击外部区域
  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (!enabled || !position.show) return;

      const target = event.target as HTMLElement;

      // 如果点击的是工具栏内部（包括所有版本）或 Picker 面板/Tippy 内容，不隐藏
      if (
        target.closest('.floating-toolbar') || 
        target.closest('.floating-toolbar-v2') ||
        target.closest('.headless-floating-toolbar') ||
        target.closest('.emoji-mart') ||
        target.closest('.tippy-box') ||
        target.closest('.tippy-content') ||
        target.closest('[class*="-picker-panel"]') ||
        target.closest('[class*="-tippy-content"]') ||
        target.closest('[data-tippy-root]') ||
        target.closest('.headless-date-range-popup') ||
        target.closest('.ant-picker-dropdown')
      ) {
        return;
      }

      // 如果点击的是编辑区域外部，隐藏工具栏
      if (!editorRef.current?.contains(target)) {
        hideToolbar();
        setToolbarActive(false); // 点击外部时取消工具栏激活状态
      }
    },
    [enabled, position.show, editorRef, hideToolbar]
  );

  // 注册事件监听
  useEffect(() => {
    if (!enabled || !editorRef.current) return;

    const editor = editorRef.current;

    editor.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown, true); // 🔧 使用捕获阶段，优先于 Slate 编辑器
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('selectionchange', handleSelectionChange); // 🆕 监听选区变化（支持键盘选中）

    return () => {
      editor.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown, true); // 🔧 对应移除
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('selectionchange', handleSelectionChange); // 🆕 清理
    };
  }, [enabled, editorRef, handleMouseUp, handleKeyDown, handleClickOutside, handleSelectionChange]);

  // 获取当前选区的文本
  const getSelectedText = useCallback(() => {
    const selection = window.getSelection();
    return selection?.toString() || '';
  }, []);

  // 应用文本格式化
  const applyFormat = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
  }, []);

  return {
    position,
    mode,               // 🆕 当前显示模式 (hidden | menu_floatingbar | text_floatingbar)
    toolbarActive,      // 工具栏是否已激活（等待数字键选择）
    showToolbar,
    hideToolbar,
    getSelectedText,
    applyFormat,
  };
}
