/**
 * TagPicker - 标签选择器（FloatingToolbar 专用）
 * 基于通用 HierarchicalTagPicker 组件
 */

import React, { useRef, useCallback } from 'react';
import { Editor } from 'slate';
import { HierarchicalTagPicker, HierarchicalTag } from '@frontend/components/shared';
import { insertTag } from '@frontend/components/PlanSlate/helpers';
import { TagService } from '@backend/TagService';

interface TagPickerProps {
  availableTags: HierarchicalTag[];
  selectedTags: string[];
  onSelect: (tagIds: string[]) => void;
  onClose: () => void;
  editorMode?: 'title' | 'eventlog' | 'description'; // 🆕 编辑器模式
  slateEditorRef?: React.RefObject<Editor>; // 🆕 Slate Editor 引用
}

export const TagPicker: React.FC<TagPickerProps> = ({
  availableTags,
  selectedTags,
  onSelect,
  onClose,
  editorMode,
  slateEditorRef,
}) => {
  const prevSelectedTagsRef = React.useRef<string[]>(selectedTags);
  
  // 🔧 多选模式：检测新增标签并插入
  const handleSelectionChange = useCallback((ids: string[]) => {
    onSelect(ids); // 更新状态
    
    const editor = slateEditorRef?.current;
    if (!editor) {
      console.warn('[TagPicker] handleSelectionChange: 缺少 Slate Editor 引用');
      return;
    }
    
    // 计算新增标签
    const addedIds = ids.filter(id => !prevSelectedTagsRef.current.includes(id));
    prevSelectedTagsRef.current = ids;
    
    if (addedIds.length === 0) return;
    
    // 插入最新新增的标签
    const insertId = addedIds[addedIds.length - 1];
    const tag = TagService.getTagById(insertId);
    if (!tag) {
      console.warn('[TagPicker] 找不到标签', insertId);
      return;
    }
    
    const isDescriptionMode = editorMode === 'description' || editorMode === 'eventlog';
    
    console.log('[TagPicker] 多选插入标签', {
      tagId: insertId,
      tagName: tag.name,
      isDescriptionMode,
    });
    
    // 插入到 Slate editor
    insertTag(
      editor,
      insertId,
      tag.name,
      tag.color || '#666',
      tag.emoji || '',
      isDescriptionMode
    );
  }, [onSelect, slateEditorRef, editorMode]);
  
  // 同步外部 selectedTags 变化
  React.useEffect(() => {
    prevSelectedTagsRef.current = selectedTags;
  }, [selectedTags]);
  
  // 🆕 Enter 键确认：直接插入单个标签到 Slate editor
  const handleConfirm = useCallback((tagId: string) => {
    console.log('[TagPicker] handleConfirm 被调用', tagId);
    
    const editor = slateEditorRef?.current;
    if (!editor) {
      console.warn('[TagPicker] 缺少 Slate Editor 引用');
      return;
    }
    
    const tag = TagService.getTagById(tagId);
    if (!tag) {
      console.warn('[TagPicker] 找不到标签', tagId);
      return;
    }
    
    const isDescriptionMode = editorMode === 'description' || editorMode === 'eventlog';
    
    console.log('[TagPicker] 准备插入标签', {
      tagId,
      tagName: tag.name,
      isDescriptionMode,
    });
    
    // 直接调用 insertTag 插入到 Slate editor
    const success = insertTag(
      editor,
      tagId,
      tag.name,
      tag.color || '#666',
      tag.emoji || '',
      isDescriptionMode
    );
    
    console.log('[TagPicker] insertTag 结果', { success });
    
    if (success) {
      // Slate 会自动触发 onChange → PlanSlate.onChange → PlanManager.onChange
      // 无需手动调用 onSelect
      onClose(); // 关闭 Picker
    }
  }, [slateEditorRef, editorMode, onClose]);

  return (
    <div className={`floating-toolbar-tag-picker ${editorMode === 'eventlog' ? 'eventlog-mode' : ''}`}>
      <HierarchicalTagPicker
        availableTags={availableTags}
        selectedTagIds={selectedTags}
        onSelectionChange={handleSelectionChange}
        onConfirm={handleConfirm}
        multiple={true}
        searchable={true}
        showSelectedChips={false}
        showBulkActions={true}
        placeholder="搜索或选择标签..."
        onClose={onClose}
        mode="inline"
      />
    </div>
  );
};
