# View Membership 最终架构方案（历史文档，已并入 SSOT）

> 注意：从 2026-01 起，**view_membership 的架构真相只维护在 SSOT**：
> - docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md
>
> 本文保留为历史讨论/草稿留档，不再作为唯一口径更新。

> **设计原则**：shouldShow 作为纯函数，仅在影响 membership 的字段变化时调用，避免无效计算

## 1. 核心设计：触发字段映射

### 1.1 每个 View 的依赖字段

```typescript
/**
 * 定义每个 view 的 shouldShow 依赖字段
 * 只有这些字段变化时，才需要重新计算 membership
 */
export const VIEW_TRIGGER_FIELDS: Record<string, Set<keyof Event>> = {
  plan: new Set([
    'checkType',        // 任务类型变化
    'isDeleted',        // 删除状态
    'parentEventId',    // child/sub-event 结构变化（是否为子事件）
    'calendarIds',      // 日历归属（isTimeCalendar 判断）
  ]),
  
  library: new Set([
    'isDeleted',        // 删除状态
    // Library membership 由 lib_store 决定（引用表），不是 Event 字段。
    // 因此这里不“监听 lib_store 字段”（它不存在于 Event 更新里）。
    // 正确做法：在 lib_store 的 add/remove 时，直接增量更新对应 eventId 的 library membership
    // （或触发 library 的 rebuild）。
  ]),
  
  timelog: new Set([
    'isDeleted',        // 删除状态变化
    // TimeLog = 按时间轴聚合的视图，不是类型过滤器
    // 所有事件（包括 Note）都可纳入，排序使用 resolveTimelineAnchor()
    // 
    // 为什么不监听 isTimer/isTimeLog/isOutsideApp？
    // - 这些是创建时的身份标记，不应该后续变化
    // - 过滤逻辑在 shouldShow 中通过 isSubordinateEvent() 派生判断
    // - 不引入 event.kind：多重角色通过 facet（派生谓词）+ view_membership（可重建索引）表达
    //
    // 为什么不监听 startTime/createdAt/timeSpec？
    // - 这些字段变化不影响 **membership**（是否纳入 TimeLog）
    // - 只影响 **排序**（在时间轴上的位置）
    // - 排序锚点通过 resolveTimelineAnchor() 动态计算
    // - 如需性能优化，可物化锚点到 event_tree 表（见 §10.4 性能优化）
  ]),
  
  workspace: new Set([
    'isDeleted',        // 删除状态
    // workspace 未来扩展字段（暂无）
  ]),
  
  sky: new Set([
    'isDeleted',        // 删除状态
    // sky 由 sky_store 决定，Event 字段变化不影响 membership
    // 类似 library，仅当 sky_store 变化时需要重建
  ]),
};

/**
 * 辅助函数：检测本次更新是否影响指定 view 的 membership
 */
export function shouldRecalculateMembership(
  viewId: string,
  updates: Partial<Event>
): boolean {
  const triggerFields = VIEW_TRIGGER_FIELDS[viewId];
  if (!triggerFields) return false;
  
  // 检查是否有任何触发字段被更新
  return Object.keys(updates).some(key => 
    triggerFields.has(key as keyof Event)
  );
}
```

## 2. ViewMembershipService 核心架构

### 2.1 数据模型

```typescript
// ==================== Schema ====================

/**
 * View Membership 索引表（最终方案，不含兼容字段）
 */
export interface ViewMembership {
  eventId: string;
  viewId: 'plan' | 'library' | 'timelog' | 'workspace' | 'sky';
  
  // 可选元数据（用于性能优化/调试）
  metadata?: {
    reason?: string;          // membership 原因（调试用）
    checkType?: string;       // Plan 专用：记录 checkType
    calendarType?: string;    // Plan 专用：记录是否为 time calendar
  };
  
  updatedAt: number;          // 最后更新时间（用于增量同步）
}

// IndexedDB Schema
const viewMembershipStore = db.createObjectStore('view_membership', {
  keyPath: ['eventId', 'viewId']  // 复合主键
});
viewMembershipStore.createIndex('by_eventId', 'eventId');
viewMembershipStore.createIndex('by_viewId', 'viewId');
viewMembershipStore.createIndex('by_updatedAt', 'updatedAt');
```

### 2.2 shouldShow 实现（最终版）

