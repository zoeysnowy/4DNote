# Timer/setTimeout 使用审计报告

**版本**: v2.21.0  
**日期**: 2025-12-23  
**审计范围**: PlanManager.tsx, EventHistoryService.ts  
**状态**: ⚠️ 发现7处定时器使用，需要优化3处

---

## 📊 发现的定时器使用

### 1. PlanManager.tsx (7处)

| 位置 | 类型 | 用途 | 状态 | 优先级 |
|------|------|------|------|--------|
| L117, L128, L147 | `setTimeout` | 悬浮卡片延迟显示/隐藏 | ✅ 合理 | P3 |
| L1315 | `setInterval` | 清理超过5分钟的空行 | ⚠️ 需要清理函数 | P1 |
| L1435 | `setTimeout` | onChange防抖（300ms） | ✅ 合理 | P3 |
| L2880, L2915 | `setTimeout` | flushPendingChanges延迟 | ❌ 不良设计 | **P0** |

### 2. EventHistoryService.ts (3处)

| 位置 | 类型 | 用途 | 状态 | 优先级 |
|------|------|------|------|--------|
| L48 | `setInterval` | 去重缓存清理（10秒） | ⚠️ 需要清理函数 | P1 |
| L118 | `setTimeout` | 延迟执行初始清理（2秒） | ⚠️ 可优化 | P2 |
| L952 | `setInterval` | 定期清理历史（1小时） | ⚠️ 需要清理函数 | P1 |

---

## 🚨 严重问题 (P0)

### 问题1: flushPendingChanges 硬编码延迟 ❌

**位置**: PlanManager.tsx L2880, L2915

**代码**:
```typescript
// ❌ 不良设计
setTimeout(() => editorApi.flushPendingChanges(), 100);
```

**问题**:
1. **竞态条件**: 100ms延迟可能导致数据丢失
   - 用户快速连续操作时，前一个100ms还没完成
   - 新操作又触发新的100ms，旧数据可能被覆盖

2. **不可靠**: 无法保证操作顺序
   - 插入Emoji → 100ms后保存
   - 用户立即编辑 → 触发onChange → 300ms后保存
   - **结果**: Emoji可能在用户编辑后才保存，导致覆盖

3. **内存泄漏风险**: 组件卸载时定时器可能未清理

**推荐方案**:

```typescript
// ✅ 方案1: 立即同步调用
const success = insertEmoji(editor, emoji);
if (success) {
  console.log(`[✅ Emoji 插入成功] ${emoji}`);
  editorApi.flushPendingChanges(); // 🔥 立即保存，不延迟
}

// ✅ 方案2: 使用 queueMicrotask（比setTimeout更可靠）
const success = insertEmoji(editor, emoji);
if (success) {
  console.log(`[✅ Emoji 插入成功] ${emoji}`);
  queueMicrotask(() => {
    editorApi.flushPendingChanges();
  });
}

// ✅ 方案3: 返回 Promise 等待完成
const success = await insertEmojiAsync(editor, emoji);
if (success) {
  await editorApi.flushPendingChanges();
}
```

**影响范围**:
- Emoji插入 (L2880)
- DateMention插入 (L2915)

---

## ⚠️ 需要清理的定时器 (P1)

### 问题2: setInterval 缺少清理函数

**位置1**: PlanManager.tsx L1315 - 清理空行

**代码**:
```typescript
// ⚠️ 缺少清理
useEffect(() => {
  const cleanupTimer = setInterval(() => {
    // ... 清理逻辑
  }, 60000); // 1分钟
  
  // ❌ 忘记返回清理函数
}, []);
```

**修复**:
```typescript
useEffect(() => {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    setPendingEmptyItems(prev => {
      // ... 清理逻辑
    });
  }, 60000);
  
  // ✅ 添加清理函数
  return () => {
    clearInterval(cleanupTimer);
    console.log('[Cleanup] 已清理空行定时器');
  };
}, []);
```

**位置2**: EventHistoryService.ts L48 - 去重缓存清理

**代码**:
```typescript
// ⚠️ 全局作用域，无法清理
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentCallsCache.entries()) {
    if (now - timestamp > 5000) {
      recentCallsCache.delete(key);
    }
  }
}, 10000);
```

