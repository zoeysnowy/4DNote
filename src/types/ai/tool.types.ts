/**
 * AI Tool 类型定义
 * 工具是 Agent 可以调用的具体功能
 */

import { z } from 'zod';

/**
 * Tool 配置
 */
export interface ToolConfig {
  timeout?: number;
  cache?: CacheConfig;
  rateLimit?: RateLimitConfig;
  retryPolicy?: RetryPolicy;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  enabled: boolean;
  ttl?: number; // 缓存时间（秒）
  key?: (input: any) => string; // 自定义缓存键
}

/**
 * 限流配置
 */
export interface RateLimitConfig {
  maxCalls: number; // 最大调用次数
  windowMs: number; // 时间窗口（毫秒）
}

/**
 * 重试策略
 */
export interface RetryPolicy {
  maxRetries: number;
  initialDelay: number; // 初始延迟（毫秒）
  maxDelay: number; // 最大延迟（毫秒）
  backoffMultiplier: number; // 退避倍数
  retryableErrors?: string[]; // 可重试的错误类型
}

/**
 * Tool 执行结果
 */
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    executionTime: number;
    cached?: boolean;
    retryCount?: number;
  };
}

/**
 * Tool 基础接口
 */
export interface ITool<TInput = any, TOutput = any> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodSchema<TInput>;
  readonly outputSchema: z.ZodSchema<TOutput>;
  readonly config?: ToolConfig;

  /**
   * 执行工具
   */
  execute(input: TInput): Promise<ToolResult<TOutput>>;

  /**
   * 验证输入
   */
  validateInput(input: unknown): TInput;

  /**
   * 验证输出
   */
  validateOutput(output: unknown): TOutput;
}

/**
 * Tool 元数据
 */
export interface ToolMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  examples?: ToolExample[];
}

/**
 * Tool 使用示例
 */
export interface ToolExample {
  input: any;
  output: any;
  description?: string;
}

/**
 * Tool 注册表条目
 */
export interface ToolRegistryEntry {
  tool: ITool;
  metadata: ToolMetadata;
  registeredAt: Date;
  usageCount: number;
}
