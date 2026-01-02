/**
 * 附件管理服务
 * 
 * 功能：
 * - 支持图片、音频、视频、文档上传
 * - 自动缩略图生成（图片）
 * - 文件预览
 * - 本地存储 + 云端同步
 * - OCR文本提取（图片/PDF）
 * 
 * @version 1.0.0
 * @date 2025-12-02
 */

import { generateAttachmentId } from '../utils/idGenerator';
import type { Attachment } from '../types';

import { AttachmentType } from '../types';
import { formatTimeForStorage } from '../utils/timeUtils';

/**
 * 支持的文件类型配置
 */
export const SUPPORTED_FILE_TYPES = {
  'voice-recording': {
    mimeTypes: ['audio/webm', 'audio/wav', 'audio/ogg'],
    extensions: ['.webm', '.wav', '.ogg'],
    maxSize: 500 * 1024 * 1024, // 500MB（长时间会议）
    icon: '🎤',
    viewMode: 'transcript' as const,
  },
  image: {
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'],
    maxSize: 50 * 1024 * 1024, // 50MB
    icon: '🖼️',
    viewMode: 'gallery' as const,
  },
  audio: {
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'],
    extensions: ['.mp3', '.wav', '.webm', '.ogg', '.m4a'],
    maxSize: 100 * 1024 * 1024, // 100MB
    icon: '🎵',
    viewMode: 'audio-stream' as const,
  },
  video: {
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
    extensions: ['.mp4', '.mov', '.avi', '.webm'],
    maxSize: 2 * 1024 * 1024 * 1024, // 2GB
    icon: '🎥',
    viewMode: 'video-stream' as const,
  },
  document: {
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ],
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'],
    maxSize: 100 * 1024 * 1024, // 100MB
    icon: '📄',
    viewMode: 'document-lib' as const,
  },
  'web-clip': {
    mimeTypes: ['text/html'],
    extensions: ['.html', '.htm', '.mhtml'],
    maxSize: 50 * 1024 * 1024, // 50MB
    icon: '📺',
    viewMode: 'bookmark' as const,
  },
} as const;

/**
 * 文件验证结果
 */
interface FileValidationResult {
  valid: boolean;
  error?: string;
  fileType?: 'image' | 'video' | 'audio' | 'document';
}

/**
 * 附件上传选项
 */
interface UploadOptions {
  eventId: string;
  type?: AttachmentType;        // 明确指定附件类型（可选，不指定则自动检测）
  generateThumbnail?: boolean;  // 是否生成缩略图（仅图片/视频，默认 true）
  extractText?: boolean;        // 是否提取文本（图片/PDF）
  compress?: boolean;           // 是否压缩（图片/视频）
  timestamp?: string;           // 拍摄/上传时间（从 EXIF 或当前时间）
  caption?: string;             // 图片说明/视频描述
  transcriptData?: any;         // 语音转录数据（语音记录）
  linkedEventId?: string;       // 关联事件 ID（子事件）
  webUrl?: string;              // 网页原始 URL（网页剪藏）
  webTitle?: string;            // 网页标题（网页剪藏）
}

/**
 * 批量上传结果
 */
interface BatchUploadResult {
  succeeded: Attachment[];
  failed: Array<{ file: File; error: string }>;
  totalSize: number;
  duration: number;
}

/**
 * 附件服务类
 */
class AttachmentService {
  private static instance: AttachmentService;
  
  // Electron IPC 是否可用
  private isElectron: boolean;
  
  private constructor() {
    this.isElectron = typeof window !== 'undefined' && 
                      (window as any).electronAPI !== undefined;
    
    if (!this.isElectron) {
      console.warn('[AttachmentService] Electron not available, some features disabled');
    }
  }
  
