/**
 * EventNodeService - 事件节点服务
 * 
 * 管理 EventNode 的 CRUD 操作和 AI 检索。
 * 每个 Event 的 eventlog 中的每个 paragraph 节点都会拆分为独立的 EventNode 记录。
 * 
 * 核心功能：
 * 1. 从 Event 的 eventlog 提取并创建 Nodes
 * 2. 同步更新 Nodes（当 Event 更新时）
 * 3. 生成 embedding_text（便于 AI 检索）
 * 4. 提供基于时间、标签的查询接口
 * 
 * @version 2.19.0
 * @author Zoey Gong
 */

import { EventNode, CreateEventNodeInput, UpdateEventNodeInput, QueryEventNodesInput } from '../../types/EventNode';
import { Event, EventLog } from '../../types';
import { formatTimeForStorage } from '../../utils/timeUtils';

/**
 * 临时内存存储（后续集成到 StorageManager）
 * TODO: 集成到 IndexedDBService，添加 event_nodes object store
 */
class MemoryStore {
  private store: Map<string, EventNode> = new Map();

  async put(table: string, id: string, data: EventNode): Promise<void> {
    this.store.set(id, data);
  }

  async get(table: string, id: string): Promise<EventNode | null> {
    return this.store.get(id) || null;
  }

  async getAll<T>(table: string): Promise<T[]> {
    return Array.from(this.store.values()) as T[];
  }

  async delete(table: string, id: string): Promise<void> {
    this.store.delete(id);
  }
}

const memoryStore = new MemoryStore();

export class EventNodeService {
  private static readonly TABLE_NAME = 'event_nodes';

  /**
   * 从 Event 的 eventlog 提取所有 paragraph 节点，创建 EventNode 记录
   * 
   * @param event - 事件对象
   * @returns 创建的 EventNode 列表
   */
  static async syncNodesFromEvent(event: Event): Promise<EventNode[]> {
    try {
      console.log('[EventNodeService] 开始同步 Nodes:', {
        eventId: event.id,
        title: (event.title as any)?.simpleTitle || '无标题'
      });

      // 1. 解析 eventlog（确保是 EventLog 对象）
      const eventlog = typeof event.eventlog === 'string' 
        ? JSON.parse(event.eventlog) 
        : event.eventlog;
      // 🆕 [P1 FIX] 传入 event 以便回退到 Event.createdAt
      const paragraphs = this.extractParagraphsFromEventLog(eventlog as EventLog, event);
      
      if (paragraphs.length === 0) {
        console.log('[EventNodeService] 没有找到 paragraph 节点');
        return [];
      }

      // 2. 删除该 Event 的旧 Nodes
      await this.deleteNodesByEventId(event.id);

      // 3. 创建新的 Nodes
      const nodes: EventNode[] = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i];
        const node = await this.createNode({
          eventId: event.id,
          eventTitle: (event.title as any)?.simpleTitle || '无标题',
          content: para.content,
          timestamp: para.timestamp,
          paragraphCreatedAt: para.paragraphCreatedAt,  // 🆕 [P2 FIX]
          paragraphUpdatedAt: para.paragraphUpdatedAt,  // 🆕 [P2 FIX]
          position: i,
          slateNode: para.slateNode,
          tags: event.tags,
          type: 'paragraph',
          blockId: para.blockId,
          source: (event.source === 'icloud' ? 'local' : event.source) as '4dnote' | 'outlook' | 'google' | 'local'
        });
        nodes.push(node);
      }

      console.log('[EventNodeService] ✅ 同步完成:', {
        eventId: event.id,
        节点数: nodes.length
      });

