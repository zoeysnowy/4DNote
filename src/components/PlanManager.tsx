import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import type { Event } from '../types';
import { PlanSlate } from './PlanSlate/PlanSlate';
import { insertTag, insertEmoji, insertDateMention, insertEventMention, applyTextFormat, extractTagsFromLine } from './PlanSlate/helpers';
import { StatusLineContainer, StatusLineSegment } from './StatusLineContainer';
import { useFloatingToolbar } from './FloatingToolbar/useFloatingToolbar';
import { HeadlessFloatingToolbar } from './FloatingToolbar/HeadlessFloatingToolbar';
import { ToolbarConfig } from './FloatingToolbar/types';
import { TagService } from '../services/TagService';
import UnifiedDateTimePicker from './FloatingToolbar/pickers/UnifiedDateTimePicker';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { formatDateDisplay } from '../utils/dateParser';
import { EventEditModalV2 } from './EventEditModal/EventEditModalV2'; // v2 - 新版本
import { EventHub } from '../services/EventHub'; // 🎯 使用 EventHub 而不是 EventService
import { shouldShowInPlanManager, filterPlanEvents, isEmptyEvent } from '../utils/planManagerFilters';
import { extractCalendarIds, buildEventForSave, detectChanges } from '../utils/planManagerHelpers';
import { EventService } from '../services/EventService'; // 🔧 仅用于查询（getEventById）
import { EventHistoryService } from '../services/EventHistoryService'; // 🆕 用于事件历史快照
// 🆕 v2.17: EventIdPool 已删除，直接使用 UUID 生成
import { generateEventId } from '../utils/calendarUtils';
import { EventTreeAPI } from '../services/EventTree'; // 🆕 v2.20.0: EventTree Engine
import { formatTimeForStorage, parseLocalTimeString } from '../utils/timeUtils';
import { icons } from '../assets/icons';
import { useEventTime } from '../hooks/useEventTime';
import { TimeHub } from '../services/TimeHub';
import { getEventTime, setEventTime, isTask as isTaskByTime } from '../utils/timeManager'; // 🆕 统一时间管理
import './PlanManager.css';
import { dbg, warn, error } from '../utils/debugLogger';
import { formatRelativeTimeDisplay } from '../utils/relativeDateFormatter';
import TimeHoverCard from './TimeHoverCard';
import { calculateFixedPopupPosition } from '../utils/popupPositionUtils';
import ContentSelectionPanel from './ContentSelectionPanel';
import UpcomingEventsPanel from './UpcomingEventsPanel';
import { isEventExpired } from '../utils/upcomingEventsHelper'; // ✅ TIME_ARCHITECTURE 规范的工具函数
// 🆕 v2.21.0: 会话态管理 Hook
import { usePlanManagerSession } from './hooks/usePlanManagerSession';

// � 初始化调试标志 - 在模块加载时立即从 localStorage 读取
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('SLATE_DEBUG');
    if (saved === 'true') {
      (window as any).SLATE_DEBUG = true;
      console.log('%c[🚀] SLATE_DEBUG 已从 localStorage 恢复 (PlanManager)', 'background: #FF9800; color: white; padding: 2px 6px; border-radius: 3px;');
    }
  } catch (e) {
    // ignore
  }
}

// �🔧 常量定义
const DESCRIPTION_INDENT_OFFSET = 1; // Description 行相对于 Title 行的缩进增量

// 🔧 类型定义：编辑器行数据结构
interface FreeFormLine<T = any> {
  id: string;
  content: string;
  level: number;
  data?: T;
}

// 时间显示组件，订阅 TimeHub 更新
// 🔧 性能优化：使用 React.memo 避免不必要的重新渲染
const PlanItemTimeDisplay = React.memo<{
  item: Event;
  onEditClick: (anchor: HTMLElement) => void;
}>(({ item, onEditClick }) => {
  // 直接使用 item.id 订阅 TimeHub
  const eventTime = useEventTime(item.id);
  
  // 悬浮卡片状态管理
  const [showHoverCard, setShowHoverCard] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 🔧 [FIX] 空字符串视为 undefined（TimeHub 用空字符串清空时间字段）
  const startTime = (eventTime.start && eventTime.start !== '') ? new Date(eventTime.start) : (item.startTime ? new Date(item.startTime) : null);
  const endTime = (eventTime.end && eventTime.end !== '') ? new Date(eventTime.end) : (item.endTime ? new Date(item.endTime) : null);
  const dueDateTime = item.dueDateTime ? new Date(item.dueDateTime) : null;
  const isAllDay = eventTime.timeSpec?.allDay ?? item.isAllDay;
  // displayHint 已移除，使用动态计算
  
  // 🆕 v2.5: 获取 timeFieldState（时间字段状态位图）
  const timeFieldState = eventTime.timeFieldState ?? item.timeFieldState ?? null;
  const isFuzzyDate = eventTime.isFuzzyDate ?? item.isFuzzyDate ?? false;
  
  // 🆕 v2.7: 获取 isFuzzyTime 和 fuzzyTimeName（模糊时间段）
  const isFuzzyTime = eventTime.isFuzzyTime ?? (item as any).isFuzzyTime ?? false;
  const fuzzyTimeName = eventTime.fuzzyTimeName ?? (item as any).fuzzyTimeName ?? null;
  
  // 🆕 v1.2: 获取原始的本地时间字符串（用于 formatRelativeTimeDisplay）
  const startTimeStr = (eventTime.start && eventTime.start !== '') ? eventTime.start : (item.startTime || null);
  const endTimeStr = (eventTime.end && eventTime.end !== '') ? eventTime.end : (item.endTime || null);
  const dueDateTimeStr = item.dueDateTime || null;
  
  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  // 鼠标悬浮处理（简化版 - Tippy 负责定位）
  const handleMouseEnter = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    
    // 0.5秒延迟显示悬浮卡片
    hoverTimerRef.current = window.setTimeout(() => {
      setShowHoverCard(true);
    }, 500);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // 延迟关闭，给用户时间移动到悬浮卡片
    hoverTimerRef.current = window.setTimeout(() => {
      setShowHoverCard(false);
    }, 500); // 从 200ms 改为 500ms
  };

  const handleCardMouseEnter = () => {
    // 鼠标进入悬浮卡片，取消关闭定时器
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const handleCardMouseLeave = () => {
    // 鼠标离开悬浮卡片，延迟 500ms 关闭
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setShowHoverCard(false);
    }, 500);
  };

  // 处理编辑按钮点击
  const handleEditClick = (e?: React.MouseEvent<HTMLElement>) => {
    if (e) {
      e.stopPropagation();
    }
    setShowHoverCard(false);
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // 如果从悬浮卡片的修改按钮点击，使用容器元素
    // 如果从时间显示本身点击，使用点击的元素
    if (containerRef.current) {
      onEditClick(containerRef.current);
    }
  };

  // ✅ v2.8: 简化逻辑 - 只要有任何时间信息就显示
  if (!startTime && !dueDateTime) return null;

  // 使用相对时间格式化（动态计算）
  const relativeTimeDisplay = formatRelativeTimeDisplay(
    startTimeStr,
    endTimeStr,
    isAllDay ?? false,
    dueDateTimeStr
  );

  // 🎨 统一的渲染组件
  return (
    <Tippy
      content={
        <TimeHoverCard
          startTime={startTimeStr}
          endTime={endTimeStr}
          dueDateTime={dueDateTimeStr}
          isAllDay={isAllDay ?? false}
          onEditClick={handleEditClick}
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
        />
      }
      visible={showHoverCard}
      placement="bottom-start"
      offset={({ reference, popper }) => {
        return [reference.width - popper.width, 8];
      }}
      interactive={true}
      arrow={false}
      appendTo={() => document.body}
      onClickOutside={() => setShowHoverCard(false)}
    >
      <div 
        ref={containerRef}
        style={{ display: 'inline-block' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span
          style={{ color: '#6b7280', whiteSpace: 'nowrap', cursor: 'pointer' }}
          onClick={handleEditClick}
        >
          {relativeTimeDisplay}
        </span>
      </div>
    </Tippy>
  );
}, (prevProps, nextProps) => {
  // 🔧 自定义比较函数：只在关键属性变化时才重新渲染
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.startTime === nextProps.item.startTime &&
    prevProps.item.endTime === nextProps.item.endTime &&
    prevProps.item.dueDateTime === nextProps.item.dueDateTime &&
    prevProps.item.isAllDay === nextProps.item.isAllDay
  );
});

// 🔧 PlanManager 不再使用 Event，直接使用 Event
// Event 中已包含所有 Plan 相关字段（content, level, mode, emoji, color, priority, isCompleted 等）

export interface PlanManagerProps {
  // ❌ [REMOVED] items: Event[] - PlanManager 自己管理
  // ✅ 移除 onSave/onDelete，改用 EventHub 直接操作
  availableTags?: string[];
  onCreateEvent?: (event: Event) => void;
  onUpdateEvent?: (eventId: string, updates: Partial<Event>) => void;
  microsoftService?: any; // 🆕 Microsoft 服务实例
}

// 🔍 调试开关 - 通过 window.SLATE_DEBUG = true 开启
const isDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  return (window as any).SLATE_DEBUG === true;
};

// 🔧 优化：提取 Checkbox 为独立组件，使用 React.memo 避免重复渲染
const PlanItemCheckbox = React.memo<{
  isCompleted: boolean;
  onChange: (checked: boolean) => void;
  emoji?: string;
}>(({ isCompleted, onChange, emoji }) => {
  return (
    <>
      <input
        type="checkbox"
        checked={isCompleted || false}
        onChange={(e) => {
          e.stopPropagation();
          onChange(e.target.checked);
        }}
        style={{
          cursor: 'pointer',
          opacity: 1,
        }}
      />
      {emoji && <span style={{ fontSize: '16px', lineHeight: '1' }}>{emoji}</span>}
    </>
  );
}, (prevProps, nextProps) => {
  // 只在关键属性变化时才重新渲染
  return prevProps.isCompleted === nextProps.isCompleted &&
         prevProps.emoji === nextProps.emoji;
  // onChange 函数引用变化不触发重渲染（因为它是从 useCallback 来的）
});

