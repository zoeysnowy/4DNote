# Changelog

All notable changes to ReMarkable will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **EventService 审阅与重构审计文档** (2025-12-29):
  - 新增审阅文档：`docs/audits/EVENTSERVICE_REVIEW_AND_REFACTOR_2025-12-28.md`
  - 聚焦 `normalizeEvent/normalizeEventLog` 一致性、签名系统分叉风险、CompleteMeta V2 闭环缺口
  - 明确本地 ID 策略（本地 `event.id`=数据库 eventID；Outlook/远端 ID 走 `externalId`），并给出最小可实施 Checklist（meta.id/meta.signature 回填与同步侧不覆盖本地 ID）
  - 解释并定位 TimeCalendar 新建事件“空 eventlog → 空段落 JSON”的根因（`jsonToSlateNodes('[]')` 默认返回空段落），并给出存储语义/编辑器语义拆分建议

- **EventEditModalV2 架构健康审计文档** (2025-12-29):
  - 新增审计文档：`docs/audits/EVENTEDITMODAL_V2_ARCH_REVIEW_2025-12-29.md`
  - 聚焦入口契约（eventId-only）、保存语义事实、组件过载风险与最小重构路线

- **EventEditModalV2 PRD 与实现对齐** (2025-12-29):
  - PRD 保存章节对齐当前实现：编辑过程更新 `formData`，点击“保存”才持久化；关闭/遮罩视为取消
  - 补充入口现状：TimeCalendar/TimeLog/LogTab
  - File:
    - `docs/PRD/EVENTEDITMODAL_V2_PRD.md`

### Fixed
- **TimeLog TimeGap：新建事件时间语义修复** (2025-12-29):
  - TimeGap 悬停/建议时间改为 **15 分钟吸附**（避免出现 38/42/54 分钟等随机分钟）
  - 从 TimeGap 新建事件时，`createdAt/updatedAt` 对齐到用户选择的 `startTime`（避免创建时间与时间轴选择不一致）
  - Files:
    - `src/components/TimeLog/TimeGap.tsx`
    - `src/pages/TimeLog.tsx`

- **TimeLog → EventEditModalV2：新建入口契约修复** (2025-12-29):
  - 新建入口改为“先落库创建事件，再打开 Modal”，满足 EventEditModalV2 的 **eventId-only** 契约
  - 取消/关闭时自动删除刚创建但未保存的事件，避免列表残留“空事件”
  - Files:
    - `src/pages/TimeLog.tsx`

- **EventEditModalV2：按副作用边界抽离 Draft Hook（无 UX 变化）** (2025-12-29):
  - 把 formData 初始化/重置、titleRef、initialSnapshot/isAutoSaving 等 refs 统一抽离到 hook，降低单文件过载
  - 修复/收敛若干类型边界：syncStatus 类型、ES5 target 下 emoji 正则兼容、LogTab location 归一化
  - Files:
    - `src/components/EventEditModal/EventEditModalV2.tsx`
    - `src/components/EventEditModal/hooks/useEventEditDraft.ts`
    - `src/components/EventEditModal/types.ts`
    - `src/pages/LogTab.tsx`

- **EventEditModal 新建事件：eventlog 乱码 & location 保存失败修复** (2025-12-29):
  - 修复 eventlog 被二次 `JSON.stringify` 导致的“带引号 JSON 乱码”（保存时区分 string/array，并兼容历史二次 stringify 数据）
  - 修复填写 location 后事件写入失败导致“事件消失”（SQLite 写入边界将 location 统一序列化为 TEXT：优先取 `displayName`）
  - Files:
    - `src/components/EventEditModal/EventEditModalV2.tsx`
    - `src/services/storage/SQLiteService.ts`

- **Block-Level Timestamp Outlook 同步修复** (2025-12-03):
  - 🐛 修复添加 calendarIds 同步到 Outlook 后，Block-Level Timestamp 全部崩溃的问题
  - **根因**: 
    - `EventService.normalizeEvent()` 生成 description 时使用 `eventlog.plainText`（不含 timestamps）
    - `slateNodesToHtml()` 未将 paragraph 的 `createdAt/updatedAt` 包含在 HTML 中
    - 推送到 Outlook 时丢失 Block-Level Timestamps，同步回来时无法还原
  - **解决方案**:
    - **serialization.ts**: 修改 `slateNodesToHtml`，在每个 paragraph 前添加 `YYYY-MM-DD HH:mm:ss` 格式的 timestamp
    - **EventService.ts**: `normalizeEvent` 改用 `eventlog.html`（含 timestamps）而非 `plainText`
    - 数据流：Slate JSON → HTML (含 timestamps) → Outlook → 同步回来 → `parseTextWithBlockTimestamps` 还原
  - Files:
    - `src/components/ModalSlate/serialization.ts` (L136-175: 添加 timestampPrefix)
    - `src/services/EventService.ts` (L3192: 使用 eventlog.html)
  - **测试验证**: 本地创建含多个 timestamp 的事件 → 推送到 Outlook → 同步回来 → timestamps 完整保留

