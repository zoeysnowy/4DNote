/**
 * OCR Tool - 图片文字识别
 * 支持腾讯云 OCR 和本地 OCR
 */

import { BaseTool } from '@frontend/ai/tools/base/Tool';
import { z } from 'zod';

/**
 * OCR 输入
 */
const OCRInputSchema = z.object({
  image: z.union([
    z.string(), // base64 或 URL
    z.instanceof(File),
    z.instanceof(Blob)
  ]),
  type: z.enum(['general', 'accurate', 'handwriting']).optional().default('general'),
  language: z.enum(['zh', 'en', 'zh-en']).optional().default('zh-en')
});

/**
 * OCR 输出
 */
const OCROutputSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  language: z.string(),
  blocks: z.array(z.object({
    text: z.string(),
    confidence: z.number(),
    boundingBox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    }).optional()
  })).optional(),
  rawResponse: z.any().optional()
});

export type OCRInput = z.infer<typeof OCRInputSchema>;
export type OCROutput = z.infer<typeof OCROutputSchema>;

/**
 * 腾讯云 OCR 配置
 */
interface TencentOCRConfig {
  secretId?: string;
  secretKey?: string;
  region?: string;
  endpoint?: string;
}

/**
 * OCR Tool 类
 */
export class OCRTool extends BaseTool<OCRInput, OCROutput> {
  private tencentConfig?: TencentOCRConfig;

  constructor(tencentConfig?: TencentOCRConfig) {
    super(
      'OCRTool',
      '图片文字识别工具：支持通用文字、高精度文字、手写文字识别',
      OCRInputSchema,
      OCROutputSchema,
      {
        timeout: 15000,
        cache: {
          enabled: true,
          ttl: 3600, // 1小时缓存
          key: (input) => {
            // 对于 File/Blob，使用其大小和类型作为缓存键的一部分
            if (input.image instanceof File || input.image instanceof Blob) {
              return `ocr_${input.type}_${input.image.size}_${input.image.type}`;
            }
            return `ocr_${input.type}_${input.image.substring(0, 100)}`;
          }
        },
        retryPolicy: {
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 5000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
        }
      }
    );

    this.tencentConfig = tencentConfig;
  }

  protected async _execute(input: OCRInput): Promise<OCROutput> {
    // 将输入转换为 base64
    const base64Image = await this.toBase64(input.image);

    // 如果配置了腾讯云，使用腾讯云 OCR
    if (this.tencentConfig?.secretId && this.tencentConfig?.secretKey) {
      return await this.callTencentOCR(base64Image, input.type, input.language);
    }

    // 否则使用简单的本地 OCR（模拟）
    return await this.callLocalOCR(base64Image, input.type);
  }

  /**
   * 调用腾讯云 OCR API
   */
  private async callTencentOCR(
    base64Image: string,
    type: string,
    language: string
  ): Promise<OCROutput> {
    // TODO: 实现腾讯云 OCR API 调用
    // 需要使用腾讯云 SDK 或直接调用 API
    
    // 临时实现：返回模拟数据
    console.warn('腾讯云 OCR 未实现，使用模拟数据');
    return this.callLocalOCR(base64Image, type);
  }

  /**
   * 本地 OCR（简化实现）
   * TODO: 集成开源 OCR 库如 Tesseract.js
   */
  private async callLocalOCR(
    base64Image: string,
    type: string
  ): Promise<OCROutput> {
    // 模拟 OCR 识别延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    // 返回模拟结果（实际应该调用 Tesseract.js 或其他 OCR 引擎）
    return {
      text: '【模拟 OCR 结果】\n这是从图片中识别的文字内容。\n实际使用时需要集成真实的 OCR 服务。',
      confidence: 0.85,
      language: 'zh-CN',
      blocks: [
        {
          text: '【模拟 OCR 结果】',
          confidence: 0.9,
          boundingBox: { x: 10, y: 10, width: 200, height: 30 }
        },
        {
          text: '这是从图片中识别的文字内容。',
          confidence: 0.85,
          boundingBox: { x: 10, y: 50, width: 300, height: 30 }
        }
      ],
      rawResponse: {
        note: '这是模拟数据，需要集成真实 OCR 服务'
      }
    };
  }

  /**
   * 将输入转换为 base64
   */
  private async toBase64(image: string | File | Blob): Promise<string> {
    if (typeof image === 'string') {
      // 如果已经是 base64 或 URL，直接返回
      if (image.startsWith('data:') || image.startsWith('http')) {
        return image;
      }
      return image;
    }

    // File 或 Blob 转 base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(image);
    });
  }
}

/**
 * 腾讯云 OCR 集成指南
 * 
 * 1. 安装腾讯云 SDK:
 *    npm install tencentcloud-sdk-nodejs
 * 
 * 2. 获取密钥:
 *    访问 https://console.cloud.tencent.com/cam/capi
 * 
 * 3. 使用示例:
 *    const ocr = new OCRTool({
 *      secretId: 'YOUR_SECRET_ID',
 *      secretKey: 'YOUR_SECRET_KEY',
 *      region: 'ap-guangzhou'
 *    });
 * 
 * 4. API 文档:
 *    https://cloud.tencent.com/document/product/866
 */
