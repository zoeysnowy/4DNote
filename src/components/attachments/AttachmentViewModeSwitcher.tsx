import React from 'react';
import { AttachmentType, AttachmentViewMode } from '@frontend/types';

interface AttachmentViewModeSwitcherProps {
  currentMode: AttachmentViewMode;
  availableTypes: AttachmentType[];
  onModeChange: (mode: AttachmentViewMode) => void;
  className?: string;
}

/**
 * 查看模式按钮配置
 */
const VIEW_MODE_BUTTONS = [
  {
    mode: AttachmentViewMode.EDITOR,
    icon: '✏️',
    label: '编辑器',
    description: '富文本编辑模式',
    types: '*', // 所有类型都支持
  },
  {
    mode: AttachmentViewMode.GALLERY,
    icon: '🖼️',
    label: '图册',
    description: '图片墙、轮播',
    types: [AttachmentType.IMAGE],
  },
  {
    mode: AttachmentViewMode.VIDEO_STREAM,
    icon: '🎥',
    label: '视频流',
    description: '视频墙、连续播放',
    types: [AttachmentType.VIDEO],
  },
  {
    mode: AttachmentViewMode.AUDIO_STREAM,
    icon: '🎵',
    label: '音频流',
    description: '播客模式、波形',
    types: [AttachmentType.AUDIO],
  },
  {
    mode: AttachmentViewMode.TRANSCRIPT,
    icon: '🎤',
    label: '转录',
    description: 'AI 转录 + 用户编辑',
    types: [AttachmentType.VOICE_RECORDING],
  },
  {
    mode: AttachmentViewMode.DOCUMENT_LIB,
    icon: '📄',
    label: '文档库',
    description: 'PDF 预览、OCR 搜索',
    types: [AttachmentType.DOCUMENT],
  },
  {
    mode: AttachmentViewMode.TREE_NAV,
    icon: '🌲',
    label: '树状导航',
    description: 'EventTree 层级',
    types: [AttachmentType.SUB_EVENT],
  },
  {
    mode: AttachmentViewMode.BOOKMARK,
    icon: '📺',
    label: '书签',
    description: '网页收藏、离线阅读',
    types: [AttachmentType.WEB_CLIP],
  },
] as const;

/**
 * 附件查看模式切换器
 * 
 * 根据当前 EventLog 中的附件类型，显示可用的查看模式按钮
 * 
 * @example
 * ```tsx
 * <AttachmentViewModeSwitcher
 *   currentMode={AttachmentViewMode.GALLERY}
 *   availableTypes={[AttachmentType.IMAGE, AttachmentType.VIDEO]}
 *   onModeChange={setViewMode}
 * />
 * ```
 */
export const AttachmentViewModeSwitcher: React.FC<AttachmentViewModeSwitcherProps> = ({
  currentMode,
  availableTypes,
  onModeChange,
  className = '',
}) => {
  /**
   * 检查某个查看模式是否可用
   */
  const isModeAvailable = (button: typeof VIEW_MODE_BUTTONS[number]): boolean => {
    // 编辑器模式始终可用
    if (button.types === '*') {
      return true;
    }

    // 检查是否有对应类型的附件
    return button.types.some((type) => availableTypes.includes(type));
  };

  /**
   * 获取可用的查看模式按钮
   */
  const availableButtons = VIEW_MODE_BUTTONS.filter(isModeAvailable);

  /**
   * 如果只有编辑器模式可用，不显示切换器
   */
  if (availableButtons.length <= 1) {
    return null;
  }

  return (
    <div className={`attachment-view-mode-switcher ${className}`}>
      <div className="mode-buttons">
        {availableButtons.map((button) => (
          <button
            key={button.mode}
            className={`mode-button ${currentMode === button.mode ? 'active' : ''}`}
            onClick={() => onModeChange(button.mode)}
            title={button.description}
            aria-label={`切换到${button.label}模式`}
          >
            <span className="mode-icon">{button.icon}</span>
            <span className="mode-label">{button.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        .attachment-view-mode-switcher {
          padding: 12px 16px;
          background: var(--bg-secondary, #f5f5f5);
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }

        .mode-buttons {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: thin;
        }

        .mode-buttons::-webkit-scrollbar {
          height: 4px;
        }

        .mode-buttons::-webkit-scrollbar-thumb {
          background: var(--scrollbar-color, #ccc);
          border-radius: 2px;
        }

        .mode-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 8px;
          background: white;
          color: var(--text-primary, #333);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          user-select: none;
        }

        .mode-button:hover {
          background: var(--bg-hover, #f0f0f0);
          border-color: var(--border-hover, #b0b0b0);
          transform: translateY(-1px);
        }

        .mode-button.active {
          background: var(--primary-color, #007bff);
          color: white;
          border-color: var(--primary-color, #007bff);
          box-shadow: 0 2px 4px rgba(0, 123, 255, 0.2);
        }

        .mode-button:active {
          transform: translateY(0);
        }

        .mode-icon {
          font-size: 16px;
          line-height: 1;
        }

        .mode-label {
          font-size: 13px;
        }

        @media (max-width: 768px) {
          .mode-button {
            padding: 6px 10px;
          }

          .mode-label {
            display: none;
          }

          .mode-icon {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
};

export default AttachmentViewModeSwitcher;
