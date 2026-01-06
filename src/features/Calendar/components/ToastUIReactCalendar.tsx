import type { EventObject, ExternalEventTypes, Options } from '@frontend/lib/tui.calendar/apps/calendar';
import ToastUICalendar from '@frontend/lib/tui.calendar/apps/calendar';
import React from 'react';
import { recordDevUsage } from '@frontend/utils/devUsageLog';

// Helper function to check equality
function isEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, index) => isEqual(val, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as any);
    const keysB = Object.keys(b as any);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => isEqual((a as any)[key], (b as any)[key]));
  }
  return false;
}

type ReactCalendarOptions = Omit<Options, 'defaultView'>;
type CalendarView = Required<Options>['defaultView'];

type CalendarExternalEventNames = Extract<keyof ExternalEventTypes, string>;
type ReactCalendarEventNames = `on${Capitalize<CalendarExternalEventNames>}`;
type ReactCalendarEventHandler = ExternalEventTypes[CalendarExternalEventNames];
type ReactCalendarExternalEvents = {
  [events in ReactCalendarEventNames]: ReactCalendarEventHandler;
};

type Props = ReactCalendarOptions & {
  height: string;
  events?: Partial<EventObject>[];
  view?: CalendarView;
} & Partial<ReactCalendarExternalEvents>;

const optionsProps: (keyof ReactCalendarOptions)[] = [
  'useFormPopup',
  'useDetailPopup',
  'isReadOnly',
  'week',
  'month',
  'gridSelection',
  'usageStatistics',
  'eventFilter',
  'timezone',
  'template',
];

const reactCalendarEventNames: ReactCalendarEventNames[] = [
  'onSelectDateTime',
  'onBeforeCreateEvent',
  'onBeforeUpdateEvent',
  'onBeforeDeleteEvent',
  'onAfterRenderEvent',
  'onClickDayName',
  'onClickEvent',
  'onClickMoreEventsBtn',
  'onClickTimezonesCollapseBtn',
];

function pickCalendarEventPayload(eventInfo: any): any {
  if (!eventInfo || typeof eventInfo !== 'object') return eventInfo;

  const event = (eventInfo as any).event;
  if (event && typeof event === 'object') {
    return {
      event: {
        id: event.id,
        calendarId: event.calendarId,
        category: event.category,
        isAllday: event.isAllday,
        title: event.title,
        start: event.start?.toString?.() ?? event.start,
        end: event.end?.toString?.() ?? event.end,
      },
      changes: (eventInfo as any).changes,
      start: (eventInfo as any).start?.toString?.() ?? (eventInfo as any).start,
      end: (eventInfo as any).end?.toString?.() ?? (eventInfo as any).end,
      isAllday: (eventInfo as any).isAllday,
      viewName: (eventInfo as any).viewName,
    };
  }

  return {
    start: (eventInfo as any).start?.toString?.() ?? (eventInfo as any).start,
    end: (eventInfo as any).end?.toString?.() ?? (eventInfo as any).end,
    isAllday: (eventInfo as any).isAllday,
    viewName: (eventInfo as any).viewName,
  };
}

class ToastUIReactCalendarClass extends React.Component<Props> {
  containerElementRef = React.createRef<HTMLDivElement>();
  calendarInstance: ToastUICalendar | null = null;
  currentEventsRef: Partial<EventObject>[] = []; // ✅ 追踪当前实际渲染的事件

  static defaultProps = {
    height: '800px',
    view: 'week' as CalendarView,
  };

  componentDidMount() {
    const { height, events = [], view, ...options } = this.props;
    const container = this.containerElementRef.current;

    if (container) {
      // Extract only the options that belong to TUI Calendar
      const calendarOptions = optionsProps.reduce((acc, prop) => {
        if (prop in options) {
          (acc as any)[prop] = (options as any)[prop];
        }
        return acc;
      }, {});

      this.calendarInstance = new ToastUICalendar(container, { 
        ...calendarOptions, 
        defaultView: view || 'week' 
      });

      recordDevUsage('tui:init', { defaultView: view || 'week' });

      // 添加 class 标记，方便调试
      container.classList.add('toastui-calendar');
      container.style.height = height;

    } else {
      console.error('❌ [TUI] Container ref is null!');
    }

    // ✅ 关键修复：初次挂载时也要设置 calendars，否则硬刷新会出现颜色/分组丢失
    this.setCalendars(this.props.calendars);

    this.setEvents(events);
    this.bindEventHandlers();
  }

