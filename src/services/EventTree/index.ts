/**
 * EventTree Engine - Public Exports
 * 
 * 统一导出接口
 * 
 * 版本: v1.0.0
 * 创建日期: 2025-12-23
 */

// Core Engine (纯函数)
export {
  buildEventTree,
  recomputeSiblings,
  computeReparentEffect,
  calculateBulletLevelsBatch,
} from './TreeEngine';

// High-Level API
export { EventTreeAPI } from './TreeAPI';

// Tree Cache (Phase 3)
export { EventTreeCache, treeCache } from './TreeCache';

// Performance Monitor (Phase 3)
export { EventTreePerformanceMonitor, perfMonitor } from './PerformanceMonitor';

// Types
export type {
  EventNode,
  EventTreeResult,
  TreeValidationError,
  SiblingOrderUpdate,
  ReparentInput,
  ReparentUpdateResult,
  TreeTraverseOptions,
  BulletLevelOptions,
  TreeBuildOptions,
} from './types';
