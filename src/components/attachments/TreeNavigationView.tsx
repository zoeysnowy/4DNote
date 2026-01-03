import React, { useState, useEffect } from 'react';
import { Attachment, AttachmentType } from '@frontend/types';

interface TreeNode {
  id: string;
  eventId: string;
  title: string;
  level: number;
  children: TreeNode[];
  expanded: boolean;
  hasChildren: boolean;
}

interface TreeNavigationViewProps {
  eventId: string;
  attachments: Attachment[];
  onAttachmentClick?: (attachment: Attachment, index: number) => void;
  onNavigate?: (targetEventId: string) => void;
  onDelete?: (attachmentId: string) => void;
  layout?: 'tree' | 'breadcrumb' | 'graph';
  className?: string;
}

/**
 * 树形导航查看组件
 * 
 * 功能：
 * - EventTree 层级结构展示
 * - 展开/折叠节点
 * - 双向链接导航
 * - 面包屑路径
 * - 快速跳转
 * 
 * 布局模式：
 * - tree: 树形结构（展开/折叠）
 * - breadcrumb: 面包屑导航
 * - graph: 关系图谱（简化）
 * 
 * @example
 * ```tsx
 * <TreeNavigationView
 *   eventId="event-123"
 *   attachments={subEventAttachments}
 *   onNavigate={handleNavigate}
 * />
 * ```
 */
