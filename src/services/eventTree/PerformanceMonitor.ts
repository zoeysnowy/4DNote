/**
 * EventTree Performance Monitor - Phase 3优化
 * 
 * 监控树操作的性能指标：
 * - Tab/Shift+Tab响应时间
 * - buildEventTree耗时
 * - 缓存命中率
 * - 大树性能警告
 * 
 * 版本: v1.0.0
 * 创建日期: 2025-12-24
 */

/**
 * 性能指标类型
 */
interface PerformanceMetric {
  /** 操作名称 */
  operation: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 耗时(ms) */
  duration?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 性能摘要
 */
interface PerformanceSummary {
  operation: string;
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * 事件树性能监控器
 */
export class EventTreePerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private activeTimers: Map<string, PerformanceMetric> = new Map();
  
  /** 性能阈值配置 */
  private thresholds = {
    tabIndent: 100,           // Tab操作：100ms
    buildTree: 50,            // 树构建：50ms（100节点）
    largeTree: 500,           // 大树警告：500节点
    cacheHitRate: 80,         // 缓存命中率：80%
  };

  /**
   * 开始性能计时
   * 
   * @param timerId - 计时器ID
   * @param operation - 操作名称
   * @param metadata - 元数据
   */
  start(timerId: string, operation: string, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      operation,
      startTime: performance.now(),
      metadata,
    };
    
    this.activeTimers.set(timerId, metric);
    
    console.log(`⏱️ [PerfMonitor] Start: ${operation}`, metadata || {});
  }

  /**
   * 结束性能计时
   * 
   * @param timerId - 计时器ID
   * @param additionalMetadata - 额外元数据
   * @returns 耗时(ms)
   */
  end(timerId: string, additionalMetadata?: Record<string, any>): number | undefined {
    const metric = this.activeTimers.get(timerId);
    
    if (!metric) {
      console.warn(`⚠️ [PerfMonitor] Timer not found: ${timerId}`);
      return undefined;
    }
    
    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    
    if (additionalMetadata) {
      metric.metadata = { ...metric.metadata, ...additionalMetadata };
    }
    
    // 保存到历史记录
    const history = this.metrics.get(metric.operation) || [];
    history.push({ ...metric });
    
    // 限制历史记录大小（保留最近100条）
    if (history.length > 100) {
      history.shift();
    }
    
    this.metrics.set(metric.operation, history);
    
    // 清除活动计时器
    this.activeTimers.delete(timerId);
    
    // 性能警告检查
    this.checkThreshold(metric);
    
    console.log(`✅ [PerfMonitor] End: ${metric.operation} (${metric.duration.toFixed(2)}ms)`, metric.metadata || {});
    
    return metric.duration;
  }

  /**
   * 记录单次操作（无需手动start/end）
   * 
   * @param operation - 操作名称
   * @param duration - 耗时(ms)
   * @param metadata - 元数据
   */
  record(operation: string, duration: number, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      operation,
      startTime: performance.now() - duration,
      endTime: performance.now(),
      duration,
      metadata,
    };
    
    const history = this.metrics.get(operation) || [];
    history.push(metric);
    
    if (history.length > 100) {
      history.shift();
    }
    
    this.metrics.set(operation, history);
    
    this.checkThreshold(metric);
  }

  /**
   * 获取操作的性能摘要
   * 
   * @param operation - 操作名称
   * @returns 性能摘要（null = 无数据）
   */
  getSummary(operation: string): PerformanceSummary | null {
    const history = this.metrics.get(operation);
    
    if (!history || history.length === 0) {
      return null;
    }
    
    const durations = history
      .map(m => m.duration!)
      .filter(d => d !== undefined)
      .sort((a, b) => a - b);
    
    if (durations.length === 0) {
      return null;
    }
    
    const sum = durations.reduce((a, b) => a + b, 0);
    
    return {
      operation,
      count: durations.length,
      avgDuration: sum / durations.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p50: this.percentile(durations, 50),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
    };
  }

  /**
   * 获取所有操作的性能摘要
   */
  getAllSummaries(): PerformanceSummary[] {
    const summaries: PerformanceSummary[] = [];
    
    for (const operation of this.metrics.keys()) {
      const summary = this.getSummary(operation);
      if (summary) {
        summaries.push(summary);
      }
    }
    
    return summaries.sort((a, b) => b.avgDuration - a.avgDuration);
  }

  /**
   * 打印性能报告
   */
  printReport(): void {
    const summaries = this.getAllSummaries();
    
    if (summaries.length === 0) {
      console.log('📊 [PerfMonitor] No performance data collected yet.');
      return;
    }
    
    console.log('\n📊 ==================== Performance Report ====================\n');
    console.table(
      summaries.map(s => ({
        Operation: s.operation,
        Count: s.count,
        'Avg (ms)': s.avgDuration.toFixed(2),
        'P50 (ms)': s.p50.toFixed(2),
        'P95 (ms)': s.p95.toFixed(2),
        'P99 (ms)': s.p99.toFixed(2),
        'Min (ms)': s.minDuration.toFixed(2),
        'Max (ms)': s.maxDuration.toFixed(2),
      }))
    );
    console.log('\n================================================================\n');
  }

  /**
   * 清除所有性能数据
   */
  clear(): void {
    this.metrics.clear();
    this.activeTimers.clear();
    console.log('🗑️ [PerfMonitor] Performance data cleared');
  }

  // ==================== 私有方法 ====================

  /**
   * 计算百分位数
   */
  private percentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * 检查性能阈值并发出警告
   */
  private checkThreshold(metric: PerformanceMetric): void {
    if (!metric.duration) return;
    
    // Tab/Shift+Tab操作阈值
    if (metric.operation.includes('tab') || metric.operation.includes('Tab')) {
      if (metric.duration > this.thresholds.tabIndent) {
        console.warn(`⚠️ [PerfMonitor] Tab operation slow!`, {
          operation: metric.operation,
          duration: `${metric.duration.toFixed(2)}ms`,
          threshold: `${this.thresholds.tabIndent}ms`,
          slowBy: `${(metric.duration - this.thresholds.tabIndent).toFixed(2)}ms`,
        });
      }
    }
    
    // buildEventTree阈值
    if (metric.operation.includes('buildEventTree')) {
      const nodeCount = metric.metadata?.nodeCount || 0;
      
      if (metric.duration > this.thresholds.buildTree && nodeCount < 200) {
        console.warn(`⚠️ [PerfMonitor] buildEventTree slow for small tree!`, {
          duration: `${metric.duration.toFixed(2)}ms`,
          nodeCount,
          threshold: `${this.thresholds.buildTree}ms`,
        });
      }
      
      // 大树警告
      if (nodeCount > this.thresholds.largeTree) {
        console.warn(`⚠️ [PerfMonitor] Large tree detected!`, {
          nodeCount,
          duration: `${metric.duration.toFixed(2)}ms`,
          perNode: `${(metric.duration / nodeCount).toFixed(3)}ms`,
          suggestion: 'Consider using TreeCache or pagination',
        });
      }
    }
  }
}

// 全局单例
export const perfMonitor = new EventTreePerformanceMonitor();

// 暴露到window（仅开发环境）
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).eventTreePerfMonitor = perfMonitor;
  console.log('🔍 [PerfMonitor] Available in window.eventTreePerfMonitor');
  console.log('   - perfMonitor.printReport(): Print performance report');
  console.log('   - perfMonitor.getAllSummaries(): Get all summaries');
  console.log('   - perfMonitor.clear(): Clear all data');
}
