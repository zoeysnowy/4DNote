# UI CSS 审阅与合并指南

> 生成时间：2026-01-06T10:11:58.817Z

这份指南的目标是：把“几千行 class 列表”变成一个可执行的审阅顺序，并给出**可合并候选组**。

## 1) 你要干嘛（最短路径）

把 CSS 整理成“可复用的几套规则”，并且降低重复/冲突风险。建议按下面顺序做：

- 先只看 **合并候选组**（本文件第 2 节），挑 1 组最明显的开始。
- 对这一组做“抽公共部分”的草案：哪些规则应该成为一个 shared CSS（不用立刻改代码）。
- 再用大报告做核对：同名 class 是否在多处重复定义、是否有冲突。

相关大报告：
- docs/architecture/UI_CSS_CLASSIFICATION.md

## 2) 合并候选组（按组件类型聚合）

说明：这里的“相似”基于 CSS 属性集合（props）相似度；阈值偏保守但比大报告更宽松，方便你先抓住重复结构。

### picker

- 合并候选簇：
  - src/components/shared/HierarchicalTagPicker.css  |  src/features/Calendar/styles/CalendarPicker.css  |  src/features/Tag/components/HierarchicalTagPicker/HierarchicalTagPicker.css
  - src/components/shared/FloatingToolbar/pickers/ColorPicker.css  |  src/components/shared/FloatingToolbar/pickers/PriorityPicker.css  |  src/components/shared/FloatingToolbar/pickers/TagPicker.css  |  src/components/shared/FloatingToolbar/pickers/TextColorPicker.css

- 高相似文件对（Top）：
  - props 73.5% / values 37.2%  src/components/shared/HierarchicalTagPicker.css  ↔  src/features/Tag/components/HierarchicalTagPicker/HierarchicalTagPicker.css
  - props 70.0% / values 30.0%  src/components/shared/FloatingToolbar/pickers/PriorityPicker.css  ↔  src/components/shared/FloatingToolbar/pickers/TagPicker.css
  - props 66.1% / values 22.4%  src/features/Calendar/styles/CalendarPicker.css  ↔  src/features/Tag/components/HierarchicalTagPicker/HierarchicalTagPicker.css
  - props 64.3% / values 26.3%  src/components/shared/HierarchicalTagPicker.css  ↔  src/features/Calendar/styles/CalendarPicker.css
  - props 62.5% / values 13.3%  src/components/shared/FloatingToolbar/pickers/ColorPicker.css  ↔  src/components/shared/FloatingToolbar/pickers/TextColorPicker.css
  - props 62.5% / values 6.7%  src/components/shared/FloatingToolbar/pickers/ColorPicker.css  ↔  src/components/shared/FloatingToolbar/pickers/PriorityPicker.css

- 这一类里最常见的本地 class（提示你哪些可做“统一语义/统一样式”）：
  - selected×4, color-picker-panel×3, keyboard-focused×3, tag-content×3, tag-option×3, tag-search-input×3

- 建议优先看的文件（出现在相似度候选里）：
  - src/components/shared/FloatingToolbar/pickers/ColorPicker.css
  - src/components/shared/FloatingToolbar/pickers/PriorityPicker.css
  - src/components/shared/FloatingToolbar/pickers/TagPicker.css
  - src/components/shared/FloatingToolbar/pickers/TextColorPicker.css
  - src/components/shared/HierarchicalTagPicker.css
  - src/features/Calendar/styles/CalendarPicker.css
  - src/features/Tag/components/HierarchicalTagPicker/HierarchicalTagPicker.css

### modal

- 合并候选簇：
  - src/components/common/FullContactModal.css  |  src/components/SettingsModal.css  |  src/features/Contact/styles/ContactModal.css  |  src/pages/Home/CardConfigModal.css

- 高相似文件对（Top）：
  - props 75.6% / values 27.8%  src/components/SettingsModal.css  ↔  src/pages/Home/CardConfigModal.css
  - props 74.5% / values 28.3%  src/components/SettingsModal.css  ↔  src/features/Contact/styles/ContactModal.css
  - props 73.3% / values 30.1%  src/components/common/FullContactModal.css  ↔  src/components/SettingsModal.css
  - props 72.9% / values 26.8%  src/features/Contact/styles/ContactModal.css  ↔  src/pages/Home/CardConfigModal.css
  - props 70.8% / values 27.8%  src/components/common/FullContactModal.css  ↔  src/features/Contact/styles/ContactModal.css
  - props 68.1% / values 31.9%  src/components/common/FullContactModal.css  ↔  src/pages/Home/CardConfigModal.css

