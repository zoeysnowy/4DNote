/**
 * BackgroundColorPicker - 背景颜色选择器
 * 使用 Headless UI 保持设计统一
 * 支持键盘导航：↑↓ 选择，Enter 确认，Esc 关闭
 * 数字快捷键：1-9 快速选择对应颜色
 */

import React, { Fragment, useEffect } from 'react';
import { Listbox } from '@headlessui/react';
import './BackgroundColorPicker.css';

interface BackgroundColorPickerProps {
  onSelect: (color: string) => void;
  onClose: () => void;
  onPreview?: (color: string) => void;
}

const BG_COLORS = [
  { value: '#fee2e2', label: '红底', key: '1' },
  { value: '#fed7aa', label: '橙底', key: '2' },
  { value: '#fef3c7', label: '黄底', key: '3' },
  { value: '#d1fae5', label: '绿底', key: '4' },
  { value: '#dbeafe', label: '蓝底', key: '5' },
  { value: '#e0e7ff', label: '紫底', key: '6' },
  { value: '#fce7f3', label: '粉底', key: '7' },
  { value: '#f3f4f6', label: '灰底', key: '8' },
  { value: '', label: '无背景', key: '9' },
];

export const BackgroundColorPicker: React.FC<BackgroundColorPickerProps> = ({
  onSelect,
  onClose,
  onPreview,
}) => {
  // 数字键快捷选择
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < BG_COLORS.length) {
          e.preventDefault();
          onSelect(BG_COLORS[index].value);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelect, onClose]);

  return (
    <div 
      className="color-picker-panel"
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      <div className="picker-header">
        <span className="picker-title">背景颜色</span>
        <span className="picker-header-tip">提示：按 1-9 快速选择</span>
        <button 
          className="picker-close-btn" 
          onClick={onClose}
          onMouseDown={(e) => e.preventDefault()}
        >
          ✕
        </button>
      </div>

      <Listbox value={undefined} onChange={onSelect}>
        <div className="color-grid">
          {BG_COLORS.map((color) => (
            <Listbox.Option
              key={color.value || 'none'}
              value={color.value}
              as={Fragment}
            >
              {({ active }) => (
                <button
                  className={`bg-color-item ${active ? 'bg-color-item-active' : ''} ${!color.value ? 'no-bg' : ''}`}
                  style={{ backgroundColor: color.value || 'transparent' }}
                  onMouseDown={(e) => e.preventDefault()}
                  title={color.label}
                >
                  <span className="bg-color-shortcut">{color.key}</span>
                </button>
              )}
            </Listbox.Option>
          ))}
        </div>
      </Listbox>
    </div>
  );
};