**修复**:
```typescript
// 存储 interval ID
let cleanupIntervalId: NodeJS.Timeout | null = null;

export class EventHistoryService {
  static initialize(sm: StorageManager): Promise<void> {
    // ... 初始化逻辑
    
    // 启动去重缓存清理
    if (!cleanupIntervalId) {
      cleanupIntervalId = setInterval(() => {
        const now = Date.now();
        for (const [key, timestamp] of recentCallsCache.entries()) {
          if (now - timestamp > 5000) {
            recentCallsCache.delete(key);
          }
        }
      }, 10000);
    }
  }
  
  // ✅ 添加清理方法
  static cleanup(): void {
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = null;
      historyLogger.log('✅ 已清理去重缓存定时器');
    }
  }
}
```

**位置3**: EventHistoryService.ts L952 - 定期清理历史

**代码**:
```typescript
// ⚠️ 无法停止的定时器
static startPeriodicCleanup(): void {
  const interval = 60 * 60 * 1000; // 每小时

  setInterval(async () => {
    const deleted = await this.autoCleanup();
    if (deleted > 0) {
      historyLogger.log(`🧹 定期清理: 删除 ${deleted} 条记录`);
    }
  }, interval);
}
```

**修复**:
```typescript
// 存储 interval ID
private static periodicCleanupIntervalId: NodeJS.Timeout | null = null;

static startPeriodicCleanup(): void {
  // 防止重复启动
  if (this.periodicCleanupIntervalId) {
    historyLogger.warn('⚠️ 定期清理已在运行');
    return;
  }
  
  const interval = 60 * 60 * 1000; // 每小时

  this.periodicCleanupIntervalId = setInterval(async () => {
    const deleted = await this.autoCleanup();
    if (deleted > 0) {
      historyLogger.log(`🧹 定期清理: 删除 ${deleted} 条记录`);
    }
  }, interval);

  historyLogger.log('✅ 已启动定期清理任务（每小时）');
}

// ✅ 添加停止方法
static stopPeriodicCleanup(): void {
  if (this.periodicCleanupIntervalId) {
    clearInterval(this.periodicCleanupIntervalId);
    this.periodicCleanupIntervalId = null;
    historyLogger.log('✅ 已停止定期清理任务');
  }
}
```

---

## 🔍 可优化的设计 (P2)

### 问题3: 初始清理延迟

**位置**: EventHistoryService.ts L118

**代码**:
```typescript
// ⚠️ 硬编码2秒延迟
setTimeout(async () => {
  try {
    const deleted = await this.autoCleanup();
    if (deleted > 0) {
      historyLogger.log(`🧹 初始清理: 删除 ${deleted} 条记录`);
    }
  } catch (error) {
    historyLogger.error('❌ 初始清理失败:', error);
  }
}, 2000); // 延迟2秒执行
```

**问题**:
- 硬编码延迟不够灵活
- 无法取消（组件可能在2秒内卸载）
- 没有错误恢复机制

**推荐方案**:

```typescript
// ✅ 方案1: 使用 queueMicrotask（微任务队列）
static async initialize(sm: StorageManager): Promise<void> {
  storageManager = sm;
  historyLogger.log('✅ EventHistoryService 已初始化');
  
  await this.migrateFromLocalStorage();
  this.startPeriodicCleanup();
  
  // 🔥 微任务队列，不阻塞UI
  queueMicrotask(async () => {
    try {
      const deleted = await this.autoCleanup();
      if (deleted > 0) {
        historyLogger.log(`🧹 初始清理: 删除 ${deleted} 条记录`);
      }
    } catch (error) {
      historyLogger.error('❌ 初始清理失败:', error);
    }
  });
}

// ✅ 方案2: 使用 requestIdleCallback（空闲时执行）
static async initialize(sm: StorageManager): Promise<void> {
  // ... 初始化逻辑
  
  if ('requestIdleCallback' in window) {
    requestIdleCallback(async () => {
      const deleted = await this.autoCleanup();
      if (deleted > 0) {
        historyLogger.log(`🧹 初始清理: 删除 ${deleted} 条记录`);
      }
    }, { timeout: 5000 }); // 最多延迟5秒
  } else {
    // Fallback: queueMicrotask
    queueMicrotask(async () => {
      const deleted = await this.autoCleanup();
    });
  }
}
```

---

## ✅ 合理的定时器使用 (P3)

### 1. 悬浮卡片延迟 (PlanManager L117, L128, L147)

