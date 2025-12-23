/**
 * IndexedDBService - IndexedDB 存储服务
 * 
 * 职责：
 * - 管理 IndexedDB 数据库（近期 30 天热数据）
 * - 提供 CRUD 接口
 * - 支持索引查询和范围查询
 * 
 * Object Stores:
 * - accounts: 邮箱账号信息
 * - calendars: 日历信息
 * - events: 事件数据
 * - contacts: 联系人
 * - tags: 标签
 * - attachments: 附件元数据
 * - syncQueue: 同步队列
 * - metadata: 元数据
 * 
 * @version 1.0.0
 * @date 2025-12-01
 */

import type {
  Account,
  Calendar,
  StorageEvent,
  Contact,
  Tag,
  Attachment,
  SyncQueueItem,
  Metadata,
  StorageStats,
  QueryOptions,
  QueryResult,
  EventStats
} from './types';

import { formatTimeForStorage } from '../../utils/timeUtils';

const DB_NAME = '4DNoteDB';
const DB_VERSION = 3; // v3: Added event_stats store for performance

export class IndexedDBService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  
  // 🚀 性能优化：查询缓存（避免重复查询同一时间范围）
  private queryCache: Map<string, { data: any[]; timestamp: number }> = new Map();
  private CACHE_TTL = 60000; // 60秒缓存（页面切换通常在1分钟内返回）
  
  // 🔒 查询锁：防止并发重复查询（解决 React StrictMode 双重渲染问题）
  private pendingQueries: Map<string, Promise<QueryResult<StorageEvent>>> = new Map();

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      console.log('[IndexedDBService] 🔄 Opening database:', DB_NAME, 'version:', DB_VERSION);
      
      // 🆕 添加超时机制（10秒）
      const timeout = setTimeout(() => {
        console.error('[IndexedDBService] ❌ Initialization timeout (10s)');
        this.initPromise = null;
        reject(new Error('IndexedDB initialization timeout'));
      }, 10000);
      
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      console.log('[IndexedDBService] 🔍 Open request created:', request);

      request.onerror = () => {
        clearTimeout(timeout);
        const error = request.error;
        console.error('[IndexedDBService] ❌ Failed to open database:', error);
        this.initPromise = null;
        reject(error);
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        this.db = request.result;
        console.log('[IndexedDBService] ✅ Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        console.log('[IndexedDBService] 🔄 onupgradeneeded triggered');
        const db = (event.target as IDBOpenDBRequest).result;
        console.log('[IndexedDBService] Upgrading database schema...');
        console.log('[IndexedDBService] Current object stores:', Array.from(db.objectStoreNames));

        // 1. Accounts Store
        if (!db.objectStoreNames.contains('accounts')) {
          const accountsStore = db.createObjectStore('accounts', { keyPath: 'id' });
          accountsStore.createIndex('email', 'email', { unique: true });
          accountsStore.createIndex('provider', 'provider', { unique: false });
          console.log('[IndexedDBService] Created accounts store');
        }

        // 2. Calendars Store
        if (!db.objectStoreNames.contains('calendars')) {
          const calendarsStore = db.createObjectStore('calendars', { keyPath: 'id' });
          calendarsStore.createIndex('accountId', 'accountId', { unique: false });
          calendarsStore.createIndex('isDefault', 'isDefault', { unique: false });
          console.log('[IndexedDBService] Created calendars store');
        }

        // 3. Events Store
        if (!db.objectStoreNames.contains('events')) {
          const eventsStore = db.createObjectStore('events', { keyPath: 'id' });
          eventsStore.createIndex('startTime', 'startTime', { unique: false });
          eventsStore.createIndex('endTime', 'endTime', { unique: false });
          eventsStore.createIndex('sourceAccountId', 'sourceAccountId', { unique: false });
          eventsStore.createIndex('sourceCalendarId', 'sourceCalendarId', { unique: false });
          eventsStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          eventsStore.createIndex('parentId', 'parentId', { unique: false });
          eventsStore.createIndex('createdAt', 'createdAt', { unique: false });
          console.log('[IndexedDBService] Created events store');
        }

        // 4. Contacts Store
        if (!db.objectStoreNames.contains('contacts')) {
          const contactsStore = db.createObjectStore('contacts', { keyPath: 'id' });
          contactsStore.createIndex('email', 'email', { unique: false });
          contactsStore.createIndex('name', 'name', { unique: false });
          contactsStore.createIndex('sourceAccountId', 'sourceAccountId', { unique: false });
          console.log('[IndexedDBService] Created contacts store');
        }

        // 5. Tags Store
        if (!db.objectStoreNames.contains('tags')) {
          const tagsStore = db.createObjectStore('tags', { keyPath: 'id' });
          tagsStore.createIndex('name', 'name', { unique: false }); // 🔧 允许同名标签（不同层级）
          tagsStore.createIndex('parentId', 'parentId', { unique: false });
          console.log('[IndexedDBService] Created tags store');
        }

        // 6. Attachments Store
        if (!db.objectStoreNames.contains('attachments')) {
          const attachmentsStore = db.createObjectStore('attachments', { keyPath: 'id' });
          attachmentsStore.createIndex('eventId', 'eventId', { unique: false });
          attachmentsStore.createIndex('type', 'type', { unique: false });
          console.log('[IndexedDBService] Created attachments store');
        }

        // 7. SyncQueue Store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncQueueStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncQueueStore.createIndex('status', 'status', { unique: false });
          syncQueueStore.createIndex('accountId', 'accountId', { unique: false });
          syncQueueStore.createIndex('entityType', 'entityType', { unique: false });
          syncQueueStore.createIndex('createdAt', 'createdAt', { unique: false });
          console.log('[IndexedDBService] Created syncQueue store');
        }

        // 8. Metadata Store
        if (!db.objectStoreNames.contains('metadata')) {
          const metadataStore = db.createObjectStore('metadata', { keyPath: 'key' });
          console.log('[IndexedDBService] Created metadata store');
        }

        // 9. Event History Store (v2)
        if (!db.objectStoreNames.contains('event_history')) {
          const historyStore = db.createObjectStore('event_history', { keyPath: 'id' });
          historyStore.createIndex('eventId', 'eventId', { unique: false });
          historyStore.createIndex('operation', 'operation', { unique: false });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
          historyStore.createIndex('source', 'source', { unique: false });
          console.log('[IndexedDBService] Created event_history store');
        }

        // 10. Event Stats Store (v3) - 轻量级统计数据
        if (!db.objectStoreNames.contains('event_stats')) {
          const statsStore = db.createObjectStore('event_stats', { keyPath: 'id' });
          statsStore.createIndex('startTime', 'startTime', { unique: false });
          statsStore.createIndex('endTime', 'endTime', { unique: false });
          statsStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          statsStore.createIndex('calendarIds', 'calendarIds', { unique: false, multiEntry: true });
          statsStore.createIndex('source', 'source', { unique: false });
          console.log('[IndexedDBService] Created event_stats store');
        }

      request.onblocked = () => {
        console.warn('[IndexedDBService] ⚠️ Database upgrade blocked - please close other tabs');
        // 不 reject，等待用户关闭其他标签页
      };
        console.log('[IndexedDBService] ✅ Schema upgrade complete');
      };
    });

    return this.initPromise;
  }

  /**
   * 通用查询方法
   */
  private async query<T>(
    storeName: string,
    indexName?: string,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<T[]> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const request = query ? source.getAll(query) : source.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 通用获取单个项方法
   */
  private async get<T>(storeName: string, key: string): Promise<T | null> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 通用写入方法
   */
  private async put<T>(storeName: string, item: T): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 通用删除方法
   */
  private async delete(storeName: string, key: string): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== Accounts ====================

  async getAccount(id: string): Promise<Account | null> {
    return this.get<Account>('accounts', id);
  }

  async getAllAccounts(): Promise<Account[]> {
    return this.query<Account>('accounts');
  }

  async createAccount(account: Account): Promise<void> {
    return this.put('accounts', account);
  }

  async updateAccount(account: Account): Promise<void> {
    return this.put('accounts', account);
  }

  async deleteAccount(id: string): Promise<void> {
    return this.delete('accounts', id);
  }

  // ==================== Calendars ====================

  async getCalendar(id: string): Promise<Calendar | null> {
    return this.get<Calendar>('calendars', id);
  }

  async getCalendarsByAccount(accountId: string): Promise<Calendar[]> {
    return this.query<Calendar>('calendars', 'accountId', accountId);
  }

  async createCalendar(calendar: Calendar): Promise<void> {
    return this.put('calendars', calendar);
  }

  async updateCalendar(calendar: Calendar): Promise<void> {
    return this.put('calendars', calendar);
  }

  async deleteCalendar(id: string): Promise<void> {
    return this.delete('calendars', id);
  }

  // ==================== Events ====================

  async getEvent(id: string): Promise<StorageEvent | null> {
    return this.get<StorageEvent>('events', id);
  }

  async queryEvents(options: QueryOptions): Promise<QueryResult<StorageEvent>> {
    // 🚀 辅助函数：将 Date 转为 TimeSpec 格式字符串（用于缓存键）
    const formatKey = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d} ${h}:${min}:${s}`;
    };

    // 🚀 缓存检查和查询锁
    if (options.startDate || options.endDate) {
      const cacheKey = `${options.startDate ? formatKey(options.startDate) : 'null'}_${options.endDate ? formatKey(options.endDate) : 'null'}`;
      
      // 🔒 检查是否有正在进行的查询（防止并发重复）
      const pendingQuery = this.pendingQueries.get(cacheKey);
      if (pendingQuery) {
        console.log(`[IndexedDB] 🔒 Query already in progress, waiting... key="${cacheKey}"`);
        return pendingQuery;
      }
      
      // 检查缓存
      const cached = this.queryCache.get(cacheKey);
      console.log(`[IndexedDB] 🔍 Cache lookup: key="${cacheKey}", found=${!!cached}, age=${cached ? (performance.now() - cached.timestamp).toFixed(0) : 'N/A'}ms, TTL=${this.CACHE_TTL}ms`);
      
      if (cached && (performance.now() - cached.timestamp) < this.CACHE_TTL) {
        console.log(`[IndexedDB] ⚡ Cache hit: ${cached.data.length} events (saved ${(performance.now() - cached.timestamp).toFixed(0)}ms ago)`);
        return {
          items: cached.data,
          total: cached.data.length,
          hasMore: false,
          offset: 0
        };
      }
      
      // 🔒 创建查询 Promise 并加锁
      const queryPromise = this.executeQuery(options, formatKey, cacheKey);
      this.pendingQueries.set(cacheKey, queryPromise);
      
      try {
        const result = await queryPromise;
        return result;
      } finally {
        // 查询完成后释放锁
        this.pendingQueries.delete(cacheKey);
      }
    }
    
    // 无时间范围的查询直接执行（不需要锁）
    return this.executeQuery(options, formatKey, null);
  }

  // 🚀 实际执行查询的内部方法
  private async executeQuery(
    options: QueryOptions, 
    formatKey: (date: Date) => string,
    cacheKey: string | null
  ): Promise<QueryResult<StorageEvent>> {
    const perfStart = performance.now();
    let events: StorageEvent[];

    // 🚀 优化：优先使用索引查询
    if (options.startDate || options.endDate) {
      // 使用 startTime 索引查询时间范围
      const initStart = performance.now();
      await this.initialize();
      const initDuration = performance.now() - initStart;
      
      const queryStart = performance.now();
      
      // 🔧 [FIX] 构建时间范围查询 - 支持 TimeSpec 格式 (YYYY-MM-DD HH:mm:ss)
      // TimeSpec 格式按字符串排序也是正确的时间顺序
      const formatForIndex = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };
      
      const range = options.startDate && options.endDate
        ? IDBKeyRange.bound(formatForIndex(options.startDate), formatForIndex(options.endDate))
        : options.startDate
        ? IDBKeyRange.lowerBound(formatForIndex(options.startDate))
        : options.endDate
        ? IDBKeyRange.upperBound(formatForIndex(options.endDate))
        : null;
      
      // 🚀 [PERFORMANCE FIX] 使用 getAll() 替代游标遍历（快 5-10 倍）
      // getAll() 会在 C++ 层批量读取，比 JS 层的 cursor.continue() 快得多
      const allEvents = await this.query<StorageEvent>('events', 'startTime', range || undefined);
      
      // 🔧 过滤软删除的事件（内存中过滤很快）
      events = allEvents.filter(event => !event.deletedAt);
      
      const queryDuration = performance.now() - queryStart;
      
      // 🚀 缓存查询结果
      if (cacheKey) {
        this.queryCache.set(cacheKey, { data: events, timestamp: performance.now() });
        console.log(`[IndexedDB] 💾 Cache saved: key="${cacheKey}", ${events.length} events, total cached queries: ${this.queryCache.size}`);
        
        // 清理过期缓存（最多保留10条）
        if (this.queryCache.size > 10) {
          const oldestKey = Array.from(this.queryCache.keys())[0];
          this.queryCache.delete(oldestKey);
        }
      }
      
      // 🔍 总是显示查询时间（用于性能调试）
      console.log(`[IndexedDB] ⚡ Index query took ${queryDuration.toFixed(1)}ms (init: ${initDuration.toFixed(1)}ms) → ${events.length} events`);
    } else {
      // 🚀 [PERFORMANCE FIX] 无时间范围过滤，使用 getAll() 全表读取
      // getAll() 比游标遍历快 5-10 倍（批量读取 vs 逐个读取）
      const queryStart = performance.now();
      await this.initialize();
      const allEvents = await this.query<StorageEvent>('events');
      
      // 🔧 过滤软删除的事件
      events = allEvents.filter(event => !event.deletedAt);
      
      const queryDuration = performance.now() - queryStart;
      // ✨ 只记录慢查询（>200ms）以减少噪音
      if (queryDuration > 200) {
        console.log(`[IndexedDB] ⚡ Slow query took ${queryDuration.toFixed(1)}ms → ${events.length} events`);
      }
    }

    // 筛选：事件 ID 列表（精确匹配）
    if (options.filters?.eventIds && options.filters.eventIds.length > 0) {
      events = events.filter(event => 
        options.filters!.eventIds!.includes(event.id)
      );
    }

    // 筛选：账号
    if (options.accountIds && options.accountIds.length > 0) {
      events = events.filter(event => 
        event.sourceAccountId && options.accountIds!.includes(event.sourceAccountId)
      );
    }

    // 排序
    if (options.orderBy) {
      const direction = options.orderDirection === 'desc' ? -1 : 1;
      events.sort((a, b) => {
        const aVal = (a as any)[options.orderBy!];
        const bVal = (b as any)[options.orderBy!];
        if (aVal < bVal) return -direction;
        if (aVal > bVal) return direction;
        return 0;
      });
    }

    // 分页
    const total = events.length;
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    const paginatedEvents = events.slice(offset, offset + limit);

    return {
      items: paginatedEvents,
      total,
      hasMore: offset + limit < total
    };
  }

  async createEvent(event: StorageEvent): Promise<void> {
    this.clearQueryCache(); // 清除缓存
    return this.put('events', event);
  }

  async updateEvent(id: string, updates: Partial<StorageEvent>): Promise<void> {
    const existingEvent = await this.getEvent(id);
    if (!existingEvent) {
      throw new Error(`Event not found: ${id}`);
    }
    // 🔧 [TIMESPEC] 使用 formatTimeForStorage 确保 TimeSpec 格式
    const formatTimeForStorage = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };
    const updatedEvent = { ...existingEvent, ...updates, updatedAt: formatTimeForStorage(new Date()) };
    this.clearQueryCache(); // 清除缓存
    return this.put('events', updatedEvent);
  }

  async deleteEvent(id: string): Promise<void> {
    this.clearQueryCache(); // 清除缓存
    return this.delete('events', id);
  }

  async batchDeleteEvents(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('events', 'readwrite');
      const store = transaction.objectStore('events');

      for (const id of ids) {
        store.delete(id);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async batchCreateEvents(events: StorageEvent[]): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('events', 'readwrite');
      const store = transaction.objectStore('events');

      for (const event of events) {
        store.put(event);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * 🔒 批量更新事件（事务性）- Phase 3优化
   * 
   * 使用单个IndexedDB事务处理所有更新，提供原子性保证
   * 
   * @param events - 完整的事件对象数组
   */
  async batchUpdateEvents(events: StorageEvent[]): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      console.log('[IndexedDB] 🔒 Starting batch update transaction:', {
        count: events.length,
        eventIds: events.map(e => e.id.slice(-8)).join(', ')
      });

      const transaction = this.db.transaction('events', 'readwrite');
      const store = transaction.objectStore('events');

      // 在单个事务中更新所有事件
      for (const event of events) {
        store.put(event);
      }

      transaction.oncomplete = () => {
        console.log('[IndexedDB] ✅ Batch update transaction completed');
        resolve();
      };
      
      transaction.onerror = () => {
        console.error('[IndexedDB] ❌ Batch update transaction failed:', transaction.error);
        reject(transaction.error);
      };
      
      transaction.onabort = () => {
        console.error('[IndexedDB] ❌ Batch update transaction aborted');
        reject(new Error('Transaction aborted'));
      };
    });
  }

  // ==================== 其他 Stores ====================

  // Tags
  async getAllTags(): Promise<Tag[]> {
    return this.query<Tag>('tags');
  }

  async createTag(tag: Tag): Promise<void> {
    return this.put('tags', tag);
  }

  async getTag(id: string): Promise<Tag | null> {
    return this.get('tags', id);
  }

  async getTags(): Promise<Tag[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('tags', 'readonly');
      const store = transaction.objectStore('tags');
      const request = store.getAll();

      request.onsuccess = () => {
        const tags = request.result as Tag[];
        // 过滤已删除的标签
        resolve(tags.filter(t => !t.deletedAt));
      };

      request.onerror = () => {
        reject(new Error('Failed to get tags'));
      };
    });
  }

  async updateTag(id: string, updates: Partial<Tag>): Promise<void> {
    const existing = await this.getTag(id);
    if (!existing) {
      throw new Error(`Tag not found: ${id}`);
    }
    const updated = { ...existing, ...updates };
    return this.put('tags', updated);
  }

  async hardDeleteTag(id: string): Promise<void> {
    return this.delete('tags', id);
  }

  // ==================== Contact 操作 ====================

  /**
   * 查询联系人
   */
  async queryContacts(options: QueryOptions = {}): Promise<QueryResult<Contact>> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('contacts', 'readonly');
      const store = transaction.objectStore('contacts');
      const request = store.getAll();

      request.onsuccess = () => {
        let contacts = request.result as Contact[];

        // 过滤已删除的联系人
        contacts = contacts.filter(c => !c.deletedAt);

        // 应用过滤条件
        if (options.filters) {
          const { contactIds, emails, sources, searchText } = options.filters;

          if (contactIds && contactIds.length > 0) {
            contacts = contacts.filter(c => contactIds.includes(c.id));
          }

          if (emails && emails.length > 0) {
            contacts = contacts.filter(c => emails.includes(c.email));
          }

          if (sources && sources.length > 0) {
            contacts = contacts.filter(c => sources.includes(c.source || 'local'));
          }

          if (searchText) {
            const search = searchText.toLowerCase();
            contacts = contacts.filter(c =>
              c.name.toLowerCase().includes(search) ||
              c.email.toLowerCase().includes(search) ||
              (c.phone && c.phone.includes(search))
            );
          }
        }

        // 排序
        contacts.sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        // 分页
        const offset = options.offset || 0;
        const limit = options.limit || 1000;
        const paginatedContacts = contacts.slice(offset, offset + limit);

        resolve({
          items: paginatedContacts,
          total: contacts.length,
          hasMore: offset + limit < contacts.length
        });
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 创建联系人
   */
  async createContact(contact: Contact): Promise<void> {
    return this.put('contacts', contact);
  }

  /**
   * 更新联系人
   */
  async updateContact(contact: Contact): Promise<void> {
    return this.put('contacts', contact);
  }

  /**
   * 删除联系人（通过 ID）
   */
  async deleteContact(id: string): Promise<void> {
    return this.delete('contacts', id);
  }

  /**
   * 获取所有联系人（旧接口，兼容性保留）
   */
  async getAllContacts(): Promise<Contact[]> {
    return this.query<Contact>('contacts');
  }

  // ==================== 缓存管理 ====================
  
  /**
   * 清除查询缓存（数据更新时调用）
   */
  clearQueryCache(): void {
    this.queryCache.clear();
  }

  // ==================== SyncQueue 操作 ====================
  
  // SyncQueue
  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return this.query<SyncQueueItem>('syncQueue');
  }

  async addToSyncQueue(item: SyncQueueItem): Promise<void> {
    return this.put('syncQueue', item);
  }

  async removeFromSyncQueue(id: string): Promise<void> {
    return this.delete('syncQueue', id);
  }

  // Metadata
  async getMetadata(key: string): Promise<any> {
    const metadata = await this.get<Metadata>('metadata', key);
    return metadata ? metadata.value : null;
  }

  async setMetadata(key: string, value: any): Promise<void> {
    const metadata: Metadata = {
      key,
      value,
      updatedAt: formatTimeForStorage(new Date())
    };
    return this.put('metadata', metadata);
  }

  /**
   * 获取存储使用情况
   */
  async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { usage: 0, quota: 0 };
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats(): Promise<Partial<StorageStats>> {
    await this.initialize();
    
    const estimate = await this.getStorageEstimate();
    
    const [
      accountsCount,
      calendarsCount,
      eventsCount,
      contactsCount,
      tagsCount
    ] = await Promise.all([
      this.count('accounts'),
      this.count('calendars'),
      this.count('events'),
      this.count('contacts'),
      this.count('tags')
    ]);

    return {
      indexedDB: {
        used: estimate.usage,
        quota: estimate.quota,
        percentage: estimate.quota > 0 ? (estimate.usage / estimate.quota) * 100 : 0,
        eventsCount,
        contactsCount,
        tagsCount
      }
    };
  }

  /**
   * 统计 Store 中的记录数
   */
  private async count(storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清空所有数据（危险操作！）
   */
  async clearAll(): Promise<void> {
    await this.initialize();
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const storeNames = Array.from(this.db.objectStoreNames);
    const transaction = this.db.transaction(storeNames, 'readwrite');

    for (const storeName of storeNames) {
      transaction.objectStore(storeName).clear();
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('[IndexedDBService] All data cleared');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * 关闭数据库
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
      console.log('[IndexedDBService] Database closed');
    }
  }

  // ==================== Event History Methods ====================

  /**
   * 创建事件历史记录（如果已存在则报错）
   */
  async createEventHistory(log: {
    id: string;
    eventId: string;
    operation: 'create' | 'update' | 'delete' | 'checkin' | 'uncheck';
    timestamp: string;
    source: string;
    before?: any;
    after?: any;
    changes?: any;
    userId?: string;
    metadata?: any;
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['event_history'], 'readwrite');
      const store = transaction.objectStore('event_history');
      
      const request = store.add({
        ...log,
        createdAt: formatTimeForStorage(new Date())
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 创建或更新事件历史记录（幂等操作，用于迁移）
   */
  async createOrUpdateEventHistory(log: {
    id: string;
    eventId: string;
    operation: 'create' | 'update' | 'delete' | 'checkin' | 'uncheck';
    timestamp: string;
    source: string;
    before?: any;
    after?: any;
    changes?: any;
    userId?: string;
    metadata?: any;
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['event_history'], 'readwrite');
      const store = transaction.objectStore('event_history');
      
      // 使用 put（而非 add）：如果主键存在则更新，不存在则创建
      const request = store.put({
        ...log,
        createdAt: formatTimeForStorage(new Date())
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 查询事件历史记录
   */
  async queryEventHistory(options: {
    eventIds?: string[];
    operations?: string[];
    startTime?: string;
    endTime?: string;
    source?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['event_history'], 'readonly');
      const store = transaction.objectStore('event_history');
      
      let request: IDBRequest;

      // 如果有 eventIds 过滤，使用索引
      if (options.eventIds && options.eventIds.length === 1) {
        const index = store.index('eventId');
        request = index.getAll(options.eventIds[0]);
      } else {
        // 否则获取所有记录
        request = store.getAll();
      }

      request.onsuccess = () => {
        let results = request.result || [];

        // 应用过滤条件
        if (options.eventIds && options.eventIds.length > 1) {
          const eventIdSet = new Set(options.eventIds);
          results = results.filter(log => eventIdSet.has(log.eventId));
        }

        if (options.operations && options.operations.length > 0) {
          const opSet = new Set(options.operations);
          results = results.filter(log => opSet.has(log.operation));
        }

        if (options.startTime) {
          results = results.filter(log => log.timestamp >= options.startTime!);
        }

        if (options.endTime) {
          results = results.filter(log => log.timestamp <= options.endTime!);
        }

        if (options.source) {
          results = results.filter(log => log.source === options.source);
        }

        // 按时间倒序排序
        results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        // 分页
        const offset = options.offset || 0;
        const limit = options.limit || 1000;
        results = results.slice(offset, offset + limit);

        resolve(results);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除单条历史记录
   */
  async deleteEventHistory(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['event_history'], 'readwrite');
      const store = transaction.objectStore('event_history');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除旧的历史记录
   */
  async cleanupEventHistory(olderThan: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['event_history'], 'readwrite');
      const store = transaction.objectStore('event_history');
      const index = store.index('timestamp');
      
      const range = IDBKeyRange.upperBound(olderThan, true);
      const request = index.openCursor(range);
      let deletedCount = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取历史统计信息
   */
  async getEventHistoryStats(): Promise<{
    total: number;
    byOperation: Record<string, number>;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['event_history'], 'readonly');
      const store = transaction.objectStore('event_history');
      const request = store.getAll();

      request.onsuccess = () => {
        const logs = request.result || [];
        
        const byOperation: Record<string, number> = {};
        let oldestTimestamp: string | null = null;
        let newestTimestamp: string | null = null;

        logs.forEach(log => {
          // 按操作类型统计
          byOperation[log.operation] = (byOperation[log.operation] || 0) + 1;

          // 更新时间范围
          if (!oldestTimestamp || log.timestamp < oldestTimestamp) {
            oldestTimestamp = log.timestamp;
          }
          if (!newestTimestamp || log.timestamp > newestTimestamp) {
            newestTimestamp = log.timestamp;
          }
        });

        resolve({
          total: logs.length,
          byOperation,
          oldestTimestamp,
          newestTimestamp
        });
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 重置数据库（删除并重建）
   */
  async resetDatabase(): Promise<void> {
    console.log('[IndexedDBService] Resetting database...');
    
    // 关闭现有连接
    this.close();

    // 删除数据库
    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
      
      deleteRequest.onsuccess = () => {
        console.log('[IndexedDBService] ✅ Database deleted successfully');
        resolve();
      };
      
      deleteRequest.onerror = () => {
        console.error('[IndexedDBService] ❌ Failed to delete database:', deleteRequest.error);
        reject(deleteRequest.error);
      };
      
      deleteRequest.onblocked = () => {
        console.warn('[IndexedDBService] ⚠️  Database deletion blocked (close all tabs)');
      };
    });
  }

  // ==================== EventStats CRUD ====================

  /**
   * 创建 EventStats
   */
  async createEventStats(stats: EventStats): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('event_stats', 'readwrite');
      const store = transaction.objectStore('event_stats');
      const request = store.put(stats); // 使用 put 允许覆盖（用于补全缺失的 stats）

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 批量创建 EventStats（分批写入，避免事务超时）
   */
  async bulkCreateEventStats(statsList: EventStats[]): Promise<void> {
    await this.initialize();
    
    const BATCH_SIZE = 100; // 每批 100 条，避免事务超时
    let totalSuccess = 0;
    let totalErrors = 0;

    // 分批处理
    for (let i = 0; i < statsList.length; i += BATCH_SIZE) {
      const batch = statsList.slice(i, i + BATCH_SIZE);
      
      await new Promise<void>((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }

        const transaction = this.db.transaction('event_stats', 'readwrite');
        const store = transaction.objectStore('event_stats');
        
        let successCount = 0;
        let errorCount = 0;
        
        batch.forEach((stats, index) => {
          const request = store.add(stats);
          request.onsuccess = () => successCount++;
          request.onerror = (event) => {
            errorCount++;
            console.error(`[IndexedDB] Failed to add EventStats[${i + index}]:`, stats.id, request.error);
            event.stopPropagation();
          };
        });

        transaction.oncomplete = () => {
          totalSuccess += successCount;
          totalErrors += errorCount;
          resolve();
        };
        
        transaction.onerror = () => {
          console.error('[IndexedDB] Transaction error:', transaction.error);
          reject(transaction.error);
        };
        
        transaction.onabort = () => {
          console.error('[IndexedDB] Transaction aborted');
          reject(new Error('Transaction aborted'));
        };
      });
    }

    console.log(`[IndexedDB] 📊 Bulk insert completed: ${totalSuccess} success, ${totalErrors} errors (${statsList.length} total)`);
  }

  /**
   * 更新 EventStats
   */
  async updateEventStats(id: string, updates: Partial<EventStats>): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(['event_stats', 'events'], 'readwrite');
      const store = transaction.objectStore('event_stats');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          // 🔧 如果 EventStats 不存在，从 events 表提取并创建
          console.warn(`[IndexedDB] EventStats not found, creating from event: ${id}`);
          
          const eventsStore = transaction.objectStore('events');
          const eventRequest = eventsStore.get(id);
          
          eventRequest.onsuccess = () => {
            const event = eventRequest.result;
            if (!event) {
              reject(new Error(`Event not found: ${id}`));
              return;
            }
            
            // 创建新的 EventStats 记录
            const newStats: EventStats = {
              id: event.id,
              tags: event.tags || [],
              calendarIds: event.calendarIds || [],
              startTime: event.startTime,
              endTime: event.endTime,
              source: event.source,
              updatedAt: event.updatedAt,
              ...updates // 应用更新
            };
            
            const putRequest = store.put(newStats);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
          };
          
          eventRequest.onerror = () => reject(eventRequest.error);
          return;
        }

        const updated = { ...existing, ...updates };
        const putRequest = store.put(updated);
        
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * 删除 EventStats
   */
  async deleteEventStats(id: string): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('event_stats', 'readwrite');
      const store = transaction.objectStore('event_stats');
      const request = store.delete(id);

      // 🔧 delete 操作即使记录不存在也会成功，无需额外容错
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 按日期范围查询 EventStats
   */
  async queryEventStats(options: QueryOptions): Promise<QueryResult<EventStats>> {
    await this.initialize();
    
    const perfStart = performance.now();
    
    // 🔧 日期格式化（TimeSpec 标准格式：YYYY-MM-DD HH:mm:ss）
    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };
    
    const startTimeStr = options.startDate 
      ? formatDate(options.startDate) 
      : '1970-01-01 00:00:00';
    const endTimeStr = options.endDate 
      ? formatDate(options.endDate) 
      : '2099-12-31 23:59:59';
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('event_stats', 'readonly');
      const store = transaction.objectStore('event_stats');
      const index = store.index('startTime');
      
      const range = IDBKeyRange.bound(startTimeStr, endTimeStr);
      const request = index.getAll(range);

      request.onsuccess = () => {
        const results = request.result || [];
        const duration = performance.now() - perfStart;
        
        // 只在慢查询（>50ms）或有结果时输出日志，避免刷屏
        if (duration > 50 || results.length > 0) {
          console.log(`[IndexedDB] ⚡ EventStats query: ${duration.toFixed(1)}ms → ${results.length} records`);
        }
        
        resolve({
          items: results,
          total: results.length,
          hasMore: false
        });
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 🚀 [MIGRATION] 从 events 表提取 EventStats（仅读取必要字段）
   * 避免反序列化完整 Event 对象（eventlog、title 等大字段）
   */
  async extractEventStatsFromEvents(): Promise<EventStats[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('events', 'readonly');
      const store = transaction.objectStore('events');
      const request = store.openCursor();
      const statsList: EventStats[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        
        if (cursor) {
          const event = cursor.value;
          
          // 只提取 EventStats 需要的字段（跳过 eventlog、title 等大对象）
          statsList.push({
            id: event.id,
            tags: event.tags || [],
            calendarIds: event.calendarIds || [],
            startTime: event.startTime,
            endTime: event.endTime,
            source: event.source,
            updatedAt: event.updatedAt,
          });
          
          cursor.continue();
        } else {
          // 遍历完成
          console.log(`[IndexedDB] 📊 Extracted ${statsList.length} EventStats records`);
          resolve(statsList);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ==================== End EventStats CRUD ====================
}

// 导出单例实例
export const indexedDBService = new IndexedDBService();
