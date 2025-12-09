import React, { useState, useEffect } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import ColorPicker from './ColorPicker';
import CalendarMappingPicker from '../features/Calendar/components/CalendarMappingPicker';
import { STORAGE_KEYS } from '../constants/storage';
import { PersistentStorage, PERSISTENT_OPTIONS } from '../utils/persistentStorage';
import { icons } from '../assets/icons';
import './TagManager.css';

import { logger } from '../utils/logger';
import { generateTagId } from '../utils/idGenerator';

const TagManagerLogger = logger.module('TagManager');
// 标签数据持久化工具函数
const saveTagsToStorage = async (tags: ExtendedHierarchicalTag[]) => {
  try {
    // 保存到 localStorage（兼容性）
    PersistentStorage.setItem(STORAGE_KEYS.HIERARCHICAL_TAGS, tags, PERSISTENT_OPTIONS.TAGS);
    
    // 🔧 同步到 TagService（保存到 StorageManager/IndexedDB）
    const { TagService } = await import('../services/TagService');
    TagService.updateTags(tags);
    TagManagerLogger.log('✅ [TagManager] Synced tags to TagService');
  } catch (error) {
    TagManagerLogger.error('❌ [TagManager] Failed to save tags:', error);
  }
};

const loadTagsFromStorage = (): ExtendedHierarchicalTag[] => {
  try {
    const saved = PersistentStorage.getItem(STORAGE_KEYS.HIERARCHICAL_TAGS, PERSISTENT_OPTIONS.TAGS);
    return saved ? saved : [];
  } catch (error) {
    TagManagerLogger.error('Failed to load tags from localStorage:', error);
    return [];
  }
};

const saveCheckinCountsToStorage = (counts: { [tagId: string]: number }) => {
  try {
    PersistentStorage.setItem(STORAGE_KEYS.CHECKIN_COUNTS, counts, PERSISTENT_OPTIONS.CHECKIN_COUNTS);
  } catch (error) {
    TagManagerLogger.error('Failed to save checkin counts to localStorage:', error);
  }
};

const loadCheckinCountsFromStorage = (): { [tagId: string]: number } => {
  try {
    const saved = PersistentStorage.getItem(STORAGE_KEYS.CHECKIN_COUNTS, PERSISTENT_OPTIONS.CHECKIN_COUNTS);
    return saved ? saved : {};
  } catch (error) {
    TagManagerLogger.error('Failed to load checkin counts from localStorage:', error);
    return {};
  }
};

// 扩展标签接口
interface ExtendedHierarchicalTag {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  level?: number;
  parentId?: string;
  position?: number; // 标签在列表中的位置顺序
  calendarMapping?: {
    calendarId: string;
    calendarName: string;
    color?: string;
  } | undefined;
  dailyAvgCheckins?: number;
  dailyAvgDuration?: number;
  isRecurring?: boolean;
}

interface TagManagerProps {
  microsoftService?: any;
  tagService?: any; // TagService实例
  availableCalendars?: any[]; // 已同步的日历列表
  globalTimer?: {
    tagId: string;
    tagIds: string[]; // 🆕 完整的标签数组
    isRunning: boolean;
    startTime: number;
    elapsedTime: number;
  } | null;
  onTimerStart?: (tagIds?: string | string[], eventIdOrParentId?: string) => void; // 🔧 修改：支持 tagIds 数组
  onTimerPause?: () => void;
  onTimerResume?: () => void;
  onTimerStop?: () => void;
  onTagsChange?: (tags: ExtendedHierarchicalTag[]) => void; // 标签变化回调
}

