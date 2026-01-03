import { useEffect } from 'react';

type UseEventsUpdatedSubscriptionOptions = {
  enabled: boolean;
  onEventsUpdated: (detail: unknown) => void;
};

/**
 * Low-risk helper: subscribe to the global `eventsUpdated` CustomEvent.
 * Keeps DOM listener wiring out of feature components.
 */
export function useEventsUpdatedSubscription(options: UseEventsUpdatedSubscriptionOptions) {
  const { enabled, onEventsUpdated } = options;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: globalThis.Event) => {
      const detail = (e as unknown as globalThis.CustomEvent<unknown>).detail;
      onEventsUpdated(detail);
    };

    window.addEventListener('eventsUpdated', handler as EventListener);
    return () => {
      window.removeEventListener('eventsUpdated', handler as EventListener);
    };
  }, [enabled, onEventsUpdated]);
}
