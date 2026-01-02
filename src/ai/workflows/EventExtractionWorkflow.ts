/**
 * 事件提取工作流
 * 从活动海报图片中提取事件信息、二维码等
 * 
 * 注意：移除了 LangGraph 依赖以支持浏览器环境
 */

import { OCRTool } from '../tools/ocr/OCRTool';
import { QRCodeTool, QRCodeInfo } from '../tools/qrcode/QRCodeTool';
import { LLMService } from '../services/LLMService';
import { llmConfig } from '../../config/ai.config';
import { formatTimeForStorage } from '../../utils/timeUtils';

/**
 * 工作流状态
 */
export interface EventExtractionState {
  // 输入
  input: {
    image: File | Blob | string;    // 图片
    imageUrl?: string;               // 图片 URL（可选）
  };

  // 中间状态
  ocrText?: string;                  // OCR 识别的文字
  ocrConfidence?: number;            // OCR 置信度
  qrCodes?: QRCodeInfo[];            // 识别的二维码列表

  // 提取的事件信息
  extractedEvent?: {
    title: string;                   // 事件标题
    startTime?: string;              // 开始时间
    endTime?: string;                // 结束时间
    location?: string;               // 地点
    description?: string;            // 描述
    organizer?: string;              // 主办方
    category?: string;               // 分类
    tags?: string[];                 // 标签
  };

  // 注册信息分析
  registrationInfo?: {
    required: boolean;               // 是否需要报名
    deadline?: string;               // 报名截止时间
    method?: string;                 // 报名方式
    qrCodeId?: string;              // 关联的二维码 ID
    url?: string;                    // 报名链接
  };

  // 建议的任务
  suggestedTasks?: Array<{
    title: string;
    type: 'main-event' | 'registration' | 'reminder' | 'preparation';
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high';
    description?: string;
    qrCodeId?: string;
  }>;

  // 错误信息
  error?: Error;
}

/**
 * 事件提取工作流类
 */
export class EventExtractionWorkflow {
  private ocrTool: OCRTool;
  private qrCodeTool: QRCodeTool;
  private llm: LLMService;

  constructor() {
    this.ocrTool = new OCRTool();
    this.qrCodeTool = new QRCodeTool();
    this.llm = new LLMService(llmConfig);
  }



  /**
   * OCR 节点：识别图片中的文字
   */
  private async ocrNode(state: EventExtractionState): Promise<Partial<EventExtractionState>> {
    try {
      console.log('🔍 [OCR] 开始识别图片文字...');
      
      const result = await this.ocrTool.execute({
        image: state.input.image,
        type: 'general',
        language: 'zh-en'
      });

      if (result.success && result.data) {
        console.log(`✅ [OCR] 识别成功，置信度: ${result.data.confidence.toFixed(2)}`);
        console.log(`📝 [OCR] 文本预览: ${result.data.text.substring(0, 100)}...`);
        
        return {
          ocrText: result.data.text,
          ocrConfidence: result.data.confidence
        };
      } else {
        console.warn('⚠️ [OCR] 识别失败');
        return { ocrText: '', ocrConfidence: 0 };
      }
    } catch (error: any) {
      console.error('❌ [OCR] 错误:', error.message);
      return { error };
    }
  }

  /**
   * 二维码节点：识别图片中的二维码
   */
  private async qrCodeNode(state: EventExtractionState): Promise<Partial<EventExtractionState>> {
    try {
      console.log('🔍 [QRCode] 开始识别二维码...');
      
      const result = await this.qrCodeTool.execute({
        image: state.input.image,
        multiple: true
      });

      if (result.success && result.data) {
        console.log(`✅ [QRCode] 找到 ${result.data.totalFound} 个二维码`);
        
        result.data.codes.forEach((code, i) => {
          console.log(`  ${i + 1}. ${code.type}: ${code.content.substring(0, 50)}...`);
          if (code.metadata?.action) {
            console.log(`     建议操作: ${code.metadata.action}`);
          }
        });

        return {
          qrCodes: result.data.codes.map((code, i) => ({
            ...code,
            id: `qr_${Date.now()}_${i}`,
            extractedAt: formatTimeForStorage(new Date())
          }))
        };
      } else {
        console.log('ℹ️ [QRCode] 未找到二维码');
        return { qrCodes: [] };
      }
    } catch (error: any) {
      console.error('❌ [QRCode] 错误:', error.message);
      return { qrCodes: [] };
    }
  }

