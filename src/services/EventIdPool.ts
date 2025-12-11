/**
 * 🎯 Event ID 池管理服务
 * 
 * 用途: 预分配真实的 event ID，避免使用临时 ID (line-xxx)
 * 
 * 工作原理:
 * 1. 初始化时预分配 10 个真实 ID
 * 2. 每次消费 1 个 ID，自动补充 1 个新 ID
 * 3. 页面离开时清理未使用的 ID (通过 EventService.deleteEvent)
 * 
 * 优势:
 * - 不需要临时ID映射
 * - 不需要两次更新Slate
 * - 简化 Tab 键逻辑
 * - 提升性能
 * 
 * @version 1.0.0
 * @date 2025-12-10
 */

import { EventService } from './EventService';
import { generateEventId } from '../utils/idGenerator';

interface PooledEventId {
  id: string;           // 完整的 event ID
  allocated: boolean;   // 是否已分配使用
  bulletLevel?: number; // 分配时的层级
  parentEventId?: string; // 分配时的父事件ID
  position?: number;    // 🆕 分配时的位置权重
  allocatedAt?: number; // 分配时间戳
}

class EventIdPoolService {
  private pool: PooledEventId[] = [];
  private readonly POOL_SIZE = 10; // 池大小
  private readonly MIN_POOL_SIZE = 3; // 最小池大小(触发补充)
  private isInitialized = false;
  private isRefilling = false;

  /**
   * 初始化 ID 池（非阻塞，后台执行）
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[EventIdPool] 已初始化，跳过');
      return;
    }

    console.log('[EventIdPool] 🚀 开始初始化 ID 池（后台执行）...');
    const startTime = Date.now();

    try {
      // 🆕 直接创建新的占位事件池，不查询数据库（避免阻塞）
      // 页面刷新后，旧的占位事件会被自动清理或复用
      console.log('[EventIdPool] 🆕 创建占位事件（不查询数据库，避免阻塞）...');
      const ids: PooledEventId[] = [];
      for (let i = 0; i < this.POOL_SIZE; i++) {
        const id = generateEventId();
        ids.push({
          id,
          allocated: false
        });
      }

      // 🔥 立即设置池，标记为已初始化（ID 可用，事件创建在后台进行）
      this.pool = ids;
      this.isInitialized = true;

      const syncElapsed = Date.now() - startTime;
      console.log('[EventIdPool] ✅ ID池初始化完成（同步部分）:', {
        总数量: this.pool.length,
        可用数量: this.pool.filter(p => !p.allocated).length,
        耗时: `${syncElapsed}ms`,
        说明: '占位事件创建在后台进行'
      });

      // 批量创建空事件占位（后台执行，不阻塞 UI）
      Promise.all(
        ids.map(pooledId =>
          EventService.createEvent({
            id: pooledId.id,
            title: '',
            isPlan: true,
            isTask: true,
            fourDNoteSource: true,
            source: 'local',
            syncStatus: 'local-only',
            _isPlaceholder: true, // 🔥 标记为池化占位事件
            _isPooledId: true,    // 🆕 标记为池化ID
            _pooledAt: new Date().toISOString(),
            bulletLevel: 0,       // 🆕 默认层级
            parentEventId: undefined // 🆕 默认无父事件
          })
        )
      ).then(() => {
        const elapsed = Date.now() - startTime;
        console.log('[EventIdPool] ✅ 占位事件创建完成:', {
          总数量: ids.length,
          耗时: `${elapsed}ms`
        });
      }).catch(error => {
        console.error('[EventIdPool] ❌ 占位事件创建失败:', error);
      });
    } catch (error) {
      console.error('[EventIdPool] ❌ 初始化失败:', error);
      this.isInitialized = false; // 失败时重置状态
      throw error;
    }
  }

  /**
   * 从池中分配一个 ID
   * @param bulletLevel 可选: 事件层级
   * @param parentEventId 可选: 父事件ID
   * @param position 可选: 位置权重（用于排序）
   */
  allocate(bulletLevel?: number, parentEventId?: string, position?: number): string | null {
    if (!this.isInitialized) {
      console.error('[EventIdPool] ❌ 池未初始化，无法分配ID');
      return null;
    }

    // 查找第一个未分配的 ID
    const available = this.pool.find(p => !p.allocated);
    
    if (!available) {
      console.error('[EventIdPool] ❌ ID池已耗尽，无可用ID');
      return null;
    }

    // 标记为已分配
    available.allocated = true;
    available.bulletLevel = bulletLevel;
    available.parentEventId = parentEventId;
    available.position = position;
    available.allocatedAt = Date.now();

    const availableCount = this.pool.filter(p => !p.allocated).length;

    console.log('[EventIdPool] 📤 分配ID:', {
      eventId: available.id.slice(-8),
      bulletLevel,
      parentEventId: parentEventId?.slice(-8),
      position,
      剩余可用: availableCount
    });

    // 🆕 v2.16: 立即更新数据库中的元数据(异步非阻塞)
    this.updatePooledEventMetadata(available.id, bulletLevel, parentEventId, position).catch(err => {
      console.error('[EventIdPool] ❌ 更新占位事件元数据失败:', err);
    });

    // 如果可用ID少于阈值，触发补充
    if (availableCount < this.MIN_POOL_SIZE) {
      this.refillPool();
    }

    return available.id;
  }

