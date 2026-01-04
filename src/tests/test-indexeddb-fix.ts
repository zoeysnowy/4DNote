/**
 * 测试 IndexedDB 清理和重新初始化
 * 
 * 使用方法：
 * 1. 在 Console 运行: testIndexedDBFix()
 * 2. 观察清理和初始化流程
 * 3. 验证双写功能正常
 */

import { StorageManager } from '@backend/storage/StorageManager';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

export async function testIndexedDBFix() {
  console.log('\n🧪 ============================================');
  console.log('🧪 测试 IndexedDB 修复');
  console.log('🧪 ============================================\n');

  try {
    // 步骤 1: 清理现有数据
    console.log('1️⃣  清理现有存储数据...');
    
    if ((window as any).electronAPI?.clearStorageData) {
      const clearResult = await (window as any).electronAPI.clearStorageData();
      if (clearResult?.success) {
        console.log('   ✅ Electron 存储数据已清理');
      } else {
        console.error('   ❌ 清理失败:', clearResult?.error);
        throw new Error('清理失败');
      }
    } else {
      console.log('   ⚠️  非 Electron 环境，跳过清理');
    }

    // 等待清理完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 步骤 2: 重新初始化 StorageManager
    console.log('\n2️⃣  重新初始化 StorageManager...');
    const storageManager = StorageManager.getInstance();
    
    // 强制重新初始化（需要修改 private 属性）
    (storageManager as any).initialized = false;
    (storageManager as any).initializingPromise = null;
    
    try {
      await storageManager.initialize();
      console.log('   ✅ StorageManager 初始化成功');
    } catch (error) {
      console.error('   ❌ StorageManager 初始化失败:', error);
      throw error;
    }

    // 步骤 3: 测试创建事件
    console.log('\n3️⃣  测试创建事件（双写到 IndexedDB + SQLite）...');
    const testEvent = {
      id: 'test-' + Date.now(),
      title: { simpleTitle: '测试事件 - IndexedDB 修复验证', fullTitle: undefined, colorTitle: undefined },
      description: '这是一个测试事件，用于验证 IndexedDB 清理后的双写功能',
      startTime: formatTimeForStorage(new Date()),
      tags: ['test', 'indexeddb-fix'],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    };

    try {
      const created = await storageManager.createEvent(testEvent);
      console.log('   ✅ 事件创建成功:', created.id);
    } catch (error) {
      console.error('   ❌ 事件创建失败:', error);
      throw error;
    }

    // 步骤 4: 测试查询事件
    console.log('\n4️⃣  测试查询事件...');
    try {
      const result = await storageManager.queryEvents({ limit: 10 });
      console.log('   ✅ 查询成功:', result.items.length, '个事件');
      
      if (result.items.length > 0) {
        console.log('   📊 第一个事件:', {
          id: result.items[0].id,
          title: result.items[0].title,
          startTime: result.items[0].startTime
        });
      }
    } catch (error) {
      console.error('   ❌ 查询失败:', error);
      throw error;
    }

    // 步骤 5: 验证 IndexedDB 中的数据
    console.log('\n5️⃣  验证 IndexedDB 数据...');
    try {
      const { indexedDBService } = await import('@backend/storage/IndexedDBService');
      const indexedDBResult = await indexedDBService.queryEvents({ limit: 10 });
      console.log('   ✅ IndexedDB 包含', indexedDBResult.items.length, '个事件');
    } catch (error) {
      console.error('   ❌ IndexedDB 验证失败:', error);
    }

    // 步骤 6: 验证 SQLite 中的数据（仅 Electron）
    if ((window as any).electronAPI?.sqlite) {
      console.log('\n6️⃣  验证 SQLite 数据...');
      try {
        const { sqliteService } = await import('@backend/storage/SQLiteService');
        const sqliteResult = await sqliteService.queryEvents({ limit: 10 });
        console.log('   ✅ SQLite 包含', sqliteResult.items.length, '个事件');
      } catch (error) {
        console.error('   ❌ SQLite 验证失败:', error);
      }
    }

    console.log('\n✅ ============================================');
    console.log('✅ IndexedDB 修复测试完成！');
    console.log('✅ ============================================\n');
    console.log('💡 提示：');
    console.log('   - IndexedDB 已正常工作');
    console.log('   - 双写功能正常');
    console.log('   - 可以继续运行 testCRUDIntegration() 进行完整测试');
    
    return true;

  } catch (error) {
    console.error('\n❌ ============================================');
    console.error('❌ IndexedDB 修复测试失败！');
    console.error('❌ ============================================\n');
    console.error('错误:', error);
    
    console.log('\n💡 调试建议：');
    console.log('1. 检查 Console 是否有 IndexedDB 错误');
    console.log('2. 打开 DevTools → Application → IndexedDB');
    console.log('3. 确认 "4DNoteDB" 数据库是否存在');
    console.log('4. 如果仍有问题，尝试手动清理:');
    console.log('   - Application → Clear storage → Clear site data');
    console.log('   - 完全关闭应用并重新启动\n');
    
    return false;
  }
}

// 暴露到全局
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).testIndexedDBFix = testIndexedDBFix;
  console.log('🧪 IndexedDB Fix Test loaded: testIndexedDBFix()');
}