```typescript
// ==================== Pure Functions ====================

/**
 * Plan 页面的 membership 判断（最终版）
 * 删除了 isPlan 依赖，使用显式规则
 */
export function shouldShow_Plan(event: Event, context: ShouldShowContext): boolean {
  // 排除已删除
  if (event.isDeleted) return false;
  
  // 排除子事件（Plan 列表只展示 top-level；子事件通过 TreeAPI 展开访问）
  if (event.parentEventId) return false;
  
  // 排除系统轨迹事件（Timer/TimeLog/OutsideApp）
  if (isSubordinateEvent(event)) return false;
  
  // 包含规则（Union）：checkType 存在 OR 来自 time calendar
  const hasCheckType = event.checkType != null && event.checkType !== 'none';
  const isFromTimeCalendar = event.calendarIds?.some(id => 
    context.timeCalendarIds.has(id)
  );
  
  return hasCheckType || isFromTimeCalendar;
}

/**
 * 判断是否为从属事件（subordinate event）
 * 来源：docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md §9.5
 */
function isSubordinateEvent(event: Event): boolean {
  return event.isTimer === true 
    || event.isTimeLog === true 
    || event.isOutsideApp === true;
}

/**
 * Library 页面的 membership 判断
 */
export function shouldShow_Library(event: Event, context: ShouldShowContext): boolean {
  if (event.isDeleted) return false;
  
  // Library membership 由 lib_store 决定
  return context.libraryEventIds.has(event.id);
}

/**
 * TimeLog 页面的 membership 判断（最终修订版 - 基于 SSOT）
 * 
 * 核心原则（来自 docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md §9.5）：
 * - TimeLog = 按时间轴聚合的视图，不是"有时间的事件"过滤器
 * - 所有事件（包括 Note/Plan/Task）都可纳入，只要不是系统轨迹/从属事件
 * - 排序使用派生函数：resolveTimelineAnchor(event, 'timelog')
 * - 禁止通过写入 startTime=createdAt 来实现
 * 
 * 纳入范围：
 * - Plan 事件：保留 checkType、树形结构等
 * - Note 事件：保留 eventlog、createdAt
 * - Task 事件：保留 dueDateTime、完成状态
 * - 任何其他用户创建的事件
 * 
 * 排除范围：
 * - 不排除子事件：`parentEventId` 非空的用户子事件也应纳入 TimeLog
 * - 系统轨迹（isTimer/isTimeLog/isOutsideApp）
 * - 已删除事件
 * 
 * 时间锚点（排序用，不影响 membership）：
 * - 有 startTime：用 startTime
 * - 否则有 timeSpec.resolved：用 resolved
 * - 否则：用 createdAt（所有事件必有）
 */
export function shouldShow_TimeLog(event: Event, context: ShouldShowContext): boolean {
  // 排除已删除
  if (event.isDeleted) return false;
  
  // 排除系统轨迹事件（Timer/TimeLog/OutsideApp）
  if (isSubordinateEvent(event)) return false;
  
  // 纳入所有其他事件（不限制是否有时间）
  return true;
}

/**
 * Workspace 页面的 membership 判断（未来扩展）
 */
export function shouldShow_Workspace(event: Event, context: ShouldShowContext): boolean {
  if (event.isDeleted) return false;
  
  // 未来可扩展：workspaceId 过滤
  return true;  // 暂时全部显示
}

/**
 * Sky 页面的 membership 判断（Pin to Sky 功能）
 * 
 * 设计原则：
 * - 类似 Library，Sky 是用户主动 pin 的事件集合
 * - membership 由独立的 sky_store 引用表驱动
 * - Event 字段变化不影响 Sky membership（除了 isDeleted）
 */
export function shouldShow_Sky(event: Event, context: ShouldShowContext): boolean {
  if (event.isDeleted) return false;
  
  // Sky membership 由 sky_store 决定
  return context.pinnedEventIds.has(event.id);
}

/**
 * TimeCalendar 面板处理方式（不使用 view_membership）
 * 
 * TimeCalendar 是独立的 UI 组件，基于 TUI Calendar，**不在 view_membership 架构中**。
 * 
 * 数据加载：
 * - 直接使用 `EventService.getAllEvents()` 加载所有事件
 * - 不使用 view_membership 索引
 * 
 * 3 个内置面板（TUI Calendar 原生功能）：
 * - **AllDay Panel**: 显示 isAllDay=true 的事件
 * - **Task Panel**: 显示 TUI Calendar 定义的 task 类型事件
 * - **Deadline Panel** (Milestone): 显示 milestone 类型事件
 * 
 * 面板控制（通过 CalendarSettings）：
 * ```typescript
 * interface CalendarSettings {
 *   showDeadline: boolean;   // 是否显示 Deadline 面板
 *   showTask: boolean;       // 是否显示 Task 面板
 *   showAllDay: boolean;     // 是否显示 AllDay 面板
 *   
 *   deadlineHeight: number;  // 面板高度 (0-300px)
 *   taskHeight: number;
 *   allDayHeight: number;
 * }
 * ```
 * 
 * 过滤逻辑：
 * - 面板分类由 TUI Calendar 内部处理
 * - 标签过滤：`CalendarSettings.visibleTags`
 * - 日历过滤：`CalendarSettings.visibleCalendars`
 * 
 * **与 view_membership 的关系**：
 * - ❌ TimeCalendar 不是 view_membership 中的顶层视图
 * - ❌ TimeCalendar 的面板不是 view_membership 的子视图
 * - ✅ TimeCalendar 是并行于 view_membership 的独立系统
 * - ✅ 架构重构后，TimeCalendar 的处理方式**不变**
 * 
 * 参考文档：`docs/PRD/TIMECALENDAR_MODULE_PRD.md`
 */

// 使用示例：
// const planEvents = await loadPlanEvents();  // 从 view_membership 加载
// const timelogEvents = await loadTimeLogEvents();  // 从 view_membership 加载

// ==================== Context 构建 ====================

export interface ShouldShowContext {
  timeCalendarIds: Set<string>;     // Plan 专用：time calendar 列表
  libraryEventIds: Set<string>;     // Library 专用：精选事件 ID
  pinnedEventIds: Set<string>;      // Sky 专用：Pin to Sky 的事件 ID
}

/**
 * 构建全局 context（启动时/Calendar 列表变化时调用一次）
 *
 * 关键点：
 * - 这一步不是“每次启动全量扫描所有事件”，只加载少量引用表的 ID 集合（lib_store/sky_store）+ calendars 列表。
 * - membership 的**增量维护**应当发生在引用表变更时：
 *   - lib_store add/remove → 直接更新对应 eventId 的 `view_membership(viewId='library')`
 *   - sky_store add/remove → 直接更新对应 eventId 的 `view_membership(viewId='sky')`
 * - `rebuildView/rebuildAll` 仅作为兜底（迁移/修复/丢失增量事件）。
 */
export async function buildShouldShowContext(): Promise<ShouldShowContext> {
  // 查询所有 time calendar
  const calendars = await CalendarService.getAllCalendars();
  const timeCalendarIds = new Set(
    calendars
      .filter(cal => cal.type === 'time' || cal.provider === 'local-time')
      .map(cal => cal.id)
  );
  
  // 查询所有精选事件（从 lib_store）
  const libraryRecords = await db.lib_store.toArray();
  const libraryEventIds = new Set(libraryRecords.map(r => r.eventId));
  
  // 查询所有 pin to sky 事件（从 sky_store）
  const skyRecords = await db.sky_store.toArray();
  const pinnedEventIds = new Set(skyRecords.map(r => r.eventId));
  
  return { timeCalendarIds, libraryEventIds, pinnedEventIds };
}

/**
 * 解析事件的时间轴锚点（TimeLog/Timeline 排序用）
 * 
 * 来源：docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md §5.2 Time Anchor
 * 
 * 优先级（scope='timelog'）：
 * 1. 有 calendar block：用 startTime（发生区间的开始）
 * 2. 否则若有 timeSpec.resolved：用 resolved（允许 Note/Task/Plan 仅用于锚点展示）
 * 3. 否则：用 createdAt（Meta，所有事件必须有，作为稳定 fallback）
 * 
 * 不变量：Timeline Anchor 只用于展示/排序/分组，不得回写到 startTime/endTime
 */
export function resolveTimelineAnchor(
  event: Event,
  scope: 'timelog' | 'timeline' = 'timelog'
): number {
  // 1. 优先使用明确的 calendar block 开始时间
  if (event.startTime) {
    const time = parseLocalTimeStringOrNull(event.startTime);
    if (time) return time.getTime();
  }
  
  // 2. 尝试使用 timeSpec.resolved（如果存在）
  if (event.timeSpec?.resolved) {
    const resolved = event.timeSpec.resolved;
    if (resolved.start) {
      const time = typeof resolved.start === 'string' 
        ? parseLocalTimeStringOrNull(resolved.start)
        : resolved.start;
      if (time) return (time instanceof Date ? time : new Date(time)).getTime();
    }
  }
  
  // 3. Fallback 到 createdAt（所有事件必有）
  if (event.createdAt) {
    const time = parseLocalTimeStringOrNull(event.createdAt);
    if (time) return time.getTime();
  }
  
  // 4. 极端 fallback（理论上不应到达）
  console.warn(`[resolveTimelineAnchor] Event ${event.id} has no valid time fields, using now`);
  return Date.now();
}
```

## 3. 核心逻辑：updateEvent 时的 Membership 更新

### 3.1 智能触发机制

