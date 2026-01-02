/**
 * EventTree Engine - Type Definitions
 * 
 * 纯函数树逻辑的类型定义，不依赖 React 或 DOM
 * 
 * 版本: v1.0.0
 * 创建日期: 2025-12-23
 */

import { Event } from '../../types';

/**
 * 事件节点（内存表示）
 * 
 * 用于树遍历和层级计算的轻量级节点结构
 */
export interface EventNode {
  id: string;
  parentEventId?: string;
  position?: number;
  createdAt?: string;
  
  // 计算字段（TreeEngine 生成）
  bulletLevel?: number;
  order?: number;
  
  // 原始事件引用（按需加载）
  _fullEvent?: Event;
}

/**
 * 树构建结果
 * 
 * 包含完整的树结构 + 元数据
 */
export interface EventTreeResult {
  // 核心数据
  nodes: EventNode[];                    // 按 DFS 顺序的扁平列表
  nodesById: Map<string, EventNode>;     // ID 索引
  
  // 层级信息
  bulletLevels: Map<string, number>;     // ID -> 层级映射
  
  // 拓扑信息
  rootIds: string[];                     // 顶层节点 ID 列表
  childrenMap: Map<string, string[]>;    // 父 ID -> 子 ID 列表
  
  // 错误检测
  errors: TreeValidationError[];         // 环、孤儿等问题
  
  // 性能指标
  stats: {
    totalNodes: number;
    maxDepth: number;
    computeTime: number;                 // 计算耗时（毫秒）
  };
}

/**
 * 树验证错误
 */
export interface TreeValidationError {
  type: 'cycle' | 'orphan' | 'invalid-parent' | 'duplicate-child';
  nodeId: string;
  message: string;
  details?: any;
}

/**
 * 兄弟节点顺序更新
 * 
 * 用于 Tab/Shift+Tab 后重新排序兄弟节点
 */
export interface SiblingOrderUpdate {
  parentId: string | null;               // null = 顶层节点
  updates: Array<{
    eventId: string;
    newPosition: number;
  }>;
}

/**
 * 重新父化（Reparent）操作输入
 */
export interface ReparentInput {
  nodeId: string;                        // 要移动的节点
  oldParentId?: string;                  // 旧父节点（null = 顶层）
  newParentId?: string;                  // 新父节点（null = 顶层）
  newPosition?: number;                  // 在新父节点下的位置
}

/**
 * 重新父化操作结果
 */
export interface ReparentUpdateResult {
  // 需要更新的节点
  nodesToUpdate: Array<{
    eventId: string;
    updates: Partial<Event>;
  }>;
  
  // 受影响的父节点（用于 UI 刷新/重排）
  affectedParents: string[];
  
  // 需要重新计算 bulletLevel 的节点范围
  affectedSubtree: string[];
}

/**
 * 树遍历选项
 */
export interface TreeTraverseOptions {
  order: 'dfs' | 'bfs';                  // 遍历顺序
  maxDepth?: number;                     // 最大深度限制
  filter?: (node: EventNode) => boolean; // 节点过滤器
  includeDeleted?: boolean;              // 是否包含软删除的节点
}

/**
 * 层级计算选项
 */
export interface BulletLevelOptions {
  detectCycles?: boolean;                // 是否检测环（默认 true）
  maxDepth?: number;                     // 最大层级限制（防止无限递归）
  cache?: Map<string, number>;           // 外部缓存（加速批量计算）
}

/**
 * 树构建选项
 */
export interface TreeBuildOptions {
  validateStructure?: boolean;           // 是否验证树结构（默认 true）
  computeBulletLevels?: boolean;         // 是否计算层级（默认 true）
  sortSiblings?: boolean;                // 是否排序兄弟节点（默认 true）
  includeOrphans?: boolean;              // 是否包含孤儿节点（默认 false）
}
