/**
 * EventMentionElement - 事件提及元素（SlateCore 通用层）
 * 
 * 功能：在 Slate 编辑器中渲染事件链接
 * 样式：蓝色背景 + 悬停效果
 * 点击逻辑：由父组件通过 onMentionClick 回调处理
 */

import React from 'react';
import { RenderElementProps } from 'slate-react';
import type { EventMentionNode } from '@frontend/components/SlateCore/types';

interface EventMentionElementProps extends RenderElementProps {
  element: EventMentionNode;
  onMentionClick?: (eventId: string) => void; // 可选的点击回调
}

export const EventMentionElement: React.FC<EventMentionElementProps> = ({
  attributes,
  children,
  element,
  onMentionClick
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onMentionClick) {
      onMentionClick(element.eventId);
    }
  };

  return (
    <span
      {...attributes}
      contentEditable={false}
      onClick={handleClick}
      className="event-mention"
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        margin: '0 2px',
        backgroundColor: '#E3F2FD',
        color: '#1976D2',
        borderRadius: '4px',
        fontSize: '0.95em',
        fontWeight: 500,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all 0.15s ease',
        border: '1px solid #BBDEFB',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#BBDEFB';
        e.currentTarget.style.borderColor = '#90CAF9';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#E3F2FD';
        e.currentTarget.style.borderColor = '#BBDEFB';
      }}
      title={`跳转到: ${element.eventTitle}`}
    >
      @{element.eventTitle}
      {children}
    </span>
  );
};