- **FloatingToolbar textStyle 子菜单数字键修复** (2025-11-28):
  - 🐛 修复 textStyle 子菜单数字键超出范围错误（"菜单索引 5 超出范围 (最大 4)"）
  - **根因**: `useFloatingToolbar` 使用固定的 `menuItemCount: 5`，但 textStyle 子菜单有 7 个选项
  - **架构限制**: `activePicker` 状态存在于 `HeadlessFloatingToolbar` 内部，`EventEditModalV2` 无法直接访问
  - **解决方案**: 
    - 修改 `onSubPickerStateChange` 回调签名：从 `(isOpen: boolean)` 改为 `(isOpen: boolean, activePicker?: string | null)`
    - `EventEditModalV2` 添加 `currentActivePicker` 状态追踪
    - 动态计算 `menuItemCount`：textStyle 为 7，其他为 5
    - 添加 `'textStyle'` 和 `'addTask'` 到 `ToolbarFeatureType` 枚举
  - Files: 
    - `HeadlessFloatingToolbar.tsx` (L220: 传递 activePicker 参数)
    - `types.ts` (L75: 更新回调签名, L49-50: 添加枚举类型)
    - `EventEditModalV2.tsx` (L365: currentActivePicker 状态, L533: 动态 menuItemCount, L2737: 回调处理)
  - **测试验证**: textStyle 子菜单数字键 1-7 全部可用，不再出现范围错误

### Added
- **EventEditModal V2 日历同步功能完整实现** (2025-11-25):
  - ✅ **6层优先级来源显示**: 自动判断事件来源（Timer子事件→外部日历→独立Timer→Plan→TimeCalendar→本地事件）
  - ✅ **多选日历 UI**: "来自"区域只读显示，"同步到"区域支持多选日历，显示"第一个日历+等"
  - ✅ **Private 模式**: 支持 send-only-private 和 bidirectional-private 模式，参与者格式化为📧文本添加到 description
  - ✅ **标签自动映射**: 根据同步目标日历自动添加对应标签（Outlook→工作+Outlook, Google→生活+Google, iCloud→个人+iCloud）
  - ✅ **数据链路完整**: calendarIds[], planSyncConfig, actualSyncConfig 完整连接到 Event 类型和 EventService
  - Files: 
    - `EventEditModalV2.tsx` (Line 494-520: 标签映射, Line 626-663: Private模式, Line 691-747: 6层优先级)
    - `SimpleCalendarDropdown.tsx` (多选支持)
    - `types.ts` (PlanSyncConfig, ActualSyncConfig)
  - Documentation: `EVENTEDITMODAL_V2_PRD.md` (更新实现状态和代码位置)
  - Commits: 8012c5a, 8620720, 409b779, 7b51d7a

### Fixed
- **ContentSelectionPanel Button Spacing Optimization** (2025-11-19):
  - 🎨 移除任务节点中所有不必要的spacer占位符
  - 🐛 修复hide/unhide按钮与相邻元素的间距问题
  - **优化逻辑**: hide/unhide按钮现在直接紧贴展开按钮或任务标题
    - 有展开按钮的任务: hide/unhide → 展开按钮 → 任务标题
    - 无展开按钮的任务: hide/unhide → 任务标题
  - **移除组件**: 删除 `task-expand-spacer` 占位符逻辑
  - Files: `ContentSelectionPanel.tsx`

### Fixed
- **SyncTargetPicker Performance & Rendering Issues** (2025-11-12):
  - 🐛 修复 EventEditModal 疯狂闪烁问题(无限循环重渲染)
  - 🐛 修复关闭 modal 后事件丢失问题
  - 🎨 修复日历分组颜色显示为灰色的问题
  - **根因**: Props 引用变化导致 useEffect 无限触发
    - PlanManager/App.tsx 传入 `availableCalendars={[]}` 每次新引用
    - SyncTargetPicker useEffect 依赖 `[microsoftService, propCalendars]`
  - **解决方案**:
    - 移除所有 `availableCalendars` props 传递
    - SyncTargetPicker 改为从 `microsoftService` 内部加载
    - 使用 `useCallback` + `hasLoadedRef` 防止重复加载
    - 添加 `convertMicrosoftColorToHex()` 转换颜色名称为十六进制
  - **架构对齐**: 参考 CalendarMappingPicker 的最佳实践
  - Files: `SyncTargetPicker.tsx`, `EventEditModal.tsx`, `PlanManager.tsx`, `App.tsx`
  - Documentation: `SYNCTARGETPICKER_PERFORMANCE_FIX.md`

