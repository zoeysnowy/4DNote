/**
 * useKeyboardNavigation - 键盘导航 Hook
 * 支持上下左右键导航 + Enter 确认
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseKeyboardNavigationOptions<T> {
  items: T[];
  onSelect: (item: T) => void;
  onClose?: () => void;
  enabled?: boolean;
  gridColumns?: number; // 网格布局的列数（如 ColorPicker），默认为 1（列表布局）
}

export function useKeyboardNavigation<T>({
  items,
  onSelect,
  onClose,
  enabled = true,
  gridColumns = 1,
}: UseKeyboardNavigationOptions<T>) {
  const [hoveredIndex, setHoveredIndex] = useState(0); // 默认 hover 第一个
  const containerRef = useRef<HTMLDivElement>(null);

  // 🆕 items 变化时重置焦点到第一项（支持数字键打开 Picker 后自动聚焦第一项）
  useEffect(() => {
    setHoveredIndex(0);
  }, [items]);

  // 键盘事件处理
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled || items.length === 0) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (gridColumns === 1) {
            // 列表布局：下移一项
            setHoveredIndex((prev) => Math.min(prev + 1, items.length - 1));
          } else {
            // 网格布局：下移一行
            setHoveredIndex((prev) => Math.min(prev + gridColumns, items.length - 1));
          }
          break;

        case 'ArrowUp':
          event.preventDefault();
          if (gridColumns === 1) {
            // 列表布局：上移一项
            setHoveredIndex((prev) => Math.max(prev - 1, 0));
          } else {
            // 网格布局：上移一行
            setHoveredIndex((prev) => Math.max(prev - gridColumns, 0));
          }
          break;

        case 'ArrowLeft':
          event.preventDefault();
          if (gridColumns > 1) {
            // 网格布局：左移一列
            setHoveredIndex((prev) => Math.max(prev - 1, 0));
          }
          break;

        case 'ArrowRight':
          event.preventDefault();
          if (gridColumns > 1) {
            // 网格布局：右移一列
            setHoveredIndex((prev) => Math.min(prev + 1, items.length - 1));
          }
          break;

        case 'Enter':
          event.preventDefault();
          if (items[hoveredIndex]) {
            onSelect(items[hoveredIndex]);
          }
          break;

        case 'Escape':
          event.preventDefault();
          onClose?.();
          break;

        default:
          break;
      }
    },
    [enabled, items, hoveredIndex, onSelect, onClose, gridColumns]
  );

  // 监听键盘事件
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  // 自动滚动到 hover 的项
  useEffect(() => {
    if (containerRef.current) {
      const hoveredElement = containerRef.current.children[hoveredIndex] as HTMLElement;
      if (hoveredElement) {
        hoveredElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [hoveredIndex]);

  return {
    hoveredIndex,
    setHoveredIndex,
    containerRef,
  };
}
