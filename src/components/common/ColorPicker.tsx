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
  // 固定的8个莫兰迪主色调（不可编辑）
  const mainColors = [
    '#D6847F', '#E0A872', '#EBC968', '#7E9C7A', 
    '#69BDBD', '#8BB8DE', '#BCA0D6', '#CBD5E1'
  ];
  
  // 用户自定义的颜色列表（存储在localStorage）
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
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

  // 生成颜色渐变的函数 - 为自定义颜色生成4个莫兰迪风格的渐变
  const generateMorandiShades = (baseColor: string) => {
    const base = tinycolor(baseColor);
    const shades = [];
    
    // 生成4个渐变：从较浅到较深
    // 使用desaturate降低饱和度，产生莫兰迪效果
    for (let i = 0; i < 4; i++) {
      const lightness = 15 - (i * 10); // 15, 5, -5, -15
      const saturation = -(i * 5); // 降低饱和度
      const shade = base.clone()
        .lighten(lightness)
        .desaturate(saturation)
        .toString();
      shades.push(shade);
    }
    
    return shades;
  };

  // 生成主色调的渐变
  const generateColorShades = (baseColor: string) => {
    // 定义完整的8色系渐变矩阵
    const colorMatrix: { [key: string]: string[] } = {
      '#D6847F': ['#F7D0D0', '#EBB0A3', '#D6847F', '#C4645E', '#A85A5A', '#823C3C'], // 红色系
      '#E0A872': ['#FAE3C6', '#F0C99E', '#E0A872', '#C98A55', '#A66D46', '#855030'], // 橙色系
      '#EBC968': ['#FCEFC7', '#F5DE9E', '#EBC968', '#D6AF4E', '#B38E36', '#8F6E20'], // 黄色系
      '#7E9C7A': ['#D4E0D1', '#ACC4A8', '#7E9C7A', '#527050', '#324F33', '#1F3620'], // 绿色系（松绿）
      '#69BDBD': ['#C4EBEB', '#96D6D6', '#69BDBD', '#459696', '#2D7575', '#1B5252'], // 青色系
      '#8BB8DE': ['#D6E8F7', '#B3D4ED', '#8BB8DE', '#649AC9', '#4278A6', '#2E567A'], // 蓝色系
      '#BCA0D6': ['#EBE0F5', '#D6C4E6', '#BCA0D6', '#9D7DBA', '#7A5B96', '#5C4175'], // 紫色系
      '#CBD5E1': ['#F1F5F9', '#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#475569'], // 灰色系
    };

    return colorMatrix[baseColor] || [];
  };

  // 生成当前调色板
  const colorPalette = useMemo(() => {
    return mainColors.map(color => ({
      main: color,
      shades: generateColorShades(color)
    }));
  }, []);
  
  // 生成自定义颜色的渐变
  const customColorPalette = useMemo(() => {
    return customColors.map(color => ({
      main: color,
      shades: generateMorandiShades(color)
    }));
  }, [customColors]);

  // 添加自定义颜色
  const handleAddCustomColor = (newColor: string) => {
    if (isValidColor(newColor) && !customColors.includes(newColor)) {
      const updatedColors = [...customColors, newColor];
      setCustomColors(updatedColors);
      localStorage.setItem('customColorPalette', JSON.stringify(updatedColors));
    }
    setShowCustomColorPicker(false);
  };

  // 删除自定义颜色
  const handleRemoveCustomColor = (colorToRemove: string) => {
    const updatedColors = customColors.filter(c => c !== colorToRemove);
    setCustomColors(updatedColors);
    localStorage.setItem('customColorPalette', JSON.stringify(updatedColors));
  };

  // 加载保存的自定义颜色
  useEffect(() => {
    const saved = localStorage.getItem('customColorPalette');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 验证是否为颜色数组
        if (Array.isArray(parsed) && parsed.every(c => typeof c === 'string')) {
          setCustomColors(parsed);
        }
      } catch (e) {
        console.warn('Failed to load saved custom colors');
      }
    }
  }, []);

  // 拖动功能：在非交互区域按下才开始拖动
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 不要在交互控件上触发拖动（避免影响点选颜色/输入/按钮）
    if (
      target.closest(
        'button, input, textarea, select, option, a, [data-no-drag], .react-colorful'
      )
    ) {
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
          left: windowPosition.x,
          top: windowPosition.y,
          backgroundColor: 'white',
          borderRadius: '16px',
          width: 'fit-content',
          minWidth: '360px',
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          border: '1px solid #e2e8f0',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        onMouseDown={handleMouseDown}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 右上角关闭按钮（无标题栏） */}
        <button
          onClick={onClose}
          data-no-drag
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'transparent',
            border: 'none',
            fontSize: '20px',
            lineHeight: 1,
            cursor: 'pointer',
            color: '#64748b'
          }}
          aria-label="关闭"
          title="关闭"
        >
          ×
        </button>

        <div style={{ padding: '24px', paddingTop: '26px' }}>
          {/* 顶部信息（参考 Gemini 设计） */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingRight: '28px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#111827',
                letterSpacing: '-0.01em'
              }}>
                Tag Color
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                data-no-drag
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '999px',
                  backgroundColor: currentColor,
                  border: '1px solid rgba(0,0,0,0.06)'
                }}
              />
              <div style={{
                fontSize: '12px',
                color: '#9ca3af',
                fontFamily: 'monospace',
                fontWeight: 700,
                textTransform: 'uppercase'
              }}>
                {currentColor}
              </div>
            </div>
          </div>

          {/* 固定调色板：8列 x 7行（主色 + 6阶） */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
              {mainColors.map((main, colIndex) => {
                const column = [main, ...colorPalette[colIndex].shades];
                return (
                  <div key={main} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {column.map((color, rowIndex) => {
                      const isSelected = currentColor === color;
                      const checkColor = rowIndex < 3 ? '#6b7280' : '#ffffff';
                      return (
                        <button
                          key={color}
                          data-no-drag
                          onClick={() => {
                            onSelect(color);
                            onClose();
                          }}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            position: 'relative'
                          }}
                          title={color}
                        >
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '999px',
                              backgroundColor: color,
                              border: '1px solid rgba(0,0,0,0.06)',
                              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                              transform: isSelected ? 'scale(1.12)' : 'scale(1)',
                              boxShadow: isSelected
                                ? '0 4px 12px rgba(0,0,0,0.12), 0 0 0 2px #e5e7eb, 0 0 0 4px rgba(255,255,255,0.95)'
                                : 'none'
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.06)';
                                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.10)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLDivElement).style.transform = isSelected ? 'scale(1.12)' : 'scale(1)';
                              (e.currentTarget as HTMLDivElement).style.boxShadow = isSelected
                                ? '0 4px 12px rgba(0,0,0,0.12), 0 0 0 2px #e5e7eb, 0 0 0 4px rgba(255,255,255,0.95)'
                                : 'none';
                            }}
                          >
                            {isSelected && (
                              <div
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '16px',
                                  fontWeight: 900,
                                  color: checkColor,
                                  textShadow: checkColor === '#ffffff' ? '0 1px 2px rgba(0,0,0,0.25)' : 'none'
                                }}
                              >
                                ✓
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {/* 自定义颜色区域：横向展示 + “+”色块 */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#111827'
              }}>
                自定义颜色
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                display: 'flex',
                gap: '12px',
                overflowX: 'auto',
                paddingBottom: '6px',
                width: '100%'
              }}>
              {/* “+”色块按钮 */}
              <button
                data-no-drag
                onClick={() => setShowCustomColorPicker(true)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '999px',
                  border: '1px dashed #d1d5db',
                  background: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  flex: '0 0 auto'
                }}
                title="添加颜色"
                aria-label="添加颜色"
              >
                <span style={{ fontSize: '18px', fontWeight: 800, lineHeight: 1 }}>+</span>
              </button>

              {/* 已添加的自定义颜色：横向排列，每个颜色一个小列（主色+4阶） */}
              {customColorPalette.map((colorGroup, groupIndex) => (
                <div
                  key={`${colorGroup.main}-${groupIndex}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    alignItems: 'center',
                    flex: '0 0 auto'
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <button
                      data-no-drag
                      onClick={() => {
                        onSelect(colorGroup.main);
                        onClose();
                      }}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '999px',
                        cursor: 'pointer',
                        padding: 0,
                        border: 'none',
                        background: 'transparent'
                      }}
                      title={colorGroup.main}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '999px',
                          backgroundColor: colorGroup.main,
                          border: '1px solid rgba(0,0,0,0.06)',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                          transform: currentColor === colorGroup.main ? 'scale(1.12)' : 'scale(1)',
                          boxShadow: currentColor === colorGroup.main
                            ? '0 4px 12px rgba(0,0,0,0.12), 0 0 0 2px #e5e7eb, 0 0 0 4px rgba(255,255,255,0.95)'
                            : 'none'
                        }}
                      >
                        {currentColor === colorGroup.main && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '16px',
                              fontWeight: 900,
                              color: '#ffffff',
                              textShadow: '0 1px 2px rgba(0,0,0,0.25)'
                            }}
                          >
                            ✓
                          </div>
                        )}
                      </div>
                    </button>

                    <button
                      data-no-drag
                      onClick={() => handleRemoveCustomColor(colorGroup.main)}
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '999px',
                        backgroundColor: '#ef4444',
                        color: '#ffffff',
                        border: '1px solid #ffffff',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 900,
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="删除"
                      aria-label="删除"
                    >
                      ×
                    </button>
                  </div>

                  {colorGroup.shades.map((shade, shadeIndex) => {
                    const isSelected = currentColor === shade;
                    const checkColor = shadeIndex < 2 ? '#6b7280' : '#ffffff';
                    return (
                      <button
                        key={shade}
                        data-no-drag
                        onClick={() => {
                          onSelect(shade);
                          onClose();
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '999px',
                          cursor: 'pointer',
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          position: 'relative'
                        }}
                        title={shade}
                      >
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '999px',
                            backgroundColor: shade,
                            border: '1px solid rgba(0,0,0,0.06)',
                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                            transform: isSelected ? 'scale(1.12)' : 'scale(1)',
                            boxShadow: isSelected
                              ? '0 4px 12px rgba(0,0,0,0.12), 0 0 0 2px #e5e7eb, 0 0 0 4px rgba(255,255,255,0.95)'
                              : 'none'
                          }}
                        >
                          {isSelected && (
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px',
                                fontWeight: 900,
                                color: checkColor,
                                textShadow: checkColor === '#ffffff' ? '0 1px 2px rgba(0,0,0,0.25)' : 'none'
                              }}
                            >
                              ✓
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
              </div>
            </div>

            {/* 自定义颜色选择器：折叠面板（放在自定义区域里） */}
            {showCustomColorPicker && (
              <div
                style={{
                  marginTop: '12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#374151',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  添加自定义颜色
                  <button
                    data-no-drag
                    onClick={() => setShowCustomColorPicker(false)}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: '#6b7280',
                      fontSize: '16px',
                      lineHeight: 1
                    }}
                    aria-label="关闭添加"
                    title="关闭"
                  >
                    ×
                  </button>
                </div>

                <div style={{ padding: '12px' }}>
                  {/* @ts-ignore - React 19 compatibility issue with react-colorful */}
                  <HexColorPicker
                    color={selectedColor}
                    onChange={setSelectedColor}
                    style={{ width: '100%', height: '120px' }}
                  />

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginTop: '12px'
                    }}
                  >
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '999px',
                        backgroundColor: selectedColor,
                        border: '1px solid rgba(0,0,0,0.06)',
                        flexShrink: 0
                      }}
                    />
                    <input
                      data-no-drag
                      type="text"
                      value={selectedColor}
                      onChange={(e) => handleColorInputChange(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        border: `1px solid ${isValidColor(selectedColor) ? '#d1d5db' : '#ef4444'}`,
                        borderRadius: '10px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        backgroundColor: '#ffffff'
                      }}
                      placeholder="#ffffff"
                    />
                    <button
                      data-no-drag
                      onClick={() => handleAddCustomColor(selectedColor)}
                      disabled={!isValidColor(selectedColor)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e5e7eb',
                        backgroundColor: isValidColor(selectedColor) ? '#111827' : '#9ca3af',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: isValidColor(selectedColor) ? 'pointer' : 'not-allowed'
                      }}
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;