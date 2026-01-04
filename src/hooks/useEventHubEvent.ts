import { useCallback } from 'react';

import type { Event } from '@frontend/types';
import { useEventHubQuery } from './useEventHubQuery';
import type { UseEventHubSnapshotOptions } from './useEventHubSnapshot';

export type UseEventHubEventOptions = UseEventHubSnapshotOptions;

/**
 * Master Plan v2.22: useEventHubEvent(eventId)
 * - UI-friendly single-event subscription view.
 * - Built on top of the existing snapshot + selector approach.
 */
export function useEventHubEvent(
  eventId: string | null | undefined,
  options: UseEventHubEventOptions = { enabled: true }
) {
  const selector = useCallback(
    (events: Event[]) => {
      if (!eventId) return null;
      return events.find(e => e.id === eventId) ?? null;
    },
    [eventId]
  );

  const { result: event, ensureLoaded, refresh } = useEventHubQuery(selector, [], options);

  return {
    event,
    ensureLoaded,
    refresh,
  };
}
