/**
 * LogTab - 标签页中的事件详情页面
 * 
 * 基于 EventEditModalV2 的完整功能，移除弹窗相关代码
 * 
 * ==================== 功能概览 ==
 * 1. 左侧事件标识区（Emoji、标题、标签、任务勾选）
 * 2. Timer 计时按钮交互
 * 3. 计划安排编辑（时间、地点、参会人）
 * 4. 实际进展显示
 * 5. Event Log 富文本编辑（ModalSlate）
 * 
 * ==================== 架构集成 ====================
 * 
 * 数据流向（遵循 EVENTHUB_TIMEHUB_ARCHITECTURE.md）:
 * ```
 * 用户输入
 *   ↓
 * formData（本地状态）
 *   ↓
 * handleSave()
 *   ↓
 * EventHub.createEvent() / EventHub.updateFields()
 *   ↓
 * EventService.createEvent() / EventService.updateEvent()
 *   ↓
 * localStorage 持久化 + BroadcastChannel 同步
 *   ↓
 * eventsUpdated 事件 → TimeCalendar 监听 → UI 刷新
 * ```
 * 
 * 职责分离：
 * - EventEditModal: UI 层，负责表单输入和展示
 * - EventHub: 状态管理层，负责缓存和增量更新
 * - EventService: 持久化层，负责 localStorage 和跨 Tab 同步
 * - TimeHub: 时间管理层（本组件不直接调用，时间字段随事件保存）
 * 
 * 关键原则：
 * 1. ✅ 所有事件操作通过 EventHub（禁止直接调用 EventService）
 * 2. ✅ 增量更新使用 updateFields（避免覆盖其他字段）
 * 3. ✅ 创建 vs 更新：检查 EventService（持久化层）而非 EventHub 缓存
 * 4. ✅ 原子性保存：所有字段一起保存（避免部分保存导致数据不一致）
 * 5. ✅ 时间字段：与其他字段一起保存，不单独调用 TimeHub.setEventTime()
 * 
 * ==================== 数据结构 ====================
 * 
 * MockEvent（formData）:
 * - 非时间字段: title, tags, isTask, location, organizer, attendees, eventlog, description
 * - 时间字段: startTime, endTime, allDay
 * - 元数据: id, parentEventId, isTimer
 * 
 * Event（完整事件）:
 * - 继承 MockEvent 的所有字段
 * - 额外字段: createdAt, updatedAt, syncStatus, fourDNoteSource, calendarIds, todoListIds
 * 
 * eventlog 字段格式兼容：
 * - 旧格式: 字符串（HTML）
 * - 新格式: EventLog 对象 { content: Slate JSON, descriptionPlainText, ... }
 * - ModalSlate 需要: Slate JSON 字符串
 * 
 * ==================== 性能优化 ====================
 * 
 * 1. 条件渲染: !isOpen 时不渲染（减少 DOM 节点）
 * 2. 懒加载: 动态 import EventHub（减少初始包大小）
 * 3. 依赖优化: useEffect 只监听 event?.id（避免频繁更新）
 * 4. 联系人提取: 初始化时自动提取 organizer/attendees 到 ContactService
 * 
 * ==================== 相关文档 ====================
 * 
 * - EVENTHUB_TIMEHUB_ARCHITECTURE.md: 核心架构规范
 * - EVENTEDITMODAL_V2_IMPLEMENTATION.md: 实现细节
 * - EVENT_ARCHITECTURE.md: 旧版架构文档（已归档）
 * 
 * @author Zoey Gong
 * @version 2.0.1
 * @lastModified 2025-11-24
 */