  /**
   * 提取事件节点：使用 LLM 从文本中提取事件信息
   */
  private async extractEventNode(state: EventExtractionState): Promise<Partial<EventExtractionState>> {
    try {
      console.log('🤖 [ExtractEvent] 开始提取事件信息...');

      const context = this.buildContext(state);
      const prompt = this.buildEventExtractionPrompt(context);

      const response = await this.llm.generate({
        prompt,
        temperature: 0.3,
        maxTokens: 1000
      });

      const extracted = this.parseEventInfo(response.text);
      console.log(`✅ [ExtractEvent] 提取成功: ${extracted.title}`);

      return { extractedEvent: extracted };
    } catch (error: any) {
      console.error('❌ [ExtractEvent] 错误:', error.message);
      return { error };
    }
  }

  /**
   * 分析注册信息节点
   */
  private async analyzeRegistrationNode(state: EventExtractionState): Promise<Partial<EventExtractionState>> {
    try {
      console.log('🔍 [AnalyzeRegistration] 分析报名信息...');

      const prompt = this.buildRegistrationAnalysisPrompt(state);
      const response = await this.llm.generate({
        prompt,
        temperature: 0.3,
        maxTokens: 500
      });

      const registrationInfo = this.parseRegistrationInfo(response.text, state.qrCodes);
      
      if (registrationInfo.required) {
        console.log(`✅ [AnalyzeRegistration] 需要报名，截止: ${registrationInfo.deadline || '未知'}`);
      } else {
        console.log('ℹ️ [AnalyzeRegistration] 无需报名');
      }

      return { registrationInfo };
    } catch (error: any) {
      console.error('❌ [AnalyzeRegistration] 错误:', error.message);
      return { registrationInfo: { required: false } };
    }
  }

  /**
   * 生成任务节点
   */
  private async generateTasksNode(state: EventExtractionState): Promise<Partial<EventExtractionState>> {
    try {
      console.log('📋 [GenerateTasks] 生成任务列表...');

      const tasks: EventExtractionState['suggestedTasks'] = [];

      // 主事件任务
      if (state.extractedEvent) {
        tasks.push({
          title: state.extractedEvent.title,
          type: 'main-event',
          dueDate: state.extractedEvent.startTime,
          priority: 'high',
          description: state.extractedEvent.description
        });
      }

      // 报名任务
      if (state.registrationInfo?.required) {
        const registrationQR = state.qrCodes?.find(
          qr => qr.id === state.registrationInfo!.qrCodeId
        );

        tasks.push({
          title: `报名：${state.extractedEvent?.title || '活动'}`,
          type: 'registration',
          dueDate: state.registrationInfo.deadline,
          priority: 'high',
          description: `报名方式：${state.registrationInfo.method || '二维码'}`,
          qrCodeId: registrationQR?.id
        });
      }

      // 提醒任务（提前一天）
      if (state.extractedEvent?.startTime) {
        const { parseLocalTimeStringOrNull } = await import('../../utils/timeUtils');
        const startDate = parseLocalTimeStringOrNull(state.extractedEvent.startTime);
        if (!startDate) {
          console.warn('[GenerateTasks] startTime 无法解析，跳过提醒任务:', state.extractedEvent.startTime);
        } else {
          const reminderDate = new Date(startDate);
          reminderDate.setDate(reminderDate.getDate() - 1);

          tasks.push({
            title: `提醒：${state.extractedEvent.title}`,
            type: 'reminder',
            dueDate: formatTimeForStorage(reminderDate),
            priority: 'medium',
            description: '活动前一天提醒'
          });
        }
      }

      console.log(`✅ [GenerateTasks] 生成了 ${tasks.length} 个任务`);
      return { suggestedTasks: tasks };
    } catch (error: any) {
      console.error('❌ [GenerateTasks] 错误:', error.message);
      return { suggestedTasks: [] };
    }
  }

  /**
   * 构建上下文
   */
  private buildContext(state: EventExtractionState): string {
    const parts: string[] = [];

    if (state.ocrText) {
      parts.push(`OCR 识别文字：\n${state.ocrText}`);
    }

    if (state.qrCodes && state.qrCodes.length > 0) {
      parts.push(`\n二维码信息：`);
      state.qrCodes.forEach((qr, i) => {
        parts.push(`${i + 1}. ${qr.type}: ${qr.content}`);
        if (qr.metadata?.action) {
          parts.push(`   建议操作: ${qr.metadata.action}`);
        }
      });
    }

    return parts.join('\n');
  }

