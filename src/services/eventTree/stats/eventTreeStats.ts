import { logger } from '../../../utils/logger';
import { storageManager } from '../../storage/StorageManager';
import type { EventStats } from '../../storage/types';

export interface EventStatsIndexStorage {
  getEventStatsByParentEventId(parentEventId: string): Promise<EventStats[]>;
  bulkPutEventStats(statsList: EventStats[]): Promise<void>;
}

/**
 * ADR-001: When an event is reparented, the whole subtree's `rootEventId` must be updated.
 *
 * This update must be done WITHOUT scanning the full events table:
 * - Only use `event_stats.parentEventId` index to fetch children level by level (BFS)
 * - Batch write via `bulkPutEventStats`
 */
export async function updateSubtreeRootEventIdUsingStatsIndex(
  subtreeRootId: string,
  newRootEventId: string,
  deps?: {
    storage?: EventStatsIndexStorage;
    log?: (message: string, data?: any) => void;
  }
): Promise<{ updatedCount: number }>
{
  const storage = deps?.storage ?? (storageManager as unknown as EventStatsIndexStorage);
  const log = deps?.log ?? logger.module('EventTreeStats').log;

  const visited = new Set<string>();
  const queue: string[] = [subtreeRootId];
  const updates: EventStats[] = [];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (visited.has(parentId)) continue;
    visited.add(parentId);

    const children = await storage.getEventStatsByParentEventId(parentId);
    for (const childStats of children) {
      if (childStats.rootEventId !== newRootEventId) {
        updates.push({ ...childStats, rootEventId: newRootEventId });
      }
      queue.push(childStats.id);
    }
  }

  if (updates.length > 0) {
    await storage.bulkPutEventStats(updates);
    log('🌳 Updated subtree rootEventId via stats index', {
      subtreeRootId: subtreeRootId.slice(-8),
      newRootEventId: newRootEventId.slice(-8),
      updatedCount: updates.length,
    });
  }

  return { updatedCount: updates.length };
}
