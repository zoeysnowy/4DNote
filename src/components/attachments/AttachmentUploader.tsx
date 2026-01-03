/**
 * 附件上传组件
 * 
 * 功能：
 * - 拖拽上传
 * - 点击上传
 * - 多文件上传
 * - 上传进度显示
 * - 附件列表展示
 * - 附件预览
 * 
 * @version 1.0.0
 * @date 2025-12-02
 */

import React, { useState, useRef, useCallback } from 'react';
import { attachmentService } from '@backend/AttachmentService';
import type { Attachment } from '@frontend/types';
import './AttachmentUploader.css';

interface AttachmentUploaderProps {
  eventId: string;
  attachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

export const AttachmentUploader: React.FC<AttachmentUploaderProps> = ({
  eventId,
  attachments = [],
  onAttachmentsChange,
  maxFiles = 10,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * 处理文件选择
   */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (disabled || uploading) return;

    const fileArray = Array.from(files);
    
    // 检查文件数量限制
    if (attachments.length + fileArray.length > maxFiles) {
      alert(`最多只能上传 ${maxFiles} 个附件`);
      return;
    }

    setUploading(true);

    const newAttachments: Attachment[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      try {
        // 验证文件
        const validation = attachmentService.validateFile(file);
        if (!validation.valid) {
          errors.push(`${file.name}: ${validation.error}`);
          continue;
        }

        // 上传文件
        console.log('[AttachmentUploader] 开始上传:', file.name);
        const attachment = await attachmentService.uploadAttachment(file, {
          eventId,
          generateThumbnail: true,
          extractText: false,
        });

        newAttachments.push(attachment);
        console.log('[AttachmentUploader] ✅ 上传成功:', file.name);

      } catch (error) {
        console.error('[AttachmentUploader] ❌ 上传失败:', file.name, error);
        errors.push(`${file.name}: ${error instanceof Error ? error.message : '上传失败'}`);
      }
    }

    setUploading(false);
    setUploadProgress({});

    // 显示错误
    if (errors.length > 0) {
      alert('部分文件上传失败:\n' + errors.join('\n'));
    }

    // 通知父组件
    if (newAttachments.length > 0 && onAttachmentsChange) {
      onAttachmentsChange([...attachments, ...newAttachments]);
    }

  }, [eventId, attachments, maxFiles, disabled, uploading, onAttachmentsChange]);

  /**
   * 拖拽进入
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !uploading) {
      setIsDragging(true);
    }
  }, [disabled, uploading]);

  /**
   * 拖拽离开
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  /**
   * 拖拽悬停
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * 文件放下
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || uploading) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [disabled, uploading, handleFiles]);

  /**
   * 点击上传
   */
  const handleClick = useCallback(() => {
    if (!disabled && !uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled, uploading]);

  /**
   * 文件输入变化
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFiles]);

  /**
   * 删除附件
   */
  const handleDelete = useCallback(async (attachment: Attachment) => {
    if (disabled || uploading) return;

    const confirmed = window.confirm(`确定要删除附件 "${attachment.filename}" 吗？`);
    if (!confirmed) return;

    try {
      await attachmentService.deleteAttachment(attachment.id);
      
      // 更新附件列表
      const newAttachments = attachments.filter(a => a.id !== attachment.id);
      if (onAttachmentsChange) {
        onAttachmentsChange(newAttachments);
      }

      console.log('[AttachmentUploader] ✅ 附件已删除:', attachment.filename);

    } catch (error) {
      console.error('[AttachmentUploader] ❌ 删除失败:', error);
      alert('删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }, [attachments, disabled, uploading, onAttachmentsChange]);

  /**
   * 预览/打开附件
   */
  const handleOpen = useCallback(async (attachment: Attachment) => {
    try {
      await attachmentService.openAttachment(attachment.id);
    } catch (error) {
      console.error('[AttachmentUploader] ❌ 打开失败:', error);
      alert('打开失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }, []);

  return (
    <div className="attachment-uploader">
      {/* 上传区域 */}
      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''} ${disabled ? 'disabled' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={attachmentService.getAcceptString()}
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
          disabled={disabled}
        />

        <div className="upload-icon">
          {uploading ? '⏳' : '📎'}
        </div>

        <div className="upload-text">
          {uploading ? (
            <span>正在上传...</span>
          ) : (
            <>
              <span className="upload-text-primary">
                点击上传或拖拽文件到此处
              </span>
              <span className="upload-text-secondary">
                支持图片、音频、视频、文档（最多 {maxFiles} 个）
              </span>
            </>
          )}
        </div>
      </div>

      {/* 附件列表 */}
      {attachments.length > 0 && (
        <div className="attachment-list">
          <div className="attachment-list-header">
            附件列表 ({attachments.length}/{maxFiles})
          </div>
          {attachments.map((attachment) => (
            <div key={attachment.id} className="attachment-item">
              <div className="attachment-icon">
                {attachmentService.getFileIcon(attachment.mimeType)}
              </div>
              <div className="attachment-info">
                <div className="attachment-name" title={attachment.filename}>
                  {attachment.filename}
                </div>
                <div className="attachment-meta">
                  {attachmentService.formatFileSize(attachment.size)}
                  {' • '}
                  {new Date(attachment.uploadedAt).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              <div className="attachment-actions">
                <button
                  className="attachment-action-btn open"
                  onClick={() => handleOpen(attachment)}
                  disabled={disabled}
                  title="打开"
                >
                  👁️
                </button>
                <button
                  className="attachment-action-btn delete"
                  onClick={() => handleDelete(attachment)}
                  disabled={disabled || uploading}
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttachmentUploader;
