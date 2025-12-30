/**
 * IndexedDBService - IndexedDB 瀛樺偍鏈嶅姟
 * 
 * 鑱岃矗锛?
 * - 绠＄悊 IndexedDB 鏁版嵁搴擄紙杩戞湡 30 澶╃儹鏁版嵁锛?
 * - 鎻愪緵 CRUD 鎺ュ彛
 * - 鏀寔绱㈠紩鏌ヨ鍜岃寖鍥存煡璇?
 * 
 * Object Stores:
 * - accounts: 閭璐﹀彿淇℃伅
 * - calendars: 鏃ュ巻淇℃伅
 * - events: 浜嬩欢鏁版嵁
 * - contacts: 鑱旂郴浜?
 * - tags: 鏍囩
 * - attachments: 闄勪欢鍏冩暟鎹?
 * - syncQueue: 鍚屾闃熷垪
 * - metadata: 鍏冩暟鎹?
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
const DB_VERSION = 4; // v4: event_stats adds parentEventId/rootEventId indexes for tree context

export class IndexedDBService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  
  // 馃殌 鎬ц兘浼樺寲锛氭煡璇㈢紦瀛橈紙閬垮厤閲嶅鏌ヨ鍚屼竴鏃堕棿鑼冨洿锛?
  private queryCache: Map<string, { data: any[]; timestamp: number }> = new Map();
  private CACHE_TTL = 60000; // 60绉掔紦瀛橈紙椤甸潰鍒囨崲閫氬父鍦?鍒嗛挓鍐呰繑鍥烇級
  
  // 馃敀 鏌ヨ閿侊細闃叉骞跺彂閲嶅鏌ヨ锛堣В鍐?React StrictMode 鍙岄噸娓叉煋闂锛?
  private pendingQueries: Map<string, Promise<QueryResult<StorageEvent>>> = new Map();

  /**
   * 鍒濆鍖栨暟鎹簱
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      console.log('[IndexedDBService] 馃攧 Opening database:', DB_NAME, 'version:', DB_VERSION);
      
      // 馃啎 娣诲姞瓒呮椂鏈哄埗锛?0绉掞級
      const timeout = setTimeout(() => {
        console.error('[IndexedDBService] 鉂?Initialization timeout (10s)');
        this.initPromise = null;
        reject(new Error('IndexedDB initialization timeout'));
      }, 10000);
      
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      console.log('[IndexedDBService] 馃攳 Open request created:', request);

      request.onerror = () => {
        clearTimeout(timeout);
        const error = request.error;
        console.error('[IndexedDBService] 鉂?Failed to open database:', error);
        this.initPromise = null;
        reject(error);
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        this.db = request.result;
        console.log('[IndexedDBService] 鉁?Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        console.log('[IndexedDBService] 馃攧 onupgradeneeded triggered');
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
          tagsStore.createIndex('name', 'name', { unique: false }); // 馃敡 鍏佽鍚屽悕鏍囩锛堜笉鍚屽眰绾э級
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
        }        // 10. Event Stats Store (v4) - lightweight derived index
        if (!db.objectStoreNames.contains('event_stats')) {
          const statsStore = db.createObjectStore('event_stats', { keyPath: 'id' });
          statsStore.createIndex('startTime', 'startTime', { unique: false });
          statsStore.createIndex('endTime', 'endTime', { unique: false });
          statsStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          statsStore.createIndex('calendarIds', 'calendarIds', { unique: false, multiEntry: true });
          statsStore.createIndex('source', 'source', { unique: false });
          statsStore.createIndex('parentEventId', 'parentEventId', { unique: false });
          statsStore.createIndex('rootEventId', 'rootEventId', { unique: false });
          console.log('[IndexedDBService] Created event_stats store');
        } else {
          // Ensure new indexes exist after upgrading DB_VERSION
          const tx = (event.target as IDBOpenDBRequest).transaction;
          if (tx) {
            const statsStore = tx.objectStore('event_stats');
            if (!statsStore.indexNames.contains('parentEventId')) {
              statsStore.createIndex('parentEventId', 'parentEventId', { unique: false });
            }
            if (!statsStore.indexNames.contains('rootEventId')) {
              statsStore.createIndex('rootEventId', 'rootEventId', { unique: false });
            }
          }
        }

      request.onblocked = () => {
        console.warn('[IndexedDBService] 鈿狅笍 Database upgrade blocked - please close other tabs');
        // 涓?reject锛岀瓑寰呯敤鎴峰叧闂叾浠栨爣绛鹃〉
      };
        console.log('[IndexedDBService] 鉁?Schema upgrade complete');
      };
    });

    return this.initPromise;
  }

  /**
   * 閫氱敤鏌ヨ鏂规硶
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
   * 閫氱敤鑾峰彇鍗曚釜椤规柟娉?
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
   * 閫氱敤鍐欏叆鏂规硶
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
   * 閫氱敤鍒犻櫎鏂规硶
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
    // 馃殌 杈呭姪鍑芥暟锛氬皢 Date 杞负 TimeSpec 鏍煎紡瀛楃涓诧紙鐢ㄤ簬缂撳瓨閿級
    const formatKey = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d} ${h}:${min}:${s}`;
    };

    // 馃殌 缂撳瓨妫€鏌ュ拰鏌ヨ閿?
    if (options.startDate || options.endDate) {
      const cacheKey = `${options.startDate ? formatKey(options.startDate) : 'null'}_${options.endDate ? formatKey(options.endDate) : 'null'}`;
      
      // 馃敀 妫€鏌ユ槸鍚︽湁姝ｅ湪杩涜鐨勬煡璇紙闃叉骞跺彂閲嶅锛?
      const pendingQuery = this.pendingQueries.get(cacheKey);
      if (pendingQuery) {
        console.log(`[IndexedDB] 馃敀 Query already in progress, waiting... key="${cacheKey}"`);
        return pendingQuery;
      }
      
      // 妫€鏌ョ紦瀛?
      const cached = this.queryCache.get(cacheKey);
      console.log(`[IndexedDB] 馃攳 Cache lookup: key="${cacheKey}", found=${!!cached}, age=${cached ? (performance.now() - cached.timestamp).toFixed(0) : 'N/A'}ms, TTL=${this.CACHE_TTL}ms`);
      
      if (cached && (performance.now() - cached.timestamp) < this.CACHE_TTL) {
        console.log(`[IndexedDB] 鈿?Cache hit: ${cached.data.length} events (saved ${(performance.now() - cached.timestamp).toFixed(0)}ms ago)`);
        return {
          items: cached.data,
          total: cached.data.length,
          hasMore: false,
          offset: 0
        };
      }
      
      // 馃敀 鍒涘缓鏌ヨ Promise 骞跺姞閿?
      const queryPromise = this.executeQuery(options, formatKey, cacheKey);
      this.pendingQueries.set(cacheKey, queryPromise);
      
      try {
        const result = await queryPromise;
        return result;
      } finally {
        // 鏌ヨ瀹屾垚鍚庨噴鏀鹃攣
        this.pendingQueries.delete(cacheKey);
      }
    }
    
    // 鏃犳椂闂磋寖鍥寸殑鏌ヨ鐩存帴鎵ц锛堜笉闇€瑕侀攣锛?
    return this.executeQuery(options, formatKey, null);
  }

  // 馃殌 瀹為檯鎵ц鏌ヨ鐨勫唴閮ㄦ柟娉?
  private async executeQuery(
    options: QueryOptions, 
    formatKey: (date: Date) => string,
    cacheKey: string | null
  ): Promise<QueryResult<StorageEvent>> {
    const perfStart = performance.now();
    let events: StorageEvent[];

    // 馃殌 浼樺寲锛氫紭鍏堜娇鐢ㄧ储寮曟煡璇?
    if (options.startDate || options.endDate) {
      // 浣跨敤 startTime 绱㈠紩鏌ヨ鏃堕棿鑼冨洿
      const initStart = performance.now();
      await this.initialize();
      const initDuration = performance.now() - initStart;
      
      const queryStart = performance.now();
      
      // 馃敡 [FIX] 鏋勫缓鏃堕棿鑼冨洿鏌ヨ - 鏀寔 TimeSpec 鏍煎紡 (YYYY-MM-DD HH:mm:ss)
      // TimeSpec 鏍煎紡鎸夊瓧绗︿覆鎺掑簭涔熸槸姝ｇ‘鐨勬椂闂撮『搴?
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
      
      // 馃殌 [PERFORMANCE FIX] 浣跨敤 getAll() 鏇夸唬娓告爣閬嶅巻锛堝揩 5-10 鍊嶏級
      // getAll() 浼氬湪 C++ 灞傛壒閲忚鍙栵紝姣?JS 灞傜殑 cursor.continue() 蹇緱澶?
      const allEvents = await this.query<StorageEvent>('events', 'startTime', range || undefined);
      
      // 馃敡 杩囨护杞垹闄ょ殑浜嬩欢锛堝唴瀛樹腑杩囨护寰堝揩锛?
      events = allEvents.filter(event => !event.deletedAt);
      
      const queryDuration = performance.now() - queryStart;
      
      // 馃殌 缂撳瓨鏌ヨ缁撴灉
      if (cacheKey) {
        this.queryCache.set(cacheKey, { data: events, timestamp: performance.now() });
        console.log(`[IndexedDB] 馃捑 Cache saved: key="${cacheKey}", ${events.length} events, total cached queries: ${this.queryCache.size}`);
        
        // 娓呯悊杩囨湡缂撳瓨锛堟渶澶氫繚鐣?0鏉★級
        if (this.queryCache.size > 10) {
          const oldestKey = Array.from(this.queryCache.keys())[0];
          this.queryCache.delete(oldestKey);
        }
      }
      
      // 馃攳 鎬绘槸鏄剧ず鏌ヨ鏃堕棿锛堢敤浜庢€ц兘璋冭瘯锛?
      console.log(`[IndexedDB] 鈿?Index query took ${queryDuration.toFixed(1)}ms (init: ${initDuration.toFixed(1)}ms) 鈫?${events.length} events`);
    } else {
      // 馃殌 [PERFORMANCE FIX] 鏃犳椂闂磋寖鍥磋繃婊わ紝浣跨敤 getAll() 鍏ㄨ〃璇诲彇
      // getAll() 姣旀父鏍囬亶鍘嗗揩 5-10 鍊嶏紙鎵归噺璇诲彇 vs 閫愪釜璇诲彇锛?
      const queryStart = performance.now();
      await this.initialize();
      const allEvents = await this.query<StorageEvent>('events');
      
      // 馃敡 杩囨护杞垹闄ょ殑浜嬩欢
      events = allEvents.filter(event => !event.deletedAt);
      
      const queryDuration = performance.now() - queryStart;
      // 鉁?鍙褰曟參鏌ヨ锛?200ms锛変互鍑忓皯鍣煶
      if (queryDuration > 200) {
        console.log(`[IndexedDB] 鈿?Slow query took ${queryDuration.toFixed(1)}ms 鈫?${events.length} events`);
      }
    }

    // 绛涢€夛細浜嬩欢 ID 鍒楄〃锛堢簿纭尮閰嶏級
    if (options.filters?.eventIds && options.filters.eventIds.length > 0) {
      events = events.filter(event => 
        options.filters!.eventIds!.includes(event.id)
      );
    }

    // 绛涢€夛細璐﹀彿
    if (options.accountIds && options.accountIds.length > 0) {
      events = events.filter(event => 
        event.sourceAccountId && options.accountIds!.includes(event.sourceAccountId)
      );
    }

    // 鎺掑簭
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

    // 鍒嗛〉
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
    this.clearQueryCache(); // 娓呴櫎缂撳瓨
    return this.put('events', event);
  }

  async updateEvent(id: string, updates: Partial<StorageEvent>): Promise<void> {
    const existingEvent = await this.getEvent(id);
    if (!existingEvent) {
      throw new Error(`Event not found: ${id}`);
    }
    // 馃敡 [TIMESPEC] 浣跨敤 formatTimeForStorage 纭繚 TimeSpec 鏍煎紡
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
    this.clearQueryCache(); // 娓呴櫎缂撳瓨
    return this.put('events', updatedEvent);
  }

  async deleteEvent(id: string): Promise<void> {
    this.clearQueryCache(); // 娓呴櫎缂撳瓨
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
   * 馃敀 鎵归噺鏇存柊浜嬩欢锛堜簨鍔℃€э級- Phase 3浼樺寲
   * 
   * 浣跨敤鍗曚釜IndexedDB浜嬪姟澶勭悊鎵€鏈夋洿鏂帮紝鎻愪緵鍘熷瓙鎬т繚璇?
   * 
   * @param events - 瀹屾暣鐨勪簨浠跺璞℃暟缁?
   */
  async batchUpdateEvents(events: StorageEvent[]): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      console.log('[IndexedDB] 馃敀 Starting batch update transaction:', {
        count: events.length,
        eventIds: events.map(e => e.id.slice(-8)).join(', ')
      });

      const transaction = this.db.transaction('events', 'readwrite');
      const store = transaction.objectStore('events');

      // 鍦ㄥ崟涓簨鍔′腑鏇存柊鎵€鏈変簨浠?
      for (const event of events) {
        store.put(event);
      }

      transaction.oncomplete = () => {
        console.log('[IndexedDB] 鉁?Batch update transaction completed');
        resolve();
      };
      
      transaction.onerror = () => {
        console.error('[IndexedDB] 鉂?Batch update transaction failed:', transaction.error);
        reject(transaction.error);
      };
      
      transaction.onabort = () => {
        console.error('[IndexedDB] 鉂?Batch update transaction aborted');
        reject(new Error('Transaction aborted'));
      };
    });
  }

  // ==================== 鍏朵粬 Stores ====================

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
        // 杩囨护宸插垹闄ょ殑鏍囩
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

  // ==================== Contact 鎿嶄綔 ====================

  /**
   * 鏌ヨ鑱旂郴浜?
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

        // 杩囨护宸插垹闄ょ殑鑱旂郴浜?
        contacts = contacts.filter(c => !c.deletedAt);

        // 搴旂敤杩囨护鏉′欢
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

        // 鎺掑簭
        contacts.sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        // 鍒嗛〉
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
   * 鍒涘缓鑱旂郴浜?
   */
  async createContact(contact: Contact): Promise<void> {
    return this.put('contacts', contact);
  }

  /**
   * 鏇存柊鑱旂郴浜?
   */
  async updateContact(contact: Contact): Promise<void> {
    return this.put('contacts', contact);
  }

  /**
   * 鍒犻櫎鑱旂郴浜猴紙閫氳繃 ID锛?
   */
  async deleteContact(id: string): Promise<void> {
    return this.delete('contacts', id);
  }

  /**
   * 鑾峰彇鎵€鏈夎仈绯讳汉锛堟棫鎺ュ彛锛屽吋瀹规€т繚鐣欙級
   */
  async getAllContacts(): Promise<Contact[]> {
    return this.query<Contact>('contacts');
  }

  // ==================== 缂撳瓨绠＄悊 ====================
  
  /**
   * 娓呴櫎鏌ヨ缂撳瓨锛堟暟鎹洿鏂版椂璋冪敤锛?
   */
  clearQueryCache(): void {
    this.queryCache.clear();
  }

  // ==================== SyncQueue 鎿嶄綔 ====================
  
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
   * 鑾峰彇瀛樺偍浣跨敤鎯呭喌
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
   * 鑾峰彇瀛樺偍缁熻淇℃伅
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
   * 缁熻 Store 涓殑璁板綍鏁?
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
   * 娓呯┖鎵€鏈夋暟鎹紙鍗遍櫓鎿嶄綔锛侊級
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
   * 鍏抽棴鏁版嵁搴?
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
   * 鍒涘缓浜嬩欢鍘嗗彶璁板綍锛堝鏋滃凡瀛樺湪鍒欐姤閿欙級
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
   * 鍒涘缓鎴栨洿鏂颁簨浠跺巻鍙茶褰曪紙骞傜瓑鎿嶄綔锛岀敤浜庤縼绉伙級
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
      
      // 浣跨敤 put锛堣€岄潪 add锛夛細濡傛灉涓婚敭瀛樺湪鍒欐洿鏂帮紝涓嶅瓨鍦ㄥ垯鍒涘缓
      const request = store.put({
        ...log,
        createdAt: formatTimeForStorage(new Date())
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 鏌ヨ浜嬩欢鍘嗗彶璁板綍
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

      // 濡傛灉鏈?eventIds 杩囨护锛屼娇鐢ㄧ储寮?
      if (options.eventIds && options.eventIds.length === 1) {
        const index = store.index('eventId');
        request = index.getAll(options.eventIds[0]);
      } else {
        // 鍚﹀垯鑾峰彇鎵€鏈夎褰?
        request = store.getAll();
      }

      request.onsuccess = () => {
        let results = request.result || [];

        // 搴旂敤杩囨护鏉′欢
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

        // 鎸夋椂闂村€掑簭鎺掑簭
        results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        // 鍒嗛〉
        const offset = options.offset || 0;
        const limit = options.limit || 1000;
        results = results.slice(offset, offset + limit);

        resolve(results);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 鍒犻櫎鍗曟潯鍘嗗彶璁板綍
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
   * 鍒犻櫎鏃х殑鍘嗗彶璁板綍
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
   * 鑾峰彇鍘嗗彶缁熻淇℃伅
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
          // 鎸夋搷浣滅被鍨嬬粺璁?
          byOperation[log.operation] = (byOperation[log.operation] || 0) + 1;

          // 鏇存柊鏃堕棿鑼冨洿
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
   * 閲嶇疆鏁版嵁搴擄紙鍒犻櫎骞堕噸寤猴級
   */
  async resetDatabase(): Promise<void> {
    console.log('[IndexedDBService] Resetting database...');
    
    // 鍏抽棴鐜版湁杩炴帴
    this.close();

    // 鍒犻櫎鏁版嵁搴?
    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
      
      deleteRequest.onsuccess = () => {
        console.log('[IndexedDBService] 鉁?Database deleted successfully');
        resolve();
      };
      
      deleteRequest.onerror = () => {
        console.error('[IndexedDBService] 鉂?Failed to delete database:', deleteRequest.error);
        reject(deleteRequest.error);
      };
      
      deleteRequest.onblocked = () => {
        console.warn('[IndexedDBService] 鈿狅笍  Database deletion blocked (close all tabs)');
      };
    });
  }

  // ==================== EventStats CRUD ====================

  /**
   * 获取单条 EventStats
   */
  async getEventStats(id: string): Promise<EventStats | null> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('event_stats', 'readonly');
      const store = transaction.objectStore('event_stats');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 按 parentEventId 查询子节点 stats（仅直接子节点）
   */
  async getEventStatsByParentEventId(parentEventId: string): Promise<EventStats[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('event_stats', 'readonly');
      const store = transaction.objectStore('event_stats');
      const index = store.index('parentEventId');
      const request = index.getAll(IDBKeyRange.only(parentEventId));

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 统计某事件的直接子节点数量（基于 parentEventId 索引）
   */
  async countEventStatsByParentEventId(parentEventId: string): Promise<number> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('event_stats', 'readonly');
      const store = transaction.objectStore('event_stats');
      const index = store.index('parentEventId');
      const request = index.count(IDBKeyRange.only(parentEventId));

      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 统计某 rootEventId 下的子树节点总数（包含 root 本身，基于 rootEventId 索引）
   */
  async countEventStatsByRootEventId(rootEventId: string): Promise<number> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction('event_stats', 'readonly');
      const store = transaction.objectStore('event_stats');
      const index = store.index('rootEventId');
      const request = index.count(IDBKeyRange.only(rootEventId));

      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 批量 upsert EventStats（用于 reparent 后子树 rootEventId 传播）
   */
  async bulkPutEventStats(statsList: EventStats[]): Promise<void> {
    await this.initialize();

    const BATCH_SIZE = 200;
    for (let i = 0; i < statsList.length; i += BATCH_SIZE) {
      const batch = statsList.slice(i, i + BATCH_SIZE);

      await new Promise<void>((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }

        const transaction = this.db.transaction('event_stats', 'readwrite');
        const store = transaction.objectStore('event_stats');

        for (const stats of batch) {
          store.put(stats);
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
      });
    }
  }

  /**
   * 鍒涘缓 EventStats
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
      const request = store.put(stats); // 浣跨敤 put 鍏佽瑕嗙洊锛堢敤浜庤ˉ鍏ㄧ己澶辩殑 stats锛?

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 鎵归噺鍒涘缓 EventStats锛堝垎鎵瑰啓鍏ワ紝閬垮厤浜嬪姟瓒呮椂锛?
   */
  async bulkCreateEventStats(statsList: EventStats[]): Promise<void> {
    await this.initialize();
    
    const BATCH_SIZE = 100; // 姣忔壒 100 鏉★紝閬垮厤浜嬪姟瓒呮椂
    let totalSuccess = 0;
    let totalErrors = 0;

    // 鍒嗘壒澶勭悊
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

    console.log(`[IndexedDB] 馃搳 Bulk insert completed: ${totalSuccess} success, ${totalErrors} errors (${statsList.length} total)`);
  }

  /**
   * 鏇存柊 EventStats
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
          // 馃敡 濡傛灉 EventStats 涓嶅瓨鍦紝浠?events 琛ㄦ彁鍙栧苟鍒涘缓
          console.warn(`[IndexedDB] EventStats not found, creating from event: ${id}`);
          
          const eventsStore = transaction.objectStore('events');
          const eventRequest = eventsStore.get(id);
          
          eventRequest.onsuccess = () => {
            const event = eventRequest.result;
            if (!event) {
              reject(new Error(`Event not found: ${id}`));
              return;
            }
            
            // 鍒涘缓鏂扮殑 EventStats 璁板綍
            const newStats: EventStats = {
              id: event.id,
              tags: event.tags || [],
              calendarIds: event.calendarIds || [],
              startTime: event.startTime,
              endTime: event.endTime,
              source: event.source,
              updatedAt: event.updatedAt,
              ...updates // 搴旂敤鏇存柊
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
   * 鍒犻櫎 EventStats
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

      // 馃敡 delete 鎿嶄綔鍗充娇璁板綍涓嶅瓨鍦ㄤ篃浼氭垚鍔燂紝鏃犻渶棰濆瀹归敊
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 鎸夋棩鏈熻寖鍥存煡璇?EventStats
   */
  async queryEventStats(options: QueryOptions): Promise<QueryResult<EventStats>> {
    await this.initialize();
    
    const perfStart = performance.now();
    
    // 馃敡 鏃ユ湡鏍煎紡鍖栵紙TimeSpec 鏍囧噯鏍煎紡锛歒YYY-MM-DD HH:mm:ss锛?
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
        
        // 鍙湪鎱㈡煡璇紙>50ms锛夋垨鏈夌粨鏋滄椂杈撳嚭鏃ュ織锛岄伩鍏嶅埛灞?
        if (duration > 50 || results.length > 0) {
          console.log(`[IndexedDB] 鈿?EventStats query: ${duration.toFixed(1)}ms 鈫?${results.length} records`);
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
   * 馃殌 [MIGRATION] 浠?events 琛ㄦ彁鍙?EventStats锛堜粎璇诲彇蹇呰瀛楁锛?
   * 閬垮厤鍙嶅簭鍒楀寲瀹屾暣 Event 瀵硅薄锛坋ventlog銆乼itle 绛夊ぇ瀛楁锛?
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
          
          // 鍙彁鍙?EventStats 闇€瑕佺殑瀛楁锛堣烦杩?eventlog銆乼itle 绛夊ぇ瀵硅薄锛?
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
          // 閬嶅巻瀹屾垚
          console.log(`[IndexedDB] 馃搳 Extracted ${statsList.length} EventStats records`);
          resolve(statsList);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ==================== End EventStats CRUD ====================
}

// 瀵煎嚭鍗曚緥瀹炰緥
export const indexedDBService = new IndexedDBService();



