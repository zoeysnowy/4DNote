/**
 * StatusLineContainer - 竖线状态容器（矩阵算法版本）
 * 
 * 功能：
 * 1. 支持多条并行竖线（每行可能有多个不同状态的竖线）
 * 2. 自适应缩进（根据实际竖线数量动态调整内容缩进）
 * 3. 智能标签定位（每个状态只显示一次，优先放在最左侧位置）
 * 4. 增量更新优化（只重新计算变化的segments）
 * 
 * 算法：矩阵 + 俄罗斯方块合并
 * - 时间复杂度：O(n×m) where n=events, m=status types
 * - 空间复杂度：O(n×m)
 * - 自动连续性：纵向扫描天然合并连续segment
 * 
 * 设计规则：
 * - 竖线宽度：2px（Figma规范）
 * - 竖线间距：5px
 * - 标签与竖线间距：8px
 */

import React, { useMemo, useEffect, useState, useRef } from 'react';
import './StatusLineContainer.css';

export interface StatusLineSegment {
  startIndex: number;
  endIndex: number;
  status: 'new' | 'updated' | 'done' | 'missed' | 'deleted';
  label: string;
}

interface StatusLineContainerProps {
  children: React.ReactNode;
  segments: StatusLineSegment[];
  editorItems: any[]; // 事件列表，用于根据 index 查找事件
  lineHeight?: number; // 每行高度
  totalLines?: number; // 总行数
}

const LINE_WIDTH = 2; // 竖线宽度
const LINE_SPACING = 3; // 竖线间距
const LABEL_SPACING = 8; // 标签与竖线的间距
const BASE_LEFT = 5; // 基础左边距

