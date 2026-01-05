/**
 * 标签服务 - 应用级别的标签管理系统
 * 独立于日历同步，为整个应用提供标签功能
 * 
 * ✅ v3.0: 迁移到 StorageManager（IndexedDB + SQLite）
 */

import { storageManager } from '@backend/storage/StorageManager';
import type { StorageTag } from '@backend/storage/types';
import { generateTagId, isValidId } from '@frontend/utils/idGenerator';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

export interface HierarchicalTag {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  parentId?: string;
  position?: number; // 标签在列表中的位置顺序
  children?: HierarchicalTag[];
  calendarMapping?: {
    calendarId: string;
    calendarName: string;
  };
  dailyAvgCheckins?: number; // 每日平均打卡次数（UI统计数据）
  dailyAvgDuration?: number; // 每日平均时长（分钟）
  isRecurring?: boolean; // 是否为重复标签
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
  position?: number; // 标签在列表中的位置顺序
  level?: number;
  calendarMapping?: {
    calendarId: string;
    calendarName: string;
  };
  dailyAvgCheckins?: number; // 每日平均打卡次数（UI统计数据）
  dailyAvgDuration?: number; // 每日平均时长（分钟）
  isRecurring?: boolean; // 是否为重复标签
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
      console.log('⏳ [TagService] Already initializing, reusing existing promise...');
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      console.log('🏷️ [TagService] Initializing with StorageManager...');
    
    try {
      // ✅ v3.0: 从 StorageManager 加载标签
      const result = await storageManager.queryTags({ limit: 1000 });
      console.log(`🔍 [TagService] queryTags result:`, result);
      
      if (result.items.length > 0) {
        const activeItems = result.items.filter(t => !t.deletedAt);
        console.log(`🏷️ [TagService] Loaded ${activeItems.length} active tags from StorageManager`);
        console.log('📋 [TagService] Raw tags from StorageManager (active):', activeItems.map(t => ({ id: t.id, name: t.name, parentId: t.parentId })));
        
        // 转换为 FlatTag 格式
        this.flatTags = activeItems.map(tag => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          emoji: tag.emoji,
          parentId: tag.parentId,
          position: (tag as any).position, // 保留 position 字段用于排序
          level: 0, // 将在 flattenTags 中计算
          calendarMapping: (tag as any).calendarMapping, // 保留日历映射信息
          dailyAvgCheckins: (tag as any).dailyAvgCheckins,
          dailyAvgDuration: (tag as any).dailyAvgDuration,
          isRecurring: (tag as any).isRecurring,
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
          deletedAt: tag.deletedAt,
        }));
        
        console.log('🔍 [TagService] Flat tags after conversion:', this.flatTags.map(t => ({ name: t.name, emoji: t.emoji, position: t.position })));
        
        // 构建层级结构
        console.log(`📊 [TagService] Before buildTagHierarchy: ${this.flatTags.length} flat tags`);
        this.tags = this.buildTagHierarchy(this.flatTags);
        console.log(`📊 [TagService] After buildTagHierarchy: ${this.tags.length} root tags`);
        console.log('🔍 [TagService] Hierarchical tags:', this.tags.map(t => ({ name: t.name, emoji: t.emoji, position: t.position })));
        
        // 重新计算 level
        this.flatTags = this.flattenTags(this.tags);
        console.log(`📊 [TagService] After flattenTags: ${this.flatTags.length} flat tags`);
        console.log('🔍 [TagService] Final flat tags:', this.flatTags.map(t => ({ name: t.name, emoji: t.emoji, position: t.position, level: t.level })));

