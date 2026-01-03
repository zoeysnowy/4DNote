import React, { useState, useEffect, useRef } from 'react';
import { Attachment, AttachmentType } from '@frontend/types';

interface VideoStreamViewProps {
  eventId: string;
  attachments: Attachment[];
  onAttachmentClick?: (attachment: Attachment, index: number) => void;
  onDelete?: (attachmentId: string) => void;
  layout?: 'grid' | 'list' | 'theater';
  autoplay?: boolean;
  className?: string;
}

/**
 * 视频流查看组件
 * 
 * 支持三种布局模式：
 * - grid: 视频墙（多视频同时显示）
 * - list: 列表模式（单列滚动）
 * - theater: 影院模式（主视频 + 缩略图列表）
 * 
 * @example
 * ```tsx
 * <VideoStreamView
 *   eventId="event-123"
 *   attachments={videoAttachments}
 *   layout="theater"
 *   autoplay={false}
 * />
 * ```
 */
export const VideoStreamView: React.FC<VideoStreamViewProps> = ({
  eventId,
  attachments,
  onAttachmentClick,
  onDelete,
  layout = 'grid',
  autoplay = false,
  className = '',
}) => {
  const [videos, setVideos] = useState<Attachment[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videoPaths, setVideoPaths] = useState<Map<string, string>>(new Map());
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  /**
   * 过滤视频类型附件
   */
  useEffect(() => {
    const videoAttachments = attachments.filter((att) => att.type === AttachmentType.VIDEO);
    setVideos(videoAttachments);
  }, [attachments]);

  /**
   * 加载视频路径
   */
  useEffect(() => {
    const loadVideoPaths = async () => {
      const paths = new Map<string, string>();

      for (const video of videos) {
        try {
          const result = await (window as any).electronAPI?.invoke('attachment:getPath', video.id);
          if (result?.success && result.path) {
            paths.set(video.id, `file://${result.path}`);
          }
        } catch (error) {
          console.error('Failed to load video path:', video.id, error);
        }
      }

      setVideoPaths(paths);
    };

    if (videos.length > 0) {
      loadVideoPaths();
    }
  }, [videos]);

  /**
   * 播放/暂停切换
   */
  const togglePlay = (videoId: string) => {
    const videoElement = videoRefs.current.get(videoId);
    if (!videoElement) return;

    if (videoElement.paused) {
      videoElement.play();
      setPlayingVideos((prev) => new Set(prev).add(videoId));
    } else {
      videoElement.pause();
      setPlayingVideos((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    }
  };

  /**
   * 视频播放结束
   */
  const handleVideoEnded = (videoId: string, index: number) => {
    setPlayingVideos((prev) => {
      const next = new Set(prev);
      next.delete(videoId);
      return next;
    });

    // 自动播放下一个视频（影院模式）
    if (layout === 'theater' && autoplay && index < videos.length - 1) {
      setCurrentVideoIndex(index + 1);
      setTimeout(() => {
        const nextVideo = videoRefs.current.get(videos[index + 1].id);
        nextVideo?.play();
      }, 500);
    }
  };

  /**
   * 格式化时长
   */
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * 删除视频
   */
  const handleDelete = async (attachmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个视频吗？')) return;
    onDelete?.(attachmentId);
  };

  /**
   * 渲染网格布局（视频墙）
   */
  const renderGrid = () => (
    <div className="video-grid">
      {videos.map((video, index) => (
        <div key={video.id} className="video-grid-item">
          <div className="video-container">
            <video
              ref={(el) => {
                if (el) videoRefs.current.set(video.id, el);
              }}
              src={videoPaths.get(video.id) || ''}
              poster={video.thumbnailPath ? `file://${video.thumbnailPath}` : undefined}
              onEnded={() => handleVideoEnded(video.id, index)}
              onClick={() => togglePlay(video.id)}
              className="video-element"
            />
            <div className="video-overlay">
              <button className="play-button" onClick={() => togglePlay(video.id)}>
                {playingVideos.has(video.id) ? '⏸' : '▶'}
              </button>
            </div>
          </div>
          <div className="video-info">
            <div className="video-title">{video.caption || video.filename}</div>
            <div className="video-meta">
              <span className="duration">{formatDuration(video.duration)}</span>
              {video.timestamp && (
                <span className="time">{new Date(video.timestamp).toLocaleDateString('zh-CN')}</span>
              )}
            </div>
          </div>
          {onDelete && (
            <button className="delete-button" onClick={(e) => handleDelete(video.id, e)}>
              🗑️
            </button>
          )}
        </div>
      ))}
    </div>
  );

  /**
   * 渲染列表布局
   */
  const renderList = () => (
    <div className="video-list">
      {videos.map((video, index) => (
        <div key={video.id} className="video-list-item">
          <div className="video-thumbnail">
            <img
              src={video.thumbnailPath ? `file://${video.thumbnailPath}` : ''}
              alt={video.caption || video.filename}
            />
            <div className="duration-badge">{formatDuration(video.duration)}</div>
          </div>
          <div className="video-details">
            <h3 className="video-title">{video.caption || video.filename}</h3>
            <p className="video-description">{video.filename}</p>
            <div className="video-meta">
              {video.timestamp && <span>{new Date(video.timestamp).toLocaleString('zh-CN')}</span>}
              <span>{(video.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          </div>
          <button className="play-list-button" onClick={() => setCurrentVideoIndex(index)}>
            ▶ 播放
          </button>
          {onDelete && (
            <button className="delete-button" onClick={(e) => handleDelete(video.id, e)}>
              🗑️
            </button>
          )}
        </div>
      ))}
    </div>
  );

  /**
   * 渲染影院模式
   */
  const renderTheater = () => {
    if (videos.length === 0) return null;

    const currentVideo = videos[currentVideoIndex];
    const videoPath = videoPaths.get(currentVideo.id);

    return (
      <div className="video-theater">
        <div className="main-video-container">
          <video
            ref={(el) => {
              if (el) videoRefs.current.set(currentVideo.id, el);
            }}
            src={videoPath || ''}
            poster={currentVideo.thumbnailPath ? `file://${currentVideo.thumbnailPath}` : undefined}
            controls
            autoPlay={autoplay}
            onEnded={() => handleVideoEnded(currentVideo.id, currentVideoIndex)}
            className="main-video"
          />
          <div className="video-info-overlay">
            <h2>{currentVideo.caption || currentVideo.filename}</h2>
            <div className="video-meta">
              <span>{formatDuration(currentVideo.duration)}</span>
              {currentVideo.timestamp && <span>{new Date(currentVideo.timestamp).toLocaleString('zh-CN')}</span>}
            </div>
          </div>
        </div>

        <div className="video-playlist">
          <h3>播放列表 ({videos.length})</h3>
          <div className="playlist-items">
            {videos.map((video, index) => (
              <div
                key={video.id}
                className={`playlist-item ${index === currentVideoIndex ? 'active' : ''}`}
                onClick={() => setCurrentVideoIndex(index)}
              >
                <div className="playlist-thumbnail">
                  <img src={video.thumbnailPath ? `file://${video.thumbnailPath}` : ''} alt={video.filename} />
                  <div className="duration-badge">{formatDuration(video.duration)}</div>
                  {index === currentVideoIndex && <div className="playing-indicator">▶</div>}
                </div>
                <div className="playlist-info">
                  <div className="playlist-title">{video.caption || video.filename}</div>
                  <div className="playlist-meta">{new Date(video.timestamp || '').toLocaleDateString('zh-CN')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /**
   * 空状态
   */
  if (videos.length === 0) {
    return (
      <div className="video-stream-empty">
        <div className="empty-icon">🎥</div>
        <p>暂无视频</p>
      </div>
    );
  }

  return (
    <div className={`video-stream-view video-layout-${layout} ${className}`}>
      {layout === 'grid' && renderGrid()}
      {layout === 'list' && renderList()}
      {layout === 'theater' && renderTheater()}

      <style>{`
        .video-stream-view {
          padding: 16px;
          background: var(--bg-primary, white);
        }

        /* 网格布局 */
        .video-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }

        .video-grid-item {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg-secondary, #f5f5f5);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .video-grid-item:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
        }

        .video-container {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: black;
        }

        .video-element {
          width: 100%;
          height: 100%;
          object-fit: cover;
          cursor: pointer;
        }

        .video-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.3);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .video-container:hover .video-overlay {
          opacity: 1;
        }

        .play-button {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.9);
          border: none;
          font-size: 24px;
          cursor: pointer;
          transition: transform 0.2s ease;
        }

        .play-button:hover {
          transform: scale(1.1);
        }

        .video-info {
          padding: 12px;
        }

        .video-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #333);
          margin-bottom: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .video-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: var(--text-secondary, #888);
        }

        /* 列表布局 */
        .video-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .video-list-item {
          display: flex;
          gap: 16px;
          padding: 12px;
          border-radius: 12px;
          background: var(--bg-secondary, #f5f5f5);
          transition: background 0.2s ease;
        }

        .video-list-item:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .video-thumbnail {
          position: relative;
          width: 160px;
          height: 90px;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
        }

        .video-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .duration-badge {
          position: absolute;
          bottom: 4px;
          right: 4px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .video-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .video-details .video-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }

        .video-description {
          font-size: 13px;
          color: var(--text-secondary, #666);
          margin: 0;
        }

        .play-list-button {
          padding: 8px 20px;
          background: var(--primary-color, #007bff);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .play-list-button:hover {
          background: var(--primary-hover, #0056b3);
        }

        /* 影院模式 */
        .video-theater {
          display: flex;
          gap: 20px;
          height: calc(100vh - 200px);
        }

        .main-video-container {
          flex: 1;
          position: relative;
          background: black;
          border-radius: 12px;
          overflow: hidden;
        }

        .main-video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .video-info-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
          color: white;
          padding: 20px;
        }

        .video-info-overlay h2 {
          margin: 0 0 8px 0;
          font-size: 20px;
        }

        .video-playlist {
          width: 300px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 12px;
          padding: 16px;
          overflow-y: auto;
        }

        .video-playlist h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
        }

        .playlist-items {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .playlist-item {
          display: flex;
          gap: 12px;
          padding: 8px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .playlist-item:hover {
          background: var(--bg-hover, #e0e0e0);
        }

        .playlist-item.active {
          background: var(--primary-color, #007bff);
          color: white;
        }

        .playlist-thumbnail {
          position: relative;
          width: 80px;
          height: 45px;
          border-radius: 6px;
          overflow: hidden;
          flex-shrink: 0;
        }

        .playlist-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .playing-indicator {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--primary-color, #007bff);
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }

        .playlist-info {
          flex: 1;
          min-width: 0;
        }

        .playlist-title {
          font-size: 13px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-bottom: 4px;
        }

        .playlist-meta {
          font-size: 11px;
          opacity: 0.7;
        }

        /* 删除按钮 */
        .delete-button {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(255, 255, 255, 0.9);
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          font-size: 16px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s ease, transform 0.1s ease;
          z-index: 10;
        }

        .video-grid-item:hover .delete-button,
        .video-list-item:hover .delete-button {
          opacity: 1;
        }

        .delete-button:hover {
          background: #ff4444;
          transform: scale(1.1);
        }

        /* 空状态 */
        .video-stream-empty {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-secondary, #888);
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        @media (max-width: 768px) {
          .video-theater {
            flex-direction: column;
            height: auto;
          }

          .video-playlist {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default VideoStreamView;
