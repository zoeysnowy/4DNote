# BulletLevel EditModal 空白问题修复

## 问题描述

在 Plan 页面创建的 bulletlevel 事件，点击 More 图标打开 EditModal 时显示空白（无标题、无内容）。

## 根本原因

**双重问题**：

### 1. 数据流错误
- ❌ **旧实现**：`onMoreClick` 从 `editorItems` 数组中查找 item，然后传给 `EventEditModalV2`
- ⚠️ **问题**：`editorItems` 是经过 `computeEditorItems()` 处理的派生数据，可能丢失某些字段（如 title.fullTitle, eventlog 等）

### 2. Title 字段读取错误
- ❌ **旧实现**：EventEditModalV2 只读取 `event.title.colorTitle`
- ⚠️ **问题**：PlanSlate 保存的事件只有 `title.fullTitle`，EventService 会自动生成 `colorTitle`，但 EventEditModalV2 在 EventService 完成 normalize 之前就读取了数据
- 🔍 **根源**：EventEditModalV2 从 EventService.getEventById() 异步加载数据，但 title 字段的读取逻辑不完整

## 修复方案

### 1. 直接从 EventHub 获取数据
- ✅ **新实现**：只传 `eventId` 给 `EventEditModalV2`，让它自己从 EventService 获取完整数据
- ✅ **优势**：EventService 是单一数据源，保证数据完整性

### 2. 修复 Title 字段读取逻辑
- ✅ **新实现**：按优先级读取 `colorTitle` > `fullTitle` > `simpleTitle`
- ✅ **兼容性**：支持 PlanSlate（只有 fullTitle）和 EventEditModalV2（自己生成的 colorTitle）
- ✅ **自动转换**：如果只有 simpleTitle（纯文本），自动转换为 Slate JSON 格式

## 代码变更

### PlanManager.tsx

#### 1. 删除 `editingItem` state（不再需要）
```typescript
// ❌ 旧代码
const [editingItem, setEditingItem] = useState<Event | null>(null);

// ✅ 新代码
// 🔧 [已删除] editingItem - EventEditModalV2 现在直接从 EventHub 获取数据，不需要传入 item 对象
```

#### 2. 简化 `onMoreClick` 回调
```typescript
// ❌ 旧代码
onMoreClick={(eventId) => {
  const item = editorItems.find(i => i.id === eventId);
  if (item) {
    setSelectedItemId(eventId);
    setEditingItem(item);
  }
}}

// ✅ 新代码
onMoreClick={(eventId) => {
  // 🆕 More 图标点击 - 打开 EventEditModal
  // 🔧 FIX: 不再从 editorItems 获取数据，直接使用 eventId
  // EventEditModalV2 会从 EventHub/EventService 获取完整数据
  setSelectedItemId(eventId);
}}
```

#### 3. 简化 EventEditModalV2 调用
```typescript
// ❌ 旧代码
{selectedItemId && editingItem && (
  <EventEditModalV2
    eventId={editingItem.id}
    onClose={() => {
      setSelectedItemId(null);
      setEditingItem(null);
    }}
    onSave={async (updatedEvent) => {
      const latestEvent = await EventService.getEventById(editingItem.id);
      // ...
    }}
    onDelete={(eventId) => {
      deleteItems([editingItem.id], 'user-manual-delete');
      // ...
    }}
  />
)}

// ✅ 新代码
{selectedItemId && (
  <EventEditModalV2
    eventId={selectedItemId}
    onClose={() => {
      setSelectedItemId(null);
    }}
    onSave={async (updatedEvent) => {
      const latestEvent = await EventService.getEventById(selectedItemId);
      // ...
    }}
    onDelete={(eventId) => {
      deleteItems([eventId], 'user-manual-delete');
      // ...
    }}
  />
)}
```

#### 4. 删除无用的 Emoji Picker
```typescript
// ❌ 旧代码
{showEmojiPicker && (
  <Picker onEmojiSelect={(emoji) => {
    if (editingItem) {
      setEditingItem({ ...editingItem, emoji: emoji.native });
    }
  }} />
)}

// ✅ 新代码
// 🔧 [已删除] Emoji Picker - EventEditModalV2 已经内置 emoji 选择器，PlanManager 不需要独立的 emoji picker
```

## EventEditModalV2 数据加载机制

EventEditModalV2 已经内置了从 EventService 加载数据的逻辑：

```typescript
React.useEffect(() => {
  if (!eventId) {
    setEvent(null);
    return;
  }
  
  // 🔧 从 EventService 异步加载事件数据
  // 现在所有事件（包括新建）都应该立即存在于 EventService
  EventService.getEventById(eventId).then(serviceEvent => {
    if (serviceEvent) {
      setEvent(serviceEvent);
    } else {
      console.error('❌ [EventEditModalV2] 事件不存在:', eventId);
      setEvent(null);
    }
  });
}, [eventId]);
```

## 数据流对比

### ❌ 旧数据流（有数据丢失风险）
```
PlanSlate 创建事件
  ↓ slateNodesToPlanItems()
EventService 保存
  ↓ getEvents()
PlanManager items
  ↓ computeEditorItems() (可能丢失字段)
editorItems
  ↓ find()
editingItem (不完整)
  ↓
EventEditModalV2 显示空白
```

### ✅ 新数据流（完整数据）
```
PlanSlate 创建事件
  ↓ slateNodesToPlanItems()
EventService 保存
  ↓
PlanManager 点击 More
  ↓ eventId
EventEditModalV2
  ↓ EventService.getEventById()
完整 Event 对象
  ↓
正常显示标题和内容
```

## 测试步骤

1. 启动应用，进入 Plan 页面
2. 创建一个顶级事件（level 0）
3. 按 Tab 键创建子事件（level 1，bulletlevel）
4. 输入标题和内容
5. 点击子事件的 More 图标（...）
6. 验证 EditModal 正确显示标题和内容

## 相关文件

- `src/components/PlanManager.tsx` - 移除 editingItem 依赖
- `src/components/EventEditModal/EventEditModalV2.tsx` - 已有从 EventService 加载数据的逻辑
- `src/components/PlanSlate/serialization.ts` - 创建事件时正确保存 bulletLevel、parentEventId 等字段

## 技术债务清理

通过这次修复，还顺便清理了以下技术债务：
1. ✅ 删除了冗余的 `editingItem` state
2. ✅ 删除了 PlanManager 中无用的 Emoji Picker（EventEditModalV2 已有）
3. ✅ 统一数据源为 EventService（避免多个数据副本）
4. ✅ 简化了代码，减少了状态管理复杂度

## 架构原则

遵循 **EVENTHUB_TIMEHUB_ARCHITECTURE.md** 中的原则：
- ✅ EventService 是单一数据源（Single Source of Truth）
- ✅ UI 组件应从 EventHub/EventService 获取数据，而非依赖派生状态
- ✅ 增量更新使用 EventHub.updateFields()
- ✅ eventId 是跨组件通信的唯一标识符