  shouldComponentUpdate(nextProps: Readonly<Props>) {
    const { calendars, height, events, theme, view } = this.props;
    const {
      calendars: nextCalendars,
      height: nextHeight,
      events: nextEvents,
      theme: nextTheme = {},
      view: nextView,
    } = nextProps;

    // console.log('🔍 [TUI] shouldComponentUpdate:', {
    //   viewChanged: view !== nextView,
    //   currentView: view,
    //   nextView: nextView,
    //   heightChanged: height !== nextHeight,
    //   eventsChanged: !isEqual(events, nextEvents)
    // });

    if (!isEqual(height, nextHeight) && this.containerElementRef.current) {
      this.containerElementRef.current.style.height = nextHeight;
    }

    if (!isEqual(calendars, nextCalendars)) {
      this.setCalendars(nextCalendars);
    }

    // 🔄 优化事件更新：使用增量更新而不是全量刷新
    if (!isEqual(events, nextEvents)) {
      // console.log(`📊 [TUI] Events props changed: ${(events || []).length} → ${(nextEvents || []).length}`);
      this.updateEventsIncremental(nextEvents || []);
    }

    if (!isEqual(theme, nextTheme)) {
      this.calendarInstance?.setTheme(nextTheme);
    }

    if (view !== nextView && nextView) {
      recordDevUsage('tui:changeView', { from: view, to: nextView });
      this.calendarInstance?.changeView(nextView);
    }

    return false;
  }

  componentWillUnmount() {
    this.calendarInstance?.destroy();
  }

  setCalendars = (calendars: ReactCalendarOptions['calendars']) => {
    if (calendars) {
      this.calendarInstance?.setCalendars(calendars);
    }
  };

  setEvents = (events: Partial<EventObject>[]) => {
    if (events && events.length > 0) {
      this.calendarInstance?.createEvents(events);
      this.currentEventsRef = [...events]; // ✅ 更新当前事件引用
    }
  };

  // 🔄 增量更新事件：只更新变化的部分
  updateEventsIncremental = (newEvents: Partial<EventObject>[]) => {
    if (!this.calendarInstance) return;

    const startTime = performance.now(); // ⏱️ 性能监控
    // console.log('🔄 [TUI] 开始增量更新事件');

    // ✅ 使用当前实际渲染的事件进行比较
    const currentEvents = this.currentEventsRef;
    
    // 创建快速查找映射
    const mapStart = performance.now();
    const currentEventsMap = new Map(currentEvents.map(e => [e.id, e]));
    const newEventsMap = new Map(newEvents.map(e => [e.id, e]));
    // console.log(`🔄 [TUI] 创建映射耗时: ${(performance.now() - mapStart).toFixed(2)}ms`);

    const toDelete: Partial<EventObject>[] = [];  // ✅ 改为保存完整事件对象
    const toUpdate: Partial<EventObject>[] = [];
    const toCreate: Partial<EventObject>[] = [];

    const diffStart = performance.now();
    // 找出需要删除的事件（在当前渲染中存在，但在新事件列表中不存在）
    currentEvents.forEach(currentEvent => {
      if (currentEvent.id && !newEventsMap.has(currentEvent.id)) {
        toDelete.push(currentEvent);  // ✅ 保存完整对象而不只是ID
      }
    });

    // 找出需要创建或更新的事件
    newEvents.forEach(newEvent => {
      const currentEvent = newEvent.id ? currentEventsMap.get(newEvent.id) : undefined;
      if (!currentEvent) {
        toCreate.push(newEvent);
      } else {
        // ✅ 智能比较：包含颜色字段以检测标签变化
        const coreFieldsChanged = 
          currentEvent.title !== newEvent.title ||
          currentEvent.start?.toString() !== newEvent.start?.toString() ||
          currentEvent.end?.toString() !== newEvent.end?.toString() ||
          currentEvent.location !== newEvent.location ||
          currentEvent.body !== newEvent.body ||
          currentEvent.isAllday !== newEvent.isAllday ||
          currentEvent.category !== newEvent.category ||
          currentEvent.calendarId !== newEvent.calendarId ||
          currentEvent.backgroundColor !== newEvent.backgroundColor ||
          currentEvent.borderColor !== newEvent.borderColor;
        
        if (coreFieldsChanged) {
          toUpdate.push(newEvent);
        }
      }
    });

    const diffTime = performance.now() - diffStart;
    // console.log(`🔄 [TUI] 差异计算耗时: ${diffTime.toFixed(2)}ms`);
    // console.log(`🔄 [TUI] Update: -${toDelete.length} ~${toUpdate.length} +${toCreate.length} (${currentEvents.length} → ${newEvents.length})`);

    // 只有在有实际变化时才执行操作
    if (toDelete.length > 0 || toUpdate.length > 0 || toCreate.length > 0) {
      const deleteStart = performance.now();
      // 删除不再存在的事件
      toDelete.forEach(event => {
        try {
          if (event.id && event.calendarId) {
            this.calendarInstance?.deleteEvent(event.id, event.calendarId);
          }
        } catch (e) {
          console.warn('[TUI] Failed to delete event:', event.id, e);
        }
      });
      // console.log(`🔄 [TUI] 删除事件耗时: ${(performance.now() - deleteStart).toFixed(2)}ms`);

      // 🚀 性能优化：大量更新时使用批量刷新
      if (toUpdate.length > 100) {
        // console.log(`🚀 [TUI] 检测到大量更新(${toUpdate.length}个)，使用批量刷新优化`);
        const batchStart = performance.now();
        
        this.calendarInstance?.clear();
        this.calendarInstance?.createEvents(newEvents);
        
        // console.log(`🚀 [TUI] 批量刷新完成，耗时: ${(performance.now() - batchStart).toFixed(2)}ms`);
      } else {
        // 少量更新：使用增量更新
        const updateStart = performance.now();
        const eventsNeedingRefresh: EventObject[] = [];
        
        toUpdate.forEach(event => {
          try {
            if (event.id && event.calendarId) {
              // Check if event exists in TUI Calendar
              const currentTUIEvent = this.calendarInstance?.getEvent(event.id, event.calendarId);
              
              if (!currentTUIEvent) {
                // Event doesn't exist in TUI Calendar, need full refresh
                eventsNeedingRefresh.push(event);
              } else {
                // Event exists, try standard update
                this.calendarInstance?.updateEvent(event.id, event.calendarId, {
                  ...event,
                  backgroundColor: event.backgroundColor,
                  borderColor: event.borderColor,
                  color: event.color
                });
              }
            }
          } catch (e) {
            console.warn('[TUI] Failed to update event:', event.id, e);
          }
        });
        
        // console.log(`🔄 [TUI] 更新事件耗时: ${(performance.now() - updateStart).toFixed(2)}ms`);

        // 🔧 If events need refresh (not in TUI Calendar), force full calendar rebuild
        if (eventsNeedingRefresh.length > 0) {
          // console.log(`🔄 [TUI] ${eventsNeedingRefresh.length}个事件不存在于TUI Calendar，强制全量刷新`);
          const refreshStart = performance.now();
          // Clear and recreate all events to ensure proper rendering
          this.calendarInstance?.clear();
          this.calendarInstance?.createEvents(newEvents);
          // console.log(`🔄 [TUI] 强制刷新耗时: ${(performance.now() - refreshStart).toFixed(2)}ms`);
        }

        const createStart = performance.now();
        // 创建新事件
        if (toCreate.length > 0) {
          this.calendarInstance?.createEvents(toCreate);
          // console.log(`🔄 [TUI] 创建新事件耗时: ${(performance.now() - createStart).toFixed(2)}ms`);
        }
      }
      
      // ✅ 更新当前事件引用
      this.currentEventsRef = [...newEvents];
      
      const totalTime = performance.now() - startTime;
      // console.log(`🔄 [TUI] 增量更新总耗时: ${totalTime.toFixed(2)}ms`);
    } else {
      // console.log('🔄 [TUI] 无变化，跳过更新');
    }
  };

