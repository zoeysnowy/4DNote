import React, { useState, useEffect, useMemo } from 'react';
import { HexColorPicker } from 'react-colorful';
import tinycolor from 'tinycolor2';

interface ColorPickerProps {
  onSelect: (color: string) => void;
  onClose: () => void;
  position: { x: number; y: number };
  currentColor: string;
  isVisible: boolean;
}

// 紧凑型可拖动颜色选择器组件
const ColorPicker: React.FC<ColorPickerProps> = ({ 
  onSelect, 
  onClose, 
  position, 
  currentColor,
  isVisible 
}) => {
  const [selectedColor, setSelectedColor] = useState(currentColor);
  const [customMainColors, setCustomMainColors] = useState([
    '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'
  ]);
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const [editingColorIndex, setEditingColorIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [windowPosition, setWindowPosition] = useState(position);

  // 更新当前颜色
  useEffect(() => {
    setSelectedColor(currentColor);
  }, [currentColor]);

  // 更新窗口位置
  useEffect(() => {
    setWindowPosition(position);
  }, [position]);

  // 验证颜色代码
  const isValidColor = (color: string) => {
    return tinycolor(color).isValid();
  };

  // 处理颜色输入变化
  const handleColorInputChange = (value: string) => {
    setSelectedColor(value);
  };

  // 生成颜色渐变的函数 - 优化算法
  const generateColorShades = (baseColor: string) => {
    const shades = [];
    const base = tinycolor(baseColor);
    
    for (let i = 0; i < 10; i++) {
      // 从亮度95%到15%的渐变
      const lightness = 95 - (i * 8);
      const shade = base.clone().lighten(40 - i * 8).toString();
      shades.push(shade);
    }
    return shades;
  };

  // 生成当前调色板
  const colorPalette = useMemo(() => {
    return customMainColors.map(color => ({
      main: color,
      shades: generateColorShades(color)
    }));
  }, [customMainColors]);

  // 处理主色调编辑
  const handleMainColorEdit = (index: number) => {
    setEditingColorIndex(index);
    setSelectedColor(customMainColors[index]);
    setShowCustomColorPicker(true);
  };

  // 保存主色调编辑
  const handleMainColorSave = (newColor: string) => {
    if (editingColorIndex >= 0 && isValidColor(newColor)) {
      const newMainColors = [...customMainColors];
      newMainColors[editingColorIndex] = newColor;
      setCustomMainColors(newMainColors);
      
      // 保存到本地存储
      localStorage.setItem('customColorPalette', JSON.stringify(newMainColors));
    }
    setShowCustomColorPicker(false);
    setEditingColorIndex(-1);
  };

  // 加载保存的调色板
  useEffect(() => {
    const saved = localStorage.getItem('customColorPalette');
    if (saved) {
      try {
        setCustomMainColors(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to load saved color palette');
      }
    }
  }, []);

  // 拖动功能
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setWindowPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleColorSelect = (color: string) => {
    if (isValidColor(color)) {
      setSelectedColor(color);
      onSelect(color);
      onClose();
    }
  };

  if (!isVisible) return null;

  return (
    <div 
      style={{ 
        position: 'fixed', 
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.3)'
      }}
      onClick={onClose}
    >
      <div 
        style={{ 
          position: 'absolute',
          left: Math.min(Math.max(windowPosition.x, 0), window.innerWidth - 320),
          top: Math.min(Math.max(windowPosition.y, 0), window.innerHeight - 400),
          width: '320px',
          backgroundColor: 'white',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          border: '1px solid #e2e8f0',
          cursor: isDragging ? 'grabbing' : 'default'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 可拖动的标题栏 */}
        <div 
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            cursor: 'grab'
          }}
          onMouseDown={handleMouseDown}
        >
          <span style={{ fontWeight: '600', fontSize: '14px', userSelect: 'none' }}>颜色选择器</span>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '2px',
            color: '#64748b',
            borderRadius: '4px'
          }}>×</button>
        </div>
        
        <div style={{ padding: '12px' }}>
          {/* 自定义颜色选择器 - 可折叠 */}
          {showCustomColorPicker && (
            <div style={{ marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                编辑主色调 #{editingColorIndex + 1}
              </div>
              <div style={{ padding: '12px' }}>
                {/* @ts-ignore - React 19 compatibility issue with react-colorful */}
                <HexColorPicker 
                  color={selectedColor} 
                  onChange={setSelectedColor}
                  style={{ width: '100%', height: '80px' }}
                />
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  marginTop: '8px',
                  marginBottom: '8px'
                }}>
                  <div 
                    style={{
                      width: '24px',
                      height: '24px',
                      backgroundColor: selectedColor,
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                      flexShrink: 0
                    }}
                  />
                  <input
                    type="text"
                    value={selectedColor}
                    onChange={(e) => handleColorInputChange(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      border: `1px solid ${isValidColor(selectedColor) ? '#d1d5db' : '#ef4444'}`,
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      backgroundColor: isValidColor(selectedColor) ? 'white' : '#fef2f2'
                    }}
                    placeholder="#ffffff"
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleMainColorSave(selectedColor)}
                    disabled={!isValidColor(selectedColor)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      backgroundColor: isValidColor(selectedColor) ? '#3b82f6' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: isValidColor(selectedColor) ? 'pointer' : 'not-allowed'
                    }}
                  >
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setShowCustomColorPicker(false);
                      setEditingColorIndex(-1);
                    }}
                    style={{
                      flex: 1,
                      padding: '6px',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* 紧凑型颜色调色板 */}
          <div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <label style={{ fontSize: '12px', fontWeight: '600' }}>
                调色板
              </label>
            </div>
            
            {/* 主色调编辑行 */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(10, 1fr)', 
              gap: '2px', 
              marginBottom: '6px'
            }}>
              {customMainColors.map((color, index) => (
                <button
                  key={index}
                  onClick={() => handleMainColorEdit(index)}
                  style={{
                    width: '26px',
                    height: '20px',
                    backgroundColor: color,
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  title={`编辑主色调 #${index + 1}: ${color}`}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
            
            {/* 颜色渐变网格 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
              {colorPalette.map((colorGroup, groupIndex) => (
                <div key={groupIndex} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {colorGroup.shades.map((shade, shadeIndex) => (
                    <button
                      key={`${groupIndex}-${shadeIndex}`}
                      onClick={() => handleColorSelect(shade)}
                      style={{
                        width: '26px',
                        height: '16px',
                        backgroundColor: shade,
                        border: selectedColor === shade ? '2px solid #000' : '1px solid rgba(0,0,0,0.1)',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        padding: '0'
                      }}
                      title={shade}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.zIndex = '10';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.zIndex = '1';
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          
          {/* 当前颜色显示和输入 */}
          <div style={{ 
            marginTop: '12px',
            padding: '8px',
            backgroundColor: '#f8fafc',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div 
              style={{
                width: '24px',
                height: '24px',
                backgroundColor: selectedColor,
                borderRadius: '4px',
                border: '1px solid #e2e8f0',
                flexShrink: 0
              }}
            />
            <input
              type="text"
              value={selectedColor}
              onChange={(e) => handleColorInputChange(e.target.value)}
              style={{
                flex: 1,
                padding: '4px 8px',
                border: `1px solid ${isValidColor(selectedColor) ? '#d1d5db' : '#ef4444'}`,
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                backgroundColor: isValidColor(selectedColor) ? 'white' : '#fef2f2'
              }}
              placeholder="#ffffff"
            />
            <button
              onClick={() => handleColorSelect(selectedColor)}
              disabled={!isValidColor(selectedColor)}
              style={{
                padding: '4px 8px',
                backgroundColor: isValidColor(selectedColor) ? '#3b82f6' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: isValidColor(selectedColor) ? 'pointer' : 'not-allowed',
                flexShrink: 0
              }}
            >
              选择
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;