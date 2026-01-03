/**
 * EventTreeSlate - 树形结构的单实例 Slate 编辑器
 * 
 * 核心特性：
 * 1. 单个 Slate 实例，支持跨节点文字选择
 * 2. 树形可视化（L 型连接线、折叠/展开）
 * 3. Tab/Shift+Tab 调整层级和父子关系
 * 4. 双向链接 LinkedCard 堆叠显示
 * 
 * 架构参考：PlanSlate 的 event-line 模式
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { createEditor, Descendant, Editor, Transforms, Range, Point, Node, Element as SlateElement, Text as SlateText, Path } from 'slate';
import { Slate, Editable, withReact, RenderElementProps, RenderLeafProps, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import { ChevronDown, ChevronRight, Circle, LinkIcon } from 'lucide-react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';

import { EventService } from '../../services/EventService';
import { TagService } from '../../services/TagService';
import { Event } from '../../types';
import { EventTreeAPI } from '../../services/eventTree';
import { useEventHubSnapshot } from '../../hooks/useEventHubSnapshot';
import { LinkedCard } from './LinkedCard';
import { resolveDisplayTitle } from '../../utils/TitleResolver';
import './EventTree.css';

// ==================== 类型定义 ====================

/**
 * TreeNode - 对应一个 Event 的树节点
 */
export interface TreeNodeElement {
  type: 'tree-node';
  eventId: string;         // 关联的 Event ID
  nodeId: string;          // 节点唯一ID（用于编辑器内部定位）
  level: number;           // 缩进层级 (0, 1, 2, ...)
  isOpen: boolean;         // 是否展开子节点
  parentEventId?: string;  // 父事件 ID
  childCount?: number;     // 直接子节点数量（由 parentEventId 派生）
  linkedEventIds?: string[]; // 双向链接 ID 列表
  children: Descendant[];  // Slate 文本内容
}

export interface TreeTextNode {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
}

// ==================== Plugin ====================

/**
 * withTreeNodes - 自定义 Slate Plugin
 * 处理树节点特殊行为
 */
const withTreeNodes = (editor: Editor) => {
  const { insertBreak, deleteBackward } = editor;

  // Enter 键：在当前节点下方插入新节点（同层级）
  editor.insertBreak = () => {
    const { selection } = editor;
    if (!selection) return insertBreak();

    const [nodeEntry] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'tree-node',
    });

    if (nodeEntry) {
      const [node, path] = nodeEntry;
      const treeNode = node as unknown as TreeNodeElement;

      // 创建新节点（同层级）
      const newNode: TreeNodeElement = {
        type: 'tree-node',
        eventId: `temp_${Date.now()}`,
        nodeId: `node_${Date.now()}`,
        level: treeNode.level,
        isOpen: true,
        parentEventId: treeNode.parentEventId,
        children: [{ text: '' }],
      };

      // 在当前节点后插入
      const nextPath = Path.next(path);
      Transforms.insertNodes(editor, newNode as any, { at: nextPath });
      Transforms.select(editor, Editor.start(editor, nextPath));
    } else {
      insertBreak();
    }
  };

  // Backspace 键：如果内容为空，删除节点
  editor.deleteBackward = (...args) => {
    const { selection } = editor;
    if (!selection) return deleteBackward(...args);

    const [nodeEntry] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'tree-node',
    });

    if (nodeEntry) {
      const [node, path] = nodeEntry;
      const treeNode = node as unknown as TreeNodeElement;
      const isEmpty = Node.string(node).trim() === '';

      if (isEmpty && Range.isCollapsed(selection)) {
        const point = selection.anchor;
        const start = Editor.start(editor, path);

        // 如果光标在节点开头，删除整个节点
        if (Point.equals(point, start)) {
          Transforms.removeNodes(editor, { at: path });
          return;
        }
      }
    }

    deleteBackward(...args);
  };

  return editor;
};

// ==================== 主组件 ====================

export interface EventTreeSlateProps {
  rootEventId: string;
  /** Optional snapshot of events from caller; if provided, avoids internal getAllEvents() */
  events?: Event[];
  onEventClick?: (event: Event) => void;
}

