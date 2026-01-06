export interface TimerSession {
  id: string;
  taskName: string;
  duration: number; // 持续时间（秒）
  startTime: string;    // 🔧 修改：使用字符串存储本地时间
  endTime: string;      // 🔧 修改：使用字符串存储本地时间
  completedAt: string;  // 🔧 修改：使用字符串存储本地时间
  description?: string; // 🆕 添加：描述内容
  tags?: string[];      // 🆕 添加：标签支持
}

/**
 * 签到类型
 */
export type CheckType = 'none' | 'once' | 'recurring';

/**
 * 循环周期配置
 */
export interface RecurringConfig {
  /** 循环类型: daily(每天), weekly(每周), monthly(每月), custom(自定义) */
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  /** 每周哪几天（0-6，0=周日）- 用于 weekly 类型 */
  weekDays?: number[];
  /** 每月哪几天（1-31）- 用于 monthly 类型 */
  monthDays?: number[];
  /** 间隔天数 - 用于 custom 类型 */
  intervalDays?: number;
  /** 循环开始日期 */
  startDate?: string;
  /** 循环结束日期（可选，不设置则无限循环） */
  endDate?: string;
}

/**
 * 同步状态枚举
 * 用于标识事件的同步状态
 */
export enum SyncStatus {
  /** 本地创建，仅存储在本地，不同步到云端（如运行中的Timer） */
  LOCAL_ONLY = 'local-only',
  /** 等待同步到云端 */
  PENDING = 'pending',
  /** 已成功同步到 Outlook */
  SYNCED = 'synced',
  /** 同步冲突（本地和云端都有修改） */
  CONFLICT = 'conflict',
  /** 同步失败 */
  ERROR = 'error'
}

/**
 * 同步状态类型（向后兼容）
 */
export type SyncStatusType = 'pending' | 'synced' | 'error' | 'local-only' | 'conflict';

/**
 * 附件类型枚举
 */
export enum AttachmentType {
  VOICE_RECORDING = 'voice-recording',  // 🎤 语音记录（实时录音）
  IMAGE = 'image',                       // 🖼️ 图片
  AUDIO = 'audio',                       // 🎵 音频文件
  VIDEO = 'video',                       // 🎥 视频
  DOCUMENT = 'document',                 // 📄 文档（PDF、Word等）
  SUB_EVENT = 'sub-event',              // 🔗 子事件/子页面
  WEB_CLIP = 'web-clip',                // 📺 网页收藏
}

/**
 * 附件浏览模式
 */
export enum AttachmentViewMode {
  EDITOR = 'editor',           // 编辑模式（默认）
  GALLERY = 'gallery',         // 图册模式（图片）
  VIDEO_STREAM = 'video-stream', // 视频流模式（视频）
  AUDIO_STREAM = 'audio-stream', // 音频流模式（音频）
  TRANSCRIPT = 'transcript',   // 转写文本模式（语音记录）
  DOCUMENT_LIB = 'document-lib', // 文档库模式（文档）
  TREE_NAV = 'tree-nav',       // 树形导航模式（子页面）
  BOOKMARK = 'bookmark',       // 书签模式（网页收藏）
}

/**
 * AI 纪要数据
 */
export interface TranscriptData {
  // 原始转写文本（AI 生成，不可编辑）
  rawTranscript: string;
  
  // 用户编辑后的纪要（可保存）
  editedSummary?: string;
  
  // AI 生成的摘要
  aiSummary?: string;
  
  // 分段转写（带时间戳）
  segments?: Array<{
    start: number;      // 开始时间（秒）
    end: number;        // 结束时间（秒）
    text: string;       // 文本内容
    speaker?: string;   // 说话人（如果支持）
  }>;
  
  // 提取的关键信息
  keyPoints?: string[];
  actionItems?: string[];
  
  // 转写状态
  status: 'processing' | 'completed' | 'failed';
  processedAt?: string;
  error?: string;
}

/**
 * 附件元数据
 * 用于 Event.eventlog.attachments
 */
export interface Attachment {
  id: string;
  type: AttachmentType;      // 附件类型（新增）
  filename: string;
  size: number;              // 文件大小（字节）
  // 兼容字段：部分 UI/旧逻辑仍使用 fileSize
  fileSize?: number;
  mimeType: string;          // MIME 类型
  localPath?: string;        // 本地路径（Electron userData/attachments/）
  // 兼容字段：部分 UI/旧逻辑使用 fullPath
  fullPath?: string;
  cloudUrl?: string;         // 云端 URL（OneDrive）
  thumbnailPath?: string;    // 缩略图路径（图片/视频）

