# ContactService 迁移测试清单

## 📋 测试概览

**测试目标**: 验证 ContactService 从 localStorage 迁移到 StorageManager 的完整性  
**测试范围**: 单元测试 + 集成测试 + 性能测试  
**测试环境**: 浏览器（Chrome/Edge）+ Electron

---

## 1️⃣ 单元测试（Unit Tests）

### 1.1 初始化和迁移
```typescript
describe('ContactService.initialize()', () => {
  test('应该从 StorageManager 加载联系人', async () => {
    await ContactService.initialize();
    const contacts = await ContactService.getAllContacts();
    expect(Array.isArray(contacts)).toBe(true);
  });

  test('应该自动迁移 localStorage 数据', async () => {
    // 准备：写入旧数据到 localStorage
    const mockContacts = [
      { id: 'c1', name: 'Alice', email: 'alice@test.com' },
      { id: 'c2', name: 'Bob', email: 'bob@test.com' },
    ];
    localStorage.setItem('4dnote-contacts', JSON.stringify(mockContacts));
    
    // 执行：初始化
    await ContactService.initialize();
    
    // 验证：数据已迁移到 StorageManager
    const result = await storageManager.queryContacts({ limit: 10 });
    expect(result.items.length).toBe(2);
    expect(result.items[0].name).toBe('Alice');
    
    // 验证：localStorage 已备份并清理
    expect(localStorage.getItem('4dnote-contacts')).toBeNull();
    expect(localStorage.getItem('4dnote-contacts-backup')).toBeTruthy();
  });

  test('应该处理并发初始化调用', async () => {
    const promises = [
      ContactService.initialize(),
      ContactService.initialize(),
      ContactService.initialize(),
    ];
    
    await Promise.all(promises);
    // 不应抛出错误，只初始化一次
  });
});
```

---

### 1.2 创建联系人（Create）
```typescript
describe('ContactService.addContact()', () => {
  test('应该创建联系人并写入 StorageManager', async () => {
    const newContact = {
      name: 'Charlie',
      email: 'charlie@test.com',
      organization: 'ACME Corp',
    };
    
    const created = await ContactService.addContact(newContact);
    
    // 验证：返回值包含生成的 ID 和时间戳
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBeTruthy();
    
    // 验证：已写入 StorageManager
    const fetched = await storageManager.queryContacts({ 
      contactIds: [created.id] 
    });
    expect(fetched.items.length).toBe(1);
    expect(fetched.items[0].name).toBe('Charlie');
  });

  test('应该自动生成 Gravatar 头像', async () => {
    const contact = await ContactService.addContact({
      name: 'Dave',
      email: 'dave@test.com',
    });
    
    expect(contact.avatarUrl).toContain('gravatar.com');
    expect(contact.avatarUrl).toContain('dave@test.com');
  });

  test('应该触发 contact.created 事件', async () => {
    const eventListener = jest.fn();
    ContactService.on('contact.created', eventListener);
    
    const contact = await ContactService.addContact({
      name: 'Eve',
      email: 'eve@test.com',
    });
    
    expect(eventListener).toHaveBeenCalledWith({
      contact: expect.objectContaining({ name: 'Eve' }),
    });
  });
});
```

---

