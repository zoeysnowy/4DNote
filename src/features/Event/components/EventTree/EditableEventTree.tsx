/**
 * 🌲 EditableEventTree - 树形事件编辑器
 * 
 * 功能：
 * - 树形折叠/展开结构，L 形连接线
 * - 每行使用 Slate 编辑标题（单行模式）
 * - 右侧 Link 按钮显示关联事件的堆叠卡片
 * - Tab/Shift+Tab 调整层级
 * - Enter 创建新事件
 * 
 * 架构：
 * - 基于 parentEventId 构建树形结构（ADR-001）
 * - 每个节点独立的 Slate 编辑器实例
 * - 递归渲染子节点
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createEditor, Descendant } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import { ChevronRight, ChevronDown, Circle, Link as LinkIcon } from 'lucide-react';
import { Event } from '@frontend/types';
import { EventService } from '@backend/EventService';
import { EventTreeAPI } from '@backend/eventTree';
import { LinkedCard } from './LinkedCard';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import './EditableEventTree.css';

interface EditableEventTreeProps {
  rootEventId: string;
  onEventClick?: (event: Event) => void;
}

// 树节点数据结构
interface TreeNode {
  event: Event;
  children: TreeNode[];
  isOpen: boolean;
}

// 树节点组件
const TreeNodeItem: React.FC<{
  node: TreeNode;
  isLast: boolean;
  onEventClick?: (event: Event) => void;
  onToggle: (eventId: string) => void;
  onTitleChange: (eventId: string, title: string) => void;
}> = ({ node, isLast, onEventClick, onToggle, onTitleChange }) => {
  const [editor] = useState(() => withHistory(withReact(createEditor())));
  const [linkedEvents, setLinkedEvents] = useState<Event[]>([]);
  const hasChildren = node.children.length > 0;

  // 初始化编辑器内容
  const initialValue: Descendant[] = [
    {
      type: 'paragraph',
      children: [{ text: node.event.title?.simpleTitle || '' }],
    } as any,
  ];

  // 加载关联事件
  useEffect(() => {
    const loadLinkedEvents = async () => {
      const result = await EventService.getLinkedEvents(node.event.id);
      // getLinkedEvents 返回 { outgoing, incoming }，合并为一个数组
      const allLinked = [...result.outgoing, ...result.incoming];
      // 去重
      const uniqueLinked = Array.from(new Map(allLinked.map(e => [e.id, e])).values());
      setLinkedEvents(uniqueLinked);
    };
    loadLinkedEvents();
  }, [node.event.id]);

  const handleChange = (value: Descendant[]) => {
    // 提取标题文本
    const text = value.map((n: any) => 
      n.children?.map((c: any) => c.text).join('') || ''
    ).join('\n');
    onTitleChange(node.event.id, text);
  };

  return (
    <li className="tree-node-item">
      {/* 垂直连接线 */}
      {!isLast && <div className="vertical-line" />}
      
      {/* L 形弯曲线 */}
      <div className={`connector-curve ${isLast ? 'connector-last' : ''}`} />

      {/* 内容区域 */}
      <div className="tree-node-content">
        {/* 折叠/展开按钮 */}
        <button
          className="toggle-button"
          onClick={() => onToggle(node.event.id)}
        >
          {hasChildren ? (
            node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <Circle size={6} className="circle-dot" />
          )}
        </button>

        {/* Slate 标题编辑器 */}
        <div className="title-editor">
          <Slate editor={editor} initialValue={initialValue} onChange={handleChange}>
            <Editable
              placeholder="输入事件标题..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // TODO: 创建新事件
                }
              }}
            />
          </Slate>
        </div>

        {/* Link 按钮 - 使用 Tippy 定位堆叠卡片 */}
        {linkedEvents.length > 0 && (
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
            animation="shift-away"
            delay={[100, 0]}
            arrow={false}
            offset={[8, 0]}
            maxWidth="none"
            appendTo={() => document.body}
            zIndex={9999}
          >
            <div className="link-button-container">
              <button className="link-button">
                <LinkIcon size={14} />
                <span>{linkedEvents.length}</span>
              </button>
            </div>
          </Tippy>
        )}
      </div>

      {/* 递归渲染子节点 */}
      {hasChildren && node.isOpen && (
        <ul className="tree-children">
          {node.children.map((child, index) => (
            <TreeNodeItem
              key={child.event.id}
              node={child}
              isLast={index === node.children.length - 1}
              onEventClick={onEventClick}
              onToggle={onToggle}
              onTitleChange={onTitleChange}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

// 统计树节点总数
const countTreeNodes = (node: TreeNode): number => {
  let count = 1; // 当前节点
  node.children.forEach(child => {
    count += countTreeNodes(child);
  });
  return count;
};

export const EditableEventTree: React.FC<EditableEventTreeProps> = ({
  rootEventId,
  onEventClick,
}) => {
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const allEventsRef = useRef<Event[]>([]);

  // 构建树形结构（递归加载所有层级）
  const buildTree = useCallback(async (event: Event, depth: number = 0): Promise<TreeNode> => {
    const allEvents = allEventsRef.current;
    const directChildren = EventTreeAPI
      .getDirectChildren(event.id, allEvents)
      .filter(child => EventService.shouldShowInEventTree(child));

    const children: TreeNode[] = [];
    for (const child of directChildren) {
      const childNode = await buildTree(child, depth + 1);
      children.push(childNode);
    }

    return {
      event,
      children,
      isOpen: true,
    };
  }, []);

  // 加载事件树
  const loadEventTree = useCallback(async () => {
    try {
      console.log('🌲 [EventTree] 开始加载事件树，根事件:', rootEventId);
      
      const rootEvent = await EventService.getEventById(rootEventId);
      if (!rootEvent) {
        console.error('❌ [EventTree] 根事件不存在:', rootEventId);
        setIsLoading(false);
        return;
      }

      allEventsRef.current = await EventService.getAllEvents();

      console.log('✅ [EventTree] 根事件加载成功:', {
        id: rootEvent.id,
        title: rootEvent.title?.simpleTitle,
      });

      const tree = await buildTree(rootEvent);
      const totalNodes = countTreeNodes(tree);
      
      console.log('🎉 [EventTree] 事件树构建完成:', {
        rootId: rootEvent.id,
        totalNodes,
        structure: JSON.stringify(tree, (key, value) => {
          if (key === 'event') return { id: value.id, title: value.title?.simpleTitle };
          return value;
        }, 2)
      });
      
      setTreeData(tree);
      setIsLoading(false);
    } catch (error) {
      console.error('❌ [EventTree] 加载事件树失败:', error);
      setIsLoading(false);
    }
  }, [rootEventId, buildTree]);

  useEffect(() => {
    loadEventTree();
  }, [loadEventTree]);

  // 切换节点展开/折叠
  const handleToggle = useCallback((eventId: string) => {
    const toggleNode = (node: TreeNode): TreeNode => {
      if (node.event.id === eventId) {
        return { ...node, isOpen: !node.isOpen };
      }
      return {
        ...node,
        children: node.children.map(toggleNode),
      };
    };

    if (treeData) {
      setTreeData(toggleNode(treeData));
    }
  }, [treeData]);

  // 更新标题（防抖）
  const handleTitleChange = useCallback(async (eventId: string, title: string) => {
    await EventService.updateEvent(eventId, {
      title: { simpleTitle: title },
    });
  }, []);

  if (isLoading) {
    return (
      <div className="editable-event-tree loading">
        <p>加载事件树中...</p>
      </div>
    );
  }

  if (!treeData) {
    return (
      <div className="editable-event-tree error">
        <p>未找到根事件</p>
      </div>
    );
  }

  return (
    <div className="editable-event-tree">
      <ul className="tree-root">
        <TreeNodeItem
          node={treeData}
          isLast={true}
          onEventClick={onEventClick}
          onToggle={handleToggle}
          onTitleChange={handleTitleChange}
        />
      </ul>
    </div>
  );
};
