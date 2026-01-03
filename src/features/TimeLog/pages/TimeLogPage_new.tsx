/**
 * TimeLog Page - UI Implementation (Based on Figma Design)
 * Node ID: 486-2661
 * 
 * 严格按照 Figma 设计实现 UI，暂不集成数据和功能
 */

import React from 'react';
import './TimeLogPage_new.css';
import { GlassIconBar } from '@frontend/components/shared/GlassIconBar';

const TimeLog_new: React.FC = () => {
  return (
    <div className="timelog-page-new">
      {/* 时光日志主容器 */}
      <div className="timelog-main-container">
        {/* 右侧毛玻璃操作栏 */}
        <GlassIconBar onAction={(id) => {
          // TODO: integrate with actual handlers (record, upload, etc.)
          console.log('[GlassIconBar] action:', id);
        }} />
        {/* 标题区 */}
        <div className="timelog-header-section">
          <div className="timelog-header-border">
            <div className="timelog-gradient-bar"></div>
            <h1 className="timelog-title">时光日志</h1>
          </div>
        </div>

        {/* 日期显示区 */}
        <div className="timelog-date-display">
          <p className="timelog-date-text">2025.10.18（周六）</p>
        </div>

        {/* Event 卡片 1 */}
        <div className="event-card-new">
          {/* 时间轴线条 */}
          <div className="event-timeline-line"></div>

          {/* 时间标签 */}
          <div className="event-time-label">
            <div className="event-time-icons">
              <span className="event-icon-calendar">📅</span>
              <span className="event-icon-clock">⏰</span>
            </div>
            <span className="event-time-text">10:00 — 12:00</span>
          </div>

          {/* 时间箭头 */}
          <div className="event-time-arrow">
            <span className="event-duration-badge">2h30min</span>
          </div>

          {/* 卡片内容 */}
          <div className="event-card-content">
            {/* 标题 */}
            <h3 className="event-title">
              <span className="event-emoji">🎙️</span>
              议程讨论
            </h3>

            {/* 参会人员 */}
            <div className="event-attendees">
              <span className="attendee-icon">👥</span>
              <span className="attendee-text">Zoey Gong; Jenny Wong; Cindy Cai</span>
            </div>

            {/* 地点 */}
            <div className="event-location">
              <span className="location-icon">📍</span>
              <span className="location-text">静安嘉里中心2座F38，RM工作室，5号会议室</span>
            </div>

            {/* 标签 */}
            <div className="event-tags">
              <span className="event-tag tag-green">#👜工作/#🧐文档编辑</span>
              <span className="event-tag tag-orange">#👜重点客户/#🧐腾讯</span>
            </div>

            {/* 来源信息 */}
            <div className="event-source">
              <span className="source-label">来自</span>
              <span className="source-name">Outlook: 默认</span>
              <span className="source-status"></span>
              <span className="source-sync">只接收同步</span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="event-actions">
            <button className="event-action-btn btn-favorite">⭐</button>
            <button className="event-action-btn btn-expand">›</button>
          </div>
        </div>

        {/* 日志时间戳 */}
        <div className="event-log-timestamp">
          <button className="timestamp-toggle">▸</button>
          <span className="timestamp-time">2025-10-19 10:35:18</span>
          <button className="timestamp-options">⊙</button>
        </div>

        {/* 日志内容 */}
        <div className="event-log-content">
          <p>太强了！居然直接成稿了，那现在就只要做些检查了</p>
          <p>感觉主要是一些流程和逻辑错误，语言上没有太多可以修缮的，文采比我好太多了QUQ</p>
        </div>

        {/* Event 卡片 2 */}
        <div className="event-card-new">
          {/* 时间轴线条 */}
          <div className="event-timeline-line"></div>

          {/* 时间标签 */}
          <div className="event-time-label">
            <div className="event-time-icons">
              <span className="event-icon-calendar">📅</span>
              <span className="event-icon-clock">✅</span>
            </div>
            <span className="event-time-text">10:00 — 12:00</span>
          </div>

          {/* 时间箭头 */}
          <div className="event-time-arrow">
            <span className="event-duration-badge">2h30min</span>
          </div>

          {/* 卡片内容 */}
          <div className="event-card-content">
            {/* 标题 */}
            <h3 className="event-title">
              <span className="event-emoji">🎓</span>
              准备演讲稿
            </h3>

            {/* 标签 */}
            <div className="event-tags">
              <span className="event-tag tag-green">#👜工作/#🧐文档编辑</span>
              <span className="event-tag tag-orange">#👜重点客户/#🧐腾讯</span>
            </div>

            {/* 任务信息 */}
            <div className="event-task-info">
              <span className="task-icon">📋</span>
              <span className="task-meta">创建于12h前，距离ddl还有2h30min</span>
            </div>

            {/* 关联任务 */}
            <div className="event-related-tasks">
              <span className="link-icon">🔗</span>
              <span className="related-text">上级任务：Project Ace，同级任务已完成5/7，点击查看和修改任务群</span>
            </div>

            {/* 来源信息 */}
            <div className="event-source">
              <span className="source-label">同步</span>
              <span className="source-name">Outlook: 工作等</span>
              <span className="source-status active"></span>
              <span className="source-sync">双向同步</span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="event-actions">
            <button className="event-action-btn btn-favorite">⭐</button>
            <button className="event-action-btn btn-expand">›</button>
            <button className="event-action-btn btn-more">…</button>
          </div>
        </div>

        {/* 日志时间戳 */}
        <div className="event-log-timestamp">
          <button className="timestamp-toggle">▸</button>
          <span className="timestamp-time">2025-10-19 10:21:18</span>
          <button className="timestamp-options">⊙</button>
        </div>

        {/* 日志内容 */}
        <div className="event-log-content">
          <p>处理完了一些出差的logistics，还有报销整理，现在终于可以开干了！</p>
          <p>准备先一个提纲丢给GPT，看看情况</p>
        </div>

        {/* 月份分隔 - 2025.10 */}
        <div className="month-divider">
          <div className="month-year">2025</div>
          <div className="month-number">10</div>
          <div className="month-calendar">
            <div className="calendar-week">
              <span className="calendar-day">日<br/>19</span>
              <span className="calendar-day">一<br/>20</span>
              <span className="calendar-day">二<br/>21</span>
              <span className="calendar-day">三<br/>22</span>
              <span className="calendar-day">四<br/>23</span>
              <span className="calendar-day">五<br/>24</span>
              <span className="calendar-day">六<br/>25</span>
              <span className="calendar-day">日<br/>26</span>
              <span className="calendar-day">一<br/>27</span>
              <span className="calendar-day">二<br/>28</span>
            </div>
          </div>
        </div>

        {/* 月份分隔 - 2025.11 */}
        <div className="month-divider">
          <div className="month-year">2025</div>
          <div className="month-number">11</div>
          <div className="month-calendar">
            <div className="calendar-week">
              <span className="calendar-day">六<br/>1</span>
              <span className="calendar-day">日<br/>2</span>
              <span className="calendar-day">一<br/>3</span>
              <span className="calendar-day">二<br/>4</span>
              <span className="calendar-day">三<br/>5</span>
              <span className="calendar-day">四<br/>6</span>
              <span className="calendar-day">五<br/>7</span>
              <span className="calendar-day">六<br/>8</span>
              <span className="calendar-day">日<br/>9</span>
              <span className="calendar-day">一<br/>10</span>
            </div>
          </div>
        </div>

        {/* 日期显示区 */}
        <div className="timelog-date-display">
          <p className="timelog-date-text">2025.11.12（周三）</p>
        </div>
      </div>
    </div>
  );
};

export default TimeLog_new;