export const TreeNavigationView: React.FC<TreeNavigationViewProps> = ({
  eventId,
  attachments,
  onAttachmentClick,
  onNavigate,
  onDelete,
  layout = 'tree',
  className = '',
}) => {
  const [subEvents, setSubEvents] = useState<Attachment[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<number | 'all'>('all');

  /**
   * 过滤子事件类型附件
   */
  useEffect(() => {
    const subs = attachments.filter((att) => att.type === AttachmentType.SUB_EVENT);
    setSubEvents(subs);
    buildTreeData(subs);
  }, [attachments]);

  /**
   * 构建树形数据
   */
  const buildTreeData = (subs: Attachment[]) => {
    // 简化实现：假设每个 sub-event attachment 有 targetEventId
    // 实际实现中需要从 EventTree 获取完整层级结构
    const nodes: TreeNode[] = subs.map((sub, index) => ({
      id: sub.id,
      eventId: sub.metadata?.targetEventId || `event-${index}`,
      title: sub.caption || sub.filename || `子事件 ${index + 1}`,
      level: sub.metadata?.level || 1,
      children: [],
      expanded: false,
      hasChildren: false,
    }));

    setTreeData(nodes);
  };

  /**
   * 切换节点展开状态
   */
  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  /**
   * 展开所有节点
   */
  const expandAll = () => {
    const allIds = new Set(treeData.map((node) => node.id));
    setExpandedNodes(allIds);
  };

  /**
   * 折叠所有节点
   */
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  /**
   * 过滤树节点
   */
  const getFilteredNodes = (): TreeNode[] => {
    let filtered = treeData;

    // 按层级过滤
    if (filterLevel !== 'all') {
      filtered = filtered.filter((node) => node.level === filterLevel);
    }

    // 按搜索关键词过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((node) => node.title.toLowerCase().includes(query));
    }

    return filtered;
  };

  /**
   * 获取节点图标
   */
  const getNodeIcon = (level: number): string => {
    switch (level) {
      case 1:
        return '📁';
      case 2:
        return '📂';
      case 3:
        return '📄';
      default:
        return '📌';
    }
  };

  /**
   * 获取层级颜色
   */
  const getLevelColor = (level: number): string => {
    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d'];
    return colors[Math.min(level - 1, colors.length - 1)];
  };

  /**
   * 导航到目标事件
   */
  const handleNavigate = (targetEventId: string) => {
    onNavigate?.(targetEventId);
  };

  /**
   * 删除子事件
   */
  const handleDelete = (attachmentId: string) => {
    if (!confirm('确定要删除这个子事件链接吗？')) return;
    onDelete?.(attachmentId);
  };

  /**
   * 渲染树形节点
   */
  const renderTreeNode = (node: TreeNode, index: number) => {
    const isExpanded = expandedNodes.has(node.id);
    const icon = getNodeIcon(node.level);
    const color = getLevelColor(node.level);

    return (
      <div key={node.id} className="tree-node-wrapper">
        <div
          className="tree-node"
          style={{ paddingLeft: `${(node.level - 1) * 24}px` }}
        >
          {/* 展开/折叠按钮 */}
          {node.hasChildren && (
            <button
              className="expand-button"
              onClick={() => toggleNode(node.id)}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!node.hasChildren && <div className="expand-spacer" />}

          {/* 节点图标 */}
          <span className="node-icon">{icon}</span>

          {/* 节点标题 */}
          <span
            className="node-title"
            onClick={() => handleNavigate(node.eventId)}
            title="点击跳转"
          >
            {node.title}
          </span>

          {/* 层级标签 */}
          <span className="level-badge" style={{ background: color }}>
            L{node.level}
          </span>

          {/* 操作按钮 */}
          <div className="node-actions">
            <button
              className="action-btn"
              onClick={() => handleNavigate(node.eventId)}
              title="跳转"
            >
              🔗
            </button>
            {onDelete && (
              <button
                className="action-btn delete"
                onClick={() => handleDelete(node.id)}
                title="删除"
              >
                🗑️
              </button>
            )}
          </div>
        </div>

        {/* 子节点 */}
        {isExpanded && node.children.length > 0 && (
          <div className="tree-children">
            {node.children.map((child, childIndex) => renderTreeNode(child, childIndex))}
          </div>
        )}
      </div>
    );
  };

  /**
   * 渲染树形布局
   */
  const renderTree = () => {
    const filtered = getFilteredNodes();

    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">🌳</div>
          <p>没有找到匹配的子事件</p>
        </div>
      );
    }

    return (
      <div className="tree-container">
        <div className="tree-toolbar">
          <button className="toolbar-btn" onClick={expandAll}>
            ⬇️ 全部展开
          </button>
          <button className="toolbar-btn" onClick={collapseAll}>
            ⬆️ 全部折叠
          </button>
        </div>

        <div className="tree-list">
          {filtered.map((node, index) => renderTreeNode(node, index))}
        </div>
      </div>
    );
  };

  /**
   * 渲染面包屑布局
   */
  const renderBreadcrumb = () => {
    const filtered = getFilteredNodes();

    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">🍞</div>
          <p>没有找到匹配的子事件</p>
        </div>
      );
    }

    // 按层级分组
    const groupedByLevel: { [level: number]: TreeNode[] } = {};
    filtered.forEach((node) => {
      if (!groupedByLevel[node.level]) {
        groupedByLevel[node.level] = [];
      }
      groupedByLevel[node.level].push(node);
    });

    const levels = Object.keys(groupedByLevel)
      .map(Number)
      .sort((a, b) => a - b);

    return (
      <div className="breadcrumb-container">
        {levels.map((level) => (
          <div key={level} className="breadcrumb-level">
            <div className="breadcrumb-header">
              <span className="breadcrumb-label">层级 {level}</span>
              <span className="breadcrumb-count">{groupedByLevel[level].length} 项</span>
            </div>

            <div className="breadcrumb-items">
              {groupedByLevel[level].map((node) => {
                const icon = getNodeIcon(node.level);
                const color = getLevelColor(node.level);

                return (
                  <div
                    key={node.id}
                    className="breadcrumb-item"
                    style={{ borderColor: color }}
                  >
                    <span className="breadcrumb-icon">{icon}</span>
                    <span
                      className="breadcrumb-title"
                      onClick={() => handleNavigate(node.eventId)}
                    >
                      {node.title}
                    </span>
                    {onDelete && (
                      <button
                        className="breadcrumb-delete"
                        onClick={() => handleDelete(node.id)}
                      >
                        ❌
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /**
   * 渲染关系图谱布局
   */
  const renderGraph = () => {
    const filtered = getFilteredNodes();

    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">🕸️</div>
          <p>没有找到匹配的子事件</p>
        </div>
      );
    }

    return (
      <div className="graph-container">
        <div className="graph-note">
          <p>💡 图谱模式暂为简化版本</p>
          <p>完整版本需要集成力导向图库（如 D3.js, Cytoscape.js）</p>
        </div>

        <div className="graph-nodes">
          {filtered.map((node) => {
            const icon = getNodeIcon(node.level);
            const color = getLevelColor(node.level);

            return (
              <div
                key={node.id}
                className="graph-node"
                style={{ borderColor: color }}
                onClick={() => handleNavigate(node.eventId)}
              >
                <span className="graph-icon">{icon}</span>
                <div className="graph-info">
                  <div className="graph-title">{node.title}</div>
                  <div className="graph-meta">层级 {node.level}</div>
                </div>
                {onDelete && (
                  <button
                    className="graph-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(node.id);
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /**
   * 空状态
   */
  if (subEvents.length === 0) {
    return (
      <div className="tree-nav-empty">
        <div className="empty-icon">🌳</div>
        <p>暂无子事件</p>
      </div>
    );
  }

  return (
    <div className={`tree-navigation-view ${className}`}>
      {/* 工具栏 */}
      <div className="toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="搜索子事件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>层级筛选：</label>
          <select
            value={filterLevel}
            onChange={(e) =>
              setFilterLevel(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
          >
            <option value="all">全部</option>
            <option value="1">层级 1</option>
            <option value="2">层级 2</option>
            <option value="3">层级 3</option>
            <option value="4">层级 4+</option>
          </select>
        </div>

        <div className="result-count">{getFilteredNodes().length} / {subEvents.length} 个子事件</div>
      </div>

      {/* 内容区 */}
      <div className="content-area">
        {layout === 'tree' && renderTree()}
        {layout === 'breadcrumb' && renderBreadcrumb()}
        {layout === 'graph' && renderGraph()}
      </div>

      <style>{`
        .tree-navigation-view {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary, white);
        }

        /* 工具栏 */
        .toolbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 24px;
          background: var(--bg-secondary, #f5f5f5);
          border-bottom: 1px solid var(--border-color, #e0e0e0);
          flex-wrap: wrap;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 200px;
          max-width: 400px;
          padding: 8px 16px;
          background: white;
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 8px;
        }

        .search-icon {
          font-size: 16px;
        }

        .search-box input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 14px;
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .filter-group select {
          padding: 6px 12px;
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
        }

        .result-count {
          font-size: 13px;
          color: var(--text-secondary, #888);
          margin-left: auto;
        }

        /* 内容区 */
        .content-area {
          flex: 1;
          overflow: auto;
          padding: 24px;
        }

        /* 树形布局 */
        .tree-container {
          background: white;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 12px;
          overflow: hidden;
        }

        .tree-toolbar {
          display: flex;
          gap: 8px;
          padding: 12px;
          background: var(--bg-secondary, #f5f5f5);
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }

        .toolbar-btn {
          padding: 6px 12px;
          background: white;
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .toolbar-btn:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .tree-list {
          padding: 8px 0;
        }

        .tree-node-wrapper {
          margin-bottom: 2px;
        }

        .tree-node {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .tree-node:hover {
          background: var(--bg-hover, #f8f8f8);
        }

        .expand-button {
          width: 20px;
          height: 20px;
          background: none;
          border: none;
          font-size: 10px;
          cursor: pointer;
          color: var(--text-secondary, #888);
          flex-shrink: 0;
        }

        .expand-spacer {
          width: 20px;
          flex-shrink: 0;
        }

        .node-icon {
          font-size: 20px;
          flex-shrink: 0;
        }

        .node-title {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.2s ease;
        }

        .node-title:hover {
          color: var(--primary-color, #007bff);
          text-decoration: underline;
        }

        .level-badge {
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          color: white;
          flex-shrink: 0;
        }

        .node-actions {
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .tree-node:hover .node-actions {
          opacity: 1;
        }

        .action-btn {
          padding: 4px 8px;
          background: none;
          border: none;
          font-size: 14px;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.2s ease;
        }

        .action-btn:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .action-btn.delete:hover {
          background: #fee;
        }

        .tree-children {
          border-left: 2px solid var(--border-color, #e0e0e0);
          margin-left: 24px;
        }

        /* 面包屑布局 */
        .breadcrumb-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .breadcrumb-level {
          background: white;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 12px;
          padding: 16px;
        }

        .breadcrumb-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 2px solid var(--border-color, #e0e0e0);
        }

        .breadcrumb-label {
          font-size: 16px;
          font-weight: 600;
        }

        .breadcrumb-count {
          font-size: 12px;
          color: var(--text-secondary, #888);
        }

        .breadcrumb-items {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .breadcrumb-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--bg-secondary, #f5f5f5);
          border-left: 3px solid;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .breadcrumb-item:hover {
          background: var(--bg-hover, #e0e0e0);
          transform: translateX(4px);
        }

        .breadcrumb-icon {
          font-size: 18px;
        }

        .breadcrumb-title {
          font-size: 13px;
          font-weight: 500;
        }

        .breadcrumb-delete {
          background: none;
          border: none;
          font-size: 12px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .breadcrumb-item:hover .breadcrumb-delete {
          opacity: 1;
        }

        /* 图谱布局 */
        .graph-container {
          background: white;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 12px;
          padding: 24px;
        }

        .graph-note {
          padding: 16px;
          background: #e3f2fd;
          border-left: 3px solid #2196f3;
          border-radius: 8px;
          margin-bottom: 24px;
          font-size: 13px;
          color: #1565c0;
        }

        .graph-note p {
          margin: 4px 0;
        }

        .graph-nodes {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 16px;
        }

        .graph-node {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: var(--bg-secondary, #f5f5f5);
          border-left: 4px solid;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .graph-node:hover {
          background: var(--bg-hover, #e0e0e0);
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }

        .graph-icon {
          font-size: 32px;
          flex-shrink: 0;
        }

        .graph-info {
          flex: 1;
        }

        .graph-title {
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .graph-meta {
          font-size: 12px;
          color: var(--text-secondary, #888);
        }

        .graph-delete {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          font-size: 14px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .graph-node:hover .graph-delete {
          opacity: 1;
        }

        /* 空状态 */
        .tree-nav-empty,
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
          color: var(--text-secondary, #888);
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        @media (max-width: 768px) {
          .toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .search-box {
            max-width: none;
          }

          .graph-nodes {
            grid-template-columns: 1fr;
          }

          .breadcrumb-items {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default TreeNavigationView;
