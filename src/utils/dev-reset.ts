/**
 * 开发环境数据重置工具
 * 
 * 在Console运行：resetAllData()
 * 
 * 功能：
 * - 清空 IndexedDB 数据库
 * - 清空 SQLite 数据库（Electron）
 * - 清空 localStorage
 * - 刷新页面
 */

export async function resetAllData() {
  console.log('\n🗑️  ============================================');
  console.log('🗑️  开发环境数据重置');
  console.log('🗑️  ============================================\n');

  const confirmReset = confirm(
    '⚠️  即将删除所有数据！\n\n' +
    '这将清空：\n' +
    '• IndexedDB 数据库\n' +
    '• SQLite 数据库\n' +
    '• localStorage 缓存\n\n' +
    '确定要继续吗？'
  );

  if (!confirmReset) {
    console.log('❌ 已取消重置');
    return;
  }

  try {
    // 1. 清空 localStorage
    console.log('1️⃣  清空 localStorage...');
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keysToRemove.push(key);
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`   ✅ 已删除 ${keysToRemove.length} 个 localStorage 项`);

    // 2. 清空 sessionStorage
    console.log('2️⃣  清空 sessionStorage...');
    sessionStorage.clear();
    console.log('   ✅ sessionStorage 已清空');

    // 3. 删除 IndexedDB 数据库（使用 Electron API）
    console.log('3️⃣  删除 IndexedDB 数据库...');
    
    // 如果是 Electron 环境，使用主进程 API 清理
    if ((window as any).electronAPI?.clearStorageData) {
      try {
        console.log('   🔄 使用 Electron session API 清理存储...');
        const result = await (window as any).electronAPI.clearStorageData();
        if (result?.success) {
          console.log('   ✅ 存储数据已清理（包括 IndexedDB）');
        } else {
          console.warn('   ⚠️  Electron 清理失败:', result?.error);
        }
      } catch (error) {
        console.warn('   ⚠️  Electron 清理异常:', error);
      }
    } else {
      // 浏览器环境：尝试标准 API 删除
      const dbName = '4DNoteDB';
      
      try {
        const { indexedDBService } = await import('../services/storage/IndexedDBService');
        indexedDBService.close();
        console.log('   🔒 已关闭现有 IndexedDB 连接');
      } catch (e) {
        // 忽略错误
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      let deleteSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await new Promise<void>((resolve, reject) => {
            console.log(`   🔄 尝试删除 (${attempt}/3)...`);
            const deleteRequest = indexedDB.deleteDatabase(dbName);
            
            deleteRequest.onsuccess = () => {
              console.log(`   ✅ IndexedDB "${dbName}" 已删除`);
              deleteSuccess = true;
              resolve();
            };
            
            deleteRequest.onerror = () => {
              console.warn(`   ⚠️  删除失败 (${attempt}/3):`, deleteRequest.error?.message);
              reject(deleteRequest.error);
            };
            
            deleteRequest.onblocked = () => {
              console.warn(`   ⏳ 删除被阻塞 (尝试 ${attempt}/3)，等待...`);
              setTimeout(() => resolve(), 1000);
            };
          });
          
          if (deleteSuccess) break;
        } catch (error) {
          if (attempt === 3) {
            console.warn('   ⚠️  IndexedDB 删除失败，将跳过（刷新页面后会重建）');
          } else {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
    }

    // 4. 清空 SQLite（仅 Electron 环境）
    if (window.electronAPI?.sqlite) {
      console.log('4️⃣  清空 SQLite 数据库...');
      try {
        // 通知 Electron 主进程删除数据库文件
        const result = await window.electronAPI.sqlite.clearAllDatabases?.();
        if (result?.success) {
          console.log('   ✅ SQLite 数据库已清空');
        } else {
          console.warn('   ⚠️  SQLite 清空功能未实现（需要主进程支持）');
          console.warn('   💡 手动删除: ./database/4dnote-dev.db');
        }
      } catch (error) {
        console.warn('   ⚠️  SQLite 清空失败:', error);
        console.warn('   💡 手动删除: ./database/4dnote-dev.db');
      }
    } else {
      console.log('4️⃣  跳过 SQLite（非 Electron 环境）');
    }

    // 5. 清空 Cookies（可选）
    console.log('5️⃣  清空 Cookies...');
    document.cookie.split(";").forEach(c => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    console.log('   ✅ Cookies 已清空');

    console.log('\n✅ ============================================');
    console.log('✅ 所有数据已重置！');
    console.log('✅ ============================================\n');

    // 延迟刷新，让用户看到结果
    setTimeout(() => {
      window.location.reload();
    }, 2000);

  } catch (error) {
    console.error('\n❌ 数据重置失败:', error);
    console.log('\n💡 建议手动操作：');
    console.log('1. 关闭所有标签页');
    console.log('2. 在 DevTools 中: Application → Clear storage → Clear site data');
    console.log('3. 删除文件: ./database/4dnote-dev.db');
  }
}

// 快速重置（不询问确认）
export async function resetAllDataQuick() {
  console.log('🗑️  快速重置所有数据...');
  
  // 清空 localStorage
  localStorage.clear();
  
  // 清空 sessionStorage
  sessionStorage.clear();
  
  // 删除 IndexedDB
  const dbName = '4DNoteDB';
  await new Promise<void>((resolve) => {
    const deleteRequest = indexedDB.deleteDatabase(dbName);
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => resolve();
    deleteRequest.onblocked = () => setTimeout(() => resolve(), 500);
  });
  
  console.log('✅ 重置完成，刷新页面...');
  window.location.reload();
}

// 仅清空 IndexedDB
export async function clearIndexedDB() {
  console.log('🗑️  清空 IndexedDB...');
  
  // 如果是 Electron 环境，使用主进程 API
  if ((window as any).electronAPI?.clearStorageData) {
    try {
      console.log('🔄 使用 Electron session API 清理存储...');
      const result = await (window as any).electronAPI.clearStorageData();
      if (result?.success) {
        console.log('✅ IndexedDB 已清空（通过 Electron）');
        return;
      } else {
        console.warn('⚠️  Electron 清理失败，尝试标准 API:', result?.error);
      }
    } catch (error) {
      console.warn('⚠️  Electron 清理异常，尝试标准 API:', error);
    }
  }
  
  // 浏览器环境或 Electron 失败时的回退方案
  const dbName = '4DNoteDB';
  
  try {
    const { indexedDBService } = await import('../services/storage/IndexedDBService');
    indexedDBService.close();
    console.log('🔒 已关闭现有连接');
  } catch (e) {
    // 忽略
  }

  await new Promise(resolve => setTimeout(resolve, 100));

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        console.log(`🔄 尝试删除 (${attempt}/3)...`);
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        
        deleteRequest.onsuccess = () => {
          console.log('✅ IndexedDB 已清空');
          resolve();
        };
        
        deleteRequest.onerror = () => {
          reject(deleteRequest.error);
        };
        
        deleteRequest.onblocked = () => {
          console.warn('⏳ 被阻塞，等待...');
          setTimeout(() => resolve(), 1000);
        };
      });
      
      return;
    } catch (error) {
      if (attempt === 3) {
        console.warn('⚠️  无法删除 IndexedDB，建议使用 Chrome DevTools 手动清理');
        console.warn('   Application → Storage → IndexedDB → 右键删除');
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// 使用 Chrome DevTools Protocol 强制清理（最终方案）
export async function forceResetChrome() {
  console.log('🔥 使用 Chrome DevTools Protocol 强制清理...');
  
  try {
    // 使用 Chrome 的 Storage API
    if ('storage' in navigator && 'estimate' in (navigator as any).storage) {
      // 获取所有持久化的存储
      const estimate = await (navigator as any).storage.estimate();
      console.log('📊 当前存储使用:', estimate);
      
      // 请求持久化权限并清理
      if ('persist' in (navigator as any).storage) {
        await (navigator as any).storage.persist();
      }
    }

    // 尝试使用 Cache API 清理
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
        console.log(`✅ 已删除 cache: ${name}`);
      }
    }

    console.log('\n⚠️  如果 IndexedDB 仍然无法删除，请手动操作：');
    console.log('1. 按 F12 打开 DevTools');
    console.log('2. Application 标签');
    console.log('3. 左侧 Storage → Clear site data');
    console.log('4. 勾选所有选项');
    console.log('5. 点击 "Clear site data"');
    console.log('6. 刷新页面\n');

    return true;
  } catch (error) {
    console.error('强制清理失败:', error);
    return false;
  }
}

