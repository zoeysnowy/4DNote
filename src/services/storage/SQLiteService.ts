/**
 * SQLiteService - Layer 2 Persistent Storage
 * 
 * ⚠️ 注意：此服务仅在 Electron 环境中可?
 * ?Web 环境中，此文件不会被加载（通过 StorageManager 动态导入控制）
 * 
 * 功能?
 * - 10 个数据表：accounts, calendars, events, eventlogs, event_calendar_mappings, 
 *                sync_queue, contacts, tags, event_tags, attachments
 * - WAL 模式：并发读写优?
 * - FTS5 全文搜索?30ms 查询性能
 * - 批量操作：事务支?
 * - 压缩存储：EventLogs 增量存储?6% 空间节省?
 * - 多账户支持：完整的账户隔离和关联查询
 * 
 * 容量规划?
 * - Events: ~10 MB (10,000 events)
 * - EventLogs: ~500 MB (50 versions per event, compressed)
 * - Contacts: ~5 MB
 * - Tags: ~0.5 MB
 * - Others: ~10 MB
 * Total: ~525 MB for 1 year of data
 * 
 * @version 1.0.0
 */

import type { 
  Account, 
  Calendar, 
  StorageEvent, 
  Contact, 
  Tag, 
  Attachment, 
  SyncQueueItem,
  QueryOptions,
  QueryResult,
  BatchResult,
  StorageStats
} from './types';

import { SQLiteDatabaseWrapper } from './SQLiteDatabaseWrapper';
import { formatTimeForStorage } from '../../utils/timeUtils';

export class SQLiteService {
  private db: SQLiteDatabaseWrapper | null = null;
  private initialized = false;
  private initializingPromise: Promise<void> | null = null;
  
  // 延迟初始?DB_PATH（避免在模块加载时访?process.env?
  private get dbPath(): string {
    return process.env.NODE_ENV === 'production' 
      ? './database/4dnote.db' 
      : './database/4dnote-dev.db';
  }

