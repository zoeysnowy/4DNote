# 存储迁移修复计划

> **计划版本**: v1.0  
> **创建日期**: 2025-12-03  
> **计划周期**: 3 周 (2025-12-03 至 2025-12-22)  
> **目标**: 完成 PersistentStorage → StorageManager 完整迁移

---

## 📋 目录

1. [修复策略概述](#修复策略概述)
2. [Week 1: Critical Issues](#week-1-critical-issues)
3. [Week 2: High Priority Issues](#week-2-high-priority-issues)
4. [Week 3: Testing & Validation](#week-3-testing--validation)
5. [风险管理](#风险管理)
6. [验收标准](#验收标准)

---

## 修复策略概述

### 核心原则

1. **渐进式迁移**: 逐模块迁移，避免全面重构
2. **数据安全第一**: 每次迁移前备份数据
3. **向后兼容**: 迁移过程中保持旧代码可用
4. **充分测试**: 每个模块迁移后立即测试

### 迁移顺序

```
Phase 1: ActionBasedSyncManager (修复标签读取) ← 最高优先级
  ↓
Phase 2: ContactService (迁移到 StorageManager)
  ↓
Phase 3: EventService (迁移到 StorageManager) ← 最大工作量
  ↓
Phase 4: 清理 localStorage 直接操作
  ↓
Phase 5: 集成测试 + 数据迁移脚本
```

---

## Week 1: Critical Issues

### Day 1-2: 修复 ActionBasedSyncManager (2025-12-03 至 2025-12-04)

#### 任务 1.1: 移除 PersistentStorage 依赖

**文件**: `src/services/ActionBasedSyncManager.ts`

**变更位置**:
1. Line 4: 移除导入
   ```typescript
   // ❌ 删除
   import { PersistentStorage, PERSISTENT_OPTIONS } from '../utils/persistentStorage';
   ```

2. Line 271-295: 修复 `convertFromCalendarEvent`
   ```typescript
   // ❌ 旧代码
   try {
     const allTags = await TagService.getFlatTags();
     tagIdToNameMap = new Map(allTags.map(t => [t.id, t.name]));
   } catch (error) {
     const savedTags = PersistentStorage.getItem(STORAGE_KEYS.HIERARCHICAL_TAGS, PERSISTENT_OPTIONS.TAGS);
     // ...
   }

   // ✅ 新代码
   try {
     const allTags = await TagService.getFlatTags();
     tagIdToNameMap = new Map(allTags.map(t => [t.id, t.name]));
   } catch (error) {
     console.error('[ActionBasedSyncManager] Failed to load tags from TagService:', error);
     // 返回空 Map，不使用 PersistentStorage fallback
     tagIdToNameMap = new Map();
   }
   ```

3. Line 335, 622: 同样的修复模式

**测试计划**:
```typescript
// test/ActionBasedSyncManager.test.ts
describe('ActionBasedSyncManager Tag Loading', () => {
  it('should load tags from TagService', async () => {
    const manager = new ActionBasedSyncManager(...);
    const tags = await manager.getTagMap();
    expect(tags.size).toBeGreaterThan(0);
    expect(tags.get('tag_k4R3SJhILRnbwVYeMkf5G')).toBe('工作');
  });

  it('should fallback to empty map if TagService fails', async () => {
    jest.spyOn(TagService, 'getFlatTags').mockRejectedValue(new Error('Service down'));
    const manager = new ActionBasedSyncManager(...);
    const tags = await manager.getTagMap();
    expect(tags.size).toBe(0);
  });
});
```

**验收标准**:
- ✅ 所有 `PersistentStorage` 引用已移除
- ✅ 标签加载使用 `TagService.getFlatTags()`
- ✅ 测试通过 (2/2)
- ✅ 无回归问题

**预计工作量**: 4-6 小时

---

### Day 3-4: ContactService 迁移 (2025-12-05 至 2025-12-06)

#### 任务 1.2: 创建 ContactService 适配层

**文件**: `src/services/ContactService.ts`

**Step 1: 添加 StorageManager 依赖**

```typescript
import { StorageManager } from './storage/StorageManager';
import type { Contact as StorageContact } from './storage/types';

class ContactService {
  private storageManager: StorageManager | null = null;
  private contacts: Map<string, Contact> = new Map(); // 内存缓存

  async initialize(): Promise<void> {
    // 1. 初始化 StorageManager
    this.storageManager = await StorageManager.getInstance();
    await this.storageManager.initialize();

    // 2. 从 StorageManager 加载联系人
    await this.loadFromStorage();

    // 3. 如果 StorageManager 为空，尝试从 localStorage 迁移
    if (this.contacts.size === 0) {
      await this.migrateFromLocalStorage();
    }
  }

  private async loadFromStorage(): Promise<void> {
    if (!this.storageManager) return;

    const result = await this.storageManager.queryContacts({
      filters: [],
      limit: 10000
    });

    this.contacts = new Map(
      result.items.map(c => [c.email, this.storageContactToContact(c)])
    );

    console.log(`[ContactService] Loaded ${this.contacts.size} contacts from storage`);
  }

  private async migrateFromLocalStorage(): Promise<void> {
    const STORAGE_KEY = 'remarkable-contacts-v1';
    const stored = localStorage.getItem(STORAGE_KEY);
    
    if (!stored) return;

    try {
      const oldContacts = new Map<string, Contact>(JSON.parse(stored));
      console.log(`[ContactService] Migrating ${oldContacts.size} contacts from localStorage...`);

      // 批量写入 StorageManager
      const storageContacts: StorageContact[] = Array.from(oldContacts.values()).map(c => ({
        id: `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: c.name || '',
        email: c.email,
        phone: c.phone,
        avatarUrl: c.avatarUrl,
        organization: c.organization,
        position: c.position,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      await this.storageManager!.batchCreateContacts(storageContacts);

      // 重新加载到内存
      await this.loadFromStorage();

      // 备份旧数据并清理
      localStorage.setItem(`${STORAGE_KEY}-backup`, stored);
      localStorage.removeItem(STORAGE_KEY);

      console.log(`[ContactService] ✅ Migration completed`);
    } catch (error) {
      console.error('[ContactService] Migration failed:', error);
    }
  }

  async addOrUpdateContact(contact: Contact): Promise<Contact> {
    if (!this.storageManager) throw new Error('ContactService not initialized');

    // 1. 更新内存缓存
    this.contacts.set(contact.email, contact);

    // 2. 写入 StorageManager (自动双写)
    const storageContact: StorageContact = {
      id: `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: contact.name || '',
      email: contact.email,
      phone: contact.phone,
      avatarUrl: contact.avatarUrl,
      organization: contact.organization,
      position: contact.position,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.storageManager.createContact(storageContact);

    return contact;
  }

  // 移除旧的 save() 方法
  // private save(): void {
  //   localStorage.setItem(STORAGE_KEY, JSON.stringify(this.contacts));
  // }
}
```

**Step 2: 更新 App.tsx 初始化**

```typescript
// src/App.tsx
useEffect(() => {
  const initServices = async () => {
    // 初始化 ContactService（会自动迁移数据）
    await ContactService.initialize();
    console.log('[App] ContactService initialized');
  };

  initServices();
}, []);
```

**测试计划**:
```typescript
// test/ContactService.test.ts
describe('ContactService Storage Migration', () => {
  beforeEach(async () => {
    await ContactService.initialize();
  });

  it('should load contacts from StorageManager', async () => {
    const contacts = await ContactService.getAllContacts();
    expect(Array.isArray(contacts)).toBe(true);
  });

  it('should save contact to StorageManager', async () => {
    const contact = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890'
    };

    await ContactService.addOrUpdateContact(contact);

    // 验证双写成功
    const storage = await StorageManager.getInstance();
    const result = await storage.queryContacts({
      filters: [{ field: 'email', operator: 'equals', value: 'test@example.com' }],
      limit: 1
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].email).toBe('test@example.com');
  });

  it('should migrate contacts from localStorage', async () => {
    // 模拟旧数据
    const oldData = new Map([
      ['old@example.com', { name: 'Old User', email: 'old@example.com' }]
    ]);
    localStorage.setItem('remarkable-contacts-v1', JSON.stringify(Array.from(oldData)));

    // 重新初始化（触发迁移）
    await ContactService.initialize();

    const contacts = await ContactService.getAllContacts();
    expect(contacts.some(c => c.email === 'old@example.com')).toBe(true);
  });
});
```

**验收标准**:
- ✅ ContactService 使用 StorageManager
- ✅ localStorage 数据自动迁移
- ✅ 双写 IndexedDB + SQLite
- ✅ 测试通过 (3/3)

**预计工作量**: 6-8 小时

---

### Day 5-7: EventService 迁移 (2025-12-07 至 2025-12-09)

#### 任务 1.3: EventService 重构（最大工作量）

**文件**: `src/services/EventService.ts`

**Step 1: 架构改造**

```typescript
import { StorageManager } from './storage/StorageManager';
import type { StorageEvent } from './storage/types';

class EventService {
  private static storageManager: StorageManager | null = null;
  private static initialized = false;

  /**
   * 初始化 EventService（必须在使用前调用）
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    this.storageManager = await StorageManager.getInstance();
    await this.storageManager.initialize();

    // 迁移旧数据（如果需要）
    await this.migrateFromLocalStorage();

    this.initialized = true;
    console.log('[EventService] ✅ Initialized with StorageManager');
  }

  /**
   * 从 localStorage 迁移事件数据
   */
  private static async migrateFromLocalStorage(): Promise<void> {
    const STORAGE_KEY = 'remarkable-events';
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) return;

    try {
      const oldEvents: Event[] = JSON.parse(stored);
      console.log(`[EventService] Migrating ${oldEvents.length} events from localStorage...`);

      // 转换为 StorageEvent 格式
      const storageEvents: StorageEvent[] = oldEvents.map(e => ({
        id: e.id,
        fullTitle: e.title?.fullTitle,
        colorTitle: e.title?.colorTitle,
        simpleTitle: e.title?.simpleTitle || '(无标题)',
        startTime: e.startTime,
        endTime: e.endTime,
        isAllDay: e.isAllDay,
        description: e.description,
        location: e.location,
        emoji: e.emoji,
        color: e.color,
        isCompleted: e.isCompleted,
        isTimer: e.isTimer,
        isPlan: e.isPlan,
        priority: e.priority,
        tags: JSON.stringify(e.tags || []),
        eventlog: JSON.stringify(e.eventlog || {}),
        syncStatus: 'local-only',
        createdAt: e.createdAt || new Date().toISOString(),
        updatedAt: e.updatedAt || new Date().toISOString()
      }));

      // 批量写入（自动双写）
      const result = await this.storageManager!.batchCreateEvents(storageEvents);
      console.log(`[EventService] ✅ Migrated ${result.successful}/${oldEvents.length} events`);

      // 备份旧数据并清理
      localStorage.setItem(`${STORAGE_KEY}-backup`, stored);
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[EventService] Migration failed:', error);
    }
  }

  /**
   * 获取所有事件
   */
  static async getAllEvents(): Promise<Event[]> {
    if (!this.storageManager) {
      console.warn('[EventService] Not initialized, returning empty array');
      return [];
    }

    const result = await this.storageManager.queryEvents({
      filters: [],
      limit: 10000,
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    });

    return result.items.map(this.storageEventToEvent);
  }

  /**
   * 创建事件
   */
  static async createEvent(event: Event): Promise<Event> {
    if (!this.storageManager) throw new Error('EventService not initialized');

    // 转换为 StorageEvent
    const storageEvent = this.eventToStorageEvent(event);

    // 写入存储（自动双写）
    await this.storageManager.createEvent(storageEvent);

    // 触发全局事件
    this.emitEvent('eventsUpdated', [event]);

    return event;
  }

  /**
   * 更新事件
   */
  static async updateEvent(eventId: string, updates: Partial<Event>): Promise<Event> {
    if (!this.storageManager) throw new Error('EventService not initialized');

    // 获取现有事件
    const existingEvent = await this.getEventById(eventId);
    if (!existingEvent) throw new Error(`Event not found: ${eventId}`);

    // 合并更新
    const updatedEvent = { ...existingEvent, ...updates, updatedAt: new Date().toISOString() };

    // 转换为 StorageEvent
    const storageEvent = this.eventToStorageEvent(updatedEvent);

    // 更新存储（自动双写）
    await this.storageManager.updateEvent(eventId, storageEvent);

    // 触发全局事件
    this.emitEvent('eventsUpdated', [updatedEvent]);

    return updatedEvent;
  }

  /**
   * 删除事件（软删除）
   */
  static async deleteEvent(eventId: string): Promise<void> {
    if (!this.storageManager) throw new Error('EventService not initialized');

    // 软删除（设置 deletedAt）
    await this.storageManager.deleteEvent(eventId);

    // 触发全局事件
    this.emitEvent('eventsUpdated', []);
  }

  /**
   * 转换函数
   */
  private static storageEventToEvent(se: StorageEvent): Event {
    return {
      id: se.id,
      title: {
        fullTitle: se.fullTitle,
        colorTitle: se.colorTitle,
        simpleTitle: se.simpleTitle
      },
      startTime: se.startTime,
      endTime: se.endTime,
      isAllDay: se.isAllDay,
      description: se.description,
      location: se.location,
      emoji: se.emoji,
      color: se.color,
      isCompleted: se.isCompleted,
      isTimer: se.isTimer,
      isPlan: se.isPlan,
      priority: se.priority,
      tags: se.tags ? JSON.parse(se.tags) : [],
      eventlog: se.eventlog ? JSON.parse(se.eventlog) : {},
      createdAt: se.createdAt,
      updatedAt: se.updatedAt
    };
  }

  private static eventToStorageEvent(e: Event): StorageEvent {
    return {
      id: e.id,
      fullTitle: e.title?.fullTitle,
      colorTitle: e.title?.colorTitle,
      simpleTitle: e.title?.simpleTitle || '(无标题)',
      startTime: e.startTime,
      endTime: e.endTime,
      isAllDay: e.isAllDay,
      description: e.description,
      location: e.location,
      emoji: e.emoji,
      color: e.color,
      isCompleted: e.isCompleted,
      isTimer: e.isTimer,
      isPlan: e.isPlan,
      priority: e.priority,
      tags: JSON.stringify(e.tags || []),
      eventlog: JSON.stringify(e.eventlog || {}),
      syncStatus: 'local-only',
      createdAt: e.createdAt || new Date().toISOString(),
      updatedAt: e.updatedAt || new Date().toISOString()
    };
  }
}
```

**Step 2: 更新所有调用点**

影响范围：
- `src/App.tsx` - 初始化
- `src/components/PlanManager.tsx` - 事件 CRUD
- `src/components/TimeCalendar.tsx` - 事件查询
- `src/components/EventEditModalV2.tsx` - 事件编辑
- `src/components/UpcomingEventsPanel.tsx` - 事件显示

**示例：App.tsx**

```typescript
// src/App.tsx
useEffect(() => {
  const initServices = async () => {
    // 初始化 EventService（会自动迁移数据）
    await EventService.initialize();
    console.log('[App] EventService initialized');

    // 其他初始化...
  };

  initServices();
}, []);
```

**测试计划**:
```typescript
// test/EventService.test.ts
describe('EventService Storage Migration', () => {
  beforeAll(async () => {
    await EventService.initialize();
  });

  it('should load events from StorageManager', async () => {
    const events = await EventService.getAllEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  it('should create event with double write', async () => {
    const event = {
      id: 'test-event-1',
      title: { simpleTitle: 'Test Event' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await EventService.createEvent(event);

    // 验证 IndexedDB
    const storage = await StorageManager.getInstance();
    const indexedDBEvent = await storage.getEvent('test-event-1');
    expect(indexedDBEvent).toBeTruthy();

    // 验证 SQLite（如果在 Electron 环境）
    if (storage.hasSQLite()) {
      const sqliteEvent = await storage.sqliteService.getEvent('test-event-1');
      expect(sqliteEvent).toEqual(indexedDBEvent);
    }
  });

  it('should migrate events from localStorage', async () => {
    // 模拟旧数据
    const oldEvents = [{
      id: 'old-event-1',
      title: { simpleTitle: 'Old Event' },
      createdAt: new Date().toISOString()
    }];
    localStorage.setItem('remarkable-events', JSON.stringify(oldEvents));

    // 重新初始化（触发迁移）
    await EventService.initialize();

    const events = await EventService.getAllEvents();
    expect(events.some(e => e.id === 'old-event-1')).toBe(true);
  });
});
```

**验收标准**:
- ✅ EventService 使用 StorageManager
- ✅ localStorage 数据自动迁移
- ✅ 双写 IndexedDB + SQLite
- ✅ 所有调用点已更新
- ✅ 测试通过 (20+)
- ✅ 无回归问题

**预计工作量**: 16-20 小时

---

## Week 2: High Priority Issues

### Day 8-10: 清理 localStorage 直接操作 (2025-12-10 至 2025-12-12)

#### 任务 2.1: 创建 ConfigManager

**文件**: `src/services/ConfigManager.ts`

```typescript
import { StorageManager } from './storage/StorageManager';

interface ConfigMetadata {
  key: string;
  value: string;
  category: 'setting' | 'cache' | 'sync' | 'ui';
  createdAt: string;
  updatedAt: string;
}

class ConfigManager {
  private static instance: ConfigManager;
  private storageManager: StorageManager;
  private cache: Map<string, any> = new Map();

  private constructor() {}

  static async getInstance(): Promise<ConfigManager> {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
      await ConfigManager.instance.initialize();
    }
    return ConfigManager.instance;
  }

  private async initialize(): Promise<void> {
    this.storageManager = await StorageManager.getInstance();
    await this.storageManager.initialize();
  }

  async get<T>(key: string, defaultValue: T, category: ConfigMetadata['category'] = 'setting'): Promise<T> {
    // 1. 查缓存
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // 2. 查 StorageManager
    const metadata = await this.storageManager.getMetadata(key);
    if (metadata) {
      const value = JSON.parse(metadata.value);
      this.cache.set(key, value);
      return value;
    }

    // 3. 返回默认值
    return defaultValue;
  }

  async set<T>(key: string, value: T, category: ConfigMetadata['category'] = 'setting'): Promise<void> {
    // 1. 更新缓存
    this.cache.set(key, value);

    // 2. 写入 StorageManager
    await this.storageManager.setMetadata({
      key,
      value: JSON.stringify(value),
      category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    await this.storageManager.deleteMetadata(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    await this.storageManager.clearMetadata();
  }
}

export default ConfigManager;
```

#### 任务 2.2: 迁移 ActionBasedSyncManager localStorage 调用

**文件**: `src/services/ActionBasedSyncManager.ts`

**变更列表**:

1. L549: Calendars Cache
   ```typescript
   // ❌ 旧代码
   const savedCalendars = localStorage.getItem(STORAGE_KEYS.CALENDARS_CACHE);
   
   // ✅ 新代码
   const savedCalendars = await ConfigManager.getInstance().get(
     STORAGE_KEYS.CALENDARS_CACHE,
     null,
     'cache'
   );
   ```

2. L648-666: Sync Actions Queue
   ```typescript
   // ❌ 旧代码
   private loadActionsFromStorage(): void {
     const stored = localStorage.getItem(STORAGE_KEYS.SYNC_ACTIONS);
     this.actionQueue = stored ? JSON.parse(stored) : [];
   }

   private saveActionsToStorage(): void {
     localStorage.setItem(STORAGE_KEYS.SYNC_ACTIONS, JSON.stringify(this.actionQueue));
   }

   // ✅ 新代码
   private async loadActionsFromStorage(): Promise<void> {
     this.actionQueue = await ConfigManager.getInstance().get(
       STORAGE_KEYS.SYNC_ACTIONS,
       [],
       'sync'
     );
   }

   private async saveActionsToStorage(): Promise<void> {
     await ConfigManager.getInstance().set(
       STORAGE_KEYS.SYNC_ACTIONS,
       this.actionQueue,
       'sync'
     );
   }
   ```

3. L1402-1406: Sync Stats
   ```typescript
   // ❌ 旧代码
   localStorage.setItem('lastSyncTime', formatTimeForStorage(this.lastSyncTime));
   localStorage.setItem('lastSyncEventCount', String(this.actionQueue.length || 0));
   localStorage.setItem('syncStats', JSON.stringify(this.syncStats));

   // ✅ 新代码
   const config = await ConfigManager.getInstance();
   await config.set('lastSyncTime', formatTimeForStorage(this.lastSyncTime), 'sync');
   await config.set('lastSyncEventCount', this.actionQueue.length || 0, 'sync');
   await config.set('syncStats', this.syncStats, 'sync');
   ```

**预计工作量**: 8-10 小时

---

### Day 11-13: 实施完整双写策略 (2025-12-13 至 2025-12-15)

#### 任务 2.3: 验证双写一致性

**测试脚本**: `scripts/verify-data-consistency.js`

```javascript
import { StorageManager } from '../src/services/storage/StorageManager.js';

async function verifyDataConsistency() {
  const storage = await StorageManager.getInstance();
  await storage.initialize();

  console.log('🔍 Verifying data consistency...\n');

  // 1. 检查事件数量
  const indexedDBEvents = await storage.indexedDBService.getAllEvents();
  const sqliteEvents = await storage.sqliteService?.getAllEvents() || [];

  console.log(`📊 Events:`);
  console.log(`  IndexedDB: ${indexedDBEvents.length}`);
  console.log(`  SQLite: ${sqliteEvents.length}`);

  if (indexedDBEvents.length !== sqliteEvents.length) {
    console.error('❌ Event count mismatch!');
  } else {
    console.log('✅ Event count matches');
  }

  // 2. 检查标签数量
  const indexedDBTags = await storage.indexedDBService.getAllTags();
  const sqliteTags = await storage.sqliteService?.queryTags({ limit: 10000 });

  console.log(`\n📊 Tags:`);
  console.log(`  IndexedDB: ${indexedDBTags.length}`);
  console.log(`  SQLite: ${sqliteTags?.items.length || 0}`);

  if (indexedDBTags.length !== sqliteTags?.items.length) {
    console.error('❌ Tag count mismatch!');
  } else {
    console.log('✅ Tag count matches');
  }

  // 3. 抽查数据内容
  console.log(`\n🔍 Sampling 10 random events...`);
  const sampleSize = Math.min(10, indexedDBEvents.length);
  
  for (let i = 0; i < sampleSize; i++) {
    const randomIndex = Math.floor(Math.random() * indexedDBEvents.length);
    const indexedDBEvent = indexedDBEvents[randomIndex];
    const sqliteEvent = await storage.sqliteService?.getEvent(indexedDBEvent.id);

    if (!sqliteEvent) {
      console.error(`❌ Event ${indexedDBEvent.id} missing in SQLite`);
      continue;
    }

    // 比较关键字段
    const fieldsMatch = 
      indexedDBEvent.simpleTitle === sqliteEvent.simpleTitle &&
      indexedDBEvent.startTime === sqliteEvent.startTime &&
      indexedDBEvent.endTime === sqliteEvent.endTime;

    if (fieldsMatch) {
      console.log(`✅ Event ${indexedDBEvent.id} data matches`);
    } else {
      console.error(`❌ Event ${indexedDBEvent.id} data mismatch`);
    }
  }

  console.log('\n✅ Consistency check completed');
}

verifyDataConsistency().catch(console.error);
```

**运行**: `node scripts/verify-data-consistency.js`

**预计工作量**: 6-8 小时

---

## Week 3: Testing & Validation

### Day 14-17: 集成测试 (2025-12-16 至 2025-12-19)

#### 任务 3.1: 补充集成测试

**文件**: `src/tests/integration/storage-integration.test.ts`

```typescript
import { EventService } from '../../services/EventService';
import { ContactService } from '../../services/ContactService';
import { TagService } from '../../services/TagService';
import { StorageManager } from '../../services/storage/StorageManager';

describe('Storage Integration Tests', () => {
  let storage: StorageManager;

  beforeAll(async () => {
    // 初始化所有服务
    storage = await StorageManager.getInstance();
    await storage.initialize();
    await EventService.initialize();
    await ContactService.initialize();
    await TagService.initialize();
  });

  afterAll(async () => {
    // 清理测试数据
    await storage.clearAll();
  });

  describe('EventService + StorageManager', () => {
    it('should sync event creation', async () => {
      const event = {
        id: 'integration-test-1',
        title: { simpleTitle: 'Integration Test Event' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 通过 EventService 创建
      await EventService.createEvent(event);

      // 从 StorageManager 读取
      const stored = await storage.getEvent('integration-test-1');
      expect(stored).toBeTruthy();
      expect(stored?.simpleTitle).toBe('Integration Test Event');
    });

    it('should sync event update', async () => {
      await EventService.updateEvent('integration-test-1', {
        title: { simpleTitle: 'Updated Title' }
      });

      const stored = await storage.getEvent('integration-test-1');
      expect(stored?.simpleTitle).toBe('Updated Title');
    });

    it('should sync event deletion', async () => {
      await EventService.deleteEvent('integration-test-1');

      const stored = await storage.getEvent('integration-test-1');
      expect(stored).toBeNull(); // 软删除后应该查不到
    });
  });

  describe('ContactService + StorageManager', () => {
    it('should sync contact creation', async () => {
      const contact = {
        name: 'Integration Test Contact',
        email: 'integration@test.com',
        phone: '1234567890'
      };

      await ContactService.addOrUpdateContact(contact);

      const result = await storage.queryContacts({
        filters: [{ field: 'email', operator: 'equals', value: 'integration@test.com' }],
        limit: 1
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].email).toBe('integration@test.com');
    });
  });

  describe('TagService + StorageManager', () => {
    it('should sync tag creation', async () => {
      const tag = {
        name: 'Integration Test Tag',
        color: '#FF0000',
        icon: '🧪'
      };

      await TagService.addTag(tag);

      const tags = await storage.queryTags({
        filters: [{ field: 'name', operator: 'equals', value: 'Integration Test Tag' }],
        limit: 1
      });

      expect(tags.items.length).toBe(1);
      expect(tags.items[0].name).toBe('Integration Test Tag');
    });
  });

  describe('Data Consistency', () => {
    it('IndexedDB and SQLite should have same event count', async () => {
      const indexedDBEvents = await storage.indexedDBService.getAllEvents();
      const sqliteResult = await storage.sqliteService?.queryEvents({ limit: 10000 });

      expect(indexedDBEvents.length).toBe(sqliteResult?.items.length || 0);
    });

    it('IndexedDB and SQLite should have same tag count', async () => {
      const indexedDBTags = await storage.indexedDBService.getAllTags();
      const sqliteResult = await storage.sqliteService?.queryTags({ limit: 10000 });

      expect(indexedDBTags.length).toBe(sqliteResult?.items.length || 0);
    });
  });

  describe('Performance', () => {
    it('should create 100 events in < 1 second', async () => {
      const start = performance.now();

      const promises = Array.from({ length: 100 }, (_, i) =>
        EventService.createEvent({
          id: `perf-test-${i}`,
          title: { simpleTitle: `Performance Test ${i}` },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      );

      await Promise.all(promises);

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1000);

      console.log(`✅ Created 100 events in ${duration.toFixed(2)}ms`);
    });
  });
});
```

**运行**: `npm test -- storage-integration.test.ts`

**预计工作量**: 10-12 小时

---

### Day 18-20: 数据迁移脚本 (2025-12-20 至 2025-12-22)

#### 任务 3.2: 创建一键迁移脚本

**文件**: `scripts/migrate-all-data.js`

```javascript
import { StorageManager } from '../src/services/storage/StorageManager.js';
import { EventService } from '../src/services/EventService.js';
import { ContactService } from '../src/services/ContactService.js';
import { TagService } from '../src/services/TagService.js';

async function migrateAllData() {
  console.log('🚀 Starting full data migration...\n');

  try {
    // 1. 初始化 StorageManager
    console.log('[1/5] Initializing StorageManager...');
    const storage = await StorageManager.getInstance();
    await storage.initialize();
    console.log('✅ StorageManager initialized\n');

    // 2. 迁移事件
    console.log('[2/5] Migrating events...');
    await EventService.initialize(); // 会自动触发迁移
    const events = await EventService.getAllEvents();
    console.log(`✅ Migrated ${events.length} events\n`);

    // 3. 迁移联系人
    console.log('[3/5] Migrating contacts...');
    await ContactService.initialize(); // 会自动触发迁移
    const contacts = await ContactService.getAllContacts();
    console.log(`✅ Migrated ${contacts.length} contacts\n`);

    // 4. 迁移标签
    console.log('[4/5] Migrating tags...');
    await TagService.initialize(); // 已完成迁移
    const tags = await TagService.getFlatTags();
    console.log(`✅ Migrated ${tags.length} tags\n`);

    // 5. 验证数据一致性
    console.log('[5/5] Verifying data consistency...');
    const indexedDBEvents = await storage.indexedDBService.getAllEvents();
    const sqliteEvents = await storage.sqliteService?.getAllEvents() || [];

    if (indexedDBEvents.length === sqliteEvents.length) {
      console.log('✅ Data consistency verified');
    } else {
      console.warn(`⚠️ Warning: IndexedDB has ${indexedDBEvents.length} events, SQLite has ${sqliteEvents.length}`);
    }

    console.log('\n🎉 Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateAllData();
```

**运行**: `node scripts/migrate-all-data.js`

**预计工作量**: 6-8 小时

---

## 风险管理

### 识别的风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **数据丢失** | 🔴 Critical | 低 (10%) | • 每次迁移前自动备份<br>• 保留 localStorage 备份 7 天 |
| **性能下降** | 🟡 Medium | 中 (30%) | • 性能测试<br>• LRU 缓存优化 |
| **回归 Bug** | 🟠 High | 中 (40%) | • 全面回归测试<br>• 灰度发布 |
| **不兼容性** | 🟡 Medium | 低 (20%) | • 版本兼容层<br>• 逐步废弃旧 API |

### 应急计划

**如果迁移失败**:
1. 立即回滚到上一个版本
2. 从 `localStorage-backup` 恢复数据
3. 禁用 StorageManager，降级到 localStorage only 模式
4. 调查失败原因，修复后重新部署

**数据恢复脚本**:
```javascript
// scripts/rollback-migration.js
async function rollbackMigration() {
  console.log('🔄 Rolling back migration...');

  // 1. 恢复 Events
  const eventsBackup = localStorage.getItem('remarkable-events-backup');
  if (eventsBackup) {
    localStorage.setItem('remarkable-events', eventsBackup);
    console.log('✅ Events restored');
  }

  // 2. 恢复 Contacts
  const contactsBackup = localStorage.getItem('remarkable-contacts-v1-backup');
  if (contactsBackup) {
    localStorage.setItem('remarkable-contacts-v1', contactsBackup);
    console.log('✅ Contacts restored');
  }

  console.log('✅ Rollback completed');
}
```

---

## 验收标准

### 代码质量

- [ ] 所有 `PersistentStorage` 引用已移除
- [ ] 所有 `localStorage.getItem/setItem` 已迁移
- [ ] EventService 使用 StorageManager
- [ ] ContactService 使用 StorageManager
- [ ] ActionBasedSyncManager 使用 TagService

### 数据一致性

- [ ] IndexedDB 和 SQLite 数据同步
- [ ] 所有写操作自动双写
- [ ] 数据迁移脚本测试通过
- [ ] 数据完整性验证通过

### 测试覆盖率

- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试覆盖核心场景
- [ ] 性能测试达标
- [ ] 回归测试通过

### 性能指标

| 操作 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 事件创建 | < 50ms | - | ⏳ |
| 事件查询 | < 20ms | - | ⏳ |
| 批量写入 (100) | < 500ms | - | ⏳ |
| 全文搜索 | < 100ms | - | ⏳ |

---

## 进度追踪

### Week 1 进度

| 任务 | 负责人 | 状态 | 完成度 |
|------|--------|------|--------|
| ActionBasedSyncManager 修复 | - | ⏳ 待开始 | 0% |
| ContactService 迁移 | - | ⏳ 待开始 | 0% |
| EventService 迁移 | - | ⏳ 待开始 | 0% |

### Week 2 进度

| 任务 | 负责人 | 状态 | 完成度 |
|------|--------|------|--------|
| 清理 localStorage | - | ⏳ 待开始 | 0% |
| 双写策略验证 | - | ⏳ 待开始 | 0% |

### Week 3 进度

| 任务 | 负责人 | 状态 | 完成度 |
|------|--------|------|--------|
| 集成测试 | - | ⏳ 待开始 | 0% |
| 数据迁移脚本 | - | ⏳ 待开始 | 0% |

---

## 参考文档

- [存储迁移审计报告](../audits/STORAGE_MIGRATION_AUDIT_REPORT.md)
- [存储架构设计](../architecture/STORAGE_ARCHITECTURE.md)
- [TagService 迁移报告](../architecture/STORAGE_ARCHITECTURE.md#8-tagservice-迁移完成报告)

---

**文档版本**: v1.0  
**最后更新**: 2025-12-03  
**下次更新**: 每周五更新进度
