import type { EventSource } from '@frontend/types';

export type EventSourceProvider = 'local' | 'outlook' | 'google' | 'icloud';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function sourceProviderOf(source: EventSource): EventSourceProvider {
  const provider = source.split(':', 1)[0] as EventSourceProvider;
  switch (provider) {
    case 'local':
    case 'outlook':
    case 'google':
    case 'icloud':
      return provider;
    default:
      throw new Error(`[SSOT] Invalid Event.source provider: ${String(provider)}`);
  }
}

export function isLocalEventSource(source: EventSource): boolean {
  return sourceProviderOf(source) === 'local';
}

export function isExternalEventSource(source: EventSource): boolean {
  return sourceProviderOf(source) !== 'local';
}

export function isOutlookEventSource(source: EventSource): boolean {
  return sourceProviderOf(source) === 'outlook';
}

export function assertNamespacedEventSource(value: unknown): asserts value is EventSource {
  if (!isNonEmptyString(value) || !value.includes(':')) {
    throw new Error(`[SSOT] Event.source must be a namespaced string like 'local:plan' or 'outlook:calendar' (got: ${String(value)})`);
  }

  // Validate provider early.
  sourceProviderOf(value as EventSource);
}
