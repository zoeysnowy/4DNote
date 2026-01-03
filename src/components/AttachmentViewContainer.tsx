import React, { useState, useEffect } from 'react';
import { Attachment, AttachmentType, AttachmentViewMode } from '../types';
import { AttachmentViewModeSwitcher } from './AttachmentViewModeSwitcher';
import { GalleryView } from './GalleryView';
import { VideoStreamView } from './VideoStreamView';
import { AudioStreamView } from './AudioStreamView';
import { TranscriptView } from './TranscriptView';
import { DocumentLibView } from './DocumentLibView';
import { TreeNavigationView } from './TreeNavigationView';
import { BookmarkView } from './BookmarkView';

interface AttachmentViewContainerProps {
  eventId: string;
  attachments: Attachment[];
  initialMode?: AttachmentViewMode;
  onAttachmentClick?: (attachment: Attachment, index: number) => void;
  onAttachmentUpdate?: (attachmentId: string, updates: Partial<Attachment>) => void;
  onAttachmentDelete?: (attachmentId: string) => void;
  onTranscriptUpdate?: (attachmentId: string, editedSummary: string) => void;
  onNavigate?: (targetEventId: string) => void;
  className?: string;
}

/**
 * 附件查看主容器
 * 
 * 功能：
 * - 统一管理所有附件查看模式
 * - 自动检测可用模式（基于附件类型）
 * - 模式切换逻辑
 * - 附件操作（更新、删除）
 * 
 * @example
 * ```tsx
 * <AttachmentViewContainer
 *   eventId="event-123"
 *   attachments={event.eventlog.attachments}
 *   initialMode={AttachmentViewMode.EDITOR}
 *   onAttachmentDelete={handleDelete}
 * />
 * ```
 */
