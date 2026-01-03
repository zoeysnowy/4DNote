import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import GlassIconBar from '../../../components/GlassIconBar';
import ContentSelectionPanel from '../../../components/ContentSelectionPanel';
import { EventService } from '../../../services/EventService';
import { EventHub } from '../../../services/EventHub';
import { TagService } from '../../../services/TagService';
import { EventTreeAPI } from '../../../services/EventTree/TreeAPI';
import { ModalSlate } from '../../../components/ModalSlate/ModalSlate';
import { LogSlate } from '../../../components/LogSlate/LogSlate';
import { HierarchicalTagPicker } from '../../../components/HierarchicalTagPicker/HierarchicalTagPicker';
import { LocationInput } from '../../../components/common/LocationInput';
import { AttendeeDisplay } from '../../../components/common/AttendeeDisplay';
import UnifiedDateTimePicker from '../../../components/FloatingToolbar/pickers/UnifiedDateTimePicker';
import { TimeGap } from '../components/TimeGap';
import { CompressedDateRange } from '../components/CompressedDateRange';
import { EventEditModalV2 } from '../../../components/EventEditModal/EventEditModalV2';
import { SimpleCalendarDropdown } from '../../../components/EventEditModalV2Demo/SimpleCalendarDropdown';
import { SyncModeDropdown } from '../../../components/EventEditModalV2Demo/SyncModeDropdown';
import EventTabManager from '../../../components/EventTabManager';
import { LogTab } from '../../../pages/LogTab';
import { getAvailableCalendarsForSettings } from '../../../utils/calendarUtils';
import { supportsMultiWindow, openEventInWindow } from '../../../utils/electronUtils';
import { createPortal, flushSync } from 'react-dom';
import { generateEventId } from '../../../utils/idGenerator'; // 🔧 使用新的 UUID 生成器
import { formatTimeForStorage, formatDateForStorage, parseLocalTimeStringOrNull } from '../../../utils/timeUtils'; // 🔧 TimeSpec 格式化
import { getLocationDisplayText } from '../../../utils/locationUtils'; // 🔧 Location 显示工具
import { slateNodesToHtml, slateNodesToPlainText } from '../../../utils/slateSerializer';
import { resolveDisplayTitle } from '../../../utils/TitleResolver';
import { useEventsUpdatedSubscription } from '../../../hooks/useEventsUpdatedSubscription';
import { useEventHubSnapshot } from '../../../hooks/useEventHubSnapshot';
import type { Event } from '../../../types';
import './TimeLog.css';
import { resolveCalendarDateRange } from '../../../utils/TimeResolver';

// 导入图标
import ExportIconSvg from '../../../assets/icons/export.svg';
import LinkIconSvg from '../../../assets/icons/link_gray.svg';
import MoreIconSvg from '../../../assets/icons/more.svg';
import TimeIconSvg from '../../../assets/icons/Time.svg';
import AttendeeIconSvg from '../../../assets/icons/Attendee.svg';
import LocationIconSvg from '../../../assets/icons/Location.svg';
import OutlookIconSvg from '../../../assets/icons/Outlook.svg';
import GoogleIconSvg from '../../../assets/icons/Google_Calendar.svg';
import SyncIconSvg from '../../../assets/icons/Sync.svg';
import ArrowBlueSvg from '../../../assets/icons/Arrow_blue.svg';
// 新增图标
import PlanIconSvg from '../../../assets/icons/datetime.svg';
import TimerIconSvg from '../../../assets/icons/timer_start.svg';
import ExpandIconSvg from '../../../assets/icons/right.svg';
import TagIconSvg from '../../../assets/icons/Tag.svg';
import DownIconSvg from '../../../assets/icons/down.svg';
import EditIconSvg from '../../../assets/icons/Edit.svg';
import FavoriteIconSvg from '../../../assets/icons/favorite.svg';
import LinkColorIconSvg from '../../../assets/icons/link_color.svg';
import DdlIconSvg from '../../../assets/icons/ddl_add.svg';
import RotationIconSvg from '../../../assets/icons/recurring_gray.svg';
import AddTaskIconSvg from '../../../assets/icons/Add_task_gray.svg';
import TimerStartIconSvg from '../../../assets/icons/timer_start.svg';
import NotesIconSvg from '../assets/icons/Notes.svg';
import RightIconSvg from '../assets/icons/right.svg';
import NotetreeIconSvg from '../assets/icons/Notetree.svg';
import FullsizeIconSvg from '../assets/icons/fullsize.svg';
import TabIconSvg from '../assets/icons/tab.svg';
import DeleteIconSvg from '../assets/icons/delete.svg';
import ProjectIconSvg from '../assets/icons/project.svg';
import TitleEditIconSvg from '../assets/icons/title_edit.svg';
import DatetimeIconSvg from '../assets/icons/datetime.svg';
import EventManagerIconSvg from '../assets/icons/EventManager.svg';
import AllMenuIconSvg from '../assets/icons/AllMenu.svg';
import TimePropertyIconSvg from '../assets/icons/TimeProperty.svg';

