/**
 * 🔗 EventRelationSummary - 事件关联信息摘要
 * 
 * 智能显示事件的父子关系和双向链接信息
 * 
 * 格式：
 * - 上级：xxx（其中x个文档，已完成任务x/x个）
 * - 下级：x个，已完成任务x/x个
 * - 关联：x个事件
 * 
 * 点击可展开 EventTree 可视化
 */

import React, { useEffect, useState } from 'react';
import { Event } from '../../types';
import { EventService } from '../../services/EventService';
import { EventTreeCanvas } from '../EventTree/EventTreeCanvas';

interface EventRelationSummaryProps {
  event: Event;                     // 当前事件
  onEventClick?: (event: Event) => void;  // 点击关联事件回调
  showTreeView?: boolean;           // 是否显示树视图
}

interface RelationInfo {
  parentInfo: {
    event: Event | null;
    docCount: number;
    taskTotal: number;
    taskCompleted: number;
  };
  childInfo: {
    total: number;
    docCount: number;
    taskTotal: number;
    taskCompleted: number;
  };
  linkedCount: number;
}

export const EventRelationSummary: React.FC<EventRelationSummaryProps> = ({
  event,
  onEventClick,
  showTreeView = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(showTreeView);
  const [relationInfo, setRelationInfo] = useState<RelationInfo>({
    parentInfo: { event: null, docCount: 0, taskTotal: 0, taskCompleted: 0 },
    childInfo: { total: 0, docCount: 0, taskTotal: 0, taskCompleted: 0 },
    linkedCount: 0,
  });
  const [allEvents, setAllEvents] = useState<Event[]>([]);

  // 异步加载关联信息
  useEffect(() => {
    const loadRelationInfo = async () => {
      // 1. 上级事件信息
      const parentInfo = {
        event: null as Event | null,
        docCount: 0,
        taskTotal: 0,
        taskCompleted: 0,
      };

      if (event.parentEventId) {
        const parentEvent = await EventService.getEventById(event.parentEventId);
        if (parentEvent) {
          parentInfo.event = parentEvent;
          
          // 统计父事件的子事件（同级任务）
          const siblingIds = parentEvent.childEventIds || [];
          const siblings: Event[] = [];
          for (const id of siblingIds) {
            const sibling = await EventService.getEventById(id);
            if (sibling && EventService.shouldShowInEventTree(sibling)) {
              siblings.push(sibling);
            }
          }
          
          parentInfo.docCount = siblings.filter(e => !e.isTask).length;
          parentInfo.taskTotal = siblings.filter(e => e.isTask).length;
          parentInfo.taskCompleted = siblings.filter(e => e.isTask && e.isCompleted).length;
        }
      }

      // 2. 下级事件信息
      const childIds = event.childEventIds || [];
      const children: Event[] = [];
      for (const id of childIds) {
        const child = await EventService.getEventById(id);
        if (child && EventService.shouldShowInEventTree(child)) {
          children.push(child);
        }
      }
      
      const childInfo = {
        total: children.length,
        docCount: children.filter(e => !e.isTask).length,
        taskTotal: children.filter(e => e.isTask).length,
        taskCompleted: children.filter(e => e.isTask && e.isCompleted).length,
      };

      // 3. 双向链接信息
      let linkedCount = 0;
      if (event.linkedEventIds) {
        for (const id of event.linkedEventIds) {
          const linkedEvent = await EventService.getEventById(id);
          if (linkedEvent && EventService.shouldShowInEventTree(linkedEvent)) {
            linkedCount++;
          }
        }
      }
      if (event.backlinks) {
        for (const id of event.backlinks) {
          const linkedEvent = await EventService.getEventById(id);
          if (linkedEvent && EventService.shouldShowInEventTree(linkedEvent)) {
            linkedCount++;
          }
        }
      }

      // 加载所有事件（用于 EventTree）
      const events = await EventService.getAllEvents();
      setAllEvents(events);
      setRelationInfo({ parentInfo, childInfo, linkedCount });
    };

    loadRelationInfo();
  }, [event]);

  // 生成摘要文本
  const summaryText = (() => {
    const parts: string[] = [];

    // 上级
    if (relationInfo.parentInfo.event) {
      const parent = relationInfo.parentInfo.event;
      const title = typeof parent.title === 'string' 
        ? parent.title 
        : (parent.title?.simpleTitle || parent.title?.colorTitle || '无标题');
      
      let detail = '';
      if (relationInfo.parentInfo.docCount > 0 || relationInfo.parentInfo.taskTotal > 0) {
        const docPart = relationInfo.parentInfo.docCount > 0 ? `${relationInfo.parentInfo.docCount}个文档` : '';
        const taskPart = relationInfo.parentInfo.taskTotal > 0 
          ? `已完成任务${relationInfo.parentInfo.taskCompleted}/${relationInfo.parentInfo.taskTotal}个` 
          : '';
        
        const combined = [docPart, taskPart].filter(Boolean).join('，');
        if (combined) {
          detail = `（其中${combined}）`;
        }
      }
      
      parts.push(`上级：${title}${detail}`);
    }

    // 下级
    if (relationInfo.childInfo.total > 0) {
      let detail = `${relationInfo.childInfo.total}个`;
      if (relationInfo.childInfo.taskTotal > 0) {
        detail += `，已完成任务${relationInfo.childInfo.taskCompleted}/${relationInfo.childInfo.taskTotal}个`;
      }
      parts.push(`下级：${detail}`);
    }

    // 关联
    if (relationInfo.linkedCount > 0) {
      parts.push(`关联：${relationInfo.linkedCount}个事件`);
    }

    return parts.length > 0 ? parts.join('；') : '暂无关联';
  })();

  // 如果没有任何关联信息，不显示
  if (!relationInfo.parentInfo.event && 
      relationInfo.childInfo.total === 0 && 
      relationInfo.linkedCount === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* 摘要信息 */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          fontSize: '14px', 
          color: '#6b7280', 
          lineHeight: '26px',
          cursor: 'pointer',
          transition: 'color 0.2s',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={(e) => e.currentTarget.style.color = '#3b82f6'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
      >
        {/* 链接图标 */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 10L12 6M5 13L7 11M15 7L13 9" />
          <circle cx="4" cy="14" r="2" />
          <circle cx="16" cy="6" r="2" />
        </svg>

        {/* 摘要文本 */}
        <span>{summaryText}</span>

        {/* 展开/收起图标 */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            marginLeft: 'auto',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <polyline points="4,6 8,10 12,6" />
        </svg>
      </div>

      {/* EventTree 可视化（展开状态） */}
      {isExpanded && (
        <div style={{ marginTop: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          <EventTreeCanvas
            rootEventId={event.id}
            events={allEvents}
            onEventClick={onEventClick}
          />
        </div>
      )}
    </div>
  );
};
