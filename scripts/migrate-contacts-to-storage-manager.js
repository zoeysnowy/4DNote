/**
 * ContactService 数据迁移脚本
 * 将联系人数据从 localStorage 迁移到 StorageManager（IndexedDB + SQLite）
 * 
 * 使用方法：
 * 1. 在浏览器控制台运行：node scripts/migrate-contacts-to-storage-manager.js
 * 2. 或在 Electron 应用中自动运行（ContactService.initialize() 会调用）
 */

// 注意：此脚本仅用于独立运行的迁移场景
// ContactService 本身已包含自动迁移逻辑（migrateFromLocalStorage）

const STORAGE_KEY = '4dnote-contacts';
const BACKUP_KEY = '4dnote-contacts-backup';

/**
 * 主迁移函数
 */
async function migrateContactsToStorageManager() {
  console.log('🔄 [Migration] Starting contact migration...');
  
  try {
    // 1. 检查是否已迁移
    const backupExists = localStorage.getItem(BACKUP_KEY);
    if (backupExists) {
      console.log('✅ [Migration] Already migrated (backup exists)');
      return { status: 'already_migrated', count: 0 };
    }

    // 2. 从 localStorage 读取旧数据
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (!storedData) {
      console.log('ℹ️ [Migration] No contacts to migrate');
      return { status: 'no_data', count: 0 };
    }

    let contacts;
    try {
      contacts = JSON.parse(storedData);
    } catch (parseError) {
      console.error('❌ [Migration] Failed to parse contact data:', parseError);
      return { status: 'parse_error', error: parseError };
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      console.log('ℹ️ [Migration] No contacts to migrate');
      return { status: 'no_data', count: 0 };
    }

    console.log(`📦 [Migration] Found ${contacts.length} contacts to migrate`);

    // 3. 确保 StorageManager 已初始化
    if (typeof window === 'undefined' || !window.storageManager) {
      console.error('❌ [Migration] StorageManager not available');
      return { status: 'error', error: 'StorageManager not available' };
    }

    // 4. 批量写入 StorageManager
    console.log('💾 [Migration] Writing to StorageManager...');
    const result = await window.storageManager.batchCreateContacts(contacts);

    console.log(`✅ [Migration] Successfully migrated ${result.successful} contacts`);
    
    if (result.failed.length > 0) {
      console.warn(`⚠️ [Migration] Failed to migrate ${result.failed.length} contacts:`, result.failed);
    }

    // 5. 备份原始数据
    console.log('💾 [Migration] Backing up original data...');
    localStorage.setItem(BACKUP_KEY, storedData);
    localStorage.setItem(`${BACKUP_KEY}-timestamp`, new Date().toISOString());

    // 6. 清理 localStorage
    console.log('🗑️ [Migration] Removing original data from localStorage...');
    localStorage.removeItem(STORAGE_KEY);

    console.log('✅ [Migration] Contact migration completed successfully!');
    
    return {
      status: 'success',
      migrated: result.successful,
      failed: result.failed.length,
      total: contacts.length,
    };

  } catch (error) {
    console.error('❌ [Migration] Migration failed:', error);
    return { status: 'error', error };
  }
}

/**
 * 回滚迁移（从备份恢复）
 */
function rollbackMigration() {
  console.log('🔄 [Migration] Rolling back migration...');
  
  const backup = localStorage.getItem(BACKUP_KEY);
  if (!backup) {
    console.error('❌ [Migration] No backup found');
    return false;
  }

  try {
    localStorage.setItem(STORAGE_KEY, backup);
    console.log('✅ [Migration] Rollback successful');
    return true;
  } catch (error) {
    console.error('❌ [Migration] Rollback failed:', error);
    return false;
  }
}

/**
 * 清理备份数据
 */
function cleanupBackup() {
  console.log('🗑️ [Migration] Cleaning up backup...');
  localStorage.removeItem(BACKUP_KEY);
  localStorage.removeItem(`${BACKUP_KEY}-timestamp`);
  console.log('✅ [Migration] Backup cleaned up');
}

/**
 * 获取迁移状态
 */
function getMigrationStatus() {
  const hasOriginal = !!localStorage.getItem(STORAGE_KEY);
  const hasBackup = !!localStorage.getItem(BACKUP_KEY);
  const backupTime = localStorage.getItem(`${BACKUP_KEY}-timestamp`);

  return {
    hasOriginal,
    hasBackup,
    backupTime,
    status: hasBackup ? 'migrated' : hasOriginal ? 'not_migrated' : 'no_data',
  };
}

// 导出函数（用于脚本调用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    migrateContactsToStorageManager,
    rollbackMigration,
    cleanupBackup,
    getMigrationStatus,
  };
}

// 挂载到 window（用于浏览器控制台）
if (typeof window !== 'undefined') {
  window.contactMigration = {
    migrate: migrateContactsToStorageManager,
    rollback: rollbackMigration,
    cleanup: cleanupBackup,
    status: getMigrationStatus,
  };
  
  console.log(`
💡 Contact Migration Tools Available:
- window.contactMigration.migrate()   // 执行迁移
- window.contactMigration.rollback()  // 回滚迁移
- window.contactMigration.cleanup()   // 清理备份
- window.contactMigration.status()    // 查看状态
  `);
}

// 如果直接运行脚本，则执行迁移
if (typeof window !== 'undefined' && window.location) {
  console.log('ℹ️ [Migration] Script loaded. Call window.contactMigration.migrate() to start');
}