  /**
   * 🆕 v2.16: 更新池化事件的元数据(bulletLevel, parentEventId, position)
   * @private
   */
  private async updatePooledEventMetadata(
    eventId: string, 
    bulletLevel?: number, 
    parentEventId?: string,
    position?: number
  ): Promise<void> {
    try {
      const updates: any = {};
      
      if (bulletLevel !== undefined) {
        updates.bulletLevel = bulletLevel;
      }
      
      if (parentEventId !== undefined) {
        updates.parentEventId = parentEventId;
      }
      
      if (position !== undefined) {
        updates.position = position;
      }

      // 更新数据库中的占位事件
      await EventService.updateEvent(eventId, updates);

      console.log('[EventIdPool] 🔄 已更新占位事件元数据:', {
        eventId: eventId.slice(-8),
        bulletLevel,
        parentEventId: parentEventId?.slice(-8),
        position
      });
    } catch (error) {
      console.error('[EventIdPool] ❌ 更新占位事件元数据失败:', error);
      throw error;
    }
  }

  /**
   * 补充 ID 池 (异步非阻塞)
   */
  private async refillPool(): Promise<void> {
    if (this.isRefilling) {
      console.log('[EventIdPool] 🔄 正在补充中，跳过');
      return;
    }

    this.isRefilling = true;

    try {
      const currentSize = this.pool.filter(p => !p.allocated).length;
      const needed = this.POOL_SIZE - currentSize;

      if (needed <= 0) {
        console.log('[EventIdPool] ✅ 池已满，无需补充');
        return;
      }

      console.log('[EventIdPool] 🔄 开始补充ID池:', {
        当前可用: currentSize,
        需要补充: needed
      });

      const newIds: PooledEventId[] = [];
      for (let i = 0; i < needed; i++) {
        const id = generateEventId();
        newIds.push({
          id,
          allocated: false
        });
      }

      // 批量创建占位事件
      await Promise.all(
        newIds.map(pooledId =>
          EventService.createEvent({
            id: pooledId.id,
            title: '',
            isPlan: true,
            isTask: true,
            fourDNoteSource: true,
            source: 'local',
            syncStatus: 'local-only',
            _isPlaceholder: true, // 🔥 标记为池化占位事件
            _isPooledId: true,    // 🆕 标记为池化ID
            _pooledAt: new Date().toISOString(),
            bulletLevel: 0,       // 🆕 默认层级
            parentEventId: undefined // 🆕 默认无父事件
          })
        )
      );

      this.pool.push(...newIds);

      console.log('[EventIdPool] ✅ ID池补充完成:', {
        新增数量: newIds.length,
        当前总数: this.pool.length,
        可用数量: this.pool.filter(p => !p.allocated).length
      });
    } catch (error) {
      console.error('[EventIdPool] ❌ 补充失败:', error);
    } finally {
      this.isRefilling = false;
    }
  }

  /**
   * 标记 ID 已正式使用 (保存了完整数据)
   * @param eventId 事件ID
   * @deprecated 不再需要手动标记，占位事件会被 EventService 更新为真实数据
   */
  markAsUsed(eventId: string): void {
    const pooled = this.pool.find(p => p.id === eventId);
    if (pooled) {
      console.log('[EventIdPool] ✅ ID已正式使用（保留占位事件，等待更新）:', {
        eventId: eventId.slice(-8),
        bulletLevel: pooled.bulletLevel,
        分配时长: pooled.allocatedAt ? `${Date.now() - pooled.allocatedAt}ms` : 'N/A'
      });
      // ❌ 不要从池中移除！占位事件应该被 EventService.updateEvent 更新，而不是删除
      // 占位事件的 _isPlaceholder 标志会在 updateEvent 时被清除
    }
  }

  /**
   * 清理未使用的 ID (页面离开时调用)
   */
  async cleanup(): Promise<void> {
    if (!this.isInitialized) {
      console.log('[EventIdPool] 未初始化，无需清理');
      return;
    }

    console.log('[EventIdPool] 🧹 开始清理未使用的ID...');

    try {
      // 找出所有未分配的ID
      const unusedIds = this.pool.filter(p => !p.allocated);

      if (unusedIds.length === 0) {
        console.log('[EventIdPool] ✅ 无未使用的ID需要清理');
        return;
      }

      console.log('[EventIdPool] 🗑️ 删除未使用的占位事件:', {
        数量: unusedIds.length,
        ids: unusedIds.map(p => p.id.slice(-8))
      });

      // 批量删除占位事件
      await Promise.all(
        unusedIds.map(pooled =>
          EventService.deleteEvent(pooled.id)
        )
      );

      console.log('[EventIdPool] ✅ 清理完成');
    } catch (error) {
      console.error('[EventIdPool] ❌ 清理失败:', error);
    } finally {
      // 重置池
      this.pool = [];
      this.isInitialized = false;
    }
  }

  /**
   * 获取池状态 (调试用)
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      totalSize: this.pool.length,
      allocated: this.pool.filter(p => p.allocated).length,
      available: this.pool.filter(p => !p.allocated).length,
      isRefilling: this.isRefilling,
      details: this.pool.map(p => ({
        id: p.id.slice(-8),
        allocated: p.allocated,
        bulletLevel: p.bulletLevel,
        parentEventId: p.parentEventId?.slice(-8),
        position: p.position
      }))
    };
  }
}

// 导出单例
export const EventIdPool = new EventIdPoolService();

// 调试工具
if (typeof window !== 'undefined') {
  (window as any).__EVENT_ID_POOL__ = EventIdPool;
  console.log('💡 调试提示: 使用 window.__EVENT_ID_POOL__.getStatus() 查看ID池状态');
}