  /**
   * 初始?SQLite 数据?
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 如果正在初始化，返回现有的Promise
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      try {
        console.log('🔍 [SQLiteService] Initializing...');
      
      // 检查 Electron 环境
      if (typeof window === 'undefined' || !window.electronAPI) {
        throw new Error('SQLiteService requires Electron environment');
      }
      
      const electronAPI = window.electronAPI;
      if (!electronAPI.sqlite || !electronAPI.sqlite.available) {
        throw new Error('SQLite not available in this Electron build');
      }

      console.log('?[SQLiteService] Creating database connection via IPC...');
      
      // 1. 创建数据库连接（通过 IPC 包装类）
      // 注意：不能传?verbose: console.log，因为函数无法通过 IPC 序列?
      this.db = new SQLiteDatabaseWrapper(this.dbPath, {
        // verbose 选项由主进程决定，不在此处配?
      });
      
      await this.db.initialize();

      // 2. 启用 WAL 模式（并发读写优化）
      await this.db.pragma('journal_mode = WAL');
      await this.db.pragma('synchronous = NORMAL');
      await this.db.pragma('cache_size = -64000'); // 64MB cache
      await this.db.pragma('temp_store = MEMORY');

      // 3. 创建所有表
      await this.createTables();

      // 3.5. 运行数据库迁移（添加缺失的列?
      await this.runMigrations();

      // 4. 创建索引
      await this.createIndexes();

      // 5. 创建全文搜索索引（FTS5?
      await this.createFTS5Index();

      this.initialized = true;
      console.log('?SQLiteService initialized');
      } catch (error) {
        console.error('?SQLiteService initialization failed:', error);
        this.initializingPromise = null;
        throw error;
      } finally {
        this.initializingPromise = null;
      }
    })();

    return this.initializingPromise;
  }

  /**
   * 重建数据库（删除损坏的数据库文件并重新初始化?
   */
  async rebuildDatabase(): Promise<void> {
    console.log('🔄 [SQLiteService] Rebuilding database...');
    
    try {
      // 1. 关闭现有连接
      if (this.db) {
        try {
          this.db.close();
          console.log('?[SQLiteService] Closed existing database connection');
        } catch (error) {
          console.warn('⚠️ [SQLiteService] Failed to close database:', error);
        }
        this.db = null;
      }
      
      // 2. 删除数据库文?
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.sqlite?.deleteDatabase) {
        await electronAPI.sqlite.deleteDatabase(this.dbPath);
        console.log('🗑?[SQLiteService] Database file deleted');
      }
      
      // 3. 重置状?
      this.initialized = false;
      this.initializingPromise = null;
      
      // 4. 重新初始?
      await this.initialize();
      
      console.log('?[SQLiteService] Database rebuilt successfully');
    } catch (error) {
      console.error('?[SQLiteService] Failed to rebuild database:', error);
      throw error;
    }
  }

  /**
   * 创建所有数据表
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 1. Accounts ?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('outlook', 'google', 'icloud', 'caldav')),
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        access_token_encrypted TEXT,
        refresh_token_encrypted TEXT,
        token_expires_at TEXT,
        is_active BOOLEAN DEFAULT 1,
        sync_enabled BOOLEAN DEFAULT 1,
        last_sync_at TEXT,
        sync_interval INTEGER DEFAULT 300,
        server_url TEXT,
        default_calendar_id TEXT,
        settings_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `);

    // 2. Calendars ?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS calendars (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        emoji TEXT,
        type TEXT NOT NULL CHECK(type IN ('plan', 'actual', 'mixed')),
        is_primary BOOLEAN DEFAULT 0,
        is_visible BOOLEAN DEFAULT 1,
        order_index INTEGER DEFAULT 0,
        sync_enabled BOOLEAN DEFAULT 1,
        last_sync_at TEXT,
        sync_token TEXT,
        can_edit BOOLEAN DEFAULT 1,
        can_delete BOOLEAN DEFAULT 1,
        can_share BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        UNIQUE(account_id, remote_id)
      );
    `);

    // 3. Events ?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL,
        full_title TEXT,
        color_title TEXT,
        simple_title TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        is_all_day BOOLEAN DEFAULT 0,
        description TEXT,
        location TEXT,
        emoji TEXT,
        color TEXT,
        is_completed BOOLEAN DEFAULT 0,
        is_timer BOOLEAN DEFAULT 0,
        is_plan BOOLEAN DEFAULT 0,
        priority TEXT,
        tags TEXT,
        eventlog TEXT,
        source_account_id TEXT,
        source_calendar_id TEXT,
        sync_status TEXT DEFAULT 'local-only',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        is_archived BOOLEAN DEFAULT 0,
        FOREIGN KEY (source_account_id) REFERENCES accounts(id),
        FOREIGN KEY (source_calendar_id) REFERENCES calendars(id)
      );
    `);

    // 4. EventLogs 表（无限版本历史?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS eventlogs (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        slate_json_compressed BLOB NOT NULL,
        html_compressed BLOB,
        plain_text TEXT,
        created_at TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        changes_summary TEXT,
        content_hash TEXT NOT NULL,
        is_delta BOOLEAN DEFAULT 0,
        base_version INTEGER,
        delta_json TEXT,
        compressed_size INTEGER,
        original_size INTEGER,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        UNIQUE(event_id, version)
      );
    `);

    // 5. Event-Calendar Mappings ?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_calendar_mappings (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        remote_event_id TEXT NOT NULL,
        last_sync_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'synced',
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
        UNIQUE(account_id, calendar_id, remote_event_id)
      );
    `);

    // 6. Sync Queue ?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
        account_id TEXT NOT NULL,
        calendar_id TEXT,
        target_accounts TEXT,
        data_json TEXT NOT NULL,
        priority INTEGER DEFAULT 5,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'failed')),
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
    `);

    // 7. Contacts ?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        email TEXT,
        phone TEXT,
        avatar_url TEXT,
        organization TEXT,
        position TEXT,
        source_account_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (source_account_id) REFERENCES accounts(id)
      );
    `);

    // 8. Tags ?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT,
        color TEXT,
        parent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (parent_id) REFERENCES tags(id)
      );
    `);

    // 9. Event-Tags 关联?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_tags (
        event_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (event_id, tag_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );
    `);

    // 10. Attachments ?
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        local_path TEXT,
        cloud_url TEXT,
        status TEXT DEFAULT 'local-only',
        thumbnail_path TEXT,
        ocr_text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      );
    `);

    // 11. EventLog Versions 表（版本历史）
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS eventlog_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        delta_compressed TEXT NOT NULL,
        delta_size INTEGER NOT NULL,
        original_size INTEGER NOT NULL,
        compression_ratio REAL NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT,
        change_summary TEXT,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        UNIQUE(event_id, version)
      );
    `);

    // 12. EventLog FTS5 表（全文搜索）
    await this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS eventlog_fts USING fts5(
        event_id UNINDEXED,
        plain_text,
        tokenize = "unicode61 remove_diacritics 2"
      );
    `);

    // 13. Event History 表（事件操作审计日志）
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_history (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete', 'checkin', 'uncheck')),
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        changes_json TEXT,
        user_id TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      );
    `);

    // 创建索引：按 event_id 查询
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_event_history_event_id 
      ON event_history(event_id);
    `);

    // 创建索引：按时间范围查询
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_event_history_timestamp 
      ON event_history(timestamp);
    `);

    // 创建索引：按操作类型查询
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_event_history_operation 
      ON event_history(operation);
    `);


    console.log('✅ All tables created');
  }

  /**
   * 运行数据库迁移（添加缺失的列到现有表?
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Migration 1: Add missing columns to events table
      const tableInfo = await this.db.prepare('PRAGMA table_info(events)').all() as Array<{name: string}>;
      const columnNames = tableInfo.map(col => col.name);

      // Define all required columns with their types and defaults
      const requiredColumns = [
        { name: 'tags', type: 'TEXT', default: null },
        { name: 'eventlog', type: 'TEXT', default: null },
        { name: 'check_type', type: 'TEXT', default: "'once'" },
        { name: 'event_id', type: 'TEXT', default: null },
        { name: 'level', type: 'INTEGER', default: '0' },
        { name: 'content', type: 'TEXT', default: null },
        { name: 'due_date', type: 'TEXT', default: null },
        { name: 'time_spec', type: 'TEXT', default: null },
        { name: 'is_task', type: 'BOOLEAN', default: '0' },
        { name: 'type', type: 'TEXT', default: "'event'" },
        { name: 'is_time_calendar', type: 'BOOLEAN', default: '0' },
        { name: 'calendar_ids', type: 'TEXT', default: null },
        { name: 'todo_list_ids', type: 'TEXT', default: null },
        { name: 'source', type: 'TEXT', default: "'local'" },
        { name: 'external_id', type: 'TEXT', default: null },
        { name: '4dnote_source', type: 'BOOLEAN', default: '1' },
      ];

      for (const column of requiredColumns) {
        if (!columnNames.includes(column.name)) {
          const defaultClause = column.default ? ` DEFAULT ${column.default}` : '';
          console.log(`🔧 [Migration] Adding "${column.name}" column to events table...`);
          await this.db.exec(`ALTER TABLE events ADD COLUMN ${column.name} ${column.type}${defaultClause}`);
        }
      }

      console.log('✅ [Migration] All migrations completed');
    } catch (error) {
      console.error('❌ [Migration] Failed to run migrations:', error);
      throw error;
    }
  }

  /**
   * 创建索引
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.exec(`
      -- Accounts 索引
      CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active) WHERE deleted_at IS NULL;

      -- Calendars 索引
      CREATE INDEX IF NOT EXISTS idx_calendars_account ON calendars(account_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_calendars_visible ON calendars(is_visible) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_calendars_type ON calendars(type) WHERE deleted_at IS NULL;

      -- Events 索引
      CREATE INDEX IF NOT EXISTS idx_events_time_range ON events(start_time, end_time) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_events_account ON events(source_account_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(source_calendar_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_events_updated_at ON events(updated_at DESC) WHERE deleted_at IS NULL;

      -- EventLogs 索引
      CREATE INDEX IF NOT EXISTS idx_eventlogs_event ON eventlogs(event_id, version DESC);
      CREATE INDEX IF NOT EXISTS idx_eventlogs_time ON eventlogs(created_at DESC);

      -- Mappings 索引
      CREATE INDEX IF NOT EXISTS idx_mappings_event ON event_calendar_mappings(event_id);
      CREATE INDEX IF NOT EXISTS idx_mappings_account_calendar ON event_calendar_mappings(account_id, calendar_id);

      -- Sync Queue 索引
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, priority DESC, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_account ON sync_queue(account_id, status);

      -- Contacts 索引
      CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(source_account_id) WHERE deleted_at IS NULL;

      -- Tags 索引
      CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name) WHERE deleted_at IS NULL;

      -- Attachments 索引
      CREATE INDEX IF NOT EXISTS idx_attachments_event ON attachments(event_id) WHERE deleted_at IS NULL;
    `);

    console.log('?All indexes created');
  }

  /**
   * 创建全文搜索索引（FTS5?
   */
  private async createFTS5Index(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 🔧 修复 FTS5 UPDATE 触发?- 使用 content='events' 的正确语?
    try {
      await this.db.exec(`
        DROP TRIGGER IF EXISTS events_fts_insert;
        DROP TRIGGER IF EXISTS events_fts_update;
        DROP TRIGGER IF EXISTS events_fts_delete;
      `);
    } catch (error) {
      console.warn('[SQLiteService] ⚠️ Failed to drop FTS5 triggers:', error);
    }

    await this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
        id UNINDEXED,
        simple_title,
        description,
        location,
        content='events',
        content_rowid='rowid'
      );

      -- FTS5 触发器：插入
      CREATE TRIGGER IF NOT EXISTS events_fts_insert AFTER INSERT ON events BEGIN
        INSERT INTO events_fts(rowid, id, simple_title, description, location)
        VALUES (new.rowid, new.id, new.simple_title, new.description, new.location);
      END;

      -- FTS5 触发器：更新（使?'delete' 命令而不?DELETE 语句?
      -- 参考：https://www.sqlite.org/fts5.html#external_content_tables
      CREATE TRIGGER IF NOT EXISTS events_fts_update AFTER UPDATE ON events BEGIN
        INSERT INTO events_fts(events_fts, rowid, id, simple_title, description, location)
        VALUES ('delete', old.rowid, old.id, old.simple_title, old.description, old.location);
        INSERT INTO events_fts(rowid, id, simple_title, description, location)
        VALUES (new.rowid, new.id, new.simple_title, new.description, new.location);
      END;

      -- FTS5 触发器：删除
      CREATE TRIGGER IF NOT EXISTS events_fts_delete AFTER DELETE ON events BEGIN
        INSERT INTO events_fts(events_fts, rowid, id, simple_title, description, location)
        VALUES ('delete', old.rowid, old.id, old.simple_title, old.description, old.location);
      END;
    `);

    console.log('?FTS5 full-text search index created');
  }

  // ==================== Account CRUD ====================

  async createAccount(account: Account): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO accounts (
        id, provider, email, display_name, 
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        is_active, sync_enabled, last_sync_at, sync_interval,
        server_url, default_calendar_id, settings_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
      account.id,
      account.provider,
      account.email,
      account.displayName,
      account.accessToken || null,
      account.refreshToken || null,
      account.tokenExpiry || null,
      account.isActive ? 1 : 0,
      account.syncEnabled ? 1 : 0,
      account.lastSyncAt || null,
      account.syncInterval || 300,
      account.serverUrl || null,
      account.defaultCalendarId || null,
      account.settings ? JSON.stringify(account.settings) : null,
      account.createdAt,
      account.updatedAt
    );
  }

  async getAccount(id: string): Promise<Account | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL
    `);

    const row = await stmt.get(id) as any;
    return row ? this.rowToAccount(row) : null;
  }

  async getAllAccounts(): Promise<Account[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY created_at DESC
    `);

    const rows = await stmt.all() as any[];
    return rows.map(row => this.rowToAccount(row));
  }

  // ==================== Calendar CRUD ====================

  async createCalendar(calendar: Calendar): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO calendars (
        id, account_id, remote_id, name, description, color, emoji,
        type, is_primary, is_visible, order_index,
        sync_enabled, last_sync_at, sync_token,
        can_edit, can_delete, can_share,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
      calendar.id,
      calendar.accountId,
      calendar.remoteId,
      calendar.name,
      calendar.description || null,
      calendar.color || null,
      calendar.emoji || null,
      calendar.type,
      calendar.isPrimary ? 1 : 0,
      calendar.isVisible ? 1 : 0,
      calendar.orderIndex || 0,
      calendar.syncEnabled ? 1 : 0,
      calendar.lastSyncAt || null,
      calendar.syncToken || null,
      calendar.canEdit ? 1 : 0,
      calendar.canDelete ? 1 : 0,
      calendar.canShare ? 1 : 0,
      calendar.createdAt,
      calendar.updatedAt
    );
  }

  async getCalendar(id: string): Promise<Calendar | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM calendars WHERE id = ? AND deleted_at IS NULL
    `);

    const row = await stmt.get(id) as any;
    return row ? this.rowToCalendar(row) : null;
  }

  async getCalendarsByAccount(accountId: string): Promise<Calendar[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM calendars 
      WHERE account_id = ? AND deleted_at IS NULL 
      ORDER BY order_index ASC, created_at ASC
    `);

    const rows = await stmt.all(accountId) as any[];
    return rows.map(row => this.rowToCalendar(row));
  }

  // ==================== Event CRUD ====================

  async createEvent(event: StorageEvent): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const locationText =
      typeof (event as any).location === 'string'
        ? (event as any).location
        : (event as any).location && typeof (event as any).location === 'object' && 'displayName' in (event as any).location
          ? (event as any).location.displayName
          : null;

    const stmt = this.db.prepare(`
      INSERT INTO events (
        id, full_title, color_title, simple_title,
        start_time, end_time, is_all_day,
        description, location, emoji, color,
        is_completed, is_timer, is_plan, priority,
        tags, eventlog,
        source_account_id, source_calendar_id, sync_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
      event.id,
      (typeof event.title === 'string' ? event.title : event.title?.fullTitle) || null,
      (typeof event.title === 'string' ? null : event.title?.colorTitle) || null,
      typeof event.title === 'string' ? event.title : event.title?.simpleTitle || '',
      event.startTime || null,
      event.endTime || null,
      event.isAllDay ? 1 : 0,
      event.description || null,
      locationText,
      event.emoji || null,
      event.color || null,
      event.isCompleted ? 1 : 0,
      event.isTimer ? 1 : 0,
      event.isPlan ? 1 : 0,
      event.priority || null,
      event.tags ? JSON.stringify(event.tags) : null,
      event.eventlog ? JSON.stringify(event.eventlog) : null,
      event.sourceAccountId || null,
      event.sourceCalendarId || null,
      event.syncStatus || 'local-only',
      event.createdAt,
      event.updatedAt
    );
  }

  async getEvent(id: string): Promise<StorageEvent | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM events WHERE id = ? AND deleted_at IS NULL
    `);

    const row = await stmt.get(id) as any;
    return row ? this.rowToEvent(row) : null;
  }

  async updateEvent(id: string, updates: Partial<StorageEvent>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Map TypeScript property names to database column names
    const fieldMapping: Record<string, string> = {
      title: 'simple_title',
      fullTitle: 'full_title',
      colorTitle: 'color_title',
      startTime: 'start_time',
      endTime: 'end_time',
      isAllDay: 'is_all_day',
      isCompleted: 'is_completed',
      isTimer: 'is_timer',
      isPlan: 'is_plan',
      sourceAccountId: 'source_account_id',
      sourceCalendarId: 'source_calendar_id',
      syncStatus: 'sync_status'
    };

    const fields: string[] = [];
    const values: any[] = [];

    console.log('[SQLiteService] 🔍 Raw updates received:', Object.keys(updates));

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id') {
        console.log('[SQLiteService] ⏭️ Skipping id');
        return;
      }
      if (key === 'updatedAt' || key === 'updated_at') {
        console.log('[SQLiteService] ⏭️ Skipping updatedAt/updated_at');
        return; // Skip, will be added automatically
      }
      if (key === 'createdAt' || key === 'created_at') {
        console.log('[SQLiteService] ⏭️ Skipping createdAt/created_at');
        return; // Skip, should never be updated
      }
      
      console.log('[SQLiteService] ?Processing key:', key);
      
      // Handle title object (EventTitle type)
      if (key === 'title' && typeof value === 'object' && value !== null) {
        // Update all three title fields
        if ('simpleTitle' in value) {
          fields.push('simple_title = ?');
          values.push(value.simpleTitle || '');
        }
        if ('fullTitle' in value) {
          fields.push('full_title = ?');
          values.push(value.fullTitle || null);
        }
        if ('colorTitle' in value) {
          fields.push('color_title = ?');
          values.push(value.colorTitle || null);
        }
        return;
      }

      // Handle location object (LocationObject) -> TEXT
      if (key === 'location' && value && typeof value === 'object' && (value as any).displayName) {
        value = (value as any).displayName;
      }
      
      const columnName = fieldMapping[key] || this.camelToSnake(key);
      fields.push(`${columnName} = ?`);
      
      // 🔍 Debug: Log the actual value and its type BEFORE processing
      console.log(`[SQLiteService] 🔍 Processing ${key}:`, {
        value,
        type: typeof value,
        isNull: value === null,
        isUndefined: value === undefined,
        constructor: value?.constructor?.name
      });
      
      // 🔥 修复：先处理 null/undefined（避?typeof null === 'object' 的陷阱）
      if (value === null || value === undefined) {
        console.log(`[SQLiteService] ?${key} ?null`);
        values.push(null);
      }
      // Serialize JSON fields
      else if (key === 'tags') {
        values.push(value ? JSON.stringify(value) : null);
      }
      else if (key === 'eventlog') {
        // 🔥 修复：正确序列化 eventlog 对象
        if (typeof value === 'object') {
          // EventLog 对象 ?JSON 字符?
          values.push(JSON.stringify(value));
        } else if (typeof value === 'string') {
          // 字符串直接使?
          values.push(value);
        } else {
          // 其他类型（不应该到这里）
          values.push(null);
        }
      }
      // Convert boolean values to 0/1 for SQLite
      else if (typeof value === 'boolean') {
        values.push(value ? 1 : 0);
      }
      // Primitive types: string, number
      else if (typeof value === 'string' || typeof value === 'number') {
        values.push(value);
      }
      // Buffer (binary data) - only in Node.js environment
      else if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(value)) {
        values.push(value);
      }
      // Object types: convert to JSON
      else if (typeof value === 'object') {
        console.warn(`[SQLiteService] ⚠️ Converting object to JSON for field "${columnName}":`, value?.constructor?.name);
        values.push(JSON.stringify(value));
      }
      // Fallback: null
      else {
        console.warn(`[SQLiteService] ⚠️ Unknown type for field "${columnName}":`, typeof value);
        values.push(null);
      }
    });

    if (fields.length === 0) return;

    // 🔍 Debug: Check integrity before update
    try {
      const integrity = await this.db.pragma('integrity_check', { simple: true });
      console.log('[SQLiteService] 🏥 Integrity check before update:', integrity);
      
      // 🔍 Debug: Check if table exists and has all required columns
      const tableInfo = await this.db.prepare('PRAGMA table_info(events)').all() as Array<{name: string, type: string}>;
      const columnNames = tableInfo.map(col => col.name);
      console.log('[SQLiteService] 📊 Table columns:', columnNames);
      
      // 检查是否所有字段都存在
      const missingColumns = fields.map(f => f.split(' = ?')[0]).filter(col => !columnNames.includes(col));
      if (missingColumns.length > 0) {
        console.error('[SQLiteService] ?Missing columns:', missingColumns);
      }
    } catch (e) {
      console.error('[SQLiteService] 🏥 Integrity/structure check failed:', e);
    }

    const sql = `UPDATE events SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`;
    // 🔧 FIX: 使用 updates.updatedAt（如果提供），否则生成新的时间戳
    // 这样保持?createEvent 相同的逻辑，使用应用层提供的时间格?
    const updatedAtValue = updates.updatedAt || formatTimeForStorage(new Date());
    const finalValues = [...values, updatedAtValue, id];
    
    console.log('[SQLiteService] 🔍 Final SQL:', sql);
    console.log('[SQLiteService] 🔍 Fields count:', fields.length);
    console.log('[SQLiteService] 🔍 Values count (before add):', values.length);
    console.log('[SQLiteService] 🔍 Total params needed:', fields.length + 2, '(fields + updated_at + id)');
    console.log('[SQLiteService] 🔍 Total params provided:', finalValues.length);
    
    // 🔍 检查每个值的大小
    console.log('[SQLiteService] 🔍 Value sizes:');
    finalValues.forEach((val, idx) => {
      const size = typeof val === 'string' ? val.length : JSON.stringify(val).length;
      if (size > 1000) {
        console.warn(`[SQLiteService] ⚠️ Large value at index ${idx}: ${size} bytes`);
        console.warn(`[SQLiteService] Field: ${fields[idx] || 'updated_at/id'}`);
        console.warn(`[SQLiteService] Preview: ${String(val).substring(0, 200)}...`);
      }
    });
    
    // 🔍 验证参数数量是否匹配
    const expectedParams = fields.length + 2; // fields + updated_at + id
    if (finalValues.length !== expectedParams) {
      console.error('[SQLiteService] ?Parameter count mismatch!');
      console.error('[SQLiteService] Expected:', expectedParams);
      console.error('[SQLiteService] Provided:', finalValues.length);
      console.error('[SQLiteService] Fields:', fields);
      throw new Error(`Parameter count mismatch: expected ${expectedParams}, got ${finalValues.length}`);
    }
    
    const stmt = this.db.prepare(sql);
    
    // 🔍 Debug: 在执行前打印所有参数的详细信息
    console.log('[SQLiteService] 🔍 All parameters:');
    finalValues.forEach((val, idx) => {
      const fieldName = idx < fields.length ? fields[idx] : (idx === fields.length ? 'updated_at' : 'id');
      console.log(`  [${idx}] ${fieldName}:`, {
        value: val,
        type: typeof val,
        isNull: val === null,
        constructor: val?.constructor?.name
      });
    });
    
    // 🔧 IPC-based wrapper 是异步的
    try {
      await stmt.run(...finalValues);
    } catch (error) {
      console.error('[SQLiteService] ?stmt.run failed, analyzing values...');
      console.error('[SQLiteService] Error:', error);
      console.error('[SQLiteService] Field mapping:');
      fields.forEach((f, i) => {
        const val = finalValues[i];
        const typeStr = val === null ? 'null' : typeof val;
        const sizeStr = val === null ? 'null' : (typeof val === 'string' ? `${val.length} bytes` : JSON.stringify(val).length + ' bytes');
        console.error(`  ${f} = ${typeStr} (${sizeStr})`);
      });
      throw error;
    }
  }

  async deleteEvent(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE events SET deleted_at = ? WHERE id = ?
    `);

    await stmt.run(formatTimeForStorage(new Date()), id);
  }

  /**
   * 查询事件（带过滤和分页）
   */
  async queryEvents(options: QueryOptions = {}): Promise<QueryResult<StorageEvent>> {
    if (!this.db) throw new Error('Database not initialized');

    const { filters = {}, sort, offset = 0, limit = 50, startDate, endDate } = options;
    
    let query = 'SELECT * FROM events WHERE deleted_at IS NULL';
    const params: any[] = [];

    // 事件 ID 过滤（优先级最高）
    if (filters.eventIds && filters.eventIds.length > 0) {
      query += ` AND id IN (${filters.eventIds.map(() => '?').join(',')})`;
      params.push(...filters.eventIds);
    }

    // 🚀 [PERFORMANCE FIX] 使用 startDate/endDate 从 QueryOptions（兼容 filters.startTime/endTime）
    const effectiveStartTime = startDate ? this.formatDateForStorage(startDate) : filters.startTime;
    const effectiveEndTime = endDate ? this.formatDateForStorage(endDate) : filters.endTime;
    
    if (effectiveStartTime) {
      query += ' AND start_time >= ?';
      params.push(effectiveStartTime);
    }
    if (effectiveEndTime) {
      query += ' AND end_time <= ?';
      params.push(effectiveEndTime);
    }

    // 账户过滤
    if (filters.accountIds && filters.accountIds.length > 0) {
      query += ` AND source_account_id IN (${filters.accountIds.map(() => '?').join(',')})`;
      params.push(...filters.accountIds);
    }

    // 日历过滤
    if (filters.calendarIds && filters.calendarIds.length > 0) {
      query += ` AND source_calendar_id IN (${filters.calendarIds.map(() => '?').join(',')})`;
      params.push(...filters.calendarIds);
    }

    // 排序
    const sortField = (sort as any)?.field;
    if (sortField) {
      const direction = (sort as any)?.direction === 'desc' ? 'DESC' : 'ASC';
      query += ` ORDER BY ${this.camelToSnake(sortField)} ${direction}`;
    } else {
      query += ' ORDER BY start_time ASC';
    }

    // 分页
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = await stmt.all(...params) as any[];
    const items = rows.map(row => this.rowToEvent(row));

    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM events WHERE deleted_at IS NULL';
    const countParams: any[] = [];
    
    // 事件 ID 过滤
    if (filters.eventIds && filters.eventIds.length > 0) {
      countQuery += ` AND id IN (${filters.eventIds.map(() => '?').join(',')})`;
      countParams.push(...filters.eventIds);
    }
    
    // 🚀 [PERFORMANCE FIX] 使用相同的时间范围过滤逻辑
    if (effectiveStartTime) {
      countQuery += ' AND start_time >= ?';
      countParams.push(effectiveStartTime);
    }
    if (effectiveEndTime) {
      countQuery += ' AND end_time <= ?';
      countParams.push(effectiveEndTime);
    }
    if (filters.accountIds && filters.accountIds.length > 0) {
      countQuery += ` AND source_account_id IN (${filters.accountIds.map(() => '?').join(',')})`;
      countParams.push(...filters.accountIds);
    }
    if (filters.calendarIds && filters.calendarIds.length > 0) {
      countQuery += ` AND source_calendar_id IN (${filters.calendarIds.map(() => '?').join(',')})`;
      countParams.push(...filters.calendarIds);
    }

    const countStmt = this.db.prepare(countQuery);
    const countRow = await countStmt.get(...countParams) as any;
    const total = countRow.total;

    return {
      items,
      total,
      hasMore: offset + items.length < total,
      offset
    };
  }

  /**
   * 批量创建事件（使用事务）
   */
  async batchCreateEvents(events: StorageEvent[]): Promise<BatchResult<StorageEvent>> {
    if (!this.db) throw new Error('Database not initialized');

    const success: StorageEvent[] = [];
    const errors: Array<{ item: StorageEvent; error: Error }> = [];

    const insertStmt = this.db.prepare(`
      INSERT INTO events (
        id, full_title, color_title, simple_title,
        start_time, end_time, is_all_day,
        description, location, emoji, color,
        is_completed, is_timer, is_plan, priority,
        source_account_id, source_calendar_id, sync_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 注意：IPC 模式不支?transaction API，使用循?+ BEGIN/COMMIT
    await this.db.exec('BEGIN TRANSACTION');
    try {
      for (const event of events) {
        try {
          const locationText =
            typeof (event as any).location === 'string'
              ? (event as any).location
              : (event as any).location && typeof (event as any).location === 'object' && 'displayName' in (event as any).location
                ? (event as any).location.displayName
                : null;

          await insertStmt.run(
            event.id,
            (typeof event.title === 'string' ? event.title : event.title?.fullTitle) || null,
            (typeof event.title === 'string' ? null : event.title?.colorTitle) || null,
            typeof event.title === 'string' ? event.title : event.title?.simpleTitle || '',
            event.startTime || null,
            event.endTime || null,
            event.isAllDay ? 1 : 0,
            event.description || null,
            locationText,
            event.emoji || null,
            event.color || null,
            event.isCompleted ? 1 : 0,
            event.isTimer ? 1 : 0,
            event.isPlan ? 1 : 0,
            event.priority || null,
            event.sourceAccountId || null,
            event.sourceCalendarId || null,
            event.syncStatus || 'local-only',
            event.createdAt,
            event.updatedAt
          );
          success.push(event);
        } catch (error) {
          errors.push({ item: event, error: error as Error });
        }
      }
      await this.db.exec('COMMIT');
    } catch (error) {
      await this.db.exec('ROLLBACK');
      throw error;
    }

    return { success, failed: errors, errors };
  }

  /**
   * 全文搜索（FTS5?
   */
  async searchEvents(query: string, options: QueryOptions = {}): Promise<QueryResult<StorageEvent>> {
    if (!this.db) throw new Error('Database not initialized');

    const { offset = 0, limit = 50 } = options;

    const stmt = this.db.prepare(`
      SELECT e.* FROM events e
      INNER JOIN events_fts fts ON e.rowid = fts.rowid
      WHERE events_fts MATCH ? AND e.deleted_at IS NULL
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    const rows = await stmt.all(query, limit, offset) as any[];
    const items = rows.map(row => this.rowToEvent(row));

    // 获取总数
    const countStmt = this.db.prepare(`
      SELECT COUNT(*) as total FROM events e
      INNER JOIN events_fts fts ON e.rowid = fts.rowid
      WHERE events_fts MATCH ?
    `);
    const countRow = await countStmt.get(query) as any;
    const total = countRow.total;

    return {
      items,
      total,
      hasMore: offset + items.length < total,
      offset
    };
  }

  // ==================== 辅助方法 ====================

  /**
   * 将数据库行转换为 Account 对象
   */
  private rowToAccount(row: any): Account {
    return {
      id: row.id,
      provider: row.provider,
      email: row.email,
      displayName: row.display_name,
      accessToken: row.access_token_encrypted,
      refreshToken: row.refresh_token_encrypted,
      tokenExpiry: row.token_expires_at,
      isActive: Boolean(row.is_active),
      syncEnabled: Boolean(row.sync_enabled),
      lastSyncAt: row.last_sync_at,
      syncInterval: row.sync_interval,
      serverUrl: row.server_url,
      defaultCalendarId: row.default_calendar_id,
      settings: row.settings_json ? JSON.parse(row.settings_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 将数据库行转换为 Calendar 对象
   */
  private rowToCalendar(row: any): Calendar {
    return {
      id: row.id,
      accountId: row.account_id,
      remoteId: row.remote_id,
      name: row.name,
      description: row.description,
      color: row.color,
      emoji: row.emoji,
      type: row.type,
      isPrimary: Boolean(row.is_primary),
      isVisible: Boolean(row.is_visible),
      orderIndex: row.order_index,
      syncEnabled: Boolean(row.sync_enabled),
      isDefault: Boolean(row.is_primary), // Use isPrimary as isDefault
      lastSyncAt: row.last_sync_at,
      syncToken: row.sync_token,
      canEdit: Boolean(row.can_edit),
      canDelete: Boolean(row.can_delete),
      canShare: Boolean(row.can_share),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 将数据库行转换为 StorageEvent 对象
   */
  private rowToEvent(row: any): StorageEvent {
    return {
      id: row.id,
      title: {
        simpleTitle: row.simple_title || '',
        fullTitle: row.full_title || undefined,
        colorTitle: row.color_title || undefined
      },
      startTime: row.start_time,
      endTime: row.end_time,
      isAllDay: Boolean(row.is_all_day),
      description: row.description,
      location: row.location,
      emoji: row.emoji,
      color: row.color,
      isCompleted: Boolean(row.is_completed),
      isTimer: Boolean(row.is_timer),
      isPlan: Boolean(row.is_plan),
      priority: row.priority,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      eventlog: row.eventlog ? JSON.parse(row.eventlog) : undefined,
      sourceAccountId: row.source_account_id,
      sourceCalendarId: row.source_calendar_id,
      syncStatus: row.sync_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 驼峰转蛇形命?
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * 🚀 [PERFORMANCE] 格式化 Date 对象为 TimeSpec 字符串（YYYY-MM-DD HH:mm:ss）
   */
  private formatDateForStorage(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats(): Promise<Partial<StorageStats>> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL) as accounts_count,
        (SELECT COUNT(*) FROM calendars WHERE deleted_at IS NULL) as calendars_count,
        (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL) as events_count,
        (SELECT COUNT(*) FROM eventlogs) as eventlogs_count,
        (SELECT COUNT(*) FROM contacts WHERE deleted_at IS NULL) as contacts_count,
        (SELECT COUNT(*) FROM tags WHERE deleted_at IS NULL) as tags_count
    `);
    const stats = await stmt.get() as any;

    // 获取数据库文件大?
    const pageSizeResult = await this.db.pragma('page_size', { simple: true }) as number;
    const pageCountResult = await this.db.pragma('page_count', { simple: true }) as number;
    const dbSizeBytes = pageSizeResult * pageCountResult;

    return {
      sqlite: {
        used: dbSizeBytes,
        quota: 10 * 1024 * 1024 * 1024, // 10 GB
        accountsCount: stats.accounts_count,
        calendarsCount: stats.calendars_count,
        eventsCount: stats.events_count,
        eventLogsCount: stats.eventlogs_count,
        contactsCount: stats.contacts_count,
        tagsCount: stats.tags_count
      }
    };
  }


  // ==================== EventLog Version History ====================

  /**
   * 插入版本历史记录
   */
  async insertVersion(data: {
    eventId: string;
    version: number;
    deltaCompressed: string;
    deltaSize: number;
    originalSize: number;
    compressionRatio: number;
    createdAt: string;
    createdBy?: string;
    changeSummary?: string;
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO eventlog_versions 
        (event_id, version, delta_compressed, delta_size, original_size, 
         compression_ratio, created_at, created_by, change_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
      data.eventId,
      data.version,
      data.deltaCompressed,
      data.deltaSize,
      data.originalSize,
      data.compressionRatio,
      data.createdAt,
      data.createdBy || null,
      data.changeSummary || null
    );
  }

  /**
   * 获取最新版本号
   */
  async getLatestVersion(eventId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT MAX(version) as latest 
      FROM eventlog_versions 
      WHERE event_id = ?
    `);

    const result = await stmt.get(eventId) as any;
    return (result?.latest || 0);
  }

  /**
   * 查询版本历史列表
   */
  async queryVersions(
    eventId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{
    version: number;
    createdAt: string;
    deltaSize: number;
    originalSize: number;
    compressionRatio: number;
    createdBy?: string;
    changeSummary?: string;
  }>> {
    if (!this.db) throw new Error('Database not initialized');

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const stmt = this.db.prepare(`
      SELECT version, created_at, delta_size, original_size, compression_ratio,
             created_by, change_summary
      FROM eventlog_versions
      WHERE event_id = ?
      ORDER BY version DESC
      LIMIT ? OFFSET ?
    `);

    const rows = await stmt.all(eventId, limit, offset) as any[];
    return rows.map(row => ({
      version: row.version,
      createdAt: row.created_at,
      deltaSize: row.delta_size,
      originalSize: row.original_size,
      compressionRatio: row.compression_ratio,
      createdBy: row.created_by,
      changeSummary: row.change_summary
    }));
  }

  /**
   * 获取指定版本的数据
   */
  async getVersion(eventId: string, version: number): Promise<{
    version: number;
    deltaCompressed: string;
    deltaSize: number;
    originalSize: number;
    compressionRatio: number;
    createdAt: string;
  } | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT version, delta_compressed, delta_size, original_size, 
             compression_ratio, created_at
      FROM eventlog_versions
      WHERE event_id = ? AND version = ?
    `);

    const row = await stmt.get(eventId, version) as any;
    if (!row) return null;

    return {
      version: row.version,
      deltaCompressed: row.delta_compressed,
      deltaSize: row.delta_size,
      originalSize: row.original_size,
      compressionRatio: row.compression_ratio,
      createdAt: row.created_at
    };
  }

  /**
   * 清理旧版本（保留最近 N 个）
   */
  async pruneVersions(eventId: string, keepCount: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM eventlog_versions
      WHERE event_id = ?
        AND version < (
          SELECT MAX(version) - ? FROM eventlog_versions WHERE event_id = ?
        )
    `);

    const result = await stmt.run(eventId, keepCount, eventId);
    return result.changes || 0;
  }

  /**
   * FTS5 全文搜索 EventLog
   */
  async searchEventLogs(
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ items: any[]; total: number; hasMore: boolean }> {
    if (!this.db) throw new Error('Database not initialized');

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // 搜索匹配的事件
    const searchStmt = this.db.prepare(`
      SELECT e.*
      FROM eventlog_fts fts
      INNER JOIN events e ON fts.event_id = e.id
      WHERE fts.plain_text MATCH ?
      ORDER BY bm25(fts) DESC
      LIMIT ? OFFSET ?
    `);

    const rows = await searchStmt.all(query, limit, offset) as any[];
    const items = rows.map(row => this.rowToEvent(row));

    // 统计总数
    const countStmt = this.db.prepare(`
      SELECT COUNT(*) as total
      FROM eventlog_fts
      WHERE plain_text MATCH ?
    `);

    const countRow = await countStmt.get(query) as any;
    const total = countRow?.total || 0;

    return {
      items,
      total,
      hasMore: offset + items.length < total
    };
  }

  /**
   * 更新 EventLog FTS5 索引
   */
  async updateEventLogFTS(eventId: string, plainText: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 删除旧索引
    const deleteStmt = this.db.prepare(`
      DELETE FROM eventlog_fts WHERE event_id = ?
    `);
    await deleteStmt.run(eventId);

    // 插入新索引
    if (plainText) {
      const insertStmt = this.db.prepare(`
        INSERT INTO eventlog_fts (event_id, plain_text)
        VALUES (?, ?)
      `);
      await insertStmt.run(eventId, plainText);
    }
  }

  // ==================== Tag CRUD ====================

  /**
   * 创建标签
   */
  async createTag(tag: import('./types').StorageTag): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO tags (id, name, color, emoji, parent_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      tag.id,
      tag.name,
      tag.color,
      tag.emoji || null,
      tag.parentId || null,
      tag.createdAt,
      tag.updatedAt,
      tag.deletedAt || null
    );
  }

  /**
   * 更新标签
   */
  async updateTag(id: string, updates: Partial<import('./types').StorageTag>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    if (updates.emoji !== undefined) {
      fields.push('emoji = ?');
      values.push(updates.emoji);
    }
    if (updates.parentId !== undefined) {
      fields.push('parent_id = ?');
      values.push(updates.parentId);
    }
    if (updates.updatedAt !== undefined) {
      fields.push('updated_at = ?');
      values.push(updates.updatedAt);
    }
    if (updates.deletedAt !== undefined) {
      fields.push('deleted_at = ?');
      values.push(updates.deletedAt);
    }

    if (fields.length === 0) return;

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE tags SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * 硬删除标签
   */
  async hardDeleteTag(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM tags WHERE id = ?');
    stmt.run(id);
  }

  /**
   * 获取单个标签
   */
  async getTag(id: string): Promise<import('./types').StorageTag | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM tags WHERE id = ?');
    const row: any = stmt.get(id);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      color: row.color,
      emoji: row.emoji,
      parentId: row.parent_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  /**
   * 查询标签
   */
  async queryTags(options: QueryOptions = {}): Promise<QueryResult<import('./types').StorageTag>> {
    if (!this.db) throw new Error('Database not initialized');

    const { limit = 1000, offset = 0, filters = {} } = options;

    // 构建查询条件
    const whereClauses: string[] = [];
    const values: any[] = [];

    // 默认过滤已删除的标签
    if (filters.includeDeleted !== true) {
      whereClauses.push('deleted_at IS NULL');
    }

    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        whereClauses.push('parent_id IS NULL');
      } else {
        whereClauses.push('parent_id = ?');
        values.push(filters.parentId);
      }
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 查询数据
    const stmt = this.db.prepare(`
      SELECT * FROM tags ${whereSQL}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `);

    const rows: any[] = await stmt.all(...values, limit, offset) as any[];

    // 查询总数
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM tags ${whereSQL}`);
    const countRow: any = countStmt.get(...values);
    const total = countRow.count;

    // 确保 rows 是数组
    const rowsArray = Array.isArray(rows) ? rows : [];

    return {
      items: rowsArray.map(row => ({
        id: row.id,
        name: row.name,
        color: row.color,
        emoji: row.emoji,
        parentId: row.parent_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      })),
      total,
      hasMore: offset + rowsArray.length < total,
    };
  }

  // ==================== Contact 操作 ====================

  /**
   * 查询联系人
   */
  async queryContacts(options: QueryOptions = {}): Promise<QueryResult<Contact>> {
    if (!this.db) throw new Error('SQLite not initialized');

    const limit = options.limit || 1000;
    const offset = options.offset || 0;
    const whereClauses: string[] = ['deleted_at IS NULL'];
    const values: any[] = [];

    // 应用过滤条件
    if (options.filters) {
      const { contactIds, emails, sources, searchText } = options.filters;

      if (contactIds && contactIds.length > 0) {
        const placeholders = contactIds.map(() => '?').join(',');
        whereClauses.push(`id IN (${placeholders})`);
        values.push(...contactIds);
      }

      if (emails && emails.length > 0) {
        const placeholders = emails.map(() => '?').join(',');
        whereClauses.push(`email IN (${placeholders})`);
        values.push(...emails);
      }

      if (sources && sources.length > 0) {
        const placeholders = sources.map(() => '?').join(',');
        whereClauses.push(`source IN (${placeholders})`);
        values.push(...sources);
      }

      if (searchText) {
        whereClauses.push(`(name LIKE ? OR email LIKE ? OR phone LIKE ?)`);
        const search = `%${searchText}%`;
        values.push(search, search, search);
      }
    }

    const whereSQL = whereClauses.join(' AND ');

    // 查询数据
    const stmt = this.db.prepare(`
      SELECT * FROM contacts 
      WHERE ${whereSQL}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows: any[] = await stmt.all(...values, limit, offset) as any[];

    // 查询总数
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM contacts WHERE ${whereSQL}`);
    const countRow: any = countStmt.get(...values);
    const total = countRow.count;

    const rowsArray = Array.isArray(rows) ? rows : [];

    return {
      items: rowsArray.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        avatar: row.avatar,
        source: row.source,
        sourceId: row.source_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        // 解析 metadata JSON
        ...(row.metadata ? JSON.parse(row.metadata) : {})
      })),
      total,
      hasMore: offset + rowsArray.length < total,
    };
  }

  /**
   * 创建联系人
   */
  async createContact(contact: Contact): Promise<void> {
    if (!this.db) throw new Error('SQLite not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO contacts (
        id, name, email, phone, avatar, source, source_id,
        created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const source = contact.isOutlook
      ? 'outlook'
      : contact.isGoogle
        ? 'google'
        : contact.isiCloud
          ? 'icloud'
          : 'local';

    stmt.run(
      contact.id,
      contact.name,
      contact.email,
      contact.phone || null,
      contact.avatarUrl || null,
      source,
      contact.externalId || null,
      contact.createdAt,
      contact.updatedAt,
      JSON.stringify({
        notes: contact.notes,
        avatarUrl: contact.avatarUrl,
        organization: contact.organization,
        position: contact.position
      })
    );
  }

  /**
   * 更新联系人
   */
  async updateContact(contact: Contact): Promise<void> {
    if (!this.db) throw new Error('SQLite not initialized');

    const stmt = this.db.prepare(`
      UPDATE contacts SET
        name = ?, email = ?, phone = ?, avatar = ?,
        source = ?, source_id = ?, updated_at = ?,
        deleted_at = ?, metadata = ?
      WHERE id = ?
    `);

    const source = contact.isOutlook
      ? 'outlook'
      : contact.isGoogle
        ? 'google'
        : contact.isiCloud
          ? 'icloud'
          : 'local';

    stmt.run(
      contact.name,
      contact.email,
      contact.phone || null,
      contact.avatarUrl || null,
      source,
      contact.externalId || null,
      contact.updatedAt,
      (contact as any).deletedAt || null,
      JSON.stringify({
        notes: contact.notes,
        avatarUrl: contact.avatarUrl,
        organization: contact.organization,
        position: contact.position
      }),
      contact.id
    );
  }

  /**
   * 删除联系人（物理删除，软删除通过 updateContact 设置 deletedAt）
   */
  async deleteContact(id: string): Promise<void> {
    if (!this.db) throw new Error('SQLite not initialized');

    const stmt = this.db.prepare('DELETE FROM contacts WHERE id = ?');
    stmt.run(id);
  }

  // ==================== Event History CRUD ====================

  /**
   * 创建事件历史记录
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

    const stmt = this.db.prepare(`
      INSERT INTO event_history (
        id, event_id, operation, timestamp, source,
        before_json, after_json, changes_json,
        user_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
      log.id,
      log.eventId,
      log.operation,
      log.timestamp,
      log.source,
      log.before ? JSON.stringify(log.before) : null,
      log.after ? JSON.stringify(log.after) : null,
      log.changes ? JSON.stringify(log.changes) : null,
      log.userId || null,
      log.metadata ? JSON.stringify(log.metadata) : null,
      formatTimeForStorage(new Date())
    );
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

    const { eventIds, operations, startTime, endTime, source, limit = 1000, offset = 0 } = options;

    let query = 'SELECT * FROM event_history WHERE 1=1';
    const params: any[] = [];

    if (eventIds && eventIds.length > 0) {
      query += ` AND event_id IN (${eventIds.map(() => '?').join(',')})`;
      params.push(...eventIds);
    }

    if (operations && operations.length > 0) {
      query += ` AND operation IN (${operations.map(() => '?').join(',')})`;
      params.push(...operations);
    }

    if (startTime) {
      query += ' AND timestamp >= ?';
      params.push(startTime);
    }

    if (endTime) {
      query += ' AND timestamp <= ?';
      params.push(endTime);
    }

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = await stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      eventId: row.event_id,
      operation: row.operation,
      timestamp: row.timestamp,
      source: row.source,
      before: row.before_json ? JSON.parse(row.before_json) : undefined,
      after: row.after_json ? JSON.parse(row.after_json) : undefined,
      changes: row.changes_json ? JSON.parse(row.changes_json) : undefined,
      userId: row.user_id,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      createdAt: row.created_at
    }));
  }

  /**
   * 删除单条历史记录
   */
  async deleteEventHistory(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM event_history WHERE id = ?
    `);

    await stmt.run(id);
  }

  /**
   * 删除旧的历史记录（保留策略）
   */
  async cleanupEventHistory(olderThan: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM event_history WHERE timestamp < ?
    `);

    const result = await stmt.run(olderThan);
    return result.changes || 0;
  }

  /**
   * 获取历史记录统计
   */
  async getEventHistoryStats(): Promise<{
    total: number;
    byOperation: Record<string, number>;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    // 总数
    const totalStmt = this.db.prepare('SELECT COUNT(*) as total FROM event_history');
    const totalRow = await totalStmt.get() as any;

    // 按操作类型统计
    const byOpStmt = this.db.prepare(`
      SELECT operation, COUNT(*) as count 
      FROM event_history 
      GROUP BY operation
    `);
    const byOpRows = await byOpStmt.all() as any[];
    const byOperation: Record<string, number> = {};
    byOpRows.forEach(row => {
      byOperation[row.operation] = row.count;
    });

    // 最早和最晚时间
    const rangeStmt = this.db.prepare(`
      SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest 
      FROM event_history
    `);
    const rangeRow = await rangeStmt.get() as any;

    return {
      total: totalRow.total,
      byOperation,
      oldestTimestamp: rangeRow.oldest,
      newestTimestamp: rangeRow.newest
    };
  }

  /**
   * 清空所有数据（测试用）
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tables = [
      'event_tags',
      'event_calendar_mappings',
      'attachments',
      'eventlogs',
      'events',
      'sync_queue',
      'contacts',
      'tags',
      'calendars',
      'accounts'
    ];

    for (const table of tables) {
      this.db.prepare(`DELETE FROM ${table}`).run();
    }

    console.log('?All SQLite data cleared');
  }

  /**
   * 关闭数据库连?
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('?SQLite database closed');
    }
  }
}

// 导出单例
export const sqliteService = new SQLiteService();
