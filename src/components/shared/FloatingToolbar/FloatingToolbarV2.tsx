/**
 * FloatingToolbarV2 - 可配置的浮动工具栏
 * 
 * 特性：
 * - 支持两种模式：快捷操作(Ctrl+/ 或 Ctrl+,) 和 文本格式化(选中文本)
 * - 可配置的功能组合
 * - 各个 Picker 组件独立封装
 */

import React, { useState, useRef, useEffect } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { ToolbarConfig, ToolbarFeatureType, FloatingToolbarProps } from './types';
import { TagPicker } from './pickers/TagPicker';
import UnifiedDateTimePicker from './pickers/UnifiedDateTimePicker';
import { PriorityPicker } from './pickers/PriorityPicker';
import { ColorPicker } from './pickers/ColorPicker';
import './FloatingToolbarV2.css';

export const FloatingToolbarV2: React.FC<FloatingToolbarProps> = ({
  position,
  config,
  onTextFormat,
  onTagSelect,
  onEmojiSelect,
  onDateRangeSelect,
  onPrioritySelect,
  onColorSelect,
  availableTags = [],
  currentTags = [],
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [activePicker, setActivePicker] = useState<string | null>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState({ x: 0, y: 0 });

  // 计算 Picker 最佳显示位置（参照 TagManager）
  const calculateOptimalPosition = (rect: DOMRect, pickerWidth = 352, pickerHeight = 435) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;
    
    let x = rect.left;
    let y = rect.bottom + 5;
    
    // 右边界检查
    if (x + pickerWidth > viewportWidth) {
      x = viewportWidth - pickerWidth - 10;
    }
    
    // 左边界检查
    if (x < 10) {
      x = 10;
    }
    
    // 下边界检查
    if (y + pickerHeight > viewportHeight + scrollY) {
      y = rect.top - pickerHeight - 5; // 在元素上方显示
    }
    
    // 上边界检查
    if (y < scrollY + 10) {
      y = scrollY + 10;
    }
    
    return { x, y };
  };

  // 根据 position 调整工具栏位置，避免超出屏幕
  useEffect(() => {
    if (!position.show || !toolbarRef.current) return;

    const toolbar = toolbarRef.current;
    const rect = toolbar.getBoundingClientRect();
    
    // 如果超出右边界，向左调整
    if (rect.right > window.innerWidth) {
      toolbar.style.left = `${position.left - (rect.right - window.innerWidth) - 10}px`;
    }
    
    // 如果超出上边界，向下显示
    if (rect.top < 0) {
      toolbar.style.top = `${position.top + rect.height + 20}px`;
    }
  }, [position]);

  if (!position.show) return null;

  // 渲染文本格式化按钮
  const renderTextFormatButton = (feature: ToolbarFeatureType) => {
    const formatMap: Record<string, { icon: string; label: string; command: string }> = {
      bold: { icon: 'B', label: '粗体', command: 'bold' },
      italic: { icon: 'I', label: '斜体', command: 'italic' },
      underline: { icon: 'U', label: '下划线', command: 'underline' },
      strikethrough: { icon: 'S', label: '删除线', command: 'strikeThrough' },
      clearFormat: { icon: '✕', label: '清除格式', command: 'removeFormat' },
    };

    const config = formatMap[feature];
    if (!config) return null;

    return (
      <button
        key={feature}
        className="toolbar-btn"
        title={config.label}
        onClick={() => onTextFormat?.(config.command)}
      >
        <span style={{ fontWeight: feature === 'bold' ? 'bold' : 'normal' }}>
          {config.icon}
        </span>
      </button>
    );
  };

  // 渲染快捷操作按钮
  const renderQuickActionButton = (feature: ToolbarFeatureType) => {
    const actionMap: Record<string, { icon: string; label: string }> = {
      tag: { icon: '#', label: '添加标签' },
      emoji: { icon: '😊', label: '添加表情' },
      dateRange: { icon: '📅', label: '选择日期' },
      priority: { icon: '⚡', label: '设置优先级' },
      color: { icon: '🎨', label: '选择颜色' },
      link: { icon: '🔗', label: '插入链接' },
    };

    const actionConfig = actionMap[feature];
    if (!actionConfig) return null;

    return (
      <button
        key={feature}
        className={`toolbar-btn ${activePicker === feature ? 'active' : ''}`}
        title={actionConfig.label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // 如果是 emoji 按钮，计算最佳显示位置
          if (feature === 'emoji') {
            const buttonRect = e.currentTarget.getBoundingClientRect();
            // 使用更精确的位置计算，确保不超出视窗
            const optimalPosition = calculateOptimalPosition(buttonRect, 352, 435);
            setEmojiPickerPosition(optimalPosition);
          }
          
          setActivePicker(activePicker === feature ? null : feature);
        }}
      >
        {actionConfig.icon}
      </button>
    );
  };

  return (
    <div
      ref={toolbarRef}
      className="floating-toolbar-v2"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
        zIndex: 10000,
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      {/* 主工具栏 */}
      <div className="toolbar-main">
        {config.features.map((feature) => {
          // 文本格式化功能
          if (['bold', 'italic', 'underline', 'strikethrough', 'clearFormat'].includes(feature)) {
            return renderTextFormatButton(feature);
          }
          // 快捷操作功能
          return renderQuickActionButton(feature);
        })}
      </div>

      {/* Picker 面板 */}
      {activePicker === 'tag' && (
        <TagPicker
          availableTags={availableTags}
          selectedTags={currentTags}
          onSelect={(tag) => {
            onTagSelect?.(tag);
            setActivePicker(null);
          }}
          onClose={() => setActivePicker(null)}
        />
      )}

      {/* emoji-mart 表情选择器（参照 TagManager 样式） */}
      {activePicker === 'emoji' && (
        <div 
          style={{
            position: 'fixed',
            left: emojiPickerPosition.x,
            top: emojiPickerPosition.y,
            zIndex: 10001, // 比 FloatingToolbar 更高
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'white',
            border: '1px solid #e5e7eb',
            // 添加最大宽高限制
            maxWidth: '352px',
            maxHeight: '435px',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Picker
            data={data}
            onEmojiSelect={(emoji: any) => {
              onEmojiSelect?.(emoji.native);
              setActivePicker(null);
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

      {activePicker === 'dateRange' && (
        <UnifiedDateTimePicker
          onSelect={(start: string | null, end: string | null) => {
            if (start && end) {
              onDateRangeSelect?.(new Date(start), new Date(end));
            }
            setActivePicker(null);
          }}
          onClose={() => setActivePicker(null)}
        />
      )}

      {activePicker === 'priority' && (
        <PriorityPicker
          onSelect={(priority) => {
            onPrioritySelect?.(priority);
            setActivePicker(null);
          }}
          onClose={() => setActivePicker(null)}
        />
      )}

      {activePicker === 'color' && (
        <ColorPicker
          onSelect={(color) => {
            onColorSelect?.(color);
            setActivePicker(null);
          }}
          onClose={() => setActivePicker(null)}
        />
      )}
    </div>
  );
};
