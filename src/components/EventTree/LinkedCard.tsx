/**
 * 🔗 LinkedCard - 双向链接堆叠卡片
 * 
 * 受 Gemini 的 "Vessels as Stacks" 启发，事件的双向链接（linkedEventIds）
 * 以堆叠卡片的形式展示在主节点背后。
 * 
 * 特性：
 * - 收纳态：卡片缩放、旋转、堆叠，像一叠整理好的文件
 * - 展开态：鼠标悬停时扇形滑出（Fan-out），横向平铺
 * - Framer Motion 动画：流畅的 spring 弹簧动画
 * - 点击跳转：点击卡片打开对应事件的 EventEditModal
 * - 莫兰迪色系：根据 tag 颜色生成低饱和度背景
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Event } from '../../types';
import { TagService, type FlatTag } from '../../services/TagService';
import './EventTree.css';

/**
 * 将任意颜色转换为莫兰迪色系（低饱和度、高明度的柔和色调）
 * @param color - 输入颜色（支持 hex, rgb, hsl）
 * @returns 莫兰迪色系的渐变背景和文字颜色
 */
function convertToMorandiPalette(color: string): { background: string; text: string; border: string } {
  // 解析颜色到 RGB
  let r = 0, g = 0, b = 0;
  
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match) {
      [r, g, b] = match.map(Number);
    }
  }
  
  // 转换为 HSL
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  // 莫兰迪化：降低饱和度（20-35%），提高明度（75-85%）
  const morandiS = Math.min(s * 0.4, 0.35); // 饱和度降低到原来的40%，最大35%
  const morandiL1 = 0.94; // 起始明度 94%（更浅）
  const morandiL2 = 0.88; // 结束明度 88%（略深）
  
  // 生成渐变背景（135度对角线渐变）
  const hDeg = Math.round(h * 360);
  const background = `linear-gradient(135deg, hsl(${hDeg}, ${morandiS * 100}%, ${morandiL1 * 100}%) 0%, hsl(${hDeg}, ${morandiS * 100}%, ${morandiL2 * 100}%) 100%)`;
  
  // 文字颜色：使用相同色相，高饱和度，低明度（深色）
  const textS = Math.min(s * 1.2, 0.7); // 饱和度提高
  const textL = 0.25; // 明度 25%（深色）
  const text = `hsl(${hDeg}, ${textS * 100}%, ${textL * 100}%)`;
  
  // 边框颜色：介于背景和文字之间
  const borderS = morandiS * 1.5;
  const borderL = 0.75;
  const border = `hsl(${hDeg}, ${borderS * 100}%, ${borderL * 100}%)`;
  
  return { background, text, border };
}

interface LinkedCardProps {
  event: Event;           // 链接的事件数据
  index: number;          // 在堆叠中的索引（0 = 最靠近主节点）
  isHovered: boolean;     // 主节点是否被悬停
  onClick?: () => void;   // 点击回调（打开 EventEditModal）
}

export const LinkedCard: React.FC<LinkedCardProps> = ({
  event,
  index,
  isHovered,
  onClick,
}) => {
  const [firstTag, setFirstTag] = useState<FlatTag | null>(null);
  const [cardStyle, setCardStyle] = useState<{ background: string; text: string; border: string }>({
    background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.98) 0%, rgba(219, 234, 254, 0.98) 100%)',
    text: '#1e3a8a',
    border: 'rgba(147, 197, 253, 0.4)',
  });

  // 🎨 加载第一个 tag 并生成莫兰迪色系
  useEffect(() => {
    const loadTag = async () => {
      if (event.tags && event.tags.length > 0) {
        try {
          const tag = await TagService.getTagById(event.tags[0]);
          if (tag) {
            setFirstTag(tag);
            const palette = convertToMorandiPalette(tag.color);
            setCardStyle(palette);
          }
        } catch (error) {
          console.error('Failed to load tag:', error);
        }
      }
    };
    loadTag();
  }, [event.tags]);

  // 🎨 动画参数计算 - 纵向堆叠版本
  // 收纳态：卡片堆叠在主节点背后，每张卡片略微偏移、旋转、缩放
  // 展开态：卡片纵向堆叠展开，间隔 80px（避免横向溢出 EventEditModal）
  const xOffset = isHovered ? 0 : (index + 1) * 4; // 展开时无横向偏移
  const yOffset = isHovered ? index * 80 : (index + 1) * 4; // 纵向间隔 80px，第一张从0开始
  const rotate = isHovered ? 0 : (index + 1) * 2;
  const scale = isHovered ? 1 : 1 - (index * 0.05);
  const opacity = isHovered ? 1 : 1 - (index * 0.15);

  return (
    <motion.div
      className="linked-card"
      animate={{
        x: xOffset,
        y: yOffset,
        rotate,
        scale,
        opacity,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
      }}
      onClick={onClick}
      style={{
        pointerEvents: isHovered ? 'auto' : 'none',
        background: cardStyle.background,
        borderColor: cardStyle.border,
      }}
    >
      {/* 卡片头部：tag 或 LINKED 标签 + 箭头 */}
      <div className="linked-card-header">
        <div className="linked-card-label" style={{ color: cardStyle.text }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 6.5L7 4.5M3.5 9L5.5 7M8.5 3L6.5 5" />
            <circle cx="2.5" cy="9.5" r="1.5" />
            <circle cx="9.5" cy="2.5" r="1.5" />
          </svg>
          <span>{firstTag ? firstTag.name.toUpperCase() : 'LINKED'}</span>
        </div>
        <svg className="linked-card-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: cardStyle.text }}>
          <path d="M3 6h6M7 4l2 2-2 2" />
        </svg>
      </div>

      {/* 卡片内容：事件标题 */}
      <div className="linked-card-content">
        <h4 className="linked-card-title" style={{ color: cardStyle.text }}>
          {typeof event.title === 'string' ? event.title : (event.title?.simpleTitle || event.title?.colorTitle || event.title?.fullTitle || '无标题事件')}
        </h4>
      </div>

      {/* 底部装饰条：模拟 Notion 进度条风格 */}
      <div className="linked-card-progress">
        <div className="linked-card-progress-bar" style={{ background: `${cardStyle.border}40` }}>
          <div className="linked-card-progress-fill" style={{ background: cardStyle.text }}></div>
        </div>
      </div>
    </motion.div>
  );
};
