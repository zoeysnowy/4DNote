/**
 * EventTree Engine - Core Pure Functions
 * 
 * 纯函数树逻辑：层级计算、树遍历、排序
 * 
 * 设计原则：
 * - ✅ 纯函数：无副作用，可测试
 * - ✅ 不依赖 React：可在 Node.js 环境运行
 * - ✅ 不依赖 EventService：接收 Event[] 参数
 * - ✅ 高性能：O(n) 复杂度，单次遍历
 * 
 * 版本: v1.0.0
 * 创建日期: 2025-12-23
 */

import type { Event } from '../../types';
import type {
  EventNode,
  EventTreeResult,
  TreeValidationError,
  SiblingOrderUpdate,
  ReparentInput,
  ReparentUpdateResult,
  TreeTraverseOptions,
  BulletLevelOptions,
  TreeBuildOptions,
} from './types';

/**
 * 从事件列表构建完整树结构
 * 
 * 核心函数：一次性计算所有树信息
 * 
 * @param events - 事件列表（可以是完整 Event 或轻量 EventNode）
 * @param options - 构建选项
 * @returns 完整的树结构结果
 * 
 * @example
 * ```typescript
 * const events = await EventService.getAllEvents();
 * const tree = buildEventTree(events, {
 *   validateStructure: true,
 *   computeBulletLevels: true,
 *   sortSiblings: true,
 * });
 * 
 * // 使用结果
 * const topLevelEvents = tree.rootIds.map(id => tree.nodesById.get(id));
 * const bulletLevel = tree.bulletLevels.get(eventId);
 * ```
 */
export function buildEventTree(
  events: (Event | EventNode)[],
  options: TreeBuildOptions = {}
): EventTreeResult {
  const startTime = performance.now();
  
  const {
    validateStructure = true,
    computeBulletLevels = true,
    sortSiblings = true,
    includeOrphans = false,
  } = options;
  
  // Step 1: 构建节点映射
  const nodesById = new Map<string, EventNode>();
  const childrenMap = new Map<string, string[]>();
  
  for (const event of events) {
    const node: EventNode = {
      id: event.id,
      parentEventId: event.parentEventId,
      position: event.position,
      createdAt: event.createdAt,
      _fullEvent: 'title' in event ? (event as Event) : undefined,
    };
    nodesById.set(node.id, node);
  }
  
  // Step 2: 识别顶层节点 + 构建子节点映射
  // ADR-001: 结构真相来自 parentEventId
  const rootIds: string[] = [];

  for (const node of nodesById.values()) {
    const parentId = node.parentEventId;

    // 顶层节点：无 parent 或 parent 不存在（孤儿节点会在 validate 阶段报告）
    if (!parentId || !nodesById.has(parentId)) {
      rootIds.push(node.id);
      continue;
    }

    // parentEventId -> childrenMap
    const list = childrenMap.get(parentId) || [];
    list.push(node.id);
    childrenMap.set(parentId, list);
  }
  
  // Step 3: 排序兄弟节点
  if (sortSiblings) {
    // 顶层节点排序
    rootIds.sort((a, b) => compareSiblings(nodesById.get(a)!, nodesById.get(b)!));
    
    // 子节点排序
    for (const [parentId, childIds] of childrenMap.entries()) {
      childIds.sort((a, b) => {
        const nodeA = nodesById.get(a);
        const nodeB = nodesById.get(b);
        if (!nodeA || !nodeB) return 0;

        // position 优先
        if (nodeA.position !== undefined && nodeB.position !== undefined) {
          return nodeA.position - nodeB.position;
        }
        if (nodeA.position !== undefined) return -1;
        if (nodeB.position !== undefined) return 1;

        // fallback：createdAt / id
        return compareSiblings(nodeA, nodeB);
      });
    }
  }
  
  // Step 4: 验证树结构
  const errors: TreeValidationError[] = [];
  
  if (validateStructure) {
    errors.push(...detectCycles(nodesById));
    errors.push(...detectOrphans(nodesById, childrenMap));
  }
  
  // Step 5: 计算 bulletLevel
  const bulletLevels = new Map<string, number>();
  let maxDepth = 0;
  
  if (computeBulletLevels) {
    const visited = new Set<string>();
    
    for (const nodeId of nodesById.keys()) {
      const level = calculateBulletLevelInternal(nodeId, nodesById, visited);
      bulletLevels.set(nodeId, level);
      maxDepth = Math.max(maxDepth, level);
    }
  }
  
  // Step 6: DFS 遍历生成排序列表
  const nodes: EventNode[] = [];
  const visited = new Set<string>();
  
  const dfsTraverse = (nodeId: string, level: number) => {
    if (visited.has(nodeId)) return; // 防止环
    visited.add(nodeId);
    
    const node = nodesById.get(nodeId);
    if (!node) return;
    
    // 设置层级和顺序
    node.bulletLevel = level;
    node.order = nodes.length;
    nodes.push(node);
    
    // 递归遍历子节点
    const childIds = childrenMap.get(nodeId) || [];
    for (const childId of childIds) {
      dfsTraverse(childId, level + 1);
    }
  };
  
  // 从顶层节点开始遍历
  for (const rootId of rootIds) {
    dfsTraverse(rootId, 0);
  }
  
  // Step 7: 处理孤儿节点
  if (includeOrphans) {
    for (const nodeId of nodesById.keys()) {
      if (!visited.has(nodeId)) {
        const level = bulletLevels.get(nodeId) || 0;
        dfsTraverse(nodeId, level);
      }
    }
  }
  
  const computeTime = performance.now() - startTime;
  
  return {
    nodes,
    nodesById,
    bulletLevels,
    rootIds,
    childrenMap,
    errors,
    stats: {
      totalNodes: nodes.length,
      maxDepth,
      computeTime,
    },
  };
}

