# Note Event Architecture v2.19

## 概述

本文档描述了 4DNote v2.19 中 Note 事件（无标题/时间的笔记）的完整架构，包括数据模型、同步机制和时间处理策略。

---

## 1. Note 事件定义

**Note 事件**是指**没有预设时间**的事件，用户可以自由记录想法、笔记等内容，而不需要指定具体的开始/结束时间。

### 1.1 特征

- **可选标题**：标题可以为空（显示为"无标题笔记"）
- **可选时间**：创建时不设置 `startTime/endTime`
- **时间显示**：在 TimeLog 上使用 `createdAt` 时间显示
- **isNote 标记**：用户可以手动标记重要笔记（类似书签功能）

### 1.2 与普通事件的区别

| 字段 | 普通事件 | Note 事件 |
|------|---------|----------|
| `startTime` | 用户设置 | `createdAt`（自动） |
| `endTime` | 用户设置 | `null` |
| `title` | 必填 | 可选 |
| `isNote` | `false` | 用户可标记 `true` |

---

## 2. 数据存储模型

### 2.1 本地存储（IndexedDB）

Note 事件在本地存储时，**永久保存**以下字段：

```typescript
{
  id: "evt-xxx",
  title: { simpleTitle: "" },  // 可以为空
  startTime: "2024-12-03 14:30:00",  // = createdAt（自动生成）
  endTime: null,                      // 永远为 null
  createdAt: "2024-12-03 14:30:00",
  updatedAt: "2024-12-03 14:30:00",
  description: "📝 笔记由 🔮 4DNote 创建于...",  // 包含虚拟时间标记
  calendarIds: ["outlook-calendar-id"],  // 如果需要同步
  isNote: false,  // 用户可手动设置为 true（重要笔记书签）
  _isVirtualTime: true  // 内部标记（不存储）
}
```

**关键设计**：
- `startTime = createdAt`（永久字段）：确保所有事件在 TimeLog 上都有时间显示
- `endTime = null`（永久字段）：明确标识为 note 事件，没有结束时间
- `_isVirtualTime`：内部标记，用于签名生成，**不存储到数据库**

### 2.2 签名标记

如果 note 事件需要同步（`calendarIds` 非空），则 `description` 会包含特殊签名：

```
📝 笔记由 🔮 4DNote 创建于 2024-12-03 14:30:00
```

这个签名的关键作用：
1. **标识虚拟时间**：告诉同步系统这是一个 note 事件
2. **往返检测**：Outlook → 4DNote 同步回来时，识别并保持 note 结构

---

## 3. Outlook 同步机制

### 3.1 本地 → Outlook（虚拟时间生成）

**问题**：Outlook Calendar API 要求所有事件必须有 `start` 和 `end` 时间。

**解决方案**：在同步**传输过程中**临时添加虚拟 `endTime`。

#### 3.1.1 检测逻辑（ActionBasedSyncManager）

```typescript
// 检测签名中是否包含"📝 笔记由"
const isNoteWithVirtualTime = description.includes('📝 笔记由');

if (isNoteWithVirtualTime && startTime && !endTime) {
  // 临时生成虚拟 endTime = startTime + 1小时
  const startDate = new Date(startTime);
  const virtualEndTime = new Date(startDate.getTime() + 60 * 60 * 1000);
  
  // 仅用于 Outlook API 调用，不修改本地数据
  outlookEvent.end = { 
    dateTime: formatDateTime(virtualEndTime), 
    timeZone: 'Asia/Shanghai' 
  };
}
```

#### 3.1.2 应用场景

虚拟时间生成应用于**所有同步路径**：

1. **CREATE**（新建事件同步到 Outlook）
   - 位置：`ActionBasedSyncManager.ts` Line ~2876
   - 触发：`action.type === 'create'`

2. **UPDATE → CREATE**（更新未同步事件，转为新建）
   - 位置：`ActionBasedSyncManager.ts` Line ~3188
   - 触发：`action.type === 'update'` 但 `!cleanExternalId`

3. **MIGRATE**（迁移事件到新日历）
   - 位置：`ActionBasedSyncManager.ts` Line ~3319
   - 触发：`needsCalendarMigration`

4. **RECREATE**（更新失败，重新创建）
   - 位置：`ActionBasedSyncManager.ts` Line ~3619
   - 触发：更新返回 404

