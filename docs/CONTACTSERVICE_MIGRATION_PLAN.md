# ContactService StorageManager 迁移实施计划

**日期**: 2025-12-03  
**状态**: 待实施  
**优先级**: 高（唯一未完成的核心服务）  
**预估时间**: 10-15 小时

---

## 🎯 迁移目标

将 `ContactService.ts` 从 localStorage 迁移到 StorageManager（IndexedDB + SQLite 双写架构）

### 当前状态
- ❌ 使用 `localStorage.getItem()` / `setItem()`
- ❌ 5-10 MB 存储限制（浏览器环境）
- ❌ 无双写保护
- ❌ 无软删除支持
- ❌ 无 LRU 缓存

### 目标状态
- ✅ 使用 StorageManager 统一接口
- ✅ IndexedDB + SQLite 双写（Electron 环境无限容量）
- ✅ 自动软删除支持
- ✅ LRU 缓存优化（10 MB）
- ✅ 自动数据迁移

---

## 📋 实施阶段

### Phase 1: StorageManager 方法实现 (4-5h)

#### 1.1 在 `StorageManager.ts` 添加 Contact CRUD 方法

```typescript
/**
 * 查询联系人
 */
async queryContacts(options: QueryOptions = {}): Promise<QueryResult<Contact>> {
  await this.ensureInitialized();
  
  console.log('[StorageManager] Querying contacts:', options);
  
  try {
    // 1. 优先使用 SQLite
    if (this.sqliteService) {
      const result = await this.sqliteService.queryContacts(options);
      
      // 缓存结果
      result.items.forEach((contact: Contact) => {
        this.contactCache.set(contact.id, contact);
      });
      
      console.log('[StorageManager] ✅ Query complete (SQLite):', result.items.length, 'contacts');
      return result;
    }
    
    // 2. 降级到 IndexedDB
    if (this.indexedDBService) {
      const result = await this.indexedDBService.queryContacts(options);
      
      result.items.forEach((contact: Contact) => {
        this.contactCache.set(contact.id, contact);
      });
      
      console.log('[StorageManager] ✅ Query complete (IndexedDB):', result.items.length, 'contacts');
      return result;
    }
    
    // 3. 都不可用，返回空结果
    console.warn('[StorageManager] ⚠️  No storage service available');
    return { items: [], total: 0, hasMore: false };
  } catch (error) {
    console.error('[StorageManager] ❌ Query contacts failed:', error);
    return { items: [], total: 0, hasMore: false };
  }
}

/**
 * 创建联系人（双写）
 */
async createContact(contact: Contact): Promise<void> {
  await this.ensureInitialized();
  
  console.log('[StorageManager] Creating contact:', contact.id);
  
  const errors: any[] = [];
  
  // 1. 写入 IndexedDB
  if (this.indexedDBService) {
    try {
      await this.indexedDBService.createContact(contact);
      console.log('[StorageManager] ✅ Contact created in IndexedDB');
    } catch (error) {
      console.error('[StorageManager] ❌ IndexedDB write failed:', error);
      errors.push({ service: 'IndexedDB', error });
    }
  }
  
  // 2. 写入 SQLite（如果可用）
  if (this.sqliteService) {
    try {
      await this.sqliteService.createContact(contact);
      console.log('[StorageManager] ✅ Contact created in SQLite');
    } catch (error) {
      console.error('[StorageManager] ❌ SQLite write failed:', error);
      errors.push({ service: 'SQLite', error });
    }
  }
  
  // 3. 更新缓存
  this.contactCache.set(contact.id, contact);
  
  // 如果所有存储都失败，抛出错误
  if (errors.length > 0 && (!this.indexedDBService && !this.sqliteService)) {
    throw new Error(`All storage services failed: ${JSON.stringify(errors)}`);
  }
}

/**
 * 更新联系人（双写）
 */
async updateContact(contact: Contact): Promise<void> {
  await this.ensureInitialized();
  
  console.log('[StorageManager] Updating contact:', contact.id);
  
  const errors: any[] = [];
  
  // 1. 更新 IndexedDB
  if (this.indexedDBService) {
    try {
      await this.indexedDBService.updateContact(contact);
      console.log('[StorageManager] ✅ Contact updated in IndexedDB');
    } catch (error) {
      console.error('[StorageManager] ❌ IndexedDB update failed:', error);
      errors.push({ service: 'IndexedDB', error });
    }
  }
  
  // 2. 更新 SQLite
  if (this.sqliteService) {
    try {
      await this.sqliteService.updateContact(contact);
      console.log('[StorageManager] ✅ Contact updated in SQLite');
    } catch (error) {
      console.error('[StorageManager] ❌ SQLite update failed:', error);
      errors.push({ service: 'SQLite', error });
    }
  }
  
  // 3. 更新缓存
  this.contactCache.set(contact.id, contact);
  
  if (errors.length > 0 && (!this.indexedDBService && !this.sqliteService)) {
    throw new Error(`All storage services failed: ${JSON.stringify(errors)}`);
  }
}

/**
 * 删除联系人（软删除）
 */
async deleteContact(id: string): Promise<void> {
  await this.ensureInitialized();
  
  console.log('[StorageManager] Soft-deleting contact:', id);
  
  // 获取现有联系人
  const result = await this.queryContacts({
    filters: { contactIds: [id] },
    limit: 1
  });
  
  if (result.items.length === 0) {
    throw new Error(`Contact not found: ${id}`);
  }
  
  const contact = result.items[0];
  const deletedContact = {
    ...contact,
    deletedAt: formatTimeForStorage(new Date()),
    updatedAt: formatTimeForStorage(new Date())
  };
  
  // 标记为已删除（双写）
  await this.updateContact(deletedContact);
  
  // 从缓存移除
  this.contactCache.delete(id);
  
  console.log('[StorageManager] ✅ Contact soft-deleted');
}

/**
 * 批量创建联系人
 */
async batchCreateContacts(contacts: Contact[]): Promise<{ successful: number; failed: number }> {
  await this.ensureInitialized();
  
  console.log('[StorageManager] Batch creating contacts:', contacts.length);
  
  let successful = 0;
  let failed = 0;
  
  for (const contact of contacts) {
    try {
      await this.createContact(contact);
      successful++;
    } catch (error) {
      console.error('[StorageManager] Failed to create contact:', contact.id, error);
      failed++;
    }
  }
  
  console.log('[StorageManager] ✅ Batch create complete:', { successful, failed });
  return { successful, failed };
}
```