  // 兼容字段：UI 展示用标题/扩展信息
  caption?: string;
  metadata?: Record<string, any>;
  
  // 状态
  status: 'local-only' | 'synced' | 'pending-upload' | 'cloud-only' | 'upload-failed';
  uploadedAt: string;        // 上传时间
  lastAccessedAt?: string;   // 最后访问时间
  isPinned?: boolean;        // 是否固定（不自动清理）
  
  // 时间信息（用于排序）
  timestamp: string;         // 拍摄/录制/创建时间（优先用 EXIF）
  
  // 图片特定字段
  width?: number;            // 原始宽度
  height?: number;           // 原始高度
  exifData?: any;            // EXIF 信息（GPS、相机型号等）
  
  // 音频/视频特定字段
  duration?: number;         // 时长（秒）
  
  // 语音记录特定字段
  transcriptData?: TranscriptData;  // AI 转写数据
  
  // 文档特定字段
  pageCount?: number;        // 页数（PDF）
  extractedText?: string;    // OCR 提取的文本
  
  // 子事件特定字段
  linkedEventId?: string;    // 关联的子事件 ID
  
  // 网页收藏特定字段
  webUrl?: string;           // 原始 URL
  webTitle?: string;         // 网页标题
  webFavicon?: string;       // 网站图标
}

/**
 * EventLog 版本快照
 * 用于版本控制和冲突解决
 */
export interface EventLogVersion {
  id: string;
  createdAt: string;         // 版本创建时间
  content: string;           // Slate JSON 快照
  diff?: any;                // Delta（可选，用于压缩存储）
  triggerType: 'auto' | 'manual' | 'sync' | 'conflict-resolved';
  changesSummary?: string;   // 变更摘要（如 "添加 3 段，删除 1 段"）
  contentHash?: string;      // SHA-256 哈希
}

/**
 * EventLog 同步状态
 */
export interface EventLogSyncState {
  lastSyncedAt?: string;     // 最后同步时间
  contentHash?: string;      // 内容哈希（用于冲突检测）
  status?: 'pending' | 'synced' | 'conflict';
}

/**
 * EventLog 完整结构
 * 用于 Event.eventlog 字段（重构后）
 */
/**
 * 二维码信息（AI 提取）
 */
export interface QRCodeInfo {
  id: string;                   // 唯一标识
  content: string;              // 二维码内容
  type: 'url' | 'text' | 'vcard' | 'wifi' | 'email' | 'phone' | 'sms' | 'geo' | 'unknown';
  url?: string;                 // 如果是 URL 类型，解析后的 URL
  metadata?: {
    title?: string;             // 标题（如 "报名链接"）
    description?: string;       // 描述
    action?: string;            // 建议操作（如 "报名"、"观看视频"）
  };
  imageData?: string;           // 二维码图片 base64（可下载）
  extractedAt: string;          // 提取时间
}