**代码**:
```typescript
const handleMouseEnter = () => {
  if (hoverTimerRef.current !== null) {
    window.clearTimeout(hoverTimerRef.current);
  }
  
  hoverTimerRef.current = window.setTimeout(() => {
    setShowHoverCard(true);
  }, 500);
};
```

**评估**: ✅ 合理
- 有清理逻辑 (useEffect cleanup)
- 防止多次触发
- 符合UI交互规范（500ms延迟显示）

### 2. onChange防抖 (PlanManager L1435)

**代码**:
```typescript
const debouncedOnChange = useCallback((updatedItems: any) => {
  if (onChangeTimerRef.current !== null) {
    clearTimeout(onChangeTimerRef.current);
  }
  
  pendingUpdatedItemsRef.current = updatedItems;
  
  onChangeTimerRef.current = setTimeout(() => {
    const itemsToProcess = pendingUpdatedItemsRef.current;
    if (!itemsToProcess) return;
    
    executeBatchUpdate(itemsToProcess);
    
    pendingUpdatedItemsRef.current = null;
    onChangeTimerRef.current = null;
  }, 300);
}, [executeBatchUpdate]);
```

**评估**: ✅ 合理
- 标准的防抖模式
- 有清理逻辑
- 300ms延迟合理（性能优化）

**建议**: 添加 useEffect cleanup

```typescript
// ✅ 添加清理函数
useEffect(() => {
  return () => {
    if (onChangeTimerRef.current) {
      clearTimeout(onChangeTimerRef.current);
      onChangeTimerRef.current = null;
    }
  };
}, []);
```

---

## 📋 修复清单

### 立即修复 (P0)

- [ ] **L2880**: 移除 `setTimeout(() => flushPendingChanges(), 100)`，改为立即调用
- [ ] **L2915**: 移除 `setTimeout(() => flushPendingChanges(), 100)`，改为立即调用

### 高优先级 (P1)

- [ ] **PlanManager L1315**: 添加 `clearInterval` 清理函数
- [ ] **EventHistoryService L48**: 重构为可清理的定时器
- [ ] **EventHistoryService L952**: 添加 `stopPeriodicCleanup()` 方法

### 中优先级 (P2)

- [ ] **EventHistoryService L118**: 改用 `queueMicrotask` 或 `requestIdleCallback`

### 低优先级 (P3)

- [ ] **PlanManager L1435**: 添加 useEffect cleanup（防御性编程）

---

## 🎯 推荐的最佳实践

### 1. 使用 queueMicrotask 替代 setTimeout(fn, 0)

```typescript
// ❌ 不推荐
setTimeout(() => doSomething(), 0);

// ✅ 推荐
queueMicrotask(() => doSomething());
```

### 2. 始终清理定时器

```typescript
// ✅ 模式1: useEffect cleanup
useEffect(() => {
  const timerId = setInterval(() => {
    // ...
  }, 1000);
  
  return () => {
    clearInterval(timerId);
  };
}, []);

// ✅ 模式2: 类方法
class MyService {
  private timerId: NodeJS.Timeout | null = null;
  
  start() {
    this.timerId = setInterval(() => {
      // ...
    }, 1000);
  }
  
  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
```

### 3. 避免硬编码延迟

```typescript
// ❌ 不推荐
setTimeout(() => save(), 100); // 为什么是100ms？

// ✅ 推荐
const SAVE_DEBOUNCE_MS = 300; // 常量，可配置
setTimeout(() => save(), SAVE_DEBOUNCE_MS);
```

### 4. 使用 requestIdleCallback 处理低优先级任务

```typescript
// ✅ 推荐
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => {
    // 低优先级清理任务
    cleanupOldData();
  }, { timeout: 5000 });
} else {
  queueMicrotask(() => cleanupOldData());
}
```

---

## 📊 修复优先级总结

```
P0 (立即修复): 2处
  - flushPendingChanges 硬编码延迟 × 2

P1 (本周修复): 3处
  - setInterval 缺少清理 × 3

P2 (下周优化): 1处
  - setTimeout 延迟初始化 × 1

P3 (防御性编程): 1处
  - onChange防抖添加cleanup × 1

总计: 7处定时器使用，需要修复6处
```

---

**审计完成时间**: 2025-12-23  
**下一步**: 创建修复PR，按优先级逐个修复
