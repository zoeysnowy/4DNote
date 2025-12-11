/**
 * TimestampDividerElement - 时间戳分隔线组件
 * TimelineEntryElement - 时间轴条目容器组件
 * 
 * 用于 EventLog 中显示编辑时间的分隔线和内容
 * 按照 TimeLog PRD 的样式规范渲染
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import React from 'react';
import { RenderElementProps } from 'slate-react';
import { TimestampDividerElement as TimestampDividerType, TimelineSegmentElement as TimelineSegmentType } from './types';


export const TimestampDividerElement: React.FC<RenderElementProps> = ({ attributes, children, element }) => {
  const node = element as TimestampDividerType;
  
  return (
    <div
      {...attributes}
      contentEditable={false}
      className="timestamp-divider"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        margin: '12px 0 8px 0',
        paddingLeft: '20px',
        userSelect: 'none'
      }}
    >
      {/* 左侧竖线标识 */}
      <div
        contentEditable={false}
        style={{
          position: 'absolute',
          left: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '3px',
          height: '12px',
          background: '#a855f7',
          borderRadius: '2px',
          pointerEvents: 'none'
        }}
      />
      
      {/* 时间戳文本 */}
      <span 
        className="timestamp-text"
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: '#6b7280',
          whiteSpace: 'nowrap',
          position: 'relative',
          zIndex: 1
        }}
      >
        ▸ {node.displayText || new Date(node.timestamp).toLocaleString()}
      </span>
      
      {children}
    </div>
  );
};

// TimelineSegmentElement removed - using simpler timestamp approach to prevent path resolution issues
