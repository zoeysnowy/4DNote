import React, { useRef, useEffect } from 'react';
import './PieChartView.css';

interface PieChartData {
  id: string;
  name: string;
  duration: number;
  count: number;
  color: string;
}

interface PieChartViewProps {
  data: PieChartData[];
  dimension: 'tag' | 'calendar';
}

/**
 * PieChartView - 饼图视图（带列表）
 * 迁移自 test-stats-full.html 的 renderPieChart 函数
 */
export const PieChartView: React.FC<PieChartViewProps> = ({ data, dimension }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data || data.length === 0) return;

    renderPieChart();
  }, [data]);

  const renderPieChart = () => {
    const svg = svgRef.current;
    if (!svg) return;

    // 清空SVG
    svg.innerHTML = '';

    const radius = 80;
    const innerRadius = 60;
    const centerX = 100;
    const centerY = 100;
    const gapAngle = 4;

    let currentAngle = 0;
    const totalDuration = data.reduce((sum, item) => sum + item.duration, 0);

    // 过滤占比<0.5%的数据
    const minPercentage = 0.5;
    const visibleData = data.filter(item => (item.duration / totalDuration * 100) >= minPercentage);

    visibleData.forEach((item, index) => {
      const angle = (item.duration / totalDuration) * 360;
      const endAngle = index === visibleData.length - 1 
        ? currentAngle + angle 
        : currentAngle + angle - gapAngle;

      const actualAngle = endAngle - currentAngle;
      const arcLength = (actualAngle * Math.PI / 180) * radius;
      const maxCornerRadius = arcLength / 2;
      let cornerRadius = Math.min(10, maxCornerRadius * 0.8);
      cornerRadius = Math.max(2, cornerRadius);

      const path = createRoundedArcPath(
        centerX, centerY, radius, innerRadius, 
        currentAngle, endAngle, cornerRadius
      );

      const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathElement.setAttribute('d', path);
      pathElement.setAttribute('fill', item.color);
      pathElement.setAttribute('opacity', '0.9');
      pathElement.style.cursor = 'pointer';
      pathElement.style.transition = 'opacity 0.2s';

      // Tooltip
      const tooltipText = `${item.name}\n${formatDuration(item.duration)}\n${(item.duration / totalDuration * 100).toFixed(1)}%`;

      pathElement.addEventListener('mouseenter', (e) => {
        pathElement.setAttribute('opacity', '1');
        showTooltip(e, tooltipText);
      });
      pathElement.addEventListener('mousemove', (e) => {
        updateTooltipPosition(e);
      });
      pathElement.addEventListener('mouseleave', () => {
        pathElement.setAttribute('opacity', '0.9');
        hideTooltip();
      });

      svg.appendChild(pathElement);
      currentAngle += angle;
    });
  };

  const createRoundedArcPath = (
    cx: number, cy: number, radius: number, innerRadius: number,
    startAngle: number, endAngle: number, cornerRadius: number = 10
  ): string => {
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;

    const outerStart = {
      x: cx + radius * Math.cos(startRad),
      y: cy + radius * Math.sin(startRad)
    };
    const outerEnd = {
      x: cx + radius * Math.cos(endRad),
      y: cy + radius * Math.sin(endRad)
    };
    const innerEnd = {
      x: cx + innerRadius * Math.cos(endRad),
      y: cy + innerRadius * Math.sin(endRad)
    };
    const innerStart = {
      x: cx + innerRadius * Math.cos(startRad),
      y: cy + innerRadius * Math.sin(startRad)
    };

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    const startTangentX = -Math.sin(startRad);
    const startTangentY = Math.cos(startRad);
    const endTangentX = -Math.sin(endRad);
    const endTangentY = Math.cos(endRad);

    const outerStartOffset = {
      x: outerStart.x + cornerRadius * startTangentX,
      y: outerStart.y + cornerRadius * startTangentY
    };
    const innerStartOffset = {
      x: innerStart.x + cornerRadius * startTangentX,
      y: innerStart.y + cornerRadius * startTangentY
    };
    const outerEndOffset = {
      x: outerEnd.x - cornerRadius * endTangentX,
      y: outerEnd.y - cornerRadius * endTangentY
    };
    const innerEndOffset = {
      x: innerEnd.x - cornerRadius * endTangentX,
      y: innerEnd.y - cornerRadius * endTangentY
    };

    const startRadialX = Math.cos(startRad);
    const startRadialY = Math.sin(startRad);
    const endRadialX = Math.cos(endRad);
    const endRadialY = Math.sin(endRad);

    const startOuterCorner = {
      x: outerStart.x - cornerRadius * startRadialX,
      y: outerStart.y - cornerRadius * startRadialY
    };
    const startInnerCorner = {
      x: innerStart.x + cornerRadius * startRadialX,
      y: innerStart.y + cornerRadius * startRadialY
    };
    const endOuterCorner = {
      x: outerEnd.x - cornerRadius * endRadialX,
      y: outerEnd.y - cornerRadius * endRadialY
    };
    const endInnerCorner = {
      x: innerEnd.x + cornerRadius * endRadialX,
      y: innerEnd.y + cornerRadius * endRadialY
    };

    return `
      M ${outerStartOffset.x} ${outerStartOffset.y}
      A ${radius} ${radius} 0 ${largeArc} 1 ${outerEndOffset.x} ${outerEndOffset.y}
      Q ${outerEnd.x} ${outerEnd.y} ${endOuterCorner.x} ${endOuterCorner.y}
      L ${endInnerCorner.x} ${endInnerCorner.y}
      Q ${innerEnd.x} ${innerEnd.y} ${innerEndOffset.x} ${innerEndOffset.y}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartOffset.x} ${innerStartOffset.y}
      Q ${innerStart.x} ${innerStart.y} ${startInnerCorner.x} ${startInnerCorner.y}
      L ${startOuterCorner.x} ${startOuterCorner.y}
      Q ${outerStart.x} ${outerStart.y} ${outerStartOffset.x} ${outerStartOffset.y}
      Z
    `;
  };

  const showTooltip = (e: MouseEvent, text: string) => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    updateTooltipPosition(e);
  };

  const updateTooltipPosition = (e: MouseEvent) => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    tooltip.style.left = `${e.pageX + 10}px`;
    tooltip.style.top = `${e.pageY - 30}px`;
  };

  const hideTooltip = () => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    tooltip.style.display = 'none';
  };

  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const totalDuration = data.reduce((sum, item) => sum + item.duration, 0);
  const totalCount = data.reduce((sum, item) => sum + item.count, 0);

  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">{dimension === 'tag' ? '🏷️' : '📅'}</div>
        <p>暂无{dimension === 'tag' ? '标签' : '日历'}统计数据</p>
      </div>
    );
  }

  return (
    <div className="pie-chart-view">
      {/* 左侧：饼图 */}
      <div className="pie-chart-container">
        <h3 className="chart-title">
          {dimension === 'tag' ? '标签占比' : '日历占比'}
        </h3>
        <div className="pie-chart-wrapper">
          <svg ref={svgRef} width="200" height="200"></svg>
          <div className="pie-chart-center">
            <div className="total-duration">{formatDuration(totalDuration)}</div>
            <div className="total-count">{totalCount} 个事件</div>
          </div>
        </div>
        <div className="chart-footer">{data.length} 个{dimension === 'tag' ? '标签' : '日历'}</div>
      </div>

      {/* 右侧：列表 */}
      <div className="stats-list">
        {data.map(item => {
          const percentage = (item.duration / totalDuration * 100).toFixed(1);
          return (
            <div key={item.id} className="stats-list-item">
              <div className="item-color" style={{ background: item.color }}></div>
              <div className="item-content">
                <div className="item-header">
                  <span className="item-name">{item.name}</span>
                  <span className="item-duration">{formatDuration(item.duration)}</span>
                </div>
                <div className="item-footer">
                  <span>{item.count} 个事件</span>
                  <span>•</span>
                  <span>{percentage}%</span>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${percentage}%`, background: item.color }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      <div ref={tooltipRef} className="chart-tooltip"></div>
    </div>
  );
};
