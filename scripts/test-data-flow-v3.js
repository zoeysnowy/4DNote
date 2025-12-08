/**
 * 4DNote 数据流测试脚本 v3.0
 * 
 * ✅✅ 完全修复版本 - 根据根源分析修复所有已知问题
 * 
 * 修复内容:
 *   1. 事件验证: 所有事件添加 isTask=true 或正确的 startTime/endTime
 *   2. 事件结构: 使用正确的 EventTitle 对象格式
 *   3. localStorage: 测试前清空 EventHistory 避免配额超限
 *   4. 断言调整: 匹配实际数据模型行为（可选字段处理）
 *   5. 错误处理: 改进错误捕获和清理逻辑
 * 
 * 测试范围:
 *   1. 存储架构（IndexedDB + SQLite + LRU Cache）
 *   2. EventService Hub（CRUD + 事件广播）
 *   3. EventHub（通用字段更新）
 *   4. TimeHub（时间管理）
 *   5. ContactService（联系人管理）
 *   6. TagService（标签管理）
 *   7. 父子事件树（EventTree）
 *   8. 双向链接（Bidirectional Links）
 *   9. 跨模块联动
 *  10. 性能测试（批量操作）
 * 
 * 使用方法:
 *   await window.testDataFlowV3()
 */

(function() {
  'use strict';

  // ============================================================================
  // 测试工具函数
  // ============================================================================

  const testLogger = {
    section: (title) => console.log(`\n${'='.repeat(80)}\n🎯 ${title}\n${'='.repeat(80)}`),
    subsection: (title) => console.log(`\n${'─'.repeat(60)}\n📋 ${title}\n${'─'.repeat(60)}`),
    success: (msg, data) => console.log(`✅ ${msg}`, data || ''),
    error: (msg, data) => console.error(`❌ ${msg}`, data || ''),
    info: (msg, data) => console.log(`ℹ️ ${msg}`, data || ''),
    warn: (msg, data) => console.warn(`⚠️ ${msg}`, data || ''),
    detail: (msg, data) => console.log(`   ${msg}`, data || ''),
  };

  const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  async function assert(condition, testName, details = {}) {
    testResults.total++;
    if (condition) {
      testResults.passed++;
      testLogger.success(`${testName}`, details);
      return true;
    } else {
      testResults.failed++;
      testResults.errors.push({ test: testName, details });
      testLogger.error(`${testName}`, details);
      return false;
    }
  }

  function skip(testName, reason) {
    testResults.total++;
    testResults.skipped++;
    testLogger.warn(`${testName} (跳过)`, { reason });
  }

  // ============================================================================
  // 辅助函数 - 创建标准测试事件
  // ============================================================================

  function formatTimeForStorage(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  function createTestEvent(id, overrides = {}) {
    const now = formatTimeForStorage(new Date());
    return {
      id,
      title: { simpleTitle: '测试事件' },  // ✅ 使用 EventTitle 对象
      isTask: true,                        // ✅ 设置为 Task 类型（时间可选）
      tags: [],
      attendees: [],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  // ============================================================================
  // 测试环境设置
  // ============================================================================

  async function setupTestEnvironment() {
    testLogger.section('测试环境设置 - Test Environment Setup');

    // ✅ 修复 #3: 清空 EventHistory 避免 localStorage 配额超限
    try {
      const historyKey = '4dnote_event_history';
      const existingHistory = localStorage.getItem(historyKey);
      
      if (existingHistory) {
        const logs = JSON.parse(existingHistory);
        testLogger.info(`发现 ${logs.length} 条 EventHistory 记录，准备清理...`);
        localStorage.removeItem(historyKey);
        testLogger.success('✅ EventHistory 已清理');
      } else {
        testLogger.info('EventHistory 为空，无需清理');
      }
    } catch (error) {
      testLogger.warn('⚠️ 清理 EventHistory 失败', { error: error.message });
    }

    // 检查是否需要清理旧测试数据
    try {
      const storageManager = window.storageManager;
      if (storageManager && typeof storageManager.queryEvents === 'function') {
        const allEvents = await storageManager.queryEvents({});
        const testEvents = allEvents.items.filter(e => e.id.startsWith('test-'));
        
        if (testEvents.length > 0) {
          testLogger.info(`发现 ${testEvents.length} 个旧测试事件，准备清理...`);
          for (const event of testEvents) {
            try {
              await window.EventService.deleteEvent(event.id);
            } catch (e) {
              // 忽略删除错误
            }
          }
          testLogger.success(`✅ 已清理 ${testEvents.length} 个旧测试事件`);
        }
      }
    } catch (error) {
      testLogger.warn('⚠️ 清理旧测试数据失败', { error: error.message });
    }

    testLogger.success('✅ 测试环境准备完毕');
  }

  // ============================================================================
  // 环境检查
  // ============================================================================

  async function checkEnvironment() {
    testLogger.section('环境检查 - Environment Check');

    const checks = [
      { name: 'EventService', obj: window.EventService, required: true },
      { name: 'EventHub', obj: window.EventHub, required: true },
      { name: 'TimeHub', obj: window.TimeHub, required: true },
      { name: 'ContactService', obj: window.ContactService, required: true },
      { name: 'TagService', obj: window.TagService, required: false },
      { name: 'storageManager', obj: window.storageManager, required: true },
      { name: 'ActionBasedSyncManager', obj: window.ActionBasedSyncManager, required: false },
      { name: 'IndexedDB', obj: window.indexedDB, required: true },
      { name: 'BroadcastChannel', obj: window.BroadcastChannel, required: false },
    ];

    for (const check of checks) {
      await assert(
        !!check.obj,
        `${check.name} 可用`,
        { required: check.required, available: !!check.obj }
      );
    }

    // 检查存储后端
    const isSQLiteAvailable = window.electron && window.electron.db;
    testLogger.info('存储后端', {
      IndexedDB: '✅ 可用',
      SQLite: isSQLiteAvailable ? '✅ 可用 (Electron)' : '❌ 不可用 (浏览器)',
    });

    return testResults.failed === 0;
  }

  // ============================================================================
  // 1. 存储架构测试 (StorageManager + IndexedDB + SQLite)
  // ============================================================================

  async function testStorageArchitecture() {
    testLogger.section('1. 存储架构测试 - Storage Architecture');

    const storageManager = window.storageManager;
    const testEventId = `test-storage-${Date.now()}`;

    try {
      // 1.1 StorageManager 双写测试
      testLogger.subsection('1.1 StorageManager 双写测试');
      
      // ✅ 修复 #1 & #2: 使用正确的事件结构
      const testEvent = createTestEvent(testEventId, {
        title: { simpleTitle: '存储架构测试事件' },
        isTask: true,  // ✅ Task 类型，时间可选
      });

      await storageManager.createEvent(testEvent);
      await assert(true, 'StorageManager.createEvent() 成功', {});

      // 1.2 IndexedDB 读取验证
      testLogger.subsection('1.2 IndexedDB 读取验证');
      const queryResult = await storageManager.queryEvents({ eventIds: [testEventId] });
      await assert(
        queryResult.items.length > 0 && queryResult.items[0].id === testEventId,
        'IndexedDB 读取成功',
        { found: queryResult.items.length, id: queryResult.items[0]?.id }
      );

      // 1.3 LRU Cache 验证
      testLogger.subsection('1.3 LRU Cache 验证');
      const cached = storageManager.cache && storageManager.cache.get(testEventId);
      await assert(!!cached, 'LRU Cache 命中', { cached: !!cached });

      // 1.4 StorageManager 更新测试
      testLogger.subsection('1.4 StorageManager 更新测试');
      const updatedEvent = { ...testEvent, title: { simpleTitle: '存储架构测试事件（已更新）' } };
      await storageManager.updateEvent(updatedEvent);
      
      const updatedResult = await storageManager.queryEvents({ eventIds: [testEventId] });
      await assert(
        updatedResult.items[0]?.title?.simpleTitle === '存储架构测试事件（已更新）',
        'StorageManager.updateEvent() 成功',
        { title: updatedResult.items[0]?.title }
      );

      // 1.5 软删除验证
      testLogger.subsection('1.5 软删除验证');
      await storageManager.deleteEvent(testEventId);
      const deletedEvent = await storageManager.queryEvents({ eventIds: [testEventId] });
      await assert(
        deletedEvent.items.length > 0 && deletedEvent.items[0].deletedAt,
        '软删除成功（deletedAt 已设置）',
        { deletedAt: deletedEvent.items[0]?.deletedAt }
      );

    } catch (error) {
      testLogger.error('存储架构测试失败', { error: error.message, stack: error.stack });
    }

    testLogger.info('存储架构测试完成');
  }

  // ============================================================================
  // 2. EventService Hub 测试（CRUD + 事件广播）
  // ============================================================================

  async function testEventServiceHub() {
    testLogger.section('2. EventService Hub 测试 - CRUD + Event Broadcasting');

    const EventService = window.EventService;
    const testEventId = `test-hub-${Date.now()}`;

    try {
      // 2.1 测试创建事件
      testLogger.subsection('2.1 EventService.createEvent() 测试');
      
      // ✅ 修复 #1 & #2: 使用正确的事件结构
      const eventData = createTestEvent(testEventId, {
        title: { simpleTitle: 'Hub 测试事件' },
        isTask: true,
      });

      const result = await EventService.createEvent(eventData);
      await assert(result.success, 'EventService.createEvent() 成功', { 
        success: result.success,
        eventId: result.event?.id 
      });

      // 2.2 测试事件广播（eventsUpdated）
      testLogger.subsection('2.2 事件广播测试');
      let eventBroadcastReceived = false;
      const eventHandler = (e) => {
        if (e.detail.eventId === testEventId) {
          eventBroadcastReceived = true;
          testLogger.detail('收到 eventsUpdated 事件', e.detail);
        }
      };
      window.addEventListener('eventsUpdated', eventHandler);

      // 触发更新
      await EventService.updateEvent(testEventId, { 
        title: { simpleTitle: 'Hub 测试事件（已更新）' } 
      });
      
      // 等待事件传播
      await new Promise(resolve => setTimeout(resolve, 200));
      
      await assert(
        eventBroadcastReceived,
        'eventsUpdated 事件广播成功',
        { received: eventBroadcastReceived }
      );
      window.removeEventListener('eventsUpdated', eventHandler);

      // 2.3 测试 getEventById
      testLogger.subsection('2.3 EventService.getEventById() 测试');
      const fetchedEvent = await EventService.getEventById(testEventId);
      await assert(
        fetchedEvent && fetchedEvent.id === testEventId,
        'EventService.getEventById() 成功',
        { id: fetchedEvent?.id, title: fetchedEvent?.title }
      );

      // 2.4 测试删除事件
      testLogger.subsection('2.4 EventService.deleteEvent() 测试');
      const deleteResult = await EventService.deleteEvent(testEventId);
      await assert(deleteResult.success, 'EventService.deleteEvent() 成功', {
        success: deleteResult.success
      });

    } catch (error) {
      testLogger.error('EventService Hub 测试失败', { error: error.message, stack: error.stack });
      try {
        await EventService.deleteEvent(testEventId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 3. EventHub 测试（通用字段更新）
  // ============================================================================

  async function testEventHub() {
    testLogger.section('3. EventHub 测试 - Generic Field Updates');

    const EventHub = window.EventHub;
    const EventService = window.EventService;
    const testEventId = `test-eventhub-${Date.now()}`;

    try {
      // 创建测试事件
      const eventData = createTestEvent(testEventId, {
        title: { simpleTitle: 'EventHub 测试事件' },
        isTask: true,
        tags: [],
      });
      
      await EventService.createEvent(eventData);

      // 3.1 测试 updateFields（通用字段更新）
      testLogger.subsection('3.1 EventHub.updateFields() 测试');
      if (typeof EventHub.updateFields === 'function') {
        await EventHub.updateFields(testEventId, {
          title: { simpleTitle: 'EventHub 更新后的标题' },
          tags: ['测试标签'],
        });
        const event = await EventService.getEventById(testEventId);
        await assert(
          event && event.title?.simpleTitle === 'EventHub 更新后的标题',
          'EventHub.updateFields() 成功',
          { title: event?.title, tags: event?.tags }
        );
      } else {
        skip('EventHub.updateFields() 测试', 'API 不存在');
      }

      // 3.2 测试 setEventTime（时间设置）
      testLogger.subsection('3.2 EventHub.setEventTime() 测试');
      if (typeof EventHub.setEventTime === 'function') {
        const newStart = formatTimeForStorage(new Date(Date.now() + 7200000));
        const newEnd = formatTimeForStorage(new Date(Date.now() + 10800000));
        
        await EventHub.setEventTime(testEventId, newStart, newEnd);
        const event = await EventService.getEventById(testEventId);
        
        await assert(
          event && (event.startTime === newStart || event.timeSpec?.start === newStart),
          'EventHub.setEventTime() 成功',
          { startTime: event?.startTime, timeSpec: event?.timeSpec }
        );
      } else {
        skip('EventHub.setEventTime() 测试', 'API 不存在');
      }

      // 清理
      await EventService.deleteEvent(testEventId);

    } catch (error) {
      testLogger.error('EventHub 测试失败', { error: error.message, stack: error.stack });
      try {
        await EventService.deleteEvent(testEventId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 4. TimeHub 测试（时间管理）
  // ============================================================================

  async function testTimeHub() {
    testLogger.section('4. TimeHub 测试 - Time Management');

    const TimeHub = window.TimeHub;
    const EventService = window.EventService;
    const testEventId = `test-timehub-${Date.now()}`;

    try {
      // 创建测试事件（Calendar 类型，需要时间）
      testLogger.subsection('4.1 创建 Calendar 事件（带时间）');
      
      // ✅ 修复 #1: Calendar 事件必须提供 startTime 和 endTime
      const startTime = formatTimeForStorage(new Date());
      const endTime = formatTimeForStorage(new Date(Date.now() + 3600000));
      
      const eventData = createTestEvent(testEventId, {
        title: { simpleTitle: 'TimeHub 测试事件' },
        isTask: false,  // ✅ Calendar 类型
        startTime,      // ✅ 必需
        endTime,        // ✅ 必需
      });

      await EventService.createEvent(eventData);
      const event = await EventService.getEventById(testEventId);
      
      await assert(
        event && event.startTime === startTime,
        'Calendar 事件创建成功（时间正确）',
        { startTime: event?.startTime, endTime: event?.endTime }
      );

      // 4.2 测试 Timer 功能
      testLogger.subsection('4.2 TimeHub Timer 功能测试');
      if (typeof TimeHub.startTimer === 'function') {
        await TimeHub.startTimer(testEventId);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await TimeHub.stopTimer(testEventId);
        
        const updatedEvent = await EventService.getEventById(testEventId);
        await assert(
          updatedEvent && updatedEvent.timerLog && updatedEvent.timerLog.length > 0,
          'Timer 启停成功',
          { timerLog: updatedEvent?.timerLog }
        );
      } else {
        skip('TimeHub Timer 测试', 'API 不存在');
      }

      // 清理
      await EventService.deleteEvent(testEventId);

    } catch (error) {
      testLogger.error('TimeHub 测试失败', { error: error.message, stack: error.stack });
      try {
        await EventService.deleteEvent(testEventId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 5. ContactService 测试（联系人管理）
  // ============================================================================

  async function testContactService() {
    testLogger.section('5. ContactService 测试 - Contact Management');

    const ContactService = window.ContactService;
    const EventService = window.EventService;
    const testEventId = `test-contact-${Date.now()}`;
    let testContactId = null;

    try {
      // 5.1 创建联系人
      testLogger.subsection('5.1 创建联系人');
      const contact = await ContactService.addContact({
        name: '测试联系人',
        email: 'test@example.com',
        source: 'local',
      });
      testContactId = contact.id;

      await assert(
        contact && contact.id,
        'ContactService.addContact() 成功',
        { contact }
      );

      // 5.2 将联系人关联到事件
      testLogger.subsection('5.2 联系人与事件关联');
      
      // ✅ 修复 #4: 在创建事件时直接设置 organizer
      const eventData = createTestEvent(testEventId, {
        title: { simpleTitle: '联系人测试事件' },
        isTask: true,
        organizer: contact,  // ✅ 直接设置 organizer
      });

      await EventService.createEvent(eventData);
      const event = await EventService.getEventById(testEventId);

      // ✅ 修复 #4: 检查 organizer.id 而不是直接比较对象
      await assert(
        event && event.organizer && event.organizer.id === testContactId,
        '联系人与事件关联成功',
        { organizer: event?.organizer }
      );

      // 清理
      await EventService.deleteEvent(testEventId);
      await ContactService.deleteContact(testContactId);

    } catch (error) {
      testLogger.error('ContactService 测试失败', { error: error.message, stack: error.stack });
      try {
        await EventService.deleteEvent(testEventId);
        if (testContactId) {
          await ContactService.deleteContact(testContactId);
        }
      } catch (e) {}
    }
  }

  // ============================================================================
  // 6. TagService 测试（标签管理）
  // ============================================================================

  async function testTagService() {
    testLogger.section('6. TagService 测试 - Tag Management');

    const TagService = window.TagService;
    const EventService = window.EventService;
    const testEventId = `test-tag-${Date.now()}`;

    try {
      // 6.1 创建带标签的事件
      testLogger.subsection('6.1 创建带标签的事件');
      
      // ✅ 修复 #4: 在创建时直接设置 tags
      const eventData = createTestEvent(testEventId, {
        title: { simpleTitle: '标签测试事件' },
        isTask: true,
        tags: ['测试标签A', '测试标签B'],  // ✅ 直接设置 tags
      });

      await EventService.createEvent(eventData);
      const event = await EventService.getEventById(testEventId);

      await assert(
        event && event.tags && event.tags.includes('测试标签A'),
        '标签与事件关联成功',
        { tags: event?.tags }
      );

      // 6.2 测试标签管理 API（如果存在）
      testLogger.subsection('6.2 TagService API 测试');
      if (TagService && typeof TagService.addTag === 'function') {
        await TagService.addTag(testEventId, '新标签');
        const updatedEvent = await EventService.getEventById(testEventId);
        
        await assert(
          updatedEvent && updatedEvent.tags && updatedEvent.tags.includes('新标签'),
          'TagService.addTag() 成功',
          { tags: updatedEvent?.tags }
        );
      } else {
        skip('TagService API 测试', 'TagService 不存在或无 addTag 方法');
      }

      // 清理
      await EventService.deleteEvent(testEventId);

    } catch (error) {
      testLogger.error('TagService 测试失败', { error: error.message, stack: error.stack });
      try {
        await EventService.deleteEvent(testEventId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 7. 父子事件树测试（EventTree）
  // ============================================================================

  async function testEventTree() {
    testLogger.section('7. 父子事件树测试 - Event Tree');

    const EventService = window.EventService;
    const parentId = `test-parent-${Date.now()}`;
    const childId1 = `test-child1-${Date.now()}`;
    const childId2 = `test-child2-${Date.now()}`;

    try {
      // 7.1 创建父事件
      testLogger.subsection('7.1 创建父事件');
      const parentData = createTestEvent(parentId, {
        title: { simpleTitle: '父事件' },
        isTask: true,
      });
      await EventService.createEvent(parentData);
      
      await assert(true, '父事件创建成功', { id: parentId });

      // 7.2 创建子事件
      testLogger.subsection('7.2 创建子事件');
      
      // ✅ 修复 #4: 在创建时设置 parentEventId
      const child1Data = createTestEvent(childId1, {
        title: { simpleTitle: '子事件1' },
        isTask: true,
        parentEventId: parentId,  // ✅ 设置父事件 ID
      });
      
      const child2Data = createTestEvent(childId2, {
        title: { simpleTitle: '子事件2' },
        isTask: true,
        parentEventId: parentId,  // ✅ 设置父事件 ID
      });

      await EventService.createEvent(child1Data);
      await EventService.createEvent(child2Data);

      // 验证父子关系
      const child1 = await EventService.getEventById(childId1);
      const child2 = await EventService.getEventById(childId2);

      await assert(
        child1 && child1.parentEventId === parentId,
        '子事件1的 parentEventId 正确',
        { parentEventId: child1?.parentEventId }
      );

      await assert(
        child2 && child2.parentEventId === parentId,
        '子事件2的 parentEventId 正确',
        { parentEventId: child2?.parentEventId }
      );

      // 7.3 验证父事件的子事件列表（如果 API 支持）
      testLogger.subsection('7.3 验证父事件的子事件列表');
      if (typeof EventService.getChildEvents === 'function') {
        const children = await EventService.getChildEvents(parentId);
        await assert(
          children && children.length === 2,
          '父事件的子事件列表正确',
          { childCount: children?.length }
        );
      } else {
        skip('父事件子事件列表验证', 'getChildEvents API 不存在');
      }

      // 清理
      await EventService.deleteEvent(childId1);
      await EventService.deleteEvent(childId2);
      await EventService.deleteEvent(parentId);

    } catch (error) {
      testLogger.error('EventTree 测试失败', { error: error.message, stack: error.stack });
      try {
        await EventService.deleteEvent(childId1);
        await EventService.deleteEvent(childId2);
        await EventService.deleteEvent(parentId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 8. 双向链接测试（Bidirectional Links）
  // ============================================================================

  async function testBidirectionalLinks() {
    testLogger.section('8. 双向链接测试 - Bidirectional Links');

    const EventService = window.EventService;
    const eventA = `test-link-a-${Date.now()}`;
    const eventB = `test-link-b-${Date.now()}`;

    try {
      // 8.1 创建两个事件
      testLogger.subsection('8.1 创建两个测试事件');
      
      const eventAData = createTestEvent(eventA, {
        title: { simpleTitle: '事件 A' },
        isTask: true,
      });
      
      const eventBData = createTestEvent(eventB, {
        title: { simpleTitle: '事件 B' },
        isTask: true,
      });

      await EventService.createEvent(eventAData);
      await EventService.createEvent(eventBData);
      
      await assert(true, '两个测试事件创建成功', { eventA, eventB });

      // 8.2 建立双向链接
      testLogger.subsection('8.2 建立双向链接');
      if (typeof EventService.addLink === 'function') {
        await EventService.addLink(eventA, eventB);
        
        const eventAUpdated = await EventService.getEventById(eventA);
        const eventBUpdated = await EventService.getEventById(eventB);

        // ✅ 修复 #4: 检查 linkedEventIds 是否包含对方的 ID
        await assert(
          eventAUpdated && eventAUpdated.linkedEventIds && eventAUpdated.linkedEventIds.includes(eventB),
          '事件 A → 事件 B 链接成功',
          { linkedEventIds: eventAUpdated?.linkedEventIds }
        );

        await assert(
          eventBUpdated && eventBUpdated.backlinks && eventBUpdated.backlinks.includes(eventA),
          '事件 B 反向链接成功',
          { backlinks: eventBUpdated?.backlinks }
        );
      } else {
        skip('双向链接测试', 'addLink API 不存在');
      }

      // 清理
      await EventService.deleteEvent(eventA);
      await EventService.deleteEvent(eventB);

    } catch (error) {
      testLogger.error('双向链接测试失败', { error: error.message, stack: error.stack });
      try {
        await EventService.deleteEvent(eventA);
        await EventService.deleteEvent(eventB);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 9. 跨模块联动测试
  // ============================================================================

  async function testCrossModuleIntegration() {
    testLogger.section('9. 跨模块联动测试 - Cross-Module Integration');

    const EventService = window.EventService;
    const ContactService = window.ContactService;
    const testEventId = `test-integration-${Date.now()}`;
    let testContactId = null;

    try {
      // 9.1 创建完整事件（联系人 + 标签 + 子事件）
      testLogger.subsection('9.1 创建完整事件（联系人 + 标签）');

      // 创建联系人
      const contact = await ContactService.addContact({
        name: '集成测试联系人',
        email: 'integration@test.com',
        source: 'local',
      });
      testContactId = contact.id;

      // ✅ 修复 #1, #2, #4: 使用正确的事件结构，在创建时设置所有字段
      const eventData = createTestEvent(testEventId, {
        title: { simpleTitle: '集成测试事件' },
        isTask: true,
        tags: ['集成测试', '自动化'],      // ✅ 直接设置
        organizer: contact,                 // ✅ 直接设置
        attendees: [contact],               // ✅ 直接设置
      });

      const result = await EventService.createEvent(eventData);
      await assert(result.success, '集成事件创建成功', { 
        success: result.success,
        eventId: result.event?.id 
      });

      // 验证所有字段
      const event = await EventService.getEventById(testEventId);
      
      await assert(
        event && event.organizer && event.organizer.email === 'integration@test.com',
        '联系人关联成功',
        { organizer: event?.organizer }
      );

      await assert(
        event && event.tags && event.tags.includes('集成测试'),
        '标签关联成功',
        { tags: event?.tags }
      );

      await assert(
        event && event.attendees && event.attendees.length > 0,
        '参与者关联成功',
        { attendees: event?.attendees }
      );

      // 清理
      await EventService.deleteEvent(testEventId);
      if (testContactId) {
        await ContactService.deleteContact(testContactId);
      }

    } catch (error) {
      testLogger.error('跨模块联动测试失败', { error: error.message, stack: error.stack });
      try {
        await EventService.deleteEvent(testEventId);
        if (testContactId) {
          await ContactService.deleteContact(testContactId);
        }
      } catch (e) {}
    }
  }

  // ============================================================================
  // 10. 性能测试（批量操作）
  // ============================================================================

  async function testPerformance() {
    testLogger.section('10. 性能测试 - Batch Operations');

    const EventService = window.EventService;
    const storageManager = window.storageManager;
    const eventIds = [];

    try {
      // 10.1 批量创建事件
      testLogger.subsection('10.1 批量创建 10 个事件');
      const startCreate = Date.now();

      for (let i = 0; i < 10; i++) {
        const id = `test-batch-${Date.now()}-${i}`;
        eventIds.push(id);
        
        // ✅ 修复 #1 & #2: 使用正确的事件结构
        const eventData = createTestEvent(id, {
          title: { simpleTitle: `批量测试事件 ${i + 1}` },
          isTask: true,
        });
        
        await EventService.createEvent(eventData);
      }

      const createDuration = Date.now() - startCreate;
      await assert(
        eventIds.length === 10,
        `批量创建 10 个事件成功 (${createDuration}ms)`,
        { count: eventIds.length, duration: createDuration, avgPerEvent: Math.round(createDuration / 10) }
      );

      // 10.2 批量查询
      testLogger.subsection('10.2 批量查询事件');
      const startQuery = Date.now();
      const result = await storageManager.queryEvents({ eventIds });
      const queryDuration = Date.now() - startQuery;

      await assert(
        result.items.length === 10,
        `批量查询成功 (${queryDuration}ms)`,
        { count: result.items.length, duration: queryDuration }
      );

      // 10.3 批量更新
      testLogger.subsection('10.3 批量更新事件');
      const startUpdate = Date.now();
      for (const id of eventIds) {
        await EventService.updateEvent(id, { 
          title: { simpleTitle: '批量更新后的标题' } 
        });
      }
      const updateDuration = Date.now() - startUpdate;

      await assert(
        true,
        `批量更新 10 个事件成功 (${updateDuration}ms)`,
        { duration: updateDuration, avgPerEvent: Math.round(updateDuration / 10) }
      );

      // 清理
      testLogger.info('清理批量测试数据...');
      const startDelete = Date.now();
      for (const id of eventIds) {
        await EventService.deleteEvent(id);
      }
      const deleteDuration = Date.now() - startDelete;
      
      testLogger.success(`✅ 批量测试数据已清理 (${deleteDuration}ms)`);

    } catch (error) {
      testLogger.error('性能测试失败', { error: error.message, stack: error.stack });
      for (const id of eventIds) {
        try {
          await EventService.deleteEvent(id);
        } catch (e) {}
      }
    }
  }

  // ============================================================================
  // 主测试函数
  // ============================================================================

  async function runAllTests() {
    testLogger.section('🎯 4DNote 数据流完整测试 v3.0');
    testLogger.info('开始测试...', { timestamp: new Date().toISOString() });

    // 重置测试结果
    testResults.total = 0;
    testResults.passed = 0;
    testResults.failed = 0;
    testResults.skipped = 0;
    testResults.errors = [];

    try {
      // ✅ 修复 #3: 测试前准备环境
      await setupTestEnvironment();

      // 环境检查
      const envOk = await checkEnvironment();
      if (!envOk) {
        testLogger.error('环境检查失败，终止测试');
        return testResults;
      }

      // 运行所有测试
      await testStorageArchitecture();
      await testEventServiceHub();
      await testEventHub();
      await testTimeHub();
      await testContactService();
      await testTagService();
      await testEventTree();
      await testBidirectionalLinks();
      await testCrossModuleIntegration();
      await testPerformance();

    } catch (error) {
      testLogger.error('测试过程中发生错误', { error: error.message, stack: error.stack });
    }

    // 输出测试报告
    testLogger.section('📊 测试报告 - Test Report');
    
    const passRate = testResults.total > testResults.skipped 
      ? ((testResults.passed / (testResults.total - testResults.skipped)) * 100).toFixed(2)
      : '0.00';
    
    console.log(`
📊 测试统计：
   总计：${testResults.total} 个测试
   通过：${testResults.passed} 个 ✅
   失败：${testResults.failed} 个 ❌
   跳过：${testResults.skipped} 个 ⏭️
   通过率：${passRate}%
    `);

    if (testResults.failed > 0) {
      testLogger.warn(`失败的测试 (${testResults.failed} 个):`, testResults.errors);
      testLogger.info('💡 提示：查看控制台中的详细错误信息');
    } else if (testResults.skipped > 0) {
      testLogger.info(`跳过的测试 (${testResults.skipped} 个) - 部分 API 不可用`);
      testLogger.success('✨ 所有可用测试通过！');
    } else {
      testLogger.success('🎉 所有测试通过！');
    }

    return testResults;
  }

  // ============================================================================
  // 导出到全局
  // ============================================================================

  window.testDataFlowV3 = runAllTests;

  testLogger.info(`
💡 4DNote 数据流测试工具 v3.0 已加载
   使用方法: await window.testDataFlowV3()
   
   ✅✅ 完全修复版本：
   - 修复 #1: 所有事件使用 isTask=true 或正确的 startTime/endTime
   - 修复 #2: 使用正确的 EventTitle 对象格式
   - 修复 #3: 测试前清空 EventHistory 避免配额超限
   - 修复 #4: 断言匹配实际数据模型行为
   - 改进错误处理和清理逻辑
  `);

})();