export const AttachmentViewContainer: React.FC<AttachmentViewContainerProps> = ({
  eventId,
  attachments,
  initialMode = AttachmentViewMode.EDITOR,
  onAttachmentClick,
  onAttachmentUpdate,
  onAttachmentDelete,
  onTranscriptUpdate,
  onNavigate,
  className = '',
}) => {
  const [currentMode, setCurrentMode] = useState<AttachmentViewMode>(initialMode);
  const [availableTypes, setAvailableTypes] = useState<AttachmentType[]>([]);

  /**
   * 检测可用的附件类型
   */
  useEffect(() => {
    const types = new Set<AttachmentType>();
    attachments.forEach((att) => {
      types.add(att.type);
    });
    setAvailableTypes(Array.from(types));
  }, [attachments]);

  /**
   * 处理模式切换
   */
  const handleModeChange = (mode: AttachmentViewMode) => {
    setCurrentMode(mode);
  };

  /**
   * 处理附件点击
   */
  const handleAttachmentClick = (attachment: Attachment, index: number) => {
    onAttachmentClick?.(attachment, index);
  };

  /**
   * 处理附件删除
   */
  const handleAttachmentDelete = (attachmentId: string) => {
    onAttachmentDelete?.(attachmentId);
  };

  /**
   * 处理转录更新
   */
  const handleTranscriptUpdate = (attachmentId: string, editedSummary: string) => {
    if (onTranscriptUpdate) {
      onTranscriptUpdate(attachmentId, editedSummary);
    } else if (onAttachmentUpdate) {
      // 如果没有提供专门的转录更新回调，使用通用更新
      onAttachmentUpdate(attachmentId, {
        transcriptData: {
          ...(attachments.find((a) => a.id === attachmentId)?.transcriptData || {}),
          editedSummary,
          status: 'completed',
        } as any,
      });
    }
  };

  /**
   * 处理导航
   */
  const handleNavigate = (targetEventId: string) => {
    onNavigate?.(targetEventId);
  };

  /**
   * 渲染当前模式的视图
   */
  const renderCurrentView = () => {
    switch (currentMode) {
      case AttachmentViewMode.GALLERY:
        return (
          <GalleryView
            eventId={eventId}
            attachments={attachments}
            onAttachmentClick={handleAttachmentClick}
            onDelete={handleAttachmentDelete}
            layout="grid"
          />
        );

      case AttachmentViewMode.VIDEO_STREAM:
        return (
          <VideoStreamView
            eventId={eventId}
            attachments={attachments}
            onAttachmentClick={handleAttachmentClick}
            onDelete={handleAttachmentDelete}
            layout="grid"
            autoplay={false}
          />
        );

      case AttachmentViewMode.AUDIO_STREAM:
        return (
          <AudioStreamView
            eventId={eventId}
            attachments={attachments}
            onAttachmentClick={handleAttachmentClick}
            onDelete={handleAttachmentDelete}
            layout="podcast"
            autoplay={false}
          />
        );

      case AttachmentViewMode.TRANSCRIPT:
        return (
          <TranscriptView
            eventId={eventId}
            attachments={attachments}
            onTranscriptUpdate={handleTranscriptUpdate}
            onDelete={handleAttachmentDelete}
          />
        );

      case AttachmentViewMode.DOCUMENT_LIB:
        return (
          <DocumentLibView
            eventId={eventId}
            attachments={attachments}
            onAttachmentClick={handleAttachmentClick}
            onDelete={handleAttachmentDelete}
            layout="grid"
          />
        );

      case AttachmentViewMode.TREE_NAV:
        return (
          <TreeNavigationView
            eventId={eventId}
            attachments={attachments}
            onAttachmentClick={handleAttachmentClick}
            onNavigate={handleNavigate}
            onDelete={handleAttachmentDelete}
            layout="tree"
          />
        );

      case AttachmentViewMode.BOOKMARK:
        return (
          <BookmarkView
            eventId={eventId}
            attachments={attachments}
            onAttachmentClick={handleAttachmentClick}
            onDelete={handleAttachmentDelete}
            layout="cards"
          />
        );

      case AttachmentViewMode.EDITOR:
      default:
        return (
          <div className="editor-view-placeholder">
            <div className="placeholder-content">
              <div className="placeholder-icon">✏️</div>
              <h3>编辑器模式</h3>
              <p>此模式下显示 Slate.js 富文本编辑器</p>
              <p className="placeholder-note">
                编辑器集成待完成，请暂时使用其他查看模式
              </p>
              {availableTypes.length > 0 && (
                <div className="available-modes">
                  <p>当前可用的查看模式：</p>
                  <ul>
                    {availableTypes.includes(AttachmentType.IMAGE) && (
                      <li>🖼️ 图册模式</li>
                    )}
                    {availableTypes.includes(AttachmentType.VIDEO) && (
                      <li>🎥 视频流模式</li>
                    )}
                    {availableTypes.includes(AttachmentType.AUDIO) && (
                      <li>🎵 音频流模式</li>
                    )}
                    {availableTypes.includes(AttachmentType.VOICE_RECORDING) && (
                      <li>🎤 转录模式</li>
                    )}
                    {availableTypes.includes(AttachmentType.DOCUMENT) && (
                      <li>📄 文档库模式</li>
                    )}
                    {availableTypes.includes(AttachmentType.SUB_EVENT) && (
                      <li>🌳 树形导航模式</li>
                    )}
                    {availableTypes.includes(AttachmentType.WEB_CLIP) && (
                      <li>🔖 书签模式</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  /**
   * 空状态
   */
  if (!attachments || attachments.length === 0) {
    return (
      <div className="attachment-view-container-empty">
        <div className="empty-content">
          <div className="empty-icon">📎</div>
          <h3>暂无附件</h3>
          <p>为此事件添加图片、视频、音频或文档</p>
        </div>

        <style>{`
          .attachment-view-container-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 400px;
            background: var(--bg-secondary, #f5f5f5);
            border-radius: 12px;
          }

          .empty-content {
            text-align: center;
            color: var(--text-secondary, #888);
          }

          .empty-icon {
            font-size: 64px;
            margin-bottom: 16px;
            opacity: 0.5;
          }

          .empty-content h3 {
            margin: 0 0 8px 0;
            font-size: 18px;
            color: var(--text-primary, #333);
          }

          .empty-content p {
            margin: 0;
            font-size: 14px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`attachment-view-container ${className}`}>
      {/* 模式切换器 */}
      <div className="mode-switcher-wrapper">
        <AttachmentViewModeSwitcher
          currentMode={currentMode}
          availableTypes={availableTypes}
          onModeChange={handleModeChange}
        />
      </div>

      {/* 内容区域 */}
      <div className="view-content-wrapper">
        {renderCurrentView()}
      </div>

      <style>{`
        .attachment-view-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary, white);
        }

        .mode-switcher-wrapper {
          padding: 16px 24px;
          background: var(--bg-secondary, #f5f5f5);
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }

        .view-content-wrapper {
          flex: 1;
          overflow: hidden;
        }

        /* 编辑器占位符 */
        .editor-view-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 40px 20px;
        }

        .placeholder-content {
          text-align: center;
          max-width: 500px;
        }

        .placeholder-icon {
          font-size: 64px;
          margin-bottom: 24px;
        }

        .placeholder-content h3 {
          margin: 0 0 12px 0;
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary, #333);
        }

        .placeholder-content p {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: var(--text-secondary, #666);
          line-height: 1.6;
        }

        .placeholder-note {
          padding: 12px 16px;
          background: #fff3cd;
          border-left: 3px solid #ffc107;
          border-radius: 6px;
          margin: 16px 0;
          color: #856404;
        }

        .available-modes {
          margin-top: 24px;
          padding: 20px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 12px;
          text-align: left;
        }

        .available-modes p {
          margin: 0 0 12px 0;
          font-weight: 600;
          color: var(--text-primary, #333);
        }

        .available-modes ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .available-modes li {
          padding: 8px 0;
          font-size: 14px;
          color: var(--text-secondary, #666);
        }

        @media (max-width: 768px) {
          .mode-switcher-wrapper {
            padding: 12px 16px;
          }

          .placeholder-content {
            padding: 20px;
          }

          .placeholder-icon {
            font-size: 48px;
          }
        }
      `}</style>
    </div>
  );
};

export default AttachmentViewContainer;
