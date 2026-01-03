/**
 * Storage 模块测试页面
 * 用于测试 IndexedDBService 的基本功能
 */

import { indexedDBService } from '../services/storage';
import type { StorageEvent, Account, Calendar } from '../services/storage/types';
import { formatTimeForStorage } from '../utils/timeUtils';

export async function testStorageModule() {
  console.log('========================================');
  console.log('🧪 Storage Module Test Started');
  console.log('========================================\n');

  try {
    // 1. 初始化测试
    console.log('1️⃣  Testing IndexedDB Initialization...');
    await indexedDBService.initialize();
    console.log('✅ IndexedDB initialized\n');

    // 2. 测试账号管理
    console.log('2️⃣  Testing Account Management...');
    const testAccount: Account = {
      id: 'test-account-1',
      email: 'test@outlook.com',
      provider: 'outlook',
      displayName: 'Test User',
      syncEnabled: true,
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    };
    
    await indexedDBService.createAccount(testAccount);
    const retrievedAccount = await indexedDBService.getAccount(testAccount.id);
    console.log('✅ Account created and retrieved:', retrievedAccount?.email);
    console.log('');

    // 3. 测试日历管理
    console.log('3️⃣  Testing Calendar Management...');
    const testCalendar: Calendar = {
      id: 'test-calendar-1',
      accountId: testAccount.id,
      name: 'Test Calendar',
      color: '#3B82F6',
      isDefault: true,
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    };
    
    await indexedDBService.createCalendar(testCalendar);
    const calendars = await indexedDBService.getCalendarsByAccount(testAccount.id);
    console.log('✅ Calendar created, account has', calendars.length, 'calendars');
    console.log('');

    // 4. 测试事件管理
    console.log('4️⃣  Testing Event Management...');
    const testEvent: StorageEvent = {
      id: 'test-event-1',
      title: { simpleTitle: 'Test Event' },
      description: 'This is a test event',
      startTime: formatTimeForStorage(new Date(2025, 11, 1, 10, 0, 0)),
      endTime: formatTimeForStorage(new Date(2025, 11, 1, 11, 0, 0)),
      sourceAccountId: testAccount.id,
      sourceCalendarId: testCalendar.id,
      source: 'local',
      tags: ['test', 'demo'],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    };
    
    await indexedDBService.createEvent(testEvent);
    const retrievedEvent = await indexedDBService.getEvent(testEvent.id);
    console.log('✅ Event created:', retrievedEvent?.title);
    console.log('');

    // 5. 测试批量创建
    console.log('5️⃣  Testing Batch Create...');
    const batchEvents: StorageEvent[] = [];
    for (let i = 0; i < 5; i++) {
      batchEvents.push({
        id: `batch-event-${i}`,
        title: { simpleTitle: `Batch Event ${i}` },
        startTime: formatTimeForStorage(new Date(Date.now() + i * 3600000)),
        endTime: formatTimeForStorage(new Date(Date.now() + (i + 1) * 3600000)),
        source: 'local',
        createdAt: formatTimeForStorage(new Date()),
        updatedAt: formatTimeForStorage(new Date())
      });
    }
    
    await indexedDBService.batchCreateEvents(batchEvents);
    console.log('✅ Batch created', batchEvents.length, 'events');
    console.log('');

    // 6. 测试查询
    console.log('6️⃣  Testing Query...');
    const queryResult = await indexedDBService.queryEvents({
      orderBy: 'startTime',
      orderDirection: 'asc',
      limit: 10
    });
    console.log('✅ Query returned', queryResult.items.length, 'events');
    console.log('   Total:', queryResult.total, '| Has more:', queryResult.hasMore);
    console.log('');

    // 7. 测试存储统计
    console.log('7️⃣  Testing Storage Stats...');
    const estimate = await indexedDBService.getStorageEstimate();
    const usageMB = (estimate.usage / (1024 * 1024)).toFixed(2);
    const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(2);
    console.log('✅ Storage usage:', usageMB, 'MB /', quotaMB, 'MB');
    console.log('');

    // 8. 清理测试数据
    console.log('8️⃣  Cleaning up test data...');
    await indexedDBService.clearAll();
    console.log('✅ Test data cleaned');
    console.log('');

    console.log('========================================');
    console.log('✅ All tests passed!');
    console.log('========================================');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// 自动运行测试（如果在开发环境）
if (import.meta.env && (import.meta.env as any).DEV) {
  console.log('🔧 Dev mode detected, storage tests available');
  console.log('💡 Run testStorageModule() in console to test storage');
  
  // 暴露到全局供控制台调用
  (window as any).testStorageModule = testStorageModule;
}
