import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  TouchSensor,
  MouseSensor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './DashboardGridDnd.css';

export interface GridItem {
  id: string;
  component: React.ReactNode;
}

export interface DashboardGridDndProps {
  /** 网格项目列表 */
  items: GridItem[];
  /** 列数（桌面端），移动端自动变为1列 */
  columns?: number;
  /** 网格间距（px） */
  gap?: number;
  /** 自定义类名 */
  className?: string;
  /** 是否可拖拽 */
  isDraggable?: boolean;
  /** 布局变更回调 */
  onLayoutChange?: (itemIds: string[]) => void;
}

const STORAGE_KEY = 'dashboard-layout-dnd-v1';

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  isDraggable: boolean;
}

/**
 * SortableItem - 可排序的网格项
 */
const SortableItem: React.FC<SortableItemProps> = ({ id, children, isDraggable }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1, // 拖动时完全隐藏，由 DragOverlay 显示
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`dashboard-grid-item ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};

/**
 * DashboardGridDnd - 基于 dnd-kit 的仪表盘网格布局
 * 
 * 特点：
 * 1. 完美支持移动端触控（长按拖拽，避免滚动冲突）
 * 2. 使用 CSS Grid 实现响应式布局（桌面多列，移动端单列）
 * 3. 自动保存排序到 localStorage
 * 4. 丝滑的拖拽动画
 */
export const DashboardGridDnd: React.FC<DashboardGridDndProps> = ({
  items,
  columns = 3,
  gap = 16,
  className = '',
  isDraggable = true,
  onLayoutChange,
}) => {
  const [sortedItems, setSortedItems] = useState<GridItem[]>(items);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 配置传感器：支持鼠标、触摸、键盘
  const sensors = useSensors(
    // 电脑端：鼠标点下立刻拖动
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // 移动 8px 后激活，避免误触
      },
    }),
    // 移动端：长按 250ms 激活，避免与滚动冲突
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,      // 长按 250ms
        tolerance: 5,    // 如果在 250ms 内移动超过 5px，则取消（判定为滚动）
      },
    }),
    // 键盘：支持无障碍访问
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 初始化：从 localStorage 加载排序
  useEffect(() => {
    const savedOrder = localStorage.getItem(STORAGE_KEY);
    if (savedOrder) {
      try {
        const orderIds = JSON.parse(savedOrder) as string[];
        // 根据保存的顺序重新排列
        const orderedItems = orderIds
          .map(id => items.find(item => item.id === id))
          .filter(Boolean) as GridItem[];
        
        // 添加新卡片（在保存的顺序中不存在的）
        const newItems = items.filter(item => !orderIds.includes(item.id));
        setSortedItems([...orderedItems, ...newItems]);
      } catch (e) {
        console.error('Failed to parse saved layout:', e);
        setSortedItems(items);
      }
    } else {
      setSortedItems(items);
    }
  }, [items]);

  // 拖拽开始处理
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // 拖拽结束处理
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);

    if (over && active.id !== over.id) {
      setSortedItems((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // 保存到 localStorage
        const orderIds = newItems.map(item => item.id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(orderIds));
        
        // 触发回调
        onLayoutChange?.(orderIds);
        
        return newItems;
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedItems.map(item => item.id)}
        strategy={rectSortingStrategy}
      >
        <div
          className={`dashboard-grid-dnd ${className}`}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: `${gap}px`,
          }}
        >
          {sortedItems.map((item) => (
            <SortableItem key={item.id} id={item.id} isDraggable={isDraggable}>
              {item.component}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
      
      {/* DragOverlay: 显示拖动中的实际卡片 */}
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div className="dashboard-grid-item dragging-overlay">
            {sortedItems.find(item => item.id === activeId)?.component}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
