/**
 * AI 框架验证示例
 * 演示如何使用 BaseTool、BaseAgent、LLMService 等基础组件
 */

import { BaseTool } from '@frontend/ai/tools/base/Tool';
import { BaseAgent } from '@frontend/ai/agents/base/Agent';
import { LLMService } from '@frontend/ai/services/LLMService';
import { EmbeddingService } from '@frontend/ai/services/EmbeddingService';
import { InMemoryVectorStore } from '@frontend/ai/services/VectorStoreService';
import { llmConfig, embeddingConfig } from '@frontend/config/ai.config';
import { z } from 'zod';
import type { Features, Observation, Plan } from '@frontend/types/ai/agent.types';

/**
 * 示例 Tool: 文本处理工具
 */
class TextProcessorTool extends BaseTool<
  { text: string; action: 'uppercase' | 'lowercase' | 'reverse' },
  { result: string }
> {
  constructor() {
    super(
      'TextProcessorTool',
      '文本处理工具：支持大写、小写、反转',
      z.object({
        text: z.string(),
        action: z.enum(['uppercase', 'lowercase', 'reverse'])
      }),
      z.object({
        result: z.string()
      }),
      {
        cache: {
          enabled: true,
          ttl: 300 // 5分钟缓存
        },
        retryPolicy: {
          maxRetries: 2,
          initialDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2
        }
      }
    );
  }

  protected async _execute(input: {
    text: string;
    action: 'uppercase' | 'lowercase' | 'reverse';
  }): Promise<{ result: string }> {
    // 模拟异步处理
    await new Promise(resolve => setTimeout(resolve, 100));

    let result: string;
    switch (input.action) {
      case 'uppercase':
        result = input.text.toUpperCase();
        break;
      case 'lowercase':
        result = input.text.toLowerCase();
        break;
      case 'reverse':
        result = input.text.split('').reverse().join('');
        break;
    }

    return { result };
  }
}

/**
 * 示例 Tool: 数据分析工具
 */
class DataAnalysisTool extends BaseTool<
  { data: number[] },
  { mean: number; max: number; min: number }
> {
  constructor() {
    super(
      'DataAnalysisTool',
      '数据分析工具：计算均值、最大值、最小值',
      z.object({
        data: z.array(z.number()).min(1)
      }),
      z.object({
        mean: z.number(),
        max: z.number(),
        min: z.number()
      })
    );
  }

  protected async _execute(input: { data: number[] }): Promise<{
    mean: number;
    max: number;
    min: number;
  }> {
    const sum = input.data.reduce((a, b) => a + b, 0);
    const mean = sum / input.data.length;
    const max = Math.max(...input.data);
    const min = Math.min(...input.data);

    return { mean, max, min };
  }
}

/**
 * 示例 Agent: 简单的文本处理 Agent
 */
class SimpleTextAgent extends BaseAgent {
  protected async extractFeatures(input: any): Promise<Features> {
    return {
      inputType: typeof input,
      hasText: typeof input === 'string',
      textLength: typeof input === 'string' ? input.length : 0,
      hasNumbers: typeof input === 'string' && /\d/.test(input)
    };
  }

  protected buildPlanningPrompt(observation: Observation): string {
    return `
你是一个文本处理助手。根据输入特征制定处理计划。

输入特征：
- 类型: ${observation.features.inputType}
- 包含文本: ${observation.features.hasText}
- 文本长度: ${observation.features.textLength}
- 包含数字: ${observation.features.hasNumbers}

可用工具：
1. TextProcessorTool: 文本大小写转换或反转
2. DataAnalysisTool: 数字数组分析

请返回 JSON 格式的执行计划：
{
  "steps": [
    {
      "toolName": "工具名称",
      "input": { 输入参数 },
      "expectedOutput": "预期输出描述"
    }
  ],
  "confidence": 0.9,
  "reasoning": "选择该计划的原因"
}
    `.trim();
  }

