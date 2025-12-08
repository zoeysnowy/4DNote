# UnifiedMention 图标显示逻辑说明

## 问题：打钩按钮是怎么来的？

从截图中可以看到，UnifiedMention 菜单中的事件候选项前面显示了绿色的打钩图标 ✅。

## 图标来源追踪

### 1. 显示位置（UnifiedMentionMenu.tsx）

```tsx
// Line 268
<span className="mention-icon">{item.icon}</span>
```

图标是从 `MentionItem` 接口的 `icon` 字段读取的。

### 2. 图标设置逻辑（UnifiedSearchIndex.ts）

在搜索事件时，调用 `_getEventIcon(event)` 方法设置图标：

```typescript
// Line 330 - _searchEvents 方法中
return {
  id: event.id,
  type: 'event' as MentionType,
  title,
  subtitle: this._formatEventSubtitle(event),
  icon: this._getEventIcon(event),  // 👈 这里设置图标
  score: 1 - (result.score || 0),
  metadata: { event },
};
```

### 3. 图标判断条件（_getEventIcon 方法）

```typescript
// Line 523-527
private _getEventIcon(event: Event): string {
  if (event.isPlan) return '✅';                              // 计划事件
  if (event.isTimeCalendar) return '📅';                      // 日历事件
  if (event.checkType && event.checkType !== 'none') return '☑️';  // 签到事件
  return '📄';                                                 // 普通事件
}
```

## 判断逻辑详解

### 优先级顺序（从高到低）

1. **✅ 计划事件** (`isPlan === true`)
   - 条件：`event.isPlan === true`
   - 场景：从 Plan 页面创建的事件
   - 图标：`✅`（绿色打钩，filled）

2. **📅 日历事件** (`isTimeCalendar === true`)
   - 条件：`event.isTimeCalendar === true`
   - 场景：从 TimeCalendar 页面创建的事件
   - 图标：`📅`（日历）

3. **☑️ 签到事件** (`checkType !== 'none'`)
   - 条件：`event.checkType && event.checkType !== 'none'`
   - 场景：启用了签到功能的任务
   - 可能的 `checkType` 值：
     - `'once'`：单次签到
     - `'recurring'`：循环签到
   - 图标：`☑️`（方框打钩，outline）

4. **📄 普通事件**（默认）
   - 条件：以上都不满足
   - 图标：`📄`（文档）

## 你的截图分析

从截图中看到的 ✅ 绿色打钩图标，说明：

- 这些事件的 `isPlan === true`
- 它们是从「计划清单」页面创建的
- 优先级最高，所以显示 ✅ 而不是其他图标

## 相关字段定义

### Event 接口（types.ts）

```typescript
export interface Event {
  // ... 其他字段

  // 🎯 事件类型标记（用于控制显示样式）
  isPlan?: boolean;         // 标记为计划页面事件
  isTimeCalendar?: boolean; // 标记为 TimeCalendar 页面创建的事件
  
  // 🆕 签到功能
  checkType?: CheckType;    // 签到类型：none(无需签到), once(单次签到), recurring(循环签到)
  checked?: string[];       // 签到时间戳数组
  unchecked?: string[];     // 取消签到时间戳数组
}

export type CheckType = 'none' | 'once' | 'recurring';
```

## 如何修改图标逻辑

### 1. 添加新的图标类型

如果你想添加新的事件类型和图标，可以修改 `_getEventIcon` 方法：

```typescript
private _getEventIcon(event: Event): string {
  if (event.isPlan) return '✅';
  if (event.isTimeCalendar) return '📅';
  if (event.isDeadline) return '⏰';  // 🆕 新增：截止日期事件
  if (event.isTimer) return '⏱️';     // 🆕 新增：计时器事件
  if (event.checkType && event.checkType !== 'none') return '☑️';
  return '📄';
}
```

### 2. 根据标签显示不同图标

如果你想根据标签显示不同图标：

```typescript
private _getEventIcon(event: Event): string {
  // 优先级：特殊标记 > 标签 > 默认
  if (event.isPlan) return '✅';
  if (event.isTimeCalendar) return '📅';
  
  // 🆕 根据标签决定图标
  if (event.tags?.includes('工作')) return '💼';
  if (event.tags?.includes('学习')) return '📚';
  if (event.tags?.includes('健康')) return '🏃';
  
  if (event.checkType && event.checkType !== 'none') return '☑️';
  return '📄';
}
```

### 3. 根据状态显示不同图标

如果你想根据事件状态（完成/进行中）显示不同图标：

```typescript
private _getEventIcon(event: Event): string {
  // 检查是否已完成（根据签到记录）
  const isCompleted = event.checked && event.checked.length > 0;
  
  if (event.isPlan) {
    return isCompleted ? '✅' : '⬜';  // 已完成 / 未完成
  }
  
  if (event.isTimeCalendar) return '📅';
  if (event.checkType && event.checkType !== 'none') {
    return isCompleted ? '☑️' : '◻️';  // 已签到 / 未签到
  }
  
  return '📄';
}
```

## 样式控制

图标的样式由 CSS 控制：

```css
/* UnifiedMentionMenu.css */
.mention-icon {
  font-size: 20px;        /* 图标大小 */
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}
```

如果你想让某些图标有不同的样式，可以：

1. **添加 data 属性**：
```tsx
<span className="mention-icon" data-type={item.type}>
  {item.icon}
</span>
```

2. **添加 CSS 规则**：
```css
.mention-icon[data-type="event"] {
  font-size: 22px;  /* 事件图标稍大 */
}

.mention-icon[data-type="tag"] {
  opacity: 0.8;     /* 标签图标稍透明 */
}
```

## 总结

- ✅ **打钩图标来自 `event.isPlan === true`**
- 📍 **判断逻辑在 `UnifiedSearchIndex._getEventIcon()` 方法**
- 🎯 **优先级：isPlan > isTimeCalendar > checkType > 默认**
- 🎨 **可以通过修改 `_getEventIcon` 方法自定义图标逻辑**
