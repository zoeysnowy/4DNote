# setTimeout/setInterval 不良设计清理任务

**创建日期**: 2025-12-23  
**优先级**: P1 (高优先级)  
**负责人**: GitHub Copilot  
**状态**: 🔴 待处理  

---

## 📋 问题概述

代码库中存在多处不合理的 `setTimeout` 和 `setInterval` 使用，导致以下问题：
- 🔴 不必要的轮询浪费 CPU 资源
- 🔴 延迟清理逻辑缺乏明确的业务依据
- 🔴 高频 DOM 操作影响性能
- 🟡 部分定时任务可以改为事件驱动

---

## 🔴 高优先级问题（需要立即优化）

### 1. TimeCalendar - Timer 状态轮询

**文件**: `src/features/Calendar/TimeCalendar.tsx`  
**行号**: Line 252  
**严重程度**: 🔴 高

#### 当前实现
```typescript
// ❌ 问题：每 2 秒轮询 localStorage 检查 Timer 状态
const interval = setInterval(checkTimer, 2000);
```

#### 问题分析
- 非常低效的跨窗口通信方式
- 即使 Timer 状态无变化，也会每 2 秒执行一次
- 导致不必要的 CPU 占用和 localStorage 读取
- 主窗口和桌面挂件同时轮询，造成资源浪费

#### 优化方案
**方案 A：使用 BroadcastChannel（推荐）**
```typescript
// ✅ 改进方案
const timerChannel = new BroadcastChannel('4dnote-timer-channel');

// 发送方（Timer 状态变化时）
timerChannel.postMessage({
  type: 'timer-update',
  timer: globalTimer
});

// 接收方
timerChannel.onmessage = (event) => {
  if (event.data.type === 'timer-update') {
    setGlobalTimer(event.data.timer);
  }
};
```

**方案 B：优化 storage 事件监听**
```typescript
// ✅ 已有 storage 事件监听，完全移除轮询
useEffect(() => {
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === '4dnote-global-timer') {
      // 处理 Timer 变化
    }
  };
  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);
```

**预期收益**：
- ✅ 减少 99% 的 localStorage 读取次数
- ✅ 降低 CPU 占用
- ✅ 实时响应 Timer 变化（无 2 秒延迟）

---

### 2. TimeCalendar - 样式清理轮询

**文件**: `src/features/Calendar/TimeCalendar.tsx`  
**行号**: Line 1153  
**严重程度**: 🔴 高

#### 当前实现
```typescript
// ❌ 问题：每 500ms 清理一次内联样式
const intervalId = setInterval(removeInlineBackgroundColor, 500);
```

#### 问题分析
- 高频执行 DOM 查询和修改（每秒 2 次）
- 即使 DOM 没有变化也会执行
- 注释说"比 MutationObserver 更高效"，但实际上不是

#### 优化方案
```typescript
// ✅ 使用 MutationObserver 监听 DOM 变化
const observer = new MutationObserver((mutations) => {
  let needsCleanup = false;
  
  mutations.forEach(mutation => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
      needsCleanup = true;
    }
  });
  
  if (needsCleanup) {
    removeInlineBackgroundColor();
  }
});

observer.observe(calendarContainer, { 
  attributes: true, 
  subtree: true,
  attributeFilter: ['style']
});

// 清理
return () => observer.disconnect();
```

**预期收益**：
- ✅ 只在样式实际变化时执行清理
- ✅ 减少 95%+ 的不必要 DOM 操作
- ✅ 降低内存和 CPU 占用

---

### 3. EventService - 不必要的延迟清理

**文件**: `src/services/EventService.ts`  
**行号**: Line 807, Line 1424  
**严重程度**: 🔴 中高

#### 当前实现
```typescript
// ❌ 问题：使用固定 3 秒延迟清理 pendingLocalUpdates
setTimeout(() => pendingLocalUpdates.delete(finalEvent.id), 3000);
```

#### 问题分析
- 3 秒是经验值，没有明确的业务逻辑支撑
- 如果同步在 1 秒内完成，仍会等待 3 秒
- 如果同步超过 3 秒，可能导致过早清理

#### 优化方案
**方案 A：事件驱动清理**
```typescript
// ✅ 在同步完成时立即清理
class EventService {
  private setupSyncCompletionListener() {
    window.addEventListener('sync-completed', ((event: CustomEvent) => {
      const { eventIds } = event.detail;
      eventIds.forEach(id => pendingLocalUpdates.delete(id));
    }) as EventListener);
  }
}
```

**方案 B：与同步周期对齐**
```typescript
// ✅ 使用 ActionBasedSyncManager 的同步间隔
const SYNC_INTERVAL = 20000; // 与 ActionBasedSyncManager 一致
setTimeout(() => pendingLocalUpdates.delete(finalEvent.id), SYNC_INTERVAL);
```

**预期收益**：
- ✅ 更精确的清理时机
- ✅ 避免内存泄漏或过早清理

---

### 4. ActionBasedSyncManager - 视图变化防抖缺少明确延迟

**文件**: `src/services/ActionBasedSyncManager.ts`  
**行号**: Line 150  
**严重程度**: 🟡 中

