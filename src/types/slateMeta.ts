/**
 * Slate Meta-Comment 数据结构定义
 * 
 * 用于在 HTML Comment 中嵌入 Slate 元数据，实现 Outlook 同步中的数据保全
 * 策略：将所有 Slate 自定义属性序列化到 HTML 注释中，实现完美的往返同步
 * 
 * @version 2.20.0
 * @date 2025-12-19
 */

/**
 * Meta-Comment 通用结构
 * 格式：<!-- SLATE-META: {...} -->
 */
export interface ISlateMetaComment {
  /** Schema 版本（用于未来兼容性） */
  v: number;
  
  /** 节点类型 */
  t: 'paragraph' | 'heading-one' | 'heading-two' | 'heading-three' | 'tag' | 'dateMention' | 'timestamp-divider';
  
  /** 节点唯一 ID（用于增量更新识别） */
  id?: string;
  
  /** 时间戳（毫秒）- Block-Level Timestamp */
  ts?: number;
  
  /** 子层级数据（用于嵌套结构） */
  children?: ISlateMetaComment[];
}

/**
 * Paragraph Meta 数据
 */
export interface IParagraphMeta extends ISlateMetaComment {
  t: 'paragraph';
  
  /** Bullet 列表标记 */
  bullet?: boolean;
  
  /** Bullet 层级 */
  bulletLevel?: number;
  
  /** 创建时间（Block-Level Timestamp） */
  createdAt?: number;
}

/**
 * Heading Meta 数据
 */
export interface IHeadingMeta extends ISlateMetaComment {
  t: 'heading-one' | 'heading-two' | 'heading-three';
  
  /** Heading 唯一 ID（用于目录锚点） */
  id: string;
  
  /** Heading 层级（1-3） */
  level: 1 | 2 | 3;
}

/**
 * Tag Meta 数据
 */
export interface ITagMeta extends ISlateMetaComment {
  t: 'tag';
  
  /** Tag ID */
  tagId: string;
  
  /** Tag 名称 */
  tagName: string;
  
  /** Tag 颜色 */
  tagColor?: string;
  
  /** Tag Emoji */
  tagEmoji?: string;
  
  /** 是否仅作为提及（不关联） */
  mentionOnly?: boolean;
}

/**
 * DateMention Meta 数据
 */
export interface IDateMentionMeta extends ISlateMetaComment {
  t: 'dateMention';
  
  /** 开始日期 */
  startDate: string;
  
  /** 结束日期（可选） */
  endDate?: string;
  
  /** 关联的 Event ID */
  eventId?: string;
  
  /** 原始输入文本 */
  originalText?: string;
  
  /** 是否过期 */
  isOutdated?: boolean;
  
  /** 是否仅作为提及 */
  mentionOnly?: boolean;
}

/**
 * 序列化选项
 */
export interface ISerializeOptions {
  /** 是否压缩 JSON（移除空格） */
  minify?: boolean;
  
  /** 是否包含 debug 信息 */
  includeDebug?: boolean;
}

/**
 * 反序列化选项
 */
export interface IDeserializeOptions {
  /** 是否启用严格模式（不兼容旧格式） */
  strict?: boolean;
  
  /** 是否记录解析日志 */
  verbose?: boolean;
}
