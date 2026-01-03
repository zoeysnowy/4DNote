/**
 * EventTree API - High-Level Interface
 * 
 * EventService 的树形管理高阶接口
 * 
 * 设计原则：
 * - ✅ 封装 TreeEngine 纯函数
 * - ✅ 集成 EventService 持久化
 * - ✅ 提供事务性更新（原子操作）
 * - ✅ 自动维护双向关联
 * 
 * 版本: v1.0.0
 * 创建日期: 2025-12-23
 */

import type { Event } from '../../types';
import {
  buildEventTree,
  recomputeSiblings,
  computeReparentEffect,
  calculateBulletLevelsBatch,
} from './TreeEngine';
import type {
  EventTreeResult,
  ReparentInput,
  TreeBuildOptions,
} from './types';

/**
 * EventTree API 类
 * 
 * 作为 EventService 的子模块使用
 */
export class EventTreeAPI {
  /**
   * 构建完整的事件树
   * 
   * @param events - 事件列表
   * @param options - 构建选项
   * @returns 树结构结果
   */
  static buildTree(
    events: Event[],
    options?: TreeBuildOptions
  ): EventTreeResult {
    return buildEventTree(events, options);
  }
  
  /**
   * 计算所有事件的 bulletLevel
   * 
   * @param events - 事件列表
   * @returns ID -> bulletLevel 映射
   */
  static calculateAllBulletLevels(events: Event[]): Map<string, number> {
    const tree = buildEventTree(events, {
      validateStructure: false, // 跳过验证加速
      computeBulletLevels: true,
      sortSiblings: false,
    });
    
    return tree.bulletLevels;
  }
  
  /**
   * 计算单个事件的 bulletLevel
   * 
   * @param eventId - 事件 ID
   * @param events - 事件列表（需要包含所有父节点）
   * @returns bulletLevel（0 = 顶层）
   */
  static calculateBulletLevel(
    eventId: string,
    events: Event[]
  ): number {
    const tree = buildEventTree(events, {
      validateStructure: false,
      computeBulletLevels: true,
      sortSiblings: false,
    });
    
    return tree.bulletLevels.get(eventId) || 0;
  }
  
  /**
   * 获取子事件列表（仅直接子节点）
   * 
   * @param parentId - 父节点 ID
   * @param events - 事件列表
   * @returns 子事件列表（已排序）
   */
  static getDirectChildren(
    parentId: string,
    events: Event[]
  ): Event[] {
    const tree = buildEventTree(events, {
      validateStructure: false,
      computeBulletLevels: false,
      sortSiblings: true,
    });
    
    const childIds = tree.childrenMap.get(parentId) || [];
    return childIds
      .map(id => tree.nodesById.get(id)?._fullEvent)
      .filter((e): e is Event => !!e);
  }
  
  /**
   * 获取完整子树（包含所有后代）
   * 
   * @param rootId - 根节点 ID
   * @param events - 事件列表
   * @returns 子树事件列表（DFS 顺序）
   */
  static getSubtree(
    rootId: string,
    events: Event[]
  ): Event[] {
    const tree = buildEventTree(events, {
      validateStructure: false,
      computeBulletLevels: false,
      sortSiblings: true,
    });
    
    const result: Event[] = [];
    const visited = new Set<string>();
    
    const dfs = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = tree.nodesById.get(nodeId);
      if (!node) return;
      
      if (node._fullEvent) {
        result.push(node._fullEvent);
      }
      
      const childIds = tree.childrenMap.get(nodeId) || [];
      for (const childId of childIds) {
        dfs(childId);
      }
    };
    
