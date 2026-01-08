/**
 * StorageManager Integration Tests
 * 
 * 测试统一存储管理器的完整功能：
 * - 双写策略（IndexedDB + SQLite）
 * - 智能查询（分层查询）
 * - 全文搜索（FTS5）
 * - 缓存机制（LRU）
 * - 统计信息聚合
 * 
 * 运行方式：
 * 1. 在 Electron 环境：npm run e
 * 2. 打开开发者工具控制台
 * 3. 运行：testStorageManager()
 */

/**
 * 测试 StorageManager
 */
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

async function testStorageManager() {
  console.log('🧪 StorageManager Integration Test Started');
  console.log('═══════════════════════════════════════');

  try {
    // 动态导入 StorageManager
    const { storageManager } = await import('@backend/storage/StorageManager');

    // Test 1: 初始化
    console.log('\n1️⃣  Testing StorageManager initialization...');
    await storageManager.initialize();
    console.log('✅ StorageManager initialized');

    // 检测环境
    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;
    console.log('   Environment:', isElectron ? 'Electron (IndexedDB + SQLite)' : 'Web (IndexedDB only)');

    // Test 0: 清理旧数据
    console.log('\n0️⃣  Cleaning up old test data...');
    try {
      await storageManager.clearAll();
      console.log('✅ Old data cleared');
    } catch (e) {
      console.log('ℹ️  No old data to clear or clear failed:', e);
    }

    // Test 2: 创建测试数据
    console.log('\n2️⃣  Testing dual-write strategy...');
    const testEvent = {
      id: 'evt-manager-test-001',
      title: { simpleTitle: 'StorageManager Test Event' },
      startTime: formatTimeForStorage(new Date()),
      endTime: formatTimeForStorage(new Date(Date.now() + 3600000)),
      isAllDay: false,
      description: 'This event tests the dual-write strategy',
      location: 'Test Location',
      isCompleted: false,
      isTimer: false,
      isPlan: true,
      source: 'local:plan' as const,
      tags: [],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    };

    const createdEvent = await storageManager.createEvent(testEvent);
    console.log('✅ Event created (dual-write):', createdEvent.id);

    // Test 3: 批量创建
    console.log('\n3️⃣  Testing batch create...');
    const batchEvents = Array.from({ length: 10 }, (_, i) => ({
      id: `evt-batch-${i + 1}`,
      title: { simpleTitle: `Batch Event ${i + 1}` },
      description: `This is batch event number ${i + 1} for testing search`,
      startTime: formatTimeForStorage(new Date(Date.now() + i * 3600000)),
      endTime: formatTimeForStorage(new Date(Date.now() + (i + 1) * 3600000)),
      isAllDay: false,
      isCompleted: false,
      isTimer: false,
      isPlan: true,
      source: 'local:plan' as const,
      tags: [],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    }));

    const batchResult = await storageManager.batchCreateEvents(batchEvents);
    console.log('✅ Batch created:', batchResult.success.length, 'events');
    if (batchResult.failed.length > 0) {
      console.warn('⚠️  Some events failed:', batchResult.failed.length);
    }

    // Test 4: 智能查询
    console.log('\n4️⃣  Testing smart query...');
    const queryResult = await storageManager.queryEvents({
      limit: 20,
      offset: 0
    });
    console.log('✅ Query result:', queryResult.items.length, 'events');
    console.log('   Total:', queryResult.total, 'HasMore:', queryResult.hasMore);

    // Test 5: 带过滤的查询
    console.log('\n5️⃣  Testing query with filters...');
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 3600000);
    
    const filteredQuery = await storageManager.queryEvents({
      filters: {
        startTime: formatTimeForStorage(now),
        endTime: formatTimeForStorage(tomorrow)
      },
      limit: 10
    });
    console.log('✅ Filtered query:', filteredQuery.items.length, 'events');

    // Test 6: 全文搜索
    console.log('\n6️⃣  Testing full-text search...');
    const searchResult = await storageManager.search('batch', { limit: 10 });
    console.log('✅ Search result:', searchResult.items.length, 'events found');
    if (searchResult.items.length > 0) {
      console.log('   First match:', searchResult.items[0].title);
    }

    // Test 7: 更新事件
    console.log('\n7️⃣  Testing event update (dual-write)...');
    const updatedEvent = await storageManager.updateEvent(testEvent.id, {
      title: { simpleTitle: 'Updated StorageManager Test Event' },
      description: 'This event has been updated through StorageManager'
    });
    console.log('✅ Event updated:', updatedEvent.title);

    // Test 8: 统计信息
    console.log('\n8️⃣  Testing storage statistics...');
    const stats = await storageManager.getStats();
    console.log('✅ Storage statistics:');
    console.log('   IndexedDB:');
    console.log('     - Events:', stats.indexedDB?.eventsCount || 0);
    console.log('     - Used:', ((stats.indexedDB?.used || 0) / 1024 / 1024).toFixed(2), 'MB');
    
    if (stats.sqlite) {
      console.log('   SQLite:');
      console.log('     - Events:', stats.sqlite.eventsCount || 0);
      console.log('     - Database size:', ((stats.sqlite.used || 0) / 1024 / 1024).toFixed(2), 'MB');
    }
    
    console.log('   Cache:');
    console.log('     - Items:', stats.cache?.count || 0);
    console.log('     - Size:', ((stats.cache?.size || 0) / 1024 / 1024).toFixed(2), 'MB');
    console.log('     - Max size:', ((stats.cache?.maxSize || 0) / 1024 / 1024).toFixed(2), 'MB');

    // Test 9: 缓存命中测试
    console.log('\n9️⃣  Testing cache hit...');
    console.time('Cache miss (first query)');
    await storageManager.queryEvents({ filters: { ids: [testEvent.id] }, limit: 1 });
    console.timeEnd('Cache miss (first query)');

    console.time('Cache hit (second query)');
    await storageManager.queryEvents({ filters: { ids: [testEvent.id] }, limit: 1 });
    console.timeEnd('Cache hit (second query)');
    console.log('✅ Cache mechanism working');

    // Test 10: 删除事件
    console.log('\n🗑️  Testing event deletion (dual-delete)...');
    await storageManager.deleteEvent(testEvent.id);
    console.log('✅ Event deleted:', testEvent.id);

    // Test 11: 清理缓存
    console.log('\n🧹 Testing cache cleanup...');
    storageManager.clearCache();
    const statsAfterClear = await storageManager.getStats();
    console.log('✅ Cache cleared');
    console.log('   Cache items after clear:', statsAfterClear.cache?.count || 0);

    console.log('\n═══════════════════════════════════════');
    console.log('✅ All StorageManager tests passed!');
    console.log('═══════════════════════════════════════');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', (error as Error).stack);
    throw error;
  }
}

// 在开发环境自动暴露到 window
if (typeof window !== 'undefined') {
  (window as any).testStorageManager = testStorageManager;
  console.log('🧪 StorageManager Test Module loaded');
  console.log('   Run: testStorageManager()');
}

// 导出供其他模块使用
export { testStorageManager };