- 建议优先看的文件（出现在相似度候选里）：
  - src/components/common/FullContactModal.css
  - src/components/SettingsModal.css
  - src/features/Contact/styles/ContactModal.css
  - src/pages/Home/CardConfigModal.css

### menu

- 合并候选簇：
  - src/components/LogSlate/MentionMenu.css  |  src/components/shared/UnifiedMentionMenu.css

- 高相似文件对（Top）：
  - props 64.9% / values 16.5%  src/components/LogSlate/MentionMenu.css  ↔  src/components/shared/UnifiedMentionMenu.css

- 建议优先看的文件（出现在相似度候选里）：
  - src/components/LogSlate/MentionMenu.css
  - src/components/shared/UnifiedMentionMenu.css

### toolbar

### panel

- 合并候选簇：
  - src/features/Calendar/styles/CalendarSettingsPanel.css  |  src/features/Dashboard/styles/UpcomingEventsPanel.css

- 高相似文件对（Top）：
  - props 64.1% / values 21.1%  src/features/Calendar/styles/CalendarSettingsPanel.css  ↔  src/features/Dashboard/styles/UpcomingEventsPanel.css

- 建议优先看的文件（出现在相似度候选里）：
  - src/features/Calendar/styles/CalendarSettingsPanel.css
  - src/features/Dashboard/styles/UpcomingEventsPanel.css

### card

- 合并候选簇：
  - src/components/TimeHoverCard/TimeHoverCard.css  |  src/features/Timer/components/TimerCard.css

- 高相似文件对（Top）：
  - props 65.1% / values 11.0%  src/components/TimeHoverCard/TimeHoverCard.css  ↔  src/features/Timer/components/TimerCard.css

- 建议优先看的文件（出现在相似度候选里）：
  - src/components/TimeHoverCard/TimeHoverCard.css
  - src/features/Timer/components/TimerCard.css

### tabs

### slate

### calendar

### inputs

- 合并候选簇：
  - src/components/common/LocationInput.css  |  src/components/common/TagInput.css

- 高相似文件对（Top）：
  - props 72.5% / values 36.1%  src/components/common/LocationInput.css  ↔  src/components/common/TagInput.css

- 建议优先看的文件（出现在相似度候选里）：
  - src/components/common/LocationInput.css
  - src/components/common/TagInput.css

### layout

### charts

- 合并候选簇：
  - src/pages/Home/charts/PieChartView.css  |  src/pages/Home/charts/PixelView.css

- 高相似文件对（Top）：
  - props 63.2% / values 28.1%  src/pages/Home/charts/PieChartView.css  ↔  src/pages/Home/charts/PixelView.css

- 这一类里最常见的本地 class（提示你哪些可做“统一语义/统一样式”）：
  - chart-title×3, empty-icon×3, empty-state×3

- 建议优先看的文件（出现在相似度候选里）：
  - src/pages/Home/charts/PieChartView.css
  - src/pages/Home/charts/PixelView.css

### global-styles

### other

- 合并候选簇：
  - src/components/demos/AIDemoV2.css  |  src/features/TimeLog/pages/TimeLog.css  |  src/features/TimeLog/pages/TimeLogPage_new.css
  - src/components/common/AttendeeDisplay.css  |  src/components/common/QRCodeDisplay.css  |  src/components/common/SyncModeSelector.css  |  src/components/demos/RAGDemo.css  |  src/components/shared/SyncNotification.css  |  src/features/Plan/components/PlanManager.css  |  src/features/TimeLog/components/TimeGap.css  |  src/pages/Home/TimeRangeSelector.css

- 高相似文件对（Top）：
  - props 71.9% / values 18.7%  src/components/demos/AIDemoV2.css  ↔  src/features/TimeLog/pages/TimeLogPage_new.css
  - props 69.8% / values 15.8%  src/components/shared/SyncNotification.css  ↔  src/features/TimeLog/components/TimeGap.css
  - props 66.7% / values 20.8%  src/components/common/QRCodeDisplay.css  ↔  src/features/Plan/components/PlanManager.css
  - props 64.4% / values 19.0%  src/components/demos/RAGDemo.css  ↔  src/pages/Home/TimeRangeSelector.css
  - props 64.2% / values 21.5%  src/components/common/AttendeeDisplay.css  ↔  src/pages/Home/TimeRangeSelector.css
  - props 63.6% / values 17.2%  src/components/shared/SyncNotification.css  ↔  src/pages/Home/TimeRangeSelector.css

- 这一类里最常见的本地 class（提示你哪些可做“统一语义/统一样式”）：
  - active×9, selected×7, btn-primary×3, completed×3, empty-icon×3, empty-state×3, error×3, error-message×3, event-title×3, stat-item×3

