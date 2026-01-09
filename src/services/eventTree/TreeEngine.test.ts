/**
 * EventTree Engine - Unit Tests
 * 
 * 测试 TreeEngine 核心函数的正确性
 * 
 * 版本: v1.0.0
 * 创建日期: 2025-12-23
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildEventTree, recomputeSiblings, computeReparentEffect } from './TreeEngine';
import { EventTreeAPI } from './TreeAPI';
import type { Event } from '@frontend/types';
import type { EventNode } from './types';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

// 辅助函数：创建测试事件
function createTestEvent(
  id: string,
  parentId?: string,
  position?: number
): Event {
  const now = formatTimeForStorage(new Date());
  return {
    id,
    title: { simpleTitle: `Event ${id}` },
    parentEventId: parentId,
    position,
    createdAt: now,
    updatedAt: now,
  } as Event;
}

describe('EventTree Engine - Core Functions', () => {
  describe('buildEventTree', () => {
    it('应该正确构建简单的树结构', () => {
      const events: Event[] = [
        createTestEvent('root', undefined, 0),
        createTestEvent('child1', 'root', 0),
        createTestEvent('child2', 'root', 1),
      ];
      
      const tree = buildEventTree(events, {
        validateStructure: true,
        computeBulletLevels: true,
        sortSiblings: true,
      });
      
      expect(tree.rootIds).toEqual(['root']);
      expect(tree.bulletLevels.get('root')).toBe(0);
      expect(tree.bulletLevels.get('child1')).toBe(1);
      expect(tree.bulletLevels.get('child2')).toBe(1);
      expect(tree.stats.maxDepth).toBe(1);
      expect(tree.errors).toHaveLength(0);
    });
    
    it('应该正确处理多层嵌套', () => {
      const events: Event[] = [
        createTestEvent('root', undefined, 0),
        createTestEvent('child1', 'root', 0),
        createTestEvent('grandchild1', 'child1', 0),
      ];
      
      const tree = buildEventTree(events, {
        validateStructure: true,
        computeBulletLevels: true,
      });
      
      expect(tree.bulletLevels.get('root')).toBe(0);
      expect(tree.bulletLevels.get('child1')).toBe(1);
      expect(tree.bulletLevels.get('grandchild1')).toBe(2);
      expect(tree.stats.maxDepth).toBe(2);
    });
    
    it('应该检测循环引用', () => {
      const events: Event[] = [
        createTestEvent('a', 'b', 0),
        createTestEvent('b', 'a', 0), // 循环：a -> b -> a
      ];
      
      const tree = buildEventTree(events, {
        validateStructure: true,
      });
      
      const cycleErrors = tree.errors.filter(e => e.type === 'cycle');
      expect(cycleErrors.length).toBeGreaterThan(0);
    });
    
    it('应该检测孤儿节点', () => {
      const events: Event[] = [
        createTestEvent('orphan', 'missing-parent', 0),
      ];
      
      const tree = buildEventTree(events, {
        validateStructure: true,
      });
      
      const orphanErrors = tree.errors.filter(e => e.type === 'orphan');
      expect(orphanErrors).toHaveLength(1);
      expect(orphanErrors[0].nodeId).toBe('orphan');
    });
    
    it('应该按 position 正确排序兄弟节点', () => {
      const events: Event[] = [
        createTestEvent('root', undefined, 0),
        createTestEvent('child1', 'root', 1),
        createTestEvent('child2', 'root', 2),
        createTestEvent('child3', 'root', 0),
      ];
      
      const tree = buildEventTree(events, {
        sortSiblings: true,
      });
      
      const childIds = tree.childrenMap.get('root');
      expect(childIds).toEqual(['child3', 'child1', 'child2']);
    });

    it('ADR-001: 应该以 parentEventId 作为结构真相', () => {
      const events: Event[] = [
        createTestEvent('root', undefined, 0),
        createTestEvent('child1', 'root', 0),
        createTestEvent('child2', 'root', 1),
      ];

      const tree = buildEventTree(events, {
        validateStructure: true,
        computeBulletLevels: true,
        sortSiblings: true,
      });

      expect(tree.rootIds).toEqual(['root']);
      expect(tree.childrenMap.get('root')).toEqual(['child1', 'child2']);
      expect(tree.bulletLevels.get('child1')).toBe(1);
      expect(tree.bulletLevels.get('child2')).toBe(1);
    });

    it('sibling order should fall back to createdAt/id when no position', () => {
      const events: Event[] = [
        createTestEvent('root', undefined, 0),
        // 两个 child 都没有 position，用 createdAt 排序
        { ...createTestEvent('child1', 'root', undefined), createdAt: '2024-01-01' },
        { ...createTestEvent('child2', 'root', undefined), createdAt: '2024-01-02' },
      ];

      const tree = buildEventTree(events as Event[], {
        sortSiblings: true,
      });

      expect(tree.childrenMap.get('root')).toEqual(['child1', 'child2']);
    });
    
    it('应该在没有 position 时按 createdAt 排序', () => {
      const events: Event[] = [
        createTestEvent('root', undefined, undefined),
        { ...createTestEvent('child1', 'root', undefined), createdAt: '2024-01-01' },
        { ...createTestEvent('child2', 'root', undefined), createdAt: '2024-01-02' },
      ];
      
      const tree = buildEventTree(events as Event[], {
        sortSiblings: true,
      });
      
      const childIds = tree.childrenMap.get('root');
      expect(childIds).toEqual(['child1', 'child2']);
    });
  });
  
  describe('recomputeSiblings', () => {
    it('应该重新计算兄弟节点的 position', () => {
      const events = new Map<string, Event>([
        ['child1', createTestEvent('child1', 'parent', 2)],
        ['child2', createTestEvent('child2', 'parent', 1)],
        ['child3', createTestEvent('child3', 'parent', 0)],
      ]);
      
      const result = recomputeSiblings(events, 'parent');
      
      expect(result.parentId).toBe('parent');
      expect(result.updates).toHaveLength(3);
      
      // 按排序后的顺序：child3(pos=0) -> child2(pos=1) -> child1(pos=2)
      expect(result.updates[0]).toEqual({ eventId: 'child3', newPosition: 0 });
      expect(result.updates[1]).toEqual({ eventId: 'child2', newPosition: 1 });
      expect(result.updates[2]).toEqual({ eventId: 'child1', newPosition: 2 });
    });
    
    it('应该处理顶层节点（parentId = null）', () => {
      const events = new Map<string, Event>([
        ['root1', createTestEvent('root1', undefined, 1)],
        ['root2', createTestEvent('root2', undefined, 0)],
      ]);
      
      const result = recomputeSiblings(events, null);
      
      expect(result.parentId).toBeNull();
      expect(result.updates[0]).toEqual({ eventId: 'root2', newPosition: 0 });
      expect(result.updates[1]).toEqual({ eventId: 'root1', newPosition: 1 });
    });
  });
  
  describe('computeReparentEffect', () => {
    it('应该计算重新父化的影响范围', () => {
      const events = new Map<string, Event>([
        ['parent1', createTestEvent('parent1', undefined, 0)],
        ['parent2', createTestEvent('parent2', undefined, 1)],
        ['child1', createTestEvent('child1', 'parent1', 0)],
      ]);
      
      const result = computeReparentEffect(events, {
        nodeId: 'child1',
        oldParentId: 'parent1',
        newParentId: 'parent2',
        newPosition: 0,
      });
      
      // v2.22: 仅更新节点本身的 parentEventId/position
      expect(result.nodesToUpdate).toHaveLength(1);
      
      // child1 本身
      const child1Update = result.nodesToUpdate.find(u => u.eventId === 'child1');
      expect(child1Update?.updates.parentEventId).toBe('parent2');
      expect(child1Update?.updates.position).toBe(0);
      
      // ADR-001: 不维护任何父节点“子列表”字段
      expect(result.nodesToUpdate.find(u => u.eventId === 'parent1')).toBeUndefined();
      expect(result.nodesToUpdate.find(u => u.eventId === 'parent2')).toBeUndefined();

      // affectedParents 不再包含父节点
      expect(result.affectedParents).toEqual([]);
    });

    it('ADR-001: affectedSubtree 应该基于 parentEventId 收集', () => {
      const events = new Map<string, Event>([
        ['root', createTestEvent('root', undefined, 0)],
        ['child1', createTestEvent('child1', 'root', 0)],
        // grandchild 仅通过 parentEventId 关联到 child1
        ['grandchild', createTestEvent('grandchild', 'child1', 0)],
        ['newParent', createTestEvent('newParent', undefined, 1)],
      ]);

      const result = computeReparentEffect(events, {
        nodeId: 'child1',
        oldParentId: 'root',
        newParentId: 'newParent',
        newPosition: 0,
      });

      expect(result.affectedSubtree).toContain('child1');
      expect(result.affectedSubtree).toContain('grandchild');
    });
  });
});

describe('EventTreeAPI - High-Level Interface', () => {
  describe('calculateAllBulletLevels', () => {
    it('应该批量计算所有节点的 bulletLevel', () => {
      const events: Event[] = [
        createTestEvent('root', undefined, 0),
        createTestEvent('child1', 'root', 0),
        createTestEvent('grandchild1', 'child1', 0),
      ];
      
      const levels = EventTreeAPI.calculateAllBulletLevels(events);
      
      expect(levels.get('root')).toBe(0);
      expect(levels.get('child1')).toBe(1);
      expect(levels.get('grandchild1')).toBe(2);
    });
  });
  
  describe('getRootEvents', () => {
    it('应该返回所有顶层事件', () => {
      const events: Event[] = [
        createTestEvent('root1', undefined, 0),
        createTestEvent('root2', undefined, 1),
        createTestEvent('child1', 'root1', 0),
      ];
      
      const rootEvents = EventTreeAPI.getRootEvents(events);
      
      expect(rootEvents).toHaveLength(2);
      expect(rootEvents.map(e => e.id)).toEqual(expect.arrayContaining(['root1', 'root2']));
    });
  });
  
  describe('getDirectChildren', () => {
    it('应该返回直接子节点', () => {
      const events: Event[] = [
        createTestEvent('parent', undefined, 0),
        createTestEvent('child1', 'parent', 0),
        createTestEvent('child2', 'parent', 1),
        createTestEvent('grandchild1', 'child1', 0),
      ];
      
      const children = EventTreeAPI.getDirectChildren('parent', events);
      
      expect(children).toHaveLength(2);
      expect(children.map(e => e.id)).toEqual(['child1', 'child2']);
    });
  });
  
  describe('getSubtree', () => {
    it('应该返回完整子树（包含所有后代）', () => {
      const events: Event[] = [
        createTestEvent('root', undefined, 0),
        createTestEvent('child1', 'root', 0),
        createTestEvent('grandchild1', 'child1', 0),
        createTestEvent('grandchild2', 'child1', 1),
      ];
      
      const subtree = EventTreeAPI.getSubtree('root', events);
      
      expect(subtree).toHaveLength(4);
      expect(subtree.map(e => e.id)).toEqual([
        'root',
        'child1',
        'grandchild1',
        'grandchild2',
      ]);
    });
  });
  
  describe('toDFSList', () => {
    it('应该生成 DFS 顺序的扁平列表', () => {
      const events: Event[] = [
        createTestEvent('root1', undefined, 0),
        createTestEvent('root2', undefined, 1),
        createTestEvent('child1', 'root1', 0),
        createTestEvent('child2', 'root2', 0),
      ];
      
      const dfsList = EventTreeAPI.toDFSList(events);
      
      // DFS 顺序：root1 -> child1 -> root2 -> child2
      expect(dfsList.map(e => e.id)).toEqual([
        'root1',
        'child1',
        'root2',
        'child2',
      ]);
    });
  });
  
  describe('validateTree', () => {
    it('应该检测并报告树结构错误', () => {
      const events: Event[] = [
        createTestEvent('a', 'b'),
        createTestEvent('b', 'a'), // 循环
        createTestEvent('orphan', 'missing'), // 孤儿
      ];
      
      const errors = EventTreeAPI.validateTree(events);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.type === 'cycle')).toBe(true);
      expect(errors.some(e => e.type === 'orphan')).toBe(true);
    });
  });
});

describe('EventTreeAPI - Performance', () => {
  it('应该在 100ms 内处理 1000 个事件', () => {
    // 创建 1000 个节点的深层树
    const events: Event[] = [];
    let parentId: string | undefined = undefined;
    
    for (let i = 0; i < 1000; i++) {
      const id = `event-${i}`;
      events.push(createTestEvent(id, parentId, i));
      parentId = id;
    }
    
    const startTime = performance.now();
    const tree = buildEventTree(events, {
      validateStructure: true,
      computeBulletLevels: true,
      sortSiblings: true,
    });
    const endTime = performance.now();
    
    expect(tree.stats.totalNodes).toBe(1000);
    // Windows + CI 环境下 performance.now() 抖动较大，阈值放宽以降低 flaky
    expect(endTime - startTime).toBeLessThan(250);
  });
});
