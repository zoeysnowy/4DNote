/**
 * QR Code Tool - 二维码识别
 * 识别图片中的二维码并提取链接、文本等信息
 */

import { BaseTool } from '@frontend/ai/tools/base/Tool';
import { z } from 'zod';
import QrCodeReader from 'qrcode-reader';
import { Jimp, JimpMime } from 'jimp';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>;

/**
 * 二维码输入
 */
const QRCodeInputSchema = z.object({
  image: z.union([
    z.string(), // base64 或 URL
    z.instanceof(File),
    z.instanceof(Blob)
  ]),
  multiple: z.boolean().optional().default(false) // 是否识别多个二维码
});

/**
 * 二维码信息
 */
const QRCodeInfoSchema = z.object({
  id: z.string(), // 唯一 ID
  content: z.string(), // 二维码内容
  type: z.enum(['url', 'text', 'vcard', 'wifi', 'email', 'phone', 'sms', 'geo', 'unknown']),
  url: z.string().optional(), // 如果是 URL 类型，解析后的 URL
  metadata: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    action: z.string().optional() // 建议的操作：如 "打开链接"、"报名"、"下载" 等
  }).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }).optional(),
  imageData: z.string().optional(), // 二维码区域的图片 base64（用于保存）
  extractedAt: z.string().optional() // 提取时间
});

/**
 * 二维码输出
 */
const QRCodeOutputSchema = z.object({
  found: z.boolean(),
  codes: z.array(QRCodeInfoSchema),
  totalFound: z.number()
});

export type QRCodeInput = z.infer<typeof QRCodeInputSchema>;
export type QRCodeInfo = z.infer<typeof QRCodeInfoSchema>;
export type QRCodeOutput = z.infer<typeof QRCodeOutputSchema>;

/**
 * QR Code Tool 类
 */
export class QRCodeTool extends BaseTool<QRCodeInput, QRCodeOutput> {
  constructor() {
    super(
      'QRCodeTool',
      '二维码识别工具：识别图片中的二维码，提取链接和文本信息',
      QRCodeInputSchema,
      QRCodeOutputSchema,
      {
        timeout: 10000,
        cache: {
          enabled: true,
          ttl: 3600,
          key: (input) => {
            if (input.image instanceof File || input.image instanceof Blob) {
              return `qr_${input.image.size}_${input.image.type}`;
            }
            if (input.image instanceof Buffer) {
              return `qr_buffer_${input.image.length}`;
            }
            return `qr_${input.image.substring(0, 100)}`;
          }
        },
        retryPolicy: {
          maxRetries: 2,
          initialDelay: 500,
          maxDelay: 2000,
          backoffMultiplier: 2
        }
      }
    );
  }

  protected async _execute(input: QRCodeInput): Promise<QRCodeOutput> {
    try {
      // 1. 加载图片
      const image = await this.loadImage(input.image);

      // 2. 识别二维码
      const codes = await this.detectQRCodes(image, input.multiple);

      // 3. 分析二维码类型和内容
      const analyzedCodes = await Promise.all(
        codes.map(code => this.analyzeQRCode(code, image))
      );

      return {
        found: codes.length > 0,
        codes: analyzedCodes,
        totalFound: codes.length
      };
    } catch (error: any) {
      // 如果识别失败，返回空结果
      return {
        found: false,
        codes: [],
        totalFound: 0
      };
    }
  }

  /**
   * 加载图片
   */
  private async loadImage(image: string | File | Blob | Buffer): Promise<JimpImage> {
    if (typeof image === 'string') {
      if (image.startsWith('data:')) {
        // base64
        const base64Data = image.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        return await Jimp.read(buffer);
      } else if (image.startsWith('http')) {
        // URL
        return await Jimp.read(image);
      } else {
        // 文件路径
        return await Jimp.read(image);
      }
    } else if (Buffer.isBuffer(image)) {
      return await Jimp.read(image);
    } else {
      // File 或 Blob
      const buffer = await this.blobToBuffer(image);
      return await Jimp.read(buffer);
    }
  }

