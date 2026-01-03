/**
 * Outlook/Microsoft Graph API 字段映射工具
 * 
 * 定义哪些字段应该同步到 Outlook，哪些是 4DNote 内部字段
 */

import { Contact, Event } from '../types';

/**
 * Microsoft Graph Calendar Event 支持的字段
 * 参考：https://learn.microsoft.com/en-us/graph/api/resources/event
 */
export const OUTLOOK_SUPPORTED_FIELDS = {
  // 基础字段
  subject: true,          // 标题
  body: true,             // 内容/描述
  start: true,            // 开始时间
  end: true,              // 结束时间
  isAllDay: true,         // 全天事件
  
  // 位置和参与者
  location: true,         // 地点
  locations: true,        // 多个地点（可选）
  attendees: true,        // 参与者列表
  organizer: true,        // 组织者（只读）
  
  // 分类和标记
  categories: true,       // Outlook 分类（不是 4DNote tags）
  importance: true,       // 重要性（low/normal/high）
  sensitivity: true,      // 敏感度（normal/personal/private/confidential）
  showAs: true,           // 显示为（free/tentative/busy/oof/workingElsewhere/unknown）
  
  // 提醒和重复
  isReminderOn: true,     // 是否开启提醒
  reminderMinutesBeforeStart: true, // 提醒时间（分钟）
  recurrence: true,       // 重复规则（暂不支持）
  
  // 元数据（只读）
  id: true,               // Outlook 事件 ID（只读）
  createdDateTime: true,  // 创建时间（只读）
  lastModifiedDateTime: true, // 最后修改时间（只读）
} as const;

/**
 * Microsoft To Do Task 支持的字段
 * 参考：https://learn.microsoft.com/en-us/graph/api/resources/todotask
 */
export const TODO_SUPPORTED_FIELDS = {
  // 基础字段
  title: true,                  // 任务标题
  body: true,                   // 任务正文
  status: true,                 // 状态（notStarted/inProgress/completed/waitingOnOthers/deferred）
  importance: true,             // 重要性（low/normal/high）
  
  // 时间字段
  dueDateTime: true,            // 截止日期
  reminderDateTime: true,       // 提醒时间
  isReminderOn: true,           // 是否开启提醒
  completedDateTime: true,      // 完成时间（只读）
  
  // 分类（⚠️ To Do 使用 categories，不是 tags）
  categories: true,             // Microsoft To Do 分类（字符串数组）
  
  // 元数据（只读）
  id: true,                     // 任务 ID（只读）
  createdDateTime: true,        // 创建时间（只读）
  lastModifiedDateTime: true,   // 最后修改时间（只读）
  
  // 不支持的字段
  // ❌ attendees - To Do 不支持参与者
  // ❌ location - To Do 不支持地点
  // ❌ startTime/endTime - To Do 只有 dueDateTime
} as const;

/**
 * 4DNote 内部专属字段（不应该同步到 Outlook/To Do）
 */
export const INTERNAL_ONLY_FIELDS = new Set([
  // 内部标识
  'fourDNoteSource',
  'remarkableSource',
  'isTimer',
  'isPlan',
  'isTimeCalendar',
  'isTask',
  'isDeadline',
  'isMilestone',
  
  // 同步配置
  'calendarIds',
  'todoListIds',          // To Do List 分组（内部配置）
  'syncMode',
  'subEventConfig',
  'externalId',
  'syncStatus',
  'syncedPlanCalendars',
  'syncedActualCalendars',
  'hasCustomSyncConfig',
  'lastSyncTime',
  
  // 4DNote 标签系统
  'tags',                 // 4DNote 标签ID（Outlook/To Do 使用 categories）
  'tagId',
  
  // 事件关系
  'parentEventId',
  'linkedEventIds',
  'backlinks',
  'parentTaskId',         // 父任务（内部关系）
  
  // 富文本系统
  'eventlog',             // Slate JSON 富文本（转换后的 description 会同步）
  'fullTitle',            // 富文本标题（转换后的 simpleTitle 会同步）
  'colorTitle',
  'formatMap',
  
  // UI 状态（⚠️ checked/unchecked 是 UI 勾选状态，不是完成状态）
  'checked',              // UI 勾选状态（不同步）
  'unchecked',            // UI 未勾选状态（不同步）
  'isCollapsed',
  'isSelected',
  
  // 内部元数据
  'localVersion',
  'lastLocalChange',
  'timeSpec',             // 时间意图对象（转换后的 startTime/endTime 会同步）
  'displayHint',
  'source',               // 内部来源标记
  'type',                 // 内部类型标记
  'content',              // 废弃字段
  'notes',                // 内部备注
  
  // 计时器专用
  'duration',             // 持续时长（秒）- Outlook 从 start/end 计算
  'elapsedTime',
  'isPaused',
  
  // 临时 ID 追踪
  '_isTempId',
  '_originalTempId',
]);

