import React from 'react';
import './DashboardCard.css';

export interface DashboardCardProps {
  /** 卡片标题 */
  title: string;
  /** 卡片图标 */
  icon?: string;
  /** 卡片操作按钮 */
  actions?: React.ReactNode;
  /** 卡片内容 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 是否加载中 */
  loading?: boolean;
  /** 卡片高度模式 */
  heightMode?: 'auto' | 'full' | 'compact';
}

/**
 * DashboardCard - 通用卡片容器组件
 * 
 * 功能：
 * 1. 统一的卡片样式和布局
 * 2. 支持标题、图标、操作按钮
 * 3. 支持加载状态
 * 4. 支持多种高度模式
 */
export const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  icon,
  actions,
  children,
  className = '',
  loading = false,
  heightMode = 'auto'
}) => {
  return (
    <div className={`dashboard-card dashboard-card--${heightMode} ${className}`}>
      {/* 卡片头部 */}
      <div className="dashboard-card__header">
        <div className="dashboard-card__title">
          {icon && <span className="dashboard-card__icon">{icon}</span>}
          <h3>{title}</h3>
        </div>
        {actions && (
          <div className="dashboard-card__actions">
            {actions}
          </div>
        )}
      </div>

      {/* 卡片内容 */}
      <div className="dashboard-card__body">
        {loading ? (
          <div className="dashboard-card__loading">
            <div className="spinner"></div>
            <p>加载中...</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};