/**
 * 计算单个节点的 bulletLevel
 * 
 * 递归计算节点深度（父节点层级 + 1）
 * 
 * @param nodeId - 节点 ID
 * @param nodesById - 节点映射
 * @param visited - 访问记录（防止环）
 * @returns 节点层级（0 = 顶层）
 */
function calculateBulletLevelInternal(
  nodeId: string,
  nodesById: Map<string, EventNode>,
  visited: Set<string> = new Set()
): number {
  // 防止环
  if (visited.has(nodeId)) {
    console.warn(`[TreeEngine] Cycle detected at node: ${nodeId}`);
    return 0;
  }
  
  const node = nodesById.get(nodeId);
  if (!node) return 0;
  
  // 顶层节点
  if (!node.parentEventId) return 0;
  
  // 父节点不存在
  const parent = nodesById.get(node.parentEventId);
  if (!parent) return 0;
  
  visited.add(nodeId);
  const parentLevel = calculateBulletLevelInternal(node.parentEventId, nodesById, visited);
  visited.delete(nodeId);
  
  return parentLevel + 1;
}

/**
 * 比较兄弟节点排序
 * 
 * 优先级：position > createdAt
 */
function compareSiblings(a: EventNode, b: EventNode): number {
  // 优先使用 position
  if (a.position !== undefined && b.position !== undefined) {
    return a.position - b.position;
  }
  
  // position 只有一个有值，有值的在前
  if (a.position !== undefined) return -1;
  if (b.position !== undefined) return 1;
  
  // 都没有 position，使用 createdAt
  if (a.createdAt && b.createdAt) {
    return a.createdAt.localeCompare(b.createdAt);
  }
  
  // 兜底：ID 字典序
  return a.id.localeCompare(b.id);
}

/**
 * 检测环
 */
function detectCycles(nodesById: Map<string, EventNode>): TreeValidationError[] {
  const errors: TreeValidationError[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  
  const dfs = (nodeId: string, path: string[]): boolean => {
    if (visiting.has(nodeId)) {
      // 发现环
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart).concat(nodeId);
      errors.push({
        type: 'cycle',
        nodeId,
        message: `Cycle detected: ${cycle.join(' → ')}`,
        details: { cycle },
      });
      return true;
    }
    
    if (visited.has(nodeId)) return false;
    
    const node = nodesById.get(nodeId);
    if (!node || !node.parentEventId) return false;
    
    visiting.add(nodeId);
    path.push(nodeId);
    
    const hasCycle = dfs(node.parentEventId, path);
    
    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    
    return hasCycle;
  };
  
  for (const nodeId of nodesById.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, []);
    }
  }
  
  return errors;
}

