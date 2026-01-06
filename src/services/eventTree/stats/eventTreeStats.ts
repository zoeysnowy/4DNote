import { logger } from '@frontend/utils/logger';
import { storageManager } from '@backend/storage/StorageManager';
import type { EventTreeIndex } from '@backend/storage/types';

export interface EventTreeIndexStorage {
  getEventTreeIndexByParentEventId(parentEventId: string): Promise<EventTreeIndex[]>;
  bulkPutEventTreeIndex(statsList: EventTreeIndex[]): Promise<void>;
}

/**
 * ADR-001: When an event is reparented, the whole subtree's `rootEventId` must be updated.
 *
 * This update must be done WITHOUT scanning the full events table:
 * - Only use `event_tree.parentEventId` index to fetch children level by level (BFS)
 * - Batch write via `bulkPutEventTreeIndex`
 */
export async function updateSubtreeRootEventIdUsingTreeIndex(
  subtreeRootId: string,
  newRootEventId: string,
  deps?: {
    storage?: EventTreeIndexStorage;
    log?: (message: string, data?: any) => void;
  }
): Promise<{ updatedCount: number }>
{
  const storage = deps?.storage ?? (storageManager as unknown as EventTreeIndexStorage);
  const log = deps?.log ?? logger.module('EventTreeIndex').log;

  const visited = new Set<string>();
  const queue: string[] = [subtreeRootId];
  const updates: EventTreeIndex[] = [];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (visited.has(parentId)) continue;
    visited.add(parentId);

    const children = await storage.getEventTreeIndexByParentEventId(parentId);
    for (const childStats of children) {
      if (childStats.rootEventId !== newRootEventId) {
        updates.push({ ...childStats, rootEventId: newRootEventId });
      }
      queue.push(childStats.id);
    }
  }

  if (updates.length > 0) {
    await storage.bulkPutEventTreeIndex(updates);
    log('🌳 Updated subtree rootEventId via tree index', {
      subtreeRootId: subtreeRootId.slice(-8),
      newRootEventId: newRootEventId.slice(-8),
      updatedCount: updates.length,
    });
  }

  return { updatedCount: updates.length };
}
