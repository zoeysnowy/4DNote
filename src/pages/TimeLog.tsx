import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import GlassIconBar from '../components/GlassIconBar';
import ContentSelectionPanel from '../components/ContentSelectionPanel';
import { EventService } from '../services/EventService';
import { TagService } from '../services/TagService';
import { ModalSlate } from '../components/ModalSlate/ModalSlate';
import { LogSlate } from '../components/LogSlate/LogSlate';
import { HierarchicalTagPicker } from '../components/HierarchicalTagPicker/HierarchicalTagPicker';
import { LocationInput } from '../components/common/LocationInput';
import { AttendeeDisplay } from '../components/common/AttendeeDisplay';
import UnifiedDateTimePicker from '../components/FloatingToolbar/pickers/UnifiedDateTimePicker';
import { TimeGap } from '../components/TimeLog/TimeGap';
import { CompressedDateRange } from '../components/TimeLog/CompressedDateRange';
import { EventEditModalV2 } from '../components/EventEditModal/EventEditModalV2';
import { SimpleCalendarDropdown } from '../components/EventEditModalV2Demo/SimpleCalendarDropdown';
import { SyncModeDropdown } from '../components/EventEditModalV2Demo/SyncModeDropdown';
import EventTabManager from '../components/EventTabManager';
import { LogTab } from './LogTab';
import { getAvailableCalendarsForSettings } from '../utils/calendarUtils';
import { supportsMultiWindow, openEventInWindow } from '../utils/electronUtils';
import { createPortal } from 'react-dom';
import { generateEventId } from '../utils/idGenerator'; // 🔧 使用新的 UUID 生成器
import { formatTimeForStorage, formatDateForStorage } from '../utils/timeUtils'; // 🔧 TimeSpec 格式化
import { getLocationDisplayText } from '../utils/locationUtils'; // 🔧 Location 显示工具
import type { Event } from '../types';
import './TimeLog.css';

// 导入图标
import ExportIconSvg from '../assets/icons/export.svg';
import LinkIconSvg from '../assets/icons/link_gray.svg';
import MoreIconSvg from '../assets/icons/more.svg';
import TimeIconSvg from '../assets/icons/Time.svg';
import AttendeeIconSvg from '../assets/icons/Attendee.svg';
import LocationIconSvg from '../assets/icons/Location.svg';
import OutlookIconSvg from '../assets/icons/Outlook.svg';
import GoogleIconSvg from '../assets/icons/Google_Calendar.svg';
import SyncIconSvg from '../assets/icons/Sync.svg';
import ArrowBlueSvg from '../assets/icons/Arrow_blue.svg';
// 新增图标
import PlanIconSvg from '../assets/icons/datetime.svg';
import TimerIconSvg from '../assets/icons/timer_start.svg';
import ExpandIconSvg from '../assets/icons/right.svg';
import TagIconSvg from '../assets/icons/Tag.svg';
import DownIconSvg from '../assets/icons/down.svg';
import EditIconSvg from '../assets/icons/Edit.svg';
import FavoriteIconSvg from '../assets/icons/favorite.svg';
import LinkColorIconSvg from '../assets/icons/link_color.svg';
import DdlIconSvg from '../assets/icons/ddl_add.svg';
import RotationIconSvg from '../assets/icons/recurring_gray.svg';
import AddTaskIconSvg from '../assets/icons/Add_task_gray.svg';
import TimerStartIconSvg from '../assets/icons/timer_start.svg';
import NotesIconSvg from '../assets/icons/Notes.svg';
import RightIconSvg from '../assets/icons/right.svg';
import FullsizeIconSvg from '../assets/icons/fullsize.svg';
import TabIconSvg from '../assets/icons/tab.svg';

// 🚀 全局滚动标记：避免重复滚动到今天（不受 HMR 影响）
let hasScrolledToTodayGlobal = false;

interface TimeLogProps {
  isPanelVisible?: boolean;
  onPanelVisibilityChange?: (visible: boolean) => void;
}