```typescript
/**
 * EventService.updateEvent 集成点
 */
export class EventService {
  static async updateEvent(
    eventId: string,
    updates: Partial<Event>
  ): Promise<void> {
    // 1. 更新 Event（原有逻辑）
    await storageManager.updateEvent(eventId, updates);
    
    // 2. 同步更新 event_tree（原有逻辑）
    if (hasTreeFields(updates)) {
      await storageManager.updateEventTree(eventId, extractTreeFields(updates));
    }
    
    // 3. 智能更新 view_membership（新增逻辑）
    await ViewMembershipService.updateEventMembership(eventId, updates);
    
    // 4. 其他逻辑...
  }
}

/**
 * ViewMembershipService 核心方法
 */
export class ViewMembershipService {
  private static context: ShouldShowContext | null = null;
  
  /**
   * 初始化（启动时调用一次）
   */
  static async initialize(): Promise<void> {
    this.context = await buildShouldShowContext();
    console.log('✅ ViewMembershipService initialized', {
      timeCalendars: this.context.timeCalendarIds.size,
      libraryEvents: this.context.libraryEventIds.size,
    });
  }
  
  /**
   * 更新单个 Event 的 membership（核心逻辑）
   * 
   * @param eventId - 事件 ID
   * @param updates - 本次更新的字段
   */
  static async updateEventMembership(
    eventId: string,
    updates: Partial<Event>
  ): Promise<void> {
    if (!this.context) {
      console.warn('ViewMembershipService not initialized, skipping membership update');
      return;
    }
    
    // 1. 检测哪些 view 需要重新计算
    const affectedViews = this.detectAffectedViews(updates);
    
    if (affectedViews.length === 0) {
      // 无触发字段变化，跳过（例如：eventlog 变化）
      console.log(`[ViewMembership] Skip eventId=${eventId.slice(-8)}, no trigger fields changed`);
      return;
    }
    
    console.log(`[ViewMembership] Update eventId=${eventId.slice(-8)}, affected views:`, affectedViews);
    
    // 2. 获取完整的 Event（需要完整数据来判断 shouldShow）
    const event = await EventService.getEventById(eventId);
    if (!event) {
      console.error(`[ViewMembership] Event not found: ${eventId}`);
      return;
    }
    
    // 3. 为每个受影响的 view 重新计算 membership
    const operations: Array<{
      action: 'add' | 'remove' | 'skip';
      viewId: string;
      reason: string;
    }> = [];
    
    for (const viewId of affectedViews) {
      const shouldInclude = shouldShow(event, viewId, this.context);
      const currentMembership = await this.getMembership(eventId, viewId);
      
      if (shouldInclude && !currentMembership) {
        // 需要加入
        operations.push({ action: 'add', viewId, reason: 'shouldShow=true, not in index' });
      } else if (!shouldInclude && currentMembership) {
        // 需要移除
        operations.push({ action: 'remove', viewId, reason: 'shouldShow=false, in index' });
      } else {
        // 无需变化
        operations.push({ 
          action: 'skip', 
          viewId, 
          reason: `shouldShow=${shouldInclude}, already correct` 
        });
      }
    }
    
    // 4. 批量执行数据库操作
    await this.batchApplyOperations(eventId, event, operations);
    
    console.log(`[ViewMembership] Completed eventId=${eventId.slice(-8)}`, {
      add: operations.filter(op => op.action === 'add').map(op => op.viewId),
      remove: operations.filter(op => op.action === 'remove').map(op => op.viewId),
      skip: operations.filter(op => op.action === 'skip').map(op => op.viewId),
    });
  }
  
  /**
   * 检测本次更新影响哪些 view
   */
  private static detectAffectedViews(updates: Partial<Event>): string[] {
    const views: string[] = [];
    
    for (const [viewId, triggerFields] of Object.entries(VIEW_TRIGGER_FIELDS)) {
      if (shouldRecalculateMembership(viewId, updates)) {
        views.push(viewId);
      }
    }
    
    return views;
  }
  
  /**
   * 获取当前 membership 状态
   */
  private static async getMembership(
    eventId: string,
    viewId: string
  ): Promise<ViewMembership | null> {
    const record = await db.view_membership
      .where(['eventId', 'viewId'])
      .equals([eventId, viewId])
      .first();
    return record || null;
  }
  
  /**
   * 批量应用操作（优化：合并为单个事务）
   */
  private static async batchApplyOperations(
    eventId: string,
    event: Event,
    operations: Array<{ action: 'add' | 'remove' | 'skip'; viewId: string; reason: string }>
  ): Promise<void> {
    const toAdd: ViewMembership[] = [];
    const toRemove: Array<[string, string]> = [];  // [eventId, viewId]
    
    for (const op of operations) {
      if (op.action === 'add') {
        toAdd.push({
          eventId,
          viewId: op.viewId as any,
          metadata: this.buildMetadata(event, op.viewId),
          updatedAt: Date.now(),
        });
      } else if (op.action === 'remove') {
        toRemove.push([eventId, op.viewId]);
      }
    }
    
    // 单事务执行
    if (toAdd.length > 0 || toRemove.length > 0) {
      await db.transaction('rw', db.view_membership, async () => {
        if (toAdd.length > 0) {
          await db.view_membership.bulkPut(toAdd);
        }
        if (toRemove.length > 0) {
          await db.view_membership.bulkDelete(toRemove);
        }
      });
    }
  }
  
  /**
   * 构建元数据（可选，用于调试/性能优化）
   */
  private static buildMetadata(event: Event, viewId: string): any {
    if (viewId === 'plan') {
      return {
        checkType: event.checkType || undefined,
        calendarType: event.calendarIds?.length ? 'hasCalendar' : undefined,
      };
    }
    return undefined;
  }
  
  /**
   * 刷新 context（Calendar 变化/Curation 变化时调用）
   */
  static async refreshContext(): Promise<void> {
    this.context = await buildShouldShowContext();
    console.log('🔄 ViewMembershipService context refreshed');
  }
}
```

## 4. 特殊场景处理

### 4.1 Library 的特殊性

```typescript
/**
 * Library view 的 membership 由 lib_store 驱动
 * Event 字段变化不会影响 Library membership（除了 isDeleted）
 */

// Library 变化时触发
export class LibraryService {
  static async addToLibrary(eventId: string): Promise<void> {
    // 1. 更新 lib_store
    await db.lib_store.add({ eventId, createdAt: Date.now() });
    
    // 2. 刷新 context（更新 curatedEventIds）
    await ViewMembershipService.refreshContext();
    
    // 3. 直接添加到 Library membership
    const event = await EventService.getEventById(eventId);
    if (event && !event.isDeleted) {
      await db.view_membership.put({
        eventId,
        viewId: 'library',
        updatedAt: Date.now(),
      });
    }
  }
  
  static async removeFromLibrary(eventId: string): Promise<void> {
    // 1. 删除 lib_store
    await db.lib_store.where('eventId').equals(eventId).delete();
    
    // 2. 刷新 context
    await ViewMembershipService.refreshContext();
    
    // 3. 移除 Library membership
    await db.view_membership.delete([eventId, 'library']);
  }
}
```

### 4.2 Sky 的特殊性（Pin to Sky 功能）

```typescript
/**
 * Sky view 的 membership 由 sky_store 驱动
 * 类似 Library，是用户主动 pin 的事件集合
 */

// Schema
interface SkyRecord {
  eventId: string;        // 引用的 Event ID
  pinnedAt: number;       // Pin 的时间（用于排序）
  position?: {            // 可选：Sky 中的位置信息
    x: number;
    y: number;
  };
  metadata?: any;         // 可选：其他元数据
}

// IndexedDB
const skyStore = db.createObjectStore('sky_store', { keyPath: 'eventId' });
skyStore.createIndex('by_pinnedAt', 'pinnedAt');

// Pin 到 Sky
export class SkyService {
  static async pinToSky(eventId: string, position?: { x: number; y: number }): Promise<void> {
    // 1. 更新 sky_store
    await db.sky_store.put({
      eventId,
      pinnedAt: Date.now(),
      position,
    });
    
    // 2. 刷新 context（更新 pinnedEventIds）
    await ViewMembershipService.refreshContext();
    
    // 3. 直接添加到 Sky membership
    const event = await EventService.getEventById(eventId);
    if (event && !event.isDeleted) {
      await db.view_membership.put({
        eventId,
        viewId: 'sky',
        metadata: { pinnedAt: Date.now() },
        updatedAt: Date.now(),
      });
    }
  }
  
  static async unpinFromSky(eventId: string): Promise<void> {
    // 1. 删除 sky_store
    await db.sky_store.delete(eventId);
    
    // 2. 刷新 context
    await ViewMembershipService.refreshContext();
    
    // 3. 移除 Sky membership
    await db.view_membership.delete([eventId, 'sky']);
  }
  
  /**
   * 查询 Sky 中的所有事件（按 pin 时间排序）
   */
  static async loadSkyEvents(): Promise<Event[]> {
    const memberships = await db.view_membership
      .where('viewId')
      .equals('sky')
      .toArray();
    
    const eventIds = memberships.map(m => m.eventId);
    const events = await EventService.getEventsByIds(eventIds);
    
    // 按 pinnedAt 排序
    const skyRecords = await db.sky_store.bulkGet(eventIds);
    const pinnedAtMap = new Map(
      skyRecords.filter(r => r).map(r => [r!.eventId, r!.pinnedAt])
    );
    
    return events.sort((a, b) => {
      const aTime = pinnedAtMap.get(a.id) || 0;
      const bTime = pinnedAtMap.get(b.id) || 0;
      return bTime - aTime;  // 最新 pin 的在前
    });
  }
}
```

### 4.3 Calendar 变化时的批量更新

