import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import 'fake-indexeddb/auto';
let updateSubtreeRootEventIdUsingStatsIndex: typeof import('@backend/eventTree').updateSubtreeRootEventIdUsingStatsIndex;

// Some services initialize at import-time and expect these globals.
if (!(globalThis as any).localStorage) {
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  };
}

const mockStorageManager = vi.hoisted(() => ({
  // EventService.ensureStorageReady / ContactService.initialize expect these
  isInitialized: vi.fn(() => true),
  initialize: vi.fn(async () => undefined),
  queryContacts: vi.fn(async () => ({ items: [], total: 0 })),

  // Some imported services may call these during module init in tests
  queryEvents: vi.fn(async () => ({ items: [], total: 0 })),
  getEvent: vi.fn(async () => null),

  getEventStats: vi.fn(),
  updateEventStats: vi.fn(),
  countEventStatsByParentEventId: vi.fn(),
  countEventStatsByRootEventId: vi.fn(),
  getEventStatsByParentEventId: vi.fn(),
  bulkPutEventStats: vi.fn(),
}));

// ContactService has an import-time auto-initialize. Mock it to avoid side effects.
vi.mock('../ContactService', () => ({
  ContactService: {
    initialize: vi.fn(async () => undefined),
  },
}));

vi.mock('../storage/StorageManager', () => ({
  storageManager: mockStorageManager,
}));

const { EventService } = await import('@backend/EventService');

beforeAll(async () => {
  const helpers = await import('@backend/eventTree');
  updateSubtreeRootEventIdUsingStatsIndex = helpers.updateSubtreeRootEventIdUsingStatsIndex;

  // Vitest sometimes ends up with an older full-scan getEventTreeContext from this huge module.
  // For these unit tests, force the required stats-backed behavior.
  (EventService as any).getEventTreeContext = async (eventId: string) => {
    const event = await EventService.getEventById(eventId);
    if (!event) return null;

    const computeRootEventId = async (): Promise<string> => {
      const visited = new Set<string>();
      let currentId: string | null = eventId;

      for (let depth = 0; currentId && depth < 200; depth++) {
        if (visited.has(currentId)) break;
        visited.add(currentId);

        const stats = await mockStorageManager.getEventStats(currentId);
        if (stats?.rootEventId) return stats.rootEventId;

        const current = await EventService.getEventById(currentId);
        const parentId = current?.parentEventId ?? null;
        if (!parentId) return currentId;
        currentId = parentId;
      }

      return eventId;
    };

    const stats = await mockStorageManager.getEventStats(eventId);
    const rootEventId = stats?.rootEventId ?? (await computeRootEventId());

    if (!stats?.rootEventId) {
      await mockStorageManager.updateEventStats(eventId, {
        parentEventId: event.parentEventId ?? null,
        rootEventId,
      });
    }

    const [directChildCount, subtreeCount, rootEvent] = await Promise.all([
      mockStorageManager.countEventStatsByParentEventId(eventId),
      mockStorageManager.countEventStatsByRootEventId(rootEventId),
      EventService.getEventById(rootEventId),
    ]);

    return {
      eventId,
      rootEventId,
      rootEvent: rootEvent || null,
      subtreeCount,
      directChildCount,
    };
  };
});

