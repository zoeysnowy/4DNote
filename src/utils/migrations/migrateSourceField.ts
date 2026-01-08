import type { Event, EventSource } from '@frontend/types';

function isNamespacedSource(value: unknown): value is string {
  return typeof value === 'string' && value.includes(':');
}

function normalizeLegacyProviderSource(source: string): EventSource {
  switch (source) {
    case 'outlook':
      return 'outlook:calendar';
    case 'google':
      return 'google:calendar';
    case 'icloud':
      return 'icloud:calendar';
    case 'local':
      return 'local:event_edit';
    default:
      return 'local:unknown';
  }
}

function inferLocalSource(event: Event): EventSource {
  // Prefer the most specific, SSOT-friendly signals we have.
  // Note: Some of these fields may be removed in later phases, but are safe hints for migration.
  if ((event as any).isTimeLog === true || (event as any).isOutsideApp === true || (event as any).timerSessionId) return 'local:timelog';
  if (event.checkType && event.checkType !== 'none') return 'local:plan';
  if (event.startTime && event.endTime) return 'local:timecalendar';
  return 'local:event_edit';
}

function inferExternalSource(event: Event): EventSource {
  // If it has To Do list binding, treat as Outlook To Do.
  if (Array.isArray(event.todoListIds) && event.todoListIds.length > 0) return 'outlook:todo';

  // Default external sync is Calendar.
  return 'outlook:calendar';
}

export function migrateEventSource(event: Event): Event {
  const source = (event as any).source;

  // Already migrated or unset
  if (!source || isNamespacedSource(source)) {
    return event;
  }

  let newSource: EventSource;

  if (source === 'local') {
    newSource = inferLocalSource(event);
  } else if (source === 'outlook' || source === 'google' || source === 'icloud') {
    // Outlook can be todo vs calendar
    if (source === 'outlook' && Array.isArray(event.todoListIds) && event.todoListIds.length > 0) {
      newSource = 'outlook:todo';
    } else {
      newSource = normalizeLegacyProviderSource(source);
    }
  } else {
    // Unknown legacy string; use best-effort inference.
    const hasExternalHints =
      typeof event.externalId === 'string' ||
      typeof (event as any).sourceAccountId === 'string' ||
      typeof (event as any).sourceCalendarId === 'string';

    newSource = hasExternalHints ? inferExternalSource(event) : 'local:unknown';
  }

  return { ...event, source: newSource };
}

export function needsSourceMigration(event: Event): boolean {
  const source = (event as any).source;
  return typeof source === 'string' && source.length > 0 && !source.includes(':');
}