/**
 * 检测孤儿节点
 * 
 * parentEventId 指向不存在的节点
 */
function detectOrphans(
  nodesById: Map<string, EventNode>,
  childrenMap: Map<string, string[]>
): TreeValidationError[] {
  const errors: TreeValidationError[] = [];
  
  for (const node of nodesById.values()) {
    if (node.parentEventId && !nodesById.has(node.parentEventId)) {
      errors.push({
        type: 'orphan',
        nodeId: node.id,
        message: `Parent not found: ${node.parentEventId}`,
        details: { parentId: node.parentEventId },
      });
    }
  }
  
  return errors;
}

/**
 * 重新计算某个 parent 下的兄弟节点顺序
 * 
 * 用于 Tab/Shift+Tab 后调整 position
 * 
 * @param eventsById - 事件映射
 * @param parentId - 父节点 ID（null = 顶层）
 * @returns 需要更新的 position
 */
export function recomputeSiblings(
  eventsById: Map<string, Event | EventNode>,
  parentId: string | null
): SiblingOrderUpdate {
  // 找到所有兄弟节点
  const siblings: EventNode[] = [];
  
  for (const event of eventsById.values()) {
    const eventParentId = event.parentEventId || null;
    if (eventParentId === parentId) {
      siblings.push(event as EventNode);
    }
  }
  
  // 排序
  siblings.sort(compareSiblings);
  
  // 生成新的 position
  const updates = siblings.map((sibling, index) => ({
    eventId: sibling.id,
    newPosition: index,
  }));
  
  return {
    parentId,
    updates,
  };
}

/**
 * 计算节点被重新父化后的影响范围
 * 
 * 用于 Tab/Shift+Tab 优化更新
 * 
 * @param eventsById - 事件映射
 * @param input - 重新父化操作输入
 * @returns 需要更新的节点和受影响范围
 */
export function computeReparentEffect(
  eventsById: Map<string, Event | EventNode>,
  input: ReparentInput
): ReparentUpdateResult {
  const { nodeId, oldParentId, newParentId, newPosition } = input;
  
  const nodesToUpdate: Array<{ eventId: string; updates: Partial<Event> }> = [];
  const affectedParents: string[] = [];
  const affectedSubtree: string[] = [nodeId];
  
  // 1. 更新节点本身的 parentEventId
  nodesToUpdate.push({
    eventId: nodeId,
    updates: {
      parentEventId: newParentId,
      position: newPosition,
    },
  });
  // ADR-001/v2.22+: 废弃自动维护 parent.childEventIds（不写、不保证一致性）。
  
  // 2. 计算受影响的子树（需要重新计算 bulletLevel）
  // ADR-001: 结构真相来自 parentEventId；不要依赖 childEventIds 遍历后代
  const childrenByParentId = new Map<string, string[]>();
  for (const event of eventsById.values()) {
    const parentId = event.parentEventId;
    if (!parentId) continue;
    const list = childrenByParentId.get(parentId) || [];
    list.push(event.id);
    childrenByParentId.set(parentId, list);
  }

  const visited = new Set<string>();
  const collectSubtree = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);

    const childIds = childrenByParentId.get(id) || [];
    for (const childId of childIds) {
      affectedSubtree.push(childId);
      collectSubtree(childId);
    }
  };

  collectSubtree(nodeId);
  
  return {
    nodesToUpdate,
    affectedParents: [...new Set(affectedParents)],
    affectedSubtree: [...new Set(affectedSubtree)],
  };
}

/**
 * 批量计算多个节点的 bulletLevel
 * 
 * 优化版本：共享 visited 缓存
 * 
 * @param nodeIds - 节点 ID 列表
 * @param nodesById - 节点映射
 * @returns ID -> bulletLevel 映射
 */
export function calculateBulletLevelsBatch(
  nodeIds: string[],
  nodesById: Map<string, EventNode>
): Map<string, number> {
  const result = new Map<string, number>();
  const visited = new Set<string>();
  
  for (const nodeId of nodeIds) {
    const level = calculateBulletLevelInternal(nodeId, nodesById, visited);
    result.set(nodeId, level);
  }
  
  return result;
}
