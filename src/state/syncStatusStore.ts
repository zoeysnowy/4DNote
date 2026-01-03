import { parseLocalTimeStringOrNull } from '../utils/timeUtils';

export type SyncStats = {
  syncFailed: number;
  calendarCreated: number;
  syncSuccess: number;
};

export type SyncStatusSnapshot = {
  lastSync: Date | null;
  updatedEvents: number;
  isSyncing: boolean;
  syncStats: SyncStats;
};

export type SyncStatusListener = () => void;

const defaultStats: SyncStats = { syncFailed: 0, calendarCreated: 0, syncSuccess: 0 };

let snapshot: SyncStatusSnapshot = {
  lastSync: null,
  updatedEvents: 0,
  isSyncing: false,
  syncStats: defaultStats
};

const listeners = new Set<SyncStatusListener>();

function notify() {
  for (const listener of listeners) listener();
}

export const SyncStatusStore = {
  getSnapshot(): SyncStatusSnapshot {
    return snapshot;
  },

  subscribe(listener: SyncStatusListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  hydrateFromLocalStorageBridge(): void {
    try {
      const savedSyncTime = localStorage.getItem('lastSyncTime');
      const savedEventCount = localStorage.getItem('lastSyncEventCount');
      const savedSyncStats = localStorage.getItem('syncStats');

      const lastSync = savedSyncTime ? parseLocalTimeStringOrNull(savedSyncTime) : null;
      const updatedEvents = savedEventCount ? parseInt(savedEventCount) : 0;

      let syncStats = defaultStats;
      if (savedSyncStats) {
        try {
          const parsed = JSON.parse(savedSyncStats);
          syncStats = {
            syncFailed: Number(parsed?.syncFailed) || 0,
            calendarCreated: Number(parsed?.calendarCreated) || 0,
            syncSuccess: Number(parsed?.syncSuccess) || 0
          };
        } catch {
          // ignore
        }
      }

      snapshot = {
        ...snapshot,
        lastSync,
        updatedEvents: Number.isFinite(updatedEvents) ? updatedEvents : 0,
        syncStats
      };
      notify();
    } catch {
      // ignore
    }
  },

  setSyncing(isSyncing: boolean): void {
    if (snapshot.isSyncing === isSyncing) return;
    snapshot = { ...snapshot, isSyncing };
    notify();
  },

  setCompleted(params: { timestamp?: Date; eventCount?: number; syncStats?: Partial<SyncStats> | null }): void {
    const fallbackStats = defaultStats;
    const nextStats = params.syncStats
      ? {
          syncFailed: Number(params.syncStats.syncFailed) || 0,
          calendarCreated: Number(params.syncStats.calendarCreated) || 0,
          syncSuccess: Number(params.syncStats.syncSuccess) || 0
        }
      : fallbackStats;

    snapshot = {
      ...snapshot,
      lastSync: params.timestamp || snapshot.lastSync,
      updatedEvents: typeof params.eventCount === 'number' ? params.eventCount : snapshot.updatedEvents,
      isSyncing: false,
      syncStats: nextStats
    };
    notify();
  }
};
