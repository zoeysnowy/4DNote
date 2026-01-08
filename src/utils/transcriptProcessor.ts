/**
 * Transcript 处理器
 * 
 * 功能：
 * 1. 从 URL 下载 transcript
 * 2. 解析时间戳格式（支持多种格式）
 * 3. 将 transcript 段落转换为事件
 * 4. 随机分配到过去1个月的时间段
 * 
 * @author Zoey Gong
 */

import { Event } from '@frontend/types';
import { formatTimeForStorage } from './timeUtils';

/**
 * Transcript 段落接口
 */
export interface TranscriptSegment {
  timestamp?: string;       // 原始时间戳（如 "00:01:23" 或 "1:23"）
  startSeconds?: number;    // 开始时间（秒）
  endSeconds?: number;      // 结束时间（秒）
  text: string;             // 文本内容
  speaker?: string;         // 说话人（可选）
}

/**
 * 处理配置
 */
export interface ProcessConfig {
  startDate?: Date;         // 开始日期（默认：今天）
  endDate?: Date;           // 结束日期（默认：1个月前）
  randomizeTime?: boolean;  // 是否随机化时间（默认：true）
  preserveOrder?: boolean;  // 是否保持原始顺序（默认：false）
  tagPrefix?: string;       // 标签前缀（默认：'transcript'）
  baseTime?: string;        // 基准时间（如 "16:00"，视频0:00对应的实际时间）
  minIntervalMinutes?: number; // 最短时间间隔（分钟，默认5分钟）
  fileName?: string;        // 文件名（用作Event标题）
}

/**
 * 检测视频平台和提取视频ID
 */
export function detectVideoPlatform(url: string): { platform: 'youtube' | 'bilibili' | 'direct' | null; videoId?: string } {
  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) {
    return { platform: 'youtube', videoId: youtubeMatch[1] };
  }
  
  // B站
  const bilibiliMatch = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+|av\d+)/);
  if (bilibiliMatch) {
    return { platform: 'bilibili', videoId: bilibiliMatch[1] };
  }
  
  // 直接的transcript文件URL
  if (url.match(/\.(vtt|srt|txt)$/i) || url.includes('transcript')) {
    return { platform: 'direct' };
  }
  
  return { platform: null };
}

/**
 * 从视频平台获取字幕
 */