export interface EventLog {
  slateJson: string;            // Slate JSON 格式（主数据源，用户编辑）
  html?: string;                // HTML 格式（渲染用，Outlook 同步）
  plainText?: string;           // 纯文本（搜索优化，性能缓存）
  wordCount?: number;           // 字数（性能缓存）
  characterCount?: number;      // 字符数（性能缓存）
  lastEditedAt?: string;        // 最后编辑时间（性能缓存/同步辅助）
  attachments?: Attachment[];   // 附件列表
  qrCodes?: QRCodeInfo[];       // 二维码列表（AI 提取）⭐ 新增
  versions?: EventLogVersion[]; // 版本历史（最多 50 个）
  syncState?: EventLogSyncState; // 同步状态
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 联系人平台来源
 */
export type ContactSource = '4dnote' | 'outlook' | 'google' | 'icloud';

/**
 * 参会人类型
 */
export type AttendeeType = 'required' | 'optional' | 'resource';

/**
 * 参会人响应状态
 */
export type AttendeeStatus = 'accepted' | 'declined' | 'tentative' | 'none';

/**
 * 计划安排同步配置类型
 */
export type PlanSyncMode = 
  | 'receive-only'           // 只接收
  | 'send-only'              // 只发送（全部参会人）
  | 'send-only-private'      // 只发送（仅自己）⭐ 新增
  | 'bidirectional'          // 双向同步（全部参会人）
  | 'bidirectional-private'; // 双向同步（仅自己）⭐ 新增

/**
 * 实际进展同步配置类型  
 */
export type ActualSyncMode = 
  | 'send-only'              // 只发送（全部参会人）
  | 'send-only-private'      // 只发送（仅自己）⭐ 新增
  | 'bidirectional'          // 双向同步（全部参会人）
  | 'bidirectional-private'; // 双向同步（仅自己）⭐ 新增
  // 注意：Actual 不支持 receive-only，外部信息都应该归为 Plan

/**
 * 计划安排同步配置
 */
export interface PlanSyncConfig {
  mode: PlanSyncMode;
  targetCalendars: string[];  // 目标日历 ID 列表
}

/**
 * 实际进展同步配置
 */
export interface ActualSyncConfig {
  mode: ActualSyncMode;
  targetCalendars: string[];  // 目标日历 ID 列表
}

/**
 * 地点对象
 * 支持高德地图 API 返回的地点信息
 */
export interface LocationObject {
  /** 显示名称（必填） */
  displayName?: string;
  /** 详细地址 */
  address?: string;
  /** 地点 ID（高德地图） */
  id?: string;
  /** 坐标信息 */
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  /** 其他扩展信息 */
  [key: string]: any;
}

/**
 * 统一的联系人接口
 * 支持 4DNote 本地联系人和各云平台联系人
 */
export interface Contact {
  /** 联系人 ID */
  id?: string;
  /** 姓名 */
  name?: string;
  /** 邮箱地址 */
  email?: string;
  /** 电话号码 */
  phone?: string;
  /** 头像 URL */
  avatarUrl?: string;
  /** 所属组织/公司 */
  organization?: string;
  /** 职位 */
  position?: string;
  /** 平台来源标识 */
  is4DNote?: boolean;
  isOutlook?: boolean;
  isGoogle?: boolean;
  isiCloud?: boolean;
  /** 参会人相关属性（当作为 Event.attendees 使用时） */
  type?: AttendeeType;
  status?: AttendeeStatus;
  /** 外部平台的原始 ID */
  externalId?: string;
  /** 备注信息 */
  notes?: string;
  /** 时间戳 */
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 富文本格式映射：用于记忆文本片段的格式
 * 场景：用户在 Outlook 编辑后，纯文本可以恢复之前的格式
 */
export interface TextFormatSegment {
  /** 文本片段 */
  text: string;
  /** 格式属性 */
  format: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    color?: string;
    backgroundColor?: string;
  };
}

/**
 * 标题三层架构 (v2.14)
 * - fullTitle: Slate JSON 格式（完整，包含标签/元素）
 * - colorTitle: Slate JSON 格式（简化，移除 tag/dateMention 元素，保留文本格式）
 * - simpleTitle: 纯文本（TimeCalendar/Outlook 同步）
 * - formatMap: 富文本格式映射（用于恢复格式）
 */
export interface EventTitle {
  /** Slate JSON 格式 - 包含完整元素信息（标签、DateMention 等） */
  fullTitle?: string;
  
  /** Slate JSON 格式 - 移除元素节点，仅保留文本和格式（bold/color 等） */
  colorTitle?: string;
  
  /** 纯文本 - 用于搜索、同步、简单显示 */
  simpleTitle?: string;
  