export const EventTreeSlate: React.FC<EventTreeSlateProps> = ({
  rootEventId,
  events,
  onEventClick,
}) => {
  const [editor] = useState(() => withTreeNodes(withReact(withHistory(createEditor()))));
  const [value, setValue] = useState<TreeNodeElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const { events: snapshotEvents, ensureLoaded } = useEventHubSnapshot({ enabled: events == null });

  // ==================== 数据加载 ====================

  /**
   * ADR-001: 使用 EventTreeAPI 基于 parentEventId 构建树（避免 N+1 查询）
   */
  const buildTreeValue = useCallback(async (): Promise<TreeNodeElement[]> => {
    if (events == null) {
      await ensureLoaded();
    }
    const allEvents = events ?? snapshotEvents;
    const subtree = EventTreeAPI.getSubtree(rootEventId, allEvents);
    if (subtree.length === 0) return [];

    const tree = EventTreeAPI.buildTree(subtree, {
      validateStructure: false,
      computeBulletLevels: false,
      sortSiblings: true,
    });

    const nodes: TreeNodeElement[] = [];
    const visited = new Set<string>();

    const dfs = (eventId: string, level: number, parentEventId?: string) => {
      if (visited.has(eventId)) return;
      visited.add(eventId);

      const event = tree.nodesById.get(eventId)?._fullEvent;
      if (!event) return;

      const titleText = resolveDisplayTitle(event, {
        getTagLabel: (tagId: string) => {
          const tag = TagService.getTagById(tagId);
          if (!tag) return undefined;
          return tag.emoji ? `${tag.emoji} ${tag.name}` : tag.name;
        },
      });

      nodes.push({
        type: 'tree-node',
        eventId: event.id,
        nodeId: `node_${event.id}`,
        level,
        isOpen: true,
        parentEventId,
        childCount: (tree.childrenMap.get(event.id) || []).length,
        linkedEventIds: event.linkedEventIds || [],
        children: [{ text: titleText }],
      });

      const childIds = tree.childrenMap.get(eventId) || [];
      for (const childId of childIds) {
        dfs(childId, level + 1, eventId);
      }
    };

    dfs(rootEventId, 0, undefined);
    return nodes;
  }, [rootEventId, events, snapshotEvents, ensureLoaded]);

  /**
   * 初始化加载树
   */
  useEffect(() => {
    const loadTree = async () => {
      setLoading(true);
      try {
        const nodes = await buildTreeValue();
        setValue(nodes);
      } catch (err) {
        console.error('[EventTreeSlate] Failed to load tree:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTree();
  }, [buildTreeValue]);

  // ==================== 事件处理 ====================

  /**
   * 保存节点内容
   */
  const handleChange = useCallback((newValue: Descendant[]) => {
    setValue(newValue as any);

    // TODO: 防抖保存到数据库
    // debounce(() => {
    //   newValue.forEach(node => {
    //     if (node.type === 'tree-node') {
    //       const text = Node.string(node);
    //       EventService.updateEvent(node.eventId, { title: text });
    //     }
    //   });
    // }, 500);
  }, []);

  /**
   * 键盘事件处理
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const { selection } = editor;
    if (!selection) return;

    // Tab: 增加层级（成为上一个节点的子节点）
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();

      const [nodeEntry] = Editor.nodes(editor, {
        match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'tree-node',
      });

      if (nodeEntry) {
        const [node, path] = nodeEntry;
        const treeNode = node as unknown as TreeNodeElement;

        // 找到上一个节点
        if (path[0] > 0) {
          const prevPath = [path[0] - 1];
          const prevNode = Node.get(editor, prevPath) as unknown as TreeNodeElement;

          // 更新层级和父子关系
          Transforms.setNodes(
            editor,
            {
              level: prevNode.level + 1,
              parentEventId: prevNode.eventId,
            } as any,
            { at: path }
          );

          // 更新数据库
          EventService.updateEvent(treeNode.eventId, {
            parentEventId: prevNode.eventId,
          });
        }
      }
    }

    // Shift+Tab: 减少层级（提升为父节点的兄弟节点）
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();

      const [nodeEntry] = Editor.nodes(editor, {
        match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'tree-node',
      });

      if (nodeEntry) {
        const [node, path] = nodeEntry;
        const treeNode = node as unknown as TreeNodeElement;

        if (treeNode.level > 0 && treeNode.parentEventId) {
          const parentEvent = value.find(n => n.eventId === treeNode.parentEventId);

          if (parentEvent) {
            // 更新层级和父子关系
            Transforms.setNodes(
              editor,
              {
                level: treeNode.level - 1,
                parentEventId: parentEvent.parentEventId,
              } as any,
              { at: path }
            );

            // 更新数据库
            EventService.updateEvent(treeNode.eventId, {
              parentEventId: parentEvent.parentEventId || null,
            });
          }
        }
      }
    }
  }, [editor, value]);

  /**
   * 切换节点折叠状态
   */
  const toggleNodeCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // ==================== 渲染函数 ====================

  /**
   * 渲染树节点
   */
  const renderElement = useCallback((props: RenderElementProps) => {
    const { element, attributes, children } = props;

    if ((element as any).type === 'tree-node') {
      const treeNode = element as unknown as TreeNodeElement;
      const hasChildren = (treeNode.childCount || 0) > 0;
      const isCollapsed = collapsedNodes.has(treeNode.nodeId);

      // 加载链接的事件
      const [linkedEvents, setLinkedEvents] = useState<Event[]>([]);
      useEffect(() => {
        if (treeNode.linkedEventIds && treeNode.linkedEventIds.length > 0) {
          Promise.all(
            treeNode.linkedEventIds.map(id => EventService.getEventById(id))
          ).then(events => setLinkedEvents(events.filter(Boolean) as Event[]));
        }
      }, [treeNode.linkedEventIds]);

      return (
        <div
          {...attributes}
          className="tree-node"
          data-tree-node="true"
          data-node-id={treeNode.nodeId}
          data-level={treeNode.level}
          style={{
            paddingLeft: `${treeNode.level * 24}px`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minHeight: '32px',
            position: 'relative',
          }}
        >
          {/* L 型连接线（绝对定位） */}
          {treeNode.level > 0 && (
            <>
              {/* 垂直线 */}
              <div 
                className="tree-line" 
                style={{ 
                  position: 'absolute',
                  left: `${(treeNode.level - 1) * 24 + 10}px`,
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  background: '#e5e7eb',
                }} 
              />
              {/* L 型弯曲 */}
              <div 
                className="tree-connector" 
                style={{ 
                  position: 'absolute',
                  left: `${(treeNode.level - 1) * 24 + 10}px`,
                  top: 0,
                  width: '14px',
                  height: '16px',
                  borderLeft: '1px solid #e5e7eb',
                  borderBottom: '1px solid #e5e7eb',
                  borderBottomLeftRadius: '6px',
                }} 
              />
            </>
          )}

          {/* 折叠按钮 */}
          <div className="tree-icon-container" contentEditable={false} style={{ flexShrink: 0, display: 'flex' }}>
            <button
              className="tree-icon"
              onClick={() => toggleNodeCollapse(treeNode.nodeId)}
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: '#9ca3af',
                cursor: 'pointer',
                borderRadius: '4px',
              }}
            >
              {hasChildren ? (
                isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />
              ) : (
                <Circle size={8} fill="#d1d5db" />
              )}
            </button>
          </div>

          {/* 可编辑内容 + Link 按钮容器（flex 布局让 Link 跟随文字） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            {/* 可编辑内容 */}
            <div className="tree-editable" style={{ display: 'inline-block' }}>
              {children}
            </div>

            {/* Link 按钮（跟随在文字右侧 24px 处） */}
            {linkedEvents.length > 0 && (
              <div 
                className="tree-link-container" 
                contentEditable={false} 
                style={{ 
                  flexShrink: 0,
                  marginLeft: '24px', // 固定距离文字右侧 24px
                }}
              >
                <Tippy
                  content={
                    <div className="linked-cards-stack">
                      {linkedEvents.map((linkedEvent, index) => (
                        <LinkedCard
                          key={linkedEvent.id}
                          event={linkedEvent}
                          index={index}
                          isHovered={true}
                          onClick={() => onEventClick?.(linkedEvent)}
                        />
                      ))}
                    </div>
                  }
                  interactive={true}
                  placement="right-end"
                  theme="light-border"
                  offset={[8, 0]}
                  appendTo={() => document.body}
                  zIndex={9999}
                >
                  <button 
                    className="link-button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      border: 'none',
                      borderRadius: '12px',
                      background: '#f3f4f6',
                      color: '#6b7280',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <LinkIcon size={14} />
                    <span>{linkedEvents.length}</span>
                  </button>
                </Tippy>
              </div>
            )}
          </div>
        </div>
      );
    }

    return <div {...attributes}>{children}</div>;
  }, [collapsedNodes, toggleNodeCollapse, onEventClick]);

  const renderLeaf = useCallback((props: RenderLeafProps) => {
    let { attributes, children, leaf } = props;
    const textLeaf = leaf as any;

    if (textLeaf.bold) {
      children = <strong>{children}</strong>;
    }
    if (textLeaf.italic) {
      children = <em>{children}</em>;
    }
    if (textLeaf.underline) {
      children = <u>{children}</u>;
    }
    if (textLeaf.code) {
      children = <code>{children}</code>;
    }

    return <span {...attributes}>{children}</span>;
  }, []);

  // ==================== 过滤折叠节点 ====================

  /**
   * 根据折叠状态过滤显示的节点
   */
  const visibleValue = useMemo(() => {
    const result: TreeNodeElement[] = [];
    const hiddenParents = new Set<string>();

    for (const node of value) {
      // 如果父节点被折叠，跳过当前节点
      if (node.parentEventId && collapsedNodes.has(`node_${node.parentEventId}`)) {
        hiddenParents.add(node.eventId);
        continue;
      }

      // 如果祖先节点被折叠，跳过当前节点
      if (hiddenParents.has(node.eventId)) {
        continue;
      }

      result.push(node);
    }

    return result;
  }, [value, collapsedNodes]);

  // ==================== 渲染 ====================

  if (loading) {
    return <div className="event-tree-loading">加载中...</div>;
  }

  return (
    <div 
      className="event-tree-slate"
      style={{
        minHeight: 'auto',
        maxHeight: 'none',
        padding: '0',
        fontSize: '14px',
      }}
    >
      <Slate editor={editor} initialValue={visibleValue as any} onChange={handleChange}>
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          onKeyDown={handleKeyDown}
          placeholder="输入事件标题..."
          spellCheck={false}
          style={{
            outline: 'none',
            border: 'none',
          }}
        />
      </Slate>
    </div>
  );
};
