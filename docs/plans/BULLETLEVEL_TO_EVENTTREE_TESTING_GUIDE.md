# BulletLevel → EventTree 功能测试指南

## 🎯 测试目标

验证 Tab/Shift+Tab 键创建真实的 EventTree 父子关系，并确保乐观更新和增量渲染正常工作。

---

## ✅ 测试前准备

### 1. 启动应用
```bash
# 终端 1: 启动前端开发服务器
npm run dev

# 终端 2: 启动 Electron（如果使用）
cd electron
npm run dev
```

### 2. 打开 Plan 页面
- 访问 `http://localhost:3000` 或启动 Electron 应用
- 进入 **Plan** 页面
- 打开浏览器开发者工具（F12）查看控制台日志

---

## 🧪 测试用例

### 测试 1: Tab 键创建父子关系

#### 步骤
1. 在 Plan 页面创建两个事件：
   - 事件 A: "项目规划"
   - 事件 B: "需求分析"

2. 将光标定位到事件 B 的标题行

3. 按下 **Tab 键**

#### 预期结果
✅ **立即响应（< 1ms）**
- 事件 B 立即向右缩进（视觉上移动）
- 无延迟、无卡顿

✅ **控制台日志**
```
[Tab] 🎯 Creating parent-child relationship: {
  child: "xxx",
  parent: "yyy",
  oldLevel: 0,
  newLevel: 1
}
[Tab] ⚡ Optimistic update complete (< 1ms)
[Tab] 📡 Persisted to database: { child: "xxx", parent: "yyy" }
[PlanManager] ⏭️ Skip own update (optimistic update already applied)
[PlanSlate] ⏭️ 跳过 本组件相关的更新（已乐观更新）
```

✅ **数据验证**
- 打开浏览器控制台，运行：
  ```javascript
  const EventService = window.EventService || require('./src/services/EventService').EventService;
  const eventB = await EventService.getEventById('事件B的ID');
  console.log('parentEventId:', eventB.parentEventId); // 应该等于事件A的ID
  
  const eventA = await EventService.getEventById('事件A的ID');
  console.log('childEventIds:', eventA.childEventIds); // 应该包含事件B的ID
  ```

✅ **刷新后验证**
- 刷新页面（F5）
- 事件 B 仍然保持缩进状态
- 层级关系保持不变

---

### 测试 2: Shift+Tab 键解除父子关系

#### 步骤
1. 使用测试 1 创建的层级结构（B 是 A 的子事件）

2. 将光标定位到事件 B 的标题行

3. 按下 **Shift+Tab 键**

#### 预期结果
✅ **立即响应**
- 事件 B 立即向左移动，回到根层级
- 无延迟

✅ **控制台日志**
```
[Shift+Tab] 🎯 Decreasing level: {
  eventId: "xxx",
  oldLevel: 1,
  newLevel: 0
}
[Shift+Tab] ⚡ Optimistic update complete
[Shift+Tab] 🔍 New parent: { newParentEventId: "ROOT", newLevel: 0 }
[Shift+Tab] 📡 Persisted: { child: "xxx", newParent: "ROOT" }
```

✅ **数据验证**
```javascript
const eventB = await EventService.getEventById('事件B的ID');
console.log('parentEventId:', eventB.parentEventId); // 应该是 undefined
```

---

### 测试 3: 多级缩进

#### 步骤
1. 创建事件 A, B, C, D

2. B 按 Tab → B 成为 A 的子事件（level 1）

3. C 按 Tab → C 成为 B 的子事件（level 2）

4. D 按 Tab → D 成为 C 的子事件（level 3）

#### 预期结果
✅ **视觉效果**
```
A (level 0)
  B (level 1)
    C (level 2)
      D (level 3)
```

✅ **数据关系**
```javascript
// A 的子事件
const eventA = await EventService.getEventById('A');
console.log(eventA.childEventIds); // [B.id]

// B 的父子关系
const eventB = await EventService.getEventById('B');
console.log(eventB.parentEventId); // A.id
console.log(eventB.childEventIds); // [C.id]

// C 的父子关系
const eventC = await EventService.getEventById('C');
console.log(eventC.parentEventId); // B.id
console.log(eventC.childEventIds); // [D.id]

// D 的父事件
const eventD = await EventService.getEventById('D');
console.log(eventD.parentEventId); // C.id
```

✅ **刷新后验证**
- 刷新页面
- 层级结构完整保留
- 所有缩进正确显示

---

### 测试 4: 增量渲染验证

#### 步骤
1. 创建 10 个事件（A1 - A10）

2. 对 A2 按 Tab（成为 A1 的子事件）

3. 观察控制台日志

#### 预期结果
✅ **PlanManager 只更新受影响的事件**
```
[PlanManager] 🎯 Incremental update: xxx
[PlanManager] 📊 Affected events: {
  count: 2,  // 只有 A1 和 A2
  ids: ["A1 ID", "A2 ID"]
}
[PlanManager] 📊 Calculated bulletLevels: {
  "A1 ID": 0,
  "A2 ID": 1
}
[PlanManager] ✅ Incremental update complete: {
  updatedEvents: 2  // 不是 10！
}
```

✅ **无全量刷新**
- 没有 `getAllEvents()` 调用（除了初始化）
- 没有全量 `setItems(allEvents)` 操作
- 只更新受影响的 2 个事件

---

### 测试 5: 性能测试

#### 步骤
1. 创建 100 个事件

2. 使用浏览器 Performance 工具：
   - 打开 DevTools → Performance 标签
   - 点击 Record
   - 按 Tab 键
   - 停止 Recording

