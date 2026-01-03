/**
 * 🌲 EventTreeViewer - 事件树查看器
 * 
 * 刚性事件树编辑器 + 堆叠卡片悬浮显示关联事件
 * 
 * 功能：
 * - 基于 parentEventId 派生的树形结构
 * - 单一 Slate 编辑器支持跨节点选择和缩进层级编辑
 * - 每行右侧显示 Link 按钮，悬浮时展开堆叠的关联事件
 * 
 * v2.19: 使用 EventTreeSlate（单一编辑器架构）替代 EditableEventTree
 */

import React from 'react';
import { EventTreeSlate } from './EventTreeSlate';
import { Event } from '@frontend/types';
import './EventTreeViewer.css';

interface EventTreeViewerProps {
  rootEventId: string;
  events: Event[];
  onEventClick?: (event: Event) => void;
}

export const EventTreeViewer: React.FC<EventTreeViewerProps> = ({
  rootEventId,
  onEventClick,
}) => {
  return (
    <div className="event-tree-viewer">
      <div className="tree-content">
        <EventTreeSlate
          rootEventId={rootEventId}
          onEventClick={onEventClick}
        />
      </div>
    </div>
  );
};