```typescript
/**
 * Calendar 类型变化时，需要重新计算所有相关 Event 的 Plan membership
 */
export class CalendarService {
  static async updateCalendarType(
    calendarId: string,
    newType: 'time' | 'task' | 'general'
  ): Promise<void> {
    // 1. 更新 Calendar
    await this.updateCalendar(calendarId, { type: newType });
    
    // 2. 刷新 context（更新 timeCalendarIds）
    await ViewMembershipService.refreshContext();
    
    // 3. 批量重建受影响 Event 的 Plan membership
    await ViewMembershipService.rebuildViewForCalendar('plan', calendarId);
  }
}

// ViewMembershipService 扩展方法
export class ViewMembershipService {
  /**
   * 重建某个 Calendar 下所有 Event 的指定 view membership
   */
  static async rebuildViewForCalendar(
    viewId: string,
    calendarId: string
  ): Promise<void> {
    console.log(`[ViewMembership] Rebuild ${viewId} for calendarId=${calendarId}`);
    
    // 1. 查询该 Calendar 下的所有 Event
    const events = await db.events
      .where('calendarIds')
      .equals(calendarId)
      .toArray();
    
    console.log(`Found ${events.length} events in calendar`);
    
    // 2. 批量重新计算
    const operations: Array<{
      eventId: string;
      action: 'add' | 'remove';
    }> = [];
    
    for (const event of events) {
      const shouldInclude = shouldShow(event, viewId, this.context!);
      const currentMembership = await this.getMembership(event.id, viewId);
      
      if (shouldInclude && !currentMembership) {
        operations.push({ eventId: event.id, action: 'add' });
      } else if (!shouldInclude && currentMembership) {
        operations.push({ eventId: event.id, action: 'remove' });
      }
    }
    
    // 3. 批量执行
    await this.batchApplyMembershipChanges(viewId, operations);
    
    console.log(`[ViewMembership] Rebuild completed`, {
      add: operations.filter(op => op.action === 'add').length,
      remove: operations.filter(op => op.action === 'remove').length,
    });
  }
  
  private static async batchApplyMembershipChanges(
    viewId: string,
    operations: Array<{ eventId: string; action: 'add' | 'remove' }>
  ): Promise<void> {
    const BATCH_SIZE = 1000;
    
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = operations.slice(i, i + BATCH_SIZE);
      
      await db.transaction('rw', db.view_membership, async () => {
        for (const op of batch) {
          if (op.action === 'add') {
            await db.view_membership.put({
              eventId: op.eventId,
              viewId: viewId as any,
              updatedAt: Date.now(),
            });
          } else {
            await db.view_membership.delete([op.eventId, viewId]);
          }
        }
      });
    }
  }
}
```

## 5. 完整调用链路

### 5.1 启动流程

```typescript
// App.tsx
async function initializeApp() {
  // 1. 初始化 Storage
  await storageManager.initialize();
  
  // 2. 初始化 ViewMembershipService（构建 context）
  await ViewMembershipService.initialize();
  
  // 3. 其他初始化...
}
```

### 5.2 Event CRUD 流程

```typescript
// ==================== 创建 Event ====================
export class EventService {
  static async createEvent(eventData: Partial<Event>): Promise<Event> {
    // 1. 生成 ID、创建 Event
    const event = await storageManager.createEvent(eventData);
    
    // 2. 创建 event_tree 索引
    await storageManager.createEventTree({
      id: event.id,
      parentEventId: event.parentEventId,
      rootEventId: event.rootEventId || event.id,
      // ...其他字段
    });
    
    // 3. 创建 view_membership（全量检查）
    await ViewMembershipService.createEventMembership(event);
    
    return event;
  }
}

// ViewMembershipService.createEventMembership
static async createEventMembership(event: Event): Promise<void> {
  if (!this.context) return;
  
  const memberships: ViewMembership[] = [];
  
  // 检查所有 view
  for (const viewId of ['plan', 'library', 'timelog', 'workspace']) {
    if (shouldShow(event, viewId, this.context)) {
      memberships.push({
        eventId: event.id,
        viewId: viewId as any,
        metadata: this.buildMetadata(event, viewId),
        updatedAt: Date.now(),
      });
    }
  }
  
  if (memberships.length > 0) {
    await db.view_membership.bulkAdd(memberships);
  }
  
  console.log(`[ViewMembership] Created for eventId=${event.id.slice(-8)}`, {
    views: memberships.map(m => m.viewId),
  });
}

// ==================== 更新 Event ====================
// 见第 3 节

// ==================== 删除 Event ====================
static async deleteEvent(eventId: string): Promise<void> {
  // 1. 软删除 Event
  await storageManager.updateEvent(eventId, { isDeleted: true });
  
  // 2. 删除 event_tree（如果需要）
  // ...
  
  // 3. 删除所有 view_membership（isDeleted 触发所有 view 移除）
  await ViewMembershipService.deleteEventMembership(eventId);
}

// ViewMembershipService.deleteEventMembership
static async deleteEventMembership(eventId: string): Promise<void> {
  await db.view_membership.where('eventId').equals(eventId).delete();
  console.log(`[ViewMembership] Deleted all memberships for eventId=${eventId.slice(-8)}`);
}
```

### 5.3 外部触发流程

```typescript
// Calendar 变化
CalendarService.updateCalendarType(calId, 'time')
  → ViewMembershipService.refreshContext()
  → ViewMembershipService.rebuildViewForCalendar('plan', calId)

// Library 变化
LibraryService.addToLibrary(eventId)
  → ViewMembershipService.refreshContext()
  → db.view_membership.put({ eventId, viewId: 'library' })

LibraryService.removeFromLibrary(eventId)
  → ViewMembershipService.refreshContext()
  → db.view_membership.delete([eventId, 'library'])
```

## 6. 查询优化（最终版）

### 6.1 Plan 页面加载

```typescript
// 旧版本（低效）
async function loadPlanEvents_OLD(): Promise<Event[]> {
  const allEvents = await EventService.getAllEvents();  // 加载 10K events
  return allEvents.filter(shouldShowInPlanManager);    // 只用 500
}

// 最终版本（高效）
async function loadPlanEvents_FINAL(): Promise<Event[]> {
  // 1. 查询 view_membership 索引
  const memberships = await db.view_membership
    .where('viewId')
    .equals('plan')
    .toArray();
  
  const eventIds = memberships.map(m => m.eventId);
  
  // 2. 批量加载 Event（只加载需要的）
  const events = await EventService.getEventsByIds(eventIds);
  
  // 3. 构建树形结构（使用 EventTreeAPI）
  const tree = EventTreeAPI.buildTree(events);
  const sorted = EventTreeAPI.toDFSList(tree);
  
  return sorted;
}

// EventService 新增批量查询方法
export class EventService {
  static async getEventsByIds(eventIds: string[]): Promise<Event[]> {
    const BATCH_SIZE = 100;
    const results: Event[] = [];
    
    for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
      const batch = eventIds.slice(i, i + BATCH_SIZE);
      const events = await db.events.bulkGet(batch);
      results.push(...events.filter(e => e != null) as Event[]);
    }
    
    return results;
  }
}
```

### 6.2 性能对比

| 场景 | 旧版本 | 最终版本 | 提升 |
|------|--------|----------|------|
| Plan 加载（10K 总量，500 显示） | 加载 10K → 过滤 500 | 索引查询 500 → 加载 500 | **20x** |
| Library 加载（50 精选） | 加载 10K → 过滤 50 | 索引查询 50 → 加载 50 | **200x** |
| TimeLog 加载（2K 有时间） | 加载 10K → 过滤 2K | 索引查询 2K → 加载 2K | **5x** |

## 7. 数据一致性保障

### 7.1 Rebuild 机制（修复不一致）