  bindEventHandlers = () => {
    const { props } = this;

    if (!this.calendarInstance) return;
    
    // 绑定 clickEvent（已确认这是正确的事件名）
    this.calendarInstance.on('clickEvent' as any, (eventInfo: any) => {
      recordDevUsage('tui:event:clickEvent', pickCalendarEventPayload(eventInfo));
      props.onClickEvent?.(eventInfo);
    });
    
    // 绑定其他事件
    reactCalendarEventNames.forEach((eventName) => {
      const eventHandler = props[eventName];
      if (this.calendarInstance && eventName !== 'onClickEvent') {
        // 转换事件名：onSelectDateTime -> selectDateTime (保持驼峰)
        let calendarEventName = eventName.replace('on', '');
        calendarEventName = calendarEventName.charAt(0).toLowerCase() + calendarEventName.slice(1);

        this.calendarInstance.on(calendarEventName as any, (eventInfo: any) => {
          recordDevUsage(`tui:event:${calendarEventName}`, pickCalendarEventPayload(eventInfo));
          (eventHandler as any)?.(eventInfo);
        });
      }
    });
  };

  getInstance = () => {
    return this.calendarInstance;
  };

  render() {
    return <div ref={this.containerElementRef} />;
  }
}

// 🚀 使用 React.memo 优化：只有在 events 或其他关键 props 真正变化时才重新渲染
const ToastUIReactCalendar = React.memo(ToastUIReactCalendarClass, (prevProps, nextProps) => {
  // 返回 true = 跳过更新，返回 false = 需要更新
  
  // 关键属性：events 数组
  if (!isEqual(prevProps.events, nextProps.events)) {
    return false; // events 变化，需要更新
  }
  
  // 其他关键属性
  if (prevProps.view !== nextProps.view) return false;
  if (prevProps.height !== nextProps.height) return false;
  if (!isEqual(prevProps.calendars, nextProps.calendars)) return false;
  if (!isEqual(prevProps.theme, nextProps.theme)) return false;
  
  // 事件处理器（通常是稳定的引用，但也检查一下）
  const eventHandlerKeys: ReactCalendarEventNames[] = [
    'onSelectDateTime', 'onBeforeCreateEvent', 'onBeforeUpdateEvent', 
    'onBeforeDeleteEvent', 'onClickEvent'
  ];
  
  for (const key of eventHandlerKeys) {
    if (prevProps[key] !== nextProps[key]) {
      return false; // 事件处理器变化，需要更新
    }
  }
  
  // 所有关键属性都没变化，跳过更新
  return true;
});

// 导出类型供 useRef 使用
export type ToastUIReactCalendarType = ToastUIReactCalendarClass;

export default ToastUIReactCalendar;