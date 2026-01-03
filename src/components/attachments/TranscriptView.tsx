import React, { useState, useEffect, useRef } from 'react';
import { Attachment, AttachmentType, TranscriptData } from '@frontend/types';

interface TranscriptViewProps {
  eventId: string;
  attachments: Attachment[];
  onTranscriptUpdate?: (attachmentId: string, editedSummary: string) => void;
  onDelete?: (attachmentId: string) => void;
  className?: string;
}

/**
 * 转录查看组件
 * 
 * 功能：
 * - 显示 AI 生成的转录文本
 * - 用户可编辑转录摘要
 * - 分段显示（时间戳 + 文本 + 说话人）
 * - 关键要点和行动项
 * - 音频同步播放（点击文本跳转）
 * 
 * @example
 * ```tsx
 * <TranscriptView
 *   eventId="event-123"
 *   attachments={voiceAttachments}
 *   onTranscriptUpdate={handleUpdate}
 * />
 * ```
 */
export const TranscriptView: React.FC<TranscriptViewProps> = ({
  eventId,
  attachments,
  onTranscriptUpdate,
  onDelete,
  className = '',
}) => {
  const [voiceRecordings, setVoiceRecordings] = useState<Attachment[]>([]);
  const [currentAttachmentId, setCurrentAttachmentId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [audioPaths, setAudioPaths] = useState<Map<string, string>>(new Map());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  /**
   * 过滤语音记录类型附件
   */
  useEffect(() => {
    const recordings = attachments.filter((att) => att.type === AttachmentType.VOICE_RECORDING);
    setVoiceRecordings(recordings);
    
    if (recordings.length > 0 && !currentAttachmentId) {
      setCurrentAttachmentId(recordings[0].id);
    }
  }, [attachments]);

  /**
   * 加载音频路径
   */
  useEffect(() => {
    const loadAudioPaths = async () => {
      const paths = new Map<string, string>();

      for (const recording of voiceRecordings) {
        try {
          const result = await (window as any).electronAPI?.invoke('attachment:getPath', recording.id);
          if (result?.success && result.path) {
            paths.set(recording.id, `file://${result.path}`);
          }
        } catch (error) {
          console.error('Failed to load audio path:', recording.id, error);
        }
      }

      setAudioPaths(paths);
    };

    if (voiceRecordings.length > 0) {
      loadAudioPaths();
    }
  }, [voiceRecordings]);

  /**
   * 获取当前转录数据
   */
  const getCurrentTranscript = (): TranscriptData | null => {
    const current = voiceRecordings.find((r) => r.id === currentAttachmentId);
    return current?.transcriptData || null;
  };

  /**
   * 切换编辑模式
   */
  const toggleEditMode = () => {
    if (!editMode) {
      const transcript = getCurrentTranscript();
      setEditedSummary(transcript?.editedSummary || transcript?.aiSummary || '');
    }
    setEditMode(!editMode);
  };

  /**
   * 保存编辑
   */
  const saveEdit = () => {
    if (currentAttachmentId && editedSummary.trim()) {
      onTranscriptUpdate?.(currentAttachmentId, editedSummary);
      setEditMode(false);
    }
  };

  /**
   * 取消编辑
   */
  const cancelEdit = () => {
    setEditMode(false);
    setEditedSummary('');
  };

  /**
   * 播放/暂停音频
   */
  const toggleAudioPlay = () => {
    if (!audioRef.current) return;

    if (audioRef.current.paused) {
      audioRef.current.play();
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  /**
   * 跳转到指定时间点
   */
  const seekToTime = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  /**
   * 点击分段文本跳转
   */
  const handleSegmentClick = (startTime: number, index: number) => {
    seekToTime(startTime);
    setCurrentSegmentIndex(index);
  };

  /**
   * 音频时间更新
   */
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;

    const transcript = getCurrentTranscript();
    if (!transcript?.segments) return;

    const currentTime = audioRef.current.currentTime;
    
    // 查找当前播放的段落
    const index = transcript.segments.findIndex(
      (seg) => seg.start <= currentTime && seg.end >= currentTime
    );

    if (index !== -1) {
      setCurrentSegmentIndex(index);
    }
  };

  /**
   * 格式化时间
   */
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * 删除语音记录
   */
  const handleDelete = (attachmentId: string) => {
    if (!confirm('确定要删除这条语音记录吗？')) return;
    onDelete?.(attachmentId);
  };

  /**
   * 渲染转录状态
   */
  const renderTranscriptStatus = (transcript: TranscriptData | null) => {
    if (!transcript) {
      return <div className="status-badge status-none">未转录</div>;
    }

    switch (transcript.status) {
      case 'processing':
        return <div className="status-badge status-processing">⏳ 转录中...</div>;
      case 'completed':
        return <div className="status-badge status-completed">✅ 已完成</div>;
      case 'failed':
        return <div className="status-badge status-failed">❌ 失败</div>;
      default:
        return null;
    }
  };

  /**
   * 空状态
   */
  if (voiceRecordings.length === 0) {
    return (
      <div className="transcript-view-empty">
        <div className="empty-icon">🎤</div>
        <p>暂无语音记录</p>
      </div>
    );
  }

  const currentRecording = voiceRecordings.find((r) => r.id === currentAttachmentId);
  const transcript = getCurrentTranscript();
  const audioPath = currentRecording ? audioPaths.get(currentRecording.id) : null;

  return (
    <div className={`transcript-view ${className}`}>
      {/* 音频播放器 */}
      {audioPath && (
        <audio
          ref={audioRef}
          src={audioPath}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div className="transcript-layout">
        {/* 左侧：转录列表 */}
        <div className="transcript-sidebar">
          <h3>语音记录列表</h3>
          <div className="recording-list">
            {voiceRecordings.map((recording) => (
              <div
                key={recording.id}
                className={`recording-item ${recording.id === currentAttachmentId ? 'active' : ''}`}
                onClick={() => setCurrentAttachmentId(recording.id)}
              >
                <div className="recording-icon">🎤</div>
                <div className="recording-info">
                  <div className="recording-title">{recording.caption || recording.filename}</div>
                  <div className="recording-meta">
                    {recording.timestamp && (
                      <span>{new Date(recording.timestamp).toLocaleDateString('zh-CN')}</span>
                    )}
                    <span>{formatTime(recording.duration || 0)}</span>
                  </div>
                </div>
                {renderTranscriptStatus(recording.transcriptData || null)}
                {onDelete && (
                  <button
                    className="delete-button-mini"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(recording.id);
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：转录内容 */}
        <div className="transcript-content">
          {!transcript || transcript.status === 'processing' ? (
            <div className="transcript-loading">
              <div className="loading-spinner">⏳</div>
              <p>AI 转录处理中，请稍候...</p>
              <p className="loading-note">通常需要 30 秒到 2 分钟</p>
            </div>
          ) : transcript.status === 'failed' ? (
            <div className="transcript-error">
              <div className="error-icon">❌</div>
              <p>转录失败</p>
              <button className="retry-button">重试</button>
            </div>
          ) : (
            <>
              {/* 音频控件 */}
              <div className="audio-controls">
                <button className="control-button" onClick={toggleAudioPlay}>
                  {isPlaying ? '⏸ 暂停' : '▶ 播放'}
                </button>
                <div className="audio-info">
                  <span>{currentRecording?.caption || currentRecording?.filename}</span>
                  <span>{formatTime(currentRecording?.duration || 0)}</span>
                </div>
              </div>

              {/* AI 摘要 */}
              <div className="summary-section">
                <div className="section-header">
                  <h3>📝 摘要</h3>
                  {!editMode && (
                    <button className="edit-button" onClick={toggleEditMode}>
                      ✏️ 编辑
                    </button>
                  )}
                </div>

                {editMode ? (
                  <div className="summary-editor">
                    <textarea
                      className="summary-textarea"
                      value={editedSummary}
                      onChange={(e) => setEditedSummary(e.target.value)}
                      placeholder="输入编辑后的摘要..."
                      rows={6}
                    />
                    <div className="editor-actions">
                      <button className="save-button" onClick={saveEdit}>
                        💾 保存
                      </button>
                      <button className="cancel-button" onClick={cancelEdit}>
                        ❌ 取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="summary-display">
                    <p>{transcript.editedSummary || transcript.aiSummary || '暂无摘要'}</p>
                    {transcript.editedSummary && transcript.aiSummary && (
                      <div className="ai-note">
                        <span>💡 AI 原始摘要: {transcript.aiSummary}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 关键要点 */}
              {transcript.keyPoints && transcript.keyPoints.length > 0 && (
                <div className="key-points-section">
                  <h3>🔑 关键要点</h3>
                  <ul className="key-points-list">
                    {transcript.keyPoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 行动项 */}
              {transcript.actionItems && transcript.actionItems.length > 0 && (
                <div className="action-items-section">
                  <h3>✅ 行动项</h3>
                  <ul className="action-items-list">
                    {transcript.actionItems.map((item, index) => (
                      <li key={index}>
                        <input type="checkbox" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 完整转录文本（分段） */}
              <div className="segments-section">
                <h3>📄 完整转录</h3>
                <div className="segments-list">
                  {transcript.segments && transcript.segments.length > 0 ? (
                    transcript.segments.map((segment, index) => (
                      <div
                        key={index}
                        className={`segment-item ${index === currentSegmentIndex ? 'active' : ''}`}
                        onClick={() => handleSegmentClick(segment.start, index)}
                      >
                        <div className="segment-time">{formatTime(segment.start)}</div>
                        <div className="segment-content">
                          {segment.speaker && <span className="speaker-label">{segment.speaker}:</span>}
                          <span className="segment-text">{segment.text}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="raw-transcript">
                      <p>{transcript.rawTranscript}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        .transcript-view {
          height: 100%;
          background: var(--bg-primary, white);
        }

        .transcript-layout {
          display: flex;
          height: 100%;
          gap: 0;
        }

        /* 左侧边栏 */
        .transcript-sidebar {
          width: 300px;
          background: var(--bg-secondary, #f5f5f5);
          border-right: 1px solid var(--border-color, #e0e0e0);
          padding: 20px;
          overflow-y: auto;
        }

        .transcript-sidebar h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .recording-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .recording-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: white;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .recording-item:hover {
          background: var(--bg-hover, #e8e8e8);
          transform: translateX(4px);
        }

        .recording-item.active {
          background: var(--primary-color, #007bff);
          color: white;
          box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
        }

        .recording-icon {
          font-size: 24px;
          width: 32px;
          text-align: center;
        }

        .recording-info {
          flex: 1;
          min-width: 0;
        }

        .recording-title {
          font-size: 14px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-bottom: 4px;
        }

        .recording-meta {
          display: flex;
          gap: 8px;
          font-size: 11px;
          opacity: 0.7;
        }

        .status-badge {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }

        .status-processing {
          background: #fff3cd;
          color: #856404;
        }

        .status-completed {
          background: #d4edda;
          color: #155724;
        }

        .status-failed {
          background: #f8d7da;
          color: #721c24;
        }

        .delete-button-mini {
          opacity: 0;
          background: none;
          border: none;
          font-size: 14px;
          cursor: pointer;
          transition: opacity 0.2s ease;
        }

        .recording-item:hover .delete-button-mini {
          opacity: 1;
        }

        /* 右侧内容区 */
        .transcript-content {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
        }

        .audio-controls {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 12px;
          margin-bottom: 24px;
        }

        .control-button {
          padding: 10px 24px;
          background: var(--primary-color, #007bff);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .control-button:hover {
          background: var(--primary-hover, #0056b3);
        }

        .audio-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 14px;
        }

        /* 摘要区域 */
        .summary-section {
          margin-bottom: 24px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .section-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .edit-button {
          padding: 6px 16px;
          background: var(--bg-secondary, #f5f5f5);
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .edit-button:hover {
          background: var(--bg-hover, #e0e0e0);
        }

        .summary-display {
          padding: 16px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 12px;
          line-height: 1.6;
        }

        .ai-note {
          margin-top: 12px;
          padding: 12px;
          background: #e3f2fd;
          border-left: 3px solid #2196f3;
          border-radius: 6px;
          font-size: 13px;
          color: #1565c0;
        }

        .summary-editor {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .summary-textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 8px;
          font-size: 14px;
          line-height: 1.6;
          resize: vertical;
          font-family: inherit;
        }

        .editor-actions {
          display: flex;
          gap: 12px;
        }

        .save-button {
          padding: 8px 20px;
          background: #28a745;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .save-button:hover {
          background: #218838;
        }

        .cancel-button {
          padding: 8px 20px;
          background: var(--bg-secondary, #f5f5f5);
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cancel-button:hover {
          background: var(--bg-hover, #e0e0e0);
        }

        /* 关键要点 */
        .key-points-section {
          margin-bottom: 24px;
        }

        .key-points-section h3 {
          margin: 0 0 12px 0;
          font-size: 18px;
          font-weight: 600;
        }

        .key-points-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .key-points-list li {
          padding: 12px;
          background: var(--bg-secondary, #f5f5f5);
          border-left: 3px solid var(--primary-color, #007bff);
          border-radius: 6px;
          margin-bottom: 8px;
          line-height: 1.5;
        }

        /* 行动项 */
        .action-items-section {
          margin-bottom: 24px;
        }

        .action-items-section h3 {
          margin: 0 0 12px 0;
          font-size: 18px;
          font-weight: 600;
        }

        .action-items-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .action-items-list li {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 6px;
          margin-bottom: 8px;
        }

        .action-items-list input[type='checkbox'] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        /* 分段转录 */
        .segments-section {
          margin-bottom: 24px;
        }

        .segments-section h3 {
          margin: 0 0 12px 0;
          font-size: 18px;
          font-weight: 600;
        }

        .segments-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .segment-item {
          display: flex;
          gap: 16px;
          padding: 12px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .segment-item:hover {
          background: var(--bg-hover, #e0e0e0);
        }

        .segment-item.active {
          background: #e3f2fd;
          border-left: 3px solid var(--primary-color, #007bff);
        }

        .segment-time {
          font-size: 12px;
          font-weight: 600;
          color: var(--primary-color, #007bff);
          flex-shrink: 0;
          width: 60px;
        }

        .segment-content {
          flex: 1;
          line-height: 1.6;
        }

        .speaker-label {
          font-weight: 600;
          color: var(--primary-color, #007bff);
          margin-right: 8px;
        }

        .segment-text {
          color: var(--text-primary, #333);
        }

        .raw-transcript {
          padding: 16px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 12px;
          line-height: 1.8;
          white-space: pre-wrap;
        }

        /* 加载状态 */
        .transcript-loading,
        .transcript-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
        }

        .loading-spinner {
          font-size: 64px;
          margin-bottom: 16px;
          animation: spin 2s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .loading-note {
          font-size: 13px;
          color: var(--text-secondary, #888);
        }

        .error-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .retry-button {
          padding: 10px 24px;
          background: var(--primary-color, #007bff);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          margin-top: 16px;
        }

        /* 空状态 */
        .transcript-view-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
          color: var(--text-secondary, #888);
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        @media (max-width: 768px) {
          .transcript-layout {
            flex-direction: column;
          }

          .transcript-sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid var(--border-color, #e0e0e0);
          }
        }
      `}</style>
    </div>
  );
};

export default TranscriptView;
