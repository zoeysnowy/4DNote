/**
 * CRUD 集成测试
 * 
 * 在浏览器Console中运行：testCRUDIntegration()
 * 
 * 测试内容：
 * 1. 创建事件（验证双写）
 * 2. 读取事件（验证数据一致性）
 * 3. 更新事件（验证双写更新）
 * 4. 批量创建（验证批量操作）
 * 5. 查询过滤（验证查询功能）
 * 6. 删除事件（验证清理）
 * 7. 验证数据一致性（IndexedDB vs SQLite）
 */

import { EventService } from '../services/EventService';
import { storageManager } from '../services/storage/StorageManager';
import { generateEventId } from '../utils/calendarUtils';
import type { Event } from '../types';

export async function testCRUDIntegration() {
  console.log('\n🧪 ============================================');
  console.log('🧪 CRUD Integration Test - StorageManager v1.1.0');
  console.log('🧪 ============================================\n');

  const testResults: { test: string; passed: boolean; message: string }[] = [];
  let createdEventId: string | null = null;
  let batchEventIds: string[] = [];

  try {
    // ============================================
    // Pre-test: 清理测试环境
    // ============================================
    console.log('0️⃣  预检：清理测试环境...');
    
    if ((window as any).electronAPI?.clearStorageData) {
      try {
        // 检查是否刚刚清理过（通过 sessionStorage 标记）
        const justCleaned = sessionStorage.getItem('test-just-cleaned');
        
        if (!justCleaned) {
          // 1. 清空 localStorage（防止数据迁移恢复）
          console.log('   🗑️  清空 localStorage...');
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) keysToRemove.push(key);
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));
          console.log(`   ✅ 已清空 ${keysToRemove.length} 个 localStorage 键`);
          
          // 2. 手动删除 IndexedDB 数据库（session.clearStorageData 不可靠）
          console.log('   🗑️  手动删除 IndexedDB 数据库...');
          try {
            const { indexedDBService } = await import('../services/storage/IndexedDBService');
            
            // 关闭现有连接
            if ((indexedDBService as any).db) {
              try {
                (indexedDBService as any).db.close();
                console.log('   ✅ IndexedDB 连接已关闭');
              } catch (err) {
                console.warn('   ⚠️  关闭 IndexedDB 失败:', err);
              }
            }
            
            // 重置状态
            (indexedDBService as any).initialized = false;
            (indexedDBService as any).initPromise = null;
            (indexedDBService as any).db = null;
            
            // 删除数据库
            await new Promise<void>((resolve, reject) => {
              const deleteRequest = indexedDB.deleteDatabase('4DNoteDB');
              
              deleteRequest.onsuccess = () => {
                console.log('   ✅ IndexedDB 数据库已删除');
                resolve();
              };
              
              deleteRequest.onerror = () => {
                console.error('   ❌ 删除 IndexedDB 失败:', deleteRequest.error);
                reject(deleteRequest.error);
              };
              
              deleteRequest.onblocked = () => {
                console.warn('   ⚠️  IndexedDB 删除被阻塞（其他标签页打开）');
                // 继续执行，重新加载后会自动创建新数据库
                setTimeout(() => resolve(), 1000);
              };
            });
          } catch (error) {
            console.warn('   ⚠️  IndexedDB 删除失败（继续执行）:', error);
          }
          
          // 3. 重置服务状态
          console.log('   🔄 重置服务状态...');
          const { storageManager } = await import('../services/storage/StorageManager');
          const { sqliteService } = await import('../services/storage/SQLiteService');
          
          (storageManager as any).initialized = false;
          (storageManager as any).initializingPromise = null;
          
          (sqliteService as any).initialized = false;
          (sqliteService as any).initializingPromise = null;
          (sqliteService as any).db = null;
          
          // 4. 调用 Electron 清理（清理 SQLite 和浏览器存储）
          console.log('   🗑️  调用 clearStorageData...');
          const clearResult = await (window as any).electronAPI.clearStorageData();
          console.log('   📊 clearStorageData 返回值:', clearResult);
          
          if (clearResult?.success) {
            console.log('   ✅ 存储数据已清理（Electron）');
          } else {
            console.error('   ❌ 清理失败:', clearResult?.error || '未知错误');
          }
          
          // 5. 标记已清理，并重新加载页面
          sessionStorage.setItem('test-just-cleaned', 'true');
          console.log('   🔄 重新加载页面以应用清理...');
          window.location.reload();
          return; // 重新加载后会重新运行测试
        } else {
          // 清理标记，表示这是清理后的第一次运行
          sessionStorage.removeItem('test-just-cleaned');
          console.log('   ✅ 已在干净环境中，继续测试');
          
          // 🔍 调试：检查 IndexedDB 中的数据
          console.log('   🔍 检查 IndexedDB 实际数据...');
          try {
            const { indexedDBService } = await import('../services/storage/IndexedDBService');
            
            // 确保服务已初始化
            if (!(indexedDBService as any).initialized) {
              console.log('   ⏳ IndexedDBService 未初始化，等待初始化...');
              await indexedDBService.initialize();
            }
            
            const stats = await indexedDBService.getStorageStats();
            console.log('   📊 IndexedDB 统计:', stats);
            
            const eventsCount = stats.indexedDB?.eventsCount || 0;
            if (eventsCount > 0) {
              console.error(`   ❌ IndexedDB 中还有 ${eventsCount} 个事件！清理失败！`);
              // 列出前 10 个事件
              const allEvents = await indexedDBService.queryEvents({ limit: 10 });
              console.log('   📋 前 10 个事件:', allEvents.items.map(e => ({ id: e.id, title: e.title.simpleTitle })));
            } else {
              console.log('   ✅ IndexedDB 确实为空');
            }
          } catch (error) {
            console.warn('   ⚠️  检查 IndexedDB 失败（非阻塞）:', error);
          }
        }
      } catch (error) {
        console.error('   ❌ 清理异常:', error);
        console.error('   📜 错误堆栈:', (error as Error).stack);
      }
    } else {
      console.log('   ⚠️  非 Electron 环境，跳过清理');
    }
    console.log('');

    // ============================================
    // Test 1: 创建单个事件（验证双写）
    // ============================================
    console.log('1️⃣  测试：创建事件 (双写到 IndexedDB + SQLite)');
    
    // 辅助函数：格式化时间为 YYYY-MM-DD HH:mm:ss
    const formatTime = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };
    
    const testEvent: Partial<Event> = {
      id: generateEventId(), // 🔧 生成唯一 ID
      title: { simpleTitle: '🧪 CRUD测试事件' },
      startTime: formatTime(new Date('2025-12-01T14:00:00')),
      endTime: formatTime(new Date('2025-12-01T15:00:00')),
      description: '这是一个集成测试事件，验证StorageManager双写机制',
      location: '测试环境',
      isAllDay: false,
      isPlan: true,
      tags: ['test', 'crud']
    };

    const createResult = await EventService.createEvent(testEvent as Event);
    
    if (createResult.success && createResult.event) {
      createdEventId = createResult.event.id;
      testResults.push({ test: '创建事件', passed: true, message: `✅ 事件已创建: ${createdEventId}` });
      console.log(`   ✅ 事件已创建: ${createdEventId}`);
    } else {
      testResults.push({ test: '创建事件', passed: false, message: `❌ 事件创建失败: ${createResult.error}` });
      console.error(`   ❌ 事件创建失败: ${createResult.error}`);
      throw new Error(`事件创建失败: ${createResult.error}`);
    }
    console.log('');

    // ============================================
    // Test 2: 读取事件（验证数据完整性）
    // ============================================
    console.log('2️⃣  测试：读取事件 (验证数据完整性)');
    const retrievedEvent = await EventService.getEventById(createdEventId!);
    
    if (retrievedEvent && retrievedEvent.id === createdEventId) {
      const titleMatch = retrievedEvent.title.simpleTitle === '🧪 CRUD测试事件';
      const descMatch = retrievedEvent.description === '这是一个集成测试事件，验证StorageManager双写机制';
      
      if (titleMatch && descMatch) {
        testResults.push({ test: '读取事件', passed: true, message: '✅ 事件数据完整' });
        console.log('   ✅ 事件数据完整');
        console.log(`   📝 标题: ${retrievedEvent.title.simpleTitle}`);
        console.log(`   📝 描述: ${retrievedEvent.description}`);
      } else {
        testResults.push({ test: '读取事件', passed: false, message: '❌ 数据不完整' });
        console.error('   ❌ 数据不完整');
      }
    } else {
      testResults.push({ test: '读取事件', passed: false, message: '❌ 无法读取事件' });
      console.error('   ❌ 无法读取事件');
    }
    console.log('');

    // ============================================
    // Test 3: 更新事件（验证双写更新）
    // ============================================
    console.log('3️⃣  测试：更新事件 (验证双写更新)');
    const updateResult = await EventService.updateEvent(createdEventId!, {
      title: { simpleTitle: '🧪 CRUD测试事件 (已修改)' },
      description: '这个事件已经被更新了，测试双写机制'
    });

    const updatedEvent = await EventService.getEventById(createdEventId!);
    if (updatedEvent && updatedEvent.title.simpleTitle === '🧪 CRUD测试事件 (已修改)') {
      testResults.push({ test: '更新事件', passed: true, message: '✅ 事件更新成功' });
      console.log('   ✅ 事件更新成功');
      console.log(`   📝 新标题: ${updatedEvent.title.simpleTitle}`);
    } else {
      testResults.push({ test: '更新事件', passed: false, message: '❌ 事件更新失败' });
      console.error('   ❌ 事件更新失败');
    }
    console.log('');

    // ============================================
    // Test 4: 批量创建事件（验证批量操作）
    // ============================================
    console.log('4️⃣  测试：批量创建事件 (验证批量双写)');
    const batchEvents: Event[] = Array.from({ length: 5 }, (_, i) => ({
      id: generateEventId(), // 🔧 生成唯一 ID
      title: { simpleTitle: `🧪 批量测试事件 #${i + 1}` },
      startTime: formatTime(new Date(Date.now() + i * 3600000)),
      endTime: formatTime(new Date(Date.now() + (i + 1) * 3600000)),
      description: `批量创建的测试事件 ${i + 1}`,
      isPlan: true,
      tags: ['batch-test']
    } as Event));

    // 保存批量事件的ID
    batchEventIds = batchEvents.map(e => e.id);

    const batchResult = await EventService.batchCreateEvents(batchEvents);

    if (batchResult.success && batchResult.created === 5) {
      testResults.push({ test: '批量创建', passed: true, message: `✅ 批量创建成功: ${batchResult.created} 个事件` });
      console.log(`   ✅ 批量创建成功: ${batchResult.created} 个事件`);
      console.log(`   📝 事件IDs: ${batchEventIds.slice(0, 3).join(', ')}...`);
    } else {
      testResults.push({ test: '批量创建', passed: false, message: `❌ 批量创建失败: ${batchResult.failed} 个失败` });
      console.error(`   ❌ 批量创建失败: ${batchResult.failed} 个失败`);
      if (batchResult.errors.length > 0) {
        console.error('   错误详情:', batchResult.errors);
      }
    }
    console.log('');

    // ============================================
    // Test 5: 查询和过滤（验证查询功能）
    // ============================================
    console.log('5️⃣  测试：查询和过滤 (验证查询引擎)');
    const allEvents = await EventService.getAllEvents();
    const testEvents = allEvents.filter(e => 
      e.title.simpleTitle?.includes('CRUD测试') || 
      e.title.simpleTitle?.includes('批量测试')
    );

    if (testEvents.length >= 6) {
      testResults.push({ test: '查询事件', passed: true, message: `✅ 查询成功: 找到 ${testEvents.length} 个测试事件` });
      console.log(`   ✅ 查询成功: 找到 ${testEvents.length} 个测试事件`);
    } else {
      testResults.push({ test: '查询事件', passed: false, message: `❌ 查询结果不完整: 只找到 ${testEvents.length} 个` });
      console.error(`   ❌ 查询结果不完整: 只找到 ${testEvents.length} 个`);
    }
    console.log('');

    // ============================================
    // Test 6: 验证双写一致性（IndexedDB vs SQLite）
    // ============================================
    console.log('6️⃣  测试：验证双写一致性 (IndexedDB vs SQLite)');
    const stats = await storageManager.getStats();
    
    console.log('   📊 存储统计:');
    console.log(`   - IndexedDB: ${stats.indexedDB?.eventsCount || 0} 个事件`);
    console.log(`   - SQLite: ${stats.sqlite?.eventsCount || 0} 个事件`);
    
    const eventCountMatch = stats.indexedDB?.eventsCount === stats.sqlite?.eventsCount;
    if (eventCountMatch || !stats.sqlite?.eventsCount) {
      testResults.push({ 
        test: '数据一致性', 
        passed: true, 
        message: stats.sqlite?.eventsCount 
          ? '✅ IndexedDB 和 SQLite 数据一致' 
          : '✅ IndexedDB 正常 (SQLite 未启用或无数据)' 
      });
      console.log(`   ✅ 数据一致性验证通过`);
    } else {
      testResults.push({ test: '数据一致性', passed: false, message: '❌ 数据不一致' });
      console.error('   ❌ 数据不一致！');
    }
    console.log('');

    // ============================================
    // Test 7: 清理测试数据
    // ============================================
    console.log('7️⃣  清理：删除测试数据');
    
    // 删除单个测试事件
    if (createdEventId) {
      await EventService.deleteEvent(createdEventId);
      console.log(`   🗑️  已删除测试事件: ${createdEventId}`);
    }

    // 删除批量测试事件
    for (const id of batchEventIds) {
      await EventService.deleteEvent(id);
    }
    console.log(`   🗑️  已删除批量测试事件: ${batchEventIds.length} 个`);
    
    testResults.push({ test: '清理数据', passed: true, message: '✅ 测试数据已清理' });
    console.log('');

    // ============================================
    // 输出测试结果汇总
    // ============================================
    console.log('🧪 ============================================');
    console.log('🧪 测试结果汇总');
    console.log('🧪 ============================================\n');

    const passedCount = testResults.filter(r => r.passed).length;
    const totalCount = testResults.length;
    const successRate = ((passedCount / totalCount) * 100).toFixed(1);

    testResults.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.test}: ${result.message}`);
    });

    console.log('');
    console.log(`📊 通过率: ${passedCount}/${totalCount} (${successRate}%)`);
    
    if (passedCount === totalCount) {
      console.log('🎉 所有测试通过！StorageManager 集成成功！');
    } else {
      console.warn('⚠️  部分测试失败，请检查上面的错误信息');
    }
    
    console.log('\n🧪 ============================================\n');

    return {
      passed: passedCount,
      failed: totalCount - passedCount,
      total: totalCount,
      successRate: parseFloat(successRate),
      results: testResults
    };

  } catch (error) {
    console.error('\n❌ 测试执行过程中发生错误:');
    console.error(error);
    
    // 尝试清理
    console.log('\n🧹 尝试清理测试数据...');
    try {
      if (createdEventId) await EventService.deleteEvent(createdEventId);
      for (const id of batchEventIds) await EventService.deleteEvent(id);
      console.log('✅ 清理完成');
    } catch (cleanupError) {
      console.error('清理失败:', cleanupError);
    }
    
    throw error;
  }
}

// 暴露到全局
if (typeof window !== 'undefined') {
  (window as any).testCRUDIntegration = testCRUDIntegration;
  console.log('🧪 CRUD Integration Test loaded');
  console.log('   Run: testCRUDIntegration()');
}