#### 当前实现
```typescript
// ❌ 问题：没有明确的延迟时间
this.viewChangeTimeout = setTimeout(async () => {
  // 触发同步
}, ???);  // 延迟时间未显示
```

#### 问题分析
- 代码中看不到具体的防抖延迟时间
- 可能是 0 或未定义，导致无法起到防抖作用

#### 优化方案
```typescript
// ✅ 明确防抖延迟
const VIEW_CHANGE_DEBOUNCE = 300; // 300ms 防抖

this.viewChangeTimeout = setTimeout(async () => {
  if (this.isRunning && !this.syncInProgress) {
    // 触发同步
  }
}, VIEW_CHANGE_DEBOUNCE);
```

---

## 🟡 中优先级问题（建议优化）

### 5. PlanManager - 空行清理轮询

**文件**: `src/components/PlanManager.tsx`  
**行号**: Line 1315  
**严重程度**: 🟡 中

#### 当前实现
```typescript
// 🟡 每个 setInterval 都会持续检查所有空行
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  setPendingEmptyItems(prev => {
    // 遍历所有空行，检查是否超过 5 分钟
    for (const [id, item] of prev.entries()) {
      const createdTime = new Date(item.createdAt || 0).getTime();
      const isOld = now - createdTime > 5 * 60 * 1000;
      if (isEmpty && isOld) {
        next.delete(id);
      }
    }
  });
}, ???); // 间隔时间未明确
```

#### 问题分析
- 全局轮询所有空行，效率低
- 即使只有 1 个空行，也会轮询整个 Map
- 间隔时间不明确

#### 优化方案
```typescript
// ✅ 创建空行时，直接设置单次延迟清理
const createEmptyItem = (item: Event) => {
  setPendingEmptyItems(prev => new Map(prev).set(item.id, item));
  
  // 5 分钟后自动清理（仅针对这个空行）
  setTimeout(() => {
    setPendingEmptyItems(prev => {
      const current = prev.get(item.id);
      if (current && isEmptyEvent(current)) {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      }
      return prev;
    });
  }, 5 * 60 * 1000);
};
```

**预期收益**：
- ✅ 避免全局轮询
- ✅ 每个空行独立管理生命周期
- ✅ 更精确的清理时机

---

### 6. App.tsx - Timer 定期保存

**文件**: `src/App.tsx`  
**行号**: Line 1324  
**严重程度**: 🟡 中低

#### 当前实现
```typescript
// 🟡 每 30 秒保存一次 Timer
const saveInterval = setInterval(saveTimerEvent, 30000);
```

#### 问题分析
- 如果 Timer 状态没有变化，仍会每 30 秒保存
- 已有 `beforeunload` 事件保存，定期保存可能是冗余的

#### 优化方案
**方案 A：减少保存频率**
```typescript
// ✅ 延长到 5 分钟（降低 I/O 频率）
const saveInterval = setInterval(saveTimerEvent, 5 * 60 * 1000);
```

**方案 B：状态变化触发保存**
```typescript
// ✅ 只在 Timer 状态变化时保存
useEffect(() => {
  if (globalTimer?.isRunning !== prevIsRunning || 
      globalTimer?.isPaused !== prevIsPaused) {
    saveTimerEvent();
  }
}, [globalTimer?.isRunning, globalTimer?.isPaused]);
```

**方案 C：使用 visibilitychange 事件**
```typescript
// ✅ 页面失焦时保存，避免定期保存
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden && globalTimer?.isRunning) {
      saveTimerEvent();
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [globalTimer]);
```

---

### 7. ActionBasedSyncManager - 完整性检查轮询

**文件**: `src/services/ActionBasedSyncManager.ts`  
**行号**: Line 5393  
**严重程度**: 🟡 低

#### 当前实现
```typescript
// 🟡 每 30 秒检查一次完整性
this.indexIntegrityCheckInterval = setInterval(() => {
  this.tryIncrementalIntegrityCheck();
}, 30000);
```

#### 问题分析
- 已经从 5 秒优化到 30 秒，但仍是轮询
- 完整性检查是低优先级任务，不需要定期执行

#### 优化方案
**方案 A：使用 requestIdleCallback**
```typescript
// ✅ 只在浏览器空闲时检查
private scheduleIntegrityCheck() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      this.tryIncrementalIntegrityCheck();
      // 下次检查在空闲时执行
      this.scheduleIntegrityCheck();
    }, { timeout: 60000 }); // 最多 60 秒后强制执行
  } else {
    // 降级方案：30 秒轮询
    setTimeout(() => {
      this.tryIncrementalIntegrityCheck();
      this.scheduleIntegrityCheck();
    }, 30000);
  }
}
```

**方案 B：同步完成后检查**
```typescript
// ✅ 在同步完成后检查一次
private async performSync() {
  // ... 同步逻辑 ...
  
  // 同步完成后检查完整性
  if (!this.syncInProgress) {
    this.tryIncrementalIntegrityCheck();
  }
}
```

---

### 8. EventHistoryService - 定期清理

