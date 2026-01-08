import type { Event } from '@frontend/types';

export interface EventlogOwnerRef {
  id?: string;
  parentEventId?: string | null;
}

export function isTimerEventId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith('timer-');
}

/**
 * Eventlog 的 canonical ownerId：
 * - 对于“timer 子事件”（id=timer-* 且有 parentEventId）：owner 是 parentEventId
 * - 其他事件：owner 是自身 id
 */
export function resolveEventlogOwnerId(event: EventlogOwnerRef | undefined): string | undefined {
  if (!event?.id) return undefined;
  if (isTimerEventId(event.id) && event.parentEventId) return event.parentEventId;
  return event.id;
}

export function shouldUseParentEventlog(event: EventlogOwnerRef | undefined): boolean {
  return !!(event?.id && isTimerEventId(event.id) && event.parentEventId);
}

export function getTimerParentEventId(event: EventlogOwnerRef | undefined): string | undefined {
  if (!shouldUseParentEventlog(event)) return undefined;
  return event!.parentEventId || undefined;
}

// Convenience overload for full Event objects.
export function resolveEventlogOwnerIdFromEvent(event: Partial<Event> | undefined): string | undefined {
  return resolveEventlogOwnerId(event as any);
}
