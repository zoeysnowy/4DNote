/**
 * Timer 相关工具函数
 */

import { Event, SyncStatus } from '@frontend/types';

/**
 * 判断事件是否为运行中的 Timer
 * 
 * 运行中的 Timer 特征：
 * - syncStatus 为 'local-only'（仅本地，不同步）
 * - 未来可扩展更多判断条件
 * 
 * @param event 事件对象
 * @returns 是否为运行中的 Timer
 */
export const isRunningTimer = (event?: Event | null): boolean => {
  if (!event) return false;
  return event.syncStatus === SyncStatus.LOCAL_ONLY;
};

/**
 * 判断事件是否需要同步
 * 
 * @param event 事件对象
 * @returns 是否需要同步
 */
export const needsSync = (event?: Event | null): boolean => {
  if (!event) return false;
  return event.syncStatus === SyncStatus.PENDING;
};

/**
 * 判断事件是否已同步
 * 
 * @param event 事件对象
 * @returns 是否已同步
 */
export const isSynced = (event?: Event | null): boolean => {
  if (!event) return false;
  return event.syncStatus === SyncStatus.SYNCED;
};

/**
 * 判断事件同步是否失败
 * 
 * @param event 事件对象
 * @returns 同步是否失败
 */
export const hasSyncError = (event?: Event | null): boolean => {
  if (!event) return false;
  return event.syncStatus === SyncStatus.ERROR;
};

/**
 * 判断事件是否有同步冲突
 * 
 * @param event 事件对象
 * @returns 是否有同步冲突
 */
export const hasSyncConflict = (event?: Event | null): boolean => {
  if (!event) return false;
  return event.syncStatus === SyncStatus.CONFLICT;
};
