import React, { useState, useEffect, useRef } from 'react';
import { Attachment, AttachmentType } from '../types';

interface AudioStreamViewProps {
  eventId: string;
  attachments: Attachment[];
  onAttachmentClick?: (attachment: Attachment, index: number) => void;
  onDelete?: (attachmentId: string) => void;
  layout?: 'podcast' | 'compact' | 'waveform';
  autoplay?: boolean;
  className?: string;
}

/**
 * 音频流查看组件
 * 
 * 支持三种布局模式：
 * - podcast: 播客风格（大封面 + 播放控件）
 * - compact: 紧凑列表（小封面 + 简单控件）
 * - waveform: 波形可视化（需要 WaveSurfer.js）
 * 
 * @example
 * ```tsx
 * <AudioStreamView
 *   eventId="event-123"
 *   attachments={audioAttachments}
 *   layout="podcast"
 *   autoplay={false}
 * />
 * ```
 */
export const AudioStreamView: React.FC<AudioStreamViewProps> = ({
  eventId,
  attachments,
  onAttachmentClick,
  onDelete,
  layout = 'podcast',
  autoplay = false,
  className = '',
}) => {
  const [audios, setAudios] = useState<Attachment[]>([]);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [audioPaths, setAudioPaths] = useState<Map<string, string>>(new Map());
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  /**
   * 过滤音频类型附件
   */
  useEffect(() => {
    const audioAttachments = attachments.filter(
      (att) => att.type === AttachmentType.AUDIO || att.type === AttachmentType.VOICE_RECORDING
    );
    setAudios(audioAttachments);
  }, [attachments]);

  /**
   * 加载音频路径
   */
  useEffect(() => {
    const loadAudioPaths = async () => {
      const paths = new Map<string, string>();

      for (const audio of audios) {
        try {
          const result = await (window as any).electronAPI?.invoke('attachment:getPath', audio.id);
          if (result?.success && result.path) {
            paths.set(audio.id, `file://${result.path}`);
          }
        } catch (error) {
          console.error('Failed to load audio path:', audio.id, error);
        }
      }

      setAudioPaths(paths);
    };

    if (audios.length > 0) {
      loadAudioPaths();
    }
  }, [audios]);

  /**
   * 当前音频变化时更新播放器
   */
  useEffect(() => {
    if (audios.length > 0 && audioRef.current) {
      const currentAudio = audios[currentAudioIndex];
      const audioPath = audioPaths.get(currentAudio.id);

      if (audioPath) {
        audioRef.current.src = audioPath;
        if (autoplay || playingAudio === currentAudio.id) {
          audioRef.current.play();
          setPlayingAudio(currentAudio.id);
        }
      }
    }
  }, [currentAudioIndex, audios, audioPaths]);

  /**
   * 播放/暂停
   */
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (audioRef.current.paused) {
      audioRef.current.play();
      setPlayingAudio(audios[currentAudioIndex].id);
    } else {
      audioRef.current.pause();
      setPlayingAudio(null);
    }
  };

  /**
   * 上一曲
   */
  const playPrevious = () => {
    const prevIndex = currentAudioIndex > 0 ? currentAudioIndex - 1 : audios.length - 1;
    setCurrentAudioIndex(prevIndex);
  };

  /**
   * 下一曲
   */
  const playNext = () => {
    const nextIndex = currentAudioIndex < audios.length - 1 ? currentAudioIndex + 1 : 0;
    setCurrentAudioIndex(nextIndex);
  };

  /**
   * 跳转到指定音频
   */
  const playAudio = (index: number) => {
    setCurrentAudioIndex(index);
  };

  /**
   * 时间更新
   */
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  /**
   * 播放结束
   */
  const handleEnded = () => {
    setPlayingAudio(null);
    if (autoplay && currentAudioIndex < audios.length - 1) {
      playNext();
    }
  };

  /**
   * 进度条拖动
   */
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const time = parseFloat(e.target.value);
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  /**
   * 音量调节
   */
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  /**
   * 播放速度调节
   */
  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  /**
   * 格式化时间
   */
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * 删除音频
   */
  const handleDelete = async (attachmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个音频吗？')) return;
    onDelete?.(attachmentId);
  };

  /**
   * 渲染播客布局
   */
  const renderPodcast = () => {
    if (audios.length === 0) return null;

    const currentAudio = audios[currentAudioIndex];
    const isPlaying = playingAudio === currentAudio.id;

    return (
      <div className="audio-podcast">
        <div className="podcast-player">
          <div className="album-art">
            {currentAudio.thumbnailPath ? (
              <img src={`file://${currentAudio.thumbnailPath}`} alt={currentAudio.filename} />
            ) : (
              <div className="default-art">🎵</div>
            )}
          </div>

          <div className="track-info">
            <h2 className="track-title">{currentAudio.caption || currentAudio.filename}</h2>
            <div className="track-meta">
              {currentAudio.timestamp && (
                <span>{new Date(currentAudio.timestamp).toLocaleDateString('zh-CN')}</span>
              )}
              <span>{formatTime(currentAudio.duration || 0)}</span>
            </div>
          </div>

          <div className="progress-container">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="progress-bar"
            />
            <div className="time-display">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="player-controls">
            <button className="control-button" onClick={playPrevious}>
              ⏮
            </button>
            <button className="control-button play-pause" onClick={togglePlay}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="control-button" onClick={playNext}>
              ⏭
            </button>
          </div>

          <div className="advanced-controls">
            <div className="volume-control">
              <span>🔊</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="volume-slider"
              />
            </div>

            <div className="speed-control">
              <span>速度:</span>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  className={`speed-button ${playbackRate === rate ? 'active' : ''}`}
                  onClick={() => handlePlaybackRateChange(rate)}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="audio-playlist">
          <h3>播放列表 ({audios.length})</h3>
          <div className="playlist-items">
            {audios.map((audio, index) => (
              <div
                key={audio.id}
                className={`playlist-item ${index === currentAudioIndex ? 'active' : ''}`}
                onClick={() => playAudio(index)}
              >
                <div className="playlist-index">{index + 1}</div>
                <div className="playlist-info">
                  <div className="playlist-title">{audio.caption || audio.filename}</div>
                  <div className="playlist-meta">{formatTime(audio.duration || 0)}</div>
                </div>
                {index === currentAudioIndex && isPlaying && <div className="playing-icon">▶</div>}
                {onDelete && (
                  <button className="delete-button-small" onClick={(e) => handleDelete(audio.id, e)}>
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /**
   * 渲染紧凑列表
   */
  const renderCompact = () => (
    <div className="audio-compact">
      {audios.map((audio, index) => {
        const isCurrentAudio = index === currentAudioIndex;
        const isPlaying = playingAudio === audio.id;

        return (
          <div key={audio.id} className={`compact-item ${isCurrentAudio ? 'active' : ''}`}>
            <button className="compact-play-button" onClick={() => playAudio(index)}>
              {isPlaying ? '⏸' : '▶'}
            </button>

            <div className="compact-info">
              <div className="compact-title">{audio.caption || audio.filename}</div>
              <div className="compact-meta">
                <span>{formatTime(audio.duration || 0)}</span>
                {audio.timestamp && <span>{new Date(audio.timestamp).toLocaleDateString('zh-CN')}</span>}
              </div>
            </div>

            {isCurrentAudio && (
              <div className="compact-progress">
                <div className="progress-fill" style={{ width: `${(currentTime / duration) * 100}%` }} />
              </div>
            )}

            {onDelete && (
              <button className="delete-button-small" onClick={(e) => handleDelete(audio.id, e)}>
                🗑️
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  /**
   * 渲染波形布局（简化版，完整版需要 WaveSurfer.js）
   */
  const renderWaveform = () => (
    <div className="audio-waveform">
      <div className="waveform-placeholder">
        <p>波形可视化</p>
        <p className="waveform-note">（完整版需要集成 WaveSurfer.js）</p>
      </div>
      {renderCompact()}
    </div>
  );

  /**
   * 空状态
   */
  if (audios.length === 0) {
    return (
      <div className="audio-stream-empty">
        <div className="empty-icon">🎵</div>
        <p>暂无音频</p>
      </div>
    );
  }

  return (
    <div className={`audio-stream-view audio-layout-${layout} ${className}`}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={handleTimeUpdate}
      />

      {layout === 'podcast' && renderPodcast()}
      {layout === 'compact' && renderCompact()}
      {layout === 'waveform' && renderWaveform()}

      <style>{`
        .audio-stream-view {
          padding: 16px;
          background: var(--bg-primary, white);
        }

        /* 播客布局 */
        .audio-podcast {
          display: flex;
          gap: 24px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .podcast-player {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 32px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 16px;
        }

        .album-art {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        }

        .album-art img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .default-art {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 120px;
        }

        .track-info {
          text-align: center;
        }

        .track-title {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: var(--text-primary, #333);
        }

        .track-meta {
          display: flex;
          gap: 16px;
          justify-content: center;
          font-size: 14px;
          color: var(--text-secondary, #888);
        }

        .progress-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          border-radius: 4px;
          appearance: none;
          background: var(--bg-hover, #e0e0e0);
          cursor: pointer;
        }

        .progress-bar::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--primary-color, #007bff);
          cursor: pointer;
        }

        .time-display {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-secondary, #888);
        }

        .player-controls {
          display: flex;
          gap: 16px;
          justify-content: center;
          align-items: center;
        }

        .control-button {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          background: var(--bg-hover, #e0e0e0);
          font-size: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .control-button:hover {
          background: var(--bg-active, #d0d0d0);
          transform: scale(1.05);
        }

        .play-pause {
          width: 64px;
          height: 64px;
          background: var(--primary-color, #007bff);
          color: white;
          font-size: 28px;
        }

        .play-pause:hover {
          background: var(--primary-hover, #0056b3);
        }

        .advanced-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 16px;
          border-top: 1px solid var(--border-color, #e0e0e0);
        }

        .volume-control {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .volume-slider {
          width: 100px;
          height: 4px;
          border-radius: 2px;
          appearance: none;
          background: var(--bg-hover, #e0e0e0);
          cursor: pointer;
        }

        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--primary-color, #007bff);
          cursor: pointer;
        }

        .speed-control {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }

        .speed-button {
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid var(--border-color, #d0d0d0);
          background: white;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .speed-button:hover {
          background: var(--bg-hover, #f0f0f0);
        }

        .speed-button.active {
          background: var(--primary-color, #007bff);
          color: white;
          border-color: var(--primary-color, #007bff);
        }

        .audio-playlist {
          width: 300px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 16px;
          padding: 20px;
          overflow-y: auto;
        }

        .audio-playlist h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
        }

        .playlist-items {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .playlist-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s ease;
          position: relative;
        }

        .playlist-item:hover {
          background: var(--bg-hover, #e0e0e0);
        }

        .playlist-item.active {
          background: var(--primary-color, #007bff);
          color: white;
        }

        .playlist-index {
          width: 24px;
          text-align: center;
          font-size: 13px;
          font-weight: 600;
          opacity: 0.6;
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
        }

        .playlist-meta {
          font-size: 11px;
          opacity: 0.7;
          margin-top: 2px;
        }

        .playing-icon {
          font-size: 12px;
        }

        /* 紧凑列表 */
        .audio-compact {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: 800px;
          margin: 0 auto;
        }

        .compact-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 12px;
          transition: background 0.2s ease;
          position: relative;
        }

        .compact-item:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .compact-item.active {
          background: var(--primary-light, #e3f2fd);
          border: 2px solid var(--primary-color, #007bff);
        }

        .compact-play-button {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          background: var(--primary-color, #007bff);
          color: white;
          font-size: 20px;
          cursor: pointer;
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }

        .compact-play-button:hover {
          transform: scale(1.1);
        }

        .compact-info {
          flex: 1;
          min-width: 0;
        }

        .compact-title {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .compact-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: var(--text-secondary, #888);
        }

        .compact-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--bg-hover, #e0e0e0);
          border-radius: 0 0 12px 12px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--primary-color, #007bff);
          transition: width 0.3s ease;
        }

        /* 波形布局 */
        .audio-waveform {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .waveform-placeholder {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 12px;
          color: var(--text-secondary, #888);
        }

        .waveform-placeholder p {
          margin: 8px 0;
        }

        .waveform-note {
          font-size: 13px;
        }

        /* 删除按钮 */
        .delete-button-small {
          background: rgba(255, 255, 255, 0.9);
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          font-size: 14px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s ease, transform 0.1s ease;
        }

        .playlist-item:hover .delete-button-small,
        .compact-item:hover .delete-button-small {
          opacity: 1;
        }

        .delete-button-small:hover {
          background: #ff4444;
          transform: scale(1.1);
        }

        /* 空状态 */
        .audio-stream-empty {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-secondary, #888);
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        @media (max-width: 768px) {
          .audio-podcast {
            flex-direction: column;
          }

          .audio-playlist {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default AudioStreamView;
