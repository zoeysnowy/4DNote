/**
 * CompleteMeta V2 统一元注释架构
 * 
 * 版本升级：V1 → V2
 * - V1：单一前缀hint (h)，相似度阈值60%
 * - V2：增强hint三元组 (s, e, l) + 三层容错匹配算法
 * 
 * 设计原则：Meta作为"增强器"，不替代HTML解析
 * - ✅ 保存元数据：节点ID、增强hint、mention信息、时间戳、层级、缩进
 * - ❌ 不保存文本：文本内容从HTML提取（保留用户在Outlook的编辑）
 * - ❌ 不保存关系：Tags/Tree/Attendees从本地Service查询
 * 
 * V2核心改进：
 * - 增强hint结构：{ s: "前5字", e: "后5字", l: 长度 } 替代单一前缀
 * - 三层容错匹配：精确锚定 → 三明治推导 → 模糊打分（全局最优）
 * - 抗修改能力：即使开头被大幅修改，仍能通过结尾+长度+拓扑位置保留ID
 */

export interface CompleteMeta {
  v: number;                    // 版本号（必填，V2为2）
  id: string;                   // Event的internal ID（必填，用于本地查询关系数据）
  
  // EventLog Meta - V2增强hint结构
  slate?: {
    nodes: Array<{
      id?: string;              // 节点ID（用于匹配HTML中的节点）
      
      // V2增强hint三元组（替代V1的单一h字段）
      s?: string;               // start: 文本前5个字符
      e?: string;               // end: 文本后5个字符
      l?: number;               // length: 文本总长度
      
      ts?: number;              // createdAt（时间戳节点，HTML中会丢失）
      ut?: number;              // updatedAt
      lvl?: number;             // level（分级标题层级，可能被Outlook改为bold）
      bullet?: number;          // bulletLevel（列表缩进，可能被改为<ul><li>）
      
      // UnifiedMention元素 - data-*属性可能被Outlook清除
      mention?: {
        type: 'event' | 'tag' | 'date' | 'ai' | 'contact';
        targetId?: string;      // 事件ID / 联系人ID
        targetName?: string;    // 标签名
        targetDate?: string;    // 日期字符串
        displayText?: string;   // 显示文本
      };
    }>;
  };
  
  // 签名 Meta - Event的时间戳和来源信息
  signature?: {
    createdAt?: string;         // TimeSpec格式：'YYYY-MM-DD HH:mm:ss'
    updatedAt?: string;         // TimeSpec格式
    fourDNoteSource?: boolean;  // true=4DNote创建，false=Outlook创建
    source?: 'local' | 'outlook';
    lastModifiedSource?: '4dnote' | 'outlook';
  };
  
  // 自定义字段 Meta（预留扩展）
  custom?: {
    [key: string]: any;
  };
}

/**
 * 三层容错匹配结果
 */
export interface MatchResult {
  type: 'layer1-exact' | 'layer2-sandwich' | 'layer3-fuzzy' | 'insert' | 'delete';
  metaIndex?: number;          // Meta节点索引
  htmlIndex?: number;          // HTML段落索引
  score?: number;              // 匹配分数（Layer 3使用）
  id?: string;                 // 新生成的节点ID（insert使用）
}

/**
 * 锚点信息
 */
export interface Anchor {
  metaIndex: number;
  htmlIndex: number;
}
