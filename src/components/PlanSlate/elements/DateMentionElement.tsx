/**
 * Date Mention 元素组件
 * 
 * 渲染日期提及节点
 * v2.0: 支持 TimeHub 实时同步
 * v2.1: 使用统一的智能相对日期格式化引擎
 * v2.2: 支持点击编辑时间（通过 TimeHub 提交修改）
 * v2.3: 支持时间过期检测和更新提示
 * v2.4: 点击打开 UnifiedDateTimePicker，过期检测改为 hover 触发
 */

import React, { useMemo, useState, useRef, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { RenderElementProps, useSelected, useFocused, ReactEditor } from 'slate-react';
import { Transforms, Editor, Path } from 'slate';
import { DateMentionNode } from '../types';
import { useEventTime } from '../../../hooks/useEventTime';
import { formatRelativeDate, formatRelativeTimeDisplay } from '../../../utils/relativeDateFormatter';
import { calculateTimeDiff, isDateMentionOutdated } from '../../../utils/timeDiffCalculator';
import { Button, Space } from 'antd';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import UnifiedDateTimePicker from '@frontend/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker';
import { formatTimeForStorage } from '../../../utils/timeUtils';
import datetimeIcon from '../../../assets/icons/datetime.svg';
import { EventService } from '../../../services/EventService';

const DateMentionElementComponent: React.FC<RenderElementProps> = ({ attributes, children, element }) => {
  const dateMentionElement = element as DateMentionNode;
  const selected = useSelected();
  const focused = useFocused();
  const [showPicker, setShowPicker] = useState(false);
  const spanRef = useRef<HTMLSpanElement>(null);
  
  // 🆕 尝试从 element 中获取 eventId，如果没有则动态查找父节点
  const eventId = useMemo(() => {
    // 🔧 修复：检查字段是否存在且有值（不是 undefined）
    if (dateMentionElement.eventId !== undefined && dateMentionElement.eventId !== null) {
      console.log('[DateMentionElement] 使用节点自身的 eventId', {eventId: dateMentionElement.eventId});
      return dateMentionElement.eventId;
    }
    
    // 🔥 动态查找父 event-line 节点的 eventId
    try {
      const editor = (window as any).__slateEditor;
      if (!editor) {
        console.warn('[DateMentionElement] ⚠️ 全局 editor 未注册');
        return undefined;
      }
      
      const path = ReactEditor.findPath(editor, element);
      const match = Editor.above(editor, {
        at: path,
        match: n => (n as any).type === 'event-line',
      });
      
      if (match) {
        const [eventLineNode] = match;
        const foundEventId = (eventLineNode as any).eventId;
        console.log('[DateMentionElement] 从父节点获取 eventId', { foundEventId });
        return foundEventId;
      } else {
        console.warn('[DateMentionElement] 未找到父 event-line 节点');
      }
    } catch (error) {
      console.warn('[DateMentionElement] 查找父节点失败', error);
    }
    
    return undefined;
  }, [dateMentionElement.eventId, element]);
  
  // 🆕 使用 TimeHub 订阅实时时间
  const { timeSpec, start, end, loading, setEventTime } = useEventTime(eventId);
  
  // 🆕 获取事件的 isDeadline 信息
  const [isDeadline, setIsDeadline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!eventId) {
      setIsDeadline(false);
      return;
    }

    (async () => {
      try {
        const event = await EventService.getEventById(eventId);
        if (!cancelled) setIsDeadline(!!event?.isDeadline);
      } catch {
        if (!cancelled) setIsDeadline(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId]);
  
  // 🆕 v2.3: 检测时间是否过期
  // 优先使用节点自身的 isOutdated 字段（持久化状态）
  // 如果节点已标记为过期，直接使用；否则才进行实时计算
  const isOutdated = useMemo(() => {
    // 1. 如果节点已明确标记为过期，优先使用节点状态
    if (dateMentionElement.isOutdated) {
      console.log('[DateMentionElement] 🟠 节点已标记过期', {
        eventId,
        nodeIsOutdated: dateMentionElement.isOutdated,
      });
      return true;
    }
    
    // 2. 否则进行实时计算（需要 TimeHub 数据）
    // 🔧 支持 start 或 end（deadline 场景）
    const hasTimeData = (start && dateMentionElement.startDate) || 
                        (end && dateMentionElement.endDate);
    
    if (!hasTimeData) {
      console.log('[DateMentionElement] ⚪ 缺少数据，跳过过期检测', {
        eventId,
        hasStart: !!start,
        hasStartDate: !!dateMentionElement.startDate,
        hasEnd: !!end,
        hasEndDate: !!dateMentionElement.endDate,
      });
      return false;
    }
    
    const result = isDateMentionOutdated(
      dateMentionElement.startDate,
      start,
      dateMentionElement.endDate,
      end
    );
    console.log('[DateMentionElement] 🔍 实时过期检测', {
      eventId,
      mentionStart: dateMentionElement.startDate,
      hubStart: start,
      mentionEnd: dateMentionElement.endDate,
      hubEnd: end,
      isOutdated: result,
      判断依据: 'mention时间 < hub时间',
      '原始数据比对': {
        'start相等': dateMentionElement.startDate === start,
        'end相等': dateMentionElement.endDate === end,
      },
      '时间戳': new Date().toLocaleTimeString(),
    });
    return result;
  }, [start, end, dateMentionElement.startDate, dateMentionElement.endDate, dateMentionElement.isOutdated, eventId]);
  
  // 🆕 v2.5: 检测时间被删除状态
  const isTimeDeleted = useMemo(() => {
    // 🔧 修复：必须等 TimeHub 加载完成才能判断是否被删除
    if (loading) return false;
    
    const hasElementTime = !!(dateMentionElement.startDate || dateMentionElement.endDate);
    const hasHubTime = !!(start || end);
    const deleted = hasElementTime && !hasHubTime;
    
    if (deleted) {
      console.log('[DateMentionElement] ⚠️ 时间已被删除', {
        eventId,
        elementTime: dateMentionElement.startDate || dateMentionElement.endDate,
        hubTime: start || end,
        loading,
      });
    }
    
    return deleted;
  }, [start, end, dateMentionElement.startDate, dateMentionElement.endDate, eventId, loading]);
  
  // 🆕 v2.3: 计算时间差异
  const timeDiff = useMemo(() => {
    // 🔧 即使不是过期状态，也需要计算时间差（用于显示悬浮窗）
    // 优先使用 start，如果只有 end 则使用 end
    const mentionTime = dateMentionElement.startDate || dateMentionElement.endDate;
    const hubTime = start || end;
    
    console.log('[DateMentionElement] 🔍 timeDiff 开始计算', {
      eventId,
      'DateMention中的时间': {
        startDate: dateMentionElement.startDate,
        endDate: dateMentionElement.endDate,
      },
      'TimeHub中的时间': {
        start,
        end,
      },
      'mentionTime (用于对比)': mentionTime,
      'hubTime (用于对比)': hubTime,
      isOutdated,
    });
    
    if (!mentionTime || !hubTime) {
      console.log('[DateMentionElement] 🔍 timeDiff 计算失败 - 缺少数据', {
        eventId,
        mentionTime,
        hubTime,
        isOutdated,
      });
      return null;
    }
    
    // 🔥 修复：参数顺序应该是 (原始时间=mentionTime, 当前时间=hubTime)
    // 这样 direction='later' 表示 hubTime > mentionTime（即 TimeHub 延后了）
    // direction='earlier' 表示 hubTime < mentionTime（即 TimeHub 提前了）
    const diff = calculateTimeDiff(mentionTime, hubTime);
    console.log('[DateMentionElement] 🔍 timeDiff 计算结果', {
      eventId,
      mentionTime,
      hubTime,
      isOutdated,
      diff,
    });
    return diff;
  }, [start, end, dateMentionElement.startDate, dateMentionElement.endDate, eventId, isOutdated]);
  
  // 🆕 v2.3: 自动标记节点为过期（仅当实时检测到新的过期状态时）
  useEffect(() => {
    // 🔧 支持 start 或 end（deadline 场景）
    if (!dateMentionElement.isOutdated) {
      const hasData = (dateMentionElement.startDate && start) || 
                      (dateMentionElement.endDate && end);
      
      if (hasData) {
        const realtimeOutdated = isDateMentionOutdated(
          dateMentionElement.startDate,
          start,
          dateMentionElement.endDate,
          end
        );
        
        if (realtimeOutdated) {
          try {
            const editor = (window as any).__slateEditor;
            if (!editor) return;
            
            const path = ReactEditor.findPath(editor, element);
            Transforms.setNodes(
              editor,
              { isOutdated: true } as Partial<DateMentionNode>,
              { at: path }
            );
            
            console.log('[DateMentionElement] 🚧 自动标记为过期', {
              eventId,
              mentionStart: dateMentionElement.startDate,
              hubStart: start,
              mentionEnd: dateMentionElement.endDate,
              hubEnd: end,
            });
          } catch (error) {
            // 忽略错误（可能元素已被删除）
          }
        }
      }
    }
  }, [dateMentionElement.isOutdated, start, end, dateMentionElement.startDate, dateMentionElement.endDate, element, eventId]);
  
  // 🆕 显示逻辑：优先显示用户原始输入文本
  const displayText = useMemo(() => {
    console.log(`%c[🎨 DateMentionElement 重新计算 displayText]`, 'background: #4CAF50; color: white; padding: 2px 6px;', {
      eventId,
      'TimeHub.start': start,
      'TimeHub.end': end,
      'element.startDate': dateMentionElement.startDate,
      'element.endDate': dateMentionElement.endDate,
      'element.originalText': dateMentionElement.originalText,
      'isOutdated': isOutdated,
      'isTimeDeleted': isTimeDeleted,
      渲染时间: new Date().toLocaleTimeString()
    });
    
    // 🔧 v2.5: 如果时间被删除，显示警告文案
    if (isTimeDeleted) {
      const deletedTime = dateMentionElement.startDate || dateMentionElement.endDate;
      return `${formatRelativeDate(new Date(deletedTime!))} (已移除)`;
    }
    
    // 🔧 v2.3: 优先使用 originalText（用户原始输入，如"下周二下午3点"）
    if (dateMentionElement.originalText) {
      return dateMentionElement.originalText;
    }
    
    // 🔧 降级：使用 children 的文本
    const childrenText = (element as any).children?.[0]?.text;
    if (childrenText) {
      return childrenText;
    }
    
    // 🔧 如果有 TimeHub 的时间数据，使用 TimeHub 格式化
    // 优先显示 start，如果没有 start 则显示 end（deadline 场景）
    const primaryTime = start || end;
    
    if (primaryTime) {
      // 🔧 修复：使用 formatRelativeTimeDisplay 来同时显示日期和时间
      const displayText = formatRelativeTimeDisplay(
        start || null,
        (start && end && start !== end) ? end : null,
        false, // isAllDay
        null   // dueDate
      );
      return displayText || formatRelativeDate(new Date(primaryTime));
    }
    
    // 🔧 v2.5: 如果都没有时间数据，返回 null（后续渲染为普通文本）
    return null;
  }, [start, end, element, dateMentionElement, eventId, isOutdated, isTimeDeleted]);

  // 🆕 v2.3: 更新 DateMention 时间到 TimeHub 当前值
  // 🆕 v2.4: 更新 DateMention 到 TimeHub 的最新时间
  const handleUpdateToCurrentTime = async () => {
    if (!eventId || !start) return;
    
    try {
      // 获取编辑器实例并更新节点
      const editor = (window as any).__slateEditor;
      if (!editor) {
        console.error('[DateMentionElement] 无法获取编辑器实例');
        return;
      }
      
      const path = ReactEditor.findPath(editor, element);
      
      // 更新节点：使用 TimeHub 的最新时间，并清除 isOutdated 和 originalText
      Transforms.setNodes(
        editor,
        {
          startDate: start,
          endDate: end || start,
          isOutdated: false,
          originalText: undefined, // 清除 originalText，强制使用新时间重新格式化
        } as Partial<DateMentionNode>,
        { at: path }
      );
      
      setShowPicker(false);
      console.log('[DateMentionElement] ✅ 已更新 DateMention 到 TimeHub 的最新时间', { start, end });
    } catch (error) {
      console.error('[DateMentionElement] 更新失败:', error);
    }
  };
  
  // 🆕 v2.4: 删除 DateMention 元素
  const handleRemove = async () => {
    try {
      const editor = (window as any).__slateEditor;
      if (!editor) {
        console.error('[DateMentionElement] 无法获取编辑器实例');
        return;
      }
      
      const path = ReactEditor.findPath(editor, element);
      Transforms.removeNodes(editor, { at: path });
      
      setShowPicker(false);
      console.log('[DateMentionElement] ✅ 已删除 DateMention 元素');
    } catch (error) {
      console.error('[DateMentionElement] 删除失败:', error);
    }
  };
  
  // 🆕 v2.4: 取消操作 - 关闭 popover，保持 DateMention 不变
  const handleCancel = () => {
    setShowPicker(false);
    console.log('[DateMentionElement] 用户取消操作，保持 DateMention 不变');
  };

  // 🆕 v2.4: 点击处理 - 打开 TimePicker 编辑时间
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 打开 TimePicker（即使没有 eventId 也允许编辑节点时间）
    setShowPicker(true);
    
    console.log('[DateMentionElement] 点击打开 TimePicker', {
      eventId,
      hasEventId: !!eventId,
      currentStart: start,
      mentionStart: dateMentionElement.startDate,
      mentionEventId: dateMentionElement.eventId,
      elementData: dateMentionElement,
    });
  }, [eventId, start, dateMentionElement]);

  // 🆕 v2.8.3: 鼠标进入事件 - 使用 useCallback 稳定引用，避免重复触发
  const handleMouseEnter = useCallback(() => {
    console.log('[DateMentionElement] 🎯 鼠标进入 DateMention', {
      eventId,
      isOutdated,
      isTimeDeleted,
      displayText,
    });
  }, [eventId, isOutdated, isTimeDeleted, displayText]);

  // 🆕 v2.4: TimePicker 确认回调 - 更新 TimeHub 和 DateMention 节点
  const handlePickerApplied = useCallback(async (newStartStr: string, newEndStr?: string, allDay?: boolean) => {
    try {
      // 🔥 重新查找 eventId（可能在组件初始化时还没有）
      let currentEventId = eventId;
      if (!currentEventId) {
        try {
          const editor = (window as any).__slateEditor;
          if (editor) {
            const path = ReactEditor.findPath(editor, element);
            const match = Editor.above(editor, {
              at: path,
              match: n => (n as any).type === 'event-line',
            });
            if (match) {
              const [eventLineNode] = match;
              currentEventId = (eventLineNode as any).eventId;
              console.log('[DateMentionElement] handlePickerApplied 动态查找到 eventId', { currentEventId });
            }
          }
        } catch (error) {
          console.warn('[DateMentionElement] 动态查找 eventId 失败', error);
        }
      }
      
      // 1. 如果有 eventId，更新 TimeHub
      if (currentEventId) {
        await setEventTime({
          start: newStartStr,
          end: newEndStr,
          allDay,
          source: 'dateMention-edit',
        });
        console.log('[DateMentionElement] ✅ 已更新 TimeHub', { currentEventId, newStartStr, newEndStr });
      }
      
      // 2. 更新 DateMention 节点（无论是否有 eventId 都要更新）
      const editor = (window as any).__slateEditor;
      if (editor) {
        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes(
          editor,
          {
            startDate: newStartStr,
            endDate: newEndStr || undefined,
            isOutdated: false,
            originalText: undefined,  // 🔥 清除 originalText，让 displayText 使用新的时间格式化
            eventId: currentEventId || dateMentionElement.eventId,  // 🔥 保存 eventId 到节点
          } as Partial<DateMentionNode>,
          { at: path }
        );
      }
      
      setShowPicker(false);
      console.log('[DateMentionElement] ✅ 已更新时间', { 
        newStartStr, 
        newEndStr, 
        hasEventId: !!currentEventId,
        updatedTimeHub: !!currentEventId,
        updatedNode: true,
      });
    } catch (error) {
      console.error('[DateMentionElement] 更新失败:', error);
    }
  }, [eventId, setEventTime, element, dateMentionElement.eventId]);

  // 🆕 v2.5: 恢复被删除的时间到 TimeHub
  const handleRestoreTime = async () => {
    if (!eventId || !isTimeDeleted) return;
    
    const restoreStart = dateMentionElement.startDate;
    const restoreEnd = dateMentionElement.endDate;
    
    if (!restoreStart && !restoreEnd) return;
    
    try {
      await setEventTime({
        start: restoreStart || undefined,
        end: restoreEnd || undefined,
        allDay: false,
        source: 'dateMention-restore',
      });
      
      console.log('[DateMentionElement] ✅ 已恢复时间到 TimeHub', { restoreStart, restoreEnd });
    } catch (error) {
      console.error('[DateMentionElement] 恢复时间失败:', error);
    }
  };
  
  // 🆕 v2.5: 被删除状态 Popover 内容
  const deletedPopoverContent = (
    <div style={{ 
      padding: '12px 16px',
      maxWidth: 320,
      background: '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#ff9800' }}>
          ⚠️ 时间已被移除
        </div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>
          该事件的时间已在时间选择器中被删除，系统将不再提供提醒。
        </div>
        <div style={{ 
          padding: '8px 12px',
          background: '#fff3e0',
          borderRadius: '6px',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 12, color: '#e65100' }}>
            原时间: {formatRelativeDate(new Date(dateMentionElement.startDate || dateMentionElement.endDate!))}
          </div>
        </div>
      </div>
      <Space>
        <Button size="small" onClick={handleRemove}>
          删除提及
        </Button>
        <Button size="small" type="primary" onClick={handleRestoreTime}>
          恢复时间
        </Button>
      </Space>
    </div>
  );
  
  // 🆕 v2.4: Popover 内容 - 显示时间变化和操作按钮（hover 触发）
  const outdatedPopoverContent = useMemo(() => {
    if (!timeDiff) {
      return null;
    }
    
    return (
      <div style={{ 
        padding: '20px',
        width: 200,
        background: '#fff',
        borderRadius: '20px',
        boxShadow: '0px 4px 10px 0px rgba(0,0,0,0.25)',
        fontSize: '13.8px',
        fontWeight: 500,
      }}>
        {/* 警告文本 - 居中，红色强调 */}
        <div style={{ 
          marginBottom: 16,
          fontSize: '13.8px',
          lineHeight: '20px',
          textAlign: 'center',
          color: '#666',
        }}>
          🚧 <span style={{ color: '#666' }}>当前时间</span>已<span style={{ color: '#dc2626' }}>{timeDiff.direction === 'earlier' ? '提前' : '延后'}了{timeDiff.value}{timeDiff.unit}</span>
          <br />
          <span style={{ color: '#666' }}>是否更新提及时间为</span>
        </div>
        
        {/* 日期显示 - 居中 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          marginBottom: 2,
        }}>
          <img src={datetimeIcon} style={{ width: 20, height: 20 }} alt="" />
          <div style={{ 
            fontSize: '13.8px',
            lineHeight: '22.4px',
            color: '#374151',
            fontWeight: 500,
          }}>
            {start ? (() => {
              const d = new Date(start);
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
              return `${year}-${month}-${day}（${weekday}）`;
            })() : '未知日期'}
          </div>
        </div>
        
        {/* 时间详情 - 居中，带渐变箭头和时长 */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0px',
          marginBottom: 20,
        }}>
          <span style={{ 
            fontSize: '13.8px',
            lineHeight: '22.4px',
            color: '#374151',
            fontWeight: 500,
          }}>{(() => {
            if (!start && !end) return '未知时间';
            const time = start || end!;
            const date = new Date(time);
            const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
            
            // 🆕 判断是否为单一时间（没有 end 或 start === end）
            const isSingleTime = !end || start === end;
            const suffix = isSingleTime ? (isDeadline ? ' 截止' : ' 开始') : '';
            
            // 🔧 修复：如果相对日期是"周X"格式，改为显示"X天后/前"
            let relativeText = formatRelativeDate(date);
            if (relativeText.startsWith('周')) {
              // 计算天数差
              const now = new Date();
              const startOfDate = new Date(date);
              startOfDate.setHours(0, 0, 0, 0);
              const startOfToday = new Date(now);
              startOfToday.setHours(0, 0, 0, 0);
              const daysDiff = Math.round((startOfDate.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysDiff > 0) {
                relativeText = `${daysDiff}天后`;
              } else if (daysDiff < 0) {
                relativeText = `${Math.abs(daysDiff)}天前`;
              }
            }
            
            return relativeText + ' ' + timeStr + suffix;
          })()}</span>
          {start && end && start !== end && (() => {
            const startDate = new Date(start);
            const endDate = new Date(end);
            const durationMs = endDate.getTime() - startDate.getTime();
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            const durationText = hours > 0 ? `${hours}h${minutes > 0 ? minutes + 'm' : ''}` : `${minutes}m`;
            
            return (
              <>
                <div style={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '0 6px',
                }}>
                  <span style={{
                    fontSize: '12px',
                    lineHeight: '12px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}>{durationText}</span>
                  <svg width="31" height="9" viewBox="0 0 52 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M51.3889 4.43908C51.6037 4.2243 51.6037 3.87606 51.3889 3.66127L47.8887 0.161088C47.6739 -0.0537006 47.3257 -0.0537006 47.1109 0.161088C46.8961 0.375876 46.8961 0.724117 47.1109 0.938905L50.2222 4.05018L47.1109 7.16144C46.8961 7.37623 46.8961 7.72447 47.1109 7.93926C47.3257 8.15405 47.6739 8.15405 47.8887 7.93926L51.3889 4.43908ZM0 4.05017L-4.80825e-08 4.60017L51 4.60018L51 4.05018L51 3.50018L4.80825e-08 3.50017L0 4.05017Z" fill="url(#paint0_linear_262_790)"/>
                    <defs>
                      <linearGradient id="paint0_linear_262_790" x1="-4.37114e-08" y1="4.55017" x2="51" y2="4.55018" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#22D3EE"/>
                        <stop offset="1" stopColor="#3B82F6"/>
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <span style={{ 
                  fontSize: '12.8px',
                  lineHeight: '22.4px',
                  color: '#374151',
                  fontWeight: 500,
                }}>{endDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              </>
            );
          })()}
        </div>
        
        {/* 文字链接 - 底部对齐 */}
        <div style={{ 
          display: 'flex',
          gap: '26px',
          justifyContent: 'center',
          fontSize: '13.8px',
          lineHeight: '22.4px',
          fontWeight: 500,
        }}>
          <span 
            onClick={handleCancel}
            style={{ 
              color: '#767676', 
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#999'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#767676'}
          >
            取消
          </span>
          <span 
            onClick={handleRemove}
            style={{ 
              color: '#767676', 
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#999'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#767676'}
          >
            删除
          </span>
          <span 
            onClick={handleUpdateToCurrentTime}
            style={{ 
              color: '#767676', 
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#1890ff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#767676'}
          >
            更新
          </span>
        </div>
      </div>
    );
  }, [timeDiff, start, eventId, isOutdated, handleCancel, handleRemove, handleUpdateToCurrentTime]);

  // 🔧 v2.5: 提取渲染逻辑，避免重复代码
  const renderDateMentionSpan = () => {
    // 🔧 调试：如果没有 displayText，记录详细日志
    if (!displayText) {
      console.log('[DateMentionElement] ⚠️ displayText 为空，渲染为降级文本', {
        eventId,
        displayText,
        'element.startDate': dateMentionElement.startDate,
        'element.endDate': dateMentionElement.endDate,
        'element.originalText': dateMentionElement.originalText,
        'TimeHub.start': start,
        'TimeHub.end': end,
        isOutdated,
        isTimeDeleted,
        loading,
      });
      
      // 🔧 降级显示：如果有 element.startDate，显示它；否则显示原始文本
      const fallbackText = dateMentionElement.startDate || dateMentionElement.originalText || '(时间待定)';
      
      return (
        <span {...attributes} style={{ color: '#999', fontStyle: 'italic' }} contentEditable={false}>
          {fallbackText}
          {children}
        </span>
      );
    }
    
    return (
      <span
        {...attributes}
        ref={spanRef}
        contentEditable={false}
        data-type="date-mention"
        data-date={dateMentionElement.startDate}
        data-event-id={eventId}
        data-is-outdated={isOutdated}
        data-deleted={isTimeDeleted}
        className={`date-mention ${selected && focused ? 'selected' : ''} ${isOutdated ? 'outdated' : ''} ${isTimeDeleted ? 'deleted' : ''}`}
        onClick={handleClick}
        onMouseEnter={() => {
          console.log('[DateMentionElement] 🎯 鼠标进入 DateMention', {
            eventId,
            isOutdated,
            isTimeDeleted,
            displayText,
            hasOutdatedContent: !!outdatedPopoverContent,
            hasDeletedContent: !!deletedPopoverContent,
          });
        }}
        style={{
          display: 'inline',
          margin: '0 2px',
          padding: '2px 6px',
          borderRadius: '4px',
          // 🚧 v2.5: 三种状态样式
          // 1. 被删除 - 橙色背景
          // 2. 过期 - 红色背景
          // 3. 正常 - 绿色/蓝色背景
          backgroundColor: isTimeDeleted ? '#ff9800' : (isOutdated ? '#f44336' : (start ? '#e8f5e9' : '#e3f2fd')),
          border: isTimeDeleted ? '1px solid #f57c00' : (isOutdated ? '1px solid #d32f2f' : (start ? '1px solid #66bb6a' : '1px solid #90caf9')),
          color: isTimeDeleted ? '#ffffff' : (isOutdated ? '#ffffff' : (start ? '#2e7d32' : '#1976d2')),
          fontSize: '0.9em',
          fontWeight: 500,
          userSelect: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s',
          ...((isOutdated || isTimeDeleted) && {
            boxShadow: `0 1px 3px ${isTimeDeleted ? 'rgba(255, 152, 0, 0.3)' : 'rgba(244, 67, 54, 0.3)'}`,
          }),
        }}
      >
        {isTimeDeleted ? '🔶' : (isOutdated ? '⚠️' : '📅')} {displayText}
        {children}
      </span>
    );
  };

  return (
    <>
      {/* TimePicker 弹窗 - 使用 Portal 渲染到 body，避免父组件重渲染影响 */}
      {showPicker && createPortal(
        <div
          style={{
            position: 'fixed',
            top: spanRef.current ? spanRef.current.getBoundingClientRect().bottom + 8 : '50%',
            left: spanRef.current ? spanRef.current.getBoundingClientRect().left : '50%',
            zIndex: 10000,
          }}
        >
          <UnifiedDateTimePicker
            eventId={eventId}
            useTimeHub={true}  // 🔥 修复：始终使用 TimeHub 模式，即使没有 eventId
            initialStart={dateMentionElement.startDate ? new Date(dateMentionElement.startDate) : undefined}
            initialEnd={dateMentionElement.endDate ? new Date(dateMentionElement.endDate) : undefined}
            onApplied={handlePickerApplied}
            onClose={() => setShowPicker(false)}
          />
        </div>,
        document.body
      )}
      
      {/* 🔧 v2.5: 只在有过期/删除状态且有内容时才渲染 Popover */}
      {(() => {
        const shouldShowPopover = (isOutdated && outdatedPopoverContent) || (isTimeDeleted && deletedPopoverContent);
        const popoverContent = isTimeDeleted ? deletedPopoverContent : outdatedPopoverContent;
        

        
        if (shouldShowPopover) {
          return (
            <Tippy
              content={popoverContent}
              visible={undefined}  // 让 Tippy 自己控制显示/隐藏
              interactive={true}   // 允许鼠标移入卡片
              delay={[200, 300]}   // [进入延迟ms, 离开延迟ms]
              placement="bottom"
              maxWidth={350}
              appendTo={() => document.body}
              onShow={() => {
                console.log('[DateMentionElement] 🎯 Tippy 显示', {
                  eventId,
                  isOutdated,
                  isTimeDeleted,
                  contentExists: !!popoverContent,
                });
              }}
              onHide={() => {
                console.log('[DateMentionElement] 🎯 Tippy 隐藏', { eventId });
              }}
            >
              {renderDateMentionSpan()}
            </Tippy>
          );
        } else {
          return renderDateMentionSpan();
        }
      })()}
    </>
  );
};

// 🔥 使用 React.memo 防止不必要的重渲染
export default memo(DateMentionElementComponent, (prevProps, nextProps) => {
  // 只有当 element 的关键属性变化时才重新渲染
  // 返回 true = props相同，不重新渲染
  // 返回 false = props不同，需要重新渲染
  
  const prevElement = prevProps.element as DateMentionNode;
  const nextElement = nextProps.element as DateMentionNode;
  
  // 忽略 children 和 attributes（Slate内部管理，引用总是变化）
  // 只比较DateMention的业务属性
  const isSame = (
    prevElement.startDate === nextElement.startDate &&
    prevElement.endDate === nextElement.endDate &&
    prevElement.eventId === nextElement.eventId &&
    prevElement.isOutdated === nextElement.isOutdated &&
    prevElement.originalText === nextElement.originalText
  );
  
  if (!isSame) {
    console.log('[DateMentionElement] 🔄 Props changed, will re-render', {
      eventId: nextElement.eventId,
      changed: {
        startDate: prevElement.startDate !== nextElement.startDate,
        endDate: prevElement.endDate !== nextElement.endDate,
        eventId: prevElement.eventId !== nextElement.eventId,
        isOutdated: prevElement.isOutdated !== nextElement.isOutdated,
        originalText: prevElement.originalText !== nextElement.originalText,
      }
    });
  }
  
  return isSame;
});