  /** 富文本格式映射 - 用于从纯文本恢复格式 */
  formatMap?: TextFormatSegment[];
}

export interface Event {
  id: string;
  // ========== 标题字段（三层架构 v2.14） ==========
  title: EventTitle;          // 统一标题对象（自动降级/升级）
  description?: string;       // 纯文本描述（后台字段，仅用于Outlook同步）
  // ========== 时间字段（由 TimeHub 管理） ==========
  // ⚠️ v1.8 重要变更：时间字段允许 undefined
  // - Task 类型（isTask=true）：时间可选，支持无时间待办事项
  // - Calendar 事件（isTask=false/undefined）：时间必需，同步到 Outlook Calendar
  startTime?: string;   // 开始时间（'YYYY-MM-DD HH:mm:ss' 格式 或 undefined）
  endTime?: string;     // 结束时间（'YYYY-MM-DD HH:mm:ss' 格式 或 undefined）
  isAllDay?: boolean;   // 是否全天事件（undefined 表示未设置）
  location?: string | LocationObject;  // 🔧 双格式支持：string（外部/Outlook）或 LocationObject（内部/地图API）
  organizer?: Contact;  // 🔧 修改：使用统一的 Contact 接口
  attendees?: Contact[]; // 🔧 修改：使用统一的 Contact 接口
  reminder?: number;
  externalId?: string;
  calendarIds?: string[]; // 🆕 多日历分组支持（用于事件同步到 Calendar）
  syncMode?: string; // 🔧 新增：同步模式（单一数据结构，替代 planSyncConfig/actualSyncConfig 的 mode 字段）
  subEventConfig?: {
    calendarIds?: string[];  // 子事件默认日历配置（父事件专用，用于创建子事件时继承）
    syncMode?: string;       // 子事件默认同步模式
  };
  hasCustomSyncConfig?: boolean; // 🆕 标记用户是否手动修改过同步配置（用于手动子事件继承逻辑）
  todoListIds?: string[]; // 🆕 To Do List 分组支持（用于任务同步到 To Do）
  source?: 'local' | 'outlook' | 'google' | 'icloud'; // 🆕 事件来源
  syncStatus?: SyncStatusType; // 🔧 unified: 'pending' 表示所有待同步状态（新建或更新）
  lastSyncTime?: string; // 🔧 修改：使用字符串存储本地时间
  createdAt: string;     // 🔧 修改：使用字符串存储本地时间
  updatedAt: string;     // 🔧 修改：使用字符串存储本地时间
  deletedAt?: string | null; // 🆕 v3.0: 软删除时间戳（null=未删除，本地格式 YYYY-MM-DD HH:mm:ss=已删除）
  timerSessionId?: string;
  tags?: string[];       // 🆕 多标签支持
  category?: string;
  fourDNoteSource?: boolean;
  localVersion?: number;
  lastLocalChange?: string; // 🔧 修改：使用字符串存储本地时间
  // 🎯 事件类型标记（用于控制显示样式）
  isTimer?: boolean;     // 🆕 添加：标记为计时器事件
  isTimeLog?: boolean;   // 🆕 添加：标记为纯系统时间日志事件（如自动记录的活动轨迹）
  isOutsideApp?: boolean; // 🆕 添加：标记为外部应用数据（如听歌记录、录屏等）
  isDeadline?: boolean; // 🆕 添加：标记为截止日期事件
  isTask?: boolean;      // 🆕 添加：标记为任务事件
  isPlan?: boolean;      // 🆕 添加：标记为计划页面事件
  isTimeCalendar?: boolean; // 🆕 添加：标记为 TimeCalendar 页面创建的事件
  isNote?: boolean;      // 🆕 v2.19: 用户标记的重要笔记（NoteTree功能）- 在侧边栏快速访问
  // 🆕 统一时间规范（不破坏现有 startTime/endTime，作为"意图+解析"来源）
  timeSpec?: import('./types/time').TimeSpec;
  displayHint?: string | null; // 🆕 v1.1: 模糊时间表述（"本周"、"下周"等），用于保留用户原始输入
  
  // 🆕 v2.6: 模糊日期与时间字段状态
  isFuzzyDate?: boolean;  // 是否为模糊日期（"下周"、"本周"等快捷按钮生成）
  timeFieldState?: [number, number, number, number];  // [startTime, endTime, dueDate, allDay] - 1=用户设置，0=未设置/默认
  
  // 🆕 v2.7: 模糊时间段支持
  isFuzzyTime?: boolean;  // 是否为模糊时间段（"上午"、"下午"、"晚上"等）
  fuzzyTimeName?: string; // 模糊时间段名称（用于显示，如"上午"）
  
  // 🔥 v2.15: 临时ID追踪系统（用于解决bulletLevel临时ID问题）
  _isTempId?: boolean;    // 标记当前ID是否为临时ID（line-xxx格式）
  _originalTempId?: string; // 保存原始临时ID，用于EventHistory追踪和父子关系替换
  
