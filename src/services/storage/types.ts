/**
 * Storage 模块通用类型定义
 * @version 1.0.0
 * @date 2025-12-01
 */

import type { Event, Contact } from '../../types';

// Re-export types for internal use
export type { Event, Contact };

/**
 * Tag 存储类型（扩展，支持软删除和云同步）
 */
export interface StorageTag {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  parentId?: string;
  position?: number; // 标签在列表中的位置顺序
  level?: number;
  calendarMapping?: {
    calendarId: string;
    calendarName: string;
  };
  dailyAvgCheckins?: number; // 每日平均打卡次数（UI统计数据）
  dailyAvgDuration?: number; // 每日平均时长（分钟）
  isRecurring?: boolean; // 是否为重复标签
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // 软删除
}

/**
 * Tag 类型（临时定义，待从主类型文件导出）
 */
export interface Tag {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
  parentId?: string;
  position?: number; // 标签在列表中的位置顺序
  [key: string]: any;
}

/**
 * 存储层级
 */
export enum StorageLayer {
  IndexedDB = 'indexeddb',
  SQLite = 'sqlite',
  Cloud = 'cloud'
}

/**
 * 同步状态
 */
export enum SyncStatus {
  Pending = 'pending',
  Syncing = 'syncing',
  Synced = 'synced',
  Failed = 'failed',
  Conflict = 'conflict'
}

/**
 * 账号信息（多邮箱支持）
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
 * 日历信息（每个账号可以有多个日历）
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
 * Event 扩展（添加存储相关字段）
 */
export interface StorageEvent extends Event {
  // 当前字段（MVP）
  sourceAccountId?: string;
  sourceCalendarId?: string;
  
  // 预留字段（Beta - 云端同步）
  fourDnoteUserId?: string;
  syncMode?: 'local-only' | 'bidirectional' | 'push-only';
  cloudSyncStatus?: 'synced' | 'pending' | 'conflict';
  lastCloudSyncAt?: string;
}

/**
 * 附件信息
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
 * 同步队列项
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
 * 元数据（存储配置、版本信息等）
 */
export interface Metadata {
  key: string;
  value: any;
  updatedAt: string;
}

/**
 * 查询选项
 */
export interface QueryOptions {
  // 分页
  offset?: number;
  limit?: number;
  
  // 排序
  sort?: string; // 兼容字段
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  
  // 筛选
  filters?: Record<string, any>;
  
  // 搜索
  searchQuery?: string;
  searchFields?: string[];
  
  // 时间范围
  startDate?: Date;
  endDate?: Date;
  
  // 账号过滤
  accountIds?: string[];
}

/**
 * 查询结果
 */
export interface QueryResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  offset?: number; // 兼容字段
}

/**
 * 批量操作结果
 */
export interface BatchResult<T> {
  success: T[];
  failed: Array<{ item: T; error: Error }>;
  errors?: Array<{ item: T; error: Error }>; // 兼容字段
}

/**
 * 存储统计信息
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
 * 备份信息
 */
export interface BackupInfo {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  filePath: string;
  size: number;
  eventCount: number;
  createdAt: string;
}