const PlanManager: React.FC<PlanManagerProps> = ({
  isPanelVisible = true,
  onPanelVisibilityChange,
  availableTags = [],
  onCreateEvent,
  onUpdateEvent,
  microsoftService, // 🆕 接收 Microsoft 服务
}) => {
  // 🔍 版本标记 - 用于验证代码是否被加载
  // console.log('%c[PlanManager v2.15] 组件加载 - 包含 itemsHash 诊断日志', 'background: #FF6B6B; color: white; font-weight: bold; padding: 4px 8px;');
  
  // ✅ PlanManager 自己维护 items state
  // 🛡️ PERFORMANCE FIX: 使用useRef缓存初始数据，避免重复计算
  const initialItemsRef = useRef<Event[] | null>(null);
  
  const [items, setItems] = useState<Event[]>(() => {
    if (initialItemsRef.current) {
      console.log('[PlanManager] 使用缓存的初始数据:', {
        数量: initialItemsRef.current.length,
        示例: initialItemsRef.current.slice(0, 3).map(e => ({
          id: (e.id || '').slice(-10),
          title: (e.title?.simpleTitle || '').slice(0, 20),
          isPlan: e.isPlan
        }))
      });
      return initialItemsRef.current;
    }
    
    // 🔧 FIX: 初始化为空数组，通过 useEffect 异步加载数据
    // （不能在 useState 初始化器中调用 async 方法）
    console.log('[PlanManager] 初始化为空数组，等待 useEffect 加载数据');
    return [];
  });
  
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  
  // 🔍 DEBUG: 监听 selectedItemId 变化
  useEffect(() => {
    console.log('🔍 [PlanManager.selectedItemId] 状态变化:', {
      selectedItemId,
      selectedItemId_type: typeof selectedItemId,
      selectedItemId_preview: selectedItemId?.slice(-8) || 'null',
      will_render_modal: !!selectedItemId
    });
  }, [selectedItemId]);
  
  // 🔧 [已删除] editingItem - EventEditModalV2 现在直接从 EventHub 获取数据，不需要传入 item 对象
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // 🆕 本地临时状态：管理尚未保存到EventService的空行（graytext点击创建的）
  const [pendingEmptyItems, setPendingEmptyItems] = useState<Map<string, Event>>(new Map());
  
  // 🔍 调试工具：实时同步 items 到 window 对象
  useEffect(() => {
    (window as any).__PLAN_EVENTS__ = items;
  }, [items]);
  
  // 🆕 v2.21.0: 统一的会话态管理（替代9个useState）
  const { state: session, actions: sessionActions } = usePlanManagerSession();
  
  // 🔄 向后兼容：保留原有的ref名称
  const currentSelectedTagsRef = useRef<string[]>(session.focus.selectedTags);
  
  // 🚀 性能优化: 缓存事件状态查询结果
  const eventStatusCacheRef = useRef<Map<string, { status: 'new' | 'updated' | 'done' | 'missed' | 'deleted' | undefined, timestamp: number }>>(new Map());
  
  // 🆕 事件状态计算函数 (带缓存) - ⚠️ 异步版本
  const getEventStatus = useCallback(async (eventId: string, metadata?: any): Promise<'new' | 'updated' | 'done' | 'missed' | 'deleted' | undefined> => {
    if (!session.filter.dateRange) return undefined;
    
    // 🔧 首先检查是否是 ghost 事件（Snapshot 模式下显示为已删除）
    // 优先从 metadata 检查（更准确），否则从 items 查找
    if (metadata?._isDeleted) {
      return 'deleted';
    }
    const ghostEvent = items.find((item: any) => item.id === eventId && item._isDeleted);
    if (ghostEvent) {
      return 'deleted';
    }
    
    // 🚀 检查缓存 (5秒内有效)
    const cached = eventStatusCacheRef.current.get(eventId);
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.status;
    }
    
    try {
      // 从EventHistoryService获取事件在指定时间段的历史记录
      const startTime = formatTimeForStorage(session.filter.dateRange.start);
      const endTime = formatTimeForStorage(session.filter.dateRange.end);
      const history = await EventHistoryService.queryHistory({ 
        eventId, 
        startTime, 
        endTime 
      });
      
      if (!history || history.length === 0) {
        const result = undefined;
        eventStatusCacheRef.current.set(eventId, { status: result, timestamp: Date.now() });
        return result;
      }
      
      // 按时间排序，最新的在前 - 使用 parseLocalTimeString 确保本地时间解析
      const sortedHistory = history.sort((a, b) => parseLocalTimeString(b.timestamp).getTime() - parseLocalTimeString(a.timestamp).getTime());
      const latestAction = sortedHistory[0];
      
      // 根据最新操作确定状态
      let status: 'new' | 'updated' | 'done' | 'missed' | 'deleted' | undefined;
      
      switch (latestAction.operation) {
        case 'create':
          status = 'new';
          break;
        case 'update':
          status = 'updated';
          break;
        case 'delete':
          status = 'deleted';
          break;
        case 'checkin':
          // 检查checkin历史的具体action来判断是签到还是取消签到
          if (latestAction.metadata?.action === 'check-in') {
            status = 'done';
          } else if (latestAction.metadata?.action === 'uncheck') {
            // 取消签到后，简化处理：直接标记为 updated
            // TODO: 需要异步版本才能检查事件时间
            status = 'updated';
          } else {
            status = 'done';
          }
          break;
        default:
          // 简化处理：默认标记为 updated
          // TODO: 需要异步版本才能检查签到状态和事件时间
          status = 'updated';
          break;
      }
      
      // 缓存并返回状态
      eventStatusCacheRef.current.set(eventId, { status, timestamp: Date.now() });
      return status;
    } catch (error) {
      console.warn(`[getEventStatus] Error getting status for event ${eventId}:`, error);
      return undefined;
    }
  }, [session.filter.dateRange, items]);
  
  // 避免重复插入同一标签的防抖标记（同一行同一标签在短时间内仅插入一次）
  const lastTagInsertRef = useRef<{ lineId: string; tagId: string; time: number } | null>(null);
  // 🆕 PlanSlate 的单个编辑器实例
  const unifiedEditorRef = useRef<any>(null);
  // 注册每一行的 Tiptap 编辑器实例（用于精准插入到光标位置）
  const editorRegistryRef = useRef<Map<string, any>>(new Map());
  
  // 🆕 v1.5: onChange 防抖优化（300ms）
  const onChangeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatedItemsRef = useRef<any[] | null>(null);
  
  // 🔧 FIX: 异步加载初始数据
  useEffect(() => {
    const loadInitialData = async () => {
      console.log('[PlanManager] 🚀 v2.20.0 - 使用 EventTreeAPI 加载初始数据...');
      
      // 清空缓存，强制重新加载
      initialItemsRef.current = null;
      
      try {
        // 1. 加载所有事件
        const rawEvents = await EventService.getAllEvents();
        
        // 2. 过滤掉 ghost 事件（带 _isDeleted 标记的临时事件）
        const allEvents = rawEvents.filter(e => !(e as any)._isDeleted);
        
        if (rawEvents.length !== allEvents.length) {
          console.warn('[PlanManager] 🚨 过滤了', rawEvents.length - allEvents.length, '个 ghost 事件');
        }
        
        console.log('[PlanManager] 从 EventService 加载:', allEvents.length, '个事件');
        
        // 3. 数据迁移：为旧的 isPlan 事件批量设置 checkType（仅执行一次）
        const needsMigration = allEvents.filter(e => e.isPlan && !e.checkType);
        if (needsMigration.length > 0) {
          console.log('🔧 [数据迁移] 检测到需要迁移的 isPlan 事件:', needsMigration.length);
          
          needsMigration.forEach(event => {
            event.checkType = 'once';
          });
          
          for (const event of needsMigration) {
            await EventService.updateEvent(event.id, { checkType: 'once' }, false);
          }
          console.log(`✅ [数据迁移] 已静默更新 ${needsMigration.length} 个事件的 checkType`);
        }
        
        // 4. 使用统一的过滤函数
        const filtered = filterPlanEvents(allEvents, { mode: 'normal' });
        console.log('[PlanManager] 过滤后的 Plan 事件:', filtered.length);
        
        // 5. 删除空白事件
        const emptyEvents = filtered.filter(isEmptyEvent);
        let remainingFiltered = filtered;
        
        if (emptyEvents.length > 0) {
          console.warn('[PlanManager] 🗑️ 发现', emptyEvents.length, '个空白事件，准备删除');
          
          for (const emptyEvent of emptyEvents) {
            try {
              await EventService.deleteEvent(emptyEvent.id!);
            } catch (err) {
              console.error('[PlanManager] ❌ 删除空白事件失败:', emptyEvent.id?.slice(-8), err);
            }
          }
          
          const deletedIds = new Set(emptyEvents.map(e => e.id));
          remainingFiltered = filtered.filter(e => !deletedIds.has(e.id));
          console.log('[PlanManager] 清理完成，剩余事件数:', remainingFiltered.length);
        }
        
        // 6. 过滤已删除和空标题的事件
        const validEvents = remainingFiltered.filter(event => {
          if (event.deletedAt) return false;
          const titleStr = typeof event.title === 'string' ? event.title : event.title?.simpleTitle || '';
          return titleStr.trim();
        });
        
        console.log('[PlanManager] 有效事件数:', validEvents.length);
        
        // 🆕 v2.20.0: 使用 EventTreeAPI 一次性计算树结构
        console.log('[PlanManager] 🌲 使用 EventTreeAPI 构建树...');
        const treeResult = EventTreeAPI.buildTree(validEvents, {
          validateStructure: true,
          computeBulletLevels: true,
          sortSiblings: true,
        });
        
        console.log('[PlanManager] 🌲 树构建完成:', {
          总节点数: treeResult.nodes.length,
          根节点数: treeResult.rootIds.length,
          最大深度: treeResult.stats.maxDepth,
          错误数: treeResult.errors.length,
          计算时间: treeResult.stats.computeTime + 'ms'
        });
        
        // 报告树验证错误
        if (treeResult.errors.length > 0) {
          console.warn('[PlanManager] 🚨 树结构验证错误:', treeResult.errors.map(err => ({
            类型: err.type,
            节点: err.nodeId?.slice(-8),
            消息: err.message
          })));
        }
        
        // 7. 使用 EventTreeAPI.toDFSList() 获取 DFS 排序的事件列表
        const sortedEvents = EventTreeAPI.toDFSList(validEvents);
        
        console.log('[PlanManager] 📊 DFS 排序完成:', sortedEvents.length, '个事件');
        
        // 8. 附加 bulletLevel 到事件对象
        const bulletLevels = treeResult.bulletLevels;
        const eventsWithLevels = sortedEvents.map(event => ({
          ...event,
          bulletLevel: bulletLevels.get(event.id!) || 0
        })) as Event[];
        
        // 调试：检查排序结果（前 30 个）
        console.log('[PlanManager] 🔍 sortedEvents 顺序检查（前30个）:');
        eventsWithLevels.slice(0, 30).forEach((e, idx) => {
          const indent = '  '.repeat(e.bulletLevel || 0);
          console.log(`[${idx}] ${indent}L${e.bulletLevel} ${e.title?.simpleTitle?.slice(0, 40)} (父:${e.parentEventId?.slice(-8) || 'ROOT'})`);
        });
        
        // 🔍 调试工具：将排序后的事件列表暴露到 window 对象
        (window as any).__PLAN_EVENTS__ = eventsWithLevels;
        console.log('💡 调试提示：使用 window.__PLAN_EVENTS__ 查看排序后的事件列表');
        
        // 缓存并设置
        initialItemsRef.current = eventsWithLevels;
        setItems(eventsWithLevels);
      } catch (error) {
        console.error('[PlanManager] 加载初始数据失败:', error);
        setItems([]);
      }
    };
    
    loadInitialData();
  }, []); // 只在组件挂载时执行一次
  
  // 🔍 监控 items 数组的变化（调试用）
  useEffect(() => {
    if (items.length > 0) {
      console.log('[PlanManager] 📋 items 数组已更新:', {
        数量: items.length,
        前5个ID: items.slice(0, 5).map(e => e.id?.slice(-8)),
        前5个标题: items.slice(0, 5).map(e => e.title?.simpleTitle?.slice(0, 30))
      });
    }
  }, [items]);
  
  // 清理定时器和缓存
  useEffect(() => {
    // 🔍 组件挂载
    if (isDebugEnabled()) {
      // Debug mode enabled
    }
    
    return () => {
      if (onChangeTimerRef.current) {
        clearTimeout(onChangeTimerRef.current);
      }
      // 🧹 清理缓存
      eventStatusCacheRef.current.clear();
      snapshotCacheRef.current = null;
      
      // 🆕 v2.17: 不再需要 EventIdPool 清理
    };
  }, []);
  
  // ✅ 监听 eventsUpdated，增量更新 items（带循环防护 + BulletLevel 计算）
  useEffect(() => {
    /**
     * 增量更新单个事件及其受影响的关联事件
     * 🎯 BulletLevel → EventTree 集成：计算并更新 bulletLevel
     */
    /**
     * 🎯 共享过滤函数：判断事件是否应该显示在 PlanManager
     */
    const shouldShowEvent = (event: Event | null | undefined): boolean => {
      if (!event) return false;
      
      // 🗑️ 步骤 0: 排除已删除的事件
      if (event.deletedAt) return false;
      
      const now = new Date();
      
      // 步骤 1: 并集条件
      const matchesInclusionCriteria = 
        event.isPlan === true || 
        (event.checkType && event.checkType !== 'none') ||
        event.isTimeCalendar === true;
      
      if (!matchesInclusionCriteria) return false;
      
      // 步骤 2: 排除系统事件
      if (EventService.isSubordinateEvent(event)) return false;
      
      // 步骤 2.5: 过滤空白事件
      const titleObj = event.title;
      const hasTitle = event.content || 
                      (typeof titleObj === 'string' ? titleObj : 
                       (titleObj && (titleObj.simpleTitle || titleObj.fullTitle || titleObj.colorTitle)));
      
      const eventlogField = (event as any).eventlog;
      let hasEventlog = false;
      if (eventlogField) {
        if (typeof eventlogField === 'string') {
          hasEventlog = eventlogField.trim().length > 0;
        } else if (typeof eventlogField === 'object' && eventlogField !== null) {
          // 检查slateJson是否有实际文本内容
          if (eventlogField.slateJson) {
            try {
              const slateNodes = JSON.parse(eventlogField.slateJson);
              hasEventlog = slateNodes.some((node: any) => {
                const children = node.children || [];
                return children.some((child: any) => child.text && child.text.trim() !== '');
              });
            } catch (e) {
              hasEventlog = false;
            }
          }
          // 如果slateJson没有内容，检查plainText
          if (!hasEventlog && eventlogField.plainText) {
            hasEventlog = !!eventlogField.plainText.trim();
          }
        }
      }
      if (!hasTitle && !hasEventlog) return false;
      
      // 步骤 3: 过期/完成事件处理
      const isExpired = isEventExpired(event, now);
      if (event.isTimeCalendar && isExpired) {
        const isTaskLike = event.isPlan === true || (event.checkType && event.checkType !== 'none');
        if (!isTaskLike) return false;
      }
      
      // 3.2 已完成任务：过0点后自动隐藏
      if (event.checkType && event.checkType !== 'none') {
        const lastChecked = event.checked?.[event.checked.length - 1];
        const lastUnchecked = event.unchecked?.[event.unchecked.length - 1];
        const isCompleted = lastChecked && (!lastUnchecked || lastChecked > lastUnchecked);
        if (isCompleted && lastChecked) {
          const completedTime = new Date(lastChecked);
          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          if (completedTime < today) return false;
        }
      }
      
      return true;
    };

    const incrementalUpdateEvent = async (eventId: string) => {
      console.log('[PlanManager] 🎯 Incremental update:', eventId.slice(-8));
      
      // 1. 获取更新后的事件
      const updatedEvent = await EventService.getEventById(eventId);
      if (!updatedEvent) {
        setItems(prev => prev.filter(item => item.id !== eventId));
        console.log('[PlanManager] ❌ Event deleted:', eventId.slice(-8));
        return;
      }
      
      // 1.5. 🎯 应用过滤逻辑（防止不符合条件的事件进入）
      if (!shouldShowEvent(updatedEvent)) {
        setItems(prev => prev.filter(item => item.id !== eventId));
        console.log('[PlanManager] 🚫 Event filtered out:', eventId.slice(-8), {
          isPlan: updatedEvent.isPlan,
          checkType: updatedEvent.checkType,
          isTimeCalendar: updatedEvent.isTimeCalendar
        });
        return;
      }
      
      // 2. 计算受影响的事件范围
      const affectedEventIds = new Set<string>([eventId]);
      
      // 2.1 父事件（childEventIds 可能变化）
      if (updatedEvent.parentEventId) {
        affectedEventIds.add(updatedEvent.parentEventId);
      }
      
      // 2.2 子事件（bulletLevel 需要重新计算）
      // ADR-001/v2.22+: childEventIds 不再维护；使用 parentEventId 派生直接子节点
      const directChildren = await EventService.getChildEvents(eventId);
      directChildren.forEach(child => affectedEventIds.add(child.id));
      
      console.log('[PlanManager] 📊 Affected events:', {
        count: affectedEventIds.size,
        ids: Array.from(affectedEventIds).map(id => id.slice(-8))
      });
      
      // 3. 批量获取受影响的事件
      const affectedEvents = await Promise.all(
        Array.from(affectedEventIds).map(id => EventService.getEventById(id))
      );
      // 3.5 过滤掉 null 和不符合显示条件的事件
      const validEvents = affectedEvents
        .filter((e): e is Event => e !== null)
        .filter(e => shouldShowEvent(e));
      
      console.log('[PlanManager] 📊 Filtered events:', {
        total: affectedEvents.length,
        valid: validEvents.length,
        filtered: affectedEvents.length - validEvents.length
      });
      
      // 4. 🎯 计算这些事件的 bulletLevel（从 EventTree 关系推导）
      const bulletLevels = EventService.calculateAllBulletLevels(validEvents);
      
      console.log('[PlanManager] 📊 Calculated bulletLevels:', {
        eventLevels: Object.fromEntries(
          Array.from(bulletLevels.entries()).map(([id, level]) => [id.slice(-8), level])
        )
      });
      
      // 5. 增量更新 items 数组
      setItems(prev => {
        const newItems = [...prev];
        const eventMap = new Map(newItems.map((item, index) => [item.id!, index]));
        
        validEvents.forEach(event => {
          const bulletLevel = bulletLevels.get(event.id!) || 0;
          
          // ⚠️ 注意：bulletLevel 只用于前端显示，不持久化到数据库
          // Event 类型没有 bulletLevel 字段，这里临时添加用于 PlanSlate 渲染
          const eventWithLevel = { ...event, bulletLevel } as Event & { bulletLevel?: number };
          
          const existingIndex = eventMap.get(event.id!);
          if (existingIndex !== undefined) {
            // 更新现有事件
            newItems[existingIndex] = eventWithLevel;
          } else {
            // 新增事件（不太可能，但做防护）
            newItems.push(eventWithLevel);
          }
        });
        
        return newItems;
      });
      
      console.log('[PlanManager] ✅ Incremental update complete:', {
        updatedEvents: affectedEventIds.size,
        eventIds: Array.from(affectedEventIds).map(id => id.slice(-8))
      });
    };
    
    const handleEventUpdated = async (e: CustomEvent) => {
      const { eventId, isDeleted, isNewEvent, updateId, isLocalUpdate, originComponent, source } = e.detail || {};
      
      // 🚫 循环更新防护：跳过本组件发出的更新
      if (isLocalUpdate && originComponent === 'PlanManager') {
        console.log('🔄 [PlanManager] ⏭️ Skip own update (optimistic update already applied):', eventId?.slice(-10));
        return;
      }
      
      // 🚫 双重检查：询问EventService确认
      if (updateId && EventService.isLocalUpdate(eventId, updateId)) {
        console.log('🔄 [PlanManager] ⏭️ EventService confirmed local update, skip:', eventId?.slice(-10));
        return;
      }
      
      console.log('[PlanManager] 📡 External update received:', { 
        eventId: eventId?.slice(-10), 
        source, 
        originComponent,
        isDeleted,
        isNewEvent
      });
      
      // 🧹 清除该事件的状态缓存
      eventStatusCacheRef.current.delete(eventId);
      snapshotCacheRef.current = null;
      
      if (isDeleted) {
        // 增量删除
        setItems(prev => prev.filter(event => event.id !== eventId));
        sessionActions.incrementSnapshotVersion();
        console.log('[PlanManager] 🗑️ Event deleted:', eventId?.slice(-10));
      } else if (isNewEvent) {
        // 增量添加（使用增量更新逻辑）
        await incrementalUpdateEvent(eventId);
        sessionActions.incrementSnapshotVersion();
      } else if (eventId) {
        // 🎯 增量更新（核心改进）
        await incrementalUpdateEvent(eventId);
        sessionActions.incrementSnapshotVersion();
      } else {
        // 没有 eventId，可能是批量操作，全量刷新
        console.warn('[PlanManager] ⚠️ No eventId in update event, may need full reload');
      }
    };
    
    window.addEventListener('eventsUpdated', handleEventUpdated as EventListener);
    return () => window.removeEventListener('eventsUpdated', handleEventUpdated as EventListener);
  }, []);
  
  // 日期提及弹窗
  const [showDateMention, setShowDateMention] = useState(false);
  const [showUnifiedPicker, setShowUnifiedPicker] = useState(false);
  // 仅保存真实 DOM 锚点（span 或可点击预览元素）
  const dateAnchorRef = useRef<HTMLElement | null>(null);
  // 保存键盘触发时的光标矩形，供 Tippy 使用虚拟定位，避免参考元素被编辑器重绘移除
  const caretRectRef = useRef<DOMRect | null>(null);
  const pickerTargetItemIdRef = useRef<string | null>(null);

  // 设置 dayjs 语言环境为中文，确保与 UnifiedDateTimePicker 的展示一致
  dayjs.locale('zh-cn');
  
  // 🆕 v1.6: 统一删除接口（单一删除入口）
  const deleteItems = useCallback(async (itemIds: string[], reason: string) => {
    if (itemIds.length === 0) return;
    
    dbg('delete', `🗑️ 统一删除 ${itemIds.length} 个 items`, { reason, ids: itemIds });
    
    // 1. 从 pendingEmptyItems 移除
    setPendingEmptyItems(prev => {
      const next = new Map(prev);
      itemIds.forEach(id => next.delete(id));
      return next;
    });
    
    // 2. ✅ 使用 EventHub 删除
    for (const id of itemIds) {
      try {
        await EventHub.deleteEvent(id, false);
      } catch (err) {
        error('delete', `删除 ${id} 失败`, { error: err });
      }
    }
    
    dbg('delete', `✅ 删除完成`, { count: itemIds.length });
  }, []);
  
  // 标签替换
  const [replacingTagElement, setReplacingTagElement] = useState<HTMLElement | null>(null);
  const [showTagReplace, setShowTagReplace] = useState(false);
  
  // FloatingToolbar 配置
  const toolbarConfig: ToolbarConfig = {
    mode: 'quick-action',
    features: [], // 🆕 features 由 HeadlessFloatingToolbar 根据 mode 自动决定
  };
  
  // FloatingToolbar Hook - 自动管理模式切换
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [activePickerIndex, setActivePickerIndex] = useState<number | null>(null);
  const [isSubPickerOpen, setIsSubPickerOpen] = useState<boolean>(false); // 🆕 追踪子选择器（颜色选择器）是否打开
  
  const floatingToolbar = useFloatingToolbar({
    editorRef: editorContainerRef as React.RefObject<HTMLElement>,
    enabled: true,
    menuItemCount: 7, // 🆕 最大菜单项数：text_floatingbar 有 7 个菜单项，menu_floatingbar 有 5 个菜单项
    onMenuSelect: (menuIndex: number) => {
      setActivePickerIndex(menuIndex);
    },
    isSubPickerOpen, // 🔑 传递子选择器状态
  });

  // 🆕 监听 TagPicker 打开，同步实际的标签状态
  useEffect(() => {
    // 🎯 只在 TagPicker 打开时（activePickerIndex 从非0变为0）同步 Slate 状态
    if (activePickerIndex !== 0 || !session.focus.lineId) return;
    
    // 📌 Description 模式下不同步状态（mention-only 标签不记住勾选）
    if (session.focus.mode === 'description') {
      sessionActions.updateFocusTags([]);
      currentSelectedTagsRef.current = [];
      console.log('[TagPicker Sync] Description 模式，清空勾选状态');
      return;
    }
    
    const editor = unifiedEditorRef.current;
    if (!editor) return;

    // 🔧 使用 helpers 中的 extractTagsFromLine 函数
    const tagIds = extractTagsFromLine(editor, session.focus.lineId);
    
    // 更新状态
    sessionActions.updateFocusTags(tagIds);
    currentSelectedTagsRef.current = tagIds;
    console.log('[TagPicker Sync] Title 模式，同步已选标签:', tagIds);
  }, [activePickerIndex, session.focus.mode, session.focus.lineId, sessionActions]); // 🔥 添加 currentFocusedLineId 依赖

  // 将文本格式命令路由到当前 Slate 编辑器
  const handleTextFormat = useCallback((command: string, value?: string) => {
    // 🆕 使用 PlanSlate 的 applyTextFormat 函数
    const editor = unifiedEditorRef.current;
    if (!editor) {
      console.warn('[handleTextFormat] Editor not ready');
      return;
    }
    
    const success = applyTextFormat(editor, command, value);
    
    // 如果是 bullet 切换，隐藏 FloatingBar
    if (success && command === 'toggleBulletList') {
      floatingToolbar.hideToolbar();
    }
  }, [floatingToolbar]);

  // 监听编辑器内的 focus 事件，保存当前聚焦的行 ID
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;
    
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.hasAttribute('contenteditable')) {
        const lineId = target.getAttribute('data-line-id');
        if (lineId) {
          const isDescriptionLine = lineId.includes('-desc') || target.classList.contains('description-mode');
          const actualItemId = lineId.replace('-desc', '');
          const item = items.find(i => i.id === actualItemId);
          
          // ✅ 使用 sessionActions.setFocus 原子更新
          sessionActions.setFocus(lineId, {
            mode: isDescriptionLine ? 'description' : 'title',
            isTask: item?.isTask || false
          });
        }
      }
    };
    
    // 监听 @ 键触发日期输入，Ctrl+; 触发统一日期时间选择器
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!target.hasAttribute('contenteditable')) return;
      
      // 检测 Ctrl+; 打开统一日期时间选择器（UnifiedDateTimePicker）
      if (e.ctrlKey && (e.key === ';')) {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          // 记录当前光标矩形（用于 getReferenceClientRect）
          try {
            const rect = range.getBoundingClientRect();
            if (rect) caretRectRef.current = rect;
          } catch {}
          // 创建真实锚点（同上）
          const anchor = document.createElement('span');
          anchor.className = 'temp-picker-anchor';
          anchor.style.cssText = 'display: inline-block; width: 1px; height: 1px; vertical-align: text-bottom;';
          range.insertNode(anchor);
          range.setStartAfter(anchor);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          dateAnchorRef.current = anchor;
          // 记录当前行对应的 itemId 作为目标
          if (session.focus.lineId) {
            pickerTargetItemIdRef.current = session.focus.lineId.replace('-desc','');
          }
          setShowUnifiedPicker(true);
        }
        return;
      }
    };
    
    // 监听点击标签元素
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // 检查是否点击了标签
      if (target.classList.contains('inline-tag')) {
        e.preventDefault();
        e.stopPropagation();
        
        // 保存被点击的标签元素
        setReplacingTagElement(target);
        setShowTagReplace(true);
      }
    };
    
    container.addEventListener('focusin', handleFocus);
    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('click', handleClick);
    
    return () => {
      container.removeEventListener('focusin', handleFocus);
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('click', handleClick);
    };
  }, [items]);

  // 监听 TagService 变化
  const [tagServiceVersion, setTagServiceVersion] = useState(0);
  
  useEffect(() => {
    // 订阅标签变化
    const listener = () => {
      setTagServiceVersion(v => v + 1);
    };
    
    TagService.addListener(listener);
    
    // 初始加载时检查一次
    const tags = TagService.getFlatTags();
    if (tags.length > 0) {
    } else {
    }
    
    return () => TagService.removeListener(listener);
  }, []);

  // 获取所有已使用的标签
  const existingTags = useMemo(() => {
    const allTags = TagService.getFlatTags();
    if (allTags.length > 0) {
    }
    
    // 获取当前计划项中使用的标签名
    const usedTagNames = new Set<string>();
    items.forEach(item => {
      item.tags?.forEach(tag => usedTagNames.add(tag));
    });
    
    // 返回所有标签，优先显示正在使用的标签
    return allTags;
  }, [items, tagServiceVersion]);

  // 🔧 创建 itemsMap 用于快速查找
  const itemsMap = useMemo(() => {
    const map: Record<string, Event> = {};
    items.forEach(item => {
      map[item.id] = item;
    });
    return map;
  }, [items]);

  // 🆕 v1.5: 批处理执行函数（从 onChange 中提取）
  const executeBatchUpdate = useCallback(async (updatedItems: any[]) => {
    console.log('[executeBatchUpdate] 🔍 开始处理:', {
      总数: updatedItems.length,
      items: updatedItems.map(item => ({
        id: item.id?.slice(-8),
        fullId: item.id,
        title: item.title?.simpleTitle?.substring(0, 20) || item.content?.substring(0, 20),
        _isDeleted: item._isDeleted || false
      }))
    });
    
    // 🔧 过滤掉 ghost events（Snapshot 模式的虚拟事件，不应该保存）
    const realItems = updatedItems.filter(item => !(item as any)._isDeleted);

    // ✅ Fix outline reparenting:
    // When users reorder lines, Slate may preserve old metadata.parentEventId for the following
    // deeper nodes. In Plan outline semantics, parent is derived from the nearest previous
    // node with a lower bulletLevel. We recompute parentEventId from (bulletLevel + visual order)
    // only when the current edit payload contains *all* existing items (avoid corrupting structure
    // under filtered views).
    const existingIds = items.map(i => i.id).filter(Boolean);
    const updatedIdSet = new Set(realItems.map((i: any) => i?.id).filter(Boolean));
    const hasAllExistingItemsInPayload = existingIds.every(id => updatedIdSet.has(id));

    const realItemsWithDerivedParents = hasAllExistingItemsInPayload
      ? (() => {
          const lastIdByLevel = new Map<number, string>();
          return realItems.map((u: any) => {
            const levelRaw = (u as any).bulletLevel ?? (u as any).level ?? 0;
            const level = Number.isFinite(levelRaw) ? Math.max(0, Math.floor(levelRaw)) : 0;

            let derivedParentId: string | undefined = undefined;
            if (level > 0) {
              for (let k = level - 1; k >= 0; k--) {
                const candidate = lastIdByLevel.get(k);
                if (candidate) {
                  derivedParentId = candidate;
                  break;
                }
              }
            }

            // Update stack AFTER deriving (so the node doesn't become its own ancestor)
            if (u?.id) lastIdByLevel.set(level, String(u.id));
            // Clear deeper levels because this node becomes the latest at its level
            for (const key of Array.from(lastIdByLevel.keys())) {
              if (key > level) lastIdByLevel.delete(key);
            }

            const currentParentId = (u as any).parentEventId ? String((u as any).parentEventId) : undefined;
            const nextParentId = derivedParentId;
            if (currentParentId === nextParentId) return u;
            if (!currentParentId && !nextParentId) return u;
            return { ...u, parentEventId: nextParentId };
          });
        })()
      : realItems;

    // ✅ Persist ordering: derive sibling positions from the editor's current visual order.
    // We only recompute a parent's sibling positions when ALL existing siblings of that parent
    // are present in the current edit payload (avoids corrupting order under filtered views).
    const parentKeyOf = (parentEventId: any) => (parentEventId ? String(parentEventId) : '__root__');

    const existingIdsByParent = new Map<string, Set<string>>();
    for (const e of items) {
      if (!e?.id) continue;
      const key = parentKeyOf((e as any).parentEventId);
      if (!existingIdsByParent.has(key)) existingIdsByParent.set(key, new Set());
      existingIdsByParent.get(key)!.add(e.id);
    }

    const updatedIdsByParent = new Map<string, string[]>();
    for (const u of realItemsWithDerivedParents) {
      if (!u?.id) continue;
      const key = parentKeyOf((u as any).parentEventId);
      if (!updatedIdsByParent.has(key)) updatedIdsByParent.set(key, []);
      updatedIdsByParent.get(key)!.push(u.id);
    }

    const canRecomputeParent = new Map<string, boolean>();
    for (const [key, existingSet] of existingIdsByParent.entries()) {
      const updatedArr = updatedIdsByParent.get(key);
      if (!updatedArr) {
        canRecomputeParent.set(key, false);
        continue;
      }
      const updatedSet = new Set(updatedArr);
      const allExistingPresent = Array.from(existingSet).every(id => updatedSet.has(id));
      canRecomputeParent.set(key, allExistingPresent);
    }
    for (const key of updatedIdsByParent.keys()) {
      if (!canRecomputeParent.has(key)) {
        // Parent group only exists in updated payload (e.g., newly created siblings)
        canRecomputeParent.set(key, true);
      }
    }

    const counters = new Map<string, number>();
    const realItemsWithPositions = realItemsWithDerivedParents.map((u: any) => {
      const key = parentKeyOf(u?.parentEventId);
      if (!canRecomputeParent.get(key)) return u;

      const nextPos = counters.get(key) ?? 0;
      counters.set(key, nextPos + 1);

      // Avoid churn if already correct
      if ((u as any).position === nextPos) return u;
      return { ...u, position: nextPos };
    });
    
    if (realItems.length < updatedItems.length) {
      console.log('[executeBatchUpdate] 🔧 过滤掉 ghost events:', {
        原始数量: updatedItems.length,
        过滤后: realItems.length,
        过滤掉: updatedItems.length - realItems.length,
        ghost列表: updatedItems.filter(item => (item as any)._isDeleted).map(item => ({
          id: item.id?.slice(-8),
          title: item.title?.simpleTitle?.substring(0, 20)
        }))
      });
    }
    
    // 🆕 v1.5 批处理器架构 + 透传模式
    const actions = {
      delete: [] as string[],    // 待删除的 IDs
      save: [] as Event[],        // 待保存的 Events
      sync: [] as Event[],        // 需要同步到 Calendar 的 Events
    };
    
    // ===== 阶段 1: 跨行删除检测 =====
    const currentItemIds = items.map(i => i.id);
    const updatedItemIds = realItemsWithDerivedParents.map((i: any) => i.id);
    const crossDeletedIds = currentItemIds.filter(id => !updatedItemIds.includes(id));
    
    console.log('[executeBatchUpdate] 🗑️ 跨行删除检测:', {
      当前事件数: currentItemIds.length,
      更新后事件数: updatedItemIds.length,
      删除数量: crossDeletedIds.length,
      当前IDs: currentItemIds.map(id => id.slice(-8)),
      更新后IDs: updatedItemIds.map(id => id.slice(-8)),
      删除IDs: crossDeletedIds.map(id => id.slice(-8))
    });
    
    // 🔥 v2.20.0: 如果 realItems 为空，跳过跨行删除检测
    // PlanSlate 会通过 onDeleteRequest 单独处理删除，这里不应该误判
    if (crossDeletedIds.length > 0 && realItems.length > 0) {
      actions.delete.push(...crossDeletedIds);
      dbg('plan', `📋 收集跨行删除动作: ${crossDeletedIds.length} 个`);
    } else if (crossDeletedIds.length > 0 && realItems.length === 0) {
      console.log('[executeBatchUpdate] ⏭️ 跳过跨行删除（realItems为空，可能是placeholder过滤）');
    }
    
    // ===== 阶段 2: 内容处理（更新、空白删除） =====
    realItemsWithPositions.forEach((updatedItem: any) => {
      const existingItem = itemsMap[updatedItem.id];
      
      // 🔧 v1.5: 直接使用 updatedItem（包含完整字段，无需合并）
      // Slate 通过 metadata 透传了所有业务字段
      
      // 🔥 FIX: 使用统一的isEmpty检测函数
      const isEmpty = isEmptyEvent(updatedItem);
      
      // 空 event 处理
      if (isEmpty) {
        if (existingItem) {
          actions.delete.push(updatedItem.id);
          dbg('plan', `📋 收集空白删除动作: ${updatedItem.id}`);
        }
        return; // 新空白行跳过
      }
      
      // 变更检测
      const isChanged = detectChanges(updatedItem, existingItem);
      
      // 🐛 Bulletpoint 调试：检查 eventlog 字段
      if (isChanged && updatedItem.eventlog) {
        const eventlogData = typeof updatedItem.eventlog === 'object' 
          ? updatedItem.eventlog 
          : { slateJson: updatedItem.eventlog, html: updatedItem.eventlog, plainText: updatedItem.eventlog };
        
        console.log('[PlanManager Bullet Debug] eventlog 内容:', {
          eventId: updatedItem.id?.slice(-8),
          eventlogType: typeof updatedItem.eventlog,
          isObject: typeof updatedItem.eventlog === 'object',
          slateJsonLength: eventlogData.slateJson?.length || 0,
          htmlLength: eventlogData.html?.length || 0,
          hasBulletAttr: eventlogData.slateJson?.includes('"bullet"') || eventlogData.html?.includes('data-bullet="true"'),
          slateJsonPreview: eventlogData.slateJson?.substring(0, 200),
          htmlPreview: eventlogData.html?.substring(0, 200)
        });
      }
      
      if (isChanged) {
        // 🆕 v1.8: 从标签中提取 calendarIds
        const calendarIds = extractCalendarIds(updatedItem.tags || []);
        
        // 🔧 v2.9: 构建完整的Event对象
        const eventItem = buildEventForSave(updatedItem, existingItem, calendarIds);
        
        actions.save.push(eventItem);
        
        // 判断是否需要同步到 Calendar
        const hasAnyTime = !!(eventItem.startTime || eventItem.endTime || eventItem.dueDateTime);
        if (hasAnyTime) {
          actions.sync.push(eventItem);
        }
      }
    });
    
    // ===== 阶段 3: 批量执行动作 =====
    // 3.1 批量删除（使用统一接口）
    if (actions.delete.length > 0) {
      deleteItems(actions.delete, 'batch-update-empty-items');
    }
    
    // 3.2 批量保存（使用 EventHub）
    if (actions.save.length > 0) {
      dbg('plan', `💾 执行批量保存: ${actions.save.length} 个`, { 
        titles: actions.save.map(e => e.title) 
      });
      // 🔍 v1.8: 调试 eventlog 字段
      for (const item of actions.save) {
        console.log('[PlanManager] 准备保存到 EventService:', {
          id: item.id,
          title: item.title?.simpleTitle?.substring(0, 20) || '',
          hasEventlog: !!(item as any).eventlog,
          hasDescription: !!item.description,
          eventlogLength: ((item as any).eventlog || '').length,
          descriptionLength: (item.description || '').length,
          calendarIds: (item as any).calendarIds, // 🆕 v1.8: 显示 calendarIds
          tags: item.tags,
          startTime: item.startTime, // 🔍 显示时间字段(来自 serialization.ts → TimeHub)
          endTime: item.endTime,
        });
        
        // ✅ 使用 EventHub 保存
        try {
          // 🔧 FIX: 只使用完整ID进行精确匹配
          // itemsMap 的 key 应该始终是完整 event ID
          const existingItem = itemsMap[item.id];
          
          // 🔥 [CRITICAL FIX] 检查数据库中是否已存在（Tab 的异步 IIFE 可能已创建）
          // 避免在失焦时重复创建事件导致数据异常
          let shouldCreate = !existingItem;
          if (!existingItem && !item.id.startsWith('line-')) {
            const dbEvent = await EventService.getEventById(item.id);
            if (dbEvent) {
              shouldCreate = false;
              console.log('[PlanManager] 📍 Event exists in DB but not in itemsMap:', {
                eventId: item.id.slice(-8),
                willUpdate: true,
                source: 'Tab async creation'
              });
            }
          }
          
          if (shouldCreate) {
            console.log('[PlanManager] 🆕 Creating new event:', item.id.slice(-8));
            await EventHub.createEvent(item);
          } else {
            // 🔍 DEBUG: Check what existingItem actually has
            if (existingItem) {
              console.log('[PlanManager] 🔍 existingItem EventTree fields:', {
                id: existingItem.id.slice(-8),
                hasParentEventId: 'parentEventId' in existingItem,
                parentEventIdValue: (existingItem as any).parentEventId,
                hasChildEventIds: 'childEventIds' in existingItem,
                childEventIdsValue: (existingItem as any).childEventIds,
                keys: Object.keys(existingItem).filter(k => k.includes('Event') || k.includes('child') || k.includes('parent'))
              });
            }
            
            // ✅ FIX: serialization 现在包含 EventTree 字段（从 Slate metadata 读取）
            // Tab 键同时更新 metadata 和数据库，onChange 读取 metadata 并保存
            console.log('[PlanManager] ♻️ Updating with EventTree from serialization:', {
              id: item.id.slice(-8),
              fullId: item.id,
              idLength: item.id.length,
              parentEventId: (item as any).parentEventId,
              parentEventIdLength: (item as any).parentEventId?.length,
              childEventIds: (item as any).childEventIds,
              title: item.title?.simpleTitle?.substring(0, 20),
              fromDB: !existingItem
            });
            
            // 🔥 [CRITICAL FIX] 清除无效的 parentEventId
            // 1. bulletLevel === 0 的顶级事件不应该有父事件 (更精准!)
            // 2. 验证 parentEventId 是否存在于数据库
            if ((item as any).parentEventId) {
              const bulletLevel = (item as any).bulletLevel ?? 0;
              
              if (bulletLevel === 0) {
                // 顶级事件不应该有父事件
                console.warn('[PlanManager] ⚠️ Level 0 event should not have parent, clearing parentEventId:', {
                  childId: item.id.slice(-8),
                  bulletLevel: 0,
                  invalidParentId: (item as any).parentEventId,
                  reason: 'Top-level event'
                });
                delete (item as any).parentEventId;
              } else {
                // 非顶级事件,验证父事件是否存在
                const parentExists = await EventService.getEventById((item as any).parentEventId);
                if (!parentExists) {
                  console.warn('[PlanManager] ⚠️ Parent event does not exist, clearing parentEventId:', {
                    childId: item.id.slice(-8),
                    bulletLevel,
                    invalidParentId: (item as any).parentEventId,
                    reason: 'Parent not found in DB'
                  });
                  delete (item as any).parentEventId;
                }
              }
            }
            
            // 🔍 DEBUG: 检查 item 包含的所有字段
            console.log('[PlanManager] 🔍 更新字段详情:', {
              eventId: item.id.slice(-8),
              allKeys: Object.keys(item),
              title: item.title,
              titleKeys: item.title ? Object.keys(item.title) : [],
              parentEventId: (item as any).parentEventId,
              bulletLevel: (item as any).bulletLevel,
              position: (item as any).position,
              hasContent: !!item.content,
              hasDescription: !!item.description
            });
            
            await EventHub.updateFields(item.id, item, { source: 'PlanManager' });
            
            // 🆕 v2.17: 不再需要 EventIdPool.markAsUsed()，UUID 无需标记
          }
        } catch (error) {
          console.error('[executeBatchUpdate] 保存失败:', item.id, error);
        }
      }
    }
    
    // 🆕 v1.8: 移除批量同步到 Calendar（因为 onSave 已经触发同步）
    // ActionBasedSyncManager 会根据 calendarIds 和 syncStatus 自动同步
    // 不再需要显式调用 syncToUnifiedTimeline
    
    // 📊 执行摘要
    if (actions.delete.length > 0 || actions.save.length > 0) {
      dbg('plan', `✅ 批处理完成 (v1.5 透传架构 + 防抖)`, {
        deleted: actions.delete.length,
        saved: actions.save.length,
      });
    }
  }, [items, itemsMap]);

  // 🆕 定期清理空的 pendingEmptyItems（超过5分钟未填充内容的空行）
  useEffect(() => {
    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      setPendingEmptyItems(prev => {
        const next = new Map(prev);
        let cleanedCount = 0;
        
        for (const [id, item] of prev.entries()) {
          // 🔥 FIX: 使用统一的isEmpty检测，包括eventlog检查
          const isEmpty = isEmptyEvent(item);
          
          // 检查创建时间是否超过5分钟
          const createdTime = new Date(item.createdAt || 0).getTime();
          const isOld = now - createdTime > 5 * 60 * 1000; // 5分钟
          
          if (isEmpty && isOld) {
            next.delete(id);
            cleanedCount++;
          }
        }
        
        if (cleanedCount > 0) {
          dbg('plan', '🧹 清理过期空行', { cleanedCount, remainingCount: next.size });
        }
        
        return next;
      });
    }, 60000); // 每分钟检查一次
    
    return () => clearInterval(cleanupTimer);
  }, []);

  // 🆕 v1.8: 立即状态同步（不防抖）- 用于更新 UI 状态
  const immediateStateSync = useCallback((updatedItems: any[]) => {
    // 🎯 目标：立即更新 pendingEmptyItems，让勾选框立即显示
    // 不执行保存操作，只更新本地状态
    
    updatedItems.forEach((updatedItem: any) => {
      const existingItem = itemsMap[updatedItem.id];
      
      // 🔥 FIX: 使用统一的isEmpty检测，包括eventlog检查
      const isEmpty = isEmptyEvent(updatedItem);
      
      if (isEmpty && !existingItem) {
        // 新空白行：立即添加到 pendingEmptyItems
        const now = new Date();
        const nowLocal = formatTimeForStorage(now);
        
        const newPendingItem: Event = {
          id: updatedItem.id,
          title: '',
          content: updatedItem.content || '',
          description: updatedItem.description || '',
          eventlog: updatedItem.eventlog, // 🆕 v1.8: 保留富文本描述
          tags: updatedItem.tags || [],
          // ⚠️ level 字段已废弃，层级由 bulletLevel 动态计算
          priority: 'medium',
          isCompleted: false,
          type: 'todo',
          isPlan: true,
          isTask: true,
          isTimeCalendar: false,
          fourDNoteSource: true,
          startTime: '',
          endTime: '',
          isAllDay: false,
          createdAt: nowLocal,
          updatedAt: nowLocal,
          source: 'local',
          syncStatus: 'local-only',
        } as Event;
        
        setPendingEmptyItems(prev => new Map(prev).set(updatedItem.id, newPendingItem));
      }
    });
  }, [itemsMap]);

  // 🆕 v1.5: 智能防抖处理函数（用于批量保存）
  // ⚡️ [OPTIMIZATION] 检测父子关系变更时跳过防抖，立即保存
  const debouncedOnChange = useCallback((updatedItems: any[]) => {
    // ✅ 立即同步状态（不等待防抖）
    immediateStateSync(updatedItems);
    
    // ⚡️ [SMART DEBOUNCE] 检测是否有父子关系变更
    const hasParentChildChange = updatedItems.some(item => 
      item.parentEventId !== undefined || 
      item.childEventIds !== undefined
    );
    
    if (hasParentChildChange) {
      // 🚀 关键操作：立即保存，跳过防抖
      console.log('[PlanManager] ⚡️ 检测到父子关系变更，立即保存（跳过防抖）', {
        itemsCount: updatedItems.length,
        timestamp: new Date().toISOString()
      });
      
      // 清除之前的定时器
      if (onChangeTimerRef.current) {
        clearTimeout(onChangeTimerRef.current);
      }
      
      // 立即执行批处理逻辑
      executeBatchUpdate(updatedItems);
      
      // 清空缓存
      pendingUpdatedItemsRef.current = null;
      onChangeTimerRef.current = null;
      
      return; // 提前返回，不设置定时器
    }
    
    // 普通编辑：走防抖逻辑
    // 清除之前的定时器
    if (onChangeTimerRef.current) {
      clearTimeout(onChangeTimerRef.current);
    }
    
    // 保存最新的 updatedItems
    pendingUpdatedItemsRef.current = updatedItems;
    
    // 设置新的定时器（300ms 后执行保存操作）
    onChangeTimerRef.current = setTimeout(() => {
      const itemsToProcess = pendingUpdatedItemsRef.current;
      if (!itemsToProcess) return;
      
      // 执行批处理逻辑
      executeBatchUpdate(itemsToProcess);
      
      // 清空缓存
      pendingUpdatedItemsRef.current = null;
      onChangeTimerRef.current = null;
    }, 300);
  }, [immediateStateSync, executeBatchUpdate]);
  
  // ✅ v2.21.1: 添加onChange防抖的清理函数（防御性编程）
  useEffect(() => {
    return () => {
      if (onChangeTimerRef.current) {
        clearTimeout(onChangeTimerRef.current);
        onChangeTimerRef.current = null;
      }
    };
  }, []);

  // 🆕 生成事件变更快照 (带缓存)
  const snapshotCacheRef = useRef<{ snapshot: any, timestamp: number, dateRangeKey: string } | null>(null);
  
  const generateEventSnapshot = useCallback(async () => {
    if (!session.filter.dateRange) {
      return {
        created: 0, updated: 0, completed: 0, deleted: 0, details: []
      };
    }
    
    try {
      // 从EventHistoryService获取指定时间范围的历史记录
      const startTimeStr = formatTimeForStorage(session.filter.dateRange.start);
      const endTimeStr = formatTimeForStorage(session.filter.dateRange.end);
      const dateRangeKey = `${startTimeStr}-${endTimeStr}`;
      
      // 🚀 检查缓存 (3秒内有效)
      if (snapshotCacheRef.current && 
          snapshotCacheRef.current.dateRangeKey === dateRangeKey &&
          Date.now() - snapshotCacheRef.current.timestamp < 3000) {
        return snapshotCacheRef.current.snapshot;
      }
      
      console.log('[PlanManager] 生成 Snapshot:', {
        dateRange: {
          start: startTimeStr,
          end: endTimeStr
        },
        snapshotVersion: session.snapshotVersion
      });
      
      // 使用 EventHistoryService 的新方法获取结构化的操作摘要
      const summary = await EventHistoryService.getEventOperationsSummary(
        startTimeStr,
        endTimeStr
      );
      
      const result = {
        created: summary.created.length,
        updated: summary.updated.length,
        completed: summary.completed.length,
        deleted: summary.deleted.length,
        details: [...summary.created, ...summary.updated, ...summary.completed, ...summary.deleted]
      };
      
      console.log('[PlanManager] Snapshot 统计:', result);
      
      // 🚀 缓存结果
      snapshotCacheRef.current = {
        snapshot: result,
        timestamp: Date.now(),
        dateRangeKey
      };
      
      return result;
    } catch (error) {
      console.warn('[PlanManager] EventHistoryService not available, using fallback', error);
      return {
        created: 0, updated: 0, completed: 0, deleted: 0, details: []
      };
    }
  }, [session.filter.dateRange, session.snapshotVersion]); // 添加 snapshotVersion 依赖
  
  // 🆕 过滤后的事件列表
  const filteredItems = useMemo(() => {
    let result = [...items, ...Array.from(pendingEmptyItems.values())];
    
    // 应用标签隐藏过滤
    if (session.filter.hiddenTags.size > 0) {
      result = result.filter(item => {
        const itemTags = item.tags || [];
        return !itemTags.some(tag => session.filter.hiddenTags.has(tag));
      });
    }
    
    // 🔧 移除日期范围过滤 - 显示所有事件，状态竖线根据选定时间段显示活动状态
    // 日期范围仅用于计算事件状态竖线，不用于过滤事件显示
    
    // 应用搜索过滤
    if (session.filter.searchQuery.trim()) {
      const query = session.filter.searchQuery.toLowerCase();
      result = result.filter(item => 
        item.title?.simpleTitle?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.content?.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [items, pendingEmptyItems, session.filter.hiddenTags, session.filter.dateRange, session.filter.searchQuery]);
  
  // 将 Event[] 转换为 FreeFormLine<Event>[]
  // ✅ 重构: 直接准备 Event[] 给 PlanSlate，移除 FreeFormLine 中间层
  // 🆕 Snapshot 模式：添加已删除的事件
  const [editorItems, setEditorItems] = useState<Event[]>([]);
  
  useEffect(() => {
    const computeEditorItems = async () => {
      let allItems = filteredItems;
      
      // 🚨 诊断：检查 filteredItems 是否包含 ghost 事件
      const ghostsInFiltered = filteredItems.filter((item: any) => item._isDeleted);
      if (ghostsInFiltered.length > 0) {
        console.error('[PlanManager] 🚨 filteredItems 中发现', ghostsInFiltered.length, '个 ghost 事件！', 
          ghostsInFiltered.map((item: any) => ({
            id: item.id?.slice(-8),
            title: item.title?.simpleTitle?.substring(0, 20) || item.content?.substring(0, 20),
            _isDeleted: item._isDeleted,
            _deletedAt: item._deletedAt ? new Date(item._deletedAt).toLocaleString() : 'N/A'
          }))
        );
      }
      
      // ✅ Snapshot 模式：最简单的逻辑
      // 1. startDateTime 时刻存在的所有事件（基准状态）
      // 2. startDateTime 到 endDateTime 期间的所有操作（显示变化）
      if (session.filter.dateRange) {
        const startTime = formatTimeForStorage(session.filter.dateRange.start);
        const endTime = formatTimeForStorage(session.filter.dateRange.end);
        
        // 1️⃣ 获取起点时刻的所有事件
        const existingAtStart = await EventHistoryService.getExistingEventsAtTime(startTime);
        console.log('[PlanManager] 📊 Snapshot 时间范围:', {
          起点: new Date(startTime).toLocaleString(),
          终点: new Date(endTime).toLocaleString(),
          起点存在事件数: existingAtStart.size
        });
        
        // 3️⃣ 查询时间范围内的所有操作
        const operations = await EventHistoryService.queryHistory({
          startTime,
          endTime
        });
        console.log('[PlanManager] 📝 时间范围内操作:', operations.length, '条');
      
      // 4️⃣ 查找范围内创建的事件
      const createdInRange = new Set(
        operations
          .filter(op => op.operation === 'create' && op.eventId)
          .map(op => op.eventId)
      );
      console.log('[PlanManager] 🆕 范围内创建:', createdInRange.size, '个');
      
      // 2️⃣ 筛选出应该显示的事件：在起点存在 OR 在范围内创建
      // 🔥 FIX: Snapshot模式应该从items（所有事件）开始，不是filteredItems（已被常规过滤）
      allItems = items.filter(item => {
        // 检查是否在时间范围内
        const inRange = existingAtStart.has(item.id) || createdInRange.has(item.id);
        if (!inRange) return false;
        
        // 🆕 额外检查：过滤掉空白事件（标题和 eventlog 都为空）
        const titleObj = item.title;
        const hasTitle = item.content || 
                        (typeof titleObj === 'string' ? titleObj : 
                         (titleObj && (titleObj.simpleTitle || titleObj.fullTitle || titleObj.colorTitle)));
        
        const eventlogField = (item as any).eventlog;
        let hasEventlog = false;
        
        if (eventlogField) {
          if (typeof eventlogField === 'string') {
            hasEventlog = eventlogField.trim().length > 0;
          } else if (typeof eventlogField === 'object' && eventlogField !== null) {
            // 检查slateJson是否有实际文本内容
            if (eventlogField.slateJson) {
              try {
                const slateNodes = JSON.parse(eventlogField.slateJson);
                hasEventlog = slateNodes.some((node: any) => {
                  const children = node.children || [];
                  return children.some((child: any) => child.text && child.text.trim() !== '');
                });
              } catch (e) {
                hasEventlog = false;
              }
            }
            // 如果slateJson没有内容，检查plainText
            if (!hasEventlog && eventlogField.plainText) {
              hasEventlog = !!eventlogField.plainText.trim();
            }
          }
        }
        
        // 标题和 eventlog 都为空时过滤掉
        if (!hasTitle && !hasEventlog) {
          console.log('[PlanManager] ⏭️ Snapshot 模式跳过空白事件:', item.id.slice(-8));
          return false;
        }
        
        return true;
      });
      console.log('[PlanManager] ✅ 应显示事件数（起点存在+范围内创建，已过滤空白）:', allItems.length, '个');
      
      // 5️⃣ 添加范围内删除的事件为 ghost
      const deleteOpsInRange = operations.filter(op => op.operation === 'delete' && op.before && op.eventId);
      console.log('[PlanManager] 🗑️ 范围内删除操作:', deleteOpsInRange.length, '条');
      
      // 过滤：在起点存在 OR 在范围内创建
      const deletedInRange = deleteOpsInRange.filter(op => 
        op.eventId && (existingAtStart.has(op.eventId) || createdInRange.has(op.eventId))
      );
      console.log('[PlanManager] 🎯 其中在起点存在或范围内创建的:', deletedInRange.length, '条');
      
      deletedInRange.forEach(log => {
        // 防御性检查：确保 log.eventId 和 log.before 存在
        if (!log.eventId || !log.before) {
          console.warn('[PlanManager] ⚠️ 跳过无效的删除记录:', log);
          return;
        }
        
        // 🎯 步骤 1: checkType 过滤（必须有有效的 checkType 且不为 'none'）
        if (!log.before.checkType || log.before.checkType === 'none') {
          console.log('[PlanManager] ⏭️ 跳过 checkType 无效 ghost:', log.eventId.slice(-8));
          return;
        }
        
        // 🎯 步骤 2: 业务类型过滤（空白事件 - 标题和eventlog都为空）
        // 2.1 检查标题内容
        const titleObj = log.before.title;
        const hasTitle = log.before.content || 
                        (typeof titleObj === 'string' ? titleObj : 
                         (titleObj && (titleObj.simpleTitle || titleObj.fullTitle)));
        
        // 2.2 检查 eventlog 内容
        const eventlogField = log.before.eventlog;
        let hasEventlog = false;
        
        if (eventlogField) {
          if (typeof eventlogField === 'string') {
            // 字符串格式：去除空白后检查是否有内容
            hasEventlog = eventlogField.trim().length > 0;
          } else if (typeof eventlogField === 'object' && eventlogField !== null) {
            // EventLog 对象格式：检查 slateJson 是否有实际文本内容
            if (eventlogField.slateJson) {
              try {
                const slateNodes = JSON.parse(eventlogField.slateJson);
                hasEventlog = slateNodes.some((node: any) => {
                  const children = node.children || [];
                  return children.some((child: any) => child.text && child.text.trim() !== '');
                });
              } catch (e) {
                hasEventlog = false;
              }
            }
            // 如果slateJson没有内容，检查plainText
            if (!hasEventlog && eventlogField.plainText) {
              hasEventlog = !!eventlogField.plainText.trim();
            }
          }
        }
        
        // 只有标题和eventlog都为空时才跳过
        if (!hasTitle && !hasEventlog) {
          console.log('[PlanManager] ⏭️ 跳过完全空白 ghost (无标题且无eventlog):', log.eventId.slice(-8));
          return;
        }
        
        // 🎯 步骤 3: 系统事件过滤（使用 EventService 辅助方法）
        if (log.before && log.before.id && EventService.isSubordinateEvent(log.before as Event)) {
          console.log('[PlanManager] ⏭️ 跳过系统事件 ghost:', log.eventId.slice(-8));
          return;
        }
        
        // 🎯 步骤 4: 标签过滤（应用 hiddenTags）
        if (session.filter.hiddenTags.size > 0) {
          const itemTags = log.before.tags || [];
          if (itemTags.some(tag => session.filter.hiddenTags.has(tag))) {
            console.log('[PlanManager] ⏭️ 跳过隐藏标签的 ghost:', log.eventId.slice(-8), 'tags:', itemTags);
            return;
          }
        }
        
        console.log('[PlanManager] 👻 添加 ghost:', {
          eventId: log.eventId.slice(-8),
          title: log.before.title,
          hasTitle,
          hasEventlog,
          eventlogType: typeof log.before.eventlog,
          删除于: new Date(log.timestamp).toLocaleString()
        });
        allItems.push({
          ...log.before,
          _isDeleted: true,
          _deletedAt: log.timestamp
        } as any);
      });
      
      // 记录被跳过的删除操作
      const skippedDeletes = deleteOpsInRange.filter(op => 
        op.eventId && !existingAtStart.has(op.eventId) && !createdInRange.has(op.eventId)
      );
      if (skippedDeletes.length > 0) {
        console.log('[PlanManager] ⏭️ 跳过（不在起点也不在范围内创建）:', skippedDeletes.length, '条', 
          skippedDeletes.map(op => `${op.eventId?.slice(-8) || 'unknown'}-${op.before?.title?.simpleTitle?.substring(0, 15) || 'no title'}`));
      }
      
      console.log('[PlanManager] 📊 Snapshot 完成：最终', allItems.length, '个事件', `(${allItems.filter((i: any) => i._isDeleted).length} ghost)`);
    }
    
    // 🔥 Snapshot 模式：重新计算 bulletLevel 并按 EventTree 结构排序
    // 原因：position 字段不触发历史记录，snapshot 中的 position 可能过期
    let result: Event[];
    
    if (session.filter.dateRange) {
      // 1️⃣ 重新计算所有事件的 bulletLevel（从 EventTree 关系推导）
      const bulletLevels = EventService.calculateAllBulletLevels(allItems);
      
      console.log('[PlanManager] 🔍 Snapshot 重新计算 bulletLevel:', {
        事件总数: allItems.length,
        计算结果数量: bulletLevels.size,
        示例: Array.from(bulletLevels.entries()).slice(0, 5).map(([id, level]) => ({
          id: id.slice(-8),
          level
        }))
      });
      
      // 2️⃣ 附加计算出的 bulletLevel 到事件对象
      const eventsWithLevels = allItems.map(event => ({
        ...event,
        bulletLevel: bulletLevels.get(event.id!) || 0
      })) as Event[];

      // 3️⃣ 按照层级结构排序（DFS，与正常模式一致）
      // ADR-001: 结构真相来自 parentEventId；避免直接用 childEventIds 遍历
      result = EventTreeAPI.toDFSList(eventsWithLevels);
      console.log('[PlanManager] ✅ Snapshot 排序完成:', result.length, '个事件');
    } else {
      // 🔥 正常模式：直接使用 allItems（即 filteredItems）
      // items 数组在初始化时已经按照 EventTree 结构排序（DFS），无需再次排序
      // filteredItems 只是过滤操作（标签、搜索），不会改变顺序
      result = allItems.filter(item => item.id);
      console.log('[PlanManager] ✅ 正常模式：使用已排序的 items，共', result.length, '个事件');
    }
    
      // 🚨 DIAGNOSIS: 检测 editorItems 异常
      if (result.length === 0 && items.length > 0) {
        console.error('🔴 [诊断] editorItems 为空但 items 有数据！', {
          items数量: items.length,
          pendingEmptyItems数量: pendingEmptyItems.size,
          allItems数量: allItems.length,
          过滤后数量: result.length,
          items示例: items.slice(0, 3).map(i => ({ id: i.id, title: i.title?.simpleTitle?.substring(0, 20) || '' }))
        });
      }
      
      // 🔍 调试：检查 result 的顺序（前10个）
      console.log('[PlanManager] 🎯 setEditorItems 调用前，result 前10个:', 
        result.slice(0, 10).map((e, idx) => ({
          index: idx,
          id: e.id?.slice(-8),
          title: e.title?.simpleTitle?.slice(0, 30),
          bulletLevel: e.bulletLevel
        }))
      );
      
      setEditorItems(result);
    };
    
    computeEditorItems().catch(error => {
      console.error('[PlanManager] ❌ computeEditorItems failed:', error);
      setEditorItems(filteredItems);
    });
  }, [filteredItems, session.filter.dateRange, session.filter.hiddenTags, items, pendingEmptyItems]);

  // 🆕 状态配置映射函数
  const getStatusConfig = useCallback((status?: string) => {
    switch (status) {
      case 'new':
        return { label: 'New', color: '#3B82F6' };
      case 'done':
        return { label: 'Done', color: '#10B981' };
      case 'updated':
        return { label: 'Updated', color: '#F59E0B' };
      case 'missed':
        return { label: 'Missed', color: '#EF4444' };
      case 'deleted':
        return { label: 'Del', color: '#9CA3AF' };
      default:
        return null;
    }
  }, []);

  // 🆕 获取事件的所有状态（支持多状态）- ⚠️ 异步版本
  const getEventStatuses = useCallback(async (eventId: string): Promise<Array<'new' | 'updated' | 'done' | 'missed' | 'deleted'>> => {
    if (!session.filter.dateRange) return [];
    
    const currentDateRange = session.filter.dateRange;
    
    try {
      // 🔧 首先检查是否是 ghost 事件（Snapshot 模式下显示为已删除）
      // 必须从 editorItems 查找，因为 ghost 事件只存在于 editorItems 中
      const ghostEvent = editorItems.find((item: any) => item.id === eventId && item._isDeleted);
      const isGhost = !!ghostEvent;
      
      if (isGhost) {
        console.log(`[getEventStatuses] 👻 ${eventId.slice(-8)}: Ghost事件，将添加deleted状态（同时查询其他状态）`);
      }
      
      const startTime = formatTimeForStorage(currentDateRange.start);
      const endTime = formatTimeForStorage(currentDateRange.end);
      
      // ✅ 已修复：使用 await 正确处理异步调用
      const eventTitle = eventId.substring(0, 15);
      
      console.log(`[getEventStatuses] 🔍 ${eventTitle} 查询状态（异步版本）:`, {
        事件ID: eventId
      });
      
      // 查询历史记录（已经按时间范围过滤）- ✅ 添加 await
      const history = await EventHistoryService.queryHistory({ 
        eventId, 
        startTime, 
        endTime 
      });
      
      console.log(`[getEventStatuses] 📊 ${eventTitle} 历史记录 (${startTime} ~ ${endTime}):`, {
        历史记录数: history.length,
        记录详情: history.map(log => ({
          时间: log.timestamp,
          操作: log.operation,
          完整metadata: log.metadata, // 🔍 显示完整 metadata
          action: log.metadata?.action,
          changes: log.changes?.slice(0, 5) // 只显示前5个 changes，避免太长
        }))
      });
      
      // 收集所有独特的状态
      const statuses = new Set<'new' | 'updated' | 'done' | 'missed' | 'deleted'>();
      
      // 🆕 如果是 Ghost 事件，先添加 deleted 状态（即使没有历史记录）
      if (isGhost) {
        statuses.add('deleted');
        console.log(`[getEventStatuses]   ✅ ${eventTitle}: 添加 DELETED 状态（Ghost事件，优先添加）`);
      }
      
      if (!history || history.length === 0) {
        console.log(`[getEventStatuses] ❌ ${eventTitle}: 无历史记录${isGhost ? '（但已添加deleted状态）' : ''}`);
        return Array.from(statuses); // 返回已有的状态（可能包含 deleted）
      }
      const rangeStart = new Date(startTime);
      const rangeEnd = new Date(endTime);
      
      // TODO: getCheckInStatus 是异步的，需要重构
      // 暂时跳过签到状态检查
      const isCurrentlyChecked = false;
      
      // 遍历历史记录（这些记录已经被 queryHistory 按时间范围过滤过了）
      history.forEach(log => {
        const logTime = new Date(log.timestamp);
        
        console.log(`[getEventStatuses]   - ${eventTitle}: ${log.operation} at ${log.timestamp}`, {
          在范围内: logTime >= rangeStart && logTime <= rangeEnd,
          action: log.metadata?.action
        });
        
        switch (log.operation) {
          case 'create':
            statuses.add('new');
            console.log(`[getEventStatuses]   ✅ ${eventTitle}: 添加 NEW 状态`);
            break;
          case 'update':
            statuses.add('updated');
            console.log(`[getEventStatuses]   ✅ ${eventTitle}: 添加 UPDATED 状态`);
            break;
          case 'delete':
            statuses.add('deleted');
            console.log(`[getEventStatuses]   ✅ ${eventTitle}: 添加 DELETED 状态`);
            break;
          case 'checkin':
            // 不在这里判断，等循环结束后根据最后一次操作判断
            break;
        }
      });
      
      // ✅ 根据当前勾选状态决定是否添加 Done 状态
      if (isCurrentlyChecked) {
        statuses.add('done');
        console.log(`[getEventStatuses]   ✅ ${eventTitle}: 添加 DONE 状态（当前已勾选）`);
      } else {
        console.log(`[getEventStatuses]   ⏭️ ${eventTitle}: 不添加 DONE（当前未勾选）`);
      }
      
      // 🆕 Ghost 事件确保有 deleted 状态（再次确认，防止遗漏）
      if (isGhost && !statuses.has('deleted')) {
        statuses.add('deleted');
        console.log(`[getEventStatuses]   ✅ ${eventTitle}: 补充添加 DELETED 状态（Ghost事件）`);
      }
      
      // TODO: 判断 missed 状态需要事件详情，暂时跳过
      // 🔧 判断 "missed" 状态：事件时间已过（取当前时间和范围结束时间的较早者），且在范围内没有完成
      // if (event && event.startTime) {
      //   ...
      // }
      
      const result = Array.from(statuses);
      console.log(`[getEventStatuses] ✅ ${eventTitle}: 最终状态 = ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.error('[getEventStatuses] ❌ 错误:', error);
      return [];
    }
  }, [session.filter.dateRange, items]);

  // 🆕 计算状态竖线段 - 支持多状态显示 - ✅ 改用 useEffect + useState 处理异步
  const [statusLineSegments, setStatusLineSegments] = useState<StatusLineSegment[]>([]);
  const [eventStatusMap, setEventStatusMap] = useState<Map<string, 'new' | 'updated' | 'done' | 'missed' | 'deleted' | undefined>>(new Map());
  
  useEffect(() => {
    // 异步计算 segments 和 statusMap
    const computeSegments = async () => {
      const segments: StatusLineSegment[] = [];
      const statusMap = new Map<string, 'new' | 'updated' | 'done' | 'missed' | 'deleted' | undefined>();
      
      // console.log('[PlanManager] 📊 开始生成segments (异步版本):', {
      //   dateRange: dateRange ? {
      //     start: formatTimeForStorage(dateRange.start),
      //     end: formatTimeForStorage(dateRange.end)
      //   } : null,
      //   editorItems数量: editorItems.length,
      //   前3个: editorItems.slice(0, 3).map((item, idx) => ({
      //     index: idx,
      //     id: item.id?.substring(0, 10),
      //     title: item.title?.simpleTitle?.substring(0, 20) || ''
      //   }))
      // });
      
      // 并行查询所有事件的状态（性能优化）
      const statusPromises = editorItems.map(async (item, index) => {
        if (!item.id) return { index, eventId: '', statuses: [] };
        
        const eventStatuses = await getEventStatuses(item.id);
        
        // console.log(`[PlanManager] Event[${index}] ${item.title?.simpleTitle?.substring(0, 20) || ''}: ${eventStatuses.length}个状态 ${JSON.stringify(eventStatuses)}`);
        
        return { index, eventId: item.id, statuses: eventStatuses };
      });
      
      const results = await Promise.all(statusPromises);
      
      // 为每个状态创建一个segment，同时填充 statusMap
      results.forEach(({ index, eventId, statuses }) => {
        if (eventId) {
          // 存储第一个状态到 map（用于 PlanSlate 渲染）
          statusMap.set(eventId, statuses[0] || undefined);
        }
        
        statuses.forEach(status => {
          const statusConfig = getStatusConfig(status);
          if (statusConfig) {
            segments.push({
              startIndex: index,
              endIndex: index,
              status: status,
              label: statusConfig.label
            });
          }
        });
      });
      
      // console.log('[PlanManager] 📊 生成segments详情:', {
      //   总数: segments.length,
      //   详细列表: segments.map(s => ({
      //     index: s.startIndex,
      //     status: s.status,
      //     label: s.label
      //   })),
      //   deleted数量: segments.filter(s => s.status === 'deleted').length,
      //   deleted详情: segments.filter(s => s.status === 'deleted').map(s => ({
      //     index: s.startIndex,
      //     eventId: editorItems[s.startIndex]?.id?.slice(-10),
      //     title: editorItems[s.startIndex]?.title?.simpleTitle?.substring(0, 20)
      //   }))
      // });
      
      setStatusLineSegments(segments);
      setEventStatusMap(statusMap);
    };
    
    computeSegments();
  }, [editorItems, getEventStatuses, getStatusConfig, session.filter.dateRange]);

  // 处理编辑器内容变化
  const handleLinesChange = async (newLines: FreeFormLine<Event>[]) => {
    // 🔧 性能优化：只更新真正变化的 item
    const changedItems: Event[] = [];
    const unchangedItemIds = new Set<string>();
    
    // 记录新顺序中每个 title 行的 itemId 顺序
    const orderedItemIds: string[] = [];

    // 按 item id 分组（title + description），同时保留顺序
    const itemGroups = new Map<string, { title?: FreeFormLine<Event>, description?: FreeFormLine<Event> }>();

    newLines.forEach((line) => {
      if (!line.id) return;
      const itemId = line.id.includes('-desc') ? line.id.replace('-desc', '') : line.id;
      const isDescription = line.id.includes('-desc') || (line.data as any)?.mode === 'eventlog';

      if (!itemGroups.has(itemId)) {
        itemGroups.set(itemId, {});
        // 第一次遇到某个 itemId 的 title 行时，记录其顺序
        if (!isDescription) orderedItemIds.push(itemId);
      }

      const group = itemGroups.get(itemId)!;
      if (isDescription) {
        group.description = line;
      } else {
        group.title = line;
      }
    });

    // 删除检测：找出被移除的标题行对应的 itemId
    const currentItemIds = items.map(i => i.id);
    const pendingItemIds = Array.from(pendingEmptyItems.keys());
    const allCurrentIds = [...currentItemIds, ...pendingItemIds];
    
    const newItemIds = Array.from(itemGroups.keys());
    const deletedIds = allCurrentIds.filter(id => !newItemIds.includes(id));
    
    for (const id of deletedIds) {
      // 从 pendingEmptyItems 中移除
      setPendingEmptyItems(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      // 如果在 items 中，也调用 deleteItems
      if (currentItemIds.includes(id)) {
        await deleteItems([id], 'delete-menu-action');
      }
    }

    // 保存/更新每个 item（带 position）
    itemGroups.forEach((group, itemId) => {
      const titleLine = group.title;
      const descLine = group.description;
      if (!titleLine) return;

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = titleLine.content;
      const tagElements = tempDiv.querySelectorAll('.inline-tag');
      const extractedTags: string[] = [];
      tagElements.forEach(tagEl => {
        const tagId = tagEl.getAttribute('data-tag-id');
        if (tagId) extractedTags.push(tagId);
        tagEl.remove();
      });
      const plainText = tempDiv.textContent || '';

      // 计算 position（按本次 newLines 的顺序）
      const position = orderedItemIds.indexOf(itemId);

      if (titleLine.data) {
        // 更新现有item
        const hasContent = plainText.trim() || descLine?.content?.trim();
        
        const updatedItem: Event = {
          ...(titleLine.data as any),
          id: (titleLine.data as any)?.id ?? itemId,
          title: { simpleTitle: hasContent ? plainText : '' }, // ✅ 只传 simpleTitle，让 normalizeTitle 自动填充
          content: titleLine.content,
          tags: extractedTags,
          level: titleLine.level,
          mode: (descLine ? 'description' : 'title') as 'title' | 'description',
          description: descLine?.content || undefined,
          ...(Number.isFinite(position) ? { position } : {}),
        } as any;
        
        // 🔧 变更检测：只更新真正变化的字段
        const existingItem = itemsMap[itemId];
        const isContentChanged = !existingItem || 
          existingItem.title !== updatedItem.title ||
          existingItem.content !== updatedItem.content ||
          existingItem.description !== updatedItem.description ||
          existingItem.mode !== updatedItem.mode ||
          JSON.stringify(existingItem.tags) !== JSON.stringify(updatedItem.tags);
        
        // ✅ position 变化时也需要保存（自动被 EventHistoryService 忽略）
        const isPositionChanged = existingItem && (existingItem as any).position !== (updatedItem as any).position;
        
        if (isContentChanged || isPositionChanged) {
          changedItems.push(updatedItem);
        } else {
          unchangedItemIds.add(itemId);
        }
        
        // 🆕 如果这是一个之前为空、现在有内容的item
        const wasPending = pendingEmptyItems.has(itemId);
        if (wasPending && hasContent) {
          // 从 pendingEmptyItems 移除
          setPendingEmptyItems(prev => {
            const next = new Map(prev);
            next.delete(itemId);
            return next;
          });
        } else if (wasPending && !hasContent) {
          // 还是空的，保持在 pendingEmptyItems
          setPendingEmptyItems(prev => new Map(prev).set(itemId, updatedItem));
        }
      } else {
        // 🔧 新行：可能是空行（刚点击graytext）或有内容的新item
        const hasContent = plainText.trim() || descLine?.content?.trim();
        const wasPending = pendingEmptyItems.has(titleLine.id);
        
        const now = new Date();
        const nowLocal = formatTimeForStorage(now);
        
        const newItem: Event = {
          id: titleLine.id,
          title: { simpleTitle: hasContent ? (plainText || '(无标题)') : '' }, // ✅ 只传 simpleTitle
          content: titleLine.content,
          tags: extractedTags,
          priority: 'medium',
          isCompleted: false,
          type: 'todo',
          level: titleLine.level,
          mode: descLine ? 'description' : 'title',
          description: descLine?.content || undefined,
          ...(Number.isFinite(position) ? { position } : {}),
          // 🆕 Plan 页面创建的 item 配置：
          isPlan: true, // ✅ 显示在 Plan 页面
          isTask: true, // ✅ 标记为待办事项
          isTimeCalendar: false, // ✅ 不是 TimeCalendar 创建的事件
          fourDNoteSource: true, // ✅ 标识事件来源（用于同步识别）
          checkType: 'once', // 🆕 默认单次签到（显示 checkbox）
          // ✅ 默认不设置时间，用户通过 FloatingBar 或 @chrono 自行定义
          startTime: '', // ✅ 空字符串表示无时间
          endTime: '',   // ✅ 空字符串表示无时间
          dueDateTime: undefined, // ✅ 不预设截止日期/时间
          isAllDay: false,
          createdAt: nowLocal, // ✅ 使用 timeUtils 格式化，避免时区问题
          updatedAt: nowLocal,
          source: 'local',
          syncStatus: 'local-only',
        } as any;
        
        // 🔧 新建 item 也加入 changedItems
        changedItems.push(newItem);
        
        if (wasPending && hasContent) {
          // 🔥 从 pending 转为正式：移除 pending，添加到 changedItems
          setPendingEmptyItems(prev => {
            const next = new Map(prev);
            next.delete(titleLine.id);
            return next;
          });
          dbg('plan', '✅ 空行有内容，从 pending 转为正式事件', { id: titleLine.id, title: newItem.title?.simpleTitle?.substring(0, 20) || '' });
        } else if (wasPending && !hasContent) {
          // 🔧 仍然是空行：更新 pending 中的数据但不转为正式
          setPendingEmptyItems(prev => new Map(prev).set(titleLine.id, newItem));
          dbg('plan', '📝 更新空行 pending 数据', { id: titleLine.id });
        } else if (!wasPending && hasContent) {
          // 🆕 直接创建有内容的新 item（比如粘贴文本）
          dbg('plan', '🚀 直接创建有内容的新事件', { id: titleLine.id, title: newItem.title?.simpleTitle?.substring(0, 20) || '' });
        } else {
          // ⚠️ 这种情况理论上不应该发生，因为用户激活时已经创建了 pending
          dbg('plan', '⚠️ 意外情况：新空行但未在 pending 中', { id: titleLine.id });
          setPendingEmptyItems(prev => new Map(prev).set(titleLine.id, newItem));
        }
      }
    });
    
    // 🔧 批量更新：只更新真正变化的 item
    if (changedItems.length > 0) {
      // 🔥 [FIX] 立即更新本地 items 状态，避免时间插入时找不到事件
      const newItems = changedItems.filter(item => !items.some(existing => existing.id === item.id));
      if (newItems.length > 0) {
        setItems(prev => [...prev, ...newItems]);
        dbg('plan', '🆕 立即添加新事件到本地状态', { newItemIds: newItems.map(i => i.id) });
      }
      
      // 批量保存（使用 EventHub）
      for (const item of changedItems) {
        try {
          const existingItem = itemsMap[item.id];
          if (!existingItem) {
            await EventHub.createEvent(item);
          } else {
            await EventHub.updateFields(item.id, item, { source: 'PlanManager' });
          }
        } catch (error) {
          console.error('[handleBatchUpdateWithNewIds] 保存失败:', item.id, error);
        }
      }
      
      // 批量同步到日历
      changedItems.forEach(item => {
        syncToUnifiedTimeline(item);
      });
    }
  };

  // 将 Event 转换为 Event（用于 EventEditModal）
  const convertPlanItemToEvent = (item: Event): Event => {
    // 清理描述中的内联HTML（如标签/日期）
    const sanitize = (html?: string): string => {
      if (!html) return '';
      const div = document.createElement('div');
      div.innerHTML = html;
      div.querySelectorAll('.inline-tag, .inline-date').forEach(el => el.remove());
      return div.textContent || '';
    };
    const mappedTags = (item.tags || []).map(t => {
      const tag = TagService.getFlatTags().find(x => x.id === t || x.name === t);
      return tag ? tag.id : t;
    });
    
    // 🆕 v1.8: 从标签中提取 calendarIds
    const calendarIds = mappedTags
      .map((tagId: string) => {
        const tag = TagService.getFlatTags().find(t => t.id === tagId);
        return tag?.calendarMapping?.calendarId;
      })
      .filter((id: string | undefined): id is string => !!id);
    
    return {
      id: item.id || generateEventId(),
      title: item.title,
      description: item.notes || sanitize(item.description || item.content || ''),
      startTime: item.startTime || item.dueDateTime || '', // 🔧 没有时间的任务保持为空字符串
      endTime: item.endTime || item.dueDateTime || '', // 🔧 没有时间的任务保持为空字符串
      location: '', // Event 没有 location 字段，保留空值
      isAllDay: !item.startTime && !!item.dueDateTime,
      tags: mappedTags,
      calendarIds: item.calendarIds || (calendarIds.length > 0 ? calendarIds : undefined), // 🔧 优先保留已有值，否则使用标签映射
      todoListIds: item.todoListIds, // 🔧 保留 To Do Lists 映射
      source: 'local',
      syncStatus: calendarIds.length > 0 ? 'pending' : 'local-only', // 🆕 v1.8: 根据日历映射设置同步状态
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
      fourDNoteSource: true,
      // 🆕 保留 eventlog 字段（EventEditModalV2 需要）
      eventlog: item.eventlog,
      // 🆕 保留日历同步配置（Plan vs Actual）
      planSyncConfig: item.planSyncConfig,
      actualSyncConfig: item.actualSyncConfig,
      // 🆕 保留父子事件关系 + EventTree 关系字段
      parentEventId: item.parentEventId,
      childEventIds: (item as any).childEventIds,
      linkedEventIds: (item as any).linkedEventIds,
      backlinks: (item as any).backlinks,

    } as Event;
  };

  // 将 HTML 内容清洗为纯文本（移除标签/日期等内联元素的HTML）
  const sanitizeHtmlToPlainText = (html?: string): string => {
    if (!html) return '';
    const container = document.createElement('div');
    container.innerHTML = html;
    // 移除我们内联的标签/日期标记，保留其文本（若有）
    container.querySelectorAll('.inline-tag, .inline-date').forEach(el => el.remove());
    return container.textContent || '';
  };

  // 同步到UnifiedTimeline
  const syncToUnifiedTimeline = (item: Event) => {
    // 🔍 诊断：强制输出日志（不经过 dbg 检查）
    console.log('%c[🔴 SYNC] syncToUnifiedTimeline 被调用', 'color: red; font-size: 16px; font-weight: bold', {
      itemId: item.id,
      eventId: item.id,
      startTime: item.startTime,
      endTime: item.endTime,
      dueDateTime: item.dueDateTime,
      调用栈: new Error().stack?.split('\n').slice(1, 5).join('\n')
    });
    
    // � 使用统一时间管理接口
    const eventTime = getEventTime(item.id, {
      start: item.startTime || null,
      end: item.endTime || null,
      dueDate: item.dueDateTime || null,
      isAllDay: item.isAllDay,
      timeSpec: (item as any).timeSpec,
    });
    
    const finalStartTime = eventTime.start || '';
    const finalEndTime = eventTime.end || '';
    // 🔄 优先使用 item.isTask（已经在 onSave 中自动设置），避免重新计算覆盖
    const isTask = item.isTask !== undefined ? item.isTask : isTaskByTime(eventTime);

    // 🆕 v1.8: 根据标签映射到日历分组
    const tagIds = (item.tags || []).map(t => {
      // 如果是有效的ID，直接返回；否则尝试按名称映射
      const tag = TagService.getFlatTags().find(x => x.id === t || x.name === t);
      return tag ? tag.id : t;
    });
    
    // 从标签中提取 calendarIds
    const calendarIds = tagIds
      .map(tagId => {
        const tag = TagService.getFlatTags().find(t => t.id === tagId);
        return tag?.calendarMapping?.calendarId;
      })
      .filter((id): id is string => !!id); // 过滤掉 undefined
    
    console.log('[syncToUnifiedTimeline] 标签到日历映射:', {
      itemId: item.id,
      tags: tagIds,
      calendarIds,
      hasCalendarMapping: calendarIds.length > 0
    });
    
    const event: Event = {
      id: item.id || generateEventId(),
      title: (() => {
        // 🔧 处理 item.title 可能是字符串或 EventTitle 对象的情况
        const titleText = typeof item.title === 'string' ? item.title : (item.title?.simpleTitle || '');
        const fullTitle = `${item.emoji || ''}${titleText}`.trim();
        return { simpleTitle: fullTitle, fullTitle: undefined, colorTitle: undefined };
      })(),
      // 避免在描述中出现一堆 HTML，将其清洗为纯文本
      description: sanitizeHtmlToPlainText(item.description || item.content || item.notes || ''),
      // ✅ v1.8: 修复空字符串处理 - 转换为 undefined
      startTime: finalStartTime || undefined,
      endTime: finalEndTime || undefined,
      // 全天：显式勾选优先；否则当起止为同一天且均为 00:00 视为全天
      isAllDay: (() => {
        if (item.isAllDay) return true;
        if (finalStartTime && finalEndTime) {
          // parseLocalTimeString 已在文件顶部导入
          const s = parseLocalTimeString(finalStartTime);
          const e = parseLocalTimeString(finalEndTime);
          const bothMidnight = s.getHours() === 0 && s.getMinutes() === 0 && e.getHours() === 0 && e.getMinutes() === 0;
          const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
          return bothMidnight && sameDay;
        }
        return false;
      })(),
      tags: tagIds,
      calendarIds: calendarIds.length > 0 ? calendarIds : item.calendarIds, // 🆕 v1.8: 优先使用标签映射，否则保留原有值
      todoListIds: item.todoListIds, // 🔧 保留 To Do Lists 映射
      source: 'local',
      syncStatus: calendarIds.length > 0 ? 'pending' : 'local-only', // 🆕 v1.8: 有日历映射时标记为待同步（但不立即同步，由 ActionBasedSyncManager 统一处理）
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
      isTask: isTask,
      checkType: item.checkType || 'once', // 🆕 Plan事件默认有checkbox
      fourDNoteSource: true,
    };

    console.log('[syncToUnifiedTimeline] 准备保存事件到 EventService:', {
      eventId: event.id,
      title: event.title,
      calendarIds: event.calendarIds,
      todoListIds: event.todoListIds, // 🔍 添加 todoListIds 调试
      syncStatus: event.syncStatus,
      willTriggerSync: event.syncStatus === 'pending'
    });

    // 检查事件是否已存在于 EventService，决定调用 create 还是 update
    const existingEvent = EventService.getEventById(event.id);
    
    if (existingEvent) {
      // 事件已存在 → 更新
      if (onUpdateEvent) {
        onUpdateEvent(event.id, event);
      }
    } else {
      // 事件不存在 → 创建
      if (onCreateEvent) {
        onCreateEvent(event);
      }
    }
  };

  const getTypeIcon = (item: Event) => {
    // 根据时间字段判断图标
    const hasStart = !!item.startTime;
    const hasEnd = !!item.endTime;
    
    if (item.isAllDay || (hasStart && hasEnd)) {
      return '📅'; // event
    } else if (hasStart || hasEnd || item.dueDate) {
      return '📋'; // task
    }
    return ''; // 无时间
  };

  // 🔄 v2.8.3: 渲染逻辑已迁移到 PlanSlate 内部
  // PlanManager 不再直接渲染 Checkbox、Emoji、TimeDisplay 等
  // 这些渲染由 EventLinePrefix 和 EventLineSuffix 组件处理

  // 渲染内容样式（不需要自己实现 contentEditable，只提供样式）
  const getContentStyle = (item: Event) => ({
    color: item.color || '#111827',
    textDecoration: item.isCompleted ? 'line-through' : 'none',
    opacity: item.isCompleted ? 0.6 : 1,
  });

  return (
    <div className={`plan-manager-container ${!isPanelVisible ? 'panel-hidden' : ''}`}>
      {/* 左侧面板 - 内容选取 */}
      <ContentSelectionPanel
        pageType="plan"
        isPanelVisible={isPanelVisible}
        onPanelVisibilityChange={onPanelVisibilityChange}
        dateRange={session.filter.dateRange}
        snapshot={generateEventSnapshot()}
        tags={TagService.getFlatTags()}
        hiddenTags={session.filter.hiddenTags}
        onFilterChange={(filter) => {
          sessionActions.setActiveFilter(filter);
          console.log('[PlanManager] 切换过滤模式:', filter);
        }}
        onSearchChange={(query) => {
          sessionActions.setSearchQuery(query);
          console.log('[PlanManager] 搜索查询:', query);
        }}
        onDateSelect={(date) => {
          // 选择单个日期时，设置为该日期的范围
          const dayStart = new Date(date);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(date);
          dayEnd.setHours(23, 59, 59, 999);
          sessionActions.setDateRange({ start: dayStart, end: dayEnd });
          console.log('[PlanManager] 选择日期:', date);
        }}
        onDateRangeChange={(start, end) => {
          // 如果传入 null，则退出 snapshot 模式
          if (start === null || end === null) {
            // 🔥 [FIX] 退出 snapshot 前，强制保存所有待处理的编辑
            if (onChangeTimerRef.current) {
              clearTimeout(onChangeTimerRef.current);
              onChangeTimerRef.current = null;
            }
            
            if (pendingUpdatedItemsRef.current) {
              console.log('[PlanManager] 🔧 退出 snapshot 前保存待处理编辑:', pendingUpdatedItemsRef.current.length, '个');
              executeBatchUpdate(pendingUpdatedItemsRef.current);
              pendingUpdatedItemsRef.current = null;
            }
            
            sessionActions.setDateRange(null as any);
            console.log('[PlanManager] 退出 snapshot 模式');
            return;
          }
          // 标准化时间：start 设为 00:00:00，end 设为 23:59:59
          const normalizedStart = new Date(start);
          normalizedStart.setHours(0, 0, 0, 0);
          const normalizedEnd = new Date(end);
          normalizedEnd.setHours(23, 59, 59, 999);
          sessionActions.setDateRange({ start: normalizedStart, end: normalizedEnd });
          console.log('[PlanManager] 日期范围变更:', { start: normalizedStart, end: normalizedEnd });
        }}
        onTagVisibilityChange={(tagId, visible) => {
          sessionActions.toggleHiddenTag(tagId);
          console.log('[PlanManager] 标签可见性变更:', { tagId, visible });
        }}
      />

      {/* 中间主内容区 - 计划清单 */}
      <div className="plan-manager">
        {/* 内联样式 */}
        <style>{`
          .plan-list-scroll-container {
            flex: 1;
            overflow-y: auto;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE/Edge */
            min-height: 0;
            padding: 0;
          }
          
          .plan-list-scroll-container::-webkit-scrollbar {
            display: none; /* Chrome/Safari/Opera */
          }
        `}</style>

      <div className="section-header">
        <div className="title-indicator"></div>
        <h3>计划清单</h3>
      </div>

      <div className="plan-list-scroll-container" ref={editorContainerRef}>
        <StatusLineContainer 
          segments={statusLineSegments}
          editorItems={editorItems}
          lineHeight={32}
          totalLines={editorItems.length}
        >
          <PlanSlate
            key={session.filter.dateRange ? `snapshot-${session.filter.dateRange.start.getTime()}-${session.filter.dateRange.end.getTime()}` : 'normal'}
            items={editorItems}
            onChange={debouncedOnChange}
            eventStatusMap={eventStatusMap}
          onFocus={(lineId) => {
            // ✅ 重构: 使用 sessionActions.setFocus 原子更新
            const isDescMode = lineId.includes('-desc');
            const baseId = lineId.replace('-desc', '');
            const matchedItem = editorItems.find(item => item.id === baseId);
            
            sessionActions.setFocus(lineId, {
              mode: isDescMode ? 'description' : 'title',
              isTask: matchedItem?.isTask || false
            });
            
            if (!matchedItem) {
              // 🆕 用户激活新行时，立即创建 pendingEmptyItems
              const existsInPending = pendingEmptyItems.has(baseId);
              const existsInItems = items.some(item => item.id === baseId);
              
              if (!existsInPending && !existsInItems) {
                const now = new Date();
                const nowLocal = formatTimeForStorage(now);
                
                const newPendingItem: Event = {
                  id: baseId,
                  title: { simpleTitle: '' }, // ✅ 只传 simpleTitle
                  content: '',
                  description: '',
                  tags: [],
                  level: 0,
                  priority: 'medium',
                  isCompleted: false,
                  type: 'todo',
                  isPlan: true,
                  isTask: true,
                  isTimeCalendar: false,
                  fourDNoteSource: true,
                  startTime: '',
                  endTime: '',
                  isAllDay: false,
                  createdAt: nowLocal,
                  updatedAt: nowLocal,
                  source: 'local',
                  syncStatus: 'pending', // 🔧 改为 'pending' 以启用 Outlook 同步
                } as Event;
                
                setPendingEmptyItems(prev => new Map(prev).set(baseId, newPendingItem));
                dbg('plan', '🆕 用户激活新行，创建 pendingEmptyItems', { lineId: baseId });
              }
            }
          }}
          onEditorReady={(editorApi) => {
            // 🆕 保存完整的 PlanSlate API
            (unifiedEditorRef as any).editorApi = editorApi;
            unifiedEditorRef.current = editorApi.getEditor();
          }}
          onDeleteRequest={(lineId) => {
            // 🆕 v1.6: 使用统一删除接口
            deleteItems([lineId.replace('-desc', '')], 'user-backspace-delete');
          }}
          onSave={(eventId, updates) => {
            // 🆕 保存事件更新
            const existingEvent = EventService.getEventById(eventId);
            if (existingEvent) {
              const updatedEvent = { ...existingEvent, ...updates };
              if (onUpdateEvent) {
                onUpdateEvent(eventId, updatedEvent);
              }
            }
          }}
          onTimeClick={(eventId, anchor) => {
            // 🆕 时间点击 - 打开 UnifiedDateTimePicker
            dbg('ui', '🖱️ 点击右侧时间区域，打开 UnifiedDateTimePicker', { eventId });
            dateAnchorRef.current = anchor;
            pickerTargetItemIdRef.current = eventId;
            setShowUnifiedPicker(true);
          }}
          onMoreClick={(eventId) => {
            // 🆕 More 图标点击 - 打开 EventEditModal
            // 🔧 FIX: 不再从 editorItems 获取数据，直接使用 eventId
            // EventEditModalV2 会从 EventHub/EventService 获取完整数据
            console.log('🔍 [PlanManager.onMoreClick] 被调用:', {
              eventId,
              eventId_type: typeof eventId,
              eventId_length: eventId?.length,
              eventId_preview: eventId?.slice(-8)
            });
            setSelectedItemId(eventId);
            console.log('✅ [PlanManager.onMoreClick] selectedItemId 已设置为:', eventId);
          }}
        />
        </StatusLineContainer>
      </div>

      {/* 右侧编辑面板 - 使用 EventEditModalV2 */}
      {(() => {
        // console.log('🎨 [PlanManager] 渲染 EventEditModalV2 条件检查:', {
        //   selectedItemId,
        //   selectedItemId_type: typeof selectedItemId,
        //   selectedItemId_truthy: !!selectedItemId,
        //   will_render: !!selectedItemId
        // });
        return selectedItemId && (
          <EventEditModalV2
            eventId={selectedItemId}
            isOpen={true}
          onClose={() => {
            setSelectedItemId(null);
          }}
          onSave={async (updatedEvent) => {
            // 🔍 调试：检查 todoListIds 是否被正确传递
            console.log('🔍 [PlanManager] EventEditModalV2 onSave:', {
              updatedEvent_todoListIds: updatedEvent.todoListIds,
              updatedEvent_calendarIds: updatedEvent.calendarIds,
              updatedEvent_id: updatedEvent.id
            });
            
            // 🔄 从 EventService 读取最新数据（EventEditModal 已经保存过了）
            // 避免使用旧数据覆盖最新数据
            const latestEvent = await EventService.getEventById(selectedItemId);
            if (!latestEvent) {
              console.error('[PlanManager] 无法找到事件:', selectedItemId);
              setSelectedItemId(null);
              return;
            }
            
            console.log('🔍 [PlanManager] 从 EventService 读取最新数据:', {
              id: latestEvent.id,
              updatedAt: latestEvent.updatedAt,
              tags: latestEvent.tags,
              eventlogType: typeof latestEvent.eventlog,
              eventlogHasPlainText: typeof latestEvent.eventlog === 'object' && latestEvent.eventlog !== null ? !!latestEvent.eventlog.plainText : false,
              eventlogPlainTextLength: typeof latestEvent.eventlog === 'object' && latestEvent.eventlog !== null ? latestEvent.eventlog.plainText?.length || 0 : 0,
              eventlogPlainTextPreview: typeof latestEvent.eventlog === 'object' && latestEvent.eventlog !== null ? latestEvent.eventlog.plainText?.substring(0, 50) : 'N/A'
            });
            
            // ✅ 只需要触发 syncToUnifiedTimeline（如果需要的话）
            // EventEditModal 已经通过 EventHub 保存，PlanManager 会通过 eventsUpdated 事件自动更新
            syncToUnifiedTimeline(latestEvent);
            
            // 🔄 手动更新 items 数组（绕过 eventsUpdated 去重检查）
            // 原因：EventEditModal 保存触发的 eventsUpdated 事件被 isLocalUpdate 拦截
            // 必须手动刷新 UI 以显示最新的 tags、eventlog 等字段
            setItems(prev => {
              const updated = prev.map((e: Event) => e.id === latestEvent.id ? latestEvent : e);
              const oldEvent = prev.find((e: Event) => e.id === latestEvent.id);
              console.log('🔄 [PlanManager] items 数组更新对比:', {
                eventId: latestEvent.id.slice(-10),
                oldEventlogType: typeof oldEvent?.eventlog,
                newEventlogType: typeof latestEvent.eventlog,
                changed: oldEvent !== latestEvent,
                arrayChanged: prev !== updated
              });
              return updated;
            });
            console.log('🔄 [PlanManager] 手动更新 items 数组，避免去重拦截');
            
            setSelectedItemId(null);
          }}
          onDelete={(eventId) => {
            deleteItems([eventId], 'user-manual-delete');
            setSelectedItemId(null);
          }}
          hierarchicalTags={existingTags}
          globalTimer={null} // PlanManager 不使用 Timer
        />
      );
      })()}

      {/* 🔧 [已删除] Emoji Picker - EventEditModalV2 已经内置 emoji 选择器，PlanManager 不需要独立的 emoji picker */}
      {/* {showEmojiPicker && ...} */}

      {/* Headless FloatingToolbar V3 - 支持双模式 */}
      <HeadlessFloatingToolbar
        position={floatingToolbar.position}
        mode={floatingToolbar.mode}
        config={toolbarConfig}
        activePickerIndex={activePickerIndex}
        onActivePickerIndexConsumed={() => setActivePickerIndex(null)} // 🔑 立即重置
        onSubPickerStateChange={(isOpen) => setIsSubPickerOpen(isOpen)} // 🔑 追踪子选择器状态
        eventId={session.focus.lineId ? (() => {
          const actualItemId = session.focus.lineId.replace('-desc','');
          // 🔧 [FIX] 先在 items 中查找，再检查 pendingEmptyItems
          const item = items.find(i => i.id === actualItemId) || pendingEmptyItems.get(actualItemId);
          return item?.id;
        })() : undefined}
        useTimeHub={true}
        editorMode={session.focus.mode === 'description' ? 'eventlog' : session.focus.mode}
        slateEditorRef={unifiedEditorRef}
        onRequestClose={() => {
          // 🆕 Picker 关闭时自动关闭整个 FloatingBar
          console.log('%c[PlanManager] onRequestClose 被调用', 'background: #E91E63; color: white;');
          setActivePickerIndex(null); // 🔧 重置 activePickerIndex
          floatingToolbar.hideToolbar();
        }}
        onTimeApplied={async (startIso, endIso) => {
          dbg('picker', '📌 HeadlessFloatingToolbar.onTimeApplied 被调用', { 
            startIso, 
            endIso, 
            focusedLineId: session.focus.lineId,
            对应的eventId: session.focus.lineId ? (() => {
              const actualItemId = session.focus.lineId.replace('-desc','');
              const item = items.find(i => i.id === actualItemId) || pendingEmptyItems.get(actualItemId);
              return item?.id;
            })() : undefined
          });
          
          const targetId = session.focus.lineId || '';
          if (!targetId) {
            warn('picker', '⚠️ onTimeApplied: 没有 focusedLineId，跳过');
            return;
          }
          
          const actualItemId = targetId.replace('-desc','');
          let item = items.find(i => i.id === actualItemId);

          // 🔧 [FIX] 如果在 items 中找不到，检查 pendingEmptyItems（新创建的事件）
          if (!item) {
            item = pendingEmptyItems.get(actualItemId);
            if (item) {
              dbg('picker', '✅ 在 pendingEmptyItems 中找到新创建的事件', { actualItemId, itemTitle: item.title });
            }
          }

          if (!item) {
            warn('picker', '⚠️ onTimeApplied: 找不到对应的 item', { 
              targetId, 
              actualItemId, 
              itemsCount: items.length, 
              pendingCount: pendingEmptyItems.size,
              availableItemIds: items.slice(0, 5).map(i => i.id), // 显示前5个ID用于调试
              availablePendingIds: Array.from(pendingEmptyItems.keys()).slice(0, 5)
            });
            return;
          }

          try {
            // 🎯 使用统一时间管理接口
            // 🔧 v2.9: 不要用 endIso || startIso，允许 undefined
            const updatedTime = await setEventTime(item.id, {
              start: startIso,
              end: endIso,  // ✅ 允许 undefined
              isAllDay: false,
            });
            
            dbg('picker', '✅ 时间更新成功（TimeHub + EventService 已同步）', { 
              eventId: item.id,
              ...updatedTime,
            });
            
            // 🔧 v2.9: TimeHub 已经更新了 EventService，不需要再次调用 onSave
            // 只需要触发 Slate 同步即可
            // 🆕 更新 item 的时间字段（保持 metadata 同步）
            const updatedItem: Event = {
              ...item,
              startTime: updatedTime.start || undefined,
              endTime: updatedTime.end || undefined,  // ✅ 允许 undefined
              isAllDay: updatedTime.isAllDay,
              timeSpec: updatedTime.timeSpec,
            } as Event;
            
            // 🔧 v2.9: 不调用 onSave，避免重复更新 EventService
            // TimeHub.setEventTime 已经调用了 EventService.updateEvent
            // 只需要触发 Slate 重新渲染（通过 eventsUpdated 事件已自动触发）
            
            // 同步到日历（如果有时间）
            if (updatedTime.start) {
              syncToUnifiedTimeline(updatedItem);
            }
          } catch (err) {
            error('picker', '❌ 时间更新失败', { error: err });
          }
        }}
        onTextFormat={handleTextFormat}
        onTagSelect={(tagIds: string[]) => {
          // 🔧 v2.10: TagPicker 已通过 slateEditorRef 直接插入标签
          // 这里只需要更新 selectedTags 状态即可
          console.log('[PlanManager] onTagSelect 被调用（仅更新状态）', { tagIds });
          
          currentSelectedTagsRef.current = tagIds;
          sessionActions.updateFocusTags(tagIds);
        }}
        onEmojiSelect={(emoji: string) => {
          // 🆕 使用 PlanSlate 的 helper 函数
          const editor = unifiedEditorRef.current;
          const editorApi = (unifiedEditorRef as any).editorApi;
          if (!editor || !editorApi || !session.focus.lineId) return;
          
          const success = insertEmoji(editor, emoji);
          if (success) {
            console.log(`[✅ Emoji 插入成功] ${emoji}`);
            // 🔥 立即保存变更（v2.21.1: 移除不可靠的setTimeout延迟）
            editorApi.flushPendingChanges();
          }
        }}
        onDateRangeSelect={(start: Date, end: Date) => {
          // 🆕 使用 PlanSlate 的 helper 函数插入 DateMention
          const editor = unifiedEditorRef.current;
          const editorApi = (unifiedEditorRef as any).editorApi;
          if (!editor || !editorApi || !session.focus.lineId) {
            console.warn('[onDateRangeSelect] 没有编辑器或焦点行');
            return;
          }
          
          const actualItemId = session.focus.lineId.replace('-desc', '');
          const item = items.find(i => i.id === actualItemId);
          if (!item) {
            console.warn('[onDateRangeSelect] 找不到对应的 item');
            return;
          }
          
          const isDescriptionMode = session.focus.mode === 'description';
          const startIso = formatTimeForStorage(start);
          const endIso = end && end.getTime() !== start.getTime() ? formatTimeForStorage(end) : undefined;
          
          // 使用 helper 函数插入 DateMention（传入 eventId 用于 TimeHub 同步）
          const success = insertDateMention(
            editor,
            startIso,
            endIso,
            isDescriptionMode,
            item.id  // 🔥 传入 eventId，让 DateMention 能通过 TimeHub 同步
          );
          
          if (success) {
            console.log(`[✅ DateMention 插入成功] ${item.id}`);
            // 🔥 立即保存变更（v2.21.1: 移除不可靠的setTimeout延迟）
            editorApi.flushPendingChanges();
          }
        }}
        onPrioritySelect={(priority: 'low' | 'medium' | 'high' | 'urgent') => {

        }}
        onColorSelect={(color: string) => {

        }}
        availableTags={existingTags}
        currentTags={session.focus.selectedTags}
        currentIsTask={session.focus.isTask}
        onTaskToggle={async (isTask: boolean) => {
          // 🆕 切换任务状态
          if (session.focus.lineId && session.focus.mode === 'title') {
            const actualItemId = session.focus.lineId.replace('-desc', '');
            const item = items.find(i => i.id === actualItemId);
            if (item) {
              const updatedItem: Event = {
                ...item,
                isTask,
              };
              // ✅ 使用 EventHub 保存
              try {
                await EventHub.updateFields(updatedItem.id, updatedItem, { source: 'PlanManager' });
                sessionActions.setFocus(session.focus.lineId!, { isTask }); // 更新本地状态
              } catch (error) {
                console.error('[add_task] 保存失败:', error);
              }
            }
          }
        }}
      />
      
      {/* 统一日期时间选择器 - 键盘快捷键 Ctrl+; 呼出 */}
      {dateAnchorRef.current && (
        <Tippy
          visible={showUnifiedPicker}
          reference={dateAnchorRef.current}
          getReferenceClientRect={() => {
            if (caretRectRef.current) return caretRectRef.current;
            try {
              return dateAnchorRef.current?.getBoundingClientRect?.() || new DOMRect(0, 0, 0, 0);
            } catch {
              return new DOMRect(0, 0, 0, 0);
            }
          }}
          placement="bottom-start"
          interactive={true}
          arrow={false}
          offset={[0, 8]}
          appendTo={() => document.body}
          maxWidth="none"
          className="unified-picker-tippy"
          popperOptions={{ modifiers: [{ name: 'hide', enabled: false }] }}
          theme="light"
          onClickOutside={() => {
            setShowUnifiedPicker(false);
            if (dateAnchorRef.current) {
              const el = dateAnchorRef.current;
              if (el.classList && el.classList.contains('temp-picker-anchor')) {
                el.remove();
              }
              dateAnchorRef.current = null;
            }
            caretRectRef.current = null;
          }}
          content={
            <div style={{ padding: 0 }}>
              <UnifiedDateTimePicker
                eventId={(() => {
                  const targetId = (pickerTargetItemIdRef.current || session.focus.lineId || '').replace('-desc','');
                  if (!targetId) return undefined;
                  // 🔧 [FIX] 先在 items 中查找，再检查 pendingEmptyItems
                  const item = items.find(i => i.id === targetId) || pendingEmptyItems.get(targetId);
                  return item?.id;
                })()}
                useTimeHub={true}
                initialStart={(items.find(i => i.id === (pickerTargetItemIdRef.current || session.focus.lineId || '').replace('-desc',''))?.startTime) || undefined}
                initialEnd={(items.find(i => i.id === (pickerTargetItemIdRef.current || session.focus.lineId || '').replace('-desc',''))?.endTime) || undefined}
                onApplied={async () => {
                  const targetId = pickerTargetItemIdRef.current || session.focus.lineId || '';
                  if (!targetId) return;
                  const item = items.find(i => i.id === targetId || i.id === targetId.replace('-desc',''));
                  const editableElement = document.querySelector(
                    `[data-line-id="${targetId}"] .ProseMirror`
                  ) as HTMLElement | null;
                  const isDescriptionMode = session.focus.mode === 'description';

                  // ✅ 修复：从 TimeHub 读取最新时间，而不是使用旧的 item 数据
                  if (item) {
                    // 从 TimeHub 获取最新时间
                    const { TimeHub } = await import('../services/TimeHub');
                    const timeSnapshot = TimeHub.getSnapshot(item.id);
                    
                    dbg('ui', '📝 UnifiedDateTimePicker.onApplied - 从 TimeHub 读取最新时间', {
                      itemId: item.id,
                      旧数据: { start: item.startTime, end: item.endTime },
                      TimeHub快照: timeSnapshot,
                    });
                    
                    const updatedItem: Event = {
                      ...item,
                      // ✅ 使用 TimeHub 的最新时间
                      startTime: timeSnapshot?.start || item.startTime,
                      endTime: timeSnapshot?.end || item.endTime,
                      isAllDay: timeSnapshot?.timeSpec?.allDay ?? item.isAllDay,
                      ...(isDescriptionMode
                        ? { description: editableElement?.innerHTML || item.description }
                        : { content: editableElement?.innerHTML || item.content }
                      ),
                    };
                    
                    // 保留 timeSpec
                    if (timeSnapshot?.timeSpec) {
                      (updatedItem as any).timeSpec = timeSnapshot.timeSpec;
                    }
                    
                    dbg('ui', '💾 保存更新后的事件', {
                      itemId: updatedItem.id,
                      最终保存的时间: { start: updatedItem.startTime, end: updatedItem.endTime },
                    });
                    
                    // ✅ 使用 EventHub 保存
                    try {
                      await EventHub.updateFields(updatedItem.id, updatedItem, { source: 'PlanManager' });
                      syncToUnifiedTimeline(updatedItem);
                    } catch (error) {
                      console.error('[UnifiedDateTimePicker] 保存失败:', error);
                    }
                  }
                }}
                onClose={() => {
                  setShowUnifiedPicker(false);
                  if (dateAnchorRef.current) {
                    const el = dateAnchorRef.current;
                    if (el.classList && el.classList.contains('temp-picker-anchor')) {
                      el.remove();
                    }
                    dateAnchorRef.current = null;
                  }
                  caretRectRef.current = null;
                  pickerTargetItemIdRef.current = null;
                }}
              />
            </div>
          }
        />
      )}
      
      {/* 标签替换弹窗 - 点击标签时显示 */}
      {replacingTagElement && (
        <Tippy
          visible={showTagReplace}
          reference={replacingTagElement}
          placement="bottom"
          interactive={true}
          arrow={false}
          offset={[0, 8]}
          appendTo={() => document.body}
          theme="light"
          onClickOutside={() => {
            setShowTagReplace(false);
            setReplacingTagElement(null);
          }}
          content={
            <div
              style={{
                  // 仅保存当前编辑的HTML，时间由 TimeHub 已更新（不插入 📅 mention）
                overflow: 'auto',
              }}
            >
              <div style={{ padding: '8px 12px', fontSize: '13px', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                选择新标签替换
              </div>
              {existingTags.map((tag) => {
                const tagColor = tag.color || '#666';
                const tagEmoji = tag.emoji || '';
                const displayName = tagEmoji ? `${tagEmoji}${tag.name}` : tag.name;
                
                const hexToRgba = (hex: string, alpha: number) => {
                  const r = parseInt(hex.slice(1, 3), 16);
                  const g = parseInt(hex.slice(3, 5), 16);
                  const b = parseInt(hex.slice(5, 7), 16);
                  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                };
                
                return (
                  <div
                    key={tag.id}
                    onClick={async () => {
                      // 替换标签
                      const item = items.find(i => i.id === session.focus.lineId);
                      const editableElement = document.querySelector(
                        `[data-line-id="${session.focus.lineId}"] .ProseMirror`
                      ) as HTMLElement;
                      
                      if (editableElement && editableElement.isContentEditable) {
                        // 更新标签元素的属性和样式
                        replacingTagElement.setAttribute('data-tag-id', tag.id);
                        replacingTagElement.setAttribute('data-tag-name', tag.name);
                        replacingTagElement.style.backgroundColor = hexToRgba(tagColor, 0.15);
                        replacingTagElement.style.color = tagColor;
                        replacingTagElement.textContent = `#${displayName}`;
                        
                        // 保存更新
                        const updatedContent = editableElement.innerHTML;
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = updatedContent;
                        
                        const tagElements = tempDiv.querySelectorAll('.inline-tag');
                        const extractedTags: string[] = [];
                        tagElements.forEach(tagEl => {
                          const tagId = tagEl.getAttribute('data-tag-id');
                          if (tagId) extractedTags.push(tagId);
                          tagEl.remove();
                        });
                        
                        const plainText = tempDiv.textContent || '';
                        
                        if (item) {
                          const updatedItem = {
                            ...item,
                            title: { simpleTitle: plainText }, // ✅ 只传 simpleTitle
                            content: updatedContent,
                            tags: extractedTags,
                          };
                          // ✅ 使用 EventHub 保存
                          try {
                            await EventHub.updateFields(updatedItem.id, updatedItem, { source: 'PlanManager' });
                          } catch (error) {
                            console.error('[标签替换] 保存失败:', error);
                          }
                        }
                      }
                      
                      setShowTagReplace(false);
                      setReplacingTagElement(null);
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background-color 0.15s',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: hexToRgba(tagColor, 0.15),
                        color: tagColor,
                        fontWeight: 600,
                      }}
                    >
                      #{displayName}
                    </span>
                  </div>
                );
              })}
            </div>
          }
        />
      )}
      </div>

      {/* 右侧面板 - 即将到来 */}
      <UpcomingEventsPanel
        onTimeFilterChange={(filter) => {
          console.log('[PlanManager] Time filter changed:', filter);
          // TODO: 根据时间过滤更新右侧面板事件显示
        }}
      />
    </div>
  );
};

export default PlanManager;