5. **UPDATE**（更新已同步事件）
   - 位置：`ActionBasedSyncManager.ts` Line ~3557
   - 触发：`action.type === 'update'` 且 `cleanExternalId` 存在

### 3.2 Outlook → 本地（虚拟时间过滤）

**问题**：Outlook 返回的事件包含我们临时添加的虚拟 `endTime`，如果直接保存会污染本地数据。

**解决方案**：在 `createEventFromRemoteSync` 中检测签名，过滤掉虚拟字段。

#### 3.2.1 检测逻辑（EventService.ts）

```typescript
// Line ~5160-5230
const hasNoteMarker = cleanDescription.includes('📝 笔记由');

if (hasNoteMarker) {
  // 检查本地事件是否也是 note（startTime 存在但 endTime 为 null）
  const localEvent = await this.getEventById(localEventId);
  
  if (localEvent && localEvent.startTime && !localEvent.endTime) {
    console.log('[Sync] 检测到 note 事件，保留 startTime，移除虚拟 endTime');
    
    // 保留 startTime（= createdAt），移除 endTime
    delete remoteEvent.endTime;
  }
}
```

#### 3.2.2 保护机制

- **签名检测**：必须包含 `"📝 笔记由"` 标记
- **本地状态验证**：检查本地事件确实是 note（`startTime` 存在，`endTime` 为 `null`）
- **双重确认**：两个条件都满足，才移除 `endTime`

---

## 4. 数据流链路

### 4.1 创建 Note 事件

```
TimeLog.tsx (handleCreateNote)
  ↓ 传入：{ title: "", eventlog, calendarIds: [...] }
  
EventService.createEvent
  ↓ 调用：normalizeEvent
  
normalizeEvent
  ↓ 检测：!startTime && !endTime
  ↓ 生成：startTime = createdAt, endTime = null
  ↓ 标记：_isVirtualTime = true（如果有 calendarIds）
  ↓ 签名：description = "📝 笔记由..."
  
convertEventToStorageEvent
  ↓ 保持所有字段不变
  
StorageManager.createEvent
  ↓ 存储到 IndexedDB：{ startTime: createdAt, endTime: null }
```

### 4.2 同步到 Outlook

```
IndexedDB
  ↓ 读取：{ startTime: createdAt, endTime: null, description: "📝 笔记由..." }
  
ActionBasedSyncManager.processQueue
  ↓ 检测：description.includes('📝 笔记由')
  ↓ 判断：startTime 存在，endTime 为 null
  ↓ 生成：临时 endTime = startTime + 1小时
  
MicrosoftService.syncEventToCalendar
  ↓ 发送：{ start: createdAt, end: createdAt+1h, body: "📝 笔记由..." }
  
Outlook Calendar API
  ↓ 保存：包含虚拟时间的事件
```

### 4.3 Outlook 同步回本地

```
Outlook Calendar API
  ↓ 返回：{ start: createdAt, end: createdAt+1h, body: "📝 笔记由..." }
  
EventService.createEventFromRemoteSync
  ↓ 检测：description.includes('📝 笔记由')
  ↓ 查询：本地事件 { startTime: createdAt, endTime: null }
  ↓ 验证：本地确实是 note 事件
  ↓ 过滤：delete remoteEvent.endTime
  ↓ 保留：{ startTime: createdAt, endTime: null }
  
StorageManager.updateEvent
  ↓ 更新：保持本地 note 结构不变
```

---

## 5. 时间显示逻辑

### 5.1 TimeLog 显示

```typescript
// TimeLog.tsx
const displayTime = event.startTime || event.endTime || event.createdAt;
```

对于 note 事件：
- `event.startTime = event.createdAt`（非空）
- 直接使用 `startTime` 显示，逻辑统一

### 5.2 时间排序

```typescript
// TimeLog 使用 startTime 排序
events.sort((a, b) => {
  const timeA = a.startTime || a.createdAt;
  const timeB = b.startTime || b.createdAt;
  return timeA.localeCompare(timeB);
});
```

---

## 6. 关键代码位置

### 6.1 虚拟时间生成

**文件**：`src/services/EventService.ts`  
**函数**：`normalizeEvent`  
**位置**：Line ~3173-3192

