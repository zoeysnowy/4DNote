import * as React from 'react';
import type { Event } from '@frontend/types';
import type { MockEvent } from '@frontend/features/Event/components/EventEditModal/types';

type LocationDisplayFn = (location: unknown) => string;

interface UseEventEditDraftParams {
  event: Event | null;
  eventId: string | null;
  isOpen: boolean;
  initialStartTime?: string | null;
  initialEndTime?: string | null;
  initialIsAllDay?: boolean | null;
  getLocationDisplayText: LocationDisplayFn;
  generateEventId: () => string;
}

export function useEventEditDraft({
  event,
  eventId,
  isOpen,
  initialStartTime,
  initialEndTime,
  initialIsAllDay,
  getLocationDisplayText,
  generateEventId,
}: UseEventEditDraftParams) {
  const [formData, setFormData] = React.useState<MockEvent>(() => {
    if (event) {
      // ✨ 使用 colorTitle (Slate JSON) 作为标题数据源，支持富文本格式
      let titleText = '';
      if (event.title) {
        if (typeof event.title === 'string') {
          // 旧数据：纯文本，转换为 Slate JSON
          titleText = JSON.stringify([{ type: 'paragraph', children: [{ text: event.title }] }]);
        } else {
          titleText = event.title.colorTitle || '';
        }
      }

      const linkedEventIds = (event as any).linkedEventIds || [];
      const backlinks = (event as any).backlinks || [];

      return {
        id: event.id,
        title: titleText,
        tags: event.tags || [],
        isTask: event.isTask || false,
        isTimer: event.isTimer || false,
        parentEventId: event.parentEventId || null,
        linkedEventIds,
        backlinks,
        startTime: event.startTime || null,
        endTime: event.endTime || null,
        allDay: event.isAllDay || false,
        location: getLocationDisplayText(event.location) || '',
        organizer: event.organizer,
        attendees: event.attendees || [],
        eventlog: typeof event.eventlog === 'string' ? event.eventlog : (event.eventlog?.slateJson || '[]'),
        description: event.description || '',
        calendarIds: event.calendarIds || [],
        syncMode:
          event.syncMode ||
          (() => {
            const isLocalEvent = event.fourDNoteSource === true || (event as any).source === 'local';
            return isLocalEvent ? 'bidirectional-private' : 'receive-only';
          })(),
        subEventConfig: event.subEventConfig || {
          calendarIds: [],
          syncMode: 'bidirectional-private',
        },
      };
    }

    // 新建事件时的默认值
    return {
      id: generateEventId(),
      title: JSON.stringify([{ type: 'paragraph', children: [{ text: '' }] }]),
      tags: [],
      isTask: false,
      isTimer: false,
      parentEventId: null,
      linkedEventIds: [],
      backlinks: [],
      startTime: null,
      endTime: null,
      allDay: false,
      location: '',
      attendees: [],
      eventlog: '[]',
      description: '',
      calendarIds: [],
      syncMode: 'bidirectional-private',
      subEventConfig: { calendarIds: [], syncMode: 'bidirectional-private' },
    };
  });

  const titleRef = React.useRef<string>(formData.title);
  const initialSnapshotRef = React.useRef<MockEvent | null>(null);
  const isAutoSavingRef = React.useRef<boolean>(false);

  // ✅ 只在创建新事件时重置（!event && !eventId）
  React.useEffect(() => {
    if (isOpen && !event && !eventId) {
      const emptyTitle = JSON.stringify([{ type: 'paragraph', children: [{ text: '' }] }]);
      setFormData({
        id: generateEventId(),
        title: emptyTitle,
        tags: [],
        isTask: false,
        isTimer: false,
        parentEventId: null,
        linkedEventIds: [],
        backlinks: [],
        startTime: initialStartTime || null,
        endTime: initialEndTime || null,
        allDay: initialIsAllDay || false,
        location: '',
        attendees: [],
        eventlog: '[]',
        description: '',
        calendarIds: [],
        syncMode: 'bidirectional-private',
        subEventConfig: { calendarIds: [], syncMode: 'bidirectional-private' },
      });
      titleRef.current = emptyTitle;
    }
  }, [isOpen, event, eventId, initialStartTime, initialEndTime, initialIsAllDay, generateEventId]);

  // 🔧 当 event 变化时重新初始化 draft（避免加载完成后仍显示旧草稿）
  React.useEffect(() => {
    if (!event) return;

    let titleText = '';
    if (event.title) {
      if (typeof event.title === 'string') {
        titleText = JSON.stringify([{ type: 'paragraph', children: [{ text: event.title }] }]);
      } else {
        titleText = event.title.colorTitle || '';
      }
    }

    titleRef.current = titleText;
    const linkedEventIds = (event as any).linkedEventIds || [];
    const backlinks = (event as any).backlinks || [];

    setFormData({
      id: event.id,
      title: titleText,
      tags: event.tags || [],
      isTask: event.isTask || false,
      isTimer: event.isTimer || false,
      parentEventId: event.parentEventId || null,
      linkedEventIds,
      backlinks,
      startTime: event.startTime || null,
      endTime: event.endTime || null,
      allDay: event.isAllDay || false,
      location: getLocationDisplayText(event.location) || '',
      organizer: event.organizer,
      attendees: event.attendees || [],
      eventlog: typeof event.eventlog === 'string' ? event.eventlog : (event.eventlog?.slateJson || '[]'),
      description: event.description || '',
      calendarIds: event.calendarIds || [],
      syncMode:
        event.syncMode ||
        (() => {
          const isLocalEvent = event.fourDNoteSource === true || (event as any).source === 'local';
          return isLocalEvent ? 'bidirectional-private' : 'receive-only';
        })(),
      subEventConfig: event.subEventConfig || {
        calendarIds: [],
        syncMode: 'bidirectional-private',
      },
    });
  }, [
    event?.id,
    typeof (event as any)?.eventlog === 'string' ? (event as any).eventlog : (event as any)?.eventlog?.slateJson,
    getLocationDisplayText,
  ]);

  // 🔧 同步 titleRef 与 formData.title（只在事件切换时，即 formData.id 变化）
  React.useEffect(() => {
    titleRef.current = formData.title;
  }, [formData.id]);

  // 🆕 捕获初始快照（用于取消回滚/丢弃语义）
  React.useEffect(() => {
    if (isOpen && formData && !initialSnapshotRef.current) {
      initialSnapshotRef.current = JSON.parse(JSON.stringify(formData));
    }

    if (!isOpen) {
      initialSnapshotRef.current = null;
    }
  }, [isOpen, formData.id]);

  return {
    formData,
    setFormData,
    titleRef,
    initialSnapshotRef,
    isAutoSavingRef,
  };
}