**文件**: `src/services/EventHistoryService.ts`  
**行号**: Line 988  
**严重程度**: 🟢 低（已合理，可微调）

#### 当前实现
```typescript
// 🟢 每小时清理一次历史记录
this.periodicCleanupIntervalId = setInterval(async () => {
  const deleted = await this.autoCleanup();
  if (deleted > 0) {
    historyLogger.log(`🧹 定期清理: 删除 ${deleted} 条记录`);
  }
}, 60 * 60 * 1000);
```

#### 优化建议（可选）
```typescript
// ✅ 延迟首次执行，避免启动时清理
setTimeout(() => {
  this.periodicCleanupIntervalId = setInterval(async () => {
    // 使用 requestIdleCallback 延迟到空闲时
    if ('requestIdleCallback' in window) {
      requestIdleCallback(async () => {
        const deleted = await this.autoCleanup();
        if (deleted > 0) {
          historyLogger.log(`🧹 定期清理: 删除 ${deleted} 条记录`);
        }
      });
    } else {
      const deleted = await this.autoCleanup();
      if (deleted > 0) {
        historyLogger.log(`🧹 定期清理: 删除 ${deleted} 条记录`);
      }
    }
  }, 60 * 60 * 1000);
}, 5 * 60 * 1000); // 启动后 5 分钟才开始首次清理
```

---

## 🟢 合理使用（无需优化）

### 1. EventEditModalV2 - Timer 倒计时显示
**文件**: `src/components/EventEditModal/EventEditModalV2.tsx` (Line 1879)
```typescript
// ✅ 合理：显示 Timer 倒计时需要每秒更新 UI
const interval = setInterval(() => {
  setCurrentTime(Date.now());
}, 1000);
```

### 2. HomePage 统计卡片刷新
**文件**: `src/pages/HomePage/TodayStatsCard.tsx` (Line 108)
```typescript
// ✅ 合理：统计数据定期刷新
const interval = setInterval(loadStats, 60000); // 每分钟
```

**文件**: `src/pages/HomePage/FocusScoreCard.tsx` (Line 133)
```typescript
// ✅ 合理：专注度数据每 5 分钟刷新
const interval = setInterval(loadFocusData, 300000);
```

### 3. DesktopCalendarWidget - 认证检查
**文件**: `src/pages/DesktopCalendarWidget.tsx` (Line 324)
```typescript
// ✅ 合理：定期检查认证状态，避免 token 过期
const authCheckInterval = setInterval(checkAuthAndInitSync, 30000);
```

### 4. RAGDemo/AIDemoV2 - 代理健康检查
**文件**: `src/components/RAGDemo.tsx` (Line 150)
```typescript
// ✅ 合理：检查 AI 代理服务状态
const interval = setInterval(checkProxyHealth, 10000);
```

---

## 📊 优化优先级总结

| 优先级 | 问题 | 文件 | 预期收益 |
|--------|------|------|----------|
| 🔴 P0 | Timer 状态轮询 | TimeCalendar.tsx:252 | 减少 99% CPU 占用 |
| 🔴 P0 | 样式清理轮询 | TimeCalendar.tsx:1153 | 减少 95% DOM 操作 |
| 🔴 P1 | 延迟清理逻辑 | EventService.ts:807 | 更精确的内存管理 |
| 🟡 P2 | 视图变化防抖 | ActionBasedSyncManager.ts:150 | 代码可维护性 |
| 🟡 P2 | 空行清理轮询 | PlanManager.tsx:1315 | 避免全局轮询 |
| 🟡 P3 | Timer 定期保存 | App.tsx:1324 | 减少 I/O 频率 |
| 🟡 P3 | 完整性检查轮询 | ActionBasedSyncManager.ts:5393 | 利用浏览器空闲时间 |
| 🟢 P4 | 历史清理优化 | EventHistoryService.ts:988 | 微小性能提升 |

---

## ✅ 实施计划

### 第一阶段（本周）- 高优先级
- [ ] 修复 TimeCalendar Timer 轮询（改用 BroadcastChannel）
- [ ] 修复 TimeCalendar 样式清理（改用 MutationObserver）
- [ ] 修复 EventService 延迟清理（改为事件驱动）

### 第二阶段（本月）- 中优先级
- [ ] 优化 PlanManager 空行清理（单次延迟执行）
- [ ] 优化 ActionBasedSyncManager 完整性检查（requestIdleCallback）
- [ ] 优化 App.tsx Timer 保存（减少频率或状态触发）

### 第三阶段（下月）- 长期优化
- [ ] 为所有 setTimeout/setInterval 添加清晰的注释（说明延迟时间和原因）
- [ ] 创建统一的 `useInterval` Hook（参考 tui.calendar 实现）
- [ ] 建立 setTimeout/setInterval 使用规范文档

---

## 📝 备注

- 所有优化需要充分测试，确保不影响现有功能
- 优先使用现代浏览器 API（BroadcastChannel、MutationObserver、requestIdleCallback）
- 提供降级方案以兼容旧浏览器
- 每次优化后需要测量性能改善（使用 Chrome DevTools Performance）

---

**最后更新**: 2025-12-23  
**待审核**: GitHub Copilot
