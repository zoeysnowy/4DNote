import React, { useState, useEffect, useCallback } from 'react';
import { Attachment, AttachmentType } from '@frontend/types';
import attachmentService from '@backend/AttachmentService';

interface GalleryViewProps {
  eventId: string;
  attachments: Attachment[];
  layout?: 'grid' | 'masonry' | 'timeline';
  onAttachmentClick?: (attachment: Attachment, index: number) => void;
  onDelete?: (attachmentId: string) => void;
  className?: string;
}

/**
 * 图册查看组件
 * 
 * 支持三种布局模式：
 * - grid: 均匀网格（默认）
 * - masonry: 瀑布流（Pinterest 风格）
 * - timeline: 时间轴（按时间分组）
 * 
 * @example
 * ```tsx
 * <GalleryView
 *   eventId="event-123"
 *   attachments={imageAttachments}
 *   layout="grid"
 *   onAttachmentClick={(attachment) => openLightbox(attachment)}
 * />
 * ```
 */
export const GalleryView: React.FC<GalleryViewProps> = ({
  eventId,
  attachments,
  layout = 'grid',
  onAttachmentClick,
  onDelete,
  className = '',
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imagePaths, setImagePaths] = useState<Map<string, string>>(new Map());

  /**
   * 过滤出图片类型的附件
   */
  const images = attachments.filter((att) => att.type === AttachmentType.IMAGE);

  /**
   * 加载图片路径（从 Electron）
   */
  useEffect(() => {
    const loadImagePaths = async () => {
      const paths = new Map<string, string>();

      for (const img of images) {
        try {
          const result = await (window as any).electronAPI?.invoke('attachment:getPath', img.id);
          if (result?.success && result.path) {
            paths.set(img.id, `file://${result.path}`);
          }
        } catch (error) {
          console.error('Failed to load image path:', img.id, error);
        }
      }

      setImagePaths(paths);
    };

    if (images.length > 0) {
      loadImagePaths();
    }
  }, [images]);

  /**
   * 打开灯箱查看
   */
  const openLightbox = (index: number) => {
    setSelectedIndex(index);
    setLightboxOpen(true);
    onAttachmentClick?.(images[index], index);
  };

  /**
   * 关闭灯箱
   */
  const closeLightbox = () => {
    setLightboxOpen(false);
    setSelectedIndex(null);
  };

  /**
   * 上一张/下一张
   */
  const navigateLightbox = (direction: 'prev' | 'next') => {
    if (selectedIndex === null) return;

    let newIndex = direction === 'prev' ? selectedIndex - 1 : selectedIndex + 1;

    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;

    setSelectedIndex(newIndex);
  };

  /**
   * 键盘导航
   */
  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') navigateLightbox('prev');
      if (e.key === 'ArrowRight') navigateLightbox('next');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, selectedIndex]);

  /**
   * 按时间分组（时间轴布局）
   */
  const groupByDate = (images: Attachment[]): Map<string, Attachment[]> => {
    const groups = new Map<string, Attachment[]>();

    images.forEach((img) => {
      const date = img.timestamp ? new Date(img.timestamp).toLocaleDateString('zh-CN') : '未知日期';
      const group = groups.get(date) || [];
      group.push(img);
      groups.set(date, group);
    });

    return groups;
  };

  /**
   * 删除图片
   */
  const handleDelete = async (attachmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('确定要删除这张图片吗？')) return;

    try {
      await attachmentService.deleteAttachment(attachmentId);
      onDelete?.(attachmentId);
    } catch (error) {
      console.error('Failed to delete attachment:', error);
      alert('删除失败');
    }
  };

  /**
   * 渲染网格布局
   */
  const renderGrid = () => (
    <div className="gallery-grid">
      {images.map((img, index) => (
        <div key={img.id} className="gallery-item" onClick={() => openLightbox(index)}>
          <img
            src={imagePaths.get(img.id) || ''}
            alt={img.caption || img.filename}
            loading="lazy"
            className="gallery-image"
          />
          {img.caption && <div className="image-caption">{img.caption}</div>}
          {onDelete && (
            <button className="delete-button" onClick={(e) => handleDelete(img.id, e)}>
              🗑️
            </button>
          )}
        </div>
      ))}
    </div>
  );

  /**
   * 渲染瀑布流布局
   */
  const renderMasonry = () => (
    <div className="gallery-masonry">
      {images.map((img, index) => (
        <div key={img.id} className="masonry-item" onClick={() => openLightbox(index)}>
          <img
            src={imagePaths.get(img.id) || ''}
            alt={img.caption || img.filename}
            loading="lazy"
            className="masonry-image"
            style={{ height: img.height ? `${(img.height / img.width!) * 300}px` : 'auto' }}
          />
          {img.caption && <div className="image-caption">{img.caption}</div>}
          {onDelete && (
            <button className="delete-button" onClick={(e) => handleDelete(img.id, e)}>
              🗑️
            </button>
          )}
        </div>
      ))}
    </div>
  );

  /**
   * 渲染时间轴布局
   */
  const renderTimeline = () => {
    const groups = groupByDate(images);

    return (
      <div className="gallery-timeline">
        {Array.from(groups.entries()).map(([date, imgs]) => (
          <div key={date} className="timeline-group">
            <h3 className="timeline-date">{date}</h3>
            <div className="timeline-images">
              {imgs.map((img, index) => (
                <div key={img.id} className="timeline-item" onClick={() => openLightbox(index)}>
                  <img
                    src={imagePaths.get(img.id) || ''}
                    alt={img.caption || img.filename}
                    loading="lazy"
                    className="timeline-image"
                  />
                  {img.caption && <div className="image-caption">{img.caption}</div>}
                  {onDelete && (
                    <button className="delete-button" onClick={(e) => handleDelete(img.id, e)}>
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /**
   * 渲染灯箱（全屏查看）
   */
  const renderLightbox = () => {
    if (!lightboxOpen || selectedIndex === null) return null;

    const currentImage = images[selectedIndex];
    const imagePath = imagePaths.get(currentImage.id);

    return (
      <div className="lightbox-overlay" onClick={closeLightbox}>
        <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
          <button className="lightbox-close" onClick={closeLightbox}>
            ✕
          </button>
          <button className="lightbox-nav lightbox-prev" onClick={() => navigateLightbox('prev')}>
            ‹
          </button>
          <button className="lightbox-nav lightbox-next" onClick={() => navigateLightbox('next')}>
            ›
          </button>

          <img src={imagePath || ''} alt={currentImage.caption || currentImage.filename} className="lightbox-image" />

          <div className="lightbox-info">
            <div className="lightbox-caption">{currentImage.caption || currentImage.filename}</div>
            <div className="lightbox-meta">
              {selectedIndex + 1} / {images.length}
              {currentImage.width && currentImage.height && (
                <span className="image-size">
                  {' '}
                  • {currentImage.width} × {currentImage.height}
                </span>
              )}
              {currentImage.timestamp && (
                <span className="image-time"> • {new Date(currentImage.timestamp).toLocaleString('zh-CN')}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * 空状态
   */
  if (images.length === 0) {
    return (
      <div className="gallery-empty">
        <div className="empty-icon">🖼️</div>
        <p>暂无图片</p>
      </div>
    );
  }

  return (
    <div className={`gallery-view gallery-layout-${layout} ${className}`}>
      {layout === 'grid' && renderGrid()}
      {layout === 'masonry' && renderMasonry()}
      {layout === 'timeline' && renderTimeline()}
      {renderLightbox()}

      <style>{`
        .gallery-view {
          padding: 16px;
          background: var(--bg-primary, white);
        }

        /* 网格布局 */
        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        .gallery-item {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          background: var(--bg-secondary, #f5f5f5);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .gallery-item:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .gallery-image {
          width: 100%;
          height: 200px;
          object-fit: cover;
          display: block;
        }

        /* 瀑布流布局 */
        .gallery-masonry {
          column-count: 3;
          column-gap: 16px;
        }

        @media (max-width: 1024px) {
          .gallery-masonry {
            column-count: 2;
          }
        }

        @media (max-width: 768px) {
          .gallery-masonry {
            column-count: 1;
          }
        }

        .masonry-item {
          position: relative;
          break-inside: avoid;
          margin-bottom: 16px;
          cursor: pointer;
          border-radius: 8px;
          overflow: hidden;
          transition: transform 0.2s ease;
        }

        .masonry-item:hover {
          transform: translateY(-4px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .masonry-image {
          width: 100%;
          display: block;
        }

        /* 时间轴布局 */
        .gallery-timeline {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .timeline-group {
          border-left: 3px solid var(--primary-color, #007bff);
          padding-left: 24px;
        }

        .timeline-date {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary, #333);
          margin-bottom: 12px;
        }

        .timeline-images {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
        }

        .timeline-item {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s ease;
        }

        .timeline-item:hover {
          transform: scale(1.05);
        }

        .timeline-image {
          width: 100%;
          height: 150px;
          object-fit: cover;
          display: block;
        }

        /* 图片说明 */
        .image-caption {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
          color: white;
          padding: 8px 12px;
          font-size: 13px;
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .gallery-item:hover .image-caption,
        .masonry-item:hover .image-caption,
        .timeline-item:hover .image-caption {
          opacity: 1;
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
        }

        .gallery-item:hover .delete-button,
        .masonry-item:hover .delete-button,
        .timeline-item:hover .delete-button {
          opacity: 1;
        }

        .delete-button:hover {
          background: #ff4444;
          transform: scale(1.1);
        }

        /* 灯箱 */
        .lightbox-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.95);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .lightbox-content {
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .lightbox-image {
          max-width: 100%;
          max-height: 80vh;
          object-fit: contain;
        }

        .lightbox-close {
          position: absolute;
          top: -50px;
          right: 0;
          background: none;
          border: none;
          color: white;
          font-size: 32px;
          cursor: pointer;
          padding: 8px;
        }

        .lightbox-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: white;
          font-size: 48px;
          width: 60px;
          height: 60px;
          cursor: pointer;
          border-radius: 50%;
          transition: background 0.2s ease;
        }

        .lightbox-nav:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .lightbox-prev {
          left: -80px;
        }

        .lightbox-next {
          right: -80px;
        }

        .lightbox-info {
          margin-top: 16px;
          text-align: center;
          color: white;
        }

        .lightbox-caption {
          font-size: 16px;
          margin-bottom: 8px;
        }

        .lightbox-meta {
          font-size: 13px;
          opacity: 0.7;
        }

        /* 空状态 */
        .gallery-empty {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-secondary, #888);
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }
      `}</style>
    </div>
  );
};

export default GalleryView;
