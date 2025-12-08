/**
 * ContactService - 联系人管理服务
 * 
 * 功能：
 * - 统一管理 4DNote 本地联系人和各云平台联系人
 * - 支持联系人的增删改查
 * - 提供联系人搜索和过滤功能
 * - 支持头像管理（Gravatar 集成）
 * - 事件驱动架构：联系人变更自动广播通知
 * 
 * ✅ v2.0: 已迁移到 StorageManager（IndexedDB + SQLite 双写）
 * 
 * 迁移状态：
 * - ✅ 使用 StorageManager 存储
 * - ✅ 支持 IndexedDB + SQLite 双写
 * - ✅ 支持软删除
 * - ✅ LRU 缓存（10 MB）
 * - ✅ 自动数据迁移
 */

import { Contact, ContactSource } from '../types';
import md5 from 'crypto-js/md5';
import { logger } from '../utils/logger';
import { formatTimeForStorage } from '../utils/timeUtils';
import { storageManager } from './storage/StorageManager';
import { generateContactId } from '../utils/idGenerator';

const STORAGE_KEY = '4dnote-contacts';
const contactLogger = logger.module('ContactService');

// 事件类型定义
export type ContactEventType = 
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  | 'contacts.synced';

export interface ContactEvent {
  type: ContactEventType;
  timestamp: string;
  data: any;
}

type ContactEventListener = (event: ContactEvent) => void;

export class ContactService {
  private static contacts: Contact[] = [];
  private static initialized = false;
  private static initializingPromise: Promise<void> | null = null;
  
  // 事件监听器存储
  private static eventListeners: Map<ContactEventType, Set<ContactEventListener>> = new Map();