const TimeLog: React.FC<TimeLogProps> = ({ isPanelVisible = true, onPanelVisibilityChange }) => {
  // ⏱️ 性能监控：组件挂载时间
  const mountTimeRef = useRef(performance.now());
  
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [hiddenTags, setHiddenTags] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'tags' | 'tasks' | 'favorites' | 'new'>('tags');
  const [tagServiceVersion, setTagServiceVersion] = useState(0);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set()); // 默认全部折叠
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set()); // 展开的压缩日期
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [editingAttendeesId, setEditingAttendeesId] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [hoveredTimeId, setHoveredTimeId] = useState<string | null>(null);
  const [hoveredTitleId, setHoveredTitleId] = useState<string | null>(null);
  const [hoveredRightMenuId, setHoveredRightMenuId] = useState<string | null>(null);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  
  // 🆕 日历和同步模式相关状态
  const [showCalendarPicker, setShowCalendarPicker] = useState<string | null>(null); // 当前打开日历选择器的事件ID
  const [showSyncModePicker, setShowSyncModePicker] = useState<string | null>(null); // 当前打开同步模式选择器的事件ID
  const [availableCalendars, setAvailableCalendars] = useState<Array<{id: string, name: string, color: string}>>([]);
  
  // 🆕 同步模式定义
  const syncModes = [
    { id: 'receive-only', name: '只接收同步', emoji: '📥' },
    { id: 'send-only', name: '只发送同步', emoji: '📤' },
    { id: 'send-only-private', name: '只发送（仅自己）', emoji: '📤🔒' },
    { id: 'bidirectional', name: '双向同步', emoji: '🔄' },
    { id: 'bidirectional-private', name: '双向同步（仅自己）', emoji: '🔄🔒' },
  ];
  
  // 🆕 日历和同步模式选择器的 ref
  const calendarPickerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const syncModePickerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  
  // 🆕 标签页管理状态
  const [showTabManager, setShowTabManager] = useState(false);
  const [tabManagerEvents, setTabManagerEvents] = useState<Event[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('timelog'); // 'timelog' 或事件ID

  // Handler: Open event in tab manager or separate window
  const handleOpenInTab = useCallback(async (event: Event) => {
    console.log('🏷️ [TimeLog] handleOpenInTab called:', event.id);
    console.log('🔍 [TimeLog] supportsMultiWindow:', supportsMultiWindow());
    
    // Electron 环境下优先使用多窗口
    if (supportsMultiWindow()) {
      const success = await openEventInWindow(event.id, event);
      if (success) {
        console.log('✅ Opened event in separate window:', event.id);
        return;
      }
      console.warn('⚠️ Failed to open window, falling back to tab manager');
    }
    
    // Web 环境或窗口打开失败，使用标签页管理器
    console.log('📑 [TimeLog] Opening in tab manager');
    setTabManagerEvents(prev => {
      const exists = prev.find(e => e.id === event.id);
      if (exists) return prev;
      const newEvents = [...prev, event];
      console.log('📑 [TimeLog] Tab manager events:', newEvents.length);
      return newEvents;
    });
    setShowTabManager(true);
    console.log('📑 [TimeLog] showTabManager set to true');
  }, []);
  
  // 动态滚动加载状态 - 支持双向无限滚动
  const [dynamicStartDate, setDynamicStartDate] = useState<Date | null>(null);
  const [dynamicEndDate, setDynamicEndDate] = useState<Date | null>(null);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [isLoadingLater, setIsLoadingLater] = useState(false);
  
  // 🔧 异步加载事件数据（需要在 useEffect 之前定义）
  // ✅ 使用过滤后的时间轴事件，排除无时间的 Task 和附属事件
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const tagRowRef = useRef<HTMLDivElement | null>(null);
  const modalSlateRefs = useRef<Map<string, any>>(new Map());
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const todayEventRef = useRef<HTMLDivElement | null>(null);
  const allEventsRef = useRef<Event[]>([]);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 使用 ref 存储最新的状态，避免闭包问题
  const dynamicStartDateRef = useRef<Date | null>(null);
  const dynamicEndDateRef = useRef<Date | null>(null);
  const isLoadingEarlierRef = useRef(false);
  const isLoadingLaterRef = useRef(false);
  
  // 同步 state 到 ref
  useEffect(() => {
    dynamicStartDateRef.current = dynamicStartDate;
    dynamicEndDateRef.current = dynamicEndDate;
    isLoadingEarlierRef.current = isLoadingEarlier;
    isLoadingLaterRef.current = isLoadingLater;
  }, [dynamicStartDate, dynamicEndDate, isLoadingEarlier, isLoadingLater]);

  // 订阅标签服务变化（与 PlanManager 一致）
  useEffect(() => {
    const listener = () => {
      console.log('📌 [TimeLog] Tags updated, incrementing version');
      setTagServiceVersion(v => v + 1);
    };

    TagService.addListener(listener);
    
    // 初始加载时强制刷新一次标签数据
    console.log('📌 [TimeLog] Forcing initial tag refresh');
    setTagServiceVersion(v => v + 1);
    
    const tags = TagService.getFlatTags();
    console.log('📌 [TimeLog] Current tags count:', tags.length);
    
    return () => TagService.removeListener(listener);
  }, []);

  // 双向无限滚动监听器（优化：使用 ref 避免闭包问题）
  useEffect(() => {
    // 等待加载完成和 DOM 渲染
    if (loadingEvents) {
      console.log('⏳ [TimeLog] Waiting for events to load before attaching scroll listener');
      return;
    }

    const container = timelineContainerRef.current;
    if (!container) {
      console.warn('⚠️ [TimeLog] timelineContainerRef is null');
      return;
    }

    console.log('✅ [TimeLog] Scroll listener attached', {
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      canScroll: container.scrollHeight > container.clientHeight
    });

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const scrollBottom = scrollHeight - scrollTop - clientHeight;
      
      // 只在接近边界时输出日志，避免过多日志
      const nearTop = scrollTop < 100;
      const nearBottom = scrollBottom < 400;
      
      if (nearTop || nearBottom) {
        console.log('📜 [TimeLog] Scroll near boundary:', {
          scrollTop,
          scrollHeight,
          clientHeight,
          scrollBottom,
          nearTop,
          nearBottom,
          isLoadingEarlier: isLoadingEarlierRef.current,
          isLoadingLater: isLoadingLaterRef.current,
          dynamicStart: dynamicStartDateRef.current ? formatTimeForStorage(dynamicStartDateRef.current) : null,
          dynamicEnd: dynamicEndDateRef.current ? formatTimeForStorage(dynamicEndDateRef.current) : null
        });
      }

      // 向上滚动接近顶部时，加载历史数据
      // 🔧 修改触发条件：由于今天在顶部，用户一开始就可能接近顶部
      // 但不应该立即触发加载，需要用户主动滚动
      if (scrollTop < 100 && scrollTop > 0 && !isLoadingEarlierRef.current) {
        console.log('🔼 [TimeLog] 触发历史加载！scrollTop=' + scrollTop);
        isLoadingEarlierRef.current = true;
        setIsLoadingEarlier(true);
        
        const loadHistory = async () => {
          // 保存当前可见的第一个元素作为锚点
          const firstVisibleElement = container.querySelector('.timeline-date-group');
          const firstVisibleTop = firstVisibleElement ? firstVisibleElement.getBoundingClientRect().top : 0;
          const containerTop = container.getBoundingClientRect().top;
          const offsetFromTop = firstVisibleTop - containerTop;
          
          const currentStart = dynamicStartDateRef.current || new Date();
          const newStart = new Date(currentStart);
          newStart.setDate(newStart.getDate() - 30); // 往前加载30天
          
          // console.log('📅 [TimeLog] Loading history:', {
          //   from: newStart.toISOString(),
          //   to: currentStart.toISOString(),
          //   anchorElement: firstVisibleElement?.getAttribute('data-date-key') || 'none',
          //   offsetFromTop
          // });
          
          try {
            const historyEvents = await EventService.getTimelineEvents(
              formatTimeForStorage(newStart),
              formatTimeForStorage(currentStart)
            );
            
            const mergedEvents = [...historyEvents, ...allEventsRef.current];
            const uniqueEvents = Array.from(
              new Map(mergedEvents.map(e => [e.id, e])).values()
            );
            
            setAllEvents(uniqueEvents);
            allEventsRef.current = uniqueEvents;
            setDynamicStartDate(newStart);
            dynamicStartDateRef.current = newStart;
            
            console.log(`✅ [TimeLog] Loaded ${historyEvents.length} history events (filtered)`);
            
            // 🔧 保持视图稳定：等待 DOM 更新后，将锚点元素恢复到原来的视觉位置
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (firstVisibleElement) {
                  const newTop = firstVisibleElement.getBoundingClientRect().top;
                  const newContainerTop = container.getBoundingClientRect().top;
                  const currentOffset = newTop - newContainerTop;
                  const scrollAdjustment = currentOffset - offsetFromTop;
                  
                  container.scrollTop += scrollAdjustment;
                  
                  // console.log('📍 [TimeLog] View stabilized:', {
                  //   scrollAdjustment,
                  //   finalScrollTop: container.scrollTop
                  // });
                }
              });
            });
          } catch (error) {
            console.error('❌ [TimeLog] Failed to load history:', error);
          } finally {
            setTimeout(() => {
              isLoadingEarlierRef.current = false;
              setIsLoadingEarlier(false);
            }, 300);
          }
        };
        
        loadHistory();
      }

      // 向下滚动接近底部时，加载未来的日期
      if (scrollBottom < 400 && !isLoadingLaterRef.current) {
        console.log('🔽 [TimeLog] 触发未来加载！scrollBottom=' + scrollBottom);
        isLoadingLaterRef.current = true;
        setIsLoadingLater(true);
        
        const loadFuture = async () => {
          const currentEnd = dynamicEndDateRef.current || new Date();
          const newEnd = new Date(currentEnd);
          newEnd.setDate(newEnd.getDate() + 30); // 往后加载30天
          newEnd.setHours(23, 59, 59, 999);
          
          // console.log('📅 [TimeLog] Loading future:', {
          //   from: currentEnd.toISOString(),
          //   to: newEnd.toISOString()
          // });
          
          try {
            const futureEvents = await EventService.getTimelineEvents(
              formatTimeForStorage(currentEnd),
              formatTimeForStorage(newEnd)
            );
            
            const mergedEvents = [...allEventsRef.current, ...futureEvents];
            const uniqueEvents = Array.from(
              new Map(mergedEvents.map(e => [e.id, e])).values()
            );
            
            setAllEvents(uniqueEvents);
            allEventsRef.current = uniqueEvents;
            setDynamicEndDate(newEnd);
            
            console.log(`✅ [TimeLog] Loaded ${futureEvents.length} future events (filtered)`);
          } catch (error) {
            console.error('❌ [TimeLog] Failed to load future events:', error);
          } finally {
            setTimeout(() => {
              isLoadingLaterRef.current = false;
              setIsLoadingLater(false);
            }, 300);
          }
        };
        
        loadFuture();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [loadingEvents]); // 只依赖 loadingEvents，其他状态通过 ref 访问

  // 获取所有标签（与 PlanManager 一致）
  const allTags = useMemo(() => {
    const tags = TagService.getFlatTags();
    if (tagServiceVersion === 0) {
      console.log('📌 [TimeLog] Initial tags loaded:', tags.length);
    }
    return tags;
  }, [tagServiceVersion]);

  const hierarchicalTags = useMemo(() => {
    return TagService.getTags();
  }, [tagServiceVersion]);



  // 格式化日期显示
  function formatDateDisplay(date: Date): string {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekday = weekdays[date.getDay()];
    return `${month}月${day}日 | ${weekday}`;
  }

  // 初始化加载事件数据
  useEffect(() => {
    const mountTime = performance.now() - mountTimeRef.current;
    console.log(`🚀 [TimeLog] Component mounted - Chronological Order & Smart Zipper Active (mount time: ${mountTime.toFixed(2)}ms)`);
    
    // 🚀 组件挂载时重置滚动标记（允许每次进入页面都滚动一次）
    hasScrolledToTodayGlobal = false;
    
    const loadEvents = async () => {
      const loadStartTime = performance.now();
      console.log('⏱️ [TimeLog] Starting event load...');
      
      setLoadingEvents(true);
      try {
        // 🚀 [PERFORMANCE] 计算初始加载范围：今天前后7天（足够显示，配合双向无限滚动）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const initialStartDate = new Date(today);
        initialStartDate.setDate(initialStartDate.getDate() - 7); // 优化：从45天减少到7天
        
        const initialEndDate = new Date(today);
        initialEndDate.setDate(initialEndDate.getDate() + 7); // 优化：从45天减少到7天
        initialEndDate.setHours(23, 59, 59, 999);
        
        console.log('📅 [TimeLog] Initial load range (Today ±7 days):', {
          start: formatTimeForStorage(initialStartDate),
          end: formatTimeForStorage(initialEndDate)
        });
        
        const dbQueryStartTime = performance.now();
        // 加载今天前后7天的事件（使用 getTimelineEvents 过滤）
        const events = await EventService.getTimelineEvents(
          formatTimeForStorage(initialStartDate),
          formatTimeForStorage(initialEndDate)
        );
        const dbQueryTime = performance.now() - dbQueryStartTime;
        
        console.log(`✅ [TimeLog] Loaded ${events.length} timeline events (Today ±7 days, filtered) - DB query: ${dbQueryTime.toFixed(2)}ms`);
        setAllEvents(events);
        allEventsRef.current = events;
        
        // 更新动态日期范围
        setDynamicStartDate(initialStartDate);
        setDynamicEndDate(initialEndDate);
        dynamicStartDateRef.current = initialStartDate;
        dynamicEndDateRef.current = initialEndDate;
        
        const totalLoadTime = performance.now() - loadStartTime;
        console.log(`⏱️ [TimeLog] Total event load time: ${totalLoadTime.toFixed(2)}ms`);
        
      } catch (error) {
        console.error('❌ [TimeLog] Failed to load events:', error);
        setAllEvents([]);
        allEventsRef.current = [];
      } finally {
        setLoadingEvents(false);
      }
    };

    loadEvents();
    
    // 🎧 监听全局事件更新（增量更新）
    const handleEventsUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.log('🔔 [TimeLog] 收到事件更新通知:', detail);
      
      // 🔒 循环更新防护：跳过来自 TimeLog 自身的本地更新
      const timeLogSources = [
        'TimeLog-eventlogChange', 
        'TimeLog-tagsChange',
        'TimeLog-locationSave',
        'TimeLog-timeChange',
        'TimeLog-attendeesSave',
        'TimeLog-editSave'
      ];
      
      if (detail?.isLocalUpdate && detail?.originComponent && timeLogSources.includes(detail.originComponent)) {
        console.log('⏭️ [TimeLog] 跳过自身更新:', detail.originComponent);
        return;
      }
      
      if (detail?.event) {
        const updatedEvent = detail.event;
        
        // 增量更新：只更新变化的事件
        setAllEvents(prev => {
          const index = prev.findIndex(e => e.id === updatedEvent.id);
          
          if (index >= 0) {
            // 更新现有事件
            const newEvents = [...prev];
            newEvents[index] = updatedEvent;
            console.log('✅ [TimeLog] 更新事件:', {
              id: updatedEvent.id.slice(-8),
              title: updatedEvent.title?.simpleTitle
            });
            return newEvents;
          } else {
            // 新事件：检查是否符合 Timeline 过滤条件
            const shouldShow = !updatedEvent.isTimer && 
                              !updatedEvent.isTimeLog && 
                              !updatedEvent.isOutsideApp &&
                              (updatedEvent.startTime || updatedEvent.endTime || updatedEvent.createdAt);
            
            if (shouldShow) {
              console.log('✅ [TimeLog] 添加新事件:', {
                id: updatedEvent.id.slice(-8),
                title: updatedEvent.title?.simpleTitle
              });
              return [...prev, updatedEvent];
            }
            
            return prev;
          }
        });
        
        // 同步更新 ref
        allEventsRef.current = allEventsRef.current.map(e => 
          e.id === updatedEvent.id ? updatedEvent : e
        );
        if (!allEventsRef.current.find(e => e.id === updatedEvent.id)) {
          allEventsRef.current.push(updatedEvent);
        }
      }
    };
    
    window.addEventListener('eventsUpdated', handleEventsUpdated as EventListener);
    
    return () => {
      window.removeEventListener('eventsUpdated', handleEventsUpdated as EventListener);
    };
  }, []);

  // 初始滚动到今天的位置（移到 getTodayDateKey 定义之后）

  // 🚀 [PERFORMANCE] 获取事件列表（按时间排序）
  // EventService.getTimelineEvents 已经完成过滤，这里只需排序
  const events = useMemo(() => {
    const startTime = performance.now();
    
    // 按时间正序排序（最早的在前）
    const sorted = [...allEvents].sort((a, b) => {
      const timeA = a.startTime || a.endTime || a.createdAt || '';
      const timeB = b.startTime || b.endTime || b.createdAt || '';
      
      const dateA = new Date(timeA).getTime();
      const dateB = new Date(timeB).getTime();
      
      const valA = isNaN(dateA) ? 0 : dateA;
      const valB = isNaN(dateB) ? 0 : dateB;
      
      // 强制正序：最早的时间在前 (Ascending)
      return valA - valB;
    });
    
    const processingTime = performance.now() - startTime;
    if (processingTime > 1 || sorted.length > 100) {
      console.log(`⏱️ [TimeLog] Events sorting time: ${processingTime.toFixed(2)}ms (${sorted.length} events)`);
    }
    
    return sorted;
  }, [allEvents]);

  // 默认展开所有事件的 eventlog
  useEffect(() => {
    if (events.length > 0) {
      setExpandedLogs(new Set(events.map(e => e.id)));
    }
  }, [events]);

  // 按日期分组事件
  const eventsByDate = useMemo(() => {
    const startTime = performance.now();
    
    const groups: Map<string, Event[]> = new Map();
    
    events.forEach(event => {
      const eventTime = new Date(event.startTime || event.endTime || event.createdAt!);
      const dateKey = `${eventTime.getFullYear()}-${String(eventTime.getMonth() + 1).padStart(2, '0')}-${String(eventTime.getDate()).padStart(2, '0')}`;
      
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(event);
    });
    
    const processingTime = performance.now() - startTime;
    if (processingTime > 1 || groups.size > 30) {
      console.log(`⏱️ [TimeLog] eventsByDate grouping time: ${processingTime.toFixed(2)}ms (${groups.size} dates)`);
    }
    
    return groups;
  }, [events]);

  // 获取排序后的日期列表
  const sortedDates = useMemo(() => {
    const dates = Array.from(eventsByDate.keys());
    // console.log('📅 [TimeLog Zipper] Raw dates from map:', dates);
    
    const sorted = dates.sort((a, b) => {
      // 强制正序：最早的日期在前 (Ascending)
      // 使用时间戳比较以确保准确性
      return new Date(a).getTime() - new Date(b).getTime();
    });
    
    // console.log('📅 [TimeLog Zipper] Sorted dates (Ascending):', sorted);
    return sorted;
  }, [eventsByDate]);

  // 生成时间轴段（month headers + compressed ranges + event dates）
  type TimelineSegment = 
    | { type: 'month-header'; year: number; month: number }
    | { type: 'events'; dateKey: string }
    | { type: 'compressed'; startDate: Date; endDate: Date };

  const timelineSegments = useMemo(() => {
    const segmentStart = performance.now();
    // 使用动态日期范围（初始值在 useEffect 中设置）
    const startDate = dynamicStartDate;
    const endDate = dynamicEndDate;
    
    if (!startDate || !endDate) {
      return [];
    }
    
    // 计算今天（确保使用本地日期，不受时区影响）
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // console.log('📅 [TimeLog] Today calculation:', {
    //   now: now.toISOString(),
    //   todayKey,
    //   year: now.getFullYear(),
    //   month: now.getMonth() + 1,
    //   date: now.getDate(),
    //   hasEventsToday: eventsByDate.has(todayKey)
    // });

    // 第一步：渲染今天到未来（从今天开始）
    const futureSegments: TimelineSegment[] = [];
    let currentDate = new Date(now);

    while (currentDate <= endDate) {
      const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const isToday = dateKey === todayKey;
      
      if (eventsByDate.has(dateKey) || isToday) {
        futureSegments.push({ type: 'events', dateKey });
        currentDate.setDate(currentDate.getDate() + 1);
      } else {
        const compressedStart = new Date(currentDate);
        while (currentDate <= endDate) {
          const nextDateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
          if (eventsByDate.has(nextDateKey) || nextDateKey === todayKey) {
            break;
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
        const compressedEnd = new Date(currentDate);
        compressedEnd.setDate(compressedEnd.getDate() - 1);
        
        const daysDiff = Math.floor((compressedEnd.getTime() - compressedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        if (daysDiff === 1) {
          const singleDateKey = `${compressedStart.getFullYear()}-${String(compressedStart.getMonth() + 1).padStart(2, '0')}-${String(compressedStart.getDate()).padStart(2, '0')}`;
          futureSegments.push({ type: 'events', dateKey: singleDateKey });
        } else if (daysDiff > 1) {
          futureSegments.push({ 
            type: 'compressed', 
            startDate: compressedStart, 
            endDate: compressedEnd 
          });
        }
      }
    }

    // 第二步：渲染历史数据（从昨天往前）
    const historySegments: TimelineSegment[] = [];
    let historyDate = new Date(now);
    historyDate.setDate(historyDate.getDate() - 1); // 从昨天开始

    while (historyDate >= startDate) {
      const dateKey = `${historyDate.getFullYear()}-${String(historyDate.getMonth() + 1).padStart(2, '0')}-${String(historyDate.getDate()).padStart(2, '0')}`;
      
      if (eventsByDate.has(dateKey)) {
        historySegments.unshift({ type: 'events', dateKey });
        historyDate.setDate(historyDate.getDate() - 1);
      } else {
        const compressedEnd = new Date(historyDate);
        while (historyDate >= startDate) {
          const nextDateKey = `${historyDate.getFullYear()}-${String(historyDate.getMonth() + 1).padStart(2, '0')}-${String(historyDate.getDate()).padStart(2, '0')}`;
          if (eventsByDate.has(nextDateKey)) {
            break;
          }
          historyDate.setDate(historyDate.getDate() - 1);
        }
        const compressedStart = new Date(historyDate);
        compressedStart.setDate(compressedStart.getDate() + 1);
        
        const daysDiff = Math.floor((compressedEnd.getTime() - compressedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        if (daysDiff === 1) {
          const singleDateKey = `${compressedStart.getFullYear()}-${String(compressedStart.getMonth() + 1).padStart(2, '0')}-${String(compressedStart.getDate()).padStart(2, '0')}`;
          historySegments.unshift({ type: 'events', dateKey: singleDateKey });
        } else if (daysDiff > 1) {
          historySegments.unshift({ 
            type: 'compressed', 
            startDate: compressedStart, 
            endDate: compressedEnd 
          });
        }
      }
    }

    // 合并历史和未来段落
    const segments = [...historySegments, ...futureSegments];
    
    // console.log('📊 [TimeLog] Timeline segments before split:', {
    //   historyCount: historySegments.length,
    //   futureCount: futureSegments.length,
    //   totalCount: segments.length,
    //   firstSegment: segments[0],
    //   todayInFuture: futureSegments.find(s => s.type === 'events' && s.dateKey === todayKey),
    //   todayInHistory: historySegments.find(s => s.type === 'events' && s.dateKey === todayKey)
    // });

    // 进一步拆分：将跨月的compressed段拆分成每月独立的段
    const finalSegments: TimelineSegment[] = [];
    
    segments.forEach(segment => {
      if (segment.type === 'compressed') {
        // 检查是否跨月
        const startMonth = `${segment.startDate.getFullYear()}-${segment.startDate.getMonth() + 1}`;
        const endMonth = `${segment.endDate.getFullYear()}-${segment.endDate.getMonth() + 1}`;
        
        if (startMonth === endMonth) {
          // 同月，直接添加
          finalSegments.push(segment);
        } else {
          // 跨月，需要拆分
          let currentDate = new Date(segment.startDate);
          
          while (currentDate <= segment.endDate) {
            // 该月的最后一天（月末）
            const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            monthEnd.setHours(23, 59, 59, 999);
            
            // 实际结束日期：取月末和segment.endDate中较小的
            const actualEnd = monthEnd < segment.endDate ? monthEnd : new Date(segment.endDate);
            
            // 添加该月的compressed段
            finalSegments.push({
              type: 'compressed',
              startDate: new Date(currentDate), // 使用当前日期（第一次是segment.startDate，后续是下月1号）
              endDate: actualEnd
            });
            
            // 移动到下个月第一天
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            currentDate.setHours(0, 0, 0, 0);
          }
        }
      } else {
        finalSegments.push(segment);
      }
    });

    // 插入月份标题：
    // - compressed段：总是插入月份标题（视觉上更清晰，每个压缩段都显示月份）
    // - events段：只在新月份时插入月份标题
    // 
    // 注意：compressed段后紧跟同月的events段时，会出现同月份标题连续出现2次的情况，
    // 这是**期望行为**，因为compressed段需要独立的月份标识，否则用户无法识别日期所属月份
    const segmentsWithMonthHeaders: TimelineSegment[] = [];
    let lastMonthKey: string | null = null;

    finalSegments.forEach(segment => {
      let currentMonthKey: string;
      
      if (segment.type === 'events') {
        const date = new Date(segment.dateKey);
        currentMonthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      } else {
        currentMonthKey = `${segment.startDate.getFullYear()}-${segment.startDate.getMonth() + 1}`;
      }

      // compressed段：总是插入月份标题（即使与上一个段月份相同）
      if (segment.type === 'compressed') {
        const [year, month] = currentMonthKey.split('-').map(Number);
        segmentsWithMonthHeaders.push({ type: 'month-header', year, month });
        lastMonthKey = currentMonthKey;
      } 
      // events段：只在新月份时插入月份标题
      else if (currentMonthKey !== lastMonthKey) {
        const [year, month] = currentMonthKey.split('-').map(Number);
        segmentsWithMonthHeaders.push({ type: 'month-header', year, month });
        lastMonthKey = currentMonthKey;
      }

      segmentsWithMonthHeaders.push(segment);
    });

    // 调试日志（已移除，月份标题重复是正常行为）
    // compressed 段后紧跟同月 events 段时，月份标题会连续出现 2 次，这是期望的设计
    
    // 最终调试：检查今天的位置
    const todaySegmentIndex = segmentsWithMonthHeaders.findIndex(
      seg => seg.type === 'events' && seg.dateKey === todayKey
    );
    // console.log('📍 [TimeLog] Today segment position:', {
    //   todayKey,
    //   index: todaySegmentIndex,
    //   totalSegments: segmentsWithMonthHeaders.length,
    //   firstEventSegment: segmentsWithMonthHeaders.find(s => s.type === 'events'),
    //   segmentsAroundToday: segmentsWithMonthHeaders.slice(Math.max(0, todaySegmentIndex - 2), todaySegmentIndex + 3)
    // });
    
    const segmentDuration = performance.now() - segmentStart;
    if (segmentDuration > 50) {
      console.log(`⚠️ [TimeLog] timelineSegments calculation slow: ${segmentDuration.toFixed(1)}ms`);
    }
    
    return segmentsWithMonthHeaders;
  }, [sortedDates, eventsByDate, dynamicStartDate, dynamicEndDate]);
  
  // ⏱️ 性能监控：timelineSegments 计算时间（仅首次渲染时输出）
  useEffect(() => {
    if (timelineSegments.length > 0 && !loadingEvents) {
      console.log(`⏱️ [TimeLog] timelineSegments rendered: ${timelineSegments.length} segments`);
    }
  }, [timelineSegments.length, loadingEvents]);

  // 格式化日期标题（例如：12月5日 | 周四）
  const formatDateTitle = (dateKey: string): string => {
    const date = new Date(dateKey);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekday = weekdays[date.getDay()];
    
    // 判断是否是今天
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isToday = date.getTime() === today.getTime();
    
    if (isToday) {
      return `${month}月${day}日 | ${weekday} (今天)`;
    }
    
    return `${month}月${day}日 | ${weekday}`;
  };

  // 获取今天的日期key
  const getTodayDateKey = useCallback(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // 找到今天的日期key（用于滚动定位，无论是否有事件都返回）
  const findTodayFirstDateKey = useCallback(() => {
    return getTodayDateKey();
  }, [getTodayDateKey]);

  // 初始滚动到今天的位置（只执行一次）
  useEffect(() => {
    if (!loadingEvents && !hasScrolledToTodayGlobal && todayEventRef.current && timelineContainerRef.current) {
      hasScrolledToTodayGlobal = true; // 🚀 全局标记，防止重复滚动（HMR 不会重置）
      const scrollStartTime = performance.now();
      console.log('🎯 [TimeLog] Scrolling to today marker');
      
      // 使用 requestAnimationFrame 确保 DOM 已完全渲染（比 setTimeout 更快更准确）
      requestAnimationFrame(() => {
        if (todayEventRef.current && timelineContainerRef.current) {
          const container = timelineContainerRef.current;
          const todayElement = todayEventRef.current;
          
          // 计算今天元素相对于容器的位置
          const containerRect = container.getBoundingClientRect();
          const todayRect = todayElement.getBoundingClientRect();
          
          // 滚动到今天的位置（让今天显示在容器顶部，留一点padding）
          const scrollTop = container.scrollTop + (todayRect.top - containerRect.top) - 20;
          
          console.log('📍 [TimeLog] Scroll calculation:', {
            containerTop: containerRect.top,
            todayTop: todayRect.top,
            currentScrollTop: container.scrollTop,
            targetScrollTop: scrollTop,
            todayDateKey: getTodayDateKey()
          });
          
          container.scrollTop = scrollTop;
          
          const scrollTime = performance.now() - scrollStartTime;
          console.log(`⏱️ [TimeLog] Scrolled to today (${scrollTime.toFixed(2)}ms)`);
        }
      });
    }
  }, [loadingEvents, getTodayDateKey]);

  // 处理日期范围变化
  const handleDateRangeChange = (start: Date | null, end: Date | null) => {
    if (start && end) {
      setDateRange({ start, end });
    } else {
      setDateRange(null);
    }
  };

  // 处理标签可见性变化
  const handleTagVisibilityChange = (tagId: string, visible: boolean) => {
    setHiddenTags(prev => {
      const next = new Set(prev);
      if (visible) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  // 处理导出
  const handleExport = () => {
    console.log('导出时光日志');
    // TODO: 实现导出功能
  };

  // 处理复制链接
  const handleCopyLink = () => {
    console.log('复制链接');
    // TODO: 实现复制链接功能
  };

  // 处理更多选项
  const handleMore = () => {
    console.log('更多选项');
    // TODO: 实现更多选项功能
  };

  // 切换 eventlog 展开/折叠
  const toggleLogExpanded = (eventId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };
  
  // 🆕 加载可用日历列表
  useEffect(() => {
    const loadCalendars = async () => {
      const calendars = await getAvailableCalendarsForSettings();
      setAvailableCalendars(calendars);
    };
    loadCalendars();
  }, []);
  
  // 🆕 获取多选日历显示信息（第一个 + 等）
  const getMultiCalendarDisplayInfo = (calendarIds: string[]) => {
    if (!calendarIds || calendarIds.length === 0) {
      return { displayText: '选择日历...', color: '#9ca3af', hasMore: false };
    }
    
    const firstCalendar = availableCalendars.find(c => c.id === calendarIds[0]);
    if (!firstCalendar) {
      return { displayText: '未知日历', color: '#999999', hasMore: calendarIds.length > 1 };
    }
    
    const cleanName = firstCalendar.name.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF]+\s*/, '');
    const [mainName] = cleanName.includes(': ') ? cleanName.split(': ') : [cleanName];
    
    return {
      displayText: mainName,
      color: firstCalendar.color,
      hasMore: calendarIds.length > 1
    };
  };
  
  // 🆕 获取同步模式显示信息
  const getSyncModeInfo = (modeId: string) => {
    const mode = syncModes.find(m => m.id === modeId);
    return mode || { id: 'unknown', name: '未知模式', emoji: '❓' };
  };
  
  // 🆕 处理日历选择变更
  const handleCalendarChange = async (eventId: string, calendarIds: string[]) => {
    try {
      const { EventHub } = await import('../services/EventHub');
      await EventHub.updateFields(eventId, { calendarIds }, { source: 'TimeLog-CalendarChange' });
      setShowCalendarPicker(null);
    } catch (error) {
      console.error('Failed to update calendar:', error);
    }
  };
  
  // 🆕 处理同步模式变更
  const handleSyncModeChange = async (eventId: string, syncMode: string) => {
    try {
      const { EventHub } = await import('../services/EventHub');
      await EventHub.updateFields(eventId, { syncMode }, { source: 'TimeLog-SyncModeChange' });
      setShowSyncModePicker(null);
    } catch (error) {
      console.error('Failed to update sync mode:', error);
    }
  };

  // 处理 eventlog 内容变化
  const handleLogChange = async (eventId: string, slateJson: string) => {
    console.log('📝 [TimeLog] Saving eventlog for:', eventId);
    
    // 使用 EventHub 保存（带循环更新防护）
    await EventHub.updateFields(eventId, {
      eventlog: slateJson  // EventService 会自动处理格式转换
    }, {
      source: 'TimeLog-eventlogChange'
    });
  };
  
  // 从 event.eventlog 提取 Slate JSON 字符串
  const getEventLogContent = (event: Event): string => {
    if (!event.eventlog) {
      return '';
    }
    
    // EventLog 对象格式（标准格式）
    if (typeof event.eventlog === 'object' && 'slateJson' in event.eventlog) {
      return event.eventlog.slateJson || '';
    }
    
    // 旧格式兼容：字符串格式
    if (typeof event.eventlog === 'string') {
      return event.eventlog;
    }
    
    console.error('[TimeLog] eventlog 格式未知:', {
      eventId: event.id.slice(-8),
      eventlogType: typeof event.eventlog
    });
    return '';
  };

  // 处理标题编辑
  // 缓存待保存的标题变化（失焦时保存）
  const pendingTitleChanges = useRef<Map<string, string>>(new Map());
  
  const handleTitleSave = useCallback(async (eventId: string, slateJson: string) => {
    // 失焦时立即保存，不使用防抖
    // 提取纯文本作为 simpleTitle
    let simpleTitle = '';
    try {
      const parsed = JSON.parse(slateJson || '[{"type":"paragraph","children":[{"text":""}]}]');
      simpleTitle = parsed.map((node: any) => {
        return node.children?.map((child: any) => child.text || '').join('') || '';
      }).join('\n').trim();
    } catch (err) {
      console.error('[TimeLog] Failed to parse title JSON:', err);
      simpleTitle = '';
    }
    
    // 🔧 获取当前事件的原始 title，避免用空标题覆盖现有标题
    const currentEvent = allEventsRef.current.find(e => e.id === eventId);
    const currentTitle = currentEvent?.title;
    
    // 🛡️ 保护机制：如果新标题为空，且当前标题不为空，则不保存（避免意外覆盖）
    if (!simpleTitle && currentTitle?.simpleTitle) {
      console.warn('⚠️ [TimeLog] 阻止用空标题覆盖现有标题:', {
        eventId: eventId.slice(-8),
        currentTitle: currentTitle.simpleTitle,
        newTitle: simpleTitle
      });
      return;
    }
    
    console.log('💾 [TimeLog] Saving title:', { 
      eventId: eventId.slice(-8), 
      simpleTitle,
      slateJsonLength: slateJson.length 
    });
    
    // 🔥 使用 EventHub 保存（带循环更新防护）
    await EventHub.updateFields(eventId, {
      title: {
        fullTitle: slateJson,  // Slate JSON 格式
        simpleTitle: simpleTitle,  // 纯文本
        // colorTitle 会由 EventService.normalizeTitle 自动从 fullTitle 生成
      }
    }, {
      source: 'TimeLog-titleSave'
    });
    
    console.log('✅ [TimeLog] Title saved:', simpleTitle);
    
    // EventHub 会自动触发 eventsUpdated 事件，无需手动更新
    // 这样可以避免输入时失焦问题
  }, []);

  // 处理标签编辑
  const handleTagsClick = (event: Event) => {
    setEditingTagsId(event.id);
  };

  const handleTagsChange = async (eventId: string, tagIds: string[]) => {
    // 使用 EventHub 保存（带循环更新防护）
    await EventHub.updateFields(eventId, { tags: tagIds }, {
      source: 'TimeLog-tagsChange'
    });
    setEditingTagsId(null);
  };

  // 处理参与者编辑
  const handleAttendeesEdit = (event: Event) => {
    setEditingAttendeesId(event.id);
  };

  // 处理地点编辑
  const handleLocationEdit = (eventId: string) => {
    setEditingLocationId(eventId);
  };

  // 处理时间编辑
  const handleTimeEdit = (event: Event) => {
    setEditingTimeId(event.id);
  };

  const handleTimeChange = async (eventId: string, updates: { startTime?: string; endTime?: string }) => {
    // 使用 EventHub 保存（带循环更新防护）
    await EventHub.updateFields(eventId, updates, {
      source: 'TimeLog-timeChange'
    });
    setEditingTimeId(null);
  };

  const handleTimePickerClose = () => {
    setEditingTimeId(null);
  };



  // 处理点击事件空白区域：展开 eventlog 并插入 timestamp + 预行
  const handleEventClick = (e: React.MouseEvent, eventId: string) => {
    // 检查是否点击了交互元素（避免在编辑其他字段时触发）
    const target = e.target as HTMLElement;
    const isInteractiveElement = 
      target.closest('button') ||
      target.closest('input') ||
      target.closest('[contenteditable="true"]') ||
      target.closest('.meta-icon') ||
      target.closest('.event-title') ||
      target.closest('.event-tags-row') ||
      target.closest('.event-meta-row') ||
      target.closest('.event-meta-icon-bar') ||
      target.closest('.time-action-btn') ||
      target.closest('.event-log-box'); // 避免在已展开的 log 区域重复触发
    
    if (isInteractiveElement) {
      return; // 如果点击的是交互元素，不执行
    }

    // 展开 eventlog
    const wasExpanded = expandedLogs.has(eventId);
    if (!wasExpanded) {
      setExpandedLogs(prev => {
        const next = new Set(prev);
        next.add(eventId);
        return next;
      });
    }
    
    // 触发 ModalSlate 插入 timestamp + 预行 + 光标定位
    setTimeout(() => {
      const slateRef = modalSlateRefs.current.get(eventId);
      if (slateRef && slateRef.insertTimestampAndFocus) {
        slateRef.insertTimestampAndFocus();
      }
    }, wasExpanded ? 0 : 100); // 如果需要展开，等待动画完成
  };

  // 新建事件模态框状态
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newEventTemplate, setNewEventTemplate] = useState<Event | null>(null);
  
  // 编辑事件模态框状态
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // 处理 TimeGap 点击创建事件
  // 处理创建事件（打开 EventEditModal）
  const handleCreateEvent = (startTime: Date) => {
    const newEvent: Event = {
      id: generateEventId(),
      title: {
        simpleTitle: '',
        colorTitle: '',
        fullTitle: ''
      },
      startTime: formatTimeForStorage(startTime),
      endTime: formatTimeForStorage(new Date(startTime.getTime() + 30 * 60000)), // 默认30分钟
      tags: [],
      isAllDay: false,
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
    };
    setNewEventTemplate(newEvent);
    setCreateModalOpen(true);
  };

  // 处理创建笔记（纯 eventlog 的日记）
  const handleCreateNote = async (_suggestedStartTime?: Date) => {
    try {
      // 🎯 创建一个纯笔记：无时间、无标题、无标签，只记录 createdAt
      // 注意：忽略建议的 startTime，笔记不需要时间
      const createdAt = formatTimeForStorage(new Date());
      const newEvent: Event = {
        id: generateEventId(),
        title: {
          simpleTitle: '',
          colorTitle: '',
          fullTitle: ''
        }, // 允许空标题
        startTime: null, // 无开始时间
        endTime: null, // 无结束时间
        tags: [], // 允许空标签
        isAllDay: false,
        // ⚠️ 空笔记不应该有 Block-Level Timestamp（避免显示时间戳）
        eventlog: JSON.stringify([
          {
            type: 'paragraph',
            children: [{ text: '' }]
          }
        ]),
        createdAt,
        updatedAt: createdAt,
      };
      
      const result = await EventService.createEvent(newEvent);
      
      if (!result.success) {
        console.error('❌ [TimeLog] Failed to create note:', result.error);
        alert(`创建笔记失败: ${result.error}`);
        return;
      }
      
      console.log('✅ [TimeLog] Note created in database:', newEvent.id);
      
      // 验证笔记是否真的存储到数据库
      const savedNote = await EventService.getEventById(newEvent.id);
      if (!savedNote) {
        console.error('❌ [TimeLog] Note not found in database immediately after creation!');
        alert('笔记创建失败：无法从数据库读取');
        return;
      }
      console.log('✅ [TimeLog] Verified note in database:', {
        id: savedNote.id,
        title: savedNote.title,
        startTime: savedNote.startTime,
        endTime: savedNote.endTime,
        createdAt: savedNote.createdAt
      });
      
      // 刷新事件列表（使用 getTimelineEvents 过滤）
      const events = await EventService.getTimelineEvents();
      console.log('📋 [TimeLog] Reloaded events:', events.length);
      
      // 检查新笔记是否在列表中
      const noteExists = events.find(e => e.id === newEvent.id);
      console.log('🔍 [TimeLog] Note in list:', noteExists ? 'YES' : 'NO', noteExists?.id);
      
      if (!noteExists) {
        console.error('❌ [TimeLog] Note not found in reloaded events!');
        console.log('📋 [TimeLog] All event IDs:', events.map(e => e.id));
        alert('笔记创建成功但未在列表中显示，请刷新页面');
        return;
      }
      
      setAllEvents(events);
      allEventsRef.current = events;
      
      // 自动展开新创建的笔记
      setExpandedLogs(prev => new Set([...prev, newEvent.id]));
      
      // 等待 DOM 更新后滚动到笔记位置并聚焦
      setTimeout(() => {
        // 1. 滚动到新创建的笔记
        const noteElement = document.querySelector(`[data-event-id="${newEvent.id}"]`);
        console.log('🔍 [TimeLog] Looking for note element:', newEvent.id, noteElement ? 'FOUND' : 'NOT FOUND');
        
        if (noteElement) {
          console.log('📍 [TimeLog] Scrolling to note:', newEvent.id);
          noteElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' // 将笔记显示在视口中央
          });
        } else {
          console.warn('❌ [TimeLog] Note element not found in DOM, cannot scroll');
        }
        
        // 2. 聚焦到编辑器
        setTimeout(() => {
          const modalSlateRef = modalSlateRefs.current.get(newEvent.id);
          console.log('🔍 [TimeLog] ModalSlate ref:', newEvent.id, modalSlateRef ? 'FOUND' : 'NOT FOUND');
          
          if (modalSlateRef?.editor) {
            try {
              // 使用 ReactEditor.focus 聚焦编辑器
              const { ReactEditor } = require('slate-react');
              ReactEditor.focus(modalSlateRef.editor);
              // 将光标移到末尾（paragraph 的末尾）
              const { Transforms, Editor } = require('slate');
              Transforms.select(modalSlateRef.editor, Editor.end(modalSlateRef.editor, []));
              console.log('✅ [TimeLog] Editor focused and cursor positioned');
            } catch (err) {
              console.warn('❌ [TimeLog] Failed to focus editor:', err);
            }
          } else {
            console.warn('❌ [TimeLog] ModalSlate ref not available');
          }
        }, 300); // 等待滚动动画完成
      }, 200);
      
      console.log('✅ [TimeLog] Created note (no time):', newEvent.id);
    } catch (error) {
      console.error('❌ [TimeLog] Failed to create note:', error);
    }
  };

  // 处理上传附件
  const handleUploadAttachment = (startTime: Date) => {
    // TODO: 实现附件上传逻辑
    console.log('📎 [TimeLog] Upload attachment at:', startTime);
    alert('附件上传功能即将推出！');
  };

  const handleCreateSave = async (savedEvent: Event) => {
    // 使用 EventHub 创建（带循环更新防护）
    await EventHub.createEvent(savedEvent);
    
    // 关闭模态框
    setCreateModalOpen(false);
    setNewEventTemplate(null);
  };

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event);
    setEditModalOpen(true);
  };

  const handleEditSave = async (savedEvent: Event) => {
    // 使用 EventHub 更新（带循环更新防护）
    await EventHub.updateFields(savedEvent.id, savedEvent, {
      source: 'TimeLog-editSave'
    });
    
    // 关闭模态框
    setEditModalOpen(false);
    setEditingEvent(null);
  };

  // ⏱️ 性能监控：整体渲染时间（仅首次）
  useEffect(() => {
    const renderTime = performance.now() - mountTimeRef.current;
    if (renderTime < 100) { // 只在首次渲染时输出
      console.log(`⏱️ [TimeLog] Initial render time: ${renderTime.toFixed(2)}ms`);
    }
  }, []);

  // ⏱️ 性能监控：页面完全加载完成后输出摘要
  useEffect(() => {
    if (!loadingEvents && events.length > 0) {
      const totalTime = performance.now() - mountTimeRef.current;
      console.log(`\n📊 [TimeLog Performance Summary]`);
      console.log(`├─ Total Load Time: ${totalTime.toFixed(2)}ms`);
      console.log(`├─ Events Loaded: ${events.length}`);
      console.log(`├─ Dates Grouped: ${eventsByDate.size}`);
      console.log(`├─ Timeline Segments: ${timelineSegments.length}`);
      console.log(`└─ Status: ✅ Ready\n`);
    }
  }, [loadingEvents, events.length, eventsByDate.size, timelineSegments.length]);

  return (
    <div className={`timelog-page ${!isPanelVisible ? 'panel-hidden' : ''}`}>
      {/* 左侧内容选取区 - 完全复用 ContentSelectionPanel */}
      <ContentSelectionPanel
        pageType="timelog"
        isPanelVisible={isPanelVisible}
        onPanelVisibilityChange={onPanelVisibilityChange}
        dateRange={dateRange}
        tags={allTags}
        hiddenTags={hiddenTags}
        onFilterChange={setActiveFilter}
        onSearchChange={setSearchQuery}
        onDateRangeChange={handleDateRangeChange}
        onTagVisibilityChange={handleTagVisibilityChange}
      />

      {/* 中间时光日志区 - 标签栏+卡片组合 */}
      <div className="timelog-card-container">
        {/* 标签栏：有tab时渲染在卡片上方 */}
        {showTabManager && (
          <div className="timelog-header-with-tabs">
            <div className="timelog-tab-bar">
              {/* 时光日志作为第一个tab */}
              <div 
                className={`timelog-tab ${activeTabId === 'timelog' ? 'timelog-tab-active' : ''}`}
                onClick={() => setActiveTabId('timelog')}
              >
                <div className="timelog-gradient-bar"></div>
                <h1 className="timelog-title">时光日志</h1>
              </div>
              {/* 打开的事件tab */}
              {tabManagerEvents.map((event) => {
                // 获取事件标题（处理对象和字符串两种情况）
                const titleText = typeof event.title === 'object' && event.title !== null
                  ? event.title.simpleTitle || event.title.fullTitle || '未命名事件'
                  : event.title || '未命名事件';
                
                return (
                  <div 
                    key={event.id} 
                    className={`timelog-tab ${activeTabId === event.id ? 'timelog-tab-active' : ''}`}
                    onClick={() => setActiveTabId(event.id)}
                  >
                    <span className="tab-title">{titleText}</span>
                    <button 
                      className="tab-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTabManagerEvents(prev => prev.filter(e => e.id !== event.id));
                        // 如果关闭的是当前激活标签，切换到时光日志
                        if (activeTabId === event.id) {
                          setActiveTabId('timelog');
                        }
                        // 如果只剩一个事件，关闭标签管理器
                        if (tabManagerEvents.length <= 1) {
                          setShowTabManager(false);
                          setActiveTabId('timelog');
                        }
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 白色背景卡片 */}
        <div className={`timelog-main-card ${tabManagerEvents.length > 0 ? 'has-tabs' : ''}`}>
          {/* 标题区：无tab时显示普通标题 */}
          {tabManagerEvents.length === 0 && (
            <div className="timelog-header-section">
              <div className="timelog-header-border">
                <div className="timelog-gradient-bar"></div>
                <h1 className="timelog-title">时光日志</h1>
              </div>
            </div>
          )}

          {/* 内容区域：根据激活标签显示不同内容 */}
          {/* 时光日志列表 - 使用 CSS 隐藏而非条件渲染，保留滚动状态 */}
          <div 
            className="timelog-events-list" 
            ref={timelineContainerRef}
            style={{ display: activeTabId === 'timelog' ? 'block' : 'none' }}
          >
            {loadingEvents ? (
            <div className="timelog-empty">
              <p>加载中...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="timelog-empty">
              <p>暂无事件记录</p>
            </div>
          ) : (
            timelineSegments.map((segment, segmentIndex) => {
              if (segment.type === 'month-header') {
                // 月份标题：检查下一个segment是否是compressed，如果是则合并渲染
                const nextSegment = timelineSegments[segmentIndex + 1];
                const hasCompressedNext = nextSegment && nextSegment.type === 'compressed';
                
                if (hasCompressedNext) {
                  // 检查压缩段内是否有展开的日期
                  const hasExpandedDateInNext = Array.from(expandedDates).some(expandedDateKey => {
                    const currentDate = new Date(nextSegment.startDate);
                    while (currentDate <= nextSegment.endDate) {
                      const dateKey = formatDateForStorage(currentDate);
                      if (dateKey === expandedDateKey) {
                        return true;
                      }
                      currentDate.setDate(currentDate.getDate() + 1);
                    }
                    return false;
                  });
                  
                  if (hasExpandedDateInNext) {
                    // 有展开的日期，将压缩段拆分成：压缩段1 + 展开日期 + 压缩段2
                    const segments: JSX.Element[] = [];
                    let isFirstSegment = true;
                    
                    // 遍历压缩段的所有日期，按展开状态分段渲染
                    const currentDate = new Date(nextSegment.startDate);
                    let compressedStart: Date | null = null;
                    
                    while (currentDate <= nextSegment.endDate) {
                      const dateKey = formatDateForStorage(currentDate);
                      const isExpanded = expandedDates.has(dateKey);
                      
                      if (isExpanded) {
                        // 如果之前有累积的压缩段，先渲染它
                        if (compressedStart) {
                          const compressedEnd = new Date(currentDate);
                          compressedEnd.setDate(compressedEnd.getDate() - 1);
                          
                          if (isFirstSegment) {
                            // 第一个段落：月份标题 + 压缩段在同一行
                            segments.push(
                              <div key={`month-header-compressed-${segment.year}-${segment.month}`} className="timeline-month-header">
                                <div className="timeline-month-info">
                                  <div className="month-year">{segment.year}</div>
                                  <div className="month-number">{segment.month}</div>
                                </div>
                                <CompressedDateRange
                                  startDate={compressedStart}
                                  endDate={compressedEnd}
                                  onDateClick={(date) => {
                                    const key = formatDateForStorage(date);
                                    setExpandedDates(prev => new Set(prev).add(key));
                                  }}
                                />
                              </div>
                            );
                            isFirstSegment = false;
                          } else {
                            // 后续段落：压缩段带月份标题
                            segments.push(
                              <div key={`month-header-compressed-mid-${dateKey}`} className="timeline-month-header">
                                <div className="timeline-month-info">
                                  <div className="month-year">{segment.year}</div>
                                  <div className="month-number">{segment.month}</div>
                                </div>
                                <CompressedDateRange
                                  startDate={compressedStart}
                                  endDate={compressedEnd}
                                  onDateClick={(date) => {
                                    const key = formatDateForStorage(date);
                                    setExpandedDates(prev => new Set(prev).add(key));
                                  }}
                                />
                              </div>
                            );
                          }
                          compressedStart = null;
                        } else if (isFirstSegment) {
                          // 第一个就是展开的日期，只渲染月份标题
                          segments.push(
                            <div key={`month-header-${segment.year}-${segment.month}`} className="timeline-month-header">
                              <div className="timeline-month-info">
                                <div className="month-year">{segment.year}</div>
                                <div className="month-number">{segment.month}</div>
                              </div>
                            </div>
                          );
                          isFirstSegment = false;
                        }
                        
                        // 渲染展开的日期
                        const dateEvents = eventsByDate.get(dateKey) || [];
                        const isToday = dateKey === findTodayFirstDateKey();
                        
                        segments.push(
                          <div key={dateKey} className="timeline-date-group" data-date-key={dateKey}>
                            <div className="timeline-date-header">
                              <h2 className="timeline-date-title">{formatDateTitle(dateKey)}</h2>
                            </div>
                            
                            {dateEvents.length === 0 && (
                              <TimeGap
                                prevEventEndTime={undefined}
                                nextEventStartTime={undefined}
                                onCreateEvent={handleCreateEvent}
                                onCreateNote={handleCreateNote}
                                onUploadAttachment={handleUploadAttachment}
                              />
                            )}
                          </div>
                        );
                      } else {
                        // 未展开的日期，累积到压缩段
                        if (!compressedStart) {
                          compressedStart = new Date(currentDate);
                        }
                      }
                      
                      currentDate.setDate(currentDate.getDate() + 1);
                    }
                    
                    // 如果最后还有累积的压缩段，渲染它（带月份标题）
                    if (compressedStart) {
                      segments.push(
                        <div key={`month-header-compressed-after-${segmentIndex}`} className="timeline-month-header">
                          <div className="timeline-month-info">
                            <div className="month-year">{segment.year}</div>
                            <div className="month-number">{segment.month}</div>
                          </div>
                          <CompressedDateRange
                            startDate={compressedStart}
                            endDate={nextSegment.endDate}
                            onDateClick={(date) => {
                              const key = formatDateForStorage(date);
                              setExpandedDates(prev => new Set(prev).add(key));
                            }}
                          />
                        </div>
                      );
                    }
                    
                    return <React.Fragment key={`month-${segment.year}-${segment.month}-${segmentIndex}`}>{segments}</React.Fragment>;
                  }
                  
                  // 没有展开的日期，渲染月份标题和压缩段在同一行
                  return (
                    <div key={`month-${segment.year}-${segment.month}-${segmentIndex}`} className="timeline-month-header">
                      <div className="timeline-month-info">
                        <div className="month-year">{segment.year}</div>
                        <div className="month-number">{segment.month}</div>
                      </div>
                      <CompressedDateRange
                        startDate={nextSegment.startDate}
                        endDate={nextSegment.endDate}
                        onDateClick={(date) => {
                          console.log('🎯 [TimeLog] onDateClick callback triggered with:', date);
                          const dateKey = formatDateForStorage(date);
                          console.log('📅 [TimeLog] Formatted dateKey:', dateKey);
                          setExpandedDates(prev => {
                            const newSet = new Set(prev).add(dateKey);
                            console.log('✅ [TimeLog] expandedDates updated, new size:', newSet.size, 'dates:', Array.from(newSet));
                            return newSet;
                          });
                        }}
                      />
                    </div>
                  );
                } else {
                  // 只有月份标题，没有压缩段
                  return (
                    <div key={`month-${segment.year}-${segment.month}-${segmentIndex}`} className="timeline-month-header">
                      <div className="timeline-month-info">
                        <div className="month-year">{segment.year}</div>
                        <div className="month-number">{segment.month}</div>
                      </div>
                    </div>
                  );
                }
              } else if (segment.type === 'compressed') {
                // 检查是否已经在上一个月份标题中渲染过
                const prevSegment = timelineSegments[segmentIndex - 1];
                if (prevSegment && prevSegment.type === 'month-header') {
                  // 已经在月份标题行渲染过，跳过
                  return null;
                }
                
                // 独立的压缩日期段（没有月份标题）
                // 检查该段内是否有日期被展开
                const hasExpandedDate = Array.from(expandedDates).some(expandedDateKey => {
                  const currentDate = new Date(segment.startDate);
                  while (currentDate <= segment.endDate) {
                    const dateKey = formatDateForStorage(currentDate);
                    if (dateKey === expandedDateKey) {
                      return true;
                    }
                    currentDate.setDate(currentDate.getDate() + 1);
                  }
                  return false;
                });
                
                if (hasExpandedDate) {
                  // 有展开的日期，将压缩段拆分成：压缩段1 + 展开日期 + 压缩段2
                  const segments: JSX.Element[] = [];
                  
                  const currentDate = new Date(segment.startDate);
                  let compressedStart: Date | null = null;
                  
                  while (currentDate <= segment.endDate) {
                    const dateKey = formatDateForStorage(currentDate);
                    const isExpanded = expandedDates.has(dateKey);
                    
                    if (isExpanded) {
                      // 如果之前有累积的压缩段，先渲染它
                      if (compressedStart) {
                        const compressedEnd = new Date(currentDate);
                        compressedEnd.setDate(compressedEnd.getDate() - 1);
                        segments.push(
                          <div key={`compressed-before-${dateKey}`} className="timeline-compressed-segment">
                            <CompressedDateRange
                              startDate={compressedStart}
                              endDate={compressedEnd}
                              onDateClick={(date) => {
                                const key = formatDateForStorage(date);
                                setExpandedDates(prev => new Set(prev).add(key));
                              }}
                            />
                          </div>
                        );
                        compressedStart = null;
                      }
                      
                      // 渲染展开的日期
                      const dateEvents = eventsByDate.get(dateKey) || [];
                      const isToday = dateKey === findTodayFirstDateKey();
                      
                      segments.push(
                        <div key={dateKey} className="timeline-date-group" data-date-key={dateKey}>
                          <div className="timeline-date-header">
                            <h2 className="timeline-date-title">{formatDateTitle(dateKey)}</h2>
                          </div>
                          
                          {dateEvents.length === 0 && (
                            <TimeGap
                              prevEventEndTime={undefined}
                              nextEventStartTime={undefined}
                              onCreateEvent={handleCreateEvent}
                              onCreateNote={handleCreateNote}
                              onUploadAttachment={handleUploadAttachment}
                            />
                          )}
                        </div>
                      );
                    } else {
                      // 未展开的日期，累积到压缩段
                      if (!compressedStart) {
                        compressedStart = new Date(currentDate);
                      }
                    }
                    
                    currentDate.setDate(currentDate.getDate() + 1);
                  }
                  
                  // 如果最后还有累积的压缩段，渲染它
                  if (compressedStart) {
                    segments.push(
                      <div key={`compressed-after-${segmentIndex}`} className="timeline-compressed-segment">
                        <CompressedDateRange
                          startDate={compressedStart}
                          endDate={segment.endDate}
                          onDateClick={(date) => {
                            const key = formatDateForStorage(date);
                            setExpandedDates(prev => new Set(prev).add(key));
                          }}
                        />
                      </div>
                    );
                  }
                  
                  return <React.Fragment key={`compressed-${segmentIndex}`}>{segments}</React.Fragment>;
                }
                
                return (
                  <div key={`compressed-${segmentIndex}`} className="timeline-compressed-segment">
                    <CompressedDateRange
                      startDate={segment.startDate}
                      endDate={segment.endDate}
                      onDateClick={(date) => {
                        console.log('🎯 [TimeLog] onDateClick callback triggered (standalone) with:', date);
                        const dateKey = formatDateForStorage(date);
                        console.log('📅 [TimeLog] Formatted dateKey:', dateKey);
                        setExpandedDates(prev => {
                          const newSet = new Set(prev).add(dateKey);
                          console.log('✅ [TimeLog] expandedDates updated, new size:', newSet.size, 'dates:', Array.from(newSet));
                          return newSet;
                        });
                      }}
                    />
                  </div>
                );
              } else {
                // 渲染事件日期段
                const dateKey = segment.dateKey;
                const dateEvents = eventsByDate.get(dateKey) || [];
                const todayDateKey = findTodayFirstDateKey();
                const isToday = dateKey === todayDateKey;
                const hasNoEvents = dateEvents.length === 0; // 单独1天空白
                
                // 调试：检查今天的判断（仅首次渲染时输出）
                if (isToday && import.meta.env.DEV && false) {
                  console.log(`📍 [TimeLog] Rendering today (${dateKey}):`, {
                    dateKey,
                    isToday,
                    hasEvents: dateEvents.length > 0,
                    eventCount: dateEvents.length
                  });
                }
                
                return (
                  <div key={dateKey} className="timeline-date-group" data-date-key={dateKey}>
                    {/* 日期标题 - 使用sticky定位，自动实现条件置顶 */}
                    <div 
                      className="timeline-date-header"
                      ref={isToday ? todayEventRef : null}
                    >
                      <h2 className="timeline-date-title">{formatDateTitle(dateKey)}</h2>
                    </div>
                    
                    {/* 空白日期（无事件）：显示完整的 TimeGap 虚线 */}
                    {dateEvents.length === 0 && (
                      <>
                        <TimeGap
                          prevEventEndTime={undefined}
                          nextEventStartTime={undefined}
                          onCreateEvent={handleCreateEvent}
                          onCreateNote={handleCreateNote}
                          onUploadAttachment={handleUploadAttachment}
                        />
                      </>
                    )}
                    
                    {/* 有事件的日期：第一个事件前显示 TimeGap */}
                    {dateEvents.length > 0 && (
                      <>
                        <TimeGap
                          prevEventEndTime={undefined}
                          nextEventStartTime={dateEvents[0].startTime ? new Date(dateEvents[0].startTime) : undefined}
                          onCreateEvent={handleCreateEvent}
                          onCreateNote={handleCreateNote}
                          onUploadAttachment={handleUploadAttachment}
                        />
                      </>
                    )}
                    
                    {/* 该日期的所有事件 */}
                    {dateEvents.map((event, index) => {
                      const nextEvent = dateEvents[index + 1];
                      return (
                        <React.Fragment key={event.id}>
                        <div className="timeline-event-wrapper" data-event-id={event.id}>
                  {/* Row 1: Icon + Time Info */}
                  <div className="event-header-row">
                  <div className="event-icon-col">
                    <img 
                      src={
                        !event.startTime && !event.endTime && event.eventlog ? NotesIconSvg :
                        index % 2 === 0 ? PlanIconSvg : TimerIconSvg
                      } 
                      className="timeline-status-icon" 
                      alt="status" 
                    />
                  </div>
                  <div className="event-time-col">
                    {/* 时间显示区域（带幽灵菜单） */}
                    <div 
                      className="time-display-wrapper"
                      onMouseEnter={() => setHoveredTimeId(event.id)}
                      onMouseLeave={() => setHoveredTimeId(null)}
                    >
                      {!event.startTime && !event.endTime && event.eventlog ? (
                        // 笔记事件：显示 createdAt 时间
                        <span className="time-text single-time">
                          {event.createdAt ? formatTime(event.createdAt) : '--:--'}
                        </span>
                      ) : event.startTime && event.endTime ? (
                        // 有开始和结束时间：显示时间段
                        <div className="time-range-display">
                          <span className="time-text start-time">
                            {formatTime(event.startTime)}
                          </span>
                          <span className="time-duration-arrow">
                            <span className="duration-text">
                              {formatDuration(event.startTime, event.endTime)}
                            </span>
                            <img src={ArrowBlueSvg} className="arrow-icon" alt="arrow" />
                          </span>
                          <span className="time-text end-time">
                            {formatTime(event.endTime)}
                          </span>
                        </div>
                      ) : event.startTime ? (
                        // 只有开始时间：只显示开始时间
                        <span className="time-text single-time">
                          {formatTime(event.startTime)}
                        </span>
                      ) : event.endTime ? (
                        // 只有结束时间：只显示结束时间
                        <span className="time-text single-time">
                          {formatTime(event.endTime)}
                        </span>
                      ) : (
                        // 没有时间：显示占位符
                        <span className="time-text single-time">
                          --:--
                        </span>
                      )}
                      
                      {/* 幽灵菜单 */}
                      {hoveredTimeId === event.id && (
                        <div className="ghost-menu time-ghost-menu">
                          <button 
                            className="ghost-menu-btn"
                            onClick={() => handleTimeEdit(event)}
                            title="编辑时间"
                          >
                            <img src={EditIconSvg} alt="edit" />
                          </button>
                          <button className="ghost-menu-btn" title="收藏">
                            <img src={FavoriteIconSvg} alt="favorite" />
                          </button>
                          <button className="ghost-menu-btn" title="添加截止日">
                            <img src={DdlIconSvg} alt="ddl" />
                          </button>
                          <button className="ghost-menu-btn" title="循环">
                            <img src={RotationIconSvg} alt="rotation" />
                          </button>
                          <button className="ghost-menu-btn" title="添加子任务">
                            <img src={AddTaskIconSvg} alt="add task" />
                          </button>
                          <button className="ghost-menu-btn" title="开始计时">
                            <img src={TimerStartIconSvg} alt="timer start" />
                          </button>
                        </div>
                      )}
                      
                      {/* 🆕 日历选择器弹窗 */}
                      {showCalendarPicker === event.id && createPortal(
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            position: 'fixed',
                            top: calendarPickerRefs.current.get(event.id) 
                              ? (calendarPickerRefs.current.get(event.id)!.getBoundingClientRect().bottom + 4) 
                              : '50%',
                            left: calendarPickerRefs.current.get(event.id) 
                              ? calendarPickerRefs.current.get(event.id)!.getBoundingClientRect().left 
                              : '50%',
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
                            selectedCalendarIds={event.calendarIds || []}
                            multiSelect={true}
                            onMultiSelectionChange={(calendarIds) => handleCalendarChange(event.id, calendarIds)}
                            onClose={() => setShowCalendarPicker(null)}
                            title="选择同步日历（可多选）"
                          />
                        </div>,
                        document.body
                      )}
                    </div>
                    
                    {/* 原有的 action buttons（隐藏，功能已移到幽灵菜单） */}
                    <div className="event-time-actions" style={{ display: 'none' }}>
                      <button className="time-action-btn" title="收藏">
                        <img src={FavoriteIconSvg} alt="favorite" />
                      </button>
                      <button className="time-action-btn" title="添加截止日">
                        <img src={DdlIconSvg} alt="ddl" />
                      </button>
                      <button className="time-action-btn" title="循环">
                        <img src={RotationIconSvg} alt="rotation" />
                      </button>
                      <button className="time-action-btn" title="添加子任务">
                        <img src={AddTaskIconSvg} alt="add task" />
                      </button>
                      <button className="time-action-btn" title="开始计时">
                        <img src={TimerStartIconSvg} alt="timer start" />
                      </button>
                    </div>
                  </div>
                  
                  {/* 🆕 日历来源信息（右对齐） */}
                  <div className="time-calendar-source-wrapper">
                    {/* 同步模式图标（在日历选择器左侧） */}
                    <div 
                      className="time-sync-mode-icon"
                      ref={(el) => { if (el) syncModePickerRefs.current.set(event.id, el); }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowSyncModePicker(showSyncModePicker === event.id ? null : event.id);
                      }}
                      title={(() => {
                        const info = getSyncModeInfo(event.syncMode || 'receive-only');
                        return info.name;
                      })()}
                    >
                      {(() => {
                        const info = getSyncModeInfo(event.syncMode || 'receive-only');
                        return info.emoji;
                      })()}
                    </div>
                    <div 
                      className="time-calendar-source"
                      ref={(el) => { if (el) calendarPickerRefs.current.set(event.id, el); }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCalendarPicker(showCalendarPicker === event.id ? null : event.id);
                      }}
                    >
                      {(() => {
                        const selectedIds = event.calendarIds || [];
                        const isEmpty = selectedIds.length === 0;
                        const firstCal = availableCalendars.find(c => c.id === selectedIds[0]);
                        
                        // 限制日历名称最多8个字符
                        const calendarName = isEmpty ? '选择日历...' : (firstCal?.name || '未知日历');
                        const displayName = calendarName.length > 8 
                          ? calendarName.substring(0, 8) + '...' 
                          : calendarName;
                        
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
                              fontSize: '14px',
                              color: isEmpty ? '#9ca3af' : '#374151',
                              fontWeight: isEmpty ? 'normal' : 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                              minWidth: 0
                            }}>
                              {displayName}
                              {selectedIds.length > 1 && <span style={{ color: '#9ca3af' }}> 等</span>}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Row 2: Line + Details */}
                <div className="event-body-row">
                  <div className="event-line-col">
                    <div className="timeline-line"></div>
                  </div>
                  <div 
                    className="event-details-col"
                    onClick={(e) => handleEventClick(e, event.id)}
                    style={{ cursor: 'default' }}
                  >
                    {/* Title & Source */}
                    <div 
                      className="event-row event-title-row"
                      onMouseEnter={() => setHoveredTitleId(event.id)}
                      onMouseLeave={() => setHoveredTitleId(null)}
                      style={{ paddingTop: '4px', minHeight: '28px' }}
                    >
                      {event.emoji && <span className="event-emoji">{event.emoji}</span>}
                      
                      {/* 标题始终可编辑，像 PlanSlate 一样 */}
                      <div className="event-title">
                        <LogSlate
                          mode="title"
                          value={(() => {
                            // 使用 colorTitle (Slate JSON，带颜色标记) 用于显示和编辑
                            const colorTitle = typeof event.title === 'object' 
                              ? event.title.colorTitle 
                              : null;
                            return colorTitle || '';
                          })()}
                          onChange={(slateJson) => {
                            // 缓存标题变化，不立即保存
                            console.log('📝 [TimeLog] onChange 收到数据', {
                              eventId: event.id.slice(-8),
                              slateJsonLength: slateJson.length,
                              preview: slateJson.substring(0, 100)
                            });
                            pendingTitleChanges.current.set(event.id, slateJson);
                          }}
                          onBlur={() => {
                            // 失焦时保存
                            console.log('👋 [TimeLog] onBlur 触发', {
                              eventId: event.id.slice(-8)
                            });
                            const pendingValue = pendingTitleChanges.current.get(event.id);
                            if (pendingValue !== undefined) {
                              console.log('💾 [TimeLog] 开始保存标题...', {
                                eventId: event.id.slice(-8),
                                valueLength: pendingValue.length
                              });
                              handleTitleSave(event.id, pendingValue);
                              pendingTitleChanges.current.delete(event.id);
                            } else {
                              console.warn('⚠️ [TimeLog] 没有待保存的标题', {
                                eventId: event.id.slice(-8)
                              });
                            }
                          }}
                          placeholder="添加标题..."
                        />
                      </div>
                      
                      {/* Title right icon - toggle log + ghost menu */}
                      <div 
                        className="title-right-menu-wrapper"
                        onMouseEnter={() => setHoveredRightMenuId(event.id)}
                        onMouseLeave={() => setHoveredRightMenuId(null)}
                      >
                        <img 
                          src={RightIconSvg} 
                          alt="right" 
                          className="title-right-icon"
                          onClick={() => toggleLogExpanded(event.id)}
                          style={{
                            width: '16px',
                            height: '16px',
                            opacity: 0.6,
                            cursor: 'pointer',
                            transform: expandedLogs.has(event.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                          }}
                        />
                        {/* Ghost menu appears on hover */}
                        {hoveredRightMenuId === event.id && (
                          <div className="ghost-menu title-ghost-menu">
                            <button 
                              className="ghost-menu-btn"
                              title="展开"
                              onClick={() => handleEditEvent(event)}
                            >
                              <img src={FullsizeIconSvg} alt="fullsize" style={{ width: '16px', height: '16px' }} />
                            </button>
                            <button 
                              className="ghost-menu-btn"
                              title="在标签页中打开"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleOpenInTab(event);
                              }}
                            >
                              <img src={TabIconSvg} alt="tab" style={{ width: '20px', height: '20px' }} />
                            </button>
                            <button 
                              className="ghost-menu-btn"
                              title="添加标签"
                              onClick={() => handleTagsClick(event)}
                            >
                              <img src={TagIconSvg} alt="tag" style={{ width: '16px', height: '16px' }} />
                            </button>
                            <button 
                              className="ghost-menu-btn"
                              title="添加参与者"
                              onClick={() => handleAttendeesEdit(event)}
                            >
                              <img src={AttendeeIconSvg} alt="attendees" style={{ width: '16px', height: '16px' }} />
                            </button>
                            <button 
                              className="ghost-menu-btn"
                              title="添加地点"
                              onClick={() => handleLocationEdit(event)}
                            >
                              <img src={LocationIconSvg} alt="location" style={{ width: '16px', height: '16px' }} />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {/* 🆕 同步模式选择器弹窗 */}
                      {showSyncModePicker === event.id && createPortal(
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            position: 'fixed',
                            top: syncModePickerRefs.current.get(event.id) 
                              ? (syncModePickerRefs.current.get(event.id)!.getBoundingClientRect().bottom + 4) 
                              : '50%',
                            right: syncModePickerRefs.current.get(event.id) 
                              ? (window.innerWidth - syncModePickerRefs.current.get(event.id)!.getBoundingClientRect().right) 
                              : 'auto',
                            left: syncModePickerRefs.current.get(event.id) ? 'auto' : '50%',
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
                            selectedModeId={event.syncMode || 'receive-only'}
                            onSelectionChange={(modeId) => handleSyncModeChange(event.id, modeId)}
                            onClose={() => setShowSyncModePicker(null)}
                            title="选择同步模式"
                          />
                        </div>,
                        document.body
                      )}
                    </div>
                  
                  {/* Meta Fields: Tags, Attendees, Location */}
                    {/* Row 1: Tags field (show when has content OR editing) */}
                    {((event.tags && event.tags.length > 0) || editingTagsId === event.id) && (
                      <Tippy
                        visible={editingTagsId === event.id}
                        reference={tagRowRef.current}
                        placement="bottom-start"
                        interactive={true}
                        arrow={false}
                        offset={[0, 8]}
                        appendTo={() => document.body}
                        onClickOutside={() => setEditingTagsId(null)}
                        content={
                          <div style={{ padding: 0 }}>
                            <HierarchicalTagPicker
                              availableTags={allTags.map(tag => ({
                                id: tag.id,
                                name: tag.name,
                                color: tag.color,
                                emoji: tag.emoji,
                                level: tag.level,
                                parentId: tag.parentId
                              }))}
                              selectedTagIds={event.tags || []}
                              onSelectionChange={(tagIds) => handleTagsChange(event.id, tagIds)}
                              mode="popup"
                              multiSelect={true}
                              onClose={() => setEditingTagsId(null)}
                            />
                          </div>
                        }
                      >
                        <div 
                          ref={editingTagsId === event.id ? tagRowRef : null}
                          className={`event-row event-tags-row ${editingTagsId === event.id ? 'keep-hover' : ''}`}
                          onClick={() => handleTagsClick(event)}
                          style={{ cursor: 'pointer' }}
                        >
                          <img src={TagIconSvg} className="row-icon" alt="tags" />
                          {event.tags && event.tags.length > 0 ? (
                            event.tags.map((tagId, idx) => {
                              const tag = allTags.find(t => t.id === tagId || t.name === tagId);
                              const emoji = tag?.emoji ? tag.emoji : '';
                              const name = tag ? tag.name : tagId;
                              
                              return (
                                <span key={idx} className="tag-item">
                                  #{emoji}{name}
                                </span>
                              );
                            })
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: '14px' }}>添加标签...</span>
                          )}
                        </div>
                      </Tippy>
                    )}

                    {/* Row 3: Attendees field - 使用 AttendeeDisplay 组件 */}
                    {(event.attendees && event.attendees.length > 0 || editingAttendeesId === event.id) && (
                      <div className="event-row" style={{ padding: '0' }}>
                        <AttendeeDisplay
                          event={event}
                          onChange={(attendees, organizer) => {
                            EventHub.updateFields(event.id, { 
                              attendees,
                              organizer 
                            }, {
                              source: 'TimeLog-attendeesChange'
                            });
                            setEditingAttendeesId(null);
                          }}
                        />
                      </div>
                    )}

                    {/* Row 4: Location field (show when has content OR editing) */}
                    {(event.location || editingLocationId === event.id) && (
                      <div 
                        className="event-row event-meta-row"
                        style={{ cursor: editingLocationId === event.id ? 'default' : 'pointer' }}
                      >
                        <img src={LocationIconSvg} className="row-icon" alt="location" />
                        {editingLocationId === event.id ? (
                          <LocationInput
                            value={getLocationDisplayText(event.location) || ''}
                            onChange={(value) => {
                              // 直接保存到 EventHub（即时保存）
                              EventHub.updateFields(event.id, { location: value }, {
                                source: 'TimeLog-locationChange'
                              });
                            }}
                            onSelect={() => setEditingLocationId(null)}
                            onBlur={() => setEditingLocationId(null)}
                            placeholder="添加地点..."
                          />
                        ) : (
                          <span className="meta-text" onClick={() => handleLocationEdit(event.id)}>
                            {getLocationDisplayText(event.location) || <span style={{ color: '#9ca3af' }}>添加地点...</span>}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Row 5: Icon bar - 已移至标题右侧的幽灵菜单 */}
                    {/* 旧的 event-meta-icon-bar 已被标题幽灵菜单取代 */}

                    {/* Log Content - 使用 LogSlate 编辑器 */}
                    {expandedLogs.has(event.id) && (
                      <div className="event-log-box">
                        <LogSlate
                          mode="eventlog"
                          value={getEventLogContent(event)}
                          onChange={(slateJson) => handleLogChange(event.id, slateJson)}
                          placeholder="添加日志..."
                          className="timelog-slate-editor"
                          showToolbar={true}
                          enableMention={true}
                          enableHashtag={true}
                          showPreline={false}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 事件之间/之后的 TimeGap */}
              {/* 渲染策略：
                  - 所有日期都显示（事件之间 + 最后事件之后）
                  - 第一个事件前的 TimeGap 在日期组件开始时渲染
                  - 性能优化：虚线按需渲染，压缩日期不渲染
              */}
              <TimeGap
                prevEventEndTime={event.endTime ? new Date(event.endTime) : (event.startTime ? new Date(event.startTime) : undefined)}
                nextEventStartTime={nextEvent && nextEvent.startTime ? new Date(nextEvent.startTime) : undefined}
                onCreateEvent={handleCreateEvent}
                onCreateNote={handleCreateNote}
                onUploadAttachment={handleUploadAttachment}
              />
            </React.Fragment>
          );
        })}
                  </div>
                );
              }
            })
          )}
            </div>
            
            {/* LogTab 事件详情页面 - 使用 CSS 隐藏，而非条件渲染 */}
            <div 
              className="timelog-tab-content"
              style={{ display: activeTabId !== 'timelog' ? 'flex' : 'none' }}
            >
              {tabManagerEvents.map((event) => (
                activeTabId === event.id && (
                  <LogTab
                    key={event.id}
                    eventId={event.id}
                    onClose={() => {
                      // 关闭标签页，切换回时光日志
                      setActiveTabId('timelog');
                      setTabManagerEvents(prev => prev.filter(e => e.id !== event.id));
                      if (tabManagerEvents.length <= 1) {
                        setShowTabManager(false);
                      }
                    }}
                    onSave={async (updatedEvent) => {
                      // 刷新事件列表
                      const updatedEvents = await EventService.getEventsInRange(
                        dateRange!.start,
                        dateRange!.end
                      );
                      setAllEvents(updatedEvents);
                    }}
                    onDelete={async (eventId) => {
                      // 删除事件后刷新列表并关闭标签页
                      await EventService.deleteEvent(eventId);
                      const updatedEvents = await EventService.getEventsInRange(
                        dateRange!.start,
                        dateRange!.end
                      );
                      setAllEvents(updatedEvents);
                      setActiveTabId('timelog');
                      setTabManagerEvents(prev => prev.filter(e => e.id !== eventId));
                      if (tabManagerEvents.length <= 1) {
                        setShowTabManager(false);
                      }
                    }}
                    hierarchicalTags={hierarchicalTags}
                  />
                )
              ))}
            </div>
        </div>
      </div>

      {/* 新固定玻璃图标栏（替换原右侧三个按钮） */}
      <GlassIconBar onAction={(id) => {
        console.log('[GlassIconBar action]', id);
        if (id === 'export') handleExport();
        if (id === 'bookmark') handleCopyLink();
        if (id === 'record') console.log('记录此刻 - TODO 打开记录输入');
      }} />

      {/* 新建事件模态框 */}
      <EventEditModalV2
        eventId={newEventTemplate?.id || null}
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setNewEventTemplate(null);
        }}
        onSave={handleCreateSave}
        hierarchicalTags={hierarchicalTags}
      />
      
      {/* 编辑事件模态框 */}
      <EventEditModalV2
        eventId={editingEvent?.id || null}
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingEvent(null);
        }}
        onSave={handleEditSave}
        hierarchicalTags={hierarchicalTags}
      />
      
      {/* 时间编辑器 */}
      {editingTimeId && (
        <UnifiedDateTimePicker
          initialStart={allEvents.find(e => e.id === editingTimeId)?.startTime}
          initialEnd={allEvents.find(e => e.id === editingTimeId)?.endTime}
          onSelect={(start, end) => {
            if (start || end) {
              handleTimeChange(editingTimeId, {
                startTime: start || undefined,
                endTime: end || undefined
              });
            }
          }}
          onClose={handleTimePickerClose}
        />
      )}

      {/* EventTabManager 已集成到 timelog-main-card 内部 */}
    </div>
  );
};

// 辅助函数：格式化时间
function formatTime(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 辅助函数：格式化时长
function formatDuration(startStr: string | Date, endStr: string | Date): string {
  const start = typeof startStr === 'string' ? new Date(startStr) : startStr;
  const end = typeof endStr === 'string' ? new Date(endStr) : endStr;
  const diff = end.getTime() - start.getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  
  if (hours > 0 && minutes > 0) {
    return `${hours}h${minutes}min`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}min`;
  }
}

// 辅助函数：格式化相对时间
function formatRelativeTime(timestamp: number | string | undefined): string {
  if (!timestamp) return '未知';
  
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  const now = Date.now();
  const diff = now - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return date.toLocaleDateString('zh-CN');
}

// 辅助函数：格式化截止日期剩余时间
function formatDueDateRemaining(dueDateTime: string | Date): string {
  const date = typeof dueDateTime === 'string' ? new Date(dueDateTime) : dueDateTime;
  const now = Date.now();
  const diff = date.getTime() - now;
  
  if (diff < 0) return '已过期';
  
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  
  if (hours < 24) {
    return `${hours}小时${minutes}分钟`;
  }
  
  const days = Math.floor(diff / 86400000);
  return `${days}天`;
}

export default TimeLog;