#### 1.2 添加类型定义（如需要）

确保 `src/services/storage/types.ts` 中有 Contact 查询选项：

```typescript
export interface QueryOptions {
  filters?: {
    contactIds?: string[];
    emails?: string[];
    sources?: string[];
    searchText?: string;
    // ...
  };
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}
```

---

### Phase 2: IndexedDB 实现 (2-3h)

在 `src/services/storage/IndexedDBService.ts` 添加 Contact 表操作：

```typescript
/**
 * 查询联系人
 */
async queryContacts(options: QueryOptions = {}): Promise<QueryResult<Contact>> {
  await this.ensureInitialized();
  
  const tx = this.db!.transaction('contacts', 'readonly');
  const store = tx.objectStore('contacts');
  const allContacts = await store.getAll();
  
  // 过滤已删除的联系人
  let contacts = allContacts.filter(c => !c.deletedAt);
  
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
      contacts = contacts.filter(c => sources.includes(c.source));
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
  
  return {
    items: paginatedContacts,
    total: contacts.length,
    hasMore: offset + limit < contacts.length
  };
}

/**
 * 创建联系人
 */
async createContact(contact: Contact): Promise<void> {
  await this.ensureInitialized();
  
  const tx = this.db!.transaction('contacts', 'readwrite');
  const store = tx.objectStore('contacts');
  
  await store.add(contact);
  await tx.done;
}

/**
 * 更新联系人
 */
async updateContact(contact: Contact): Promise<void> {
  await this.ensureInitialized();
  
  const tx = this.db!.transaction('contacts', 'readwrite');
  const store = tx.objectStore('contacts');
  
  await store.put(contact);
  await tx.done;
}
```