```typescript
// 检测 note 事件：没有真实时间的事件
if (!event.startTime && !event.endTime) {
  const createdDate = new Date(finalCreatedAt);
  syncStartTime = formatTimeForStorage(createdDate);
  syncEndTime = null;  // ⚠️ endTime 保持为空，虚拟时间仅在同步时添加
  
  // 标记是否需要虚拟时间（用于同步标识）
  isVirtualTime = !!(event.calendarIds && event.calendarIds.length > 0);
}
```

### 6.2 签名生成

**文件**：`src/utils/SignatureUtils.ts`  
**函数**：`addSignature`  
**位置**：Line ~120-150

```typescript
if (isVirtualTime) {
  signaturePrefix = '📝 笔记由';
}
```

### 6.3 同步虚拟时间添加

**文件**：`src/services/ActionBasedSyncManager.ts`  
**函数**：`processQueue` (CREATE 分支)  
**位置**：Line ~2876-2920

```typescript
const isNoteWithVirtualTime = createDescription.includes('📝 笔记由');
if (isNoteWithVirtualTime && startDateTime && !endDateTime) {
  const startDate = new Date(startDateTime);
  endDateTime = formatTimeForStorage(new Date(startDate.getTime() + 60 * 60 * 1000));
}
```

**其他同步路径**：
- UPDATE → CREATE：Line ~3188
- MIGRATE：Line ~3319
- RECREATE：Line ~3619
- UPDATE：Line ~3557

### 6.4 虚拟时间过滤

**文件**：`src/services/EventService.ts`  
**函数**：`createEventFromRemoteSync`  
**位置**：Line ~5160-5230

```typescript
const hasNoteMarker = cleanDescription.includes('📝 笔记由');

if (hasNoteMarker) {
  const localEvent = await this.getEventById(localEventId);
  
  if (localEvent && localEvent.startTime && !localEvent.endTime) {
    delete remoteEvent.endTime;
  }
}
```

---

## 7. 测试场景

### 7.1 创建纯 note（无同步）

1. 在 TimeLog 插入笔记（不选择日历标签）
2. 验证：`startTime = createdAt, endTime = null`
3. 验证：签名不包含"📝 笔记由"

### 7.2 创建同步 note

1. 在 TimeLog 插入笔记，选择 Outlook 日历标签
2. 验证：`startTime = createdAt, endTime = null`
3. 验证：签名包含"📝 笔记由"
4. 验证：同步到 Outlook 后，事件有 `end` 时间
5. 验证：Outlook 返回后，本地仍然是 `endTime = null`

### 7.3 往返同步测试

1. 创建同步 note → 同步到 Outlook
2. 在 Outlook 修改标题 → 同步回 4DNote
3. 验证：本地事件保持 `startTime = createdAt, endTime = null`
4. 验证：标题更新成功

### 7.4 时间字段修改

1. 创建 note 事件
2. 手动修改为普通事件（添加 `startTime/endTime`）
3. 验证：签名不再包含"📝 笔记由"
4. 验证：同步到 Outlook 使用真实时间

---

## 8. 注意事项

### 8.1 数据一致性

- **本地存储**：`endTime = null`（永久）
- **Outlook 传输**：`endTime = startTime + 1h`（临时）
- **往返检测**：签名标记 + 本地状态双重验证

### 8.2 签名作用

签名不仅用于元数据记录，还用于：
1. **同步路由判断**：识别 note 事件
2. **往返数据保护**：防止虚拟字段污染本地数据

### 8.3 边界情况

- **手动设置时间**：一旦用户设置 `startTime/endTime`，事件变为普通事件，签名自动切换
- **删除时间**：如果用户删除时间，事件自动转为 note，签名重新生成
- **迁移日历**：note 事件可以迁移到不同日历，虚拟时间逻辑保持一致

---

## 9. 版本历史

- **v2.19.0**：统一 note 事件时间模型，`startTime = createdAt`，虚拟时间仅在同步传输时添加
- **v2.18.0**：初始实现虚拟时间系统

---

## 10. 相关文档

- [TimeLog & Description PRD](./PRD/TimeLog_&_Description_PRD.md)
- [Signature Utils Specification](./features/SignatureUtils_Spec.md)
- [Sync Architecture](./architecture/Sync_Architecture.md)
