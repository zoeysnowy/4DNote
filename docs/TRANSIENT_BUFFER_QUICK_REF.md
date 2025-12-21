# Transient Write Buffer - 快速参考

## 🎯 核心原理

**问题**: UUID 虽然立即生成，但数据持久化有 300ms 防抖延迟，导致 `getEventById()` 查询数据库时找不到刚创建的事件。

**解决**: 在防抖期间将事件缓存在内存中，数据写入成功后立即清除。

---

## 📍 关键代码位置

### 1. 缓冲区定义
**文件**: `src/services/EventService.ts`  
**行数**: Line 68

```typescript
private static pendingWrites = new Map<string, Event>();
```

---

### 2. 读取拦截（Read-Your-Own-Writes）
**文件**: `src/services/EventService.ts`  
**行数**: Line 324-327

```typescript
if (this.pendingWrites.has(eventId)) {
  return this.pendingWrites.get(eventId)!; // 直接返回内存数据
}
```

---

### 3. 创建事件时的缓冲逻辑
**文件**: `src/services/EventService.ts`  
**行数**: Line 662-687

```typescript
// 写入前：加入缓冲区
this.pendingWrites.set(finalEvent.id, finalEvent);

// 写入数据库
await storageManager.createEvent(storageEvent);

// 写入后：立即清除
this.pendingWrites.delete(finalEvent.id);
```

---

### 4. 更新事件时的缓冲逻辑
**文件**: `src/services/EventService.ts`  
**行数**: Line 1291-1294, 1406-1409

```typescript
// 写入前：更新缓冲区
this.pendingWrites.set(eventId, updatedEvent);

// 写入数据库
await storageManager.updateEvent(eventId, storageEvent);

// 写入后：立即清除
this.pendingWrites.delete(eventId);
```

---

## 🔍 监控与调试

### 检查缓冲区大小
在 Chrome DevTools Console 中运行：

```javascript
// 访问 EventService 的内部状态（需要暴露或通过全局对象）
window.EventService?.pendingWrites.size
```

### 日志关键字
搜索日志中的：
- `⚡️ [TransientBuffer] Hit pending writes cache` - 命中缓冲区
- `⚡️ [TransientBuffer] Event added to pending writes` - 加入缓冲区
- `⚡️ [TransientBuffer] Event flushed to DB and removed from buffer` - 清除缓冲区

---

## ⚠️ 注意事项

### 1. 缓冲区只在防抖期间有效
- ✅ 正确：在 `createEvent()` 调用后立即 `getEventById()` → 命中缓冲区
- ❌ 错误：等待 1 秒后 `getEventById()` → 缓冲区已清空，走数据库查询

### 2. 不适用于跨标签页场景
- 缓冲区是进程内存储，无法跨标签页共享
- 如需跨标签页同步，配合 `BroadcastChannel` 使用

### 3. 写入失败时的处理
- 当前实现：写入失败时缓冲区数据仍会被清除（`delete`）
- 后续优化：可以添加重试机制或超时清理

---

## 🧪 测试工具

**文件**: `public/test-transient-buffer.html`

### 打开方式
1. 启动 Vite 开发服务器
2. 访问 `http://localhost:5173/test-transient-buffer.html`

### 测试场景
1. **快速父子创建** - 验证 Tab 键层级结构
2. **并发更新** - 验证多个子事件同时关联父事件
3. **生命周期** - 验证缓冲区在写入后清空

---

## 🛠️ 故障排查

### 问题：父子关系仍然丢失
**检查点**:
1. `pendingWrites` 是否在 `createEvent` 中正确设置？
2. `getEventById` 是否优先检查缓冲区？
3. 是否在写入成功后立即清除缓冲区？

### 问题：内存占用持续增长
**原因**: 写入失败导致缓冲区数据残留  
**解决**: 添加超时清理机制（见文档建议）

### 问题：数据不一致
**原因**: 可能在清除缓冲区后又从旧数据更新  
**检查**: 确保所有 `updateEvent` 调用都经过缓冲区

---

## 📚 相关文档

- [TRANSIENT_WRITE_BUFFER_IMPLEMENTATION.md](./TRANSIENT_WRITE_BUFFER_IMPLEMENTATION.md) - 完整实现报告
- [EventService.ts](./src/services/EventService.ts) - 源代码

---

## 🔄 版本历史

- **v1.0** (2025-12-21) - 初始实现，解决父子事件关联问题