  /**
   * 构建事件提取 Prompt
   */
  private buildEventExtractionPrompt(context: string): string {
    return `
你是一个活动信息提取助手。请从以下内容中提取活动信息。

${context}

请提取以下信息，以 JSON 格式返回：
{
  "title": "活动标题",
  "startTime": "开始时间（ISO 8601 格式）",
  "endTime": "结束时间（可选）",
  "location": "地点",
  "description": "活动描述",
  "organizer": "主办方",
  "category": "分类",
  "tags": ["标签1", "标签2"]
}

注意：
- 时间必须转换为完整的 ISO 8601 格式（如 2024-12-19T14:00:00+08:00）
- 如果信息不完整，填写你最合理的推断
- 标签应该包含活动类型、主题等关键词
`.trim();
  }

  /**
   * 构建注册分析 Prompt
   */
  private buildRegistrationAnalysisPrompt(state: EventExtractionState): string {
    const qrCodesInfo = state.qrCodes?.map((qr, i) => 
      `${i + 1}. ID: ${qr.id}, 类型: ${qr.type}, 操作: ${qr.metadata?.action || '未知'}`
    ).join('\n') || '无';

    return `
分析以下活动是否需要报名：

活动标题：${state.extractedEvent?.title}
活动时间：${state.extractedEvent?.startTime}
OCR 文字：${state.ocrText?.substring(0, 200)}
二维码：
${qrCodesInfo}

请判断：
1. 是否需要报名？
2. 报名截止时间是什么？（如果文字中提到）
3. 报名方式是什么？（二维码、链接、其他）
4. 如果有报名二维码，它的 ID 是什么？

以 JSON 格式返回：
{
  "required": true/false,
  "deadline": "截止时间（ISO 8601）或 null",
  "method": "报名方式描述",
  "qrCodeId": "二维码 ID 或 null"
}
`.trim();
  }

  /**
   * 解析事件信息
   */
  private parseEventInfo(response: string): EventExtractionState['extractedEvent'] {
    try {
      const json = this.extractJSON(response);
      return json;
    } catch {
      return {
        title: '未能提取标题',
        description: '解析失败'
      };
    }
  }

  /**
   * 解析注册信息
   */
  private parseRegistrationInfo(
    response: string,
    qrCodes?: QRCodeInfo[]
  ): NonNullable<EventExtractionState['registrationInfo']> {
    try {
      const json = this.extractJSON(response);
      
      // 如果有报名二维码 ID，找到对应的二维码并提取 URL
      if (json.qrCodeId && qrCodes) {
        const qr = qrCodes.find(q => q.id === json.qrCodeId);
        if (qr?.url) {
          json.url = qr.url;
        }
      }

      return json;
    } catch {
      return { required: false };
    }
  }

  /**
   * 从文本中提取 JSON
   */
  private extractJSON(text: string): any {
    // 尝试直接解析
    try {
      return JSON.parse(text);
    } catch {
      // 尝试提取 JSON 代码块
      const match = text.match(/```json\n([\s\S]*?)\n```/) || 
                   text.match(/```\n([\s\S]*?)\n```/) ||
                   text.match(/\{[\s\S]*\}/);
      
      if (match) {
        return JSON.parse(match[1] || match[0]);
      }
      
      throw new Error('无法提取 JSON');
    }
  }

  /**
   * 执行工作流（简化版，无 LangGraph）
   */
  async execute(image: File | Blob | string): Promise<EventExtractionState> {
    console.log('🚀 [EventExtractionWorkflow] 开始执行...\n');

    const state: EventExtractionState = {
      input: { image }
    };

    try {
      // 1. OCR 识别
      const ocrResult = await this.ocrNode(state);
      Object.assign(state, ocrResult);

      // 2. 二维码识别
      const qrResult = await this.qrCodeNode(state);
      Object.assign(state, qrResult);

      // 3. 提取事件信息
      if (state.ocrText) {
        const eventResult = await this.extractEventNode(state);
        Object.assign(state, eventResult);

        // 4. 分析注册信息（可选）
        if (state.extractedEvent) {
          const regResult = await this.analyzeRegistrationNode(state);
          Object.assign(state, regResult);

          // 5. 生成任务（可选）
          if (state.registrationInfo?.required || state.qrCodes?.length) {
            const taskResult = await this.generateTasksNode(state);
            Object.assign(state, taskResult);
          }
        }
      }

      console.log('\n✅ [EventExtractionWorkflow] 执行完成！');
      return state;
    } catch (error: any) {
      console.error('❌ [EventExtractionWorkflow] 执行失败:', error);
      state.error = error;
      return state;
    }
  }
}
