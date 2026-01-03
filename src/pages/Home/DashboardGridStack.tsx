import React, { useEffect, useRef, useState } from 'react';
import { GridStack } from 'gridstack';
import 'gridstack/dist/gridstack.min.css';
import './DashboardGridStack.css';

export interface GridItem {
  id: string;
  component: React.ReactNode;
  defaultLayout?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface DashboardGridStackProps {
  /** 网格项目列表 */
  items: GridItem[];
  /** 列数（桌面端） */
  columns?: number;
  /** 行高（px） */
  cellHeight?: number;
  /** 网格间距（px） */
  gap?: number;
  /** 自定义类名 */
  className?: string;
  /** 是否可拖拽 */
  isDraggable?: boolean;
  /** 是否可调整大小 */
  isResizable?: boolean;
  /** 布局变更回调 */
  onLayoutChange?: (layout: any[]) => void;
}

const STORAGE_KEY = 'dashboard-layout-gridstack-v1';

/**
 * DashboardGridStack - 基于 Gridstack.js 的仪表盘网格布局
 * 
 * 特点：
 * 1. 完美支持移动端触控
 * 2. 同时支持拖拽和调整大小
 * 3. 响应式布局（桌面多列，移动端单列）
 * 4. 自动保存布局到 localStorage
 */
export const DashboardGridStack: React.FC<DashboardGridStackProps> = ({
  items,
  columns = 12,
  cellHeight = 40,
  gap = 16,
  className = '',
  isDraggable = true,
  isResizable = true,
  onLayoutChange,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const gridInstanceRef = useRef<GridStack | null>(null);

  // 初始化 GridStack
  useEffect(() => {
    if (!gridRef.current || gridInstanceRef.current) return;

    // 创建 GridStack 实例 - 洞洞板模式
    const grid = GridStack.init({
      column: 24,  // 精细网格，提供更细腻的调整粒度
      cellHeight,  // 更小的行高，配合精细网格
      margin: 0,  // 去掉物理间距，改用CSS padding控制
      animate: true,
      float: true,  // 允许浮动，更灵活
      minRow: 1,
      draggable: {
        handle: '.grid-stack-item-content',
      },
      resizable: {
        handles: 'se',
      },
    }, gridRef.current);

    gridInstanceRef.current = grid;

    // 🔧 恢复保存的布局
    try {
      const savedLayout = localStorage.getItem(STORAGE_KEY);
      if (savedLayout) {
        const layout = JSON.parse(savedLayout);
        // 等待 GridStack 完全初始化后再应用布局
        setTimeout(() => {
          if (!gridInstanceRef.current) return;
          
          layout.forEach((item: any) => {
            const el = gridRef.current?.querySelector(`[gs-id="${item.id}"]`) as HTMLElement;
            if (el && gridInstanceRef.current) {
              // 检查元素是否已被 GridStack 管理
              const node = (gridInstanceRef.current as any).engine.nodes.find((n: any) => n.el === el);
              if (node) {
                gridInstanceRef.current.update(el, {
                  x: item.x,
                  y: item.y,
                  w: item.w,
                  h: item.h,
                });
              }
            }
          });
        }, 200); // 增加延迟，确保 GridStack 完全初始化
      }
    } catch (error) {
      console.warn('[DashboardGridStack] 恢复布局失败:', error);
    }

    // 监听布局变化
    grid.on('change', () => {
      const layout = grid.save() as any[];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
      onLayoutChange?.(layout);
    });

    // 清理
    return () => {
      if (gridInstanceRef.current) {
        gridInstanceRef.current.destroy(false);
        gridInstanceRef.current = null;
      }
    };
  }, []);

  // 更新配置
  useEffect(() => {
    if (!gridInstanceRef.current) return;
    
    const grid = gridInstanceRef.current;
    grid.setStatic(!isDraggable && !isResizable);
  }, [isDraggable, isResizable]);

  return (
    <div className={`dashboard-gridstack ${className}`}>
      <div ref={gridRef} className="grid-stack">
        {items.map((item) => (
          <div
            key={item.id}
            className="grid-stack-item"
            gs-id={item.id}
            gs-x={item.defaultLayout?.x?.toString() ?? '0'}
            gs-y={item.defaultLayout?.y?.toString() ?? '0'}
            gs-w={item.defaultLayout?.w?.toString() ?? '4'}
            gs-h={item.defaultLayout?.h?.toString() ?? '3'}
            gs-min-w="2"
            gs-min-h="2"
          >
            <div className="grid-stack-item-content">
              {item.component}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
