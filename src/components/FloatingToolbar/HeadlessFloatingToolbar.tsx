/**
 * HeadlessFloatingToolbar - 使用 Headless UI 设计的优雅浮动工具栏
 * 支持两种显示模式：
 * - menu_floatingbar: 完整菜单（双击 Alt 触发）- 显示 tag, emoji, dateRange, priority, color, addTask
 * - text_floatingbar: 文本格式（选中文字触发）- 显示 bold, italic, underline, strikethrough 等
 */

import React, { useState, useRef, useEffect } from 'react';
import Tippy from '@tippyjs/react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { Transforms, Editor } from 'slate'; // 🆕 导入 Slate Transforms 和 Editor
import 'tippy.js/dist/tippy.css';
import { /* ToolbarConfig, */ ToolbarFeatureType, FloatingToolbarProps, FloatingBarMode } from './types';
import { TagPicker } from './pickers/TagPicker';
import UnifiedDateTimePicker from './pickers/UnifiedDateTimePicker';
// import { SimpleDatePicker } from './pickers/SimpleDatePicker';
import { PriorityPicker } from './pickers/PriorityPicker';
import { ColorPicker } from './pickers/ColorPicker';
import { TextColorPicker } from './pickers/TextColorPicker'; // 🆕 文本颜色选择器
import { BackgroundColorPicker } from './pickers/BackgroundColorPicker'; // 🆕 背景颜色选择器
import { icons } from '../../assets/icons'; // 🆕 导入图标资源
import './HeadlessFloatingToolbar.css';

type ToolbarButtonConfig = {
  icon: string;
  label: string;
  command?: string;
  color?: string;
  iconSrc?: string;
  iconSrcActive?: string;
};

