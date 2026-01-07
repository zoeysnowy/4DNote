import React, { useEffect, useMemo, useRef, useState } from 'react';

import DownIconSvg from '@frontend/assets/icons/down.svg';

import '@frontend/components/ContentSelectionPanel.css';

import type { ContentPanelDemoTag } from './ContentPanelPickersDemo';

type TagNode = {
  id: string;
  title: string;
  color: string;
  level: number;
  children: TagNode[];
  isExpanded: boolean;
};

export const TagDropdownPickerDemo: React.FC<{ tags: ContentPanelDemoTag[]; defaultExpandedTagIds?: string[] }> = ({
  tags,
  defaultExpandedTagIds = [],
}) => {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // expandedNodes stores *collapsed* parents (matching existing sidebar convention)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    const collapsed = new Set<string>();
    const explicitExpanded = new Set(defaultExpandedTagIds);

    const hasChildren = new Set<string>();
    for (const t of tags) {
      if (t.parentId) hasChildren.add(t.parentId);
    }

    for (const parentId of hasChildren) {
      if (!explicitExpanded.has(parentId)) collapsed.add(parentId);
    }

    return collapsed;
  });

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tree = useMemo((): TagNode[] => {
    const tagById = new Map(tags.map((t) => [t.id, t] as const));
    const childrenByParent = new Map<string, string[]>();
    for (const t of tags) {
      if (!t.parentId) continue;
      const arr = childrenByParent.get(t.parentId) ?? [];
      arr.push(t.id);
      childrenByParent.set(t.parentId, arr);
    }

    const nodeMap = new Map<string, TagNode>();
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
      });
    }

    const roots: TagNode[] = [];
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

  const renderNode = (node: TagNode) => {
    const hasChildren = node.children.length > 0;
    const indent = node.level * 16;
    const checked = selectedIds.has(node.id);

    return (
      <div key={node.id} className={`task-node task-node-depth-${node.level}`}>
        <div
          className="tag-dropdown-row"
          role="menuitemcheckbox"
          aria-checked={checked}
          tabIndex={0}
          onClick={() => toggleSelected(node.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleSelected(node.id);
            }
          }}
        >
          {hasChildren ? (
            <button
              className="task-expand-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapsed(node.id);
              }}
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

          <input
            className="tag-dropdown-checkbox"
            type="checkbox"
            checked={checked}
            onChange={() => toggleSelected(node.id)}
            onClick={(e) => e.stopPropagation()}
          />

          <div className="task-title" style={{ color: node.color }}>
            {node.title}
          </div>
        </div>

        {node.isExpanded && hasChildren && <div className="task-children">{node.children.map(renderNode)}</div>}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="tag-dropdown-demo">
      <div className="tag-dropdown">
        <button
          className="tag-dropdown-trigger"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="tag-dropdown-triggerText">
            {selectedIds.size > 0 ? `已选择 ${selectedIds.size} 个标签` : '选择标签…'}
          </span>
          <img
            src={DownIconSvg}
            alt=""
            style={{
              width: '18px',
              height: '18px',
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>

        {open ? (
          <div className="tag-dropdown-panel" role="menu">
            <div className="tag-dropdown-scroll" style={{ maxHeight: 260 }}>
              {tree.map(renderNode)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
