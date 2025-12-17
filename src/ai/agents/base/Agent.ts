/**
 * Agent 基类实现
 */

import {
  IAgent,
  AgentConfig,
  Observation,
  Plan,
  Result,
  Insight,
  AgentResponse,
  Features,
  QualityAssessment
} from '../../../types/ai/agent.types';
import { ITool } from '../../../types/ai/tool.types';
import { IMemory } from '../../../types/ai/memory.types';
import { Memory } from './Memory';

/**
 * Agent 抽象基类
 */
export abstract class BaseAgent implements IAgent {
  public readonly name: string;
  public readonly description: string;
  public readonly tools: ITool[];
  public readonly memory: IMemory;

  protected llm: any; // LanguageModel

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.tools = config.tools;
    this.llm = config.llm;

    // 初始化 Memory（需要 vectorStore，暂时留空）
    this.memory = new Memory(
      {} as any, // 临时，后续替换为真实的 vectorStore
      config.memoryConfig
    );
  }

  /**
   * 感知：接收输入并理解
   */
  async perceive(input: any): Promise<Observation> {
    // 1. 提取特征
    const features = await this.extractFeatures(input);

    // 2. 检索相关记忆
    const relevantMemories = await this.memory.retrieve(
      JSON.stringify(features),
      5
    );

    // 3. 构建观察
    return {
      input,
      features,
      context: relevantMemories,
      timestamp: new Date()
    };
  }

  /**
   * 规划：制定行动计划
   */
  async plan(observation: Observation): Promise<Plan> {
    const prompt = this.buildPlanningPrompt(observation);
    const response = await this.llm.generate(prompt);

    return this.parsePlan(response);
  }

  /**
   * 行动：执行计划
   */
  async act(plan: Plan): Promise<Result> {
    const results = [];
    const startTime = Date.now();

    for (const step of plan.steps) {
      const tool = this.findTool(step.toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${step.toolName}`);
      }

      const result = await tool.execute(step.input);
      results.push(result);

      // 记录到记忆
      await this.memory.storeExperience({
        situation: `Executing tool: ${step.toolName}`,
        action: JSON.stringify(step.input),
        result: JSON.stringify(result),
        quality: result.success ? 1.0 : 0.0,
        metadata: {
          toolName: step.toolName,
          executionTime: result.metadata?.executionTime
        }
      });
    }

    return {
      results,
      metadata: {
        totalTime: Date.now() - startTime,
        stepCount: plan.steps.length
      }
    };
  }

  /**
   * 反思：从结果中学习
   */
  async reflect(result: Result): Promise<Insight> {
    // 1. 评估结果质量
    const quality = await this.evaluateQuality(result);

    // 2. 提取经验
    const experience = {
      situation: 'Agent execution completed',
      result: JSON.stringify(result),
      quality: quality.score
    };

    // 3. 更新策略（如果质量低）
    const improvements: string[] = [];
    if (quality.score < 0.7) {
      improvements.push('Consider refining the planning strategy');
      improvements.push('Review tool selection criteria');
      if (quality.aspects.accuracy && quality.aspects.accuracy < 0.6) {
        improvements.push('Improve input validation and preprocessing');
      }
    }

    return {
      quality,
      experience,
      improvements
    };
  }

  /**
   * 主循环
   */
  async run(input: any): Promise<AgentResponse> {
    const startTime = Date.now();
    const toolsUsed: string[] = [];

    try {
      const observation = await this.perceive(input);
      const plan = await this.plan(observation);
      
      // 记录使用的工具
      plan.steps.forEach(step => toolsUsed.push(step.toolName));
      
      const result = await this.act(plan);
      const insight = await this.reflect(result);

      return {
        success: true,
        data: result,
        insight,
        metadata: {
          executionTime: Date.now() - startTime,
          toolsUsed,
          stepsCompleted: plan.steps.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: error.code || 'AGENT_EXECUTION_ERROR',
          message: error.message,
          details: error
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolsUsed,
          stepsCompleted: 0
        }
      };
    }
  }

  /**
   * 查找工具
   */
  protected findTool(name: string): ITool | undefined {
    return this.tools.find(t => t.name === name);
  }

  /**
   * 评估质量
   */
  protected async evaluateQuality(result: Result): Promise<QualityAssessment> {
    // 简单实现：基于成功率计算
    const successCount = result.results.filter((r: any) => r.success).length;
    const totalCount = result.results.length;
    const successRate = totalCount > 0 ? successCount / totalCount : 0;

    return {
      score: successRate,
      aspects: {
        accuracy: successRate,
        completeness: 1.0, // 假设完整性为 1
        relevance: 1.0,
        efficiency: 1.0
      },
      feedback: successRate >= 0.8 ? 'Good execution' : 'Needs improvement'
    };
  }

  /**
   * 提取特征（子类实现）
   */
  protected abstract extractFeatures(input: any): Promise<Features>;

  /**
   * 构建规划 Prompt（子类实现）
   */
  protected abstract buildPlanningPrompt(observation: Observation): string;

  /**
   * 解析计划（子类实现）
   */
  protected abstract parsePlan(response: string): Plan;
}
