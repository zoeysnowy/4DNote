/**
 * 版本差异计算和压缩工具
 * 
 * 使用 fast-json-patch 计算 JSON diff
 * 使用 pako 进行 gzip 压缩
 * 
 * @version 1.0.0
 * @date 2025-12-02
 */

import { compare, applyPatch as applyJSONPatch, type Operation } from 'fast-json-patch';
import pako from 'pako';
import type { EventLog } from '../types';
import { formatTimeForStorage } from './timeUtils';

export interface DeltaResult {
  delta: string;              // Base64 编码的压缩数据
  deltaSize: number;          // 压缩后大小（字节）
  originalSize: number;       // 原始大小（字节）
  compressionRatio: number;   // 压缩率（百分比）
}

/**
 * 生成版本 delta（增量）
 * 
 * @param oldEventLog 旧版本 EventLog
 * @param newEventLog 新版本 EventLog
 * @returns Delta 结果（包含压缩数据和统计信息）
 */
export function generateDelta(
  oldEventLog: EventLog,
  newEventLog: EventLog
): DeltaResult {
  try {
    // 1. 解析 JSON
    const oldNodes = JSON.parse(oldEventLog.slateJson);
    const newNodes = JSON.parse(newEventLog.slateJson);
    
    // 2. 计算 JSON Patch
    const patch = compare(oldNodes, newNodes);
    
    // 3. 序列化 patch
    const patchStr = JSON.stringify(patch);
    const encoder = new TextEncoder();
    const patchBuffer = encoder.encode(patchStr);
    
    // 4. 压缩 patch（gzip level 9）
    const compressed = pako.deflate(patchBuffer, { level: 9 });
    
    // 5. 转为 Base64
    const compressedBase64 = btoa(String.fromCharCode(...compressed));
    
    // 6. 统计信息
    const originalSize = newEventLog.slateJson.length;
    const deltaSize = compressedBase64.length;
    const compressionRatio = ((1 - deltaSize / originalSize) * 100);
    
    return {
      delta: compressedBase64,
      deltaSize,
      originalSize,
      compressionRatio: Math.max(0, compressionRatio) // 确保非负
    };
  } catch (error) {
    console.error('[versionDiff] Failed to generate delta:', error);
    throw error;
  }
}

/**
 * 应用 delta 恢复版本
 * 
 * @param baseEventLog 基础版本 EventLog
 * @param deltaBase64 Base64 编码的压缩 delta
 * @returns 恢复后的 EventLog
 */
export function applyDelta(
  baseEventLog: EventLog,
  deltaBase64: string
): EventLog {
  try {
    // 1. Base64 解码
    const binaryString = atob(deltaBase64);
    const compressedBuffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      compressedBuffer[i] = binaryString.charCodeAt(i);
    }
    
    // 2. 解压缩
    const decompressed = pako.inflate(compressedBuffer);
    const decoder = new TextDecoder('utf-8');
    const patchStr = decoder.decode(decompressed);
    
    // 3. 解析 patch
    const patch: Operation[] = JSON.parse(patchStr);
    
    // 4. 解析基础版本
    const baseNodes = JSON.parse(baseEventLog.slateJson);
    
    // 5. 应用 patch
    const result = applyJSONPatch(baseNodes, patch);
    
    if (result.newDocument === undefined) {
      throw new Error('Failed to apply patch: newDocument is undefined');
    }
    
    // 6. 重新序列化为 EventLog
    const restoredSlateJson = JSON.stringify(result.newDocument);
    
    // 导入 slateSerializer（避免循环依赖）
    const { slateNodesToPlainText, slateNodesToHtml } = require('./slateSerializer');
    
    return {
      slateJson: restoredSlateJson,
      plainText: slateNodesToPlainText(result.newDocument),
      html: slateNodesToHtml(result.newDocument),
      lastEditedAt: formatTimeForStorage(new Date())
    };
  } catch (error) {
    console.error('[versionDiff] Failed to apply delta:', error);
    throw error;
  }
}

