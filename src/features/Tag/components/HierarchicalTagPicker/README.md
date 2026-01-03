# HierarchicalTagPicker 使用指南

## 概述

`HierarchicalTagPicker` 是一个通用的层级标签选择器组件，支持：
- ✅ 层级标签展示（根据 level 自动缩进）
- ✅ 颜色和 Emoji 显示
- ✅ 单选/多选模式
- ✅ 搜索过滤
- ✅ 全选/清空操作
- ✅ 内联（inline）和弹出（popup）两种模式

## 安装

```typescript
import { HierarchicalTagPicker, HierarchicalTag } from '@/components/HierarchicalTagPicker';
```

## 使用示例

### 1. Inline 模式（类似 EventEditModal）

```typescript
import React, { useState } from 'react';
import { HierarchicalTagPicker } from '@/components/HierarchicalTagPicker';

function EventEditModal() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // 从 TagService 获取标签
  const hierarchicalTags = TagService.getTags().flatMap(group => 
    group.tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      emoji: tag.emoji,
      level: tag.level || 0,
      parentId: tag.parentId
    }))
  );

  return (
    <div className="form-group">
      <label>标签</label>
      <HierarchicalTagPicker
        availableTags={hierarchicalTags}
        selectedTagIds={selectedTags}
        onSelectionChange={setSelectedTags}
        mode="inline"
        placeholder="选择标签..."
        multiSelect={true}
        showBulkActions={true}
        maxSelection={5}
      />
    </div>
  );
}
```

### 2. Popup 模式（类似 FloatingToolbar）

```typescript
import React, { useState } from 'react';
import { HierarchicalTagPicker } from '@/components/HierarchicalTagPicker';

function FloatingToolbar() {
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const hierarchicalTags = TagService.getFlatTags();

  return (
    <>
      <button onClick={() => setShowTagPicker(true)}>
        # 标签
      </button>

      {showTagPicker && (
        <div className="floating-panel">
          <HierarchicalTagPicker
            availableTags={hierarchicalTags}
            selectedTagIds={selectedTags}
            onSelectionChange={setSelectedTags}
            mode="popup"
            placeholder="搜索标签..."
            multiSelect={true}
            showBulkActions={true}
            autoFocus={true}
            onClose={() => setShowTagPicker(false)}
          />
        </div>
      )}
    </>
  );
}
```

### 3. 筛选模式（类似 CalendarSettingsPanel）

```typescript
import React from 'react';
import { HierarchicalTagPicker } from '@/components/HierarchicalTagPicker';

function CalendarSettingsPanel() {
  const [visibleTags, setVisibleTags] = useState<string[]>([]);

  const hierarchicalTags = availableTags.map(tag => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    emoji: tag.emoji,
    level: tag.level || 0
  }));

  return (
    <div className="settings-section">
      <h3>🏷️ 显示标签</h3>
      <HierarchicalTagPicker
        availableTags={hierarchicalTags}
        selectedTagIds={visibleTags}
        onSelectionChange={setVisibleTags}
        mode="inline"
        placeholder="筛选标签..."
        multiSelect={true}
        showBulkActions={true}
      />
    </div>
  );
}
```

### 4. 单选模式

```typescript
function TagSelectorSingle() {
  const [selectedTag, setSelectedTag] = useState<string>('');

  return (
    <HierarchicalTagPicker
      availableTags={hierarchicalTags}
      selectedTagIds={selectedTag ? [selectedTag] : []}
      onSelectionChange={(ids) => setSelectedTag(ids[0] || '')}
      mode="inline"
      multiSelect={false}  // 单选模式
      showBulkActions={false}
    />
  );
}
```

## API 参考

### Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `availableTags` | `HierarchicalTag[]` | **必填** | 可用标签列表 |
| `selectedTagIds` | `string[]` | **必填** | 已选标签 ID 列表 |
| `onSelectionChange` | `(ids: string[]) => void` | **必填** | 选择变化回调 |
| `multiSelect` | `boolean` | `true` | 是否多选模式 |
| `mode` | `'inline' \| 'popup'` | `'inline'` | 显示模式 |
| `placeholder` | `string` | `'选择标签...'` | 占位符文本 |
| `showBulkActions` | `boolean` | `true` | 是否显示全选/清空按钮 |
| `maxSelection` | `number` | - | 最大选择数量（仅多选） |
| `autoFocus` | `boolean` | `false` | 是否自动聚焦搜索框 |
| `onClose` | `() => void` | - | 关闭回调（仅 popup） |

### HierarchicalTag 接口

```typescript
interface HierarchicalTag {
  id: string;          // 标签 ID
  name: string;        // 标签名称
  color: string;       // 标签颜色
  emoji?: string;      // 标签 Emoji
  level?: number;      // 层级（0=父，1=子，2=孙...）
  parentId?: string;   // 父标签 ID
  calendarId?: string; // 关联日历 ID
}
```

## 迁移指南

### 从 EventEditModal 迁移

**之前：**
```typescript
<div className="tag-selector">
  <div className="selected-tags-with-search">
    {/* 复杂的内联标签和搜索逻辑 */}
  </div>
  {showTagDropdown && (
    <div className="tag-dropdown">
      {/* 复杂的下拉列表逻辑 */}
    </div>
  )}
</div>
```

**之后：**
```typescript
<HierarchicalTagPicker
  availableTags={hierarchicalTags}
  selectedTagIds={formData.tags}
  onSelectionChange={(tags) => setFormData({...formData, tags})}
  mode="inline"
  multiSelect={true}
/>
```

### 从 CalendarSettingsPanel 迁移

**之前：**
```typescript
<div className="filter-list">
  {availableTags.map(tag => (
    <label key={tag.id} className="filter-item">
      <input
        type="checkbox"
        checked={localSettings.visibleTags.includes(tag.id)}
        onChange={() => handleTagToggle(tag.id)}
      />
      {/* 复杂的层级显示逻辑 */}
    </label>
  ))}
</div>
```

**之后：**
```typescript
<HierarchicalTagPicker
  availableTags={availableTags}
  selectedTagIds={localSettings.visibleTags}
  onSelectionChange={(tags) => setLocalSettings({...localSettings, visibleTags: tags})}
  mode="inline"
  showBulkActions={true}
/>
```

## 样式自定义

组件使用独立的 CSS 文件，可以通过覆盖以下 CSS 类来自定义样式：

- `.hierarchical-tag-picker` - 主容器
- `.tag-chip` - 已选标签芯片
- `.tag-dropdown` - 下拉列表
- `.tag-option` - 标签选项
- `.hierarchical-tag-picker-popup` - 弹出面板

## 注意事项

1. **层级缩进**：`level` 属性会自动转换为 `paddingLeft`（每级 12px）
2. **标签数据**：需要从 `TagService` 获取完整的标签数据（包含 level 信息）
3. **性能**：组件支持搜索过滤，对于大量标签（>100）性能良好
4. **无障碍**：支持键盘导航和屏幕阅读器

## 下一步

1. ✅ 在 FloatingToolbar 中测试 popup 模式
2. ⏳ 替换 EventEditModal 中的标签选择器
3. ⏳ 替换 CalendarSettingsPanel 中的标签筛选器
4. ⏳ 移除旧的 FloatingToolbar/pickers/TagPicker.tsx
