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

- 按功能分类（你审阅时就按这个顺序点开看）：
  - Calendar
    - src/features/Calendar/styles/CalendarPicker.css
    - src/features/Calendar/components/CalendarSettingsPanel.tsx（"显示日历"区域：内嵌 filter-list 的“粗糙 CalendarPicker”，仍用 filter-item/calendar-item 等通用命名）
    - src/features/Calendar/styles/CalendarSettingsPanel.css（包含 filter-list/calendar-content/calendar-dot/calendar-name 的配套样式；部分规则复用/迁移到 CalendarPicker.css）
  - ToDo(待开发)
  - tag
    - src/components/shared/HierarchicalTagPicker.css
    - src/features/Tag/components/HierarchicalTagPicker/HierarchicalTagPicker.css
    - src/components/shared/FloatingToolbar/pickers/TagPicker.css
    - src/components/shared/FloatingToolbar/pickers/ColorPicker.css
    - src/features/Calendar/components/CalendarSettingsPanel.tsx（"显示标签"区域：未命名 Tag 列表，复用 filter-list/filter-item，内部是 tag-content/tag-name 等）
    - src/features/Calendar/styles/CalendarSettingsPanel.css（tag-content/tag-hash/tag-emoji/tag-name 的配套样式；明显是“临时在 settings 里造的轮子”）
  - datetime
    - src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css
  - FloatingToolbar（数字快捷键）
    - src/components/shared/FloatingToolbar/pickers/TextColorPicker.css
    - src/components/shared/FloatingToolbar/pickers/BackgroundColorPicker.css
  - contact/attendee
    - src/components/common/ContactPicker.tsx（目前没有独立 CSS 文件）
    - src/components/common/AttendeeDisplay.css（更像 display，但通常跟 picker/选择器一起出现）
  - location
    - src/components/common/LocationInput.css（当前主要是 input 形态）
  - Sync
    - src/features/Event/components/EventEditModal/SyncTargetPicker.css
    - src/components/common/SyncModeSelector.css
  - Mention
    - src/components/shared/UnifiedMentionMenu.css（✅ 推荐：PlanSlate/ModalSlate 已在用）
    - （已完成）LogSlate 已迁移到 UnifiedMentionMenu；旧的 src/components/LogSlate/MentionMenu.css 已删除

- 统一化建议（未来要做“统一组件，不再各处造轮子”时）：
  - 给 CalendarSettingsPanel 内嵌的列表加 wrapper class，避免复用通用 class 带来的合并/抽公共样式风险：
    - 例如 `.calendar-settings-panel .calendar-filter-list`（对应“显示日历”）
    - 例如 `.calendar-settings-panel .tag-filter-list`（对应“显示标签”）

- 合并候选簇：
  - src/components/shared/HierarchicalTagPicker.css  |  src/features/Calendar/styles/CalendarPicker.css  |  src/features/Tag/components/HierarchicalTagPicker/HierarchicalTagPicker.css
  - src/components/shared/FloatingToolbar/pickers/ColorPicker.css  |  src/components/shared/FloatingToolbar/pickers/TextColorPicker.css  |  src/components/shared/FloatingToolbar/pickers/BackgroundColorPicker.css  |  src/components/shared/FloatingToolbar/pickers/TagPicker.css  |  src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css

- 高相似文件对（Top）：
  - props 73.5% / values 37.2%  src/components/shared/HierarchicalTagPicker.css  ↔  src/features/Tag/components/HierarchicalTagPicker/HierarchicalTagPicker.css
  - props 66.1% / values 22.4%  src/features/Calendar/styles/CalendarPicker.css  ↔  src/features/Tag/components/HierarchicalTagPicker/HierarchicalTagPicker.css
  - props 64.3% / values 26.3%  src/components/shared/HierarchicalTagPicker.css  ↔  src/features/Calendar/styles/CalendarPicker.css
  - props 62.5% / values 13.3%  src/components/shared/FloatingToolbar/pickers/ColorPicker.css  ↔  src/components/shared/FloatingToolbar/pickers/TextColorPicker.css

- 这一类里最常见的本地 class（提示你哪些可做“统一语义/统一样式”）：
  - selected×4, color-picker-panel×3, keyboard-focused×3, tag-content×3, tag-option×3, tag-search-input×3

- 建议优先看的文件（出现在相似度候选里）：
  - src/components/shared/FloatingToolbar/pickers/ColorPicker.css
  - src/components/shared/FloatingToolbar/pickers/TagPicker.css
  - src/components/shared/FloatingToolbar/pickers/TextColorPicker.css
  - src/components/shared/FloatingToolbar/pickers/BackgroundColorPicker.css
  - src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css
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
  - src/components/shared/UnifiedMentionMenu.css

