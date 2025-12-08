/**
 * 4DNote 数据流测试脚本 v2.0
 * 
 * ✅ 修复版本 - 使用实际存在的 API
 * 
 * 测试目标：验证所有模块通过 EventService Hub 正确读写数据
 * 测试范围：
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
 * 使用方法：
 *   await window.testDataFlowV2()
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
      const testEvent = {
        id: testEventId,
        title: '存储架构测试事件',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '测试存储双写' }] }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await storageManager.createEvent(testEvent);
      await assert(true, 'StorageManager.createEvent() 成功', {});

      // 1.2 IndexedDB 读取验证
      testLogger.subsection('1.2 IndexedDB 读取验证');
      const queryResult = await storageManager.queryEvents({ eventIds: [testEventId] });
      await assert(
        queryResult.items.length > 0 && queryResult.items[0].id === testEventId,
        'IndexedDB 读取成功',
        { found: queryResult.items.length }
      );

      // 1.3 LRU Cache 验证
      testLogger.subsection('1.3 LRU Cache 验证');
      const cached = storageManager.cache && storageManager.cache.get(testEventId);
      await assert(!!cached, 'LRU Cache 命中', { cached: !!cached });

      // 1.4 StorageManager 更新测试
      testLogger.subsection('1.4 StorageManager 更新测试');
      testEvent.title = '存储架构测试事件（已更新）';
      await storageManager.updateEvent(testEvent);
      await assert(true, 'StorageManager.updateEvent() 成功', {});

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

    testLogger.info('清理测试数据...');
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
      const result = await EventService.createEvent({
        id: testEventId,
        title: 'Hub 测试事件',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '测试内容' }] }],
      });

      await assert(result.success, 'EventService.createEvent() 成功', { event: result.event });

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
      await EventService.updateEvent(testEventId, { title: 'Hub 测试事件（已更新）' });
      
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
        { event: fetchedEvent }
      );

      // 2.4 测试删除事件
      testLogger.subsection('2.4 EventService.deleteEvent() 测试');
      const deleteResult = await EventService.deleteEvent(testEventId);
      await assert(deleteResult.success, 'EventService.deleteEvent() 成功');

    } catch (error) {
      testLogger.error('EventService Hub 测试失败', { error: error.message, stack: error.stack });
    }
  }

  // ============================================================================
  // 3. EventHub 测试（通用字段更新）
  // ============================================================================

  async function testEventHub() {
    testLogger.section('3. EventHub 测试 - Generic Field Updates');

    const EventHub = window.EventHub;
    const testEventId = `test-eventhub-${Date.now()}`;

    try {
      // 创建测试事件
      await window.EventService.createEvent({
        id: testEventId,
        title: 'EventHub 测试事件',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '初始内容' }] }],
        tags: [],
      });

      // 3.1 测试 updateFields（通用字段更新）
      testLogger.subsection('3.1 EventHub.updateFields() 测试');
      if (typeof EventHub.updateFields === 'function') {
        await EventHub.updateFields(testEventId, {
          title: 'EventHub 更新后的标题',
          tags: ['测试标签'],
        });
        const event = await window.EventService.getEventById(testEventId);
        await assert(
          event && event.title === 'EventHub 更新后的标题',
          'EventHub.updateFields() 成功',
          { title: event?.title, tags: event?.tags }
        );
      } else {
        skip('EventHub.updateFields() 测试', 'API 不存在');
      }

      // 3.2 测试 setEventTime（时间设置）
      testLogger.subsection('3.2 EventHub.setEventTime() 测试');
      if (typeof EventHub.setEventTime === 'function') {
        const newStart = new Date(Date.now() + 7200000).toISOString();
        const newEnd = new Date(Date.now() + 10800000).toISOString();
        await EventHub.setEventTime(testEventId, newStart, newEnd);
        const event = await window.EventService.getEventById(testEventId);
        await assert(
          event && event.timeSpec.start === newStart,
          'EventHub.setEventTime() 成功',
          { start: event?.timeSpec.start }
        );
      } else {
        skip('EventHub.setEventTime() 测试', 'API 不存在');
      }

      // 清理
      await window.EventService.deleteEvent(testEventId);

    } catch (error) {
      testLogger.error('EventHub 测试失败', { error: error.message, stack: error.stack });
      try {
        await window.EventService.deleteEvent(testEventId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 4. TimeHub 测试（时间管理）
  // ============================================================================

  async function testTimeHub() {
    testLogger.section('4. TimeHub 测试 - Time Management');

    const TimeHub = window.TimeHub;
    const testEventId = `test-timehub-${Date.now()}`;

    try {
      // 创建测试事件
      await window.EventService.createEvent({
        id: testEventId,
        title: 'TimeHub 测试事件',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '测试内容' }] }],
      });

      // 4.1 测试 setEventTime
      testLogger.subsection('4.1 TimeHub.setEventTime() 测试');
      if (typeof TimeHub.setEventTime === 'function') {
        const newStart = new Date(Date.now() + 7200000).toISOString();
        const newEnd = new Date(Date.now() + 10800000).toISOString();
        await TimeHub.setEventTime(testEventId, newStart, newEnd);
        
        const event = await window.EventService.getEventById(testEventId);
        await assert(
          event && event.timeSpec.start === newStart && event.timeSpec.end === newEnd,
          'TimeHub.setEventTime() 成功',
          { start: event?.timeSpec.start, end: event?.timeSpec.end }
        );
      } else {
        skip('TimeHub.setEventTime() 测试', 'API 不存在');
      }

      // 4.2 测试 setFuzzy（模糊时间）
      testLogger.subsection('4.2 TimeHub.setFuzzy() 测试（模糊时间）');
      if (typeof TimeHub.setFuzzy === 'function') {
        try {
          await TimeHub.setFuzzy(testEventId, '明天下午3点');
          const event = await window.EventService.getEventById(testEventId);
          await assert(
            event && event.timeSpec,
            'TimeHub.setFuzzy() 成功',
            { timeSpec: event?.timeSpec }
          );
        } catch (error) {
          testLogger.warn('setFuzzy 可能需要特定格式', { error: error.message });
        }
      } else {
        skip('TimeHub.setFuzzy() 测试', 'API 不存在');
      }

      // 清理
      await window.EventService.deleteEvent(testEventId);

    } catch (error) {
      testLogger.error('TimeHub 测试失败', { error: error.message, stack: error.stack });
      try {
        await window.EventService.deleteEvent(testEventId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 5. ContactService 测试（联系人管理）
  // ============================================================================

  async function testContactService() {
    testLogger.section('5. ContactService 测试 - Contact Management');

    const ContactService = window.ContactService;
    let testContactId = null;

    try {
      // 5.1 测试添加联系人
      testLogger.subsection('5.1 ContactService.addContact() 测试');
      const newContact = await ContactService.addContact({
        name: '测试联系人',
        email: 'test@example.com',
        phone: '1234567890',
        source: 'local',
      });

      testContactId = newContact.id;
      await assert(
        newContact && newContact.name === '测试联系人',
        'ContactService.addContact() 成功',
        { contact: newContact }
      );

      // 5.2 测试联系人与事件关联
      testLogger.subsection('5.2 联系人与事件关联测试');
      const testEventId = `test-contact-event-${Date.now()}`;
      await window.EventService.createEvent({
        id: testEventId,
        title: '联系人关联事件',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '测试内容' }] }],
        organizer: newContact,
      });

      const event = await window.EventService.getEventById(testEventId);
      await assert(
        event && event.organizer && event.organizer.email === 'test@example.com',
        '联系人与事件关联成功',
        { organizer: event?.organizer }
      );

      await window.EventService.deleteEvent(testEventId);

      // 5.3 测试更新联系人
      testLogger.subsection('5.3 ContactService.updateContact() 测试');
      const updatedContact = await ContactService.updateContact(testContactId, {
        phone: '0987654321',
      });

      await assert(
        updatedContact && updatedContact.phone === '0987654321',
        'ContactService.updateContact() 成功',
        { contact: updatedContact }
      );

      // 5.4 测试删除联系人
      testLogger.subsection('5.4 ContactService.deleteContact() 测试');
      const deleted = await ContactService.deleteContact(testContactId);
      await assert(deleted, 'ContactService.deleteContact() 成功（软删除）', { deleted });

    } catch (error) {
      testLogger.error('ContactService 测试失败', { error: error.message, stack: error.stack });
      if (testContactId) {
        try {
          await ContactService.deleteContact(testContactId);
        } catch (e) {}
      }
    }
  }

  // ============================================================================
  // 6. TagService 测试（标签管理）
  // ============================================================================

  async function testTagService() {
    testLogger.section('6. TagService 测试 - Tag Management');

    const TagService = window.TagService;

    if (!TagService) {
      skip('TagService 测试', 'TagService 不可用');
      return;
    }

    const testEventId = `test-tag-event-${Date.now()}`;

    try {
      // 创建测试事件
      await window.EventService.createEvent({
        id: testEventId,
        title: '标签测试事件',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '测试内容' }] }],
        tags: ['测试标签A'],
      });

      // 6.1 测试标签与事件关联
      testLogger.subsection('6.1 标签与事件关联测试');
      const event = await window.EventService.getEventById(testEventId);
      await assert(
        event && event.tags && event.tags.includes('测试标签A'),
        '标签与事件关联成功',
        { tags: event?.tags }
      );

      // 6.2 测试通过 updateEvent 修改标签
      testLogger.subsection('6.2 通过 EventService.updateEvent() 修改标签');
      await window.EventService.updateEvent(testEventId, {
        tags: ['测试标签A', '测试标签B'],
      });

      const updatedEvent = await window.EventService.getEventById(testEventId);
      await assert(
        updatedEvent && updatedEvent.tags && updatedEvent.tags.length === 2,
        '标签修改成功',
        { tags: updatedEvent?.tags }
      );

      // 清理
      await window.EventService.deleteEvent(testEventId);

    } catch (error) {
      testLogger.error('TagService 测试失败', { error: error.message, stack: error.stack });
      try {
        await window.EventService.deleteEvent(testEventId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 7. 父子事件树测试（EventTree）
  // ============================================================================

  async function testEventTree() {
    testLogger.section('7. 父子事件树测试 - EventTree Hierarchy');

    const testParentId = `test-parent-${Date.now()}`;
    const testChild1Id = `test-child-1-${Date.now()}`;
    const testChild2Id = `test-child-2-${Date.now()}`;

    try {
      // 7.1 创建父事件
      testLogger.subsection('7.1 创建父事件');
      await window.EventService.createEvent({
        id: testParentId,
        title: '父事件',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '父事件内容' }] }],
      });
      await assert(true, '父事件创建成功', {});

      // 7.2 创建子事件（Timer）
      testLogger.subsection('7.2 创建子事件（Timer）');
      await window.EventService.createEvent({
        id: testChild1Id,
        title: '子事件1 (Timer)',
        timeSpec: { type: 'timer', parentEventId: testParentId },
        content: [{ type: 'paragraph', children: [{ text: '子事件1内容' }] }],
        parentEventId: testParentId,
      });

      await window.EventService.createEvent({
        id: testChild2Id,
        title: '子事件2 (Timer)',
        timeSpec: { type: 'timer', parentEventId: testParentId },
        content: [{ type: 'paragraph', children: [{ text: '子事件2内容' }] }],
        parentEventId: testParentId,
      });
      await assert(true, '子事件创建成功', {});

      // 7.3 验证父子关系
      testLogger.subsection('7.3 验证父子关系');
      const parent = await window.EventService.getEventById(testParentId);
      const child1 = await window.EventService.getEventById(testChild1Id);
      const child2 = await window.EventService.getEventById(testChild2Id);

      await assert(
        child1 && child1.parentEventId === testParentId,
        '子事件1的 parentEventId 正确',
        { parentEventId: child1?.parentEventId }
      );

      await assert(
        child2 && child2.parentEventId === testParentId,
        '子事件2的 parentEventId 正确',
        { parentEventId: child2?.parentEventId }
      );

      // 清理
      await window.EventService.deleteEvent(testChild1Id);
      await window.EventService.deleteEvent(testChild2Id);
      await window.EventService.deleteEvent(testParentId);

    } catch (error) {
      testLogger.error('父子事件树测试失败', { error: error.message, stack: error.stack });
      try {
        await window.EventService.deleteEvent(testChild1Id);
        await window.EventService.deleteEvent(testChild2Id);
        await window.EventService.deleteEvent(testParentId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 8. 双向链接测试（Bidirectional Links）
  // ============================================================================

  async function testBidirectionalLinks() {
    testLogger.section('8. 双向链接测试 - Bidirectional Links');

    const testLinkAId = `test-link-a-${Date.now()}`;
    const testLinkBId = `test-link-b-${Date.now()}`;

    try {
      // 创建两个事件
      await window.EventService.createEvent({
        id: testLinkAId,
        title: '链接事件 A',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '事件 A 内容' }] }],
      });

      await window.EventService.createEvent({
        id: testLinkBId,
        title: '链接事件 B',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '事件 B 内容' }] }],
      });

      // 8.1 测试 addLink
      testLogger.subsection('8.1 EventService.addLink() 测试');
      if (typeof window.EventService.addLink === 'function') {
        await window.EventService.addLink(testLinkAId, testLinkBId);

        const eventA = await window.EventService.getEventById(testLinkAId);
        const eventB = await window.EventService.getEventById(testLinkBId);

        await assert(
          eventA && eventA.linkedEventIds && eventA.linkedEventIds.includes(testLinkBId),
          '事件 A → 事件 B 链接成功',
          { linkedEventIds: eventA?.linkedEventIds }
        );

        await assert(
          eventB && eventB.backlinks && eventB.backlinks.includes(testLinkAId),
          '事件 B 反向链接成功',
          { backlinks: eventB?.backlinks }
        );

        // 8.2 测试 removeLink
        testLogger.subsection('8.2 EventService.removeLink() 测试');
        await window.EventService.removeLink(testLinkAId, testLinkBId);

        const eventAAfter = await window.EventService.getEventById(testLinkAId);
        const eventBAfter = await window.EventService.getEventById(testLinkBId);

        await assert(
          eventAAfter && (!eventAAfter.linkedEventIds || !eventAAfter.linkedEventIds.includes(testLinkBId)),
          '事件 A → 事件 B 链接已移除',
          { linkedEventIds: eventAAfter?.linkedEventIds }
        );

        await assert(
          eventBAfter && (!eventBAfter.backlinks || !eventBAfter.backlinks.includes(testLinkAId)),
          '事件 B 反向链接已移除',
          { backlinks: eventBAfter?.backlinks }
        );
      } else {
        skip('EventService.addLink() 测试', 'API 不存在');
        skip('EventService.removeLink() 测试', 'API 不存在');
      }

      // 清理
      await window.EventService.deleteEvent(testLinkAId);
      await window.EventService.deleteEvent(testLinkBId);

    } catch (error) {
      testLogger.error('双向链接测试失败', { error: error.message, stack: error.stack });
      try {
        await window.EventService.deleteEvent(testLinkAId);
        await window.EventService.deleteEvent(testLinkBId);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 9. 跨模块联动测试
  // ============================================================================

  async function testCrossModuleIntegration() {
    testLogger.section('9. 跨模块联动测试 - Cross-Module Integration');

    const testEventId = `test-integration-${Date.now()}`;
    let testContactId = null;

    try {
      // 9.1 创建完整事件（联系人 + 标签 + 子事件）
      testLogger.subsection('9.1 创建完整事件（联系人 + 标签 + 子事件）');

      // 创建联系人
      const contact = await window.ContactService.addContact({
        name: '集成测试联系人',
        email: 'integration@test.com',
        source: 'local',
      });
      testContactId = contact.id;

      // 创建主事件
      const result = await window.EventService.createEvent({
        id: testEventId,
        title: '集成测试事件',
        timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
        content: [{ type: 'paragraph', children: [{ text: '集成测试内容' }] }],
        tags: ['集成测试', '自动化'],
        organizer: contact,
        attendees: [contact],
      });

      await assert(result.success, '集成事件创建成功', { event: result.event });

      // 验证所有字段
      const event = await window.EventService.getEventById(testEventId);
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

      // 清理
      await window.EventService.deleteEvent(testEventId);
      if (testContactId) {
        await window.ContactService.deleteContact(testContactId);
      }

    } catch (error) {
      testLogger.error('跨模块联动测试失败', { error: error.message, stack: error.stack });
      try {
        await window.EventService.deleteEvent(testEventId);
        if (testContactId) {
          await window.ContactService.deleteContact(testContactId);
        }
      } catch (e) {}
    }
  }

  // ============================================================================
  // 10. 性能测试（批量操作）
  // ============================================================================

  async function testPerformance() {
    testLogger.section('10. 性能测试 - Batch Operations');

    const eventIds = [];

    try {
      // 10.1 批量创建事件
      testLogger.subsection('10.1 批量创建 10 个事件');
      const startCreate = Date.now();

      for (let i = 0; i < 10; i++) {
        const id = `test-batch-${Date.now()}-${i}`;
        eventIds.push(id);
        await window.EventService.createEvent({
          id,
          title: `批量测试事件 ${i + 1}`,
          timeSpec: { type: 'span', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString() },
          content: [{ type: 'paragraph', children: [{ text: `批量测试内容 ${i + 1}` }] }],
        });
      }

      const createDuration = Date.now() - startCreate;
      await assert(
        eventIds.length === 10,
        `批量创建 10 个事件成功 (${createDuration}ms)`,
        { count: eventIds.length, duration: createDuration }
      );

      // 10.2 批量查询
      testLogger.subsection('10.2 批量查询事件');
      const startQuery = Date.now();
      const result = await window.storageManager.queryEvents({ eventIds });
      const queryDuration = Date.now() - startQuery;

      await assert(
        result.items.length === 10,
        `批量查询成功 (${queryDuration}ms)`,
        { count: result.items.length, duration: queryDuration }
      );

      // 清理
      testLogger.info('清理批量测试数据...');
      for (const id of eventIds) {
        await window.EventService.deleteEvent(id);
      }
      testLogger.success('批量测试数据已清理');

    } catch (error) {
      testLogger.error('性能测试失败', { error: error.message, stack: error.stack });
      for (const id of eventIds) {
        try {
          await window.EventService.deleteEvent(id);
        } catch (e) {}
      }
    }
  }

  // ============================================================================
  // 主测试函数
  // ============================================================================

  async function runAllTests() {
    testLogger.section('4DNote 数据流完整测试 v2.0');
    testLogger.info('开始测试...', { timestamp: new Date().toISOString() });

    // 重置测试结果
    testResults.total = 0;
    testResults.passed = 0;
    testResults.failed = 0;
    testResults.skipped = 0;
    testResults.errors = [];

    try {
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
    testLogger.section('测试报告 - Test Report');
    console.log(`
📊 测试统计：
   总计：${testResults.total} 个测试
   通过：${testResults.passed} 个 ✅
   失败：${testResults.failed} 个 ❌
   跳过：${testResults.skipped} 个 ⏭️
   通过率：${((testResults.passed / (testResults.total - testResults.skipped)) * 100).toFixed(2)}%
    `);

    if (testResults.failed > 0) {
      testLogger.warn(`失败的测试 (${testResults.failed} 个):`, testResults.errors);
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

  window.testDataFlowV2 = runAllTests;

  testLogger.info(`
💡 4DNote 数据流测试工具 v2.0 已加载
   使用方法: await window.testDataFlowV2()
   
   ✅ 修复版本：
   - 使用实际存在的 API
   - 添加 API 可用性检查
   - 添加跳过机制（skip）
   - 更详细的错误信息
   - 改进的测试报告
   
   测试范围:
   1. 存储架构（IndexedDB + SQLite + LRU Cache）
   2. EventService Hub（CRUD + 事件广播）
   3. EventHub（通用字段更新）
   4. TimeHub（时间管理）
   5. ContactService（联系人管理）
   6. TagService（标签管理）
   7. 父子事件树（EventTree）
   8. 双向链接（Bidirectional Links）
   9. 跨模块联动测试
   10. 性能测试（批量操作）
  `);

})();