  // 🔧 Plan 相关字段（从 PlanItem 合并）
  // ⚠️ DEPRECATED: content 字段已废弃，使用 fullTitle 代替
  content?: string;      // 废弃：请使用 fullTitle
  emoji?: string;        // emoji 图标
  color?: string;        // 自定义颜色
  dueDateTime?: string;      // 截止日期/时间（用于任务类型，支持模糊时间）
  notes?: string;        // 备注
  isCompleted?: boolean; // 是否完成
  // ⚠️ DEPRECATED: level 字段已废弃，层级由 bulletLevel 动态计算（从 EventTree 关系推导）
  mode?: 'title' | 'eventlog'; // 显示模式（title或eventlog行）
  type?: 'todo' | 'task' | 'event'; // 事件类型（向后兼容）
  
  // 🆕 v1.8: Rich-text description support
  // 🔧 v2.0: 重构为完整的 EventLog 对象
  /**
   * 富文本日志字段
   * 
   * ⚠️ 兼容性说明：
   * - 旧数据：string（HTML 格式）
   * - 新数据：EventLog 对象（Slate JSON + 元数据）
   * 
   * 使用方式：
   * ```typescript
   * // 读取时检测类型
   * if (typeof event.eventlog === 'string') {
   *   // 旧格式：HTML 字符串
   *   const html = event.eventlog;
   * } else if (event.eventlog && 'slateJson' in event.eventlog) {
   *   // 新格式：EventLog 对象
   *   const slateJSON = event.eventlog.slateJson;
   * }
   * 
   * // 写入时使用新格式
   * event.eventlog = {
   *   slateJson: JSON.stringify(slateNodes),
   *   html: '<p>...</p>',
   * };
   * ```
   */
  eventlog?: string | EventLog;
  
  // 🆕 Issue #12: EventTree 父子事件关联（刚性骨架）
  parentEventId?: string;      // 父事件 ID（所有类型子事件都用此字段）
  // ADR-001: 子事件列表由所有事件的 parentEventId 推导
  
  // 🆕 v2.16: 事件在同级中的显示位置（用于 Shift+Alt+↑/↓ 移动后保持顺序）
  position?: number;           // 同级事件的排序权重（数字越小越靠前，默认按 createdAt 排序）
  
  // 🆕 Issue #13: 双向链接（柔性血管）
  /**
   * 双向链接 ID 列表
   * 用户通过 @mention 创建的链接关系
   * 不占用 EventTree 画布空间，堆叠在主节点背后，Hover 展开
   * 
   * 创建方式：在 EventLog 中输入 `@事件名称`
   * 语义：目前不区分关系类型（依赖、参考、相关等），未来可通过 AI 自动推断
   */
  linkedEventIds?: string[];
  
  /**
   * 反向链接（自动计算，只读）
   * 记录哪些事件 mention 了当前事件
   * 用于"图谱视图"和"被引用查询"
   * 
   * 计算逻辑：每次保存事件时自动更新
   */
  backlinks?: string[];
  
  // 🆕 签到功能：用于任务管理和定时打卡
  checked?: string[];       // 签到时间戳数组（ISO格式）
  unchecked?: string[];     // 取消签到时间戳数组（ISO格式）
  checkType?: CheckType;    // 签到类型：none(无需签到), once(单次签到), recurring(循环签到)
  recurringConfig?: RecurringConfig; // 循环签到配置（当 checkType='recurring' 时有效）
  
  // 🆕 v3.1: 空白事件清理与 Snapshot 管理
  /**
   * 最后一次非空白状态的时间戳
   * - undefined: 从未有过实质内容（创建后一直为空）
   * - 本地格式字符串 (YYYY-MM-DD HH:mm:ss): 最后一次有实质内容的时间
   * 
   * 用途：
   * - 空白事件清理时判断是否需要写 EventHistory
   * - 从未非空的事件被删除：不写 history（减少噪音）
   * - 曾经非空的事件被删除：写 history（保留重要信息）
   */
  lastNonBlankAt?: string;
  
  /**
   * "最富有状态"的快照（Best Snapshot）
   * 记录事件历史上内容最丰富的状态（按 contentScore 评分）
   * 
   * 用途：
   * - 事件被删除时，在 EventHistory 中记录最佳状态
   * - Snapshot 附件模式：展示事件的"巅峰时刻"而非删除前的空状态
   * - 用户误删后恢复：提供最有价值的版本
   * 
   * 数据结构：
   * ```typescript
   * {
   *   eventId: string;
   *   capturedAt: string; // 本地格式 YYYY-MM-DD HH:mm:ss
   *   title, tags, eventLog, timeSpec, location, ...
   *   score: number; // contentScore 评分
   * }
   * ```
   */
  bestSnapshot?: import('./utils/eventContentSemantics').EventSnapshot;
  
