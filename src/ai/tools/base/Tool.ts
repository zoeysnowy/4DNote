/**
 * Tool 基类实现
 */

import { z } from 'zod';
import { ITool, ToolConfig, ToolResult } from '../../../types/ai/tool.types';

/**
 * Tool 抽象基类
 */
export abstract class BaseTool<TInput = any, TOutput = any> implements ITool<TInput, TOutput> {
  public readonly name: string;
  public readonly description: string;
  public readonly inputSchema: z.ZodSchema<TInput>;
  public readonly outputSchema: z.ZodSchema<TOutput>;
  public readonly config?: ToolConfig;

  private cache: Map<string, { data: TOutput; timestamp: number }> = new Map();
  private callHistory: number[] = []; // 调用时间戳

  constructor(
    name: string,
    description: string,
    inputSchema: z.ZodSchema<TInput>,
    outputSchema: z.ZodSchema<TOutput>,
    config?: ToolConfig
  ) {
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
    this.config = config;
  }

  /**
   * 执行工具（带缓存、限流、重试）
   */
  async execute(input: TInput): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    let retryCount = 0;

    try {
      // 1. 验证输入
      const validatedInput = this.validateInput(input);

      // 2. 检查缓存
      if (this.config?.cache?.enabled) {
        const cached = this.getFromCache(validatedInput);
        if (cached) {
          return {
            success: true,
            data: cached,
            metadata: {
              executionTime: Date.now() - startTime,
              cached: true,
              retryCount: 0
            }
          };
        }
      }

      // 3. 限流检查
      if (this.config?.rateLimit) {
        await this.checkRateLimit();
      }

      // 4. 执行（带重试）
      const result = await this.executeWithRetry(validatedInput);

      // 5. 验证输出
      const validatedOutput = this.validateOutput(result);

      // 6. 写入缓存
      if (this.config?.cache?.enabled) {
        this.setToCache(validatedInput, validatedOutput);
      }

      return {
        success: true,
        data: validatedOutput,
        metadata: {
          executionTime: Date.now() - startTime,
          cached: false,
          retryCount
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: error.code || 'TOOL_EXECUTION_ERROR',
          message: error.message,
          details: error
        },
        metadata: {
          executionTime: Date.now() - startTime,
          retryCount
        }
      };
    }
  }

  /**
   * 带重试的执行
   */
  private async executeWithRetry(input: TInput): Promise<TOutput> {
    const policy = this.config?.retryPolicy;
    if (!policy) {
      return await this._execute(input);
    }

    let lastError: Error | undefined;
    let delay = policy.initialDelay;

    for (let i = 0; i <= policy.maxRetries; i++) {
      try {
        return await this._execute(input);
      } catch (error: any) {
        lastError = error;

        // 检查是否可重试
        if (i < policy.maxRetries && this.isRetryable(error)) {
          await this.sleep(delay);
          delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelay);
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * 检查错误是否可重试
   */
  private isRetryable(error: Error): boolean {
    const retryableErrors = this.config?.retryPolicy?.retryableErrors;
    if (!retryableErrors) return true;

    return retryableErrors.some(pattern => 
      error.message.includes(pattern) || error.name.includes(pattern)
    );
  }

  /**
   * 限流检查
   */
  private async checkRateLimit(): Promise<void> {
    if (!this.config?.rateLimit) return;

    const { maxCalls, windowMs } = this.config.rateLimit;
    const now = Date.now();
    const windowStart = now - windowMs;

    // 清理过期记录
    this.callHistory = this.callHistory.filter(t => t > windowStart);

    // 检查是否超限
    if (this.callHistory.length >= maxCalls) {
      const oldestCall = this.callHistory[0];
      const waitTime = oldestCall + windowMs - now;
      throw new Error(`Rate limit exceeded. Wait ${waitTime}ms`);
    }

    this.callHistory.push(now);
  }

  /**
   * 从缓存获取
   */
  private getFromCache(input: TInput): TOutput | null {
    if (!this.config?.cache) return null;

    const key = this.getCacheKey(input);
    const cached = this.cache.get(key);

    if (!cached) return null;

    // 检查是否过期
    const ttl = this.config.cache.ttl || 3600;
    if (Date.now() - cached.timestamp > ttl * 1000) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * 写入缓存
   */
  private setToCache(input: TInput, output: TOutput): void {
    if (!this.config?.cache) return;

    const key = this.getCacheKey(input);
    this.cache.set(key, {
      data: output,
      timestamp: Date.now()
    });
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(input: TInput): string {
    if (this.config?.cache?.key) {
      return this.config.cache.key(input);
    }
    return JSON.stringify(input);
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 验证输入
   */
  validateInput(input: unknown): TInput {
    return this.inputSchema.parse(input);
  }

  /**
   * 验证输出
   */
  validateOutput(output: unknown): TOutput {
    return this.outputSchema.parse(output);
  }

  /**
   * 实际执行逻辑（子类实现）
   */
  protected abstract _execute(input: TInput): Promise<TOutput>;
}
