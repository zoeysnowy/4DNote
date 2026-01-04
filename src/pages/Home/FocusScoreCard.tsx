import React, { useState, useEffect } from 'react';
import { DashboardCard } from './DashboardCard';
import { EventService } from '@backend/EventService';
import { TimeRange } from './TimeRangeSelector';
import { parseLocalTimeString } from '@frontend/utils/timeUtils';
import './FocusScoreCard.css';

interface FocusData {
  score: number;              // 专注力评分 0-100
  fragmentationRate: number;  // 碎片化率
  avgEventDuration: number;   // 平均事件时长（分钟）
  shortEventCount: number;    // 短事件数量（<15分钟）
  longEventCount: number;     // 长事件数量（>=60分钟）
  level: 'excellent' | 'good' | 'normal' | 'poor'; // 专注力等级
}

interface FocusScoreCardProps {
  timeRange?: TimeRange;
}

/**
 * FocusScoreCard - 专注力评分卡片
 * 
 * 评分算法：
 * 1. 基础分：平均事件时长（分钟） * 0.5
 * 2. 扣分：碎片化率 * 50
 * 3. 加分：长事件占比 * 20
 * 4. 最终分数限制在 0-100
 * 
 * 专注力等级：
 * - excellent: >= 80分
 * - good: >= 60分
 * - normal: >= 40分
 * - poor: < 40分
 */
export const FocusScoreCard: React.FC<FocusScoreCardProps> = ({ timeRange }) => {
  const [focusData, setFocusData] = useState<FocusData>({
    score: 0,
    fragmentationRate: 0,
    avgEventDuration: 0,
    shortEventCount: 0,
    longEventCount: 0,
    level: 'normal'
  });
  const [loading, setLoading] = useState(true);

  // 计算专注力数据
  const calculateFocusScore = (eventStats: any[]): FocusData => {
    if (eventStats.length === 0) {
      return {
        score: 0,
        fragmentationRate: 0,
        avgEventDuration: 0,
        shortEventCount: 0,
        longEventCount: 0,
        level: 'poor'
      };
    }

    // 计算事件时长分布
    let totalDuration = 0;
    let shortEventCount = 0;
    let longEventCount = 0;

    eventStats.forEach(stats => {
      if (stats.startTime && stats.endTime) {
        try {
          const durationMs =
            parseLocalTimeString(stats.endTime).getTime() -
            parseLocalTimeString(stats.startTime).getTime();
          const durationMin = durationMs / (1000 * 60);
          totalDuration += durationMin;

          if (durationMin < 15) {
            shortEventCount++;
          } else if (durationMin >= 60) {
            longEventCount++;
          }
        } catch {
          // ignore invalid time values
        }
      }
    });

    const avgEventDuration = totalDuration / eventStats.length;
    const fragmentationRate = shortEventCount / eventStats.length;
    const longEventRate = longEventCount / eventStats.length;

    // 计算专注力评分
    let score = 0;
    score += avgEventDuration * 0.5;        // 基础分：平均时长
    score -= fragmentationRate * 50;        // 扣分：碎片化
    score += longEventRate * 20;            // 加分：长事件占比
    score = Math.max(0, Math.min(100, score)); // 限制在 0-100

    // 确定等级
    let level: FocusData['level'] = 'poor';
    if (score >= 80) level = 'excellent';
    else if (score >= 60) level = 'good';
    else if (score >= 40) level = 'normal';

    return {
      score: Math.round(score),
      fragmentationRate,
      avgEventDuration,
      shortEventCount,
      longEventCount,
      level
    };
  };

  // 加载今日专注力数据
  useEffect(() => {
    const loadFocusData = async () => {
      setLoading(true);
      try {
        const today = new Date();
        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const todayStr = formatDate(today);
        const eventStats = await EventService.getEventStatsByDateRange(todayStr, todayStr);

        const focusData = calculateFocusScore(eventStats);
        setFocusData(focusData);
      } catch (error) {
        console.error('[FocusScoreCard] Error loading focus data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFocusData();

    // 每5分钟刷新一次
    const interval = setInterval(loadFocusData, 300000);
    return () => clearInterval(interval);
  }, []);

  // 获取等级显示信息
  const getLevelInfo = (level: FocusData['level']) => {
    switch (level) {
      case 'excellent':
        return { text: '优秀', color: '#52c41a', emoji: '🌟' };
      case 'good':
        return { text: '良好', color: '#1890ff', emoji: '👍' };
      case 'normal':
        return { text: '一般', color: '#faad14', emoji: '😊' };
      case 'poor':
        return { text: '较差', color: '#ff4d4f', emoji: '😔' };
    }
  };

  const levelInfo = getLevelInfo(focusData.level);

  return (
    <DashboardCard
      title="专注力评分"
      icon="🎯"
      loading={loading}
      heightMode="compact"
    >
      <div className="focus-score-content">
        {/* 评分圆环 */}
        <div className="focus-score-ring">
          <svg width="140" height="140" viewBox="0 0 140 140">
            {/* 背景圆环 */}
            <circle
              cx="70"
              cy="70"
              r="60"
              fill="none"
              stroke="#f0f0f0"
              strokeWidth="12"
            />
            {/* 分数圆环 */}
            <circle
              cx="70"
              cy="70"
              r="60"
              fill="none"
              stroke={levelInfo.color}
              strokeWidth="12"
              strokeDasharray={`${(focusData.score / 100) * 377} 377`}
              strokeLinecap="round"
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          </svg>
          <div className="focus-score-center">
            <div className="focus-score-value">{focusData.score}</div>
            <div className="focus-score-level" style={{ color: levelInfo.color }}>
              {levelInfo.emoji} {levelInfo.text}
            </div>
          </div>
        </div>

        {/* 详细指标 */}
        <div className="focus-metrics">
          <div className="focus-metric-item">
            <span className="metric-label">平均时长</span>
            <span className="metric-value">{focusData.avgEventDuration.toFixed(0)}分钟</span>
          </div>
          <div className="focus-metric-item">
            <span className="metric-label">碎片化率</span>
            <span className="metric-value">{(focusData.fragmentationRate * 100).toFixed(0)}%</span>
          </div>
          <div className="focus-metric-item">
            <span className="metric-label">长事件</span>
            <span className="metric-value">{focusData.longEventCount}个</span>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
};