  /**
   * 调用 Electron IPC
   */
  private async invoke<T = any>(channel: string, ...args: any[]): Promise<T> {
    if (!this.isElectron) {
      throw new Error('Electron API not available');
    }
    return (window as any).electronAPI.invoke(channel, ...args);
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(): AttachmentService {
    if (!AttachmentService.instance) {
      AttachmentService.instance = new AttachmentService();
    }
    return AttachmentService.instance;
  }
  
  /**
   * 验证文件
   */
  public validateFile(file: File): FileValidationResult {
    // 1. 检查文件大小（不能为0）
    if (file.size === 0) {
      return { valid: false, error: '文件大小为0' };
    }
    
    // 2. 检查文件类型
    const fileType = this.detectFileType(file);
    if (!fileType) {
      return { valid: false, error: '不支持的文件类型' };
    }
    
    // 3. 检查文件大小限制
    const maxSize = SUPPORTED_FILE_TYPES[fileType].maxSize;
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / 1024 / 1024);
      return { 
        valid: false, 
        error: `文件过大，${fileType} 类型最大支持 ${maxSizeMB}MB` 
      };
    }
    
    return { valid: true, fileType };
  }
  
  /**
   * 检测文件类型（兼容旧代码）
   */
  private detectFileType(file: File): 'image' | 'video' | 'audio' | 'document' | null {
    const mimeType = file.type.toLowerCase();
    const extension = this.getFileExtension(file.name).toLowerCase();
    
    for (const [type, config] of Object.entries(SUPPORTED_FILE_TYPES)) {
      const typedConfig = config as unknown as { mimeTypes: string[]; extensions: string[] };
      if (typedConfig.mimeTypes.includes(mimeType) || typedConfig.extensions.includes(extension)) {
        return type as 'image' | 'video' | 'audio' | 'document';
      }
    }
    
    return null;
  }

  /**
   * 检测附件类型（新版本，支持所有 7 种类型）
   */
  private detectAttachmentType(file: File, explicitType?: AttachmentType): AttachmentType {
    // 如果明确指定类型，使用指定类型
    if (explicitType) {
      return explicitType;
    }

    // 根据 MIME 类型自动检测
    const mimeType = file.type.toLowerCase();

    if (mimeType.startsWith('image/')) return AttachmentType.IMAGE;
    if (mimeType.startsWith('video/')) return AttachmentType.VIDEO;
    if (mimeType.startsWith('audio/')) {
      // 区分语音记录和音频文件（默认音频文件，可通过 explicitType 指定语音）
      return AttachmentType.AUDIO;
    }
    if (mimeType === 'text/html' || mimeType === 'application/x-html') {
      return AttachmentType.WEB_CLIP;
    }
    if (
      mimeType === 'application/pdf' ||
      mimeType.includes('word') ||
      mimeType.includes('excel') ||
      mimeType === 'text/plain'
    ) {
      return AttachmentType.DOCUMENT;
    }

    // 默认文档类型
    return AttachmentType.DOCUMENT;
  }

  /**
   * 类型特定处理（提取元数据）
   */
  private async processFileByType(
    file: File,
    type: AttachmentType,
    options: UploadOptions
  ): Promise<Record<string, any>> {
    switch (type) {
      case AttachmentType.IMAGE:
        return await this.processImage(file);

      case AttachmentType.VIDEO:
        return await this.processVideo(file);

      case AttachmentType.AUDIO:
      case AttachmentType.VOICE_RECORDING:
        return await this.processAudio(file, type === AttachmentType.VOICE_RECORDING);

      case AttachmentType.DOCUMENT:
        return await this.processDocument(file);

      case AttachmentType.WEB_CLIP:
        return await this.processWebClip(file, options);

      case AttachmentType.SUB_EVENT:
        return { linkedEventId: options.linkedEventId };

      default:
        return {};
    }
  }

  /**
   * 处理图片（提取 EXIF、生成缩略图）
   */
  private async processImage(file: File): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    try {
      // 读取图片尺寸
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      await new Promise((resolve, reject) => {
        img.onload = () => {
          result.width = img.naturalWidth;
          result.height = img.naturalHeight;
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        };
        img.onerror = reject;
        img.src = objectUrl;
      });

      // EXIF 数据提取（需要 exif-js 库，简化版本）
      // TODO: 集成 exif-js 或类似库提取完整 EXIF
      result.exifData = {
        DateTimeOriginal: formatTimeForStorage(new Date()), // 临时使用当前时间
        Make: 'Unknown',
        Model: 'Unknown',
      };
    } catch (error) {
      console.error('Image processing error:', error);
    }

    return result;
  }

  /**
   * 处理视频（提取时长、生成缩略图）
   */
  private async processVideo(file: File): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    try {
      const video = document.createElement('video');
      const objectUrl = URL.createObjectURL(file);

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          result.duration = video.duration;
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        };
        video.onerror = reject;
        video.src = objectUrl;
      });
    } catch (error) {
      console.error('Video processing error:', error);
    }

    return result;
  }

  /**
   * 处理音频（提取时长、AI 转录）
   */
  private async processAudio(file: File, isVoiceRecording: boolean): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    try {
      // 提取音频时长
      const audio = new Audio();
      const objectUrl = URL.createObjectURL(file);

      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => {
          result.duration = audio.duration;
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        };
        audio.onerror = reject;
        audio.src = objectUrl;
      });

      // 语音记录需要 AI 转录
      if (isVoiceRecording) {
        result.transcriptData = {
          rawTranscript: '',
          aiSummary: '',
          status: 'processing',
          segments: [],
          keyPoints: [],
          actionItems: [],
        };

        // 异步调用 AI 转录服务
        this.transcribeAudio(file).then((transcript) => {
          result.transcriptData = transcript;
        });
      }
    } catch (error) {
      console.error('Audio processing error:', error);
    }

    return result;
  }

  /**
   * AI 语音转录（异步）
   */
  private async transcribeAudio(file: File): Promise<any> {
    // TODO: 集成 Whisper API 或其他转录服务
    console.log('Transcription service not yet implemented for:', file.name);

    // 模拟 API 响应
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          rawTranscript: '这是 AI 自动生成的转录文本...',
          aiSummary: '会议讨论了项目进展和下一步计划。',
          status: 'completed',
          segments: [
            { start: 0, end: 5, text: '大家好，今天我们讨论...', speaker: 'Speaker 1' },
          ],
          keyPoints: ['项目进展正常', '需要增加人力'],
          actionItems: ['张三负责后端开发', '李四完成UI设计'],
        });
      }, 3000);
    });
  }

  /**
   * 处理文档（提取页数、OCR 文本）
   */
  private async processDocument(file: File): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    // TODO: 集成 PDF.js 提取页数和文本
    // TODO: 集成 Tesseract.js 进行 OCR

    result.pageCount = 1; // 默认值
    result.extractedText = ''; // 需要 OCR 或 PDF 解析

    return result;
  }

  /**
   * 处理网页剪藏（提取标题、favicon）
   */
  private async processWebClip(file: File, options: UploadOptions): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    try {
      const htmlContent = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');

      // 提取标题
      result.webTitle =
        doc.querySelector('title')?.textContent ||
        options.webTitle ||
        'Untitled Web Clip';

      // 提取 favicon
      const faviconLink = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
      result.webFavicon = faviconLink?.getAttribute('href') || '';

      // 提取原始 URL（如果在 meta 标签中）
      const canonicalLink = doc.querySelector('link[rel="canonical"]');
      result.webUrl = canonicalLink?.getAttribute('href') || options.webUrl || '';
    } catch (error) {
      console.error('Web clip processing error:', error);
      result.webTitle = options.webTitle || file.name;
      result.webUrl = options.webUrl || '';
    }

    return result;
  }
  
  /**
   * 获取文件扩展名
   */
  private getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }
  
  /**
   * 上传附件
   */
  public async uploadAttachment(
    file: File,
    options: UploadOptions
  ): Promise<Attachment> {
    // 1. 验证文件
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    console.log('[AttachmentService] 上传附件:', {
      filename: file.name,
      size: this.formatFileSize(file.size),
      type: validation.fileType,
      eventId: options.eventId,
    });
    
    // 2. 读取文件数据
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    
    // 3. 调用 Electron IPC 保存文件
    if (!this.isElectron) {
      throw new Error('附件上传需要 Electron 环境');
    }
    
    const attachmentId = generateAttachmentId();
    const result = await this.invoke<{
      success: boolean;
      localPath: string;
      fullPath: string;
      thumbnailPath: string | null;
      error?: string;
    }>('attachment:save', {
      id: attachmentId,
      eventId: options.eventId,
      filename: file.name,
      mimeType: file.type,
      buffer: Array.from(buffer), // 转换为普通数组（IPC 传输）
      generateThumbnail: validation.fileType === 'image' && options.generateThumbnail !== false,
      extractText: (validation.fileType === 'image' || validation.fileType === 'document') && 
                   options.extractText === true,
    });
    
    if (!result.success) {
      throw new Error(result.error || '附件保存失败');
    }
    
    // 4. 创建附件对象
    const attachment: Attachment = {
      id: attachmentId,
      type: options.type ?? this.detectAttachmentType(file),
      filename: file.name,
      size: file.size,
      fileSize: file.size,
      mimeType: file.type,
      localPath: result.localPath,
      fullPath: result.fullPath,
      thumbnailPath: result.thumbnailPath || undefined,
      status: 'local-only',
      uploadedAt: formatTimeForStorage(new Date()),
      isPinned: false,
      timestamp: options.timestamp || formatTimeForStorage(new Date()),
      caption: options.caption,
    };
    
    console.log('[AttachmentService] ✅ 附件上传成功:', {
      id: attachmentId,
      path: result.localPath,
      thumbnail: result.thumbnailPath,
    });
    
    return attachment;
  }
  
  /**
   * 批量上传附件（支持几百/几千张图片）
   * 
   * 性能优化：
   * - 并发上传（最多 5 个并发）
   * - 自动生成缩略图
   * - 进度回调
   */
  public async uploadMultiple(
    files: File[],
    options: UploadOptions,
    onProgress?: (current: number, total: number, currentFile: string) => void
  ): Promise<BatchUploadResult> {
    const startTime = Date.now();
    const succeeded: Attachment[] = [];
    const failed: Array<{ file: File; error: string }> = [];
    let totalSize = 0;
    
    console.log(`[AttachmentService] 批量上传开始: ${files.length} 个文件`);
    
    // 并发控制（每次最多上传 5 个文件）
    const CONCURRENT_LIMIT = 5;
    const fileQueue = [...files];
    let currentIndex = 0;
    
    const uploadNext = async (): Promise<void> => {
      if (fileQueue.length === 0) return;
      
      const file = fileQueue.shift()!;
      const index = currentIndex++;
      
      try {
        if (onProgress) {
          onProgress(index + 1, files.length, file.name);
        }
        
        // 上传文件
        const attachment = await this.uploadAttachment(file, {
          ...options,
          generateThumbnail: true, // 批量上传默认生成缩略图
        });
        
        succeeded.push(attachment);
        totalSize += file.size;
        
        console.log(`[AttachmentService] ✅ [${index + 1}/${files.length}] ${file.name}`);
        
      } catch (error) {
        failed.push({
          file,
          error: error instanceof Error ? error.message : '未知错误',
        });
        console.error(`[AttachmentService] ❌ [${index + 1}/${files.length}] ${file.name}:`, error);
      }
      
      // 继续上传下一个
      if (fileQueue.length > 0) {
        await uploadNext();
      }
    };
    
    // 启动并发上传
    const workers = Array(Math.min(CONCURRENT_LIMIT, files.length))
      .fill(null)
      .map(() => uploadNext());
    
    await Promise.all(workers);
    
    const duration = Date.now() - startTime;
    
    console.log(`[AttachmentService] 批量上传完成:`, {
      成功: succeeded.length,
      失败: failed.length,
      总大小: this.formatFileSize(totalSize),
      耗时: `${(duration / 1000).toFixed(2)}s`,
      平均速度: `${this.formatFileSize(totalSize / (duration / 1000))}/s`,
    });
    
    return { succeeded, failed, totalSize, duration };
  }
  
  /**
   * 获取附件本地路径（用于预览）
   */
  public async getAttachmentPath(attachmentId: string): Promise<string> {
    const result = await this.invoke<{ success: boolean; path: string; error?: string }>(
      'attachment:getPath', 
      attachmentId
    );
    
    if (!result.success) {
      throw new Error(result.error || '获取附件路径失败');
    }
    
    return result.path;
  }
  
  /**
   * 获取缩略图路径
   */
  public async getThumbnailPath(attachmentId: string): Promise<string | null> {
    try {
      const result = await this.invoke<{ success: boolean; path: string | null }>(
        'attachment:getThumbnail', 
        attachmentId
      );
      return result.path || null;
    } catch {
      return null;
    }
  }
  
  /**
   * 删除附件
   */
  public async deleteAttachment(attachmentId: string): Promise<void> {
    const result = await this.invoke<{ success: boolean; error?: string }>(
      'attachment:delete', 
      attachmentId
    );
    
    if (!result.success) {
      throw new Error(result.error || '删除附件失败');
    }
    
    console.log('[AttachmentService] ✅ 附件已删除:', attachmentId);
  }
  
  /**
   * 批量删除附件
   */
  public async deleteMultiple(attachmentIds: string[]): Promise<void> {
    for (const id of attachmentIds) {
      await this.deleteAttachment(id);
    }
  }
  
  /**
   * 获取事件的所有附件
   */
  public async getEventAttachments(eventId: string): Promise<Attachment[]> {
    if (!this.isElectron) {
      return [];
    }
    
    const result = await this.invoke<{ 
      success: boolean; 
      attachments: Attachment[];
      error?: string;
    }>('attachment:getByEvent', eventId);
    
    return result.attachments || [];
  }
  
  /**
   * 打开附件（使用系统默认应用）
   */
  public async openAttachment(attachmentId: string): Promise<void> {
    const result = await this.invoke<{ success: boolean; error?: string }>(
      'attachment:open',
      attachmentId
    );
    
    if (!result.success) {
      throw new Error(result.error || '打开附件失败');
    }
  }
  
  /**
   * 格式化文件大小
   */
  public formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
  
  /**
   * 获取文件图标（根据类型）
   */
  public getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    return '📎';
  }
  
  /**
   * 检查是否支持的文件类型
   */
  public isSupportedType(file: File): boolean {
    return this.validateFile(file).valid;
  }
  
  /**
   * 获取支持的文件类型列表（用于 <input accept>）
   */
  public getAcceptString(): string {
    const allExtensions: string[] = [];
    const allMimeTypes: string[] = [];
    
    for (const config of Object.values(SUPPORTED_FILE_TYPES)) {
      allExtensions.push(...config.extensions);
      allMimeTypes.push(...config.mimeTypes);
    }
    
    return [...allMimeTypes, ...allExtensions].join(',');
  }

  /**
   * 统一上传方法（新版本，支持所有 7 种附件类型）
   */
  public async upload(
    file: File,
    eventId: string,
    options: Partial<UploadOptions> = {}
  ): Promise<Attachment> {
    // 1. 验证文件
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // 2. 确定附件类型
    const attachmentType = this.detectAttachmentType(file, options.type);

    console.log('[AttachmentService] 上传附件:', {
      filename: file.name,
      size: this.formatFileSize(file.size),
      type: attachmentType,
      eventId,
    });

    // 3. 类型特定处理（提取元数据）
    const processedData = await this.processFileByType(file, attachmentType, {
      eventId,
      ...options,
    });

    // 4. 读取文件数据
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // 5. 调用 Electron IPC 保存文件
    if (!this.isElectron) {
      throw new Error('附件上传需要 Electron 环境');
    }

    const attachmentId = generateAttachmentId();
    const result = await this.invoke<{
      success: boolean;
      localPath: string;
      fullPath: string;
      thumbnailPath: string | null;
      error?: string;
    }>('attachment:save', {
      id: attachmentId,
      eventId,
      filename: file.name,
      mimeType: file.type,
      buffer: Array.from(buffer),
      type: attachmentType,
      generateThumbnail: options.generateThumbnail !== false,
      ...processedData,
    });

    if (!result.success) {
      throw new Error(result.error || '附件保存失败');
    }

    // 6. 构造附件对象
    const attachment: Attachment = {
      id: attachmentId,
      type: attachmentType,
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      localPath: result.localPath,
      fullPath: result.fullPath,
      thumbnailPath: result.thumbnailPath || undefined,
      timestamp: options.timestamp || formatTimeForStorage(new Date()),
      caption: options.caption,
      status: 'local-only',
      uploadedAt: formatTimeForStorage(new Date()),
      ...processedData,
    };

    console.log('[AttachmentService] ✅ 附件上传成功:', attachmentId);

    return attachment;
  }

  /**
   * 创建子事件链接（不需要上传文件）
   */
  public async createSubEventLink(
    parentEventId: string,
    childEventId: string,
    caption?: string
  ): Promise<Attachment> {
    const attachmentId = generateAttachmentId();

    const attachment: Attachment = {
      id: attachmentId,
      type: AttachmentType.SUB_EVENT,
      filename: `sub-event-${childEventId}`,
      size: 0,
      mimeType: 'application/x-sub-event',
      localPath: '',
      fullPath: '',
      linkedEventId: childEventId,
      timestamp: formatTimeForStorage(new Date()),
      caption: caption || '子事件链接',
      status: 'local-only',
      uploadedAt: formatTimeForStorage(new Date()),
    };

    // 保存到数据库
    // TODO: 调用 IPC 或直接写入数据库

    return attachment;
  }

  /**
   * 从 URL 捕获网页剪藏
   */
  public async captureWebClip(
    url: string,
    eventId: string,
    options: { title?: string; saveScreenshot?: boolean } = {}
  ): Promise<Attachment> {
    // TODO: 调用 Puppeteer 或类似工具截取网页
    console.log('[AttachmentService] 捕获网页剪藏:', url);

    const attachmentId = generateAttachmentId();

    // 模拟抓取
    const attachment: Attachment = {
      id: attachmentId,
      type: AttachmentType.WEB_CLIP,
      filename: `${options.title || 'web-clip'}.html`,
      size: 0,
      mimeType: 'text/html',
      localPath: '',
      fullPath: '',
      webUrl: url,
      webTitle: options.title || url,
      webFavicon: '',
      timestamp: formatTimeForStorage(new Date()),
      status: 'local-only',
      uploadedAt: formatTimeForStorage(new Date()),
    };

    // TODO: 实际抓取网页内容并保存

    return attachment;
  }

  /**
   * 获取附件推荐的查看模式
   */
  public getRecommendedViewMode(attachmentType: AttachmentType): string {
    const typeConfig = SUPPORTED_FILE_TYPES[attachmentType as keyof typeof SUPPORTED_FILE_TYPES];
    return typeConfig?.viewMode || 'editor';
  }
}

// 导出单例
export const attachmentService = AttachmentService.getInstance();
export default attachmentService;
