import React, { useState, useMemo, useEffect } from 'react';
import { Event } from '../types';
import { TagService } from '../services/TagService';
import './DailyStatsCard.css';
import { useEventHubSnapshot } from '../hooks/useEventHubSnapshot';
import { parseLocalTimeStringOrNull } from '../utils/timeUtils';

interface DailyStatsCardProps {
  selectedDate?: Date; // 选中的日期，默认为今天
  onDateChange?: (date: Date) => void; // 日期变化回调
}

interface TagStats {
  id: string;
  name: string;
  emoji?: string;
  color: string;
  duration: number; // 毫秒
  percentage: number;
  level: number; // 层级深度
  children?: TagStats[];
}

export const DailyStatsCard: React.FC<DailyStatsCardProps> = ({
  selectedDate = new Date(),
  onDateChange
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(selectedDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Epic 2 (Master Plan v2.22): subscription-backed snapshot view
  const { events } = useEventHubSnapshot({ enabled: true });
  
  // 🆕 订阅 TagService 初始化状态
  const [tagsInitialized, setTagsInitialized] = useState(TagService.isInitialized());

  // 🆕 监听 TagService 初始化和更新
  useEffect(() => {
    // 检查初始化状态
    if (TagService.isInitialized()) {
      setTagsInitialized(true);
    }
    
    // 监听标签变化（包括初始化完成）
    const handleTagsUpdate = () => {
      setTagsInitialized(true);
      setRefreshKey(prev => prev + 1);
    };
    
    TagService.addListener(handleTagsUpdate);
    
    return () => {
      TagService.removeListener(handleTagsUpdate);
    };
  }, []);

  // ❌ [REMOVED] prop sync useEffect - 不再从 props 接收 events
  
  // 格式化日期为输入框格式 YYYY-MM-DD
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const tagStats = useMemo(() => {
    // 🔒 等待 TagService 初始化
    if (!tagsInitialized) {
      return { stats: [], total: 0, max: 0 };
    }
    
    const targetDateStr = currentDate.toDateString();
    const dayEvents = events.filter(event => {
      if (!event.startTime) return false;
      const eventDate = parseLocalTimeStringOrNull(event.startTime);
      if (!eventDate) return false;
      return eventDate.toDateString() === targetDateStr;
    });

    const tagDurations = new Map<string, number>();
    let totalDuration = 0;
    let maxDuration = 0;
    const now = new Date();

    dayEvents.forEach(event => {
      if (!event.startTime) return;
      const tags = event.tags || [];
      
      tags.forEach((tagId: string) => {
        const startDate = parseLocalTimeStringOrNull(event.startTime);
        if (!startDate) return;
        const start = startDate.getTime();
        const nowTime = now.getTime();

        const endDate = event.endTime ? parseLocalTimeStringOrNull(event.endTime) : null;
        if (event.endTime && !endDate) return;
        const end = endDate ? endDate.getTime() : nowTime;
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        
        const effectiveEnd = Math.min(end, nowTime);
        
        let duration = 0;
        if (effectiveEnd > start) {
          duration = effectiveEnd - start;
        }

        if (duration > 0) {
          tagDurations.set(tagId, (tagDurations.get(tagId) || 0) + duration);
          totalDuration += duration;
        }
      });
    });

    const flatTags = TagService.getFlatTags();

    // 构建层级统计树（从扁平结构）
    const buildTagStatsFromFlat = (): TagStats[] => {
      // 首先为所有有数据的标签创建统计对象
      const statsMap = new Map<string, TagStats>();
      
      // 初始化所有标签
      flatTags.forEach(tag => {
        const directDuration = tagDurations.get(tag.id) || 0;
        statsMap.set(tag.id, {
          id: tag.id,
          name: tag.name,
          emoji: tag.emoji,
          color: tag.color || '#999',
          duration: directDuration,
          percentage: 0, // 稍后计算
          level: 0, // 稍后计算
          children: []
        });
      });

      flatTags.forEach(tag => {
        const childStat = statsMap.get(tag.id);
        if (!childStat || childStat.duration === 0) return;
        
        let currentParentId = tag.parentId;
        while (currentParentId) {
          const parentStat = statsMap.get(currentParentId);
          if (parentStat) {
            parentStat.duration += childStat.duration;
            
            const parentTag = flatTags.find(t => t.id === currentParentId);
            currentParentId = parentTag?.parentId;
          } else {
            break;
          }
        }
      });

      statsMap.forEach(stat => {
        stat.percentage = totalDuration > 0 ? (stat.duration / totalDuration) * 100 : 0;
      });

      const rootStats: TagStats[] = [];
      const childrenMap = new Map<string, TagStats[]>();

      // 计算每个标签的层级深度
      const getTagLevel = (tagId: string): number => {
        const tag = flatTags.find(t => t.id === tagId);
        if (!tag || !tag.parentId) return 0;
        return 1 + getTagLevel(tag.parentId);
      };

      flatTags.forEach(tag => {
        const stat = statsMap.get(tag.id);
        
        if (!stat || stat.duration === 0) return;

        stat.level = getTagLevel(tag.id);

        if (tag.parentId) {
          if (!childrenMap.has(tag.parentId)) {
            childrenMap.set(tag.parentId, []);
          }
          childrenMap.get(tag.parentId)!.push(stat);
        } else {
          rootStats.push(stat);
        }
      });

      const attachChildren = (stat: TagStats) => {
        if (childrenMap.has(stat.id)) {
          stat.children = childrenMap.get(stat.id)!.sort((a, b) => b.duration - a.duration);
          stat.children.forEach(child => attachChildren(child));
        }
      };

      rootStats.forEach(stat => attachChildren(stat));

      return rootStats.sort((a, b) => b.duration - a.duration);
    };

    const stats = buildTagStatsFromFlat();

    // 计算所有标签的最大时长（包括子标签）
    const findMaxDuration = (tagStats: TagStats[]): number => {
      let max = 0;
      tagStats.forEach(stat => {
        max = Math.max(max, stat.duration);
        if (stat.children && stat.children.length > 0) {
          max = Math.max(max, findMaxDuration(stat.children));
        }
      });
      return max;
    };

    const maxTagDuration = findMaxDuration(stats);

    const FOUR_HOURS = 4 * 3600000;
    const TWELVE_HOURS = 12 * 3600000;
    const ONE_HOUR = 3600000;

    let barBaseline = FOUR_HOURS;
    if (maxTagDuration > FOUR_HOURS) {
      const hoursOver = Math.ceil((maxTagDuration - FOUR_HOURS) / ONE_HOUR);
      barBaseline = Math.min(FOUR_HOURS + (hoursOver * ONE_HOUR), TWELVE_HOURS);
    }

    return {
      stats,
      totalDuration,
      barBaseline
    };
  }, [events, currentDate, refreshKey, tagsInitialized]);

  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    
    if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    }
    return `${minutes}分钟`;
  };

  const calculateBarPercentage = (ms: number): number => {
    const baseline = tagStats.barBaseline || (4 * 3600000);
    const percentage = (ms / baseline) * 100;
    return Math.min(percentage, 100);
  };

  // 递归渲染标签统计
  const renderTagStat = (stat: TagStats) => {
    const indentPx = stat.level * 24; // 每层级缩进24px
    const isChild = stat.level > 0;
    const barPercentage = calculateBarPercentage(stat.duration);
    
    return (
      <div key={stat.id} className="tag-stat-item">
        <div 
          className={`tag-stat-row ${isChild ? 'tag-stat-row-child' : ''}`}
        >
          <div className="tag-stat-label" style={{ paddingLeft: `${indentPx}px` }}>
            <span className="tag-stat-name" style={{ color: stat.color }}>
              #{stat.emoji}{stat.name}
            </span>
          </div>
          <div className="tag-stat-time">
            <span className="tag-stat-duration">{formatDuration(stat.duration)}</span>
            <div className="tag-stat-bar-wrapper">
              <div className="tag-stat-bar-background">
                <div 
                  className="tag-stat-bar-fill" 
                  style={{ 
                    width: `${barPercentage}%`,
                    backgroundColor: stat.color,
                    opacity: isChild ? 0.8 : 1
                  }}
                />
              </div>
            </div>
            <span className="tag-stat-percentage">{stat.percentage.toFixed(1)}%</span>
          </div>
        </div>
        {stat.children && stat.children.length > 0 && stat.children.map(child => renderTagStat(child))}
      </div>
    );
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    if (!isNaN(newDate.getTime())) {
      setCurrentDate(newDate);
      onDateChange?.(newDate);
    }
  };

  return (
    <div className="daily-stats-card">
      <div className="stats-header">
        <h3>今日统计</h3>
        <div className="date-selector">
          <input
            type="date"
            value={formatDateForInput(currentDate)}
            onChange={handleDateChange}
            className="date-input"
          />
        </div>
      </div>

      <div className="stats-content">
        {tagStats.stats.length > 0 ? (
          <div className="tag-stats-list">
            {tagStats.stats.map(stat => renderTagStat(stat))}
          </div>
        ) : (
          <div className="empty-stats">
            <span className="empty-icon">📊</span>
            <p>暂无数据</p>
            <span className="empty-hint">该日期没有记录的事件</span>
          </div>
        )}

        {tagStats.totalDuration > 0 && (
          <div className="stats-footer">
            <div className="total-time">
              <span className="total-label">总计</span>
              <span className="total-value">{formatDuration(tagStats.totalDuration)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
