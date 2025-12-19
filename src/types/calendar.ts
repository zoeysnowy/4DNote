/**
 * Calendar 类型定义
 * 
 * @description 统一的日历数据接口定义
 * @version 2.0.0
 * @author Zoey Gong
 */

/**
 * 日历提供商类型
 */
export type CalendarProvider = 'outlook' | 'google' | 'icloud' | 'local';

/**
 * 统一的日历接口
 */
export interface Calendar {
  /** 日历唯一ID */
  id: string;
  
  /** 日历显示名称（可能包含emoji） */
  name: string;
  
  /** 备用显示名称 */
  displayName?: string;
  
  /** 十六进制颜色值 */
  color: string;
  
  /** 原始颜色值（Microsoft颜色名称或其他格式） */
  rawColor?: string;
  
  /** 背景颜色（向后兼容） */
  backgroundColor?: string;
  
  /** 日历分组ID */
  groupId?: string;
  
  /** 日历提供商 */
  provider?: CalendarProvider;
  
  /** 是否可编辑 */
  canEdit?: boolean;
  
  /** 是否为默认日历 */
  isDefault?: boolean;
  
  /** 所有者邮箱 */
  ownerEmail?: string;
}

/**
 * 日历分组接口
 */
export interface CalendarGroup {
  /** 分组ID */
  id: string;
  
  /** 分组名称 */
  name: string;
  
  /** 分组下的日历列表 */
  calendars?: Calendar[];
  
  /** 日历提供商 */
  provider?: CalendarProvider;
}

/**
 * 特殊日历ID常量
 */
export const SPECIAL_CALENDAR_IDS = {
  LOCAL_CREATED: 'local-created',
  NOT_SYNCED: 'not-synced',
  NONE: 'none'
} as const;

/**
 * 日历选择配置
 */
export interface CalendarSelectionConfig {
  /** 最大可选数量 */
  maxSelection?: number;
  
  /** 占位符文本 */
  placeholder?: string;
  
  /** 是否允许搜索 */
  allowSearch?: boolean;
  
  /** 是否显示特殊选项（本地创建、未同步等） */
  showSpecialOptions?: boolean;
  
  /** 是否多选模式 */
  multiSelect?: boolean;
}
