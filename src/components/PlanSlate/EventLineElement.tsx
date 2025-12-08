/**
 * EventLineElement - EventLine 节点的渲染器
 * 
 * 支持缩进、前缀装饰、Description 样式
 */

import React from 'react';
import { RenderElementProps } from 'slate-react';
import { EventLineNode } from './types';
import { EventLinePrefix } from './EventLinePrefix';
import { EventLineSuffix } from './EventLineSuffix';
import './EventLineElement.css';

export interface EventLineElementProps {
  element: EventLineNode;
  attributes: any;
  children: React.ReactNode;
  onSave?: (eventId: string, updates: any) => void;  // 保存回调
  onTimeClick?: (eventId: string, anchor: HTMLElement) => void;  // 时间点击
  onMoreClick?: (eventId: string) => void;  // More 图标点击
  onPlaceholderClick?: () => void; // 🆕 Placeholder 点击回调
  eventStatus?: 'new' | 'updated' | 'done' | 'missed' | 'deleted'; // 🆕 事件状态
}

export const EventLineElement: React.FC<EventLineElementProps> = ({
  element,
  attributes,
  children,
  onSave,
  onTimeClick,
  onMoreClick,
  onPlaceholderClick,
  eventStatus,
}) => {
  const isEventlogMode = element.mode === 'eventlog';
  const isPlaceholder = (element.metadata as any)?.isPlaceholder || element.eventId === '__placeholder__';
  const isDeleted = (element.metadata as any)?._isDeleted || eventStatus === 'deleted';
  
  // 🔧 缩进计算：标题行和 eventlog 行使用相同的 paddingLeft
  // eventlog 通过占位元素来补偿标题行的前缀宽度
  const paddingLeft = `${element.level * 24}px`;
  
  // 🆕 处理 placeholder 点击
  const handleMouseDown = (e: React.MouseEvent) => {
    // 🔧 不要阻止 checkbox 等表单元素的事件
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) {
      return; // 让表单元素正常工作
    }
    
    if (isPlaceholder && onPlaceholderClick) {
      e.preventDefault();
      e.stopPropagation();
      onPlaceholderClick();
    }
  };
  
  return (
    <div
      {...attributes}
      className={`unified-event-line ${isEventlogMode ? 'eventlog-mode' : ''}${isPlaceholder ? ' placeholder-line' : ''}${isDeleted ? ' deleted-line' : ''}`}
      data-event-line="true"
      data-line-id={element.lineId}
      data-event-id={element.eventId || ''}
      data-level={element.level}
      data-mode={element.mode}
      onMouseDown={handleMouseDown}
      style={{
        paddingLeft,
        display: 'flex',
        alignItems: isEventlogMode ? 'flex-start' : 'center',
        gap: '8px',
        minHeight: isEventlogMode ? '20px' : '32px', // 🔧 eventlog 模式更紧凑
        textDecoration: isDeleted ? 'line-through' : 'none',  // ✅ 删除线
        opacity: isDeleted ? 0.6 : 1,  // ✅ 降低透明度
        pointerEvents: isDeleted ? 'none' : 'auto',  // ✅ 禁止交互
      }}
    >
      {/* 前缀装饰 (Checkbox、Emoji 等) */}
      {!isEventlogMode && onSave && (
        <div className="event-line-prefix" contentEditable={false}>
          <EventLinePrefix element={element} onSave={onSave} eventStatus={eventStatus} />
        </div>
      )}
      
      {/* Eventlog 模式：添加占位符，与标题行的前缀等宽 */}
      {isEventlogMode && (
        <div 
          className="event-line-prefix-spacer" 
          contentEditable={false}
          style={{
            width: '28px', // checkbox(16px) + marginRight(4px) + gap(8px)
            flexShrink: 0,
          }}
        />
      )}
      
      {/* 内容区域 - Placeholder 行显示为灰色但可点击 */}
      <div 
        className="event-line-content" 
        style={{ 
          flex: 1,
          cursor: isPlaceholder ? 'text' : 'inherit',
          userSelect: isPlaceholder ? 'none' : 'auto',
        }}
      >
        {children}
      </div>
      
      {/* 后缀装饰 (标签、时间等) - Eventlog 模式不显示 */}
      {!isEventlogMode && onTimeClick && onMoreClick && (
        <div className="event-line-suffix" contentEditable={false}>
          <EventLineSuffix element={element} onTimeClick={onTimeClick} onMoreClick={onMoreClick} />
        </div>
      )}
    </div>
  );
};