  /**
   * 识别二维码
   */
  private async detectQRCodes(image: JimpImage, multiple: boolean): Promise<Array<{
    content: string;
    location?: any;
  }>> {
    return new Promise((resolve, reject) => {
      const qr = new QrCodeReader();

      qr.callback = (err: any, value: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (value && value.result) {
          resolve([{
            content: value.result,
            location: value.location
          }]);
        } else {
          resolve([]);
        }
      };

      // 转换为适合 qrcode-reader 的格式
      const imageData = {
        data: new Uint8ClampedArray(image.bitmap.data),
        width: image.bitmap.width,
        height: image.bitmap.height
      };

      qr.decode(imageData as any);
    });
  }

  /**
   * 分析二维码类型和内容
   */
  private async analyzeQRCode(code: { content: string; location?: any }, image: JimpImage): Promise<QRCodeInfo> {
    const content = code.content;
    let type: QRCodeInfo['type'] = 'unknown';
    let url: string | undefined;
    let metadata: QRCodeInfo['metadata'];

    // 判断类型
    if (this.isURL(content)) {
      type = 'url';
      url = content;
      metadata = this.analyzeURL(content);
    } else if (content.startsWith('BEGIN:VCARD')) {
      type = 'vcard';
    } else if (content.startsWith('WIFI:')) {
      type = 'wifi';
    } else if (content.startsWith('mailto:')) {
      type = 'email';
      url = content;
    } else if (content.startsWith('tel:')) {
      type = 'phone';
    } else if (content.startsWith('sms:')) {
      type = 'sms';
    } else if (content.startsWith('geo:')) {
      type = 'geo';
    } else {
      type = 'text';
    }

    // 提取二维码区域图片
    let imageData: string | undefined;
    if (code.location) {
      try {
        const { topLeftCorner, bottomRightCorner } = code.location;
        const x = Math.floor(topLeftCorner.x);
        const y = Math.floor(topLeftCorner.y);
        const width = Math.floor(bottomRightCorner.x - topLeftCorner.x);
        const height = Math.floor(bottomRightCorner.y - topLeftCorner.y);

        // 裁剪二维码区域
        const croppedImage = image.clone().crop({ x, y, w: width, h: height } as any);
        imageData = await croppedImage.getBase64(JimpMime.png);
      } catch (error) {
        console.error('Failed to extract QR code image:', error);
      }
    }

    return {
      id: `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // 生成唯一 ID
      content,
      type,
      url,
      metadata,
      position: code.location ? {
        x: code.location.topLeftCorner.x,
        y: code.location.topLeftCorner.y,
        width: code.location.bottomRightCorner.x - code.location.topLeftCorner.x,
        height: code.location.bottomRightCorner.y - code.location.topLeftCorner.y
      } : undefined,
      imageData,
      extractedAt: formatTimeForStorage(new Date()) // 添加提取时间
    };
  }

  /**
   * 判断是否为 URL
   */
  private isURL(text: string): boolean {
    try {
      new URL(text);
      return true;
    } catch {
      return text.startsWith('http://') || text.startsWith('https://');
    }
  }

  /**
   * 分析 URL 类型和建议操作
   */
  private analyzeURL(url: string): QRCodeInfo['metadata'] {
    const lowerURL = url.toLowerCase();

    // 报名链接
    if (lowerURL.includes('signup') || 
        lowerURL.includes('register') || 
        lowerURL.includes('enroll') ||
        lowerURL.includes('baoming') ||
        lowerURL.includes('报名')) {
      return {
        title: '报名链接',
        description: '活动或课程报名',
        action: '报名'
      };
    }

    // 视频号链接
    if (lowerURL.includes('channels.weixin') || 
        lowerURL.includes('video.weixin')) {
      return {
        title: '视频号链接',
        description: '微信视频号',
        action: '观看视频'
      };
    }

    // 公众号链接
    if (lowerURL.includes('mp.weixin')) {
      return {
        title: '公众号文章',
        description: '微信公众号文章',
        action: '阅读文章'
      };
    }

    // 下载链接
    if (lowerURL.includes('download') || 
        lowerURL.includes('下载')) {
      return {
        title: '下载链接',
        description: '文件下载',
        action: '下载'
      };
    }

    // 加群链接
    if (lowerURL.includes('qun') || 
        lowerURL.includes('group') ||
        lowerURL.includes('加群')) {
      return {
        title: '群聊链接',
        description: '加入群聊',
        action: '加入群聊'
      };
    }

    // 默认
    return {
      title: '网页链接',
      description: '打开网页',
      action: '打开链接'
    };
  }

  /**
   * Blob 转 Buffer
   */
  private async blobToBuffer(blob: Blob): Promise<Buffer> {
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