```typescript
/**
 * 全量重建某个 view 的 membership（数据修复/初始化）
 */
export class ViewMembershipService {
  static async rebuildView(viewId: string): Promise<void> {
    console.log(`[ViewMembership] Rebuild ${viewId} started...`);
    const startTime = Date.now();
    
    if (!this.context) {
      await this.initialize();
    }
    
    // 1. 清空现有索引
    await db.view_membership.where('viewId').equals(viewId).delete();
    
    // 2. 扫描所有 Event（使用游标，避免内存溢出）
    const memberships: ViewMembership[] = [];
    let scannedCount = 0;
    
    await db.events.each(event => {
      scannedCount++;
      
      if (shouldShow(event, viewId, this.context!)) {
        memberships.push({
          eventId: event.id,
          viewId: viewId as any,
          metadata: this.buildMetadata(event, viewId),
          updatedAt: Date.now(),
        });
      }
      
      // 每 1000 条写入一次（避免内存溢出）
      if (memberships.length >= 1000) {
        const batch = memberships.splice(0, 1000);
        db.view_membership.bulkAdd(batch);
      }
    });
    
    // 3. 写入剩余数据
    if (memberships.length > 0) {
      await db.view_membership.bulkAdd(memberships);
    }
    
    const duration = Date.now() - startTime;
    console.log(`[ViewMembership] Rebuild ${viewId} completed`, {
      scanned: scannedCount,
      added: memberships.length,
      duration: `${duration}ms`,
    });
  }
  
  /**
   * 全量重建所有 view
   */
  static async rebuildAll(): Promise<void> {
    for (const viewId of ['plan', 'library', 'timelog', 'workspace']) {
      await this.rebuildView(viewId);
    }
  }
}
```

### 7.2 验证机制（测试/调试）

```typescript
/**
 * 验证 view_membership 数据一致性
 */
export class ViewMembershipService {
  static async verify(viewId: string): Promise<{
    correct: number;
    missing: number;
    extra: number;
    errors: Array<{ eventId: string; issue: string }>;
  }> {
    if (!this.context) {
      await this.initialize();
    }
    
    const errors: Array<{ eventId: string; issue: string }> = [];
    
    // 1. 检查索引中的记录是否正确
    const indexRecords = await db.view_membership
      .where('viewId')
      .equals(viewId)
      .toArray();
    
    let correct = 0;
    let extra = 0;
    
    for (const record of indexRecords) {
      const event = await EventService.getEventById(record.eventId);
      if (!event) {
        extra++;
        errors.push({ eventId: record.eventId, issue: 'Event not found' });
        continue;
      }
      
      const shouldInclude = shouldShow(event, viewId, this.context!);
      if (shouldInclude) {
        correct++;
      } else {
        extra++;
        errors.push({ eventId: record.eventId, issue: 'Should not be in index' });
      }
    }
    
    // 2. 检查是否有遗漏（采样检查，避免全表扫描）
    let missing = 0;
    const sampleSize = 1000;
    const allEvents = await db.events.limit(sampleSize).toArray();
    
    for (const event of allEvents) {
      const shouldInclude = shouldShow(event, viewId, this.context!);
      const inIndex = indexRecords.some(r => r.eventId === event.id);
      
      if (shouldInclude && !inIndex) {
        missing++;
        errors.push({ eventId: event.id, issue: 'Missing from index' });
      }
    }
    
    return { correct, missing, extra, errors };
  }
}
```

## 8. 字段架构总结

### 8.1 删除的字段

```typescript
// Event interface - 删除以下字段
interface Event {
  // ❌ 删除
  // isPlan?: boolean;
  // isLibrary?: boolean;
  // isTimeCalendar?: boolean;
  
  // ✅ 保留（其他字段不变）
  id: string;
  title: string;
  checkType?: string;
  isDeleted?: boolean;
  parentEventId?: string;
  calendarIds?: string[];
  startTime?: number;
  endTime?: number;
  // ...
}
```

### 8.2 新增的数据结构

```typescript
// 新增：view_membership 表
interface ViewMembership {
  eventId: string;
  viewId: 'plan' | 'library' | 'timelog' | 'workspace' | 'sky';
  metadata?: any;
  updatedAt: number;
}

// 新增：context 缓存
interface ShouldShowContext {
  timeCalendarIds: Set<string>;
  libraryEventIds: Set<string>;
  pinnedEventIds: Set<string>;
}

// 新增：lib_store 引用表
interface LibraryRecord {
  eventId: string;
  workspaceId?: string;
  order?: number;
  group?: string;
  createdAt: number;
}

// 新增：sky_store 引用表
interface SkyRecord {
  eventId: string;
  pinnedAt: number;
  position?: { x: number; y: number };
  metadata?: any;
}

// 新增：触发字段映射
const VIEW_TRIGGER_FIELDS: Record<string, Set<keyof Event>>;
```

### 8.3 数值设定逻辑完整流程

```
Event 创建
  → EventService.createEvent(data)
    → storageManager.createEvent(data)           // 写入 events 表
    → storageManager.createEventTree(...)        // 写入 event_tree 表
    → ViewMembershipService.createEventMembership(event)
      → 遍历所有 view：['plan', 'library', 'timelog', 'workspace']
      → shouldShow(event, viewId, context)       // 纯函数判断
      → db.view_membership.bulkAdd(memberships)  // 批量写入

Event 更新
  → EventService.updateEvent(eventId, updates)
    → storageManager.updateEvent(eventId, updates)  // 更新 events 表
    → ViewMembershipService.updateEventMembership(eventId, updates)
      → detectAffectedViews(updates)                // 检测触发字段
        // TimeLog 触发字段：['isDeleted']
        // Plan 触发字段：['checkType', 'isDeleted', 'parentEventId', 'calendarIds']
        // Library 触发字段：['isDeleted']（lib_store 变化另案处理）
      → 如果 affectedViews 为空：跳过（例如 eventlog/startTime 变化）
      → 如果有触发字段：
        → getEventById(eventId)                     // 获取完整 Event
        → 遍历 affectedViews
          → shouldShow(event, viewId, context)      // 派生判断（含 isSubordinateEvent）
          → 对比当前索引状态
          → 生成操作：add / remove / skip
        → batchApplyOperations()                    // 批量执行
    → 【可选】物化时间锚点（性能优化，与 membership 独立）
      → if (hasTimeFields(updates))                 // startTime/createdAt/timeSpec 变化
        → resolveTimelineAnchor(updatedEvent)       // 计算锚点
        → storageManager.updateEventTree(eventId, { timelineAnchor })

Event 删除
  → EventService.deleteEvent(eventId)
    → storageManager.updateEvent(eventId, { isDeleted: true })
    → ViewMembershipService.deleteEventMembership(eventId)
      → db.view_membership.where('eventId').equals(eventId).delete()

外部触发（Calendar/Curation 变化）
  → CalendarService.updateCalendarType(calId, type)
    → ViewMembershipService.refreshContext()       // 刷新 timeCalendarIds
    → ViewMembershipService.rebuildViewForCalendar('plan', calId)
      → 查询该 Calendar 下的所有 Event
      → 批量重新计算 shouldShow
      → 批量更新 view_membership

  → LibraryService.addToLibrary(eventId)
    → db.lib_store.add(...)
    → ViewMembershipService.refreshContext()       // 刷新 libraryEventIds
    → db.view_membership.put({ eventId, viewId: 'library' })
```

## 9. 实现优先级

### Phase 1: 核心架构（MVP）
- ✅ 创建 `view_membership` 表
- ✅ 实现 `shouldShow` 纯函数
- ✅ 实现 `ViewMembershipService.initialize/updateEventMembership`
- ✅ 集成到 `EventService.createEvent/updateEvent/deleteEvent`
- ✅ 实现智能触发（`VIEW_TRIGGER_FIELDS`）

### Phase 2: 查询优化
- ✅ 实现 `loadPlanEvents_FINAL` 索引优化查询
- ✅ 同步优化 Library/TimeLog/Workspace 查询路径
- ✅ 删除旧的 `isPlan/isLibrary/isTimeCalendar` 字段

### Phase 3: 数据修复
- ✅ 实现 `rebuildView/rebuildAll`
- ✅ 实现 `verify` 验证机制
- ✅ 添加迁移脚本（将现有数据重建到 view_membership）

### Phase 4: 特殊场景
- ✅ Calendar 变化时的批量更新
- ✅ Curation 变化时的 Library 同步
- ✅ Context 刷新机制

---

## 10. 关键概念澄清（FAQ）

### 10.1 calendarIds 是什么？

