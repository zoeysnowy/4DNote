import React, { useState, useEffect } from 'react';
import { Attachment, AttachmentType } from '@frontend/types';

interface BookmarkViewProps {
  eventId: string;
  attachments: Attachment[];
  onAttachmentClick?: (attachment: Attachment, index: number) => void;
  onDelete?: (attachmentId: string) => void;
  layout?: 'cards' | 'list' | 'masonry';
  className?: string;
}

/**
 * 书签/网页剪藏查看组件
 * 
 * 功能：
 * - 网页剪藏展示（URL + 标题 + 缩略图 + 摘要）
 * - 标签分类
 * - 全文搜索
 * - 离线阅读模式
 * - 快速打开
 * 
 * 布局模式：
 * - cards: 卡片网格（favicon + 标题 + 摘要）
 * - list: 列表模式（详细信息）
 * - masonry: 瀑布流（不同高度的卡片）
 * 
 * @example
 * ```tsx
 * <BookmarkView
 *   eventId="event-123"
 *   attachments={webClipAttachments}
 *   layout="cards"
 * />
 * ```
 */
export const BookmarkView: React.FC<BookmarkViewProps> = ({
  eventId,
  attachments,
  onAttachmentClick,
  onDelete,
  layout = 'cards',
  className = '',
}) => {
  const [webClips, setWebClips] = useState<Attachment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [allTags, setAllTags] = useState<string[]>([]);

  /**
   * 过滤网页剪藏类型附件
   */
  useEffect(() => {
    const clips = attachments.filter((att) => att.type === AttachmentType.WEB_CLIP);
    setWebClips(clips);
    extractTags(clips);
  }, [attachments]);

  /**
   * 提取所有标签
   */
  const extractTags = (clips: Attachment[]) => {
    const tagSet = new Set<string>();

    clips.forEach((clip) => {
      if (clip.metadata?.tags && Array.isArray(clip.metadata.tags)) {
        clip.metadata.tags.forEach((tag: string) => tagSet.add(tag));
      }
    });

    setAllTags(Array.from(tagSet).sort());
  };

  /**
   * 过滤网页剪藏
   */
  const getFilteredClips = (): Attachment[] => {
    let filtered = webClips;

    // 按标签过滤
    if (selectedTag !== 'all') {
      filtered = filtered.filter(
        (clip) =>
          clip.metadata?.tags &&
          Array.isArray(clip.metadata.tags) &&
          clip.metadata.tags.includes(selectedTag)
      );
    }

    // 按搜索关键词过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (clip) =>
          clip.caption?.toLowerCase().includes(query) ||
          clip.metadata?.url?.toLowerCase().includes(query) ||
          clip.metadata?.description?.toLowerCase().includes(query) ||
          clip.metadata?.content?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  /**
   * 打开网页
   */
  const openWebPage = (url: string) => {
    if (!url) {
      alert('网页链接不存在');
      return;
    }

    // 使用 Electron shell 打开
    if ((window as any).electronAPI) {
      (window as any).electronAPI.invoke('shell:openExternal', url);
    } else {
      // 浏览器环境
      window.open(url, '_blank');
    }
  };

  /**
   * 复制链接
   */
  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      alert('链接已复制到剪贴板');
    });
  };

  /**
   * 获取域名
   */
  const getDomain = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'Unknown';
    }
  };

  /**
   * 获取 favicon URL
   */
  const getFaviconUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
    } catch {
      return '';
    }
  };

  /**
   * 删除网页剪藏
   */
  const handleDelete = (attachmentId: string) => {
    if (!confirm('确定要删除这条网页剪藏吗？')) return;
    onDelete?.(attachmentId);
  };

  /**
   * 渲染卡片布局
   */
  const renderCards = () => {
    const filtered = getFilteredClips();

    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">🔖</div>
          <p>没有找到匹配的网页剪藏</p>
        </div>
      );
    }

    return (
      <div className="bookmark-cards">
        {filtered.map((clip, index) => {
          const url = clip.metadata?.url || '';
          const domain = getDomain(url);
          const faviconUrl = getFaviconUrl(url);
          const title = clip.caption || clip.filename || 'Untitled';
          const description = clip.metadata?.description || '';
          const tags = (clip.metadata?.tags as string[]) || [];

          return (
            <div
              key={clip.id}
              className="bookmark-card"
              onClick={() => onAttachmentClick?.(clip, index)}
            >
              {/* 缩略图区域 */}
              <div className="card-thumbnail">
                {clip.thumbnailPath ? (
                  <img src={clip.thumbnailPath} alt={title} />
                ) : (
                  <div className="thumbnail-placeholder">
                    <span className="placeholder-icon">🌐</span>
                  </div>
                )}
              </div>

              {/* 内容区域 */}
              <div className="card-content">
                {/* Favicon + 域名 */}
                <div className="card-header">
                  {faviconUrl && (
                    <img src={faviconUrl} alt={domain} className="favicon" />
                  )}
                  <span className="domain">{domain}</span>
                </div>

                {/* 标题 */}
                <h3 className="card-title" title={title}>
                  {title}
                </h3>

                {/* 描述 */}
                {description && (
                  <p className="card-description">{description}</p>
                )}

                {/* 标签 */}
                {tags.length > 0 && (
                  <div className="card-tags">
                    {tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="tag">
                        #{tag}
                      </span>
                    ))}
                    {tags.length > 3 && (
                      <span className="tag-more">+{tags.length - 3}</span>
                    )}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="card-actions">
                  <button
                    className="action-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openWebPage(url);
                    }}
                    title="打开网页"
                  >
                    🌐 打开
                  </button>
                  <button
                    className="action-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyUrl(url);
                    }}
                    title="复制链接"
                  >
                    📋 复制
                  </button>
                  {onDelete && (
                    <button
                      className="action-button delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(clip.id);
                      }}
                      title="删除"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * 渲染列表布局
   */
  const renderList = () => {
    const filtered = getFilteredClips();

    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">🔖</div>
          <p>没有找到匹配的网页剪藏</p>
        </div>
      );
    }

    return (
      <div className="bookmark-list">
        {filtered.map((clip, index) => {
          const url = clip.metadata?.url || '';
          const domain = getDomain(url);
          const faviconUrl = getFaviconUrl(url);
          const title = clip.caption || clip.filename || 'Untitled';
          const description = clip.metadata?.description || '';
          const tags = (clip.metadata?.tags as string[]) || [];

          return (
            <div
              key={clip.id}
              className="bookmark-list-item"
              onClick={() => onAttachmentClick?.(clip, index)}
            >
              {/* Favicon */}
              <div className="list-favicon">
                {faviconUrl ? (
                  <img src={faviconUrl} alt={domain} />
                ) : (
                  <span className="favicon-placeholder">🌐</span>
                )}
              </div>

              {/* 信息 */}
              <div className="list-info">
                <h3 className="list-title">{title}</h3>
                <div className="list-url">{url}</div>
                {description && <p className="list-description">{description}</p>}
                {tags.length > 0 && (
                  <div className="list-tags">
                    {tags.map((tag) => (
                      <span key={tag} className="tag-small">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 操作 */}
              <div className="list-actions">
                <button
                  className="action-btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    openWebPage(url);
                  }}
                  title="打开"
                >
                  🌐
                </button>
                <button
                  className="action-btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyUrl(url);
                  }}
                  title="复制"
                >
                  📋
                </button>
                {onDelete && (
                  <button
                    className="action-btn-small delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(clip.id);
                    }}
                    title="删除"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * 渲染瀑布流布局
   */
  const renderMasonry = () => {
    const filtered = getFilteredClips();

    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">🔖</div>
          <p>没有找到匹配的网页剪藏</p>
        </div>
      );
    }

    // 简化实现：使用 CSS Grid 模拟瀑布流
    // 完整版本需要使用 Masonry 库或 CSS Grid Layout
    return (
      <div className="bookmark-masonry">
        {filtered.map((clip, index) => {
          const url = clip.metadata?.url || '';
          const domain = getDomain(url);
          const faviconUrl = getFaviconUrl(url);
          const title = clip.caption || clip.filename || 'Untitled';
          const description = clip.metadata?.description || '';
          const content = clip.metadata?.content || '';
          const tags = (clip.metadata?.tags as string[]) || [];

          return (
            <div
              key={clip.id}
              className="masonry-card"
              onClick={() => onAttachmentClick?.(clip, index)}
            >
              {/* Favicon + 域名 */}
              <div className="masonry-header">
                {faviconUrl && <img src={faviconUrl} alt={domain} className="favicon" />}
                <span className="domain">{domain}</span>
              </div>

              {/* 缩略图 */}
              {clip.thumbnailPath && (
                <img
                  src={clip.thumbnailPath}
                  alt={title}
                  className="masonry-thumbnail"
                />
              )}

              {/* 标题 */}
              <h3 className="masonry-title">{title}</h3>

              {/* 描述 */}
              {description && <p className="masonry-description">{description}</p>}

              {/* 内容预览 */}
              {content && (
                <div className="masonry-content">{content.slice(0, 200)}...</div>
              )}

              {/* 标签 */}
              {tags.length > 0 && (
                <div className="masonry-tags">
                  {tags.map((tag) => (
                    <span key={tag} className="tag">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 操作 */}
              <div className="masonry-actions">
                <button
                  className="action-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openWebPage(url);
                  }}
                >
                  🌐 打开
                </button>
                <button
                  className="action-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyUrl(url);
                  }}
                >
                  📋 复制
                </button>
                {onDelete && (
                  <button
                    className="action-button delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(clip.id);
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * 空状态
   */
  if (webClips.length === 0) {
    return (
      <div className="bookmark-view-empty">
        <div className="empty-icon">🔖</div>
        <p>暂无网页剪藏</p>
      </div>
    );
  }

  return (
    <div className={`bookmark-view ${className}`}>
      {/* 工具栏 */}
      <div className="toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="搜索标题、链接或内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="tag-filter">
          <button
            className={`tag-filter-btn ${selectedTag === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedTag('all')}
          >
            全部
          </button>
          {allTags.slice(0, 5).map((tag) => (
            <button
              key={tag}
              className={`tag-filter-btn ${selectedTag === tag ? 'active' : ''}`}
              onClick={() => setSelectedTag(tag)}
            >
              #{tag}
            </button>
          ))}
          {allTags.length > 5 && (
            <button className="tag-filter-btn">+{allTags.length - 5} 标签</button>
          )}
        </div>

        <div className="result-count">
          {getFilteredClips().length} / {webClips.length} 条剪藏
        </div>
      </div>

      {/* 内容区 */}
      <div className="content-area">
        {layout === 'cards' && renderCards()}
        {layout === 'list' && renderList()}
        {layout === 'masonry' && renderMasonry()}
      </div>

      <style>{`
        .bookmark-view {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary, white);
        }

        /* 工具栏 */
        .toolbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 24px;
          background: var(--bg-secondary, #f5f5f5);
          border-bottom: 1px solid var(--border-color, #e0e0e0);
          flex-wrap: wrap;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 200px;
          max-width: 400px;
          padding: 8px 16px;
          background: white;
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 8px;
        }

        .search-icon {
          font-size: 16px;
        }

        .search-box input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 14px;
        }

        .tag-filter {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .tag-filter-btn {
          padding: 6px 12px;
          background: white;
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tag-filter-btn:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .tag-filter-btn.active {
          background: var(--primary-color, #007bff);
          color: white;
          border-color: var(--primary-color, #007bff);
        }

        .result-count {
          font-size: 13px;
          color: var(--text-secondary, #888);
          margin-left: auto;
        }

        /* 内容区 */
        .content-area {
          flex: 1;
          overflow: auto;
          padding: 24px;
        }

        /* 卡片布局 */
        .bookmark-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }

        .bookmark-card {
          background: white;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .bookmark-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .card-thumbnail {
          width: 100%;
          height: 160px;
          background: var(--bg-secondary, #f5f5f5);
          overflow: hidden;
        }

        .card-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .thumbnail-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .placeholder-icon {
          font-size: 64px;
          opacity: 0.3;
        }

        .card-content {
          padding: 16px;
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .favicon {
          width: 20px;
          height: 20px;
          border-radius: 4px;
        }

        .domain {
          font-size: 12px;
          color: var(--text-secondary, #888);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .card-title {
          margin: 0 0 8px 0;
          font-size: 15px;
          font-weight: 600;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-description {
          margin: 0 0 12px 0;
          font-size: 13px;
          color: var(--text-secondary, #666);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 12px;
        }

        .tag {
          padding: 4px 8px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 6px;
          font-size: 11px;
          color: var(--primary-color, #007bff);
          font-weight: 500;
        }

        .tag-more {
          padding: 4px 8px;
          font-size: 11px;
          color: var(--text-secondary, #888);
        }

        .card-actions {
          display: flex;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid var(--border-color, #e0e0e0);
        }

        .action-button {
          flex: 1;
          padding: 8px;
          background: var(--bg-secondary, #f5f5f5);
          border: none;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .action-button:hover {
          background: var(--bg-hover, #e0e0e0);
        }

        .action-button.delete:hover {
          background: #fee;
          color: #c00;
        }

        /* 列表布局 */
        .bookmark-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .bookmark-list-item {
          display: flex;
          gap: 16px;
          padding: 16px;
          background: white;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .bookmark-list-item:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .list-favicon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .list-favicon img {
          width: 32px;
          height: 32px;
          border-radius: 6px;
        }

        .favicon-placeholder {
          font-size: 32px;
        }

        .list-info {
          flex: 1;
          min-width: 0;
        }

        .list-title {
          margin: 0 0 6px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .list-url {
          font-size: 12px;
          color: var(--primary-color, #007bff);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-bottom: 8px;
        }

        .list-description {
          margin: 0 0 8px 0;
          font-size: 13px;
          color: var(--text-secondary, #666);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .list-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .tag-small {
          padding: 2px 6px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 4px;
          font-size: 11px;
          color: var(--primary-color, #007bff);
        }

        .list-actions {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex-shrink: 0;
        }

        .action-btn-small {
          padding: 6px;
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.2s ease;
        }

        .action-btn-small:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .action-btn-small.delete:hover {
          background: #fee;
        }

        /* 瀑布流布局 */
        .bookmark-masonry {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 20px;
          grid-auto-flow: dense;
        }

        .masonry-card {
          background: white;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .masonry-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .masonry-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .masonry-thumbnail {
          width: 100%;
          height: auto;
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .masonry-title {
          margin: 0 0 8px 0;
          font-size: 15px;
          font-weight: 600;
          line-height: 1.4;
        }

        .masonry-description {
          margin: 0 0 8px 0;
          font-size: 13px;
          color: var(--text-secondary, #666);
          line-height: 1.5;
        }

        .masonry-content {
          margin-bottom: 12px;
          font-size: 12px;
          color: var(--text-secondary, #888);
          line-height: 1.6;
        }

        .masonry-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 12px;
        }

        .masonry-actions {
          display: flex;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid var(--border-color, #e0e0e0);
        }

        /* 空状态 */
        .bookmark-view-empty,
        .empty-state {
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
          opacity: 0.5;
        }

        @media (max-width: 768px) {
          .toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .search-box {
            max-width: none;
          }

          .tag-filter {
            justify-content: flex-start;
          }

          .bookmark-cards,
          .bookmark-masonry {
            grid-template-columns: 1fr;
          }

          .bookmark-list-item {
            flex-direction: column;
          }

          .list-actions {
            flex-direction: row;
          }
        }
      `}</style>
    </div>
  );
};

export default BookmarkView;