  /**
   * 初始化联系人服务（异步，使用 StorageManager）
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // 如果正在初始化，返回现有 Promise
    if (this.initializingPromise) {
      return this.initializingPromise;
    }
    
    this.initializingPromise = (async () => {
      try {
        contactLogger.log('🔍 [ContactService] Loading contacts from StorageManager...');
        
        // 从 StorageManager 加载联系人
        const result = await storageManager.queryContacts({ limit: 10000 });
        
        if (result.items.length > 0) {
          this.contacts = result.items;
          contactLogger.log(`✅ [ContactService] Loaded ${this.contacts.length} contacts from storage`);
        } else {
          // 尝试从 localStorage 迁移旧数据
          await this.migrateFromLocalStorage();
        }
        
        this.initialized = true;
      } catch (error) {
        contactLogger.error('❌ [ContactService] Failed to initialize:', error);
        this.contacts = [];
        this.initialized = true;
      } finally {
        this.initializingPromise = null;
      }
    })();
    
    return this.initializingPromise;
  }

  /**
   * 从 localStorage 迁移旧数据
   */
  private static async migrateFromLocalStorage(): Promise<void> {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    
    try {
      const oldContacts: Contact[] = JSON.parse(stored);
      if (oldContacts.length === 0) return;
      
      contactLogger.log(`🔄 [ContactService] Migrating ${oldContacts.length} contacts from localStorage...`);
      
      // 批量写入 StorageManager（自动双写）
      const result = await storageManager.batchCreateContacts(oldContacts);
      contactLogger.log(`✅ [ContactService] Migrated ${result.successful}/${oldContacts.length} contacts`);
      
      // 重新加载到内存
      this.contacts = oldContacts;
      
      // 备份旧数据并清理
      localStorage.setItem(`${STORAGE_KEY}-backup`, stored);
      localStorage.removeItem(STORAGE_KEY);
      
      contactLogger.log('✅ [ContactService] Migration completed, old data backed up');
    } catch (error) {
      contactLogger.error('❌ [ContactService] Migration failed:', error);
    }
  }  /**
   * 添加事件监听器
   * @param eventType 事件类型
   * @param listener 监听器回调函数
   */
  static addEventListener(eventType: ContactEventType, listener: ContactEventListener): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);
    contactLogger.log(`📡 [ContactService] Added listener for ${eventType}`);
  }

  /**
   * 移除事件监听器
   * @param eventType 事件类型
   * @param listener 监听器回调函数
   */
  static removeEventListener(eventType: ContactEventType, listener: ContactEventListener): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
      contactLogger.log(`🔇 [ContactService] Removed listener for ${eventType}`);
    }
  }

  /**
   * 触发事件（内部方法）
   * @param eventType 事件类型
   * @param data 事件数据
   */
  private static emitEvent(eventType: ContactEventType, data: any): void {
    const event: ContactEvent = {
      type: eventType,
      timestamp: formatTimeForStorage(new Date()),
      data,
    };

    const listeners = this.eventListeners.get(eventType);
    if (listeners && listeners.size > 0) {
      contactLogger.log(`🔔 [ContactService] Emitting ${eventType} to ${listeners.size} listener(s)`);
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          contactLogger.error(`❌ [ContactService] Error in listener for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * 保存联系人到 StorageManager（不再需要，已在各方法中直接调用 StorageManager）
   * 保留此方法仅用于向后兼容
   */
  private static async save(): Promise<void> {
    // 不再使用 localStorage，改为在各 CRUD 方法中直接调用 StorageManager
    contactLogger.log('💾 [ContactService] Save called (no-op, using StorageManager)');
  }

  /**
   * 获取所有联系人（异步，从 StorageManager）
   */
  static async getAllContacts(): Promise<Contact[]> {
    await this.initialize();
    // 返回内存缓存的联系人列表
    return this.contacts.map(c => this.parseExtendedFields(c));
  }

  /**
   * 根据 ID 获取联系人（异步）
   */
  static async getContactById(id: string): Promise<Contact | undefined> {
    await this.initialize();
    const contact = this.contacts.find(c => c.id === id);
    return contact ? this.parseExtendedFields(contact) : undefined;
  }

  /**
   * 批量获取联系人（Phase 1.5）
   * @param ids 联系人 ID 数组
   * @returns 联系人数组（保持传入 ID 的顺序）
   */
  static async getContactsByIds(ids: string[]): Promise<Contact[]> {
    await this.initialize();
    
    const contactMap = new Map<string, Contact>();
    this.contacts.forEach(c => {
      if (c.id) contactMap.set(c.id, c);
    });
    
    // 按传入 ID 的顺序返回，并解析扩展字段
    return ids
      .map(id => contactMap.get(id))
      .filter((c): c is Contact => c !== undefined)
      .map(c => this.parseExtendedFields(c));
  }

  /**
   * 根据邮箱获取联系人（异步）
   */
  static async getContactByEmail(email: string): Promise<Contact | undefined> {
    await this.initialize();
    return this.contacts.find(c => c.email?.toLowerCase() === email.toLowerCase());
  }

  /**
   * 搜索联系人（异步）
   * @param query 搜索关键词（匹配姓名、邮箱、组织）
   * @param source 筛选平台来源
   */
  static async searchContacts(query: string, source?: ContactSource): Promise<Contact[]> {
    await this.initialize();
    
    const lowerQuery = query.toLowerCase();
    let results = this.contacts.filter(contact => {
      const matchesQuery = 
        contact.name?.toLowerCase().includes(lowerQuery) ||
        contact.email?.toLowerCase().includes(lowerQuery) ||
        contact.organization?.toLowerCase().includes(lowerQuery);
      
      if (!matchesQuery) return false;

      // 平台来源过滤
      if (source) {
        switch (source) {
          case '4dnote':
            return contact.is4DNote === true;
          case 'outlook':
            return contact.isOutlook === true;
          case 'google':
            return contact.isGoogle === true;
          case 'icloud':
            return contact.isiCloud === true;
        }
      }

      return true;
    });

    return results;
  }

  /**
   * 合并多来源联系人，去重并按优先级排序（Phase 1.5）
   * @param contacts 来自不同来源的联系人数组
   * @returns 去重后的联系人数组
   * 
   * 优先级：Outlook/Google/iCloud > 4DNote > 历史参会人
   * 去重规则：邮箱相同视为同一人，无邮箱则按姓名去重
   */
  static mergeContactSources(contacts: Contact[]): Contact[] {
    const uniqueMap = new Map<string, Contact>();
    
    contacts.forEach(contact => {
      // 生成唯一标识：优先用邮箱，否则用姓名
      const key = contact.email?.toLowerCase() || contact.name?.toLowerCase() || '';
      if (!key) return; // 跳过无效联系人
      
      const existing = uniqueMap.get(key);
      
      if (!existing) {
        // 首次出现，直接添加
        uniqueMap.set(key, contact);
      } else {
        // 已存在，比较优先级
        const newPriority = this.getSourcePriority(contact);
        const existingPriority = this.getSourcePriority(existing);
        
        if (newPriority < existingPriority) {
          // 新来源优先级更高，替换
          uniqueMap.set(key, contact);
        } else if (newPriority === existingPriority) {
          // 优先级相同，合并信息（保留更完整的数据）
          uniqueMap.set(key, this.mergeContactData(existing, contact));
        }
      }
    });
    
    return Array.from(uniqueMap.values());
  }

  /**
   * 获取联系人来源优先级（数字越小优先级越高）
   */
  private static getSourcePriority(contact: Contact): number {
    if (contact.isOutlook || contact.isGoogle || contact.isiCloud) return 1;
    if (contact.is4DNote) return 2;
    return 3; // 历史参会人（无来源标识）
  }

  /**
   * 合并两个联系人的数据（优先保留非空字段）
   */
  private static mergeContactData(contact1: Contact, contact2: Contact): Contact {
    return {
      id: contact1.id || contact2.id,
      name: contact1.name || contact2.name,
      email: contact1.email || contact2.email,
      phone: contact1.phone || contact2.phone,
      avatarUrl: contact1.avatarUrl || contact2.avatarUrl,
      organization: contact1.organization || contact2.organization,
      position: contact1.position || contact2.position,
      notes: contact1.notes || contact2.notes,
      is4DNote: contact1.is4DNote || contact2.is4DNote,
      isOutlook: contact1.isOutlook || contact2.isOutlook,
      isGoogle: contact1.isGoogle || contact2.isGoogle,
      isiCloud: contact1.isiCloud || contact2.isiCloud,
      createdAt: contact1.createdAt || contact2.createdAt,
      updatedAt: contact1.updatedAt || contact2.updatedAt,
    };
  }

  /**
   * 添加联系人（异步，使用 StorageManager）
   */
  static async addContact(contact: Omit<Contact, 'id'>): Promise<Contact> {
    await this.initialize();
    
    const newContact: Contact = {
      ...contact,
      id: generateContactId(),
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
    };

    // 设置头像（如果有邮箱但没有头像）
    if (newContact.email && !newContact.avatarUrl) {
      newContact.avatarUrl = this.getGravatarUrl(newContact.email);
    }

    // 写入 StorageManager（自动双写）
    await storageManager.createContact(newContact);

    // 更新内存缓存
    this.contacts.push(newContact);
    
    // 触发创建事件
    this.emitEvent('contact.created', { contact: newContact });
    
    contactLogger.log('✅ [ContactService] Created contact:', newContact.name);
    return newContact;
  }

  /**
   * 保存联系人（addContact 的别名，异步）
   */
  static async saveContact(contact: Omit<Contact, 'id'>): Promise<Contact> {
    return await this.addContact(contact);
  }

  /**
   * 批量添加联系人（异步，使用 StorageManager）
   */
  static async addContacts(contacts: Omit<Contact, 'id'>[]): Promise<Contact[]> {
    await this.initialize();
    
    const timestamp = formatTimeForStorage(new Date());
    const newContacts = contacts.map(contact => {
      const newContact: Contact = {
        ...contact,
        id: generateContactId(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      if (newContact.email && !newContact.avatarUrl) {
        newContact.avatarUrl = this.getGravatarUrl(newContact.email);
      }

      return newContact;
    });

    // 批量写入 StorageManager
    const result = await storageManager.batchCreateContacts(newContacts);
    
    if (result.failed.length > 0) {
      contactLogger.warn(`⚠️ [ContactService] Failed to create ${result.failed.length} contacts`);
    }

    // 更新内存缓存（只添加成功的）
    const successfulContacts = newContacts.filter(c => 
      !result.failed.some(f => f.contact.id === c.id)
    );
    this.contacts.push(...successfulContacts);
    
    // 触发批量同步事件
    this.emitEvent('contacts.synced', { 
      count: successfulContacts.length,
      contacts: successfulContacts,
    });
    
    contactLogger.log('✅ [ContactService] Added', successfulContacts.length, 'contacts');
    return successfulContacts;
  }

  /**
   * 更新联系人（异步，使用 StorageManager）
   */
  static async updateContact(id: string, updates: Partial<Contact>): Promise<Contact | null> {
    await this.initialize();
    
    const index = this.contacts.findIndex(c => c.id === id);
    if (index === -1) {
      contactLogger.warn(`⚠️ [ContactService] Contact not found: ${id}`);
      return null;
    }

    const before = { ...this.contacts[index] };
    
    // 序列化扩展字段（如果有 position 或 tags）
    const updatesToSave = this.serializeExtendedFields({
      ...this.contacts[index],
      ...updates,
      updatedAt: formatTimeForStorage(new Date()),
    });
    
    // 更新头像
    if (updates.email && !updates.avatarUrl) {
      updatesToSave.avatarUrl = this.getGravatarUrl(updates.email);
    }

    // 写入 StorageManager（自动双写）
    await storageManager.updateContact(updatesToSave);

    // 更新内存缓存
    this.contacts[index] = updatesToSave;
    
    // 触发更新事件（返回解析后的数据）
    const after = this.parseExtendedFields(this.contacts[index]);
    this.emitEvent('contact.updated', { id, before: this.parseExtendedFields(before), after });
    
    contactLogger.log('✅ [ContactService] Updated contact:', after.name);
    return after;
  }

  /**
   * 删除联系人（异步，使用 StorageManager 软删除）
   */
  static async deleteContact(id: string): Promise<boolean> {
    await this.initialize();
    
    const index = this.contacts.findIndex(c => c.id === id);
    if (index === -1) {
      contactLogger.warn(`⚠️ [ContactService] Contact not found: ${id}`);
      return false;
    }

    const deleted = this.contacts[index];
    
    // 使用 StorageManager 软删除（设置 deletedAt）
    await storageManager.deleteContact(id);
    
    // 从内存缓存中移除
    this.contacts.splice(index, 1);
    
    // 触发删除事件
    this.emitEvent('contact.deleted', { id, contact: deleted });
    
    contactLogger.log('✅ [ContactService] Deleted contact:', deleted.name);
    return true;
  }

  /**
   * 从 Event 的 organizer/attendees 中提取联系人并自动添加到联系人列表
   */
  static extractAndAddFromEvent(organizer?: Contact, attendees?: Contact[]): void {
    this.initialize();
    
    const contactsToAdd: Contact[] = [];

    // 提取组织者
    if (organizer && organizer.email) {
      const existing = this.getContactByEmail(organizer.email);
      if (!existing) {
        contactsToAdd.push({ ...organizer, is4DNote: true });
      }
    }

    // 提取参会人
    if (attendees) {
      attendees.forEach(attendee => {
        if (attendee.email) {
          const existing = this.getContactByEmail(attendee.email);
          if (!existing) {
            contactsToAdd.push({ ...attendee, is4DNote: true });
          }
        }
      });
    }

    if (contactsToAdd.length > 0) {
      this.addContacts(contactsToAdd);
    }
  }

  /**
   * 生成联系人 ID（已迁移到 utils/idGenerator.ts）
   * 保留此方法仅用于向后兼容
   */
  private static generateContactId(): string {
    return generateContactId();
  }

  /**
   * 从 notes 中解析扩展字段（Phase 1.5）
   * 解析格式：
   * 职务：产品经理
   * 标签：重要客户, VIP
   */
  private static parseExtendedFields(contact: Contact): Contact {
    if (!contact.notes) return contact;
    
    try {
      const lines = contact.notes.split('\n');
      const extended: any = { ...contact };
      const remainingNotes: string[] = [];
      
      lines.forEach(line => {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('职务：')) {
          extended.position = trimmed.replace('职务：', '').trim();
        } else if (trimmed.startsWith('标签：')) {
          const tagsStr = trimmed.replace('标签：', '').trim();
          extended.tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
        } else if (trimmed) {
          // 保留其他 notes 内容
          remainingNotes.push(trimmed);
        }
      });
      
      // 更新 notes（移除已解析的扩展字段）
      if (remainingNotes.length > 0) {
        extended.notes = remainingNotes.join('\n');
      } else {
        extended.notes = undefined;
      }
      
      return extended;
    } catch (e) {
      contactLogger.warn('⚠️ [ContactService] Failed to parse extended fields:', e);
      return contact;
    }
  }

  /**
   * 将扩展字段序列化到 notes（Phase 1.5）
   */
  private static serializeExtendedFields(contact: any): Contact {
    const { position, tags, ...baseContact } = contact;
    const notesLines: string[] = [];
    
    // 序列化扩展字段
    if (position) notesLines.push(`职务：${position}`);
    if (tags && Array.isArray(tags) && tags.length > 0) {
      notesLines.push(`标签：${tags.join(', ')}`);
    }
    
    // 保留原有 notes 中的其他内容
    if (baseContact.notes) {
      const existingNotes = baseContact.notes.split('\n').filter((line: string) => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('职务：') && !trimmed.startsWith('标签：');
      });
      notesLines.push(...existingNotes);
    }
    
    return {
      ...baseContact,
      notes: notesLines.length > 0 ? notesLines.join('\n') : undefined,
    };
  }

  /**
   * 获取 Gravatar 头像 URL
   * @param email 邮箱地址
   * @param size 头像尺寸（默认 200）
   */
  static getGravatarUrl(email: string, size: number = 200): string {
    const hash = md5(email.toLowerCase().trim()).toString();
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
  }

  /**
   * 获取联系人头像 URL
   * 优先级：自定义头像 > Gravatar > 默认头像
   */
  static getAvatarUrl(contact: Contact): string {
    if (contact.avatarUrl) {
      return contact.avatarUrl;
    }
    
    if (contact.email) {
      return this.getGravatarUrl(contact.email);
    }

    // 返回默认头像（使用首字母）
    const initial = contact.name?.charAt(0).toUpperCase() || '?';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&size=200&background=random`;
  }

  /**
   * 获取平台来源显示文本
   */
  static getSourceLabel(contact: Contact): string {
    if (contact.is4DNote) return '4DNote';
    if (contact.isOutlook) return 'Outlook';
    if (contact.isGoogle) return 'Google';
    if (contact.isiCloud) return 'iCloud';
    return '未知';
  }

  /**
   * 导出联系人为 JSON
   */
  static exportContacts(): string {
    this.initialize();
    return JSON.stringify(this.contacts, null, 2);
  }

  /**
   * 从 JSON 导入联系人
   */
  static importContacts(json: string): number {
    try {
      const imported = JSON.parse(json) as Contact[];
      if (!Array.isArray(imported)) {
        throw new Error('Invalid format: expected array');
      }

      const added = this.addContacts(imported);
      return added.length;
    } catch (error) {
      console.error('[ContactService] Failed to import contacts:', error);
      throw error;
    }
  }

  /**
   * 搜索平台联系人（Outlook/Google/iCloud）
   */
  static searchPlatformContacts(query: string): Contact[] {
    this.initialize();
    const lowerQuery = query.toLowerCase();
    
    const results = this.contacts.filter(contact => {
      // 必须来自平台
      if (!contact.isOutlook && !contact.isGoogle && !contact.isiCloud) {
        return false;
      }
      
      // 匹配搜索关键词
      return (
        contact.name?.toLowerCase().includes(lowerQuery) ||
        contact.email?.toLowerCase().includes(lowerQuery) ||
        contact.organization?.toLowerCase().includes(lowerQuery)
      );
    });
    
    // 解析扩展字段
    return results.map(c => this.parseExtendedFields(c));
  }

  /**
   * 搜索本地联系人（4DNote）
   */
  static searchLocalContacts(query: string): Contact[] {
    this.initialize();
    const lowerQuery = query.toLowerCase();
    
    const results = this.contacts.filter(contact => {
      // 必须是本地联系人
      if (!contact.is4DNote) {
        return false;
      }
      
      // 匹配搜索关键词
      return (
        contact.name?.toLowerCase().includes(lowerQuery) ||
        contact.email?.toLowerCase().includes(lowerQuery) ||
        contact.organization?.toLowerCase().includes(lowerQuery)
      );
    });
    
    // 解析扩展字段
    return results.map(c => this.parseExtendedFields(c));
  }

  /**
   * 获取完整联系人信息
   * 包括扩展字段（职务、标签等）
   */
  static getFullContactInfo(contact: Contact): Contact {
    this.initialize();
    
    // 如果有 ID，从存储中获取最新数据
    if (contact.id) {
      const stored = this.getContactById(contact.id);
      if (stored) {
        return stored;
      }
    }
    
    // 否则返回传入的数据（解析扩展字段）
    return this.parseExtendedFields(contact);
  }
}

// 自动初始化
ContactService.initialize();
