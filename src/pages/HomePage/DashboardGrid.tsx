import React, { useState, useEffect, useRef } from 'react';
import GridLayout, { Layout as RGLLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './DashboardGrid.css';

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

export interface DashboardGridProps {
  /** 网格项目列表 */
  items: GridItem[];
  /** 列数（桌面端） */
  columns?: number;
  /** 行高（px） */
  rowHeight?: number;
  /** 网格间距（px） */
  gap?: number;
  /** 自定义类名 */
  className?: string;
  /** 是否可拖拽 */
  isDraggable?: boolean;
  /** 是否可调整大小 */
  isResizable?: boolean;
  /** 布局变更回调 */
  onLayoutChange?: (layout: RGLLayout) => void;
}

const STORAGE_KEY = 'dashboard-layout-v2';

/**
 * DashboardGrid - 仪表盘网格布局组件
 * 
 * 功能：
 * 1. 响应式网格布局（桌面端多列，移动端单列）
 * 2. 支持拖拽排序
 * 3. 支持调整大小
 * 4. 自动保存布局到 localStorage
 */
export const DashboardGrid: React.FC<DashboardGridProps> = ({
  items,
  columns = 3,
  rowHeight = 100,
  gap = 20,
  className = '',
  isDraggable = true,
  isResizable = true,
  onLayoutChange
}) => {
  const [layout, setLayout] = useState<RGLLayout>([]);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth - 300);
  const containerRef = useRef<HTMLDivElement>(null);

  // 监听容器宽度变化
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // 初始化布局
  useEffect(() => {
    // 清除旧的 localStorage 缓存（仅首次）
    const cacheVersion = localStorage.getItem('dashboard-layout-version');
    if (cacheVersion !== 'v2') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem('dashboard-layout-version', 'v2');
    }

    // 尝试从 localStorage 加载布局
    const savedLayout = localStorage.getItem(STORAGE_KEY);
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout);
        setLayout(parsed);
        return;
      } catch (e) {
        console.error('Failed to parse saved layout:', e);
      }
    }

    // 使用默认布局
    const defaultLayout = items.map(item => ({
      i: item.id,
      x: item.defaultLayout?.x ?? 0,
      y: item.defaultLayout?.y ?? 0,
      w: item.defaultLayout?.w ?? 12,
      h: item.defaultLayout?.h ?? 4,
      minW: 2,
      minH: 2
    }));
    setLayout(defaultLayout);
  }, [items]);

  // 布局变更处理
  const handleLayoutChange = (newLayout: RGLLayout) => {
    setLayout(newLayout);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
    onLayoutChange?.(newLayout);
  };

  if (layout.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <GridLayout
        className={`dashboard-grid ${className}`}
        layout={layout}
        cols={columns}
        rowHeight={rowHeight}
        width={containerWidth}
        margin={[gap, gap]}
        containerPadding={[0, 0]}
        isDraggable={isDraggable}
        isResizable={isResizable}
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
        preventCollision={false}
        useCSSTransforms={true}
      >
        {items.map(item => (
          <div key={item.id}>
            {item.component}
          </div>
        ))}
      </GridLayout>
    </div>
  );
};