- 建议优先看的文件（出现在相似度候选里）：
  - src/components/common/AttendeeDisplay.css
  - src/components/common/QRCodeDisplay.css
  - src/components/common/SyncModeSelector.css
  - src/components/demos/AIDemoV2.css
  - src/components/demos/RAGDemo.css
  - src/components/shared/SyncNotification.css
  - src/features/Plan/components/PlanManager.css
  - src/features/TimeLog/components/TimeGap.css
  - src/features/TimeLog/pages/TimeLog.css
  - src/features/TimeLog/pages/TimeLogPage_new.css
  - src/pages/Home/TimeRangeSelector.css

## 3) “该抽成一套规则”的快速检查点

你不需要逐行看 CSS。审阅时只需要回答这些问题：

- **状态语义是否一致**：同样的状态是否总叫 `active/selected/disabled/loading`？
- **结构是否一致**：是否反复出现 “header/body/footer + actions + close button + overlay”？
- **交互容器是否一致**：Tippy/Popover/Dropdown 的 padding、圆角、阴影、边框是否重复写？
- **输入框/搜索框是否一致**：search-input / wrapper / icon 是否在多处重复实现？
- **空状态是否一致**：empty-state / empty-icon / empty-hint 是否重复？

### 常见“可统一”的 class（出现于多个文件）

- .active → src/App.css, src/components/demos/AIDemo.css, src/components/demos/AIDemoV2.css, src/components/layout/AppLayout.css, src/components/shared/FloatingToolbar/FloatingToolbarV2.css, src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css, src/features/Event/components/EventEditModal/EventEditModalV2.css, src/features/Plan/components/PlanManager.css ...
- .selected → src/components/common/AttendeeDisplay.css, src/components/common/SyncModeSelector.css, src/components/demos/AIDemoV2.css, src/components/LogSlate/MentionMenu.css, src/components/PlanItemEditor.css, src/components/shared/FloatingToolbar/HeadlessFloatingToolbar.css, src/components/shared/FloatingToolbar/pickers/TagPicker.css, src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css ...
- .btn-primary → src/App.css, src/components/common/AttendeeDisplay.css, src/components/demos/AIDemo.css, src/features/Calendar/styles/CalendarGroupManager.css, src/features/Contact/styles/ContactModal.css
- .close-btn → src/components/common/AttendeeDisplay.css, src/features/Calendar/styles/CalendarSettingsPanel.css, src/features/Contact/styles/ContactModal.css, src/pages/Home/CalendarSidebar.css, src/pages/Home/CardConfigModal.css
- .close-button → src/components/shared/FloatingToolbar/HeadlessFloatingToolbar.css, src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css, src/features/Calendar/styles/CalendarGroupManager.css, src/features/Calendar/styles/CalendarSettingsPanel.css
- .error → src/App.css, src/components/demos/AIDemoV2.css, src/features/Event/components/EventTree/EditableEventTree.css, src/pages/Event/EditorWindow.css
- .loading → src/App.css, src/features/Calendar/styles/CalendarGroupManager.css, src/features/Event/components/EventTree/EditableEventTree.css, src/pages/Event/EditorWindow.css
- .picker-header → src/components/shared/FloatingToolbar/FloatingToolbarV2.css, src/components/shared/FloatingToolbar/HeadlessFloatingToolbar.css, src/components/shared/FloatingToolbar/pickers/TextColorPicker.css, src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css
- .btn-cancel → src/App.css, src/pages/Home/CardConfigModal.css, src/pages/Home/TimeRangeSelector.css
- .btn-save → src/App.css, src/components/demos/AIDemoV2.css, src/pages/Home/CardConfigModal.css
- .disabled → src/components/common/SyncModeSelector.css, src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css, src/features/Calendar/styles/CalendarPicker.css
- .modal-content → src/features/Event/components/EventEditModal/EventEditModalV2.css, src/pages/Event/DetailTab.css, src/pages/Home/CardConfigModal.css
- .modal-footer → src/components/common/AttendeeDisplay.css, src/features/Contact/styles/ContactModal.css, src/pages/Home/CardConfigModal.css
- .modal-header → src/components/common/AttendeeDisplay.css, src/features/Contact/styles/ContactModal.css, src/pages/Home/CardConfigModal.css

## 4) 下一步我可以帮你做什么

- 如果你选定一个簇（比如 picker），我可以：
  - 把这簇里“重复度最高的规则块”提取成一个 shared CSS 草案（先不改行为，只做样式引用替换）。
  - 做一次非常保守的死代码清单（只输出候选，不自动删，且永远跳过 vendor）。