export const HeadlessFloatingToolbar: React.FC<FloatingToolbarProps & { mode?: FloatingBarMode }> = ({
  position,
  config,
  mode = 'menu_floatingbar', // 🆕 默认为菜单模式
  slateEditorRef, // 🆕 Slate Editor 引用
  onTextFormat,
  onTagSelect,
  onEmojiSelect,
  onDateRangeSelect,
  onPrioritySelect,
  onColorSelect,
  onTaskToggle,
  onRequestClose,
  onSubPickerStateChange, // 🆕 子选择器状态变化回调
  availableTags = [],
  currentTags = [],
  currentIsTask = false,
  activePickerIndex,
  onActivePickerIndexConsumed, // 🆕 数字键处理完成后的回调
  eventId,
  useTimeHub,
  onTimeApplied,
  editorMode, // 🆕 接收编辑器模式
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [activePickerState, setActivePickerState] = useState<string | null>(null);
  const savedSelectionRef = useRef<any>(null); // 🆕 保存选区用于预览
  const [selectedEmojiIndex, setSelectedEmojiIndex] = useState<number>(0); // 🆕 当前选中的表情索引
  const [emojiPickerFocusArea, setEmojiPickerFocusArea] = useState<'nav' | 'search' | 'emojis'>('emojis'); // 🆕 Emoji Picker 焦点区域

  // 🎯 智能计算 Tippy 弹出方向
  const getSmartPlacement = (): string => {
    if (!toolbarRef.current) return 'bottom-start';
    
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - toolbarRect.bottom;
    const spaceAbove = toolbarRect.top;
    
    // 如果下方空间不足（小于 300px），且上方空间更充足，则向上弹出
    if (spaceBelow < 300 && spaceAbove > spaceBelow + 100) {
      return 'top-start';
    }
    
    return 'bottom-start';
  };
  
  // 🔍 Debug: 包装 setActivePicker 以追踪所有调用
  const setActivePicker = (value: string | null) => {
    // Debug: setActivePicker调用
    setActivePickerState(value);
  };
  const activePicker = activePickerState;

  // 🆕 根据 mode 决定显示的功能集合（提前计算，供 useEffect 使用）
  const menuFloatingbarFeaturesBase: ToolbarFeatureType[] = ['tag', 'emoji', 'dateRange', 'addTask', 'textStyle'];
  const textFloatingbarFeaturesBase: ToolbarFeatureType[] = ['bold', 'italic', 'textColor', 'bgColor', 'strikethrough', 'clearFormat', 'bullet'];
  
  // 🔧 menu_floatingbar 已经将 bullet 放入 textStyle 子菜单，这里不需要过滤
  const menuFloatingbarFeatures = menuFloatingbarFeaturesBase;
  
  const textFloatingbarFeatures = editorMode === 'title'
    ? textFloatingbarFeaturesBase.filter(f => f !== 'bullet')
    : textFloatingbarFeaturesBase;
  
  // 根据 mode 覆盖 config.features（如果外层没有提供）
  const effectiveFeatures = mode === 'text_floatingbar' 
    ? (config.features.some(f => textFloatingbarFeatures.includes(f)) ? config.features : textFloatingbarFeatures)
    : (config.features.some(f => menuFloatingbarFeatures.includes(f)) ? config.features : menuFloatingbarFeatures);

  // 功能按钮配置（提前定义，供 useEffect 使用）
  const textFeatureConfig: Partial<Record<ToolbarFeatureType, ToolbarButtonConfig>> = {
    bold: { icon: '𝐁', label: '粗体', command: 'bold' },
    italic: { icon: '𝑰', label: '斜体', command: 'italic' },
    underline: { icon: '𝐔', label: '下划线', command: 'underline' },
    strikethrough: { icon: 'svg', iconSrc: icons.strikethrough, label: '删除线', command: 'strikeThrough' },
    clearFormat: { icon: 'svg', iconSrc: icons.removestyle, label: '清除格式', command: 'removeFormat' },
    bullet: { icon: 'bulletpoints-svg', label: '项目符号', command: 'toggleBulletList' },
    textColor: { icon: 'svg', iconSrc: icons.textcolor, label: '文本颜色', command: 'picker' },
    bgColor: { icon: 'svg', iconSrc: icons.backgroundcolor, label: '背景颜色', command: 'picker' },
  };

  // 监听 activePickerIndex 变化，通过数字键激活对应的 picker
  useEffect(() => {
    // console.log(`[数字键 useEffect] activePickerIndex: ${activePickerIndex}, activePicker: ${activePicker}`);
    
    // 🔑 守卫：如果 activePickerIndex 为 null，说明没有数字键按下，直接返回
    // 这样可以避免 activePicker 变化时触发不必要的逻辑
    if (activePickerIndex === null || activePickerIndex === undefined) {
      // console.log('[数字键 useEffect] ⏭️ activePickerIndex 为 null，跳过执行');
      return;
    }
    
    if (activePickerIndex !== null && activePickerIndex !== undefined) {
      // 🔧 判断当前层级：如果有 activePicker，说明在子菜单中
      if (activePicker === 'textStyle') {
        // textStyle 子菜单层级：数字键对应 textStyle 内的按钮
        const textStyleFeaturesBase: ToolbarFeatureType[] = ['bold', 'italic', 'strikethrough', 'textColor', 'bgColor', 'bullet', 'clearFormat'];
        // 🔧 标题模式下也要隐藏 bullet
        const textStyleFeatures = editorMode === 'title'
          ? textStyleFeaturesBase.filter(f => f !== 'bullet')
          : textStyleFeaturesBase;
        const feature = textStyleFeatures[activePickerIndex];
        
        if (feature) {
          
          const btnConfig = textFeatureConfig[feature as keyof typeof textFeatureConfig];
          if (!btnConfig) {
            onActivePickerIndexConsumed?.(); // 🔧 立即通知父组件重置
            return;
          }
          
          // 判断是否有子菜单（textColor/bgColor 有颜色选择器）
          if (feature === 'textColor' || feature === 'bgColor') {
            // 打开颜色选择器子菜单
            setActivePicker(feature);
          } else {
            // 无子菜单：直接执行命令并关闭整个 FloatingBar
            onTextFormat?.(btnConfig.command);
            setActivePicker(null);
            onRequestClose?.();
          }
        }
      } else if (activePicker === 'textColor' || activePicker === 'bgColor') {
        // 颜色选择器层级：数字键已被颜色选择器组件内部处理
      } else {
        // 顶层菜单层级：数字键对应主菜单功能
        const feature = effectiveFeatures[activePickerIndex];
        if (feature) {
          
          // text_floatingbar 模式
          if (mode === 'text_floatingbar') {
            const textFormatCommands = ['bold', 'italic', 'underline', 'strikethrough', 'clearFormat', 'bullet'];
            
            if (textFormatCommands.includes(feature)) {
              // 无子菜单：直接执行命令并关闭整个 FloatingBar
              const btnConfig = textFeatureConfig[feature as keyof typeof textFeatureConfig];
              if (btnConfig) {
                onTextFormat?.(btnConfig.command);
                onRequestClose?.();
              }
            } else if (feature === 'textColor' || feature === 'bgColor') {
              // 有子菜单：打开颜色选择器
              setActivePicker(feature);
            }
          } 
          // menu_floatingbar 模式
          else {
            // addTask 是状态切换指令，执行后关闭
            if (feature === 'addTask') {
              onTaskToggle?.(!currentIsTask);
              onRequestClose?.();
            }
            // 其他都有子菜单：打开对应的 Picker
            else {
              setActivePicker(feature);
            }
          }
        }
      }
      
      // 🔑 关键：立即通知父组件重置 activePickerIndex，避免重复触发
      onActivePickerIndexConsumed?.();
    }
  }, [activePickerIndex, effectiveFeatures, mode, activePicker, onTextFormat, onRequestClose, onTaskToggle, currentIsTask, onActivePickerIndexConsumed]);

  // 🆕 FloatingBar 重新打开时重置 activePicker（避免显示上次的 Picker 状态）
  const prevShowRef = useRef(false);
  useEffect(() => {
    // console.log('[FloatingBar useEffect] 触发检查', {
    //   'position.show': position.show,
    //   'prevShowRef.current': prevShowRef.current,
    //   'activePicker当前值': activePicker,
    //   'position对象': position
    // });
    
    // 🔑 只在从 false → true 时重置（真正打开时）
    if (position.show && !prevShowRef.current) {
      // console.log('[FloatingBar useEffect] 🔓 首次打开，重置 activePicker');
      setActivePicker(null);
    } else if (position.show && prevShowRef.current) {
      // console.log('[FloatingBar useEffect] 🔄 position 更新但保持打开状态，不重置 activePicker');
    } else if (!position.show) {
      // console.log('[FloatingBar useEffect] 🔒 FloatingBar 关闭');
    }
    prevShowRef.current = position.show;
  }, [position.show]);

  // 监听 activePicker 变化，通知父组件子选择器状态
  useEffect(() => {
    // console.log(`[activePicker useEffect] 🔄 activePicker 变化: ${activePicker}`);
    // console.log('[activePicker useEffect] 调用堆栈:', new Error().stack);
    
    // 🔑 通知父组件：textColor 或 bgColor 打开时，子选择器处于打开状态
    const isSubPickerOpen = activePicker === 'textColor' || activePicker === 'bgColor';
    onSubPickerStateChange?.(isSubPickerOpen, activePicker);
    // console.log(`[activePicker useEffect] 🎨 子选择器状态: ${isSubPickerOpen ? '打开' : '关闭'}`);
    
    // 🆕 重置 emoji 选择索引和焦点区域
    if (activePicker === 'emoji') {
      setSelectedEmojiIndex(0);
      setEmojiPickerFocusArea('emojis'); // 默认焦点在 emoji 选择区
      
      // 🎯 初始化标签页第一个按钮的高亮
      setTimeout(() => {
        const emojiPicker = document.querySelector('em-emoji-picker');
        const shadowRoot = (emojiPicker as any)?.shadowRoot;
        const navButtons = shadowRoot?.querySelectorAll('nav button');
        if (navButtons && navButtons.length > 0) {
          navButtons[0].setAttribute('data-keyboard-selected', 'true');
        }
      }, 100);
    } else if (activePicker !== 'emoji') {
      // 清理之前的高亮样式
      const emojiButtons = document.querySelectorAll('.emoji-mart-emoji');
      emojiButtons.forEach((btn) => {
        const button = btn as HTMLElement;
        button.style.outline = 'none';
        button.style.outlineOffset = '0';
      });
    }
  }, [activePicker, onSubPickerStateChange]);

  // 🎨 emoji picker 焦点区域视觉反馈
  useEffect(() => {
    if (activePicker !== 'emoji') return;
    
    const timer = setTimeout(() => {
      const emojiPicker = document.querySelector('em-emoji-picker');
      const shadowRoot = (emojiPicker as any)?.shadowRoot;
      if (!shadowRoot) return;
      
      const nav = shadowRoot.querySelector('nav');
      const searchContainer = shadowRoot.querySelector('.search');
      
      // 清除所有区域的高亮
      if (nav) {
        (nav as HTMLElement).style.removeProperty('box-shadow');
        (nav as HTMLElement).style.removeProperty('background-color');
      }
      if (searchContainer) {
        (searchContainer as HTMLElement).style.removeProperty('box-shadow');
        (searchContainer as HTMLElement).style.removeProperty('background-color');
      }
      
      // 高亮当前焦点区域
      if (emojiPickerFocusArea === 'nav' && nav) {
        (nav as HTMLElement).style.setProperty('box-shadow', '0 0 0 2px rgba(59, 130, 246, 0.3)', 'important');
        (nav as HTMLElement).style.setProperty('background-color', 'rgba(59, 130, 246, 0.05)', 'important');
      } else if (emojiPickerFocusArea === 'search' && searchContainer) {
        (searchContainer as HTMLElement).style.setProperty('box-shadow', '0 0 0 2px rgba(59, 130, 246, 0.3)', 'important');
        (searchContainer as HTMLElement).style.setProperty('background-color', 'rgba(59, 130, 246, 0.05)', 'important');
        
        // 自动聚焦到搜索框
        const searchInput = shadowRoot.querySelector('input[type="search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [activePicker, emojiPickerFocusArea]);

  // 🆕 emoji picker 键盘导航（增强版：支持 Tab 切换焦点区域）
  useEffect(() => {
    if (activePicker !== 'emoji') return;

    const handleEmojiKeyDown = (e: KeyboardEvent) => {
      const emojiPicker = document.querySelector('em-emoji-picker');
      const shadowRoot = (emojiPicker as any)?.shadowRoot;
      
      // 🔄 Tab 键：切换焦点区域
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (e.shiftKey) {
          // Shift+Tab: 反向切换
          setEmojiPickerFocusArea(prev => {
            if (prev === 'emojis') return 'search';
            if (prev === 'search') return 'nav';
            return 'emojis';
          });
        } else {
          // Tab: 正向切换
          setEmojiPickerFocusArea(prev => {
            if (prev === 'nav') return 'search';
            if (prev === 'search') return 'emojis';
            return 'nav';
          });
        }
        return;
      }
      
      // 📍 在 nav 区域：左右方向键切换标签页
      if (emojiPickerFocusArea === 'nav') {
        if (['ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          const navButtons = shadowRoot?.querySelectorAll('nav button');
          if (!navButtons || navButtons.length === 0) return;
          
          // 找到当前选中的标签页
          let currentIndex = -1;
          navButtons.forEach((btn, idx) => {
            if (btn.getAttribute('data-keyboard-selected') === 'true') {
              currentIndex = idx;
            }
          });
          
          if (currentIndex === -1) currentIndex = 0;
          
          if (e.key === 'ArrowRight') {
            currentIndex = (currentIndex + 1) % navButtons.length;
          } else if (e.key === 'ArrowLeft') {
            currentIndex = (currentIndex - 1 + navButtons.length) % navButtons.length;
          } else if (e.key === 'Enter') {
            // Enter 键点击当前选中的标签
            (navButtons[currentIndex] as HTMLElement).click();
            return;
          }
          
          // 更新高亮
          navButtons.forEach((btn, idx) => {
            if (idx === currentIndex) {
              btn.setAttribute('data-keyboard-selected', 'true');
              (btn as HTMLElement).style.setProperty('outline', '2px solid #3b82f6', 'important');
              (btn as HTMLElement).style.setProperty('outline-offset', '2px', 'important');
              (btn as HTMLElement).style.setProperty('border-radius', '4px', 'important');
            } else {
              btn.removeAttribute('data-keyboard-selected');
              (btn as HTMLElement).style.removeProperty('outline');
              (btn as HTMLElement).style.removeProperty('outline-offset');
              (btn as HTMLElement).style.removeProperty('border-radius');
            }
          });
        }
        return;
      }
      
      // 🔍 在 search 区域：不拦截键盘输入（让用户正常输入）
      if (emojiPickerFocusArea === 'search') {
        // 只拦截 Escape 键
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setActivePicker(null);
          onRequestClose?.();
        }
        // Enter 键让搜索框自己处理
        if (e.key === 'Enter') {
          // 聚焦到搜索框
          const searchInput = shadowRoot?.querySelector('input[type="search"]') as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
          }
        }
        return;
      }
      
      // 😀 在 emojis 区域：方向键导航 emoji
      const isNavigationKey = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key) ||
                              (e.key >= '1' && e.key <= '9');
      
      if (!isNavigationKey) return;

      const emojiButtons = shadowRoot?.querySelectorAll('button[aria-label]');
      if (!emojiButtons || emojiButtons.length === 0) return;
      
      // 🛑 阻止事件传播到 Slate 编辑器
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const perLine = 8; // emoji 每行数量
      const totalEmojis = emojiButtons.length;
      
      switch (e.key) {
        case 'ArrowRight':
          setSelectedEmojiIndex(prev => (prev + 1) % totalEmojis);
          break;
        case 'ArrowLeft':
          setSelectedEmojiIndex(prev => (prev - 1 + totalEmojis) % totalEmojis);
          break;
        case 'ArrowDown':
          setSelectedEmojiIndex(prev => Math.min(prev + perLine, totalEmojis - 1));
          break;
        case 'ArrowUp':
          setSelectedEmojiIndex(prev => Math.max(prev - perLine, 0));
          break;
        case 'Enter':
          // 获取当前选中的表情并选择
          const selectedButton = emojiButtons[selectedEmojiIndex] as HTMLElement;
          if (selectedButton) {
            selectedButton.click();
          }
          break;
        case 'Escape':
          setActivePicker(null);
          onRequestClose?.();
          break;
        default:
          // 数字键快速跳转（1-9 对应前9个表情）
          if (e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key) - 1;
            if (index < totalEmojis) {
              setSelectedEmojiIndex(index);
              // 立即选择该表情
              const targetButton = emojiButtons[index] as HTMLElement;
              if (targetButton) {
                targetButton.click();
              }
            }
          }
          break;
      }
    };

    // 使用 capture 阶段捕获事件，优先级高于 Slate
    document.addEventListener('keydown', handleEmojiKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleEmojiKeyDown, { capture: true });
  }, [activePicker, selectedEmojiIndex, emojiPickerFocusArea, onRequestClose]);

  // 🆕 更新选中表情的高亮显示
  useEffect(() => {
    if (activePicker !== 'emoji') return;

    // 等待 emoji picker 渲染完成
    const timer = setTimeout(() => {
      // 🔍 查找 em-emoji-picker（Web Component with Shadow DOM）
      const emojiPicker = document.querySelector('em-emoji-picker');
      
      if (!emojiPicker) {
        console.warn('[Emoji Navigation] 未找到 em-emoji-picker 元素');
        return;
      }
      
      // 🔑 访问 Shadow DOM
      const shadowRoot = (emojiPicker as any).shadowRoot;
      if (!shadowRoot) {
        console.warn('[Emoji Navigation] em-emoji-picker 没有 shadowRoot');
        return;
      }
      
      // 🎯 在 Shadow DOM 内查找 emoji 按钮
      // 根据审查元素的结构：<button aria-label="😀" ...>
      const emojiButtons = shadowRoot.querySelectorAll('button[aria-label]');
      
      console.log(`[Emoji Navigation] 在 Shadow DOM 中找到 ${emojiButtons.length} 个 emoji 按钮，当前选中索引: ${selectedEmojiIndex}`);
      
      emojiButtons.forEach((btn, index) => {
        const button = btn as HTMLElement;
        if (index === selectedEmojiIndex) {
          // 使用多种方式确保高亮显示
          button.style.setProperty('outline', '2px solid #3b82f6', 'important');
          button.style.setProperty('outline-offset', '2px', 'important');
          button.style.setProperty('border-radius', '4px', 'important');
          button.style.setProperty('box-shadow', '0 0 8px rgba(59, 130, 246, 0.4)', 'important');
          button.style.setProperty('background-color', 'rgba(59, 130, 246, 0.1)', 'important');
          button.style.setProperty('transform', 'scale(1.1)', 'important');
          button.style.setProperty('z-index', '10', 'important');
          
          // 添加自定义属性用于 CSS 选择器
          button.setAttribute('data-keyboard-selected', 'true');
          
          // 滚动到可见区域
          button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          
          console.log(`[Emoji Navigation] ✅ 高亮第 ${index} 个 emoji:`, button);
        } else {
          button.style.removeProperty('outline');
          button.style.removeProperty('outline-offset');
          button.style.removeProperty('box-shadow');
          button.style.removeProperty('background-color');
          button.style.removeProperty('transform');
          button.style.removeProperty('z-index');
          button.removeAttribute('data-keyboard-selected');
        }
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedEmojiIndex, activePicker]);

  if (!position.show) return null;

  const actionFeatureConfig: Partial<Record<ToolbarFeatureType, ToolbarButtonConfig>> = {
    tag: { icon: '#', label: '添加标签', color: '#3b82f6' },
    emoji: { icon: 'svg', iconSrc: icons.emoji, label: '添加表情', color: '#f59e0b' },
    dateRange: { icon: 'svg', iconSrc: icons.datetime, label: '选择日期', color: '#10b981' },
    addTask: { icon: 'svg', iconSrc: icons.addTaskGray, iconSrcActive: icons.addTaskColor, label: '任务模式', color: '#3b82f6' },
    textStyle: { icon: 'svg', iconSrc: icons.textstyle, label: '文本样式', color: '#64748b' }, // 🆕 文本样式菜单
  };

  // 渲染文本格式化按钮
  const renderTextFormatButton = (feature: ToolbarFeatureType) => {
    // console.log('[renderTextFormatButton] 🎬 渲染特性:', feature);
    const btnConfig = textFeatureConfig[feature as keyof typeof textFeatureConfig];
    if (!btnConfig) {
      // console.log('[renderTextFormatButton] ❌ 没有找到配置:', feature);
      return null;
    }

    // 🆕 检查当前选区是否已有该格式
    const editor = slateEditorRef?.current?.editor;
    const marks = editor ? Editor.marks(editor) : null;
    const isActive = marks?.[feature as keyof typeof marks] === true;

    // 🆕 textColor 和 bgColor 使用 Tippy 展示 Picker
    if (feature === 'textColor' || feature === 'bgColor') {
      // 🔍 检查是否有颜色 mark
      const hasColorMark = feature === 'textColor' ? !!marks?.color : !!marks?.backgroundColor;
      const isColorPickerOpen = activePicker === feature;
      
      return (
        <Tippy
          key={feature}
          content={
            <div className="headless-picker-tippy-content color-picker-wrapper">
              {activePicker === feature && feature === 'textColor' && (
                <TextColorPicker
                  onPreview={(color) => {
                    // 🆕 预览模式：直接添加 mark，不触发 format 逻辑
                    const editor = slateEditorRef?.current?.editor;
                    if (editor && editor.selection) {
                      // 保存原始选区（仅第一次）
                      if (!savedSelectionRef.current) {
                        savedSelectionRef.current = { ...editor.selection };
                      }
                      // 🔑 关键：使用 Editor.addMark 直接添加，避免触发复杂的 format 逻辑
                      Editor.addMark(editor, 'color', color);
                    }
                  }}
                  onSelect={(color) => {
                    const editor = slateEditorRef?.current?.editor;
                    // 恢复选区
                    if (editor && savedSelectionRef.current) {
                      Transforms.select(editor, savedSelectionRef.current);
                    }
                    onTextFormat?.('textColor', color);
                    savedSelectionRef.current = null; // 清除保存的选区
                    setActivePicker(null);
                    onRequestClose?.();
                  }}
                  onClose={() => {
                    const editor = slateEditorRef?.current?.editor;
                    // 关闭时也恢复选区
                    if (editor && savedSelectionRef.current) {
                      Transforms.select(editor, savedSelectionRef.current);
                      savedSelectionRef.current = null;
                    }
                    setActivePicker(null);
                    onRequestClose?.();
                  }}
                />
              )}
              {activePicker === feature && feature === 'bgColor' && (
                <BackgroundColorPicker
                  onPreview={(color) => {
                    // 🆕 预览模式：直接添加 mark，不触发 format 逻辑
                    const editor = slateEditorRef?.current?.editor;
                    if (editor && editor.selection) {
                      // 保存原始选区（仅第一次）
                      if (!savedSelectionRef.current) {
                        savedSelectionRef.current = { ...editor.selection };
                      }
                      // 🔑 关键：使用 Editor.addMark 直接添加，避免触发复杂的 format 逻辑
                      if (color) {
                        Editor.addMark(editor, 'backgroundColor', color);
                      } else {
                        Editor.removeMark(editor, 'backgroundColor');
                      }
                    }
                  }}
                  onSelect={(color) => {
                    console.log('[BackgroundColorPicker onSelect] 🎨 选择背景颜色:', { color });
                    const editor = slateEditorRef?.current?.editor;
                    
                    console.log('[BackgroundColorPicker onSelect] 📋 Editor 状态:', {
                      hasEditor: !!editor,
                      hasSavedSelection: !!savedSelectionRef.current,
                      savedSelection: savedSelectionRef.current,
                      currentSelection: editor?.selection,
                    });
                    
                    // 恢复选区
                    if (editor && savedSelectionRef.current) {
                      console.log('[BackgroundColorPicker onSelect] ✅ 恢复选区:', savedSelectionRef.current);
                      Transforms.select(editor, savedSelectionRef.current);
                    }
                    
                    console.log('[BackgroundColorPicker onSelect] 🔄 调用 onTextFormat:', {
                      command: 'backgroundColor',
                      value: color,
                      selectionAfterRestore: editor?.selection,
                    });
                    
                    onTextFormat?.('backgroundColor', color);
                    savedSelectionRef.current = null; // 清除保存的选区
                    setActivePicker(null);
                    onRequestClose?.();
                  }}
                  onClose={() => {
                    const editor = slateEditorRef?.current?.editor;
                    // 关闭时也恢复选区
                    if (editor && savedSelectionRef.current) {
                      Transforms.select(editor, savedSelectionRef.current);
                      savedSelectionRef.current = null;
                    }
                    setActivePicker(null);
                    onRequestClose?.();
                  }}
                />
              )}
            </div>
          }
          visible={activePicker === feature}
          onClickOutside={(instance, event) => {
            // 🔧 检查是否点击了嵌套的 Tippy 内容（textStyle 菜单内的颜色选择器）
            const target = event.target as HTMLElement;
            if (target.closest('[data-tippy-root]') || target.closest('.tippy-box')) {
              return; // 点击的是嵌套的 Tippy，不关闭当前 picker
            }
            setActivePicker(null);
          }}
          placement={getSmartPlacement() as any}
          interactive={true}
          interactiveBorder={20} // 🆕 增加交互边界，防止误关闭
          interactiveDebounce={0}
          offset={[0, 8]}
          maxWidth="none"
          animation="scale"
          appendTo={() => document.body}
        >
          <button
            className={`headless-toolbar-btn headless-toolbar-text-btn ${
              hasColorMark || isColorPickerOpen ? 'headless-toolbar-btn-active' : ''
            }`}
            data-submenu-trigger="true"
            onMouseDown={(e) => {
              e.preventDefault(); // 🔥 阻止焦点转移
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const newValue = activePicker === feature ? null : feature;
              console.log(`[textColor/bgColor onClick] 🎨 activePicker: ${activePicker} → ${newValue}, feature: ${feature}`);
              setActivePicker(newValue);
            }}
          >
            {btnConfig.icon === 'svg' && btnConfig.iconSrc ? (
              <img src={btnConfig.iconSrc} alt={btnConfig.label} style={{ width: 20, height: 20, display: 'block' }} />
            ) : (
              btnConfig.icon
            )}
          </button>
        </Tippy>
      );
    }

    // 🆕 bullet 特殊处理：使用 SVG 图标（直接内嵌路径）
    if (feature === 'bullet') {
      return (
        <Tippy key={feature} content={btnConfig.label} placement="top">
          <button
            className="headless-toolbar-btn headless-toolbar-text-btn"
            onMouseDown={(e) => {
              e.preventDefault(); // 🔥 阻止焦点转移
              e.stopPropagation();
            }}
            onClick={(e) => {
              console.log('[bullet onClick] 🔔 被触发！', { command: btnConfig.command, hasCallback: !!onTextFormat });
              e.preventDefault();
              e.stopPropagation();
              onTextFormat?.(btnConfig.command);
              // 🆕 执行完 bullet 命令后关闭 FloatingBar
              onRequestClose?.();
            }}
          >
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
              <path d="M1.33333 2.66667C1.68696 2.66667 2.02609 2.52619 2.27614 2.27614C2.52619 2.02609 2.66667 1.68696 2.66667 1.33333C2.66667 0.979711 2.52619 0.640573 2.27614 0.390524C2.02609 0.140476 1.68696 0 1.33333 0C0.979711 0 0.640573 0.140476 0.390524 0.390524C0.140476 0.640573 0 0.979711 0 1.33333C0 1.68696 0.140476 2.02609 0.390524 2.27614C0.640573 2.52619 0.979711 2.66667 1.33333 2.66667ZM5.66667 0.333333C5.40145 0.333333 5.1471 0.43869 4.95956 0.626226C4.77202 0.813763 4.66667 1.06812 4.66667 1.33333C4.66667 1.59855 4.77202 1.8529 4.95956 2.04044C5.1471 2.22798 5.40145 2.33333 5.66667 2.33333H15C15.2652 2.33333 15.5196 2.22798 15.7071 2.04044C15.8946 1.8529 16 1.59855 16 1.33333C16 1.06812 15.8946 0.813763 15.7071 0.626226C15.5196 0.43869 15.2652 0.333333 15 0.333333H5.66667ZM5.66667 6C5.40145 6 5.1471 6.10536 4.95956 6.29289C4.77202 6.48043 4.66667 6.73478 4.66667 7C4.66667 7.26522 4.77202 7.51957 4.95956 7.70711C5.1471 7.89464 5.40145 8 5.66667 8H15C15.2652 8 15.5196 7.89464 15.7071 7.70711C15.8946 7.51957 16 7.26522 16 7C16 6.73478 15.8946 6.48043 15.7071 6.29289C15.5196 6.10536 15.2652 6 15 6H5.66667ZM5.66667 11.6667C5.40145 11.6667 5.1471 11.772 4.95956 11.9596C4.77202 12.1471 4.66667 12.4015 4.66667 12.6667C4.66667 12.9319 4.77202 13.1862 4.95956 13.3738C5.1471 13.5613 5.40145 13.6667 5.66667 13.6667H15C15.2652 13.6667 15.5196 13.5613 15.7071 13.3738C15.8946 13.1862 16 12.9319 16 12.6667C16 12.4015 15.8946 12.1471 15.7071 11.9596C15.5196 11.772 15.2652 11.6667 15 11.6667H5.66667ZM2.66667 12.6667C2.66667 13.0203 2.52619 13.3594 2.27614 13.6095C2.02609 13.8595 1.68696 14 1.33333 14C0.979711 14 0.640573 13.8595 0.390524 13.6095C0.140476 13.3594 0 13.0203 0 12.6667C0 12.313 0.140476 11.9739 0.390524 11.7239C0.640573 11.4738 0.979711 11.3333 1.33333 11.3333C1.68696 11.3333 2.02609 11.4738 2.27614 11.7239C2.52619 11.9739 2.66667 12.313 2.66667 12.6667ZM1.33333 8.33333C1.68696 8.33333 2.02609 8.19286 2.27614 7.94281C2.52619 7.69276 2.66667 7.35362 2.66667 7C2.66667 6.64638 2.52619 6.30724 2.27614 6.05719C2.02609 5.80714 1.68696 5.66667 1.33333 5.66667C0.979711 5.66667 0.640573 5.80714 0.390524 6.05719C0.140476 6.30724 0 6.64638 0 7C0 7.35362 0.140476 7.69276 0.390524 7.94281C0.640573 8.19286 0.979711 8.33333 1.33333 8.33333Z" fill="#4B5563"/>
            </svg>
          </button>
        </Tippy>
      );
    }

    return (
      <Tippy key={feature} content={btnConfig.label} placement="top">
        <button
          className={`headless-toolbar-btn headless-toolbar-text-btn ${
            isActive ? 'headless-toolbar-btn-active' : ''
          }`}
          onMouseDown={(e) => {
            e.preventDefault(); // 🔥 阻止焦点转移
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTextFormat?.(btnConfig.command);
          }}
        >
          {btnConfig.icon === 'svg' && btnConfig.iconSrc ? (
            <img src={btnConfig.iconSrc} alt={btnConfig.label} style={{ width: 20, height: 20, display: 'block' }} />
          ) : (
            <span className={feature === 'bold' ? 'font-bold' : feature === 'italic' ? 'italic' : ''}>
              {btnConfig.icon}
            </span>
          )}
        </button>
      </Tippy>
    );
  };

  // 渲染快捷操作按钮
  const renderQuickActionButton = (feature: ToolbarFeatureType) => {
    const btnConfig = actionFeatureConfig[feature as keyof typeof actionFeatureConfig];
    if (!btnConfig) return null;

    // 🆕 addTask 特殊处理：Toggle 按钮
    if (feature === 'addTask') {
      const iconSrc = currentIsTask ? btnConfig.iconSrcActive : btnConfig.iconSrc;
      return (
        <Tippy key={feature} content={btnConfig.label} placement="top">
          <button
            className={`headless-toolbar-btn headless-toolbar-action-btn ${
              currentIsTask ? 'headless-toolbar-btn-active' : ''
            }`}
            onMouseDown={(e) => {
              e.preventDefault(); // 🔥 阻止焦点转移
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTaskToggle?.(!currentIsTask);
            }}
          >
            {btnConfig.icon === 'svg' && iconSrc ? (
              <img src={iconSrc} alt={btnConfig.label} style={{ width: 20, height: 20, display: 'block' }} />
            ) : (
              btnConfig.icon
            )}
          </button>
        </Tippy>
      );
    }

    // Emoji 按钮使用 Tippy.js
    if (feature === 'emoji') {
      return (
        <Tippy
          key={feature}
          content={
            <div className="headless-emoji-tippy-content">
              {/* 只在 picker 激活时才渲染 Emoji Picker */}
              {activePicker === feature && (
                <div>
                  <Picker
                    data={data}
                    onEmojiSelect={(emoji: any) => {
                      onEmojiSelect?.(emoji.native);
                      setActivePicker(null);
                      onRequestClose?.(); // 🆕 选择 Emoji 后自动关闭 FloatingBar
                    }}
                    theme="light"
                    set="native"
                    locale="zh"
                    perLine={8}
                    emojiSize={20}
                    previewPosition="none"
                    skinTonePosition="none"
                  />
                </div>
              )}
            </div>
          }
          visible={activePicker === feature}
          onClickOutside={() => setActivePicker(null)}
          placement={getSmartPlacement() as any}
          interactive={true}
          offset={[0, 8]}
          maxWidth="none"
          animation="scale"
          theme="transparent"
        >
          <button
            className={`headless-toolbar-btn headless-toolbar-action-btn ${
              activePicker === feature ? 'headless-toolbar-btn-active' : ''
            }`}
            style={{ backgroundColor: activePicker === feature ? btnConfig.color : undefined }}
            onMouseDown={(e) => {
              e.preventDefault(); // 🔥 阻止焦点转移
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActivePicker(activePicker === feature ? null : feature);
            }}
          >
            {btnConfig.icon === 'svg' && btnConfig.iconSrc ? (
              <img src={btnConfig.iconSrc} alt={btnConfig.label} style={{ width: 20, height: 20, display: 'block' }} />
            ) : (
              btnConfig.icon
            )}
          </button>
        </Tippy>
      );
    }

    // DateRange 使用 Tippy.js 进行正确定位
    if (feature === 'dateRange') {
      return (
        <Tippy
          key={feature}
          content={
            <div className="headless-date-tippy-content">
              {/* 只在 picker 激活时才渲染 DateTimePicker */}
              {activePicker === feature && (
                <UnifiedDateTimePicker
                  eventId={eventId}
                  useTimeHub={useTimeHub}
                  onApplied={(startIso, endIso, allDay) => {
                    // TimeHub 模式：时间已由 TimeHub 写入，这里通知外层插入可视化/保存其它字段
                    onTimeApplied?.(startIso, endIso, allDay);
                    setActivePicker(null);
                    onRequestClose?.(); // 🆕 选择日期后自动关闭 FloatingBar
                  }}
                  // 非 TimeHub 模式下，沿用原有 onSelect 回调
                  onSelect={(!useTimeHub || !eventId) ? ((start: string | null, end: string | null) => {
                    if (start && end) {
                      onDateRangeSelect?.(new Date(start), new Date(end));
                    }
                    setActivePicker(null);
                    onRequestClose?.(); // 🆕 选择日期后自动关闭 FloatingBar
                  }) : undefined}
                  onClose={() => {
                    setActivePicker(null);
                    onRequestClose?.(); // 🆕 关闭 DatePicker 也关闭 FloatingBar
                  }}
                />
              )}
            </div>
          }
          visible={activePicker === feature}
          onClickOutside={() => {
            setActivePicker(null);
          }}
          placement={getSmartPlacement() as any}
          interactive={true}
          interactiveBorder={20}
          interactiveDebounce={0}
          offset={[0, 8]}
          maxWidth="none"
          animation="shift-away"
          duration={200}
          appendTo={() => document.body}
          zIndex={99999}
          theme="light-no-padding"
        >
          <button
            className={`headless-toolbar-btn headless-toolbar-action-btn ${
              activePicker === feature ? 'headless-toolbar-btn-active' : ''
            }`}
            style={{ backgroundColor: activePicker === feature ? btnConfig.color : undefined }}
            onMouseDown={(e) => {
              e.preventDefault(); // 🔥 阻止焦点转移
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActivePicker(activePicker === feature ? null : feature);
            }}
          >
            {btnConfig.icon === 'svg' && btnConfig.iconSrc ? (
              <img src={btnConfig.iconSrc} alt={btnConfig.label} style={{ width: 20, height: 20, display: 'block' }} />
            ) : (
              btnConfig.icon
            )}
          </button>
        </Tippy>
      );
    }

    // 其他按钮也使用 Tippy.js
    return (
      <Tippy
        key={feature}
        content={
          <div className="headless-picker-tippy-content">
            {/* 只在 picker 激活时才渲染对应的组件 */}
            {activePicker === feature && feature === 'tag' && (
              <TagPicker
                availableTags={availableTags}
                selectedTags={currentTags}
                editorMode={editorMode}
                slateEditorRef={slateEditorRef}
                onSelect={(tagIds) => {
                  // 标签选择是多选模式，不应该在每次选择后关闭
                  onTagSelect?.(tagIds);
                  // setActivePicker(null); // 移除自动关闭
                }}
                onClose={() => {
                  setActivePicker(null);
                  onRequestClose?.(); // 🆕 通知父组件关闭整个 FloatingBar
                }}
              />
            )}
            
            {activePicker === feature && feature === 'priority' && (
              <PriorityPicker
                onSelect={(priority) => {
                  onPrioritySelect?.(priority);
                  setActivePicker(null);
                  onRequestClose?.(); // 🆕 选择后自动关闭 FloatingBar
                }}
                onClose={() => {
                  setActivePicker(null);
                  onRequestClose?.(); // 🆕 关闭 Picker 也关闭 FloatingBar
                }}
              />
            )}

            {activePicker === feature && feature === 'color' && (
              <ColorPicker
                onSelect={(color) => {
                  onColorSelect?.(color);
                  setActivePicker(null);
                  onRequestClose?.(); // 🆕 选择后自动关闭 FloatingBar
                }}
                onClose={() => {
                  setActivePicker(null);
                  onRequestClose?.(); // 🆕 关闭 Picker 也关闭 FloatingBar
                }}
              />
            )}

            {/* 🆕 textStyle 菜单：显示文本格式化按钮 */}
            {(activePicker === 'textStyle' || activePicker === 'textColor' || activePicker === 'bgColor') && feature === 'textStyle' && (
              <div className="text-style-menu">
                <div className="text-style-buttons">
                  {(() => {
                    // 🔧 根据编辑器模式决定显示的功能（标题模式下隐藏 bullet）
                    // 🎨 调整顺序：将 clearFormat 放在最后，实现单行布局
                    const textStyleFeaturesBase: ToolbarFeatureType[] = ['bold', 'italic', 'strikethrough', 'textColor', 'bgColor', 'bullet', 'clearFormat'];
                    const textStyleMenuFeatures = editorMode === 'title'
                      ? textStyleFeaturesBase.filter(f => f !== 'bullet')
                      : textStyleFeaturesBase;
                    
                    return textStyleMenuFeatures.map((textFeature) => (
                      <React.Fragment key={textFeature}>
                        {renderTextFormatButton(textFeature as ToolbarFeatureType)}
                      </React.Fragment>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        }
        visible={
          activePicker === feature || 
          (feature === 'textStyle' && (activePicker === 'textColor' || activePicker === 'bgColor'))
        }
        onClickOutside={(instance, event) => {
          // 🔧 检查是否点击了嵌套的 Tippy 或子菜单触发按钮
          const target = event.target as HTMLElement;
          
          console.log('[textStyle onClickOutside] 🔍', {
            target: target.tagName,
            className: target.className,
            hasSubmenuTrigger: !!target.closest('[data-submenu-trigger]'),
            hasTippyRoot: !!target.closest('[data-tippy-root]'),
            hasTippyBox: !!target.closest('.tippy-box'),
            hasToolbar: !!target.closest('.headless-floating-toolbar'),
          });
          
          // 1. 点击了 Tippy 内容（颜色选择器等），不关闭
          if (target.closest('[data-tippy-root]') || target.closest('.tippy-box')) {
            return;
          }
          
          // 2. 点击了子菜单触发按钮（textColor/bgColor），不关闭（允许打开子菜单）
          if (target.closest('[data-submenu-trigger]')) {
            return;
          }
          
          // 3. 点击了 FloatingBar 的其他按钮，不关闭（允许切换菜单）
          if (target.closest('.headless-floating-toolbar')) {
            return;
          }
          
          // 4. 点击了真正的外部区域，关闭
          setActivePicker(null);
        }}
        placement={getSmartPlacement() as any}
        interactive={true}
        offset={[0, 8]}
        maxWidth="none"
        animation="scale"
        theme="transparent"
      >
        <button
          className={`headless-toolbar-btn headless-toolbar-action-btn ${
            activePicker === feature ? 'headless-toolbar-btn-active' : ''
          }`}
          style={{ backgroundColor: activePicker === feature ? btnConfig.color : undefined }}
          onMouseDown={(e) => {
            e.preventDefault(); // 🔥 阻止焦点转移
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log(`[textStyle 主按钮 onClick] 🔔 被触发！当前 activePicker: ${activePicker}, feature: ${feature}`);
            console.log('[textStyle 主按钮 onClick] 调用堆栈:', new Error().stack);
            
            // 🔑 关键：如果 activePicker 已经不是 textStyle，说明子菜单按钮刚刚修改了它
            // 这种情况下不应该再执行 textStyle 按钮的切换逻辑
            if (activePicker !== 'textStyle' && activePicker !== null) {
              console.log(`[textStyle 主按钮 onClick] ⏭️ activePicker 已被子菜单修改为 ${activePicker}，跳过`);
              return;
            }
            
            console.log(`[textStyle 主按钮 onClick] 切换状态: ${activePicker} → ${activePicker === feature ? null : feature}`);
            setActivePicker(activePicker === feature ? null : feature);
          }}
        >
          {btnConfig.icon === 'svg' && btnConfig.iconSrc ? (
            <img src={btnConfig.iconSrc} alt={btnConfig.label} style={{ width: 20, height: 20, display: 'block' }} />
          ) : (
            btnConfig.icon
          )}
        </button>
      </Tippy>
    );
  };

  return (
    <div
      ref={toolbarRef}
      className="headless-floating-toolbar"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 10000,
      }}
    >
      <div className="headless-toolbar-container">
        <div className="headless-toolbar-main">
          {effectiveFeatures.map((feature) => {
            // 文本格式化功能（包括 textColor 和 bgColor）
            if (['bold', 'italic', 'underline', 'strikethrough', 'clearFormat', 'bullet', 'textColor', 'bgColor'].includes(feature)) {
              return renderTextFormatButton(feature);
            }
            // 快捷操作功能
            return renderQuickActionButton(feature);
          })}
        </div>
      </div>
    </div>
  );
};