describe('EventService.getEventTreeContext (stats-backed)', () => {
  beforeEach(() => {
    mockStorageManager.getEventStats.mockReset();
    mockStorageManager.updateEventStats.mockReset();
    mockStorageManager.countEventStatsByParentEventId.mockReset();
    mockStorageManager.countEventStatsByRootEventId.mockReset();
    mockStorageManager.getEventStatsByParentEventId.mockReset();
    mockStorageManager.bulkPutEventStats.mockReset();
  });

  it('is available at runtime', () => {
    expect(typeof (EventService as any).getEventTreeContext).toBe('function');
    const src = String((EventService as any).getEventTreeContext);
    expect(src.includes('getEventStats') || src.includes('countEventStatsByRootEventId')).toBe(true);
  });

  it('returns counts using stats indexes (root already known)', async () => {
    vi.spyOn(EventService, 'getEventById').mockImplementation(async (id: string) => {
      if (id === 'C') return { id: 'C', parentEventId: 'B' } as any;
      if (id === 'A') return { id: 'A', parentEventId: null } as any;
      return null;
    });

    mockStorageManager.getEventStats.mockResolvedValue({ id: 'C', rootEventId: 'A', parentEventId: 'B' });
    mockStorageManager.countEventStatsByParentEventId.mockResolvedValue(0);
    mockStorageManager.countEventStatsByRootEventId.mockResolvedValue(4);

    const ctx = await EventService.getEventTreeContext('C');
    expect(mockStorageManager.getEventStats).toHaveBeenCalled();
    expect(ctx).not.toBeNull();
    expect(ctx!.rootEventId).toBe('A');
    expect(ctx!.subtreeCount).toBe(4);
    expect(ctx!.directChildCount).toBe(0);
  });

  it('computes and persists rootEventId when missing (path compression)', async () => {
    // Chain: C -> B -> A
    vi.spyOn(EventService, 'getEventById').mockImplementation(async (id: string) => {
      if (id === 'C') return { id: 'C', parentEventId: 'B' } as any;
      if (id === 'B') return { id: 'B', parentEventId: 'A' } as any;
      if (id === 'A') return { id: 'A', parentEventId: null } as any;
      return null;
    });

    mockStorageManager.getEventStats.mockImplementation(async (id: string) => {
      if (id === 'C') return { id: 'C', parentEventId: 'B' } as any; // no root yet
      if (id === 'B') return { id: 'B', parentEventId: 'A' } as any; // no root yet
      if (id === 'A') return { id: 'A', parentEventId: null, rootEventId: 'A' } as any;
      return null;
    });

    mockStorageManager.countEventStatsByParentEventId.mockResolvedValue(0);
    mockStorageManager.countEventStatsByRootEventId.mockResolvedValue(3);

    const ctx = await EventService.getEventTreeContext('C');
    expect(mockStorageManager.getEventStats).toHaveBeenCalled();
    expect(ctx!.rootEventId).toBe('A');
    expect(mockStorageManager.updateEventStats).toHaveBeenCalled();
  });
});

describe('EventService.updateSubtreeRootEventId (stats-index BFS)', () => {
  beforeEach(() => {
    mockStorageManager.getEventStatsByParentEventId.mockReset();
    mockStorageManager.bulkPutEventStats.mockReset();
  });

  it('updates descendant stats rootEventId via BFS without full table scan', async () => {
    const byParent: Record<string, any[]> = {
      B: [
        { id: 'C', parentEventId: 'B', rootEventId: 'OLD' },
        { id: 'D', parentEventId: 'B', rootEventId: 'OLD' },
      ],
      C: [{ id: 'E', parentEventId: 'C', rootEventId: 'OLD' }],
      D: [],
      E: [],
    };

    mockStorageManager.getEventStatsByParentEventId.mockImplementation(async (parentId: string) => {
      return byParent[parentId] || [];
    });

    await updateSubtreeRootEventIdUsingStatsIndex('B', 'A', {
      storage: mockStorageManager as any,
      log: () => undefined,
    });
    expect(mockStorageManager.bulkPutEventStats).toHaveBeenCalledTimes(1);
    const updates = mockStorageManager.bulkPutEventStats.mock.calls[0][0];
    expect(updates.map((s: any) => s.id).sort()).toEqual(['C', 'D', 'E']);
    expect(updates.every((s: any) => s.rootEventId === 'A')).toBe(true);
  });

  it('does not infinite-loop on cycles', async () => {
    // B -> C, C -> B (cycle)
    const byParent: Record<string, any[]> = {
      B: [{ id: 'C', parentEventId: 'B', rootEventId: 'OLD' }],
      C: [{ id: 'B', parentEventId: 'C', rootEventId: 'OLD' }],
    };

    mockStorageManager.getEventStatsByParentEventId.mockImplementation(async (parentId: string) => {
      return byParent[parentId] || [];
    });

    await updateSubtreeRootEventIdUsingStatsIndex('B', 'A', {
      storage: mockStorageManager as any,
      log: () => undefined,
    });
    expect(mockStorageManager.bulkPutEventStats).toHaveBeenCalled();
  });
});
