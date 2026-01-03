/**
 * SQLite Database Wrapper
 * 
 * 通过 Electron IPC 与主进程中的 better-sqlite3 通信的包装类
 * 提供与 better-sqlite3 Database 类相同的接口
 * 
 * @version 1.0.0
 */

export class SQLiteDatabaseWrapper {
  private dbId: string | null = null;
  private statements = new Map<string, string>();

  constructor(private path: string, private options?: any) {
    // 构造函数不执行异步操作，在 initialize() 中创建连接
  }

  async initialize(): Promise<void> {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.sqlite) {
      throw new Error('SQLite IPC not available');
    }

    const result = await electronAPI.sqlite.createDatabase(this.path, this.options);
    if (!result.success) {
      throw new Error(`Failed to create database: ${result.error}`);
    }

    this.dbId = result.dbId;
    console.log(`✅ SQLite database connected: ${this.dbId}`);
  }

  async exec(sql: string): Promise<void> {
    if (!this.dbId) {
      throw new Error('Database not initialized');
    }
    
    const electronAPI = window.electronAPI;
    if (!electronAPI?.sqlite) throw new Error('SQLite IPC not available');
    await electronAPI.sqlite.exec(this.dbId, sql);
  }

  async pragma(pragma: string, options?: { simple?: boolean }): Promise<any> {
    if (!this.dbId) {
      throw new Error('Database not initialized');
    }

    const electronAPI = window.electronAPI;
    if (!electronAPI?.sqlite) throw new Error('SQLite IPC not available');
    return await electronAPI.sqlite.pragma(this.dbId, pragma);
  }

  prepare(sql: string): SQLiteStatementWrapper {
    if (!this.dbId) {
      throw new Error('Database not initialized');
    }

    return new SQLiteStatementWrapper(this.dbId, sql);
  }

  close(): void {
    if (this.dbId) {
      const electronAPI = window.electronAPI;
      if (!electronAPI?.sqlite) throw new Error('SQLite IPC not available');
      electronAPI.sqlite.close(this.dbId);
      this.dbId = null;
    }
  }
}

class SQLiteStatementWrapper {
  private stmtId: string | null = null;
  private initialized = false;

  constructor(private dbId: string, private sql: string) {}

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const electronAPI = window.electronAPI;
    if (!electronAPI?.sqlite) throw new Error('SQLite IPC not available');
    // preload.js 中的 prepare 直接返回 stmtId 字符串
    this.stmtId = await electronAPI.sqlite.prepare(this.dbId, this.sql);
    this.initialized = true;
  }

  async run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number }> {
    await this.ensureInitialized();
    
    const electronAPI = window.electronAPI;
    if (!electronAPI?.sqlite || !this.stmtId) throw new Error('SQLite statement not initialized');
    // preload.js 已经解包了结果，直接返回 { changes, lastInsertRowid }
    return await electronAPI.sqlite.run(this.stmtId, params);
  }

  async get(...params: any[]): Promise<any> {
    await this.ensureInitialized();
    
    const electronAPI = window.electronAPI;
    if (!electronAPI?.sqlite || !this.stmtId) throw new Error('SQLite statement not initialized');
    // preload.js 已经解包了结果，直接返回数据
    return await electronAPI.sqlite.get(this.stmtId, params);
  }

  async all(...params: any[]): Promise<any[]> {
    await this.ensureInitialized();
    
    const electronAPI = window.electronAPI;
    if (!electronAPI?.sqlite || !this.stmtId) throw new Error('SQLite statement not initialized');
    // preload.js 已经解包了结果，直接返回数据数组
    return await electronAPI.sqlite.all(this.stmtId, params);
  }
}
