import React, { useRef, useEffect } from 'react';
import './LineChartView.css';

interface TrendData {
  date: string;
  duration: number;
  count: number;
}

interface LineChartViewProps {
  data: TrendData[];
  dimension: 'tag' | 'calendar';
}

/**
 * LineChartView - 折线趋势图
 * 迁移自 test-stats-full.html 的 renderLineChart 函数
 */
export const LineChartView: React.FC<LineChartViewProps> = ({ data, dimension }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data || data.length === 0) return;
    renderLineChart();
  }, [data]);

  const renderLineChart = () => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return;

    const maxDuration = Math.max(...data.map(d => d.duration), 1);
    
    const width = 800;
    const height = 300;
    const padding = { top: 20, right: 40, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 计算点坐标
    const points = data.map((item, idx) => {
      const x = padding.left + (idx / Math.max(data.length - 1, 1)) * chartWidth;
      const y = padding.top + (1 - item.duration / maxDuration) * chartHeight;
      return { x, y, ...item };
    });

    // 生成路径
    const linePath = points.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ');

    // 生成填充区域
    const areaPath = `
      M ${padding.left} ${height - padding.bottom}
      ${linePath.replace('M', 'L')}
      L ${padding.left + chartWidth} ${height - padding.bottom}
      Z
    `;

    // 清空并重新渲染SVG
    svg.innerHTML = `
      <!-- 渐变定义 -->
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:0.2" />
        </linearGradient>
      </defs>
      
      <!-- 网格线 -->
      ${[0, 0.25, 0.5, 0.75, 1].map(ratio => `
        <line 
          x1="${padding.left}" 
          y1="${padding.top + ratio * chartHeight}" 
          x2="${width - padding.right}" 
          y2="${padding.top + ratio * chartHeight}" 
          class="chart-grid"
        />
      `).join('')}
      
      <!-- 填充区域 -->
      <path d="${areaPath}" class="chart-area" />
      
      <!-- 折线 -->
      <path d="${linePath}" class="chart-line" />
      
      <!-- 数据点 -->
      ${points.map(p => `
        <circle 
          cx="${p.x}" 
          cy="${p.y}" 
          r="4" 
          class="chart-point"
          data-date="${p.date}"
          data-duration="${p.duration}"
          data-count="${p.count}"
        />
      `).join('')}
      
      <!-- X轴标签 -->
      ${points.map((p, i) => {
        if (data.length > 10 && i % Math.ceil(data.length / 7) !== 0) return '';
        return `
          <text 
            x="${p.x}" 
            y="${height - padding.bottom + 20}" 
            class="chart-label" 
            text-anchor="middle"
          >
            ${p.date.substring(5)}
          </text>
        `;
      }).join('')}
      
      <!-- Y轴标签 -->
      ${[0, 0.5, 1].map(ratio => `
        <text 
          x="${padding.left - 10}" 
          y="${padding.top + (1 - ratio) * chartHeight}" 
          class="chart-label" 
          text-anchor="end"
          dominant-baseline="middle"
        >
          ${formatDuration(maxDuration * ratio)}
        </text>
      `).join('')}
    `;

    // 添加悬停交互
    const chartPoints = svg.querySelectorAll('.chart-point');
    chartPoints.forEach(point => {
      point.addEventListener('mouseenter', (e: any) => {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        
        tooltip.style.display = 'block';
        tooltip.innerHTML = `
          <strong>${e.target.dataset.date}</strong><br/>
          时长: ${formatDuration(parseInt(e.target.dataset.duration))}<br/>
          事件: ${e.target.dataset.count} 个
        `;
      });
      
      point.addEventListener('mousemove', (e: any) => {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        tooltip.style.left = (e.pageX + 10) + 'px';
        tooltip.style.top = (e.pageY - 30) + 'px';
      });
      
      point.addEventListener('mouseleave', () => {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        tooltip.style.display = 'none';
      });
    });
  };

  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📈</div>
        <p>暂无趋势数据</p>
      </div>
    );
  }

  return (
    <div className="line-chart-view">
      <h3 className="chart-title">
        <span>📈</span> 时长趋势图
      </h3>
      <div className="line-chart-container">
        <svg 
          ref={svgRef} 
          className="line-chart-svg" 
          viewBox="0 0 800 300"
        ></svg>
        <div ref={tooltipRef} className="chart-tooltip"></div>
      </div>
    </div>
  );
};
