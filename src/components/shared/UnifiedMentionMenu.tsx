/**
 * 🎯 Unified Mention Menu
 * 
 * 统一提及菜单 - 像 Notion/Linear 一样的 @ 菜单
 * 
 * 特性：
 * - 200ms 内返回结果（本地搜索）
 * - 智能分组：Top Hit、Events、Tags、Time、AI
 * - 键盘导航：↑↓ 选择，Enter 确认，Esc 关闭
 * - 防抖优化：150ms debounce
 * - 上下文感知：根据输入位置调整权重
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { unifiedSearchIndex, MentionItem, MentionType, SearchResult } from '@backend/search/UnifiedSearchIndex';
import './UnifiedMentionMenu.css';

interface UnifiedMentionMenuProps {
  query: string; // 当前搜索词（不含 @）
  onSelect: (item: MentionItem) => void; // 选中回调
  onClose: () => void; // 关闭回调
  context?: 'editor' | 'comment' | 'title'; // 上下文
  position?: { x: number; y: number }; // 菜单位置
  currentEventId?: string; // 🆕 当前编辑的事件 ID（用于创建双向链接）
  includeTypes?: MentionType[]; // 可选：限制搜索类型（例如仅 event 或仅 tag）
}

export const UnifiedMentionMenu: React.FC<UnifiedMentionMenuProps> = ({
  query,
  onSelect,
  onClose,
  context = 'editor',
  position,
  currentEventId,
  includeTypes,
}) => {
  const [results, setResults] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 🖱️ 处理项目选择（需要在 useEffect 之前定义）
  const handleItemClick = useCallback(async (item: MentionItem) => {
    // 🔗 如果选择的是事件，且当前有编辑的事件，自动创建双向链接
    if (item.type === 'event' && currentEventId && item.id !== currentEventId) {
      await unifiedSearchIndex.createBidirectionalLink(currentEventId, item.id);
    }
    
    onSelect(item);
    // 记录访问（用于提升权重）
    unifiedSearchIndex.recordAccess(item.id, item.type);
  }, [onSelect, currentEventId]);

  // 🔍 防抖搜索
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      const searchResults = await unifiedSearchIndex.search({
        query,
        context,
        limit: 5,
        includeTypes,
      });
      setResults(searchResults);
      setLoading(false);
      setSelectedIndex(0); // 重置选中项
    }, 150); // 150ms 防抖

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, context, includeTypes]);

  // ⌨️ 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!results) return;

      const allItems = _flattenResults(results);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation(); // 🔧 阻止事件冒泡到 Slate 编辑器
        e.stopImmediatePropagation(); // 🔧 阻止同级监听器
        setSelectedIndex(prev => (prev + 1) % allItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation(); // 🔧 阻止事件冒泡到 Slate 编辑器
        e.stopImmediatePropagation(); // 🔧 阻止同级监听器
        setSelectedIndex(prev => (prev - 1 + allItems.length) % allItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation(); // 🔧 阻止事件冒泡到 Slate 编辑器
        e.stopImmediatePropagation(); // 🔧 阻止同级监听器
        if (allItems[selectedIndex]) {
          handleItemClick(allItems[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // 🔧 阻止事件冒泡到 Slate 编辑器
        e.stopImmediatePropagation(); // 🔧 阻止同级监听器
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // 🔧 使用捕获阶段，优先于 Slate
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [results, selectedIndex, handleItemClick, onClose]);

  // 🖱️ 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!results && !loading) return null;

  const allItems = results ? _flattenResults(results) : [];
  let currentIndex = 0;

  return (
    <div
      ref={menuRef}
      className="unified-mention-menu"
      style={{
        position: 'absolute',
        left: position?.x || 0,
        top: position?.y || 0,
      }}
    >
      {loading && (
        <div className="mention-loading">
          <span className="loading-spinner">⏳</span> 搜索中...
        </div>
      )}

      {results && (
        <>
          {/* 🏆 Top Hit */}
          {results.topHit && (
            <div className="mention-section">
              <div className="mention-section-title">最佳匹配</div>
              <MentionItemView
                item={results.topHit}
                isSelected={selectedIndex === currentIndex++}
                onClick={handleItemClick}
              />
            </div>
          )}

          {/* 📄 Events */}
          {results.events.length > 0 && (
            <div className="mention-section">
              <div className="mention-section-title">事件</div>
              {results.events.map(item => (
                <MentionItemView
                  key={item.id}
                  item={item}
                  isSelected={selectedIndex === currentIndex++}
                  onClick={handleItemClick}
                />
              ))}
            </div>
          )}

          {/* 🏷️ Tags */}
          {results.tags.length > 0 && (
            <div className="mention-section">
              <div className="mention-section-title">标签</div>
              {results.tags.map(item => (
                <MentionItemView
                  key={item.id}
                  item={item}
                  isSelected={selectedIndex === currentIndex++}
                  onClick={handleItemClick}
                />
              ))}
            </div>
          )}

          {/* 📅 Time */}
          {results.time.length > 0 && (
            <div className="mention-section">
              <div className="mention-section-title">时间</div>
              {results.time.map(item => (
                <MentionItemView
                  key={item.id}
                  item={item}
                  isSelected={selectedIndex === currentIndex++}
                  onClick={handleItemClick}
                />
              ))}
            </div>
          )}

          {/* 🤖 AI Assistant */}
          {results.ai && (
            <div className="mention-section">
              <div className="mention-section-title">AI 助手</div>
              <MentionItemView
                item={results.ai}
                isSelected={selectedIndex === currentIndex++}
                onClick={handleItemClick}
              />
            </div>
          )}

          {/* ➕ New Page (兜底) */}
          {results.newPage && allItems.length === 0 && (
            <div className="mention-section">
              <MentionItemView
                item={results.newPage}
                isSelected={selectedIndex === currentIndex++}
                onClick={handleItemClick}
              />
            </div>
          )}

          {/* 空状态 */}
          {allItems.length === 0 && !loading && (
            <div className="mention-empty">
              <span>未找到匹配项</span>
              {results.newPage && (
                <MentionItemView
                  item={results.newPage}
                  isSelected={true}
                  onClick={handleItemClick}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// 📝 单个菜单项组件
const MentionItemView: React.FC<{
  item: MentionItem;
  isSelected: boolean;
  onClick: (item: MentionItem) => void;
}> = ({ item, isSelected, onClick }) => {
  return (
    <div
      className={`mention-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onClick(item)}
      onMouseEnter={(e) => {
        // 鼠标悬停时更新选中状态
        const itemElement = e.currentTarget;
        const allItems = itemElement.parentElement?.querySelectorAll('.mention-item');
        const index = Array.from(allItems || []).indexOf(itemElement);
        if (index !== -1) {
          // TODO: 需要通过 context 更新 selectedIndex
        }
      }}
    >
      <span className="mention-icon">
        {item.icon?.endsWith('.svg') ? (
          <img src={item.icon} alt="" style={{ width: '20px', height: '20px' }} />
        ) : (
          item.icon
        )}
      </span>
      <div className="mention-content">
        <div className="mention-title">{item.title}</div>
        {item.subtitle && <div className="mention-subtitle">{item.subtitle}</div>}
      </div>
      {item.score !== undefined && item.score > 0.8 && (
        <span className="mention-badge">精确</span>
      )}
    </div>
  );
};

// 辅助函数：扁平化结果
function _flattenResults(results: SearchResult): MentionItem[] {
  const items: MentionItem[] = [];
  
  if (results.topHit) items.push(results.topHit);
  items.push(...results.events);
  items.push(...results.tags);
  items.push(...results.time);
  if (results.ai) items.push(results.ai);
  if (results.newPage && items.length === 0) items.push(results.newPage);
  
  return items;
}