---

### Phase 3: SQLite 实现 (2-3h)

在 `src/services/storage/SQLiteService.ts` 添加 Contact 表操作：

```typescript
/**
 * 查询联系人
 */
async queryContacts(options: QueryOptions = {}): Promise<QueryResult<Contact>> {
  if (!this.db) throw new Error('SQLite not initialized');
  
  let query = `
    SELECT * FROM contacts 
    WHERE deletedAt IS NULL
  `;
  const params: any[] = [];
  
  // 应用过滤条件
  if (options.filters) {
    const { contactIds, emails, sources, searchText } = options.filters;
    
    if (contactIds && contactIds.length > 0) {
      const placeholders = contactIds.map(() => '?').join(',');
      query += ` AND id IN (${placeholders})`;
      params.push(...contactIds);
    }
    
    if (emails && emails.length > 0) {
      const placeholders = emails.map(() => '?').join(',');
      query += ` AND email IN (${placeholders})`;
      params.push(...emails);
    }
    
    if (sources && sources.length > 0) {
      const placeholders = sources.map(() => '?').join(',');
      query += ` AND source IN (${placeholders})`;
      params.push(...sources);
    }
    
    if (searchText) {
      query += ` AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
      const search = `%${searchText}%`;
      params.push(search, search, search);
    }
  }
  
  // 排序
  query += ` ORDER BY updatedAt DESC`;
  
  // 分页
  const limit = options.limit || 1000;
  const offset = options.offset || 0;
  query += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const stmt = this.db.prepare(query);
  const contacts = stmt.all(...params) as Contact[];
  
  // 解析 JSON 字段
  contacts.forEach(contact => {
    if (typeof contact.metadata === 'string') {
      contact.metadata = JSON.parse(contact.metadata);
    }
  });
  
  // 获取总数
  const countStmt = this.db.prepare(`
    SELECT COUNT(*) as count FROM contacts WHERE deletedAt IS NULL
  `);
  const { count } = countStmt.get() as { count: number };
  
  return {
    items: contacts,
    total: count,
    hasMore: offset + limit < count
  };
}

/**
 * 创建联系人
 */
async createContact(contact: Contact): Promise<void> {
  if (!this.db) throw new Error('SQLite not initialized');
  
  const stmt = this.db.prepare(`
    INSERT INTO contacts (
      id, name, email, phone, avatar, source, sourceId,
      createdAt, updatedAt, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    contact.id,
    contact.name,
    contact.email,
    contact.phone || null,
    contact.avatar || null,
    contact.source || 'local',
    contact.sourceId || null,
    contact.createdAt,
    contact.updatedAt,
    JSON.stringify(contact.metadata || {})
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
      source = ?, sourceId = ?, updatedAt = ?,
      deletedAt = ?, metadata = ?
    WHERE id = ?
  `);
  
  stmt.run(
    contact.name,
    contact.email,
    contact.phone || null,
    contact.avatar || null,
    contact.source || 'local',
    contact.sourceId || null,
    contact.updatedAt,
    contact.deletedAt || null,
    JSON.stringify(contact.metadata || {}),
    contact.id
  );
}
```

---

### Phase 4: ContactService 迁移 (2-3h)

修改 `src/services/ContactService.ts`：

```typescript
/**
 * 初始化联系人服务（异步，使用 StorageManager）
 */