### Added
- **Time Field State Bitmap Architecture (v2.6)**:
  - `isFuzzyDate` boolean field to explicitly mark fuzzy dates
  - `timeFieldState: [number, number, number, number]` bitmap to track user-set fields
  - Three-layer architecture: Data Layer (complete timestamps) → Metadata Layer (user intent) → Display Layer (accurate rendering)
  - Fixes single time point display issue ("下周日中午" now shows "12:00" instead of "12:00 --> 00:00")
  - Files: `types.ts`, `time.ts`, `TimeHub.ts`, `UnifiedDateTimePicker.tsx`, `PlanManager.tsx`
  - Documentation: `TIME_PICKER_AND_DISPLAY_PRD.md` v2.6

### Reverted
- **Tiptap Phase 2 Integration**: Rolled back due to runtime Schema conflicts
  - Error: "No node type or group 'paragraph' found"
  - Impact: Persistent runtime error despite multiple fix attempts
  - Resolution: Reverted to original `FreeFormEditor` (contentEditable)
  - Files disabled: PlanEditor, EventTitle, EventDescription (renamed to .backup)
  - Documentation: `TIPTAP_PHASE2_FAILURE_ANALYSIS.md`
  - **User Impact**: LocalStorage data lost during cache clearing
  - **Lesson**: Tiptap requires complete isolation testing before production integration

### Added
- **Tiptap Phase 2 Integration** (Code Complete, Runtime Failed):
  - `TiptapLine`: Single-line Tiptap wrapper component (179 lines)
  - `TiptapFreeFormEditor`: Tiptap-powered FreeFormEditor replacement (299 lines)
  - Tab/Shift+Tab keyboard shortcuts for indentation
  - ArrowUp/ArrowDown navigation between lines
  - Documentation: `TIPTAP_PHASE2_INTEGRATION.md`, `TIPTAP_PHASE2_QUICKSTART.md`
  - Status: Code preserved for future v2.0 integration

### Changed
- **FloatingToolbar**: 快捷键从 Ctrl+/ 改为 Alt+1-5
  - Alt+1: 标签功能
  - Alt+2: 表情功能
  - Alt+3: 日期功能
  - Alt+4: 优先级功能
  - Alt+5: 颜色功能
  - 快捷键仅在编辑器内激活（有焦点）时生效
- **PlanManager**: Now uses `TiptapFreeFormEditor` instead of `FreeFormEditor`
- Updated documentation in `docs/FLOATING_TOOLBAR_GUIDE.md`

## [1.1.0] - 2025-10-20

### Added
- TUI Calendar integration with interactive week/month views
- EventEditModal component with multi-tag selection
- Calendar filter system (CalendarSettingsPanel)
- Event deduplication mechanism (inline + periodic scan)
- Multi-format ISO 8601 time parsing support
- Tag search functionality in event editor
- Click-outside-to-close for tag dropdown
- Auto-select-all calendars on first settings open
- Comprehensive documentation (5 new docs)
- Testing utilities (4 diagnostic tools)
- CalendarSettingsPanel with visibility toggles
- Time validation before save (NaN rejection)

### Fixed
- Event click handler closure issue (stale events array)
- TUI Calendar event binding (incorrect event name)
- NaN:NaN time display (ISO format parsing)
- Calendar filter empty-array semantics
- Tag dropdown unable to close
- Duplicate events during calendar migration
- Time parsing for .000Z millisecond format

### Changed
- Replaced legacy TagManager with FigmaTagManagerV3
- Calendar filter logic: removed "empty = show all" behavior
- Event time fields now use ISO 8601 strings
- Updated parseLocalTimeString to handle multiple formats
- Enhanced ActionBasedSyncManager with duplicate detection

### Removed
- Legacy TagManagement component
- Old TagManager component
- Confusing calendar filter logic

### Technical
- New files: 11 components, 5 docs, 4 test utilities
- Code changes: 76 files, +15,187 / -3,096 lines
- Dependencies: @toast-ui/calendar, @toast-ui/react-calendar

### Documentation
- TIMECALENDAR_README.md: Implementation guide
- timecalendar-tui-integration.md: TUI Calendar integration
- timecalendar-testing-guide.md: Testing procedures
- timecalendar-completion-summary.md: Development report
- ui-verification-framework.md: UI testing framework

## [1.0.0] - 2024

### Added
- Initial stable release
- Microsoft Outlook calendar synchronization
- Event management (create, edit, delete)
- Task management system
- Tag management system
- Pomodoro timer
- Azure MSAL authentication
- localStorage persistence
- Action-based sync manager
- Conflict resolution system

### Technical
- React 19.2.0 + TypeScript
- Microsoft Graph API integration
- MSAL Browser authentication
- Create React App foundation

## [1.0.0-dev] - 2024

### Added
- Beta development version
- Core calendar sync functionality
- Basic event and task management
- Initial tag system
- Development documentation

## [0.1.0] - 2024

### Added
- Project initialization
- Basic UI structure
- React setup
- TypeScript configuration

---

## Version Links

- [1.1.0 Release Notes](./RELEASE_NOTES_v1.1.md)
- [GitHub Releases](https://github.com/zoeysnowy/ReMarkable/releases)
- [Documentation](./docs/)

---

## Legend

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements
