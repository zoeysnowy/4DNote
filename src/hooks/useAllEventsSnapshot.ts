import { useCallback, useEffect, useRef, useState } from 'react';

import { EventService } from '@backend/EventService';
import type { Event } from '@frontend/types';

type UseAllEventsSnapshotOptions = {
  enabled: boolean;
  /**
   * When true (default), will call ensureLoaded() on mount.
   * Set false for pages that only occasionally need full snapshots.
   */
  autoLoad?: boolean;
};

export function useAllEventsSnapshot(options: UseAllEventsSnapshotOptions) {
  const { enabled, autoLoad = true } = options;

  const [events, setEvents] = useState<Event[]>([]);
  const eventsRef = useRef<Event[]>([]);
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const pendingRefreshTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async (): Promise<Event[]> => {
    if (!enabled) return eventsRef.current;
    if (isLoadingRef.current) return eventsRef.current;

    isLoadingRef.current = true;
    try {
      const nextEvents = (await EventService.getAllEvents()) as unknown as Event[];
      hasLoadedRef.current = true;
      setEvents(prev => {
        // Avoid unnecessary rerenders when the overall event set hasn't changed.
        // Compare a lightweight signature so updates (title/time/etc.) trigger rerenders.
        // Using updatedAt keeps this cheap while remaining correct for most UI.
        const signature = (events: Event[] | undefined) =>
          (events || [])
            .map(e => `${e.id}:${(e as any).updatedAt ?? ''}`)
            .sort()
            .join(',');
        const next = signature(prev) === signature(nextEvents) ? prev : nextEvents;
        eventsRef.current = next;
        return next;
      });

      // Best-effort immediate availability for callers awaiting refresh().
      // The state update above will keep UI in sync.
      if (eventsRef.current.length === 0 && nextEvents.length > 0) {
        eventsRef.current = nextEvents;
      }
      return nextEvents;
    } finally {
      isLoadingRef.current = false;
    }
  }, [enabled]);

  const ensureLoaded = useCallback(async (): Promise<Event[]> => {
    if (!enabled) return eventsRef.current;
    if (hasLoadedRef.current) return eventsRef.current;
    return await refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    if (!autoLoad) return;
    void ensureLoaded();
  }, [autoLoad, enabled, ensureLoaded]);

  useEffect(() => {
    if (!enabled) return;

    const scheduleRefresh = () => {
      if (pendingRefreshTimerRef.current != null) return;
      pendingRefreshTimerRef.current = window.setTimeout(() => {
        pendingRefreshTimerRef.current = null;
        void refresh();
      }, 50);
    };

    const handleEventsUpdated = () => {
      scheduleRefresh();
    };

    window.addEventListener('eventsUpdated', handleEventsUpdated as EventListener);
    return () => {
      window.removeEventListener('eventsUpdated', handleEventsUpdated as EventListener);
      if (pendingRefreshTimerRef.current != null) {
        window.clearTimeout(pendingRefreshTimerRef.current);
        pendingRefreshTimerRef.current = null;
      }
    };
  }, [enabled, refresh]);

  return {
    events,
    ensureLoaded,
    refresh,
  };
}