static async initialize(): Promise<void> {
  if (this.initialized) return;
  
  try {
    contactLogger.log('🔍 [ContactService] Loading contacts from StorageManager...');
    
    // 从 StorageManager 加载联系人
    const result = await storageManager.queryContacts({ limit: 10000 });
    
    if (result.items.length > 0) {
      this.contacts = result.items;
      contactLogger.log(`✅ [ContactService] Loaded ${this.contacts.length} contacts from storage`);
    } else {
      // 尝试从 localStorage 迁移旧数据
      await this.migrateFromLocalStorage();
    }
    
    this.initialized = true;
  } catch (error) {
    contactLogger.error('❌ [ContactService] Failed to initialize:', error);
    this.contacts = [];
    this.initialized = true;
  }
}

/**
 * 从 localStorage 迁移旧数据
 */
private static async migrateFromLocalStorage(): Promise<void> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  
  try {
    const oldContacts: Contact[] = JSON.parse(stored);
    if (oldContacts.length === 0) return;
    
    contactLogger.log(`🔄 [ContactService] Migrating ${oldContacts.length} contacts from localStorage...`);
    
    // 批量写入 StorageManager（自动双写）
    const result = await storageManager.batchCreateContacts(oldContacts);
    contactLogger.log(`✅ [ContactService] Migrated ${result.successful}/${oldContacts.length} contacts`);
    
    // 重新加载到内存
    this.contacts = oldContacts;
    
    // 备份旧数据并清理
    localStorage.setItem(`${STORAGE_KEY}-backup`, stored);
    localStorage.removeItem(STORAGE_KEY);
    
    contactLogger.log('✅ [ContactService] Migration completed, old data backed up');
  } catch (error) {
    contactLogger.error('❌ [ContactService] Migration failed:', error);
  }
}

/**
 * 添加联系人（异步版本，使用 StorageManager）
 */
static async addContact(contact: Omit<Contact, 'id'>): Promise<Contact> {
  await this.initialize();
  
  const newContact: Contact = {
    ...contact,
    id: generateContactId(),
    createdAt: formatTimeForStorage(new Date()),
    updatedAt: formatTimeForStorage(new Date()),
  };

  // 设置头像
  if (newContact.email && !newContact.avatarUrl) {
    newContact.avatarUrl = this.getGravatarUrl(newContact.email);
  }

  // 写入 StorageManager（自动双写 IndexedDB + SQLite）
  await storageManager.createContact(newContact);

  // 更新内存缓存
  this.contacts.push(newContact);
  
  // 触发创建事件
  this.emitEvent('contact.created', { contact: newContact });
  
  contactLogger.log('✅ [ContactService] Created contact:', newContact.name);
  return newContact;
}

// 类似修改 updateContact(), deleteContact(), addContacts() 等方法...
```

---

### Phase 5: 数据迁移脚本 (1-2h)

创建 `scripts/migrate-contacts-to-storage-manager.js`：

```javascript
/**
 * ContactService 数据迁移脚本
 * 将 localStorage 中的联系人迁移到 StorageManager
 */

const { storageManager } = require('../src/services/storage/StorageManager');

async function migrateContacts() {
  console.log('🔄 [Migration] Starting contact migration...');
  
  try {
    // 1. 从 localStorage 读取
    const stored = localStorage.getItem('4dnote-contacts');
    if (!stored) {
      console.log('ℹ️ [Migration] No contacts found in localStorage');
      return;
    }
    
    const contacts = JSON.parse(stored);
    console.log(`📦 [Migration] Found ${contacts.length} contacts in localStorage`);
    
    // 2. 批量写入 StorageManager
    await storageManager.initialize();
    const result = await storageManager.batchCreateContacts(contacts);
    
    console.log(`✅ [Migration] Migrated ${result.successful}/${contacts.length} contacts`);
    console.log(`❌ [Migration] Failed: ${result.failed} contacts`);
    
    // 3. 备份并清理
    if (result.successful === contacts.length) {
      localStorage.setItem('4dnote-contacts-backup', stored);
      localStorage.removeItem('4dnote-contacts');
      console.log('✅ [Migration] Old data backed up and cleaned');
    } else {
      console.warn('⚠️ [Migration] Partial migration, keeping original data');
    }
    
    // 4. 验证
    const verification = await storageManager.queryContacts({ limit: 10000 });
    console.log(`✅ [Migration] Verification: ${verification.items.length} contacts in storage`);
    
  } catch (error) {
    console.error('❌ [Migration] Migration failed:', error);
    throw error;
  }
}

