import React, { useEffect, useRef } from 'react';
import { createSwapy } from 'swapy';
import './DashboardSwapy.css';

export interface SwapyItem {
  id: string;
  component: React.ReactNode;
  slot?: string;
}

export interface DashboardSwapyProps {
  items: SwapyItem[];
  className?: string;
}

const STORAGE_KEY = 'dashboard-swapy-layout';

/**
 * DashboardSwapy - 基于Swapy的简洁拖拽布局
 * 
 * 特点：
 * 1. 简单的拖拽交换位置
 * 2. 轻量流畅的动画
 * 3. 自动保存布局
 */
export const DashboardSwapy: React.FC<DashboardSwapyProps> = ({
  items,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const swapyRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 初始化Swapy
    const swapy = createSwapy(containerRef.current, {
      animation: 'dynamic'
    });

    swapyRef.current = swapy;

    // 加载保存的布局
    const savedLayout = localStorage.getItem(STORAGE_KEY);
    if (savedLayout) {
      try {
        const layout = JSON.parse(savedLayout);
        swapy.setData(layout);
      } catch (e) {
        console.error('Failed to load saved layout:', e);
      }
    }

    // 监听布局变化
    swapy.onSwap((event: any) => {
      const layout = event.data.object;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    });

    return () => {
      if (swapyRef.current) {
        swapyRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className={`dashboard-swapy ${className}`} ref={containerRef}>
      <div className="swapy-container">
        {items.map((item, index) => (
          <div 
            key={item.id}
            className="swapy-slot" 
            data-swapy-slot={item.slot || `slot-${index}`}
          >
            <div 
              className="swapy-item" 
              data-swapy-item={item.id}
            >
              {item.component}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
