/**
 * SQLite Storage Tests
 * 
 * ⚠️ 这些测试仅在 Electron 环境中运行
 * 在浏览器环境中，这些测试会被跳过
 * 
 * 运行方式：
 * 1. 在 Electron 环境启动应用：npm run e
 * 2. 打开开发者工具控制台
 * 3. 运行：testSQLiteModule()
 */

/**
 * 快速重建损坏的 SQLite 数据库
 */
async function rebuildSQLiteDatabase() {
  console.log('🔄 Rebuilding SQLite database...');
  
  if (typeof window === 'undefined' || !(window as any).electronAPI) {
    console.error('❌ Not in Electron environment');
    return;
  }
  
  try {
    const { sqliteService } = await import('../services/storage/SQLiteService');
    await sqliteService.rebuildDatabase();
    console.log('✅ Database rebuilt successfully');
    console.log('💡 Please run testCRUDIntegration() again');
  } catch (error) {
    console.error('❌ Failed to rebuild database:', error);
  }
}

/**
 * 测试 SQLite 存储模块
 */
import { formatTimeForStorage } from '../utils/timeUtils';

async function testSQLiteModule() {
  console.log('🧪 SQLite Storage Module Test Started');
  console.log('═══════════════════════════════════════');

  // 检查 Electron 环境
  if (typeof window === 'undefined' || !(window as any).electronAPI) {
    console.log('⚠️  Not in Electron environment - tests skipped');
    console.log('   Please run: npm run e');
    return;
  }

  try {
    // 动态导入 SQLiteService（仅在 Electron 环境）
    const { sqliteService } = await import('../services/storage/SQLiteService');

    // Test 0: 清理旧数据
    console.log('\n0️⃣  Cleaning up old test data...');
    try {
      await sqliteService.initialize();
      await sqliteService.clearAll();
      console.log('✅ Old data cleared');
    } catch (e) {
      console.log('ℹ️  No old data to clear');
    }

    // Test 1: 初始化
    console.log('\n1️⃣  Testing SQLite initialization...');
    await sqliteService.initialize();
    console.log('✅ SQLite initialized successfully');

    // Test 2: Account Management
    console.log('\n2️⃣  Testing Account CRUD...');
    const testAccount = {
      id: 'acc-test-001',
      provider: 'outlook' as const,
      email: 'test@outlook.com',
      displayName: 'Test User',
      isActive: true,
      syncEnabled: true,
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    };

    await sqliteService.createAccount(testAccount);
    const retrievedAccount = await sqliteService.getAccount(testAccount.id);
    console.log('✅ Account created and retrieved:', retrievedAccount?.email);

    // Test 3: Calendar Management
    console.log('\n3️⃣  Testing Calendar CRUD...');
    const testCalendar = {
      id: 'cal-test-001',
      accountId: testAccount.id,
      remoteId: 'remote-cal-001',
      name: 'Test Calendar',
      type: 'plan' as const,
      isPrimary: true,
      isVisible: true,
      syncEnabled: true,
      canEdit: true,
      canDelete: true,
      canShare: false,
      isDefault: true,
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    };

    await sqliteService.createCalendar(testCalendar);
    const calendars = await sqliteService.getCalendarsByAccount(testAccount.id);
    console.log('✅ Calendar created, found', calendars.length, 'calendar(s)');

    // Test 4: Event Management
    console.log('\n4️⃣  Testing Event CRUD...');
    const testEvent = {
      id: 'evt-test-001',
      title: { simpleTitle: 'SQLite Test Event' },
      startTime: formatTimeForStorage(new Date()),
      endTime: formatTimeForStorage(new Date(Date.now() + 3600000)),
      isAllDay: false,
      description: 'This is a test event in SQLite',
      sourceAccountId: testAccount.id,
      sourceCalendarId: testCalendar.id,
      isCompleted: false,
      isTimer: false,
      isPlan: true,
      tags: [],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    };

    await sqliteService.createEvent(testEvent);
    const retrievedEvent = await sqliteService.getEvent(testEvent.id);
    console.log('✅ Event created:', retrievedEvent?.title);

    // Test 5: Batch Create Events
    console.log('\n5️⃣  Testing Batch Create...');
    const batchEvents = Array.from({ length: 5 }, (_, i) => ({
      id: `evt-batch-${i + 1}`,
      title: { simpleTitle: `Batch Event ${i + 1}` },
      startTime: formatTimeForStorage(new Date(Date.now() + i * 3600000)),
      endTime: formatTimeForStorage(new Date(Date.now() + (i + 1) * 3600000)),
      isAllDay: false,
      sourceAccountId: testAccount.id,
      sourceCalendarId: testCalendar.id,
      isCompleted: false,
      isTimer: false,
      isPlan: true,
      tags: [],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    }));

    const batchResult = await sqliteService.batchCreateEvents(batchEvents);
    console.log('✅ Batch created:', batchResult.success.length, 'events');

    // Test 6: Query Events
    console.log('\n6️⃣  Testing Query with filters...');
    const queryResult = await sqliteService.queryEvents({
      filters: {
        accountIds: [testAccount.id]
      },
      limit: 10
    });
    console.log('✅ Query result:', queryResult.items.length, 'events found');
    console.log('   Total:', queryResult.total, 'HasMore:', queryResult.hasMore);

    // Test 7: Full-Text Search (FTS5)
    console.log('\n7️⃣  Testing FTS5 Full-Text Search...');
    const searchResult = await sqliteService.searchEvents('Test', { limit: 10 });
    console.log('✅ Search result:', searchResult.items.length, 'events found');

    // Test 8: Storage Stats
    console.log('\n8️⃣  Testing Storage Stats...');
    const stats = await sqliteService.getStorageStats();
    console.log('✅ Storage stats:');
    console.log('   Accounts:', stats.sqlite?.accountsCount);
    console.log('   Calendars:', stats.sqlite?.calendarsCount);
    console.log('   Events:', stats.sqlite?.eventsCount);
    console.log('   Database size:', (stats.sqlite?.used || 0) / 1024 / 1024, 'MB');

    // Test 9: Update Event
    console.log('\n9️⃣  Testing Event Update...');
    await sqliteService.updateEvent(testEvent.id, {
      title: { simpleTitle: 'Updated SQLite Test Event' },
      description: 'This event has been updated'
    });
    const updatedEvent = await sqliteService.getEvent(testEvent.id);
    console.log('✅ Event updated:', updatedEvent?.title);

    // Test 10: Cleanup
    console.log('\n🧹 Testing Cleanup...');
    await sqliteService.clearAll();
    const afterClear = await sqliteService.getStorageStats();
    console.log('✅ All data cleared');
    console.log('   Events after clear:', afterClear.sqlite?.eventsCount);

    console.log('\n═══════════════════════════════════════');
    console.log('✅ All SQLite tests passed!');
    console.log('═══════════════════════════════════════');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// 在开发环境自动暴露到 window
if (typeof window !== 'undefined') {
  (window as any).testSQLiteModule = testSQLiteModule;
  (window as any).rebuildSQLiteDatabase = rebuildSQLiteDatabase;
  
  // 检查 Electron 环境
  if ((window as any).electronAPI) {
    console.log('🧪 SQLite Test Module loaded (Electron environment)');
    console.log('   Run: testSQLiteModule()');
    console.log('   🔧 Rebuild corrupted DB: rebuildSQLiteDatabase()');
  } else {
    console.log('ℹ️  SQLite Test Module loaded but not in Electron environment');
    console.log('   SQLite tests require Electron. Run: npm run e');
  }
}

// 导出供其他模块使用
export { testSQLiteModule };