// 执行迁移
migrateContacts().catch(console.error);
```

---

## 🧪 测试计划 (1-2h)

### 单元测试

```typescript
// tests/services/ContactService.test.ts

describe('ContactService with StorageManager', () => {
  beforeEach(async () => {
    await storageManager.initialize();
    await storageManager.clear();
  });
  
  it('should create contact via StorageManager', async () => {
    const contact = await ContactService.addContact({
      name: 'Test User',
      email: 'test@example.com'
    });
    
    expect(contact.id).toBeTruthy();
    
    // 验证 StorageManager 中存在
    const result = await storageManager.queryContacts({
      filters: { contactIds: [contact.id] }
    });
    expect(result.items).toHaveLength(1);
  });
  
  it('should update contact via StorageManager', async () => {
    const contact = await ContactService.addContact({
      name: 'Test User',
      email: 'test@example.com'
    });
    
    await ContactService.updateContact(contact.id, {
      phone: '+1234567890'
    });
    
    const updated = await ContactService.getContactById(contact.id);
    expect(updated?.phone).toBe('+1234567890');
  });
  
  it('should soft-delete contact', async () => {
    const contact = await ContactService.addContact({
      name: 'Test User',
      email: 'test@example.com'
    });
    
    await ContactService.deleteContact(contact.id);
    
    // 应该从列表中消失
    const contacts = await ContactService.getAllContacts();
    expect(contacts.find(c => c.id === contact.id)).toBeUndefined();
    
    // 但在 StorageManager 中仍存在（标记 deletedAt）
    const result = await storageManager.queryContacts({
      filters: { contactIds: [contact.id], includeDeleted: true }
    });
    expect(result.items[0].deletedAt).toBeTruthy();
  });
});
```

### 集成测试

- [ ] 创建联系人并验证双写
- [ ] 批量导入联系人
- [ ] Outlook/Google 联系人同步
- [ ] 跨标签页同步
- [ ] 软删除恢复

---

## ✅ 验收标准

### 功能验收
- [ ] ContactService 所有方法使用 StorageManager
- [ ] 支持 IndexedDB + SQLite 双写
- [ ] 支持软删除（deletedAt 字段）
- [ ] LRU 缓存生效（10 MB）
- [ ] localStorage 自动迁移脚本工作正常

### 性能验收
- [ ] 1000 联系人加载 < 500ms
- [ ] 创建联系人 < 50ms
- [ ] 更新联系人 < 30ms
- [ ] 批量导入 1000 联系人 < 3s

### 稳定性验收
- [ ] 零编译错误
- [ ] 零运行时错误
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试全部通过

---

## 🚀 实施时间表

| 阶段 | 任务 | 预估时间 | 开始日期 | 完成日期 |
|-----|------|---------|---------|---------|
| Phase 1 | StorageManager 方法实现 | 4-5h | 待定 | 待定 |
| Phase 2 | IndexedDB 实现 | 2-3h | 待定 | 待定 |
| Phase 3 | SQLite 实现 | 2-3h | 待定 | 待定 |
| Phase 4 | ContactService 迁移 | 2-3h | 待定 | 待定 |
| Phase 5 | 数据迁移脚本 | 1-2h | 待定 | 待定 |
| 测试 | 单元+集成测试 | 1-2h | 待定 | 待定 |
| **总计** | | **12-18h** | | |

---

## 📚 参考资料

- `src/services/EventService.ts` - 成功的 StorageManager 迁移案例
- `src/services/TagService.ts` - 另一个成功案例
- `src/services/storage/StorageManager.ts` - StorageManager API 文档
- `docs/architecture/STORAGE_ARCHITECTURE.md` - 存储架构设计文档

---

**创建时间**: 2025-12-03 15:50:00  
**下次审查**: 实施开始后每日更新
