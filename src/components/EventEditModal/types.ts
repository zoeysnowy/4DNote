import type { Contact } from '../../types';

export interface MockEvent {
  id: string;
  title: string;
  tags: string[];
  isTask: boolean;
  isTimer: boolean;
  parentEventId: string | null;
  // \ud83d\udd17 EventTree \u5173\u7cfb\u5b57\u6bb5
  childEventIds?: string[];
  linkedEventIds?: string[];
  backlinks?: string[];
  startTime: string | null; // ISO 8601 string
  endTime: string | null; // ISO 8601 string
  allDay: boolean;
  location?: string;
  organizer?: Contact;
  attendees?: Contact[];
  eventlog?: any; // Slate JSON (Descendant[] array or string)
  description?: string; // HTML export for Outlook sync
  // \ud83d\udd27 \u65e5\u5386\u540c\u6b65\u914d\u7f6e (\u5355\u4e00\u6570\u636e\u7ed3\u6784)
  calendarIds?: string[];
  syncMode?: string;
  subEventConfig?: {
    calendarIds?: string[];
    syncMode?: string;
  };
  // \ud83d\udce6 \u5386\u53f2\u517c\u5bb9\uff08\u5f85\u6e05\u7406\uff09
  planSyncConfig?: {
    mode:
      | 'receive-only'
      | 'send-only'
      | 'send-only-private'
      | 'bidirectional'
      | 'bidirectional-private';
    targetCalendars: string[];
  };
  actualSyncConfig?: {
    mode: 'send-only' | 'send-only-private' | 'bidirectional' | 'bidirectional-private';
    targetCalendars: string[];
  } | null;
}