/**
 * 4DNote Event → Outlook Calendar Event 字段映射
 */
export function mapEventToOutlookFields(event: Event): Record<string, any> {
  const outlookEvent: Record<string, any> = {};
  
  // 标题：使用 simpleTitle（纯文本）
  if (event.title?.simpleTitle) {
    outlookEvent.subject = event.title.simpleTitle;
  }
  
  // 描述：使用 description（已包含签名）
  if (event.description) {
    outlookEvent.body = {
      contentType: 'text',  // 使用纯文本，避免 HTML 冲突
      content: event.description
    };
  }
  
  // 开始时间（直接使用 TimeSpec 格式）
  if (event.startTime) {
    outlookEvent.start = {
      dateTime: event.startTime,
      timeZone: 'Asia/Shanghai'
    };
  }
  
  if (event.endTime) {
    outlookEvent.end = {
      dateTime: event.endTime,
      timeZone: 'Asia/Shanghai'
    };
  }
  
  // 全天事件
  if (typeof event.isAllDay === 'boolean') {
    outlookEvent.isAllDay = event.isAllDay;
  }
  
  // 地点
  if (event.location) {
    outlookEvent.location = {
      displayName: typeof event.location === 'string' 
        ? event.location 
        : event.location.displayName
    };
  }
  
  // 参与者：只同步有邮箱的参与者
  // ⚠️ 4DNote 支持无邮箱的联系人（只有名字），但 Outlook 不支持
  if (event.attendees && event.attendees.length > 0) {
    const validAttendees = event.attendees
      .filter(attendee => attendee.email && attendee.email.trim())  // 只同步有邮箱的
      .map(attendee => ({
        emailAddress: {
          address: attendee.email!,
          name: attendee.name || attendee.email!
        },
        type: 'required'  // 默认必需参与者
      }));
    
    // 只有存在有效参与者时才设置字段
    if (validAttendees.length > 0) {
      outlookEvent.attendees = validAttendees;
    }
  }
  
  // 提醒
  if (event.reminder !== undefined) {
    if (event.reminder > 0) {
      outlookEvent.isReminderOn = true;
      outlookEvent.reminderMinutesBeforeStart = event.reminder;
    } else {
      outlookEvent.isReminderOn = false;
    }
  }
  
  return outlookEvent;
}

/**
 * 4DNote Event → Microsoft To Do Task 字段映射
 * 参考：https://learn.microsoft.com/en-us/graph/api/resources/todotask
 */
export function mapEventToTodoTask(event: Event): Record<string, any> {
  const todoTask: Record<string, any> = {};
  
  // 标题（必需）
  todoTask.title = event.title?.simpleTitle || 'Untitled Task';
  
  // 正文/描述
  if (event.description) {
    todoTask.body = {
      content: event.description,
      contentType: 'text'
    };
  }
  
  // 🎯 截止日期/时间：取最早的时间点
  // 优先级：startTime > dueDateTime > endTime
  // 逻辑：任务的"截止"应该是开始做的时间，而不是结束时间
  const dueDateTimeCandidates = [
    event.startTime,
    event.dueDateTime,
    event.endTime
  ].filter(t => t && t !== ''); // 过滤空值和 undefined
  
  const earliestTime = dueDateTimeCandidates.length > 0 
    ? dueDateTimeCandidates.reduce((earliest, current) => {
        return new Date(current) < new Date(earliest) ? current : earliest;
      })
    : null;
  
  // 直接使用 TimeSpec 格式（Microsoft Graph API 接受）
  if (earliestTime) {
    todoTask.dueDateTime = {
      dateTime: earliestTime,
      timeZone: 'Asia/Shanghai'
    };
  }
  
  // 完成状态
  if (event.isCompleted !== undefined) {
    todoTask.status = event.isCompleted ? 'completed' : 'notStarted';
  }
  
  // 重要性
  if (event.priority) {
    // 4DNote: 'low' | 'medium' | 'high' | 'urgent'
    // To Do: 'low' | 'normal' | 'high'
    const importanceMap: Record<string, string> = {
      'low': 'low',
      'medium': 'normal',
      'high': 'high',
      'urgent': 'high'
    };
    todoTask.importance = importanceMap[event.priority] || 'normal';
  }
  
  // 提醒（使用最早的时间点，直接使用 TimeSpec 格式）
  if (event.reminder !== undefined && event.reminder > 0 && earliestTime) {
    todoTask.isReminderOn = true;
    todoTask.reminderDateTime = {
      dateTime: earliestTime,
      timeZone: 'Asia/Shanghai'
    };
  }
  
  return todoTask;
}

