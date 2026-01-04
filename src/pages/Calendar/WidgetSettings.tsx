/**
 * Widget Settings Window - Widget 设置子窗口
 * 
 * 直接复用 CalendarSettingsPanel 组件
 * 🎨 Widget 专用：包含面板颜色和透明度设置
 */

import React, { useState, useEffect } from 'react';
import CalendarSettingsPanel, { CalendarSettings } from '@frontend/features/Calendar/components/CalendarSettingsPanel';
import './WidgetSettings.css'; // 🎨 Widget Settings 专用样式

/**
 * 将 Microsoft 颜色名称转换为十六进制颜色值
 */
function convertMicrosoftColorToHex(colorName: string): string {
  const colorMap: { [key: string]: string } = {
    'auto': '#3788d8',
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
  
  return colorMap[colorName] || colorName || '#3788d8';
}

const WidgetSettings: React.FC = () => {
  const [settings, setSettings] = useState<CalendarSettings>({
    eventOpacity: 80,
    visibleTags: [],
    visibleCalendars: [],
    showDeadline: true,
    showTask: true,
    showAllDay: true,
    deadlineHeight: 72,
    taskHeight: 72,
    allDayHeight: 24
  });

  // 🎨 Widget 专用状态
  const [widgetOpacity, setWidgetOpacity] = useState<number>(0.95);
  const [widgetColor, setWidgetColor] = useState<string>('#ffffff');
  const [widgetLocked, setWidgetLocked] = useState<boolean>(false);

  const [availableTags, setAvailableTags] = useState<Array<{
    id: string;
    name: string;
    color: string;
    emoji?: string;
    level?: number;
    calendarId?: string;
  }>>([]);

  const [availableCalendars, setAvailableCalendars] = useState<Array<{
    id: string;
    name: string;
    color?: string;
  }>>([]);

  // 🔧 扁平化标签树
  const flattenTags = (tags: any[]): any[] => {
    const result: any[] = [];
    const traverse = (nodes: any[], level: number = 0) => {
      nodes.forEach(node => {
        result.push({
          id: node.id,
          name: node.name,
          color: node.color,
          emoji: node.emoji,
          level,
          calendarId: node.calendarId
        });
        if (node.children && node.children.length > 0) {
          traverse(node.children, level + 1);
        }
      });
    };
    traverse(tags);
    return result;
  };

  // 从 localStorage 加载设置
  useEffect(() => {
    const loadSettings = () => {
      try {
        console.log('🔍 [WidgetSettings] 开始加载设置...');
        
        const saved = localStorage.getItem('widget-calendar-settings');
        let parsed: Partial<CalendarSettings> | null = null;
        if (saved) {
          parsed = JSON.parse(saved);
          setSettings(prev => ({ ...prev, ...parsed }));
          console.log('✅ [WidgetSettings] 加载保存的设置:', parsed);
        }

        // 🎨 加载 Widget 专用设置
        const widgetSettings = localStorage.getItem('desktop-calendar-widget-settings');
        if (widgetSettings) {
          const widgetParsed = JSON.parse(widgetSettings);
          if (widgetParsed.bgOpacity !== undefined) setWidgetOpacity(widgetParsed.bgOpacity);
          if (widgetParsed.bgColor) setWidgetColor(widgetParsed.bgColor);
          if (widgetParsed.isLocked !== undefined) setWidgetLocked(widgetParsed.isLocked);
          console.log('✅ [WidgetSettings] 加载 Widget 样式设置:', widgetParsed);
        }

        // 加载标签
        const tagsData = localStorage.getItem('4dnote-hierarchical-tags');
        console.log('🏷️ [WidgetSettings] 标签数据:', tagsData ? `${tagsData.length} 字符` : '空');
        if (tagsData) {
          const tags = JSON.parse(tagsData);
          console.log('🏷️ [WidgetSettings] 解析标签:', tags);
          const flatTags = flattenTags(tags);
          console.log(`✅ [WidgetSettings] 扁平化标签: ${flatTags.length} 个`, flatTags);
          setAvailableTags(flatTags);
          
          // 如果没有选中的标签，默认全选
          if (!parsed || !parsed.visibleTags || parsed.visibleTags.length === 0) {
            const allTagIds = flatTags.map(t => t.id);
            console.log('📌 [WidgetSettings] 默认全选标签:', allTagIds);
            setSettings(prev => ({
              ...prev,
              visibleTags: allTagIds
            }));
          }
        } else {
          console.warn('⚠️ [WidgetSettings] localStorage 中没有标签数据');
        }

        // 加载日历 - 修复 key 名称
        const calendarsData = localStorage.getItem('4dnote-calendars-cache');
        console.log('📅 [WidgetSettings] 日历数据:', calendarsData ? `${calendarsData.length} 字符` : '空');
        if (calendarsData) {
          const calendars = JSON.parse(calendarsData);
          console.log('📅 [WidgetSettings] 解析日历:', calendars);
          
          // 添加特殊选项
          const allCalendars = [
            ...calendars.map((cal: any) => ({
              id: cal.id,
              name: cal.name,
              color: convertMicrosoftColorToHex(cal.color) // 🎨 转换 Microsoft 颜色名称
            })),
            {
              id: 'local-created',
              name: '🔮 创建自本地',
              color: '#9c27b0'
            },
            {
              id: 'not-synced',
              name: '🔄 未同步至日历',
              color: '#ff9800'
            }
          ];
          
          console.log(`✅ [WidgetSettings] 设置日历: ${allCalendars.length} 个`, allCalendars);
          setAvailableCalendars(allCalendars);
          
          // 如果没有选中的日历，默认全选
          if (!parsed || !parsed.visibleCalendars || parsed.visibleCalendars.length === 0) {
            const allCalendarIds = allCalendars.map((c: any) => c.id);
            console.log('📌 [WidgetSettings] 默认全选日历:', allCalendarIds);
            setSettings(prev => ({
              ...prev,
              visibleCalendars: allCalendarIds
            }));
          }
        } else {
          console.warn('⚠️ [WidgetSettings] localStorage 中没有日历数据');
          // 至少添加特殊选项
          const specialCalendars = [
            {
              id: 'local-created',
              name: '🔮 创建自本地',
              color: '#9c27b0'
            },
            {
              id: 'not-synced',
              name: '🔄 未同步至日历',
              color: '#ff9800'
            }
          ];
          setAvailableCalendars(specialCalendars);
          setSettings(prev => ({
            ...prev,
            visibleCalendars: specialCalendars.map(c => c.id)
          }));
        }
      } catch (error) {
        console.error('❌ [WidgetSettings] 加载设置失败:', error);
      }
    };

    loadSettings();
  }, []);

  // 保存设置到 localStorage
  const handleSettingsChange = (newSettings: CalendarSettings) => {
    console.log('💾 [WidgetSettings] 保存设置:', newSettings);
    setSettings(newSettings);
    localStorage.setItem('widget-calendar-settings', JSON.stringify(newSettings));
    
    // 🔔 通知 Widget 窗口更新
    window.dispatchEvent(new CustomEvent('widget-settings-updated', {
      detail: newSettings
    }));
  };

  // 🎨 Widget 专用：保存透明度
  const handleWidgetOpacityChange = (opacity: number) => {
    console.log('🎨 [WidgetSettings] 透明度变化:', opacity);
    setWidgetOpacity(opacity);
    const widgetSettings = { bgOpacity: opacity, bgColor: widgetColor, isLocked: widgetLocked };
    localStorage.setItem('desktop-calendar-widget-settings', JSON.stringify(widgetSettings));
    
    // 🔗 通过IPC通知Widget窗口
    if (window.electronAPI?.widgetUpdateSettings) {
      window.electronAPI.widgetUpdateSettings(widgetSettings);
      console.log('✅ [WidgetSettings] IPC通知已发送:', widgetSettings);
    } else {
      console.warn('⚠️ [WidgetSettings] widgetUpdateSettings 不可用');
    }
    
    console.log('💾 [WidgetSettings] 保存透明度:', opacity);
  };

  // 🎨 Widget 专用：保存颜色
  const handleWidgetColorChange = (color: string) => {
    console.log('🎨 [WidgetSettings] 颜色变化:', color);
    setWidgetColor(color);
    const widgetSettings = { bgOpacity: widgetOpacity, bgColor: color, isLocked: widgetLocked };
    localStorage.setItem('desktop-calendar-widget-settings', JSON.stringify(widgetSettings));
    
    // 🔗 通过IPC通知Widget窗口
    if (window.electronAPI?.widgetUpdateSettings) {
      window.electronAPI.widgetUpdateSettings(widgetSettings);
      console.log('✅ [WidgetSettings] IPC通知已发送:', widgetSettings);
    } else {
      console.warn('⚠️ [WidgetSettings] widgetUpdateSettings 不可用');
    }
    
    console.log('💾 [WidgetSettings] 保存颜色:', color);
  };

  // 🎨 Widget 专用：切换锁定状态
  const handleWidgetLockToggle = (locked: boolean) => {
    setWidgetLocked(locked);
    const widgetSettings = { bgOpacity: widgetOpacity, bgColor: widgetColor, isLocked: locked };
    localStorage.setItem('desktop-calendar-widget-settings', JSON.stringify(widgetSettings));
    
    // 🔗 通过IPC通知Widget窗口
    if (window.electronAPI?.widgetUpdateSettings) {
      window.electronAPI.widgetUpdateSettings(widgetSettings);
    }
    
    console.log('💾 [WidgetSettings] 切换锁定:', locked);
  };

  const handleClose = () => {
    if (window.electronAPI?.widget?.closeSettings) {
      window.electronAPI.widget.closeSettings();
    }
  };

  // 🖱️ 简化的拖动处理（使用 requestAnimationFrame 节流）
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只响应左键
    e.preventDefault();

    let lastX = e.screenX;
    let lastY = e.screenY;
    let animationFrameId: number | null = null;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (animationFrameId) return; // 已有待处理的帧，跳过

      animationFrameId = requestAnimationFrame(() => {
        const deltaX = moveEvent.screenX - lastX;
        const deltaY = moveEvent.screenY - lastY;
        
        if (deltaX !== 0 || deltaY !== 0) {
          // 直接移动窗口
          if (window.electronAPI?.invoke) {
            window.electronAPI.invoke('move-widget-settings-window', { deltaX, deltaY });
          }
          
          lastX = moveEvent.screenX;
          lastY = moveEvent.screenY;
        }
        
        animationFrameId = null;
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <CalendarSettingsPanel
      isOpen={true}
      onClose={handleClose}
      settings={settings}
      onSettingsChange={handleSettingsChange}
      availableTags={availableTags}
      availableCalendars={availableCalendars}
      isWidgetMode={true} // 🎨 启用 Widget 模式
      widgetOpacity={widgetOpacity}
      widgetColor={widgetColor}
      widgetLocked={widgetLocked}
      onWidgetOpacityChange={handleWidgetOpacityChange}
      onWidgetColorChange={handleWidgetColorChange}
      onWidgetLockToggle={handleWidgetLockToggle}
      onHeaderMouseDown={handleHeaderMouseDown}
    />
  );
};

export default WidgetSettings;
