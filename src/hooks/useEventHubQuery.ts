import { useMemo } from 'react';

import type { Event } from '../types';
import { useEventHubSnapshot, type UseEventHubSnapshotOptions } from './useEventHubSnapshot';

export type UseEventHubQueryOptions = UseEventHubSnapshotOptions;

/**
 * Master Plan v2.22: useEventHubQuery(selector)
 * - Subscription view: re-runs selector when the snapshot refreshes.
 * - Keeps the API narrow and UI-friendly; indexing/caching stays in services.
 */
export function useEventHubQuery<T>(
  selector: (events: Event[]) => T,
  deps: unknown[] = [],
  options: UseEventHubQueryOptions = { enabled: true }
) {
  const { events, ensureLoaded, refresh } = useEventHubSnapshot(options);

  const result = useMemo(() => selector(events), [events, selector, ...deps]);

  return {
    result,
    events,
    ensureLoaded,
    refresh,
  };
}
