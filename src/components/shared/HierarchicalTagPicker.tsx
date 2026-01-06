/**
 * HierarchicalTagPicker - 通用层级标签选择器
 * 
 * 功能特性：
 * - ✅ 支持层级标签展示（带缩进）
 * - ✅ 支持颜色和 Emoji
 * - ✅ 单选/多选模式
 * - ✅ 搜索功能
 * - ✅ 全选/清空
 * - ✅ 已选标签显示（chips 模式）
 * - ✅ 下拉/弹出模式
 * 
 * 使用场景：
 * 1. FloatingToolbar - 快速标签选择
 * 2. EventEditModal - 事件标签编辑
 * 3. CalendarSettingsPanel - 标签筛选
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import './HierarchicalTagPicker.css';

export interface HierarchicalTag {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  level?: number;
  parentId?: string;
}

export interface HierarchicalTagPickerProps {
  /** 可选标签列表（层级结构） */
  availableTags: HierarchicalTag[];
  
  /** 已选标签ID列表 */
  selectedTagIds: string[];
  
  /** 标签选择回调 */
  onSelectionChange: (selectedIds: string[]) => void;
  
  /** 是否多选模式（默认 true） */
  multiple?: boolean;
  
  /** 是否显示搜索框（默认 true） */
  searchable?: boolean;
  
  /** 是否显示已选标签 chips（默认 true） */
  showSelectedChips?: boolean;
  
  /** 是否显示全选/清空按钮（默认 true） */
  showBulkActions?: boolean;
  
  /** 占位符文本 */
  placeholder?: string;
  
  /** 是否自动关闭（单选模式默认 true） */
  autoClose?: boolean;
  
  /** 关闭回调（用于弹出模式） */
  onClose?: () => void;
  
  /** Enter键确认插入单个标签（绕过去重逻辑） */
  onConfirm?: (confirmedId: string) => void;
  
  /** 自定义类名 */
  className?: string;
  
  /** 显示模式：'dropdown' 下拉 | 'inline' 内联 */
  mode?: 'dropdown' | 'inline';
}

