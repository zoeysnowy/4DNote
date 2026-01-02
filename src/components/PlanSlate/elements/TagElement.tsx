/**
 * Tag 元素组件
 * 
 * 渲染标签节点，支持交互和样式
 */

import React, { useMemo, useEffect } from 'react';
import { RenderElementProps, useSelected, useFocused } from 'slate-react';
import { TagService } from '../../../services/TagService';
import { TagNode } from '../types';

export const TagElementComponent: React.FC<RenderElementProps> = ({ attributes, children, element }) => {
  const tagElement = element as TagNode;
  const selected = useSelected();
  const focused = useFocused();

  // 从 TagService 获取最新标签数据
  const tagData = useMemo(() => {
    const tag = tagElement.tagId ? TagService.getTagById(tagElement.tagId) : null;
    return {
      name: tag?.name ?? tagElement.tagName,
      color: tag?.color ?? tagElement.tagColor ?? '#666',
      emoji: tag?.emoji ?? tagElement.tagEmoji ?? '',
    };
  }, [tagElement.tagId, tagElement.tagName, tagElement.tagColor, tagElement.tagEmoji]);

  // 监听 TagService 更新
  useEffect(() => {
    const listener = () => {
      // 触发重新渲染
    };
    TagService.addListener(listener as any);
    return () => TagService.removeListener(listener as any);
  }, [tagElement.tagId]);

  return (
    <span
      {...attributes}
      contentEditable={false}
      data-type="tag"
      data-tag-id={tagElement.tagId}
      data-tag-name={tagData.name}
      data-tag-color={tagData.color}
      data-tag-emoji={tagData.emoji}
      data-mention-only={tagElement.mentionOnly ? 'true' : 'false'}
      className={`inline-tag ${tagElement.mentionOnly ? 'mention-only' : ''}`}
      style={{
        display: 'inline-block',
        margin: '0 2px',
        padding: '2px 6px',
        borderRadius: '4px',
        backgroundColor: `${tagData.color}15`,
        border: `1px solid ${tagData.color}40`,
        color: tagData.color,
        userSelect: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s',
        verticalAlign: 'baseline',
        // ✅ 去掉选中时的蓝色边框
        boxShadow: 'none',
        outline: 'none',
      }}
    >
      <span style={{ fontWeight: 700, color: tagData.color }}>#</span>
      {tagData.emoji && <span style={{ fontWeight: 400, marginRight: '2px' }}>{tagData.emoji}</span>}
      <span style={{ fontWeight: 700, color: tagData.color }}>{tagData.name}</span>
      {/* ✅ children 必须在 void 元素内部，且不能隐藏（Slate 需要在这里放置光标）*/}
      {children}
    </span>
  );
};