  // 🆕 v2.1: 日历同步配置（支持 Private 模式和独立事件架构）
  /**
   * 计划安排同步配置
   * 支持 5 种模式：receive-only, send-only, send-only-private, bidirectional, bidirectional-private
   */
  planSyncConfig?: PlanSyncConfig;
  
  /**
   * 实际进展同步配置
   * 支持 4 种模式：send-only, send-only-private, bidirectional, bidirectional-private
   * null 表示继承 planSyncConfig
   */
  actualSyncConfig?: ActualSyncConfig;
  
  /**
   * 🆕 v2.0.5 多日历同步：Plan 日历映射
   * 本地一个 event，远程可能有多个 Plan 事件（不同日历）
   * 远程同步回来后，本地不能变成多个 event，应当合并管理
   */
  syncedPlanCalendars?: Array<{
    calendarId: string;      // 日历 ID
    remoteEventId: string;   // 该日历中的远程事件 ID
  }>;
  
  /**
   * 🆕 v2.0.5 多日历同步：Actual 日历映射
   * 本地一个 event，远程可能有多个 Actual 事件（不同日历）
   * 修改日历分组后，需要删除旧的远程事件，重新创建新的
   */
  syncedActualCalendars?: Array<{
    calendarId: string;      // 日历 ID
    remoteEventId: string;   // 该日历中的远程事件 ID
  }>;
  
  /**
   * @deprecated 计划安排的远程事件 ID（单日历版本）
   * Plan 同步创建的远程事件 ID（独立于 Actual）
   * 使用 syncedPlanCalendars 替代，支持多日历同步
   */
  syncedPlanEventId?: string | null;
  
  /**
   * @deprecated 实际进展的远程事件 ID（单日历版本）
   * Actual 同步创建的远程事件 ID（独立于 Plan）
   * 对于 Timer 子事件，存储对应的远程子事件 ID
   * 使用 syncedActualCalendars 替代，支持多日历同步
   */
  syncedActualEventId?: string | null;
  
  /**
   * @deprecated 旧的同步事件 ID，将被 syncedPlanEventId 和 syncedActualEventId 替代
   */
  syncedOutlookEventId?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  dueDateTime?: string;      // 🔧 修改：使用字符串存储本地时间（支持模糊时间）
  createdAt: string;     // 🔧 修改：使用字符串存储本地时间
  updatedAt: string;     // 🔧 修改：使用字符串存储本地时间
  tags?: string[];       // 🆕 添加：标签支持
}

export interface EventTag {
  id: string;
  name: string;
  color: string;
  createdAt: string;     // 🔧 修改：使用字符串存储本地时间
}

export interface GlobalTimer {
  id?: string;
  taskTitle?: string;
  eventTitle?: string;   // 事件标题
  tagId: string;         // 主标签 ID（为向后兼容保留，但始终从 tags[0] 同步）
  tags?: string[];       // 🆕 v1.8: 多标签支持
  tagName: string;       // 标签名称
  tagEmoji?: string;     // 标签图标
  tagColor?: string;     // 标签颜色
  eventEmoji?: string;   // 事件图标
  eventId?: string;      // 关联的事件 ID
  parentEventId?: string;  // 🆕 Issue #12: 关联的父事件 ID（Timer 子事件关联到的父事件）
  startTime: number;     // Unix timestamp
  originalStartTime: number; // 原始开始时间
  elapsedTime: number;   // 已经过的时间（毫秒）
  isRunning: boolean;    // 是否正在运行
  isPaused: boolean;     // 是否暂停
}

// 🆕 v1.7.5: Microsoft To Do List 接口
export interface TodoList {
  id: string;                // To Do List ID
  name: string;              // 列表名称
  displayName?: string;      // 显示名称
  isOwner?: boolean;         // 是否为所有者
  isShared?: boolean;        // 是否共享
  wellknownListName?: 'none' | 'defaultList' | 'flaggedEmails';  // 系统列表类型
  color?: string;            // 颜色（可能不存在）
}