/**
 * Microsoft To Do 同步对比字段
 * 注意：
 * - isCompleted: 对应 To Do 的 status 字段
 * - priority: 4DNote 当前不支持，未来可能映射到 importance
 * - dueDateTime: 会映射到 To Do 的 dueDateTime，但不在此列表中单独对比
 */
export const TODO_SYNC_FIELDS = [
  'isCompleted',  // 任务完成状态（To Do status）
] as const;

/**
 * 不应该做 diff 对比的字段（内部字段或只读字段）
 */
export const NON_COMPARABLE_FIELDS = [
  ...Array.from(INTERNAL_ONLY_FIELDS),
  'id',
  'createdAt',
  'updatedAt',
  'createdDateTime',
  'lastModifiedDateTime',
  'completedDateTime',
];

/**
 * 合并远程 attendees 到本地时的智能处理
 * 
 * 规则：
 * - 如果远程返回空数组，检查本地是否有无邮箱的参与者
 * - 如果本地有无邮箱参与者，保留他们（因为它们不会被同步到 Outlook）
 * - 如果本地都是有邮箱的参与者，接受远程的空数组（说明被删除了）
 * 
 * @param localAttendees 本地参与者列表
 * @param remoteAttendees 远程参与者列表
 * @returns 合并后的参与者列表
 */
export function mergeAttendees(
  localAttendees: Contact[] | undefined,
  remoteAttendees: Contact[] | undefined
): Contact[] | undefined {
  // 如果远程有参与者，直接使用远程的
  if (remoteAttendees && remoteAttendees.length > 0) {
    // 但要保留本地的无邮箱参与者
    const localNoEmailAttendees = (localAttendees || [])
      .filter(a => !a.email || !a.email.trim());
    
    return [...remoteAttendees, ...localNoEmailAttendees];
  }
  
  // 如果远程是空数组，检查本地是否有无邮箱的参与者
  if (remoteAttendees && remoteAttendees.length === 0) {
    const localNoEmailAttendees = (localAttendees || [])
      .filter(a => !a.email || !a.email.trim());
    
    // 如果本地有无邮箱参与者，保留他们
    if (localNoEmailAttendees.length > 0) {
      return localNoEmailAttendees;
    }
    
    // 否则接受远程的空数组
    return [];
  }
  
  // 如果远程是 undefined，保留本地的
  return localAttendees;
}

/**
 * 过滤出需要同步到 Outlook 的字段（用于增量 patch）
 */
export function filterOutlookSyncFields<T extends Record<string, any>>(data: T): Partial<T> {
  const filtered: Partial<T> = {};

  for (const [key, value] of Object.entries(data)) {
    if (shouldSyncFieldToOutlook(key)) {
      (filtered as any)[key] = value;
    }
  }

  return filtered;
}

/**
 * 检测字段变更是否需要同步到 Outlook
 * 
 * @param changes 变更的字段列表
 * @returns 是否有需要同步的变更
 */
export function hasOutlookRelevantChanges(changes: string[]): boolean {
  return changes.some(field => shouldSyncFieldToOutlook(field));
}

/**
 * 获取需要同步的字段列表（用于 diff 对比）
 */
export const SYNC_COMPARABLE_FIELDS = [
  'title',        // 对比 simpleTitle
  'description',  // 对比纯文本内容
  'startTime',
  'endTime',
  'isAllDay',
  'location',
  'attendees',    // 对比参与者列表
  'reminder',
  'isCompleted',  // Microsoft To Do: status
  'categories'    // Outlook: categories
] as const;

/**
 * 判断某个 4DNote 字段是否会影响 Outlook/ToDo 同步
 */
export function shouldSyncFieldToOutlook(field: string): boolean {
  if (INTERNAL_ONLY_FIELDS.has(field)) return false;
  return (SYNC_COMPARABLE_FIELDS as readonly string[]).includes(field);
}