  protected parsePlan(response: string): Plan {
    try {
      // 尝试解析 JSON
      const parsed = JSON.parse(response);
      return {
        steps: parsed.steps || [],
        confidence: parsed.confidence || 0.8,
        reasoning: parsed.reasoning
      };
    } catch {
      // 如果解析失败，返回默认计划
      return {
        steps: [
          {
            toolName: 'TextProcessorTool',
            input: { text: 'default', action: 'uppercase' }
          }
        ],
        confidence: 0.5,
        reasoning: 'Failed to parse LLM response, using default plan'
      };
    }
  }
}

/**
 * 运行验证示例
 */
export async function runAIFrameworkDemo() {
  console.log('🚀 AI 框架验证开始...\n');

  // 1. 测试 Tool
  console.log('=== 测试 Tool ===');
  const textTool = new TextProcessorTool();
  const dataTool = new DataAnalysisTool();

  const textResult = await textTool.execute({
    text: 'Hello World',
    action: 'uppercase'
  });
  console.log('TextProcessorTool 结果:', textResult);

  const dataResult = await dataTool.execute({
    data: [1, 2, 3, 4, 5, 10, 20]
  });
  console.log('DataAnalysisTool 结果:', dataResult);

  // 2. 测试 LLMService
  console.log('\n=== 测试 LLMService ===');
  const llm = new LLMService(llmConfig);
  
  try {
    const llmResult = await llm.generate({
      prompt: '请用一句话介绍 LangChain。',
      temperature: 0.7,
      maxTokens: 100
    });
    console.log('LLM 响应:', llmResult.text);
    console.log('Token 使用:', llmResult.usage);
  } catch (error: any) {
    console.log('LLM 调用失败（可能代理未启动）:', error.message);
  }

  // 3. 测试 EmbeddingService
  console.log('\n=== 测试 EmbeddingService ===');
  const embedding = new EmbeddingService(embeddingConfig);

  const embResult1 = await embedding.embed('人工智能技术');
  const embResult2 = await embedding.embed('AI 科技');
  const embResult3 = await embedding.embed('天气很好');

  console.log('Embedding 维度:', embResult1.embedding.length);

  const sim1 = embedding.cosineSimilarity(embResult1.embedding, embResult2.embedding);
  const sim2 = embedding.cosineSimilarity(embResult1.embedding, embResult3.embedding);

  console.log('相似度 (AI 技术 vs AI 科技):', sim1.toFixed(4));
  console.log('相似度 (AI 技术 vs 天气很好):', sim2.toFixed(4));

  // 4. 测试 VectorStore
  console.log('\n=== 测试 VectorStore ===');
  const vectorStore = new InMemoryVectorStore({
    embeddingService: embedding
  });

  await vectorStore.addBatch([
    {
      id: '1',
      content: '人工智能是计算机科学的一个分支',
      embedding: [],
      metadata: { type: 'fact' },
      timestamp: new Date()
    },
    {
      id: '2',
      content: '机器学习是人工智能的核心技术',
      embedding: [],
      metadata: { type: 'fact' },
      timestamp: new Date()
    },
    {
      id: '3',
      content: '今天天气晴朗，适合出游',
      embedding: [],
      metadata: { type: 'note' },
      timestamp: new Date()
    }
  ]);

  const searchResults = await vectorStore.search('什么是 AI？', 2);
  console.log('检索结果:');
  searchResults.forEach((result, i) => {
    console.log(`  ${i + 1}. ${result.content}`);
  });

  // 5. 测试 Agent
  console.log('\n=== 测试 Agent ===');
  const agent = new SimpleTextAgent({
    name: 'SimpleTextAgent',
    description: '简单的文本处理 Agent',
    tools: [textTool, dataTool],
    llm
  });

  try {
    const agentResult = await agent.run('Hello World');
    console.log('Agent 执行结果:', agentResult);
  } catch (error: any) {
    console.log('Agent 执行失败（需要 LLM 支持）:', error.message);
  }

  console.log('\n✅ AI 框架验证完成！');
}

// 如果直接运行此文件
if (require.main === module) {
  runAIFrameworkDemo().catch(console.error);
}
