/**
 * PlanManager辅助函数（从executeBatchUpdate中抽取）
 */

import type { Event } from '../../../types';
import { TagService } from '../../../services/TagService';
import { TimeHub } from '../../../services/TimeHub';
import { formatTimeForStorage } from '../../../utils/timeUtils';

/**
 * 从标签中提取calendarIds
 */
export function extractCalendarIds(tags: string[]): string[] {
  const tagIds = (tags || []).map((t: string) => {
    const tag = TagService.getFlatTags().find(x => x.id === t || x.name === t);
    return tag ? tag.id : t;
  });

  const calendarIds = tagIds
    .map((tagId: string) => {
      const tag = TagService.getFlatTags().find(t => t.id === tagId);
      return tag?.calendarMapping?.calendarId;
    })
    .filter((id: string | undefined): id is string => !!id);

  return calendarIds;
}

/**
 * 验证并清理EventTree字段中的临时ID
 */
export function validateEventTreeFields(
  updatedItem: any,
  existingItem: any
): { parentEventId?: string } {
  let validatedParentEventId = updatedItem.parentEventId ?? existingItem?.parentEventId;

  // 检查 parentEventId 是否为临时ID
  if (validatedParentEventId && validatedParentEventId.startsWith('line-')) {
    console.warn('[validateEventTreeFields] ⚠️ 检测到临时ID parentEventId，已清除:', {
      eventId: updatedItem.id?.slice(-8),
      tempParentId: validatedParentEventId,
      action: '设为undefined，避免保存错误的父子关系'
    });
    validatedParentEventId = undefined;
  }

  return { parentEventId: validatedParentEventId };
}

/**
 * 构建完整的Event对象用于保存
 */
export function buildEventForSave(
  updatedItem: any,
  existingItem: any | undefined,
  calendarIds: string[]
): Event {
  const now = new Date();
  const nowLocal = formatTimeForStorage(now);
  const timeSnapshot = TimeHub.getSnapshot(updatedItem.id);

  const sanitizedUpdatedItem = { ...(updatedItem || {}) };

  const { parentEventId } = validateEventTreeFields(sanitizedUpdatedItem, existingItem);

  // Optional arrays: do not inject [] when the canonical value was undefined.
  const tagsInput: string[] | undefined = Array.isArray(sanitizedUpdatedItem.tags)
    ? sanitizedUpdatedItem.tags
    : undefined;
  const tagsForPersist: string[] | undefined =
    tagsInput && tagsInput.length === 0 && (existingItem?.tags === undefined || existingItem?.tags === null)
      ? undefined
      : (tagsInput ?? existingItem?.tags);

  // Optional boolean: do not inject false when the canonical value was undefined.
  const isAllDayInput: boolean | undefined =
    typeof sanitizedUpdatedItem.isAllDay === 'boolean' ? sanitizedUpdatedItem.isAllDay : undefined;
  const isAllDayForPersist: boolean | undefined =
    isAllDayInput === false && (existingItem?.isAllDay === undefined || existingItem?.isAllDay === null)
      ? undefined
      : (isAllDayInput ?? existingItem?.isAllDay);

  // SyncStatus: avoid default injection when there is no calendar mapping and no prior value.
  const computedSyncStatus = calendarIds.length > 0 ? 'pending' : 'local-only';
  const syncStatusForPersist = existingItem?.syncStatus ?? (calendarIds.length > 0 ? computedSyncStatus : undefined);

  const eventItem: Event = {
    ...(existingItem || {}),
    ...sanitizedUpdatedItem,
    // 🔥 强制使用 TimeHub 的最新时间
    startTime: timeSnapshot.start || updatedItem.startTime || existingItem?.startTime,
    endTime: timeSnapshot.end !== undefined ? timeSnapshot.end : (updatedItem.endTime || existingItem?.endTime),
    isAllDay: isAllDayForPersist,
    tags: tagsForPersist,
    calendarIds: calendarIds.length > 0 ? calendarIds : undefined,
    priority: updatedItem.priority || existingItem?.priority || 'medium',
    isCompleted: updatedItem.isCompleted ?? existingItem?.isCompleted ?? false,
    type: existingItem?.type || 'todo',
    isPlan: true,
    isTask: true,
    isTimeCalendar: false,
    fourDNoteSource: true,
    createdAt: existingItem?.createdAt ?? sanitizedUpdatedItem.createdAt ?? nowLocal,
    updatedAt: nowLocal,
    source: 'local',
    syncStatus: syncStatusForPersist as any,
    parentEventId,
    bulletLevel: updatedItem.bulletLevel ?? existingItem?.bulletLevel,
    position: updatedItem.position ?? existingItem?.position,
  } as Event;

  // 保留 timeSpec
  if (timeSnapshot.timeSpec || updatedItem.timeSpec) {
    (eventItem as any).timeSpec = timeSnapshot.timeSpec || updatedItem.timeSpec;
  }

  return eventItem;
}

/**
 * 检测变更
 */
export function detectChanges(updatedItem: any, existingItem: any): boolean {
  if (!existingItem) return true;

  const titleChanged = JSON.stringify(existingItem?.title) !== JSON.stringify(updatedItem.title);
  return (
    titleChanged ||
    existingItem.content !== updatedItem.content ||
    existingItem.description !== updatedItem.description ||
    existingItem.eventlog !== updatedItem.eventlog ||
    JSON.stringify(existingItem.tags) !== JSON.stringify(updatedItem.tags) ||
    // ✅ Persist ordering and tree structure changes even when content is unchanged
    (existingItem.parentEventId || undefined) !== (updatedItem.parentEventId || undefined) ||
    (existingItem.position ?? undefined) !== (updatedItem.position ?? undefined)
  );
}