import React, { useState, useCallback, useRef, useEffect, RefObject, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

import { TagService } from '../services/TagService';
import { EventService } from '../services/EventService';
import { EventHub } from '../services/EventHub';
import { ContactService } from '../services/ContactService';
import { EventHistoryService } from '../services/EventHistoryService';
import { Event, Contact, EventTitle } from '../types';
import { HierarchicalTagPicker } from '../components/HierarchicalTagPicker/HierarchicalTagPicker';
import UnifiedDateTimePicker from '../components/FloatingToolbar/pickers/UnifiedDateTimePicker';
import { AttendeeDisplay } from '../components/common/AttendeeDisplay';
import { LocationInput } from '../components/common/LocationInput';
import { CalendarPicker } from '../features/Calendar/components/CalendarPicker';
import { SimpleCalendarDropdown } from '../components/EventEditModalV2Demo/SimpleCalendarDropdown';
import { SyncModeDropdown } from '../components/EventEditModalV2Demo/SyncModeDropdown';
import { getAvailableCalendarsForSettings, getCalendarGroupColor, generateEventId } from '../utils/calendarUtils';
// TimeLog 相关导入
import { ModalSlate } from '../components/ModalSlate';
import { TitleSlate } from '../components/ModalSlate/TitleSlate';
import { jsonToSlateNodes, slateNodesToHtml, slateNodesToJson } from '../components/ModalSlate/serialization';
import { HeadlessFloatingToolbar } from '../components/FloatingToolbar/HeadlessFloatingToolbar';
import { useFloatingToolbar } from '../components/FloatingToolbar/useFloatingToolbar';
import { insertTag, insertEmoji, insertDateMention, applyTextFormat } from '../components/PlanSlate/helpers';
// import { parseExternalHtml, slateNodesToRichHtml } from '../components/PlanSlate/serialization';
import { formatTimeForStorage } from '../utils/timeUtils';
import { EventRelationSummary } from '../components/EventTree/EventRelationSummary';
import { EventTreeViewer } from '../components/EventTree/EventTreeViewer';
import './LogTab.css';

// Import SVG icons
import timerStartIcon from '../assets/icons/timer_start.svg';
import pauseIcon from '../assets/icons/pause.svg';
import stopIcon from '../assets/icons/stop.svg';
import cancelIcon from '../assets/icons/cancel.svg';
import rotationColorIcon from '../assets/icons/rotation_color.svg';
import attendeeIcon from '../assets/icons/Attendee.svg';
import datetimeIcon from '../assets/icons/datetime.svg';
import locationIcon from '../assets/icons/Location.svg';
import arrowBlueIcon from '../assets/icons/Arrow_blue.svg';
import timerCheckIcon from '../assets/icons/timer_check.svg';
import addTaskColorIcon from '../assets/icons/Add_task_color.svg';
import ddlAddIcon from '../assets/icons/ddl_add.svg';
import ddlCheckedIcon from '../assets/icons/ddl_checked.svg';
import taskGrayIcon from '../assets/icons/task_gray.svg';
import ddlWarnIcon from '../assets/icons/ddl_warn.svg';
import linkColorIcon from '../assets/icons/link_color.svg';
import backIcon from '../assets/icons/back.svg';
import remarkableLogo from '../assets/icons/LOGO.svg';
import notetreeIcon from '../assets/icons/Notetree.svg';
import rightIcon from '../assets/icons/right.svg';
import syncIcon from '../assets/icons/Sync.svg';
import tagIcon from '../assets/icons/Tag.svg';

// Import TagInput component
import { TagInput } from '../components/common/TagInput';

interface MockEvent {
  id: string;
  title: string;
  tags: string[];
  isTask: boolean;
  isTimer: boolean;
  parentEventId: string | null;
  // 🔗 EventTree 关系字段
  childEventIds?: string[];
  linkedEventIds?: string[];
  backlinks?: string[];
  startTime: string | null; // TimeSpec format: "YYYY-MM-DD HH:mm:ss"
  endTime: string | null;   // TimeSpec format: "YYYY-MM-DD HH:mm:ss"
  allDay: boolean;
  location?: string;
  organizer?: Contact;
  attendees?: Contact[];
  eventlog?: any; // Slate JSON (Descendant[] array or string)
  description?: string; // HTML export for Outlook sync
  // 🔧 日历同步配置 (单一数据结构)
  calendarIds?: string[];
  syncMode?: string;
  subEventConfig?: {
    calendarIds?: string[];
    syncMode?: string;
  };
  // 🆕 父子事件日历同步配置
  planSyncConfig?: {
    mode: 'receive-only' | 'send-only' | 'send-only-private' | 'bidirectional' | 'bidirectional-private';
    targetCalendars: string[];
  };
  actualSyncConfig?: {
    mode: 'send-only' | 'send-only-private' | 'bidirectional' | 'bidirectional-private';
    targetCalendars: string[];
  } | null;
}

interface LogTabProps {
  eventId: string; // LogTab 总是打开的，不需要 isOpen
  onClose: () => void;
  onSave: (updatedEvent: Event) => void;
  onDelete?: (eventId: string) => void;
  hierarchicalTags: any[];
  globalTimer?: {
    startTime: number;
    originalStartTime?: number;
    elapsedTime: number;
    isRunning: boolean;
    isPaused?: boolean;
    eventId?: string;
    parentEventId?: string;
  } | null;
  onStartTimeChange?: (newStartTime: number) => void;
  onTimerAction?: (action: 'start' | 'pause' | 'resume' | 'stop' | 'cancel', tagIds?: string | string[], eventIdOrParentId?: string) => void; // 🔧 修改：统一参数格式
  // v1 兼容 props（保留但不使用）
  microsoftService?: any;
  availableCalendars?: any[];
  availableTodoLists?: any[];
  draggable?: boolean;
  resizable?: boolean;
}

const LogTabComponent: React.FC<LogTabProps> = ({
  eventId,
  onClose,
  onSave,
  onDelete,
  hierarchicalTags,
  globalTimer,
  onTimerAction,
}) => {
  // 🔧 从 EventHub 获取最新的 event 数据（单一数据源）
  const [event, setEvent] = React.useState<Event | null>(null);
  
  React.useEffect(() => {
    if (!eventId) {
      setEvent(null);
      return;
    }
    
    // 🔧 从 EventService 异步加载事件数据
    EventService.getEventById(eventId).then(serviceEvent => {
      if (serviceEvent) {
        setEvent(serviceEvent);
      } else {
        console.error('❌ [EventEditModalV2] 事件不存在:', eventId);
        setEvent(null);
      }
    });
  }, [eventId]);
  
  // 🔧 模式检测：判断是父事件模式还是子事件模式
  const isParentMode = !event?.parentEventId;
  
  console.log('🔍 [EventEditModalV2] 模式检测:', {
    isParentMode,
    eventId: event?.id,
    parentEventId: event?.parentEventId,
    isTimer: event?.isTimer
  });
  
  // 🎬 调试：打印传入的 event 对象的关键字段
  console.log('🎬 [EventEditModalV2] 传入的 event 对象:', {
    id: event?.id,
    fourDNoteSource: event?.fourDNoteSource,
    source: event?.source,
    syncMode: event?.syncMode,
    syncStatus: event?.syncStatus,
    calendarIds: event?.calendarIds
  });
  
  // 🔍 检测 event 对象引用是否变化（用于诊断重新渲染）
  const eventRefTracker = React.useRef({ count: 0, lastEventId: null, lastEventRef: null });
  if (eventRefTracker.current.lastEventRef !== event) {
    eventRefTracker.current.count++;
    eventRefTracker.current.lastEventRef = event;
    console.log('⚠️ [EventEditModalV2] event prop 引用变化！', {
      renderCount: eventRefTracker.current.count,
      eventId: event?.id,
      isSameEvent: eventRefTracker.current.lastEventId === event?.id
    });
    eventRefTracker.current.lastEventId = event?.id;
  }

  // 🔍 渲染原因追踪器 - 记录所有导致重新渲染的原因
  const renderTracker = React.useRef({
    renderCount: 0,
    lastProps: { event, onClose, onSave, onDelete, hierarchicalTags, globalTimer, onTimerAction },
    lastStates: {} as any
  });
  
  renderTracker.current.renderCount++;
  const currentProps = { event, onClose, onSave, onDelete, hierarchicalTags, globalTimer, onTimerAction };
  const propsChanged: string[] = [];
  
  Object.keys(currentProps).forEach(key => {
    if (renderTracker.current.lastProps[key] !== currentProps[key]) {
      propsChanged.push(key);
    }
  });
  
  if (propsChanged.length > 0 || renderTracker.current.renderCount <= 2) {
    console.log(`🔄 [LogTab] Render #${renderTracker.current.renderCount}`, {
      propsChanged: propsChanged.length > 0 ? propsChanged : '无prop变化',
      eventIdChanged: renderTracker.current.lastProps.event?.id !== event?.id,
      functionRefsChanged: propsChanged.filter(k => typeof currentProps[k] === 'function')
    });
  }
  
  renderTracker.current.lastProps = currentProps;
  
  /**
   * ==================== formData 初始化 ====================
   * 
   * 数据来源：
   * 1. 编辑已有事件：props.event（来自 EventService.getAllEvents()）
   * 2. 创建新事件：TimeCalendar 传入的临时对象（带 local-${timestamp} ID）
   * 
   * 字段说明：
   * - 非时间字段：title, tags, isTask, location, attendees, eventlog, description
   * - 时间字段：startTime, endTime, allDay（存储但不在此处管理）
   * - 元数据：id, parentEventId（Timer父子关系）, organizer（Outlook同步）
   * 
   * eventlog 字段处理：
   * - 旧格式：字符串（HTML）
   * - 新格式：EventLog 对象 { content: Slate JSON, ... }
   * - ModalSlate 需要 Slate JSON 字符串
   * 
   * 架构分层：
   * - EventEditModal：UI层，负责用户输入和展示
   * - EventHub：状态管理层，负责缓存和增量更新
   * - EventService：持久化层，负责 localStorage 存储
   * - TimeHub：时间管理层，负责 TimeSpec 和时间意图（本组件不直接调用）
   */
  // 🏷️ 可用标签列表（订阅 TagService 更新）
  const [availableTags, setAvailableTags] = useState(() => TagService.getTags());
  
  // 🌲 EventTree: 加载所有事件用于树状图
  const [allEvents, setAllEvents] = useState<any[]>([]);

  // 🔍 [已删除] State变化追踪器 - 导致频繁 re-render，仅在开发时需要可手动启用
  
  // 🏷️ 订阅 TagService 更新（当标签在 TagManager 中被修改时）
  React.useEffect(() => {
    console.log('🔄 [useEffect] TagService subscription 触发');
    const handleTagsUpdate = () => {
      const updatedTags = TagService.getTags();
      console.log('🏷️ [EventEditModalV2] TagService 更新，重新加载标签:', updatedTags.length);
      setAvailableTags(prev => {
        // 比较标签ID数组避免循环
        const prevIds = prev.map(t => t.id).sort().join(',');
        const newIds = updatedTags.map(t => t.id).sort().join(',');
        if (prevIds === newIds) {
          console.log('⏭️ [useEffect] TagService 跳过更新(ID相同)');
          return prev;
        }
        console.log('✅ [useEffect] TagService 更新', { prevCount: prev.length, newCount: updatedTags.length });
        return updatedTags;
      });
    };
    
    // 添加监听器
    TagService.addListener(handleTagsUpdate);
    
    // 如果 TagService 已初始化，立即加载标签
    if (TagService.isInitialized()) {
      handleTagsUpdate();
    }
    
    // 清理监听器
    return () => {
      TagService.removeListener(handleTagsUpdate);
    };
  }, []);

  const [formData, setFormData] = useState<MockEvent>(() => {
    if (event) {
      console.log('🔍🔍🔍 [formData 初始化] event.title 完整对象:', event.title);
      console.log('🔍🔍🔍 [formData 初始化] typeof event.title:', typeof event.title);
      
      // ✨ 使用 fullTitle (Slate JSON) 作为标题数据源，支持富文本格式
      let titleText = '';
      if (event.title) {
        if (typeof event.title === 'string') {
          // 旧数据：纯文本，转换为 Slate JSON
          console.log('🔄 [formData 初始化] 纯文本标题，转换为 JSON:', event.title);
          titleText = JSON.stringify([{ type: 'paragraph', children: [{ text: event.title }] }]);
        } else {
          // 🔧 只读取 colorTitle（Slate JSON 格式，可编辑）
          console.log('📦 [formData 初始化] event.title.colorTitle:', event.title.colorTitle);
          titleText = event.title.colorTitle || '';
        }
      }
      console.log('✅ [formData 初始化] 最终 titleText:', titleText);
      
      // 🔧 直接从 event prop 读取 EventTree 数据（避免异步问题）
      const childEventIds = (event as any).childEventIds || [];
      const linkedEventIds = (event as any).linkedEventIds || [];
      const backlinks = (event as any).backlinks || [];
      
      console.log('🔍🔍🔍 [formData 初始化] EventTree 数据来源分析:', {
        eventId: event.id,
        '步骤1_event.childEventIds': (event as any).childEventIds,
        '步骤2_event.linkedEventIds': (event as any).linkedEventIds,
        '步骤3_event.backlinks': (event as any).backlinks,
        '步骤4_最终childEventIds': childEventIds,
        '步骤5_最终linkedEventIds': linkedEventIds,
        '步骤6_最终backlinks': backlinks,
      });
      
      return {
        id: event.id,
        title: titleText,
        tags: event.tags || [],
        isTask: event.isTask || false,
        isTimer: event.isTimer || false,
        parentEventId: event.parentEventId || null,
        childEventIds,
        linkedEventIds,
        backlinks,
        startTime: event.startTime || null,
        endTime: event.endTime || null,
        allDay: event.isAllDay || false,
        location: event.location || '',
        organizer: event.organizer,
        attendees: event.attendees || [],
        eventlog: (() => {
          // 处理 eventlog 字段的多种格式，统一转换为 Descendant[] 对象
          console.log('🔍🔍🔍 [LogTab] eventlog 原始数据:', {
            eventId: event.id,
            eventlogExists: !!event.eventlog,
            eventlogType: typeof event.eventlog,
            eventlog: event.eventlog
          });
          
          if (!event.eventlog) return [];
          
          if (typeof event.eventlog === 'string') {
            // 如果是字符串（Slate JSON），解析为对象
            try {
              const parsed = JSON.parse(event.eventlog);
              console.log('🔍 [LogTab] eventlog 解析（string）:', { eventId: event.id, nodes: parsed });
              return parsed;
            } catch (error) {
              console.error('❌ [EventEditModalV2] eventlog 解析失败:', error);
              return [];
            }
          }
          
          // 如果是 EventLog 对象，提取 slateJson 字段并解析
          if (event.eventlog.slateJson) {
            try {
              const parsed = typeof event.eventlog.slateJson === 'string' 
                ? JSON.parse(event.eventlog.slateJson) 
                : event.eventlog.slateJson;
              console.log('🔍 [LogTab] eventlog 解析（EventLog）:', { eventId: event.id, nodes: parsed, types: parsed.map((n: any) => n.type) });
              return parsed;
            } catch (error) {
              console.error('❌ [EventEditModalV2] eventlog.slateJson 解析失败:', error);
              return [];
            }
          }
          
          // 如果是数组，直接返回（已经是 Descendant[]）
          if (Array.isArray(event.eventlog)) {
            console.log('🔍 [LogTab] eventlog 解析（array）:', { eventId: event.id, nodes: event.eventlog, types: event.eventlog.map((n: any) => n.type) });
            return event.eventlog;
          }
          
          return [];
        })(),
        description: event.description || '',
        // 🔧 日历同步配置（单一数据结构）
        calendarIds: event.calendarIds || [],
        // ✅ syncMode 根据事件来源设置默认值
        syncMode: (() => {
          const originalSyncMode = event.syncMode;
          const finalSyncMode = event.syncMode || (() => {
            const isLocalEvent = event.fourDNoteSource === true || event.source === 'local';
            const defaultMode = isLocalEvent ? 'bidirectional-private' : 'receive-only';
            console.log('🎬 [formData 初始化] 事件来源检测（降级逻辑）:', {
              eventId: event.id,
              fourDNoteSource: event.fourDNoteSource,
              source: event.source,
              isLocalEvent,
              eventSyncMode: event.syncMode,
              计算得到的defaultMode: defaultMode
            });
            return defaultMode;
          })();
          
          // 🔥 关键日志：打印原始值和最终值
          console.log('🔍 [formData.syncMode 初始化]:', {
            eventId: event.id,
            'event.syncMode (原始)': originalSyncMode,
            'formData.syncMode (最终)': finalSyncMode,
            不一致: originalSyncMode !== finalSyncMode
          });
          
          return finalSyncMode;
        })(),
        subEventConfig: event.subEventConfig || { 
          calendarIds: [], 
          syncMode: 'bidirectional-private' // ✅ 子事件默认也是 bidirectional-private
        },
      };
    }
    // 新建事件时的默认值
    console.log('🆕 [formData 初始化] 新建事件，使用默认值');
    return {
      id: generateEventId(),
      title: JSON.stringify([{ type: 'paragraph', children: [{ text: '' }] }]),
      tags: [],
      isTask: false,
      isTimer: false,
      parentEventId: null,
      childEventIds: [],
      linkedEventIds: [],
      backlinks: [],
      startTime: null,
      endTime: null,
      allDay: false,
      location: '',
      attendees: [],
      eventlog: [],  // 🔧 Slate JSON 对象（空 Descendant 数组）
      description: '',
      // 🔧 日历同步配置（单一数据结构）
      calendarIds: [],
      syncMode: 'bidirectional-private', // ✅ 新建事件默认为本地事件
      subEventConfig: { calendarIds: [], syncMode: 'bidirectional-private' },
    };
  });

  // 🔧 当打开时，立即重置 formData 为新建事件的默认值（避免显示旧数据）
  React.useEffect(() => {
    if (!eventId) {
      // 新建事件：重置为空表单
      setFormData({
        id: generateEventId(),
        title: JSON.stringify([{ type: 'paragraph', children: [{ text: '' }] }]),
        tags: [],
        isTask: false,
        isTimer: false,
        parentEventId: null,
        childEventIds: [],
        linkedEventIds: [],
        backlinks: [],
        startTime: null,
        endTime: null,
        allDay: false,
        location: '',
        attendees: [],
        eventlog: [],
        description: '',
        calendarIds: [],
        syncMode: 'bidirectional-private',
        subEventConfig: { calendarIds: [], syncMode: 'bidirectional-private' },
      });
    }
  }, [eventId]);

  // 🔧 当从 EventHub 加载的 event 变化时重新初始化 formData
  React.useEffect(() => {
    if (!event) return;
    
    console.log('🔍 [formData初始化] event.title 结构:', {
      'event.title类型': typeof event.title,
      'event.title': event.title,
      'event.title.colorTitle': typeof event.title === 'object' ? event.title.colorTitle : undefined,
      'event.title.simpleTitle': typeof event.title === 'object' ? event.title.simpleTitle : undefined,
    });
    
    let titleText = '';
    if (event.title) {
      if (typeof event.title === 'string') {
        // 旧数据：纯文本，转换为 Slate JSON
        titleText = JSON.stringify([{ type: 'paragraph', children: [{ text: event.title }] }]);
      } else {
        // 🔧 只读取 colorTitle（Slate JSON 格式，可编辑）
        titleText = event.title.colorTitle || '';
      }
    }
    
    console.log('🔍 [formData初始化] 提取的 titleText:', titleText?.substring(0, 100));
    
    // 🔧 同步 titleRef（避免事件切换后 titleRef 与 formData 不一致）
    titleRef.current = titleText;
    
    const childEventIds = (event as any).childEventIds || [];
    const linkedEventIds = (event as any).linkedEventIds || [];
    const backlinks = (event as any).backlinks || [];
    
    setFormData({
      id: event.id,
      title: titleText,
      tags: event.tags || [],
      isTask: event.isTask || false,
      isTimer: event.isTimer || false,
      parentEventId: event.parentEventId || null,
      childEventIds,
      linkedEventIds,
      backlinks,
      startTime: event.startTime || null,
      endTime: event.endTime || null,
      allDay: event.isAllDay || false,
      location: event.location || '',
      organizer: event.organizer,
      attendees: event.attendees || [],
      eventlog: (() => {
        if (!event.eventlog) return [];
        if (typeof event.eventlog === 'string') {
          try {
            return JSON.parse(event.eventlog);
          } catch (error) {
            console.error('❌ [EventEditModalV2] eventlog 解析失败:', error);
            return [];
          }
        }
        if (event.eventlog.slateJson) {
          try {
            return typeof event.eventlog.slateJson === 'string' 
              ? JSON.parse(event.eventlog.slateJson) 
              : event.eventlog.slateJson;
          } catch (error) {
            console.error('❌ [EventEditModalV2] eventlog.slateJson 解析失败:', error);
            return [];
          }
        }
        if (Array.isArray(event.eventlog)) {
          return event.eventlog;
        }
        return [];
      })(),
      description: event.description || '',
      calendarIds: event.calendarIds || [],
      syncMode: event.syncMode || (() => {
        const isLocalEvent = event.fourDNoteSource === true || event.source === 'local';
        return isLocalEvent ? 'bidirectional-private' : 'receive-only';
      })(),
      subEventConfig: event.subEventConfig || { 
        calendarIds: [], 
        syncMode: 'bidirectional-private'
      },
    });
  }, [event?.id]); // 只在 event ID 变化时重新初始化（Modal 打开时加载一次）

  // UI 状态
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [showEventTree, setShowEventTree] = useState(false);
  const [showSourceCalendarPicker, setShowSourceCalendarPicker] = useState(false);
  const [showSyncCalendarPicker, setShowSyncCalendarPicker] = useState(false);
  const [showSourceSyncModePicker, setShowSourceSyncModePicker] = useState(false);
  
  // 📑 目录窗口状态
  const [showToc, setShowToc] = useState(false); // 悬浮显示
  const [tocPinned, setTocPinned] = useState(false); // 固定状态
  const [showTocMenu, setShowTocMenu] = useState(false); // 菜单显示
  const [showSyncSyncModePicker, setShowSyncSyncModePicker] = useState(false);
  const [isDetailView, setIsDetailView] = useState(true);
  const [tagPickerPosition, setTagPickerPosition] = useState({ top: 0, left: 0, width: 0 });
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // 🔥 延迟加载 allEvents - 只在用户打开 EventTree 时才加载，避免打开Modal时就触发re-render导致失焦
  React.useEffect(() => {
    console.log('🔄 [useEffect] loadEvents 触发', { showEventTree, allEventsLength: allEvents.length });
    const loadEvents = async () => {
      const events = await EventService.getAllEvents();
      setAllEvents(prev => {
        // 比较ID数组避免循环
        const prevIds = prev.map(e => e.id).sort().join(',');
        const newIds = events.map((e: any) => e.id).sort().join(',');
        if (prevIds === newIds) {
          console.log('⏭️ [useEffect] loadEvents 跳过更新(ID相同)');
          return prev;
        }
        console.log('✅ [useEffect] loadEvents 更新', { prevCount: prev.length, newCount: events.length });
        return events;
      });
    };
    
    // 🔥 只在打开EventTree时才加载（延迟加载）
    if (showEventTree && allEvents.length === 0) {
      loadEvents();
    }
  }, [showEventTree, allEvents.length]);
  
  // 🆕 三层保存架构状态
  // ✅ Layer 2: 静默自动保存（保护断网/断电数据）
  // 注意：不显示"已保存"提示，避免干扰用户
  const initialSnapshotRef = React.useRef<MockEvent | null>(null);
  const isAutoSavingRef = React.useRef<boolean>(false); // 🔧 标记是否正在 auto-save
  const titleRef = React.useRef<string>(formData.title); // 🔧 缓存 title，避免 blur-to-save 时 setFormData 导致 re-render
  
  // 🔧 同步 titleRef 与 formData.title（只在事件切换时，即 formData.id 变化）
  // 🔥 关键：不监听 formData.title，避免其他字段更新时误触发同步
  // 原因：handleTitleChange 只更新 titleRef（不含 emoji），如果 formData.title 变化就同步回来，
  //       会导致 titleRef 被 formData 覆盖，下次保存时 emoji 丢失
  React.useEffect(() => {
    titleRef.current = formData.title;
    console.log('🔄 [titleRef] 同步 titleRef.current =', formData.title?.substring(0, 50));
  }, [formData.id]); // 只监听事件 ID 变化（事件切换时）
  
  // 🆕 Layer 3: 捕获初始快照（用于取消回滚）
  React.useEffect(() => {
    if (formData && !initialSnapshotRef.current) {
      initialSnapshotRef.current = JSON.parse(JSON.stringify(formData));
      console.log('📸 [LogTab] Initial snapshot captured:', {
        eventId: formData.id,
        syncMode: formData.syncMode,
        calendarIds: formData.calendarIds
      });
    }
  }, [formData.id]);
  
  // 🔧 [已删除] Layer 2 静默自动保存机制 - 与 blur-to-save 冲突，导致重复保存
  // 现在采用双层保存架构：
  // Layer 1: blur-to-save（字段级，TitleSlate/TagPicker/ModalSlate blur 时立即保存）
  // Layer 2: 显式保存按钮（handleSave，保存所有字段包括时间、地点等）
  
  // 🔧 使用 useMemo 缓存 EventTree 数据，避免频繁序列化
  const eventTreeData = React.useMemo(() => {
    if (!event) return { childEventIds: [], linkedEventIds: [], backlinks: [] };
    return {
      childEventIds: (event as any).childEventIds || [],
      linkedEventIds: (event as any).linkedEventIds || [],
      backlinks: (event as any).backlinks || [],
    };
  }, [event?.id]); // 只监听 ID 变化
  
  // 🔧 只在 event.id 变化时更新 EventTree 关联关系
  React.useEffect(() => {
    if (!event) return;
    
    // 🔧 如果正在 auto-save 或正在编辑，不更新 formData（防止编辑器重置）
    if (isAutoSavingRef.current) {
      console.log('⚠️ [EventTree] Auto-save 期间跳过更新 formData');
      return;
    }
    
    console.log('🔗 [EventEditModalV2] 更新 EventTree 关联关系:', {
      eventId: event.id,
      ...eventTreeData,
    });
    
    // 只更新关联关系，不覆盖用户编辑的 title/tags/eventlog 等字段
    setFormData(prev => ({
      ...prev,
      ...eventTreeData,
    }));
  }, [event?.id, eventTreeData]);
  
  // 🔧 [已删除] syncMode 同步 useEffect - 改为在 sourceSyncMode/syncSyncMode 初始化时直接设置，避免额外的 state 更新
  
  // 🔧 [已删除] 调试日志 useEffect - 导致频繁 re-render，如需调试可在关键位置手动添加日志

  // TimeLog 相关状态 - 将 formData.eventlog（Descendant[] 数组）转换为 JSON 字符串供 ModalSlate 使用
  const timelogContent = useMemo(() => {
    const eventlog = formData.eventlog || [];
    return Array.isArray(eventlog) ? JSON.stringify(eventlog) : eventlog;
  }, [formData.eventlog]);
  
  const [activePickerIndex, setActivePickerIndex] = useState(-1);
  const [isSubPickerOpen, setIsSubPickerOpen] = useState(false); // 🆕 追踪子选择器（颜色选择器）是否打开
  const [currentActivePicker, setCurrentActivePicker] = useState<string | null>(null); // 🆕 追踪当前 activePicker 状态

  // 获取真实的可用日历数据
  const availableCalendars = getAvailableCalendarsForSettings();

  // 🆕 父事件信息（如果当前是子事件）- 必须在 syncCalendarIds 之前定义
  const [parentEvent, setParentEvent] = React.useState<Event | null>(null);

  // 🔧 实际进展日历状态（根据模式动态初始化）
  // 父模式：从 subEventConfig 读取；子模式：从当前事件读取
  const [syncCalendarIds, setSyncCalendarIds] = useState<string[]>(() => {
    if (!isParentMode) {
      // 🔧 子模式：区分系统子事件和手动子事件
      // - 系统子事件 (isTimer/isTimeLog/isOutsideApp): 读取父事件的 subEventConfig.calendarIds
      // - 手动子事件: 使用自己的 calendarIds（如果为空，则从 parent.subEventConfig 继承）
      if (event?.isTimer || event?.isTimeLog || event?.isOutsideApp) {
        return parentEvent?.subEventConfig?.calendarIds || [];
      } else {
        // 手动子事件：优先使用自己的配置，如果为空则继承父配置
        return event?.calendarIds || parentEvent?.subEventConfig?.calendarIds || [];
      }
    } else {
      // 父模式：从 subEventConfig 读取模板配置
      return event?.subEventConfig?.calendarIds || [];
    }
  });

  // 🆕 v2.0.5 同步 formData.subEventConfig.calendarIds 到 syncCalendarIds（使用新架构）
  React.useEffect(() => {
    if (formData.subEventConfig?.calendarIds) {
      setSyncCalendarIds(prev => {
        const newIds = formData.subEventConfig.calendarIds;
        if (JSON.stringify(prev) !== JSON.stringify(newIds)) {
          console.log('🔄 [EventEditModalV2] 同步 subEventConfig.calendarIds 到 syncCalendarIds:', newIds);
          return newIds;
        }
        return prev;
      });
    }
  }, [formData.subEventConfig?.calendarIds]);

  // 🆕 刷新计数器：用于强制刷新 parentEvent 和 childEvents
  const [refreshCounter, setRefreshCounter] = React.useState(0);

  // 🆕 加载子事件列表（用于显示和批量更新）
  
  React.useEffect(() => {
    const loadParent = async () => {
      if (!event?.parentEventId) {
        setParentEvent(prev => prev === null ? prev : null); // 只在需要时更新
        return;
      }
      const parent = await EventService.getEventById(event.parentEventId);
      console.log('🔍 [parentEvent] 读取父事件:', {
        childEventId: event.id,
        parentEventId: event.parentEventId,
        found: !!parent,
        parentChildrenCount: parent?.childEventIds?.length || 0,
        refreshCounter  // 🔧 添加日志验证刷新
      });
      setParentEvent(prev => {
        // 比较ID避免循环
        if (prev?.id === parent?.id) return prev;
        return parent;
      });
    };
    loadParent();
  }, [event?.id, event?.parentEventId, refreshCounter]);

  // 🔧 子事件列表：如果当前是子事件，显示父事件的所有子事件；否则显示自己的子事件
  const [childEvents, setChildEvents] = React.useState<Event[]>([]);
  
  React.useEffect(() => {
    const loadChildren = async () => {
      // 🔧 关键修复：每次都从 EventService 重新读取最新数据，而不是依赖 prop
      // 原因：EventService 的 eventsUpdated 会忽略同标签页的更新（防循环），
      // 所以当 App.tsx 更新父事件时，Modal 不会收到事件通知，需要主动读取
      
      if (!event?.id) {
        setChildEvents(prev => prev.length === 0 ? prev : []);
        return;
      }
      
      // 🔧 如果正在 auto-save，不重新加载事件（防止编辑器重置）
      if (isAutoSavingRef.current) {
        console.log('⚠️ [childEvents] Auto-save 期间跳过重新加载事件');
        return;
      }
      
      // 🆕 从 EventService 重新读取当前事件的最新数据
      const latestEvent = await EventService.getEventById(event.id);
      if (!latestEvent) {
        setChildEvents(prev => prev.length === 0 ? prev : []);
        return;
      }
      
      // 情况 1: 当前是子事件 → 显示父事件的所有子事件
      if (latestEvent.parentEventId) {
        console.log('🔍 [childEvents] 子事件模式 - 使用 EventService.getChildEvents:', {
          parentId: latestEvent.parentEventId,
          refreshCounter
        });
        
        const children = await EventService.getChildEvents(latestEvent.parentEventId);
        
        console.log('🔍 [childEvents] 成功加载子事件:', {
          count: children.length,
          ids: children.map(e => e.id)
        });
        
        setChildEvents(prev => {
          // 比较ID数组避免循环
          const prevIds = prev.map(e => e.id).sort().join(',');
          const newIds = children.map(e => e.id).sort().join(',');
          if (prevIds === newIds) return prev;
          return children;
        });
        return;
      }
      
      // 情况 2: 当前是父事件 → 显示自己的子事件
      console.log('🔍 [childEvents] 父事件模式 - 使用 EventService.getChildEvents:', {
        eventId: latestEvent.id,
        refreshCounter
      });
      
      const children = await EventService.getChildEvents(latestEvent.id);
      
      console.log('🔍 [childEvents] 成功加载子事件:', {
        count: children.length,
        ids: children.map(e => e.id),
        refreshCounter
      });
      
      setChildEvents(prev => {
        // 比较ID数组避免循环
        const prevIds = prev.map(e => e.id).sort().join(',');
        const newIds = children.map(e => e.id).sort().join(',');
        if (prevIds === newIds) return prev;
        return children;
      });
    };
    
    loadChildren();
  }, [event?.id, refreshCounter]);

  React.useEffect(() => {
    if (parentEvent) {
      console.log('🔗 [EventEditModalV2] 子事件模式 - 显示父事件数据:', {
        当前子事件ID: event?.id,
        父事件ID: parentEvent.id,
        父事件标题: parentEvent.title?.simpleTitle,
        父事件所有子事件: childEvents.length,
        子事件列表: childEvents.map(e => ({ id: e.id, title: e.title?.simpleTitle }))
      });
    } else if (childEvents.length > 0) {
      console.log('🔗 [EventEditModalV2] 父事件模式 - 显示子事件列表:', {
        父事件ID: event?.id,
        子事件数量: childEvents.length,
        子事件列表: childEvents.map(e => ({ id: e.id, title: e.title?.simpleTitle }))
      });
    }
  }, [childEvents, parentEvent, event?.id]);

  // 同步模式数据
  const syncModes = [
    { id: 'receive-only', name: '只接收同步', emoji: '📥' },
    { id: 'send-only', name: '只发送同步', emoji: '📤' },
    { id: 'send-only-private', name: '只发送（仅自己）', emoji: '📤' },
    { id: 'bidirectional', name: '双向同步', emoji: '🔄' },
    { id: 'bidirectional-private', name: '双向同步（仅自己）', emoji: '🔄' },
  ];

  // TimeLog 相关 refs
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const slateEditorRef = useRef<any>(null);
  
  // 滚动阴影状态
  const [showTopShadow, setShowTopShadow] = useState(false);

  // 🎯 根据 currentActivePicker 动态计算 menuItemCount
  const menuItemCount = currentActivePicker === 'textStyle' ? 7 : 5;

  // FloatingToolbar Hook
  const floatingToolbar = useFloatingToolbar({
    editorRef: rightPanelRef as RefObject<HTMLElement>,
    enabled: isDetailView,
    menuItemCount, // 🆕 动态计算：textStyle 为 7，其他为 5
    isSubPickerOpen, // 🆕 传递子选择器状态，打开时不拦截数字键
    onMenuSelect: (index) => {
      console.log('[EventEditModalV2] Menu selected:', index);
      setActivePickerIndex(index);
    },
  });
  
  // 🔧 同步模式 UI 状态（从 formData 初始化，formData.syncMode 已根据事件来源正确设置）
  const [sourceSyncMode, setSourceSyncMode] = useState(() => {
    console.log('🎬 [sourceSyncMode 初始化] formData.syncMode =', formData.syncMode);
    return formData.syncMode; // ✅ 直接使用 formData.syncMode，它已经根据事件来源正确设置了默认值
  });
  const [syncSyncMode, setSyncSyncMode] = useState(() => {
    // 实际进展同步模式：子事件模式从 mainEvent 读取，父事件模式从 subEventConfig 读取
    let mode;
    if (!isParentMode) {
      // 🔧 子事件模式：区分系统子事件和手动子事件
      // - 系统子事件 (isTimer/isTimeLog/isOutsideApp): 读取父事件的 subEventConfig.syncMode
      // - 手动子事件: 使用自己的 syncMode（如果为空，则从 parent.subEventConfig 继承）
      if (event?.isTimer || event?.isTimeLog || event?.isOutsideApp) {
        mode = parentEvent?.subEventConfig?.syncMode || 'bidirectional-private';
        console.log('🎬 [syncSyncMode 初始化] 系统子事件模式，使用 parentEvent.subEventConfig.syncMode =', mode);
      } else {
        // 手动子事件：优先使用自己的配置，如果为空则继承父配置
        mode = formData.syncMode || parentEvent?.subEventConfig?.syncMode || 'bidirectional-private';
        console.log('🎬 [syncSyncMode 初始化] 手动子事件模式，使用 formData.syncMode || parentEvent.subEventConfig.syncMode =', mode);
      }
    } else {
      // ✅ 父模式：使用 formData.subEventConfig.syncMode（默认 bidirectional-private）
      mode = formData.subEventConfig?.syncMode || 'bidirectional-private';
      console.log('🎬 [syncSyncMode 初始化] 父事件模式，使用 subEventConfig.syncMode =', mode);
    }
    return mode;
  });

  /**
   * 🚫 计算保存按钮是否应该禁用
   * 根据 PRD：当 !formData.title && formData.tags.length === 0 时禁用
   */
  const isSaveDisabled = !formData.title?.trim() && (!formData.tags || formData.tags.length === 0);

  /**
   * 📝 TitleSlate onChange 处理（使用 useCallback 优化）
   * 🔧 修复：只更新 titleRef，不触发 setFormData re-render
   * 原因：blur-to-save 时 onChange 触发 setFormData 会导致 TitleSlate unmount → 失焦
   */
  const handleTitleChange = useCallback((slateJson: string) => {
    console.log('😀 [TitleSlate] onChange (blur) 触发, slateJson:', slateJson.substring(0, 50));
    // 🔥 只更新 titleRef，不触发 setFormData（避免 re-render → TitleSlate unmount）
    titleRef.current = slateJson;
    console.log('✅ [TitleSlate] title 已缓存到 titleRef，不触发 re-render');
  }, []); // 空依赖数组，函数永不变化

  /**
   * 🆕 Layer 3: 取消按钮处理（直接关闭，不保存任何更改）
   */
  const handleCancel = async () => {
    console.log('🚫 [EventEditModalV2] Cancel clicked - 丢弃所有未保存的更改');
    // 🔥 取消操作：直接关闭 Modal，不调用 EventService.updateEvent
    // formData 中的任何修改都会被丢弃
    // 下次打开时会重新从 EventService 加载最新数据
    initialSnapshotRef.current = null;
    onClose();
  };

  /**
   * 💾 统一保存处理函数
   * 
   * 架构说明：
   * 1. 遵循 EventHub 架构规范（EVENTHUB_TIMEHUB_ARCHITECTURE.md）
   * 2. 数据流：EventEditModal → EventHub → EventService → localStorage
   * 3. 职责分离：
   *    - EventHub: 管理非时间字段（title, tags, description, attendees, eventlog等）
   *    - TimeHub: 管理时间字段（startTime, endTime, isAllDay, timeSpec）
   * 4. 创建 vs 更新：
   *    - 检查 EventService（持久化层）判断事件是否存在
   *    - 新建：EventHub.createEvent() - 一次性创建完整事件
   *    - 更新：EventHub.updateFields() - 增量更新指定字段
   */
  const handleSave = async () => {
    try {
      console.log('💾 [EventEditModalV2] Saving event:', formData.id);
      
      // 🔧 Step 0a: 从 titleRef 同步最新 title 到 formData，并把 emoji 加回去
      // 原因：handleTitleChange 只更新 titleRef，避免 blur 时 re-render
      // 🔥 关键：titleContent 传给 TitleSlate 时去掉了 emoji，保存时需要加回去
      if (titleRef.current !== formData.title) {
        try {
          // 解析当前不含 emoji 的 title JSON
          const titleNodes = JSON.parse(titleRef.current);
          
          // 从 formData.title 中提取原始 emoji
          const originalEmoji = extractFirstEmoji(
            JSON.parse(formData.title || '[]')[0]?.children?.[0]?.text || ''
          );
          
          // 如果有 emoji，把它加回到第一个文本节点的开头
          if (originalEmoji && titleNodes[0]?.children?.[0]) {
            titleNodes[0].children[0].text = originalEmoji + ' ' + titleNodes[0].children[0].text;
          }
          
          formData.title = JSON.stringify(titleNodes);
          console.log('✅ [handleSave] 从 titleRef 同步 title 并恢复 emoji:', formData.title.substring(0, 50));
        } catch (error) {
          console.error('❌ [handleSave] 恢复 emoji 失败，使用原始 title:', error);
          formData.title = titleRef.current;
        }
      }
      
      // 🔧 Step 0b: 准备 eventlog（Slate JSON 字符串）
      // ✅ 简化：formData.eventlog 已通过 ModalSlate blur-to-save 更新，直接使用
      const currentEventlogJson = JSON.stringify(formData.eventlog || []);
      
      // 🔧 Step 1: 确定最终标题
      // formData.title 是 Slate JSON 字符串（colorTitle - 不含标签元素，只有文本和格式）
      // EventService.normalizeTitle 会自动生成 fullTitle 和 simpleTitle
      let finalTitle: string | EventTitle;
      
      if (!formData.title || !formData.title.trim()) {
        // 标题为空且有标签，使用第一个标签名称作为标题
        if (formData.tags && formData.tags.length > 0) {
          const firstTag = TagService.getTagById(formData.tags[0]);
          if (firstTag) {
            const tagTitleText = `${firstTag.emoji || ''}${firstTag.name}事项`.trim();
            // 将纯文本转换为 Slate JSON（colorTitle 格式）
            finalTitle = JSON.stringify([{ type: 'paragraph', children: [{ text: tagTitleText }] }]);
            console.log('🏷️ [EventEditModalV2] Using tag name as title:', tagTitleText);
          } else {
            finalTitle = formData.title; // 空字符串
          }
        } else {
          finalTitle = formData.title; // 空字符串
        }
      } else {
        // ✅ formData.title 已经是 Slate JSON 字符串（colorTitle - 只有文本和格式，无标签元素）
        // 直接传递给 EventService，让 normalizeTitle 自动生成完整的 EventTitle 对象
        finalTitle = formData.title;
      }
      
      console.log('📝 [EventEditModalV2] finalTitle (colorTitle Slate JSON):', finalTitle);
      
      // 🔧 Step 2: 处理时间格式 - 确保符合 EventService 的要求
      // EventService 要求时间格式为 "YYYY-MM-DD HH:mm:ss"（空格分隔）
      let startTimeForStorage = formData.startTime;
      let endTimeForStorage = formData.endTime;
      
      if (formData.startTime) {
        const { formatTimeForStorage, parseLocalTimeString } = await import('../utils/timeUtils');
        try {
          // ✅ 先尝试解析为 Date 对象（支持多种格式）
          const startDate = parseLocalTimeString(formData.startTime);
          startTimeForStorage = formatTimeForStorage(startDate);
        } catch (parseError) {
          // 降级：尝试用 new Date 解析
          const startDate = new Date(formData.startTime);
          if (!isNaN(startDate.getTime())) {
            startTimeForStorage = formatTimeForStorage(startDate);
          } else {
            console.warn('[EventEditModalV2] 无法解析 startTime，保持原值:', formData.startTime);
          }
        }
      }
      
      if (formData.endTime) {
        const { formatTimeForStorage, parseLocalTimeString } = await import('../utils/timeUtils');
        try {
          // ✅ 先尝试解析为 Date 对象（支持多种格式）
          const endDate = parseLocalTimeString(formData.endTime);
          endTimeForStorage = formatTimeForStorage(endDate);
        } catch (parseError) {
          // 降级：尝试用 new Date 解析
          const endDate = new Date(formData.endTime);
          if (!isNaN(endDate.getTime())) {
            endTimeForStorage = formatTimeForStorage(endDate);
          } else {
            console.warn('[EventEditModalV2] 无法解析 endTime，保持原值:', formData.endTime);
          }
        }
      }
      
      // 🔧 Step 3: 检查是否是运行中的 Timer
      // Timer 运行中，应该使用 globalTimer.eventId，而不是 formData.id
      const isRunningTimer = formData.isTimer && 
                            globalTimer?.isRunning && 
                            globalTimer?.eventId;
      
      console.log('🔍 [EventEditModalV2] Timer check:', {
        isTimer: formData.isTimer,
        globalTimerIsRunning: globalTimer?.isRunning,
        globalTimerEventId: globalTimer?.eventId,
        formDataId: formData.id,
        isRunningTimer
      });
      
      // 🔧 Step 4: 确定正确的 eventId
      // 如果是运行中的 Timer，使用 globalTimer.eventId
      // 否则使用 formData.id 或生成新 ID
      let eventId: string;
      if (isRunningTimer && globalTimer?.eventId) {
        eventId = globalTimer.eventId;
        console.log('⏱️ [EventEditModalV2] Using Timer eventId:', eventId);
      } else if (formData.id && formData.id.trim() !== '') {
        eventId = formData.id;
      } else {
        eventId = generateEventId();
        console.log('🆕 [EventEditModalV2] Generated new eventId:', eventId);
      }
      
      // 🔧 Step 5: 确定 syncStatus
      const timerSyncStatus = isRunningTimer ? 'local-only' : (event?.syncStatus || 'pending');
      
      console.log('🔍 [EventEditModalV2] Final event ID and sync status:', {
        eventId,
        syncStatus: timerSyncStatus
      });
      
      // 🔧 Step 6: 处理 Private 模式（send-only-private, bidirectional-private）
      // Private 模式：参与者信息会在 ActionBasedSyncManager 同步时添加到 description
      // 这里只需要保存 attendees，不修改 description（让 EventService 从 eventlog.html 自动提取）
      const isPrivateMode = formData.syncMode?.includes('-private');
      let finalAttendees = formData.attendees;

      // 🔧 Step 6.5: 标签自动映射（根据同步目标日历自动添加标签）
      let finalTags = [...(formData.tags || [])];
      const targetCalendars = formData.calendarIds || [];
      
      if (targetCalendars.length > 0) {
        console.log('🏷️ [EventEditModalV2] Auto-mapping tags from target calendars:', targetCalendars);
        const autoTags: string[] = [];
        
        targetCalendars.forEach((calendarId: string) => {
          // 假设日历 ID 格式为 "outlook-work", "google-personal", "icloud-family"
          if (calendarId.includes('outlook')) {
            autoTags.push('工作', 'Outlook');
          } else if (calendarId.includes('google')) {
            autoTags.push('生活', 'Google');
          } else if (calendarId.includes('icloud')) {
            autoTags.push('个人', 'iCloud');
          }
        });
        
        // 去重合并
        finalTags = Array.from(new Set([...finalTags, ...autoTags]));
        console.log('🏷️ [EventEditModalV2] Final tags after auto-mapping:', finalTags);
      }

      // 🔧 Step 7: 构建完整的 Event 对象
      // ✨ 直接使用 fullTitle (Slate JSON)，保留富文本格式
      const updatedEvent: Event = {
        ...event, // 保留原有字段（如 createdAt, syncStatus 等）
        ...formData,
        id: eventId, // 使用验证后的 ID
        title: finalTitle, // ✅ 直接传 Slate JSON 字符串，EventService.normalizeTitle 会统一处理
        tags: finalTags, // 🏷️ 使用自动映射后的标签
        isTask: formData.isTask,
        isTimer: formData.isTimer,
        parentEventId: formData.parentEventId,
        startTime: startTimeForStorage,
        endTime: endTimeForStorage,
        isAllDay: formData.allDay,
        location: formData.location,
        organizer: formData.organizer,
        attendees: finalAttendees,
        // 🔧 关键：传递 eventlog 和 description，确保双向同步
        // EventService 会从 eventlog 生成 description (html/plainText)
        eventlog: currentEventlogJson,  // ✅ Slate JSON 字符串（EventService 自动转换为 EventLog 对象）
        description: undefined, // ✅ 让 EventService 从 eventlog 自动提取
        syncStatus: timerSyncStatus, // 🔧 Timer 运行中保持 local-only
        // 🔧 日历同步配置（单一数据结构）
        calendarIds: formData.calendarIds,
        syncMode: formData.syncMode,
      } as Event;

      // 🔧 调试日志：验证同步配置
      console.log('💾 [EventEditModalV2] Saving event with sync config:', {
        eventId: eventId,
        calendarIds: formData.calendarIds,
        syncMode: formData.syncMode,
        '完整 updatedEvent.syncMode': updatedEvent.syncMode,
        '完整 updatedEvent.calendarIds': updatedEvent.calendarIds,
        hasEventlog: !!currentEventlogJson,
        eventlogType: typeof currentEventlogJson,
        eventlogLength: currentEventlogJson.length,
      });
      
      // 🔧 调试：对比保存前后的值（异步加载）
      EventService.getEventById(eventId).then(currentEvent => {
        console.log('🔍 [EventEditModalV2] 保存前后对比:', {
          '当前calendarIds': currentEvent?.calendarIds,
          '新calendarIds': formData.calendarIds,
          '当前syncMode': currentEvent?.syncMode,
          '新syncMode': formData.syncMode,
        });
      });

      // 🔧 提前导入 EventHub
      const { EventHub } = await import('../services/EventHub');

      // 🔧 Step 7: 统一保存路径（已移除 Timer 特殊处理）
      // 说明：所有事件创建/更新都通过 EventHub 统一处理，确保架构一致性
      // Timer 事件也使用标准流程：EventHub → EventService → localStorage
      
      // 🔧 Step 8: EventHub 已在上面导入
      
      // 🔧 Step 9: 判断是创建还是更新
      // 检查 EventService（持久化层）而不是 EventHub 缓存
      // 原因：EventHub 可能缓存了 TimeCalendar 传入的临时对象
      const allEvents = await EventService.getAllEvents();
      const existingEvent = allEvents.find((e: Event) => e.id === eventId);
      
      // 🔧 提前计算 isSystemChild（用于后续逻辑，避免作用域问题）
      const isSystemChild = !isParentMode && (updatedEvent.isTimer || updatedEvent.isTimeLog || updatedEvent.isOutsideApp);
      
      let result;
      
      if (!existingEvent) {
        // ==================== 场景 1: 创建新事件 (非Timer) ====================
        console.log('🆕 [EventEditModalV2] Creating new event:', eventId);
        
        // 🔧 确保使用正确的 eventId
        updatedEvent.id = eventId;
        
        // 使用 EventHub.createEvent() 创建完整事件
        // EventHub 会自动：
        // 1. 缓存事件快照
        // 2. 调用 EventService.createEvent() 持久化
        // 3. EventService 触发 eventsUpdated 事件
        // 4. TimeCalendar 监听 eventsUpdated 自动刷新
        result = await EventHub.createEvent(updatedEvent);
        
        if (result.success) {
          console.log('✅ [EventEditModalV2] Event created via EventHub:', result.event?.id);
          
          // 记录创建历史（用于 EventLog timestamp）
          if (result.event) {
            EventHistoryService.logCreate(result.event);
            console.log('📝 [EventEditModalV2] Event creation logged to EventHistoryService');
          }
        } else {
          throw new Error(result.error || 'Failed to create event');
        }
      } else {
        // ==================== 场景 2: 更新已存在事件 ====================
        console.log('📝 [EventEditModalV2] Updating existing event:', eventId);
        
        // 🔧 确保使用正确的 eventId
        updatedEvent.id = eventId;
        
        // 使用 EventHub.updateFields() 增量更新
        // 优势：
        // 1. 只更新变化的字段，避免覆盖其他字段
        // 2. 自动记录变化日志（调试用）
        // 3. 合并当前快照，确保数据完整性
        // 
        // 🔧 Timer 运行中：保持 syncStatus='local-only'
        
        // 🆕 自动设置 isTask 规则：如果时间不完整，自动标记为 Task
        // 根据 EventHub Architecture:
        // - isTask = true: Task 类型，startTime/endTime 可选（同步到 Microsoft To Do）
        // - isTask = false/undefined: Calendar 事件，startTime/endTime 必需（同步到 Outlook Calendar）
        let finalIsTask = updatedEvent.isTask;
        const hasCompleteTime = updatedEvent.startTime && updatedEvent.endTime;
        
        if (!hasCompleteTime && finalIsTask !== true) {
          // 时间缺失且未明确标记为 Task → 自动设置为 Task
          finalIsTask = true;
          console.log('[EventEditModalV2] 🔄 自动设置 isTask=true (时间不完整)');
        }
        
        result = await EventHub.updateFields(eventId, {
          title: updatedEvent.title,
          tags: updatedEvent.tags,
          isTask: finalIsTask, // 🔄 使用计算后的值
          isTimer: updatedEvent.isTimer,
          parentEventId: updatedEvent.parentEventId,
          startTime: updatedEvent.startTime,
          endTime: updatedEvent.endTime,
          isAllDay: updatedEvent.isAllDay,
          location: updatedEvent.location,
          organizer: updatedEvent.organizer,
          attendees: updatedEvent.attendees,
          eventlog: updatedEvent.eventlog,
          description: updatedEvent.description,
          syncStatus: updatedEvent.syncStatus, // 🔧 包含 Timer 的 local-only 状态
          // 🔧 日历同步配置字段（单一数据结构）
          calendarIds: updatedEvent.calendarIds,
          syncMode: updatedEvent.syncMode,
          // 🔧 手动子事件：标记是否自定义过配置（用于父事件更新时判断是否继承）
          hasCustomSyncConfig: !isParentMode && !isSystemChild ? true : undefined,
          // 🔧 父事件专用：子事件配置模板（仅在父模式下保存）
          subEventConfig: isParentMode ? updatedEvent.subEventConfig : undefined,
        }, {
          source: 'EventEditModalV2' // 标记更新来源，用于调试
        });
        
        if (result.success) {
          console.log('✅ [EventEditModalV2] Event updated via EventHub:', eventId);
        } else {
          throw new Error(result.error || 'Failed to update event');
        }
      }

      // 🔧 Step 9.5: 系统子事件：更新父事件的 subEventConfig
      // 架构关键：系统子事件在 EditModal 中修改的实际是父事件的 subEventConfig
      // 修改后触发批量更新，同步到所有系统子事件
      // (isSystemChild 已在上面计算)
      
      if (isSystemChild && formData.parentEventId) {
        console.log('🔧 [EventEditModalV2] 系统子事件：更新父事件的 subEventConfig:', {
          childId: eventId,
          parentId: formData.parentEventId,
          calendarIds: updatedEvent.calendarIds,
          syncMode: updatedEvent.syncMode
        });
        
        // 更新父事件的 subEventConfig（子事件配置模板）
        await EventHub.updateFields(formData.parentEventId, {
          subEventConfig: {
            calendarIds: updatedEvent.calendarIds,
            syncMode: updatedEvent.syncMode
          }
        }, {
          source: 'EventEditModalV2-SystemChildToParentConfig'
        });
        
        console.log('✅ [EventEditModalV2] 父事件的 subEventConfig 已更新');
        
        // 🔧 批量更新父事件的所有系统子事件（保持一致性）
        const parentEvent = await EventService.getEventById(formData.parentEventId);
        const allSiblings = await EventService.getSubordinateEvents(formData.parentEventId);
        
        console.log('🔗 [EventEditModalV2] 批量更新所有兄弟系统子事件:', {
          parentId: formData.parentEventId,
          siblingCount: allSiblings.length,
          calendarIds: updatedEvent.calendarIds,
          syncMode: updatedEvent.syncMode
        });
        
        for (const sibling of allSiblings) {
          if (sibling.id !== eventId) { // 跳过当前事件（已更新）
            console.log('  🔹 [EventEditModalV2] 同步兄弟事件:', sibling.id);
            await EventHub.updateFields(sibling.id, {
              calendarIds: updatedEvent.calendarIds,
              syncMode: updatedEvent.syncMode
            }, {
              source: 'EventEditModalV2-SystemChildToSiblings'
            });
          }
        }
        
        console.log('✅ [EventEditModalV2] 所有兄弟系统子事件已同步完成');
      }

      // 🔧 Step 10: 父子事件架构处理（使用新的单一数据结构）
      // ⚠️ 重要：必须在 mainEvent 保存之后执行，确保同步的数据是最新的
      // 父模式：batch update 子事件；子模式：sync 计划字段到父事件
      console.log('🔗 [EventEditModalV2] 开始父子事件同步，模式:', isParentMode ? '父事件模式' : '子事件模式');
      
      if (isParentMode) {
        // ==================== 父事件模式：批量更新所有子事件 ====================
        const childrenToUpdate = await EventService.getChildEvents(eventId);
        
        if (childrenToUpdate.length > 0) {
          console.log('🔗 [EventEditModalV2] 父事件模式：批量更新子事件 calendarIds + syncMode:', {
            parentId: eventId,
            childCount: childrenToUpdate.length,
            calendarIds: updatedEvent.calendarIds,
            syncMode: updatedEvent.syncMode
          });
          
          for (const childEvent of childrenToUpdate) {
            // 🔧 区分三类子事件：
            // 1. 系统子事件（isTimer/isTimeLog/isOutsideApp）：始终更新
            // 2. 手动子事件 + 已自定义配置（hasCustomSyncConfig=true）：跳过更新
            // 3. 手动子事件 + 默认继承（hasCustomSyncConfig=false/undefined）：更新配置
            const isSystemChild = EventService.isSubordinateEvent(childEvent);
            const hasCustomConfig = childEvent.hasCustomSyncConfig === true;
            
            if (isSystemChild) {
              console.log('  🔹 [EventEditModalV2] 更新系统子事件:', childEvent.id);
              await EventHub.updateFields(childEvent.id, {
                calendarIds: updatedEvent.calendarIds,
                syncMode: updatedEvent.syncMode,
              }, {
                source: 'EventEditModalV2-ParentToSystemChildren'
              });
            } else if (!hasCustomConfig) {
              console.log('  🔹 [EventEditModalV2] 更新手动子事件（默认继承）:', childEvent.id);
              await EventHub.updateFields(childEvent.id, {
                calendarIds: updatedEvent.calendarIds,
                syncMode: updatedEvent.syncMode,
              }, {
                source: 'EventEditModalV2-ParentToInheritedChildren'
              });
            } else {
              console.log('  ⏭️ [EventEditModalV2] 跳过手动子事件（已自定义）:', childEvent.id);
            }
          }
          
          console.log('✅ [EventEditModalV2] 所有子事件已同步完成');
        } else {
          console.log('ℹ️ [EventEditModalV2] 父事件无子事件，跳过批量更新');
        }
      } else {
        // ==================== 子事件模式：同步计划字段到父事件 ====================
        // 🔧 关键架构修正：只有手动子事件才同步到父事件
        // - 系统子事件 (isTimer/isTimeLog/isOutsideApp): 不同步到父事件主配置
        // - 手动子事件: 同步计划字段到父事件
        const isSystemChild = updatedEvent.isTimer || updatedEvent.isTimeLog || updatedEvent.isOutsideApp;
        
        if (isSystemChild) {
          console.log('ℹ️ [EventEditModalV2] 系统子事件，跳过同步到父事件:', eventId);
        } else {
          const parentEvent = await EventService.getEventById(formData.parentEventId!);
          if (parentEvent && parentEvent !== null) {
            console.log('🔗 [EventEditModalV2] 手动子事件模式：同步计划字段到父事件:', {
              childId: eventId,
              parentId: formData.parentEventId
            });
            
            // 同步：标题、标签、时间、地点、参与者、日历配置
            await EventHub.updateFields(formData.parentEventId!, {
              title: updatedEvent.title,
              tags: updatedEvent.tags,
              emoji: updatedEvent.emoji,
              color: updatedEvent.color,
              startTime: updatedEvent.startTime,
              endTime: updatedEvent.endTime,
              isAllDay: updatedEvent.isAllDay,
              location: updatedEvent.location,
              attendees: updatedEvent.attendees,
              calendarIds: updatedEvent.calendarIds,
              syncMode: updatedEvent.syncMode,
            }, {
              source: 'EventEditModalV2-ChildToParent'
            });
            
            console.log('✅ [EventEditModalV2] 父事件计划字段已同步完成');
          } else {
            console.warn('⚠️ [EventEditModalV2] 子事件的父事件不存在:', formData.parentEventId);
          }
        }
      }

      // 🔧 Step 11: 同步 titleRef 与 formData.title（保存成功后）
      // 🔥 关键：保存成功后，titleRef 必须与 formData.title 保持一致
      // 原因：如果用户编辑标题后保存，formData.title 被更新（含 emoji），
      //       但 titleRef 还是编辑时的值（不含 emoji），下次保存会出错
      titleRef.current = formData.title;
      console.log('✅ [handleSave] 同步 titleRef.current =', formData.title?.substring(0, 50));
      
      // 🔧 Step 12: 通知父组件（TimeCalendar 或 App.handleTimerEditSave）
      // onSave 回调会触发：
      // - TimeCalendar: handleSaveEventFromModal() → 关闭弹窗、清理状态
      // - App.tsx: handleTimerEditSave() → 启动计时器、创建 Timer 事件（已被 Step 7 拦截）
      onSave(updatedEvent);
      
    } catch (error) {
      console.error('❌ [EventEditModalV2] Save failed:', error);
      // TODO: 显示错误提示给用户
    }
  };

  // 获取日历显示信息（单个）
  const getCalendarInfo = (calendarId: string) => {
    const calendar = availableCalendars.find(c => c.id === calendarId);
    if (!calendar) return { name: 'Unknown', subName: '', color: '#999999' };
    
    // 从 calendar.name 中解析名称，去除 emoji 前缀（使用兼容的正则表达式）
    const cleanName = calendar.name.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF]+\s*/, ''); // 去除 emoji
    const [mainName, subName] = cleanName.includes(': ') ? cleanName.split(': ') : [cleanName, ''];
    
    return {
      name: mainName,
      subName: subName ? `: ${subName}` : '',
      color: calendar.color
    };
  };

  // 获取多选日历显示信息（第一个 + 等）
  const getMultiCalendarDisplayInfo = (calendarIds: string[]) => {
    if (calendarIds.length === 0) {
      return { displayText: '选择日历...', color: '#9ca3af', hasMore: false, subName: '' };
    }
    
    const firstCalendar = availableCalendars.find(c => c.id === calendarIds[0]);
    if (!firstCalendar) {
      return { displayText: '未知日历', color: '#999999', hasMore: calendarIds.length > 1, subName: '' };
    }
    
    const cleanName = firstCalendar.name.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF]+\s*/, '');
    const [mainName, subName] = cleanName.includes(': ') ? cleanName.split(': ') : [cleanName, ''];
    
    return {
      displayText: mainName,
      subName: subName ? `: ${subName}` : '',
      color: firstCalendar.color,
      hasMore: calendarIds.length > 1
    };
  };

  /**
   * 格式化参与者为 description 文本（Private 模式）
   * 📧 参与者：alice@company.com, bob@company.com
   */
  const formatParticipantsToDescription = (attendees: Contact[]): string => {
    if (!attendees || attendees.length === 0) return '';
    
    const participantList = attendees
      .map(contact => contact.email || contact.name)
      .filter(Boolean)
      .join(', ');
    
    return participantList ? `📧 参与者：${participantList}\n\n` : '';
  };

  /**
   * 从 description 中提取参与者（Private 模式接收时使用）
   */
  const extractParticipantsFromDescription = (description: string): { attendees: Contact[], cleanDescription: string } => {
    const participantPattern = /^📧 参与者：(.+?)\n\n/;
    const match = description.match(participantPattern);
    
    if (!match) {
      return { attendees: [], cleanDescription: description };
    }
    
    const participantText = match[1];
    const attendees: Contact[] = participantText.split(',').map(email => ({
      email: email.trim(),
      name: email.trim().split('@')[0]
    }));
    
    const cleanDescription = description.replace(participantPattern, '');
    
    return { attendees, cleanDescription };
  };

  /**
   * 获取事件来源信息（按照 PRD 的 6 层优先级）
   * 优先级：
   * 1. Timer 子事件继承父事件来源
   * 2. 外部日历事件（Outlook/Google/iCloud）
   * 3. 独立 Timer 事件
   * 4. Plan 事件
   * 5. TimeCalendar 事件
   * 6. 其他本地事件
   */
  const getEventSourceInfo = async (evt: Event | null) => {
    if (!evt) {
      return { emoji: null, name: 'ReMarkable', icon: remarkableLogo, color: '#3b82f6' };
    }

    // 1. Timer 子事件 - 递归获取父事件的来源
    if (evt.isTimer && evt.parentEventId) {
      const parentEvent = await EventService.getEventById(evt.parentEventId);
      if (parentEvent) {
        return getEventSourceInfo(parentEvent);
      }
    }

    // 2. 外部日历事件
    if (evt.source === 'outlook' || evt.source === 'google' || evt.source === 'icloud') {
      const calendarId = evt.calendarIds?.[0];
      const calendar = calendarId ? availableCalendars.find(c => c.id === calendarId) : null;
      const calendarName = calendar ? calendar.name.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF]+\s*/, '') : '默认';
      
      switch (evt.source) {
        case 'outlook':
          return { emoji: null, name: `Outlook: ${calendarName}`, icon: '📧', color: '#0078d4' };
        case 'google':
          return { emoji: null, name: `Google: ${calendarName}`, icon: '📅', color: '#4285f4' };
        case 'icloud':
          return { emoji: null, name: `iCloud: ${calendarName}`, icon: '☁️', color: '#007aff' };
      }
    }

    // 3. 独立 Timer 事件（没有父事件的 Timer）
    if (evt.isTimer && !evt.parentEventId) {
      return { emoji: '⏱️', name: '4DNote计时', icon: null, color: '#f59e0b' };
    }

    // 4. Plan 事件
    if (evt.isPlan) {
      return { emoji: '✅', name: '4DNote计划', icon: null, color: '#10b981' };
    }

    // 5. TimeCalendar 事件
    if (evt.isTimeCalendar) {
      return { emoji: null, name: 'ReMarkable', icon: remarkableLogo, color: '#3b82f6' };
    }

    // 6. 其他本地事件
    return { emoji: null, name: 'ReMarkable', icon: remarkableLogo, color: '#3b82f6' };
  };

  // 获取同步模式显示信息
  const getSyncModeInfo = (modeId: string) => {
    const mode = syncModes.find(m => m.id === modeId);
    return mode || { id: 'unknown', name: '未知模式', emoji: '❓' };
  };

  /**
   * ==================== props.event 变化同步 ====================
   * 
   * 触发场景：
   * 1. 打开编辑弹窗：TimeCalendar 传入新的 event 对象
   * 2. 切换事件：用户在弹窗中切换编辑不同事件（未实现）
   * 
   * 同步策略：
   * - 依赖 event.id 变化（避免频繁更新）
   * - 完整覆盖 formData（清除之前的编辑状态）
   * - 保持 eventlog 格式一致性（Slate JSON 字符串）
   * 
   * 注意：
   * - 不监听 event 对象本身（会导致无限循环）
   * - event?.id 可能为 undefined（新建事件）
   * - 时间字段从 event.startTime/endTime 同步（不调用 TimeHub）
   */
  // 🔥 [删除] 重复的formData初始化useEffect - formData已在useState中初始化，不需要useEffect再次设置
  // 这个useEffect会在首次render后触发setFormData，导致re-render和TitleSlate unmount
  
  // 初始化时手动提取演示数据的联系人到联系人库
  useEffect(() => {
    console.log('[EventEditModalV2] 初始化：手动提取联系人');
    ContactService.extractAndAddFromEvent(formData.organizer, formData.attendees);
  }, []); // 只在挂载时执行一次
  
  // 监听滚动位置，控制顶部阴影
  useEffect(() => {
    const editorWrapper = rightPanelRef.current;
    if (!editorWrapper) return;
    
    const handleScroll = () => {
      const scrollTop = editorWrapper.scrollTop;
      // 当滚动超过 10px 时显示阴影
      setShowTopShadow(scrollTop > 10);
    };
    
    editorWrapper.addEventListener('scroll', handleScroll);
    // 初始检查
    handleScroll();
    
    return () => {
      editorWrapper.removeEventListener('scroll', handleScroll);
    };
  }, [isDetailView]); // 当视图切换时重新绑定

  // Ref for title input (contentEditable div)
  const titleInputRef = useRef<HTMLDivElement>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const tagRowRef = useRef<HTMLDivElement>(null);
  const tagPickerDropdownRef = useRef<HTMLDivElement>(null);
  const sourceCalendarRef = useRef<HTMLDivElement>(null);
  const sourceSyncModeRef = useRef<HTMLDivElement>(null);
  const syncCalendarRef = useRef<HTMLDivElement>(null);
  const syncSyncModeRef = useRef<HTMLDivElement>(null);

  // 输入法状态跟踪
  const isComposingRef = useRef(false);
  const resizeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 动态调整 contentEditable 宽度（高度由 CSS 自适应）
  const autoResizeTextarea = useCallback((element: HTMLElement | null, immediate = false) => {
    if (!element) return;
    
    const text = element.textContent || '';
    const maxWidth = 240;
    
    if (!text) {
      // 空内容时使用 placeholder 计算宽度
      const placeholder = element.getAttribute('data-placeholder') || '';
      if (placeholder) {
        element.style.width = 'max-content';
        const naturalWidth = element.offsetWidth;
        element.style.width = Math.min(naturalWidth, maxWidth) + 'px';
      } else {
        element.style.width = '80px'; // 默认最小宽度（足够显示4个中文字）
      }
      return;
    }
    
    // 临时设置为 max-content 让浏览器计算实际宽度
    element.style.width = 'max-content';
    const naturalWidth = element.offsetWidth;
    
    // 立即应用最终宽度（不超过最大宽度）
    element.style.width = Math.min(naturalWidth, maxWidth) + 'px';
  }, []);

  // 立即调整函数（无防抖，无延迟）
  const immediateResize = useCallback(() => {
    // 如果正在输入法输入，完全跳过宽度计算
    if (isComposingRef.current) {
      return;
    }
    
    autoResizeTextarea(titleInputRef.current as HTMLElement, true);
  }, [autoResizeTextarea]);

  // 同步 formData.title 到 contentEditable（只在外部更改时）
  useEffect(() => {
    const element = titleInputRef.current as HTMLElement | null;
    if (!element) return;
    
    const currentHtml = element.innerHTML;
    const newHtml = removeEmojiFromTitle(formData.title);
    
    // 只在内容真正不同时才更新（避免用户输入时被覆盖）
    if (currentHtml !== newHtml && document.activeElement !== element) {
      // 保存滚动位置
      const scrollTop = element.scrollTop;
      element.innerHTML = newHtml;
      element.scrollTop = scrollTop;
      
      // 调整宽度
      autoResizeTextarea(element, true);
    }
  }, [formData.title, autoResizeTextarea]);
  
  // 首次渲染时调整宽度
  useEffect(() => {
    const element = titleInputRef.current as HTMLElement | null;
    if (element && element.innerHTML === '') {
      element.innerHTML = removeEmojiFromTitle(formData.title);
      autoResizeTextarea(element, true);
    }
  }, []);

  // 点击外部关闭各种选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // 检查标签选择器
      const clickedInTagPicker = 
        (tagPickerRef.current && tagPickerRef.current.contains(target)) ||
        (tagPickerDropdownRef.current && tagPickerDropdownRef.current.contains(target));
      
      if (!clickedInTagPicker && showTagPicker) {
        setShowTagPicker(false);
      }

      // 检查来源日历选择器
      const clickedInSourceCalendar = sourceCalendarRef.current?.parentElement?.contains(target);
      if (!clickedInSourceCalendar && showSourceCalendarPicker) {
        setShowSourceCalendarPicker(false);
      }

      // 检查来源同步模式选择器
      const clickedInSourceSyncMode = sourceSyncModeRef.current?.parentElement?.contains(target);
      if (!clickedInSourceSyncMode && showSourceSyncModePicker) {
        setShowSourceSyncModePicker(false);
      }

      // 检查同步日历选择器
      const clickedInSyncCalendar = syncCalendarRef.current?.parentElement?.contains(target);
      if (!clickedInSyncCalendar && showSyncCalendarPicker) {
        setShowSyncCalendarPicker(false);
      }

      // 检查同步模式选择器
      const clickedInSyncSyncMode = syncSyncModeRef.current?.parentElement?.contains(target);
      if (!clickedInSyncSyncMode && showSyncSyncModePicker) {
        setShowSyncSyncModePicker(false);
      }

      // 时间选择器通过遮罩层处理点击外部关闭，这里不需要额外处理
    };

    if (showTagPicker || showSourceCalendarPicker || showSyncCalendarPicker || showSourceSyncModePicker || showSyncSyncModePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTagPicker, showSourceCalendarPicker, showSyncCalendarPicker, showSourceSyncModePicker, showSyncSyncModePicker]);

  // Timer 状态检测
  const isCurrentEventRunning = globalTimer?.isRunning && globalTimer?.parentEventId === formData.id;
  const isPaused = globalTimer?.isPaused || false;

  // Update current time every second when timer is running
  useEffect(() => {
    if (isCurrentEventRunning && !isPaused) {
      const interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isCurrentEventRunning, isPaused]);

  // ==================== Emoji 处理函数 ====================
  
  /**
   * 从字符串中提取第一个 emoji (支持纯文本和 Slate JSON)
   */
  const extractFirstEmoji = (text: string): string | null => {
    if (!text) return null;
    
    // 尝试解析为 Slate JSON
    try {
      if (text.trim().startsWith('[')) {
        const nodes = JSON.parse(text);
        if (Array.isArray(nodes) && nodes.length > 0) {
          const firstNode = nodes[0];
          if (firstNode.children && Array.isArray(firstNode.children)) {
            for (const child of firstNode.children) {
              if (child.text) {
                const emojiPattern = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/;
                const match = child.text.match(emojiPattern);
                if (match) return match[0];
              }
            }
          }
        }
      }
    } catch (e) {
      // 不是 JSON,当作纯文本处理
    }
    
    // 纯文本模式
    const emojiPattern = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/;
    const match = text.match(emojiPattern);
    return match ? match[0] : null;
  };

  /**
   * 获取显示的 emoji（优先级：标题 > 首个标签 > Timer状态 > 默认）
   */
  const getDisplayEmoji = useCallback((event: MockEvent): string => {
    // 优先级 1: 标题中的 emoji
    // MockEvent.title 是 string，但从 Event 读取时可能是 EventTitle 对象
    const titleText = event.title; // MockEvent 中已经是 string
    const titleEmoji = extractFirstEmoji(titleText);
    if (titleEmoji) return titleEmoji;
    
    // 优先级 2: 首个标签的 emoji
    if (event.tags && event.tags.length > 0) {
      const firstTag = TagService.getTagById(event.tags[0]);
      if (firstTag?.emoji) return firstTag.emoji;
    }
    
    // 优先级 3: Timer 运行中显示沙漏
    const isTimerActive = globalTimer?.eventId === event.id && globalTimer?.isRunning;
    if (isTimerActive) return '⏳';
    
    // 优先级 4: 默认图标（待填写的事件）
    return '📝';
  }, [globalTimer]);

  /**
   * 选择 emoji（标题用）
   */
  const handleTitleEmojiSelect = (emoji: any) => {
    console.log('😀 [EventEditModal] handleTitleEmojiSelect 触发:', emoji);
    console.log('😀 [EventEditModal] 当前 formData.title:', formData.title);
    
    try {
      // 解析当前标题 (Slate JSON)
      const nodes = JSON.parse(formData.title || '[{"type":"paragraph","children":[{"text":""}]}]');
      console.log('😀 [EventEditModal] 解析后的 nodes:', nodes);
      
      if (nodes.length > 0 && nodes[0].children) {
        // 移除现有 emoji
        let firstChild = nodes[0].children[0];
        if (firstChild && firstChild.text) {
          const existingEmoji = extractFirstEmoji(firstChild.text);
          console.log('😀 [EventEditModal] 现有 emoji:', existingEmoji);
          if (existingEmoji) {
            firstChild.text = firstChild.text.replace(existingEmoji, '').trim();
          }
          // 添加新 emoji
          firstChild.text = `${emoji.native} ${firstChild.text}`.trim();
          console.log('😀 [EventEditModal] 更新后的文本:', firstChild.text);
        } else {
          // 没有文本节点,创建一个
          nodes[0].children = [{ text: emoji.native }];
          console.log('😀 [EventEditModal] 创建新文本节点');
        }
        
        const newTitle = JSON.stringify(nodes);
        console.log('😀 [EventEditModal] 新的 title JSON:', newTitle);
        
        // 更新表单数据 (Layer 2 会在 5 秒后自动保存)
        setFormData(prev => {
          const updated = { ...prev, title: newTitle };
          console.log('😀 [EventEditModal] setFormData 更新 (Layer 2 会自动保存):', updated);
          return updated;
        });
      }
    } catch (error) {
      console.error('❌ [EventEditModal] handleTitleEmojiSelect error:', error);
    }
    
    // 关闭 Picker
    setShowEmojiPicker(false);
  };

  // ==================== 标题处理函数 ====================
  
  /**
   * 从标题中移除emoji，用于显示（支持 HTML 格式，去除块级标签）
   */
  const removeEmojiFromTitle = (title: string): string => {
    if (!title) return '';
    
    // 解析 HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = title;
    
    // 移除所有 p、div 等块级标签，只保留行内内容
    const blockTags = tempDiv.querySelectorAll('p, div, br');
    blockTags.forEach(tag => {
      // 将块级标签的内容提取出来
      const parent = tag.parentNode;
      while (tag.firstChild) {
        parent?.insertBefore(tag.firstChild, tag);
      }
      tag.remove();
    });
    
    // 获取处理后的 HTML
    let cleanHtml = tempDiv.innerHTML.trim();
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    
    // 移除 emoji
    const emoji = extractFirstEmoji(plainText);
    if (emoji) {
      cleanHtml = cleanHtml.replace(emoji, '').trim();
    }
    
    return cleanHtml;
  };

  const getTitlePlaceholder = useCallback((tags: string[]): string => {
    // 根据标签动态生成 placeholder
    if (!tags || tags.length === 0) return '事件标题';
    const firstTag = TagService.getTagById(tags[0]);
    // Timer 标签直接显示标签名，不添加"事项"
    return firstTag?.name || '事件标题';
  }, []);
  
  // 🔧 [2024-12-09] 使用 useMemo 缓存 placeholder，避免每次渲染时重新计算导致 TitleSlate props 变化
  const titlePlaceholder = useMemo(() => {
    return getTitlePlaceholder(formData.tags);
  }, [formData.tags, getTitlePlaceholder]);
  
  // 🔧 [2024-12-09] 缓存 titleContent，避免每次渲染时 formData.title || '' 创建新的字符串引用
  // 这对于中文输入法（IME）至关重要，任何 content prop 的变化都会中断输入法
  // 🔥 在传给 TitleSlate 之前，把 emoji 从 JSON 中剥离出来
  const titleContent = useMemo(() => {
    console.log('🔍 [titleContent useMemo] 重新计算', {
      title: formData.title?.substring(0, 50),
      titleLength: formData.title?.length
    });
    
    if (!formData.title) return '';
    
    try {
      // 解析 Slate JSON
      const nodes = JSON.parse(formData.title);
      
      // 遍历所有文本节点，移除 emoji
      const processedNodes = nodes.map((node: any) => {
        if (node.type === 'paragraph' && node.children) {
          return {
            ...node,
            children: node.children.map((child: any, index: number) => {
              // 只处理第一个文本节点
              if (index === 0 && child.text) {
                // 移除开头的 emoji（使用完整的 emoji 正则，包括代理对）
                // 匹配所有 emoji：基础 emoji、扩展 emoji、符号、修饰符等
                const emojiRegex = /^(?:[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F1E6}-\u{1F1FF}])+\s*/u;
                const textWithoutEmoji = child.text.replace(emojiRegex, '');
                return {
                  ...child,
                  text: textWithoutEmoji
                };
              }
              return child;
            })
          };
        }
        return node;
      });
      
      return JSON.stringify(processedNodes);
    } catch (error) {
      console.error('❌ [titleContent] 解析 Slate JSON 失败:', error);
      return formData.title || '';
    }
  }, [formData.title]);

  // 🔧 [已删除] 旧的 handleTitleChange (HTML版本) - 已改用 TitleSlate 的 blur-to-save 模式
  // 新的 handleTitleChange useCallback 定义在上方（行 842）

  // ==================== 标签处理函数 ====================
  
  /**
   * 构建标签层级路径
   */
  const buildTagPath = (tagId: string): string => {
    const parts: string[] = [];
    let currentTag = TagService.getTagById(tagId);
    
    while (currentTag) {
      parts.unshift(`${currentTag.emoji || ''}${currentTag.name}`);
      currentTag = currentTag.parentId ? TagService.getTagById(currentTag.parentId) : null;
    }
    
    return parts.join('/');
  };

  /**
   * 获取标签显示文本
   */
  const getTagsDisplayText = (tags: string[]): string => {
    if (!tags || tags.length === 0) return '选择标签...';
    
    const firstPath = buildTagPath(tags[0]);
    
    if (tags.length > 1) {
      return `#${firstPath} 等`;
    }
    return `#${firstPath}`;
  };

  // ==================== 时间处理函数 ====================
  
  /**
   * 格式化计时器运行时间
   */
  const formatElapsedTime = () => {
    if (!globalTimer || !isCurrentEventRunning) return '00:00';

    const safeElapsedTime = (globalTimer.elapsedTime && !isNaN(globalTimer.elapsedTime) && globalTimer.elapsedTime >= 0) 
      ? globalTimer.elapsedTime : 0;
    const safeStartTime = (globalTimer.startTime && !isNaN(globalTimer.startTime) && globalTimer.startTime > 0) 
      ? globalTimer.startTime : Date.now();

    let totalElapsed: number;
    if (globalTimer.isRunning && !globalTimer.isPaused) {
      // Running: accumulated + current session
      totalElapsed = safeElapsedTime + (Date.now() - safeStartTime);
    } else {
      // Paused: only accumulated
      totalElapsed = safeElapsedTime;
    }

    const totalSeconds = Math.floor(totalElapsed / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  /**
   * 格式化时间显示
   * 遵循 TIME_ARCHITECTURE: 处理 TimeSpec 格式 (YYYY-MM-DD HH:mm:ss)
   */
  const formatTimeDisplay = (startTime: string | null, endTime: string | null) => {
    if (!startTime) return null;
    
    // TimeSpec 格式转换: 空格 → T (ISO 8601)
    const start = new Date(startTime.replace(' ', 'T'));
    const end = endTime ? new Date(endTime.replace(' ', 'T')) : null;
    
    // 格式化日期和星期
    const dateStr = start.toLocaleDateString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }).replace(/\//g, '-');
    
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][start.getDay()];
    
    // 格式化时间
    const startTimeStr = start.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    if (!end) {
      return {
        dateStr,
        weekday,
        startTimeStr,
        endTimeStr: null,
        duration: null
      };
    }
    
    const endTimeStr = end.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    // 计算时长
    const diffMs = end.getTime() - start.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    
    let duration = '';
    if (hours > 0) {
      duration += `${hours}h`;
    }
    if (minutes > 0) {
      duration += `${minutes}min`;
    }
    
    return {
      dateStr,
      weekday,
      startTimeStr,
      endTimeStr,
      duration
    };
  };

  /**
   * 计算 Timer 事件的时长（毫秒）
   * 遵循 TIME_ARCHITECTURE: 处理 TimeSpec 格式 (YYYY-MM-DD HH:mm:ss)
   */
  const calculateTimerDuration = (timerEvent: Event): number => {
    if (!timerEvent.startTime || !timerEvent.endTime) return 0;
    // TimeSpec 格式转换: 空格 → T (ISO 8601)
    const start = new Date(timerEvent.startTime.replace(' ', 'T')).getTime();
    const end = new Date(timerEvent.endTime.replace(' ', 'T')).getTime();
    return end - start;
  };

  /**
   * 格式化时长（毫秒 → 人类可读格式）
   */
  const formatDuration = (durationMs: number): string => {
    const totalMinutes = Math.floor(durationMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h${minutes > 0 ? minutes + 'min' : ''}`;
    }
    return `${minutes}min`;
  };

  /**
   * 计算总时长（所有 Timer 子事件的累积时长）
   */
  const totalDuration = React.useMemo(() => {
    if (childEvents.length === 0) return 0;
    return childEvents.reduce((sum, timerEvent) => {
      return sum + calculateTimerDuration(timerEvent);
    }, 0);
  }, [childEvents]);

  /**
   * 检查两个时间是否跨天
   */
  const isCrossingDay = (startTime: string, endTime: string): boolean => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return start.getDate() !== end.getDate() || start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear();
  };

  /**
   * 处理时间选择完成
   * 
   * 架构说明：
   * 1. UnifiedDateTimePicker 返回 ISO 格式时间字符串
   * 2. 暂存到 formData（本地状态）
   * 3. 保存时统一通过 EventHub.createEvent/updateFields 持久化
   * 4. EventHub 会将时间字段保存到 EventService
   * 
   * 注意：
   * - 不在此处调用 TimeHub.setEventTime()（避免部分保存）
   * - 时间字段随其他字段一起在 handleSave() 中保存
   * - 遵循"原子性保存"原则：要么全部保存，要么全部回滚
   */
  const handleTimeApplied = (startIso: string, endIso?: string, allDay?: boolean) => {
    console.log('\u23f0 [EventEditModalV2] handleTimeApplied \u8c03\u7528:', { startIso, endIso, allDay });
    
    // \u2705 \u4f7f\u7528\u51fd\u6570\u5f0f\u66f4\u65b0\uff0c\u907f\u514d\u95ed\u5305\u9677\u9631
    setFormData(prev => {
      const updated = {
        ...prev,
        startTime: startIso,
        endTime: endIso || null,
        allDay: allDay || false
      };
      
      console.log('\u2705 [EventEditModalV2] formData \u65f6\u95f4\u5df2\u66f4\u65b0:', {
        prev_startTime: prev.startTime,
        prev_endTime: prev.endTime,
        new_startTime: updated.startTime,
        new_endTime: updated.endTime
      });
      
      return updated;
    });
    
    setShowTimePicker(false);
  };

  /**
   * 打开标签选择器并计算位置
   */
  const handleOpenTagPicker = () => {
    if (tagRowRef.current) {
      const rect = tagRowRef.current.getBoundingClientRect();
      setTagPickerPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    }
    setShowTagPicker(true);
  };

  // ==================== Checkbox 处理 ====================
  
  const handleTaskCheckboxChange = (checked: boolean) => {
    setFormData({ ...formData, isTask: checked });
  };

  // ==================== TimeLog 处理函数 ====================
  
  /**
   * TimeLog 内容变化处理（ModalSlate）
   * @param slateJson - Slate JSON 字符串（从 ModalSlate 的 onChange 回调接收）
   */
  const handleTimelogChange = (slateJson: string) => {
    // 🔧 将 JSON 字符串转换为对象（EventService 需要 Descendant[] 数组）
    console.log('📝 [EventEditModalV2] EventLog 变化:', {
      slateJsonLength: slateJson.length,
      preview: slateJson.substring(0, 100)
    });
    
    try {
      const slateNodes = JSON.parse(slateJson);
      setFormData({
        ...formData,
        eventlog: slateNodes as any,  // ✅ Slate JSON 对象（Descendant[] 数组）
      });
    } catch (error) {
      console.error('❌ [EventEditModalV2] Slate JSON 解析失败:', error);
      // 保留字符串格式作为后备
      setFormData({
        ...formData,
        eventlog: slateJson as any,
      });
    }
  };

  /**
   * Slate 编辑器就绪回调
   */
  const handleSlateEditorReady = (editor: any) => {
    slateEditorRef.current = editor;
  };

  /**
   * FloatingToolbar 表情选择 - 暂时禁用
   */
  const handleEmojiSelect = (emoji: any) => {
    if (slateEditorRef.current?.editor) {
      // emoji 可能是对象（来自 emoji-mart）或字符串
      const emojiStr = typeof emoji === 'string' ? emoji : emoji.native;
      insertEmoji(slateEditorRef.current.editor, emojiStr);
    }
    setActivePickerIndex(-1); // 关闭 picker
  };

  /**
   * FloatingToolbar 标签选择 - 暂时禁用
   */
  const handleTagSelect = (tagId: string) => {
    if (slateEditorRef.current?.editor) {
      const tag = TagService.getTagById(tagId);
      if (tag) {
        insertTag(
          slateEditorRef.current.editor,
          tagId,
          tag.name,
          tag.color || '#999999',
          tag.emoji || '',
          false // mentionOnly
        );
      }
    }
    setActivePickerIndex(-1); // 关闭 picker
  };

  /**
   * FloatingToolbar 日期范围选择
   */
  const handleDateRangeSelect = (startDate: string, endDate?: string) => {
    if (slateEditorRef.current?.editor) {
      insertDateMention(
        slateEditorRef.current.editor,
        startDate,
        endDate,
        false // mentionOnly
      );
    }
    setActivePickerIndex(-1); // 关闭 picker
  };

  // ==================== 渲染函数 ====================

  // 获取同步模式图标
  const getSyncModeIcon = (syncMode: string | undefined) => {
    // 暂时统一使用 syncIcon，后续可以添加更多图标
    return syncIcon;
  };

  // 渲染信息区域（上方）
  const renderInfoSection = () => {
    // 获取标签服务
    const allTags = TagService.getFlatTags();
    
    return (
      <div className="logtab-info-section">
        {/* Title 行 */}
        <div className="info-title-row">
          {/* Emoji */}
          <div 
            className="info-emoji" 
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            {getDisplayEmoji(formData)}
          </div>
          
          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div className="emoji-picker-overlay" onClick={() => setShowEmojiPicker(false)}>
              <div className="emoji-picker-wrapper" onClick={(e) => e.stopPropagation()}>
                <Picker
                  data={data}
                  onEmojiSelect={handleTitleEmojiSelect}
                  theme="light"
                  locale="zh"
                  perLine={8}
                  emojiSize={24}
                  previewPosition="none"
                  skinTonePosition="none"
                />
              </div>
            </div>
          )}
          
          {/* TitleSlate */}
          <div className="info-title-slate">
            <TitleSlate
              key={`title-slate-${formData.id}`}
              eventId={formData.id}
              content={titleContent}
              onChange={handleTitleChange}
              placeholder={titlePlaceholder}
              className="title-input"
              readOnly={false}
              autoFocus={false}
              hideEmoji={true}
            />
          </div>
        </div>

        {/* Metadata 两列布局 */}
        <div className="info-metadata-grid">
          {/* 左列 */}
          <div className="info-metadata-col">
            {/* Tags */}
            <div className="info-meta-row info-tags-wrapper">
              <img src={tagIcon} alt="tag" className="info-meta-icon" />
              <TagInput
                selectedTagIds={formData.tags}
                onSelectionChange={(newTagIds) => {
                  setFormData(prev => ({
                    ...prev,
                    tags: newTagIds
                  }));
                }}
                availableTags={allTags}
                className="info-tags-input"
              />
            </div>

            {/* Attendee */}
            <div className="info-meta-row">
              <img src={attendeeIcon} alt="attendee" className="info-meta-icon" />
              <span className="info-meta-label">参会人</span>
              <div className="info-meta-content">
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  {formData.attendees && formData.attendees.length > 0 
                    ? `${formData.attendees.length} 人`
                    : '添加参会人'}
                </span>
              </div>
            </div>

            {/* Location */}
            <div className="info-meta-row">
              <img src={locationIcon} alt="location" className="info-meta-icon" />
              <span className="info-meta-label">地点</span>
              <div className="info-meta-content">
                <span className="info-location-text">
                  {formData.location || '添加地点'}
                </span>
              </div>
            </div>
          </div>

          {/* 右列 */}
          <div className="info-metadata-col">
            {/* Notetree */}
            <div className="info-meta-row" onClick={() => setShowEventTree(true)}>
              <img src={notetreeIcon} alt="notetree" className="info-meta-icon" />
              <span className="info-meta-label">笔记树</span>
              <div className="info-meta-content">
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  {formData.parentEventId ? '有父事件' : 
                   (formData.childEventIds && formData.childEventIds.length > 0) 
                     ? `${formData.childEventIds.length} 个子事件` 
                     : '独立事件'}
                </span>
              </div>
              <img src={rightIcon} alt="expand" className="info-meta-arrow" />
            </div>

            {/* Time */}
            <div className="info-meta-row" onClick={() => setShowTimePicker(true)}>
              <img src={datetimeIcon} alt="time" className="info-meta-icon" />
              <div className="info-meta-content" style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                {(() => {
                  const timeInfo = formatTimeDisplay(formData.startTime, formData.endTime);
                  if (!timeInfo) {
                    return <span style={{ color: '#9ca3af', fontSize: '13px' }}>添加时间...</span>;
                  }
                  
                  return (
                    <>
                      <span style={{ fontSize: '13px' }}>{timeInfo.dateStr} ({timeInfo.weekday}) {timeInfo.startTimeStr}</span>
                      {timeInfo.endTimeStr && timeInfo.duration && (
                        <>
                          <div className="time-arrow-section">
                            <span className="duration-text">{timeInfo.duration}</span>
                            <img src={arrowBlueIcon} alt="" className="arrow-icon" />
                          </div>
                          <span style={{ fontSize: '13px' }}>{timeInfo.endTimeStr}</span>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Sync Mode */}
            <div className="info-meta-row">
              <img src={getSyncModeIcon(formData.syncMode)} alt="sync" className="info-meta-icon" />
              <span className="info-meta-label">同步</span>
              <div className="info-meta-content">
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  {formData.syncMode === 'bidirectional' ? '双向同步' :
                   formData.syncMode === 'send-only' ? '仅发送' :
                   formData.syncMode === 'receive-only' ? '仅接收' :
                   '本地存储'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 🔍 DEBUG: 检查 formData 初始化状态
  console.log('🎨 [LogTab] 准备渲染，formData 状态:', {
    id: formData.id,
    title: formData.title?.substring(0, 50),
    tagsCount: formData.tags?.length,
    eventlogLength: formData.eventlog?.length
  });

  // 📑 渲染目录窗口（右侧悬浮/固定的大纲导航）
  const renderToc = () => {
    if (!showToc && !tocPinned) return null;
    
    return (
      <div className={`logtab-toc ${tocPinned ? 'pinned' : 'floating'}`}>
        {/* 目录头部 */}
        <div className="logtab-toc-header">
          <span className="logtab-toc-title">目录</span>
          <div className="logtab-toc-actions">
            {/* Pin/Unpin 按钮 */}
            <button 
              className="logtab-toc-pin-btn"
              onClick={() => setTocPinned(!tocPinned)}
              title={tocPinned ? '取消固定' : '固定目录'}
            >
              📌
            </button>
            {/* 菜单按钮 */}
            <button 
              className="logtab-toc-menu-btn"
              onClick={() => setShowTocMenu(!showTocMenu)}
            >
              ⋮
            </button>
          </div>
          
          {/* 菜单下拉 */}
          {showTocMenu && (
            <div className="logtab-toc-menu">
              <div className="logtab-toc-menu-item" onClick={() => { /* 折叠 */ setShowTocMenu(false); }}>
                折叠全部
              </div>
              <div className="logtab-toc-menu-item" onClick={() => { /* 展开 */ setShowTocMenu(false); }}>
                展开全部
              </div>
              <div className="logtab-toc-menu-divider" />
              <div className="logtab-toc-menu-item" onClick={() => { /* 跳到页首 */ setShowTocMenu(false); }}>
                跳到页首
              </div>
              <div className="logtab-toc-menu-item" onClick={() => { /* 跳到页尾 */ setShowTocMenu(false); }}>
                跳到页尾
              </div>
              <div className="logtab-toc-menu-divider" />
              <div className="logtab-toc-menu-item" onClick={() => { setShowToc(false); setTocPinned(false); setShowTocMenu(false); }}>
                关闭目录
              </div>
            </div>
          )}
        </div>
        
        {/* 目录内容（从 EventLog 提取的标题大纲）*/}
        <div className="logtab-toc-content">
          {/* TODO: 实际目录项，从 ModalSlate 提取标题层级
              格式：
              - H1 标题
                - H2 子标题
                  - H3 子标题
              点击跳转到对应位置
          */}
          <div className="logtab-toc-empty">
            <div className="logtab-toc-empty-icon">📝</div>
            <div className="logtab-toc-empty-text">暂无标题</div>
            <div className="logtab-toc-empty-hint">在编辑器中添加标题后会自动显示</div>
          </div>
        </div>
      </div>
    );
  };

  // 📦 渲染主内容（Figma 新布局：上方信息区 + 下方编辑区）
  const renderModalContent = () => (
        <>
          <div className="logtab-container">
            {/* 上方：信息区 */}
            {renderInfoSection()}
            
            {/* 下方：EventLog 编辑区 */}
            <div 
              className={`logtab-eventlog-section ${tocPinned ? 'has-toc' : ''}`}
              onMouseEnter={() => !tocPinned && setShowToc(true)}
              onMouseLeave={() => !tocPinned && setShowToc(false)}
            >
              {/* 📝 ModalSlate 编辑器 */}
              <div className="logtab-editor-wrapper">
                <ModalSlate
                  ref={slateEditorRef}
                  key={`editor-${formData.id}`}
                  content={timelogContent}
                  parentEventId={formData.id || 'new-event'}
                  enableTimestamp={true}
                  placeholder="记录时间轴..."
                  onChange={handleTimelogChange}
                  className="eventlog-editor"
                />
              </div>

              {/* 🎨 HeadlessFloatingToolbar - 格式化工具栏 */}
              {floatingToolbar.mode !== 'hidden' && (
                <HeadlessFloatingToolbar
                  position={floatingToolbar.position}
                  mode={floatingToolbar.mode}
                  config={{ 
                    features: floatingToolbar.mode === 'text_floatingbar' 
                      ? ['bold', 'italic', 'textColor', 'bgColor', 'strikethrough', 'clearFormat', 'bullet']
                      : ['tag', 'emoji', 'dateRange', 'addTask', 'textStyle'],
                    mode: 'basic' as any
                  }}
                  editorMode="eventlog"
                  slateEditorRef={slateEditorRef}
                  activePickerIndex={activePickerIndex}
                  onActivePickerIndexConsumed={() => setActivePickerIndex(-1)}
                  onSubPickerStateChange={(isOpen: boolean, activePicker?: string | null) => {
                    setIsSubPickerOpen(isOpen);
                    setCurrentActivePicker(activePicker || null);
                  }}
                  onTextFormat={(command, value) => {
                    console.log('[LogTab] onTextFormat called:', { command, value, hasRef: !!slateEditorRef.current });
                    
                    // 🔧 对于 bullet 相关命令，使用 ModalSlate 的内部方法
                    if (command === 'toggleBulletList' || command === 'increaseBulletLevel' || command === 'decreaseBulletLevel') {
                      if (slateEditorRef.current?.applyTextFormat) {
                        console.log('[LogTab] 调用 ModalSlate.applyTextFormat');
                        slateEditorRef.current.applyTextFormat(command);
                      } else {
                        console.error('[LogTab] slateEditorRef.current.applyTextFormat 不存在');
                      }
                    } else {
                      // 其他命令使用 helpers.ts 的 applyTextFormat
                      if (slateEditorRef.current?.editor) {
                        applyTextFormat(slateEditorRef.current.editor, command, value);
                      }
                    }
                  }}
                  onTagSelect={(tagIds) => {
                    const tagId = Array.isArray(tagIds) ? tagIds[0] : tagIds;
                    handleTagSelect(tagId);
                    floatingToolbar.hideToolbar();
                  }}
                  onEmojiSelect={(emoji) => {
                    handleEmojiSelect(emoji);
                    floatingToolbar.hideToolbar();
                  }}
                  onDateRangeSelect={(start, end) => {
                    // ✅ 使用 formatTimeForStorage 而不是 toISOString()
                    const formattedTime = start ? formatTimeForStorage(start) : '';
                    handleDateRangeSelect(formattedTime);
                    floatingToolbar.hideToolbar();
                  }}
                  onRequestClose={floatingToolbar.hideToolbar}
                  availableTags={hierarchicalTags}
                  currentTags={formData.tags}
                  eventId={formData.id}
                />
              )}
              
              {/* 📑 目录窗口（在 eventlog-section 内部）*/}
              {renderToc()}
            </div>
          </div>

          {/* === 原有结构（临时隐藏，待完全迁移后删除）=== */}
          <div className="modal-content" style={{display: 'none'}}>
            <div className="event-overview">
              <div className="section-identity">
                {showEmojiPicker && (
                    <div className="emoji-picker-overlay" onClick={() => setShowEmojiPicker(false)}>
                      <div className="emoji-picker-wrapper" onClick={(e) => e.stopPropagation()}>
                        <Picker
                          data={data}
                          onEmojiSelect={handleTitleEmojiSelect}
                          theme="light"
                          locale="zh"
                          perLine={8}
                          emojiSize={24}
                          previewPosition="none"
                          skinTonePosition="none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Checkbox + 标题行 */}
                  <div className="title-checkbox-row">
                    <div 
                      className={`custom-checkbox ${formData.isTask ? 'checked' : ''}`}
                      onClick={() => handleTaskCheckboxChange(!formData.isTask)}
                    />
                    {/* 📌 TitleSlate 必须从 formData.title.colorTitle 读取（单一数据源） */}
                    {/* 🔥 CRITICAL: 使用 formData.id 作为 key 确保只在事件ID变化时才重新mount */}
                    <TitleSlate
                      key={`title-slate-${formData.id}`}
                      eventId={formData.id}
                      content={titleContent}
                      onChange={handleTitleChange}
                      placeholder={titlePlaceholder}
                      className="title-input"
                      readOnly={false}
                      autoFocus={false}
                      hideEmoji={true}
                    />
                  </div>

                  {/* 标签行 */}
                  <div className="eventmodal-v2-tags-row-wrapper" ref={tagPickerRef}>
                    <div 
                      className="eventmodal-v2-tags-row" 
                      ref={tagRowRef}
                      onClick={handleOpenTagPicker}
                    >
                      {formData.tags.length > 0 ? (
                        <>
                          {formData.tags.slice(0, 2).map((tagId, index) => {
                            const tag = TagService.getTagById(tagId);
                            if (!tag) return null;
                            return (
                              <React.Fragment key={tagId}>
                                {index > 0 && <span className="eventmodal-v2-tag-separator">/</span>}
                                <span className="eventmodal-v2-tag-chip" style={{ color: tag.color }}>
                                  #{tag.emoji && <span>{tag.emoji}</span>}
                                  {tag.name}
                                </span>
                              </React.Fragment>
                            );
                          })}
                          {formData.tags.length > 2 && <span className="eventmodal-v2-tag-etc">等</span>}
                        </>
                      ) : (
                        <span className="tag-placeholder">选择标签...</span>
                      )}
                    </div>
                  </div>

                  {/* HierarchicalTagPicker Popup - Fixed positioning */}
                  {showTagPicker && (
                    <div 
                      ref={tagPickerDropdownRef}
                      className="tag-picker-dropdown" 
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'fixed',
                        top: `${tagPickerPosition.top}px`,
                        left: `${tagPickerPosition.left}px`,
                        minWidth: `${Math.max(tagPickerPosition.width, 300)}px`,
                        zIndex: 9999
                      }}
                    >
                      <HierarchicalTagPicker
                        availableTags={availableTags.map((tag: any) => ({
                          id: tag.id,
                          name: tag.name,
                          color: tag.color,
                          emoji: tag.emoji,
                          level: tag.level || 0,
                          parentId: tag.parentId
                        }))}
                        selectedTagIds={formData.tags}
                        onSelectionChange={(selectedIds) => {
                          // 🆕 v2.0.5 标签变更时，自动处理日历映射（使用新架构：syncMode + subEventConfig）
                          const isLocalEvent = event?.fourDNoteSource === true || event?.source === 'local';
                          
                          // 提取标签的日历映射
                          const mappedCalendars = selectedIds
                            .map(tagId => {
                              const tag = TagService.getFlatTags().find(t => t.id === tagId);
                              return tag?.calendarMapping?.calendarId;
                            })
                            .filter((id): id is string => !!id);
                          
                          console.log('🏷️ [EventEditModalV2] 标签变更，自动映射日历:', {
                            selectedTags: selectedIds,
                            mappedCalendars,
                            isLocalEvent,
                            '当前syncMode': formData.syncMode,
                            '当前subEventConfig': formData.subEventConfig
                          });
                          
                          // 更新 formData（使用新的 syncMode + subEventConfig 架构）
                          setFormData(prev => {
                            const updates: any = {
                              ...prev,
                              tags: selectedIds
                            };
                            
                            // 规则 1: 本地事件 - Plan 和 Actual 都自动添加映射日历
                            if (isLocalEvent) {
                              // ✅ 标签变更时不修改 syncMode（保留现有值或默认值）
                              // syncMode 只在初始化或用户手动修改时设置
                              
                              // 自动添加标签映射的日历（智能合并）
                              if (mappedCalendars.length > 0) {
                                updates.calendarIds = [...new Set([...(prev.calendarIds || []), ...mappedCalendars])];
                              }
                              
                              // ✅ Actual 配置（subEventConfig）
                              updates.subEventConfig = {
                                ...prev.subEventConfig,
                                // 标签变更时不修改 syncMode
                              };
                              
                              if (mappedCalendars.length > 0) {
                                updates.subEventConfig.calendarIds = [...new Set([...(prev.subEventConfig?.calendarIds || []), ...mappedCalendars])];
                              }
                              
                              console.log('✅ [EventEditModalV2] 本地事件：Plan + Actual 都添加映射日历', {
                                calendarIds: updates.calendarIds,
                                syncMode: prev.syncMode, // 保持不变
                                subEventConfig: updates.subEventConfig,
                                mappedCalendarsCount: mappedCalendars.length
                              });
                            }
                            // 规则 2: 远程事件 - Plan 保持不变，Actual 自动添加映射日历
                            else {
                              // ⛔ Plan 保持不变（不添加映射日历，不修改 syncMode）
                              // 标签变更时不修改 syncMode
                              
                              // ✅ Actual 配置
                              updates.subEventConfig = {
                                ...prev.subEventConfig,
                                // 标签变更时不修改 syncMode
                              };
                              
                              // ✅ Actual 添加映射日历
                              if (mappedCalendars.length > 0) {
                                updates.subEventConfig.calendarIds = [...new Set([...(prev.subEventConfig?.calendarIds || []), ...mappedCalendars])];
                              }
                              
                              console.log('✅ [EventEditModalV2] 远程事件：Actual 添加映射日历', {
                                subEventConfig: updates.subEventConfig,
                                mappedCalendarsCount: mappedCalendars.length
                              });
                            }
                            
                            return updates;
                          });
                          
                          setShowTagPicker(false);
                        }}
                        multiSelect={true}
                        mode="popup"
                        placeholder="搜索标签..."
                        onClose={() => setShowTagPicker(false)}
                      />
                    </div>
                  )}
                </div>

                {/* Timer 按钮 - 状态机实现 */}
                {(() => {
                  // 检查当前事件是否正在计时
                  // Timer 的 eventId 是自动生成的 timer-xxx，需要通过 parentEventId 匹配
                  // 🔧 使用 event.id 而不是 formData.id，确保父事件 ID 正确
                  const isCurrentEventRunning = globalTimer?.isRunning && globalTimer?.parentEventId === event?.id;
                  const isPaused = globalTimer?.isPaused;

                  // 状态1: 未开始计时 - 显示"开始专注"按钮
                  if (!isCurrentEventRunning) {
                    return (
                      <button 
                        className="timer-button-start"
                        onClick={async () => {
                          if (!onTimerAction || !event) return;
                          
                          // 🔧 检查事件是否存在于 localStorage
                          const eventExists = !!EventService.getEventById(event.id);
                          console.log('🔗 [Timer Start Button] 点击开始专注:', {
                            eventId: event.id,
                            eventExists,
                            tags: formData.tags
                          });
                          
                          // 🆕 如果事件不存在，直接使用 EventService 保存（不关闭 Modal）
                          if (!eventExists) {
                            console.log('⚠️ [Timer Start Button] 事件未保存，先保存事件...', {
                              formDataTitle: formData.title,
                              formDataTags: formData.tags,
                              eventId: event.id
                            });
                            
                            try {
                              // 直接使用 EventService 创建事件（不会关闭 Modal）
                              // 注意：根据 PRD，即使没有标题、没有标签也可以计时
                              
                              // 🔧 转换 title 格式：formData.title 是字符串，Event.title 需要对象
                              const titleObj = typeof formData.title === 'string' 
                                ? { simpleTitle: formData.title }
                                : formData.title;
                              
                              console.log('🔧 [Timer Start Button] 准备保存事件:', {
                                'formData.title': formData.title,
                                'titleObj': titleObj,
                                'event.title': event.title,
                                'formData keys': Object.keys(formData)
                              });
                              
                              const newEvent: Event = {
                                ...event,  // 保留原始事件的所有字段
                                ...formData,  // 覆盖用户修改的字段
                                title: titleObj,  // 确保 title 格式正确
                                id: event.id,
                                createdAt: event.createdAt || formatTimeForStorage(new Date()),
                                updatedAt: formatTimeForStorage(new Date()),
                                source: event.source || 'local',
                              } as Event;
                              
                              console.log('💾 [Timer Start Button] 合并后的 newEvent:', {
                                id: newEvent.id,
                                title: newEvent.title,
                                'title type': typeof newEvent.title,
                                tags: newEvent.tags,
                                source: newEvent.source,
                                fourDNoteSource: newEvent.fourDNoteSource
                              });
                              
                              await EventService.createEvent(newEvent);
                              console.log('✅ [Timer Start Button] 事件已保存到 localStorage');
                              
                              // ⏱️ 等待一小段时间，确保 eventsUpdated 事件已触发并处理完毕
                              await new Promise(resolve => setTimeout(resolve, 50));
                              
                              // 验证保存结果
                              const savedEvent = await EventService.getEventById(newEvent.id);
                              console.log('🔍 [Timer Start Button] 验证保存结果:', {
                                eventId: savedEvent?.id,
                                title: savedEvent?.title,
                                'title type': typeof savedEvent?.title,
                                tags: savedEvent?.tags
                              });
                              
                              if (!savedEvent) {
                                console.error('❌ [Timer Start Button] 验证失败：无法读取已保存的事件');
                                alert('保存事件失败，无法开始计时');
                                return;
                              }
                            } catch (error) {
                              console.error('❌ [Timer Start Button] 保存事件失败:', error);
                              alert('保存事件失败，无法开始计时');
                              return;
                            }
                          }
                          
                          // 开始计时
                          console.log('🔗 [Timer Start Button] 传递参数:', {
                            tags: formData.tags,
                            parentEventId: event.id,
                            eventExists: true
                          });
                          onTimerAction('start', formData.tags || [], event.id);
                        }}
                        title="开始计时"
                      >
                        <img src={timerStartIcon} alt="" />
                        开始专注
                      </button>
                    );
                  }

                  // 状态2: 正在计时 - 显示暂停/继续、结束、取消按钮组
                  return (
                    <div className="timer-buttons">
                      <button 
                        className="timer-btn pause-btn"
                        onClick={() => {
                          if (onTimerAction) {
                            // 🔧 暂停/继续不需要 tagIds
                            onTimerAction(isPaused ? 'resume' : 'pause');
                          }
                        }}
                        title={isPaused ? '继续' : '暂停'}
                      >
                        <img src={pauseIcon} alt={isPaused ? '继续' : '暂停'} />
                      </button>
                      <button 
                        className="timer-btn stop-btn"
                        onClick={() => {
                          if (onTimerAction && window.confirm('确定要结束计时并保存吗？')) {
                            // 🔧 stop 不需要额外参数，使用 globalTimer.eventId
                            onTimerAction('stop');
                          }
                        }}
                        title="停止并保存"
                      >
                        <img src={stopIcon} alt="停止" />
                      </button>
                      <button 
                        className="timer-btn cancel-btn"
                        onClick={() => {
                          if (onTimerAction && window.confirm('确定要取消计时吗？当前计时将不会被保存。')) {
                            // 🔧 cancel 不需要额外参数
                            onTimerAction('cancel');
                          }
                        }}
                        title="取消计时"
                      >
                        <img src={cancelIcon} alt="取消" />
                      </button>
                    </div>
                  );
                })()}

                {/* Timer elapsed time display */}
                {isCurrentEventRunning && (
                  <div className="timer-display">
                    {formatElapsedTime()}
                  </div>
                )}

                {/* 计划安排区域 */}
                <div className="eventmodal-v2-section-header">
                  <div className="eventmodal-v2-section-header-title">计划安排</div>
                  <div className="eventmodal-v2-section-header-buttons">
                    <button className="eventmodal-v2-header-text-btn">每周</button>
                    <button className="eventmodal-v2-header-icon-btn">
                      <img src={rotationColorIcon} alt="" />
                    </button>
                    <button className="eventmodal-v2-header-icon-btn">
                      <img src={addTaskColorIcon} alt="" />
                    </button>
                    <button className="eventmodal-v2-header-icon-btn">
                      <img src={ddlAddIcon} alt="" />
                    </button>
                  </div>
                </div>

                {/* 组织者和参与者 */}
                <AttendeeDisplay
                  event={formData as any}
                  currentUserEmail="current.user@company.com"
                  onChange={(attendees, organizer) => {
                    console.log('[EventEditModalV2Demo] Attendees changed:', { attendees, organizer });
                    
                    // 更新本地状态
                    setFormData(prev => ({
                      ...prev,
                      attendees,
                      organizer,
                    }));
                    
                    // ✨ 立即提取并保存联系人到联系人库
                    ContactService.extractAndAddFromEvent(organizer, attendees);
                    console.log('✅ [EventEditModalV2Demo] 已自动提取联系人到联系人库');
                  }}
                />

                {/* 时间显示 */}
                <div 
                  className="eventmodal-v2-plan-row" 
                  onClick={() => setShowTimePicker(true)} 
                  style={{ cursor: 'pointer' }}
                >
                  <img src={datetimeIcon} alt="" className="eventmodal-v2-plan-icon" />
                  <div className="eventmodal-v2-plan-content" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {(() => {
                      const timeInfo = formatTimeDisplay(formData.startTime, formData.endTime);
                      if (!timeInfo) {
                        return <span style={{ color: '#9ca3af' }}>添加时间...</span>;
                      }
                      
                      return (
                        <>
                          <span>{timeInfo.dateStr} ({timeInfo.weekday}) {timeInfo.startTimeStr}</span>
                          {timeInfo.endTimeStr && timeInfo.duration && (
                            <>
                              <div className="time-arrow-section">
                                <span className="duration-text">{timeInfo.duration}</span>
                                <img src={arrowBlueIcon} alt="" className="arrow-icon" />
                              </div>
                              <span>{timeInfo.endTimeStr}</span>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* 时间选择器弹出层 */}
                {showTimePicker && (
                  <div
                    style={{
                      position: 'fixed',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      zIndex: 1000,
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                    }}
                  >
                    <UnifiedDateTimePicker
                      initialStart={formData.startTime || undefined}
                      initialEnd={formData.endTime || undefined}
                      useTimeHub={true}
                      onApplied={handleTimeApplied}
                      onClose={() => setShowTimePicker(false)}
                    />
                  </div>
                )}

                {/* 时间选择器背景遮罩 */}
                {showTimePicker && (
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      zIndex: 999
                    }}
                    onClick={() => setShowTimePicker(false)}
                  />
                )}

                {/* 地点 */}
                <div className="eventmodal-v2-plan-row" style={{ cursor: 'pointer' }}>
                  <img src={locationIcon} alt="" className="eventmodal-v2-plan-icon" />
                  {isEditingLocation ? (
                    <LocationInput
                      value={formData.location || ''}
                      onChange={(value) => {
                        setFormData(prev => ({ ...prev, location: value }));
                      }}
                      onSelect={() => setIsEditingLocation(false)}
                      onBlur={() => setIsEditingLocation(false)}
                      placeholder="添加地点..."
                    />
                  ) : (
                    <div 
                      className="eventmodal-v2-plan-content" 
                      onClick={() => setIsEditingLocation(true)}
                    >
                      {formData.location || <span style={{ color: '#9ca3af' }}>添加地点...</span>}
                    </div>
                  )}
                </div>

                {/* 计划同步日历选择器（v2.0.3 新设计："来自" → "同步"）*/}
                <div className="eventmodal-v2-plan-row" style={{ marginTop: '4px' }}>
                  <span style={{ flexShrink: 0, color: '#6b7280' }}>同步</span>
                  <div className="eventmodal-v2-plan-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {/* 日历选择器（可编辑）*/}
                    <div style={{ position: 'relative', maxWidth: '200px', minWidth: '140px' }}>
                      <div 
                        ref={sourceCalendarRef}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          transition: 'background-color 0.15s',
                          maxWidth: '100%'
                        }}
                        onClick={() => setShowSourceCalendarPicker(!showSourceCalendarPicker)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {(() => {
                          // 🔧 父模式：显示mainEvent的calendarIds；子模式：显示parentEvent的calendarIds
                          const selectedIds = isParentMode 
                            ? (formData.calendarIds || [])
                            : (parentEvent?.calendarIds || []);
                          console.log('🎨 [计划日历选择器] 渲染:', {
                            isParentMode,
                            selectedIds,
                            'selectedIds.length': selectedIds.length,
                            'formData.calendarIds': formData.calendarIds,
                            'parentEvent.calendarIds': parentEvent?.calendarIds,
                            'availableCalendars数量': availableCalendars.length
                          });
                          
                          const isEmpty = selectedIds.length === 0;
                          
                          if (isEmpty) {
                            console.warn('⚠️ [计划日历选择器] selectedIds.length === 0，显示占位符');
                          }
                          
                          const firstCal = availableCalendars.find(c => c.id === selectedIds[0]);
                          if (!isEmpty) {
                            console.log('🎯 [计划日历选择器] 找到日历:', {
                              firstCalId: selectedIds[0],
                              firstCal,
                              availableCalendars: availableCalendars.map(c => ({ id: c.id, name: c.name }))
                            });
                          }
                          
                          return (
                            <>
                              {!isEmpty && (
                                <span style={{ 
                                  color: firstCal?.color || '#6b7280', 
                                  fontSize: '14px',
                                  flexShrink: 0
                                }}>●</span>
                              )}
                              <span style={{ 
                                fontSize: 'clamp(10px, 2vw, 14px)',
                                color: isEmpty ? '#9ca3af' : '#374151',
                                fontWeight: isEmpty ? 'normal' : 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                minWidth: 0
                              }}>
                                {isEmpty ? '选择日历...' : (firstCal?.name || '未知日历')}
                                {selectedIds.length > 1 && <span style={{ color: '#9ca3af' }}> 等</span>}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      
                      {showSourceCalendarPicker && createPortal(
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            position: 'fixed',
                            top: sourceCalendarRef.current ? (sourceCalendarRef.current.getBoundingClientRect().bottom + 4) : '50%',
                            left: sourceCalendarRef.current ? sourceCalendarRef.current.getBoundingClientRect().left : '50%',
                            zIndex: 9999,
                            minWidth: '200px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                          }}
                        >
                          <SimpleCalendarDropdown
                            availableCalendars={availableCalendars}
                            selectedCalendarIds={isParentMode ? (formData.calendarIds || []) : (parentEvent?.calendarIds || [])}
                            multiSelect={true}
                            onMultiSelectionChange={async (calendarIds) => {
                              console.log('📝 [EventEditModalV2] 计划日历变更:', { isParentMode, calendarIds });
                              
                              if (isParentMode) {
                                // 父模式：更新mainEvent的calendarIds
                                setFormData(prev => ({
                                  ...prev,
                                  calendarIds: calendarIds,
                                  // ✅ 用户手动选择日历时，设置默认 syncMode（只在首次设置）
                                  syncMode: prev.syncMode || 'bidirectional-private'
                                }));
                              } else {
                                // 子模式：实时同步到父事件
                                if (parentEvent) {
                                  console.log('🔗 [EventEditModalV2] 子事件模式：同步calendarIds到父事件:', parentEvent.id);
                                  const { EventHub } = await import('../services/EventHub');
                                  await EventHub.updateFields(parentEvent.id, {
                                    calendarIds: calendarIds,
                                  }, {
                                    source: 'EventEditModalV2-ChildToParent-PlanSync'
                                  });
                                  
                                  console.log('✅ [EventEditModalV2] 父事件calendarIds已实时同步');
                                }
                              }
                            }}
                            onClose={() => setShowSourceCalendarPicker(false)}
                            title="选择同步日历（可多选）"
                          />
                        </div>,
                        document.body
                      )}
                    </div>
                    
                    {/* 同步模式选择区域 */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div 
                        ref={sourceSyncModeRef}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          color: '#6b7280', 
                          fontSize: '13px',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          transition: 'background-color 0.15s',
                          whiteSpace: 'nowrap',
                          minWidth: '148px'
                        }}
                        onClick={() => setShowSourceSyncModePicker(!showSourceSyncModePicker)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <span style={{ flexShrink: 0, pointerEvents: 'none' }}>{getSyncModeInfo(sourceSyncMode || 'disabled').emoji}</span>
                        <span style={{ 
                          flex: 1,
                          pointerEvents: 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0
                        }}>{getSyncModeInfo(sourceSyncMode || 'disabled').name}</span>
                      </div>
                      
                      {showSourceSyncModePicker && createPortal(
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            position: 'fixed',
                            top: sourceSyncModeRef.current ? (sourceSyncModeRef.current.getBoundingClientRect().bottom + 4) : '50%',
                            right: sourceSyncModeRef.current ? (window.innerWidth - sourceSyncModeRef.current.getBoundingClientRect().right) : 'auto',
                            left: sourceSyncModeRef.current ? 'auto' : '50%',
                            zIndex: 9999,
                            minWidth: '200px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                          }}
                        >
                          <SyncModeDropdown
                            availableModes={syncModes}
                            selectedModeId={sourceSyncMode || 'disabled'}
                            onSelectionChange={async (modeId) => {
                              setSourceSyncMode(modeId);
                              setFormData(prev => ({
                                ...prev,
                                syncMode: modeId
                              }));
                              setShowSourceSyncModePicker(false);
                              
                              // 🔥 立即自动保存 syncMode，避免远程同步用旧值覆盖
                              if (eventId) {
                                console.log('💾 [SyncMode 变化] 立即保存到 EventService:', { eventId, syncMode: modeId });
                                await EventHub.updateFields(eventId, {
                                  syncMode: modeId
                                }, {
                                  source: 'EventEditModalV2-SyncModeChange'
                                });
                              }
                            }}
                            onClose={() => setShowSourceSyncModePicker(false)}
                            title="选择同步模式"
                          />
                        </div>,
                        document.body
                      )}
                    </div>
                  </div>

                </div>

                {/* 实际进展区域 */}
                <div className="eventmodal-v2-section-header" style={{ marginTop: '20px' }}>
                  <div className="eventmodal-v2-section-header-title">实际进展</div>
                  {childEvents.length > 0 && (
                    <span className="total-duration">总时长: {formatDuration(totalDuration)}</span>
                  )}
                </div>

                {/* 实际进展滚动容器 */}
                <div className="progress-section-wrapper">
                      {/* 时间片段列表 */}
                      <div className="timer-segments-list">
                        {childEvents.map((timerEvent) => {
                          if (!timerEvent.startTime || !timerEvent.endTime) return null;
                          
                          const start = new Date(timerEvent.startTime);
                          const end = new Date(timerEvent.endTime);
                          const isCrossDay = isCrossingDay(timerEvent.startTime, timerEvent.endTime);
                          
                          // 格式化日期和星期
                          const dateStr = start.toLocaleDateString('zh-CN', { 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit' 
                          }).replace(/\//g, '-');
                          const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][start.getDay()];
                          
                          // 格式化时间
                          const startTimeStr = start.toLocaleTimeString('zh-CN', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: false 
                          });
                          const endTimeStr = end.toLocaleTimeString('zh-CN', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: false 
                          });
                          
                          // 计算时长
                          const duration = formatDuration(calculateTimerDuration(timerEvent));
                          
                          return (
                            <div key={timerEvent.id} className="timer-segment">
                              <img src={timerCheckIcon} alt="" className="timer-check-icon" />
                              <span>{dateStr} ({weekday}) {startTimeStr}</span>
                              <div className="time-arrow-section">
                                <span className="duration-text">{duration}</span>
                                <img src={arrowBlueIcon} alt="" className="arrow-icon" />
                              </div>
                              <span>
                                {endTimeStr}
                                {isCrossDay && (
                                  <sup style={{ color: '#3b82f6', fontSize: '10px', marginLeft: '2px' }}>+1</sup>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* 空状态提示 */}
                      {childEvents.length === 0 && (
                        <div style={{ 
                          padding: '12px 0', 
                          textAlign: 'center', 
                          color: '#9ca3af', 
                          fontSize: '13px' 
                        }}>
                          还没有计时记录
                        </div>
                      )}
                </div>

                {/* 实际进展同步状态 */}
                <div className="eventmodal-v2-plan-row" style={{ marginTop: '4px' }}>
                  <span style={{ flexShrink: 0, color: '#6b7280' }}>同步</span>
                  <div className="eventmodal-v2-plan-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {/* 日历选择区域 */}
                      <div style={{ position: 'relative', maxWidth: '200px', minWidth: '140px' }}>
                        <div 
                          ref={syncCalendarRef}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            transition: 'background-color 0.15s',
                            maxWidth: '100%'
                          }}
                          onClick={() => setShowSyncCalendarPicker(!showSyncCalendarPicker)}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          {(() => {
                            const info = getMultiCalendarDisplayInfo(syncCalendarIds);
                            const isEmpty = syncCalendarIds.length === 0;
                            
                            return (
                              <>
                                {!isEmpty && (
                                  <span style={{ 
                                    color: info.color, 
                                    fontSize: '14px',
                                    flexShrink: 0
                                  }}>●</span>
                                )}
                                <span style={{ 
                                  fontSize: 'clamp(10px, 2vw, 14px)',
                                  color: isEmpty ? '#9ca3af' : '#374151',
                                  fontWeight: isEmpty ? 'normal' : 500,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  flex: 1,
                                  minWidth: 0
                                }}>
                                  {info.displayText}
                                  {info.hasMore && <span style={{ color: '#9ca3af' }}> 等</span>}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                        
                        {showSyncCalendarPicker && createPortal(
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                              position: 'fixed',
                              top: syncCalendarRef.current ? (syncCalendarRef.current.getBoundingClientRect().bottom + 4) : '50%',
                              left: syncCalendarRef.current ? syncCalendarRef.current.getBoundingClientRect().left : '50%',
                              zIndex: 9999,
                              minWidth: '200px',
                              backgroundColor: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                            }}
                          >
                            <SimpleCalendarDropdown
                              availableCalendars={availableCalendars}
                              selectedCalendarIds={syncCalendarIds}
                              multiSelect={true}
                              onMultiSelectionChange={async (calendarIds) => {
                                console.log('📝 [EventEditModalV2] 实际进展日历变更:', { isParentMode, calendarIds });
                                setSyncCalendarIds(calendarIds);
                                
                                if (isParentMode) {
                                  // 父模式：更新 subEventConfig 模板 + 批量更新现有子事件
                                  setFormData(prev => ({
                                    ...prev,
                                    subEventConfig: {
                                      ...prev.subEventConfig,
                                      calendarIds: calendarIds,
                                      // ✅ 用户手动选择日历时，设置默认 syncMode（只在首次设置）
                                      syncMode: prev.subEventConfig?.syncMode || 'bidirectional-private'
                                    }
                                  }));
                                  
                                  // 如果有子事件，批量更新
                                  if (childEvents.length > 0) {
                                    console.log('🔗 [EventEditModalV2] 父模式：批量更新子事件 calendarIds:', {
                                      childCount: childEvents.length,
                                      calendarIds
                                    });
                                    
                                    const { EventHub } = await import('../services/EventHub');
                                    for (const childEvent of childEvents) {
                                      if (childEvent.isTimer) {
                                        await EventHub.updateFields(childEvent.id, {
                                          calendarIds: calendarIds,
                                        }, {
                                          source: 'EventEditModalV2-ParentToChildren-ActualSync'
                                        });
                                      }
                                    }
                                    
                                    console.log('✅ [EventEditModalV2] 子事件 calendarIds 已实时更新');
                                  }
                                } else {
                                  // 子模式：更新当前事件（mainEvent）的 calendarIds
                                  setFormData(prev => ({
                                    ...prev,
                                    calendarIds: calendarIds
                                  }));
                                }
                              }}
                              onClose={() => setShowSyncCalendarPicker(false)}
                              title="选择同步日历（可多选）"
                            />
                          </div>,
                          document.body
                        )}
                      </div>
                      
                      {/* 同步模式选择区域 */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div 
                          ref={syncSyncModeRef}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            color: '#6b7280', 
                            fontSize: '13px',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            transition: 'background-color 0.15s',
                            whiteSpace: 'nowrap',
                            minWidth: '148px'
                          }}
                          onClick={() => setShowSyncSyncModePicker(!showSyncSyncModePicker)}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <span style={{ flexShrink: 0, pointerEvents: 'none' }}>{getSyncModeInfo(syncSyncMode || 'disabled').emoji}</span>
                          <span style={{ 
                            flex: 1,
                            pointerEvents: 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                              minWidth: 0
                            }}>{getSyncModeInfo(syncSyncMode || 'disabled').name}</span>
                          </div>                        {showSyncSyncModePicker && createPortal(
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                              position: 'fixed',
                              top: syncSyncModeRef.current ? (syncSyncModeRef.current.getBoundingClientRect().bottom + 4) : '50%',
                              right: syncSyncModeRef.current ? (window.innerWidth - syncSyncModeRef.current.getBoundingClientRect().right) : 'auto',
                              left: syncSyncModeRef.current ? 'auto' : '50%',
                              zIndex: 9999,
                              minWidth: '200px',
                              backgroundColor: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                            }}
                          >
                            <SyncModeDropdown
                              availableModes={syncModes}
                              selectedModeId={syncSyncMode || 'disabled'}
                              onSelectionChange={(modeId) => {
                                setSyncSyncMode(modeId);
                                
                                // 🔧 自动从标签映射中提取 calendarIds
                                const mappedCalendarIds: string[] = [];
                                if (formData.tags && formData.tags.length > 0) {
                                  const flatTags = TagService.getFlatTags();
                                  formData.tags.forEach(tagId => {
                                    const tag = flatTags.find(t => t.id === tagId);
                                    if (tag?.calendarMapping?.calendarId) {
                                      if (!mappedCalendarIds.includes(tag.calendarMapping.calendarId)) {
                                        mappedCalendarIds.push(tag.calendarMapping.calendarId);
                                      }
                                    }
                                  });
                                }
                                
                                // 合并用户选择的日历和标签映射的日历
                                const allCalendarIds = [...new Set([...syncCalendarIds, ...mappedCalendarIds])];
                                
                                if (isParentMode) {
                                  // 父模式：更新 subEventConfig 模板 + 批量更新现有子事件
                                  setFormData(prev => ({
                                    ...prev,
                                    subEventConfig: {
                                      ...prev.subEventConfig,
                                      calendarIds: allCalendarIds,
                                      syncMode: modeId
                                    }
                                  }));
                                  
                                  // 如果有子事件，批量更新
                                  (async () => {
                                    if (childEvents.length > 0) {
                                      console.log('🔗 [EventEditModalV2] 父模式：批量更新子事件 syncMode + calendarIds:', {
                                        childCount: childEvents.length,
                                        syncMode: modeId,
                                        calendarIds: allCalendarIds
                                      });
                                      
                                      const { EventHub } = await import('../services/EventHub');
                                      for (const childEvent of childEvents) {
                                        if (childEvent.isTimer) {
                                          await EventHub.updateFields(childEvent.id, {
                                            calendarIds: allCalendarIds,
                                            syncMode: modeId,
                                          }, {
                                            source: 'EventEditModalV2-ParentToChildren-ActualSyncMode'
                                          });
                                        }
                                      }
                                      
                                      console.log('✅ [EventEditModalV2] 子事件已批量更新');
                                    }
                                  })();
                                } else {
                                  // 子模式：更新当前事件（mainEvent）的 syncMode
                                  setFormData(prev => ({
                                    ...prev,
                                    syncMode: modeId
                                  }));
                                }
                                
                                setShowSyncSyncModePicker(false);
                              }}
                              onClose={() => setShowSyncSyncModePicker(false)}
                              title="选择同步模式"
                            />
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>
                  </div>

                </div>

              {/* 右侧：Event Log（仅详情视图） */}
              {isDetailView && (
                <div className="event-log">
                  {/* 收起按钮 - 固定在右侧中间 */}
                  <button className="collapse-button" onClick={() => setIsDetailView(false)}>
                    <img src={backIcon} alt="收起" className="collapse-icon" />
                  </button>
                  
                  {/* 固定顶部区域 - 不参与滚动 */}
                  <div className="event-log-header">
                    {/* 标签区域 */}
                    <div className="tags-area">
                      <span className="tag-mention tag-work">#🔗工作/#📝文档编辑</span>
                      <span className="tag-mention tag-client">#📮重点客户/#📮腾讯</span>
                    </div>

                    {/* Plan 提示区域 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#6b7280', marginBottom: '12px', lineHeight: '26px' }}>
                      <img src={taskGrayIcon} style={{ width: '16px', height: '16px' }} alt="" />
                      <img src={ddlWarnIcon} style={{ width: '20px', height: '20px' }} alt="" />
                      <span>创建于 12h前，ddl 还有 2h30min</span>
                    </div>

                    {/* 关联区域 - 智能摘要 */}
                    {(() => {
                      const hasParent = formData.parentEventId;
                      const hasChildren = formData.childEventIds?.length > 0;
                      const hasLinked = formData.linkedEventIds?.length > 0;
                      const hasBacklinks = formData.backlinks?.length > 0;
                      const hasRelations = hasParent || hasChildren || hasLinked || hasBacklinks;
                      
                      // 调试日志
                      console.log('🔍🔍🔍 [关联信息检查] formData 当前状态:', {
                        '步骤1_formData完整对象': formData,
                        '步骤2_formData.id': formData.id,
                        '步骤3_formData.childEventIds': formData.childEventIds,
                        '步骤4_formData.childEventIds类型': typeof formData.childEventIds,
                        '步骤5_formData.childEventIds是数组吗': Array.isArray(formData.childEventIds),
                        '步骤6_formData.childEventIds长度': formData.childEventIds?.length,
                        '步骤7_hasChildren判断结果': hasChildren,
                        '步骤8_linkedEventIds': formData.linkedEventIds,
                        '步骤9_backlinks': formData.backlinks,
                        '步骤10_hasRelations': hasRelations,
                      });
                      
                      return hasRelations;
                    })() && (
                      <div 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          fontSize: '14px', 
                          color: '#6b7280', 
                          marginBottom: '16px', 
                          lineHeight: '26px',
                          cursor: 'pointer',
                          transition: 'color 0.2s',
                        }}
                        onClick={() => {
                          setShowEventTree(!showEventTree);
                          console.log('切换 EventTree 显示:', !showEventTree);
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#3b82f6'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                        title="点击查看事件关联图"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M8 10L12 6M5 13L7 11M15 7L13 9" />
                          <circle cx="4" cy="14" r="2" />
                          <circle cx="16" cy="6" r="2" />
                        </svg>
                        <span>
                          {(() => {
                            const parts: string[] = [];
                            if (formData.parentEventId) {
                              parts.push('上级：1个');
                            }
                            const childCount = formData.childEventIds?.length || 0;
                            if (childCount > 0) {
                              // TODO: 统计任务完成情况
                              parts.push(`下级：${childCount}个`);
                            }
                            const linkedCount = (formData.linkedEventIds?.length || 0) + (formData.backlinks?.length || 0);
                            if (linkedCount > 0) {
                              parts.push(`关联：${linkedCount}个事件`);
                            }
                            return parts.join('；');
                          })()}
                        </span>
                        {/* 展开图标 */}
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ 
                            marginLeft: 'auto',
                            transform: showEventTree ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                          }}
                        >
                          <polyline points="6,4 10,8 6,12" />
                        </svg>
                      </div>
                    )}
                    
                    {/* EventTree 展开区域 */}
                    {showEventTree && (() => {
                      const hasParent = formData.parentEventId;
                      const hasChildren = formData.childEventIds?.length > 0;
                      const hasLinked = formData.linkedEventIds?.length > 0;
                      const hasBacklinks = formData.backlinks?.length > 0;
                      const hasRelations = hasParent || hasChildren || hasLinked || hasBacklinks;
                      
                      return hasRelations;
                    })() && (
                      <div style={{ marginBottom: '16px', marginTop: '0' }}>
                        <EventTreeViewer
                          rootEventId={formData.id}
                          events={allEvents}
                          onEventClick={(clickedEvent) => {
                            setFormData(clickedEvent as any);
                            setShowEventTree(false);
                          }}
                        />
                      </div>
                    )}
                    
                    {/* 🔧 开发调试：始终显示关联区域（方便测试） */}
                    {!(() => {
                      const hasParent = formData.parentEventId;
                      const hasChildren = formData.childEventIds?.length > 0;
                      const hasLinked = formData.linkedEventIds?.length > 0;
                      const hasBacklinks = formData.backlinks?.length > 0;
                      return hasParent || hasChildren || hasLinked || hasBacklinks;
                    })() && (
                      <div 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          fontSize: '13px', 
                          color: '#9ca3af', 
                          marginBottom: '16px', 
                          lineHeight: '26px',
                          fontStyle: 'italic',
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.5"
                        >
                          <path d="M8 10L12 6M5 13L7 11M15 7L13 9" />
                          <circle cx="4" cy="14" r="2" />
                          <circle cx="16" cy="6" r="2" />
                        </svg>
                        <span>暂无关联（通过 @mention 创建双向链接）</span>
                      </div>
                    )}
                  </div>

                  {/* 可滚动编辑区域 */}
                  <div 
                    className={`event-log-editor-wrapper ${showTopShadow ? 'show-top-shadow' : ''}`}
                    ref={rightPanelRef}
                  >
                    <ModalSlate
                      ref={slateEditorRef}
                      key={`editor-${formData.id}`}
                      content={timelogContent}
                      parentEventId={formData.id || 'new-event'}
                      enableTimestamp={true}
                      placeholder="记录时间轴..."
                      onChange={handleTimelogChange}
                      className="eventlog-editor"
                    />
                  </div>

                  {/* HeadlessFloatingToolbar */}
                  {floatingToolbar.mode !== 'hidden' && (
                    <HeadlessFloatingToolbar
                      position={floatingToolbar.position}
                      mode={floatingToolbar.mode}
                      config={{ 
                        features: floatingToolbar.mode === 'text_floatingbar' 
                          ? ['bold', 'italic', 'textColor', 'bgColor', 'strikethrough', 'clearFormat', 'bullet']
                          : ['tag', 'emoji', 'dateRange', 'addTask', 'textStyle'],
                        mode: 'basic' as any
                      }}
                      editorMode="eventlog"
                      slateEditorRef={slateEditorRef}
                      activePickerIndex={activePickerIndex}
                      onActivePickerIndexConsumed={() => setActivePickerIndex(-1)}
                      onSubPickerStateChange={(isOpen: boolean, activePicker?: string | null) => {
                        setIsSubPickerOpen(isOpen);
                        setCurrentActivePicker(activePicker || null);
                      }} // 🆕 追踪颜色选择器状态和 activePicker
                      onTextFormat={(command, value) => {
                        console.log('[EventEditModalV2] onTextFormat called:', { command, value, hasRef: !!slateEditorRef.current });
                        
                        // 🔧 对于 bullet 相关命令，使用 ModalSlate 的内部方法
                        if (command === 'toggleBulletList' || command === 'increaseBulletLevel' || command === 'decreaseBulletLevel') {
                          if (slateEditorRef.current?.applyTextFormat) {
                            console.log('[EventEditModalV2] 调用 ModalSlate.applyTextFormat');
                            slateEditorRef.current.applyTextFormat(command);
                          } else {
                            console.error('[EventEditModalV2] slateEditorRef.current.applyTextFormat 不存在');
                          }
                        } else {
                          // 其他命令使用 helpers.ts 的 applyTextFormat
                          if (slateEditorRef.current?.editor) {
                            applyTextFormat(slateEditorRef.current.editor, command, value);
                          }
                        }
                      }}
                      onTagSelect={(tagIds) => {
                        const tagId = Array.isArray(tagIds) ? tagIds[0] : tagIds;
                        handleTagSelect(tagId);
                        floatingToolbar.hideToolbar();
                      }}
                      onEmojiSelect={(emoji) => {
                        handleEmojiSelect(emoji);
                        floatingToolbar.hideToolbar();
                      }}
                      onDateRangeSelect={(start, end) => {
                        // ✅ 使用 formatTimeForStorage 而不是 toISOString()
                        const formattedTime = start ? formatTimeForStorage(start) : '';
                        handleDateRangeSelect(formattedTime);
                        floatingToolbar.hideToolbar();
                      }}
                      onRequestClose={floatingToolbar.hideToolbar}
                      availableTags={hierarchicalTags}
                      currentTags={formData.tags}
                      eventId={formData.id}
                    />
                  )}
                </div>
              )}
            </div>
            {/* event-overview 结束 */}
          {/* modal-content 结束 */}
        </>
  );

  // 📄 LogTab 模式：直接渲染内容，无遮罩层
  return renderModalContent();
};

// 导出为 LogTab
export const LogTab = React.memo(LogTabComponent, (prevProps, nextProps) => {
  // LogTab 简化的 memo 逻辑：只检查 eventId 变化
  if (prevProps.eventId !== nextProps.eventId) {
    console.log('🔄 [LogTab] React.memo: eventId 变化，需要渲染');
    return false;
  }
  
  // 检查 globalTimer 状态
  const prevTimer = prevProps.globalTimer;
  const nextTimer = nextProps.globalTimer;
  
  if (prevTimer?.isRunning !== nextTimer?.isRunning || 
      prevTimer?.isPaused !== nextTimer?.isPaused ||
      prevTimer?.eventId !== nextTimer?.eventId) {
    console.log('🔄 [LogTab] React.memo: globalTimer 状态变化，需要渲染');
    return false;
  }
  
  return true; // 跳过渲染
});
