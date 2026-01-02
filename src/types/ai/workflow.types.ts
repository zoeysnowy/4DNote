/**
 * AI Workflow 类型定义
 * Workflow 定义了完成特定任务的步骤序列
 */

import type { RetryPolicy } from './tool.types';

/**
 * 工作流节点类型
 */
export type WorkflowNodeType = 
  | 'start'
  | 'end'
  | 'process'
  | 'decision'
  | 'parallel'
  | 'tool'
  | 'agent'
  | 'llm';

/**
 * 工作流节点
 */
export interface WorkflowNode {
  id: string;
  name: string;
  type: WorkflowNodeType;
  description?: string;
  
  /**
   * 节点执行函数
   */
  execute?: (state: any) => Promise<any>;
  
  /**
   * 工具名称（当 type 为 'tool' 时）
   */
  toolName?: string;
  
  /**
   * Agent 名称（当 type 为 'agent' 时）
   */
  agentName?: string;
  
  /**
   * Prompt 模板（当 type 为 'llm' 时）
   */
  prompt?: string;
  
  /**
   * 配置
   */
  config?: Record<string, any>;
}

/**
 * 工作流边（连接）
 */
export interface WorkflowEdge {
  id: string;
  source: string; // 源节点 ID
  target: string; // 目标节点 ID
  
  /**
   * 条件函数（可选，用于条件分支）
   */
  condition?: (state: any) => boolean;
  
  /**
   * 标签
   */
  label?: string;
}

/**
 * 错误处理器
 */
export interface ErrorHandler {
  /**
   * 处理错误
   */
  handle(error: Error, context: any): Promise<any>;
  
  /**
   * 是否可重试
   */
  isRetryable(error: Error): boolean;
}

/**
 * 工作流配置
 */
export interface WorkflowConfig {
  timeout?: number;
  retryPolicy?: RetryPolicy;
  errorHandling?: ErrorHandler;
  enableCheckpoint?: boolean; // 是否启用检查点
  checkpointInterval?: number; // 检查点间隔（节点数）
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  averageExecutionTime: number;
  successRate: number;
  totalExecutions: number;
  lastExecutionTime?: number;
}

/**
 * 工作流元数据
 */
export interface WorkflowMetadata {
  author: string;
  createdAt: Date;
  updatedAt?: Date;
  tags: string[];
  performance: PerformanceMetrics;
}

/**
 * 工作流定义
 */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  
  /**
   * 节点列表
   */
  nodes: WorkflowNode[];
  
  /**
   * 边列表
   */
  edges: WorkflowEdge[];
  
  /**
   * 入口节点 ID
   */
  entryPoint: string;
  
  /**
   * 配置
   */
  config: WorkflowConfig;
  
  /**
   * 元数据
   */
  metadata: WorkflowMetadata;
}

/**
 * 工作流状态
 */
export interface WorkflowState {
  /**
   * 当前节点 ID
   */
  currentNode?: string;
  
  /**
   * 已完成的节点
   */
  completedNodes: string[];
  
  /**
   * 工作流数据
   */
  data: Record<string, any>;
  
  /**
   * 错误信息
   */
  error?: Error;
  
  /**
   * 元数据
   */
  metadata: {
    startTime: Date;
    endTime?: Date;
    executionTime?: number;
  };
}

/**
 * 工作流执行结果
 */
export interface WorkflowExecutionResult {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    node?: string;
    details?: any;
  };
  state: WorkflowState;
  metadata: {
    executionTime: number;
    nodesExecuted: number;
    retriedNodes?: string[];
  };
}

/**
 * 工作流执行器接口
 */
export interface IWorkflowExecutor {
  /**
   * 执行工作流
   */
  execute(workflow: Workflow, input: any): Promise<WorkflowExecutionResult>;
  
  /**
   * 从检查点恢复执行
   */
  resume(checkpointId: string): Promise<WorkflowExecutionResult>;
  
  /**
   * 取消执行
   */
  cancel(executionId: string): Promise<void>;
}

/**
 * 工作流构建器接口
 */
export interface IWorkflowBuilder {
  /**
   * 添加节点
   */
  addNode(node: WorkflowNode): IWorkflowBuilder;
  
  /**
   * 添加边
   */
  addEdge(edge: WorkflowEdge): IWorkflowBuilder;
  
  /**
   * 设置入口点
   */
  setEntryPoint(nodeId: string): IWorkflowBuilder;
  
  /**
   * 设置配置
   */
  setConfig(config: Partial<WorkflowConfig>): IWorkflowBuilder;
  
  /**
   * 构建工作流
   */
  build(): Workflow;
  
  /**
   * 验证工作流
   */
  validate(): { valid: boolean; errors: string[] };
}
