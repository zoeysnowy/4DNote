/**
 * ColorPicker - 颜色选择器
 * 支持键盘导航：↑↓←→ 选择，Enter 确认，Esc 关闭
 */

import React from 'react';
import './ColorPicker.css';
import { useKeyboardNavigation } from './useKeyboardNavigation';

interface ColorPickerProps {
  onSelect: (color: string) => void;
  onClose: () => void;
}

// 莫兰迪配色 - 奶油马卡龙系，柔和又鲜活
const COLORS = [
  { value: '#e8b4b8', label: '奶油粉' },
  { value: '#f5d0a9', label: '杏仁黄' },
  { value: '#f9e4a6', label: '奶油黄' },
  { value: '#c8dbb3', label: '薄荷绿' },
  { value: '#b3d9e6', label: '天空蓝' },
  { value: '#d4c5e8', label: '薰衣草' },
  { value: '#e8c5d4', label: '藕荷粉' },
  { value: '#d4d4ce', label: '卡其灰' },
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  onSelect,
  onClose,
}) => {
  const { hoveredIndex, setHoveredIndex, containerRef } = useKeyboardNavigation({
    items: COLORS,
    onSelect: (color) => onSelect(color.value),
    onClose,
    enabled: true,
    gridColumns: 4, // 4 列网格布局
  });

  return (
    <div className="color-picker-panel">
      <div className="picker-header">
        <span className="picker-title">选择颜色</span>
        <button className="picker-close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="color-grid" ref={containerRef}>
        {COLORS.map((color, index) => (
          <button
            key={color.value}
            className={`color-item ${index === hoveredIndex ? 'keyboard-focused' : ''}`}
            onClick={() => onSelect(color.value)}
            onMouseEnter={() => setHoveredIndex(index)}
            title={color.label}
            style={{
              backgroundColor: color.value,
            }}
          >
            <span className="color-checkmark">✓</span>
          </button>
        ))}
      </div>
    </div>
  );
};