export const HierarchicalTagPicker: React.FC<HierarchicalTagPickerProps> = ({
  availableTags,
  selectedTagIds,
  onSelectionChange,
  onConfirm, // 🆕 Enter键确认回调
  multiple = true,
  searchable = true,
  showSelectedChips = true,
  showBulkActions = true,
  placeholder = '选择标签...',
  autoClose,
  onClose,
  className = '',
  mode = 'dropdown'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(mode === 'inline');
  const [hoveredIndex, setHoveredIndex] = useState(0); // 🆕 键盘导航索引
  const [isSearchFocused, setIsSearchFocused] = useState(false); // 🆕 搜索框焦点状态
  const containerRef = useRef<HTMLDivElement>(null);
  const tagListRef = useRef<HTMLDivElement>(null); // 🆕 标签列表引用
  const searchInputRef = useRef<HTMLInputElement>(null); // 🆕 搜索框引用

  // 调试：检查接收到的标签数据
  useEffect(() => {
    console.log('🏷️ [HierarchicalTagPicker] 接收到的标签:', availableTags.length, '个');
    // 输出前几个标签的详细信息，包括 level
    availableTags.slice(0, 5).forEach(tag => {
      console.log(`  - ${tag.name}: level=${tag.level}, parentId=${tag.parentId}`);
    });
  }, [availableTags]);

  // 自动关闭默认值：单选模式默认 true
  const shouldAutoClose = autoClose !== undefined ? autoClose : !multiple;

  // 过滤标签（搜索）
  const filteredTags = searchQuery.trim()
    ? availableTags.filter(tag =>
        tag.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableTags;

  // 切换标签选择
  const toggleTag = (tagId: string) => {
    if (multiple) {
      const newSelection = selectedTagIds.includes(tagId)
        ? selectedTagIds.filter(id => id !== tagId)
        : [...selectedTagIds, tagId];
      onSelectionChange(newSelection);
    } else {
      // 单选模式
      onSelectionChange([tagId]);
      if (shouldAutoClose) {
        setIsOpen(false);
        onClose?.();
      }
    }
  };

  // 🆕 键盘导航处理
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 🆕 按 `/` 激活搜索框
    if (event.key === '/' && !isSearchFocused && searchable) {
      event.preventDefault();
      event.stopPropagation();
      searchInputRef.current?.focus();
      return;
    }

    // 如果搜索框获得焦点，不拦截键盘事件（允许输入）
    if (isSearchFocused || filteredTags.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation(); // 🔧 阻止传播到 Slate
        setHoveredIndex((prev) => Math.min(prev + 1, filteredTags.length - 1));
        break;

      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation(); // 🔧 阻止传播到 Slate
        setHoveredIndex((prev) => Math.max(prev - 1, 0));
        break;

      case ' ': // 🆕 空格键：切换选中状态（多选模式下）
        if (multiple) {
          event.preventDefault();
          event.stopPropagation();
          if (filteredTags[hoveredIndex]) {
            toggleTag(filteredTags[hoveredIndex].id);
          }
        }
        break;

      case 'Enter':
        event.preventDefault();
        event.stopPropagation(); // 🔧 阻止换行
        if (filteredTags[hoveredIndex]) {
          const currentTag = filteredTags[hoveredIndex];
          
          console.log('[HierarchicalTagPicker] Enter键按下', {
            tagId: currentTag.id,
            tagName: currentTag.name,
            hasOnConfirm: !!onConfirm,
            isSelected: selectedTagIds.includes(currentTag.id),
          });
          
          // 🆕 Enter 键逻辑：
          // 1. 调用 onConfirm 强制插入当前 hover 的标签（绕过去重逻辑）
          // 2. 同时更新选中状态（UI 反馈）
          // 3. 延迟关闭 Picker
          
          if (onConfirm) {
            // 优先使用 onConfirm（强制插入）
            console.log('[HierarchicalTagPicker] 调用 onConfirm', currentTag.id);
            onConfirm(currentTag.id);
          } else if (!selectedTagIds.includes(currentTag.id)) {
            // 降级：未选中时才调用 toggleTag
            console.log('[HierarchicalTagPicker] 调用 toggleTag', currentTag.id);
            toggleTag(currentTag.id);
          }
          
          // 延迟关闭
          setTimeout(() => {
            console.log('[HierarchicalTagPicker] 延迟关闭 Picker');
            setIsOpen(false);
            onClose?.();
          }, 50);
        }
        break;

      case 'Escape':
        event.preventDefault();
        event.stopPropagation(); // 🔧 阻止传播
        setIsOpen(false);
        onClose?.();
        break;

      default:
        break;
    }
  }, [isSearchFocused, filteredTags, hoveredIndex, toggleTag, onClose, searchable]);

  // 🆕 监听键盘事件（使用捕获阶段）
  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown, true); // 🔧 capture: true
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, handleKeyDown]);

  // 🆕 自动滚动到 hover 的项
  useEffect(() => {
    if (tagListRef.current && filteredTags.length > 0) {
      const hoveredElement = tagListRef.current.children[hoveredIndex] as HTMLElement;
      if (hoveredElement) {
        hoveredElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [hoveredIndex, filteredTags.length]);

  // 🆕 当过滤结果改变时，重置 hover 索引
  useEffect(() => {
    setHoveredIndex(0);
  }, [searchQuery]);

  // 全选
  const handleSelectAll = () => {
    onSelectionChange(availableTags.map(t => t.id));
  };

  // 清空
  const handleClearAll = () => {
    onSelectionChange([]);
  };

  // 通过 ID 获取标签
  const getTagById = (id: string) => availableTags.find(t => t.id === id);

  // 点击外部关闭
  useEffect(() => {
    if (mode !== 'dropdown' || !isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, mode]);

  const showHeader = searchable || (multiple && showBulkActions) || !!onClose;

  return (
    <div 
      className={`hierarchical-tag-picker ${mode} ${className}`}
      ref={containerRef}
    >
      {/* 触发器 + 已选标签 */}
      {mode === 'dropdown' && (
        <div 
          className="tag-picker-trigger"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="selected-tags-chips">
            {showSelectedChips && selectedTagIds.length > 0 ? (
              selectedTagIds.map(tagId => {
                const tag = getTagById(tagId);
                return tag ? (
                  <span 
                    key={tagId} 
                    className="tag-chip" 
                    style={{ 
                      backgroundColor: tag.color + '20',
                      borderColor: tag.color,
                      color: tag.color
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTag(tagId);
                    }}
                  >
                    {tag.emoji && <span className="tag-chip-emoji">{tag.emoji}</span>}
                    #{tag.name}
                    <button 
                      className="tag-chip-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTag(tagId);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ) : null;
              })
            ) : (
              <span className="tag-picker-placeholder">{placeholder}</span>
            )}
          </div>
          <span className="tag-picker-arrow">{isOpen ? '▲' : '▼'}</span>
        </div>
      )}

      {/* 下拉列表 */}
      {isOpen && (
        <div className="tag-picker-dropdown">
          {/* 头部：搜索 + 操作按钮（可选） */}
          {showHeader && (
            <div className="tag-picker-header">
              {searchable && (
                <input
                  ref={searchInputRef}
                  type="text"
                  className="tag-search-input"
                  placeholder="搜索标签...（按 / 激活）"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              
              {multiple && showBulkActions && (
                <div className="tag-picker-actions">
                  <button 
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectAll();
                    }}
                  >
                    全选
                  </button>
                  <button 
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearAll();
                    }}
                  >
                    清空
                  </button>
                </div>
              )}
              
              {onClose && (
                <button 
                  className="tag-picker-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    onClose();
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* 标签列表（层级展示） */}
          <div className="tag-picker-list" ref={tagListRef}>
            {filteredTags.length > 0 ? (
              filteredTags.map((tag, index) => {
                const isSelected = selectedTagIds.includes(tag.id);
                const isHovered = index === hoveredIndex; // 🆕 键盘导航高亮
                const paddingLeft = `${(tag.level || 0) * 16}px`;
                
                return (
                  <label
                    key={tag.id}
                    className={`tag-option ${isSelected ? 'selected' : ''} ${isHovered ? 'keyboard-focused' : ''}`}
                    onClick={() => toggleTag(tag.id)}
                    onMouseEnter={() => setHoveredIndex(index)}
                  >
                    {multiple && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        onClick={(e) => e.preventDefault()}
                      />
                    )}
                    <div 
                      className="tag-content"
                      style={{ paddingLeft }}
                    >
                      <span 
                        className="tag-hash" 
                        style={{ color: tag.color }}
                      >
                        #
                      </span>
                      {tag.emoji && (
                        <span className="tag-emoji">{tag.emoji}</span>
                      )}
                      <span 
                        className="tag-name"
                        style={{ color: tag.color }}
                      >
                        {tag.name}
                      </span>
                    </div>
                    {isSelected && !multiple && (
                      <span className="tag-checkmark">✓</span>
                    )}
                  </label>
                );
              })
            ) : (
              <div className="no-tags">
                {searchQuery ? '没有找到匹配的标签' : '暂无标签'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