        // 🔧 [RECONCILE] 如果 localStorage 里有 TagManager 的权威数据，且比 StorageManager 更“干净”（比如少了已删除标签），则以 localStorage 为准同步回存储。
        try {
          const isDevelopment = process.env.NODE_ENV === 'development' || 
                               window.location.hostname === 'localhost' ||
                               window.location.hostname === '127.0.0.1';
          const baseKey = '4dnote-hierarchical-tags';
          const localStorageKey = isDevelopment ? `4dnote-dev-persistent-${baseKey}` : baseKey;
          const rawData = localStorage.getItem(localStorageKey);

          if (rawData) {
            const parsed = JSON.parse(rawData);
            const localTags = parsed.value || parsed;
            if (Array.isArray(localTags) && localTags.length > 0) {
              const localFlat = this.flattenTags(localTags as any);
              const storageIds = new Set(this.flatTags.map(t => t.id));
              const localIds = new Set(localFlat.map(t => t.id));

              const storageHasExtra = Array.from(storageIds).some(id => !localIds.has(id));
              if (storageHasExtra) {
                console.warn('🧹 [TagService] Detected stale tags in StorageManager; reconciling from localStorage');
                this.tags = localTags as any;
                this.flatTags = localFlat;
                await this.saveTags();
                this.notifyListeners();
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ [TagService] Failed to reconcile from localStorage:', e);
        }
      } else {
        // 🔄 迁移：尝试从 localStorage 加载 TagManager 保存的标签
        console.log('🏷️ [TagService] No tags in StorageManager, checking localStorage (TagManager)...');
        
        // TagManager 使用 PersistentStorage，在开发环境会加前缀
        const isDevelopment = process.env.NODE_ENV === 'development' || 
                             window.location.hostname === 'localhost' ||
                             window.location.hostname === '127.0.0.1';
        const baseKey = '4dnote-hierarchical-tags';
        const localStorageKey = isDevelopment ? `4dnote-dev-persistent-${baseKey}` : baseKey;
        
        console.log('📍 [TagService] Looking for key:', localStorageKey);
        const rawData = localStorage.getItem(localStorageKey);
        
        if (rawData) {
          try {
            // PersistentStorage 包装了数据：{ value, timestamp, version, isDev }
            const parsed = JSON.parse(rawData);
            const oldTags = parsed.value || parsed; // 兼容直接存储和包装存储
            console.log('📍 [TagService] Found in localStorage:', oldTags);
            
            if (oldTags && Array.isArray(oldTags) && oldTags.length > 0) {
              console.log(`🔄 [TagService] Migrating ${oldTags.length} tags from localStorage (TagManager)...`);
              this.tags = oldTags;
              this.flatTags = this.flattenTags(oldTags);
              
              // 保存到 StorageManager
              await this.saveTags();
              console.log(`✅ [TagService] Migrated ${this.flatTags.length} tags to StorageManager`);
            } else {
              console.log('ℹ️ [TagService] No valid tags in localStorage, starting with empty tag list');
              this.tags = [];
              this.flatTags = [];
            }
          } catch (error) {
            console.error('❌ [TagService] Failed to parse localStorage tags:', error);
            console.log('ℹ️ [TagService] Starting with empty tag list');
            this.tags = [];
            this.flatTags = [];
          }
        } else {
          console.log('ℹ️ [TagService] No tags found, starting with empty tag list');
          this.tags = [];
          this.flatTags = [];
        }
      }
      
      this.initialized = true;
      this.notifyListeners();
      console.log('✅ [TagService] Initialized successfully');
    } catch (error) {
      console.error('❌ [TagService] Failed to initialize:', error);
      // 出错时使用空标签列表
      this.tags = [];
      this.flatTags = [];
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
    
    // 🔧 [FIX] 先生成所有 ID，然后设置正确的 parentId
    const workId = generateTagId();
    const personalId = generateTagId();
    const lifeId = generateTagId();
    
    const defaultTags: HierarchicalTag[] = [
      {
        id: workId,
        name: '工作',
        color: '#3498db',
        createdAt: now,
        updatedAt: now,
        children: [
          { id: generateTagId(), name: '会议', color: '#e74c3c', parentId: workId, createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '项目开发', color: '#f39c12', parentId: workId, createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '规划设计', color: '#9b59b6', parentId: workId, createdAt: now, updatedAt: now }
        ]
      },
      {
        id: personalId,
        name: '个人',
        color: '#2ecc71',
        createdAt: now,
        updatedAt: now,
        children: [
          { id: generateTagId(), name: '学习', color: '#1abc9c', parentId: personalId, createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '运动', color: '#e67e22', parentId: personalId, createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '娱乐', color: '#e91e63', parentId: personalId, createdAt: now, updatedAt: now }
        ]
      },
      {
        id: lifeId,
        name: '生活',
        color: '#95a5a6',
        createdAt: now,
        updatedAt: now,
        children: [
          { id: generateTagId(), name: '购物', color: '#34495e', parentId: lifeId, createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '医疗健康', color: '#16a085', parentId: lifeId, createdAt: now, updatedAt: now },
          { id: generateTagId(), name: '出行', color: '#2980b9', parentId: lifeId, createdAt: now, updatedAt: now }
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
      console.log('📊 [TagService] Current tags structure:', this.tags);
      
      // 🔧 [FIX] 先迁移所有临时 ID，避免重复创建
      const idMapping = new Map<string, string>(); // oldId -> newId
      
      // 递归替换 ID
      const migrateIds = (tags: HierarchicalTag[]) => {
        for (const tag of tags) {
          if (!isValidId(tag.id, 'tag')) {
            const oldId = tag.id;
            const newId = generateTagId();
            idMapping.set(oldId, newId);
            tag.id = newId;
            console.log(`🔄 [TagService] Migrated tag ID: ${oldId} → ${newId}`);
          }
          if (tag.children) {
            migrateIds(tag.children);
          }
        }
      };
      
      // 迁移 this.tags 中的所有 ID
      migrateIds(this.tags);
      
      // 更新 parentId 引用
      const updateParentIds = (tags: HierarchicalTag[]) => {
        for (const tag of tags) {
          if (tag.parentId && idMapping.has(tag.parentId)) {
            tag.parentId = idMapping.get(tag.parentId);
          }
          if (tag.children) {
            updateParentIds(tag.children);
          }
        }
      };
      
      updateParentIds(this.tags);
      
      // 重新扁平化标签（ID 已更新）
      const flatTags = this.flattenTags(this.tags);
      this.flatTags = flatTags; // 同步更新 flatTags
      console.log(`📊 [TagService] Flattened ${flatTags.length} tags:`, flatTags.map(t => t.name));
      
      // 批量保存到 StorageManager
      const currentIds = new Set(flatTags.map(t => t.id));

      for (const tag of flatTags) {
        
        const now = formatTimeForStorage(new Date());
        
        const storageTag: StorageTag = {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          emoji: tag.emoji,
          parentId: tag.parentId,
          position: tag.position,
          calendarMapping: tag.calendarMapping,
          dailyAvgCheckins: tag.dailyAvgCheckins,
          dailyAvgDuration: tag.dailyAvgDuration,
          isRecurring: tag.isRecurring,
          createdAt: tag.createdAt || now,
          updatedAt: now,
          deletedAt: null,
        };
        
        try {
          // 尝试获取现有标签
          const existing = await storageManager.getTag(tag.id);
          // 如果存在，更新
          console.log(`🔄 [TagService] Updating existing tag: ${tag.name} (${tag.id})`);
          await storageManager.updateTag(tag.id, storageTag);
        } catch {
          // 如果不存在，创建
          console.log(`➕ [TagService] Creating new tag: ${tag.name} (${tag.id})`);
          await storageManager.createTag(storageTag);
        }
      }

      // 🧹 同步删除：把 StorageManager 中“已不存在于当前层级”的标签软删除（否则会在下次启动时重新出现）
      try {
        const existing = await storageManager.queryTags({ limit: 5000 });
        const stale = existing.items.filter(t => !t.deletedAt && !currentIds.has(t.id));
        if (stale.length > 0) {
          console.warn(`🗑️ [TagService] Soft-deleting ${stale.length} stale tags from StorageManager...`);
          for (const tag of stale) {
            await storageManager.deleteTag(tag.id);
          }
        }
      } catch (e) {
        console.warn('⚠️ [TagService] Failed to soft-delete stale tags:', e);
      }
      
      console.log(`✅ [TagService] Saved ${flatTags.length} tags to StorageManager`);
    } catch (error) {
      console.error('❌ [TagService] Failed to save tags:', error);
      throw error; // 重新抛出错误以便调用方知道保存失败
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
          position: tag.position,
          level: level,
          calendarMapping: tag.calendarMapping,
          dailyAvgCheckins: tag.dailyAvgCheckins,
          dailyAvgDuration: tag.dailyAvgDuration,
          isRecurring: tag.isRecurring
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
    
    // ✅ [CRITICAL FIX] 在这里统一排序，getFlatTags() 直接返回稳定引用
    result.sort((a, b) => (a.position || 0) - (b.position || 0));
    
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
        emoji: tag.emoji,
        parentId: tag.parentId,
        position: tag.position,
        children: [],
        calendarMapping: tag.calendarMapping,
        dailyAvgCheckins: tag.dailyAvgCheckins,
        dailyAvgDuration: tag.dailyAvgDuration,
        isRecurring: tag.isRecurring
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

    // 按 position 排序根标签和所有子标签
    const sortByPosition = (tags: HierarchicalTag[]) => {
      tags.sort((a, b) => (a.position || 0) - (b.position || 0));
      tags.forEach(tag => {
        if (tag.children && tag.children.length > 0) {
          sortByPosition(tag.children);
        }
      });
    };
    sortByPosition(roots);

    return roots;
  }

  // 获取所有标签（层级结构）
  // ✅ [PERFORMANCE FIX] 直接返回内部引用，避免每次创建新数组
  // 调用方不应该修改返回的数组，如需修改请使用 updateTags()
  getTags(): HierarchicalTag[] {
    return this.tags;
  }

  // 获取所有标签（扁平结构）
  // ✅ [PERFORMANCE FIX] 返回稳定引用，避免无限重渲染
  // ⚠️ v3.0: 移除同步加载逻辑，依赖 initialize() 异步加载
  getFlatTags(): FlatTag[] {
    // 如果还没有初始化，返回空数组并触发初始化
    if (!this.initialized) {
      const stack = new Error().stack;
      console.warn('⚠️ [TagService] getFlatTags() called before initialization!', {
        calledFrom: stack?.split('\n')[2]?.trim(),
        willAutoInit: true
      });
      // 触发异步初始化（不阻塞）
      this.initialize().catch(err => {
        console.error('❌ [TagService] Failed to initialize:', err);
      });
      return [];
    }
    
    // ✅ [CRITICAL FIX] 直接返回内部引用，排序在 flattenTags() 或 updateTags() 时完成
    // ❌ 不要每次调用都创建新数组: return [...this.flatTags].sort(...)
    // 调用方不应该修改返回的数组
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