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
        marginBottom: '0',
        paddingTop: '8px',
        paddingBottom: '4px',
        paddingLeft: '20px',
        opacity: 0.7,
        userSelect: 'none'
      }}
    >
      {/* timestamp 不绘制 preline，由后续段落向上连接 */}
      
      {/* 时间戳文本 - 纯文字样式 */}
      <span 
        className="timestamp-text"
        style={{
          fontSize: '12px',
          color: '#999',
          whiteSpace: 'nowrap',
          position: 'relative',
          zIndex: 1
        }}
      >
        {node.displayText || new Date(node.timestamp).toLocaleString()}
      </span>

      {children}
    </div>
  );
};

// TimelineSegmentElement removed - using simpler timestamp approach to prevent path resolution issues