### 1.3 批量创建（Batch Create）
```typescript
describe('ContactService.addContacts()', () => {
  test('应该批量创建 100 个联系人', async () => {
    const contacts = Array.from({ length: 100 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@test.com`,
    }));
    
    const created = await ContactService.addContacts(contacts);
    
    expect(created.length).toBe(100);
    expect(created[0].id).toBeTruthy();
  });

  test('应该处理部分失败（错误处理）', async () => {
    const contacts = [
      { name: 'Valid', email: 'valid@test.com' },
      { name: null, email: 'invalid@test.com' }, // 缺少必填字段
      { name: 'Valid2', email: 'valid2@test.com' },
    ];
    
    const created = await ContactService.addContacts(contacts);
    
    // 验证：只有有效的联系人被创建
    expect(created.length).toBeLessThan(3);
  });

  test('应该触发 contacts.synced 事件', async () => {
    const eventListener = jest.fn();
    ContactService.on('contacts.synced', eventListener);
    
    await ContactService.addContacts([
      { name: 'A', email: 'a@test.com' },
      { name: 'B', email: 'b@test.com' },
    ]);
    
    expect(eventListener).toHaveBeenCalledWith({
      count: 2,
      contacts: expect.any(Array),
    });
  });
});
```

---

### 1.4 更新联系人（Update）
```typescript
describe('ContactService.updateContact()', () => {
  test('应该更新联系人并写入 StorageManager', async () => {
    // 准备：创建联系人
    const contact = await ContactService.addContact({
      name: 'Old Name',
      email: 'old@test.com',
    });
    
    // 执行：更新
    const updated = await ContactService.updateContact(contact.id, {
      name: 'New Name',
      organization: 'New Corp',
    });
    
    // 验证：返回值已更新
    expect(updated?.name).toBe('New Name');
    expect(updated?.organization).toBe('New Corp');
    expect(updated?.email).toBe('old@test.com'); // 保持不变
    
    // 验证：StorageManager 已更新
    const fetched = await ContactService.getContactById(contact.id);
    expect(fetched?.name).toBe('New Name');
  });

  test('应该更新 updatedAt 时间戳', async () => {
    const contact = await ContactService.addContact({ name: 'Test', email: 'test@test.com' });
    
    await new Promise(resolve => setTimeout(resolve, 10)); // 等待 10ms
    
    const updated = await ContactService.updateContact(contact.id, { name: 'Updated' });
    
    expect(updated?.updatedAt).not.toBe(contact.createdAt);
  });

  test('应该触发 contact.updated 事件', async () => {
    const contact = await ContactService.addContact({ name: 'Test', email: 'test@test.com' });
    
    const eventListener = jest.fn();
    ContactService.on('contact.updated', eventListener);
    
    await ContactService.updateContact(contact.id, { name: 'Updated' });
    
    expect(eventListener).toHaveBeenCalledWith({
      id: contact.id,
      before: expect.objectContaining({ name: 'Test' }),
      after: expect.objectContaining({ name: 'Updated' }),
    });
  });
});
```

---

### 1.5 删除联系人（Delete）
```typescript
describe('ContactService.deleteContact()', () => {
  test('应该软删除联系人（设置 deletedAt）', async () => {
    // 准备：创建联系人
    const contact = await ContactService.addContact({ name: 'ToDelete', email: 'delete@test.com' });
    
    // 执行：删除
    const result = await ContactService.deleteContact(contact.id);
    expect(result).toBe(true);
    
    // 验证：内存缓存中已移除
    const cached = await ContactService.getContactById(contact.id);
    expect(cached).toBeUndefined();
    
    // 验证：StorageManager 中软删除（deletedAt 非空）
    // 需要绕过 queryContacts 的软删除过滤
    const db = await indexedDB.open('4DNote', 1);
    const tx = db.transaction('contacts', 'readonly');
    const store = tx.objectStore('contacts');
    const dbContact = await store.get(contact.id);
    
    expect(dbContact.deletedAt).toBeTruthy();
  });

  test('应该触发 contact.deleted 事件', async () => {
    const contact = await ContactService.addContact({ name: 'ToDelete', email: 'delete@test.com' });
    
    const eventListener = jest.fn();
    ContactService.on('contact.deleted', eventListener);
    
    await ContactService.deleteContact(contact.id);
    
    expect(eventListener).toHaveBeenCalledWith({
      id: contact.id,
      contact: expect.objectContaining({ name: 'ToDelete' }),
    });
  });
});
```

---

### 1.6 查询方法
```typescript
describe('ContactService.queryContacts()', () => {
  beforeEach(async () => {
    // 准备测试数据
    await ContactService.addContacts([
      { name: 'Alice', email: 'alice@company.com', organization: 'CompanyA', is4DNote: true },
      { name: 'Bob', email: 'bob@company.com', organization: 'CompanyB', isOutlook: true },
      { name: 'Charlie', email: 'charlie@gmail.com', organization: 'CompanyC', isGoogle: true },
    ]);
  });

  test('getAllContacts() 应该返回所有联系人', async () => {
    const contacts = await ContactService.getAllContacts();
    expect(contacts.length).toBeGreaterThanOrEqual(3);
  });

  test('getContactById() 应该返回指定联系人', async () => {
    const all = await ContactService.getAllContacts();
    const contact = await ContactService.getContactById(all[0].id);
    expect(contact?.id).toBe(all[0].id);
  });

  test('getContactByEmail() 应该支持不区分大小写', async () => {
    const contact = await ContactService.getContactByEmail('ALICE@COMPANY.COM');
    expect(contact?.email).toBe('alice@company.com');
  });

  test('searchContacts() 应该搜索姓名/邮箱/组织', async () => {
    const results = await ContactService.searchContacts('company');
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  test('searchContacts() 应该支持平台过滤', async () => {
    const outlookContacts = await ContactService.searchContacts('', 'outlook');
    expect(outlookContacts.every(c => c.isOutlook)).toBe(true);
  });
});
```

---

## 2️⃣ 集成测试（Integration Tests）

### 2.1 浏览器环境测试
```typescript
describe('ContactService in Browser', () => {
  test('应该使用 IndexedDB 存储', async () => {
    const contact = await ContactService.addContact({ name: 'Browser', email: 'browser@test.com' });
    
    // 验证：IndexedDB 中存在
    const db = await indexedDB.open('4DNote', 1);
    const tx = db.transaction('contacts', 'readonly');
    const stored = await tx.objectStore('contacts').get(contact.id);
    
    expect(stored.name).toBe('Browser');
  });

  test('应该支持 250MB 容量限制', async () => {
    // 创建大量联系人（接近限制）
    const largeContacts = Array.from({ length: 10000 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@test.com`,
      notes: 'A'.repeat(1000), // 每个联系人 ~1KB
    }));
    
    await ContactService.addContacts(largeContacts);
    
    // 验证：可以查询
    const result = await ContactService.getAllContacts();
    expect(result.length).toBeGreaterThanOrEqual(10000);
  });
});
```

---

### 2.2 Electron 环境测试
```typescript
describe('ContactService in Electron', () => {
  test('应该同时写入 IndexedDB 和 SQLite', async () => {
    const contact = await ContactService.addContact({ name: 'Electron', email: 'electron@test.com' });
    
    // 验证：IndexedDB 中存在
    const indexedDBResult = await indexedDBService.queryContacts({ contactIds: [contact.id] });
    expect(indexedDBResult.items.length).toBe(1);
    
    // 验证：SQLite 中存在
    const sqliteResult = await sqliteService.queryContacts({ contactIds: [contact.id] });
    expect(sqliteResult.items.length).toBe(1);
  });

  test('应该支持无限容量（SQLite）', async () => {
    // 创建超大量联系人（超过 IndexedDB 限制）
    const contacts = Array.from({ length: 50000 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@test.com`,
    }));
    
    await ContactService.addContacts(contacts);
    
    // 验证：SQLite 可以存储
    const result = await sqliteService.queryContacts({ limit: 60000 });
    expect(result.items.length).toBeGreaterThanOrEqual(50000);
  });
});
```

---

### 2.3 跨标签页同步测试
```typescript
describe('Cross-tab Sync', () => {
  test('应该在多个标签页间同步联系人', async () => {
    // 标签页 1：创建联系人
    const contact = await ContactService.addContact({ name: 'Sync', email: 'sync@test.com' });
    
    // 模拟标签页 2：监听 storage 事件
    const storageEvent = new StorageEvent('storage', {
      key: '4dnote-contacts',
      newValue: JSON.stringify([contact]),
    });
    window.dispatchEvent(storageEvent);
    
    // 标签页 2：查询联系人
    await ContactService.initialize(); // 重新加载
    const fetched = await ContactService.getContactById(contact.id);
    
    expect(fetched?.name).toBe('Sync');
  });
});
```

---

### 2.4 数据迁移场景测试
```typescript
describe('Data Migration', () => {
  test('应该从 localStorage 迁移现有联系人', async () => {
    // 准备：模拟旧数据
    const oldContacts = Array.from({ length: 500 }, (_, i) => ({
      id: `old-${i}`,
      name: `Old User ${i}`,
      email: `old${i}@test.com`,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }));
    localStorage.setItem('4dnote-contacts', JSON.stringify(oldContacts));
    
    // 执行：初始化（自动迁移）
    await ContactService.initialize();
    
    // 验证：所有联系人已迁移
    const migrated = await ContactService.getAllContacts();
    expect(migrated.length).toBeGreaterThanOrEqual(500);
    
    // 验证：localStorage 已清理
    expect(localStorage.getItem('4dnote-contacts')).toBeNull();
    expect(localStorage.getItem('4dnote-contacts-backup')).toBeTruthy();
  });

  test('应该处理损坏的 localStorage 数据', async () => {
    // 准备：写入损坏的数据
    localStorage.setItem('4dnote-contacts', '{invalid json}');
    
    // 执行：初始化
    await ContactService.initialize();
    
    // 验证：不应抛出错误，返回空数组
    const contacts = await ContactService.getAllContacts();
    expect(Array.isArray(contacts)).toBe(true);
  });
});
```

---

## 3️⃣ 性能测试（Performance Tests）

### 3.1 创建性能
```typescript
describe('Performance: Create', () => {
  test('创建 1000 个联系人应小于 5 秒', async () => {
    const contacts = Array.from({ length: 1000 }, (_, i) => ({
      name: `Perf User ${i}`,
      email: `perf${i}@test.com`,
    }));
    
    const start = performance.now();
    await ContactService.addContacts(contacts);
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(5000); // < 5s
  });
});
```

### 3.2 查询性能
```typescript
describe('Performance: Query', () => {
  beforeAll(async () => {
    // 准备 10000 个联系人
    const contacts = Array.from({ length: 10000 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@test.com`,
    }));
    await ContactService.addContacts(contacts);
  });

  test('查询所有联系人应小于 500ms', async () => {
    const start = performance.now();
    await ContactService.getAllContacts();
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(500); // < 500ms
  });

  test('搜索联系人应小于 100ms', async () => {
    const start = performance.now();
    await ContactService.searchContacts('user');
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(100); // < 100ms
  });
});
```

### 3.3 内存占用
```typescript
describe('Performance: Memory', () => {
  test('10000 个联系人占用应小于 50MB', async () => {
    const initialMemory = performance.memory.usedJSHeapSize;
    
    const contacts = Array.from({ length: 10000 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@test.com`,
    }));
    await ContactService.addContacts(contacts);
    
    const finalMemory = performance.memory.usedJSHeapSize;
    const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // MB
    
    expect(memoryIncrease).toBeLessThan(50); // < 50MB
  });
});
```

---

## 4️⃣ 错误处理测试

### 4.1 网络错误
```typescript
describe('Error Handling: Network', () => {
  test('应该处理 IndexedDB 写入失败', async () => {
    // 模拟 IndexedDB 错误
    jest.spyOn(indexedDBService, 'createContact').mockRejectedValue(new Error('QuotaExceededError'));
    
    // 执行：创建联系人
    const contact = await ContactService.addContact({ name: 'Test', email: 'test@test.com' });
    
    // 验证：应回退到 SQLite（Electron）或返回错误（Browser）
    expect(contact).toBeTruthy(); // 在 Electron 中成功
  });
});
```

### 4.2 并发写入
```typescript
describe('Error Handling: Concurrency', () => {
  test('应该处理并发创建同一联系人', async () => {
    const contactData = { name: 'Concurrent', email: 'concurrent@test.com' };
    
    const promises = [
      ContactService.addContact(contactData),
      ContactService.addContact(contactData),
      ContactService.addContact(contactData),
    ];
    
    const results = await Promise.all(promises);
    
    // 验证：每个调用都有唯一 ID
    const ids = results.map(c => c.id);
    expect(new Set(ids).size).toBe(3);
  });
});
```

---

## ✅ 测试执行清单

### 自动化测试
```bash
# 运行所有单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行性能测试
npm run test:performance

# 生成覆盖率报告
npm run test:coverage
```

### 手动测试
- [ ] 浏览器控制台测试
  - 打开 DevTools → Application → IndexedDB → 4DNote → contacts
  - 验证数据写入

- [ ] Electron 测试
  - 检查 `database/4dnote.db` 文件
  - 使用 DB Browser for SQLite 验证数据

- [ ] 跨标签页测试
  - 打开两个标签页
  - 在标签页 1 创建联系人
  - 在标签页 2 验证同步

---

## 📊 测试覆盖率目标

| 模块 | 目标覆盖率 | 当前状态 |
|------|-----------|---------|
| ContactService.ts | 95% | ⏳ 待测试 |
| StorageManager.ts | 90% | ⏳ 待测试 |
| IndexedDBService.ts | 90% | ⏳ 待测试 |
| SQLiteService.ts | 90% | ⏳ 待测试 |

---

## 🐛 已知问题追踪

| 问题 | 优先级 | 状态 |
|------|--------|------|
| 无 | - | - |

---

**测试负责人**: GitHub Copilot  
**更新时间**: 2025-01-XX  
**审核状态**: ⏳ 待执行
