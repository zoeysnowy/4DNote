import React from 'react';
import './PageContainer.css';

interface PageContainerProps {
  title?: string;  /* 保留以兼容现有调用，但不再显示 */
  subtitle?: string;  /* 保留以兼容现有调用，但不再显示 */
  children: React.ReactNode;
  className?: string;
}

const PageContainer: React.FC<PageContainerProps> = ({ 
  title, 
  subtitle, 
  children, 
  className = '' 
}) => {
  return (
    <div className={`page-container ${className}`}>
      {/* 移除page-header，直接显示内容 - section-header已包含模块标题 */}
      <div className="page-content">
        {children}
      </div>
    </div>
  );
};

export default PageContainer;