3. 分析时间线

#### 预期结果
✅ **用户感知延迟**
- Tab 键响应时间 < 1ms
- 视觉更新立即发生
- 无明显卡顿

✅ **后台持久化**
- `EventService.updateEvent()` 在 10-50ms 内完成
- 不阻塞 UI 线程
- 异步执行

✅ **增量更新开销**
- PlanManager 只处理 2-3 个事件（当前、父、子）
- 不重新渲染整个列表
- React 只 diff 受影响的节点

---

### 测试 6: 错误回滚

#### 步骤
1. 断开网络（模拟持久化失败）：
   - DevTools → Network → Offline

2. 按 Tab 键

3. 观察行为

#### 预期结果
✅ **乐观更新仍然生效**
- 事件立即缩进（视觉反馈）

⚠️ **持久化失败**
```
[Tab] ❌ Failed to persist: [网络错误]
[Tab] 🔄 Rollback optimistic update due to persistence failure
```

✅ **自动回滚**
- 事件缩进被撤销
- 回到原始层级
- 用户看到撤销动画

---

### 测试 7: 循环防护验证

#### 步骤
1. 打开两个浏览器标签页，都打开 Plan 页面

2. 在标签页 1 按 Tab 键

3. 观察标签页 2 的控制台日志

#### 预期结果
✅ **标签页 1（发起方）**
```
[Tab] ⚡ Optimistic update complete
[Tab] 📡 Persisted to database
[PlanManager] ⏭️ Skip own update (optimistic update already applied)
[PlanSlate] ⏭️ 跳过 本组件相关的更新
```

✅ **标签页 2（接收方）**
```
[PlanManager] 📡 External update received
[PlanManager] 🎯 Incremental update
[PlanManager] ✅ Incremental update complete
```

✅ **结果验证**
- 两个标签页的事件层级一致
- 没有无限循环更新
- 没有重复渲染

---

## 🔍 调试工具

### 1. EventService 调试方法

在浏览器控制台运行：

```javascript
// 查看事件详情
const event = await EventService.getEventById('事件ID');
console.log('Event details:', {
  id: event.id,
  title: event.title.simpleTitle,
  parentEventId: event.parentEventId,
  childEventIds: event.childEventIds,
  isPlan: event.isPlan
});

// 计算所有事件的 bulletLevel
const allEvents = await EventService.getAllEvents();
const levels = EventService.calculateAllBulletLevels(allEvents);
console.log('BulletLevels:', Object.fromEntries(levels));

// 检查本地更新状态
console.log('Is local update?', EventService.isLocalUpdate('事件ID', updateId));
```

### 2. 实时监听更新

```javascript
// 监听所有 eventsUpdated 事件
window.addEventListener('eventsUpdated', (e) => {
  console.log('📡 eventsUpdated:', e.detail);
});
```

### 3. 查看 Slate Editor 状态

在 PlanSlate 组件中：
```javascript
// 在 handleTabKey 中添加断点
// 查看 editor.children 的结构
console.log('Editor children:', editor.children);
```

---

## ❌ 常见问题排查

### 问题 1: Tab 键无响应

**可能原因**
- 光标不在 EventLine 标题行
- 上一行不是 EventLine（无法找到父事件）

**解决方法**
- 确认光标位置
- 查看控制台警告日志
- 检查 `findPreviousEventLine()` 返回值

### 问题 2: 刷新后层级丢失

**可能原因**
- `parentEventId` 没有正确保存
- EventService.updateEvent() 失败

**解决方法**
```javascript
// 检查数据库中的 parentEventId
const event = await EventService.getEventById('事件ID');
console.log('Saved parentEventId:', event.parentEventId);

// 检查 StorageManager 日志
// 应该看到 "Event updated: xxx"
```

### 问题 3: 无限循环更新

**可能原因**
- 循环防护失效
- originComponent 没有正确传递

**解决方法**
- 检查 eventsUpdated 事件的 detail 字段
- 验证 `isLocalUpdate` 和 `originComponent` 值
- 查看 PlanSlate 和 PlanManager 的跳过日志

### 问题 4: 性能卡顿

**可能原因**
- 全量刷新而非增量更新
- 没有跳过自己的更新

**解决方法**
- 使用 React DevTools Profiler 查看渲染次数
- 验证 `incrementalUpdateEvent()` 只更新受影响的事件
- 确认没有 `getAllEvents()` 调用（除了初始化）

---

## 📊 性能基准

| 指标 | 目标值 | 实际值 |
|------|--------|--------|
| Tab 键响应延迟 | < 1ms | ___ms |
| 异步持久化时间 | 10-50ms | ___ms |
| 增量更新事件数 | 2-3 个 | ___ 个 |
| 刷新后层级保留 | 100% | ___% |
| 循环更新防护 | 有效 | ___ |

---

## ✅ 测试清单

- [ ] 测试 1: Tab 键创建父子关系
- [ ] 测试 2: Shift+Tab 键解除父子关系
- [ ] 测试 3: 多级缩进
- [ ] 测试 4: 增量渲染验证
- [ ] 测试 5: 性能测试
- [ ] 测试 6: 错误回滚
- [ ] 测试 7: 循环防护验证

---

## 🎉 完成标准

所有测试用例通过后，功能开发完成！

**下一步**：
- 用户验收测试
- 性能优化（如需要）
- 文档更新
- 代码 Review

---

**创建时间**: 2025-12-03  
**测试人**: ___  
**状态**: 待测试
