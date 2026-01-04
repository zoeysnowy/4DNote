/**
 * MentionPreview - @提及预览组件
 * 实时解析自然语言，显示时间解析结果
 */

import React from 'react';
import { formatRelativeDate } from '@frontend/utils/relativeDateFormatter';
import './MentionPreview.css';

export interface MentionPreviewProps {
  /** 解析的开始时间 */
  startTime: Date;
  /** 解析的结束时间 */
  endTime?: Date;
  /** 是否是全天事件 */
  isAllDay?: boolean;
  /** 是否是模糊时间 */
  isFuzzyTime?: boolean;
  /** 原始输入文本 */
  rawText: string;
  /** 位置（相对于光标） */
  position: { top: number; left: number };
  /** Enter确认回调 */
  onConfirm: () => void;
  /** Escape取消回调 */
  onCancel: () => void;
}

/**
 * @提及预览浮窗
 * 显示在光标下方，展示时间解析结果
 */
export const MentionPreview: React.FC<MentionPreviewProps> = ({
  startTime,
  endTime,
  isAllDay,
  isFuzzyTime,
  rawText,
  position,
  onConfirm,
  onCancel,
}) => {
  // 格式化显示时间
  const displayText = formatRelativeDate(startTime, new Date());
  
  // 处理键盘事件
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onConfirm, onCancel]);

  return (
    <div
      className="mention-preview"
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        zIndex: 1000,
      }}
    >
      <div className="mention-preview-content">
        <div className="mention-preview-icon">📅</div>
        <div className="mention-preview-text">
          <div className="mention-preview-display">{displayText}</div>
          <div className="mention-preview-raw">{rawText}</div>
        </div>
      </div>
      <div className="mention-preview-hint">
        <kbd>Enter</kbd> 确认 · <kbd>Esc</kbd> 取消
      </div>
    </div>
  );
};