      return nodes;
    } catch (error) {
      console.error('[EventNodeService] ❌ 同步失败:', error);
      throw error;
    }
  }

  /**
   * 从 EventLog 中提取所有 Block-Level paragraph 节点
   * 🆕 [P1 FIX] 添加 Event.createdAt 回退逻辑，确保旧事件也能创建 EventNode
   */
  private static extractParagraphsFromEventLog(
    eventlog: EventLog, 
    event?: Event  // 🆕 可选参数，用于回退到 Event.createdAt
  ): Array<{
    content: string;
    timestamp: string;
    paragraphCreatedAt: string;  // 🆕 段落创建时间
    paragraphUpdatedAt: string;  // 🆕 段落修改时间
    slateNode: any;
    blockId?: string;
  }> {
    try {
      const slateJson = typeof eventlog.slateJson === 'string' 
        ? JSON.parse(eventlog.slateJson)
        : eventlog.slateJson;

      if (!Array.isArray(slateJson)) {
        return [];
      }

      const paragraphs: Array<{
        content: string;
        timestamp: string;
        paragraphCreatedAt: string;
        paragraphUpdatedAt: string;
        slateNode: any;
        blockId?: string;
      }> = [];

      for (const node of slateJson) {
        // 提取纯文本内容
        const content = node.children
          ?.map((child: any) => child.text || '')
          .join('')
          .trim();

        if (!content) continue;  // 跳过空段落

        // 🆕 [P1 FIX] 处理有 Block-Level Timestamp 的节点
        if (node.type === 'paragraph' && node.createdAt) {
          const timestamp = this.convertTimestampToTimeSpec(node.createdAt);
          const updatedAt = node.updatedAt 
            ? this.convertTimestampToTimeSpec(node.updatedAt)
            : timestamp;

          console.log('[EventNodeService] ✅ 提取 Block-Level paragraph:', {
            createdAt: node.createdAt,
            timestamp,
            content: content.substring(0, 50)
          });

          paragraphs.push({
            content,
            timestamp,
            paragraphCreatedAt: timestamp,
            paragraphUpdatedAt: updatedAt,
            slateNode: node,
            blockId: node.id
          });
        } 
        // 🆕 [P1 FIX] 处理无 Block-Level Timestamp 的节点（回退到 Event.createdAt）
        else if (node.type === 'paragraph' && !node.createdAt && event) {
          const fallbackTimestamp = event.createdAt || formatTimeForStorage(new Date());
          const fallbackUpdatedAt = event.updatedAt || fallbackTimestamp;

          console.log('[EventNodeService] ⚠️ 无 Block-Level Timestamp，回退到 Event.createdAt:', {
            eventId: event.id?.slice(-8),
            fallbackTimestamp,
            content: content.substring(0, 50)
          });

          paragraphs.push({
            content,
            timestamp: fallbackTimestamp,
            paragraphCreatedAt: fallbackTimestamp,
            paragraphUpdatedAt: fallbackUpdatedAt,
            slateNode: node,
            blockId: node.id
          });
        }
      }

      return paragraphs;
    } catch (error) {
      console.error('[EventNodeService] 解析 eventlog 失败:', error);
      return [];
    }
  }

  /**
   * 转换时间戳为 TimeSpec 格式
   */
  private static convertTimestampToTimeSpec(timestamp: number | string): string {
    if (typeof timestamp === 'number') {
      const converted = formatTimeForStorage(new Date(timestamp));
      console.log('[EventNodeService] 转换时间戳:', {
        原始值: timestamp,
        类型: 'number',
        Date对象: new Date(timestamp).toString(),
        转换后: converted
      });
      return converted;
    }
    console.log('[EventNodeService] 时间戳已是字符串:', timestamp);
    return timestamp;
  }

  /**
   * 创建单个 EventNode
   * 🆕 [P2 FIX] 添加 paragraphCreatedAt、paragraphUpdatedAt、nodeUpdatedAt 字段
   */
  static async createNode(input: CreateEventNodeInput): Promise<EventNode> {
    const now = formatTimeForStorage(new Date());
    
    // 构造 embedding_text（格式：[事件标题] - [时间] - [内容]）
    const timeStr = input.timestamp.substring(11, 16);  // HH:mm
    const embeddingText = `${input.eventTitle} - ${timeStr} - ${input.content}`;

    // 提取日期（YYYY-MM-DD）
    const day = input.timestamp.substring(0, 10);

    const node: EventNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      eventId: input.eventId,
      eventTitle: input.eventTitle,
      embeddingText,
      content: input.content,
      slateNode: input.slateNode,
      timestamp: input.timestamp,  // 保留用于向后兼容
      day,
      // 🆕 [P2 FIX] 段落时间戳（来自 Block-Level Timestamp 或 Event.createdAt）
      paragraphCreatedAt: input.paragraphCreatedAt || input.timestamp,
      paragraphUpdatedAt: input.paragraphUpdatedAt || input.timestamp,
      // 🆕 [P2 FIX] Node 记录的创建/修改时间
      nodeUpdatedAt: now,
      updatedAt: now,  // 保留用于向后兼容
      tags: input.tags || [],
      type: input.type || 'paragraph',
      position: input.position,
      blockId: input.blockId,
      source: input.source
    };

    // 保存到数据库
    await memoryStore.put(this.TABLE_NAME, node.id, node);

    console.log('[EventNodeService] 创建 Node:', {
      id: node.id,
      eventId: node.eventId,
      position: node.position,
      embeddingText: embeddingText.substring(0, 50) + '...'
    });

    return node;
  }

  /**
   * 删除 Event 的所有 Nodes
   */
  static async deleteNodesByEventId(eventId: string): Promise<void> {
    try {
      const nodes = await this.queryNodes({ eventId });
      
      for (const node of nodes) {
        await memoryStore.delete(this.TABLE_NAME, node.id);
      }

      console.log('[EventNodeService] 删除 Nodes:', {
        eventId,
        数量: nodes.length
      });
    } catch (error) {
      console.error('[EventNodeService] 删除 Nodes 失败:', error);
    }
  }

  /**
   * 查询 EventNodes
   */
  static async queryNodes(input: QueryEventNodesInput): Promise<EventNode[]> {
    try {
      const allNodes = await memoryStore.getAll<EventNode>(this.TABLE_NAME);
      
      let filtered = allNodes;

      // 按 eventId 过滤
      if (input.eventId) {
        filtered = filtered.filter(node => node.eventId === input.eventId);
      }

      // 按时间范围过滤
      if (input.timeRange) {
        filtered = filtered.filter(node => 
          node.timestamp >= input.timeRange!.start &&
          node.timestamp <= input.timeRange!.end
        );
      }

      // 按标签过滤
      if (input.tags && input.tags.length > 0) {
        filtered = filtered.filter(node =>
          input.tags!.some(tag => node.tags?.includes(tag))
        );
      }

      // 按类型过滤
      if (input.type) {
        filtered = filtered.filter(node => node.type === input.type);
      }

      // 排序（按 timestamp 升序）
      filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // 分页
      const offset = input.offset || 0;
      const limit = input.limit || filtered.length;
      
      return filtered.slice(offset, offset + limit);
    } catch (error) {
      console.error('[EventNodeService] 查询失败:', error);
      return [];
    }
  }

  /**
   * 获取单个 Node
   */
  static async getNodeById(nodeId: string): Promise<EventNode | null> {
    try {
      return await memoryStore.get(this.TABLE_NAME, nodeId);
    } catch (error) {
      console.error('[EventNodeService] 获取 Node 失败:', error);
      return null;
    }
  }

  /**
   * 更新 Node
   */
  static async updateNode(nodeId: string, updates: UpdateEventNodeInput): Promise<EventNode | null> {
    try {
      const existing = await this.getNodeById(nodeId);
      if (!existing) {
        console.warn('[EventNodeService] Node 不存在:', nodeId);
        return null;
      }

      const updated: EventNode = {
        ...existing,
        ...updates,
        updatedAt: formatTimeForStorage(new Date())
      };

      // 如果更新了 content，重新生成 embeddingText
      if (updates.content) {
        const timeStr = updated.timestamp.substring(11, 16);
        updated.embeddingText = `${updated.eventTitle} - ${timeStr} - ${updates.content}`;
      }

      await memoryStore.put(this.TABLE_NAME, nodeId, updated);

      console.log('[EventNodeService] 更新 Node:', nodeId);

      return updated;
    } catch (error) {
      console.error('[EventNodeService] 更新失败:', error);
      return null;
    }
  }

  /**
   * 获取 Event 的所有 Nodes（按 position 排序）
   */
  static async getNodesByEventId(eventId: string): Promise<EventNode[]> {
    const nodes = await this.queryNodes({ eventId });
    return nodes.sort((a, b) => a.position - b.position);
  }

  /**
   * 统计 Event 的 Node 数量
   */
  static async countNodesByEventId(eventId: string): Promise<number> {
    const nodes = await this.queryNodes({ eventId });
    return nodes.length;
  }
}
