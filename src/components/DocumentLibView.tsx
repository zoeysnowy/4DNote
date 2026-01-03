import React, { useState, useEffect, useRef } from 'react';
import { Attachment, AttachmentType } from '../types';

interface DocumentLibViewProps {
  eventId: string;
  attachments: Attachment[];
  onAttachmentClick?: (attachment: Attachment, index: number) => void;
  onDelete?: (attachmentId: string) => void;
  layout?: 'grid' | 'list' | 'preview';
  className?: string;
}

/**
 * 文档库查看组件
 * 
 * 功能：
 * - 文档列表展示（网格/列表/预览）
 * - PDF 预览（PDF.js 集成）
 * - OCR 文本搜索
 * - 下载/打开文档
 * - 文档分类（PDF/Word/Excel/PPT/其他）
 * 
 * 布局模式：
 * - grid: 文档卡片网格（缩略图 + 文件名 + 元信息）
 * - list: 详细列表（图标 + 文件名 + 大小 + 日期 + 操作）
 * - preview: 预览模式（左侧列表 + 右侧预览窗口）
 * 
 * @example
 * ```tsx
 * <DocumentLibView
 *   eventId="event-123"
 *   attachments={documentAttachments}
 *   layout="preview"
 * />
 * ```
 */
export const DocumentLibView: React.FC<DocumentLibViewProps> = ({
  eventId,
  attachments,
  onAttachmentClick,
  onDelete,
  layout = 'grid',
  className = '',
}) => {
  const [documents, setDocuments] = useState<Attachment[]>([]);
  const [documentPaths, setDocumentPaths] = useState<Map<string, string>>(new Map());
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pdf' | 'word' | 'excel' | 'ppt' | 'other'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  /**
   * 过滤文档类型附件
   */
  useEffect(() => {
    const docs = attachments.filter((att) => att.type === AttachmentType.DOCUMENT);
    setDocuments(docs);

    if (docs.length > 0 && !currentDocId && layout === 'preview') {
      setCurrentDocId(docs[0].id);
    }
  }, [attachments, layout]);

  /**
   * 加载文档路径
   */
  useEffect(() => {
    const loadDocumentPaths = async () => {
      const paths = new Map<string, string>();

      for (const doc of documents) {
        try {
          const result = await (window as any).electronAPI?.invoke('attachment:getPath', doc.id);
          if (result?.success && result.path) {
            paths.set(doc.id, result.path);
          }
        } catch (error) {
          console.error('Failed to load document path:', doc.id, error);
        }
      }

      setDocumentPaths(paths);
    };

    if (documents.length > 0) {
      loadDocumentPaths();
    }
  }, [documents]);

  /**
   * 获取文档类型
   */
  const getDocumentType = (filename: string): 'pdf' | 'word' | 'excel' | 'ppt' | 'other' => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
    if (['ppt', 'pptx'].includes(ext)) return 'ppt';
    return 'other';
  };

  /**
   * 获取文档图标
   */
  const getDocumentIcon = (type: string): string => {
    switch (type) {
      case 'pdf':
        return '📕';
      case 'word':
        return '📘';
      case 'excel':
        return '📗';
      case 'ppt':
        return '📙';
      default:
        return '📄';
    }
  };

  /**
   * 过滤文档
   */
  const getFilteredDocuments = (): Attachment[] => {
    let filtered = documents;

    // 按类型过滤
    if (filterType !== 'all') {
      filtered = filtered.filter((doc) => getDocumentType(doc.filename) === filterType);
    }

    // 按搜索关键词过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (doc) =>
          doc.filename.toLowerCase().includes(query) ||
          doc.caption?.toLowerCase().includes(query) ||
          doc.metadata?.ocrText?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  /**
   * 格式化文件大小
   */
  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /**
   * 打开文档
   */
  const openDocument = async (doc: Attachment) => {
    const path = documentPaths.get(doc.id);
    if (!path) {
      alert('文档路径未找到');
      return;
    }

    try {
      await (window as any).electronAPI?.invoke('shell:openPath', path);
    } catch (error) {
      console.error('Failed to open document:', error);
      alert('打开文档失败');
    }
  };

  /**
   * 下载文档
   */
  const downloadDocument = async (doc: Attachment) => {
    const path = documentPaths.get(doc.id);
    if (!path) {
      alert('文档路径未找到');
      return;
    }

    try {
      await (window as any).electronAPI?.invoke('shell:showItemInFolder', path);
    } catch (error) {
      console.error('Failed to show document:', error);
      alert('显示文档失败');
    }
  };

  /**
   * 删除文档
   */
  const handleDelete = (documentId: string) => {
    if (!confirm('确定要删除这个文档吗？')) return;
    onDelete?.(documentId);
  };

  /**
   * 在预览窗口中加载 PDF
   */
  const loadPdfPreview = async (doc: Attachment) => {
    setIsLoading(true);
    setCurrentDocId(doc.id);

    const path = documentPaths.get(doc.id);
    if (!path) {
      setIsLoading(false);
      return;
    }

    // 注意：这里需要集成 PDF.js
    // 实际实现中需要配置 PDF.js worker 和 viewer
    // 此处为简化示例，仅显示文件路径
    if (previewIframeRef.current) {
      // 如果有 PDF.js viewer，可以这样加载：
      // previewIframeRef.current.src = `/pdfjs/web/viewer.html?file=${encodeURIComponent(path)}`;
      
      // 临时方案：直接加载 PDF（某些浏览器支持）
      previewIframeRef.current.src = `file://${path}`;
    }

    setIsLoading(false);
  };

  /**
   * 渲染网格布局
   */
  const renderGrid = () => {
    const filtered = getFilteredDocuments();

    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p>没有找到匹配的文档</p>
        </div>
      );
    }

    return (
      <div className="document-grid">
        {filtered.map((doc, index) => {
          const docType = getDocumentType(doc.filename);
          const icon = getDocumentIcon(docType);

          return (
            <div
              key={doc.id}
              className="document-card"
              onClick={() => onAttachmentClick?.(doc, index)}
            >
              <div className="card-thumbnail">
                {doc.thumbnailPath ? (
                  <img src={doc.thumbnailPath} alt={doc.filename} />
                ) : (
                  <div className="icon-placeholder">{icon}</div>
                )}
              </div>

              <div className="card-content">
                <div className="card-title" title={doc.filename}>
                  {doc.caption || doc.filename}
                </div>

                <div className="card-meta">
                  <span className="doc-type">{docType.toUpperCase()}</span>
                  <span className="doc-size">{formatFileSize(doc.fileSize)}</span>
                </div>

                {doc.metadata?.ocrText && (
                  <div className="ocr-badge" title="已提取文本">
                    🔍 可搜索
                  </div>
                )}

                <div className="card-actions">
                  <button
                    className="action-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDocument(doc);
                    }}
                    title="打开"
                  >
                    📂
                  </button>
                  <button
                    className="action-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadDocument(doc);
                    }}
                    title="定位文件"
                  >
                    📍
                  </button>
                  {onDelete && (
                    <button
                      className="action-button delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id);
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
    const filtered = getFilteredDocuments();

    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p>没有找到匹配的文档</p>
        </div>
      );
    }

    return (
      <div className="document-list">
        <div className="list-header">
          <div className="col col-icon"></div>
          <div className="col col-name">文件名</div>
          <div className="col col-type">类型</div>
          <div className="col col-size">大小</div>
          <div className="col col-date">日期</div>
          <div className="col col-actions">操作</div>
        </div>

        {filtered.map((doc, index) => {
          const docType = getDocumentType(doc.filename);
          const icon = getDocumentIcon(docType);

          return (
            <div
              key={doc.id}
              className="list-row"
              onClick={() => onAttachmentClick?.(doc, index)}
            >
              <div className="col col-icon">
                <span className="doc-icon">{icon}</span>
              </div>
              <div className="col col-name">
                <span className="filename" title={doc.filename}>
                  {doc.caption || doc.filename}
                </span>
                {doc.metadata?.ocrText && (
                  <span className="ocr-badge-inline" title="已提取文本">
                    🔍
                  </span>
                )}
              </div>
              <div className="col col-type">{docType.toUpperCase()}</div>
              <div className="col col-size">{formatFileSize(doc.fileSize)}</div>
              <div className="col col-date">
                {doc.timestamp
                  ? new Date(doc.timestamp).toLocaleDateString('zh-CN')
                  : 'N/A'}
              </div>
              <div className="col col-actions">
                <button
                  className="action-button-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDocument(doc);
                  }}
                  title="打开"
                >
                  📂
                </button>
                <button
                  className="action-button-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadDocument(doc);
                  }}
                  title="定位"
                >
                  📍
                </button>
                {onDelete && (
                  <button
                    className="action-button-small delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc.id);
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
   * 渲染预览布局
   */
  const renderPreview = () => {
    const filtered = getFilteredDocuments();

    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p>没有找到匹配的文档</p>
        </div>
      );
    }

    const currentDoc = filtered.find((doc) => doc.id === currentDocId);
    const currentDocType = currentDoc ? getDocumentType(currentDoc.filename) : 'other';

    return (
      <div className="preview-layout">
        {/* 左侧文档列表 */}
        <div className="preview-sidebar">
          {filtered.map((doc) => {
            const docType = getDocumentType(doc.filename);
            const icon = getDocumentIcon(docType);

            return (
              <div
                key={doc.id}
                className={`preview-item ${doc.id === currentDocId ? 'active' : ''}`}
                onClick={() => loadPdfPreview(doc)}
              >
                <span className="preview-icon">{icon}</span>
                <div className="preview-info">
                  <div className="preview-title" title={doc.filename}>
                    {doc.caption || doc.filename}
                  </div>
                  <div className="preview-meta">
                    {formatFileSize(doc.fileSize)} · {docType.toUpperCase()}
                  </div>
                </div>
                {doc.metadata?.ocrText && <span className="ocr-indicator">🔍</span>}
              </div>
            );
          })}
        </div>

        {/* 右侧预览窗口 */}
        <div className="preview-content">
          {isLoading ? (
            <div className="preview-loading">
              <div className="loading-spinner">⏳</div>
              <p>加载中...</p>
            </div>
          ) : currentDoc ? (
            <>
              <div className="preview-header">
                <h3>{currentDoc.caption || currentDoc.filename}</h3>
                <div className="preview-actions">
                  <button
                    className="preview-button"
                    onClick={() => openDocument(currentDoc)}
                  >
                    📂 打开
                  </button>
                  <button
                    className="preview-button"
                    onClick={() => downloadDocument(currentDoc)}
                  >
                    📍 定位
                  </button>
                  {onDelete && (
                    <button
                      className="preview-button delete"
                      onClick={() => handleDelete(currentDoc.id)}
                    >
                      🗑️ 删除
                    </button>
                  )}
                </div>
              </div>

              <div className="preview-viewer">
                {currentDocType === 'pdf' ? (
                  <iframe
                    ref={previewIframeRef}
                    className="pdf-iframe"
                    title="PDF Preview"
                  />
                ) : (
                  <div className="unsupported-preview">
                    <div className="unsupported-icon">{getDocumentIcon(currentDocType)}</div>
                    <p>此类型文档暂不支持在线预览</p>
                    <button className="open-external" onClick={() => openDocument(currentDoc)}>
                      📂 用外部程序打开
                    </button>
                  </div>
                )}
              </div>

              {/* OCR 文本 */}
              {currentDoc.metadata?.ocrText && (
                <div className="ocr-section">
                  <h4>提取的文本内容</h4>
                  <div className="ocr-text">{currentDoc.metadata.ocrText}</div>
                </div>
              )}
            </>
          ) : (
            <div className="preview-placeholder">
              <div className="placeholder-icon">📄</div>
              <p>请选择一个文档进行预览</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  /**
   * 空状态
   */
  if (documents.length === 0) {
    return (
      <div className="document-lib-empty">
        <div className="empty-icon">📚</div>
        <p>暂无文档</p>
      </div>
    );
  }

  return (
    <div className={`document-lib-view ${className}`}>
      {/* 工具栏 */}
      <div className="toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="搜索文件名或内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-buttons">
          <button
            className={`filter-button ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            全部
          </button>
          <button
            className={`filter-button ${filterType === 'pdf' ? 'active' : ''}`}
            onClick={() => setFilterType('pdf')}
          >
            📕 PDF
          </button>
          <button
            className={`filter-button ${filterType === 'word' ? 'active' : ''}`}
            onClick={() => setFilterType('word')}
          >
            📘 Word
          </button>
          <button
            className={`filter-button ${filterType === 'excel' ? 'active' : ''}`}
            onClick={() => setFilterType('excel')}
          >
            📗 Excel
          </button>
          <button
            className={`filter-button ${filterType === 'ppt' ? 'active' : ''}`}
            onClick={() => setFilterType('ppt')}
          >
            📙 PPT
          </button>
        </div>

        <div className="result-count">
          {getFilteredDocuments().length} / {documents.length} 个文档
        </div>
      </div>

      {/* 内容区 */}
      <div className="content-area">
        {layout === 'grid' && renderGrid()}
        {layout === 'list' && renderList()}
        {layout === 'preview' && renderPreview()}
      </div>

      <style>{`
        .document-lib-view {
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

        .filter-buttons {
          display: flex;
          gap: 8px;
        }

        .filter-button {
          padding: 8px 16px;
          background: white;
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .filter-button:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .filter-button.active {
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

        /* 网格布局 */
        .document-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 20px;
        }

        .document-card {
          background: white;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .document-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .card-thumbnail {
          width: 100%;
          height: 150px;
          background: var(--bg-secondary, #f5f5f5);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .icon-placeholder {
          font-size: 64px;
        }

        .card-content {
          padding: 12px;
        }

        .card-title {
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .card-meta {
          display: flex;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary, #888);
          margin-bottom: 8px;
        }

        .doc-type {
          padding: 2px 6px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 4px;
          font-weight: 600;
        }

        .ocr-badge {
          font-size: 11px;
          color: var(--primary-color, #007bff);
          margin-bottom: 8px;
        }

        .card-actions {
          display: flex;
          gap: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--border-color, #e0e0e0);
        }

        .action-button {
          flex: 1;
          padding: 6px;
          background: var(--bg-secondary, #f5f5f5);
          border: none;
          border-radius: 6px;
          font-size: 16px;
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
        .document-list {
          background: white;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 12px;
          overflow: hidden;
        }

        .list-header,
        .list-row {
          display: grid;
          grid-template-columns: 50px 2fr 100px 100px 120px 120px;
          gap: 12px;
          padding: 12px 16px;
          align-items: center;
        }

        .list-header {
          background: var(--bg-secondary, #f5f5f5);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary, #666);
        }

        .list-row {
          border-top: 1px solid var(--border-color, #e0e0e0);
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .list-row:hover {
          background: var(--bg-hover, #f8f8f8);
        }

        .doc-icon {
          font-size: 24px;
        }

        .col-name {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filename {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ocr-badge-inline {
          font-size: 14px;
        }

        .col-actions {
          display: flex;
          gap: 4px;
        }

        .action-button-small {
          padding: 4px 8px;
          background: none;
          border: none;
          font-size: 14px;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.2s ease;
        }

        .action-button-small:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .action-button-small.delete:hover {
          background: #fee;
        }

        /* 预览布局 */
        .preview-layout {
          display: flex;
          height: 100%;
          gap: 0;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 12px;
          overflow: hidden;
          background: white;
        }

        .preview-sidebar {
          width: 280px;
          background: var(--bg-secondary, #f5f5f5);
          border-right: 1px solid var(--border-color, #e0e0e0);
          overflow-y: auto;
        }

        .preview-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          cursor: pointer;
          transition: background 0.2s ease;
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }

        .preview-item:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .preview-item.active {
          background: var(--primary-color, #007bff);
          color: white;
        }

        .preview-icon {
          font-size: 32px;
          flex-shrink: 0;
        }

        .preview-info {
          flex: 1;
          min-width: 0;
        }

        .preview-title {
          font-size: 13px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-bottom: 4px;
        }

        .preview-meta {
          font-size: 11px;
          opacity: 0.7;
        }

        .ocr-indicator {
          font-size: 14px;
        }

        .preview-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          background: var(--bg-secondary, #f5f5f5);
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }

        .preview-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .preview-actions {
          display: flex;
          gap: 8px;
        }

        .preview-button {
          padding: 8px 16px;
          background: white;
          border: 1px solid var(--border-color, #d0d0d0);
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .preview-button:hover {
          background: var(--bg-hover, #e8e8e8);
        }

        .preview-button.delete:hover {
          background: #fee;
          color: #c00;
          border-color: #faa;
        }

        .preview-viewer {
          flex: 1;
          position: relative;
          background: #525659;
          overflow: hidden;
        }

        .pdf-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }

        .unsupported-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: white;
          text-align: center;
        }

        .unsupported-icon {
          font-size: 96px;
          margin-bottom: 24px;
        }

        .open-external {
          margin-top: 24px;
          padding: 12px 24px;
          background: white;
          color: #333;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        }

        .ocr-section {
          padding: 16px 24px;
          background: var(--bg-secondary, #f5f5f5);
          border-top: 1px solid var(--border-color, #e0e0e0);
          max-height: 200px;
          overflow-y: auto;
        }

        .ocr-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
        }

        .ocr-text {
          font-size: 13px;
          line-height: 1.6;
          color: var(--text-secondary, #666);
        }

        .preview-loading,
        .preview-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
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

        .placeholder-icon {
          font-size: 96px;
          margin-bottom: 16px;
          opacity: 0.3;
        }

        /* 空状态 */
        .document-lib-empty,
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

          .filter-buttons {
            flex-wrap: wrap;
          }

          .document-grid {
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          }

          .list-header,
          .list-row {
            grid-template-columns: 40px 1fr 80px 100px;
          }

          .col-type,
          .col-date {
            display: none;
          }

          .preview-layout {
            flex-direction: column;
          }

          .preview-sidebar {
            width: 100%;
            height: 200px;
            border-right: none;
            border-bottom: 1px solid var(--border-color, #e0e0e0);
          }
        }
      `}</style>
    </div>
  );
};

export default DocumentLibView;
