/**
 * MentionMenu - 统一的 @ 提及和 # 标签菜单
 */

import React, { useEffect, useState } from 'react';
import { TagService } from '@backend/TagService';
import './MentionMenu.css';
import { useEventHubSnapshot } from '@frontend/hooks/useEventHubSnapshot';

interface MentionMenuProps {
  type: 'mention' | 'hashtag';
  search: string;
  onSelect: (item: any) => void;
  onClose: () => void;
}

export const MentionMenu: React.FC<MentionMenuProps> = ({
  type,
  search,
  onSelect,
  onClose,
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { events: allEventsSnapshot } = useEventHubSnapshot({ enabled: type === 'mention' });

  useEffect(() => {
    if (type === 'mention') {
      const needle = (search || '').toLowerCase();
      const filtered = allEventsSnapshot
        .filter(event => {
          const title = typeof (event as any).title === 'object'
            ? (event as any).title.simpleTitle
            : (event as any).title || '';
          return String(title).toLowerCase().includes(needle);
        })
        .slice(0, 10);

      setItems(
        filtered.map(e => ({
          id: (e as any).id,
          name: typeof (e as any).title === 'object' ? (e as any).title.simpleTitle : (e as any).title,
          type: 'event',
        }))
      );
      setSelectedIndex(0);
      return;
    }

    // 加载标签列表（用于 # 标签）
    const tags = TagService.getFlatTags();
    const needle = (search || '').toLowerCase();
    const filtered = tags
      .filter(tag => tag.name.toLowerCase().includes(needle))
      .slice(0, 10);

    setItems(
      filtered.map(t => ({
        id: t.id,
        name: t.name,
        color: t.color,
        emoji: t.emoji,
        type: 'tag',
      }))
    );
    setSelectedIndex(0);
  }, [type, search, allEventsSnapshot]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onSelect, onClose]);

  if (items.length === 0) {
    return (
      <div className={`mention-menu ${type}-menu`}>
        <div className="mention-menu-empty">
          {type === 'mention' ? '没有找到相关事件' : '没有找到相关标签'}
        </div>
      </div>
    );
  }

  return (
    <div className={`mention-menu ${type}-menu`}>
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`mention-menu-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(item)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {item.emoji && <span className="mention-item-emoji">{item.emoji}</span>}
          {item.color && (
            <span
              className="mention-item-color"
              style={{ backgroundColor: item.color }}
            />
          )}
          <span className="mention-item-name">{item.name}</span>
        </div>
      ))}
    </div>
  );
};
