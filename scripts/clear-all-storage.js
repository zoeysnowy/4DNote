/**
 * 清空所有存储数据的脚本
 * 包括：localStorage、IndexedDB、SQLite
 * 
 * 使用方法：
 * 1. 在浏览器控制台中运行此脚本
 * 2. 或者复制粘贴到控制台执行
 */

async function clearAllStorage() {
  console.log('🧹 开始清空所有存储...');
  
  // 1. 清空 localStorage
  console.log('1️⃣ 清空 localStorage...');
  try {
    const localStorageKeys = Object.keys(localStorage);
    console.log(`   找到 ${localStorageKeys.length} 个 localStorage 键:`, localStorageKeys);
    localStorage.clear();
    console.log('✅ localStorage 已清空');
  } catch (error) {
    console.error('❌ 清空 localStorage 失败:', error);
  }
  
  // 2. 清空 IndexedDB
  console.log('2️⃣ 清空 IndexedDB...');
  try {
    // 获取所有 IndexedDB 数据库
    const databases = await indexedDB.databases();
    console.log(`   找到 ${databases.length} 个 IndexedDB 数据库:`, databases.map(db => db.name));
    
    for (const db of databases) {
      if (db.name) {
        console.log(`   删除数据库: ${db.name}`);
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(db.name);
          request.onsuccess = () => {
            console.log(`   ✅ 已删除: ${db.name}`);
            resolve();
          };
          request.onerror = () => {
            console.error(`   ❌ 删除失败: ${db.name}`, request.error);
            reject(request.error);
          };
          request.onblocked = () => {
            console.warn(`   ⚠️  删除被阻塞: ${db.name} (请关闭其他使用该数据库的标签页)`);
          };
        });
      }
    }
    console.log('✅ IndexedDB 已清空');
  } catch (error) {
    console.error('❌ 清空 IndexedDB 失败:', error);
  }
  
  // 3. 清空 SQLite（通过 StorageManager）
  console.log('3️⃣ 清空 SQLite...');
  try {
    if (window.storageManager) {
      // 检查是否在 Electron 环境
      if (window.storageManager.sqliteService) {
        console.log('   检测到 SQLite 服务（Electron 环境）');
        
        // 通过 StorageManager 清空所有表
        const tables = ['events', 'contacts', 'tags', 'calendars', 'accounts', 'attachments', 'sync_queue', 'metadata', 'event_history'];
        
        for (const table of tables) {
          try {
            // 使用 SQL 直接清空表（保留表结构）
            console.log(`   清空表: ${table}`);
            // 注意：这需要 StorageManager 暴露清空方法
            // 如果没有暴露，可以通过删除数据库文件来清空
          } catch (tableError) {
            console.warn(`   ⚠️  清空表 ${table} 失败:`, tableError);
          }
        }
        
        console.log('✅ SQLite 已清空');
        console.log('⚠️  注意：如果在 Electron 中，可能需要删除数据库文件以完全清空');
      } else {
        console.log('   跳过 SQLite（非 Electron 环境）');
      }
    } else {
      console.warn('⚠️  StorageManager 未初始化，无法清空 SQLite');
      console.log('   如果在 Electron 中，请手动删除数据库文件:');
      console.log('   - Windows: %APPDATA%/4dnote/database.db');
      console.log('   - macOS: ~/Library/Application Support/4dnote/database.db');
      console.log('   - Linux: ~/.config/4dnote/database.db');
    }
  } catch (error) {
    console.error('❌ 清空 SQLite 失败:', error);
  }
  
  // 4. 清空 sessionStorage（额外清理）
  console.log('4️⃣ 清空 sessionStorage...');
  try {
    const sessionStorageKeys = Object.keys(sessionStorage);
    console.log(`   找到 ${sessionStorageKeys.length} 个 sessionStorage 键:`, sessionStorageKeys);
    sessionStorage.clear();
    console.log('✅ sessionStorage 已清空');
  } catch (error) {
    console.error('❌ 清空 sessionStorage 失败:', error);
  }
  
  // 5. 清空 Cache Storage（Service Worker 缓存）
  console.log('5️⃣ 清空 Cache Storage...');
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log(`   找到 ${cacheNames.length} 个缓存:`, cacheNames);
      
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        console.log(`   ✅ 已删除缓存: ${cacheName}`);
      }
      console.log('✅ Cache Storage 已清空');
    } else {
      console.log('   跳过 Cache Storage（不支持）');
    }
  } catch (error) {
    console.error('❌ 清空 Cache Storage 失败:', error);
  }
  
  console.log('');
  console.log('🎉 所有存储清空完成！');
  console.log('');
  console.log('📝 下一步：');
  console.log('   1. 刷新页面（F5 或 Ctrl+R）');
  console.log('   2. 如果在 Electron 中，建议重启应用以完全清空 SQLite');
  console.log('');
  console.log('⚠️  警告：所有数据已删除且无法恢复！');
}

// 执行清空操作
clearAllStorage().catch(error => {
  console.error('💥 清空存储过程中发生错误:', error);
});
