/**
 * Storage 妯″潡閫氱敤绫诲瀷瀹氫箟
 * @version 1.0.0
 * @date 2025-12-01
 */

import type { Event, Contact } from '@frontend/types';

// Re-export types for internal use
export type { Event, Contact };

/**
 * Tag 瀛樺偍绫诲瀷锛堟墿灞曪紝鏀寔杞垹闄ゅ拰浜戝悓姝ワ級
 */
export interface StorageTag {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  parentId?: string;
  position?: number; // 鏍囩鍦ㄥ垪琛ㄤ腑鐨勪綅缃『搴?
  level?: number;
  calendarMapping?: {
    calendarId: string;
    calendarName: string;
  };
  dailyAvgCheckins?: number; // 姣忔棩骞冲潎鎵撳崱娆℃暟锛圲I缁熻鏁版嵁锛?
  dailyAvgDuration?: number; // 姣忔棩骞冲潎鏃堕暱锛堝垎閽燂級
  isRecurring?: boolean; // 鏄惁涓洪噸澶嶆爣绛?
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // 杞垹闄?
}

/**
 * Tag 绫诲瀷锛堜复鏃跺畾涔夛紝寰呬粠涓荤被鍨嬫枃浠跺鍑猴級
 */
export interface Tag {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
  parentId?: string;
  position?: number; // 鏍囩鍦ㄥ垪琛ㄤ腑鐨勪綅缃『搴?
  [key: string]: any;
}

/**
 * 浜嬩欢缁熻鏁版嵁锛堣交閲忕骇锛岀敤浜庣粺璁″垎鏋愶級
 */
export interface EventTreeIndex {
  id: string;                    // 事件ID

  // Tree context (ADR-001): structure truth = parentEventId; derived root index = rootEventId
  parentEventId?: string | null; // Tree: direct parent (null/undefined = level-0 root)
  rootEventId?: string;          // Tree: level-0 root id (derived, rebuildable)

  tags: string[];                // 标签ID列表
  calendarIds: string[];         // 鏃ュ巻ID鍒楄〃
  startTime: string;             // 寮€濮嬫椂闂达紙YYYY-MM-DD HH:mm:ss锛?
  endTime: string;               // 缁撴潫鏃堕棿
  source?: string;               // 鏉ユ簮锛坥utlook/google/local锛?
  updatedAt: string;             // 鏈€鍚庢洿鏂版椂闂?
}

/**
 * 瀛樺偍灞傜骇
 */
export enum StorageLayer {
  IndexedDB = 'indexeddb',
  SQLite = 'sqlite',
  Cloud = 'cloud'
}

/**
 * 鍚屾鐘舵€?
 */
export enum SyncStatus {
  Pending = 'pending',
  Syncing = 'syncing',
  Synced = 'synced',
  Failed = 'failed',
  Conflict = 'conflict'
}

/**
 * 璐﹀彿淇℃伅锛堝閭鏀寔锛?
 */
export interface Account {
  id: string;
  email: string;
  provider: 'outlook' | 'google' | 'icloud' | 'caldav';
  displayName?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
  isActive?: boolean;
  syncEnabled: boolean;
  lastSyncAt?: string;
  syncInterval?: number;
  serverUrl?: string;
  defaultCalendarId?: string;
  settings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * 鏃ュ巻淇℃伅锛堟瘡涓处鍙峰彲浠ユ湁澶氫釜鏃ュ巻锛?
 */
export interface Calendar {
  id: string;
  accountId: string;
  remoteId?: string;
  name: string;
  description?: string;
  color?: string;
  emoji?: string;
  type?: string;
  isPrimary?: boolean;
  isVisible?: boolean;
  isDefault: boolean;
  orderIndex?: number;
  syncEnabled?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canShare?: boolean;
  syncToken?: string;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Event 鎵╁睍锛堟坊鍔犲瓨鍌ㄧ浉鍏冲瓧娈碉級
 */
export interface StorageEvent extends Event {
  // 褰撳墠瀛楁锛圡VP锛?
  sourceAccountId?: string;
  sourceCalendarId?: string;
  
  // 棰勭暀瀛楁锛圔eta - 浜戠鍚屾锛?
  fourDnoteUserId?: string;
  syncMode?: 'local-only' | 'bidirectional' | 'push-only';
  cloudSyncStatus?: 'synced' | 'pending' | 'conflict';
  lastCloudSyncAt?: string;
}

/**
 * 闄勪欢淇℃伅
 */
export interface Attachment {
  id: string;
  eventId: string;
  type: 'image' | 'audio' | 'document';
  name: string;
  size: number;
  mimeType: string;
  filePath: string;
  thumbnail?: string;
  createdAt: string;
}

/**
 * 鍚屾闃熷垪椤?
 */
export interface SyncQueueItem {
  id: string;
  accountId?: string;
  operation: 'create' | 'update' | 'delete';
  entityType: 'event' | 'contact' | 'tag' | 'eventlog';
  entityId: string;
  data: any;
  status: SyncStatus;
  attempts: number;
  lastAttemptAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 鍏冩暟鎹紙瀛樺偍閰嶇疆銆佺増鏈俊鎭瓑锛?
 */
export interface Metadata {
  key: string;
  value: any;
  updatedAt: string;
}

/**
 * 鏌ヨ閫夐」
 */
export interface QueryOptions {
  // 鍒嗛〉
  offset?: number;
  limit?: number;
  
  // 鎺掑簭
  sort?: string; // 鍏煎瀛楁
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  
  // 绛涢€?
  filters?: Record<string, any>;
  
  // 鎼滅储
  searchQuery?: string;
  searchFields?: string[];
  
  // 鏃堕棿鑼冨洿
  startDate?: Date;
  endDate?: Date;
  
  // 璐﹀彿杩囨护
  accountIds?: string[];
}

/**
 * 鏌ヨ缁撴灉
 */
export interface QueryResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  offset?: number; // 鍏煎瀛楁
}

/**
 * 鎵归噺鎿嶄綔缁撴灉
 */
export interface BatchResult<T> {
  success: T[];
  failed: Array<{ item: T; error: Error }>;
  errors?: Array<{ item: T; error: Error }>; // 鍏煎瀛楁
}

/**
 * 瀛樺偍缁熻淇℃伅
 */
export interface StorageStats {
  indexedDB?: {
    used: number;
    quota: number;
    percentage?: number;
    eventsCount?: number;
    contactsCount?: number;
    tagsCount?: number;
  };
  sqlite?: {
    used: number;
    quota: number;
    accountsCount?: number;
    calendarsCount?: number;
    eventsCount?: number;
    eventLogsCount?: number;
    contactsCount?: number;
    tagsCount?: number;
  };
  fileSystem?: {
    attachments: number;
    backups: number;
    logs: number;
  };
  cache?: {
    size: number;
    count: number;
    maxSize: number;
    hitRate: number;
    breakdown?: {
      events: { size: number; count: number; maxSize: number };
      contacts: { size: number; count: number; maxSize: number };
      tags: { size: number; count: number; maxSize: number };
    };
  };
}

/**
 * 澶囦唤淇℃伅
 */
export interface BackupInfo {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  filePath: string;
  size: number;
  eventCount: number;
  createdAt: string;
}