**问题**：`calendarIds` 是 Event ID 之外各个 view 的 ID 吗？Calendar 需要 ID 吗？

**答案**：

- **`calendarIds` 是 Event 的字段**，存储该事件关联的日历容器 ID（Sync 意图字段）
- **不是 view ID**，而是 **Calendar 实体的 ID**（例如：Google Calendar 的日历 ID、Outlook 的日历 ID）
- **为什么需要 Calendar ID？**
  - **多日历场景**：用户可能有多个日历（工作日历、个人日历、家庭日历等）
  - **同步目标**：`calendarIds` 告诉 Sync 模块"这个事件应该同步到哪些日历"
  - **过滤/分组**：Calendar 可以有类型（`type: 'time' | 'task' | 'general'`），用于判断 membership

**示例**：
```typescript
// Calendar 实体
const calendar1 = {
  id: 'cal-google-work',      // Calendar ID
  name: '工作日历',
  type: 'time',               // time calendar（用于 Plan membership 判断）
  provider: 'google',
};

const calendar2 = {
  id: 'cal-outlook-personal',
  name: '个人日历',
  type: 'general',
  provider: 'outlook',
};

// Event 引用 Calendar
const event = {
  id: 'evt-001',
  title: '团队会议',
  calendarIds: ['cal-google-work'],  // 该事件属于工作日历
  // ...
};

// Plan membership 判断
const isFromTimeCalendar = event.calendarIds?.some(id => 
  context.timeCalendarIds.has(id)  // 检查 cal-google-work 是否为 time calendar
);
// 结果：true → 纳入 Plan
```

**与时间排序的关系**：
- ❌ **错误理解**：Calendar 就是时间，所以不需要 ID
- ✅ **正确理解**：Calendar 是容器/分类，时间排序使用 `startTime/endTime` 或 `resolveTimelineAnchor()`

### 10.2 lib_store 如何工作？

**问题**：`lib_store` 当前设计是怎么工作的？

**答案**：

`lib_store` 是一个**独立的引用表**（不在 Event 字段内），用于记录"用户精选/置顶"的事件。

**Schema**（来自 SSOT §4.3.6）：
```typescript
interface LibraryRecord {
  eventId: string;        // 引用的 Event ID
  workspaceId?: string;   // 可选：归属的 workspace（未来扩展）
  order?: number;         // 可选：排序优先级
  group?: string;         // 可选：分组标签
  createdAt: number;      // 添加到 curation 的时间
}

// IndexedDB
const libraryStore = db.createObjectStore('lib_store', { keyPath: 'eventId' });
libraryStore.createIndex('by_workspaceId', 'workspaceId');
```

**工作流程**：

1. **添加到 Library**（用户操作）：
```typescript
// 用户点击"添加到 Library"
await db.lib_store.add({
  eventId: 'evt-001',
  createdAt: Date.now(),
});

// 触发 view_membership 更新
await ViewMembershipService.refreshContext();  // 刷新 libraryEventIds
await db.view_membership.put({
  eventId: 'evt-001',
  viewId: 'library',
  updatedAt: Date.now(),
});
```

2. **Library 查询**（加载页面）：
```typescript
// 方式 1：查询 lib_store
const libraryRecords = await db.lib_store.toArray();
const eventIds = libraryRecords.map(r => r.eventId);
const events = await EventService.getEventsByIds(eventIds);

// 方式 2（优化版）：查询 view_membership 索引
const memberships = await db.view_membership
  .where('viewId')
  .equals('library')
  .toArray();
const eventIds = memberships.map(m => m.eventId);
const events = await EventService.getEventsByIds(eventIds);
```

3. **移出 Library**（用户操作）：
```typescript
// 用户点击"从 Library 移除"
await db.lib_store.delete('evt-001');

// 同步删除 view_membership
await ViewMembershipService.refreshContext();
await db.view_membership.delete(['evt-001', 'library']);
```

**关键特性**：
- ✅ **独立于 Event**：library 状态不污染 Event 字段，避免同步冲突
- ✅ **本地为主**：默认本地存储，多端同步由应用自有机制处理（另案）
- ✅ **显式用户意图**：只有用户主动操作才会写入，不会自动推断

### 10.3 TimeLog 与 Plan/Note 的挂载逻辑

**问题**：TimeLog 针对 Plan 和 Note 的挂载问题是什么？

**答案**：

TimeLog 是**时间轴视图**，按时间聚合显示所有有时间记录的事件，不限来源。

**核心原则**：
- ✅ TimeLog = 所有有 `startTime` 或 `endTime` 的事件
- ✅ 不限制来源：Plan 事件、Note 事件、TimeLog 快速记录，只要有时间就纳入
- ✅ 保留原属性：事件在 TimeLog 中显示时，保留其原有属性（checkType、parentEventId、eventlog等）

**纳入规则**：
```typescript
function shouldShow_TimeLog(event: Event): boolean {
  if (event.isDeleted) return false;
  
  // 有实际时间记录（startTime 或 endTime 任一存在）
  return event.startTime != null || event.endTime != null;
}
```

**挂载关系说明**：

1. **Plan 事件在 TimeLog 中**：
```typescript
// Plan 中的会议事件
const meeting = {
  id: 'evt-meeting-001',
  title: '团队周会',
  checkType: 'event',          // Plan 属性：事件类型
  parentEventId: 'project-A',  // Plan 属性：树形结构
  startTime: 1704528000000,    // 2024-01-06 14:00
  endTime: 1704531600000,      // 2024-01-06 15:00
};

// TimeLog 查询结果：
view_membership.where('viewId').equals('timelog')
  → 包含 evt-meeting-001（因为有 startTime/endTime）

// TimeLog 显示时：
// - 按 startTime 排序在时间轴上
// - 显示 title: "团队周会"
// - 可选：显示 checkType 图标（📅）
// - 可选：点击跳转到 Plan 页面的树形位置
```

2. **Note 事件在 TimeLog 中**：
```typescript
// 用户在 Note 中添加时间的笔记
const timedNote = {
  id: 'evt-note-001',
  title: '',                   // Note 可能无 title
  eventlog: '今天去咖啡厅工作了一下午，效率很高',
  startTime: 1704528000000,    // 用户标注：14:00 开始
  endTime: 1704538800000,      // 用户标注：17:00 结束
  checkType: undefined,        // Note 无 checkType
};

// TimeLog 查询结果：
view_membership.where('viewId').equals('timelog')
  → 包含 evt-note-001（因为有 startTime/endTime）

// TimeLog 显示时：
// - 按 startTime 排序在时间轴上
// - 显示 eventlog 内容预览
// - 可选：显示 Note 标记（📝）
```

3. **TimeLog 快速记录的事件**：
```typescript
// 用户在 TimeLog 页面快速记录
const quickLog = {
  id: 'evt-log-001',
  title: '',
  eventlog: '中午吃了很好吃的日料',
  startTime: 1704517200000,    // 记录时的时间戳
  checkType: undefined,
  isTimeLog: true,             // 可选：标记为 TimeLog 生成（用于统计/过滤）
};

// TimeLog 查询结果：
view_membership.where('viewId').equals('timelog')
  → 包含 evt-log-001（因为有 startTime）
```

**多视图共存**：

```typescript
// 示例：一个事件可以同时出现在多个 view
const event = {
  id: 'evt-001',
  title: '完成设计稿',
  checkType: 'task',           // → 纳入 Plan（有 checkType）
  startTime: 1704528000000,    // → 纳入 TimeLog（有时间）
  calendarIds: ['cal-work'],   // → 如果 cal-work 是 time calendar，进一步加强 Plan membership
};

// view_membership 结果：
// [
//   { eventId: 'evt-001', viewId: 'plan' },
//   { eventId: 'evt-001', viewId: 'timelog' }
// ]

// 用户体验：
// - Plan 页面：看到"完成设计稿"在待办列表中，可勾选完成
// - TimeLog 页面：看到"完成设计稿"在 14:00 时间轴上，可查看完成时间
```

