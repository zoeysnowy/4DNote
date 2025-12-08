/**
 * 标签服务 - 应用级别的标签管理系统
 * 独立于日历同步，为整个应用提供标签功能
 * 
 * ✅ v3.0: 迁移到 StorageManager（IndexedDB + SQLite）
 */

import { storageManager } from './storage/StorageManager';
import type { StorageTag } from './storage/types';
import { generateTagId, isValidId } from '../utils/idGenerator';
import { formatTimeForStorage } from '../utils/timeUtils';

export interface HierarchicalTag {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  parentId?: string;
  children?: HierarchicalTag[];
  calendarMapping?: {
    calendarId: string;
    calendarName: string;
  };
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface FlatTag {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  parentId?: string;
  level?: number;
  calendarMapping?: {
    calendarId: string;
    calendarName: string;
  };
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

class TagServiceClass {
  private tags: HierarchicalTag[] = [];
  private flatTags: FlatTag[] = [];
  private listeners: ((tags: HierarchicalTag[]) => void)[] = [];
  private initialized = false;
  private initializingPromise: Promise<void> | null = null;

  // 初始化标签系统
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 🔧 [FIX] 如果正在初始化，返回现有的 Promise（避免重复初始化）
    if (this.initializingPromise) {
      console.log('🏷️ [TagService] Initialization in progress, waiting...');
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      console.log('🏷️ [TagService] Initializing with StorageManager...');
    
    try {
      // ✅ v3.0: 从 StorageManager 加载标签
      const result = await storageManager.queryTags({ limit: 1000 });
      
      if (result.items.length > 0) {
        console.log(`🏷️ [TagService] Loaded ${result.items.length} tags from StorageManager`);
        
        // 转换为 FlatTag 格式
        this.flatTags = result.items.map(tag => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          emoji: tag.emoji,
          parentId: tag.parentId,
          level: 0, // 将在 flattenTags 中计算
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
          deletedAt: tag.deletedAt,
        }));
        
        // 构建层级结构
        this.tags = this.buildTagHierarchy(this.flatTags);
        
        // 重新计算 level
        this.flatTags = this.flattenTags(this.tags);
      } else {
        console.log('🏷️ [TagService] No tags found, creating defaults...');
        await this.createDefaultTags();
      }
      
      this.initialized = true;
      this.notifyListeners();
      console.log('✅ [TagService] Initialized successfully');
    } catch (error) {
      console.error('❌ [TagService] Failed to initialize:', error);
      // 即使出错也要创建默认标签确保应用可用
      await this.createDefaultTags();
      this.initialized = true;
      this.notifyListeners();
    } finally {
      this.initializingPromise = null;
    }
    })();

    return this.initializingPromise;
  }

  // 创建默认标签结构
  private async createDefaultTags(): Promise<void> {
    const now = formatTimeForStorage(new Date());
    
    const defaultTags: HierarchicalTag[] = [
      {
        id: generateTagId(),
        name: '工作',
        color: '#3498db',
        createdAt: now,
        updatedAt: now,
        children: [
          { id: generateTagId(), name: '会议', color: '#e74c3c', createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '项目开发', color: '#f39c12', createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '规划设计', color: '#9b59b6', createdAt: now, updatedAt: now }
        ]
      },
      {
        id: generateTagId(),
        name: '个人',
        color: '#2ecc71',
        createdAt: now,
        updatedAt: now,
        children: [
          { id: generateTagId(), name: '学习', color: '#1abc9c', createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '运动', color: '#e67e22', createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '娱乐', color: '#e91e63', createdAt: now, updatedAt: now }
        ]
      },
      {
        id: generateTagId(),
        name: '生活',
        color: '#95a5a6',
        createdAt: now,
        updatedAt: now,
        children: [
          { id: generateTagId(), name: '购物', color: '#34495e', createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '医疗健康', color: '#16a085', createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '出行', color: '#2980b9', createdAt: now, updatedAt: now }
        ]
      }
    ];

    this.tags = defaultTags;
    this.flatTags = this.flattenTags(defaultTags);
    await this.saveTags();
    
    console.log(`✅ [TagService] Created ${this.flatTags.length} default tags`);
  }

  // 保存标签到 StorageManager
  private async saveTags(): Promise<void> {
    try {
      console.log('💾 [TagService] Saving tags to StorageManager...');
      
      // 扁平化标签
      const flatTags = this.flattenTags(this.tags);
      
      // 批量保存到 StorageManager
      for (const tag of flatTags) {
        // 生成 UUID ID（如果是旧 ID）
        if (!isValidId(tag.id, 'tag')) {
          const oldId = tag.id;
          tag.id = generateTagId();
          console.log(`🔄 [TagService] Migrated tag ID: ${oldId} → ${tag.id}`);
        }
        
        const now = formatTimeForStorage(new Date());
        
        const storageTag: StorageTag = {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          emoji: tag.emoji,
          parentId: tag.parentId,
          createdAt: tag.createdAt || now,
          updatedAt: now,
          deletedAt: null,
        };
        
        try {
          // 尝试获取现有标签
          const existing = await storageManager.getTag(tag.id);
          // 如果存在，更新
          await storageManager.updateTag(tag.id, storageTag);
        } catch {
          // 如果不存在，创建
          await storageManager.createTag(storageTag);
        }
      }
      
      // 静默保存，只在首次创建时显示
    } catch (error) {
      console.error('❌ [TagService] Failed to save tags:', error);
    }
  }

  // 扁平化标签层级结构
  private flattenTags(tags: HierarchicalTag[]): FlatTag[] {
    const start = performance.now();
    const result: FlatTag[] = [];
    
    const flatten = (tags: HierarchicalTag[], parentId?: string, level: number = 0) => {
      tags.forEach(tag => {
        result.push({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          emoji: tag.emoji,
          parentId: tag.parentId || parentId,
          level: level,
          calendarMapping: tag.calendarMapping
        });
        
        if (tag.children && tag.children.length > 0) {
          flatten(tag.children, tag.id, level + 1);
        }
      });
    };
    
    flatten(tags);
    
    // 如果标签有 parentId 但 level 仍然是 0，说明是扁平结构，需要重新计算 level
    const needsLevelRecalc = result.some(tag => tag.parentId && tag.level === 0);
    if (needsLevelRecalc) {
      const tagMap = new Map(result.map(tag => [tag.id, tag]));
      result.forEach(tag => {
        let level = 0;
        let currentId = tag.parentId;
        const visited = new Set<string>(); // 🔧 防止循环引用导致死循环
        
        while (currentId) {
          if (visited.has(currentId)) {
            // 检测到循环引用，停止计算
            console.error(`❌ [TagService] 检测到标签循环引用: ${tag.id} -> ${currentId}`);
            break;
          }
          visited.add(currentId);
          
          level++;
          const parent = tagMap.get(currentId);
          currentId = parent?.parentId;
          
          // 🔧 安全检查：最多 20 层，防止异常数据
          if (level > 20) {
            console.error(`❌ [TagService] 标签层级过深 (>20): ${tag.id}`);
            break;
          }
        }
        tag.level = level;
      });
    }
    
    const duration = performance.now() - start;
    if (duration > 100) {
      console.warn(`⚠️ [TagService] flattenTags() 耗时 ${duration.toFixed(2)}ms，处理 ${tags.length} 个标签`);
    }
    
    return result;
  }

  // 构建标签层级结构
  buildTagHierarchy(flatTags: FlatTag[]): HierarchicalTag[] {
    const tagMap = new Map<string, HierarchicalTag>();
    const roots: HierarchicalTag[] = [];

    // 创建所有标签节点
    flatTags.forEach(tag => {
      tagMap.set(tag.id, {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        parentId: tag.parentId,
        children: [],
        calendarMapping: tag.calendarMapping
      });
    });

    // 构建层级关系
    flatTags.forEach(tag => {
      const node = tagMap.get(tag.id)!;
      if (tag.parentId) {
        const parent = tagMap.get(tag.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  // 获取所有标签（层级结构）
  // ✅ [PERFORMANCE FIX] 直接返回内部引用，避免每次创建新数组
  // 调用方不应该修改返回的数组，如需修改请使用 updateTags()
  getTags(): HierarchicalTag[] {
    return this.tags;
  }

  // 获取所有标签（扁平结构）
  // ✅ [PERFORMANCE FIX] 直接返回内部引用，避免每次创建新数组
  // ⚠️ v3.0: 移除同步加载逻辑，依赖 initialize() 异步加载
  getFlatTags(): FlatTag[] {
    // 如果还没有初始化，返回空数组并触发初始化
    if (!this.initialized) {
      console.warn('⚠️ [TagService] getFlatTags() called before initialization, returning empty array');
      // 触发异步初始化（不阻塞）
      this.initialize().catch(err => {
        console.error('❌ [TagService] Failed to initialize:', err);
      });
      return [];
    }
    
    return this.flatTags;
  }

  // 根据ID获取标签
  getTagById(id: string): FlatTag | null {
    return this.flatTags.find(tag => tag.id === id) || null;
  }

  // 获取标签显示名称（包含父级路径）
  getTagDisplayName(tagId: string): string {
    const tag = this.getTagById(tagId);
    if (!tag) return '未分类';

    if (tag.parentId) {
      const parent = this.getTagById(tag.parentId);
      if (parent) {
        return `${parent.name} > ${tag.name}`;
      }
    }
    
    return tag.name;
  }

  // 更新标签
  async updateTags(newTags: HierarchicalTag[]): Promise<void> {
    this.tags = newTags;
    this.flatTags = this.flattenTags(newTags);
    await this.saveTags();
    this.notifyListeners();
  }

  // 更新标签的日历映射
  async updateTagCalendarMapping(tagId: string, mapping: { calendarId: string; calendarName: string } | null): Promise<void> {
    // 更新层级标签
    const updateInHierarchy = (tags: HierarchicalTag[]): boolean => {
      for (const tag of tags) {
        if (tag.id === tagId) {
          if (mapping) {
            tag.calendarMapping = mapping;
          } else {
            delete tag.calendarMapping;
          }
          return true;
        }
        if (tag.children && updateInHierarchy(tag.children)) {
          return true;
        }
      }
      return false;
    };

    updateInHierarchy(this.tags);
    this.flatTags = this.flattenTags(this.tags);
    await this.saveTags();
    this.notifyListeners();
  }

  // 添加标签变化监听器
  addListener(listener: (tags: HierarchicalTag[]) => void): void {
    this.listeners.push(listener);
  }

  // 移除标签变化监听器
  removeListener(listener: (tags: HierarchicalTag[]) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  // 通知所有监听器
  private notifyListeners(): void {
    console.log('🔔 [TagService] Notifying listeners, stack:', new Error().stack);
    this.listeners.forEach(listener => {
      try {
        listener([...this.tags]);
      } catch (error) {
        console.error('❌ [TagService] Error notifying listener:', error);
      }
    });
  }

  // 检查是否已初始化
  isInitialized(): boolean {
    return this.initialized;
  }

  // 强制重新初始化
  async reinitialize(): Promise<void> {
    this.initialized = false;
    this.tags = [];
    this.flatTags = [];
    await this.initialize();
  }

  // 构建标签的完整路径（带颜色和 emoji）
  getTagPath(tagId: string): string {
    const flatTags = this.getFlatTags();
    const tag = flatTags.find(t => t.id === tagId);
    
    if (!tag) {
      return '';
    }
    
    // 构建层级路径，包含emoji
    const pathParts: { emoji?: string; name: string; color: string }[] = [];
    let currentTag = tag;
    
    while (currentTag) {
      pathParts.unshift({
        emoji: currentTag.emoji,
        name: currentTag.name,
        color: currentTag.color
      });
      
      if (currentTag.parentId) {
        const parentTag = flatTags.find(t => t.id === currentTag.parentId);
        if (parentTag) {
          currentTag = parentTag;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    
    // 生成格式：#emoji名称
    return pathParts.map(part => `#${part.emoji || ''}${part.name}`).join('/');
  }

  // 构建多个标签的路径（用于插入编辑器）
  buildTagsText(tagIds: string[]): string {
    if (tagIds.length === 0) return '';
    
    const paths = tagIds.map(id => this.getTagPath(id)).filter(p => p);
    return paths.join(' ');
  }

  /**
   * 解析标签为ID（支持混合输入）
   * 输入可以是标签ID或标签名称，统一转换为ID
   * 
   * @param tags 标签数组（可能包含ID或名称）
   * @returns 标签ID数组
   */
  resolveTagIds(tags: string[]): string[] {
    const flatTags = this.getFlatTags();
    return tags.map(t => {
      // 先尝试按ID查找
      const tagById = flatTags.find(x => x.id === t);
      if (tagById) return tagById.id;
      
      // 再尝试按名称查找
      const tagByName = flatTags.find(x => x.name === t);
      if (tagByName) return tagByName.id;
      
      // 都找不到，返回原值
      return t;
    });
  }

  /**
   * 解析标签为名称
   * 输入标签ID，返回标签名称
   * 
   * @param tagIds 标签ID数组
   * @returns 标签名称数组
   */
  resolveTagNames(tagIds: string[]): string[] {
    return tagIds.map(id => {
      const tag = this.getTagById(id);
      return tag ? tag.name : id;
    });
  }

  /**
   * 解析标签为显示名称（包含父级路径）
   * 输入标签ID，返回完整路径名称
   * 
   * @param tagIds 标签ID数组
   * @returns 标签显示名称数组
   */
  resolveTagDisplayNames(tagIds: string[]): string[] {
    return tagIds.map(id => this.getTagDisplayName(id));
  }
}

// 创建单例实例
export const TagService = new TagServiceClass();

// 暴露到全局供调试使用
if (typeof window !== 'undefined') {
  (window as any).TagService = TagService;
}