/**
 * PlanManager辅助函数（从executeBatchUpdate中抽取）
 */

import { Event } from '../types';
import { TagService } from '../services/TagService';
import { TimeHub } from '../services/TimeHub';
import { formatTimeForStorage } from '../utils/timeUtils';

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
): { parentEventId?: string; childEventIds?: string[] } {
  let validatedParentEventId = updatedItem.parentEventId ?? existingItem?.parentEventId;
  let validatedChildEventIds = updatedItem.childEventIds ?? existingItem?.childEventIds;

  // 检查 parentEventId 是否为临时ID
  if (validatedParentEventId && validatedParentEventId.startsWith('line-')) {
    console.warn('[validateEventTreeFields] ⚠️ 检测到临时ID parentEventId，已清除:', {
      eventId: updatedItem.id?.slice(-8),
      tempParentId: validatedParentEventId,
      action: '设为undefined，避免保存错误的父子关系'
    });
    validatedParentEventId = undefined;
  }

  // 检查 childEventIds 中的临时ID
  if (validatedChildEventIds && Array.isArray(validatedChildEventIds)) {
    const originalCount = validatedChildEventIds.length;
    validatedChildEventIds = validatedChildEventIds.filter((id: string) => !id.startsWith('line-'));
    if (validatedChildEventIds.length < originalCount) {
      console.warn('[validateEventTreeFields] ⚠️ 过滤掉childEventIds中的临时ID:', {
        eventId: updatedItem.id?.slice(-8),
        原始数量: originalCount,
        过滤后: validatedChildEventIds.length
      });
    }
    // 如果过滤后为空，设为undefined
    if (validatedChildEventIds.length === 0) {
      validatedChildEventIds = undefined;
    }
  }

  return { parentEventId: validatedParentEventId, childEventIds: validatedChildEventIds };
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
  const { parentEventId, childEventIds } = validateEventTreeFields(updatedItem, existingItem);

  const eventItem: Event = {
    ...(existingItem || {}),
    ...updatedItem,
    // 🔥 强制使用 TimeHub 的最新时间
    startTime: timeSnapshot.start || updatedItem.startTime || existingItem?.startTime,
    endTime: timeSnapshot.end !== undefined ? timeSnapshot.end : (updatedItem.endTime || existingItem?.endTime),
    tags: updatedItem.tags || [],
    calendarIds: calendarIds.length > 0 ? calendarIds : undefined,
    priority: updatedItem.priority || existingItem?.priority || 'medium',
    isCompleted: updatedItem.isCompleted ?? existingItem?.isCompleted ?? false,
    type: existingItem?.type || 'todo',
    isPlan: true,
    isTask: true,
    isTimeCalendar: false,
    fourDNoteSource: true,
    createdAt: existingItem?.createdAt || nowLocal,
    updatedAt: nowLocal,
    source: 'local',
    syncStatus: calendarIds.length > 0 ? 'pending' : 'local-only',
    parentEventId,
    childEventIds,
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
    JSON.stringify(existingItem.tags) !== JSON.stringify(updatedItem.tags)
  );
}