const TagManager: React.FC<TagManagerProps> = ({
  microsoftService,
  tagService,
  availableCalendars,
  globalTimer,
  onTimerStart,
  onTimerPause,
  onTimerResume,
  onTimerStop,
  onTagsChange
}) => {
  const [tags, setTags] = useState<ExtendedHierarchicalTag[]>([]);
  const [checkinCounts, setCheckinCounts] = useState<{ [tagId: string]: number }>({});
  
  // 新标签创建状态
  const [newTagId, setNewTagId] = useState<string | null>(null);
  const [isCreatingNewTag, setIsCreatingNewTag] = useState<boolean>(false); // 新增：控制是否正在创建新标签
  const [userClickedGrayText, setUserClickedGrayText] = useState<boolean>(false); // 新增：跟踪用户是否明确点击了灰色文本
  
  // 选择器状态
  const [showColorPicker, setShowColorPicker] = useState<{ 
    show: boolean; 
    tagId: string; 
    position: { x: number; y: number } 
  }>({
    show: false,
    tagId: '',
    position: { x: 0, y: 0 }
  });
  
  const [showEmojiPicker, setShowEmojiPicker] = useState<{ 
    show: boolean; 
    tagId: string; 
    position: { x: number; y: number } 
  }>({
    show: false,
    tagId: '',
    position: { x: 0, y: 0 }
  });
  
  // 拖拽相关状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // 改进的位置计算函数
  const calculateOptimalPosition = (rect: DOMRect, pickerWidth = 352, pickerHeight = 435) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;
    
    let x = rect.left;
    let y = rect.bottom + 5;
    
    // 右边界检查
    if (x + pickerWidth > viewportWidth) {
      x = viewportWidth - pickerWidth - 10;
    }
    
    // 左边界检查
    if (x < 10) {
      x = 10;
    }
    
    // 下边界检查
    if (y + pickerHeight > viewportHeight + scrollY) {
      y = rect.top - pickerHeight - 5; // 在元素上方显示
    }
    
    // 上边界检查
    if (y < scrollY + 10) {
      y = scrollY + 10;
    }
    
    return { x, y };
  };
  
  
  const [showCalendarPicker, setShowCalendarPicker] = useState<{ 
    show: boolean; 
    tagId: string; 
    position: { x: number; y: number } 
  }>({
    show: false,
    tagId: '',
    position: { x: 0, y: 0 }
  });
  
  // 添加hover状态管理
  const [hoveredTagId, setHoveredTagId] = useState<string | null>(null);
  
  // ?? 追踪选中的标签ID列表
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  
  // 🆕 初始化状态跟踪
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // 初始化数据- 从localStorage加载或使用空数据
  useEffect(() => {
    const startTime = performance.now();
    TagManagerLogger.log('?? [TagManager] Component initializing...');
    
    const savedTags = loadTagsFromStorage();
    const savedCounts = loadCheckinCountsFromStorage();
    
    TagManagerLogger.log(`?? [TagManager] Loaded ${savedTags.length} tags from storage`);
    
    // ? 智能迁移：根据parentId关系计算level层级
    const calculateTagLevel = (tag: ExtendedHierarchicalTag, allTags: ExtendedHierarchicalTag[], visited = new Set<string>()): number => {
      // 如果已经有level,直接返回
      if (tag.level !== undefined) {
        return tag.level;
      }
      
      // 如果没有parentId,是顶级标签
      if (!tag.parentId) {
        return 0;
      }
      
      // 防止循环引用
      if (visited.has(tag.id)) {
        TagManagerLogger.warn('?? 检测到循环引用:', tag.id, tag.name);
        return 0;
      }
      visited.add(tag.id);
      
      // 找到父标签
      const parent = allTags.find(t => t.id === tag.parentId);
      if (!parent) {
        TagManagerLogger.warn('?? 找不到父标签:', tag.parentId, '对于标签:', tag.name);
        return 0;
      }
      
      // 递归计算父标签的level,然后+1
      return calculateTagLevel(parent, allTags, visited) + 1;
    };
    
    // 为所有标签计算level
    const migratedTags = savedTags.map((tag, index) => ({
      ...tag,
      level: calculateTagLevel(tag, savedTags),
      parentId: tag.parentId || undefined,
      position: tag.position !== undefined ? tag.position : index // ?? 如果没有position，使用索引
    }));
    
    // ?? 诊断：输出所有标签的层级信息
    TagManagerLogger.log('?? [TagManager] 标签层级信息:');
    console.table(migratedTags.map(tag => ({
      name: tag.name,
      level: tag.level,
      position: tag.position,
      parentId: tag.parentId || '(无)',
      hasLevel: tag.level !== undefined
    })));
    
    // ?? 如果有标签的level被计算出来了，或者position被初始化了，保存回存储（一次性迁移）
    const hasLevelCalculated = migratedTags.some(tag => 
      tag.level !== undefined && tag.level > 0 && savedTags.find(t => t.id === tag.id && t.level === undefined)
    );
    const hasPositionInitialized = migratedTags.some(tag =>
      tag.position !== undefined && savedTags.find(t => t.id === tag.id && t.position === undefined)
    );
    if (hasLevelCalculated || hasPositionInitialized) {
      TagManagerLogger.log('?? [TagManager] Saving calculated levels and positions to storage...');
      saveTagsToStorage(migratedTags);
    }
    
    // 如果有保存的数据，使用它们，否则初始化为空
    setTags(migratedTags);
    setCheckinCounts(savedCounts);
    
    const duration = performance.now() - startTime;
    TagManagerLogger.log(`? [TagManager] Initialized in ${duration.toFixed(2)}ms`);
    
    // 🛡️ 标记初始化完成，允许后续的onTagsChange触发
    setTimeout(() => setIsInitialized(true), 0);
  }, []);

  // 自动保存标签数据到localStorage
  useEffect(() => {
    if (tags.length > 0) {
      saveTagsToStorage(tags);
    }
  }, [tags]);

  // 自动保存打卡计数到localStorage
  useEffect(() => {
    if (Object.keys(checkinCounts).length > 0) {
      saveCheckinCountsToStorage(checkinCounts);
    }
  }, [checkinCounts]);

  // 强制更新以显示实时计时
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (globalTimer?.isRunning) {
      // 每秒强制更新一次
      interval = setInterval(() => {
        forceUpdate(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [globalTimer?.isRunning]);

  // 监听全局焦点事件的useEffect - 简化版本，仅用于调试
  useEffect(() => {
    const handleGlobalFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.textContent?.includes('新增标签')) {
        TagManagerLogger.log('?? GLOBAL FOCUS on gray text detected! (Should not happen in new implementation)');
        TagManagerLogger.log('?? Focus event details:', {
          target: target,
          relatedTarget: e.relatedTarget,
          eventType: e.type,
          timeStamp: e.timeStamp,
          bubbles: e.bubbles
        });
        TagManagerLogger.log('?? Call stack:', new Error().stack);
      }
    };

    document.addEventListener('focus', handleGlobalFocus, true); // 使用capture阶段
    
    return () => {
      document.removeEventListener('focus', handleGlobalFocus, true);
    };
  }, []);

  // 通知父组件标签变化 - 添加防抖避免重复调用
  useEffect(() => {
    TagManagerLogger.log('??? [FigmaTagManager] Tags changed, current count:', tags.length);
    
    // 🛡️ 初始化期间不触发onTagsChange，避免不必要的重渲染
    if (!isInitialized) {
      TagManagerLogger.log('🔧 [FigmaTagManager] Skipping onTagsChange during initialization');
      return;
    }
    
    // 使用 setTimeout 防抖，避免频繁触发
    const timer = setTimeout(() => {
      if (onTagsChange && tags.length > 0) {
        // ?? 添加层级信息诊断
        TagManagerLogger.log('??? [FigmaTagManager] Calling onTagsChange with tags:', tags.map(t => ({
          id: t.id, 
          name: t.name, 
          level: t.level, // ?? 检查level是否存在
          parentId: t.parentId
        })));
        onTagsChange(tags);
      } else if (onTagsChange && tags.length === 0) {
        TagManagerLogger.log('??? [FigmaTagManager] Tags array is empty, not calling onTagsChange');
      } else if (!onTagsChange) {
        TagManagerLogger.warn('?? [FigmaTagManager] onTagsChange callback not provided!');
      }
    }, 100); // 100ms 防抖
    
    return () => clearTimeout(timer);
  }, [tags, onTagsChange, isInitialized]);

  // Removed global keyboard handler to prevent duplicate events with component handlers

  // 处理颜色选择
  const handleColorClick = (tagId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setShowColorPicker({
      show: true,
      tagId,
      position: { x: rect.left, y: rect.bottom + 5 }
    });
  };

  const handleColorSelect = (color: string) => {
    setTags(prevTags =>
      prevTags.map(tag =>
        tag.id === showColorPicker.tagId
          ? { ...tag, color }
          : tag
      )
    );
    setShowColorPicker({ show: false, tagId: '', position: { x: 0, y: 0 } });
  };

  // 处理emoji选择
  const handleEmojiClick = (tagId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const optimalPosition = calculateOptimalPosition(rect);
    setShowEmojiPicker({
      show: true,
      tagId,
      position: optimalPosition
    });
  };

  const handleEmojiSelect = (emoji: string) => {
    setTags(prevTags =>
      prevTags.map(tag =>
        tag.id === showEmojiPicker.tagId
          ? { ...tag, emoji }
          : tag
      )
    );
    setShowEmojiPicker({ show: false, tagId: '', position: { x: 0, y: 0 } });
  };

  // 拖拽处理函数
  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    // 排除emoji按钮、搜索框等交互元素
    const target = e.target as HTMLElement;
    const isInteractiveElement = target.tagName === 'BUTTON' || 
                                target.tagName === 'INPUT' || 
                                target.closest('button') || 
                                target.closest('input') ||
                                target.closest('[role="button"]') ||
                                target.classList.contains('emoji') ||
                                target.closest('.emoji');
    
    if (!isInteractiveElement) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - showEmojiPicker.position.x,
        y: e.clientY - showEmojiPicker.position.y
      });
    }
  }, [showEmojiPicker.position]);

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (isDragging) {
      setShowEmojiPicker(prev => ({
        ...prev,
        position: {
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        }
      }));
    }
  }, [isDragging, dragOffset]);

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  // 添加全局鼠标事件监听
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset, handleMouseMove, handleMouseUp]);

  // ?? 处理粘贴事件 - 批量导入标签
  useEffect(() => {
    // ?? 处理复制事件 - 在剪贴板中添加层级和颜色信息
    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      
      // 检查是否选中了标签
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const parentElement = container.nodeType === Node.TEXT_NODE 
        ? container.parentElement 
        : container as HTMLElement;
      
      // 查找所有选中的标签
      const selectedTags = tags.filter(tag => {
        const tagElement = document.querySelector(`[data-tag-id="${tag.id}"]`);
        if (!tagElement) return false;
        return selection.containsNode(tagElement, true);
      });
      
      if (selectedTags.length === 0) return;
      
      TagManagerLogger.log('?? [Copy] Selected tags:', selectedTags.length);
      
      // 生成带缩进的文本格式
      const textFormat = selectedTags
        .map(tag => {
          const indent = ' '.repeat((tag.level || 0) * 2); // 每级2个空格
          const emoji = tag.emoji || '';
          return `${indent}#${emoji} ${tag.name}`;
        })
        .join('\n');
      
      // 生成JSON格式（包含完整信息，标记为复制操作）
      const jsonData = {
        isCut: false, // 标记为复制操作
        tags: selectedTags.map(tag => ({
          id: tag.id, // 保留ID用于后续处理
          name: tag.name,
          emoji: tag.emoji,
          color: tag.color,
          level: tag.level || 0,
          parentId: tag.parentId
        }))
      };
      
      const jsonFormat = JSON.stringify(jsonData);
      
      // ?? Electron环境下，自定义MIME类型可能不被支持
      // 使用特殊标记 + Base64 编码的方式存储JSON数据在文本中
      const jsonBase64 = btoa(encodeURIComponent(jsonFormat));
      const textWithJson = `__REMARKABLE_TAGS_JSON__${jsonBase64}__\n${textFormat}`;
      
      // 同时写入两种格式到剪贴板
      try {
        e.clipboardData?.setData('text/plain', textWithJson);
        e.clipboardData?.setData('application/json', jsonFormat); // 尝试设置JSON（可能不被支持）
        e.preventDefault();
        
        TagManagerLogger.log('?? [Copy] Copied to clipboard:', {
          textFormat: textFormat,
          jsonData: jsonData,
          tagsCount: selectedTags.length,
          hasCustomFormat: true
        });
      } catch (error) {
        TagManagerLogger.error('?? [Copy] Error setting clipboard data:', error);
      }
    };

    // ?? 处理剪切事件 - 标记为移动操作
    const handleCut = (e: ClipboardEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      
      // 查找所有选中的标签
      const selectedTags = tags.filter(tag => {
        const tagElement = document.querySelector(`[data-tag-id="${tag.id}"]`);
        if (!tagElement) return false;
        return selection.containsNode(tagElement, true);
      });
      
      if (selectedTags.length === 0) return;
      
      TagManagerLogger.log('?? [Cut] Selected tags:', selectedTags.length);
      
      // 生成带缩进的文本格式
      const textFormat = selectedTags
        .map(tag => {
          const indent = ' '.repeat((tag.level || 0) * 2);
          const emoji = tag.emoji || '';
          return `${indent}#${emoji} ${tag.name}`;
        })
        .join('\n');
      
      // 生成JSON格式（包含完整信息和原始ID，标记为剪切操作）
      const jsonData = {
        isCut: true, // 标记为剪切操作
        tags: selectedTags.map(tag => ({
          id: tag.id, // 保留原始ID用于移动
          name: tag.name,
          emoji: tag.emoji,
          color: tag.color,
          level: tag.level || 0,
          parentId: tag.parentId
        }))
      };
      
      const jsonFormat = JSON.stringify(jsonData);
      
      // ?? 使用特殊标记 + Base64 编码存储JSON数据
      const jsonBase64 = btoa(encodeURIComponent(jsonFormat));
      const textWithJson = `__REMARKABLE_TAGS_JSON__${jsonBase64}__\n${textFormat}`;
      
      // 写入剪贴板
      try {
        e.clipboardData?.setData('text/plain', textWithJson);
        e.clipboardData?.setData('application/json', jsonFormat);
        e.preventDefault();
        
        TagManagerLogger.log('?? [Cut] Cut to clipboard:', {
          textFormat: textFormat,
          jsonData: jsonData,
          tagsCount: selectedTags.length
        });
        
        // 保存待删除的标签ID（粘贴后删除）
        (window as any).__cutTagIds = selectedTags.map(t => t.id);
      } catch (error) {
        TagManagerLogger.error('?? [Cut] Error setting clipboard data:', error);
      }
    };
    
    // ?? 辅助函数：处理复制+粘贴（创建新标签）
    const handleCopyPaste = (tagsData: any[]) => {
      setTags(prevTags => {
        const newTags = [...prevTags];
        const maxPosition = Math.max(...newTags.map(t => t.position || 0), -1);
        
        const idMap = new Map<string, string>(); // 旧ID -> 新ID的映射
        
        tagsData.forEach((tagData: any, index: number) => {
          const newId = `tag-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          idMap.set(tagData.id, newId);
          
          // 查找父标签
          let parentId: string | undefined = undefined;
          if (tagData.level > 0) {
            for (let i = index - 1; i >= 0; i--) {
              if (tagsData[i].level < tagData.level) {
                const parentOldId = tagsData[i].id;
                parentId = idMap.get(parentOldId);
                break;
              }
            }
          }
          
          const newTag: ExtendedHierarchicalTag = {
            id: newId,
            name: tagData.name,
            color: tagData.color || '#3b82f6',
            emoji: tagData.emoji,
            level: tagData.level,
            parentId,
            position: maxPosition + index + 1
          };
          
          TagManagerLogger.log(`?? [CopyPaste] Creating tag #${index}:`, { name: newTag.name, color: newTag.color, level: newTag.level });
          newTags.push(newTag);
        });
        
        TagManagerLogger.log('? [CopyPaste] Created new tags:', tagsData.length);
        return newTags;
      });
    };
    
    // ?? 辅助函数：处理剪切+粘贴（移动标签）
    const handleCutPaste = (tagsData: any[]) => {
      setTags(prevTags => {
        const cutTagIds = (window as any).__cutTagIds || [];
        const newTags = [...prevTags];
        const maxPosition = Math.max(...newTags.map(t => t.position || 0), -1);
        
        // 1. 删除原位置的标签
        const remainingTags = newTags.filter(t => !cutTagIds.includes(t.id));
        
        // 2. 在新位置添加标签（保留原ID）
        tagsData.forEach((tagData: any, index: number) => {
          // 查找新的父标签ID
          let newParentId: string | undefined = undefined;
          if (tagData.level > 0) {
            for (let i = index - 1; i >= 0; i--) {
              if (tagsData[i].level < tagData.level) {
                newParentId = tagsData[i].id;
                break;
              }
            }
          }
          
          // 保留原ID
          const movedTag: ExtendedHierarchicalTag = {
            id: tagData.id, // 保留原始ID
            name: tagData.name,
            color: tagData.color || '#3b82f6',
            emoji: tagData.emoji,
            level: tagData.level,
            parentId: newParentId,
            position: maxPosition + index + 1
          };
          
          TagManagerLogger.log(`?? [CutPaste] Moving tag #${index}:`, { name: movedTag.name, color: movedTag.color, level: movedTag.level });
          remainingTags.push(movedTag);
        });
        
        // 清除待删除标记
        delete (window as any).__cutTagIds;
        
        TagManagerLogger.log('? [CutPaste] Moved tags:', tagsData.length);
        return remainingTags;
      });
    };
    
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      
      // ?? 优先检查是否是我们的自定义格式（带 __REMARKABLE_TAGS_JSON__ 标记）
      const pastedText = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('text');
      const isRemarkableFormat = pastedText?.startsWith('__REMARKABLE_TAGS_JSON__');
      
      TagManagerLogger.log('?? [Paste] Event triggered:', {
        targetTag: target.tagName,
        isEditable: target.contentEditable === 'true',
        isRemarkableFormat: isRemarkableFormat,
        className: target.className
      });
      
      // 如果不是我们的格式，且目标是可编辑元素，就让浏览器处理默认粘贴
      if (!isRemarkableFormat && (target.contentEditable === 'true' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        TagManagerLogger.log('?? [Paste] Allowing default paste behavior in editable element');
        return;
      }
      
      // 如果是我们的格式，无论在哪里都要处理（包括编辑框）
      TagManagerLogger.log('?? [Paste] Processing paste event');
      TagManagerLogger.log('?? [Paste] Raw pasted text FULL:', pastedText);
      TagManagerLogger.log('?? [Paste] Text starts with marker?', isRemarkableFormat);
      TagManagerLogger.log('?? [Paste] First 200 chars:', pastedText?.substring(0, 200));
      
      if (pastedText && pastedText.startsWith('__REMARKABLE_TAGS_JSON__')) {
        try {
          // 提取 Base64 编码的 JSON
          const match = pastedText.match(/^__REMARKABLE_TAGS_JSON__(.+?)__\n/);
          if (match) {
            const jsonBase64 = match[1];
            const jsonFormat = decodeURIComponent(atob(jsonBase64));
            const parsedData = JSON.parse(jsonFormat);
            
            TagManagerLogger.log('? [Paste] Extracted JSON from Base64 text successfully:', parsedData);
            
            const isCut = parsedData.isCut === true;
            const tagsData = parsedData.tags || [];
            
            if (Array.isArray(tagsData) && tagsData.length > 0) {
              e.preventDefault();
              
              if (isCut) {
                // ?? 剪切 + 粘贴 = 移动操作（保留原ID）
                TagManagerLogger.log('?? [Paste] Detected CUT operation from Base64');
                handleCutPaste(tagsData);
              } else {
                // ?? 复制 + 粘贴 = 新建操作（生成新ID）
                TagManagerLogger.log('?? [Paste] Detected COPY operation from Base64');
                handleCopyPaste(tagsData);
              }
              return; // 成功处理，退出
            }
          }
        } catch (error) {
          TagManagerLogger.warn('?? [Paste] Failed to extract Base64 JSON:', error);
        }
      }
      
      // ?? Step 2: 回退尝试读取 application/json（备用方案）
      const jsonData = e.clipboardData?.getData('application/json');
      TagManagerLogger.log('?? [Paste] JSON data from clipboard:', jsonData ? 'found' : 'not found');
      
      if (jsonData) {
        try {
          const parsedData = JSON.parse(jsonData);
          TagManagerLogger.log('? [Paste] Parsed application/json successfully:', parsedData);
          
          const isCut = parsedData.isCut === true;
          const tagsData = parsedData.tags || parsedData; // 兼容旧格式
          
          if (Array.isArray(tagsData) && tagsData.length > 0) {
            e.preventDefault();
            
            if (isCut) {
              TagManagerLogger.log('?? [Paste] Detected CUT operation from application/json');
              handleCutPaste(tagsData);
            } else {
              TagManagerLogger.log('?? [Paste] Detected COPY operation from application/json');
              handleCopyPaste(tagsData);
            }
            return; // 成功处理JSON，退出
          }
        } catch (error) {
          TagManagerLogger.warn('?? [Paste] Failed to parse application/json, fallback to text:', error);
        }
      }

      // ?? Step 3: 最后回退到纯文本格式解析（?? 无法保留颜色信息）
      if (!pastedText) {
        TagManagerLogger.log('?? [Paste] No paste data found');
        return;
      }
      
      // 移除 Base64 标记头（如果存在）
      const cleanText = pastedText.replace(/^__REMARKABLE_TAGS_JSON__.+?__\n/, '');
      TagManagerLogger.log('?? [Paste] Using text fallback. Clean text preview:', cleanText.substring(0, 100));
      
      // ?? 文本格式无法保留颜色信息，只有JSON格式才能完整保留
      // 格式1: # emoji 名称 (带前导空格)
      // 格式2: #emoji名称 (紧凑格式)
      // 格式3: # emoji名称 (无空格)
      const lines = cleanText.split('\n');
      TagManagerLogger.log('?? [Paste] Total lines:', lines.length);
      
      const parsedTags: Array<{
        name: string;
        emoji?: string;
        level: number;
        color?: string;
      }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue; // 跳过空行
        
        TagManagerLogger.log(`?? [Paste] Line ${i}:`, {
          raw: line,
          trimmed: line.trim(),
          leadingSpaces: line.length - line.trimStart().length,
          chars: line.split('').map(c => c.charCodeAt(0))
        });
        
        // 计算层级（前导空格数）
        const leadingSpaces = line.length - line.trimStart().length;
        const level = Math.floor(leadingSpaces / 2); // 每2个空格 = 1级
        
        const trimmedLine = line.trim();
        
        // 尝试多种匹配模式
        let emoji: string | undefined;
        let name: string;
        
        // 模式1: # emoji 名称 (标准格式)
        const pattern1 = /^#\s*([^\s\w]+)\s+(.+)$/;
        const match1 = trimmedLine.match(pattern1);
        
        // 模式2: #emoji名称 (紧凑格式)
        const pattern2 = /^#([^\s\w]+)(.+)$/;
        const match2 = trimmedLine.match(pattern2);
        
        // 模式3: # 名称 (无emoji)
        const pattern3 = /^#\s+(.+)$/;
        const match3 = trimmedLine.match(pattern3);
        
        if (match1) {
          emoji = match1[1];
          name = match1[2].trim();
          TagManagerLogger.log(`? [Paste] Matched pattern1:`, { emoji, name, level });
        } else if (match2) {
          emoji = match2[1];
          name = match2[2].trim();
          TagManagerLogger.log(`? [Paste] Matched pattern2:`, { emoji, name, level });
        } else if (match3) {
          emoji = undefined;
          name = match3[1].trim();
          TagManagerLogger.log(`? [Paste] Matched pattern3:`, { name, level });
        } else if (trimmedLine.startsWith('#')) {
          // 兜底：提取#后的所有内容
          const content = trimmedLine.substring(1).trim();
          // 尝试分离emoji和名称
          const emojiMatch = content.match(/^([^\w\s]+)\s*(.*)$/);
          if (emojiMatch) {
            emoji = emojiMatch[1];
            name = emojiMatch[2] || content;
          } else {
            name = content;
          }
          TagManagerLogger.log(`?? [Paste] Fallback parsing:`, { emoji, name, level, original: trimmedLine });
        } else {
          TagManagerLogger.log(`? [Paste] Line doesn't start with #, skipping:`, trimmedLine);
          continue;
        }
        
        if (name) {
          parsedTags.push({
            name: name.trim(),
            emoji,
            level,
            color: '#3b82f6'
          });
        }
      }

      if (parsedTags.length > 0) {
        TagManagerLogger.log('?? [Paste] Parsed tags:', parsedTags);
        e.preventDefault();
        
        // 批量创建标签
        setTags(prevTags => {
          const newTags = [...prevTags];
          const maxPosition = Math.max(...newTags.map(t => t.position || 0), -1);
          
          parsedTags.forEach((parsedTag, index) => {
            const newId = `tag-${Date.now()}-${index}`;
            
            // 查找父标签（向前查找第一个层级比当前小的标签）
            let parentId: string | undefined = undefined;
            if (parsedTag.level > 0) {
              // 在新粘贴的标签中查找父标签
              for (let i = index - 1; i >= 0; i--) {
                if (parsedTags[i].level < parsedTag.level) {
                  // 找到对应的新创建标签ID
                  const parentIndex = i;
                  parentId = `tag-${Date.now()}-${parentIndex}`;
                  TagManagerLogger.log(`?? [Paste] Found parent for "${parsedTag.name}":`, {
                    parentName: parsedTags[parentIndex].name,
                    childLevel: parsedTag.level,
                    parentLevel: parsedTags[parentIndex].level
                  });
                  break;
                }
              }
            }
            
            const newTag: ExtendedHierarchicalTag = {
              id: newId,
              name: parsedTag.name,
              color: parsedTag.color || '#3b82f6',
              emoji: parsedTag.emoji,
              level: parsedTag.level,
              parentId,
              position: maxPosition + index + 1
            };
            
            newTags.push(newTag);
            TagManagerLogger.log(`? [Paste] Created tag:`, {
              id: newId,
              name: newTag.name,
              level: newTag.level,
              parentId: newTag.parentId
            });
          });
          
          TagManagerLogger.log('? [Paste] Successfully imported tags:', newTags.length - prevTags.length);
          TagManagerLogger.log('?? [Paste] Final tag structure:', newTags.slice(-parsedTags.length).map(t => ({
            name: t.name,
            level: t.level,
            parentId: t.parentId
          })));
          return newTags;
        });
      }
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('paste', handlePaste);
    
    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('paste', handlePaste);
    };
  }, [tags]);

  // ?? 批量操作：删除、移动
  useEffect(() => {
    const getSelectedTags = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return [];
      
      return tags.filter(tag => {
        const tagElement = document.querySelector(`[data-tag-id="${tag.id}"]`);
        if (!tagElement) return false;
        return selection.containsNode(tagElement, true);
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      
      // ?? 如果在编辑框内，跳过批量操作
      if (target.contentEditable === 'true' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const selectedTags = getSelectedTags();
      if (selectedTags.length === 0) return;

      // ??? Delete/Backspace - 批量删除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        
  if (window.confirm(`确定要删除选中的 ${selectedTags.length} 个标签吗？`)) {
          TagManagerLogger.log('??? [Batch Delete] Deleting tags:', selectedTags.map(t => t.name));
          
          setTags(prevTags => {
            const selectedIds = new Set(selectedTags.map(t => t.id));
            return prevTags.filter(tag => !selectedIds.has(tag.id));
          });
          
          // 清除选区
          window.getSelection()?.removeAllRanges();
        }
      }

      // ???? Shift+Alt+↑/↓ - 批量上下移动
      if (e.shiftKey && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        
        const direction = e.key === 'ArrowUp' ? -1 : 1;
        TagManagerLogger.log(`?? [Batch Move] Moving ${selectedTags.length} tags ${direction > 0 ? 'down' : 'up'}`);
        
        setTags(prevTags => {
          const newTags = [...prevTags].sort((a, b) => (a.position || 0) - (b.position || 0));
          const selectedIds = new Set(selectedTags.map(t => t.id));
          
          // 找到选中标签的索引
          const selectedIndices = newTags
            .map((tag, index) => selectedIds.has(tag.id) ? index : -1)
            .filter(index => index !== -1);
          
          if (selectedIndices.length === 0) return prevTags;
          
          // 检查是否可以移动
          const minIndex = Math.min(...selectedIndices);
          const maxIndex = Math.max(...selectedIndices);
          
          if (direction === -1 && minIndex === 0) {
            TagManagerLogger.log('?? Already at top');
            return prevTags;
          }
          if (direction === 1 && maxIndex === newTags.length - 1) {
            TagManagerLogger.log('?? Already at bottom');
            return prevTags;
          }
          
          // 移动标签
          if (direction === -1) {
            // 向上移动：与上一个标签交换
            const temp = newTags[minIndex - 1];
            newTags.splice(minIndex - 1, 1);
            newTags.splice(maxIndex, 0, temp);
          } else {
            // 向下移动：与下一个标签交换
            const temp = newTags[maxIndex + 1];
            newTags.splice(maxIndex + 1, 1);
            newTags.splice(minIndex, 0, temp);
          }
          
          // 重新分配 position
          return newTags.map((tag, index) => ({
            ...tag,
            position: index
          }));
        });
      }

      // ?? Shift+Alt+M - 批量编辑日历映射
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        
        TagManagerLogger.log(`?? [Batch Calendar] Editing calendar mapping for ${selectedTags.length} tags`);
        
        // 打开日历选择器（使用第一个选中标签的位置）
        if (selectedTags.length > 0) {
          const firstTagElement = document.querySelector(`[data-tag-id="${selectedTags[0].id}"]`);
          if (firstTagElement) {
            const rect = firstTagElement.getBoundingClientRect();
            setShowCalendarPicker({
              show: true,
              tagId: `batch:${selectedTags.map(t => t.id).join(',')}`, // 特殊标记表示批量操作
              position: { x: rect.left, y: rect.bottom + 5 }
            });
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tags]);

  // ?? 获取当前选中的标签ID列表（用于UI渲染）
  const getSelectedTagIds = (): string[] => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return [];
    
    const selectedIds: string[] = [];
    tags.forEach(tag => {
      const tagElement = document.querySelector(`[data-tag-id="${tag.id}"]`);
      if (tagElement && selection.containsNode(tagElement, true)) {
        selectedIds.push(tag.id);
      }
    });
    return selectedIds;
  };
  
  // ?? 监听选区变化，更新selectedTagIds
  useEffect(() => {
    const updateSelection = () => {
      const ids = getSelectedTagIds();
      setSelectedTagIds(ids);
    };
    
    // 监听selectionchange事件
    document.addEventListener('selectionchange', updateSelection);
    
    // 初始化
    updateSelection();
    
    return () => {
      document.removeEventListener('selectionchange', updateSelection);
    };
  }, [tags]);

  // 处理日历映射
  const handleCalendarMappingClick = (tagId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    
    // ?? 智能批量操作：检查是否有多个标签被选中
    const selection = window.getSelection();
    const selectedTagIds: string[] = [];
    
    if (selection && selection.rangeCount > 0) {
      tags.forEach(tag => {
        const tagElement = document.querySelector(`[data-tag-id="${tag.id}"]`);
        if (tagElement && selection.containsNode(tagElement, true)) {
          selectedTagIds.push(tag.id);
        }
      });
    }
    
    const isTagSelected = selectedTagIds.includes(tagId);
    const shouldBatchUpdate = isTagSelected && selectedTagIds.length > 1;
    
    if (shouldBatchUpdate) {
      TagManagerLogger.log(`?? [Smart Batch] Tag ${tagId} is selected with ${selectedTagIds.length - 1} other tags, enabling batch mode`);
      setShowCalendarPicker({
        show: true,
        tagId: `batch:${selectedTagIds.join(',')}`,
        position: { x: rect.left, y: rect.bottom + 5 }
      });
    } else {
      setShowCalendarPicker({
        show: true,
        tagId,
        position: { x: rect.left, y: rect.bottom + 5 }
      });
    }
  };

  const handleCalendarSelect = (calendar: { calendarId: string; calendarName: string; color?: string }) => {
    // ?? 检查是否是批量操作
    if (showCalendarPicker.tagId.startsWith('batch:')) {
      const tagIds = showCalendarPicker.tagId.replace('batch:', '').split(',');
      TagManagerLogger.log(`?? [Batch Calendar] Setting calendar for ${tagIds.length} tags:`, calendar.calendarName);
      
      setTags(prevTags =>
        prevTags.map(tag =>
          tagIds.includes(tag.id)
            ? { ...tag, calendarMapping: calendar }
            : tag
        )
      );
      
      // ?? 显示批量操作成功提示
      const tagNames = tags.filter(t => tagIds.includes(t.id)).map(t => t.name).join('、');
      TagManagerLogger.log(`? [Batch Calendar] Updated ${tagIds.length} tags: ${tagNames}`);
      
    } else {
      // 单个标签操作
      setTags(prevTags =>
        prevTags.map(tag =>
          tag.id === showCalendarPicker.tagId
            ? { ...tag, calendarMapping: calendar }
            : tag
        )
      );
    }
    
    setShowCalendarPicker({ show: false, tagId: '', position: { x: 0, y: 0 } });
  };

  // 处理打卡
  const handleCheckin = (tagId: string) => {
    setCheckinCounts(prev => ({
      ...prev,
      [tagId]: (prev[tagId] || 0) + 1
    }));
  };

  // 格式化时间显??
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `日均${hours}h${mins.toString().padStart(2, '0')}min`;
  };

  // 创建新标??
  // 获取默认日历映射
  const getDefaultCalendarMapping = async () => {
    if (!microsoftService) return undefined;
    
    try {
      const calendars = await microsoftService.getAllCalendars();
      if (calendars && calendars.length > 0) {
        // 使用第一个日历作为默认日历，通常这是用户的主日历
        const defaultCalendar = calendars[0];
        return {
          calendarId: defaultCalendar.id || '',
          calendarName: `Outlook: ${defaultCalendar.name || '日历'}`,
          color: convertMicrosoftColorToHex(defaultCalendar.color) || '#3b82f6'
        };
      }
    } catch (error) {
      TagManagerLogger.warn('获取默认日历失败:', error);
    }
    return undefined;
  };

  // 将Microsoft颜色名称转换为十六进制颜色
  const convertMicrosoftColorToHex = (colorName?: string): string => {
    const colorMap: { [key: string]: string } = {
      'lightBlue': '#5194f0',
      'lightGreen': '#42b883', 
      'lightOrange': '#ff8c42',
      'lightGray': '#9ca3af',
      'lightYellow': '#f1c40f',
      'lightTeal': '#48c9b0',
      'lightPink': '#f48fb1',
      'lightBrown': '#a0826d',
      'lightRed': '#e74c3c',
      'maxColor': '#6366f1'
    };
    
    if (!colorName) return '#3b82f6';
    return colorMap[colorName] || '#3b82f6';
  };

  const createNewTag = (level: number = 0, afterTagId?: string) => {
    const newId = generateTagId(); // 🔧 使用正式的 tag ID 格式
    
    setTags(prevTags => {
      let newPosition: number;
      let newParentId: string | undefined = undefined;
      let updatedTags: ExtendedHierarchicalTag[];
      
      // 如果是子标签(level > 0)，需要找到父标签
      if (level > 0) {
        const sortedTags = [...prevTags].sort((a, b) => (a.position || 0) - (b.position || 0));
        const insertIndex = afterTagId ? 
          sortedTags.findIndex(tag => tag.id === afterTagId) + 1 : 
          sortedTags.length;
        
        // 向前查找第一个层级比当前level小的标签作为父标签
        for (let i = insertIndex - 1; i >= 0; i--) {
          if ((sortedTags[i].level || 0) < level) {
            newParentId = sortedTags[i].id;
            TagManagerLogger.log('?? [createNewTag] Found parent for new tag:', {
              newTagId: newId,
              newTagLevel: level,
              parentId: newParentId,
              parentName: sortedTags[i].name,
              parentLevel: sortedTags[i].level
            });
            break;
          }
        }
      }
      
      if (afterTagId) {
        // 找到要插入位置的标签，基于position值而不是数组索引
        const afterTag = prevTags.find(tag => tag.id === afterTagId);
        if (!afterTag) {
          TagManagerLogger.error('? After tag not found:', afterTagId);
          return prevTags;
        }
        
        TagManagerLogger.log('?? Found afterTag:', {
          id: afterTag.id.substring(0, 8),
          name: afterTag.name,
          position: afterTag.position,
          level: afterTag.level
        });
        
        const afterPosition = afterTag.position || 0;
        
        // 新标签的位置就是 afterPosition + 1
        newPosition = afterPosition + 1;
        
        TagManagerLogger.log('?? Creating new tag after tagId:', afterTagId, 'afterPosition:', afterPosition, 'newPosition:', newPosition);
        TagManagerLogger.log('?? Current tags positions before shift:', 
          prevTags
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .map(t => ({ id: t.id.substring(0, 8), name: t.name || '(unnamed)', position: t.position }))
        );
        
        // 将所有 position > afterPosition 的标签 +1（为新标签腾出空间）
        const shiftedTags = prevTags.map(tag => {
          if ((tag.position || 0) > afterPosition) {
            TagManagerLogger.log(`  ?? Shifting tag "${tag.name}" from position ${tag.position} to ${(tag.position || 0) + 1}`);
            return { ...tag, position: (tag.position || 0) + 1 };
          }
          return tag;
        });
        
        const newTag: ExtendedHierarchicalTag = {
          id: newId,
          name: '',
          color: '#3b82f6',
          emoji: '??',
          level,
          parentId: newParentId, // 设置父标签ID
          position: newPosition,
          dailyAvgCheckins: 0,
          dailyAvgDuration: 150,
          isRecurring: false
        };
        
        updatedTags = [...shiftedTags, newTag];
        TagManagerLogger.log('? Created tag at position', newPosition, 'and shifted', shiftedTags.filter(t => t.position !== prevTags.find(pt => pt.id === t.id)?.position).length, 'tags forward');
        TagManagerLogger.log('?? All tags after creation (sorted by position):', 
          updatedTags
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .map(t => ({ id: t.id.substring(0, 8), name: t.name || '(unnamed)', position: t.position, level: t.level }))
        );
      } else {
        newPosition = prevTags.length;
        
        const newTag: ExtendedHierarchicalTag = {
          id: newId,
          name: '',
          color: '#3b82f6',
          emoji: '??',
          level,
          parentId: newParentId, // 设置父标签ID
          position: newPosition,
          dailyAvgCheckins: 0,
          dailyAvgDuration: 150,
          isRecurring: false
        };
        
        updatedTags = [...prevTags, newTag];
      }
      
      return updatedTags;
    });

    // 异步设置日历映射 - 子标签继承父标签，否则使用默认映射
    (async () => {
      let calendarMapping: { calendarId: string; calendarName: string; color?: string } | undefined = undefined;
      
      // 如果是子标签(level > 0)，尝试找到父标签并继承其日历映射
      if (level > 0) {
        // 找到所有位置在当前标签之前且层级更小的标签
        const sortedTags = [...tags].sort((a, b) => (a.position || 0) - (b.position || 0));
        const currentIndex = afterTagId ? 
          sortedTags.findIndex(tag => tag.id === afterTagId) + 1 : // 如果指定了afterTagId，新标签在其后
          sortedTags.length; // 否则在最后
        
        // 从当前位置向前查找最近的父标签
        for (let i = currentIndex - 1; i >= 0; i--) {
          const potentialParent = sortedTags[i];
          if ((potentialParent.level || 0) < level && potentialParent.calendarMapping) {
            calendarMapping = potentialParent.calendarMapping;
            TagManagerLogger.log('?? 子标签继承父标签日历映射:', {
              childLevel: level,
              parentTag: potentialParent.name,
              parentLevel: potentialParent.level || 0,
              inheritedMapping: calendarMapping
            });
            break;
          }
        }
      }
      
      // 如果没有找到父标签映射，使用默认映射
      if (!calendarMapping) {
        calendarMapping = await getDefaultCalendarMapping();
        TagManagerLogger.log('?? 使用默认日历映射:', calendarMapping);
      }
      
      if (calendarMapping) {
        setTags(prevTags => 
          prevTags.map(tag => 
            tag.id === newId 
              ? { ...tag, calendarMapping: calendarMapping }
              : tag
          )
        );
      }
    })();

    setCheckinCounts(prev => ({ ...prev, [newId]: 0 }));
    setNewTagId(newId);
    
    // 自动聚焦到新标签 - 增加更长的延迟和重试机制
    const focusNewTag = (retryCount = 0) => {
      const element = document.querySelector(`[data-tag-id="${newId}"]`) as HTMLElement;
      if (element) {
        TagManagerLogger.log('?? Successfully found and focusing new tag:', newId);
        element.focus();
        return;
      }
      
      // 如果没找到元素且重试次数少于5次，继续重试
      if (retryCount < 5) {
        TagManagerLogger.log(`?? Retrying focus for tag ${newId}, attempt ${retryCount + 1}`);
        setTimeout(() => focusNewTag(retryCount + 1), 50);
      } else {
        TagManagerLogger.error('? Failed to focus new tag after 5 attempts:', newId);
      }
    };
    
    setTimeout(() => focusNewTag(), 100);

    return newId;
  };

  // 激活新标签创建区域
  const handleNewTagActivation = () => {
    TagManagerLogger.log('?? handleNewTagActivation called!');
    TagManagerLogger.log('?? 用户点击了灰色文本:', userClickedGrayText);
    TagManagerLogger.log('?? Call stack:', new Error().stack);
    
    // 只有当用户明确点击了灰色文本时才激活
    if (!userClickedGrayText) {
      TagManagerLogger.log('?? 阻止激活：用户没有明确点击灰色文本');
      return;
    }
    
    setIsCreatingNewTag(true); // 进入创建模式
    
    // 找到所有标签中position最大的标签，在其后面创建新的一级标签
    const sortedTags = [...tags].sort((a, b) => (a.position || 0) - (b.position || 0));
    const lastTag = sortedTags[sortedTags.length - 1];
    const lastTagId = lastTag?.id;
    
    TagManagerLogger.log('?? [NewTagActivation] Creating new tag after last tag:', {
      lastTagId,
      lastTagName: lastTag?.name,
      lastTagPosition: lastTag?.position,
      newTagLevel: 0
    });
    
    // 如果有标签，在最后一个标签后面创建；否则直接创建
    if (lastTagId) {
      createNewTag(0, lastTagId);
    } else {
      createNewTag(0);
    }
  };

  // 取消新标签创建
  const handleCancelNewTag = () => {
    TagManagerLogger.log('? Cancelling new tag creation');
    setIsCreatingNewTag(false);
    setNewTagId(null);
    setUserClickedGrayText(false); // 重置点击标记
  };

  // 移动光标到上一个标签
  const focusPreviousTag = (currentTagId: string) => {
    const sortedTags = tags.sort((a, b) => (a.position || 0) - (b.position || 0));
    const currentIndex = sortedTags.findIndex(tag => tag.id === currentTagId);
    
    if (currentIndex > 0) {
      const previousTag = sortedTags[currentIndex - 1];
      // 自动保存当前标签
      saveTagsToStorage(tags);
      // 聚焦到上一个标签
      setTimeout(() => {
        const element = document.querySelector(`[data-tag-id="${previousTag.id}"]`) as HTMLElement;
        if (element) {
          element.focus();
        }
      }, 10);
    }
  };

  // 移动光标到下一个标签
  const focusNextTag = (currentTagId: string) => {
    const sortedTags = tags.sort((a, b) => (a.position || 0) - (b.position || 0));
    const currentIndex = sortedTags.findIndex(tag => tag.id === currentTagId);
    
    if (currentIndex < sortedTags.length - 1) {
      const nextTag = sortedTags[currentIndex + 1];
      // 自动保存当前标签
      saveTagsToStorage(tags);
      // 聚焦到下一个标签
      setTimeout(() => {
        const element = document.querySelector(`[data-tag-id="${nextTag.id}"]`) as HTMLElement;
        if (element) {
          element.focus();
        }
      }, 10);
    }
  };

  // 处理标签键盘事件
  const handleTagKeyDown = (e: React.KeyboardEvent, tagId: string, currentLevel: number) => {
    // 立即输出，确保函数被调用
    TagManagerLogger.log('?? FUNCTION CALLED - handleTagKeyDown');
    TagManagerLogger.log('?? Key event:', {
      key: e.key,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      tagId: tagId,
      currentLevel: currentLevel
    });
    
    if (e.key === 'Enter') {
      e.preventDefault();
      // 保存当前标签并创建新的同级标签
      createNewTag(currentLevel, tagId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // ESC 取消创建，删除这个标签（无论有没有内容）
      TagManagerLogger.log('?? ESC pressed - Canceling tag creation:', tagId);
      setTags(prev => prev.filter(tag => tag.id !== tagId));
      // 失焦当前输入框
      (e.target as HTMLElement).blur();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: 减少缩进
        if (currentLevel > 0) {
          setTags(prevTags => {
            const sortedTags = [...prevTags].sort((a, b) => (a.position || 0) - (b.position || 0));
            const currentIndex = sortedTags.findIndex(tag => tag.id === tagId);
            const newLevel = Math.max(0, currentLevel - 1);
            
            // 找到新的父标签：向前查找第一个层级比新层级小的标签
            let newParentId: string | undefined = undefined;
            
            if (newLevel > 0) {
              for (let i = currentIndex - 1; i >= 0; i--) {
                if ((sortedTags[i].level || 0) < newLevel) {
                  newParentId = sortedTags[i].id;
                  TagManagerLogger.log('?? Found parent for decreased indent:', {
                    childId: tagId,
                    parentId: newParentId,
                    parentName: sortedTags[i].name,
                    newLevel: newLevel
                  });
                  break;
                }
              }
            }
            
            return prevTags.map(tag =>
              tag.id === tagId ? { ...tag, level: newLevel, parentId: newParentId } : tag
            );
          });
        }
      } else {
        // Tab: 增加缩进（智能层级限制）
        // 找到上一个标签，确保当前标签层级不超过上一个标签层级+1
        const sortedTags = tags.sort((a, b) => (a.position || 0) - (b.position || 0));
        const currentIndex = sortedTags.findIndex(tag => tag.id === tagId);
        
        let maxAllowedLevel = currentLevel + 1; // 默认允许增加1级
        
        if (currentIndex > 0) {
          // 查找上一个标签的层级
          const previousTag = sortedTags[currentIndex - 1];
          const previousLevel = previousTag.level || 0;
          maxAllowedLevel = Math.min(currentLevel + 1, previousLevel + 1);
          
          TagManagerLogger.log('?? Tab增加缩进检查:', {
            currentTagId: tagId,
            currentLevel: currentLevel,
            previousTagLevel: previousLevel,
            maxAllowedLevel: maxAllowedLevel,
            canIncrease: currentLevel < maxAllowedLevel
          });
        }
        
        if (currentLevel < maxAllowedLevel) {
          setTags(prevTags => {
            const sortedTags = [...prevTags].sort((a, b) => (a.position || 0) - (b.position || 0));
            const currentIndex = sortedTags.findIndex(tag => tag.id === tagId);
            
            // 找到新的父标签：向前查找第一个层级比当前新层级小的标签
            let newParentId: string | undefined = undefined;
            const newLevel = currentLevel + 1;
            
            for (let i = currentIndex - 1; i >= 0; i--) {
              if ((sortedTags[i].level || 0) < newLevel) {
                newParentId = sortedTags[i].id;
                TagManagerLogger.log('?? Found parent for increased indent:', {
                  childId: tagId,
                  parentId: newParentId,
                  parentName: sortedTags[i].name,
                  newLevel: newLevel
                });
                break;
              }
            }
            
            return prevTags.map(tag =>
              tag.id === tagId ? { ...tag, level: newLevel, parentId: newParentId } : tag
            );
          });
        } else {
          TagManagerLogger.log('?? 达到最大层级限制，无法继续缩进');
        }
      }
    } else if (e.key === 'ArrowUp' && e.shiftKey && e.altKey) {
      e.preventDefault();
      TagManagerLogger.log('?? Shift+Alt+↑ detected for tagId:', tagId);
      TagManagerLogger.log('?? Current tags state:', tags.map(t => ({id: t.id, position: t.position, name: t.name})));
      // Shift+Alt+↑: 向上移动标签
      moveTagUp(tagId);
    } else if (e.key === 'ArrowDown' && e.shiftKey && e.altKey) {
      e.preventDefault();
      TagManagerLogger.log('?? Shift+Alt+↓ detected for tagId:', tagId);
      TagManagerLogger.log('?? Current tags state:', tags.map(t => ({id: t.id, position: t.position, name: t.name})));
      // Shift+Alt+↓: 向下移动标签
      moveTagDown(tagId);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // ↑: 移动光标到上一个标签
      focusPreviousTag(tagId);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // ↓: 移动光标到下一个标签
      focusNextTag(tagId);
    } else if (e.key === 'F9' && e.ctrlKey) {
      e.preventDefault();
      TagManagerLogger.log('?? Manual position fix triggered');
      fixTagPositions();
    }
  };



  // 验证并修复position值（同步版本）
  const validateAndFixPositions = (tagsToCheck: ExtendedHierarchicalTag[]): ExtendedHierarchicalTag[] => {
    const sortedTags = [...tagsToCheck].sort((a, b) => (a.position || 0) - (b.position || 0));
    
    // 检查是否有重复的position
    const positions = sortedTags.map(tag => tag.position || 0);
    const uniquePositions = Array.from(new Set(positions));
    
    if (positions.length !== uniquePositions.length) {
      TagManagerLogger.warn('?? Found duplicate positions:', positions);
      TagManagerLogger.warn('?? Synchronously fixing positions...');
      // 立即修复重复的position
      return sortedTags.map((tag, index) => ({
        ...tag,
        position: index
      }));
    }
    
    return tagsToCheck;
  };

  // 修复标签position值
  const fixTagPositions = () => {
    setTags(prevTags => {
      const sortedTags = [...prevTags].sort((a, b) => (a.position || 0) - (b.position || 0));
      const fixedTags = sortedTags.map((tag, index) => ({
        ...tag,
        position: index
      }));
      TagManagerLogger.log('?? Fixed tag positions:', fixedTags.map(t => ({id: t.id, position: t.position, name: t.name})));
      return fixedTags;
    });
  };

  // 向上移动标签
  const moveTagUp = (tagId: string) => {
    TagManagerLogger.log('?? moveTagUp called with tagId:', tagId);
    
    setTags(prevTags => {
      TagManagerLogger.log('?? Current prevTags:', prevTags.map(t => ({id: t.id, position: t.position, name: t.name})));
      
      // 先验证和修复position
      const validatedTags = validateAndFixPositions(prevTags);
      const sortedTags = [...validatedTags].sort((a, b) => (a.position || 0) - (b.position || 0));
      TagManagerLogger.log('?? Sorted tags:', sortedTags.map(t => ({id: t.id, position: t.position, name: t.name})));
      
      const currentIndex = sortedTags.findIndex(tag => tag.id === tagId);
      TagManagerLogger.log('?? Current index:', currentIndex, 'for tagId:', tagId);
      
      if (currentIndex <= 0) {
        TagManagerLogger.log('?? Tag is already at the top, no movement needed');
        return validatedTags; // 返回修复后的数据
      }
      
      // 与上一个标签交换位置
      const currentTag = sortedTags[currentIndex];
      const previousTag = sortedTags[currentIndex - 1];
      
      TagManagerLogger.log('?? Swapping:', {
        current: {id: currentTag.id, position: currentTag.position, name: currentTag.name},
        previous: {id: previousTag.id, position: previousTag.position, name: previousTag.name}
      });
      
      // 如果移动到第一行，必须设置为一级标签
      const newLevel = currentIndex === 1 ? 0 : currentTag.level;
      TagManagerLogger.log('?? New level for moved tag:', newLevel);
      
      const newTags = validatedTags.map(tag => {
        if (tag.id === tagId) {
          // 计算移动后的合理层级
          let adjustedLevel = newLevel;
          if (currentIndex > 1) {
            // 不是移动到顶部，需要检查新位置的上一个标签
            const newPreviousTag = sortedTags[currentIndex - 2]; // 新位置的上一个标签
            const newPreviousLevel = newPreviousTag.level || 0;
            // 确保层级不超过新位置上一个标签的层级+1
            adjustedLevel = Math.min(currentTag.level || 0, newPreviousLevel + 1);
            
            TagManagerLogger.log('?? 层级调整检查:', {
              originalLevel: currentTag.level,
              newPreviousTagLevel: newPreviousLevel,
              adjustedLevel: adjustedLevel
            });
          }
          
          const newTag = { ...tag, position: previousTag.position, level: adjustedLevel };
          TagManagerLogger.log('?? Updated current tag:', newTag);
          return newTag;
        } else if (tag.id === previousTag.id) {
          const newTag = { ...tag, position: currentTag.position };
          TagManagerLogger.log('?? Updated previous tag:', newTag);
          return newTag;
        }
        return tag;
      });
      
      TagManagerLogger.log('?? Final result:', newTags.map(t => ({id: t.id, position: t.position, name: t.name})));
      
      return newTags;
    });
  };

  // 向下移动标签
  const moveTagDown = (tagId: string) => {
    TagManagerLogger.log('?? moveTagDown called with tagId:', tagId);
    
    setTags(prevTags => {
      TagManagerLogger.log('?? Current prevTags:', prevTags.map(t => ({id: t.id, position: t.position, name: t.name})));
      
      // 先验证和修复position
      const validatedTags = validateAndFixPositions(prevTags);
      const sortedTags = [...validatedTags].sort((a, b) => (a.position || 0) - (b.position || 0));
      TagManagerLogger.log('?? Sorted tags:', sortedTags.map(t => ({id: t.id, position: t.position, name: t.name})));
      
      const currentIndex = sortedTags.findIndex(tag => tag.id === tagId);
      TagManagerLogger.log('?? Current index:', currentIndex, 'for tagId:', tagId);
      
      if (currentIndex < 0 || currentIndex >= sortedTags.length - 1) {
        TagManagerLogger.log('?? Tag is already at the bottom or not found, no movement needed');
        return validatedTags; // 返回修复后的数据
      }
      
      // 与下一个标签交换位置
      const currentTag = sortedTags[currentIndex];
      const nextTag = sortedTags[currentIndex + 1];
      
      TagManagerLogger.log('?? Swapping:', {
        current: {id: currentTag.id, position: currentTag.position, name: currentTag.name},
        next: {id: nextTag.id, position: nextTag.position, name: nextTag.name}
      });
      
      const newTags = validatedTags.map(tag => {
        if (tag.id === tagId) {
          // 计算移动后的合理层级
          let adjustedLevel = currentTag.level || 0;
          
          // 当向下移动时，检查移动后的上一个标签（即原来的nextTag）和后一个标签
          const newPreviousLevel = nextTag.level || 0;
          
          // 找到移动后的下一个标签（原来位置currentIndex+2的标签）
          const newNextTag = currentIndex + 2 < sortedTags.length ? sortedTags[currentIndex + 2] : null;
          
          // 级别约束检查：
          // 1. 不能超过新位置上一个标签的层级+1
          // 2. 如果有下一个标签，当前层级不能比下一个标签小太多（防止层级跳跃过大）
          let maxAllowedLevel = newPreviousLevel + 1;
          
          if (newNextTag) {
            const nextTagLevel = newNextTag.level || 0;
            // 如果下一个标签层级较深，允许当前标签也有一定深度
            maxAllowedLevel = Math.max(maxAllowedLevel, nextTagLevel);
          }
          
          adjustedLevel = Math.min(currentTag.level || 0, maxAllowedLevel);
          
          TagManagerLogger.log('?? 层级调整检查:', {
            originalLevel: currentTag.level,
            newPreviousTagLevel: newPreviousLevel,
            newNextTagLevel: newNextTag?.level || 'none',
            maxAllowedLevel: maxAllowedLevel,
            adjustedLevel: adjustedLevel
          });
          
          const newTag = { ...tag, position: nextTag.position, level: adjustedLevel };
          TagManagerLogger.log('?? Updated current tag:', newTag);
          return newTag;
        } else if (tag.id === nextTag.id) {
          const newTag = { ...tag, position: currentTag.position };
          TagManagerLogger.log('?? Updated next tag:', newTag);
          return newTag;
        }
        return tag;
      });
      
      TagManagerLogger.log('?? Final result:', newTags.map(t => ({id: t.id, position: t.position, name: t.name})));
      
      return newTags;
    });
  };

  // 处理标签保存
  const handleTagSave = (tagId: string, content: string) => {
    if (content.trim() === '') {
      // 删除空标??
      setTags(prev => prev.filter(tag => tag.id !== tagId));
      setCheckinCounts(prev => {
        const newCounts = { ...prev };
        delete newCounts[tagId];
        return newCounts;
      });
    } else {
      // 保存标签内容
      setTags(prev => prev.map(tag => 
        tag.id === tagId ? { ...tag, name: content.trim() } : tag
      ));
    }
    
    // 重置新标签状态
    if (tagId === newTagId) {
      setNewTagId(null);
    }
  };

  return (
    <div className="figma-tag-manager-v4" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 添加 kbd 样式 */}
      <style>{`
        kbd {
          display: inline-block;
          padding: 2px 6px;
          font-family: monospace;
          font-size: 11px;
          line-height: 1;
          color: #374151;
          background-color: #f3f4f6;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
        }
        
        .tag-list-scroll-container {
          flex: 1; /* 占据剩余空间 */
          overflow-y: auto;
          scrollbar-width: none; /* Firefox */
          -ms-overflow-style: none; /* IE/Edge */
          min-height: 0; /* 允许flex收缩 */
          padding-top: 12px; /* 🔧 为第一行的 badge 留出空间，防止被截断 */
        }
        
        .tag-list-scroll-container::-webkit-scrollbar {
          display: none; /* Chrome/Safari/Opera */
        }
      `}</style>
      
      {/* 调试组件 - 已禁用以减少日志输出 
      <ClickTracker 
        enabled={true}
        showVisualIndicators={true}
        onClickDetected={(event) => {
          // 监测所有点击事件用于调试
          TagManagerLogger.log('??? GLOBAL CLICK DETECTED:', {
            position: `(${event.x}, ${event.y})`,
            target: event.elementInfo?.tagName,
            size: `${event.elementBounds?.width.toFixed(1)}×${event.elementBounds?.height.toFixed(1)}`,
            text: event.elementInfo?.textContent?.substring(0, 50)
          });
          
          // 特别关注可能触发灰色文本focus的元素
          if (event.elementInfo?.textContent?.includes('新增标签')) {
            TagManagerLogger.log('?? CLICKED ELEMENT CONTAINS GRAY TEXT!', event);
          }
        }}
      >
      */}
        <div style={{ backgroundColor: 'white', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '16px' }}>
        
        {/* 搜索框 - 固定在顶部右侧，不参与滚动 */}
        <div style={{
          width: '122px',
          height: '40px',
          borderRadius: '25px',
          border: '2px solid transparent',
          background: 'linear-gradient(white, white), linear-gradient(90deg, #A855F7 0%, #3B82F6 75.48%)',
          backgroundClip: 'padding-box, border-box',
          backgroundOrigin: 'padding-box, border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: '12px',
          cursor: 'pointer',
          marginLeft: 'auto',
          marginBottom: '8px',
          flexShrink: 0
        }}>
          <img src={icons.search} alt="搜索" width="20" height="20" />
        </div>

        {/* 标签列表滚动容器 */}
        <div className="tag-list-scroll-container" style={{ flex: 1, minHeight: 0, paddingTop: '8px' }}>
          {tags
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .map((tag, index) => {
              // 仅在开发模式下打印第一个标签的调试信息（减少日志）
              // if (index === 0 && process.env.NODE_ENV === 'development') {
              //   TagManagerLogger.log('?? [Render] Tags being rendered:', tags
              //     .sort((a, b) => (a.position || 0) - (b.position || 0))
              //     .map(t => ({ 
              //       id: t.id.substring(0, 8), 
              //       name: t.name, 
              //       level: t.level,
              //       padding: `${(t.level || 0) * 20}px`
              //     }))
              //   );
              // }
              return (
            <div key={tag.id} 
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '4px',
                height: '24px',
                fontSize: '16px',
                fontFamily: "'Microsoft YaHei', Arial, sans-serif",
                width: '100%',
                position: 'relative',
                borderBottom: hoveredTagId === tag.id ? '1px solid #d1d5db' : '1px solid transparent',
                transition: 'border-bottom-color 0.2s ease',
                overflow: 'visible' // 🔧 允许 badge 溢出，防止被截断
              }}
              onMouseEnter={() => setHoveredTagId(tag.id)}
              onMouseLeave={() => setHoveredTagId(null)}
            >
              {/* 标签内容 - 左侧部分 */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                paddingLeft: `${(tag.level || 0) * 20}px`,
                flex: 1,
                minWidth: 0
              }}>
                {/* # 号 - 固定24px */}
                <span 
                  onClick={(e) => handleColorClick(tag.id, e)}
                  style={{ 
                    color: tag.color,
                    fontSize: '16px',
                    fontWeight: (tag.level || 0) === 0 ? 'bold' : 'normal',
                    width: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    padding: '2px',
                    borderRadius: '4px',
                    transition: 'all 0.2s',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  title="点击修改颜色"
                >#</span>
                
                {/* Emoji - 固定24px */}
                <span 
                  onClick={(e) => handleEmojiClick(tag.id, e)}
                  style={{
                    fontSize: '16px',
                    width: '24px',
                    height: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    padding: '2px',
                    borderRadius: '4px',
                    transition: 'all 0.2s',
                    marginLeft: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  title="点击修改表情"
                >
                  {(() => {
                    // 检查emoji是否为空或者是乱码
                    if (tag.emoji && tag.emoji !== '??' && tag.emoji !== '�' && tag.emoji !== '？') {
                      return tag.emoji;
                    } else {
                      if (tag.emoji) {
                      }
                      return <img src={icons.emoji} alt="emoji" width="24" height="24" style={{ opacity: 0.5 }} />;
                    }
                  })()}
                </span>
                
                {/* 标签文字 - 可编辑 */}
                <span 
                  data-tag-id={tag.id}
                  style={{ 
                    color: tag.color,
                    fontSize: '16px',
                    fontWeight: (tag.level || 0) === 0 ? 'bold' : 'normal',
                    marginLeft: '8px',
                    outline: 'none',
                    border: 'none',
                    background: 'transparent',
                    display: 'inline-block',
                    minWidth: 'fit-content',
                    cursor: 'text',
                    userSelect: 'text', // ?? 明确允许选择
                    WebkitUserSelect: 'text', // ?? 兼容webkit
                    MozUserSelect: 'text' // ?? 兼容Firefox
                  }}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newName = e.currentTarget.textContent || '';
                    handleTagSave(tag.id, newName);
                  }}
                  onKeyDown={(e) => handleTagKeyDown(e, tag.id, tag.level || 0)}
                  onMouseDown={(e) => {
                    // ?? 阻止事件冒泡，确保可以选择文字
                    e.stopPropagation();
                  }}
                >
                  {tag.name}
                </span>
              </div>

              {/* 右侧区域 - 响应式对齐 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                flex: '1',
                minWidth: '400px',
                justifyContent: 'flex-end',
                userSelect: 'none', // ?? 禁止右侧区域被选中
                WebkitUserSelect: 'none',
                MozUserSelect: 'none'
              }}>
                {/* 日历映射 */}
                <div 
                  onClick={(e) => handleCalendarMappingClick(tag.id, e)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '16px',
                    color: '#000000',
                    cursor: 'pointer',
                    padding: '0px 8px',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s',
                    width: '180px',
                    flexShrink: 0,
                    position: 'relative', // ?? 用于批量指示器定位
                    border: selectedTagIds.includes(tag.id) && selectedTagIds.length > 1 ? '2px solid #3b82f6' : 'none' // ?? 批量模式边框
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title={
                    selectedTagIds.includes(tag.id) && selectedTagIds.length > 1 
                      ? `批量设置 (${selectedTagIds.length}个标签)` 
                      : "点击设置日历映射"
                  }
                >
                  {/* ?? 批量操作指示器 */}
                  {selectedTagIds.includes(tag.id) && selectedTagIds.length > 1 && (
                    <div style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      border: '2px solid white',
                      zIndex: 1
                    }}>
                      {selectedTagIds.length}
                    </div>
                  )}
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: tag.calendarMapping?.color || '#9ca3af',
                    flexShrink: 0
                  }} />
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}>
                    {tag.calendarMapping?.calendarName || '未映射'}
                  </span>
                </div>

              {/* 右侧按钮区域 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px'
              }}>
                {/* 打卡按钮 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '16px',
                  color: '#000000',
                  width: '95px', // 固定宽度，防止漂移
                  justifyContent: 'center',
                  flexShrink: 0, // 防止被压缩
                  overflow: 'visible' // 允许徽章溢出
                }}>
                  <div
                    onClick={() => handleCheckin(tag.id)}
                    style={{
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '25px',
                      height: '25px',
                      overflow: 'visible' // 允许徽章溢出
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    title={`打卡 (已打卡${checkinCounts[tag.id] || 0}次)`}
                  >
                    <img src={icons.multiCheckinColor} alt="打卡" width="25" height="25" />
                    {checkinCounts[tag.id] > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-8px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        borderRadius: '50%',
                        width: '16px',
                        height: '16px',
                        fontSize: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {checkinCounts[tag.id]}
                      </span>
                    )}
                  </div>
                  <span>
                    {(tag.dailyAvgCheckins || 0).toFixed(1)}次/天
                  </span>
                </div>

                {/* 计时器按钮 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '16px',
                  color: '#000000',
                  width: '110px', // 固定宽度，防止漂移
                  justifyContent: 'flex-start', // 左对齐
                  flexShrink: 0 // 防止被压缩
                }}>
                  {/* 计时按钮 - 固定在左侧 */}
                  <div
                    style={{
                      width: '25px',
                      height: '25px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0 // 固定大小，不会缩放
                    }}
                    onClick={() => {
                      // 如果当前标签正在计时，则暂停/继续
                      if (globalTimer?.tagId === tag.id) {
                        if (globalTimer.isRunning) {
                          onTimerPause?.();
                        } else {
                          onTimerResume?.();
                        }
                      } else {
                        // 开始新的计时
                        onTimerStart?.(tag.id);
                      }
                    }}
                    title={globalTimer?.tagId === tag.id ? (globalTimer.isRunning ? "暂停计时" : "继续计时") : "开始计时"}
                  >
                    <img 
                      src={icons.timerColor} 
                      alt="计时" 
                      width="25" 
                      height="25"
                      style={{
                        transition: 'transform 0.2s',
                        display: 'block'
                      }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.1)'}
                      onMouseLeave={(e) => (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'}
                    />
                  </div>
                  
                  {/* 计时文本 - 固定宽度，防止按钮移动 */}
                  <span style={{ 
                    width: '80px', // 固定宽度，文本变化不影响按钮位置
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {/* 如果当前标签正在计时，显示实时计时；否则显示平均时长 */}
                    {globalTimer?.tagId === tag.id ? (() => {
                      const elapsed = globalTimer.elapsedTime + 
                        (globalTimer.isRunning ? (Date.now() - globalTimer.startTime) : 0);
                      const totalSeconds = Math.floor(elapsed / 1000);
                      const hours = Math.floor(totalSeconds / 3600);
                      const minutes = Math.floor((totalSeconds % 3600) / 60);
                      const seconds = totalSeconds % 60;
                      
                      if (hours > 0) {
                        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                      }
                      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    })() : `${((tag.dailyAvgDuration || 150) / 60).toFixed(1)}h/天`}
                  </span>
                </div>
              </div>
              </div>
            </div>
          );
          })}

          {/* 新标签创建区域 - 在滚动容器内，跟随最后一个标签 */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '4px',
              marginTop: '12px',
              height: '24px',
              fontSize: '16px',
            fontFamily: "'Microsoft YaHei', Arial, sans-serif",
            position: 'relative',
            flexShrink: 0
          }}
          >
            {/* 标签内容 - 左侧 */}
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center',
                flex: 'none',
                width: 'auto',
                height: '24px',
                overflow: 'hidden'
              }}
            >
              {/* # 号- 固定24px */}
              <span 
                style={{ 
                  color: '#9ca3af',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  width: '24px',
                  textAlign: 'center',
                  padding: '2px',
                  borderRadius: '4px'
                }}
              >#</span>
              
              {/* Emoji - 固定24px，使用SVG图标 */}
              <span 
                style={{
                  fontSize: '16px',
                  width: '24px',
                  height: '24px',
                  textAlign: 'center',
                  padding: '2px',
                  borderRadius: '4px',
                  marginLeft: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img src={icons.emoji} alt="emoji" width="24" height="24" style={{ opacity: 0.5 }} />
              </span>
              
              {/* 新标签文字输入区域 - 扩大整个区域 */}
              <span 
                style={{ 
                  color: isCreatingNewTag ? '#3b82f6' : '#9ca3af',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginLeft: '8px',
                  outline: 'none',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'text',
                  fontStyle: isCreatingNewTag ? 'normal' : 'italic',
                  display: 'inline-block',
                  width: 'auto',
                  height: 'auto',
                  lineHeight: '20px',
                  verticalAlign: 'top',
                  whiteSpace: 'nowrap',
                  padding: '2px 4px',
                  margin: '0 0 0 8px',
                  minWidth: '120px', // 确保有足够的点击区域
                  borderRadius: '3px',
                  transition: 'background-color 0.2s'
                }}
                contentEditable
                suppressContentEditableWarning
                onClick={(e) => {
                  e.stopPropagation();
                  
                  // 用户明确点击了灰色文本
                  TagManagerLogger.log('? 用户明确点击了灰色文本区域');
                  
                  // 检查点击位置是否在文字附近
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;
                  
                  TagManagerLogger.log('?? Gray text area clicked at:', {
                    clickX: clickX.toFixed(1),
                    clickY: clickY.toFixed(1),
                    rectWidth: rect.width.toFixed(1),
                    rectHeight: rect.height.toFixed(1),
                    isCreating: isCreatingNewTag
                  });
                  
                  // 如果不在创建模式，直接激活创建（跳过用户意图检测）
                  if (!isCreatingNewTag) {
                    TagManagerLogger.log('?? Direct activation from click');
                    setIsCreatingNewTag(true); // 直接进入创建模式
                    
                    // 找到所有标签中position最大的标签，在其后面创建新的一级标签
                    const sortedTags = [...tags].sort((a, b) => (a.position || 0) - (b.position || 0));
                    const lastTag = sortedTags[sortedTags.length - 1];
                    const lastTagId = lastTag?.id;
                    
                    TagManagerLogger.log('?? [GrayText] Creating new tag after last tag:', {
                      lastTagId,
                      lastTagName: lastTag?.name,
                      lastTagPosition: lastTag?.position,
                      newTagLevel: 0
                    });
                    
                    // 如果有标签，在最后一个标签后面创建；否则直接创建
                    if (lastTagId) {
                      createNewTag(0, lastTagId);
                    } else {
                      createNewTag(0);
                    }
                    
                    // 保存当前元素的引用，避免在setTimeout中访问null
                    const currentElement = e.currentTarget;
                    setTimeout(() => {
                      if (currentElement && currentElement.textContent === '点击新增标签，Tab/Shift+Tab切换层级，Shift+Alt+↑/↓上下移动标签') {
                        currentElement.textContent = '';
                      }
                      if (currentElement) {
                        currentElement.focus();
                      }
                    }, 0);
                  }
                }}
                onFocus={(e) => {
                  TagManagerLogger.log('?? Gray text focused, isCreating:', isCreatingNewTag);
                  TagManagerLogger.log('?? 用户是否明确点击了灰色文本:', userClickedGrayText);
                  
                  // 如果已经在创建模式，直接返回
                  if (isCreatingNewTag) {
                    TagManagerLogger.log('? Already in creation mode, nothing to do');
                    return;
                  }
                  
                  // 如果用户没有明确点击灰色文本，这是意外的focus事件，忽略
                  if (!userClickedGrayText) {
                    TagManagerLogger.log('?? Focus事件不是由用户直接点击引起的，忽略');
                    // 移除焦点以防止意外激活
                    e.currentTarget.blur();
                    return;
                  }
                  
                  // 重置点击标记
                  setUserClickedGrayText(false);
                  
                  // 激活创建模式（这种情况应该很少发生，因为onClick已经处理了）
                  TagManagerLogger.log('? Valid focus on placeholder text, activating creation');
                  handleNewTagActivation();
                  e.currentTarget.textContent = '';
                }}
                onBlur={(e) => {
                  TagManagerLogger.log('?? Gray text blurred');
                  const content = e.currentTarget.textContent || '';
                  
                  if (isCreatingNewTag) {
                    if (content.trim() === '') {
                      // 如果没有输入内容，取消创建
                      TagManagerLogger.log('? Empty content, cancelling creation');
                      handleCancelNewTag();
                      e.currentTarget.textContent = '点击新增标签，Tab/Shift+Tab切换层级，Shift+Alt+↑/↓上下移动标签';
                    } else {
                      // 保存新标签内容，退出创建模式
                      TagManagerLogger.log('?? Saving new tag:', content.trim());
                      setIsCreatingNewTag(false);
                    }
                  } else {
                    // 确保显示占位符文本
                    if (content.trim() === '') {
                      e.currentTarget.textContent = '点击新增标签，Tab/Shift+Tab切换层级，Shift+Alt+↑/↓上下移动标签';
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const content = e.currentTarget.textContent || '';
                    if (content.trim() !== '') {
                      TagManagerLogger.log('? Creating new tag with Enter:', content.trim());
                      setIsCreatingNewTag(false);
                      // 这里可以继续创建下一个标签
                      setTimeout(() => {
                        handleNewTagActivation();
                        e.currentTarget.textContent = '';
                        e.currentTarget.focus();
                      }, 100);
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    TagManagerLogger.log('?? Cancelling new tag creation with Escape');
                    handleCancelNewTag();
                    e.currentTarget.textContent = '点击新增标签，Tab/Shift+Tab切换层级，Shift+Alt+↑/↓上下移动标签';
                    e.currentTarget.blur();
                  }
                }}
                onMouseEnter={(e) => {
                  if (!isCreatingNewTag) {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCreatingNewTag) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {!isCreatingNewTag ? '点击新增标签，Tab/Shift+Tab切换层级，Shift+Alt+↑/↓上下移动标签' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 选择器组件 */}
      <ColorPicker
        onSelect={handleColorSelect}
        onClose={() => setShowColorPicker({ show: false, tagId: '', position: { x: 0, y: 0 } })}
        position={showColorPicker.position}
        currentColor={tags.find(tag => tag.id === showColorPicker.tagId)?.color || '#000000'}
        isVisible={showColorPicker.show}
      />
      
      {/* emoji-mart 表情选择器 */}
      {showEmojiPicker.show && (
        <div 
          onMouseDown={handleMouseDown}
          style={{
          position: 'fixed', // 改为fixed定位
          left: showEmojiPicker.position.x,
          top: showEmojiPicker.position.y,
          zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          borderRadius: '12px',
          overflow: 'hidden',
          background: 'white',
          border: '1px solid #e5e7eb',
          userSelect: 'none', // 防止拖拽时选中文本
          cursor: isDragging ? 'grabbing' : 'grab'
        }}>
          <Picker
            data={data}
            onEmojiSelect={(emoji: any) => {
              handleEmojiSelect(emoji.native);
              setShowEmojiPicker({ show: false, tagId: '', position: { x: 0, y: 0 } });
            }}
            theme="light"
            set="native"
            locale="zh"
            title=""
            emoji="point_up"
            showPreview={false}
            previewPosition="none"
            showSkinTones={false}
            perLine={9}
            emojiSize={22}
            maxFrequentRows={3}
            skinTonePosition="none"
            searchPosition="top"
            navPosition="bottom"
            noCountryFlags={true}
            categoryIcons={{
              activity: '?',
              custom: '??',
              flags: '??',
              foods: '??',
              frequent: '?',
              nature: '??',
              objects: '??',
              people: '??',
              places: '??',
              symbols: '??'
            }}
          />
        </div>
      )}
      
      <CalendarMappingPicker
        onSelect={handleCalendarSelect}
        onClose={() => setShowCalendarPicker({ show: false, tagId: '', position: { x: 0, y: 0 } })}
        position={showCalendarPicker.position}
        isVisible={showCalendarPicker.show}
        microsoftService={microsoftService}
        googleService={undefined} // 未来的Google日历服务
        icloudService={undefined} // 未来的iCloud日历服务
        availableCalendars={availableCalendars}
      />
      
      {/* 点击外部关闭选择??*/}
      {(showEmojiPicker.show || showColorPicker.show || showCalendarPicker.show) && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
          }}
          onClick={() => {
            setShowEmojiPicker({ show: false, tagId: '', position: { x: 0, y: 0 } });
            setShowColorPicker({ show: false, tagId: '', position: { x: 0, y: 0 } });
            setShowCalendarPicker({ show: false, tagId: '', position: { x: 0, y: 0 } });
          }}
        />
      )}
    </div>
  );
};

export default TagManager;
