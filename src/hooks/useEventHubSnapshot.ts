import { useAllEventsSnapshot } from './useAllEventsSnapshot';

export type UseEventHubSnapshotOptions = {
  enabled: boolean;
  autoLoad?: boolean;
};

/**
 * Master Plan v2.22: useEventHubSnapshot()
 * - UI-facing API that provides a subscription-backed snapshot of domain events.
 * - Internally uses the existing eventsUpdated broadcast to refresh.
 * - This is a snapshot/view helper, not a long-lived UI "source of truth" cache.
 */
export function useEventHubSnapshot(options: UseEventHubSnapshotOptions) {
  return useAllEventsSnapshot(options);
}
