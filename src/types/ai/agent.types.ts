/**
 * AI Agent 类型定义
 * Agent 是具有特定能力和职责的自治实体
 */

import { ITool } from './tool.types';
import { IMemory } from './memory.types';

/**
 * Agent 能力
 */
export interface Capability {
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * 观察
 */
export interface Observation {
  input: any;
  features: Features;
  context: any[];
  timestamp: Date;
}

/**
 * 特征提取结果
 */
export interface Features {
  [key: string]: any;
}

/**
 * 执行步骤
 */
export interface Step {
  toolName: string;
  input: any;
  expectedOutput?: any;
}

/**
 * 执行计划
 */
export interface Plan {
  steps: Step[];
  confidence: number;
  reasoning?: string;
}

/**
 * 执行结果
 */
export interface Result {
  results: any[];
  metadata?: {
    totalTime?: number;
    stepCount?: number;
  };
}

/**
 * 质量评估
 */
export interface QualityAssessment {
  score: number; // 0-1
  aspects: {
    accuracy?: number;
    completeness?: number;
    relevance?: number;
    efficiency?: number;
  };
  feedback?: string;
}

/**
 * 洞察
 */
export interface Insight {
  quality: QualityAssessment;
  experience: any;
  improvements: string[];
}

/**
 * Agent 策略
 */
export interface Strategy {
  name: string;
  description: string;
  apply(observation: Observation): Promise<Plan>;
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  name: string;
  description: string;
  tools: ITool[];
  llm: any; // LanguageModel 接口
  capabilities?: Capability[];
  strategy?: Strategy;
  memoryConfig?: {
    maxShortTermMessages?: number;
    enableLongTerm?: boolean;
    enableVectorStore?: boolean;
  };
}

/**
 * Agent 接口
 */
export interface IAgent {
  readonly name: string;
  readonly description: string;
  readonly tools: ITool[];
  readonly memory: IMemory;

  /**
   * 感知：接收输入并理解
   */
  perceive(input: any): Promise<Observation>;

  /**
   * 规划：制定行动计划
   */
  plan(observation: Observation): Promise<Plan>;

  /**
   * 行动：执行计划
   */
  act(plan: Plan): Promise<Result>;

  /**
   * 反思：从结果中学习
   */
  reflect(result: Result): Promise<Insight>;

  /**
   * 主循环
   */
  run(input: any): Promise<AgentResponse>;
}

/**
 * Agent 响应
 */
export interface AgentResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  insight?: Insight;
  metadata?: {
    executionTime: number;
    toolsUsed: string[];
    stepsCompleted: number;
  };
}

/**
 * Agent 注册表条目
 */
export interface AgentRegistryEntry {
  agent: IAgent;
  metadata: {
    version: string;
    author?: string;
    tags?: string[];
    registeredAt: Date;
    usageCount: number;
  };
}