    dfs(rootId);
    return result;
  }
  
  /**
   * 获取顶层事件（无父节点的事件）
   * 
   * @param events - 事件列表
   * @returns 顶层事件列表（已排序）
   */
  static getRootEvents(events: Event[]): Event[] {
    const tree = buildEventTree(events, {
      validateStructure: false,
      computeBulletLevels: false,
      sortSiblings: true,
    });
    
    return tree.rootIds
      .map(id => tree.nodesById.get(id)?._fullEvent)
      .filter((e): e is Event => !!e);
  }
  
  /**
   * 验证树结构（检测环、孤儿节点等）
   * 
   * @param events - 事件列表
   * @returns 验证错误列表（空数组 = 无错误）
   */
  static validateTree(events: Event[]) {
    const tree = buildEventTree(events, {
      validateStructure: true,
      computeBulletLevels: false,
      sortSiblings: false,
    });
    
    return tree.errors;
  }
  
  /**
   * 获取事件的根节点（向上追溯到顶层）
   * 
   * @param eventId - 事件 ID
   * @param events - 事件列表
   * @returns 根节点事件（null = 未找到）
   */
  static getRootEvent(
    eventId: string,
    events: Event[]
  ): Event | null {
    const eventsById = new Map(events.map(e => [e.id, e]));
    
    let current = eventsById.get(eventId);
    if (!current) return null;
    
    // 防止环（最多向上100层）
    let depth = 0;
    const maxDepth = 100;
    
    while (current.parentEventId && depth < maxDepth) {
      const parent = eventsById.get(current.parentEventId);
      if (!parent) break;
      current = parent;
      depth++;
    }
    
    return current;
  }
  
  /**
   * 生成 DFS 排序的扁平列表
   * 
   * 用于 PlanManager 渲染
   * 
   * @param events - 事件列表
   * @returns DFS 顺序的事件列表
   */
  static toDFSList(events: Event[]): Event[] {
    const tree = buildEventTree(events, {
      validateStructure: false,
      computeBulletLevels: true,
      sortSiblings: true,
    });
    
    return tree.nodes
      .map(node => node._fullEvent)
      .filter((e): e is Event => !!e);
  }
  
  /**
   * 重新父化操作（移动节点到新父节点下）
   * 
   * 生成需要更新的数据库操作列表
   * 
   * @param input - 重新父化输入
   * @param events - 事件列表
   * @returns 需要更新的事件和受影响范围
   * 
   * @example
   * ```typescript
   * // Tab 键：nodeId 移动到 newParentId 下
   * const updates = EventTreeAPI.reparent({
   *   nodeId: 'event_abc',
   *   oldParentId: null,
   *   newParentId: 'event_xyz',
   *   newPosition: 0,
   * }, allEvents);
   * 
   * // 批量更新数据库
   * for (const { eventId, updates } of updates.nodesToUpdate) {
   *   await EventService.updateEvent(eventId, updates);
   * }
   * 
   * // 重新计算受影响节点的 bulletLevel
   * const newLevels = EventTreeAPI.calculateBulletLevelsBatch(
   *   updates.affectedSubtree,
   *   allEvents
   * );
   * ```
   */
  static reparent(
    input: ReparentInput,
    events: Event[]
  ) {
    const eventsById = new Map(events.map(e => [e.id, e]));
    return computeReparentEffect(eventsById, input);
  }
  
  /**
   * 重新排序兄弟节点
   * 
   * 生成需要更新 position 的操作列表
   * 
   * @param parentId - 父节点 ID（null = 顶层）
   * @param events - 事件列表
   * @returns position 更新列表
   * 
   * @example
   * ```typescript
   * // 重新排序某个父节点下的所有子节点
   * const updates = EventTreeAPI.resortSiblings('event_parent', allEvents);
   * 
   * // 批量更新 position
   * for (const { eventId, newPosition } of updates.updates) {
   *   await EventService.updateEvent(eventId, { position: newPosition });
   * }
   * ```
   */
  static resortSiblings(
    parentId: string | null,
    events: Event[]
  ) {
    const eventsById = new Map(events.map(e => [e.id, e]));
    return recomputeSiblings(eventsById, parentId);
  }
  
  /**
   * 批量计算 bulletLevel
   * 
   * 优化版本：共享访问缓存
   * 
   * @param eventIds - 事件 ID 列表
   * @param events - 事件列表
   * @returns ID -> bulletLevel 映射
   */
  static calculateBulletLevelsBatch(
    eventIds: string[],
    events: Event[]
  ): Map<string, number> {
    const tree = buildEventTree(events, {
      validateStructure: false,
      computeBulletLevels: true,
      sortSiblings: false,
    });
    
    const result = new Map<string, number>();
    for (const eventId of eventIds) {
      const level = tree.bulletLevels.get(eventId);
      if (level !== undefined) {
        result.set(eventId, level);
      }
    }
    
    return result;
  }
  
  /**
   * 获取树的统计信息
   * 
   * @param events - 事件列表
   * @returns 统计信息
   */
  static getTreeStats(events: Event[]) {
    const tree = buildEventTree(events, {
      validateStructure: true,
      computeBulletLevels: true,
      sortSiblings: false,
    });
    
    return {
      totalNodes: tree.stats.totalNodes,
      rootCount: tree.rootIds.length,
      maxDepth: tree.stats.maxDepth,
      errorCount: tree.errors.length,
      computeTime: tree.stats.computeTime,
      errors: tree.errors,
    };
  }
}