**触发字段**：
```typescript
VIEW_TRIGGER_FIELDS = {
  timelog: ['startTime', 'endTime', 'isDeleted'],
};

// 示例：时间变化触发 membership 更新
EventService.updateEvent('evt-001', {
  startTime: 1704528000000,  // 添加时间
});
  → detectAffectedViews(['startTime']) → ['timelog']
  → shouldShow_TimeLog(event) → true
  → view_membership.put({ eventId: 'evt-001', viewId: 'timelog' })

// 示例：移除时间触发 membership 删除
EventService.updateEvent('evt-001', {
  startTime: undefined,
  endTime: undefined,
});
  → detectAffectedViews(['startTime', 'endTime']) → ['timelog']
  → shouldShow_TimeLog(event) → false
  → view_membership.delete(['evt-001', 'timelog'])
```

**与 SSOT 的关系**：

TimeLog 的设计完全符合 SSOT（docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md）：
- ✅ 使用 Core 时间字段（`startTime/endTime`）判断 membership
- ✅ 不污染字段：不会为了显示而注入虚拟时间
- ✅ 派生展示：如果需要特殊排序锚点，使用 `resolveTimelineAnchor()` 派生函数
- ✅ 多视图共存：事件可以同时属于 Plan/TimeLog/Library

### 10.4 TimeLog 的设计原则总结（最终修订版）

**TimeLog 是什么？**
- 时间轴聚合视图，按时间锚点排序显示所有事件（不限类型）
- 不是"有时间的事件"过滤器，而是**通用时间轴视图**
- 使用派生函数 `resolveTimelineAnchor()` 计算排序锚点

**TimeLog membership 规则（来自 SSOT）**：
- ✅ 所有非删除、非从属、非系统轨迹的事件都纳入
- ✅ **不基于** `startTime/endTime` 判断是否纳入
- ✅ 保留原属性：checkType、parentEventId、eventlog 等不改变

**时间锚点（排序用，不影响 membership）**：
```typescript
// resolveTimelineAnchor(event, 'timelog') 优先级：
1. startTime（明确的日历时间）
2. timeSpec.resolved（模糊时间解析结果）
3. createdAt（所有事件必有，稳定 fallback）
```

**与其他 view 的关系**：
| Event 类型 | Plan | TimeLog | Library | TimeLog 排序锚点 | 说明 |
|-----------|------|---------|---------|----------------|------|
| 有 checkType 的 Task | ✅ | ✅ | ✅（如精选） | createdAt | Task 在 Plan 管理，在 TimeLog 按创建时间排序 |
| time calendar 事件 | ✅ | ✅ | ✅（如精选） | startTime | 日历事件在 TimeLog 按发生时间排序 |
| 有时间的 Note | ❌ | ✅ | ✅（如精选） | startTime | Note 如果用户标注了时间，按标注时间排序 |
| 无时间的 Note | ❌ | ✅ | ✅（如精选） | createdAt | 纯碎碎念在 TimeLog 按创建时间排序 |
| 快速记录（TimeLog 页面） | ❌ | ✅ | ✅（如精选） | createdAt | 用户在 TimeLog 快速记录，按记录时间排序 |

**触发字段正确性（最终修正版）**：
```typescript
// ✅ 正确（极简触发，派生判断在 shouldShow 中）
timelog: ['isDeleted']

// ❌ 错误版本 1：监听过多系统标记字段
// timelog: ['isDeleted', 'isTimer', 'isTimeLog', 'isOutsideApp']
// 问题：这些系统标记在创建时确定，不应后续变化，无需监听

// ❌ 错误版本 2：监听时间字段
// timelog: ['startTime', 'endTime', 'isDeleted']
// 问题：会导致无时间的 Note 无法纳入

// 说明：
// 1. 触发字段 = 可能变化且影响 membership 的字段
//    - isDeleted: 删除状态可能变化（软删除/恢复）
//    - parentEventId: 在 TimeLog 口径下不影响 membership（子事件也纳入）；因此不作为触发字段
//
// 2. 派生判断 = shouldShow 中的过滤逻辑（不监听字段变化）
//    - isSubordinateEvent(event): 检查 isTimer/isTimeLog/isOutsideApp
//    - 这些标记在创建时确定，不应后续变化
//
// 3. 排序锚点 = resolveTimelineAnchor()（不影响 membership）
//    - startTime/endTime 变化不触发 membership 更新
//    - 只影响 TimeLog 渲染时的排序顺序
//
// 4. 最终口径：不做 kind 迁移
//    - TimeLog 是“时间锚点聚合视图”，不是“类型过滤器”
//    - 触发字段保持最小集合：['isDeleted']
//
// 5. 迁移/修复说明：
//    - 若未来通过 migration 批量修正 isTimer/isTimeLog/isOutsideApp 等 subordinate 标记，
//      不靠 triggers 增量更新；直接对 timelog 做一次 rebuild（或全量 refreshContext + rebuild）。
```

**性能优化：event_tree 锚点物化（可选）**：

**背景**：排序锚点与 membership 是两个独立的关注点
- **Membership**（是否显示）：由 `view_membership` 表管理
- **排序**（显示位置）：由 `resolveTimelineAnchor()` 计算

**方案 1：动态排序（默认方案）**
```typescript
// TimeLog 查询：每次都重新计算锚点
const timelineEvents = await db.view_membership
  .where('viewId').equals('timelog')
  .toArray()
  .then(memberships => EventService.getEventsByIds(memberships.map(m => m.eventId)))
  .then(events => {
    // 动态计算锚点并排序
    return events.sort((a, b) => 
      resolveTimelineAnchor(a) - resolveTimelineAnchor(b)
    );
  });

// 优点：简单，无需维护额外字段
// 缺点：每次查询都要计算锚点（10K 事件约 10-50ms）
```

**方案 2：物化锚点（性能优化）**
```typescript
// 1. event_tree 表增加 timelineAnchor 字段
interface EventTreeIndex {
  id: string;
  parentEventId?: string;
  rootEventId: string;
  timelineAnchor?: number;  // 物化的锚点（Unix ms）
  updatedAt: number;        // 锚点更新时间
}

// 2. EventService.updateEvent 中更新锚点（独立于 membership）
export class EventService {
  static async updateEvent(
    eventId: string,
    updates: Partial<Event>
  ): Promise<void> {
    // 1. 更新 Event
    await storageManager.updateEvent(eventId, updates);
    
    // 2. 更新 view_membership（基于触发字段）
    await ViewMembershipService.updateEventMembership(eventId, updates);
    
    // 3. 更新时间锚点（独立逻辑）
    if (hasTimeFields(updates)) {
      const event = await this.getEventById(eventId);
      if (event) {
        const anchor = resolveTimelineAnchor(event);
        await storageManager.updateEventTree(eventId, { 
          timelineAnchor: anchor,
          updatedAt: Date.now()
        });
      }
    }
  }
}

// hasTimeFields 辅助函数
function hasTimeFields(updates: Partial<Event>): boolean {
  return 'startTime' in updates 
    || 'createdAt' in updates 
    || 'timeSpec' in updates;
}

// 3. TimeLog 查询：使用物化锚点排序
const timelineEvents = await db.view_membership
  .where('viewId').equals('timelog')
  .toArray()
  .then(memberships => EventService.getEventsByIds(memberships.map(m => m.eventId)))
  .then(events => {
    // 从 event_tree 批量获取物化锚点
    return db.event_tree
      .where('id').anyOf(events.map(e => e.id))
      .toArray()
      .then(trees => {
        const anchorMap = new Map(
          trees.map(t => [t.id, t.timelineAnchor])
        );
        
        // 使用物化锚点排序（fallback 到动态计算）
        return events.sort((a, b) => {
          const aAnchor = anchorMap.get(a.id) ?? resolveTimelineAnchor(a);
          const bAnchor = anchorMap.get(b.id) ?? resolveTimelineAnchor(b);
          return aAnchor - bAnchor;
        });
      });
  });

// 优点：查询时排序很快（直接用物化值）
// 缺点：需要维护额外字段，增加写入开销
```