- 高相似文件对（Top）：
  - （已完成迁移）旧 MentionMenu.css 已删除；该对比项可移除

- 建议优先看的文件（出现在相似度候选里）：
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

- 补充：slider / range（左右拖曳进度调节器，CalendarSettings 里内嵌的一套）
  - src/features/Calendar/components/CalendarSettingsPanel.tsx（`input[type="range"]`，class: inline-slider / slider-track-wrapper / slider-track-fill / slider-value）
  - src/features/Calendar/styles/CalendarSettingsPanel.css（.inline-slider、.slider-track-*、.compact-category-row 等）

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

### Checkbox 形态规范（统一组件前先统一“语义”）

- **系统级菜单/设置/筛选（view/filter/config 选择）**：使用“圆角方形” checkbox（rounded square）
  - 典型场景：CalendarSettings / CalendarPicker 的日历列表、SettingsModal 的开关列表、各种过滤器选项
  - 参考实现：src/features/Calendar/styles/CalendarPicker.css（`border-radius: 3px`，自绘 `✓`）
- **checkType（任务完成/签到能力）**：使用“圆形” checkbox（circle）
  - 典型场景：Plan/TimeCalendar/UpcomingEventsPanel 等 “完成/签到” 勾选
  - 现状提示：目前有些地方还是浏览器默认样式（或仅 `accent-color`），后续统一时应全部收敛到同一套圆形样式

- **不要混用**：
  - “筛选某个系统开关/集合成员”永远是圆角方形
  - “完成/签到 checkType”永远是圆形

### 常见“可统一”的 class（出现于多个文件）

- .active → src/App.css, src/components/demos/AIDemo.css, src/components/demos/AIDemoV2.css, src/components/layout/AppLayout.css, src/components/shared/FloatingToolbar/FloatingToolbarV2.css, src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css, src/features/Event/components/EventEditModal/EventEditModalV2.css, src/features/Plan/components/PlanManager.css ...
- .selected → src/components/common/AttendeeDisplay.css, src/components/common/SyncModeSelector.css, src/components/demos/AIDemoV2.css, src/components/PlanItemEditor.css, src/components/shared/FloatingToolbar/HeadlessFloatingToolbar.css, src/components/shared/FloatingToolbar/pickers/TagPicker.css, src/components/shared/FloatingToolbar/pickers/UnifiedDateTimePicker.css ...
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

## 5) UI 规则补充（近期约定，先写死在这里）

> 目标：把“口头评审结论”变成可执行的规则，避免后续回归。

### 5.1 Close Button（×）

- 默认规则：关闭按钮本体永远不画 border（包括 hover/active/focus 状态也不应凭空冒出边框）。
- 例外：只有当它被设计成“白底按钮需要边框”的视觉体系时，才允许加边框；并且这个边框应属于“按钮容器”语义，而不是在内部元素上单独加。

### 5.2 Card/Panel 标题

- 标题行/标题容器本身：不需要背景色、不需要 border。
- 标题与内容区的分隔：优先用 layout（spacing）解决；如果必须用分隔线，分隔线属于“内容分组”的边界，不属于标题本体。

### 5.3 字体层级（16 / 15 / 14 / 13px）

- 16px：容器级标题（container/page/panel 的主标题）。通常是该容器的“唯一主标题”。
- 15px：卡片/Modal 标题、分区标题（section title）。可以加粗（建议 semi-bold/bold），但不要再叠加背景/边框。
- 14px：正文默认字号（表单项、列表项、描述文字）。
- 13px：辅助信息（hint/secondary）、次要 label、meta（例如计数、说明、快捷键提示）。

### 5.4 CalendarSettingsPanel（V2）交互/结构要求（功能不变）

- 保持功能与 settings contract 不变，仅重组 UI（不要引入新功能/新字段）。
- 布局参考 sidebar：顶部 header + close button，下面是内容区。
- 内容区按 section 组织，并用 toggle 折叠/展开 section 标题与内容。
- 固定 4 个 section：
  - 显示设置：背景颜色、背景透明度、事件透明度
  - 事件类型：仅开关（DDL / Task / AllDay），不展示高度 slider
  - 标签选择：使用当前已有的 TagPicker/HierarchicalTagPicker 组件
  - 日历选择：使用当前已有的 CalendarPicker 组件