export const StatusLineContainer: React.FC<StatusLineContainerProps> = ({ 
  children, 
  segments,
  editorItems,
  lineHeight = 32,
  totalLines = 0 
}) => {
  // 🚀 增量更新缓存：避免segments完全相同时重新计算
  const segmentsHash = useMemo(() => {
    return segments.map(s => `${s.startIndex}-${s.endIndex}-${s.status}`).join('|');
  }, [segments]);
  
  // 计算每一行的竖线列表（从左到右排序）
  const lineConfigs = useMemo(() => {
    const configs: Map<number, StatusLineSegment[]> = new Map();
    
    segments.forEach(segment => {
      for (let i = segment.startIndex; i <= segment.endIndex; i++) {
        if (!configs.has(i)) {
          configs.set(i, []);
        }
        configs.get(i)!.push(segment);
      }
    });
    
    return configs;
  }, [segmentsHash]); // 🔧 使用hash而不是segments，避免引用变化导致重新计算

  // 计算全局最大竖线数量（决定最大缩进）
  const maxLinesCount = useMemo(() => {
    let max = 0;
    lineConfigs.forEach(lines => {
      max = Math.max(max, lines.length);
    });
    return max;
  }, [lineConfigs]);

  // 🎯 矩阵算法：为每个segment分配列位置（column index）
  // 优势：O(n×m) 复杂度，自动合并连续segment，无冲突，支持增量更新
  const segmentColumns = useMemo(() => {
    const startTime = performance.now();
    const columnMap = new Map<StatusLineSegment, number>();
    
    if (segments.length === 0) return columnMap;
    
    // 步骤1: 构建状态矩阵 matrix[eventIndex][status] = segment
    const matrix = new Map<number, Map<string, StatusLineSegment>>();
    const maxEventIndex = Math.max(...segments.map(s => s.startIndex));
    
    segments.forEach(segment => {
      if (!matrix.has(segment.startIndex)) {
        matrix.set(segment.startIndex, new Map());
      }
      matrix.get(segment.startIndex)!.set(segment.status, segment);
    });
    
    // console.log(`[StatusLineContainer] 🎯 矩阵算法: ${segments.length}个segments, ${maxEventIndex + 1}行, ${new Set(segments.map(s => s.status)).size}种状态`);
    
    // 步骤2: 纵向扫描，合并连续的相同状态（俄罗斯方块算法）
    const statusTypes = ['new', 'updated', 'deleted', 'done', 'missed'] as const;
    const statusGroups: Array<{
      status: string;
      segments: StatusLineSegment[];
    }> = [];
    
    statusTypes.forEach(status => {
      const continuousSegments: StatusLineSegment[] = [];
      let currentGroup: StatusLineSegment[] = [];
      
      // 纵向扫描所有事件
      for (let i = 0; i <= maxEventIndex; i++) {
        const segment = matrix.get(i)?.get(status);
        
        if (segment) {
          currentGroup.push(segment);
        } else if (currentGroup.length > 0) {
          // 遇到断点，保存当前组
          continuousSegments.push(...currentGroup);
          currentGroup = [];
        }
      }
      
      // 处理最后一组
      if (currentGroup.length > 0) {
        continuousSegments.push(...currentGroup);
      }
      
      if (continuousSegments.length > 0) {
        statusGroups.push({ status, segments: continuousSegments });
      }
    });
    
    // 步骤3: 智能列分配 - 检查垂直方向是否有重叠，无重叠则合并到同一列
    const columns: StatusLineSegment[][] = [];
    
    statusGroups.forEach(group => {
      // 尝试找到可以放置这组segments的列（垂直方向无重叠）
      let targetColumnIndex = -1;
      
      for (let colIndex = 0; colIndex < columns.length; colIndex++) {
        const columnSegments = columns[colIndex];
        
        // 检查这组segments是否与当前列的所有segments在垂直方向无重叠
        const hasOverlap = group.segments.some(newSeg => 
          columnSegments.some(existingSeg => 
            !(newSeg.endIndex < existingSeg.startIndex || newSeg.startIndex > existingSeg.endIndex)
          )
        );
        
        if (!hasOverlap) {
          targetColumnIndex = colIndex;
          break;
        }
      }
      
      // 如果找到了可用列，加入该列；否则创建新列
      if (targetColumnIndex !== -1) {
        columns[targetColumnIndex].push(...group.segments);
        // console.log(`[StatusLineContainer] 🔗 状态[${group.status}]合并到列${targetColumnIndex}: ${group.segments.length}个segments`);
      } else {
        columns.push([...group.segments]);
        // console.log(`[StatusLineContainer] 📊 状态[${group.status}]新建列${columns.length - 1}: ${group.segments.length}个segments`);
      }
    });
    
    // 分配列号
    columns.forEach((columnSegments, columnIndex) => {
      columnSegments.forEach(segment => {
        columnMap.set(segment, columnIndex);
      });
    });
    
    const elapsed = performance.now() - startTime;
    // console.log(`[StatusLineContainer] ✅ 列分配完成: ${columns.length}列, ${columnMap.size}个segments, 耗时 ${elapsed.toFixed(2)}ms`);
    
    return columnMap;
  }, [segmentsHash]); // 🚀 使用hash触发，支持增量更新

  // 计算标签的最大宽度
  const maxLabelWidth = useMemo(() => {
    if (segments.length === 0) return 0;
    // 估算每个标签的宽度（每个字符约7px，斜体加点额外空间）
    const labelWidths = segments.map(seg => seg.label.length * 7 + 4);
    return Math.max(...labelWidths);
  }, [segmentsHash]); // 🚀 使用hash触发

  // 使用state存储计算后的segment位置
  const [renderedSegments, setRenderedSegments] = useState<Array<{
    startIndex: number;
    endIndex: number;
    status: string;
    label: string;
    column: number;
    left: number;
    top: number;
    height: number;
  }>>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算每个segment的基础信息（left、column）
  const baseSegments = useMemo(() => {
    return segments.map(segment => {
      const column = segmentColumns.get(segment) || 0;
      const left = BASE_LEFT + maxLabelWidth + LABEL_SPACING + column * (LINE_WIDTH + LINE_SPACING);
      
      return {
        ...segment,
        column,
        left,
        top: segment.startIndex * lineHeight, // 初始估算值
        height: (segment.endIndex - segment.startIndex + 1) * lineHeight // 初始估算值
      };
    });
  }, [segmentsHash, segmentColumns, maxLabelWidth, lineHeight]); // 🚀 使用hash触发

  // 在DOM渲染后，使用实际DOM位置更新segment
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateSegmentPositions = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const contentDiv = container.querySelector('.status-line-content');
      if (!contentDiv) return;
      
      const allEventLines = contentDiv.querySelectorAll('[data-event-line]');
      if (allEventLines.length === 0) return;
      
      const containerRect = contentDiv.getBoundingClientRect();
      
      // 按 eventId 分组所有行（title + eventlog）
      const eventIdToLines = new Map<string, HTMLElement[]>();
      allEventLines.forEach(line => {
        const eventId = (line as HTMLElement).dataset.eventId;
        if (eventId) {
          if (!eventIdToLines.has(eventId)) {
            eventIdToLines.set(eventId, []);
          }
          eventIdToLines.get(eventId)!.push(line as HTMLElement);
        }
      });
      
      // console.log('[StatusLineContainer] 🔍 DOM查询:', {
      //   总行数: allEventLines.length,
      //   事件数: eventIdToLines.size,
      //   segments数: baseSegments.length
      // });
      
      const updated = baseSegments.map(segment => {
        // 通过 editorItems 的 index 找到对应的事件
        const eventItem = editorItems[segment.startIndex];
        if (!eventItem || !eventItem.id) {
          console.warn(`[StatusLineContainer] ⚠️ Segment[${segment.startIndex}]: 找不到对应的事件`);
          return segment;
        }
        
        // 获取这个事件的所有行（title + eventlog）
        const lines = eventIdToLines.get(eventItem.id);
        if (!lines || lines.length === 0) {
          console.warn(`[StatusLineContainer] ⚠️ Event ${eventItem.id}: 找不到DOM行`);
          return segment;
        }
        
        // 竖线从第一行（title）开始，到最后一行（最后的eventlog）结束
        const startElement = lines[0];
        const endElement = lines[lines.length - 1];
        
        const startRect = startElement.getBoundingClientRect();
        const endRect = endElement.getBoundingClientRect();
        const top = startRect.top - containerRect.top;
        const height = endRect.bottom - startRect.top;
        
        console.log(`[StatusLineContainer] Event[${segment.startIndex}] ${eventItem.title?.simpleTitle?.substring(0, 20) || ''} ${segment.status}: top=${top.toFixed(1)}, height=${height.toFixed(1)}, lines=${lines.length}`);
        
        return {
          ...segment,
          top,
          height
        };
      });
      
      // console.log('[StatusLineContainer] 渲染segments:', {
      //   输入segments数: segments.length,
      //   输出rendered数: updated.length,
      //   详情: updated.map(r => ({
      //     index: r.startIndex,
      //     status: r.status,
      //     column: r.column,
      //     left: r.left,
      //     top: r.top,
      //     height: r.height
      //   }))
      // });
      
      setRenderedSegments(updated);
    };
    
    // 初次渲染后立即更新
    updateSegmentPositions();
    
    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(updateSegmentPositions);
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [baseSegments, segmentsHash, editorItems]); // 🚀 使用hash触发

  // 计算智能标签位置
  const smartLabels = useMemo(() => {
    const labels: Array<{
      status: string;
      label: string;
      left: number;
      top: number;
    }> = [];
    
    const seenStatuses = new Map<string, { top: number; count: number }>();
    
    // 按startIndex排序，优先处理最早出现的segment
    const sortedSegments = [...renderedSegments].sort((a, b) => {
      return a.startIndex - b.startIndex;
    });
    
    sortedSegments.forEach(segment => {
      if (!seenStatuses.has(segment.status)) {
        // 检查是否有其他status在相同位置（top差距小于5px认为是同一行）
        let offsetCount = 0;
        seenStatuses.forEach((info, status) => {
          if (Math.abs(info.top - segment.top) < 5) {
            offsetCount += info.count;
          }
        });
        
        // 标签位置：使用竖线的起始位置（标题行）+ 半行高（因为CSS有translateY(-50%)）
        // 如果有重叠则向下偏移
        const top = segment.top + lineHeight / 2 + offsetCount * 20; // 每个标签高度约20px
        const left = BASE_LEFT;
        
        seenStatuses.set(segment.status, { top: segment.top, count: 1 });
        
        labels.push({
          status: segment.status,
          label: segment.label,
          left,
          top
        });
      }
    });
    
    return labels;
  }, [renderedSegments]);

  // 动态计算竖线区域的实际宽度
  const lineAreaWidth = useMemo(() => {
    if (maxLinesCount === 0) return 0;
    // 竖线区域宽度 = 竖线数量 × 宽度 + (竖线数量-1) × 间距
    return maxLinesCount * LINE_WIDTH + (maxLinesCount - 1) * LINE_SPACING;
  }, [maxLinesCount]);

  // 计算内容区域的缩进
  const contentPaddingLeft = useMemo(() => {
    if (maxLinesCount === 0) return 0;
    // 缩进 = BASE_LEFT + 标签最大宽度 + 间距 + 竖线区域宽度 + 间距
    return BASE_LEFT + maxLabelWidth + LABEL_SPACING + lineAreaWidth + LABEL_SPACING;
  }, [maxLabelWidth, lineAreaWidth]);

  return (
    <div ref={containerRef} className="status-line-container">
      {/* 竖线层 */}
      <div className="status-line-layer">
        {renderedSegments.map((segment, index) => (
          <div
            key={index}
            className={`status-line ${segment.status}`}
            style={{
              left: segment.left,
              top: segment.top,
              height: segment.height,
              width: LINE_WIDTH
            }}
          />
        ))}
      </div>

      {/* 标签层 */}
      <div className="status-label-layer">
        {smartLabels.map((label, index) => (
          <div
            key={index}
            className={`status-label ${label.status}`}
            style={{
              left: label.left,
              top: label.top,
            }}
          >
            {label.label}
          </div>
        ))}
      </div>

      {/* 内容层 - 自适应缩进 */}
      <div 
        className="status-line-content"
        style={{
          paddingLeft: contentPaddingLeft
        }}
      >
        {children}
      </div>
    </div>
  );
};