**性能对比**：
| 方案 | 查询性能 | 写入性能 | 复杂度 |
|------|---------|---------|-------|
| 动态排序 | 10K 事件：10-50ms | 无额外开销 | 简单 |
| 物化锚点 | 10K 事件：1-5ms | 时间字段变化时额外写入 | 中等 |

**建议**：
- **MVP 阶段**：使用动态排序（简单，足够快）
- **大规模数据**：切换到物化锚点（10K+ 事件时明显优化）

**关键原则**：
- ✅ 锚点物化是**性能优化**，不是 membership 逻辑的一部分
- ✅ `VIEW_TRIGGER_FIELDS` 只关心 membership，不关心排序
- ✅ 锚点更新在 `EventService.updateEvent` 中单独处理
- ✅ 即使没有物化，系统仍然正确（fallback 到动态计算）

---

## 11. 视图分类设计原则

### 11.1 顶层视图 vs 子视图

**顶层视图**（需要独立 viewId + view_membership 记录）：
- ✅ **Plan**：任务/日历管理视图
- ✅ **Library**：用户精选集合（lib_store 驱动）
- ✅ **TimeLog**：时间轴聚合视图
- ✅ **Workspace**：工作空间视图（未来扩展）
- ✅ **Sky**：Pin to Sky 功能（sky_store 驱动）

**顶层视图**（需要独立 viewId + view_membership 记录）：
- ✅ **Plan**：任务/日历管理视图（PlanManager 组件）
- ✅ **Library**：用户精选集合（lib_store 驱动）
- ✅ **TimeLog**：时间轴聚合视图
- ✅ **Workspace**：工作空间视图（未来扩展）
- ✅ **Sky**：Pin to Sky 功能（sky_store 驱动）

**不在 view_membership 架构中的独立组件**：
- **TimeCalendar**：日历视图组件，直接使用 EventService.getAllEvents()
  - 有 3 个 TUI Calendar 内置面板：AllDay/Task/Deadline
  - 通过 CalendarSettings 控制面板显示和过滤
  - 架构重构后处理方式不变

**判断标准**：
| 特征 | 顶层视图 | 子视图 |
|------|---------|-------|
| Membership 逻辑 | 独立判断规则 | 共享父视图 membership |
| 数据源 | 独立引用表（如 lib_store） | 父视图 + 客户端过滤 |
| 存储开销 | 独立索引 | 无额外存储 |
| 示例 | Library（需要 curation）、Sky（需要 pin） | Task 视图（只是过滤） |

**设计原则**：
- ✅ **避免冗余索引**：如果可以通过 metadata 过滤，不要创建独立 viewId
- ✅ **用户意图驱动**：需要用户主动操作（pin/add to library）的功能，使用顶层视图
- ✅ **性能优化**：子视图的过滤在客户端内存中进行，速度足够快

### 11.2 Sky vs Library 的区别

| 特征 | Library | Sky |
|------|---------|-----|
| 用途 | 精选事件集合 | Pin to Sky（可能有位置信息） |
| 引用表 | lib_store | sky_store |
| 排序 | 可选 order 字段 | pinnedAt（pin 时间） |
| 位置信息 | 无 | 可选 position { x, y } |
| 用户操作 | "Add to Library" | "Pin to Sky" |

**设计考虑**：
- 如果 Sky 和 Library 功能重叠，可以合并为一个视图（使用 metadata 区分）
- 如果 Sky 需要独特的位置/布局信息，应该保持独立

### 11.3 TimeCalendar 与 view_membership 的关系

**重要澄清**：
- ❌ TimeCalendar **不是** view_membership 中的顶层视图
- ✅ TimeCalendar 是独立的 UI 组件，基于 TUI Calendar
- ✅ TimeCalendar 直接使用 `EventService.getAllEvents()` 加载数据
- ✅ TimeCalendar 的 3 个面板是 TUI Calendar 内置功能，不是 view_membership 子视图

**TimeCalendar 面板说明**：

```typescript
// TimeCalendar 的设置（组件内部）
interface CalendarSettings {
  // 面板显示控制
  showDeadline: boolean;  // Deadline (Milestone) 面板
  showTask: boolean;      // Task 面板
  showAllDay: boolean;    // AllDay 面板
  
  // 面板高度 (0-300px)
  deadlineHeight: number;
  taskHeight: number;
  allDayHeight: number;
  
  // 其他设置
  eventOpacity: number;
  visibleTags: string[];
  visibleCalendars: string[];
}
```

**面板派生规则**（基于现状字段）：

```typescript
// TimeCalendar 面板分类逻辑（运行时派生，不存储）
function categorizeEventForCalendar(event: Event): CalendarPanelType {
  // AllDay Panel: 显式全天标志
  if (event.isAllDay === true) {
    return 'allday';
  }
  
  // Deadline/Milestone Panel: 有截止时间
  // 现状：使用 dueDateTime 判断（isDeadline 是辅助标志）
  if (event.dueDateTime != null) {
    return 'milestone';  // TUI Calendar 的 Milestone 面板
  }
  
  // Task Panel: 任务类型
  // 现状/最终：使用 checkType（兼容期允许 isTask）推导
  if (event.checkType != null || event.isTask === true) {
    return 'task';
  }
  
  // Time Grid: 有具体时间的普通事件
  return 'time';  // 显示在主时间网格上
}
```

**字段现状与演进路径**：
**字段现状与口径**：
- ✅ TimeCalendar panels 只做运行时推导：`isAllDay`、`dueDateTime`、`checkType`（兼容 `isTask`）
- ✅ TimeCalendar 不在 view_membership 架构中
- ❌ 不引入/不迁移到 `event.kind/recordClass/origin`（多重角色用 facet + view_membership 表达）
- ❌ **已删除**：`isTimeCalendar`（TimeCalendar 不再使用 view_membership）

**迁移后 TimeCalendar 面板判断**：
**TimeCalendar 面板判断（最终）**：
- Task Panel：`event.checkType != null`（兼容期允许 `event.isTask === true`）
- AllDay Panel：`event.isAllDay === true`
- Deadline Panel：`event.dueDateTime != null`

**与 view_membership 的关系**：
```
view_membership 架构（数据索引）
  ├─ plan: PlanManager 组件
  ├─ library: Library 视图
  ├─ timelog: TimeLog 视图
  ├─ workspace: Workspace 视图
  └─ sky: Sky 视图

独立组件（不使用 view_membership）
  └─ TimeCalendar
      ├─ 数据源：EventService.getAllEvents()
      ├─ 过滤：CalendarSettings.visibleTags/visibleCalendars
      └─ 面板：AllDay/Task/Deadline (TUI Calendar 内置)
```

---

**总结**：
1. **删除字段**：`isPlan`、`isLibrary`、`isTimeCalendar`
2. **新增表**：`view_membership`（唯一 membership 真相）、`sky_store`（Pin to Sky 引用表）
3. **智能触发**：只有影响 membership 的字段变化时才调用 `shouldShow`
4. **性能优化**：索引查询 → 批量加载（10-200x 提升）
5. **数据一致性**：rebuild 机制 + verify 验证
6. **概念澄清**：
   - `calendarIds` = Calendar 容器 ID（Sync 意图）
   - `lib_store` = 独立引用表（Library membership 真相）
   - `sky_store` = 独立引用表（Sky membership 真相）
   - TimeLog = 基于类型判断 + 派生锚点排序（不污染时间字段）
7. **架构范围**：
   - view_membership 管理的顶层视图：Plan/Library/TimeLog/Workspace/Sky（独立 viewId）
   - 独立组件（不在 view_membership 管理范围内）：TimeCalendar（使用 EventService.getAllEvents()）
   - Plan/TimeLog 无子视图定义（如需过滤，在组件内进行）
   - TimeCalendar 的 AllDay/Task/Deadline 是 TUI Calendar 内置面板，不是 view_membership 子视图


