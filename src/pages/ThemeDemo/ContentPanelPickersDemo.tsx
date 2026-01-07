import React, { useMemo, useState } from 'react';

import DownIconSvg from '@frontend/assets/icons/down.svg';
import PiechartIconSvg from '@frontend/assets/icons/piechart.svg';

import '@frontend/components/ContentSelectionPanel.css';

export type ContentPanelDemoTag = {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
  parentId?: string;
  level?: number;
};

export type ContentPanelDemoCalendar = {
  id: string;
  name: string;
  color?: string;
  eventCount?: number;
};

type TaskNode = {
  id: string;
  title: string;
  color: string;
  level: number;
  children: TaskNode[];
  isExpanded: boolean;
  stats: {
    completed: number;
    total: number;
    hours: number;
  };
};

const PiechartIcon = ({ className }: { className?: string }) => (
  <img src={PiechartIconSvg} alt="" className={className} style={{ width: '14px', height: '14px' }} />
);

export const ContentPanelPickersDemo: React.FC<{
  tags: ContentPanelDemoTag[];
  calendars: ContentPanelDemoCalendar[];
  defaultExpandedTagIds?: string[];
  defaultTagsExpanded?: boolean;
  defaultCalendarsExpanded?: boolean;
}> = ({
  tags,
  calendars,
  defaultExpandedTagIds = [],
  defaultTagsExpanded = true,
  defaultCalendarsExpanded = true,
}) => {
  const [isTagsExpanded, setIsTagsExpanded] = useState(defaultTagsExpanded);
  const [isCalendarsExpanded, setIsCalendarsExpanded] = useState(defaultCalendarsExpanded);

  // In the production panel, the expandedNodes set stores *collapsed* parents.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    const collapsed = new Set<string>();
    const explicitExpanded = new Set(defaultExpandedTagIds);

    // default: parents expanded
    const hasChildren = new Set<string>();
    for (const t of tags) {
      if (t.parentId) hasChildren.add(t.parentId);
    }

    for (const parentId of hasChildren) {
      if (!explicitExpanded.has(parentId)) collapsed.add(parentId);
    }

    return collapsed;
  });

  const toggleTagNode = (nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };


  const taskTree = useMemo((): TaskNode[] => {
    const nodeMap = new Map<string, TaskNode>();

    const tagById = new Map(tags.map((t) => [t.id, t] as const));
    const childrenByParent = new Map<string, string[]>();
    for (const t of tags) {
      if (!t.parentId) continue;
      const arr = childrenByParent.get(t.parentId) ?? [];
      arr.push(t.id);
      childrenByParent.set(t.parentId, arr);
    }

    for (const t of tags) {
      const level = t.level ?? 0;
      const color = t.color ?? 'var(--ui-text)';
      const title = `${t.emoji || '#'} ${t.name}`;
      const hasKids = (childrenByParent.get(t.id)?.length ?? 0) > 0;
      const isExpanded = hasKids ? !collapsedIds.has(t.id) : true;

      nodeMap.set(t.id, {
        id: t.id,
        title,
        color,
        level,
        children: [],
        isExpanded,
        stats: { completed: 0, total: 0, hours: 0 },
      });
    }

    const roots: TaskNode[] = [];
    for (const t of tags) {
      const node = nodeMap.get(t.id);
      if (!node) continue;

      if (t.parentId && tagById.has(t.parentId)) {
        const parent = nodeMap.get(t.parentId);
        if (parent) parent.children.push(node);
        else roots.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }, [tags, collapsedIds]);

  const renderTaskNode = (node: TaskNode) => {
    const hasChildren = node.children.length > 0;
    const indent = node.level * 16;

    return (
      <div key={node.id} className={`task-node task-node-depth-${node.level}`}>
        <div className="task-node-row">
          {hasChildren ? (
            <button
              className="task-expand-btn"
              type="button"
              onClick={() => toggleTagNode(node.id)}
              style={{ marginLeft: `${indent}px` }}
              aria-label={node.isExpanded ? 'Collapse' : 'Expand'}
            >
              <img
                src={DownIconSvg}
                alt=""
                style={{
                  width: '12px',
                  height: '12px',
                  transition: 'transform 0.2s',
                  transform: node.isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
              />
            </button>
          ) : (
            <div className="task-expand-spacer" style={{ marginLeft: `${indent}px` }} />
          )}

          <div className="task-title" style={{ color: node.color }}>
            {node.title}
          </div>

          <div className="task-stats">
            <div className="task-stats-top">
              <div className="task-stats-left">
                <PiechartIcon className="task-pie-chart" />
                <span className="task-progress-text">
                  {node.stats.completed}/{node.stats.total}
                </span>
              </div>
              <span className="task-hours">{node.stats.hours}h</span>
            </div>
            <div className="task-time-bar">
              <div className="task-time-fill blue" style={{ width: 0 }} />
            </div>
          </div>
        </div>

        {node.isExpanded && hasChildren && <div className="task-children">{node.children.map(renderTaskNode)}</div>}
      </div>
    );
  };


  return (
    <div>
      <div className={`collapsible-section ${!isTagsExpanded ? 'collapsed' : ''}`}>
        <div className="section-header-simple" onClick={() => setIsTagsExpanded((v) => !v)}>
          <h3 className="section-title">标签选择</h3>
          <button className={`panel-toggle-btn ${isTagsExpanded ? 'expanded' : ''}`} type="button">
            <img
              src={DownIconSvg}
              alt=""
              style={{
                width: '20px',
                height: '20px',
                transition: 'transform 0.2s',
                transform: isTagsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </div>
        <div className="collapsible-content">
          <div className="task-tree" style={{ maxHeight: 260 }}>
            {taskTree.map(renderTaskNode)}
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className={`collapsible-section ${!isCalendarsExpanded ? 'collapsed' : ''}`}>
        <div className="section-header-simple" onClick={() => setIsCalendarsExpanded((v) => !v)}>
          <h3 className="section-title">日历选择</h3>
          <button className={`panel-toggle-btn ${isCalendarsExpanded ? 'expanded' : ''}`} type="button">
            <img
              src={DownIconSvg}
              alt=""
              style={{
                width: '20px',
                height: '20px',
                transition: 'transform 0.2s',
                transform: isCalendarsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </div>
        <div className="collapsible-content">
          <div className="calendar-tree" style={{ maxHeight: 260 }}>
            <div className="calendar-list">
              {calendars.map((calendar) => (
                <div key={calendar.id} className="calendar-item">
                  <div className="calendar-color-dot" style={{ background: calendar.color ?? 'var(--ui-border)' }} />
                  <span className="calendar-name">{calendar.name}</span>
                  <div className="calendar-stats">
                    <span className="calendar-event-count">{calendar.eventCount ?? 0}个事件</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