/**
 * 压缩完整 EventLog（用于首个版本）
 * 
 * @param eventLog 完整 EventLog
 * @returns 压缩结果
 */
export function compressFullEventLog(eventLog: EventLog): DeltaResult {
  try {
    // Use TextEncoder for browser compatibility
    const encoder = new TextEncoder();
    const slateJsonBuffer = encoder.encode(eventLog.slateJson);
    const compressed = pako.deflate(slateJsonBuffer, { level: 9 });
    
    // Convert Uint8Array to base64 using browser-compatible method
    const compressedBase64 = btoa(String.fromCharCode(...compressed));
    
    const originalSize = eventLog.slateJson.length;
    const deltaSize = compressedBase64.length;
    const compressionRatio = ((1 - deltaSize / originalSize) * 100);
    
    return {
      delta: compressedBase64,
      deltaSize,
      originalSize,
      compressionRatio: Math.max(0, compressionRatio)
    };
  } catch (error) {
    console.error('[versionDiff] Failed to compress full EventLog:', error);
    throw error;
  }
}

/**
 * 解压缩完整 EventLog（用于恢复首个版本）
 * 
 * @param deltaBase64 Base64 编码的压缩数据
 * @returns 完整 EventLog
 */
export function decompressFullEventLog(deltaBase64: string): EventLog {
  try {
    // Convert base64 to Uint8Array using browser-compatible method
    const binaryString = atob(deltaBase64);
    const compressedBuffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      compressedBuffer[i] = binaryString.charCodeAt(i);
    }
    
    const decompressed = pako.inflate(compressedBuffer);
    
    // Use TextDecoder for browser compatibility
    const decoder = new TextDecoder('utf-8');
    const slateJson = decoder.decode(decompressed);
    
    // 导入 slateSerializer
    const { slateNodesToPlainText, slateNodesToHtml } = require('./slateSerializer');
    const nodes = JSON.parse(slateJson);
    
    return {
      slateJson,
      plainText: slateNodesToPlainText(nodes),
      html: slateNodesToHtml(nodes),
      lastEditedAt: formatTimeForStorage(new Date())
    };
  } catch (error) {
    console.error('[versionDiff] Failed to decompress full EventLog:', error);
    throw error;
  }
}

/**
 * 批量计算版本链的总压缩率
 * 
 * @param versions 版本数组（包含 deltaSize 和 originalSize）
 * @returns 平均压缩率（百分比）
 */
export function calculateAverageCompressionRatio(versions: Array<{
  deltaSize: number;
  originalSize: number;
}>): number {
  if (versions.length === 0) return 0;
  
  const totalDeltaSize = versions.reduce((sum, v) => sum + v.deltaSize, 0);
  const totalOriginalSize = versions.reduce((sum, v) => sum + v.originalSize, 0);
  
  if (totalOriginalSize === 0) return 0;
  
  return ((1 - totalDeltaSize / totalOriginalSize) * 100);
}

/**
 * 验证 delta 完整性（测试压缩和解压）
 * 
 * @param eventLog EventLog 对象
 * @returns 验证结果
 */
export function validateDeltaIntegrity(eventLog: EventLog): {
  success: boolean;
  compressionRatio: number;
  error?: string;
} {
  try {
    // 压缩
    const result = compressFullEventLog(eventLog);
    
    // 解压
    const restored = decompressFullEventLog(result.delta);
    
    // 比较
    if (restored.slateJson !== eventLog.slateJson) {
      return {
        success: false,
        compressionRatio: result.compressionRatio,
        error: 'Decompressed data does not match original'
      };
    }
    
    return {
      success: true,
      compressionRatio: result.compressionRatio
    };
  } catch (error: any) {
    return {
      success: false,
      compressionRatio: 0,
      error: error.message
    };
  }
}

export default {
  generateDelta,
  applyDelta,
  compressFullEventLog,
  decompressFullEventLog,
  calculateAverageCompressionRatio,
  validateDeltaIntegrity
};