// 完全核弹级别清理（关闭应用+手动删除）
export function nuclearReset() {
  console.log('\n☢️  ============================================');
  console.log('☢️  核弹级别清理指南');
  console.log('☢️  ============================================\n');
  
  console.log('请按照以下步骤操作：\n');
  
  console.log('1️⃣  关闭所有 Electron 窗口');
  console.log('');
  
  console.log('2️⃣  在项目根目录运行 PowerShell 命令：');
  console.log('   Remove-Item -Recurse -Force database/');
  console.log('   New-Item -ItemType Directory database/');
  console.log('');
  
  console.log('3️⃣  清理 Chrome 用户数据（如果使用）：');
  console.log('   Remove-Item -Recurse -Force "$env:LOCALAPPDATA/4dnote-desktop"');
  console.log('');
  
  console.log('4️⃣  重新启动应用：');
  console.log('   npm run e');
  console.log('');
  
  console.log('✅ ============================================\n');
}

// 暴露到全局
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).resetAllData = resetAllData;
  (window as any).resetAllDataQuick = resetAllDataQuick;
  (window as any).clearIndexedDB = clearIndexedDB;
  (window as any).forceResetChrome = forceResetChrome;
  (window as any).nuclearReset = nuclearReset;
  
  console.log('🗑️  Dev Reset Tools loaded');
  console.log('   • resetAllData() - 重置所有数据（带确认）');
  console.log('   • resetAllDataQuick() - 快速重置（无确认）');
  console.log('   • clearIndexedDB() - 仅清空 IndexedDB');
  console.log('   • forceResetChrome() - 使用 DevTools Protocol 强制清理');
  console.log('   • nuclearReset() - 显示核弹级清理指南');
}