export async function fetchVideoSubtitles(url: string): Promise<string> {
  const { platform, videoId } = detectVideoPlatform(url);
  
  if (!platform) {
    throw new Error('不支持的URL格式。请提供YouTube、B站视频链接，或直接的字幕文件URL');
  }
  
  if (platform === 'direct') {
    return downloadTranscript(url);
  }
  
  // 对于YouTube和B站，我们需要调用后端服务来获取字幕
  // 这里先返回一个提示，实际需要后端支持
  console.log(`[TranscriptProcessor] 检测到 ${platform} 视频:`, videoId);
  
  try {
    // 尝试调用本地代理服务获取字幕
    const response = await fetch('http://localhost:3001/api/subtitles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, videoId, url })
    });
    
    if (!response.ok) {
      throw new Error(`无法获取字幕: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.transcript || data.subtitles;
  } catch (error: any) {
    console.error('[TranscriptProcessor] 无法通过代理获取字幕:', error);
    throw new Error(
      `暂不支持自动提取${platform === 'youtube' ? 'YouTube' : 'B站'}字幕。\n\n` +
      `请手动下载字幕文件后粘贴内容，或提供字幕文件的直接链接。\n\n` +
      `YouTube: 使用浏览器插件下载字幕\n` +
      `B站: 右键点击视频 → 字幕 → 下载`
    );
  }
}

/**
 * 从 URL 下载 transcript
 */
export async function downloadTranscript(url: string): Promise<string> {
  try {
    console.log('[TranscriptProcessor] 📥 下载 transcript:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    console.log('[TranscriptProcessor] Content-Type:', contentType);
    
    const text = await response.text();
    console.log('[TranscriptProcessor] ✅ 下载成功，长度:', text.length);
    
    return text;
  } catch (error: any) {
    console.error('[TranscriptProcessor] ❌ 下载失败:', error);
    throw new Error(`无法下载 transcript: ${error.message}`);
  }
}

/**
 * 解析时间戳为秒数
 * 支持格式：
 * - "00:01:23" (HH:MM:SS)
 * - "1:23" (MM:SS)
 * - "01:23.456" (MM:SS.mmm)
 * - "1:23:45.678" (HH:MM:SS.mmm)
 */
export function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':');
  let seconds = 0;
  
  if (parts.length === 3) {
    // HH:MM:SS 或 HH:MM:SS.mmm
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const secondsPart = parseFloat(parts[2]);
    seconds = hours * 3600 + minutes * 60 + secondsPart;
  } else if (parts.length === 2) {
    // MM:SS 或 MM:SS.mmm
    const minutes = parseInt(parts[0]);
    const secondsPart = parseFloat(parts[1]);
    seconds = minutes * 60 + secondsPart;
  } else {
    // 纯秒数
    seconds = parseFloat(timestamp);
  }
  
  return seconds;
}

/**
 * 解析 transcript 文本
 * 支持多种格式：
 * 
 * 格式 1: VTT (WebVTT)
 * ```
 * WEBVTT
 * 
 * 00:00:01.000 --> 00:00:05.000
 * Hello, this is the first line.
 * 
 * 00:00:05.000 --> 00:00:10.000
 * This is the second line.
 * ```
 * 
 * 格式 2: SRT
 * ```
 * 1
 * 00:00:01,000 --> 00:00:05,000
 * Hello, this is the first line.
 * 
 * 2
 * 00:00:05,000 --> 00:00:10,000
 * This is the second line.
 * ```
 * 
 * 格式 3: 简单时间戳
 * ```
 * [00:01] Introduction
 * [00:23] Main topic
 * [01:45] Conclusion
 * ```
 * 
 * 格式 4: YouTube 描述格式
 * ```
 * 0:00 Intro
 * 1:23 Topic 1
 * 5:45 Topic 2
 * ```
 */
export function parseTranscript(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  
  // 检测格式
  if (text.includes('WEBVTT') || text.includes('-->')) {
    return parseVTTorSRT(text);
  } else if (text.includes('[') && text.includes(']')) {
    return parseBracketFormat(text);
  } else {
    return parseYouTubeFormat(text);
  }
}

/**
 * 解析 VTT/SRT 格式
 */
function parseVTTorSRT(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = text.split('\n');
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // 查找时间戳行
    if (line.includes('-->')) {
      const [start, end] = line.split('-->').map(s => s.trim());
      
      // 清理时间戳（移除毫秒分隔符差异）
      const cleanStart = start.replace(',', '.');
      const cleanEnd = end.replace(',', '.');
      
      // 获取文本内容（下一行或多行）
      let textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() && !lines[i].includes('-->')) {
        // 跳过序号行（纯数字）
        if (!/^\d+$/.test(lines[i].trim())) {
          textLines.push(lines[i].trim());
        }
        i++;
      }
      
      if (textLines.length > 0) {
        segments.push({
          timestamp: cleanStart,
          startSeconds: parseTimestamp(cleanStart),
          endSeconds: parseTimestamp(cleanEnd),
          text: textLines.join(' ')
        });
      }
    } else {
      i++;
    }
  }
  
  return segments;
}

/**
 * 解析方括号格式 [00:01] Text
 */
function parseBracketFormat(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const match = line.match(/\[([^\]]+)\]\s*(.+)/);
    if (match) {
      const timestamp = match[1];
      const text = match[2].trim();
      
      segments.push({
        timestamp,
        startSeconds: parseTimestamp(timestamp),
        text
      });
    }
  }
  
  return segments;
}

/**
 * 解析 YouTube 描述格式 0:00 Text
 * 支持两种格式：
 * 1. 0:00 文本在同一行
 * 2. 0:00
 *    文本在下一行
 */
function parseYouTubeFormat(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = text.split('\n');
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // 匹配时间戳（单独一行或行首）
    const timestampMatch = line.match(/^(\d+(?::\d+)+)/);
    
    if (timestampMatch) {
      const timestamp = timestampMatch[1];
      let textContent = '';
      
      // 检查时间戳后面是否有文本（同一行）
      const sameLineText = line.substring(timestampMatch[0].length).trim();
      
      if (sameLineText) {
        // 格式1: "0:00 文本内容"
        textContent = sameLineText;
        i++;
      } else {
        // 格式2: 时间戳单独一行，文本在下面
        i++;
        const textLines: string[] = [];
        
        // 收集文本，直到遇到下一个时间戳或空行
        while (i < lines.length) {
          const nextLine = lines[i].trim();
          
          // 如果是空行或下一个时间戳，停止
          if (!nextLine || /^\d+(?::\d+)+/.test(nextLine)) {
            break;
          }
          
          textLines.push(nextLine);
          i++;
        }
        
        textContent = textLines.join(' ');
      }
      
      if (textContent) {
        segments.push({
          timestamp,
          startSeconds: parseTimestamp(timestamp),
          text: textContent
        });
      }
    } else {
      i++;
    }
  }
  
  return segments;
}

/**
 * 将 transcript 段落转换为事件
 * 
 * ✅ 符合 EventHub Architecture 标准：
 * - title: 使用文件名作为标题（字符串格式），normalizeEvent 会自动转换为三层架构
 * - eventlog: 所有时间戳片段作为paragraph节点（符合 Block-Level Timestamp 规范）
 * - 每个paragraph包含时间戳元数据（createdAt/updatedAt）
 * 
 * @param segments - Transcript 段落数组
 * @param config - 处理配置
 * @returns Event 数组（只包含一个事件）
 */
export function transcriptToEvents(
  segments: TranscriptSegment[],
  config: ProcessConfig = {}
): Event[] {
  const {
    startDate = new Date(),
    endDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    randomizeTime = true,
    tagPrefix = 'transcript',
    baseTime,
    fileName
  } = config;
  
  console.log('[TranscriptProcessor] 🔄 转换为事件...');
  console.log('  段落数:', segments.length);
  console.log('  文件名:', fileName || '未指定');
  console.log('  基准时间:', baseTime || '随机分配');
  
  // 计算事件时间
  let eventStartTime: Date;
  let eventEndTime: Date;
  
  if (baseTime && !randomizeTime) {
    // 使用基准时间模式
    const [hours, minutes] = baseTime.split(':').map(Number);
    eventStartTime = new Date(startDate);
    eventStartTime.setHours(hours, minutes || 0, 0, 0);
    
    // 根据最后一个片段的时间戳计算结束时间
    const lastSegment = segments[segments.length - 1];
    const durationSeconds = lastSegment.startSeconds || 0;
    eventEndTime = new Date(eventStartTime.getTime() + (durationSeconds + 60) * 1000);
  } else {
    // 随机时间模式：在 endDate 和 startDate 之间随机选择日期
    const timeRangeMs = startDate.getTime() - endDate.getTime();
    const randomOffset = Math.random() * timeRangeMs;
    eventStartTime = new Date(endDate.getTime() + randomOffset);
    
    // 随机设置小时和分钟 (6:00 - 22:00)
    const randomHour = Math.floor(Math.random() * 16) + 6;
    const randomMinute = Math.floor(Math.random() * 60);
    eventStartTime.setHours(randomHour, randomMinute, 0, 0);
    
    eventEndTime = new Date(eventStartTime.getTime() + 60 * 60 * 1000); // +1小时
  }
  
  // 生成 Slate JSON - 每个时间戳片段是一个paragraph
  const blockTimestamp = Date.now();
  const slateNodes = segments.map((segment, idx) => {
    const paragraphTimestamp = segment.startSeconds 
      ? eventStartTime.getTime() + segment.startSeconds * 1000
      : blockTimestamp + idx;
    
    return {
      type: 'paragraph',
      id: `block-${blockTimestamp + idx}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: paragraphTimestamp,
      updatedAt: paragraphTimestamp,
      children: [{ 
        text: segment.timestamp ? `[${segment.timestamp}] ${segment.text}` : segment.text
      }]
    };
  });
  
  // 创建单个事件（基础字段，EventService.normalizeEvent 会补全）
  const event = {
    id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    title: fileName || segments[0]?.text.substring(0, 50) || 'Transcript',
    startTime: formatTimeForStorage(eventStartTime),
    endTime: formatTimeForStorage(eventEndTime),
    tags: [tagPrefix].filter(Boolean),
    eventlog: JSON.stringify(slateNodes),
    source: 'local:library',
    createdAt: formatTimeForStorage(new Date()),
    updatedAt: formatTimeForStorage(new Date())
  } as Event;
  
  console.log('[TranscriptProcessor] ✅ 生成事件:', {
    title: event.title,
    paragraphs: slateNodes.length,
    startTime: event.startTime,
    endTime: event.endTime
  });
  
  return [event];
}

/**
 * 截断文本（用于标题）
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * 随机打乱数组
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 完整处理流程：下载 → 解析 → 转换
 */
export async function processTranscriptFromURL(
  url: string,
  config: ProcessConfig = {}
): Promise<Event[]> {
  console.log('[TranscriptProcessor] 🚀 开始处理视频/字幕...');
  
  // 1. 获取字幕内容（支持视频URL或直接的字幕文件）
  const text = await fetchVideoSubtitles(url);
  
  // 2. 解析
  const segments = parseTranscript(text);
  console.log('[TranscriptProcessor] 📝 解析出', segments.length, '个段落');
  
  if (segments.length === 0) {
    throw new Error('未能解析出任何内容，请检查 transcript 格式');
  }
  
  // 3. 转换为事件
  const events = transcriptToEvents(segments, config);
  
  return events;
}