// 🚀 全局滚动标记：避免重复滚动到今天（不受HMR 影响）
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
  // 标题编辑由 activeEditor 统一驱动（避免“设置了 editingTitleId 但 UI 未渲染”的断链）
  const [editingTitle, setEditingTitle] = useState('');
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [editingAttendeesId, setEditingAttendeesId] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [hoveredTimeId, setHoveredTimeId] = useState<string | null>(null);
  const [hoveredTitleId, setHoveredTitleId] = useState<string | null>(null);
  const [hoveredRightId, setHoveredRightId] = useState<string | null>(null); // Right按钮hover状态
  const [hoveredRightMenuId, setHoveredRightMenuId] = useState<string | null>(null);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);

  // ✅ 只在可视范围（含预加载 margin）渲染 Slate readOnly，避免一次挂载大量 editor
  const inViewEventlogIdsRef = useRef<Set<string>>(new Set());
  const [inViewEventlogVersion, setInViewEventlogVersion] = useState(0);
  const eventlogObserverRef = useRef<IntersectionObserver | null>(null);
  const eventlogObservedElsRef = useRef<Map<string, Element>>(new Map());
  const eventlogObserverInitializedRef = useRef(false);

  // ✅ 进一步限制同时存在的 Slate 实例数量（避免长列表下内存/CPU 飙升）
  const MAX_MOUNTED_EVENTLOG_SLATES = 12;
  const mountedEventlogSlateIdsRef = useRef<string[]>([]);
  const mountedEventlogSlateSetRef = useRef<Set<string>>(new Set());
  const [mountedEventlogSlateVersion, setMountedEventlogSlateVersion] = useState(0);
  
  // Right菜单延迟隐藏的timer
  const rightMenuHideTimerRef = useRef<NodeJS.Timeout | null>(null);
  
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

  // 🆕 v2.19: 追踪空Note 事件（用于自动清理）
  const emptyNotesRef = useRef<Set<string>>(new Set());

  // 🆕 v2.19: 从localStorage 恢复 LogTab 状态
  useEffect(() => {
    const restoreLogTabs = async () => {
      try {
        const savedTabIds = localStorage.getItem('4dnote-logtabs');
        if (!savedTabIds) return;

        const tabIds: string[] = JSON.parse(savedTabIds);
        if (tabIds.length === 0) return;

        // 批量加载事件
        const events: Event[] = [];
        for (const eventId of tabIds) {
          const event = await EventService.getEventById(eventId);
          if (event) {
            events.push(event);
          }
        }

        if (events.length > 0) {
          setTabManagerEvents(events);
          setShowTabManager(true);
        }
      } catch (error) {
        console.error('✅[TimeLog] 恢复 LogTab 状态失败', error);
        localStorage.removeItem('4dnote-logtabs');
      }
    };

    restoreLogTabs();
  }, []);

  // 🆕 v2.19: 持久化LogTab 状态到 localStorage
  useEffect(() => {
    if (tabManagerEvents.length === 0) {
      localStorage.removeItem('4dnote-logtabs');
    } else {
      const tabIds = tabManagerEvents.map(e => e.id);
      localStorage.setItem('4dnote-logtabs', JSON.stringify(tabIds));
    }
  }, [tabManagerEvents]);

  // 🆕 v2.19: 从侧边栏重要笔记导航到事件
  useEffect(() => {
    const handleNavigation = async () => {
      const targetEventId = sessionStorage.getItem('4dnote-navigate-to-event');
      if (!targetEventId) return;

      // 清除导航标记
      sessionStorage.removeItem('4dnote-navigate-to-event');

      try {
        // 加载事件
        const event = await EventService.getEventById(targetEventId);
        if (!event) {
          console.warn('⚠️ [TimeLog] 导航目标事件不存在', targetEventId);
          return;
        }

        // 打开 LogTab
        setTabManagerEvents(prev => {
          const exists = prev.find(e => e.id === targetEventId);
          if (exists) return prev;
          return [...prev, event];
        });
        setShowTabManager(true);
        setActiveTabId(targetEventId);

        // ✅v2.21.1: 使用 requestAnimationFrame 替代 setTimeout，更适合 DOM 操作
        requestAnimationFrame(() => {
          const eventElement = document.querySelector(`[data-event-id="${targetEventId}"]`);
          if (eventElement) {
            eventElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });

        console.log('✅[TimeLog] 导航到事件', targetEventId);
      } catch (error) {
        console.error('✅[TimeLog] 导航失败:', error);
      }
    };

    handleNavigation();
  }, []);

  // 🆕 v2.19: 页面卸载时清理所有空 Note
  useEffect(() => {
    return () => {
      // 组件卸载时删除所有仍为空空Note
      const emptyNoteIds = Array.from(emptyNotesRef.current);
      if (emptyNoteIds.length > 0) {
        console.log('🗑✅[TimeLog] Cleaning up empty notes on unmount:', emptyNoteIds);
        
        // 异步删除，不阻塞卸载
        Promise.all(
          emptyNoteIds.map(async (eventId) => {
            try {
              await EventService.deleteEvent(eventId);
              console.log('✅[TimeLog] Deleted empty note:', eventId);
            } catch (error) {
              console.error('✅[TimeLog] Failed to delete empty note:', eventId, error);
            }
          })
        );
      }
    };
  }, []);

  // Handler: Open event in tab manager or separate window
  const handleOpenInTab = useCallback(async (event: Event) => {
    console.log('🏷✅[TimeLog] handleOpenInTab called:', event.id);
    console.log('🔍 [TimeLog] supportsMultiWindow:', supportsMultiWindow());
    
    // Electron 环境下优先使用多窗口
    if (supportsMultiWindow()) {
      const success = await openEventInWindow(event.id, event);
      if (success) {
        console.log('✅Opened event in separate window:', event.id);
        return;
      }
      console.warn('⚠️ Failed to open window, falling back to tab manager');
    }
    
    // Web 环境或窗口打开失败，使用标签页管理✅
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
  
  // 动态滚动加载状态- 支持双向无限滚动
  const [dynamicStartDate, setDynamicStartDate] = useState<Date | null>(null);
  const [dynamicEndDate, setDynamicEndDate] = useState<Date | null>(null);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [isLoadingLater, setIsLoadingLater] = useState(false);
  
  // 🔧 异步加载事件数据（需要在 useEffect 之前定义✅
  // ✅使用过滤后的时间轴事件，排除无时间的 Task 和附属事件
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // 性能优化 Phase 1：只挂载一个 Slate 编辑器（默认展开阅读走只读）
  const [activeEditor, setActiveEditor] = useState<null | { eventId: string; mode: 'title' | 'eventlog' }>(null);

  // 根据「当前激活 + 可视范围」维护一个 capped 的 mounted 集合
  useEffect(() => {
    const activeEventlogId = activeEditor?.mode === 'eventlog' ? activeEditor.eventId : null;
    const inView = Array.from(inViewEventlogIdsRef.current.values());
    const prev = mountedEventlogSlateIdsRef.current;

    const wanted = [activeEventlogId, ...inView, ...prev].filter(Boolean) as string[];
    const next: string[] = [];
    const seen = new Set<string>();

    for (const id of wanted) {
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(id);
      if (next.length >= MAX_MOUNTED_EVENTLOG_SLATES) break;
    }

    const changed =
      next.length !== prev.length ||
      next.some((id, idx) => id !== prev[idx]);

    if (changed) {
      mountedEventlogSlateIdsRef.current = next;
      mountedEventlogSlateSetRef.current = new Set(next);
      setMountedEventlogSlateVersion(v => v + 1);
    }
  }, [inViewEventlogVersion, activeEditor?.eventId, activeEditor?.mode]);

  const extractPlainTextFromSlateJson = useCallback((slateJson: string): string => {
    if (!slateJson) return '';
    try {
      const nodes = JSON.parse(slateJson);
      if (!Array.isArray(nodes)) return '';
      return slateNodesToPlainText(nodes as any).trim();
    } catch {
      return '';
    }
  }, []);

  const getTitlePlainText = useCallback((event: Event): string => {
    const titleObj = typeof event.title === 'object' ? event.title : null;
    const simpleTitle = titleObj?.simpleTitle || '';
    if (simpleTitle.trim()) return simpleTitle;

    const colorTitle = titleObj?.colorTitle || '';
    if (colorTitle) {
      const parsed = extractPlainTextFromSlateJson(colorTitle);
      if (parsed) return parsed;
    }

    const fullTitle = (titleObj as any)?.fullTitle || '';
    if (typeof fullTitle === 'string' && fullTitle) {
      const parsed = extractPlainTextFromSlateJson(fullTitle);
      if (parsed) return parsed;
    }
    return '';
  }, [extractPlainTextFromSlateJson]);

  const getEventLogPlainText = useCallback((event: Event): string => {
    if (!event.eventlog) return '';

    if (typeof event.eventlog === 'object') {
      const anyLog = event.eventlog as any;
      if (typeof anyLog.plainText === 'string' && anyLog.plainText.trim()) {
        return anyLog.plainText;
      }
      if (typeof anyLog.slateJson === 'string' && anyLog.slateJson) {
        return extractPlainTextFromSlateJson(anyLog.slateJson);
      }
      return '';
    }

    if (typeof event.eventlog === 'string') {
      return extractPlainTextFromSlateJson(event.eventlog);
    }

    return '';
  }, [extractPlainTextFromSlateJson]);

  const openEditor = useCallback((eventId: string, mode: 'title' | 'eventlog') => {
    // 交互触发：优先把该 eventlog 加入 mounted（避免首次点击时从预览态切换产生闪动）
    if (mode === 'eventlog') {
      const prev = mountedEventlogSlateIdsRef.current;
      const next = [eventId, ...prev.filter(id => id !== eventId)].slice(0, MAX_MOUNTED_EVENTLOG_SLATES);
      mountedEventlogSlateIdsRef.current = next;
      mountedEventlogSlateSetRef.current = new Set(next);
      setMountedEventlogSlateVersion(v => v + 1);
    }

    setActiveEditor({ eventId, mode });
  }, []);

  const closeEditor = useCallback((eventId?: string) => {
    if (eventId && activeEditor?.eventId !== eventId) return;
    setActiveEditor(null);
  }, [activeEditor?.eventId]);

  type EventsUpdater = Event[] | ((prev: Event[]) => Event[]);
  const setAllEventsSynced = useCallback((updater: EventsUpdater) => {
    setAllEvents(prev => {
      const next =
        typeof updater === 'function'
          ? (updater as (prev: Event[]) => Event[])(prev)
          : updater;
      allEventsRef.current = next;
      return next;
    });
  }, []);

  const updateLocalEvent = useCallback((eventId: string, patch: Partial<Event>) => {
    setAllEventsSynced(prev => prev.map(e => (e.id === eventId ? ({ ...e, ...patch } as Event) : e)));
  }, [setAllEventsSynced]);

  const escapeHtml = useCallback((text: string) => {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }, []);

  const slateJsonToHtmlSafe = useCallback((slateJson: string): string => {
    if (!slateJson || !slateJson.trim()) return '';
    try {
      const parsed = JSON.parse(slateJson);
      if (Array.isArray(parsed)) {
        return slateNodesToHtml(parsed as any);
      }
      return '';
    } catch {
      return '';
    }
  }, []);

  const makePlaceholderHtml = useCallback((placeholderText: string) => {
    const safe = escapeHtml(placeholderText);
    return `<p><span data-slate-placeholder="true">${safe}</span></p>`;
  }, [escapeHtml]);

  const formatEventlogTimestamp = useCallback((ts: number): string => {
    const date = new Date(ts);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }, []);

  // 预览 HTML：尽量保持与 LogSlate 的 timestamp 视觉结构一致，避免“进入可视区时才出现 timestamp”导致抖动
  const slateJsonToHtmlPreviewWithTimestamps = useCallback((slateJson: string): string => {
    if (!slateJson || !slateJson.trim()) return '';
    try {
      const parsed = JSON.parse(slateJson);
      if (!Array.isArray(parsed)) return '';

      const blocks: string[] = [];
      for (const node of parsed as any[]) {
        const nodeHtml = slateNodesToHtml([node] as any);
        if (node?.type === 'paragraph' && typeof node.createdAt === 'number') {
          const tsText = formatEventlogTimestamp(node.createdAt);
          blocks.push(
            `<div style="position:relative;padding-top:28px;">` +
              `<div contenteditable="false" style="position:absolute;left:0;top:8px;font-size:12px;color:#999;opacity:0.7;user-select:none;white-space:nowrap;font-variant-numeric:tabular-nums;">${escapeHtml(tsText)}</div>` +
              `${nodeHtml}` +
            `</div>`
          );
        } else {
          blocks.push(nodeHtml);
        }
      }

      // 给用户一个“可点击的末尾空行”，模拟编辑器尾部虚拟节点
      return `${blocks.join('')}\n<p><br/></p>`;
    } catch {
      return '';
    }
  }, [escapeHtml, formatEventlogTimestamp]);

  const getTitlePreviewHtml = useCallback((event: Event): string => {
    const titleObj = typeof event.title === 'object' ? (event.title as any) : null;
    const colorTitle = titleObj?.colorTitle;
    if (typeof colorTitle === 'string' && colorTitle.trim()) {
      const html = slateJsonToHtmlSafe(colorTitle);
      return html || '';
    }

    const simpleTitle = titleObj?.simpleTitle;
    if (typeof simpleTitle === 'string' && simpleTitle.trim()) {
      return `<p>${escapeHtml(simpleTitle.trim())}</p>`;
    }

    return '';
  }, [escapeHtml, slateJsonToHtmlSafe]);

  const getEventLogPreviewHtml = useCallback((event: Event): string => {
    const log = event.eventlog as any;
    if (log && typeof log === 'object') {
      if (typeof log.slateJson === 'string' && log.slateJson.trim()) {
        return slateJsonToHtmlPreviewWithTimestamps(log.slateJson) || '';
      }
      if (typeof log.html === 'string' && log.html.trim()) {
        // 没有 slateJson 元数据时，只能退化为原 HTML
        return `${log.html}\n<p><br/></p>`;
      }
      return '';
    }

    if (typeof event.eventlog === 'string' && event.eventlog.trim()) {
      const html = slateJsonToHtmlPreviewWithTimestamps(event.eventlog);
      if (html) return html;

      // 兼容：如果不是 Slate JSON（例如纯文本/未知），保留原逻辑
      const fallback = slateJsonToHtmlSafe(event.eventlog);
      return fallback ? `${fallback}\n<p><br/></p>` : '';
    }

    return '';
  }, [slateJsonToHtmlPreviewWithTimestamps, slateJsonToHtmlSafe]);

  const tagRowRef = useRef<HTMLDivElement | null>(null);
  const modalSlateRefs = useRef<Map<string, any>>(new Map());
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const todayEventRef = useRef<HTMLDivElement | null>(null);
  const allEventsRef = useRef<Event[]>([]);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 性能优化 Phase 2：根据 sticky 日期标题，决定“当前日期段±2天”挂载哪些 Slate（减少同时存在的 Slate 数量）
  const [activeStickyDateKey, setActiveStickyDateKey] = useState<string | null>(null);
  const activeStickyDateKeyRef = useRef<string | null>(null);

  const isDateKeyWithinDays = useCallback((dateKey: string, centerKey: string, days: number) => {
    const parse = (key: string): [number, number, number] | null => {
      const parts = key.split('-');
      if (parts.length !== 3) return null;
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return [year, month, day];
    };

    const a = parse(dateKey);
    const b = parse(centerKey);
    if (!a || !b) return false;

    const utcA = Date.UTC(a[0], a[1] - 1, a[2]);
    const utcB = Date.UTC(b[0], b[1] - 1, b[2]);
    const diffDays = Math.abs(utcA - utcB) / (24 * 60 * 60 * 1000);
    return diffDays <= days;
  }, []);

  const updateActiveStickyDateKey = useCallback(() => {
    const container = timelineContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const headers = Array.from(
      container.querySelectorAll<HTMLElement>('.timeline-date-header[data-date-key]')
    );
    if (headers.length === 0) return;

    let bestKey: string | null = null;
    let bestDelta = -Infinity;

    for (const header of headers) {
      const key = header.getAttribute('data-date-key');
      if (!key) continue;
      const delta = header.getBoundingClientRect().top - containerRect.top;
      // sticky 时 header.top 约等于容器 top；选择“最接近 top 且不在其下方”的一个
      if (delta <= 1 && delta > bestDelta) {
        bestDelta = delta;
        bestKey = key;
      }
    }

    // 如果尚未有任何 header 到达 sticky 区域，选第一个
    if (!bestKey) {
      bestKey = headers[0].getAttribute('data-date-key');
    }

    if (bestKey && bestKey !== activeStickyDateKeyRef.current) {
      activeStickyDateKeyRef.current = bestKey;
      setActiveStickyDateKey(bestKey);
    }
  }, []);

  useEffect(() => {
    if (loadingEvents) return;
    const container = timelineContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateActiveStickyDateKey();
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    // 初始同步一次
    window.requestAnimationFrame(() => updateActiveStickyDateKey());

    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [loadingEvents, updateActiveStickyDateKey]);

  // IntersectionObserver：root 使用 TimeLog 的滚动容器，提前预加载一屏（减少“进入可视区才切换”的视觉差）
  useEffect(() => {
    if (eventlogObserverInitializedRef.current) return;
    const root = timelineContainerRef.current;
    if (!root) return;

    eventlogObserverInitializedRef.current = true;
    eventlogObserverRef.current = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const eventId = el.getAttribute('data-eventlog-observe-id') || '';
          if (!eventId) continue;

          if (entry.isIntersecting) {
            if (!inViewEventlogIdsRef.current.has(eventId)) {
              inViewEventlogIdsRef.current.add(eventId);
              changed = true;
            }
          } else {
            if (inViewEventlogIdsRef.current.has(eventId)) {
              inViewEventlogIdsRef.current.delete(eventId);
              changed = true;
            }
          }
        }
        if (changed) setInViewEventlogVersion(v => v + 1);
      },
      {
        root,
        rootMargin: '1200px 0px',
        threshold: 0.01,
      }
    );

    // 重新 observe 已注册元素
    for (const el of eventlogObservedElsRef.current.values()) {
      eventlogObserverRef.current.observe(el);
    }

    return () => {
      eventlogObserverRef.current?.disconnect();
      eventlogObserverRef.current = null;
      eventlogObserverInitializedRef.current = false;
    };
  }, [loadingEvents]);

  const setEventlogObserveRef = useCallback((eventId: string) => {
    return (el: HTMLDivElement | null) => {
      const prev = eventlogObservedElsRef.current.get(eventId);
      if (prev && eventlogObserverRef.current) {
        eventlogObserverRef.current.unobserve(prev);
      }
      if (!el) {
        eventlogObservedElsRef.current.delete(eventId);
        return;
      }
      eventlogObservedElsRef.current.set(eventId, el);
      if (eventlogObserverRef.current) {
        eventlogObserverRef.current.observe(el);
      }
    };
  }, []);
  
  // 使用 ref 存储最新的状态，避免闭包问题
  const dynamicStartDateRef = useRef<Date | null>(null);
  const dynamicEndDateRef = useRef<Date | null>(null);
  const isLoadingEarlierRef = useRef(false);
  const isLoadingLaterRef = useRef(false);
  
  // 同步 state ✅ref
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

  // 双向无限滚动监听器（优化：使✅ref 避免闭包问题✅
  useEffect(() => {
    // 等待加载完成✅DOM 渲染
    if (loadingEvents) {
      console.log('✅[TimeLog] Waiting for events to load before attaching scroll listener');
      return;
    }

    const container = timelineContainerRef.current;
    if (!container) {
      console.warn('⚠️ [TimeLog] timelineContainerRef is null');
      return;
    }

    console.log('✅[TimeLog] Scroll listener attached', {
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
      // 但不应该立即触发加载，需要用户主动滚✅
      if (scrollTop < 100 && scrollTop > 0 && !isLoadingEarlierRef.current) {
        console.log('🔼 [TimeLog] 触发历史加载！scrollTop=' + scrollTop);
        isLoadingEarlierRef.current = true;
        setIsLoadingEarlier(true);
        
        const loadHistory = async () => {
          // 保存当前可见的第一个元素作为锚✅
          const firstVisibleElement = container.querySelector('.timeline-date-group');
          const firstVisibleTop = firstVisibleElement ? firstVisibleElement.getBoundingClientRect().top : 0;
          const containerTop = container.getBoundingClientRect().top;
          const offsetFromTop = firstVisibleTop - containerTop;
          
          const currentStart = dynamicStartDateRef.current || new Date();
          const newStart = new Date(currentStart);
          newStart.setDate(newStart.getDate() - 30); // 往前加✅0✅
          
          // console.log('📅 [TimeLog] Loading history:', {
          //   from: formatTimeForStorage(newStart),
          //   to: formatTimeForStorage(currentStart),
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

            setAllEventsSynced(uniqueEvents);
            setDynamicStartDate(newStart);
            dynamicStartDateRef.current = newStart;
            
            console.log(`✅[TimeLog] Loaded ${historyEvents.length} history events (filtered)`);
            
            // 🔧 保持视图稳定：等✅DOM 更新后，将锚点元素恢复到原来的视觉位✅
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
            console.error('✅[TimeLog] Failed to load history:', error);
          } finally {
            // ✅v2.21.1: 使用 queueMicrotask 替代 setTimeout
            queueMicrotask(() => {
              isLoadingEarlierRef.current = false;
              setIsLoadingEarlier(false);
            });
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
          newEnd.setDate(newEnd.getDate() + 30); // 往后加✅0✅
          newEnd.setHours(23, 59, 59, 999);
          
          // console.log('📅 [TimeLog] Loading future:', {
          //   from: formatTimeForStorage(currentEnd),
          //   to: formatTimeForStorage(newEnd)
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

            setAllEventsSynced(uniqueEvents);
            setDynamicEndDate(newEnd);
            
            console.log(`✅[TimeLog] Loaded ${futureEvents.length} future events (filtered)`);
          } catch (error) {
            console.error('✅[TimeLog] Failed to load future events:', error);
          } finally {
            // ✅v2.21.1: 使用 queueMicrotask 替代 setTimeout
            queueMicrotask(() => {
              isLoadingLaterRef.current = false;
              setIsLoadingLater(false);
            });
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
  }, [loadingEvents]); // 只依✅loadingEvents，其他状态通过 ref 访问

  // 获取所有标签（✅PlanManager 一致）
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



  // 格式化日期显✅
  function formatDateDisplay(date: Date): string {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekday = weekdays[date.getDay()];
    return `${month}.${day} ${weekday}`;
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
        // 初始加载范围：过去 7 天 + 未来 30 天（避免“今天附近无事件”导致页面看起来是空的）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const initialStartDate = new Date(today);
        initialStartDate.setDate(initialStartDate.getDate() - 7);
        
        const initialEndDate = new Date(today);
        initialEndDate.setDate(initialEndDate.getDate() + 30);
        initialEndDate.setHours(23, 59, 59, 999);
        
        console.log('📅 [TimeLog] Initial load range:', {
          start: formatTimeForStorage(initialStartDate),
          end: formatTimeForStorage(initialEndDate)
        });
        
        const dbQueryStartTime = performance.now();
        // 加载初始范围事件（getTimelineEvents 负责过滤）
        const getEventTimeSafe = (event: Event): Date | null => {
          const raw = event.startTime || event.endTime || event.createdAt;
          if (!raw) return null;

          // Prefer strict local parsing for our canonical TimeSpec formats.
          const strict = parseLocalTimeStringOrNull(raw);
          if (strict) return strict;

          // Fallback for legacy / external formats (e.g. ISO strings).
          const d = new Date(raw);
          return Number.isNaN(d.getTime()) ? null : d;
        };

        const countPastEventsInRange = (events: Event[], start: Date, end: Date): number => {
          let count = 0;
          for (const event of events) {
            const t = getEventTimeSafe(event);
            if (!t) continue;
            if (t >= start && t <= end) count++;
          }
          return count;
        };

        let effectiveStartDate = new Date(initialStartDate);

        let events = await EventService.getTimelineEvents(
          formatTimeForStorage(effectiveStartDate),
          formatTimeForStorage(initialEndDate)
        );

        // 如果“过去 7 天（从 effectiveStartDate 到今天）”事件少于 10 个，则继续向前扩展：每次 +3 天，最多扩展到过去 30 天
        const maxPastDays = 30;
        const expandStepDays = 3;
        const desiredMinPastEvents = 10;
        const maxPastStart = new Date(today);
        maxPastStart.setDate(maxPastStart.getDate() - maxPastDays);

        while (
          effectiveStartDate > maxPastStart &&
          countPastEventsInRange(events, effectiveStartDate, today) < desiredMinPastEvents
        ) {
          const nextStart = new Date(effectiveStartDate);
          nextStart.setDate(nextStart.getDate() - expandStepDays);
          if (nextStart < maxPastStart) {
            nextStart.setTime(maxPastStart.getTime());
          }

          const morePastEvents = await EventService.getTimelineEvents(
            formatTimeForStorage(nextStart),
            formatTimeForStorage(effectiveStartDate)
          );

          const mergedEvents = [...morePastEvents, ...events];
          events = Array.from(new Map(mergedEvents.map(e => [e.id, e])).values());
          effectiveStartDate = nextStart;

          // 如果扩展也没带来任何新事件，继续扩展只会浪费查询；直接退出
          if (morePastEvents.length === 0) {
            break;
          }
        }

        const dbQueryTime = performance.now() - dbQueryStartTime;
        
        console.log(`✅[TimeLog] Loaded ${events.length} timeline events (filtered) - DB query: ${dbQueryTime.toFixed(2)}ms`);
        setAllEventsSynced(events);

        // 同步面板的日期范围（用于 LogTab 刷新等）
        setDateRange({ start: effectiveStartDate, end: initialEndDate });
        
        // 更新动态日期范✅
        setDynamicStartDate(effectiveStartDate);
        setDynamicEndDate(initialEndDate);
        dynamicStartDateRef.current = effectiveStartDate;
        dynamicEndDateRef.current = initialEndDate;
        
        const totalLoadTime = performance.now() - loadStartTime;
        console.log(`⏱️ [TimeLog] Total event load time: ${totalLoadTime.toFixed(2)}ms`);
        
      } catch (error) {
        console.error('✅[TimeLog] Failed to load events:', error);
        setAllEventsSynced([]);
      } finally {
        setLoadingEvents(false);
      }
    };

    loadEvents();
  }, []);

  // 🎧 监听全局事件更新（增量更新）
  const handleEventsUpdated = useCallback((detail: any) => {
    console.log('🔔 [TimeLog] 收到事件更新通知:', detail);

    // 🔒 循环更新防护：跳过来自 TimeLog 自身的本地更新
    const originComponent = detail?.originComponent;
    if (
      detail?.isLocalUpdate &&
      typeof originComponent === 'string' &&
      originComponent.startsWith('TimeLog-')
    ) {
      console.log('⏭️ [TimeLog] 跳过自身更新:', originComponent);
      return;
    }

    if (!detail?.event) return;
    const updatedEvent = detail.event as Event;

    const isTimelineEvent = (event: Event): boolean => {
      // Keep consistent with EventService.getTimelineEvents
      if (event.isTimer === true || event.isTimeLog === true || event.isOutsideApp === true) {
        return false;
      }

      const hasExplicitTime =
        (typeof event.startTime === 'string' && event.startTime !== '') ||
        (typeof event.endTime === 'string' && event.endTime !== '');

      // Plan/Task without explicit time should not appear on the timeline
      if (event.isPlan === true && !hasExplicitTime) return false;
      if (event.isTask === true && !hasExplicitTime) return false;

      return true;
    };

    setAllEventsSynced(prev => {
      const index = prev.findIndex(e => e.id === updatedEvent.id);
      const shouldShow = isTimelineEvent(updatedEvent);

      if (index >= 0) {
        if (!shouldShow) {
          console.log('🧹✅[TimeLog] 事件已不符合时间轴条件，移除:', {
            id: updatedEvent.id.slice(-8),
            title: (updatedEvent as any).title?.simpleTitle,
          });
          return prev.filter(e => e.id !== updatedEvent.id);
        }

        const next = [...prev];
        next[index] = updatedEvent;
        console.log('✅[TimeLog] 更新事件:', {
          id: updatedEvent.id.slice(-8),
          title: (updatedEvent as any).title?.simpleTitle,
        });
        return next;
      }

      if (!shouldShow) return prev;

      console.log('✅[TimeLog] 添加新事件', {
        id: updatedEvent.id.slice(-8),
        title: (updatedEvent as any).title?.simpleTitle,
      });
      return [...prev, updatedEvent];
    });
  }, [setAllEventsSynced]);

  useEventsUpdatedSubscription({ enabled: true, onEventsUpdated: handleEventsUpdated });

  // ✅ 用于少数功能（如 isNote 子树批量操作）按需拿到全量 events
  // 不在页面挂载时自动全量加载，避免影响 TimeLog 的范围加载性能。
  const { ensureLoaded: ensureAllEventsSnapshotLoaded } = useEventHubSnapshot({
    enabled: true,
    autoLoad: false,
  });

  // 当用户在左侧面板选择日期范围时：更新动态范围并重新加载事件
  useEffect(() => {
    if (!dateRange) return;

    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);

    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    setDynamicStartDate(start);
    setDynamicEndDate(end);
    dynamicStartDateRef.current = start;
    dynamicEndDateRef.current = end;

    const reload = async () => {
      setLoadingEvents(true);
      try {
        const loaded = await EventService.getTimelineEvents(
          formatTimeForStorage(start),
          formatTimeForStorage(end)
        );
        setAllEventsSynced(loaded);
        console.log(`✅[TimeLog] Reloaded ${loaded.length} events for selected range`);
      } catch (error) {
        console.error('✅[TimeLog] Failed to reload events for range:', error);
      } finally {
        setLoadingEvents(false);
      }
    };

    reload();
  }, [dateRange]);

  // 初始滚动到今天的位置（移✅getTodayDateKey 定义之后✅

  // 🚀 [PERFORMANCE] 获取事件列表（按时间排序✅
  // EventService.getTimelineEvents 已经完成过滤，这里只需排序
  const events = useMemo(() => {
    const startTime = performance.now();

    const safeSortTs = (event: Event): number => {
      try {
        const range = resolveCalendarDateRange(event);
        const ts = range.start.getTime();
        return Number.isFinite(ts) ? ts : 0;
      } catch {
        return 0;
      }
    };
    
    // 按时间正序排序（最早的在前✅
    // ✅ 使用 TimeResolver 派生 anchor，兼容 no-time / end-only task
    const enriched = allEvents.map(event => ({ event, ts: safeSortTs(event) }));
    enriched.sort((a, b) => a.ts - b.ts);
    const sorted = enriched.map(x => x.event);
    
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
      let eventTime: Date;
      try {
        eventTime = resolveCalendarDateRange(event).start;
      } catch {
        eventTime = new Date(0);
      }
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
      // 使用时间戳比较以确保准确✅
      const aTime = parseLocalTimeStringOrNull(a)?.getTime() ?? 0;
      const bTime = parseLocalTimeStringOrNull(b)?.getTime() ?? 0;
      return aTime - bTime;
    });
    
    // console.log('📅 [TimeLog Zipper] Sorted dates (Ascending):', sorted);
    return sorted;
  }, [eventsByDate]);

  // 生成时间轴段（month headers + compressed ranges + event dates✅
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
    //   now: formatTimeForStorage(now),
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
    historyDate.setDate(historyDate.getDate() - 1); // 从昨天开✅

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

    // 合并历史和未来段✅
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
        // 检查是否跨✅
        const startMonth = `${segment.startDate.getFullYear()}-${segment.startDate.getMonth() + 1}`;
        const endMonth = `${segment.endDate.getFullYear()}-${segment.endDate.getMonth() + 1}`;
        
        if (startMonth === endMonth) {
          // 同月，直接添✅
          finalSegments.push(segment);
        } else {
          // 跨月，需要拆✅
          let currentDate = new Date(segment.startDate);
          
          while (currentDate <= segment.endDate) {
            // 该月的最后一天（月末✅
            const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            monthEnd.setHours(23, 59, 59, 999);
            
            // 实际结束日期：取月末和segment.endDate中较小的
            const actualEnd = monthEnd < segment.endDate ? monthEnd : new Date(segment.endDate);
            
            // 添加该月的compressed✅
            finalSegments.push({
              type: 'compressed',
              startDate: new Date(currentDate), // 使用当前日期（第一次是segment.startDate，后续是下月1号）
              endDate: actualEnd
            });
            
            // 移动到下个月第一✅
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            currentDate.setHours(0, 0, 0, 0);
          }
        }
      } else {
        finalSegments.push(segment);
      }
    });

    // 插入月份标题✅
    // - compressed段：总是插入月份标题（视觉上更清晰，每个压缩段都显示月份✅
    // - events段：只在新月份时插入月份标题
    // 
    // 注意：compressed段后紧跟同月的events段时，会出现同月份标题连续出✅次的情况✅
    // 这是**期望行为**，因为compressed段需要独立的月份标识，否则用户无法识别日期所属月✅
    const segmentsWithMonthHeaders: TimelineSegment[] = [];
    let lastMonthKey: string | null = null;

    finalSegments.forEach(segment => {
      let currentMonthKey: string;
      
      if (segment.type === 'events') {
        const date = parseLocalTimeStringOrNull(segment.dateKey);
        if (date) {
          currentMonthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        } else {
          const parts = segment.dateKey.split('-');
          currentMonthKey = parts.length >= 2 ? `${parts[0]}-${Number(parts[1])}` : segment.dateKey;
        }
      } else if (segment.type === 'compressed') {
        currentMonthKey = `${segment.startDate.getFullYear()}-${segment.startDate.getMonth() + 1}`;
      } else {
        currentMonthKey = `${segment.year}-${segment.month}`;
      }

      // compressed段：总是插入月份标题（即使与上一个段月份相同✅
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

    // 调试日志（已移除，月份标题重复是正常行为✅
    // compressed 段后紧跟同月 events 段时，月份标题会连续出现 2 次，这是期望的设✅
    
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

  // 格式化日期标题（例如：12.14 周日、12.26 周五（今天））
  // 注意：不要用 new Date('YYYY-MM-DD')，在非 UTC+8 时区可能会发生日期/星期偏移
  const formatDateTitle = (dateKey: string): string => {
    const parts = dateKey.split('-').map(n => Number(n));
    const [year, month, day] = parts;
    if (!year || !month || !day) {
      return dateKey;
    }

    const date = new Date(year, month - 1, day);
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekday = weekdays[date.getDay()];

    const now = new Date();
    const isToday =
      year === now.getFullYear() &&
      month === now.getMonth() + 1 &&
      day === now.getDate();

    return `${month}.${day} ${weekday}${isToday ? '（今天）' : ''}`;
  };

  // 获取今天的日期key
  const getTodayDateKey = useCallback(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // 找到今天的日期key（用于滚动定位，无论是否有事件都返回✅
  const findTodayFirstDateKey = useCallback(() => {
    return getTodayDateKey();
  }, [getTodayDateKey]);

  // 初始滚动到今天的位置（只执行一次）
  useEffect(() => {
    if (!loadingEvents && !hasScrolledToTodayGlobal && todayEventRef.current && timelineContainerRef.current) {
      hasScrolledToTodayGlobal = true; // 🚀 全局标记，防止重复滚动（HMR 不会重置✅
      const scrollStartTime = performance.now();
      console.log('🎯 [TimeLog] Scrolling to today marker');
      
      // 使用 requestAnimationFrame 确保 DOM 已完全渲染（✅setTimeout 更快更准确）
      requestAnimationFrame(() => {
        if (todayEventRef.current && timelineContainerRef.current) {
          const container = timelineContainerRef.current;
          const todayElement = todayEventRef.current;
          
          // 计算今天元素相对于容器的位置
          const containerRect = container.getBoundingClientRect();
          const todayRect = todayElement.getBoundingClientRect();
          
          // 滚动到今天的位置（让今天显示在容器顶部，留一点padding✅
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

  // 处理标签可见性变✅
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
  const toggleLogExpanded = async (eventId: string) => {
    // 🆕 v2.19: 折叠前检查是否是空Note，如果是则删✅
    if (expandedLogs.has(eventId) && emptyNotesRef.current.has(eventId)) {
      console.log('🗑✅[TimeLog] Deleting empty note on collapse:', eventId);
      
      try {
        // 从数据库删除
        await EventService.deleteEvent(eventId);
        
        // 从列表中移除
        setAllEventsSynced(prev => prev.filter(e => e.id !== eventId));
        
        // 从追踪中移除
        emptyNotesRef.current.delete(eventId);
        
        console.log('✅[TimeLog] Empty note deleted:', eventId);
        return; // 不需要切换展开状态，因为事件已删✅
      } catch (error) {
        console.error('✅[TimeLog] Failed to delete empty note:', error);
        // 删除失败，继续正常的折叠逻辑
      }
    }
    
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
  
  // 🆕 获取多选日历显示信息（第一✅+ 等）
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
      const { EventHub } = await import('../../../services/EventHub');
      await EventHub.updateFields(eventId, { calendarIds }, { source: 'TimeLog-CalendarChange' });
      setShowCalendarPicker(null);
    } catch (error) {
      console.error('Failed to update calendar:', error);
    }
  };
  
  // 🆕 处理同步模式变更
  const handleSyncModeChange = async (eventId: string, syncMode: string) => {
    try {
      const { EventHub } = await import('../../../services/EventHub');
      await EventHub.updateFields(eventId, { syncMode }, { source: 'TimeLog-SyncModeChange' });
      setShowSyncModePicker(null);
    } catch (error) {
      console.error('Failed to update sync mode:', error);
    }
  };

  // 处理 eventlog 内容变化
  const handleLogChange = async (eventId: string, slateJson: string) => {
    console.log('📝 [TimeLog] Saving eventlog for:', eventId);
    
    // 🆕 v2.19: 用户编辑了eventlog，从空Note 追踪中移除
    if (emptyNotesRef.current.has(eventId)) {
      // 检查是否真的有内容（不是空 paragraph）
      try {
        const nodes = JSON.parse(slateJson);
        const hasContent = nodes.some((node: any) => {
          if (node.type === 'paragraph') {
            return node.children.some((child: any) => child.text && child.text.trim() !== '');
          }
          return true; // 其他类型节点视为有内✅
        });
        
        if (hasContent) {
          emptyNotesRef.current.delete(eventId);
          console.log('✅[TimeLog] Note has content, removed from empty tracking:', eventId);
        }
      } catch (error) {
        console.error('✅[TimeLog] Failed to parse eventlog:', error);
      }
    }
    
    // ✅ 先本地乐观更新，避免退出编辑后“抖动/延迟回显”
    updateLocalEvent(eventId, { eventlog: slateJson } as any);

    // 使用 EventHub 保存（带循环更新防护✅
    await EventHub.updateFields(eventId, {
      eventlog: slateJson  // EventService 会自动处理格式转✅
    }, {
      source: 'TimeLog-eventlogChange'
    });
  };
  
  // ✅event.eventlog 提取 Slate JSON 字符✅
  const getEventLogContent = (event: Event): string => {
    if (!event.eventlog) {
      return '';
    }
    
    // EventLog 对象格式（标准格式）
    if (typeof event.eventlog === 'object' && 'slateJson' in event.eventlog) {
      return event.eventlog.slateJson || '';
    }
    
    // 旧格式兼容：字符串格✅
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
  // 缓存待保存的标题变化（失焦时保存✅
  const pendingTitleChanges = useRef<Map<string, string>>(new Map());
  
  const handleTitleSave = useCallback(async (eventId: string, slateJson: string) => {
    // 失焦时立即保存，不使用防✅
    // 提取纯文本作✅simpleTitle
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
    
    // 🔧 获取当前事件的原✅title，避免用空标题覆盖现有标✅
    const currentEvent = allEventsRef.current.find(e => e.id === eventId);
    const currentTitle = currentEvent?.title;
    
    // 🛡✅保护机制：如果新标题为空，且当前标题不为空，则不保存（避免意外覆盖）
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

    const nextTitle = {
      fullTitle: slateJson,
      simpleTitle,
    };

    // ✅ 先本地乐观更新，避免退出编辑后“抖动/延迟回显”
    updateLocalEvent(eventId, { title: nextTitle } as any);
    
    // 🔥 使用 EventHub 保存（带循环更新防护✅
    await EventHub.updateFields(eventId, {
      title: {
        fullTitle: slateJson,  // Slate JSON 格式
        simpleTitle: simpleTitle,  // 纯文✅
        // colorTitle 会由 EventService.normalizeTitle 自动✅fullTitle 生成
      }
    }, {
      source: 'TimeLog-titleSave'
    });
    
    console.log('✅[TimeLog] Title saved:', simpleTitle);
    
    // EventHub 会自动触✅eventsUpdated 事件，无需手动更新
    // 这样可以避免输入时失焦问✅
  }, []);

  // 处理标签编辑
  const handleTagsClick = (event: Event) => {
    setEditingTagsId(event.id);
  };

  const handleTagsChange = async (eventId: string, tagIds: string[]) => {
    // 使用 EventHub 保存（带循环更新防护✅
    await EventHub.updateFields(eventId, { tags: tagIds }, {
      source: 'TimeLog-tagsChange'
    });
    setEditingTagsId(null);
  };

  // 处理参与者编✅
  const handleAttendeesEdit = (event: Event) => {
    setEditingAttendeesId(event.id);
  };

  // 处理地点编辑
  const handleLocationEdit = (eventId: string) => {
    setEditingLocationId(eventId);
  };

  // 🆕 v2.19: 处理 isNote 标记切换
  const handleToggleIsNote = async (event: Event) => {
    const newIsNoteValue = !event.isNote;
    
    // 如果是取消标记，弹出确认对话✅
    if (event.isNote) {
      const confirm = window.confirm(
        '确定要取消标记为重要笔记吗？\n' +
        '这将同时取消该事件所在EventTree 中所有子事件的标记。'
      );
      if (!confirm) return;
    }

    // ✅ [EventTreeAPI] 获取完整子树（包括当前事件）
    // 这里需要全量 events（子节点可能不在当前 TimeLog 的日期范围内）
    const allEvents = await ensureAllEventsSnapshotLoaded();
    const subtree = EventTreeAPI.getSubtree(event.id, allEvents);
    const allEventIds = subtree.map(e => e.id);
    
    // 批量更新所有子事件✅isNote 字段
    for (const id of allEventIds) {
      await EventHub.updateFields(id, { isNote: newIsNoteValue }, {
        source: 'TimeLog-toggleIsNote'
      });
    }
  };

  // 🆕 删除事件
  const handleDelete = async (event: Event) => {
    const confirm = window.confirm('确定要删除这条笔记吗？');
    if (!confirm) return;

    try {
      await EventService.deleteEvent(event.id);
      console.log('✅[TimeLog] 删除事件成功:', event.id);
    } catch (error) {
      console.error('✅[TimeLog] 删除事件失败:', event.id, error);
      alert('删除失败，请重试');
    }
  };

  // 处理时间编辑
  const handleTimeEdit = (event: Event) => {
    setEditingTimeId(event.id);
  };

  const handleTimeChange = async (eventId: string, updates: { startTime?: string; endTime?: string }) => {
    // 使用 EventHub 保存（带循环更新防护✅
    await EventHub.updateFields(eventId, updates, {
      source: 'TimeLog-timeChange'
    });
    setEditingTimeId(null);
  };

  const handleTimePickerClose = () => {
    setEditingTimeId(null);
  };



  // 处理点击事件空白区域：展开 eventlog 并插✅timestamp + 预行
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
      target.closest('.event-log-box'); // 避免在已展开✅log 区域重复触发
    
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
    // 📝 注意: 如果需要展开，等待动画完成（100ms✅
    const delay = wasExpanded ? 0 : 100;
    window.setTimeout(() => {
      const slateRef = modalSlateRefs.current.get(eventId);
      if (slateRef && slateRef.insertTimestampAndFocus) {
        slateRef.insertTimestampAndFocus();
      }
    }, delay);
  };

  // 新建事件模态框状态
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newEventTemplate, setNewEventTemplate] = useState<Event | null>(null);
  const [newlyCreatedEventId, setNewlyCreatedEventId] = useState<string | null>(null);
  
  // 编辑事件模态框状态
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // 处理 TimeGap 点击创建事件
  // 处理创建事件（打开 EventEditModal✅
  const handleCreateEvent = async (startTime: Date) => {
    const createdAt = formatTimeForStorage(startTime);
    const newEvent: Event = {
      id: generateEventId(),
      title: {
        simpleTitle: '',
        colorTitle: '',
        fullTitle: ''
      },
      startTime: formatTimeForStorage(startTime),
      endTime: formatTimeForStorage(new Date(startTime.getTime() + 30 * 60000)), // 默认30分钟
      location: '',
      description: '',
      tags: [],
      isAllDay: false,
      // TimeGap 选择的是“事件发生时间”，这里将 createdAt 对齐到选择的 startTime，避免显示/排序混乱
      createdAt,
      updatedAt: createdAt,
      syncStatus: 'local-only',
      fourDNoteSource: true,
    };

    try {
      // ✅ EventEditModalV2 只接收 eventId 并自行加载：新建事件必须先落库/进入 EventHub
      await EventHub.createEvent(newEvent);
      setNewlyCreatedEventId(newEvent.id);
      setNewEventTemplate(newEvent);
      setCreateModalOpen(true);
    } catch (error) {
      console.error('✅[TimeLog] Failed to create event before opening modal:', error);
      alert('创建事件失败：无法写入数据库');
    }
  };

  // 处理创建笔记（纯 eventlog 的日记）
  const handleCreateNote = async (suggestedStartTime?: Date) => {
    try {
      // 🎯 创建一个纯笔记：默认无时间；但如果来自 TimeGap（用户选了时间），则把该时间作为 startTime 锚点
      // 说明：TimeGap 选择的是“笔记发生/归档时间”，这里将 createdAt 对齐到该锚点，避免显示/排序混乱
      const anchorTime = suggestedStartTime ?? new Date();
      const createdAt = formatTimeForStorage(anchorTime);
      const startTime = suggestedStartTime ? formatTimeForStorage(suggestedStartTime) : undefined;
      const newEvent: Event = {
        id: generateEventId(),
        title: {
          simpleTitle: '',
          colorTitle: '',
          fullTitle: ''
        }, // 允许空标✅
        ...(startTime ? { startTime } : {}), // 来自 TimeGap 时使用锚点时间，否则不写入字段（规范：undefined 表示无时间）
        tags: [], // 允许空标✅
        isAllDay: false,
        // 🔧 明确标记为非Plan、非TimeCalendar事件（避免被过滤✅
        isPlan: false,
        isTimeCalendar: false,
        isTask: false, // 明确标记为非Task
        // ⚠️ 空笔记不应该✅Block-Level Timestamp（避免显示时间戳✅
        eventlog: JSON.stringify([
          {
            type: 'paragraph',
            children: [{ text: '' }]
          }
        ]),
        createdAt,
        updatedAt: createdAt,
        syncStatus: 'local-only',
        fourDNoteSource: true,
      };
      
      const result = await EventService.createEvent(newEvent);
      
      if (!result.success) {
        console.error('✅[TimeLog] Failed to create note:', result.error);
        alert(`创建笔记失败: ${result.error}`);
        return;
      }
      
      console.log('✅[TimeLog] Note created in database:', newEvent.id);
      
      // 验证笔记是否真的存储到数据库
      const savedNote = await EventService.getEventById(newEvent.id);
      if (!savedNote) {
        console.error('✅[TimeLog] Note not found in database immediately after creation!');
        alert('笔记创建失败：无法从数据库读取！');
        return;
      }
      console.log('✅[TimeLog] Verified note in database:', {
        id: savedNote.id,
        title: savedNote.title,
        startTime: savedNote.startTime,
        endTime: savedNote.endTime,
        createdAt: savedNote.createdAt
      });
      
      // 🔧 直接将新笔记添加到列表中，而不是重新加载全部事件
      // 这样可以避免日期范围过滤导致的问✅
      setAllEventsSynced(prev => {
        // 检查是否已存在（避免重复）
        if (prev.find(e => e.id === savedNote.id)) {
          console.log('📋 [TimeLog] Note already in list, skipping');
          return prev;
        }
        
        // ✅createdAt 降序插入（最新的在前面）
        const newList = [savedNote, ...prev];
        console.log('📋 [TimeLog] Added note to list:', newList.length);
        return newList;
      });
      
      // 🆕 v2.19: 追踪空Note（用于自动清理）
      emptyNotesRef.current.add(newEvent.id);
      console.log('📝 [TimeLog] Tracking empty note:', newEvent.id);
      
      // 自动展开新创建的笔记
      setExpandedLogs(prev => new Set([...prev, newEvent.id]));
      
      // ✅v2.21.1: 使用 requestAnimationFrame 链替代嵌✅setTimeout
      requestAnimationFrame(() => {
        // 1. 滚动到新创建的笔✅
        const noteElement = document.querySelector(`[data-event-id="${newEvent.id}"]`);
        console.log('🔍 [TimeLog] Looking for note element:', newEvent.id, noteElement ? 'FOUND' : 'NOT FOUND');
        
        if (noteElement) {
          console.log('📍 [TimeLog] Scrolling to note:', newEvent.id);
          noteElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center'
          });
        } else {
          console.warn('✅[TimeLog] Note element not found in DOM, cannot scroll');
        }
        
        // 2. 聚焦到编辑器
        requestAnimationFrame(() => {
          const modalSlateRef = modalSlateRefs.current.get(newEvent.id);
          console.log('🔍 [TimeLog] ModalSlate ref:', newEvent.id, modalSlateRef ? 'FOUND' : 'NOT FOUND');
          
          if (modalSlateRef?.editor) {
            try {
              // 使用 ReactEditor.focus 聚焦编辑✅
              const { ReactEditor } = require('slate-react');
              ReactEditor.focus(modalSlateRef.editor);
              // 将光标移到末尾（paragraph 的末尾）
              const { Transforms, Editor } = require('slate');
              Transforms.select(modalSlateRef.editor, Editor.end(modalSlateRef.editor, []));
              console.log('✅[TimeLog] Editor focused and cursor positioned');
            } catch (err) {
              console.warn('✅[TimeLog] Failed to focus editor:', err);
            }
          } else {
            console.warn('✅[TimeLog] ModalSlate ref not available');
          }
        });
      });
      
      console.log('✅[TimeLog] Created note (no time):', newEvent.id);
    } catch (error) {
      console.error('✅[TimeLog] Failed to create note:', error);
    }
  };

  // 处理上传附件
  const handleUploadAttachment = (startTime: Date) => {
    // TODO: 实现附件上传逻辑
    console.log('📎 [TimeLog] Upload attachment at:', startTime);
    alert('附件上传功能即将推出！');
  };

  const handleCreateSave = async (savedEvent: Event) => {
    // 兼容：如果已在打开前创建（推荐路径），这里走 update；否则走 create
    const existing = await EventService.getEventById(savedEvent.id);

    if (existing) {
      await EventHub.updateFields(savedEvent.id, savedEvent, {
        source: 'TimeLog-createSave'
      });
    } else {
      await EventHub.createEvent(savedEvent);
    }
    
    // 关闭模态框
    setCreateModalOpen(false);
    setNewEventTemplate(null);
    setNewlyCreatedEventId(null);
  };

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event);
    setEditModalOpen(true);
  };

  const handleEditSave = async (savedEvent: Event) => {
    // 使用 EventHub 更新（带循环更新防护✅
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
    if (renderTime < 100) { // 只在首次渲染时输✅
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
      console.log(`└─ Status: ✅Ready\n`);
    }
  }, [loadingEvents, events.length, eventsByDate.size, timelineSegments.length]);

  const page = (
    <div className={`timelog-page ${!isPanelVisible ? 'panel-hidden' : ''}`}>
      {/* 左侧内容选取✅- 完全复用 ContentSelectionPanel */}
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

      {/* 中间时光日志✅- 标签✅卡片组合 */}
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
                const titleText = resolveDisplayTitle(event, {
                  getTagLabel: (tagId: string) => {
                    const tag = TagService.getTagById(tagId);
                    if (!tag) return undefined;
                    return tag.emoji ? `${tag.emoji} ${tag.name}` : tag.name;
                  },
                });
                
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
                        // 如果关闭的是当前激活标签，切换到时光日期
                        if (activeTabId === event.id) {
                          setActiveTabId('timelog');
                        }
                        // 如果只剩一个事件，关闭标签管理✅
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
          {/* 标题区：无tab时显示普通标✅*/}
          {tabManagerEvents.length === 0 && (
            <div className="timelog-header-section">
              <div className="timelog-header-border">
                <div className="timelog-gradient-bar"></div>
                <h1 className="timelog-title">时光日志</h1>
              </div>
            </div>
          )}

          {/* 内容区域：根据激活标签显示不同内✅*/}
          {/* 时光日志列表 - 使用 CSS 隐藏而非条件渲染，保留滚动状态*/}
          <div 
            className="timelog-events-list" 
            ref={timelineContainerRef}
            style={{ display: activeTabId === 'timelog' ? 'block' : 'none' }}
          >
            {loadingEvents ? (
            <div className="timelog-empty">
              <p>加载✅..</p>
            </div>
          ) : (
            timelineSegments.map((segment, segmentIndex) => {
              if (segment.type === 'month-header') {
                // 月份标题：检查下一个segment是否是compressed，如果是则合并渲✅
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
                    // 有展开的日期，将压缩段拆分成：压缩✅ + 展开日期 + 压缩✅
                    const segments: React.ReactNode[] = [];
                    let isFirstSegment = true;
                    
                    // 遍历压缩段的所有日期，按展开状态分段渲✅
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
                            // 第一个段落：月份标题 + 压缩段在同一✅
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
                            // 后续段落：压缩段带月份标✅
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
                          // 第一个就是展开的日期，只渲染月份标✅
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
                  
                  // 没有展开的日期，渲染月份标题和压缩段在同一✅
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
                            console.log('✅[TimeLog] expandedDates updated, new size:', newSet.size, 'dates:', Array.from(newSet));
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
                // 检查是否已经在上一个月份标题中渲染✅
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
                  // 有展开的日期，将压缩段拆分成：压缩✅ + 展开日期 + 压缩✅
                  const segments: React.ReactNode[] = [];
                  
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
                  
                  // 如果最后还有累积的压缩段，渲染✅
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
                          console.log('✅[TimeLog] expandedDates updated, new size:', newSet.size, 'dates:', Array.from(newSet));
                          return newSet;
                        });
                      }}
                    />
                  </div>
                );
              } else {
                // 渲染事件日期✅
                const dateKey = segment.dateKey;
                const dateEvents = eventsByDate.get(dateKey) || [];
                const todayDateKey = findTodayFirstDateKey();
                const isToday = dateKey === todayDateKey;
                const hasNoEvents = dateEvents.length === 0; // 单独1天空✅
                
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
                    {/* 日期标题 - 使用sticky定位，自动实现条件置✅*/}
                    <div 
                      className="timeline-date-header"
                      data-date-key={dateKey}
                      ref={isToday ? todayEventRef : null}
                    >
                      <h2 className="timeline-date-title">{formatDateTitle(dateKey)}</h2>
                    </div>
                    
                    {/* 空白日期（无事件）：显示完整✅TimeGap 虚线 */}
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
                          nextEventStartTime={
                            dateEvents[0].startTime
                              ? (parseLocalTimeStringOrNull(dateEvents[0].startTime) ?? undefined)
                              : undefined
                          }
                          onCreateEvent={handleCreateEvent}
                          onCreateNote={handleCreateNote}
                          onUploadAttachment={handleUploadAttachment}
                        />
                      </>
                    )}
                    
                    {/* 该日期的所有事件*/}
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
                  <div className="event-time-col"
                    onMouseEnter={() => setHoveredTimeId(event.id)}
                    onMouseLeave={() => setHoveredTimeId(null)}
                  >
                    {/* 时间显示区域（带幽灵菜单✅*/}
                    <div 
                      className="time-display-wrapper"
                    >
                      {!event.startTime && !event.endTime && event.eventlog ? (
                        // 笔记事件：显✅createdAt 时间
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
                      
                      {/* 🆕 日历选择器弹✅*/}
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
                    
                    {/* Right按钮 + 幽灵菜单容器 */}
                    <div 
                      className="right-menu-wrapper"
                      onMouseEnter={() => {
                        // 清除延迟隐藏timer
                        if (rightMenuHideTimerRef.current) {
                          clearTimeout(rightMenuHideTimerRef.current);
                          rightMenuHideTimerRef.current = null;
                        }
                        setHoveredRightId(event.id);
                      }}
                      onMouseLeave={() => {
                        // 延迟隐藏，给用户时间移到Tippy子菜✅
                        rightMenuHideTimerRef.current = setTimeout(() => {
                          setHoveredRightId(null);
                        }, 200);
                      }}
                    >
                      {/* Right按钮 */}
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
                      
                      {/* 三组分层菜单 - 横向延伸 */}
                      {hoveredRightId === event.id && (
                        <div className="right-menu-groups">
                        {/* ✅: EventManager */}
                        <Tippy
                          content={
                            <div className="right-submenu">
                              <div className="right-submenu-item" onClick={() => handleToggleIsNote(event)}>
                                <img src={NotetreeIconSvg} className="right-submenu-icon" alt="favorite" />
                                <span className="right-submenu-text">收藏事件</span>
                              </div>
                              <div className="right-submenu-item" onClick={() => handleEditEvent(event)}>
                                <img src={FullsizeIconSvg} className="right-submenu-icon" alt="fullsize" />
                                <span className="right-submenu-text">展开详情</span>
                              </div>
                              <div className="right-submenu-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenInTab(event); }}>
                                <img src={TabIconSvg} className="right-submenu-icon" alt="tab" />
                                <span className="right-submenu-text">在新标签页打开</span>
                              </div>
                              <div className="right-submenu-item">
                                <img src={ProjectIconSvg} className="right-submenu-icon" alt="project" />
                                <span className="right-submenu-text">查看事件</span>
                              </div>
                              <div className="right-submenu-item" onClick={() => handleDelete(event)}>
                                <img src={DeleteIconSvg} className="right-submenu-icon" alt="delete" />
                                <span className="right-submenu-text">删除</span>
                              </div>
                            </div>
                          }
                          placement="bottom"
                          interactive={true}
                          arrow={false}
                          offset={[0, 4]}
                          onShow={() => {
                            // Tippy显示时清除隐藏timer
                            if (rightMenuHideTimerRef.current) {
                              clearTimeout(rightMenuHideTimerRef.current);
                              rightMenuHideTimerRef.current = null;
                            }
                          }}
                        >
                          <button className="right-menu-group-btn">
                            <img src={EventManagerIconSvg} alt="event-manager" />
                          </button>
                        </Tippy>

                        {/* ✅: Edit */}
                        <Tippy
                          content={
                            <div className="right-submenu">
                              <div
                                className="right-submenu-item"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  // 空标题时也需要挂载 TitleSlate，才能看到 placeholder 并聚焦输入
                                  flushSync(() => openEditor(event.id, 'title'));
                                }}
                              >
                                <img src={TitleEditIconSvg} className="right-submenu-icon" alt="title-edit" />
                                <span className="right-submenu-text">添加标题</span>
                              </div>
                              <div className="right-submenu-item" onClick={() => handleTagsClick(event)}>
                                <img src={TagIconSvg} className="right-submenu-icon" alt="tag" />
                                <span className="right-submenu-text">添加标签</span>
                              </div>
                              <div className="right-submenu-item" onClick={() => handleAttendeesEdit(event)}>
                                <img src={AttendeeIconSvg} className="right-submenu-icon" alt="attendees" />
                                <span className="right-submenu-text">添加参与者</span>
                              </div>
                              <div className="right-submenu-item" onClick={() => handleLocationEdit(event.id)}>
                                <img src={LocationIconSvg} className="right-submenu-icon" alt="location" />
                                <span className="right-submenu-text">添加地点</span>
                              </div>
                              <div className="right-submenu-item">
                                <img src={AllMenuIconSvg} className="right-submenu-icon" alt="allmenu" />
                                <span className="right-submenu-text">展开所有属性</span>
                              </div>
                            </div>
                          }
                          placement="bottom"
                          interactive={true}
                          arrow={false}
                          offset={[0, 4]}
                          onShow={() => {
                            if (rightMenuHideTimerRef.current) {
                              clearTimeout(rightMenuHideTimerRef.current);
                              rightMenuHideTimerRef.current = null;
                            }
                          }}
                        >
                          <button className="right-menu-group-btn">
                            <img src={EditIconSvg} alt="edit" />
                          </button>
                        </Tippy>

                        {/* ✅: Time */}
                        <Tippy
                          content={
                            <div className="right-submenu">
                              <Tippy
                                content={
                                  editingTimeId === event.id ? (
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <UnifiedDateTimePicker
                                        initialStart={event.startTime}
                                        initialEnd={event.endTime}
                                        onSelect={(start, end) => {
                                          if (start || end) {
                                            handleTimeChange(event.id, {
                                              startTime: start || undefined,
                                              endTime: end || undefined
                                            });
                                          }
                                        }}
                                        onClose={handleTimePickerClose}
                                      />
                                    </div>
                                  ) : null
                                }
                                visible={editingTimeId === event.id}
                                interactive={true}
                                placement="right-start"
                                appendTo={document.body}
                                onClickOutside={handleTimePickerClose}
                                arrow={false}
                                offset={[0, 8]}
                                zIndex={100000}
                                maxWidth="none"
                              >
                                <div className="right-submenu-item" onClick={() => handleTimeEdit(event)}>
                                  <img src={DatetimeIconSvg} className="right-submenu-icon" alt="edit-time" />
                                  <span className="right-submenu-text">编辑时间</span>
                                </div>
                              </Tippy>
                              <div className="right-submenu-item">
                                <img src={DdlIconSvg} className="right-submenu-icon" alt="ddl" />
                                <span className="right-submenu-text">添加截止</span>
                              </div>
                              <div className="right-submenu-item">
                                <img src={RotationIconSvg} className="right-submenu-icon" alt="rotation" />
                                <span className="right-submenu-text">循环事件</span>
                              </div>
                              <div className="right-submenu-item">
                                <img src={TimerStartIconSvg} className="right-submenu-icon" alt="timer-start" />
                                <span className="right-submenu-text">开始计时</span>
                              </div>
                            </div>
                          }
                          placement="bottom"
                          interactive={true}
                          arrow={false}
                          offset={[0, 4]}
                          onShow={() => {
                            if (rightMenuHideTimerRef.current) {
                              clearTimeout(rightMenuHideTimerRef.current);
                              rightMenuHideTimerRef.current = null;
                            }
                          }}
                        >
                          <button className="right-menu-group-btn">
                            <img src={TimePropertyIconSvg} alt="time" />
                          </button>
                        </Tippy>
                      </div>
                    )}
                    </div> {/* 关闭 right-menu-wrapper */}
                    </div> {/* 关闭 time-display-wrapper */}
                  </div> {/* 关闭 event-time-col */}
                  
                  {/* 🆕 日历来源信息（右对齐✅*/}
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
                        
                        // 限制日历名称最✅个字✅
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
                              {selectedIds.length > 1 && <span style={{ color: '#9ca3af' }}> (+{selectedIds.length})</span>}
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
                    {(() => {
                      const isActiveTitle = activeEditor?.eventId === event.id && activeEditor.mode === 'title';
                      const titleObj = typeof event.title === 'object' ? event.title : null;
                      
                      // 检查实际内容是否为✅
                      let hasTitle = false;
                      if (titleObj?.simpleTitle?.trim()) {
                        hasTitle = true;
                      } else if (titleObj?.colorTitle) {
                        try {
                          const parsed = JSON.parse(titleObj.colorTitle);
                          const text = parsed[0]?.children?.[0]?.text || '';
                          hasTitle = text.trim().length > 0;
                        } catch (e) {
                          hasTitle = false;
                        }
                      }

                      // 空标题通常不渲染；但如果用户显式进入 title 编辑态，需要渲染 TitleSlate 以显示 placeholder
                      if (!hasTitle && !isActiveTitle) return null;
                      
                      return (
                        <div 
                          className="event-row event-title-row"
                          onMouseEnter={() => setHoveredTitleId(event.id)}
                          onMouseLeave={() => setHoveredTitleId(null)}
                          style={{ paddingTop: '4px', minHeight: '28px' }}
                        >
                          {event.emoji && <span className="event-emoji">{event.emoji}</span>}
                          
                          {/* 标题始终可编辑，✅PlanSlate 一✅*/}
                          <div
                            className="event-title"
                            onMouseDown={(e) => {
                              const isActiveTitle = activeEditor?.eventId === event.id && activeEditor.mode === 'title';

                              // ✅ 仅在“未激活”时拦截并切换到可编辑。
                              // 🔥 若已激活，必须让 Slate 自己处理 mouseDown，否则光标无法落点。
                              if (!isActiveTitle) {
                                e.stopPropagation();
                                flushSync(() => openEditor(event.id, 'title'));
                              }
                            }}
                          >
                            {(() => {
                              const shouldMountTitleSlate = isActiveTitle || (activeStickyDateKey
                                ? isDateKeyWithinDays(dateKey, activeStickyDateKey, 2)
                                : false);
                              const titleValue = (() => {
                                const colorTitle = typeof event.title === 'object'
                                  ? event.title.colorTitle
                                  : null;
                                return colorTitle || '';
                              })();

                              if (!shouldMountTitleSlate) {
                                const html = getTitlePreviewHtml(event);
                                return (
                                  <div className="log-slate-wrapper title-mode" data-readonly>
                                    <div
                                      className="log-slate-editable"
                                      dangerouslySetInnerHTML={{ __html: html || '<p><br/></p>' }}
                                    />
                                  </div>
                                );
                              }

                              return (
                                <LogSlate
                                  mode="title"
                                  readOnly={!isActiveTitle}
                                  placeholder="添加标题..."
                                  autoFocus={isActiveTitle}
                                  value={titleValue}
                                  onChange={(slateJson) => {
                                    pendingTitleChanges.current.set(event.id, slateJson);
                                  }}
                                  onEscape={() => {
                                    pendingTitleChanges.current.delete(event.id);
                                    closeEditor(event.id);
                                  }}
                                  onBlur={() => {
                                    const pendingValue = pendingTitleChanges.current.get(event.id);
                                    if (pendingValue !== undefined) {
                                      handleTitleSave(event.id, pendingValue);
                                      pendingTitleChanges.current.delete(event.id);
                                    }
                                    closeEditor(event.id);
                                  }}
                                  showToolbar={false}
                                />
                              );
                            })()}
                          </div>
                      
                      {/* 🆕 同步模式选择器弹✅*/}
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
                  )})()}  {/* 关闭 Title IIFE - 返回event-title-row */}
                  
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
                              // 直接保存✅EventHub（即时保存）
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

                    {/* Log Content - 默认只读渲染（使用 LogSlate readOnly 保持样式一致），点击进入唯一编辑器 */}
                    {expandedLogs.has(event.id) && (
                      <div className="event-log-box" ref={setEventlogObserveRef(event.id)} data-eventlog-observe-id={event.id}>
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            // ✅ 同步切换，保证点击位置在 Slate 内生效
                            if (!(activeEditor?.eventId === event.id && activeEditor.mode === 'eventlog')) {
                              flushSync(() => openEditor(event.id, 'eventlog'));
                            }
                          }}
                          style={{ cursor: 'text' }}
                        >
                          {(() => {
                            const isActiveEventlog = activeEditor?.eventId === event.id && activeEditor.mode === 'eventlog';

                            // ✅ 只在有限集合中挂载 LogSlate（readOnly 仍然有 Slate 开销）
                            // 使用 void 引用，避免 noUnusedLocals 报错，并确保变更会触发重新计算
                            void mountedEventlogSlateVersion;
                            const shouldMountEventlogSlate =
                              isActiveEventlog || mountedEventlogSlateSetRef.current.has(event.id);

                            if (!shouldMountEventlogSlate) {
                              return (
                                <div
                                  className="log-slate-wrapper eventlog-mode timelog-slate-editor"
                                  data-readonly
                                >
                                  <div
                                    className="log-slate-editable eventlog-editable"
                                    dangerouslySetInnerHTML={{
                                      __html:
                                        getEventLogPreviewHtml(event) || makePlaceholderHtml('添加日志...'),
                                    }}
                                  />
                                </div>
                              );
                            }

                            return (
                              <LogSlate
                                mode="eventlog"
                                value={getEventLogContent(event)}
                                onChange={(slateJson) => handleLogChange(event.id, slateJson)}
                                onBlur={() => {
                                  if (activeEditor?.eventId === event.id && activeEditor.mode === 'eventlog') {
                                    closeEditor(event.id);
                                  }
                                }}
                                onEscape={() => {
                                  if (activeEditor?.eventId === event.id && activeEditor.mode === 'eventlog') {
                                    closeEditor(event.id);
                                  }
                                }}
                                readOnly={!isActiveEventlog}
                                placeholder="添加日志..."
                                className="timelog-slate-editor"
                                showToolbar={isActiveEventlog}
                                enableMention={isActiveEventlog}
                                enableHashtag={isActiveEventlog}
                                showPreline={false}
                                enableTimestamp={true}
                                eventId={event.id}
                                autoFocus={isActiveEventlog}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 事件之间/之后✅TimeGap */}
              {/* 渲染策略✅
                  - 所有日期都显示（事件之✅+ 最后事件之后）
                  - 第一个事件前✅TimeGap 在日期组件开始时渲染
                  - 性能优化：虚线按需渲染，压缩日期不渲染
              */}
              <TimeGap
                prevEventEndTime={
                  event.endTime
                    ? (parseLocalTimeStringOrNull(event.endTime) ?? undefined)
                    : (event.startTime ? (parseLocalTimeStringOrNull(event.startTime) ?? undefined) : undefined)
                }
                nextEventStartTime={
                  nextEvent && nextEvent.startTime
                    ? (parseLocalTimeStringOrNull(nextEvent.startTime) ?? undefined)
                    : undefined
                }
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
                      // 关闭标签页，切换回时光日期
                      setActiveTabId('timelog');
                      setTabManagerEvents(prev => prev.filter(e => e.id !== event.id));
                      if (tabManagerEvents.length <= 1) {
                        setShowTabManager(false);
                      }
                    }}
                    onSave={async (updatedEvent) => {
                      // 刷新事件列表
                      const updatedEvents = await EventService.getEventsByRange(
                        dateRange!.start,
                        dateRange!.end
                      );
                      setAllEventsSynced(updatedEvents);
                    }}
                    onDelete={async (eventId) => {
                      // 删除事件后刷新列表并关闭标签✅
                      await EventService.deleteEvent(eventId);
                      const updatedEvents = await EventService.getEventsByRange(
                        dateRange!.start,
                        dateRange!.end
                      );
                      setAllEventsSynced(updatedEvents);
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

      {/* 新固定玻璃图标栏（替换原右侧三个按钮✅*/}
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
        onClose={async () => {
          // 取消/关闭视为丢弃：删除刚刚创建的空事件，避免污染列表
          if (newlyCreatedEventId) {
            try {
              await EventService.deleteEvent(newlyCreatedEventId);
            } catch (error) {
              console.error('✅[TimeLog] Failed to delete newly created event on cancel:', error);
            }
          }
          setCreateModalOpen(false);
          setNewEventTemplate(null);
          setNewlyCreatedEventId(null);
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
      
      {/* 时间编辑器已集成到Right菜单Tippy✅*/}

      {/* EventTabManager 已集成到 timelog-main-card 内部 */}
    </div>
  );

  return page;
};

// 辅助函数：格式化时间
function formatTime(dateStr: string | Date): string {
  const date = typeof dateStr === 'string'
    ? (parseLocalTimeStringOrNull(dateStr) ?? new Date(dateStr))
    : dateStr;
  if (Number.isNaN(date.getTime())) return '';
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 辅助函数：格式化时长
function formatDuration(startStr: string | Date, endStr: string | Date): string {
  const start = typeof startStr === 'string'
    ? (parseLocalTimeStringOrNull(startStr) ?? new Date(startStr))
    : startStr;
  const end = typeof endStr === 'string'
    ? (parseLocalTimeStringOrNull(endStr) ?? new Date(endStr))
    : endStr;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
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
  
  const date = typeof timestamp === 'string'
    ? (parseLocalTimeStringOrNull(timestamp) ?? new Date(timestamp))
    : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '未知';
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
  const date = typeof dueDateTime === 'string'
    ? (parseLocalTimeStringOrNull(dueDateTime) ?? new Date(dueDateTime))
    : dueDateTime;
  if (Number.isNaN(date.getTime())) return '未知';
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
