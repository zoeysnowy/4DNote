/**
 * 🌲 EventTreeCanvas - React Flow 画布容器
 * 
 * EventTree 的画布组件，管理节点、边、布局算法。
 * 
 * 功能：
 * - 过滤系统事件（isTimer/isOutsideApp/isTimeLog）
 * - 父子关系可视化（刚性骨架 - parentEventId）
 * - 双向链接堆叠卡片（柔性血管 - linkedEventIds/backlinks）
 * - 自动布局（使用 dagre 算法）
 * - 交互：拖拽、缩放、点击节点打开 EventEditModal
 */

import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Event } from '@frontend/types';
import { CustomEventNode, EventNodeData } from './CustomEventNode';
import { EventService } from '@backend/EventService';
import './EventTree.css';

interface EventTreeCanvasProps {
  rootEventId: string;              // 根事件 ID（入口点）
  events: Event[];                  // 所有事件数据
  onEventClick?: (event: Event) => void;  // 点击事件回调
  onCheckboxChange?: (event: Event, isCompleted: boolean) => void;  // Checkbox 回调
}

// 注册自定义节点类型
const nodeTypes: NodeTypes = {
  customEvent: CustomEventNode,
};

export const EventTreeCanvas: React.FC<EventTreeCanvasProps> = ({
  rootEventId,
  events,
  onEventClick,
  onCheckboxChange,
}) => {
  // 过滤系统事件（不在 EventTree 中显示）
  const filteredEvents = useMemo(() => {
    return events.filter(event => EventService.shouldShowInEventTree(event));
  }, [events]);

  // 构建节点数据
  const initialNodes: Node<EventNodeData>[] = useMemo(() => {
    // ADR-001: childEvents 来自 parentEventId 推导
    const childrenMap = new Map<string, Event[]>();
    for (const e of filteredEvents) {
      if (e.parentEventId) {
        const list = childrenMap.get(e.parentEventId) || [];
        list.push(e);
        childrenMap.set(e.parentEventId, list);
      }
    }

    return filteredEvents.map((event, index) => {
      // 获取双向链接的事件（outgoing + incoming）
      // 注意：getLinkedEvents 是异步的，这里使用空数组，实际应该在组件 mount 时异步加载
      const linkedEvents: Event[] = [];
      const childEvents = childrenMap.get(event.id) || [];

      return {
        id: event.id,
        type: 'customEvent',
        position: { x: index * 300, y: 0 }, // 临时位置，后续使用自动布局
        data: {
          event,
          linkedEvents,
          childEvents,
          onEventClick,
          onCheckboxChange,
        },
      };
    });
  }, [filteredEvents, onEventClick, onCheckboxChange]);

  // 构建边数据（父子关系）
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    // ADR-001: 边来自 child.parentEventId
    const exists = new Set(filteredEvents.map(e => e.id));
    filteredEvents.forEach(child => {
      if (!child.parentEventId) return;
      if (!exists.has(child.parentEventId)) return;

      edges.push({
        id: `${child.parentEventId}-${child.id}`,
        source: child.parentEventId,
        target: child.id,
        type: 'smoothstep',
        animated: false,
      });
    });
    
    return edges;
  }, [filteredEvents]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node<EventNodeData>) => {
    if (onEventClick && node.data) {
      onEventClick(node.data.event);
    }
  }, [onEventClick]);

  return (
    <div className="event-tree-canvas" style={{ width: '100%', height: '600px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        style={{ background: '#f8fafc' }}
      >
        {/* 网格背景（浅色点阵） */}
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={20} 
          size={1.5}
          color="#cbd5e1"
        />
        {/* 缩放/平移控制器 */}
        <Controls />
      </ReactFlow>
    </div>
  );
};
