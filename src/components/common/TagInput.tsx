/**
 * TagInput - 标签输入组件
 * 
 * 类似 AttendeeInput 的交互体验：
 * - 输入时显示搜索下拉框（支持键盘导航）
 * - 每个标签之间可插入光标
 * - Backspace 删除标签
 * - 支持标签颜色和 emoji 显示
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { TagService } from '../../services/TagService';
import './TagInput.css';

interface Tag {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
  level?: number;
  parentId?: string;
}

interface TagInputProps {
  selectedTagIds: string[];
  onSelectionChange: (tagIds: string[]) => void;
  availableTags?: Tag[];
  placeholder?: string;
  maxDisplay?: number; // 最多显示几个标签，超出显示"等"
  className?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  selectedTagIds,
  onSelectionChange,
  availableTags,
  placeholder = '选择标签...',
  maxDisplay = 2,
  className = ''
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取可用标签列表
  const tags = availableTags || TagService.getFlatTags();

  // 过滤标签：搜索 + 排除已选
  const filteredTags = tags.filter(tag => {
    if (selectedTagIds.includes(tag.id)) return false;
    if (!inputValue.trim()) return true;
    const searchLower = inputValue.toLowerCase();
    return (
      tag.name.toLowerCase().includes(searchLower) ||
      tag.emoji?.includes(inputValue)
    );
  });

  // 获取已选标签对象
  const selectedTags = selectedTagIds
    .map(id => tags.find(t => t.id === id))
    .filter((tag): tag is Tag => tag !== undefined);

  // 点击容器外关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
        setInputValue('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 重置高亮索引当过滤结果变化时
  useEffect(() => {
    setHighlightedIndex(0);
  }, [inputValue]);

  // 添加标签
  const handleAddTag = (tagId: string) => {
    const newTagIds = [...selectedTagIds];
    
    if (cursorPosition !== null) {
      // 在光标位置插入
      newTagIds.splice(cursorPosition, 0, tagId);
      setCursorPosition(cursorPosition + 1);
    } else {
      // 添加到末尾
      newTagIds.push(tagId);
    }
    
    onSelectionChange(newTagIds);
    setInputValue('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  // 删除标签
  const handleRemoveTag = (index: number) => {
    const newTagIds = selectedTagIds.filter((_, i) => i !== index);
    onSelectionChange(newTagIds);
    
    // 调整光标位置
    if (cursorPosition !== null && cursorPosition > index) {
      setCursorPosition(cursorPosition - 1);
    }
  };

  // 键盘事件处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 下拉框显示时的键盘导航
    if (showDropdown && filteredTags.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(prev => 
            prev < filteredTags.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredTags[highlightedIndex]) {
            handleAddTag(filteredTags[highlightedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowDropdown(false);
          setInputValue('');
          break;
      }
    }
    
    // Backspace 删除标签
    if (e.key === 'Backspace' && inputValue === '') {
      e.preventDefault();
      if (cursorPosition !== null && cursorPosition > 0) {
        handleRemoveTag(cursorPosition - 1);
      } else if (selectedTagIds.length > 0) {
        handleRemoveTag(selectedTagIds.length - 1);
      }
    }
  };

  // 输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setShowDropdown(value.trim().length > 0);
  };

  // 点击标签设置光标位置
  const handleTagClick = (index: number) => {
    setCursorPosition(index + 1);
    inputRef.current?.focus();
  };

  // 渲染标签芯片
  const renderTag = (tag: Tag, index: number) => (
    <span
      key={tag.id}
      className="tag-input-chip"
      style={{ color: tag.color || '#6b7280' }}
      onClick={(e) => {
        e.stopPropagation();
        handleTagClick(index);
      }}
    >
      {tag.emoji && <span className="tag-emoji">{tag.emoji}</span>}
      {tag.name}
      <button
        className="tag-remove-btn"
        onClick={(e) => {
          e.stopPropagation();
          handleRemoveTag(index);
        }}
        aria-label={`删除标签 ${tag.name}`}
      >
        ×
      </button>
    </span>
  );

  return (
    <div className={`tag-input-container ${className}`} ref={containerRef}>
      <div 
        className="tag-input-field"
        onClick={() => inputRef.current?.focus()}
      >
        {/* 显示已选标签 */}
        {selectedTags.slice(0, maxDisplay).map((tag, index) => (
          <React.Fragment key={tag.id}>
            {index > 0 && <span className="tag-separator">/</span>}
            {renderTag(tag, index)}
          </React.Fragment>
        ))}
        
        {/* 超出数量显示"等" */}
        {selectedTags.length > maxDisplay && (
          <span className="tag-etc">等</span>
        )}
        
        {/* 输入框 */}
        <input
          ref={inputRef}
          type="text"
          className="tag-input-invisible"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.trim()) {
              setShowDropdown(true);
            }
          }}
          placeholder={selectedTags.length === 0 ? placeholder : ''}
        />
      </div>

      {/* 搜索下拉框 */}
      {showDropdown && filteredTags.length > 0 && (
        <div className="tag-input-dropdown" ref={dropdownRef}>
          {filteredTags.map((tag, index) => (
            <div
              key={tag.id}
              className={`tag-dropdown-item ${
                index === highlightedIndex ? 'highlighted' : ''
              }`}
              onClick={() => handleAddTag(tag.id)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {tag.emoji && <span className="tag-emoji">{tag.emoji}</span>}
              <span className="tag-name" style={{ color: tag.color }}>
                {tag.name}
              </span>
              {tag.level !== undefined && tag.level > 0 && (
                <span className="tag-level">层级 {tag.level}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
