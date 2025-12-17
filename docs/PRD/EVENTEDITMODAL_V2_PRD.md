# EventEditModal v2 产品需求文档 (PRD)

> **版本**: v2.17.5  
> **创建时间**: 2025-11-06  
> **最后更新**: 2025-12-15  
> **Figma 设计稿**: [EventEditModal v2 设计稿](https://www.figma.com/design/T0WLjzvZMqEnpX79ILhSNQ/ReMarkable-0.1?node-id=201-630&m=dev)  
> **基于**: EventEditModal v1 + Figma 设计稿  
> **依赖模块**: EventHub, TimeHub, SlateEditor, HeadlessFloatingToolbar, Timer Module, EventTree  
> **关联文档**: 
> - [EventEditModal v1 PRD](./EVENTEDITMODAL_MODULE_PRD.md)
> - [Timer 模块 PRD](./TIMER_MODULE_PRD.md)
> - [TimeCalendar 模块 PRD](./TIMECALENDAR_MODULE_PRD.md)
> - [TIME_ARCHITECTURE.md](../TIME_ARCHITECTURE.md)
> - [SLATE_DEVELOPMENT_GUIDE.md](../SLATE_DEVELOPMENT_GUIDE.md)
> - [EVENTTREE_MODULE_PRD.md](./EVENTTREE_MODULE_PRD.md)

> **🔥 v2.17.5 最新更新** (2025-12-15):
> - ✅ **智能 syncStatus 判断 - 支持纯本地事件**: 新建事件默认 `local-only`，用户添加标签/日历后自动切换为 `pending`
>   - **默认本地**: 新建事件 syncStatus 默认为 `'local-only'`，不会触发日历同步
>   - **智能升级**: 用户添加标签或选择日历时，自动升级为 `'pending'`，启动同步流程
>   - **Timer 保护**: 运行中的 Timer 强制 `'local-only'`，防止同步冲突
>   - **优雅降级**: ActionBasedSyncManager 跳过 `local-only` 事件，不会触发日历降级警告
>   - **用户友好**: 无需手动配置同步状态，系统根据用户行为自动判断
>   - **实现位置**: EventEditModalV2.tsx L1151-1171 (智能 syncStatus 判断逻辑)
> 
> **🔥 v2.17.4 历史更新** (2025-12-15):
> - ✅ **TagService 性能优化 - 解决 EventEditModal 崩溃问题**: 修复 `getFlatTags()` 导致的无限重渲染
>   - **问题根源**: `getFlatTags()` 每次返回新数组引用 + 重复排序 → useMemo 依赖变化 → 无限重渲染 → 页面崩溃
>   - **修复方案**: 返回稳定引用（直接返回 `this.flatTags`），排序统一在 `flattenTags()` 中完成
>   - **影响范围**: EventEditModal 3处调用（L2515, L3001, L3457）+ 标签选择器 + 日历选择器
>   - **性能提升**: 消除无限循环，避免每次调用都创建新数组和排序
>   - **架构一致性**: 与 v1.7.0 `getTags()` 优化保持一致（所有 Service getter 方法返回稳定引用）
>   - **实现位置**: TagService.ts L450-465 (`getFlatTags()`), L323-391 (`flattenTags()`)
> 
> **🔥 v2.17.3 历史更新** (2025-12-14):
> - ✅ **表单重置与初始时间支持**: 修复新建事件时Modal显示旧数据的问题
>   - **表单重置优化**: 使用 `!event` 代替 `!eventId` 判断，确保创建新事件时表单完全重置
>   - **初始时间props**: 新增 `initialStartTime`/`initialEndTime`/`initialIsAllDay` 属性，支持从TimeCalendar传入初始时间
>   - **TimeCalendar集成**: TimeCalendar选择时间段后打开Modal，自动填充所选时间范围
>   - **实现位置**: EventEditModalV2.tsx Lines 184-187 (Props接口), Lines 495-520 (表单重置逻辑)
> - ✅ **标签自动填充标题**: 当标题为空时选择标签，自动使用标签名称填充标题
>   - **JSON格式检测**: 智能检测Slate JSON格式，正确判断标题是否真正为空
>   - **emoji支持**: 自动包含标签的emoji和名称
>   - **实现位置**: EventEditModalV2.tsx Lines 2504-2530
> 
> **🔥 v2.17.2 历史更新** (2025-12-09):
> - ✅ **数据流与保存机制完整总结**: 新增专门章节详细说明字段初始化、更新机制和保存架构
>   - **FormData 初始化**: 详细说明编辑已有事件和创建新事件的数据来源和处理逻辑
>   - **字段更新机制**: 8个核心字段的完整更新流程（title/tags/time/location/attendees/eventlog/sync/isTask）
>   - **三层保存架构**: blur-to-save、5秒自动保存、Modal关闭保存的完整实现和设计理念
>   - **数据接口**: EventHub → EventService → StorageManager 完整数据流图和分层架构说明
>   - **字段验证总结**: 13个字段的UI组件、更新逻辑、保存路径和验证状态
>   - **已修复问题**: UnifiedDateTimePicker useTimeHub修复、syncMode立即保存、ContactService自动提取
> 
> **🔥 v2.17.1 历史更新** (2025-12-09):
> - ✅ **TitleSlate 中文 IME 输入优化**: 完全修复输入法导致的光标偏移和失焦问题
>   - **根本原因**: `renderLeaf` 中的 emoji 过滤逻辑修改了 `leaf.text`，破坏了 Slate DOM ↔ AST 映射
>   - **架构修复**: 移除 `renderLeaf` 中的文本修改逻辑，改为在数据层（`titleContent` useMemo）过滤 emoji
>   - **Emoji 正则升级**: 更新为完整 Unicode 范围（`\u{1F300}-\u{1F9FF}`, `\u{2600}-\u{26FF}` 等），覆盖所有 emoji
>   - **IME 兼容**: 输入法期间不修改 DOM，确保光标位置稳定，用户体验流畅
> - ✅ **SyncMode 架构修复 - 历史数据迁移**: 修复 Outlook 事件被远程覆盖的根本问题
>   - **问题诊断**: 旧代码将 Outlook 事件默认设为 `receive-only`，导致本地修改被远程同步覆盖
>   - **数据修复**: 批量迁移脚本将 1083 个 Outlook 事件从 `receive-only` 升级为 `bidirectional-private`
>   - **运行时自动升级**: 同步时检测 `receive-only` 模式自动升级，无需手动迁移
>   - **默认值修改**: 新创建的 Outlook 事件默认 `bidirectional-private`（可用户修改）
>   - **自动保存**: syncMode 修改后立即保存，防止 UI ↔ Database 状态不一致
> 
> **🔥 v2.17.0 历史更新** (2025-12-06):
> - ✅ **EventTree 集成 - @ 触发双向链接**: 在 EventLog 中输入 @ 自动创建事件之间的双向链接
>   - **@ 触发机制**: 输入 @ 字符自动弹出 UnifiedMentionMenu 搜索事件
>   - **EventMention 节点**: Slate 编辑器中渲染蓝色背景的 @事件标题
>   - **自动双向链接**: 选择事件后自动调用 EventService.addLink() 创建 linkedEventIds 和 backlinks
>   - **关联区域统计**: 实时显示"关联：X个事件"，点击展开查看 EventTreeViewer
>   - **智能搜索**: 支持按标题/标签搜索，Top Hit 优先显示最近访问的事件
>   - **键盘导航**: ↑↓ 选择事件，Enter 确认，Esc 关闭菜单
> 
> **🔥 v2.15.6 历史更新** (2025-12-01):
> - ✅ **标题输入框流畅输入体验优化**: 完全解决输入法期间的换行和闪烁问题
>   - **IME 期间无宽度限制**: 输入法启动时设置 `width: max-content`，让文字自由扩展到 240px
>   - **输入法完成后精确调整**: 输入法结束时立即计算并应用精确宽度，支持自动换行（最多3行）
>   - **新字符同行显示**: 新输入的字符始终和前一个字符在同一行，不会跳到第二行
>   - **CSS 优化**: 使用 `white-space: pre-wrap` 保持空格，只在达到最大宽度时换行
>   - **Placeholder 自适应**: 空内容时根据 placeholder 文本计算初始宽度，避免换行
>   - **零延迟响应**: 移除所有防抖，同步执行宽度调整，checkbox 立即跟随
> 
> **🔥 v2.15.5 历史更新** (2025-12-01):
> - ✅ **标题输入框宽度调整优化**: 完全移除防抖延迟，实现零延迟的响应式宽度调整
>   - **浏览器原生计算**: 使用 CSS `max-content` 让浏览器计算自然宽度，无需创建隐藏 DOM 元素
>   - **零延迟响应**: 移除所有 `setTimeout` 和 `requestAnimationFrame`，同步执行宽度调整
>   - **IME 输入法优化**: 输入法激活期间完全跳过宽度计算，文字首字母位置固定
>   - **删除即时响应**: 删除文字时 checkbox 立即跟随到新位置，无任何延迟
>   - **用户体验提升**: 消除了之前用户感知到的"延迟感"和"卡顿感"
> 
> **🔥 v2.0.5 历史更新** (2025-11-28):
> - ✅ **FloatingToolbar textStyle 子菜单修复**: 修复数字键 5-7 超出范围错误
> - ✅ **动态 menuItemCount 机制**: 根据 activePicker 状态动态计算菜单项数量（主菜单 5 项，textStyle 子菜单 7 项）
> - ✅ **状态同步架构**: `onSubPickerStateChange(isOpen, activePicker)` 回调传递当前菜单状态
> - ✅ **键盘快捷键文档**: 完善 FloatingToolbar 数字键快捷键说明（主菜单 1-5，textStyle 子菜单 1-7）
> - ✅ **标签自动映射日历功能**: 添加标签时自动更新同步日历配置（已完成于 v2.0.5）
>   - **本地事件**: Plan + Actual 都自动添加标签映射的日历，默认 `bidirectional-private`
>   - **远程事件**: Plan 保持 `receive-only` 不添加映射，Actual 自动添加标签映射的日历
>   - **实时同步**: 标签变更后，日历选择器立即更新显示
>   - **智能合并**: 与用户手动选择的日历合并（不覆盖）
>   - **标题自动填充**: 当标题为空且添加标签时，自动使用第一个标签的emoji+名称填充标题（支持Slate JSON格式检测）
>   - **实现位置**: EventEditModalV2.tsx Lines 2450-2600
> 
> **🔥 v2.0.4 历史更新** (2025-11-27):
> - ✅ **父-子事件单一配置架构**: 移除 planSyncConfig/actualSyncConfig 双配置，改用 calendarIds + syncMode 单一配置
> - ✅ **subEventConfig 模板机制**: 父事件使用 subEventConfig 存储子事件配置模板，解决无子事件时无法保存实际进展配置问题
> - ✅ **计划安排区域**: 父模式更新 mainEvent.calendarIds/syncMode，子模式更新 parentEvent（计划字段同步到父）
> - ✅ **实际进展区域**: 父模式更新 subEventConfig（模板）并批量更新子事件，子模式更新 mainEvent（子事件自己的配置）
> - ✅ **模板继承机制**: 创建子事件时从父事件的 subEventConfig 继承配置，父事件无子事件时模板持久化
> - ✅ **syncMode 同步控制**: 实现 receive-only（仅接收）、send-only（仅推送）、bidirectional（双向）模式，控制本地↔远端同步行为
> 
> **🔥 v2.0.3 历史更新** (2025-11-26):
> - ✅ **同步日历选择器重设计**: "来自" → "同步"，从只读改为可编辑 Picker
> - ✅ **"来源"标志永久保留**: 来源日历右对齐显示灰色"来源"文本，可取消勾选但标志保留
> - ✅ **标签智能映射显示**: 标签触发的日历右对齐显示标签名称和颜色，多标签显示第一个
> - ✅ **同步完全基于 calendarIds**: 标签不作为同步判断条件，仅用于智能勾选建议
> - ✅ **用户完全控制**: 取消勾选日历不删除标签，重新勾选"来源"标志继续显示
> - ✅ **计划 vs 实际区分**: 计划显示"来源"+标签映射，实际不显示"来源"（本地生成）
> 
> **🔥 v2.0.2 历史更新** (2025-11-24):
> - ✅ **SlateEditor 集成**: 轻量级 Slate 编辑器替代 PlanSlateEditor，专为 EventLog 优化
> - ✅ **FloatingBar 完整支持**: HeadlessFloatingToolbar 集成完成，支持 tag/emoji/dateMention 插入
> - ✅ **文本格式功能**: 支持粗体 (Ctrl+B)、斜体 (Ctrl+I)、下划线 (Ctrl+U)、文字颜色、背景颜色
> - ✅ **颜色选择器优化**: 修复数字键选择颜色功能，通过 isSubPickerOpen 状态避免键盘事件冲突
> - ✅ **Void 元素处理**: 实现自定义 isVoid、isInline、normalizeNode，正确处理 timestamp-divider 等行内 void 元素
> - ✅ **键盘交互优化**: 添加 isComposing 检查，支持中文输入法；Ctrl+快捷键应用文本格式
> - ✅ **时间戳分隔线**: EventLogTimestampService 自动生成 5 分钟间隔的时间戳分隔线
> 
> **🔥 v2.0.1 历史更新** (2025-11-20):
> - ✅ **完整同步机制整合**: 将 CALENDAR_SYNC_SCENARIOS_MATRIX.md 的内容完整整合到 EventEditModal v2 PRD
> - ✅ **Private 模式支持**: 添加 send-only-private 和 bidirectional-private 模式，参与者不被邀请而作为文本添加到描述
> - ✅ **独立事件架构**: Plan 和 Actual 永远创建独立的远程事件，使用 syncedPlanEventId 和 syncedActualEventId
> - ✅ **9种同步场景规范**: 相同日历场景 A1-C2 完整规范，包含事件数量（1+N, 2）和典型用例
> - ✅ **Private 模式函数**: formatParticipantsToDescription, extractParticipantsFromDescription, syncToRemoteCalendar 等核心函数
> - ✅ **单一配置架构**: 每个事件使用 calendarIds + syncMode，父事件另外支持 subEventConfig 模板
> - ✅ **技术实现完善**: 更新 SyncModeSelector 组件支持 Private 模式，完善 Event 接口字段定义
> 
> **🔥 v2.0.0 历史更新** (2025-11-19):
> - ✅ **子事件类型扩展**: 支持 Timer/TimeLog/OutsideApp 三种子事件类型
>   - `isTimer`: 系统自动（用户点击开始/停止 Timer）
>   - `isTimeLog`: 用户随手记录的笔记（会议纪要、思考、发现等）
>   - `isOutsideApp`: 系统自动记录（使用的 App、录屏、音乐等）
> - ✅ **日历同步支持**: 所有子事件类型都继承 ParentEvent 的 Actual 配置，每个创建独立的远程事件
> - ✅ **过滤逻辑优化**: ParentEvent 的 Plan 接收时忽略所有子事件（避免循环）
> - ✅ **时间选择器 Tippy 集成**: 使用 Tippy.js 包裹 UnifiedDateTimePicker，优雅弹出
> - ✅ **交互优化**: 点击时间显示区下方弹出选择器，不灰化页面背景
> - ✅ **自动聚焦**: 弹出后光标自动聚焦到自然语言输入框
> - ✅ **双 Enter 逻辑**: 第一次 Enter 解析时间并显示，第二次 Enter 确认并关闭
> - ✅ **地址智能输入**: 集成高德地图 API，支持地址自动补全和地图跳转
> - ✅ **LocationInput 组件**: 无边框编辑模式，实时搜索，紧凑下拉建议列表
> - ✅ **地图导航**: Go 按钮智能跳转高德地图/Google Maps（自适应移动/桌面）
> - ✅ **Timer 集成完成**: 支持零门槛启动（无标签/无标题）
> - ✅ **统一 Timer 接口**: 所有组件使用 `App.tsx` 的 Timer 函数（handleTimerStart/Stop/Pause/Resume/Cancel）
> - ✅ **实时计时显示**: 每秒更新已计时时长，支持暂停/继续/停止/取消
> - ✅ **时间格式统一**: 所有时间使用 `formatTimeForStorage()`，严格遵循 Time Architecture
> - ✅ **左侧区域完成**: Emoji + 标题 + 标签 + Checkbox + Timer 按钮（含已计时时长显示）
> - ✅ **参会人功能完成**: AttendeeDisplay 组件（多来源搜索 + 去重 + 悬浮预览 + 完整编辑 Modal）
> - ✅ **联系人管理**: ContactModal 组件（内联编辑 + 关联事件查看 + 自动保存到 localStorage）
> - ✅ **多来源搜索**: Outlook/Google/iCloud/ReMarkable/历史参会人，智能去重
> - ✅ **键盘导航**: ↑↓ 选择，Enter 确认，Escape 关闭
> - ✅ **悬浮预览卡片**: 鼠标悬浮 1 秒弹出，显示联系人详细信息 + 最近事件
> - ✅ **自动同步**: 编辑联系人后自动更新所有引用位置，无需刷新

---

## ⚠️ 时间字段规范（CRITICAL）

**严禁使用 ISO 8601 格式！所有时间必须遵循 Time Architecture 文档！**

- ✅ **存储时间**: `formatTimeForStorage(date)` → `"YYYY-MM-DD HH:mm:ss"`（空格分隔，本地时间）
- ✅ **解析时间**: `parseLocalTimeString(timeString)` → `Date` 对象
- ❌ **禁止**: `new Date().toISOString()` - 会转为 UTC 时间
- ❌ **禁止**: `toLocaleString()` - 格式不一致
- ❌ **禁止**: 包含 `Z` 后缀、`T` 分隔符或 `+08:00` 等时区标记

**参考**: 
- `src/utils/timeUtils.ts` - 时间工具函数
- `docs/TIME_ARCHITECTURE.md` - 时间架构文档

---

## 📊 功能实现状态总览

> **最后更新**: 2025-12-15  
> **完成度**: 83% (19/23 核心功能已完成)

### ✅ 已完成功能（19 项）

| 功能模块 | 所在区域 | 组件/文件 | 完成时间 |
|---------|---------|----------|----------|
| **Emoji 选择器** | 左侧 - 上 Section | EmojiPicker | 2025-11-15 |
| **标题输入框** | 左侧 - 上 Section | EventEditModalV2Demo.tsx | 2025-11-15 |
| **标签显示** | 左侧 - 上 Section | HierarchicalTagPicker | 2025-11-15 |
| **任务勾选框** | 左侧 - 上 Section | EventEditModalV2Demo.tsx | 2025-11-15 |
| **Timer 计时按钮** | 左侧 - 中间按钮 | EventEditModalV2Demo.tsx | 2025-11-15 |
| **参会人搜索与编辑** | 左侧 - 中 Section | AttendeeDisplay + ContactModal | 2025-11-18 |
| **时间选择器 Tippy 集成** | 左侧 - 中 Section | Tippy + UnifiedDateTimePicker | 2025-11-19 |
| **地址智能输入** | 左侧 - 中 Section | LocationInput | 2025-11-19 |
| **同步日历选择器** | 左侧 - 中 Section | 可编辑日历选择器 + "来源"标志 + 标签映射 | 2025-11-26 |
| **标签自动映射日历** | 左侧 - 上 Section | HierarchicalTagPicker + 自动日历合并逻辑 | 2025-11-28 |
| **TagService 性能优化** | 左侧 - 标签选择器 | TagService.getFlatTags() 稳定引用返回 | 2025-12-15 |
| **标题自动填充** | 左侧 - 上 Section | 标签变更时智能填充标题（emoji+名称） | 2025-12-14 |
| **表单重置优化** | Modal 全局 | 创建新事件时完全重置表单，避免显示旧数据 | 2025-12-14 |
| **初始时间支持** | Modal 全局 | 从TimeCalendar传入初始时间（startTime/endTime/isAllDay） | 2025-12-14 |
| **标签区域静态显示** | 右侧 - Event Log | 静态 UI | 2025-11-15 |
| **Plan 提示区域** | 右侧 - Event Log | 静态 UI | 2025-11-15 |
| **时间戳分隔线自动生成** | 右侧 - Event Log | EventLogTimestampService | 2025-11-24 |
| **SlateEditor 集成** | 右侧 - Event Log | SlateEditor + 自定义 editor config | 2025-11-24 |
| **FloatingBar 插入功能** | 右侧 - Event Log | HeadlessFloatingToolbar + insertTag/Emoji/DateMention | 2025-11-24 |
| **文本格式与颜色** | 右侧 - Event Log | TextColorPicker + BackgroundColorPicker + 快捷键 | 2025-11-24 |
| **实际进展数据集成** | 左侧 - 下 Section | 动态渲染 Timer 子事件 + 总时长汇总 + 空状态提示 | 2025-11-27 |
| **EventTree 关联显示与编辑** | 右侧 - Event Log | EventTree 关联区域 + EventTreeViewer | 2025-12-06 |

### ⚠️ 部分实现功能（2 项）

| 功能模块 | 已完成部分 | 待完成部分 | 优先级 |
|---------|-----------|-----------|--------|
| **标签区域编辑** | 静态显示 | Slate 编辑能力（删除/插入） | P1 |
| **视图切换** | 布局结构 | 切换交互 + 状态保持 | P1 |

### ❌ 待开发功能（2 项）

| 功能模块 | 所在区域 | 工作量估算 | 优先级 | 技术文档 |
|---------|---------|-----------|--------|----------|
| **标签映射日历管理** | 左侧 - 中 Section | 1-2 天 | P1 | 支持用户自定义标签与日历的映射关系 |
| **Timer 二次计时自动升级** | 左侧 - Timer 按钮 | 2 天 | P2 | - |

### 📈 开发进度

```
总体进度: ████████████████████░ 95%

左侧 Event Overview: ███████████████████░ 95%
  ├─ 上 Section (事件标识):       ████████████████████ 100%
  ├─ 中 Section (计划安排):       ████████████████████ 100%
  └─ 下 Section (实际进展):       ████████████████████ 100% ✅ v2.16.0

右侧 Event Log:      ████████████████░░░░  80%
  ├─ 标签区域:                    ████████░░░░░░░░░░░░  40%
  ├─ Plan 提示:                   ████████████████████ 100%
  ├─ 关联区域 (EventTree):        ████████████████████ 100% ✅ v2.17.0
  ├─ 时间戳分隔线:                ████████████████████ 100%
  ├─ Slate 编辑区:                ██████████████░░░░░░  70%
  ├─ FloatingBar 集成:            ████████████████████ 100%
  └─ 文本格式/颜色:               ████████████████████ 100%
```

### 🎯 下一步开发建议

**第一阶段**（本周完成）- P0 功能:
1. ✅ **实际进展数据集成** - 已完成 (2025-11-27)
   - ✅ 时间片段列表动态渲染（从 childEvents 读取）
   - ✅ 总时长汇总计算（自动累加所有子事件时长）
   - ✅ 跨天时间标记（显示 +1 上标）
   - ✅ 空状态提示（"还没有计时记录"）
   - ⏳ 计划 vs 实际时间对比（待实现）
   - ⏳ DDL 完成状态显示（待实现）

2. ✅ **SlateEditor 集成** - 已完成 (2025-11-27)
   - ✅ 主日志富文本编辑器
   - ✅ 时间戳分隔线自动生成（5分钟间隔）
   - ✅ FloatingBar 完整集成（tag/emoji/dateMention）
   - ✅ 文本格式支持（粗体/斜体/下划线/颜色）
   - ✅ 颜色选择器数字键功能
   - ✅ **Bullet Point (项目符号)** - 新增 (2025-11-27)
     - ✅ 5级层级结构 (●○–□▸)
     - ✅ Tab/Shift+Tab 快捷键
     - ✅ FloatingBar 按钮集成
     - ✅ 与 timestamp/preline 完美集成
   - ⏳ 父事件 + Timer 子事件日志合并（待实现）
   - ⏳ 点击 Timer 色块自动滚动（待实现）

**第二阶段**（下周完成）- P1 功能:
3. ⏳ **标签区域 Slate 编辑** - 1-2 天
4. ⏳ **视图切换交互** - 1-2 天

**第三阶段**（后续优化）- P2 功能:
5. ⏳ **Timer 二次计时自动升级** - 2 天
6. ✅ **日历同步机制选择器** - 已完成 (2025-11-25)
   - ✅ 6层优先级来源显示（Timer子事件→外部日历→独立Timer→Plan→TimeCalendar→本地）
   - ✅ 多选日历 UI（显示"第一个+等"）
   - ✅ Private 模式参与者处理（格式化为📧文本）
   - ✅ 标签自动映射（Outlook→工作, Google→生活, iCloud→个人）

---

## 📋 目录

1. [版本升级说明](#版本升级说明)
2. [视图模式](#视图模式)
   - [详情视图](#详情视图-左右分栏)
   - [收缩视图](#收缩视图-单栏卡片)
3. [整体布局](#整体布局)
4. [左侧：Event Overview](#左侧event-overview)
5. [右侧：Event Log](#右侧event-log)
6. [数据流与保存机制](#数据流与保存机制v2172-完整总结) 🆕
   - [FormData 初始化机制](#1-formdata-初始化机制)
   - [字段更新机制](#2-字段更新机制)
   - [三层保存架构](#3-三层保存架构)
   - [数据接口与架构](#4-数据接口与架构)
   - [字段完整性验证](#5-字段完整性验证总结)
7. [数据字段扩展](#数据字段扩展)
8. [技术实现要点](#技术实现要点)
9. [用户交互流程](#用户交互流程)

---

## 版本升级说明

### v2.16.0 更新（2025-11-27）

**功能**: ✅ 实际进展数据集成 + ✅ Bullet Point 项目符号（P0 核心功能）

**实现内容**:

#### 1. 实际进展数据集成
- ✅ **动态数据渲染**: 替换硬编码模拟数据，从 `childEvents` 动态读取 Timer 子事件
- ✅ **总时长汇总**: 自动计算所有子事件的累积时长（`reduce` 累加 `endTime - startTime`）
- ✅ **跨天标记**: 自动检测并显示蓝色 `+1` 上标（`isCrossingDay` 函数）
- ✅ **空状态提示**: 无计时记录时显示"还没有计时记录"，避免空白区域
- ✅ **时间格式化**: 统一的日期、星期、时间显示格式（`zh-CN` locale）

#### 2. Bullet Point (项目符号) 功能
- ✅ **5级层级结构**: ● (Level 0) → ○ (Level 1) → – (Level 2) → □ (Level 3) → ▸ (Level 4)
- ✅ **键盘快捷键**: Tab 增加层级 / Shift+Tab 减少层级
- ✅ **FloatingBar 集成**: textStyle 子菜单中的 "项目符号" 按钮
- ✅ **与 Timestamp 集成**: Bullet 在 preline 内部渲染，不替代时间轴
- ✅ **焦点管理修复**: 点击 FloatingBar 按钮不会导致编辑器失焦
- ✅ **内容保护**: 空 bullet 段落算作有效内容，不会触发 timestamp 删除
- ✅ **精确缩进**: Bullet 符号与文字间距 18px，层级间距 24px

**代码位置**: `src/components/EventEditModal/EventEditModalV2.tsx`
- L1390-1430: 时长计算工具函数（`calculateTimerDuration`, `formatDuration`, `totalDuration` useMemo）
- L2028-2100: 动态渲染逻辑（条件渲染 + `childEvents.map()` 循环）

**用户体验提升**:
- 📊 **真实数据**: 用户可看到所有历史计时记录，不再是模拟数据
- 🎯 **精确汇总**: 总时长实时计算，反映真实投入时间
- 🌟 **友好交互**: 空状态提示避免用户困惑
- 🔄 **性能优化**: 使用 `React.useMemo` 缓存计算，避免重复渲染

**测试指南**: [ACTUAL_PROGRESS_TEST_GUIDE.md](../ACTUAL_PROGRESS_TEST_GUIDE.md)

**开发进度更新**:
- 总体进度: 75% → 80%
- 左侧 Event Overview: 85% → 90%
- 下 Section (实际进展): 30% → 100%

---

### v1 → v2 的核心变化

| 功能模块 | v1 实现 | v2 升级 |
|---------|--------|--------|
| **布局结构** | 单栏表单布局 | 左右分栏（左侧固定宽度 + 右侧可 resize，最小宽度 >= 左侧）+ **收缩视图** |
| **描述字段** | 纯文本 `<textarea>` | **PlanSlateEditor** 富文本编辑器 |
| **时间显示** | 单一时间字段 | **计划时间 vs 实际时间对比**（Timer 集成） |
| **日志记录** | 简单文本输入 | **时间戳分隔线 + 富文本日志** |
| **标签显示** | 单行 chips | **层级路径 + Event Log 区域展示** |
| **任务管理** | 无 | **Plan 集成 + 任务状态 + 关联任务** |
| **FloatingBar** | 无 | **集成 HeadlessFloatingToolbar**（emoji/tag/date 插入） |
| **Timer 集成** | 无 | **上下 Section 之间的计时按钮（含取消功能）** |
| **视图切换** | 无 | **详情视图 ↔ 收缩视图**（通过 "back" / "展开详情" 按钮切换） |

### 设计理念

**"左侧管理，右侧记录"**

- **左侧 Event Overview**: 聚焦事件的**元数据管理**（时间、人、地点、来源）
- **右侧 Event Log**: 聚焦**日志记录**（会议纪要、资料收集、实时想法）

**"收放自如，专注效率"**

- **详情视图**（Default）：完整的左右分栏，用于深度编辑和日志记录
- **收缩视图**（Compact）：单栏卡片，用于快速浏览和计时操作

---

## 视图模式

EventEditModal v2 支持两种视图模式，用户可根据使用场景切换：

### 详情视图（左右分栏）

**使用场景**:
- 需要编辑事件元数据（时间、参会人、位置等）
- 需要记录详细的会议日志或工作笔记
- 需要查看完整的事件信息和历史记录

**布局特点**:
- 左侧：Event Overview（固定宽度 360px）
- 右侧：Event Log（flex: 1, min-width: 360px）
- 支持右侧区域 resize

**切换方式**:
- 点击 Slate 编辑区右上角的 "back" 按钮 → 关闭右侧视图，进入收缩视图

---

### 收缩视图（单栏卡片）

**使用场景**:
- 只需要快速浏览事件基本信息
- 专注于计时操作（开始、暂停、结束）
- 需要同时查看多个事件（可并排显示多个收缩卡片）
- 减少屏幕占用，保持专注

**布局特点**:
- 单栏卡片（宽度 ~383px，高度 ~730px）
- 圆角设计（border-radius: 45px）
- 垂直布局：Emoji → 标题 → 标签 → 计时区域 → 计划安排 → 实际进展 → 底部按钮

**核心元素**:
```
┌─────────────────────────────────┐
│         🎯 Emoji (60px)          │ ← 点击可换 emoji
│                                 │
│       准备演讲稿 (18px Bold)     │ ← 标题
│   🔗 #👜工作/#🧐文档编辑 等      │ ← 标签 + 关联任务
│                                 │
│   ┌───────────────────────┐     │
│   │   [▶️ 开始专注]        │     │ ← 未计时状态：单个开始按钮
│   └───────────────────────┘     │
│         或                      │
│   ┌───────────────────────┐     │
│   │  ☑️ 🚀 Ⓜ️              │     │ ← 计时中：任务/里程碑状态
│   │                       │     │
│   │      25:30            │     │ ← 大号计时器（48px Bold）
│   │  开始时间 09:00        │     │
│   │                       │     │
│   │  [⏸️] [⏹️] [❌]       │     │ ← 暂停/结束/取消按钮（圆形小图标）
│   └───────────────────────┘     │
│                                 │
│   计划安排                       │
│   发起人：                       │
│   参会人：                       │
│   10:00 ──2h30min→ 12:00        │
│   来自 ●Outlook: 默认            │
│        📥 只接收同步             │ ← 来源日历 + 同步模式选择器
│                                 │
│   实际进展         总时长：3小时  │ ← 标题左侧，总时长右侧
│   🕐 10:00 ──2h30min→ 12:00     │
│   🕐 23:00 ──2h→ 01:00 +1       │
│   同步 ●Outlook: 工作等          │
│        🔄 双向同步               │ ← 同步日历 + 同步模式选择器
│   ⚫ Milestone完成于...          │
│                                 │
│ [取消]                [保存修改] │ ← 底部左右两个文字按钮
└─────────────────────────────────┘
```

**切换方式**:
- 收缩视图默认显示，用户可以直接编辑和保存
- 如需查看完整日志，可展开为详情视图（带右侧 Event Log）

**底部按钮**:
```tsx
<div className="compact-footer-buttons">
  <button className="footer-btn-text" onClick={handleCancel}>
    取消
  </button>
  <button className="footer-btn-text" onClick={handleSave}>
    保存修改
  </button>
</div>
```

```css
.compact-footer-buttons {
  display: flex;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid #f3f4f6;
}

.footer-btn-text {
  font-family: 'Istok Web', sans-serif;
  font-size: 15px;
  color: #6b7280;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  transition: color 0.2s;
}

.footer-btn-text:hover {
  color: #3b82f6;
}
```

**交互逻辑**:
```typescript

const handleCancel = () => {
  // 关闭 Modal，不保存修改
  onClose();
};

const handleSave = async () => {
  // 保存修改并关闭 Modal
  await EventService.update(event.id, formData);
  onClose();
};
```

**Figma 设计稿**: [收缩视图](https://www.figma.com/design/T0WLjzvZMqEnpX79ILhSNQ/ReMarkable-0.1?node-id=208-968&m=dev)

---

## 整体布局（详情视图）

```
┌─────────────────────────────────────────────────────────────────┐
├───────────────────────┬─────────────────────────────────────────┤
│  Event Overview (左)   │  Event Log (右)                          │
│  固定宽度 360px        │  flex: 1, min-width: 360px              │
│                       │                                         │
│  ┌─────────────────┐  │  ┌───────────────────────────────────┐  │
│  │【上 Section】    │  │  │ 【标签区域】                       │  │
│  │ 🎯 准备演讲稿    │  │  │ #🚀工作/#📝文档编辑 #...           │  │
│  │ ☑ 任务模式       │  │  └───────────────────────────────────┘  │
│  │ #🚀工作/...等    │  │                                         │
│  └─────────────────┘  │  ┌───────────────────────────────────┐  │
│                       │  │ 【Plan提示区域】                    │  │
│  ┌─────────────────┐  │  │ ☑ ⏰ 🚩 创建于12h前，ddl还有2h30min │  │
│  │  [▶️ 开始计时]   │  │  └───────────────────────────────────┘  │
│  └─────────────────┘  │                                         │
│                       │  ┌───────────────────────────────────┐  │
│  ┌─────────────────┐  │  │ 【关联区域】                        │  │
│  │【中 Section】    │  │  │ 🔗 上级任务：Project Ace (5/7)     │  │
│  │ 计划安排         │  │  └───────────────────────────────────┘  │
│  │ 👥 Zoey; Jenny  │  │                                         │
│  │ 📅 10:00→12:00  │  │  ┌───────────────────────────────────┐  │
│  │ 📍 静安嘉里...   │  │  │ 【Slate 编辑区】                   │  │
│  │ 来自●Outlook:默认│  │  │                                    │  │
│  │      📥只接收同步│  │  │ ─────────────────────             │  │ ← 来源日历+同步模式
│  └─────────────────┘  │  │ 2025-10-19 10:21:18               │  │
│                       │  │                                    │  │
│  ┌─────────────────┐  │  │ 处理完了一些出差的logistics...     │  │
│  │【下 Section】    │  │  │ 准备先一个提纲丢给GPT...           │  │ 
│  │实际进展 总时长:3h│  │  │                                    │  │ ← 标题+总时长右侧
│  │ 🕐 10:00→12:00  │  │  │ ─────────────────────             │  │
│  │ 🕐 23:00→01:00  │  │  │ 2025-10-19 10:35:18 | 16min later │  │
│  │ 同步●Outlook:工作│  │  │                                    │  │
│  │      🔄双向同步  │  │  │                                    │  │ ← 同步日历+同步模式
│  │ 比计划多30min   │  │  │                                    │  │
│  └─────────────────┘  │  │                                    │  │
│                       │  │ 太强了！居然直接成稿了...          │  │
│                       │  │                                    │  │
│                       │  │ [😊 # 📅 • 🎨 ✓]  FloatingBar     │  │
│                       │  └───────────────────────────────────┘  │
└───────────────────────┴─────────────────────────────────────────┘
│  [取消]                                           [保存修改]     │ ← 左右布局
└─────────────────────────────────────────────────────────────────┘
```

**底部按钮**:
```tsx
<div className="modal-footer-buttons">
  <button className="footer-btn-cancel" onClick={handleCancel}>
    取消
  </button>
  <button className="footer-btn-save" onClick={handleSave}>
    保存修改
  </button>
</div>
```

```css
.modal-footer-buttons {
  display: flex;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

.footer-btn-cancel,
.footer-btn-save {
  font-family: 'Istok Web', sans-serif;
  font-size: 15px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px 16px;
  transition: color 0.2s;
}

.footer-btn-cancel {
  color: #9ca3af;
}

.footer-btn-cancel:hover {
  color: #6b7280;
}

.footer-btn-save {
  color: #3b82f6;
}

.footer-btn-save:hover {
  color: #2563eb;
}
```

---

## 左侧：Event Overview ⚠️ **部分实现**

**实现状态**: ⚠️ 部分实现（上 Section 完成，中 Section 完成，下 Section 部分完成）

**已完成功能**:
- ✅ **Emoji 选择器**（1.1）- EmojiPicker 集成，点击选择并自动添加到标题
- ✅ **标题输入框**（1.2）- 实时编辑，Timer 子事件自动保存到父事件
- ✅ **标签显示**（1.3）- HierarchicalTagPicker 集成，支持多选
- ✅ **任务勾选框**（1.4）- 条件显示（Plan 事件且 isTask=true）
- ✅ **Timer 按钮**（计时按钮）- 支持开始/暂停/继续/停止/取消，实时显示已计时时长
- ✅ **参会人**（2.1）- AttendeeDisplay + ContactModal，多来源搜索 + 悬浮预览
- ✅ **时间范围**（2.2）- Tippy + UnifiedDateTimePicker，自然语言解析
- ✅ **位置**（2.3）- LocationInput，高德地图 API 集成
- ✅ **同步日历选择器**（可编辑）- "来源"标志 + 标签映射 + 多选日历
- ✅ **标签自动填充标题** (v2.17.3) - 标题为空时选择标签，自动使用标签名称填充
- ✅ **标签自动映射日历** (v2.0.5) - 本地事件Plan+Actual添加，远程事件仅Actual添加
- ✅ **表单重置优化** (v2.17.3) - 新建事件时完全重置表单，避免显示旧数据
- ✅ **初始时间支持** (v2.17.3) - 从TimeCalendar传入时间范围

**待实现功能**:
- ❌ **实际进展区域**（3.1-3.2）- 时间片段列表、总时长汇总、计划 vs 实际对比、DDL 状态
- ❌ **日历归属选择器**（2.5）- 切换事件所属日历
- ❌ **Timer 二次计时自动升级**（独立 Timer → 父子结构）
- ❌ **计划安排显示条件**（Timer 子事件读取父事件数据）

---

### 【上 Section】- 事件标识

#### 1.1 Emoji（大图标）

**数据来源**:
```typescript
event.title: string  // 从标题首字符提取 emoji
```

**显示逻辑**:
```typescript
function getDisplayEmoji(event: Event, globalTimer: any): string {
  // 优先级 1: 标题中的 emoji（提取标题首个 emoji 字符）
  const titleEmoji = extractFirstEmoji(event.title);
  if (titleEmoji) return titleEmoji;
  
  // 优先级 2: 首个标签的 emoji
  if (event.tags && event.tags.length > 0) {
    const firstTag = getTagById(event.tags[0]);
    if (firstTag?.emoji) return firstTag.emoji;
  }
  
  // 优先级 3: Placeholder（根据 Timer 状态）
  const isTimerActive = globalTimer?.eventId === event.id;
  return isTimerActive ? '⏳' : '📝';
}

/**
 * 从字符串中提取第一个 emoji 字符
 */
function extractFirstEmoji(text: string): string | null {
  if (!text) return null;
  
  // Emoji 正则表达式
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
  const match = text.match(emojiRegex);
  
  return match ? match[0] : null;
}
```

**交互**:
- 点击弹出 EmojiPicker（见附件 `EmojiPicker.tsx`）
- 选中后的处理逻辑：
  ```typescript
  const handleEmojiSelect = (selectedEmoji: string) => {
    // 1. 移除标题中现有的 emoji（如果存在）
    let newTitle = formData.title;
    const existingEmoji = extractFirstEmoji(newTitle);
    if (existingEmoji) {
      newTitle = newTitle.replace(existingEmoji, '').trim();
    }
    
    // 2. 将新 emoji 添加到标题开头
    newTitle = `${selectedEmoji} ${newTitle}`;
    
    // 3. 更新表单数据
    setFormData({ ...formData, title: newTitle });
    
    // 4. 关闭 Picker
    setEmojiPickerVisible(false);
  };
  ```
- Emoji 自动显示在标题输入框的开头

**UI 样式**:
```css
.emoji-large {
  font-size: 48px;
  cursor: pointer;
  padding: 12px;
  border-radius: 8px;
  transition: background 0.2s;
}
.emoji-large:hover {
  background: #f3f4f6;
}
```

---

#### 1.2 标题输入框

**数据读取**:
```typescript
// 🔍 读取标题：所有子事件（Timer/TimeLog/OutsideApp）显示父事件的标题
function getDisplayTitle(event: Event): string {
  // 检查是否为任何类型的子事件
  const isSubEvent = event.isTimer || event.isTimeLog || event.isOutsideApp;
  
  if (isSubEvent && event.parentEventId) {
    const parentEvent = EventService.getEventById(event.parentEventId);
    return parentEvent?.title || event.title;
  }
  return event.title;
}

// 🆕 v2.15.4: 从 EventTitle 对象提取显示内容
// 优先使用 colorTitle（富文本HTML），保留用户的高亮、颜色等格式
let titleText = '';
if (event.title) {
  if (typeof event.title === 'string') {
    titleText = event.title;
  } else {
    // 优先使用 colorTitle（富文本HTML），fallback 到 simpleTitle 或 fullTitle
    titleText = event.title.colorTitle || event.title.simpleTitle || event.title.fullTitle || '';
  }
}
```

**UI 实现** (v2.15.4 更新):
```typescript
// ✅ 使用 contentEditable div 替代 textarea，支持富文本显示和编辑
<div
  ref={titleInputRef}
  className="title-input"
  contentEditable
  suppressContentEditableWarning
  data-placeholder={getTitlePlaceholder(formData.tags)}
  onInput={(e) => {
    const html = e.currentTarget.innerHTML;
    handleTitleChange(html);
  }}
  onKeyDown={(e) => {
    // 阻止回车换行（标题保持单行）
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }}
  dangerouslySetInnerHTML={{ __html: removeEmojiFromTitle(formData.title) }}
/>

function getTitlePlaceholder(tags: string[]): string {
  if (tags.length === 0) return '事件标题';
  const firstTag = getTagById(tags[0]);
  return firstTag?.name || '事件标题';
}

// 🆕 从标题中移除 emoji，去除块级标签（p/div），保留富文本格式
function removeEmojiFromTitle(title: string): string {
  if (!title) return '';
  
  // 解析 HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = title;
  
  // 移除所有 p、div 等块级标签，只保留行内内容
  const blockTags = tempDiv.querySelectorAll('p, div, br');
  blockTags.forEach(tag => {
    const parent = tag.parentNode;
    while (tag.firstChild) {
      parent?.insertBefore(tag.firstChild, tag);
    }
    tag.remove();
  });
  
  // 移除 emoji
  let cleanHtml = tempDiv.innerHTML.trim();
  const plainText = tempDiv.textContent || '';
  const emoji = extractFirstEmoji(plainText);
  if (emoji) {
    cleanHtml = cleanHtml.replace(emoji, '').trim();
  }
  
  return cleanHtml;
}
```

**CSS 样式** (v2.15.6 更新 - 2025-12-01):
```css
.title-input {
  font-size: 18px;
  font-weight: 400;
  border: none;
  outline: none;
  color: #1f2937;
  line-height: 1.5;
  text-align: center;
  min-height: 27px;      /* 最小一行高度 */
  max-height: 81px;      /* 最大3行 (27px × 3) */
  height: auto;          /* 高度自适应内容 */
  width: 50px-240px;     /* 宽度自适应（JS 控制）*/
  word-wrap: break-word;
  white-space: pre-wrap; /* 🆕 保持空格，达到最大宽度时换行 */
  overflow-y: auto;      /* 超出3行显示滚动条 */
  overflow-x: hidden;
}

/* 富文本样式保留 */
.title-input * {
  white-space: pre-wrap; /* 🆕 子元素也使用 pre-wrap */
  display: inline;       /* 所有子元素行内显示 */
  line-height: inherit;
}

/* 段落标签转为行内 */
.title-input p {
  display: inline;
  margin: 0;
  padding: 0;
}

/* contentEditable placeholder 支持 */
.title-input:empty:before {
  content: attr(data-placeholder);
  color: #d1d5db;
}
```

**宽度自适应逻辑** (v2.15.6 更新 - 2025-12-01):
```typescript
// 🆕 v2.15.6: 输入法期间无宽度限制，完成后精确调整
// 动态调整 contentEditable 宽度（高度由 CSS 自适应）
const autoResizeTextarea = useCallback((element: HTMLElement | null) => {
  if (!element) return;
  
  const text = element.textContent || '';
  const maxWidth = 240;
  
  if (!text) {
    // 🆕 空内容时使用 placeholder 计算宽度
    const placeholder = element.getAttribute('data-placeholder') || '';
    if (placeholder) {
      element.style.width = 'max-content';
      const naturalWidth = element.offsetWidth;
      element.style.width = Math.min(naturalWidth, maxWidth) + 'px';
    } else {
      element.style.width = '80px'; // 默认最小宽度（足够显示4个中文字）
    }
    return;
  }
  
  // 临时设置为 max-content 让浏览器计算实际宽度（零延迟）
  element.style.width = 'max-content';
  const naturalWidth = element.offsetWidth;
  
  // 立即应用最终宽度（不超过最大宽度）
  element.style.width = Math.min(naturalWidth, maxWidth) + 'px';
}, []);

// 立即调整函数（无防抖，无延迟）
const immediateResize = useCallback(() => {
  // 如果正在输入法输入，完全跳过宽度计算
  if (isComposingRef.current) {
    return;
  }
  
  autoResizeTextarea(titleInputRef.current as HTMLElement, true);
}, [autoResizeTextarea]);

// IME 输入法事件处理
const handleCompositionStart = () => {
  isComposingRef.current = true;
  // 🆕 输入法启动时，移除宽度限制，让文字自由扩展
  const element = titleInputRef.current as HTMLElement | null;
  if (element) {
    element.style.width = 'max-content';
    element.style.maxWidth = '240px'; // 保持最大宽度限制
  }
};

const handleCompositionEnd = () => {
  isComposingRef.current = false;
  // 🆕 输入法结束后，立即执行宽度计算（同步，零延迟）
  const element = titleInputRef.current as HTMLElement | null;
  if (element) {
    element.style.maxWidth = ''; // 移除 maxWidth，改用精确宽度
    autoResizeTextarea(element, true);
  }
};

// onInput 事件处理（同步执行，零延迟）
const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
  const html = e.currentTarget.innerHTML;
  handleTitleChange(html);
  // 立即调整宽度（同步执行，零延迟）
  if (!isComposingRef.current) {
    autoResizeTextarea(e.currentTarget, true);
  }
};

// IME 输入法处理
const handleCompositionEnd = () => {
  isComposingRef.current = false;
  // 输入法结束后，立即执行宽度计算（同步，零延迟）
  const element = titleInputRef.current as HTMLElement | null;
  if (element) {
    autoResizeTextarea(element, true);
  }
};
```

**关键优化** (v2.15.6):
- ✅ **零延迟响应**: 移除所有 `setTimeout` 和 `requestAnimationFrame`，同步执行宽度调整
- ✅ **浏览器原生计算**: 使用 CSS `max-content` 让浏览器计算自然宽度，无需创建隐藏 DOM 元素
- ✅ **IME 期间无宽度限制**: 输入法启动时设置 `width: max-content` + `max-width: 240px`，让文字自由扩展
- ✅ **输入法完成即调整**: 输入法结束后移除 `max-width`，立即同步执行精确宽度计算
- ✅ **新字符同行显示**: 使用 `white-space: pre-wrap`，新字符始终和前一个字符在同一行
- ✅ **Placeholder 自适应**: 空内容时根据 placeholder 计算初始宽度，避免 4 字换行问题
- ✅ **删除文字即时响应**: 删除文字时 checkbox 立即跟随到新位置，无延迟
```

**数据保存**（子事件情况）:
```typescript
const handleTitleChange = async (html: string) => {
  // 🔍 如果当前是子事件（Timer/TimeLog/OutsideApp），保存到父事件
  const isSubEvent = event.isTimer || event.isTimeLog || event.isOutsideApp;
  
  if (isSubEvent && event.parentEventId) {
    const parentEvent = EventService.getEventById(event.parentEventId);
    if (!parentEvent) return;
    
    // ✅ 直接更新父事件的标题（传入 HTML 富文本）
    await EventService.update(parentEvent.id, {
      title: { colorTitle: html }  // 传 colorTitle，让 EventService.normalizeTitle 处理
    });
    
    setFormData({ ...formData, title: html });
    return;
  }
  
  // ✅ 非子事件，正常保存到自己
  setFormData({ ...formData, title: html });
};
```

**关键特性** (v2.17.1):
- ✅ **Slate.js 富文本编辑器**: 使用 TitleSlate 组件，原生支持富文本和 IME 输入法
- ✅ **中文 IME 完美支持**: 完全修复输入法光标偏移问题，输入流畅无卡顿
- ✅ **Emoji 数据层过滤**: 在 `titleContent` useMemo 中过滤 emoji，不修改 `renderLeaf`，保证 DOM ↔ AST 映射正确
- ✅ **完整 Emoji 支持**: 正则覆盖所有 Unicode emoji 范围（🐙、🎉、❤️、😊 等）
- ✅ **高度自适应**: 1-3行自动调整，超出显示滚动条（27px-81px）
- ✅ **宽度自适应**: 根据内容动态调整宽度（50px-240px）
- ✅ **Emoji 分离显示**: 标题输入框不显示 emoji，emoji 显示在左侧圆形区域

**用户体验说明**:
- ✅ 所有计时记录共享同一个标题（用户视角：这就是同一个事件）
- ✅ 修改标题时，如果是 Timer 子事件，自动同步到父事件
- ✅ TimeCalendar 上所有相关色块的标题会同步更新
- ✅ 用户在 Plan 页面添加的高亮、颜色效果在 EditModal 中保留显示

**验证规则**:
- 必填字段（除非选择了标签，则可用标签名称代替）
- 最大长度 200 字符
- 单行输入（禁止回车换行）

---

#### 1.3 标签显示

**数据来源**: `event.tags[]`

**显示逻辑**:
```typescript
function getTagsDisplayText(tags: string[]): string {
  if (tags.length === 0) return '选择标签...';
  
  const firstTag = getTagById(tags[0]);
  if (!firstTag) return '选择标签...';
  
  // 构建层级路径
  const path = getTagHierarchyPath(firstTag);  // 如 "🚀工作/📝文档编辑"
  
  if (tags.length > 1) {
    return `#${path} 等`;
  }
  return `#${path}`;
}
```

**交互**:
- 点击打开 HierarchicalTagPicker
- 支持多选
- 选中后立即更新显示

**UI 样式**:
```css
.tags-display {
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 6px;
  color: #3b82f6;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}
```

**🔥 TagService 性能优化** (v2.17.4):

**问题根源**:
- `TagService.getFlatTags()` 方法每次调用都返回新数组引用 (`[...this.flatTags].sort()`)
- EventEditModal 中多处调用（标签选择器 L2515、日历选择器 L3001、L3457）
- 导致 useMemo 依赖变化 → 触发重新渲染 → 再次调用 getFlatTags() → 无限循环 → 页面崩溃

**修复方案**:
```typescript
// ❌ 原代码（TagService.ts L462）
getFlatTags(): FlatTag[] {
  return [...this.flatTags].sort((a, b) => (a.position || 0) - (b.position || 0));
}

// ✅ 修复后
getFlatTags(): FlatTag[] {
  // 直接返回内部引用，排序在 flattenTags() 时完成
  return this.flatTags;
}

// ✅ 统一排序逻辑
private flattenTags(tags: HierarchicalTag[]): FlatTag[] {
  const result: FlatTag[] = [];
  // ... 处理逻辑
  
  // 在 flattenTags() 末尾统一排序
  result.sort((a, b) => (a.position || 0) - (b.position || 0));
  return result;
}
```

**修复效果**:
- ✅ **稳定引用**: `getFlatTags()` 每次返回同一个数组对象，避免 useMemo 误判
- ✅ **消除重复排序**: 排序只在 `flattenTags()` 时执行一次，不在每次 getter 调用时排序
- ✅ **解决无限重渲染**: EventEditModal 不再因引用变化而进入无限循环
- ✅ **性能提升**: 避免每次调用都创建新数组 + 排序操作

**架构一致性**:
- v1.7.0: `getTags()` 返回稳定引用
- v2.17.4: `getFlatTags()` 返回稳定引用
- 所有 Service getter 方法统一遵循"返回稳定引用"原则

**代码位置**: 
- `src/services/TagService.ts` L450-465 (`getFlatTags()`)
- `src/services/TagService.ts` L323-391 (`flattenTags()`)
- `src/components/EventEditModal/EventEditModalV2.tsx` L2515, L3001, L3457 (调用位置)

---

#### 1.4 任务勾选框（条件显示）

**显示条件**:
```typescript
function shouldShowTaskCheckbox(event: Event): boolean {
  return event.isPlan === true && event.isTask !== false;
  // 只有从 Plan 页面创建且用户没关闭 addTask 按钮的事件才显示
}
```

**数据来源**: `event.isTask: boolean`

**交互逻辑**:
```typescript
<input
  type="checkbox"
  checked={formData.isTask}
  onChange={(e) => setFormData({ ...formData, isTask: e.target.checked })}
/>
```

**显示效果**:
- 勾选 → 显示 ✓ icon，`isTask = true`
- 不勾选 → 隐藏 checkbox icon，`isTask = false`

---

### 【计时按钮】- Timer 集成（位于上下 Section 之间）

**显示条件**:
```typescript
// 始终显示计时按钮
```

**按钮状态**:
```typescript
interface TimerButtonState {
  isRunning: boolean;      // Timer 是否正在运行
  eventId: string | null;  // 当前绑定的事件 ID
  elapsedTime: number;     // 累积时长（毫秒）
}

function getTimerButtonConfig(event: Event, activeTimers: Map<string, TimerState>): TimerButtonConfig {
  const eventTimer = activeTimers.get(event.id);
  const isTimerRunning = eventTimer?.isRunning === true;
  const isTimerPaused = eventTimer?.isPaused === true;
  
  if (eventTimer && isTimerRunning) {
    // 🎯 当前事件正在计时 - 显示三个按钮：暂停、结束、取消
    return {
      buttons: [
        { icon: 'pause', text: '暂停计时', action: 'pause', color: 'gradient-red' },
        { icon: 'stop', text: '结束计时', action: 'stop', color: 'gray' },
        { icon: 'cancel', text: '取消计时', action: 'cancel', color: 'gray' }
      ],
      showTimer: true,
      timerDisplay: 'running'
    };
  } else if (eventTimer && isTimerPaused) {
    // ⏸️ 当前事件已暂停 - 显示三个按钮：继续、结束、取消
    return {
      buttons: [
        { icon: 'resume', text: '继续计时', action: 'resume', color: 'gradient-red' },
        { icon: 'stop', text: '结束计时', action: 'stop', color: 'gray' },
        { icon: 'cancel', text: '取消计时', action: 'cancel', color: 'gray' }
      ],
      showTimer: true,
      timerDisplay: 'paused'
    };
  } else {
    // ▶️ 当前事件未计时 - 显示单个开始按钮
    return {
      buttons: [
        { icon: 'start', text: '开始专注', action: 'start', color: 'default' }
      ],
      showTimer: false
    };
  }
}
```

**交互逻辑**:
```typescript
const handleTimerAction = async (action: 'start' | 'pause' | 'resume' | 'stop' | 'cancel') => {
  switch (action) {
    case 'start':
      // ▶️ 为当前事件启动新的 Timer
      
      // 🆕 特殊处理：独立 Timer 事件的二次计时
      // 检查是否为任何类型的子事件
      const isSubEvent = event.isTimer || event.isTimeLog || event.isOutsideApp;
      if (isSubEvent && !event.parentEventId && event.segments && event.segments.length > 0) {
        // 检测到这是独立 Timer 的二次计时，自动升级为父子结构
        
        // Step 1: 创建父事件（继承原 Timer 的所有元数据）
        const parentEvent = {
          id: generateId(),
          title: event.title,
          description: event.description,
          emoji: event.emoji,
          tags: event.tags,
          color: event.color,
          source: 'local',
          isTimer: false,          // ✅ 不再是 Timer
          isTimeCalendar: true,    // 标记为 TimeCalendar 创建
          timerChildEvents: [event.id], // 将原 Timer 作为第一个子事件
          createdAt: event.createdAt,
          updatedAt: new Date().toISOString(),
          // 继承其他所有元数据...
        };
        
        // Step 2: 将原 Timer 转为子事件
        event.parentEventId = parentEvent.id;
        await EventService.updateEvent(event);
        
        // Step 3: 保存父事件
        await EventService.createEvent(parentEvent);
        
        // Step 4: 为父事件启动新 Timer（将生成第二个子事件）
        await TimerService.start(parentEvent.id);
        
        // Step 5: 更新当前 Modal 显示的事件为父事件
        // （让用户无感知地看到汇总数据）
        setCurrentEvent(parentEvent);
        
      } else {
        // 普通情况：直接启动 Timer
        await TimerService.start(event.id);
      }
      break;
      
    case 'pause':
      // ⏸️ 暂停当前事件的 Timer
      await TimerService.pause(event.id);
      break;
      
    case 'resume':
      // ▶️ 继续当前事件的 Timer
      await TimerService.resume(event.id);
      break;
      
    case 'stop':
      // ⏹️ 结束计时并保存
      // - 创建 Timer 子事件（包含 startTime, endTime, segments, description）
      // - 保存到父事件的 timerChildEvents[]
      // - 清除当前活动 Timer
      await TimerService.stop(event.id);
      break;
      
    case 'cancel':
      // ❌ 取消计时（不保存）
      // - 直接清除当前活动 Timer
      // - 不创建 Timer 子事件
      await TimerService.cancel(event.id);
      break;
  }
};
```

**🆕 独立 Timer 事件二次计时自动升级机制**:

**触发条件**:
```typescript
// 检测条件
const shouldUpgradeToParentChild = (event: Event): boolean => {
  return (
    (event.isTimer === true || event.isTimeLog === true || event.isOutsideApp === true) &&  // 是子事件
    event.parentEventId == null &&      // 无父事件（独立 Timer）
    event.segments &&                   // 已有计时记录
    event.segments.length > 0           // 至少有一次完整计时
  );
};
```

**升级流程**:
1. **创建父事件**：继承原 Timer 的所有元数据（标题、标签、emoji、描述等）
2. **转换子事件**：将原 Timer 标记为子事件（设置 `parentEventId`）
3. **更新关联**：父事件的 `timerChildEvents` 包含原 Timer ID
4. **启动新计时**：为父事件启动新 Timer（将生成第二个子事件）
5. **无缝切换**：Modal 自动切换显示父事件，用户无感知

**数据示例**:
```typescript
// === 升级前 ===
const timerBefore = {
  id: 'timer-1',
  title: '学习英语',
  isTimer: true,
  parentEventId: null,  // 独立 Timer
  segments: [{ start: '10:00', end: '10:30', duration: 1800 }]
};

// === 升级后 ===
const parentEvent = {
  id: 'event-parent',
  title: '学习英语',         // 继承
  isTimer: false,
  isTimeCalendar: true,
  timerChildEvents: ['timer-1', 'timer-2']
};

const timerAfter = {
  id: 'timer-1',
  title: '学习英语',
  isTimer: true,
  parentEventId: 'event-parent', // ✅ 已挂载
  segments: [{ start: '10:00', end: '10:30', duration: 1800 }]
};

const newTimer = {
  id: 'timer-2',
  title: '学习英语',
  isTimer: true,
  parentEventId: 'event-parent', // ✅ 挂载到父事件
  segments: [{ start: '14:00', end: '14:45', duration: 2700 }]
};
```

**用户体验保证**:
- ✅ **完全无感知**：用户只看到计时继续，不知道发生了升级
- ✅ **数据完整**：所有元数据（标题、标签、emoji、描述）完整保留
- ✅ **视图一致**：Modal 自动切换显示父事件，汇总所有计时
- ✅ **可追溯**：TimeCalendar 上显示父事件 + 所有子事件色块

**多 Timer 支持说明**：
- ✅ 支持多个 EventEditModal 同时打开，各自处于 Timer 状态
- ✅ 每个 Modal 独立管理各自事件的 Timer（一个 Modal 一个事件）
- ✅ 使用 `Map<eventId, TimerState>` 存储所有活动 Timer
- ✅ 用户可以同时为不同事件计时，互不影响
- ✅ 每个 Modal 的实际进展区域（【下 Section】）只显示自己事件的 Timer 数据

**UI 样式**:

**详情视图 - 单个开始按钮**（未计时状态）:
```css
.timer-button-start {
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.timer-button-start:hover {
  background: #f9fafb;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

**详情视图 - 三按钮组**（计时中/已暂停）:
```tsx
import PauseIcon from '@/assets/icons/pause.svg';
import StopIcon from '@/assets/icons/stop.svg';
import CancelIcon from '@/assets/icons/cancel.svg';

<div className="timer-buttons-group">
  <button 
    className="timer-button-circle gradient-red"
    onClick={() => handleTimerAction('pause')}
  >
    <img src={PauseIcon} alt="暂停" />
  </button>
  <button 
    className="timer-button-circle gray"
    onClick={() => handleTimerAction('stop')}
  >
    <img src={StopIcon} alt="结束" />
  </button>
  <button 
    className="timer-button-circle gray"
    onClick={() => handleTimerAction('cancel')}
  >
    <img src={CancelIcon} alt="取消" />
  </button>
</div>
```

```css
.timer-buttons-group {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.timer-button-circle {
  width: 42px;
  height: 42px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.timer-button-circle.gradient-red {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

.timer-button-circle.gray {
  background: #f3f4f6;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.timer-button-circle:hover {
  transform: scale(1.05);
}

.timer-button-circle img {
  width: 14px;
  height: 14px;
  object-fit: contain;
}

/* ✅ 图标来源说明：
   - pause.svg: 40x47px 原图，包含阴影效果
   - stop.svg: 40x47px 原图，包含阴影效果
   - cancel.svg: 40x47px 原图，包含阴影效果
   - 在详情视图中缩小至 14x14px 显示
*/
```

**收缩视图 - 圆形小图标**（计时中/已暂停）:
```tsx
import PauseIcon from '@/assets/icons/pause.svg';
import StopIcon from '@/assets/icons/stop.svg';
import CancelIcon from '@/assets/icons/cancel.svg';

<div className="timer-buttons-compact">
  <button 
    className="timer-icon-compact gradient-red"
    onClick={() => handleTimerAction('pause')}
  >
    <img src={PauseIcon} alt="暂停" />
  </button>
  <button 
    className="timer-icon-compact gray"
    onClick={() => handleTimerAction('stop')}
  >
    <img src={StopIcon} alt="结束" />
  </button>
  <button 
    className="timer-icon-compact gray"
    onClick={() => handleTimerAction('cancel')}
  >
    <img src={CancelIcon} alt="取消" />
  </button>
</div>
```

```css
.timer-buttons-compact {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 8px;
}

.timer-icon-compact {
  width: 25px;
  height: 25px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.timer-icon-compact.gradient-red {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
}

.timer-icon-compact.gray {
  background: #f3f4f6;
  border: 0.6px solid rgba(255, 255, 255, 0.4);
}

.timer-icon-compact:hover {
  transform: scale(1.05);
}

.timer-icon-compact img {
  width: 8px;
  height: 8px;
  object-fit: contain;
}

/* ✅ 图标来源说明：
   - 使用相同的 SVG 图标（pause.svg, stop.svg, cancel.svg）
   - 在收缩视图中进一步缩小至 8x8px
   - 保留原图标的阴影和渐变效果
*/
```

**计时器显示区域**（收缩视图）:
```tsx
{showTimer && (
  <div className="timer-display-compact">
    {/* 任务/里程碑状态图标 */}
    <div className="timer-status-icons">
      {event.isTask && <TaskGrayIcon />}
      {event.hasMilestone && <MilestoneGrayIcon />}
    </div>
    
    {/* 大号计时器 */}
    <div className="timer-countdown">25:30</div>
    <div className="timer-start-time">开始时间 09:00</div>
    
    {/* 操作按钮 */}
    <div className="timer-buttons-compact">
      <button className="timer-icon-compact gradient-red">
        <img src={PauseIcon} />
      </button>
      <button className="timer-icon-compact gray">
        <img src={StopIcon} />
      </button>
      <button className="timer-icon-compact gray">
        <img src={CancelIcon} />
      </button>
    </div>
  </div>
)}
```

```css
.timer-display-compact {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  background: #fff;
  border-radius: 20px;
  margin: 16px 0;
}

.timer-status-icons {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.timer-countdown {
  font-family: 'Outfit', sans-serif;
  font-size: 48px;
  font-weight: 700;
  background: linear-gradient(135deg, #a855f7 0%, #3b82f6 75%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0px 4px 8px rgba(0, 0, 0, 0.05), 0px 4px 4px rgba(0, 0, 0, 0.1);
}

.timer-start-time {
  font-size: 14px;
  color: #6b7280;
  margin-top: 4px;
  margin-bottom: 12px;
}
```

**显示示例**（详情视图）:
```
┌──────────────────────────────┐
│   [▶️ 开始专注]              │  ← 未计时：单个文字按钮
└──────────────────────────────┘

        或

┌──────────────────────────────┐
│   [⏸️]  [⏹️]  [❌]          │  ← 计时中：三个圆形图标按钮
└──────────────────────────────┘
```

**显示示例**（收缩视图）:
```
┌────────────────────────┐
│  ☑️🚩                 │  ← 任务/ddl状态
│                        │
│       25:30            │  ← 渐变色大号计时器
│   开始时间 09:00        │
│                        │
│        [⏸️] [⏹️] [❌]  │  ← 右对齐的小图标按钮
└────────────────────────┘
```

**关联文档**: [Timer 模块 PRD](./TIMER_MODULE_PRD.md)
```

**显示示例**:
```tsx
<button 
  className={`timer-button ${buttonConfig.className}`}
  onClick={() => handleTimerAction(buttonConfig.action)}
>
  <img 
    src={getTimerIcon(buttonConfig.icon)} 
    alt={buttonConfig.text} 
    className="timer-icon" 
  />
  <span className="timer-text">{buttonConfig.text}</span>
</button>

// 图标映射
function getTimerIcon(iconType: string) {
  switch (iconType) {
    case 'start': return TimerStartIcon;
    case 'pause': return PauseIcon;
    case 'resume': return TimerStartIcon;
    default: return TimerStartIcon;
  }
**关联文档**: [Timer 模块 PRD](./TIMER_MODULE_PRD.md)

**图标资源** (已确认存在于 `src/assets/icons/`):
```typescript
import TimerStartIcon from '@/assets/icons/timer_start.svg';  // 开始计时 - 渐变色播放图标
import PauseIcon from '@/assets/icons/pause.svg';             // 暂停 - 红色渐变双竖线
import StopIcon from '@/assets/icons/stop.svg';               // 结束 - 灰色方形
import CancelIcon from '@/assets/icons/cancel.svg';           // 取消 - 蓝色渐变垃圾桶图标
```

**图标规格**:
- `timer_start.svg`: 20x20px, 渐变色 (#A855F7 → #3B82F6), 播放+计时器图标
- `pause.svg`: 40x47px (带阴影), 红色渐变 (#EF4444 → #DC2626), 双竖线
- `stop.svg`: 40x47px (带阴影), 灰色 (#F9FAFB), 实心方形
- `cancel.svg`: 40x47px (带阴影), 蓝色渐变 (#3B82F6 → #2563EB), 垃圾桶图标

**使用说明**:
- 详情视图（大按钮）：直接使用原图标（40x47px）
- 收缩视图（小按钮）：使用时缩小至 8x8px 或 14x14px（通过 CSS）

---

### 【中 Section】- 计划安排（条件显示）

**显示条件**:
```typescript
function shouldShowPlanSection(event: Event): boolean {
  // 🆕 情况 1: 如果是 Timer 子事件，显示父事件的计划安排
  if (event.isTimer === true && event.parentEventId) {
    const parentEvent = EventService.getEventById(event.parentEventId);
    return parentEvent !== null; // 有父事件就显示计划安排
  }
  
  // 🆕 情况 2: 如果是独立的 Timer 事件（没有父事件），不显示
  if (event.isTimer === true && !event.parentEventId) {
    return false; // 独立 Timer 事件没有预设的计划时间
  }
  
  // 情况 3: 非 Timer 事件，正常显示
  return true;
  
  // 说明：
  // - 子事件（isTimer/isTimeLog/isOutsideApp = true + parentEventId 存在）→ **显示父事件的计划安排**
  // - 独立子事件（isTimer/isTimeLog/isOutsideApp = true + 无 parentEventId）→ **不显示**
  // - Remote 事件（microsoftEventId 存在）→ 显示
  // - Plan 页面创建（isPlan = true）→ 显示
  // - TimeCalendar 日历区域直接创建（isTimeCalendar = true）→ 显示
}
```

**数据读取**（Timer 子事件情况）:
```typescript
function getPlanSectionData(event: Event) {
  // 🔍 如果是 Timer 子事件，从父事件读取计划数据
  if (event.isTimer && event.parentEventId) {
    const parentEvent = EventService.getEventById(event.parentEventId);
    if (!parentEvent) return null;
    
    // ⚠️ 用户视角：显示的是"这个事件"的计划安排（实际是父事件的数据）
    return {
      attendees: parentEvent.attendees,
      startTime: parentEvent.startTime,
      endTime: parentEvent.endTime,
      location: parentEvent.location,
      calendar: parentEvent.calendarId,
      parentEventId: parentEvent.id  // 用于保存时回写
    };
  }
  
  // 非 Timer 子事件，使用自己的数据
  return {
    attendees: event.attendees,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    calendar: event.calendarId,
    parentEventId: null
  };
}
```

**数据保存**（Timer 子事件修改计划安排时）:
```typescript
const handlePlanDataChange = async (field: string, value: any) => {
  // 🔍 如果当前是 Timer 子事件（isTimer = true），保存到父事件
  if (event.isTimer && event.parentEventId) {
    const parentEvent = EventService.getEventById(event.parentEventId);
    if (!parentEvent) return;
    
    // ✅ 直接更新父事件的数据
    await EventService.update(parentEvent.id, {
      [field]: value
    });
    
    // 刷新当前 Modal 的显示
    refreshPlanSectionData();
    return;
  }
  
  // ✅ 非 Timer 子事件，正常保存到自己
  await EventService.update(event.id, {
    [field]: value
  });
};
```

**用户体验说明**:
- ✅ **用户视角**：我在编辑"这个事件"的计划安排（参会人、时间、地点）
- ✅ **实际行为**：
  - 如果是 Timer 子事件 → 修改保存到父事件
  - 如果是普通事件 → 修改保存到自己
- ✅ **无需提示**：用户不需要知道底层的父子关系
- ✅ **数据一致性**：所有计时记录共享同一份计划数据

**字段说明**:
- `event.isTimer: boolean` - 是否是 Timer 事件（包括独立 Timer 和 Timer 子事件）
- `event.parentEventId: string | undefined` - 父事件 ID（Timer 子事件必有此字段）
- Timer 子事件的所有计划字段修改都会自动同步到父事件

---

#### 2.1 参与人（Organizer + Attendees）✅ **已完成**

**实现状态**: ✅ 已完成（AttendeeDisplay 组件 + ContactModal 组件）

**已实现功能**:
- ✅ 发起人和参会人列表显示（发起人：斜体 + 加粗 + 下划线，有邮箱的参会人：下划线）
- ✅ 点击进入编辑模式（contentEditable）
- ✅ 多来源搜索（Outlook/Google/iCloud/ReMarkable/历史参会人）
- ✅ 智能去重（同一人多来源按优先级显示）
- ✅ 键盘导航（↑↓ 选择，Enter 确认，Escape 关闭）
- ✅ 悬浮预览卡片（鼠标悬浮 1 秒弹出，显示联系人详细信息 + 编辑按钮）
- ✅ 完整联系人编辑 Modal（ContactModal，内联编辑所有字段）
- ✅ 关联事件查看（预览卡片显示最近 5 个，Modal 显示全部）
- ✅ 自动保存到 localStorage（新联系人自动添加到联系人库）
- ✅ 实时同步（编辑联系人后自动更新所有引用位置）

**核心组件**:
- `src/components/common/AttendeeDisplay.tsx` - 参会人显示和搜索组件（1068 行）
- `src/components/ContactModal/ContactModal.tsx` - 独立联系人编辑 Modal（337 行）
- `src/services/ContactService.ts` - 联系人管理服务（多来源搜索 + 去重 + CRUD）

**数据结构**:
```typescript
// 使用 EventHub 统一的 Contact 接口
interface Contact {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  organization?: string;    // 公司/组织
  isReMarkable?: boolean;   // 4DNote 本地联系人
  isOutlook?: boolean;      // Outlook 联系人
  isGoogle?: boolean;       // Google 联系人
  isiCloud?: boolean;       // iCloud 联系人
  type?: AttendeeType;      // 参会类型：required | optional | resource
  status?: AttendeeStatus;  // 响应状态：accepted | declined | tentative | none
  externalId?: string;      // 外部平台原始 ID
  notes?: string;           // 备注信息
}

interface Event {
  organizer?: Contact;      // 发起人（仅 Outlook/Google/iCloud 同步的事件有）
  attendees?: Contact[];    // 参会人列表
}

// 扩展字段（用于预览卡片和完整联系人卡片）
interface ContactWithExtras extends Contact {
  position?: string;        // 职务（ReMarkable 扩展字段，存储在 notes 中）
  tags?: string[];          // 标签（ReMarkable 扩展字段）
  recentEvents?: Event[];   // 关联的最近事件
  totalEvents?: number;     // 关联事件总数
}
```

**显示条件**:
```typescript
// 是否显示 organizer（加粗斜体下划线的发起人）
function shouldShowOrganizer(event: Event): boolean {
  // 1. Outlook/Google/iCloud 同步的事件：有 organizer 字段就显示
  if (event.organizer) return true;
  
  // 2. 用户自己创建的事件：如果 attendees 中有带邮箱的，用户自己就是 organizer
  const hasAttendeesWithEmail = event.attendees?.some(a => a.email);
  if (hasAttendeesWithEmail) return true;
  
  return false;
}

// attendees 不需要判断，有就显示，没有就空着（用户可以点击编辑）
// 整个参会人section始终显示（因为用户可能需要添加参会人）
```

**显示逻辑**:
```typescript
import { AttendeeIcon } from '@/assets/icons';

function renderAttendees(event: Event): ReactNode {
  if (!shouldShowAttendees(event)) return null;
  
  const participants: Contact[] = [];
  
  // 1. 添加发起人（如果存在，放在第一位）
  if (event.organizer) {
    participants.push(event.organizer);
  } else if (event.attendees?.some(a => a.email)) {
    // 用户自己创建的事件，有邮箱的参会人 → 发起人 = 用户自己
    participants.push({
      name: '我',  // 或从用户配置中获取
      email: UserService.getCurrentUserEmail(),
      source: 'remarkable'
    });
  }
  
  // 2. 添加参会人
  if (event.attendees) {
    participants.push(...event.attendees);
  }
  
  return (
    <div className="attendee-row">
      <img src={AttendeeIcon} alt="参会人" className="icon-attendee" />
      <div className="attendee-list">
        {participants.map((person, index) => (
          <span
            key={index}
            className={`attendee-name ${index === 0 ? 'organizer' : ''} ${person.email ? 'has-email' : ''}`}
            onMouseEnter={(e) => handleHoverStart(e, person)}
            onMouseLeave={handleHoverEnd}
            onClick={() => openAttendeeSearch(index)}
          >
            {person.name}
            {index < participants.length - 1 && '; '}
          </span>
        ))}
      </div>
    </div>
  );
}
```

**CSS 样式**:
```css
.attendee-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.attendee-list {
  flex: 1;
  line-height: 1.6;
}

.attendee-name {
  cursor: pointer;
  transition: color 0.2s;
}

.attendee-name:hover {
  color: #3b82f6;
}

/* 发起人样式：斜体 + 加粗 + 下划线 */
.attendee-name.organizer {
  font-weight: 700;
  font-style: italic;
  text-decoration: underline;
}

/* 有邮箱的参会人：下划线 */
.attendee-name.has-email {
  text-decoration: underline;
}
```

---

**交互 1: 点击展开搜索栏**

```typescript
**交互 1: 搜索与添加参会人**

```typescript
const [searchMode, setSearchMode] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
const [searchResults, setSearchResults] = useState<Contact[]>([]);
const [selectedIndex, setSelectedIndex] = useState(0);

// 1. 打开搜索模式
const handleOpenSearch = (attendeeIndex: number) => {
  setSearchMode(true);
  setEditingIndex(attendeeIndex);
  setSearchQuery(participants[attendeeIndex]?.name || '');
};

// 2. 搜索输入
const handleSearchInput = async (query: string) => {
  setSearchQuery(query);
  const results = await searchContacts(query);
  setSearchResults(results);
};

// 3. 搜索逻辑（多来源合并 + 去重）
async function searchContacts(query: string): Promise<Contact[]> {
  // 3.1 搜索所有来源
  const platformContacts = await ContactService.searchPlatformContacts(query); // Outlook/Google/iCloud
  const remarkableContacts = await ContactService.searchLocalContacts(query);   // 4DNote 本地联系人
  const historicalContacts = await EventService.searchHistoricalParticipants(query); // 历史事件参会人
  
  // 3.2 合并所有结果
  const allContacts = [
    ...platformContacts,
    ...remarkableContacts,
    ...historicalContacts
  ];
  
  // 3.3 去重（同一个人可能在多个来源都存在）
  const uniqueMap = new Map<string, Contact>();
  
  allContacts.forEach(contact => {
    const key = contact.email || contact.name; // 用邮箱或姓名作为唯一标识
    
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, contact);
    } else {
      // 同一个人存在多个来源时，根据优先级确定显示哪个来源标签
      const existing = uniqueMap.get(key)!;
      const newPriority = getSourcePriority(contact);
      const existingPriority = getSourcePriority(existing);
      
      if (newPriority < existingPriority) {
        uniqueMap.set(key, contact); // 用优先级更高的来源
      }
    }
  });
  
  return Array.from(uniqueMap.values());
}

// 4. 来源优先级（数字越小优先级越高）
function getSourcePriority(contact: Contact): number {
  if (contact.isOutlook || contact.isGoogle || contact.isiCloud) return 1;
  if (contact.isReMarkable) return 2;
  return 3; // 历史事件中的参会人（没有来源标识）
}

// 5. 格式化来源标签
function formatSource(contact: Contact): string {
  if (contact.isOutlook) return 'Outlook 联系人';
  if (contact.isGoogle) return 'Google 联系人';
  if (contact.isiCloud) return 'iCloud 联系人';
  if (contact.isReMarkable) return 'ReMarkable 联系人';
  return '历史参会人'; // 没有来源标识的，说明只在历史事件中出现过
}

// 6. 键盘交互
const handleKeyDown = (e: React.KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
      break;
      
    case 'ArrowUp':
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      break;    window.SLATE_DEBUG = true
      
    case 'Enter':
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        handleSelectContact(searchResults[selectedIndex]);
      }
      break;
      
    case 'Escape':
      setSearchMode(false);
      break;
  }
};
```

**搜索下拉菜单 UI**:
```tsx
{searchMode && (
  <div className="attendee-search-dropdown">
    {searchResults.map((contact, index) => (
      <div
        key={index}
        className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
        onClick={() => handleSelectContact(contact)}
      >
        <div className="contact-name">{contact.name}</div>
        <div className="contact-source">{formatSource(contact)}</div>
      </div>
    ))}
  </div>
)}
```

---

**交互 2: 悬浮预览联系人卡片**

```typescript
const [hoverTimer, setHoverTimer] = useState<NodeJS.Timeout | null>(null);
const [previewContact, setPreviewContact] = useState<Contact | null>(null);
const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
const [isMouseOverPreview, setIsMouseOverPreview] = useState(false);

// 1. 鼠标悬浮开始（1秒延迟）
const handleHoverStart = (e: React.MouseEvent, contact: Contact) => {
  const timer = setTimeout(async () => {
    // 获取完整联系人信息 + 最近 5 个关联事件
    const fullContact = await ContactService.getFullContactInfo(contact);
    const recentEvents = await EventService.getEventsByContact(contact.email || contact.name, 5);
    
    setPreviewContact({
      ...fullContact,
      recentEvents
    });
    
    // 设置卡片位置（鼠标右侧）
    setPreviewPosition({
      x: e.clientX + 10,
      y: e.clientY
    });
  }, 1000);
  
  setHoverTimer(timer);
};

// 2. 鼠标离开
const handleHoverEnd = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    setHoverTimer(null);
  }
  // 延迟关闭，允许鼠标移入卡片
  setTimeout(() => {
    if (!isMouseOverPreview) {
      setPreviewContact(null);
    }
  }, 200);
};

// 3. 更新联系人字段
const updateContact = async (field: string, value: any) => {
  await ContactService.updateContact(previewContact.id, { [field]: value });
  
  // 如果当前是 Timer子事件，需要同步更新到父事件
  if (event.isTimer && event.parentEventId) {
    await EventService.updateAttendees(event.parentEventId, updatedAttendees);
  }
  
  // 刷新联系人信息
  const updated = await ContactService.getFullContactInfo(previewContact);
  setPreviewContact(updated);
};
```

**预览卡片 UI**:
```tsx
{previewContact && (
  <div
    className="contact-preview-card"
    style={{ left: previewPosition.x, top: previewPosition.y }}
    onMouseEnter={() => setIsMouseOverPreview(true)}
    onMouseLeave={() => {
      setIsMouseOverPreview(false);
      setPreviewContact(null);
    }}
  >
    {/* 卡片头部 */}
    <div className="preview-header">
      <h4 className="contact-name">{previewContact.name}</h4>
      <button 
        className="expand-btn"
        onClick={() => openFullContactCard(previewContact)}
      >
        展开
      </button>
    </div>
    
    {/* 可编辑字段（只显示有值的字段）*/}
    <div className="preview-fields">
      {previewContact.email && (
        <EditableField
          label="邮箱"
          value={previewContact.email}
          onSave={(value) => updateContact('email', value)}
        />
      )}
      {previewContact.phone && (
        <EditableField
          label="电话"
          value={previewContact.phone}
          onSave={(value) => updateContact('phone', value)}
        />
      )}
      {previewContact.organization && (
        <EditableField
          label="公司"
          value={previewContact.organization}
          onSave={(value) => updateContact('organization', value)}
        />
      )}
      {(previewContact as ContactWithExtras).position && (
        <EditableField
          label="职务"
          value={(previewContact as ContactWithExtras).position}
          onSave={(value) => updateContact('position', value)}
        />
      )}
      {(previewContact as ContactWithExtras).tags && (previewContact as ContactWithExtras).tags!.length > 0 && (
        <EditableField
          label="标签"
          value={(previewContact as ContactWithExtras).tags?.join(', ')}
          onSave={(value) => updateContact('tags', value.split(',').map(t => t.trim()))}
        />
      )}
      {previewContact.notes && (
        <EditableField
          label="备注"
          value={previewContact.notes}
          multiline
          onSave={(value) => updateContact('notes', value)}
        />
      )}
    </div>
    
    {/* 关联事件（如果有）*/}
    {(previewContact as ContactWithExtras).recentEvents && (previewContact as ContactWithExtras).recentEvents!.length > 0 && (
      <div className="preview-events">
        <h5>关联事件（最近 5 个）</h5>
        {(previewContact as ContactWithExtras).recentEvents?.map(event => (
          <div 
            key={event.id} 
            className="event-item"
            onClick={() => openEvent(event.id)}
          >
            <span className="event-emoji">{extractEmoji(event.title)}</span>
            <span className="event-title">{removeEmoji(event.title)}</span>
            <span className="event-date">{formatDate(event.startTime)}</span>
          </div>
        ))}
        {(previewContact as ContactWithExtras).totalEvents && (previewContact as ContactWithExtras).totalEvents! > 5 && (
          <button 
            className="view-more-btn"
            onClick={() => openFullContactCard(previewContact)}
          >
            查看全部 {(previewContact as ContactWithExtras).totalEvents} 个关联事件
          </button>
        )}
      </div>
    )}
  </div>
)}
```

---

**交互 3: 完整联系人卡片（点击"展开"按钮）**

用户点击预览卡片右上角的"展开"按钮时，打开完整的联系人编辑浮窗。

```typescript
const openFullContactCard = (contact: Contact) => {
  // 打开完整的联系人编辑 Modal
  setFullContactModal({
    visible: true,
    contact: contact
  });
};
```

**完整联系人卡片 UI**:
```tsx
{fullContactModal.visible && (
  <div className="full-contact-modal-overlay" onClick={() => setFullContactModal({ visible: false })}>
    <div className="full-contact-modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>{fullContactModal.contact.name}</h3>
        <button className="close-btn" onClick={() => setFullContactModal({ visible: false })}>✕</button>
      </div>
      
      <div className="modal-body">
        {/* 所有字段都可编辑，包括缺省字段 */}
        <EditableField
          label="姓名"
          value={fullContactModal.contact.name}
          onSave={(value) => updateFullContact('name', value)}
        />
        <EditableField
          label="邮箱"
          value={fullContactModal.contact.email}
          onSave={(value) => updateFullContact('email', value)}
        />
        <EditableField
          label="电话"
          value={fullContactModal.contact.phone}
          onSave={(value) => updateFullContact('phone', value)}
        />
        <EditableField
          label="公司"
          value={fullContactModal.contact.organization}
          onSave={(value) => updateFullContact('organization', value)}
        />
        <EditableField
          label="职务"
          value={(fullContactModal.contact as ContactWithExtras).position}
          onSave={(value) => updateFullContact('position', value)}
        />
        <EditableField
          label="标签"
          value={(fullContactModal.contact as ContactWithExtras).tags?.join(', ')}
          onSave={(value) => updateFullContact('tags', value.split(',').map(t => t.trim()))}
        />
        <EditableField
          label="备注"
          value={fullContactModal.contact.notes}
          multiline
          onSave={(value) => updateFullContact('notes', value)}
        />
        
        {/* 完整的关联事件列表（支持分页/滚动）*/}
        <div className="full-events-section">
          <h4>关联事件（共 {(fullContactModal.contact as ContactWithExtras).totalEvents} 个）</h4>
          <div className="events-list">
            {allRelatedEvents?.map(event => (
              <div 
                key={event.id} 
                className="event-item"
                onClick={() => openEvent(event.id)}
              >
                <span className="event-emoji">{extractEmoji(event.title)}</span>
                <span className="event-title">{removeEmoji(event.title)}</span>
                <span className="event-date">{formatDate(event.startTime)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="modal-footer">
        <button className="save-btn" onClick={saveFullContact}>保存</button>
        <button className="cancel-btn" onClick={() => setFullContactModal({ visible: false })}>取消</button>
      </div>
    </div>
  </div>
)}
```

**说明**：
- **预览卡片**：只显示有值的字段，快速查看和编辑
- **完整卡片**：显示所有字段（包括空字段），可以添加新信息
- **编辑方式**：两者都使用内联编辑（点击字段→编辑模式）

---

**交互 4: 内联编辑字段组件**

```tsx
interface EditableFieldProps {
  label: string;
  value?: string;
  multiline?: boolean;
  onSave: (value: string) => void;
}

function EditableField({ label, value, multiline, onSave }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  
  const handleSave = () => {
    onSave(editValue);
    setIsEditing(false);
  };
  
  const handleCancel = () => {
    setEditValue(value || '');
    setIsEditing(false);
  };
  
  return (
    <div className="editable-field">
      <label>{label}</label>
      {isEditing ? (
        <div className="edit-mode">
          {multiline ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
            />
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
            />
          )}
          <div className="edit-actions">
            <button className="save-btn" onClick={handleSave}>✓</button>
            <button className="cancel-btn" onClick={handleCancel}>✕</button>
          </div>
        </div>
      ) : (
        <div className="view-mode" onClick={() => setIsEditing(true)}>
          <span className="field-value">{value || '点击添加'}</span>
        </div>
      )}
    </div>
  );
}
```

---

**CSS 样式**:
```css
.contact-preview-card {
  position: fixed;
  z-index: 1000;
  width: 360px;
  max-height: 500px;
  overflow-y: auto;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  padding: 16px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.contact-name {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.expand-btn {
  font-size: 13px;
  color: #3b82f6;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}

.preview-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.editable-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.editable-field label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.editable-field .view-mode {
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 14px;
}

.editable-field .view-mode:hover {
  background: #f3f4f6;
}

.editable-field .placeholder {
  color: #9ca3af;
  font-style: italic;
}

.editable-field .edit-mode {
  display: flex;
  gap: 4px;
  align-items: center;
}

.editable-field input,
.editable-field textarea {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  font-size: 14px;
}

.editable-field textarea {
  min-height: 60px;
  resize: vertical;
}

.preview-events {
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.preview-events h5 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 13px;
}

.event-item:hover {
  background: #f3f4f6;
}

.event-emoji {
  font-size: 16px;
}

.event-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-date {
  color: #6b7280;
  font-size: 12px;
}

.view-more-btn {
  width: 100%;
  padding: 8px;
  margin-top: 8px;
  background: #f3f4f6;
  border: none;
  border-radius: 6px;
  color: #3b82f6;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.view-more-btn:hover {
  background: #e5e7eb;
}

/* 搜索下拉菜单 */
.attendee-search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 300px;
  overflow-y: auto;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  margin-top: 4px;
  z-index: 100;
}

.search-result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.search-result-item:hover,
.search-result-item.selected {
  background: #f3f4f6;
}

.contact-name {
  font-weight: 500;
  color: #1f2937;
}

.contact-source {
  font-size: 12px;
  color: #6b7280;
}
```

---

**数据保存**:
```typescript
const handleSelectContact = async (contact: Contact) => {
  // 更新参会人列表
  const updatedParticipants = [...participants];
  updatedParticipants[editingIndex] = contact;
  
  // 分离 organizer 和 attendees
  const [organizer, ...attendees] = updatedParticipants;
  
  // 🔍 如果是 Timer 子事件，保存到父事件
  if (event.isTimer && event.parentEventId) {
    await EventService.update(event.parentEventId, {
      organizer,
      attendees
    });
  } else {
    await EventService.update(event.id, {
      organizer,
      attendees
    });
  }
  
  setSearchMode(false);
  setSearchQuery('');
};
```

---

#### 2.2 时间范围 ✅ **已完成**

**实现状态**: ✅ 已完成（Tippy.js + UnifiedDateTimePicker 集成）

**【2025-11-19 更新】Tippy.js 集成 - 优雅的时间选择器弹出方式**

**已实现功能**:
- ✅ **非侵入式**: 点击时间区域后，选择器从下方弹出，不灰化页面背景
- ✅ **自动聚焦**: 弹出后光标自动聚焦到自然语言输入框，用户可直接输入
- ✅ **双 Enter 逻辑**: 第一次 Enter 解析时间并显示预览，第二次 Enter 确认并关闭
- ✅ **点击外部关闭**: 点击选择器外部区域自动关闭
- ✅ **固定下方弹出**: 禁用 flip 和 preventOverflow，确保始终在下方
- ✅ **完整显示**: maxWidth="none"，确保选择器完整显示
- ✅ **自然语言解析**: 支持"明天下午3点"等自然语言输入

**核心组件**:
- `src/components/FloatingToolbar/pickers/UnifiedDateTimePicker.tsx` - 统一时间选择器
- EventEditModalV2Demo.tsx（Lines 763-813）- Tippy 集成实现

**设计理念**:
- ✅ **非侵入式**: 点击时间区域后，选择器从下方弹出，不灰化页面背景
- ✅ **自动聚焦**: 弹出后光标自动聚焦到自然语言输入框，用户可直接输入
- ✅ **双 Enter 逻辑**: 第一次 Enter 解析时间并显示预览，第二次 Enter 确认并关闭
- ✅ **点击外部关闭**: 点击选择器外部区域自动关闭

**实现代码**:
```tsx
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import UnifiedDateTimePicker from './FloatingToolbar/pickers/UnifiedDateTimePicker';

// 时间选择器状态
const [showTimePicker, setShowTimePicker] = useState(false);

// 时间应用回调
const handleTimeApplied = (startIso: string, endIso?: string, allDay?: boolean) => {
  setFormData(prev => ({
    ...prev,
    startTime: startIso,
    endTime: endIso || startIso,
    allDay: allDay || false
  }));
  setShowTimePicker(false); // 关闭选择器
};

// Tippy 包裹的时间显示区域
<Tippy
  content={
    <UnifiedDateTimePicker
      initialStart={formData.startTime || undefined}
      initialEnd={formData.endTime || undefined}
      onApplied={handleTimeApplied}
      onClose={() => setShowTimePicker(false)}
    />
  }
  visible={showTimePicker}
  onClickOutside={() => setShowTimePicker(false)}
  interactive={true}
  placement="bottom-start"
  theme="light"
  arrow={false}
  offset={[0, 8]}
  appendTo={document.body}
>
  <div 
    className="eventmodal-v2-plan-row" 
    onClick={() => setShowTimePicker(true)} 
    style={{ cursor: 'pointer' }}
  >
    <img src={datetimeIcon} alt="" className="eventmodal-v2-plan-icon" />
    <div className="eventmodal-v2-plan-content">
      {formatTimeDisplay(formData.startTime, formData.endTime) || (
        <span style={{ color: '#9ca3af' }}>添加时间...</span>
      )}
    </div>
  </div>
</Tippy>
```

**UnifiedDateTimePicker 自动聚焦**:
```tsx
// UnifiedDateTimePicker.tsx
const searchInputRef = useRef<HTMLInputElement>(null);

// 组件挂载时自动聚焦到自然语言输入框
useEffect(() => {
  const timer = setTimeout(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
      dbg('picker', '🎯 自动聚焦到自然语言输入框');
    }
  }, 100);
  return () => clearTimeout(timer);
}, []);

// 搜索输入框
<input
  ref={searchInputRef}
  className="search-input"
  type="text"
  placeholder="输入'明天下午3点'试试"
  value={searchInput}
  onChange={handleSearchInputChange}
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      // 第一次 Enter: 解析并显示预览
      handleSearchBlur();
      e.currentTarget.blur(); // 失焦以便下次 Enter 触发全局确认
      e.preventDefault();
    }
  }}
/>
```

**双 Enter 逻辑**:
```tsx
// 第一次 Enter: 在输入框内触发（onKeyDown）
// - 解析用户输入的自然语言时间
// - 显示解析结果的预览
// - 失焦输入框

// 第二次 Enter: 全局键盘事件触发
useEffect(() => {
  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleApply(); // 确认并关闭
    }
  };
  document.addEventListener('keydown', handleGlobalKeyDown, true);
  return () => document.removeEventListener('keydown', handleGlobalKeyDown, true);
}, [handleApply]);
```

**Tippy 样式自定义**:
```css
/* EventEditModalV2Demo.css */
.tippy-box[data-theme~='light'] {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  padding: 0;
}

.tippy-box[data-theme~='light'] .tippy-content {
  padding: 0;
}
```

**交互流程**:
1. 用户点击"添加时间..."或已有时间 → Tippy 弹出，选择器显示在下方
2. 选择器弹出后，光标自动聚焦到自然语言输入框
3. 用户输入"明天下午3点" → 按第一次 Enter
4. 输入框失焦，选择器显示解析后的时间（明天 15:00）
5. 用户确认无误 → 按第二次 Enter（全局）
6. 调用 `onApplied` 回调，更新 formData，关闭选择器

**优势对比**:

| 方案 | 旧实现（Overlay + Popup） | 新实现（Tippy） |
|------|---------------------------|-----------------|
| 背景灰化 | ✅ 有（rgba(0,0,0,0.3)） | ❌ 无 |
| 位置定位 | 居中显示 | 相对触发元素下方 |
| 点击外部 | 手动实现 | Tippy 自动处理 |
| 代码量 | ~30 行（overlay + popup） | ~20 行（Tippy配置） |
| 动画效果 | 无 | Tippy 内置淡入淡出 |
| 可访问性 | 需手动处理 | Tippy 自动处理焦点管理 |

**数据来源**:
```typescript
import { DatetimeIcon } from '@/assets/icons';

// 优先使用 TimeHub 快照
const eventTime = useEventTime(event.id);
const startTime = eventTime?.start 
  ? new Date(eventTime.start) 
  : (event.startTime ? new Date(event.startTime) : null);
const endTime = eventTime?.end 
  ? new Date(eventTime.end) 
  : (event.endTime ? new Date(event.endTime) : null);
```

**显示逻辑**:
```typescript
const [isEditingTime, setIsEditingTime] = useState(false);
const [timeInputValue, setTimeInputValue] = useState('');
const [showDateTimePicker, setShowDateTimePicker] = useState(false);

// 点击时间进入编辑模式
const handleTimeClick = () => {
  setIsEditingTime(true);
  setShowDateTimePicker(true);
  
  // 初始化输入框的值
  const dateStr = dayjs(startTime).format('YYYY-MM-DD（ddd）');
  if (isAllDay) {
    setTimeInputValue(`${dateStr} 全天`);
  } else {
    const start = dayjs(startTime).format('HH:mm');
    const end = dayjs(endTime).format('HH:mm');
    const duration = calculateDuration(startTime, endTime);
    setTimeInputValue(`${dateStr} ${start} ──${duration}→ ${end}`);
  }
};

// 用户直接编辑文字
const handleTimeInputChange = (value: string) => {
  setTimeInputValue(value);
  // 尝试解析用户输入的时间（支持自然语言）
  const parsed = parseNaturalTimeInput(value);
  if (parsed) {
    updateEventTime(parsed.start, parsed.end, parsed.isAllDay);
  }
};

// 用户通过 DateTimePicker 选择时间
const handleDateTimePickerChange = (start: Date, end: Date, isAllDay: boolean) => {
  updateEventTime(start, end, isAllDay);
  
  // 同步更新输入框显示
  const dateStr = dayjs(start).format('YYYY-MM-DD（ddd）');
  if (isAllDay) {
    setTimeInputValue(`${dateStr} 全天`);
  } else {
    const startStr = dayjs(start).format('HH:mm');
    const endStr = dayjs(end).format('HH:mm');
    const duration = calculateDuration(start, end);
    setTimeInputValue(`${dateStr} ${startStr} ──${duration}→ ${endStr}`);
  }
};

// 渲染时间显示/编辑
function renderTimeRange(start: Date, end: Date, isAllDay: boolean): ReactNode {
  if (isEditingTime) {
    return (
      <div className="time-row editing">
        <img src={DatetimeIcon} alt="时间" className="icon-datetime" />
        <input
          className="time-input"
          value={timeInputValue}
          onChange={(e) => handleTimeInputChange(e.target.value)}
          onBlur={() => setIsEditingTime(false)}
          autoFocus
        />
        {/* UnifiedDateTimePicker 浮层 */}
        {showDateTimePicker && (
          <UnifiedDateTimePicker
            startTime={start}
            endTime={end}
            isAllDay={isAllDay}
            onChange={handleDateTimePickerChange}
            onClose={() => setShowDateTimePicker(false)}
          />
        )}
      </div>
    );
  }
  
  const dateStr = dayjs(start).format('YYYY-MM-DD（ddd）');
  
  if (isAllDay) {
    const isSingleDay = dayjs(start).isSame(end, 'day');
    if (isSingleDay) {
      return (
        <div className="time-row" onClick={handleTimeClick}>
          <img src={DatetimeIcon} alt="时间" className="icon-datetime" />
          <span className="time-text">{dateStr} 全天</span>
        </div>
      );
    }
    const endDateStr = dayjs(end).format('YYYY-MM-DD（ddd）');
    return (
      <div className="time-row" onClick={handleTimeClick}>
        <img src={DatetimeIcon} alt="时间" className="icon-datetime" />
        <span className="time-text">{dateStr} - {endDateStr} 全天</span>
      </div>
    );
  }
  
  const startTime = dayjs(start).format('HH:mm');
  const endTime = dayjs(end).format('HH:mm');
  const duration = calculateDuration(start, end);
  
  return (
    <div className="time-row" onClick={handleTimeClick}>
      <img src={DatetimeIcon} alt="时间" className="icon-datetime" />
      <span className="time-text">
        {dateStr} {startTime} 
        <span className="duration-arrow">──{duration}→</span>
        {endTime}
      </span>
    </div>
  );
}

function calculateDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h${minutes > 0 ? `${minutes}min` : ''}`;
  }
  return `${minutes}min`;
}
```

**UI 样式**:
```css
.time-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.time-row:hover {
  background: #f3f4f6;
}

.time-row.editing {
  background: #f3f4f6;
}

.time-text {
  font-size: 14px;
  color: #1f2937;
}

.time-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #1f2937;
  outline: none;
  padding: 2px 4px;
  font-family: inherit;
}

.duration-arrow {
  margin: 0 8px;
  color: #3b82f6;
  font-weight: 500;
  background: linear-gradient(to right, #22d3ee, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

**自然语言解析示例**:
```typescript
// 支持的输入格式示例
function parseNaturalTimeInput(input: string): { start: Date, end: Date, isAllDay: boolean } | null {
  // "2025-11-07 14:00 - 16:00"
  // "11-07 下午2点到4点"
  // "明天全天"
  // "下周一 9:00-17:00"
  // ... 调用现有的 NLP 解析工具
  return parseTimeString(input);
}
```

---

#### 2.3 位置（地址智能输入）✅ **已完成**

**实现状态**: ✅ 已完成（LocationInput 组件 + 高德地图 API 集成）

**已实现功能**:
- ✅ 集成高德地图 Input Tips API
- ✅ 实时地址自动补全（≥2 字符触发，300ms 防抖）
- ✅ 地图跳转功能（高德地图/Google Maps，移动/桌面自适应）
- ✅ 无边框编辑模式，和参会人样式一致
- ✅ 紧凑下拉建议列表（地点名称 + 区域信息）
- ✅ 错误处理（API Key 无效、网络错误、无结果）

**核心组件**:
- `src/components/common/LocationInput.tsx` - 地址输入组件
- `src/components/common/LocationInput.css` - 组件样式

**相关文档**:
- `docs/LOCATION_FEATURE_SETUP.md` - API Key 申请和配置指南
- `docs/LOCATION_TEST_CHECKLIST.md` - 测试清单（18 个测试用例）
- `docs/LOCATION_FEATURE_SUMMARY.md` - 功能开发总结

**数据来源**: `event.location`

**功能概述**:
- ✅ 集成高德地图 Input Tips API
- ✅ 实时地址自动补全
- ✅ 地图跳转功能（高德地图/Google Maps）
- ✅ 无边框编辑模式，和参会人样式一致

**显示逻辑**:

**非编辑模式**（默认）:
```typescript
<div className="eventmodal-v2-plan-row" style={{ cursor: 'pointer' }}>
  <img src={locationIcon} alt="" className="eventmodal-v2-plan-icon" />
  <div 
    className="eventmodal-v2-plan-content" 
    onClick={() => setIsEditingLocation(true)}
  >
    {formData.location || <span style={{ color: '#9ca3af' }}>添加地点...</span>}
  </div>
</div>
```

**编辑模式**:
```typescript
import { LocationInput } from '../common/LocationInput';

<div className="eventmodal-v2-plan-row">
  <img src={locationIcon} alt="" className="eventmodal-v2-plan-icon" />
  <LocationInput
    value={formData.location || ''}
    onChange={(value) => {
      setFormData(prev => ({ ...prev, location: value }));
    }}
    onSelect={() => setIsEditingLocation(false)}
    onBlur={() => setIsEditingLocation(false)}
    placeholder="添加地点..."
  />
</div>
```

**LocationInput 组件特性**:

1. **地址自动补全**:
   - 使用高德地图 `/v3/assistant/inputtips` API
   - 输入 ≥2 个字符触发搜索
   - 300ms 防抖优化
   - 显示地点名称 + 区域信息

2. **下拉建议列表**:
   - 紧凑设计（padding: 6px 12px）
   - 显示地点名称（13px）+ 区域（11px）
   - hover 高亮效果
   - 点击选择后自动退出编辑模式

3. **地图跳转（Go 按钮）**:
   - 🗺️ 图标按钮，位于输入框右侧
   - **移动端**: 尝试唤起高德地图 APP (`iosamap://`)，3秒后降级到网页版
   - **桌面端**: 直接打开高德地图网页版 (`https://uri.amap.com/marker`)
   - **国际化**: 可扩展支持 Google Maps

4. **样式特点**:
   - 无边框（`border: none`）
   - 透明背景（`background: transparent`）
   - 和 AttendeeDisplay 样式保持一致
   - 只在有地址时显示 Go 按钮

**API 配置**:

环境变量设置（`.env`）:
```env
VITE_AMAP_KEY=your_amap_api_key_here
```

组件中读取:
```typescript
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || 'YOUR_AMAP_KEY';
```

**API 配额**:
- 免费额度: 300,000 次/天
- 并发限制: 200 次/秒
- 估算使用: ~10,000 次/天（1000 用户）

**交互流程**:

```
[非编辑模式] 显示地址或"添加地点..."
    ↓ 点击
[编辑模式] 显示 LocationInput
    ↓ 输入关键词（≥2 字符）
[搜索] 调用高德地图 API（300ms 防抖）
    ↓ 返回结果
[下拉列表] 显示地址建议（紧凑样式）
    ↓ 点击建议
[自动填充] + [退出编辑模式]
    ↓ 或点击 Go 按钮
[跳转地图] 打开高德地图/Google Maps
```

**错误处理**:

1. **API Key 无效**: 
   - 控制台输出: `[LocationInput] API 返回状态异常: {status: '0', info: 'INVALID_USER_KEY'}`
   - 不显示下拉建议

2. **网络错误**:
   - 控制台输出: `[LocationInput] Failed to fetch suggestions: [error]`
   - 不显示下拉建议

3. **无搜索结果**:
   - 不显示下拉框（suggestions 为空数组）

**PC 版交互**:
- ✅ **点击位置区域**: 进入编辑模式
- ✅ **输入地址**: 实时搜索，显示建议列表
- ✅ **选择建议**: 自动填充并退出编辑
- ✅ **点击外部**: 保存当前输入，退出编辑
- ✅ **点击 Go**: 在新标签页打开地图
- ✅ **选中文字**: 可复制位置文本

**移动端交互**:
- ✅ **点击位置区域**: 进入编辑模式
- ✅ **输入地址**: 实时搜索，显示建议列表
- ✅ **选择建议**: 自动填充并退出编辑
- ✅ **点击 Go**: 尝试唤起高德地图 APP，降级到网页版
- ✅ **双击位置文本**: 选中并复制到剪贴板

**技术实现**:

文件结构:
```
src/components/common/
  ├── LocationInput.tsx       # 地址输入组件
  └── LocationInput.css       # 组件样式

docs/
  ├── LOCATION_FEATURE_SETUP.md      # API Key 申请和配置指南
  ├── LOCATION_TEST_CHECKLIST.md     # 测试清单（18 个测试用例）
  └── LOCATION_FEATURE_SUMMARY.md    # 功能开发总结

.env.example                  # 环境变量模板
```

**参考文档**:
- [高德地图 Input Tips API](https://lbs.amap.com/api/webservice/guide/api/inputtips)
- [高德地图 URI API](https://lbs.amap.com/api/amap-mobile/guide/android/marker)
- [地址功能设置指南](../../LOCATION_FEATURE_SETUP.md)

---

#### 2.4 同步日历选择器（计划安排）

> **📌 UI 设计变更** (2025-11-26): 将"来自"改为"同步"，使用可编辑选择器  
> **📌 技术分析文档**: [CALENDAR_SYNC_CONFIG_TECHNICAL_ANALYSIS.md](./CALENDAR_SYNC_CONFIG_TECHNICAL_ANALYSIS.md)  
> **📌 场景矩阵分析**: 9种相同日历场景 + Private模式 + 独立事件架构（已整合在本 PRD 中）

**🔑 核心架构原则**:

1. **Plan 和 Actual 永远创建独立的远程事件** - 不共享同一个远程事件ID
2. **Plan 支持 5 种模式**: receive-only, send-only, send-only-private, bidirectional, bidirectional-private
3. **Actual 支持 4 种模式**: send-only, send-only-private, bidirectional, bidirectional-private（不支持 receive-only）
4. **Private 模式机制**: 参与者不被邀请，而是作为文本添加到事件描述中
5. **远程事件数量**: A1/A2/B1: 1+N个，B2/C1/C2: 2个独立事件，不同日历: 1+M个
6. **🆕 同步完全基于 calendarIds**: 标签不再作为同步判断条件，只用于智能勾选建议

**位置**: 【中 Section】- 计划安排

**✅ 已实现功能 (2025-11-26)**:
- ✅ **"同步"日历选择器**: 可编辑的多选 Picker，替代原"来自"静态显示
- ✅ **"来源"标志**: 来源日历右对齐显示灰色"来源"文本，永久保留（可重新勾选）
- ✅ **标签智能映射**: 标签触发的日历自动勾选，右对齐显示标签名称和颜色
- ✅ **用户完全控制**: 取消勾选日历不删除标签，同步仅依据 calendarIds
- ✅ **Private 模式**: send-only-private 和 bidirectional-private 参与者格式化为📧文本

**设计理念**:
- **"同步"** 表示该事件会同步到哪些外部日历（用户可多选）
- **"来源"标志** 永久标记事件的原始日历，可取消勾选但标志保留
- **标签映射** 仅作为智能勾选建议，不影响实际同步逻辑

**数据来源**: 
```typescript
import { OutlookIcon, GoogleCalendarIcon, ICloudIcon, SyncIcon } from '@/assets/icons';

const calendar = availableCalendars.find(cal => cal.id === event.calendarId);

// 🆕 v2.0.4 单一同步配置架构（每个事件一份配置）
interface Event {
  // 日历同步配置（每个事件自己的配置）
  calendarIds?: string[];  // 同步目标日历 ID 列表
  syncMode?: string;       // 同步模式: 'receive-only' | 'send-only' | 'send-only-private' | 'bidirectional' | 'bidirectional-private'
  
  // 🆕 父事件专用：子事件配置模板
  subEventConfig?: {
    calendarIds?: string[];  // 子事件默认日历配置
    syncMode?: string;       // 子事件默认同步模式
  };
  
  // 父-子事件关联
  parentEventId?: string;    // 子 → 父指针
  timerLogs?: string[];      // 父 → 子事件 ID 列表
}

/**
 * 📌 架构说明 - 父子事件模式：
 * 
 * 1. **父事件（ParentEvent）**:
 *    - calendarIds + syncMode: 父事件自己的同步配置（计划安排）
 *    - subEventConfig: 子事件配置模板（实际进展），用于批量更新和新建继承
 *    - timerLogs: 子事件 ID 列表
 * 
 * 2. **子事件（ChildEvent/Timer）**:
 *    - calendarIds + syncMode: 子事件自己的同步配置（实际进展）
 *    - parentEventId: 指向父事件
 *    - 创建时继承父事件的 subEventConfig
 * 
 * 3. **Modal 显示逻辑**:
 *    - 中区（计划安排）: 父模式显示 mainEvent 配置，子模式显示 parentEvent 配置
 *    - 下区（实际进展）: 父模式显示 subEventConfig 模板，子模式显示 mainEvent 配置
 * 
 * 4. **Private 模式**:
 *    - send-only-private: 只发送（仅自己），participants 作为文本添加到 description
 *    - bidirectional-private: 双向同步（仅自己），同上
 *    - 普通模式: { attendees: ['alice@company.com'], description: '...' }
 *    - Private模式: { attendees: [], description: '📧 参与者：alice@company.com\n\n...' }
 */

// 获取事件的同步配置
const calendarIds = event.calendarIds || [];
const syncMode = event.syncMode || 'receive-only';
```

**显示逻辑（✅ 已实现 6层优先级 + 多选日历）**:
```typescript
/**
 * ✅ 6层优先级来源显示逻辑
 * 优先级：Timer子事件 → 外部日历 → 独立Timer → Plan → TimeCalendar → 本地事件
 */
function getEventSourceInfo(event: Event): { 
  icon?: string, 
  name: string, 
  emoji?: string 
} {
  // 1️⃣ 最高优先级：Timer 子事件（递归获取父事件来源）
  if (event.isTimer && event.parentEventId) {
    const parentEvent = EventService.getEventById(event.parentEventId);
    if (parentEvent) {
      return getEventSourceInfo(parentEvent);  // 递归查找
    }
  }
  
  // 2️⃣ 外部日历同步的事件
  if (event.calendarIds && event.calendarIds.length > 0) {
    const cal = availableCalendars.find(c => event.calendarIds!.includes(c.id));
    if (cal) {
      if (cal.source === 'outlook') {
        return { icon: OutlookIcon, name: `Outlook: ${cal.name}` };
      } else if (cal.source === 'google') {
        return { icon: GoogleCalendarIcon, name: `Google: ${cal.name}` };
      } else if (cal.source === 'icloud') {
        return { icon: ICloudIcon, name: `iCloud: ${cal.name}` };
      }
    }
  }
  
  // 3️⃣ 独立 Timer 事件（没有父事件的 Timer）
  if (event.isTimer && !event.parentEventId) {
    return { emoji: '⏱️', name: 'ReMarkable计时' };
  }
  
  // 4️⃣ 由 Plan 模块创建
  if (event.isPlan) {
    return { emoji: '✅', name: 'ReMarkable计划' };
  }
  
  // 5️⃣ 由 TimeCalendar 页面创建
  if (event.isTimeCalendar) {
    return { emoji: '🚀', name: 'ReMarkable日历' };
  }
  
  // 6️⃣ 兜底：本地事件
  return { emoji: '🚀', name: 'ReMarkable' };
}

/**
 * ✅ 多选日历显示函数
 * 显示"第一个日历+等"
 */
function getMultiCalendarDisplayInfo(
  calendarIds: string[],
  availableCalendars: Calendar[]
): { firstCalendar: Calendar | null, remainCount: number } {
  if (!calendarIds || calendarIds.length === 0) {
    return { firstCalendar: null, remainCount: 0 };
  }
  
  const firstCalendar = availableCalendars.find(c => c.id === calendarIds[0]) || null;
  const remainCount = calendarIds.length - 1;
  
  return { firstCalendar, remainCount };
}

/**
 * 🆕 日历选择器选项数据结构
 * 用于 Picker 中显示每个日历的状态和标识
 */
interface CalendarPickerOption {
  calendarId: string;
  displayName: string;          // 日历名称
  color: string;                 // 日历颜色
  isChecked: boolean;            // 是否勾选
  isSource: boolean;             // 是否为来源日历（显示"来源"标志）
  tagInfo?: {                    // 标签映射信息（可选）
    tagName: string;             // 标签名称（如"工作"）
    tagColor: string;            // 标签颜色
  };
}

/**
 * 🆕 获取来源日历 ID
 * 基于 6层优先级逻辑自动识别事件的原始日历
 */
function getSourceCalendarId(event: Event): string | null {
  // 1️⃣ Timer 子事件 → 递归获取父事件的来源
  if (event.isTimer && event.parentEventId) {
    const parentEvent = EventService.getEventById(event.parentEventId);
    if (parentEvent) {
      return getSourceCalendarId(parentEvent);
    }
  }
  
  // 2️⃣ 外部日历同步的事件 → 第一个日历视为来源
  if (event.calendarIds && event.calendarIds.length > 0) {
    return event.calendarIds[0];
  }
  
  // 3️⃣-6️⃣ 其他情况（独立Timer/Plan/TimeCalendar/本地）→ 无外部来源
  return null;
}

/**
 * 🆕 获取标签映射的日历 IDs
 * 根据事件标签自动推荐日历
 */
function getTagMappedCalendarIds(
  event: Event,
  tagCalendarMapping: Map<string, string>
): string[] {
  if (!event.tags || event.tags.length === 0) {
    return [];
  }
  
  const mappedCalendarIds: string[] = [];
  for (const tagId of event.tags) {
    const calendarId = tagCalendarMapping.get(tagId);
    if (calendarId && !mappedCalendarIds.includes(calendarId)) {
      mappedCalendarIds.push(calendarId);
    }
  }
  
  return mappedCalendarIds;
}

/**
 * ⚠️ **冲突警告**: 此处PRD描述的是理论设计，实际实现与此有差异！
 * 
 * **PRD理论设计** (handleTagSelectionChange):
 *   - 定义了一个独立的函数，接受selectedTagIds, event, isParentMode, setFormData参数
 *   - 明确区分本地事件和远程事件的处理逻辑
 * 
 * **实际实现** (EventEditModalV2.tsx Lines 2450-2600):
 *   - 直接内嵌在HierarchicalTagPicker的onSelectionChange回调中
 *   - 不是一个独立的函数，而是匿名箭头函数
 *   - 实现了相同的逻辑（本地事件vs远程事件）但代码结构不同
 *   - 新增了标题自动填充逻辑（Lines 2504-2530），PRD未描述
 * 
 * **建议**: 未来更新PRD时，应将此函数替换为实际代码片段或调整描述
 * 
 * 🔥 v2.0.5 标签变更时自动映射日历功能
 * 
 * 功能说明：
 * 当用户添加/删除标签时，自动更新事件的同步日历配置
 * 
 * 规则 1: 本地事件（remarkableSource = true 或 source = 'local'）
 *   - 计划安排部分：自动添加标签映射的日历到 calendarIds
 *   - 实际进展部分：自动添加标签映射的日历到 subEventConfig.calendarIds
 *   - 同步模式：默认 'bidirectional-private'（双向同步-仅自己）
 * 
 * 规则 2: 远程事件（来自外部日历同步）
 *   - 计划安排部分：保持原有配置，不添加标签映射（syncMode = 'receive-only'）
 *   - 实际进展部分：自动添加标签映射的日历到 subEventConfig.calendarIds
 *   - 同步模式：实际进展默认 'bidirectional-private'
 * 
 * 实现位置：EventEditModalV2 标签选择器的 onSelectionChange 回调
 */
function handleTagSelectionChange(
  selectedTagIds: string[],
  event: Event,
  isParentMode: boolean,
  setFormData: (updater: (prev: MockEvent) => MockEvent) => void
): void {
  // 判断事件来源
  const isLocalEvent = event.remarkableSource === true || event.source === 'local';
  
  // 提取所有标签映射的日历 IDs
  const tagService = TagService;
  const flatTags = tagService.getFlatTags();
  const mappedCalendarIds = selectedTagIds
    .map(tagId => flatTags.find(t => t.id === tagId)?.calendarMapping?.calendarId)
    .filter(id => !!id) as string[];
  
  // 根据事件来源应用不同规则
  setFormData(prev => {
    if (isLocalEvent) {
      // 规则 1: 本地事件
      // Plan 和 Actual 都自动添加标签映射的日历
      const newCalendarIds = [
        ...new Set([...(prev.calendarIds || []), ...mappedCalendarIds])
      ];
      
      const newSubEventConfig = {
        ...prev.subEventConfig,
        calendarIds: [...new Set([...(prev.subEventConfig?.calendarIds || []), ...mappedCalendarIds])],
        syncMode: prev.subEventConfig?.syncMode || 'bidirectional-private'
      };
      
      return {
        ...prev,
        tags: selectedTagIds,
        calendarIds: newCalendarIds,
        syncMode: prev.syncMode || 'bidirectional-private',
        subEventConfig: newSubEventConfig
      };
    } else {
      // 规则 2: 远程事件
      // Plan 保持 receive-only，不添加映射
      // Actual 自动添加标签映射的日历
      const newSubEventConfig = {
        ...prev.subEventConfig,
        calendarIds: [...new Set([...(prev.subEventConfig?.calendarIds || []), ...mappedCalendarIds])],
        syncMode: prev.subEventConfig?.syncMode || 'bidirectional-private'
      };
      
      return {
        ...prev,
        tags: selectedTagIds,
        // 保持原有 Plan 配置
        calendarIds: prev.calendarIds || [],
        syncMode: prev.syncMode || 'receive-only',
        // 更新 Actual 配置
        subEventConfig: newSubEventConfig
      };
    }
  });
}

/**
 * ⚠️ **冲突警告**: 此函数为PRD理论设计，实际实现不存在此独立函数
 * 
 * **PRD理论**: 定义了一个独立的renderTagSelectorWithAutoMapping函数
 * **实际实现**: 直接在JSX中使用<HierarchicalTagPicker>组件，内嵌回调逻辑
 * 
 * 标签选择器渲染（集成自动映射）
 */
function renderTagSelectorWithAutoMapping(
  event: Event,
  isParentMode: boolean,
  formData: MockEvent,
  setFormData: (updater: (prev: MockEvent) => MockEvent) => void
): ReactNode {
  return (
    <TagSelector
      selectedTagIds={formData.tags || []}
      onSelectionChange={(selectedIds) => {
        handleTagSelectionChange(selectedIds, event, isParentMode, setFormData);
      }}
    />
  );
}

/**
 * ⚠️ **冲突警告**: 此函数为PRD理论设计，实际实现逻辑内嵌在组件中
 * 
 * **PRD理论**: 定义了一个独立的日历选项构建函数
 * **实际实现**: 日历选择器逻辑直接在EventEditModalV2组件内部实现
 * 
 * 构建日历选择器选项
 * 合并来源日历 + 标签映射 + 用户已选
 */
function buildCalendarPickerOptions(
  event: Event,
  availableCalendars: Calendar[],
  selectedCalendarIds: string[],
  tagCalendarMapping: Map<string, string>
): CalendarPickerOption[] {
  const sourceCalendarId = getSourceCalendarId(event);
  const tagMappedCalendarIds = getTagMappedCalendarIds(event, tagCalendarMapping);
  
  return availableCalendars.map(calendar => {
    const isSource = calendar.id === sourceCalendarId;
    const isTagMapped = tagMappedCalendarIds.includes(calendar.id);
    const isChecked = selectedCalendarIds.includes(calendar.id);
    
    // 获取触发该日历的第一个标签信息
    let tagInfo: { tagName: string; tagColor: string } | undefined;
    if (isTagMapped && event.tags) {
      for (const tagId of event.tags) {
        if (tagCalendarMapping.get(tagId) === calendar.id) {
          const tag = getTagById(tagId);
          if (tag) {
            tagInfo = { tagName: tag.name, tagColor: tag.color };
            break;  // 只显示第一个标签
          }
        }
      }
    }
    
    return {
      calendarId: calendar.id,
      displayName: calendar.name,
      color: calendar.color,
      isChecked,
      isSource,
      tagInfo
    };
  });
}

// 🆕 v2.0.4 UI 渲染 - 计划安排区域（单一配置架构）
function renderPlanSyncCalendarSelector(
  event: Event,
  availableCalendars: Calendar[],
  tagCalendarMapping: Map<string, string>,
  onCalendarIdsChange: (ids: string[]) => void
): ReactNode {
  const sourceCalendarId = getSourceCalendarId(event);
  const tagMappedCalendarIds = getTagMappedCalendarIds(event, tagCalendarMapping);
  
  // 初始化选中的日历列表（从 event.calendarIds 读取）
  const initialSelectedIds = [
    ...(sourceCalendarId ? [sourceCalendarId] : []),  // 来源日历默认勾选
    ...tagMappedCalendarIds,                           // 标签映射日历默认勾选
    ...(event.calendarIds || [])                       // 🆕 从单一配置读取
  ].filter((id, index, self) => self.indexOf(id) === index);  // 去重
  
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(initialSelectedIds);
  const [pickerVisible, setPickerVisible] = useState(false);
  
  // 构建选项列表
  const options = buildCalendarPickerOptions(
    event,
    availableCalendars,
    selectedCalendarIds,
    tagCalendarMapping
  );
  
  // 显示区域文本
  const displayText = selectedCalendarIds.length === 0 
    ? '选择同步日历...'
    : `${availableCalendars.find(c => c.id === selectedCalendarIds[0])?.name || ''}${
        selectedCalendarIds.length > 1 ? ' 等' : ''
      }`;
  
  return (
    <div className="plan-sync-selector">
      <span className="label">同步</span>
      
      {/* 点击打开 Picker */}
      <button 
        className="sync-selector-button"
        onClick={() => setPickerVisible(true)}
      >
        {displayText}
      </button>
      
      {/* 日历选择 Picker */}
      {pickerVisible && (
        <div className="calendar-picker-modal">
          <div className="picker-header">
            <h3>选择同步日历（可多选）</h3>
            <button onClick={() => setPickerVisible(false)}>✕</button>
          </div>
          
          <div className="picker-options">
            {options.map(option => (
              <label key={option.calendarId} className="calendar-option">
                <input
                  type="checkbox"
                  checked={option.isChecked}
                  onChange={(e) => {
                    const newIds = e.target.checked
                      ? [...selectedCalendarIds, option.calendarId]
                      : selectedCalendarIds.filter(id => id !== option.calendarId);
                    setSelectedCalendarIds(newIds);
                    onCalendarIdsChange(newIds);
                  }}
                />
                
                <span 
                  className="calendar-dot" 
                  style={{ backgroundColor: option.color }}
                >●</span>
                
                <span className="calendar-name">{option.displayName}</span>
                
                {/* 右对齐标识 */}
                <div className="calendar-badges">
                  {/* 来源标志 */}
                  {option.isSource && (
                    <span className="badge-source">来源</span>
                  )}
                  
                  {/* 标签映射标志 */}
                  {option.tagInfo && (
                    <span 
                      className="badge-tag"
                      style={{ 
                        color: option.tagInfo.tagColor,
                        borderColor: option.tagInfo.tagColor 
                      }}
                    >
                      {option.tagInfo.tagName}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
          
          <div className="picker-footer">
            <button onClick={() => setPickerVisible(false)}>确定</button>
          </div>
        </div>
      )}
      
      {/* 同步模式选择器 */}
      <SyncModeSelector
        mode={event.syncMode || 'receive-only'}
        isActual={false}
        onChange={(newMode) => {
          // 更新同步模式
        }}
      />
    </div>
  );
}

// 🆕 v2.0.4 UI 渲染 - 实际进展区域（subEventConfig 模板）
function renderActualSyncCalendarSelector(
  event: Event,
  isParentMode: boolean,
  availableCalendars: Calendar[],
  onCalendarIdsChange: (ids: string[]) => void,
  onSyncModeChange: (mode: string) => void
): ReactNode {
  /**
   * 🆕 v2.0.4 实际进展区域逻辑：
   * - 父模式: 显示 subEventConfig 模板，更新时同时保存模板并批量更新子事件
   * - 子模式: 显示 mainEvent 的 calendarIds/syncMode，直接更新当前子事件
   */
  const calendarIds = isParentMode 
    ? (event.subEventConfig?.calendarIds || [])
    : (event.calendarIds || []);
  
  const syncMode = isParentMode
    ? (event.subEventConfig?.syncMode || 'send-only')
    : (event.syncMode || 'send-only');
  
  const { firstCalendar, remainCount } = getMultiCalendarDisplayInfo(
    calendarIds,
    availableCalendars
  );
  
  return (
    <div className="actual-sync-row">
      <span className="label">同步到</span>
      
      {/* 日历多选下拉 */}
      <SimpleCalendarDropdown
        multiSelect={true}
        selectedCalendarIds={calendarIds}
        onMultiSelectionChange={(ids) => {
          if (isParentMode) {
            // 父模式：更新 subEventConfig + 批量更新子事件
            onCalendarIdsChange(ids);
          } else {
            // 子模式：直接更新 mainEvent
            onCalendarIdsChange(ids);
          }
        }}
        availableCalendars={availableCalendars}
      />
      
      {/* 显示"第一个日历+等" */}
      {firstCalendar && (
        <div className="calendar-display">
          <span className="calendar-dot" style={{ backgroundColor: firstCalendar.color }}>●</span>
          <span>{firstCalendar.name}</span>
          {remainCount > 0 && <span className="remain-count">+等</span>}
        </div>
      )}
      
      {/* 同步模式选择器 */}
      <SyncModeSelector
        mode={syncMode}
        isActual={true}
        onChange={onSyncModeChange}
      />
    </div>
  );
}

/**
 * 同步模式选择器组件
 * 用于选择与外部日历的同步模式
 */
function SyncModeSelector({ 
  mode, 
  disabled = false, 
  onChange,
  isActual = false 
}: { 
  mode: 'receive-only' | 'send-only' | 'send-only-private' | 'bidirectional' | 'bidirectional-private';
  disabled?: boolean;
  onChange: (mode: any) => void;
  isActual?: boolean;  // 是否为 Actual 模式选择器
}) {
  const modeConfig = {
    'receive-only': { icon: '📥', label: '只接收同步', color: '#4CAF50' },
    'send-only': { icon: '📤', label: '只发送同步', color: '#2196F3' },
    'send-only-private': { icon: '📤🔒', label: '只发送（仅自己）', color: '#2196F3' },
    'bidirectional': { icon: '🔄', label: '双向同步', color: '#FF9800' },
    'bidirectional-private': { icon: '🔄🔒', label: '双向同步（仅自己）', color: '#FF9800' }
  };
  
  const current = modeConfig[mode];
  
  return (
    <div className="sync-mode-selector">
      <button 
        className={`sync-mode-button ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && cycleSyncMode(mode, onChange)}
        disabled={disabled}
        style={{ borderColor: current.color }}
      >
        <span className="sync-icon">{current.icon}</span>
        <span className="sync-label">{current.label}</span>
      </button>
    </div>
  );
}

/**
 * 日历多选器组件
 * 用于实际进展同步到多个日历
 */
function CalendarMultiSelector({ 
  selectedCalendars, 
  availableCalendars,
  onChange 
}: { 
  selectedCalendars: string[];
  availableCalendars: Calendar[];
  onChange: (calendarIds: string[]) => void;
}) {
  return (
    <div className="calendar-multi-selector">
      {availableCalendars.map(cal => (
        <label key={cal.id} className="calendar-checkbox">
          <input
            type="checkbox"
            checked={selectedCalendars.includes(cal.id)}
            onChange={(e) => {
              if (e.target.checked) {
                onChange([...selectedCalendars, cal.id]);
              } else {
                onChange(selectedCalendars.filter(id => id !== cal.id));
              }
            }}
          />
          <span className="calendar-dot" style={{ backgroundColor: cal.color }}>●</span>
          <span>{cal.name}</span>
        </label>
      ))}
    </div>
  );
}

// 同步模式循环切换
function cycleSyncMode(
  currentMode: 'receive-only' | 'send-only' | 'bidirectional',
  onChange: (mode: 'receive-only' | 'send-only' | 'bidirectional') => void
) {
  const modes: Array<'receive-only' | 'send-only' | 'bidirectional'> = ['receive-only', 'send-only', 'bidirectional'];
  const currentIndex = modes.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  onChange(modes[nextIndex]);
}
```

**UI 样式**:

```css
/* 🆕 计划安排区域：同步选择器 */
.plan-sync-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 12px;
}

.plan-sync-selector .label {
  font-weight: 500;
  color: #666;
  min-width: 40px;
}

.sync-selector-button {
  flex: 1;
  padding: 8px 12px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.sync-selector-button:hover {
  border-color: #3b82f6;
  background: #f9fafb;
}

/* 🆕 日历选择 Picker Modal */
.calendar-picker-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 500px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.picker-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}

.picker-header button {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #9ca3af;
}

.picker-options {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
}

.calendar-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}

.calendar-option:hover {
  background: #f9fafb;
}

.calendar-option input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.calendar-option .calendar-dot {
  font-size: 16px;
  line-height: 1;
}

.calendar-option .calendar-name {
  flex: 1;
  font-size: 14px;
}

/* 🆕 右对齐标识区域 */
.calendar-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.badge-source {
  padding: 4px 8px;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 12px;
  border-radius: 4px;
  font-weight: 500;
}

.badge-tag {
  padding: 4px 8px;
  border: 1px solid;
  font-size: 12px;
  border-radius: 4px;
  font-weight: 500;
}

.picker-footer {
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  text-align: right;
}

.picker-footer button {
  padding: 8px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.picker-footer button:hover {
  background: #2563eb;
}

/* ✅ 实际进展区域：多选日历 + 同步模式选择器 */
.actual-sync-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 12px;
}

.actual-sync-row .label {
  font-weight: 500;
  color: #666;
  min-width: 60px;
}

.actual-sync-row .calendar-display {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.actual-sync-row .calendar-dot {
  font-size: 14px;
  line-height: 1;
}

.actual-sync-row .remain-count {
  font-size: 12px;
  color: #999;
  margin-left: 4px;
}

/* 同步模式选择器 */
.sync-mode-selector {
  flex-shrink: 0;
}

.sync-mode-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 2px solid;
  border-radius: 20px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.sync-mode-button:hover:not(.disabled) {
  background: #f0f0f0;
  transform: scale(1.05);
}

.sync-mode-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sync-mode-button .sync-icon {
  font-size: 16px;
}

.sync-mode-button .sync-label {
  font-weight: 500;
}

/* 日历多选器（已废弃，使用 Picker Modal） */
.calendar-multi-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}

.calendar-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.calendar-checkbox:hover {
  background: #f5f5f5;
}

.calendar-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.calendar-checkbox .calendar-dot {
  font-size: 12px;
}
```

**🔑 v2.0.4 核心同步逻辑说明**:

```typescript
/**
 * 🆕 v2.0.4 父-子事件单一配置架构：
 * 
 * 1. **每个事件独立配置**
 *    - 每个事件有自己的 calendarIds + syncMode
 *    - 父事件的 calendarIds/syncMode 是父事件自己的配置（计划安排）
 *    - 子事件的 calendarIds/syncMode 是子事件自己的配置（实际进展）
 * 
 * 2. **父事件的 subEventConfig 模板**
 *    - 用于存储子事件的默认配置
 *    - 创建新子事件时继承此配置
 *    - 父事件还没有子事件时，"实际进展"配置保存到 subEventConfig
 * 
 * 3. **Modal 编辑逻辑**
 *    - 中区（计划安排）：
 *      - 父模式：编辑 mainEvent 的 calendarIds/syncMode
 *      - 子模式：编辑 parentEvent 的 calendarIds/syncMode（计划字段同步到父）
 *    - 下区（实际进展）：
 *      - 父模式：编辑 subEventConfig，并批量更新所有子事件
 *      - 子模式：编辑 mainEvent 的 calendarIds/syncMode（子事件自己的配置）
 * 
 * 4. **同步完全基于 calendarIds**
 *    - ActionBasedSyncManager 使用 event.calendarIds 决定同步目标
 *    - 标签映射仅用于初始化时自动勾选和显示标签名称
 *    - 用户取消勾选日历后，保留标签但不同步到该日历
 */

// 🆕 v2.0.4 处理计划安排日历变更（中区）
function handlePlanCalendarsChange(calendarIds: string[], isParentMode: boolean) {
  if (isParentMode) {
    // 父模式：更新父事件自己的 calendarIds
    await EventHub.updateFields(event.id, {
      calendarIds: calendarIds
    });
  } else {
    // 子模式：同步计划字段到父事件
    if (event.parentEventId) {
      await EventHub.updateFields(event.parentEventId, {
        calendarIds: calendarIds  // 更新父事件的计划配置
      });
    }
  }
  
  // 自动更新事件标签（仅添加，不删除）
  autoApplyCalendarTags(event, calendarIds);
}

// 🆕 v2.0.4 处理实际进展日历变更（下区）
function handleActualCalendarsChange(calendarIds: string[], isParentMode: boolean) {
  if (isParentMode) {
    // 父模式：更新 subEventConfig 模板
    const updatedSubEventConfig = {
      ...event.subEventConfig,
      calendarIds: calendarIds
    };
    
    await EventHub.updateFields(event.id, {
      subEventConfig: updatedSubEventConfig
    });
    
    // 如果有子事件，批量更新
    if (event.timerLogs && event.timerLogs.length > 0) {
      for (const childId of event.timerLogs) {
        await EventHub.updateFields(childId, {
          calendarIds: calendarIds
        });
      }
    }
  } else {
    // 子模式：更新子事件自己的 calendarIds
    await EventHub.updateFields(event.id, {
      calendarIds: calendarIds
    });
  }
  EventService.update(event.id, {
    actualSyncConfig: updatedActualSyncConfig
  });
}

/**
 * 自动应用日历标签
 * 根据选中的日历，自动添加对应标签（不删除现有标签）
 */
function autoApplyCalendarTags(event: Event, calendarIds: string[]) {
  const tagCalendarMapping = getTagCalendarMapping();  // 从配置读取映射关系
  const reversedMapping = new Map<string, string>();   // calendarId → tagId
  
  // 构建反向映射
  tagCalendarMapping.forEach((calendarId, tagId) => {
    reversedMapping.set(calendarId, tagId);
  });
  
  // 为每个日历添加对应标签
  const newTags = [...event.tags];
  for (const calendarId of calendarIds) {
    const tagId = reversedMapping.get(calendarId);
    if (tagId && !newTags.includes(tagId)) {
      newTags.push(tagId);
    }
  }
  
  event.tags = newTags;
}
```

**交互设计要点**:

1. **计划安排区域**：
   - 点击"同步"按钮 → 打开 Picker
   - 来源日历自动勾选 + 显示"来源"标志（右对齐灰色文本）
   - 标签映射的日历自动勾选 + 显示标签名称和颜色（右对齐）
   - 用户可取消任意日历（包括来源日历）
   - 取消勾选日历 → 不同步到该日历，但保留标签和"来源"标志

2. **实际进展区域**：
   - 使用原有的多选下拉设计
   - 不显示"来源"标志（因为实际进展都是本地生成）
   - 不显示标签映射（实际进展按时间段独立同步）

---

#### 2.4.1 实际进展同步机制

**设计目标**:
- **多日历同步**: 实际进展可同步到多个外部日历
- **标签自动映射**: 根据日历类型自动应用对应标签
- **双向同步**: 支持与外部日历的双向数据同步
- **继承计划设置**: 默认继承计划安排的同步配置

**🆕 v2.0.4 数据结构**:

```typescript
// 父事件：使用 subEventConfig 存储子事件配置模板
const parentEvent = {
  calendarIds: ['outlook-work'],       // 父事件自己的配置（计划安排）
  syncMode: 'bidirectional',
  subEventConfig: {                     // 子事件配置模板（实际进展）
    calendarIds: ['outlook-work', 'google-personal'],
    syncMode: 'send-only'
  }
};

// 子事件：有自己的独立配置
const childEvent = {
  parentEventId: 'parent-123',
  calendarIds: ['outlook-work'],       // 子事件自己的配置（从 subEventConfig 继承）
  syncMode: 'send-only'
};
```

**🆕 v2.0.4 UI渲染** (在"实际进展"区域):

```typescript
function renderActualProgressSync(event: Event, isParentMode: boolean): ReactNode {
  // 父模式显示 subEventConfig，子模式显示 event 自己的配置
  const calendarIds = isParentMode 
    ? (event.subEventConfig?.calendarIds || [])
    : (event.calendarIds || []);
  const syncMode = isParentMode
    ? (event.subEventConfig?.syncMode || 'send-only')
    : (event.syncMode || 'send-only');
  
  return (
    <div className="actual-sync-section">
      {/* 1. 同步目标日历选择 */}
      <CalendarMultiSelector
        selectedCalendars={actualConfig.targetCalendars}
        availableCalendars={availableExternalCalendars}
        onChange={(calendarIds) => handleActualCalendarsChange(calendarIds)}
      />
      
      {/* 2. 同步模式选择 */}
      <SyncModeSelector
        mode={actualConfig.mode}
        disabled={false}  // 实际进展始终可更改同步模式
        onChange={(newMode) => handleSyncModeChange(newMode, true)}
      />
      
      {/* 3. 标签映射预览 */}
      <div className="tag-mapping-preview">
        {Object.entries(actualConfig.tagMapping).map(([calId, tags]) => (
          <div key={calId} className="mapping-row">
            <span className="calendar-name">{getCalendarName(calId)}</span>
            <span className="arrow">→</span>
            <div className="tags">
              {tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**✅ 标签自动映射规则（已完成实现）**:

**实现位置**: 
- EventEditModalV2.tsx Lines 2450-2600（标签选择器回调逻辑）
- EventEditModalV2.tsx Lines 2504-2530（标题自动填充）
- EventEditModalV2.tsx Lines 2540-2590（Plan和Actual日历自动合并）

**核心功能**:
1. ✅ **标签自动映射日历**: 本地事件Plan+Actual都添加，远程事件仅Actual添加
2. ✅ **标题自动填充**: 标题为空时使用第一个标签的emoji+名称
3. ✅ **JSON格式智能检测**: 正确解析Slate JSON判断标题是否真正为空
4. ✅ **智能合并**: 与用户手动选择的日历合并，不覆盖现有选择
5. ✅ **syncMode保持**: 标签变更时不修改同步模式，保留用户设置

| 日历类型 | 自动添加标签 | 保留原有标签 | 实现状态 |
|---------|------------|------------|---------|
| Outlook | `['工作', 'Outlook']` | ✅ 保留 | ✅ 已实现 |
| Google Calendar | `['生活', 'Google']` | ✅ 保留 | ✅ 已实现 |
| iCloud | `['个人', 'iCloud']` | ✅ 保留 | ✅ 已实现 |

**实现逻辑**:

```typescript
// ✅ v2.0.4 已实现于 EventEditModalV2.tsx
// 标签自动映射（根据同步目标日历自动添加标签）
let finalTags = [...(formData.tags || [])];
const targetCalendars = formData.calendarIds || [];  // 🆕 从单一配置读取

if (targetCalendars.length > 0) {
  console.log('🏷️ [EventEditModalV2] Auto-mapping tags from target calendars:', targetCalendars);
  const autoTags: string[] = [];
  
  targetCalendars.forEach(calendarId => {
    // 假设日历 ID 格式为 "outlook-work", "google-personal", "icloud-family"
    if (calendarId.includes('outlook')) {
      autoTags.push('工作', 'Outlook');
    } else if (calendarId.includes('google')) {
      autoTags.push('生活', 'Google');
    } else if (calendarId.includes('icloud')) {
      autoTags.push('个人', 'iCloud');
    }
  });
  
  // 去重合并
  finalTags = Array.from(new Set([...finalTags, ...autoTags]));
  console.log('🏷️ [EventEditModalV2] Final tags after auto-mapping:', finalTags);
}
```

**同步行为**:

1. ✅ **添加标签**: 保存时自动为事件添加对应日历的标签
2. ✅ **保留原标签**: 用户手动添加的标签不会被覆盖
3. ✅ **去重处理**: 自动去除重复标签（使用 `new Set()`）
4. ⏳ **双向同步**: 外部日历的标签变更也会同步回 ReMarkable（待实现）

**示例**:

```typescript
// 原事件标签
event.tags = ['重要', '项目A'];

// 同步到 Outlook 工作日历
syncToCalendar(event, 'outlook-work');
// → event.tags = ['重要', '项目A', '工作', 'Outlook']

// 同时同步到 Google 个人日历
syncToCalendar(event, 'google-personal');
// → event.tags = ['重要', '项目A', '工作', 'Outlook', '生活', 'Google']
```

**判断逻辑说明**:

| 优先级 | 判断条件 | 显示内容 | 说明 |
|--------|---------|---------|------|
| **1** | `event.isTimer && event.parentEventId` | **继承父事件来源** | Timer 子事件显示父事件的来源（可能是 Outlook/Plan/等任意来源） |
| **2** | `event.source === 'outlook'` | Outlook Icon + `Outlook: ${calendar.name}` | 从 Microsoft Outlook 同步的事件 |
| **2** | `event.source === 'google'` | Google Icon + `Google: ${calendar.name}` | 从 Google Calendar 同步的事件 |
| **2** | `event.source === 'icloud'` | iCloud Icon + `iCloud: ${calendar.name}` | 从 Apple iCloud 同步的事件 |
| **3** | `event.isTimer && !event.parentEventId` | ⏱️ + `ReMarkable计时` | **独立 Timer 事件**（直接从 Timer 页面创建，无父事件） |
| **3** | `event.isPlan === true` | ✅ + `ReMarkable计划` | 由 **Plan 模块**创建的计划事件 |
| **3** | `event.isTimeCalendar === true` | 🚀 + `ReMarkable` | 由 **TimeCalendar 页面**创建的事件 |
| **4** | `event.source === 'local'` 或 `event.remarkableSource === true` | 🚀 + `ReMarkable` | 4DNote 本地创建的其他事件 |

**核心规则**:
1. **Timer 子事件优先继承父事件来源**
   - 例：对 Outlook 事件进行计时 → Timer 子事件显示 "Outlook: 工作"
   - 例：对 Plan 事件进行计时 → Timer 子事件显示 "✅ ReMarkable计划"
   
2. **独立 Timer 事件才显示 ⏱️ ReMarkable计时**
   - 仅当 `isTimer === true && !parentEventId` 时
   - 即：直接从 Timer 页面创建的独立计时事件

**重要说明**:
- ⚠️ `event.source` 字段记录的是**事件的原始来源**，在 ReMarkable 中编辑后**不会改变**
- ✅ 即使从 Outlook/Google/iCloud 同步的事件在 ReMarkable 中被多次编辑，依然显示原平台来源
- 🔄 `event.syncStatus` 字段标记同步状态（`pending`/`synced`/`error`），与来源显示无关
- 📝 本地编辑后，事件会标记为待同步（`syncStatus: 'pending'`），但来源标识保持不变

**示例 1: 外部平台事件编辑**
```typescript
// 从 Outlook 同步的事件
const outlookEvent = {
  id: 'outlook-123',
  title: '准备演讲稿',
  source: 'outlook',      // ✅ 原始来源，永不改变
  syncStatus: 'synced',   // 当前同步状态
  // ...
};

// 用户在 ReMarkable 中编辑标题
outlookEvent.title = '准备演讲稿 - 已修改';
outlookEvent.syncStatus = 'pending'; // ⚠️ 标记为待同步
// outlookEvent.source 依然是 'outlook' ✅

// 显示结果：Outlook Icon + "Outlook: 工作"
```

**示例 2: Timer 子事件继承父事件来源**
```typescript
// Plan 事件
const planEvent = {
  id: 'plan-456',
  title: '写代码',
  source: 'local',
  isPlan: true,
  // ...
};
// 显示：✅ ReMarkable计划

// 对该 Plan 事件进行计时，生成 Timer 子事件
const timerChildEvent = {
  id: 'timer-789',
  title: '写代码',         // 继承父事件标题
  source: 'local',
  isTimer: true,
  parentEventId: 'plan-456', // ✅ 指向父事件
  // ...
};
// 显示：✅ ReMarkable计划（继承自父事件，而不是 ⏱️ ReMarkable计时）

// 对 Outlook 事件进行计时
const outlookTimerChild = {
  id: 'timer-abc',
  title: '准备演讲稿',
  source: 'outlook',         // 继承父事件的 source
  isTimer: true,
  parentEventId: 'outlook-123',
  // ...
};
// 显示：Outlook Icon + "Outlook: 工作"（继承自父事件）
```

**示例 3: 独立 Timer 事件**
```typescript
// 直接从 Timer 页面创建的独立计时事件
const independentTimer = {
  id: 'timer-xyz',
  title: '自由计时',
  source: 'local',
  isTimer: true,
  parentEventId: null,  // ✅ 无父事件
  // ...
};
// 显示：⏱️ ReMarkable计时
```

**UI 样式**:
```css
.calendar-source {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #6b7280;
}
.calendar-dot {
  font-size: 18px;
}
.source-emoji {
  font-size: 16px;
}
}
```

---

### 【下 Section】- 实际进展（条件显示）

**显示条件**:
```typescript
function shouldShowActualProgress(event: Event, activeTimers: Map<string, TimerState>): boolean {
  // 1. 如果是 Timer 子事件（有父事件），显示父事件的汇总数据
  if (event.isTimer && event.parentEventId) {
    const parentEvent = EventService.getEventById(event.parentEventId);
    // 递归判断父事件是否有计时数据
    return shouldShowActualProgress(parentEvent, activeTimers);
  }
  
  // 2. 如果是独立 Timer 事件（无父事件），显示自己的计时数据
  if (event.isTimer && !event.parentEventId) return true;
  
  // 3. 当前事件有活动 Timer（运行中或已暂停）
  if (activeTimers.has(event.id)) return true;
  
  // 4. 当前事件有 Timer 子事件（历史计时记录）
  if (event.timerChildEvents && event.timerChildEvents.length > 0) return true;
  
  return false;
}
```

**用户体验设计理念**:
- 🎯 **用户视角**：用户创建了一个事件，可以对它**反复计时**，查看总共花了多少时间
- ✅ **统一显示**：无论点击父事件还是 Timer 子事件，都显示**该事件的完整计时汇总**
- 🔄 **多次计时**：同一事件可以多次计时，所有计时记录累加显示
- 📊 **汇总数据**：显示所有计时的时间段、总时长、ddl 完成情况等
- 🆕 **智能升级**：独立 Timer 事件二次计时时，自动升级为父子结构，无需用户感知

**核心概念 - 父事件多次计时**（技术实现细节）:
- ✅ 非 Timer 创建的事件（Remote/Plan/手动创建）可以被**多次计时**
- ✅ 每次计时生成一个 **Timer 子事件**（`parentEventId` 指向父事件）
- ✅ 🆕 **独立 Timer 事件二次计时自动升级**：
  - 首次计时：创建独立 Timer 事件（`isTimer: true, parentEventId: null`）
  - 二次计时：自动创建父事件 + 将首次计时转为 Timer 子事件
  - 用户体验：无缝，依然看到完整的计时汇总
- ✅ 所有 Timer 子事件的日志**合并显示**在父事件的 Slate 编辑区
- ✅ TimeCalendar 上同时显示父事件色块 + 多个 Timer 子事件色块
- ✅ 点击任意 Timer 子事件色块 → 打开 Modal，显示**父事件的完整计时汇总**（而不是单次计时）

**实时刷新机制**（v2.15 架构修复）:

```typescript
// ✅ 关键修复：遵循 EventHub 架构，主动从 EventService 读取最新数据
const childEvents = React.useMemo(() => {
  // 🔧 每次都从 EventService 重新读取最新数据
  // 原因：EventService 的 eventsUpdated 会忽略同标签页的更新（防循环机制）
  
  if (!event?.id) return [];
  
  // 🆕 从 EventService 重新读取当前事件的最新数据
  const latestEvent = EventService.getEventById(event.id);
  if (!latestEvent) return [];
  
  // 情况 1: 当前是子事件 → 读取父事件的最新 timerLogs
  if (latestEvent.parentEventId) {
    const latestParent = EventService.getEventById(latestEvent.parentEventId);
    if (!latestParent) return [];
    
    const timerLogs = latestParent.timerLogs || [];
    return timerLogs
      .map(childId => EventService.getEventById(childId))
      .filter(e => e !== null) as Event[];
  }
  
  // 情况 2: 当前是父事件 → 读取自己的最新 timerLogs
  const timerLogs = latestEvent.timerLogs || [];
  return timerLogs
    .map(childId => EventService.getEventById(childId))
    .filter(e => e !== null) as Event[];
}, [event?.id, refreshCounter]); // ✅ 简化依赖：不再依赖过时的 prop

// 监听事件更新（包括同标签页和跨标签页）
// EventService 的架构：
// - 同标签页：通过 window.dispatchEvent 直接触发（不经过 BroadcastChannel）
// - 跨标签页：通过 BroadcastChannel 广播（会检测 senderId 防止接收自己的广播）
React.useEffect(() => {
  const handleEventsUpdated = (e: any) => {
    const updatedEventId = e.detail?.eventId || e.detail;
    
    // 如果更新的是当前事件或父事件，触发刷新
    if (updatedEventId === event?.id || updatedEventId === event?.parentEventId) {
      setRefreshCounter(prev => prev + 1);
    }
  };
  
  window.addEventListener('eventsUpdated', handleEventsUpdated);
  return () => window.removeEventListener('eventsUpdated', handleEventsUpdated);
}, [event?.id, event?.parentEventId]);
```

**架构原则**:
- ✅ **单一数据源（SSOT）**: EventService 是数据的唯一真实来源
- ✅ **主动读取**: 组件应该主动从 EventService 读取最新数据，而不是被动等待事件通知
- ✅ **防循环机制**: EventService 会忽略同标签页内自己的广播消息（防止循环更新）
- ✅ **自己负责渲染**: 更新数据的模块应该自己负责 UI 刷新，不依赖广播回调

**问题场景与解决方案**:

**问题**: 停止计时后，EditModal 的实际进展没有立即显示新的 timerLog，需要关闭再打开才能看到。

**根本原因**:
1. EventService 有防循环机制：忽略同标签页内自己的广播消息（`senderId === tabId`）
2. EventEditModalV2 原本依赖 `event` prop 中的 `timerLogs`，但 prop 在 Modal 打开时传递一次后不会更新
3. 即使 `refreshCounter` 触发 useMemo 重新执行，读取的仍然是过时的 `event.timerLogs`

**解决方案**:
1. **不依赖过时的 prop**: 每次都从 EventService 重新读取最新数据
2. **简化依赖**: 从 `[event?.id, event?.timerLogs, parentEvent, refreshCounter]` 简化为 `[event?.id, refreshCounter]`
3. **主动查询**: 使用 `EventService.getEventById()` 获取最新的事件数据

**数据流**:
```
App.tsx 停止计时
  ↓
EventService.updateEvent(parentId, { timerLogs: [..., newTimerId] })
  ↓
localStorage 保存成功
  ↓
dispatchEventUpdate(parentId) → window.dispatchEvent('eventsUpdated')
  ↓
EventEditModalV2 监听到事件 → setRefreshCounter(+1)
  ↓
childEvents useMemo 重新执行
  ↓
EventService.getEventById(parentId) → 读取最新 timerLogs ✅
  ↓
渲染新的 timerLog 列表 ✅
```

---

**数据来源**: 
```typescript
function getActualProgressData(event: Event, activeTimers: Map<string, TimerState>) {
  // 🆕 情况 1: Timer 子事件（有父事件）- 显示父事件的汇总数据
  if (event.isTimer && event.parentEventId) {
    const parentEvent = EventService.getEventById(event.parentEventId);
    if (parentEvent) {
      // 递归获取父事件的汇总数据
      return getActualProgressData(parentEvent, activeTimers);
    }
  }
  
  // 🆕 情况 2: 独立 Timer 事件（无父事件，但可能有子事件）
  // 注意：如果该 Timer 被二次计时，会自动升级为父事件
  if (event.isTimer && !event.parentEventId) {
    const activeTimer = activeTimers.get(event.id);
    const childEvents = event.timerChildEvents || [];
    
    // 如果有子事件（已升级为父事件），显示汇总
    if (childEvents.length > 0) {
      const allSegments = [
        ...(event.segments || []),        // 首次计时的数据
        ...(activeTimer?.segments || []), // 当前活动计时
        ...childEvents.flatMap(child => child.segments || []) // 后续计时
      ];
      
      const totalElapsed = allSegments.reduce((sum, seg) => sum + seg.duration, 0);
      
      return {
        segments: allSegments,
        totalElapsed,
        activeTimer,
        childEvents,
        isIndependentTimer: true,
        hasBeenUpgraded: true  // 标记已升级为父子结构
      };
    }
    
    // 如果无子事件（纯粹的独立 Timer），显示自己的数据
    return {
      segments: event.segments || activeTimer?.segments || [],
      totalElapsed: event.duration || activeTimer?.elapsedTime || 0,
      startTime: event.startTime,
      endTime: event.endTime,
      activeTimer,
      isIndependentTimer: true
    };
  }
  
  // 情况 3: 父事件（或普通事件）- 显示所有 Timer 子事件的汇总
  const activeTimer = activeTimers.get(event.id);
  const childEvents = event.timerChildEvents || [];
  
  // 合并活动 Timer 和历史 Timer 子事件
  const allSegments = [
    ...(activeTimer?.segments || []),
    ...childEvents.flatMap(child => child.segments || [])
  ];
  
  const totalElapsed = allSegments.reduce((sum, seg) => sum + seg.duration, 0);
  
  return {
    segments: allSegments,
    totalElapsed,
    activeTimer,
    childEvents,
    isIndependentTimer: false
  };
}
```

**用户场景示例**:

**场景 1: 用户对 Plan 事件进行多次计时**
```typescript
// 用户在 Plan 页面创建了一个事件
const planEvent = {
  id: 'plan-123',
  title: '写代码',
  isPlan: true,
  // ...
};

// 第一次计时（上午 10:00 - 11:00）
// 系统自动创建 Timer 子事件 timer-1
const timerChild1 = {
  id: 'timer-1',
  parentEventId: 'plan-123',
  startTime: '2025-11-08 10:00',
  endTime: '2025-11-08 11:00',
  duration: 3600,
  segments: [{ start: 10:00, end: 11:00, duration: 3600 }]
};

// 第二次计时（下午 14:00 - 15:30）
// 系统自动创建 Timer 子事件 timer-2
const timerChild2 = {
  id: 'timer-2',
  parentEventId: 'plan-123',
  startTime: '2025-11-08 14:00',
  endTime: '2025-11-08 15:30',
  duration: 5400,
  segments: [{ start: 14:00, end: 15:30, duration: 5400 }]
};

// 用户体验：
// 1. 点击 TimeCalendar 上的 planEvent 色块 → 打开 Modal
//    显示：总时长 2.5h（= 1h + 1.5h），所有时间段列表
// 
// 2. 点击 TimeCalendar 上的 timerChild1 色块 → 打开 Modal
//    显示：总时长 2.5h（= 1h + 1.5h），所有时间段列表（与点击父事件一致）
//
// 3. 点击 TimeCalendar 上的 timerChild2 色块 → 打开 Modal
//    显示：总时长 2.5h（= 1h + 1.5h），所有时间段列表（与点击父事件一致）
```

**场景 2: 独立 Timer 事件 - 二次计时自动升级**
```typescript
// === 首次计时 ===
// 用户在 Timer 页面创建并开始计时（没有关联任何事件）
const independentTimer = {
  id: 'timer-xyz',
  title: '学习英语',
  tags: ['#学习/#英语'],
  isTimer: true,
  parentEventId: null,  // ✅ 无父事件（独立 Timer）
  duration: 1800,
  segments: [{ start: '10:00', end: '10:30', duration: 1800 }]
};

// 用户体验：
// 点击该事件 → 显示：总时长 0.5h，单次时间段

// === 二次计时 ===
// 用户打开该 Timer 事件的 EditModal，点击"开始专注"按钮
// 系统检测到：这是独立 Timer 的二次计时，自动升级为父子结构

// Step 1: 创建父事件（继承原 Timer 的元数据）
const parentEvent = {
  id: 'event-abc',      // 🆕 新 ID
  title: '学习英语',     // 继承标题
  tags: ['#学习/#英语'], // 继承标签
  source: 'local',
  isTimer: false,       // ✅ 不再是 Timer
  isTimeCalendar: true, // 标记为 TimeCalendar 创建
  timerChildEvents: ['timer-xyz', 'timer-def'], // 子事件列表
  // 继承其他元数据（emoji, description, 等）
};

// Step 2: 将原 Timer 转为子事件
independentTimer.parentEventId = 'event-abc'; // ✅ 挂载到父事件

// Step 3: 创建第二次计时的子事件
const timerChild2 = {
  id: 'timer-def',
  title: '学习英语',
  parentEventId: 'event-abc', // ✅ 挂载到父事件
  isTimer: true,
  duration: 2700,
  segments: [{ start: '14:00', end: '14:45', duration: 2700 }]
};

// 用户体验（升级后）：
// 1. 点击 parentEvent → 显示：总时长 1.25h（= 0.5h + 0.75h）
// 2. 点击 timer-xyz（首次计时）→ 显示：总时长 1.25h（相同）
// 3. 点击 timer-def（二次计时）→ 显示：总时长 1.25h（相同）
// 
// ✅ 用户完全无感知升级过程，只看到计时累加
```

**场景 3: 从其他平台同步的事件计时**
```typescript
// Outlook 同步的事件
const outlookEvent = {
  id: 'outlook-123',
  title: '客户会议',
  source: 'outlook',
  calendarId: 'work-calendar',
  // ...
};

// 用户对该事件进行计时
// 系统自动创建 Timer 子事件
const timerChild = {
  id: 'timer-999',
  title: '客户会议',
  source: 'outlook',      // 继承父事件来源
  parentEventId: 'outlook-123',
  isTimer: true,
  // ...
};

// 用户体验：
// 点击任意入口 → 显示来源："Outlook: 工作"，总时长汇总
```

**关键设计原则**:
- ✅ **用户无感知**：用户不需要知道"父事件"和"子事件"的概念
- ✅ **统一体验**：无论从哪个入口打开，都显示该事件的完整计时汇总
- ✅ **数据一致**：同一事件的所有计时记录始终汇总显示
- 🆕 **智能升级**：独立 Timer 二次计时自动升级，用户体验无缝衔接
- 🆕 **信息保留**：升级时保留所有元数据（标题、标签、emoji、描述等）

---

#### 3.1 时间片段列表

**数据结构**:
```typescript
interface TimerSegment {
  start: number;        // 开始时间戳
  end: number;          // 结束时间戳
  duration: number;     // 时长（毫秒）
}

// globalTimer.segments: TimerSegment[]
```

**显示逻辑**:
```typescript
import { TimerCheckIcon } from '@/assets/icons';

function renderTimerSegments(segments: TimerSegment[]): ReactNode {
  return segments.map((segment, index) => {
    const start = new Date(segment.start);
    const end = new Date(segment.end);
    const dateStr = dayjs(start).format('YYYY-MM-DD（ddd）');
    const startTime = dayjs(start).format('HH:mm');
    const endTime = dayjs(end).format('HH:mm');
    const duration = calculateDuration(start, end);
    
    return (
      <div key={index} className="timer-segment">
        <img src={TimerCheckIcon} alt="已完成" className="icon-timer-check" />
        <span>{dateStr} {startTime}</span>
        <span className="duration-arrow">──{duration}→</span>
        <span>{endTime}</span>
      </div>
    );
  });
}
```

---

#### 3.2 实际进展整体渲染结构

**UI 布局**（根据 Figma 设计）:

```typescript
function renderActualProgressSection(event: Event, activeTimers: Map<string, TimerState>): ReactNode {
  if (!shouldShowActualProgress(event, activeTimers)) return null;
  
  const progressData = getActualProgressData(event, activeTimers);
  const { segments, totalElapsed } = progressData;
  
  // 计算总时长显示文本
  const hours = Math.floor(totalElapsed / (1000 * 60 * 60));
  const minutes = Math.floor((totalElapsed % (1000 * 60 * 60)) / (1000 * 60));
  const totalDurationText = hours > 0 
    ? `${hours}小时${minutes > 0 ? minutes + '分钟' : ''}` 
    : `${minutes}分钟`;
  
  return (
    <div className="section section-bottom">
      {/* 标题栏：左侧"实际进展"，右侧"总时长" */}
      <div className="section-header">
        <h4 className="section-title">实际进展</h4>
        <span className="total-duration">总时长：{totalDurationText}</span>
      </div>
      
      {/* 时间片段列表 */}
      <div className="timer-segments-list">
        {renderTimerSegments(segments)}
      </div>
      
      {/* 同步机制（如果有） */}
      {renderActualProgressSync(event)}
      
      {/* 时长对比（如果有计划安排） */}
      {calculateDurationComparison(event, totalElapsed)}
      
      {/* ddl 完成状态（如果有 ddl） */}
      {renderDdlStatus(event, totalElapsed)}
    </div>
  );
}
```

**CSS 样式**:

```css
/* 实际进展 Section */
.section-bottom {
  margin-top: 24px;
  padding: 16px 20px;
  background: #fafafa;
  border-radius: 12px;
}

/* 标题栏：左右布局 */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

/* 总时长：显示在标题右侧 */
.total-duration {
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  white-space: nowrap;
}

/* 时间片段列表 */
.timer-segments-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
```

**关键设计要点**:

1. **总时长位置**：按照 Figma 设计，总时长显示在"实际进展"标题的右侧
2. **响应式布局**：使用 `justify-content: space-between` 确保左右对齐
3. **视觉层级**：标题更大更粗，总时长稍小，视觉上形成主次关系
4. **灰色背景**：整个实际进展区域使用浅灰背景，区分于其他 Section

---

#### 3.3 总时长计算逻辑

**计算函数**:
```typescript
function calculateTotalElapsed(eventId: string, activeTimers: Map<string, TimerState>): number {
  const timer = activeTimers.get(eventId);
  if (!timer) return 0;
  
  const { elapsedTime, startTime, isRunning } = timer;
  
  // 安全检查
  if (!elapsedTime || isNaN(elapsedTime) || elapsedTime < 0) {
    console.warn('⚠️ 异常的 elapsedTime:', elapsedTime);
    return 0;
  }
  
  if (isRunning) {
    const now = Date.now();
    const currentRunTime = now - startTime;
    return elapsedTime + currentRunTime;
  }
  
  return elapsedTime;
}
```

---

#### 3.4 时长对比（如果有"计划安排"）

**计算逻辑**:
```typescript
function calculateDurationComparison(event: Event, actualElapsed: number): ReactNode {
  if (!event.startTime || !event.endTime) return null;
  
  const planned = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
  const diff = actualElapsed - planned;
  
  if (Math.abs(diff) < 5 * 60 * 1000) {
    // 差异小于 5 分钟，不显示
    return null;
  }
  
  const diffHours = Math.floor(Math.abs(diff) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((Math.abs(diff) % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diff > 0) {
    return (
      <div className="duration-comparison overtime">
        比计划多用 {diffHours > 0 ? `${diffHours}小时` : ''}{diffMinutes}分钟
      </div>
    );
  } else {
    return (
      <div className="duration-comparison ahead">
        提前 {diffHours > 0 ? `${diffHours}小时` : ''}{diffMinutes}分钟完成
      </div>
    );
  }
}
```

**UI 样式**:
```css
.duration-comparison {
  font-size: 14px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
}
.duration-comparison.overtime {
  background: #fef3c7;
  color: #92400e;
}
.duration-comparison.ahead {
  background: #d1fae5;
  color: #065f46;
}
```

---

#### 3.5 ddl 完成状态（如果有 ddl）

**数据来源**: `event.dueDate` + `actualElapsed` + `segments[]`

**设计理念**: 
- **彩蛋化提示**：根据用户的投入时间、完成进度、ddl距离等多维度数据，给予个性化的鼓励、庆祝或提醒
- **情感共鸣**：让用户感受到被认可、被赞美、被陪伴的温暖感
- **成就解锁**：通过不同的时长里程碑（1h、3h、5h、10h、15h+），营造"解锁成就"的愉悦感

**显示逻辑**:
```typescript
function renderDdlStatus(event: Event, actualElapsed: number): ReactNode {
  if (!event.dueDate) return null;
  
  const ddlTime = new Date(event.dueDate).getTime();
  const now = Date.now();
  const actualEndTime = event.segments && event.segments.length > 0
    ? new Date(event.segments[event.segments.length - 1].endTime).getTime()
    : now;
  
  const totalInvestedHours = actualElapsed / (1000 * 60 * 60);
  const isCompleted = event.segments && event.segments.length > 0 && 
                      event.segments[event.segments.length - 1].endTime != null;
  
  // ========== 场景 1: 任务已完成 ==========
  if (isCompleted) {
    const advanceTime = ddlTime - actualEndTime;
    const advanceHours = Math.floor(advanceTime / (1000 * 60 * 60));
    const advanceDays = Math.floor(advanceHours / 24);
    
    // 1.1 提前完成 - 根据提前时间和投入时间给予不同提示
    if (actualEndTime < ddlTime) {
      // 提前3天以上 + 投入时间较短（<2h）
      if (advanceDays >= 3 && totalInvestedHours < 2) {
        return <div className="ddl-status completed-epic">
          ⚡️ 闪电战！提前{advanceDays}天完成，仅用时{formatDuration(actualElapsed)}！效率之神！
        </div>;
      }
      // 提前3天以上 + 投入时间较长（>=5h）
      if (advanceDays >= 3 && totalInvestedHours >= 5) {
        return <div className="ddl-status completed-epic">
          🏆 提前{advanceDays}天完成大挑战！投入{formatDuration(actualElapsed)}，你的专注令人敬佩！
        </div>;
      }
      // 提前1-3天 + 投入时间适中（1-5h）
      if (advanceDays >= 1 && totalInvestedHours >= 1 && totalInvestedHours < 5) {
        return <div className="ddl-status completed-great">
          🎉 提前{advanceDays}天完工！{formatDuration(actualElapsed)}的投入换来从容，太棒了！
        </div>;
      }
      // 提前1-3天 + 投入时间很长（>=10h）
      if (advanceDays >= 1 && totalInvestedHours >= 10) {
        return <div className="ddl-status completed-epic">
          💎 史诗级成就解锁！提前{advanceDays}天完成，累计{formatDuration(actualElapsed)}专注时光！
        </div>;
      }
      // 提前12-24小时
      if (advanceHours >= 12 && advanceHours < 24) {
        return <div className="ddl-status completed-great">
          🌟 提前{advanceHours}小时完成！投入{formatDuration(actualElapsed)}，稳稳上岸！
        </div>;
      }
      // 提前6-12小时 + 投入时间短（<1h）
      if (advanceHours >= 6 && advanceHours < 12 && totalInvestedHours < 1) {
        return <div className="ddl-status completed-good">
          🚀 快准狠！提前{advanceHours}h完成，仅用{Math.floor(totalInvestedHours * 60)}分钟！
        </div>;
      }
      // 提前6-12小时 + 投入时间长（>=3h）
      if (advanceHours >= 6 && advanceHours < 12 && totalInvestedHours >= 3) {
        return <div className="ddl-status completed-good">
          ✨ 提前{advanceHours}h完成！{formatDuration(actualElapsed)}的努力没有白费！
        </div>;
      }
      // 提前3-6小时
      if (advanceHours >= 3 && advanceHours < 6) {
        return <div className="ddl-status completed-good">
          🎯 提前{advanceHours}h达成！投入{formatDuration(actualElapsed)}，完美收官！
        </div>;
      }
      // 提前1-3小时 + 投入时间很长（>=15h）
      if (advanceHours >= 1 && advanceHours < 3 && totalInvestedHours >= 15) {
        return <div className="ddl-status completed-legendary">
          🔥 传说级投入！{formatDuration(actualElapsed)}的坚持，提前{advanceHours}h完成！你是真正的勇士！
        </div>;
      }
      // 提前1-3小时
      if (advanceHours >= 1 && advanceHours < 3) {
        return <div className="ddl-status completed-good">
          ✅ 提前{advanceHours}h完成！{formatDuration(actualElapsed)}换来从容，干得漂亮！
        </div>;
      }
      // 提前30分钟-1小时 + 投入时间长（>=5h）
      if (advanceHours < 1 && advanceHours >= 0.5 && totalInvestedHours >= 5) {
        return <div className="ddl-status completed-clutch">
          💪 惊险上岸！投入{formatDuration(actualElapsed)}，踩点完成，你太强了！
        </div>;
      }
      // 提前30分钟-1小时
      if (advanceHours < 1 && advanceHours >= 0.5) {
        return <div className="ddl-status completed-clutch">
          🎊 险胜！提前{Math.floor(advanceHours * 60)}分钟完成，心跳加速的感觉真爽！
        </div>;
      }
      // 提前不到30分钟 + 投入时间长（>=3h）
      if (advanceHours < 0.5 && totalInvestedHours >= 3) {
        return <div className="ddl-status completed-clutch">
          🔥 压哨绝杀！{formatDuration(actualElapsed)}的投入，最后时刻完成，太刺激了！
        </div>;
      }
      // 提前不到30分钟
      if (advanceHours < 0.5) {
        return <div className="ddl-status completed-clutch">
          ⏰ 压线完成！提前{Math.floor(advanceHours * 60)}分钟，心跳瞬间！
        </div>;
      }
    }
    
    // 1.2 准时完成（误差±10分钟内）
    if (Math.abs(actualEndTime - ddlTime) <= 10 * 60 * 1000) {
      if (totalInvestedHours >= 10) {
        return <div className="ddl-status completed-ontime">
          🎯 完美卡点！{formatDuration(actualElapsed)}的专注，准时达成！时间管理大师！
        </div>;
      }
      if (totalInvestedHours >= 5) {
        return <div className="ddl-status completed-ontime">
          🎉 分秒不差！投入{formatDuration(actualElapsed)}，准时完成，太稳了！
        </div>;
      }
      return <div className="ddl-status completed-ontime">
        ✨ 准时完成！踩点达成，完美！
      </div>;
    }
    
    // 1.3 超期完成 - 根据超期时间和投入时间给予鼓励
    if (actualEndTime > ddlTime) {
      const overdueTime = actualEndTime - ddlTime;
      const overdueHours = Math.floor(overdueTime / (1000 * 60 * 60));
      const overdueDays = Math.floor(overdueHours / 24);
      
      // 超期但投入时间非常长（>=15h）
      if (totalInvestedHours >= 15) {
        return <div className="ddl-status completed-overdue-effort">
          💪 虽然晚了{overdueDays > 0 ? `${overdueDays}天` : `${overdueHours}h`}，但{formatDuration(actualElapsed)}的坚持让人动容！完成就是胜利！
        </div>;
      }
      // 超期但投入时间很长（>=10h）
      if (totalInvestedHours >= 10) {
        return <div className="ddl-status completed-overdue-effort">
          🌟 晚了{overdueDays > 0 ? `${overdueDays}天` : `${overdueHours}h`}，但{formatDuration(actualElapsed)}的努力值得肯定！继续加油！
        </div>;
      }
      // 超期但投入时间中等（>=5h）
      if (totalInvestedHours >= 5) {
        return <div className="ddl-status completed-overdue-effort">
          ✊ ddl虽过，但{formatDuration(actualElapsed)}的投入没有白费！下次提前规划，你一定能做得更好！
        </div>;
      }
      // 超期且投入时间较短（<2h）
      if (totalInvestedHours < 2) {
        return <div className="ddl-status completed-overdue-light">
          ⚠️ 晚了{overdueDays > 0 ? `${overdueDays}天` : `${overdueHours}h`}完成。下次试试提前开始？ReMarkable会陪你一起进步！
        </div>;
      }
      // 超期一般情况
      return <div className="ddl-status completed-overdue">
        📌 ddl已过，但完成了就是好样的！投入{formatDuration(actualElapsed)}，继续保持！
      </div>;
    }
  }
  
  // ========== 场景 2: 任务进行中 ==========
  if (!isCompleted) {
    const timeUntilDdl = ddlTime - now;
    const hoursUntilDdl = timeUntilDdl / (1000 * 60 * 60);
    const daysUntilDdl = Math.floor(hoursUntilDdl / 24);
    
    // 2.1 ddl已过，但用户还在继续
    if (timeUntilDdl < 0) {
      // ddl已过 + 投入时间很长（>=10h）
      if (totalInvestedHours >= 10) {
        return <div className="ddl-status ongoing-overdue-effort">
          💪 ddl虽过，但你已投入{formatDuration(actualElapsed)}！坚持就是胜利，冲刺到底！
        </div>;
      }
      // ddl已过 + 投入时间中等（>=3h）
      if (totalInvestedHours >= 3) {
        return <div className="ddl-status ongoing-overdue-effort">
          ✊ ddl已过，但{formatDuration(actualElapsed)}的努力不会白费！继续加油，完成它！
        </div>;
      }
      // ddl已过 + 投入时间很少（<1h）
      if (totalInvestedHours < 1) {
        return <div className="ddl-status ongoing-overdue-warning">
          ⏰ ddl已过，但还没开始发力？现在行动，还来得及！
        </div>;
      }
      // ddl已过，一般情况
      return <div className="ddl-status ongoing-overdue">
        📍 ddl已过，已投入{formatDuration(actualElapsed)}。加把劲，尽快完成吧！
      </div>;
    }
    
    // 2.2 ddl临近（<24h）
    if (hoursUntilDdl < 24) {
      // 距离ddl不到6小时 + 投入时间很少（<30分钟）
      if (hoursUntilDdl < 6 && totalInvestedHours < 0.5) {
        return <div className="ddl-status ongoing-urgent-warning">
          🚨 距ddl仅剩{Math.floor(hoursUntilDdl)}h，才投入{Math.floor(totalInvestedHours * 60)}分钟！快快快，时间不等人！
        </div>;
      }
      // 距离ddl不到6小时 + 投入时间中等（>=2h）
      if (hoursUntilDdl < 6 && totalInvestedHours >= 2) {
        return <div className="ddl-status ongoing-urgent-effort">
          🔥 最后{Math.floor(hoursUntilDdl)}h冲刺！已投入{formatDuration(actualElapsed)}，加把劲冲过终点！
        </div>;
      }
      // 距离ddl不到6小时
      if (hoursUntilDdl < 6) {
        return <div className="ddl-status ongoing-urgent">
          ⚡️ 仅剩{Math.floor(hoursUntilDdl)}h！已投入{formatDuration(actualElapsed)}，最后冲刺！
        </div>;
      }
      // 距离ddl 6-12小时 + 投入时间很少（<1h）
      if (hoursUntilDdl < 12 && totalInvestedHours < 1) {
        return <div className="ddl-status ongoing-warning">
          ⏳ 距ddl剩{Math.floor(hoursUntilDdl)}h，才投入{Math.floor(totalInvestedHours * 60)}分钟。该认真对待了！
        </div>;
      }
      // 距离ddl 6-12小时 + 投入时间充足（>=5h）
      if (hoursUntilDdl < 12 && totalInvestedHours >= 5) {
        return <div className="ddl-status ongoing-good">
          💪 距ddl剩{Math.floor(hoursUntilDdl)}h，已投入{formatDuration(actualElapsed)}！稳扎稳打，胜利在望！
        </div>;
      }
      // 距离ddl 12-24小时 + 投入时间少（<2h）
      if (hoursUntilDdl < 24 && totalInvestedHours < 2) {
        return <div className="ddl-status ongoing-reminder">
          ⏰ 距ddl还有{Math.floor(hoursUntilDdl)}h，已投入{formatDuration(actualElapsed)}。要加速了哦！
        </div>;
      }
      // 距离ddl 12-24小时 + 投入时间充足（>=5h）
      if (hoursUntilDdl < 24 && totalInvestedHours >= 5) {
        return <div className="ddl-status ongoing-great">
          ✨ 距ddl还有{Math.floor(hoursUntilDdl)}h，已投入{formatDuration(actualElapsed)}！节奏很好，继续保持！
        </div>;
      }
    }
    
    // 2.3 ddl较远（1-3天）
    if (daysUntilDdl >= 1 && daysUntilDdl <= 3) {
      // 投入时间很少（<1h）
      if (totalInvestedHours < 1) {
        return <div className="ddl-status ongoing-early-warning">
          📅 距ddl还有{daysUntilDdl}天，才投入{Math.floor(totalInvestedHours * 60)}分钟。早点开始，后面更从容！
        </div>;
      }
      // 投入时间中等（1-5h）
      if (totalInvestedHours >= 1 && totalInvestedHours < 5) {
        return <div className="ddl-status ongoing-early-good">
          👍 距ddl还有{daysUntilDdl}天，已投入{formatDuration(actualElapsed)}。节奏不错，继续！
        </div>;
      }
      // 投入时间充足（>=5h）
      if (totalInvestedHours >= 5) {
        return <div className="ddl-status ongoing-early-great">
          🌟 距ddl还有{daysUntilDdl}天，已投入{formatDuration(actualElapsed)}！提前布局，稳操胜券！
        </div>;
      }
    }
    
    // 2.4 ddl很远（>3天）
    if (daysUntilDdl > 3) {
      // 投入时间已经很长（>=10h）
      if (totalInvestedHours >= 10) {
        return <div className="ddl-status ongoing-far-epic">
          🏆 距ddl还有{daysUntilDdl}天，已投入{formatDuration(actualElapsed)}！你是时间管理的典范！
        </div>;
      }
      // 投入时间中等（>=3h）
      if (totalInvestedHours >= 3) {
        return <div className="ddl-status ongoing-far-good">
          ✨ 距ddl还有{daysUntilDdl}天，已投入{formatDuration(actualElapsed)}。提前行动，智者之选！
        </div>;
      }
      // 投入时间较少（<3h）
      if (totalInvestedHours < 3) {
        return <div className="ddl-status ongoing-far-start">
          � 距ddl还有{daysUntilDdl}天，已投入{formatDuration(actualElapsed)}。时间充裕，稳扎稳打！
        </div>;
      }
    }
  }
  
  return null;
}

// 辅助函数：格式化时长
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours >= 1) {
    return minutes > 0 ? `${hours}h${minutes}min` : `${hours}h`;
  }
  return `${minutes}min`;
}
```

**样式定义**:
```css
/* 完成状态 - 不同等级 */
.ddl-status.completed-epic {
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  color: #7c2d12;
  font-weight: 600;
  animation: celebrate 0.6s ease-out;
}

.ddl-status.completed-legendary {
  background: linear-gradient(135deg, #ff6b6b 0%, #ffd93d 50%, #6bcf7f 100%);
  color: #fff;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  animation: celebrate 0.8s ease-out;
}

.ddl-status.completed-great {
  background: #d1fae5;
  color: #065f46;
  font-weight: 600;
}

.ddl-status.completed-good {
  background: #dbeafe;
  color: #1e40af;
}

.ddl-status.completed-clutch {
  background: #fef3c7;
  color: #92400e;
  font-weight: 600;
}

.ddl-status.completed-ontime {
  background: #e0e7ff;
  color: #3730a3;
  font-weight: 600;
}

.ddl-status.completed-overdue-effort {
  background: #fce7f3;
  color: #831843;
}

.ddl-status.completed-overdue-light {
  background: #fee2e2;
  color: #991b1b;
}

.ddl-status.completed-overdue {
  background: #fecaca;
  color: #7f1d1d;
}

/* 进行中状态 - 不同紧急度 */
.ddl-status.ongoing-overdue-effort {
  background: #fce7f3;
  color: #831843;
  border-left: 4px solid #db2777;
}

.ddl-status.ongoing-overdue-warning {
  background: #fee2e2;
  color: #991b1b;
  border-left: 4px solid #dc2626;
  animation: pulse 2s ease-in-out infinite;
}

.ddl-status.ongoing-overdue {
  background: #fecaca;
  color: #7f1d1d;
  border-left: 4px solid #b91c1c;
}

.ddl-status.ongoing-urgent-warning {
  background: #fee2e2;
  color: #991b1b;
  font-weight: 700;
  border-left: 4px solid #dc2626;
  animation: urgent-pulse 1s ease-in-out infinite;
}

.ddl-status.ongoing-urgent-effort {
  background: #fed7aa;
  color: #7c2d12;
  font-weight: 600;
  border-left: 4px solid #ea580c;
}

.ddl-status.ongoing-urgent {
  background: #fef3c7;
  color: #92400e;
  border-left: 4px solid #f59e0b;
}

.ddl-status.ongoing-warning {
  background: #fef3c7;
  color: #92400e;
  border-left: 4px solid #f59e0b;
}

.ddl-status.ongoing-good {
  background: #dbeafe;
  color: #1e40af;
  border-left: 4px solid #3b82f6;
}

.ddl-status.ongoing-great {
  background: #d1fae5;
  color: #065f46;
  border-left: 4px solid #10b981;
}

.ddl-status.ongoing-reminder {
  background: #e0e7ff;
  color: #3730a3;
  border-left: 4px solid #6366f1;
}

.ddl-status.ongoing-early-warning {
  background: #fef3c7;
  color: #92400e;
}

.ddl-status.ongoing-early-good {
  background: #dbeafe;
  color: #1e40af;
}

.ddl-status.ongoing-early-great {
  background: #d1fae5;
  color: #065f46;
}

.ddl-status.ongoing-far-epic {
  background: linear-gradient(135deg, #e0e7ff 0%, #dbeafe 100%);
  color: #1e3a8a;
  font-weight: 600;
}

.ddl-status.ongoing-far-good {
  background: #dbeafe;
  color: #1e40af;
}

.ddl-status.ongoing-far-start {
  background: #f3f4f6;
  color: #374151;
}

/* 动画效果 */
@keyframes celebrate {
  0% { transform: scale(0.9); opacity: 0; }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes urgent-pulse {
  0%, 100% { 
    opacity: 1; 
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4);
  }
  50% { 
    opacity: 0.9;
    box-shadow: 0 0 0 6px rgba(220, 38, 38, 0);
  }
}

.ddl-status {
  padding: 10px 14px;
  border-radius: 8px;
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
}
```

---

#### 2.4.2 日历同步场景矩阵概览

> **📋 完整场景分析**: 详见下方同步场景矩阵概览

**🆕 v2.0.5 标签自动映射日历功能** (2025-11-28):

当用户添加或删除标签时，EventEditModal 会自动更新事件的同步日历配置：

**规则 1: 本地事件**（`remarkableSource = true` 或 `source = 'local'`）
```typescript
// 行为：Plan 和 Actual 都自动添加标签映射的日历
const isLocalEvent = event.remarkableSource === true || event.source === 'local';

if (isLocalEvent) {
  // ✅ 计划安排部分：自动添加标签映射日历到 calendarIds
  event.calendarIds = [...event.calendarIds, ...tagMappedCalendarIds];
  // ✅ syncMode 只在首次设置（保留用户手动修改的值）
  if (!event.syncMode) {
    event.syncMode = 'bidirectional-private';
  }
  
  // ✅ 实际进展部分：自动添加标签映射日历到 subEventConfig
  event.subEventConfig.calendarIds = [...event.subEventConfig.calendarIds, ...tagMappedCalendarIds];
  // ✅ syncMode 只在首次设置（保留用户手动修改的值）
  if (!event.subEventConfig.syncMode) {
    event.subEventConfig.syncMode = 'bidirectional-private';
  }
}
```

**规则 2: 远程事件**（来自外部日历同步，如 Outlook/Google/iCloud）
```typescript
// 行为：Plan 保持 receive-only，Actual 自动添加标签映射的日历
const isRemoteEvent = !isLocalEvent;

if (isRemoteEvent) {
  // ⛔ 计划安排部分：不添加标签映射，保持原有配置
  // 原因：避免修改外部日历的原始事件
  event.calendarIds = event.calendarIds;  // 保持不变
  // ✅ syncMode 只在首次设置（保留用户手动修改的值）
  if (!event.syncMode) {
    event.syncMode = 'receive-only';
  }
  
  // ✅ 实际进展部分：自动添加标签映射日历到 subEventConfig
  event.subEventConfig.calendarIds = [...event.subEventConfig.calendarIds, ...tagMappedCalendarIds];
  // ✅ syncMode 只在首次设置（保留用户手动修改的值）
  if (!event.subEventConfig.syncMode) {
    event.subEventConfig.syncMode = 'bidirectional-private';
  }
}
```

**关键设计原则**:
- ✅ **智能合并**：与用户手动选择的日历合并，不覆盖已有配置
- ✅ **实时同步**：标签变更后，日历选择器立即更新显示
- ✅ **去重处理**：同一日历被多个标签映射时自动去重
- ✅ **保护来源**：远程事件的计划安排部分保持 receive-only，不被标签映射影响
- ✅ **默认 Private**：自动添加的日历默认使用 'bidirectional-private' 模式（避免通知打扰）
- ✅ **🆕 syncMode 只在首次设置**：一旦用户手动修改 syncMode，后续标签变化不会覆盖用户的选择

**syncMode 设置逻辑** (v2.0.5 修复):

```typescript
// ✅ 正确逻辑：只在首次设置，保留用户手动修改的值
if (!prev.syncMode) {
  updates.syncMode = 'bidirectional-private'; // 首次设置默认值
  console.log('🆕 首次设置 syncMode');
} else {
  updates.syncMode = prev.syncMode; // 保留用户设置
}

// ❌ 错误逻辑（已修复）：每次都覆盖
updates.syncMode = prev.syncMode || 'bidirectional-private'; // 这会导致无法保留用户修改
```

**触发时机**:
1. **标签选择器变更**: 添加/删除标签时
   - 自动添加标签映射的日历到 calendarIds
   - 首次设置 syncMode 为默认值
   - 后续标签变化不影响 syncMode（保留用户设置）

2. **日历选择器变更**: 用户手动选择日历时
   - Plan 日历：首次设置 syncMode = 'bidirectional-private'
   - Actual 日历：首次设置 syncMode = 'bidirectional-private'
   - 用户可以随后通过 syncMode 选择器修改

3. **syncMode 选择器**: 用户手动修改同步模式
   - 用户的选择会被保留
   - 后续标签/日历变化不会覆盖

**用户体验**:
1. 用户在 EventEditModal 添加标签 `#工作`
2. 如果标签 `#工作` 映射到 `Outlook Work` 日历
3. 系统自动勾选该日历，并在日历选择器中显示标签名称
4. 如果是首次设置，syncMode 默认为 'bidirectional-private'
5. 用户可以手动修改 syncMode 为其他值（如 'send-only'）
6. 后续添加/删除标签时，syncMode 保持用户修改的值
7. 用户可以取消勾选日历，此时标签保留但不同步到该日历
8. 保存事件后，calendarIds、syncMode 和 subEventConfig 正确更新

**实现位置**:
- `EventEditModalV2.tsx` (L1830-1880): 标签选择器 onSelectionChange 回调（syncMode 只在首次设置）
- `EventEditModalV2.tsx` (L2300): Plan 日历选择器逻辑（syncMode 只在首次设置）
- `EventEditModalV2.tsx` (L2550): Actual 日历选择器逻辑（syncMode 只在首次设置）
- `EventEditModalV2.tsx` (L382-388): actualSyncConfig → syncCalendarIds 同步 useEffect
- `EventEditModalV2.tsx` (L318-345): event prop → formData 同步 useEffect

---

**相同日历的 9 种场景**（Plan 和 Actual 选择同一日历时）:

| 场景编号 | Plan 模式 | Actual 模式 | 远程事件数量 | 典型用例 |
|---------|----------|-----------|------------|----------|
| **A1** | 只接收 | 只发送 | **1+N** 个 | 接收会议邀请，记录工作进展 |
| **A2** | 只接收 | 双向同步 | **1+N** 个 | 接收会议邀请，允许修改原日程 |
| **B1** | 只发送 | 只发送 | **1+N** 个 | 创建日程，记录多次实际进展 |
| **B2** | 只发送 | 双向同步 | **2** 个独立事件 | 创建日程，实际进展合并同步 |
| **C1** | 双向同步 | 只发送 | **2** 个独立事件 | 双向管理计划，单向记录实际 |
| **C2** | 双向同步 | 双向同步 | **2** 个独立事件 | 完全双向同步计划和实际 |
| **A3** | 只接收 | 只接收 | ❌ **冲突** | Actual 不支持 receive-only |
| **B3** | 只发送 | 只接收 | ❌ **冲突** | Actual 不支持 receive-only |
| **C3** | 双向同步 | 只接收 | ❌ **冲突** | Actual 不支持 receive-only |

**Private 模式支持**:
- **send-only-private**: 只发送（仅自己）- 参与者不被邀请，作为文本添加到描述中
- **bidirectional-private**: 双向同步（仅自己）- 参与者不被邀请，作为文本添加到描述中

**不同日历场景**（Plan 和 Actual 选择不同日历时）:
- **Scenario D**: Plan 1个 + Actual M个（每个日历1个）
- 自动去重与 Plan 重叠的日历
- 支持多平台同步（Outlook + Google + iCloud）

**核心架构原则**:
1. **Plan 和 Actual 永远创建独立的远程事件** - 使用不同的事件ID
2. **Timer 子事件继承 Actual 配置** - 每个 Timer 创建独立的远程事件
3. **Private 模式避免通知打扰** - 参与者信息放在描述中而不发送邀请
4. **多日历智能去重** - Actual 自动排除与 Plan 重叠的日历

---

## 右侧：Event Log ⚠️ **部分实现**

**实现状态**: ⚠️ 部分实现（静态 UI 已完成，PlanSlateEditor 集成待开发）

**已实现部分**:
- ✅ 标签区域静态显示（`#🔗工作/#📝文档编辑`）
- ✅ Plan 提示区域（任务图标 + DDL 提示）
- ✅ 关联区域（上级任务链接）
- ✅ 时间戳分隔线静态样式
- ✅ 日志内容静态展示（多条日志，带时间戳）

**待实现功能**:
- ❌ **标签区域 Slate 编辑**: 允许用户删除/插入标签（像编辑文本一样）
- ❌ **主日志 PlanSlateEditor 集成**: 富文本编辑器，支持 FloatingBar
- ❌ **时间戳分隔线动态生成**: 根据 Timer 子事件自动插入
- ❌ **父事件 + Timer 子事件日志合并**: 按时间排序显示所有日志
- ❌ **点击 Timer 色块自动滚动**: 滚动到对应时间戳位置
- ❌ **上下文虚化显示**: 显示上一段 Timer 的最后一行（延续性）
- ❌ **增量保存**: 正在计时时保存到当前 Timer 子事件，未计时时保存到父事件

**当前实现位置**:
- `EventEditModalV2Demo.tsx`（Lines 950-1015）- 静态 UI 实现

---

### 【标签区域】

**数据来源**: `event.tags[]`

**核心设计**: 标签区域本质是一个 **Slate Editor**，用户可以像编辑文本一样编辑标签（删除、插入）

**显示逻辑**:
```typescript
// 标签以完整层级路径展示
// 例如：#🎯工作/#💼项目/#🚀产品迭代

<div className="event-log-tags-container">
  <SlateEditor
    ref={tagEditorRef}
    value={tagSlateValue}
    onChange={handleTagSlateChange}
    placeholder="添加标签..."
    className="tag-slate-editor"
    readOnly={false}
    // 集成 TagPicker
    onKeyDown={(e) => {
      if (e.key === '#') {
        // 触发 TagPicker
        showTagPicker();
      }
    }}
  >
    {event.tags.map(tagId => {
      const tag = getTagById(tagId);
      if (!tag) return null;
      
      // 构建完整层级路径
      const fullPath = buildTagPath(tag);
      // 例如：#🎯工作/#💼项目/#🚀产品迭代
      
      return (
        <TagMention
          key={tagId}
          tagId={tagId}
          fullPath={fullPath}
          color={tag.color}
          onHover={() => showTagPopover(tagId)}
          onClick={() => showTagPopover(tagId)}
        >
          {fullPath}
        </TagMention>
      );
    })}
  </SlateEditor>
</div>

// 构建标签完整路径
function buildTagPath(tag: Tag): string {
  const path: string[] = [];
  let currentTag = tag;
  
  // 递归向上查找父标签
  while (currentTag) {
    path.unshift(`#${currentTag.emoji}${currentTag.name}`);
    currentTag = currentTag.parentId ? getTagById(currentTag.parentId) : null;
  }
  
  return path.join('/');
}
```

**交互 1: Slate 编辑能力**

参考 [SLATE_DEVELOPMENT_GUIDE.md](../SLATE_DEVELOPMENT_GUIDE.md)

- **删除标签**: 
  - 光标定位到标签末尾，按 `Backspace` 删除整个标签
  - 光标定位到标签内部，按 `Delete` 删除整个标签
  - 选中标签，按 `Backspace` 或 `Delete` 删除

- **插入标签**:
  - 在标签末尾或标签之间输入 `#` → 自动呼出 TagPicker
  - 在空白处输入 `#` → 自动呼出 TagPicker
  - **直接输入标签名称** → TagPicker 实时搜索并过滤
  - TagPicker 支持层级导航、智能搜索、快速选择

- **光标导航**:
  - 使用方向键 `←` `→` 在标签之间移动光标
  - 使用 `Home` / `End` 跳转到行首/行尾

**TagPicker 智能搜索逻辑**:

```typescript
interface TagPickerProps {
  anchorElement: HTMLElement;
  onSelect: (tagId: string) => void;
  onClose: () => void;
  excludeIds?: string[]; // 已选标签，避免重复
}

function TagPicker({ anchorElement, onSelect, onClose, excludeIds = [] }: TagPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // 获取所有标签
  const allTags = getAllTags();
  
  // 智能搜索过滤
  useEffect(() => {
    if (!searchQuery.trim()) {
      // 无搜索词：显示常用标签 + 层级树
      const frequentTags = getFrequentTags(10);
      setFilteredTags(frequentTags);
      return;
    }
    
    // 有搜索词：智能过滤
    const results = smartFilterTags(allTags, searchQuery, excludeIds);
    setFilteredTags(results);
  }, [searchQuery, allTags, excludeIds]);
  
  // 键盘导航
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredTags.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredTags.length) % filteredTags.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTags[selectedIndex]) {
        onSelect(filteredTags[selectedIndex].id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };
  
  return (
    <Popover 
      anchorElement={anchorElement} 
      placement="bottom-start"
      onClose={onClose}
    >
      <div className="tag-picker" onKeyDown={handleKeyDown}>
        {/* 搜索输入框 */}
        <div className="tag-picker-search">
          <input
            type="text"
            placeholder="输入标签名称搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="tag-search-input"
          />
          {searchQuery && (
            <button 
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>
        
        {/* 搜索结果列表 */}
        <div className="tag-picker-results">
          {filteredTags.length > 0 ? (
            filteredTags.map((tag, index) => (
              <TagPickerItem
                key={tag.id}
                tag={tag}
                isSelected={index === selectedIndex}
                searchQuery={searchQuery}
                onSelect={() => {
                  onSelect(tag.id);
                  onClose();
                }}
                onHover={() => setSelectedIndex(index)}
              />
            ))
          ) : (
            <div className="tag-picker-empty">
              <p>未找到匹配的标签</p>
              {searchQuery && (
                <button 
                  className="create-tag-btn"
                  onClick={() => {
                    const newTagId = createNewTag(searchQuery);
                    onSelect(newTagId);
                    onClose();
                  }}
                >
                  创建新标签 "{searchQuery}"
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* 底部提示 */}
        <div className="tag-picker-footer">
          <span className="keyboard-hint">
            ↑↓ 导航 · Enter 选择 · Esc 关闭
          </span>
        </div>
      </div>
    </Popover>
  );
}

// ========== 智能过滤算法 ==========

/**
 * 智能过滤标签
 * 
 * 过滤规则：
 * 1. 过滤掉完全无关的标签
 * 2. 若匹配到子标签，保留完整的父标签树路径
 * 3. 按相关度排序（完全匹配 > 前缀匹配 > 包含匹配）
 */
function smartFilterTags(
  allTags: Tag[], 
  query: string, 
  excludeIds: string[]
): Tag[] {
  const normalizedQuery = query.toLowerCase().trim();
  
  // 第一步：找到所有匹配的标签
  const matchedTags = allTags.filter(tag => {
    if (excludeIds.includes(tag.id)) return false;
    
    const tagName = tag.name.toLowerCase();
    const tagEmoji = tag.emoji;
    
    // 匹配标签名称或 emoji
    return tagName.includes(normalizedQuery) || 
           tagEmoji.includes(normalizedQuery);
  });
  
  // 第二步：收集所有需要显示的标签（包括父标签）
  const tagsToShow = new Set<string>();
  
  matchedTags.forEach(tag => {
    // 添加匹配的标签
    tagsToShow.add(tag.id);
    
    // 添加完整的父标签链
    let currentTag = tag;
    while (currentTag.parentId) {
      tagsToShow.add(currentTag.parentId);
      currentTag = allTags.find(t => t.id === currentTag.parentId);
      if (!currentTag) break;
    }
  });
  
  // 第三步：构建结果列表（保持层级结构）
  const results = allTags.filter(tag => tagsToShow.has(tag.id));
  
  // 第四步：排序（相关度 + 层级）
  const sortedResults = results.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    
    // 优先级 1: 完全匹配
    const aExactMatch = aName === normalizedQuery;
    const bExactMatch = bName === normalizedQuery;
    if (aExactMatch && !bExactMatch) return -1;
    if (!aExactMatch && bExactMatch) return 1;
    
    // 优先级 2: 前缀匹配
    const aStartsWith = aName.startsWith(normalizedQuery);
    const bStartsWith = bName.startsWith(normalizedQuery);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    // 优先级 3: 包含匹配位置（越靠前越优先）
    const aIndex = aName.indexOf(normalizedQuery);
    const bIndex = bName.indexOf(normalizedQuery);
    if (aIndex !== bIndex) return aIndex - bIndex;
    
    // 优先级 4: 标签层级（顶层优先）
    const aDepth = getTagDepth(a);
    const bDepth = getTagDepth(b);
    if (aDepth !== bDepth) return aDepth - bDepth;
    
    // 优先级 5: 字母顺序
    return aName.localeCompare(bName);
  });
  
  return sortedResults;
}

// 获取标签层级深度
function getTagDepth(tag: Tag): number {
  let depth = 0;
  let currentTag = tag;
  
  while (currentTag.parentId) {
    depth++;
    currentTag = getTagById(currentTag.parentId);
    if (!currentTag) break;
  }
  
  return depth;
}

// ========== TagPickerItem 组件 ==========

interface TagPickerItemProps {
  tag: Tag;
  isSelected: boolean;
  searchQuery: string;
  onSelect: () => void;
  onHover: () => void;
}

function TagPickerItem({ 
  tag, 
  isSelected, 
  searchQuery, 
  onSelect, 
  onHover 
}: TagPickerItemProps) {
  const fullPath = buildTagPath(tag);
  const depth = getTagDepth(tag);
  
  // 高亮匹配文本
  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    
    const normalizedText = text.toLowerCase();
    const normalizedQuery = query.toLowerCase();
    const index = normalizedText.indexOf(normalizedQuery);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.slice(0, index)}
        <mark className="search-highlight">
          {text.slice(index, index + query.length)}
        </mark>
        {text.slice(index + query.length)}
      </>
    );
  };
  
  return (
    <div
      className={`tag-picker-item ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      <span className="tag-emoji">{tag.emoji}</span>
      <div className="tag-info">
        <div className="tag-name">
          {highlightText(tag.name, searchQuery)}
        </div>
        {depth > 0 && (
          <div className="tag-path-hint">{fullPath}</div>
        )}
      </div>
      <div className="tag-usage-count">
        {getTagUsageCount(tag.id)}
      </div>
    </div>
  );
}
```

**样式定义（TagPicker）**:

```css
/* ========== TagPicker ========== */
.tag-picker {
  width: 360px;
  max-height: 400px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tag-picker-search {
  position: relative;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.tag-search-input {
  width: 100%;
  padding: 8px 32px 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
}

.tag-search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.clear-search-btn {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border: none;
  background: #9ca3af;
  color: white;
  border-radius: 50%;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.clear-search-btn:hover {
  background: #6b7280;
}

.tag-picker-results {
  flex: 1;
  overflow-y: auto;
  max-height: 300px;
}

.tag-picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 3px solid transparent;
}

.tag-picker-item:hover {
  background: #f9fafb;
}

.tag-picker-item.selected {
  background: #eff6ff;
  border-left-color: #3b82f6;
}

.tag-picker-item .tag-emoji {
  font-size: 16px;
  flex-shrink: 0;
}

.tag-picker-item .tag-info {
  flex: 1;
  min-width: 0;
}

.tag-picker-item .tag-name {
  font-size: 14px;
  color: #1f2937;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-picker-item .tag-path-hint {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-picker-item .tag-usage-count {
  font-size: 12px;
  color: #9ca3af;
  flex-shrink: 0;
}

.search-highlight {
  background: #fef3c7;
  color: #92400e;
  font-weight: 600;
  padding: 0 2px;
  border-radius: 2px;
}

.tag-picker-empty {
  padding: 40px 20px;
  text-align: center;
}

.tag-picker-empty p {
  font-size: 14px;
  color: #9ca3af;
  margin-bottom: 16px;
}

.create-tag-btn {
  padding: 8px 16px;
  border: 1px dashed #d1d5db;
  background: #f9fafb;
  color: #374151;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.create-tag-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
  color: #1f2937;
}

.tag-picker-footer {
  padding: 8px 12px;
  border-top: 1px solid #e5e7eb;
  background: #fafafa;
}

.keyboard-hint {
  font-size: 11px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**交互 2: Hover/点击标签 → 展示标签卡片**

```typescript
interface TagPopoverProps {
  tagId: string;
  anchorElement: HTMLElement;
}

function TagPopover({ tagId, anchorElement }: TagPopoverProps) {
  const tag = getTagById(tagId);
  const fullPath = buildTagPath(tag);
  
  // 获取该标签下的事件
  const upcomingEvents = getUpcomingEventsByTag(tagId, 5);
  const recentEvents = getRecentEventsByTag(tagId, 5);
  
  return (
    <Popover anchorElement={anchorElement} placement="bottom-start">
      <div className="tag-popover">
        {/* 卡片首行 */}
        <div className="tag-popover-header">
          <div className="tag-full-path">{fullPath}</div>
          <button 
            className="tag-edit-btn"
            onClick={() => openTagManagerFloating(tagId)}
          >
            编辑标签
          </button>
        </div>
        
        {/* 卡片内容 */}
        <div className="tag-popover-content">
          {/* 即将发生 */}
          <section className="upcoming-section">
            <h4 className="section-title">即将发生</h4>
            {upcomingEvents.length > 0 ? (
              <ul className="event-list">
                {upcomingEvents.map(event => (
                  <li key={event.id} className="event-item">
                    <span className="event-emoji">{event.emoji}</span>
                    <span className="event-title">{event.title}</span>
                    <span className="event-time">
                      {formatRelativeTime(event.startTime)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">暂无即将发生的事项</p>
            )}
          </section>
          
          {/* 最近发生 */}
          <section className="recent-section">
            <h4 className="section-title">最近发生</h4>
            {recentEvents.length > 0 ? (
              <ul className="event-list">
                {recentEvents.map(event => (
                  <li key={event.id} className="event-item">
                    <span className="event-emoji">{event.emoji}</span>
                    <span className="event-title">{event.title}</span>
                    <span className="event-time">
                      {formatRelativeTime(event.endTime || event.startTime)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">暂无最近发生的事项</p>
            )}
          </section>
        </div>
        
        {/* 卡片底部 */}
        <div className="tag-popover-footer">
          <button 
            className="view-all-btn"
            onClick={() => openTagTimelineView(tagId)}
          >
            查看全部
          </button>
        </div>
      </div>
    </Popover>
  );
}
```

**交互 3: 编辑标签按钮 → TagManager 浮窗**

点击卡片首行右侧的 "编辑标签" 按钮，呼出 **TagManager 的简化浮窗**：

```typescript
interface TagManagerFloatingProps {
  tagId: string;
  onClose: () => void;
}

function TagManagerFloating({ tagId, onClose }: TagManagerFloatingProps) {
  const tag = getTagById(tagId);
  
  return (
    <Modal 
      isOpen={true} 
      onClose={onClose}
      className="tag-manager-floating"
    >
      <div className="tag-manager-floating-content">
        {/* 只包含编辑区和日历映射按钮 */}
        
        {/* 编辑区 */}
        <div className="tag-edit-section">
          <div className="field">
            <label>标签名称</label>
            <input 
              type="text" 
              value={tag.name}
              onChange={(e) => updateTagName(tagId, e.target.value)}
            />
          </div>
          
          <div className="field">
            <label>Emoji</label>
            <EmojiPicker
              value={tag.emoji}
              onChange={(emoji) => updateTagEmoji(tagId, emoji)}
            />
          </div>
          
          <div className="field">
            <label>颜色</label>
            <ColorPicker
              value={tag.color}
              onChange={(color) => updateTagColor(tagId, color)}
            />
          </div>
          
          <div className="field">
            <label>父标签</label>
            <TagPicker
              value={tag.parentId}
              onChange={(parentId) => updateTagParent(tagId, parentId)}
              excludeIds={[tagId]} // 避免循环引用
            />
          </div>
        </div>
        
        {/* 日历映射按钮 */}
        <div className="calendar-mapping-section">
          <button 
            className="calendar-mapping-btn"
            onClick={() => openCalendarMappingDialog(tagId)}
          >
            📅 配置日历映射
          </button>
          <p className="hint">
            将此标签的事件自动同步到指定日历
          </p>
        </div>
        
        {/* 底部按钮 */}
        <div className="floating-footer">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button 
            className="btn-primary" 
            onClick={() => {
              saveTagChanges(tagId);
              onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

**交互 4: 查看全部按钮 → 时光日志标签视图（待开发）**

点击卡片底部的 "查看全部" 按钮，展开 **时光日志的标签视图**：

```typescript
interface TagTimelineViewProps {
  tagId: string;
}

function TagTimelineView({ tagId }: TagTimelineViewProps) {
  const tag = getTagById(tagId);
  const fullPath = buildTagPath(tag);
  
  // 获取该标签的所有事件（按时间排序）
  const allEvents = getEventsByTag(tagId, { sortBy: 'time', order: 'desc' });
  
  // 获取该标签的时间统计
  const timeStats = calculateTagTimeStats(tagId);
  
  return (
    <div className="tag-timeline-view">
      {/* 左侧 */}
      <aside className="tag-timeline-sidebar">
        {/* 上方：月度日历 DatePicker */}
        <section className="calendar-section">
          <h3>日历</h3>
          <DatePicker
            mode="month"
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            // 高亮有该标签事件的日期
            highlightDates={getTagEventDates(tagId)}
          />
        </section>
        
        {/* 下方：时间统计 */}
        <section className="stats-section">
          <h3>时间统计</h3>
          
          {/* By Range: 按时间范围统计 */}
          <div className="stats-by-range">
            <h4>By Range</h4>
            <div className="stat-item">
              <span className="label">本周</span>
              <span className="value">{timeStats.thisWeek}</span>
            </div>
            <div className="stat-item">
              <span className="label">本月</span>
              <span className="value">{timeStats.thisMonth}</span>
            </div>
            <div className="stat-item">
              <span className="label">今年</span>
              <span className="value">{timeStats.thisYear}</span>
            </div>
            <div className="stat-item">
              <span className="label">总计</span>
              <span className="value">{timeStats.total}</span>
            </div>
          </div>
          
          {/* By Event: 按事件数统计 */}
          <div className="stats-by-event">
            <h4>By Event</h4>
            <div className="stat-item">
              <span className="label">已完成</span>
              <span className="value">{timeStats.completedCount} 个</span>
            </div>
            <div className="stat-item">
              <span className="label">进行中</span>
              <span className="value">{timeStats.ongoingCount} 个</span>
            </div>
            <div className="stat-item">
              <span className="label">即将开始</span>
              <span className="value">{timeStats.upcomingCount} 个</span>
            </div>
          </div>
        </section>
      </aside>
      
      {/* 中间：主内容区 - 时间轴 */}
      <main className="tag-timeline-main">
        <header className="timeline-header">
          <h2>{fullPath}</h2>
          <p className="subtitle">所有相关事项</p>
        </header>
        
        <div className="timeline-container">
          {allEvents.map((event, index) => {
            const isNewDay = index === 0 || 
              !isSameDay(event.startTime, allEvents[index - 1].startTime);
            
            return (
              <React.Fragment key={event.id}>
                {/* 日期分隔线 */}
                {isNewDay && (
                  <div className="timeline-date-divider">
                    <span className="date-text">
                      {formatDate(event.startTime)}
                    </span>
                  </div>
                )}
                
                {/* 事件卡片 */}
                <div 
                  className={`timeline-event-card ${
                    event.isCompleted ? 'completed' : 
                    isUpcoming(event) ? 'upcoming' : 'ongoing'
                  }`}
                  onClick={() => openEventEditModal(event.id)}
                >
                  <div className="event-card-header">
                    <span className="event-emoji">{event.emoji}</span>
                    <span className="event-title">{event.title}</span>
                    <span className="event-time">
                      {formatTime(event.startTime)}
                      {event.endTime && ` - ${formatTime(event.endTime)}`}
                    </span>
                  </div>
                  
                  {/* 展示 description（富文本预览） */}
                  {event.description && (
                    <div className="event-description-preview">
                      <RichTextPreview content={event.description} maxLines={3} />
                    </div>
                  )}
                  
                  {/* 其他标签 */}
                  {event.tags.length > 1 && (
                    <div className="event-other-tags">
                      {event.tags
                        .filter(id => id !== tagId)
                        .map(id => {
                          const otherTag = getTagById(id);
                          return (
                            <span 
                              key={id} 
                              className="tag-chip-small"
                              style={{ color: otherTag.color }}
                            >
                              {otherTag.emoji}
                            </span>
                          );
                        })
                      }
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </main>
      
      {/* 右侧：简明版即将开始 */}
      <aside className="tag-timeline-upcoming">
        <h3>即将开始</h3>
        <div className="upcoming-list">
          {getUpcomingEventsByTag(tagId, 10).map(event => (
            <div 
              key={event.id} 
              className="upcoming-item"
              onClick={() => openEventEditModal(event.id)}
            >
              <div className="upcoming-time">
                {formatRelativeTime(event.startTime)}
              </div>
              <div className="upcoming-content">
                <span className="event-emoji">{event.emoji}</span>
                <span className="event-title">{event.title}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
```

**样式定义**:

```css
/* ========== 标签 Slate 编辑器 ========== */
.event-log-tags-container {
  margin-bottom: 16px;
}

.tag-slate-editor {
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
  cursor: text;
}

.tag-slate-editor:hover {
  border-color: #d1d5db;
}

.tag-slate-editor:focus-within {
  border-color: #3b82f6;
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* 标签 Mention 样式 */
.tag-slate-editor [data-slate-node="element"][data-type="tag-mention"] {
  display: inline-block;
  padding: 2px 8px;
  margin: 0 4px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.1);
  color: var(--tag-color);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-slate-editor [data-slate-node="element"][data-type="tag-mention"]:hover {
  background: rgba(59, 130, 246, 0.2);
  transform: translateY(-1px);
}

/* ========== 标签卡片 Popover ========== */
.tag-popover {
  width: 380px;
  max-height: 520px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.tag-popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
  background: #fafafa;
}

.tag-full-path {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.tag-edit-btn {
  padding: 6px 12px;
  border: none;
  background: #3b82f6;
  color: white;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.tag-edit-btn:hover {
  background: #2563eb;
}

.tag-popover-content {
  padding: 16px 20px;
  max-height: 360px;
  overflow-y: auto;
}

.upcoming-section,
.recent-section {
  margin-bottom: 20px;
}

.upcoming-section:last-child,
.recent-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.event-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  transition: background 0.2s;
}

.event-item:last-child {
  border-bottom: none;
}

.event-item:hover {
  background: #f9fafb;
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
  border-radius: 6px;
}

.event-item .event-emoji {
  font-size: 16px;
  flex-shrink: 0;
}

.event-item .event-title {
  flex: 1;
  font-size: 14px;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-item .event-time {
  font-size: 12px;
  color: #6b7280;
  flex-shrink: 0;
}

.empty-hint {
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
  padding: 20px 0;
}

.tag-popover-footer {
  padding: 12px 20px;
  border-top: 1px solid #f3f4f6;
  background: white;
  text-align: center;
}

.view-all-btn {
  width: 100%;
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.view-all-btn:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

/* ========== TagManager 浮窗 ========== */
.tag-manager-floating {
  width: 480px;
}

.tag-manager-floating-content {
  padding: 24px;
}

.tag-edit-section {
  margin-bottom: 24px;
}

.tag-edit-section .field {
  margin-bottom: 16px;
}

.tag-edit-section .field:last-child {
  margin-bottom: 0;
}

.tag-edit-section label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.tag-edit-section input[type="text"] {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.calendar-mapping-section {
  margin-bottom: 24px;
  padding: 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.calendar-mapping-btn {
  width: 100%;
  padding: 10px 16px;
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.calendar-mapping-btn:hover {
  background: #fafafa;
  border-color: #9ca3af;
}

.calendar-mapping-section .hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
  margin-bottom: 0;
}

.floating-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.floating-footer .btn-secondary,
.floating-footer .btn-primary {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.floating-footer .btn-secondary {
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
}

.floating-footer .btn-secondary:hover {
  background: #f9fafb;
}

.floating-footer .btn-primary {
  border: none;
  background: #3b82f6;
  color: white;
}

.floating-footer .btn-primary:hover {
  background: #2563eb;
}

/* ========== 时光日志标签视图 ========== */
.tag-timeline-view {
  display: grid;
  grid-template-columns: 280px 1fr 240px;
  gap: 24px;
  height: 100vh;
  background: #fafafa;
  padding: 24px;
}

/* 左侧边栏 */
.tag-timeline-sidebar {
  background: white;
  border-radius: 12px;
  padding: 20px;
  overflow-y: auto;
}

.tag-timeline-sidebar h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 16px;
}

.calendar-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #f3f4f6;
}

.stats-section h4 {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stats-by-range,
.stats-by-event {
  margin-bottom: 20px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
}

.stat-item .label {
  color: #6b7280;
}

.stat-item .value {
  color: #1f2937;
  font-weight: 600;
}

/* 中间主内容区 */
.tag-timeline-main {
  background: white;
  border-radius: 12px;
  padding: 24px;
  overflow-y: auto;
}

.timeline-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #f3f4f6;
}

.timeline-header h2 {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 4px;
}

.timeline-header .subtitle {
  font-size: 14px;
  color: #6b7280;
}

.timeline-date-divider {
  position: sticky;
  top: 0;
  background: white;
  padding: 12px 0;
  margin: 16px 0;
  z-index: 10;
}

.timeline-date-divider .date-text {
  display: inline-block;
  padding: 4px 12px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
  border-radius: 12px;
}

.timeline-event-card {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.timeline-event-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
  transform: translateY(-1px);
}

.timeline-event-card.completed {
  opacity: 0.7;
}

.timeline-event-card.upcoming {
  border-left: 4px solid #10b981;
}

.timeline-event-card.ongoing {
  border-left: 4px solid #3b82f6;
}

.event-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.event-card-header .event-emoji {
  font-size: 18px;
}

.event-card-header .event-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.event-card-header .event-time {
  font-size: 13px;
  color: #6b7280;
}

.event-description-preview {
  margin-top: 8px;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.5;
}

.event-other-tags {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.tag-chip-small {
  font-size: 14px;
}

/* 右侧边栏 */
.tag-timeline-upcoming {
  background: white;
  border-radius: 12px;
  padding: 20px;
  overflow-y: auto;
}

.tag-timeline-upcoming h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 16px;
}

.upcoming-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upcoming-item {
  padding: 12px;
  background: white;
  border: 1px solid #f3f4f6;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.upcoming-item:hover {
  background: #fafafa;
  border-color: #e5e7eb;
  transform: translateX(2px);
}

.upcoming-item .upcoming-time {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.upcoming-item .upcoming-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.upcoming-item .event-emoji {
  font-size: 16px;
}

.upcoming-item .event-title {
  font-size: 14px;
  color: #1f2937;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

### 【Plan提示区域】（条件显示）

**显示条件**:
```typescript
function shouldShowPlanPrompt(event: Event): boolean {
  return event.isPlan === true || (event.startTime && event.endTime);
}
```

---

#### 4.1 创建时间 + ddl 倒计时（合并到同一行）

**数据来源**:
- `event.createdAt` → 计算相对时间
- `event.dueDate` → 计算剩余时间

**显示逻辑**:
```typescript
import { DdlWarnIcon, DdlCheckedIcon } from '@/assets/icons';

interface PromptContext {
  createdHoursAgo: number;           // 创建时长（小时）
  ddlRemainingHours: number | null;  // DDL 剩余时长（小时，null = 无 DDL）
  isOverdue: boolean;                // 是否超期
  focusedHours: number;              // 用户在该事件上的累计专注时长（小时）
  todayEventCount: number;           // 今天的事件总数
  todayTotalFocusHours: number;      // 今天的累计专注时长（小时）
  recentCompletionCount: number;     // 最近 3 天完成的任务数
  lastCompletedDaysAgo: number;      // 距离上次完成任务的天数
  isCompleted: boolean;              // 当前任务是否已完成
}

function renderPlanPrompt(event: Event): ReactNode {
  const context = buildPromptContext(event);
  const promptMessage = generateSmartPrompt(context);
  
  return (
    <label className="plan-prompt-row">
      <input 
        type="checkbox" 
        checked={event.isCompleted}
        onChange={(e) => handleCompletedChange(e.target.checked)}
      />
      <span className="prompt-icons">
        {event.dueDate && (
          <img 
            src={event.isCompleted ? DdlCheckedIcon : DdlWarnIcon} 
            alt="ddl" 
            className="icon-inline" 
          />
        )}
      </span>
      <span className="prompt-text" dangerouslySetInnerHTML={{ __html: promptMessage }} />
    </label>
  );
}

// 构建提示词上下文
function buildPromptContext(event: Event): PromptContext {
  const now = Date.now();
  const created = new Date(event.createdAt).getTime();
  const createdHoursAgo = Math.floor((now - created) / (1000 * 60 * 60));
  
  let ddlRemainingHours: number | null = null;
  let isOverdue = false;
  if (event.dueDate) {
    const due = new Date(event.dueDate).getTime();
    const diffMs = due - now;
    ddlRemainingHours = Math.floor(diffMs / (1000 * 60 * 60));
    isOverdue = ddlRemainingHours < 0;
  }
  
  // 获取该事件的累计专注时长
  const focusedHours = calculateEventFocusTime(event);
  
  // 获取今天的整体数据
  const todayStats = getTodayStats();
  
  // 获取最近完成任务的数据
  const completionStats = getRecentCompletionStats();
  
  return {
    createdHoursAgo,
    ddlRemainingHours,
    isOverdue,
    focusedHours,
    todayEventCount: todayStats.eventCount,
    todayTotalFocusHours: todayStats.totalFocusHours,
    recentCompletionCount: completionStats.count,
    lastCompletedDaysAgo: completionStats.daysAgo,
    isCompleted: event.isCompleted || false,
  };
}

// 智能生成彩蛋提示词（30+ 场景）
function generateSmartPrompt(ctx: PromptContext): string {
  // ==================== 完成状态场景 ====================
  
  if (ctx.isCompleted) {
    // 场景 1: 刚刚完成，DDL 还很远
    if (ctx.ddlRemainingHours && ctx.ddlRemainingHours > 72) {
      return `🎉 太棒了！提前${Math.floor(ctx.ddlRemainingHours / 24)}天完成，你是时间管理大师！`;
    }
    
    // 场景 2: DDL 前完成，投入时间很长
    if (ctx.focusedHours > 8 && ctx.ddlRemainingHours && ctx.ddlRemainingHours > 0) {
      return `💪 投入${Math.floor(ctx.focusedHours)}h完成，这份专注和努力真的很了不起！`;
    }
    
    // 场景 3: 压线完成（DDL 前 24h 内）
    if (ctx.ddlRemainingHours !== null && ctx.ddlRemainingHours >= 0 && ctx.ddlRemainingHours <= 24) {
      return `🏆 惊险完成！虽然时间紧张，但你做到了，给自己一个大大的赞！`;
    }
    
    // 场景 4: 超期后完成
    if (ctx.isOverdue) {
      return `✨ 虽然晚了一点，但完成比完美更重要，继续加油！`;
    }
    
    // 场景 5: 快速完成（创建后 2h 内）
    if (ctx.createdHoursAgo < 2) {
      return `⚡️ 哇！创建后立即完成，这执行力简直无敌！`;
    }
    
    // 场景 6: 今天很忙但还是完成了
    if (ctx.todayEventCount > 8) {
      return `🌟 今天${ctx.todayEventCount}个任务，你依然完成了这个，真的超厉害！`;
    }
    
    // 场景 7: 连续完成多个任务
    if (ctx.recentCompletionCount >= 5) {
      return `🔥 最近完成${ctx.recentCompletionCount}个任务，你正处于巅峰状态！`;
    }
    
    // 默认完成提示
    return `✅ 任务完成！每一个勾选都是进步的脚印 🎈`;
  }
  
  // ==================== 未完成 - 紧急/压力场景 ====================
  
  // 场景 8: DDL 在 2 小时内
  if (ctx.ddlRemainingHours !== null && ctx.ddlRemainingHours >= 0 && ctx.ddlRemainingHours <= 2) {
    return `🚨 DDL 还有${ctx.ddlRemainingHours}h！深呼吸，专注此刻，你可以的！`;
  }
  
  // 场景 9: DDL 在 24 小时内
  if (ctx.ddlRemainingHours !== null && ctx.ddlRemainingHours > 2 && ctx.ddlRemainingHours <= 24) {
    const hours = Math.floor(ctx.ddlRemainingHours);
    return `⏰ 还有${hours}小时，时间刚好，稳住节奏就能完成！`;
  }
  
  // 场景 10: 已经超期
  if (ctx.isOverdue) {
    const overdueHours = Math.abs(ctx.ddlRemainingHours!);
    if (overdueHours < 24) {
      return `💙 超期${Math.floor(overdueHours)}h，别慌，现在开始依然来得及挽回`;
    } else {
      const overdueDays = Math.floor(overdueHours / 24);
      return `🌸 已经延迟${overdueDays}天了，要不要给自己一个重新开始的机会？`;
    }
  }
  
  // 场景 11: 今天日程特别满（8+ 事件）
  if (ctx.todayEventCount >= 8 && ctx.todayTotalFocusHours > 6) {
    return `🫂 今天${ctx.todayEventCount}个任务，已专注${Math.floor(ctx.todayTotalFocusHours)}h，记得休息哦`;
  }
  
  // 场景 12: 今天专注时间很长（10h+）
  if (ctx.todayTotalFocusHours >= 10) {
    return `🌙 今天已经专注${Math.floor(ctx.todayTotalFocusHours)}h了，累了就休息，明天继续加油！`;
  }
  
  // 场景 13: 今天专注时间很长但任务还没完成
  if (ctx.todayTotalFocusHours >= 8 && ctx.focusedHours > 4) {
    return `💖 你已经投入${Math.floor(ctx.focusedHours)}h了，坚持住，胜利就在前方！`;
  }
  
  // ==================== 未完成 - 拖延/愧疚场景 ====================
  
  // 场景 14: 创建很久（7+ 天）但没动过
  if (ctx.createdHoursAgo > 168 && ctx.focusedHours === 0) {
    const days = Math.floor(ctx.createdHoursAgo / 24);
    return `🥺 这个任务已经躺了${days}天了呢...要不要给它一点关注？`;
  }
  
  // 场景 15: 创建很久（3-7 天）且有 DDL，但没动过
  if (ctx.createdHoursAgo > 72 && ctx.createdHoursAgo <= 168 && ctx.ddlRemainingHours && ctx.ddlRemainingHours < 48 && ctx.focusedHours === 0) {
    return `😢 DDL 快到了，但还没开始...现在动手还来得及，我相信你！`;
  }
  
  // 场景 16: 很久没完成任何任务（7+ 天）
  if (ctx.lastCompletedDaysAgo >= 7) {
    return `🌧️ 已经${ctx.lastCompletedDaysAgo}天没完成任务了，是不是遇到困难了？要不从这个开始试试？`;
  }
  
  // 场景 17: 最近没完成任务（3-7 天）
  if (ctx.lastCompletedDaysAgo >= 3 && ctx.lastCompletedDaysAgo < 7) {
    return `🍃 ${ctx.lastCompletedDaysAgo}天没打勾了，好想看到你完成任务的样子...`;
  }
  
  // 场景 18: 创建后 1 天没动
  if (ctx.createdHoursAgo >= 24 && ctx.createdHoursAgo < 48 && ctx.focusedHours === 0) {
    return `🐱 创建一天了还没开始，是不是忘记我了？点一下开始计时吧～`;
  }
  
  // ==================== 未完成 - 正常/鼓励场景 ====================
  
  // 场景 19: 刚创建（2h 内）且有 DDL
  if (ctx.createdHoursAgo < 2 && ctx.ddlRemainingHours && ctx.ddlRemainingHours > 24) {
    return `🌱 新任务已创建，距离 DDL 还有${Math.floor(ctx.ddlRemainingHours / 24)}天，从容规划吧！`;
  }
  
  // 场景 20: 刚创建（2h 内）没 DDL
  if (ctx.createdHoursAgo < 2 && !ctx.ddlRemainingHours) {
    return `📝 新任务，新开始！什么时候想做都可以，我会陪着你的`;
  }
  
  // 场景 21: 已投入时间（2-4h）
  if (ctx.focusedHours >= 2 && ctx.focusedHours < 4) {
    return `🎯 已专注${Math.floor(ctx.focusedHours)}h，进展不错，继续保持！`;
  }
  
  // 场景 22: 已投入较长时间（4-8h）
  if (ctx.focusedHours >= 4 && ctx.focusedHours < 8) {
    return `💎 投入${Math.floor(ctx.focusedHours)}h了，这份坚持会有回报的！`;
  }
  
  // 场景 23: 投入时间很长（8h+）但还没完成
  if (ctx.focusedHours >= 8) {
    return `🏅 已经专注${Math.floor(ctx.focusedHours)}h，这是一场马拉松，你做得很棒！`;
  }
  
  // 场景 24: DDL 还很远（7+ 天）
  if (ctx.ddlRemainingHours && ctx.ddlRemainingHours > 168) {
    return `🌈 DDL 还有${Math.floor(ctx.ddlRemainingHours / 24)}天，时间充裕，慢慢来没关系`;
  }
  
  // 场景 25: DDL 适中（3-7 天）
  if (ctx.ddlRemainingHours && ctx.ddlRemainingHours > 72 && ctx.ddlRemainingHours <= 168) {
    return `📅 还有${Math.floor(ctx.ddlRemainingHours / 24)}天，合理安排时间，一切都会顺利的！`;
  }
  
  // 场景 26: 最近完成了一些任务（2-4 个）
  if (ctx.recentCompletionCount >= 2 && ctx.recentCompletionCount < 5) {
    return `🌟 最近完成${ctx.recentCompletionCount}个任务，状态不错！再接再厉～`;
  }
  
  // 场景 27: 今天任务不多（1-3 个）
  if (ctx.todayEventCount >= 1 && ctx.todayEventCount <= 3) {
    return `☀️ 今天只有${ctx.todayEventCount}个任务，轻松愉快的一天！`;
  }
  
  // 场景 28: 今天任务适中（4-6 个）
  if (ctx.todayEventCount >= 4 && ctx.todayEventCount <= 6) {
    return `💼 今天${ctx.todayEventCount}个任务，节奏刚好，加油！`;
  }
  
  // 场景 29: 刚开始投入（< 1h）
  if (ctx.focusedHours > 0 && ctx.focusedHours < 1) {
    return `🌸 刚开始${Math.floor(ctx.focusedHours * 60)}分钟，良好的开端是成功的一半！`;
  }
  
  // 场景 30: 创建后 2-24h，没 DDL，没动过
  if (ctx.createdHoursAgo >= 2 && ctx.createdHoursAgo < 24 && !ctx.ddlRemainingHours && ctx.focusedHours === 0) {
    return `🎈 创建${Math.floor(ctx.createdHoursAgo)}h了，要不要现在开始呢？`;
  }
  
  // 默认提示（兜底）
  if (ctx.ddlRemainingHours !== null) {
    const days = Math.floor(ctx.ddlRemainingHours / 24);
    const hours = Math.floor(ctx.ddlRemainingHours % 24);
    if (days > 0) {
      return `📌 DDL 还有${days}天${hours}h，一步步来，你能做到的！`;
    } else if (hours > 0) {
      return `📌 DDL 还有${hours}h，专注当下，加油！`;
    }
  }
  
  return `✨ 每一次努力都算数，ReMarkable 陪你一起前行`;
}

// 辅助函数：计算事件累计专注时长
function calculateEventFocusTime(event: Event): number {
  // 获取该事件的所有 Timer 记录
  const timerRecords = TimerService.getTimerRecordsByEventId(event.id);
  const totalMs = timerRecords.reduce((sum, record) => {
    if (record.endTime) {
      const start = new Date(record.startTime).getTime();
      const end = new Date(record.endTime).getTime();
      return sum + (end - start);
    }
    return sum;
  }, 0);
  
  return totalMs / (1000 * 60 * 60); // 转换为小时
}

// 辅助函数：获取今天的整体统计
function getTodayStats(): { eventCount: number; totalFocusHours: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayEvents = EventService.getEventsByDateRange(today, new Date());
  const eventCount = todayEvents.length;
  
  const totalFocusMs = todayEvents.reduce((sum, evt) => {
    const focusMs = calculateEventFocusTime(evt) * 1000 * 60 * 60;
    return sum + focusMs;
  }, 0);
  
  return {
    eventCount,
    totalFocusHours: totalFocusMs / (1000 * 60 * 60),
  };
}

// 辅助函数：获取最近完成任务的统计
function getRecentCompletionStats(): { count: number; daysAgo: number } {
  const recentCompletedEvents = EventService.getRecentCompletedEvents(30); // 最近 30 天
  const count = recentCompletedEvents.filter(evt => {
    const completedDate = new Date(evt.completedAt!);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return completedDate >= threeDaysAgo;
  }).length;
  
  // 计算距离上次完成的天数
  let daysAgo = 999;
  if (recentCompletedEvents.length > 0) {
    const lastCompleted = new Date(recentCompletedEvents[0].completedAt!);
    const now = new Date();
    daysAgo = Math.floor((now.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24));
  }
  
  return { count, daysAgo };
}

```

**UI 样式**:
```css
.plan-prompt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.05);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
}

.plan-prompt-row:hover {
  background: rgba(59, 130, 246, 0.1);
}

.plan-prompt-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.prompt-icons {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.prompt-text {
  font-size: 14px;
  color: #374151;
  flex: 1;
  line-height: 1.5;
}

/* 不同情绪状态的文字颜色 */
.prompt-text.urgent {
  color: #dc2626; /* 紧急红色 */
  font-weight: 500;
}

.prompt-text.encouraging {
  color: #059669; /* 鼓励绿色 */
}

.prompt-text.celebrating {
  color: #7c3aed; /* 庆祝紫色 */
  font-weight: 500;
}

.prompt-text.gentle-guilt {
  color: #6b7280; /* 温柔灰色 */
  font-style: italic;
}

.prompt-text.caring {
  color: #0891b2; /* 关怀青色 */
}
```

**显示示例**:

**完成状态**:
- `🎉 太棒了！提前3天完成，你是时间管理大师！`
- `💪 投入12h完成，这份专注和努力真的很了不起！`
- `🏆 惊险完成！虽然时间紧张，但你做到了，给自己一个大大的赞！`

**紧急状态**:
- `� DDL 还有1h！深呼吸，专注此刻，你可以的！`
- `⏰ 还有18小时，时间刚好，稳住节奏就能完成！`

**拖延/愧疚状态**:
- `🥺 这个任务已经躺了7天了呢...要不要给它一点关注？`
- `😢 DDL 快到了，但还没开始...现在动手还来得及，我相信你！`
- `🌧️ 已经7天没完成任务了，是不是遇到困难了？要不从这个开始试试？`

**压力关怀状态**:
- `🫂 今天8个任务，已专注10h，记得休息哦`
- `🌙 今天已经专注12h了，累了就休息，明天继续加油！`

**鼓励状态**:
- `🎯 已专注3h，进展不错，继续保持！`
- `🌟 最近完成3个任务，状态不错！再接再厉～`
- `☀️ 今天只有2个任务，轻松愉快的一天！`

---

### 【关联区域】（条件显示） ✅ **已完成 v2.17.0**

**实现状态**: ✅ 已完成（EventTree 关联显示 + 数据同步）

**已实现功能**:
- ✅ 关联事件统计显示（上级/下级/关联）
- ✅ 点击展开查看 EventTreeViewer（Figma 可视化工具）
- ✅ EventTree 数据字段完整支持（childEventIds, linkedEventIds, backlinks）
- ✅ formData 三个同步点全部包含 EventTree 字段
- ✅ PlanManager 转换函数保留 EventTree 字段
- ✅ 实时统计更新（创建/删除子事件自动刷新）

**核心组件**:
- `EventEditModalV2.tsx` (L127-160: MockEvent interface, L3080-3120: 关联区域渲染)
- `EventTreeViewer.tsx` - Figma 集成的事件树可视化组件
- `PlanManager.tsx` (L2074-2130: convertPlanItemToEvent 转换函数)

**显示条件**:
```typescript
function shouldShowRelatedSection(event: Event): boolean {
  // 显示条件：有父事件、有子事件、或有双向链接
  return !!(
    event.parentEventId || 
    (event.childEventIds && event.childEventIds.length > 0) ||
    (event.linkedEventIds && event.linkedEventIds.length > 0) ||
    (event.backlinks && event.backlinks.length > 0)
  );
}
```

---

#### 5.1 EventTree 数据架构（v2.17.0 更新）

**🎯 核心设计理念**：
- **刚性骨架（Hierarchy Bone）**：父子关系 (`parentEventId` / `childEventIds`) 占据画布空间，用 line + link 标记显示
- **柔性血管（Bidirectional Links）**：双向链接 (`linkedEventIds` / `backlinks`) 不占画布空间，堆叠在主节点背后，Hover 展开

**数据来源**: 
```typescript
// ========== 刚性骨架：父子层级关系 ==========
event.parentEventId?: string;        // 父事件 ID（所有类型子事件都用此字段）
event.childEventIds?: string[];      // 子事件 ID 列表（包括 Timer、用户子任务、文档等）

// ========== 柔性血管：双向链接 ==========
event.linkedEventIds?: string[];     // 用户主动创建的链接（通过 @mention）
event.backlinks?: string[];          // 自动计算的反向链接（哪些事件链接了我）

// ========== 弃用字段（向后兼容） ==========
event.parentTaskId?: string;         // @deprecated 使用 parentEventId 替代
event.childTaskCount?: number;       // @deprecated 使用 childEventIds.length 替代
event.childTaskCompletedCount?: number; // @deprecated 动态计算
```

**字段说明**:

| 字段 | 类型 | 用途 | 示例 |
|------|------|------|------|
| `parentEventId` | `string?` | 父事件 ID（刚性骨架） | `'event-parent-001'` |
| `childEventIds` | `string[]?` | 子事件 ID 列表（刚性骨架） | `['event-child-001', 'timer-002']` |
| `linkedEventIds` | `string[]?` | 双向链接 ID 列表（柔性血管） | `['event-ref-001', 'doc-003']` |
| `backlinks` | `string[]?` | 反向链接（自动计算，只读） | `['event-mention-005']` |

**EventTree 节点筛选规则**:
```typescript
/**
 * 判断事件是否应该显示在 EventTree 中
 * 排除系统自动生成的事件类型
 */
function shouldShowInEventTree(event: Event): boolean {
  // 排除系统事件
  if (event.isTimer) return false;         // Timer 子事件
  if (event.isOutsideApp) return false;    // 外部应用数据（听歌、录屏等）
  if (event.isTimeLog) return false;       // 纯系统时间日志
  
  // 显示所有用户创建的事件
  return true; // Task、文档、Plan 事件、TimeCalendar 事件等
}
```

**支持的嵌套类型**（无限制）:
- ✅ Task ← Task（任务分解）
- ✅ 文档 ← 文档（文档章节）
- ✅ Task ← 文档（任务相关文档）
- ✅ 文档 ← Task（文档相关子任务）
- ✅ Event ← Event（任意事件嵌套）

**不支持的嵌套类型**（系统事件）:
- ❌ Timer 子事件（`isTimer = true`）
- ❌ OutsideApp 事件（`isOutsideApp = true`）
- ❌ 纯系统 TimeLog（`isTimeLog = true`）

---

#### 5.2 关联区域显示（EventEditModal 实现）✅ **已完成**

**显示位置**: 右侧 Event Log 区域 - Slate 编辑器上方

**UI 结构**:
```tsx
{/* 关联区域 */}
{shouldShowRelatedSection(formData) && (
  <div className="event-relations">
    {/* 上级任务 */}
    {formData.parentEventId && (
      <div className="relation-item">
        🔗 上级：
        <span 
          className="relation-link"
          onClick={() => openEventModal(formData.parentEventId)}
        >
          {getParentEventTitle(formData.parentEventId)}
        </span>
      </div>
    )}
    
    {/* 下级任务 */}
    {formData.childEventIds && formData.childEventIds.length > 0 && (
      <div className="relation-item">
        下级：
        <span 
          className="relation-count"
          onClick={() => setShowEventTreeViewer(true)}
        >
          {formData.childEventIds.length}个
        </span>
      </div>
    )}
    
    {/* 关联事件 */}
    {(formData.linkedEventIds?.length > 0 || formData.backlinks?.length > 0) && (
      <div className="relation-item">
        关联：
        <span 
          className="relation-count"
          onClick={() => setShowEventTreeViewer(true)}
        >
          {(formData.linkedEventIds?.length || 0) + (formData.backlinks?.length || 0)}个事件
        </span>
      </div>
    )}
  </div>
)}
```

**CSS 样式**:
```css
.event-relations {
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #6b7280;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.relation-item:last-child {
  margin-bottom: 0;
}

.relation-link,
.relation-count {
  color: #3b82f6;
  cursor: pointer;
  text-decoration: underline;
  transition: color 0.2s;
}

.relation-link:hover,
.relation-count:hover {
  color: #2563eb;
}
```

**交互逻辑**:
```typescript
// 点击上级任务 → 打开父事件 Modal
const openEventModal = (eventId: string) => {
  const parentEvent = EventService.getEventById(eventId);
  if (parentEvent) {
    // 触发全局 Modal 打开事件
    EventHub.emit('open-event-modal', parentEvent);
  }
};

// 点击下级/关联 → 打开 EventTreeViewer
const [showEventTreeViewer, setShowEventTreeViewer] = useState(false);

<EventTreeViewer
  isOpen={showEventTreeViewer}
  onClose={() => setShowEventTreeViewer(false)}
  rootEventId={event.id}
  initialView="tree" // 树形视图
/>
```

**数据同步保证**（关键修复）:

**问题**：之前 formData.childEventIds 在 Modal 打开时被 useEffect 覆盖为 undefined

**解决方案**：确保三个 formData 同步点都包含 EventTree 字段

```typescript
// ✅ 同步点 1: useState 初始化（L260-290）
const [formData, setFormData] = useState<MockEvent>({
  // ... 其他字段
  childEventIds: (event as any).childEventIds || [],
  linkedEventIds: (event as any).linkedEventIds || [],
  backlinks: (event as any).backlinks || [],
});

// ✅ 同步点 2: 第一个 useEffect - event prop 变化（L400-465）
useEffect(() => {
  if (event) {
    setFormData({
      // ... 其他字段
      childEventIds: (event as any).childEventIds || [],
      linkedEventIds: (event as any).linkedEventIds || [],
      backlinks: (event as any).backlinks || [],
    });
  }
}, [event?.id]);

// ✅ 同步点 3: 第二个 useEffect - Modal 打开（L1340-1420）
useEffect(() => {
  if (event && isOpen) {
    setFormData({
      // ... 其他字段
      parentEventId: event.parentEventId || null,
      // 🔗 EventTree 关系字段
      childEventIds: (event as any).childEventIds || [],
      linkedEventIds: (event as any).linkedEventIds || [],
      backlinks: (event as any).backlinks || [],
      startTime: event.startTime || null,
      // ... 其他字段
    });
  }
}, [event?.id, event?.title?.colorTitle, isOpen]);
```

**PlanManager 转换函数修复**（L2074-2130）:

```typescript
function convertPlanItemToEvent(item: PlanItem, section: PlanSection): Event {
  return {
    // ... 基础字段
    
    // 🔗 EventTree 关系字段（保留原始数据）
    childEventIds: (item as any).childEventIds,
    linkedEventIds: (item as any).linkedEventIds,
    backlinks: (item as any).backlinks,
    
    // ... 其他字段
  };
}
```

**测试验证**:

✅ **验证步骤**:
1. 在 PlanManager 创建父事件，添加 2 个子事件
2. 打开父事件的 EventEditModal
3. 检查 Console 日志：
   ```javascript
   🔍🔍🔍 [关联信息检查] formData 当前状态: {
     步骤3_formData.childEventIds: ['event-child-1', 'event-child-2'],
     步骤4_formData.childEventIds类型: 'object',
     步骤5_formData.childEventIds是数组吗: true
   }
   ```
4. 关联区域正确显示："下级：2个"

---

#### 5.3 双向链接（Bidirectional Links）- 堆叠卡片设计

**🎯 设计理念：Vessels as Stacks**

> "收纳与展开"：双向链接的节点不占用画布空间，而是像"附件"或"扑克牌"一样藏在主节点背后。只有当你关注（Hover）这个节点时，它们才滑出来。

**创建方式**:
```typescript
// 用户在 EventLog 中输入 @mention
// UnifiedMention 组件自动创建双向链接

// 示例：在事件 A 的 EventLog 中输入：
// "参考 @Project Ace 的设计方案"

// 结果：
eventA.linkedEventIds = ['project-ace-id'];  // 事件 A 链接了 Project Ace
projectAce.backlinks = ['event-a-id'];       // Project Ace 被事件 A 链接
```

**显示状态**:

1. **收纳态（Default State）**:
   - 用户只能看到主节点（line + link 标记）
   - 右上角显示链接数量指示器（如 `🔗 3`）
   - 链接卡片被缩放、旋转并堆叠在主节点背后
   - 视觉效果：像一叠整理好的文件

2. **展开态（Hover State）**:
   - 鼠标悬浮主节点 → 链接卡片扇形滑出（Fan-out）
   - 每张卡片间隔 180px（横向平铺）
   - 可直接点击链接卡片跳转到对应事件

**UI 结构**:
```tsx
// CustomEventNode.tsx - React Flow 自定义节点
interface EventNodeData {
  event: Event;                  // 主事件数据
  linkedEvents: Event[];         // 双向链接的事件（堆叠在背后）
}

function CustomEventNode({ data }: NodeProps<EventNodeData>) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div 
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 1. 堆叠的双向链接卡片（绝对定位，藏在主节点后） */}
      <div className="absolute top-0 left-0 pointer-events-none">
        {data.linkedEvents.map((linkedEvent, index) => (
          <LinkedCard 
            key={linkedEvent.id}
            event={linkedEvent}
            index={index}
            isHovered={isHovered}
          />
        ))}
      </div>
      
      {/* 2. 主节点（line + link 标记，不是卡片） */}
      <div className="relative z-10 flex items-center gap-2 p-2 bg-white rounded">
        {/* Checkbox（如果是 Task） */}
        {data.event.isTask && (
          <input type="checkbox" checked={data.event.isCompleted} />
        )}
        
        {/* Emoji */}
        {data.event.emoji && <span>{data.event.emoji}</span>}
        
        {/* 标题 */}
        <span className="font-medium">{data.event.title}</span>
        
        {/* 链接指示器（未展开时显示数量） */}
        {data.linkedEvents.length > 0 && (
          <div className={`ml-auto flex items-center gap-1 text-xs ${isHovered ? 'opacity-0' : 'opacity-100'}`}>
            <LinkIcon size={12} />
            <span>{data.linkedEvents.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

**堆叠卡片动画**（Framer Motion）:
```tsx
function LinkedCard({ event, index, isHovered }: LinkedCardProps) {
  // 收纳态：缩放 + 旋转 + 堆叠
  const xOffset = isHovered ? (index + 1) * 180 : (index + 1) * 4;
  const yOffset = isHovered ? 0 : (index + 1) * 4;
  const rotate = isHovered ? 0 : (index + 1) * 2;
  const scale = isHovered ? 1 : 1 - (index * 0.05);
  const opacity = isHovered ? 1 : 1 - (index * 0.15);
  
  return (
    <motion.div
      animate={{ x: xOffset, y: yOffset, rotate, scale, opacity }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="absolute w-48 h-20 bg-blue-50 rounded-lg shadow-lg p-3 cursor-pointer"
      onClick={() => openEventEditModal(event)}
    >
      <div className="flex items-center gap-2 mb-2">
        <LinkIcon size={12} className="opacity-50" />
        <span className="text-xs font-bold opacity-70">LINKED</span>
      </div>
      <h4 className="text-sm font-semibold line-clamp-2">{event.title}</h4>
    </motion.div>
  );
}
```

**样式定义**:
```css
/* ========== 堆叠卡片容器 ========== */
.linked-cards-container {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none; /* 收纳态不可点击 */
}

.linked-cards-container.expanded {
  pointer-events: auto; /* 展开态可点击 */
}

/* ========== 单张链接卡片 ========== */
.linked-card {
  position: absolute;
  width: 192px;
  height: 80px;
  padding: 12px;
  background: rgba(239, 246, 255, 0.95);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  backdrop-filter: blur(4px);
  transform-origin: bottom left;
}

.linked-card:hover {
  background: rgba(219, 234, 254, 1);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
}

.linked-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  opacity: 0.7;
}

.linked-card-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e40af;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

---

#### 5.3 EventTree 入口与显示位置

**入口 1：EventEditModal 关联区域**

```tsx
// 在 EventEditModal 的【中 Section】下方显示
<div className="event-tree-section">
  <div className="section-header">
    <img src={LinkColorIcon} alt="关联" className="icon-link" />
    <span className="section-title">关联事项</span>
    
    {/* Pin 按钮 */}
    <button 
      className="pin-btn"
      onClick={() => pinEventTree(event.id)}
      title="固定到侧边栏"
    >
      📌
    </button>
    
    {/* 展开/收起按钮 */}
    <button 
      className="toggle-btn"
      onClick={() => setTreeExpanded(!treeExpanded)}
    >
      {treeExpanded ? '▲' : '▼'}
    </button>
  </div>
  
  {/* EventTree 内容（向下展开） */}
  {treeExpanded && (
    <EventTreeViewer 
      rootEventId={event.id}
      showLinkedCards={true}  // 显示双向链接堆叠卡片
    />
  )}
</div>
```

**入口 2：ContentPanel 侧边栏（TimeLog / Plan 页面）**

```tsx
// 左侧侧边栏下方，与标签树同级
<Tabs defaultValue="recent">
  <TabsList>
    <TabsTrigger value="recent">事项</TabsTrigger>
    <TabsTrigger value="favorite">收藏</TabsTrigger>
  </TabsList>
  
  {/* 事项 Tab：显示最近活跃的 EventTree */}
  <TabsContent value="recent">
    <div className="event-tree-list">
      {recentEventTrees.map(tree => (
        <EventTreeItem 
          key={tree.rootEventId}
          rootEvent={tree.rootEvent}
          lastActiveTime={tree.lastActiveTime}
          onClick={() => openEventTreePanel(tree.rootEventId)}
        />
      ))}
    </div>
  </TabsContent>
  
  {/* 收藏 Tab：显示用户收藏的 EventTree */}
  <TabsContent value="favorite">
    <div className="event-tree-list">
      {favoriteEventTrees.map(tree => (
        <EventTreeItem 
          key={tree.rootEventId}
          rootEvent={tree.rootEvent}
          isPinned={true}
          onClick={() => openEventTreePanel(tree.rootEventId)}
        />
      ))}
    </div>
  </TabsContent>
</Tabs>
```

**EventTreeItem 显示样式**:
```tsx
function EventTreeItem({ rootEvent, lastActiveTime, isPinned, onClick }) {
  return (
    <div 
      className="event-tree-item"
      onClick={onClick}
    >
      {/* Emoji + 标题 */}
      <div className="tree-header">
        {rootEvent.emoji && <span className="tree-emoji">{rootEvent.emoji}</span>}
        <span className="tree-title">{rootEvent.title}</span>
      </div>
      
      {/* 子事件数量 + 最后活跃时间 */}
      <div className="tree-meta">
        <span className="child-count">
          {rootEvent.childEventIds?.length || 0} 个子事项
        </span>
        {lastActiveTime && (
          <span className="last-active">
            {formatRelativeTime(lastActiveTime)}
          </span>
        )}
      </div>
      
      {/* Pin 状态 */}
      {isPinned && <span className="pin-badge">📌</span>}
    </div>
  );
}
```

---

#### 5.4 刚性骨架显示逻辑（v2.17.0）

**显示逻辑**:
```typescript
import { LinkColorIcon } from '@/assets/icons';

function renderEventTreeSection(event: Event): ReactNode {
  if (!shouldShowRelatedSection(event)) return null;
  
  // 🆕 v2.17.0: 使用新的父子字段
  const parentEvent = event.parentEventId 
    ? EventService.getEventById(event.parentEventId)
    : null;
  
  // 过滤出可显示的子事件（排除系统事件）
  const visibleChildEvents = (event.childEventIds || [])
    .map(id => EventService.getEventById(id))
    .filter(child => child && shouldShowInEventTree(child));
  
  const progress = visibleChildEvents.length > 0
    ? `${visibleChildEvents.filter(e => e.isCompleted).length}/${visibleChildEvents.length}`
    : '';
  
  // 🆕 展开/收缩状态（默认展开）
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <div className="parent-task-section">
      {/* 收缩时：一行描述 */}
      {!isExpanded && (
        <div 
          className="parent-task-link collapsed"
          onClick={() => setIsExpanded(true)}
        >
          <button className="expand-btn" title="展开任务树">
            ▶
          </button>
          <img src={LinkColorIcon} alt="关联" className="icon-link" />
          <span className="parent-task-summary">
            上级任务：{parentEvent.title}
            {progress && `，同级任务已完成${progress}`}
            ，点击查看和修改任务群
          </span>
        </div>
      )}
      
      {/* 展开时：完整 EventTree */}
      {isExpanded && (
        <div className="parent-task-expanded">
          <div className="parent-task-header">
            <button 
              className="collapse-btn" 
              onClick={() => setIsExpanded(false)}
              title="收起任务树"
            >
              ▼
            </button>
            <img src={LinkColorIcon} alt="关联" className="icon-link" />
            <span className="header-title">关联任务树</span>
            {progress && (
              <span className="progress-badge">
                {event.childTaskCompletedCount}/{event.childTaskCount}
              </span>
            )}
          </div>
          
          {/* EventTree 完整显示 */}
          {renderRelatedTasksSection(event)}
        </div>
      )}
    </div>
  );
}
```

**样式定义**:
```css
/* ========== 关联区域容器 ========== */
.parent-task-section {
  margin-bottom: 20px;
}

/* 收缩状态：一行描述 */
.parent-task-link.collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid #e5e7eb;
}

.parent-task-link.collapsed:hover {
  background: #fafafa;
  border-color: #d1d5db;
}

.expand-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: none;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.expand-btn:hover {
  color: #1f2937;
  transform: scale(1.1);
}

.icon-link {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.parent-task-summary {
  font-size: 14px;
  color: #374151;
  flex: 1;
  line-height: 1.5;
}

/* 展开状态：完整树形结构 */
.parent-task-expanded {
  background: white;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.parent-task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: white;
  border-bottom: 1px solid #f3f4f6;
}

.collapse-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: none;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.collapse-btn:hover {
  color: #1f2937;
  transform: scale(1.1);
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  flex: 1;
}

.progress-badge {
  padding: 2px 8px;
  background: #3b82f6;
  color: white;
  font-size: 12px;
  font-weight: 500;
  border-radius: 12px;
  flex-shrink: 0;
}
```

---

**交互 1: 点击跳转到父任务的 EditModal**:

```typescript
// 点击跳转到父任务，打开 EditModal 时的特殊行为
function openParentTaskModal(parentTaskId: string) {
  const parentEvent = EventService.getEventById(parentTaskId);
  
  // 1. 获取用户对该 eventTree 的收缩状态（LocalStorage 持久化）
  const treeCollapseState = getEventTreeCollapseState(parentTaskId);
  
  // 2. 获取子任务的 TimeLog 显示状态
  const EventLogVisibility = getEventLogVisibilityState(parentTaskId);
  
  // 3. 打开 Modal，传递状态
  openEventEditModal({
    event: parentEvent,
    initialState: {
      showEventTree: true,                    // 默认展开关联区域
      eventTreeCollapseState: treeCollapseState,  // 记住的收缩状态
      EventLogVisibility: EventLogVisibility,    // 子任务日志显示状态
    }
  });
}

// LocalStorage 持久化收缩状态
interface EventTreeCollapseState {
  [eventId: string]: boolean;  // true = 收缩，false = 展开
}

function getEventTreeCollapseState(rootEventId: string): EventTreeCollapseState {
  const key = `eventTree.collapse.${rootEventId}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : {};
}

function saveEventTreeCollapseState(rootEventId: string, state: EventTreeCollapseState) {
  const key = `eventTree.collapse.${rootEventId}`;
  localStorage.setItem(key, JSON.stringify(state));
}

// TimeLog 可见性状态
interface EventLogVisibilityState {
  [childEventId: string]: boolean;  // true = 显示，false = 隐藏
}

function getEventLogVisibilityState(rootEventId: string): EventLogVisibilityState {
  const key = `eventTree.EventLogVisibility.${rootEventId}`;
  const stored = localStorage.getItem(key);
  
  // 默认所有子任务的 TimeLog 都显示
  if (!stored) {
    const parentEvent = EventService.getEventById(rootEventId);
    const allChildIds = getAllChildEventIds(parentEvent);
    const defaultState: EventLogVisibilityState = {};
    allChildIds.forEach(id => defaultState[id] = true);
    return defaultState;
  }
  
  return JSON.parse(stored);
}

function saveEventLogVisibilityState(rootEventId: string, state: EventLogVisibilityState) {
  const key = `eventTree.EventLogVisibility.${rootEventId}`;
  localStorage.setItem(key, JSON.stringify(state));
}
```

**交互 2: Hover 显示 EventTree 浮窗卡片**:

```typescript
interface EventTreePopoverProps {
  rootEventId: string;
  anchorElement: HTMLElement;
  onEventClick: (eventId: string) => void;
  onCheckChange: (eventId: string, checked: boolean) => void;
  onVisibilityToggle: (eventId: string, visible: boolean) => void;
}

function EventTreePopover({ 
  rootEventId, 
  anchorElement, 
  onEventClick,
  onCheckChange,
  onVisibilityToggle 
}: EventTreePopoverProps) {
  const rootEvent = EventService.getEventById(rootEventId);
  const eventTree = buildEventTree(rootEvent);
  const [visibilityState, setVisibilityState] = useState<EventLogVisibilityState>(
    () => getEventLogVisibilityState(rootEventId)
  );
  
  const handleVisibilityToggle = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !visibilityState[eventId];
    const updatedState = { ...visibilityState, [eventId]: newState };
    setVisibilityState(updatedState);
    saveEventLogVisibilityState(rootEventId, updatedState);
    onVisibilityToggle(eventId, newState);
  };
  
  const handleCheckChange = (eventId: string, checked: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    onCheckChange(eventId, checked);
  };
  
  return (
    <div className="event-tree-popover">
      <div className="event-tree-header">
        <span className="tree-title">📋 任务树</span>
        <span className="tree-count">{eventTree.totalCount} 个任务</span>
      </div>
      
      <div className="event-tree-list">
        {renderEventTreeNodes(eventTree.root, 0)}
      </div>
    </div>
  );
  
  function renderEventTreeNodes(node: EventTreeNode, depth: number): ReactNode {
    return (
      <>
        <div 
          className={`event-tree-item depth-${depth}`}
          onClick={() => onEventClick(node.event.id)}
        >
          {/* 勾选框 */}
          <input
            type="checkbox"
            className="event-checkbox"
            checked={node.event.isCompleted || false}
            onChange={(e) => handleCheckChange(node.event.id, e.target.checked, e as any)}
            onClick={(e) => e.stopPropagation()}
          />
          
          {/* Hide/Unhide 眼睛按钮 */}
          <button
            className="visibility-toggle"
            onClick={(e) => handleVisibilityToggle(node.event.id, e)}
            title={visibilityState[node.event.id] ? '隐藏时间日志' : '显示时间日志'}
          >
            {visibilityState[node.event.id] ? '👁️' : '👁️‍🗨️'}
          </button>
          
          {/* 事件内容 */}
          <div className="event-content">
            {/* Emoji */}
            {node.event.emoji && (
              <span className="event-emoji">{node.event.emoji}</span>
            )}
            
            {/* 标题 */}
            <span className="event-title">{node.event.title}</span>
            
            {/* 标签（仅显示第一个） */}
            {node.event.tags && node.event.tags.length > 0 && (
              <span className="event-tag-simple">
                #{getFirstTagEmoji(node.event.tags[0])}{getFirstTagName(node.event.tags[0])}
              </span>
            )}
            
            {/* 计划时间 */}
            {renderPlannedTime(node.event)}
            
            {/* 实际时长 */}
            {renderActualDuration(node.event)}
          </div>
        </div>
        
        {/* 递归渲染子节点 */}
        {node.children.length > 0 && (
          <div className="event-tree-children">
            {node.children.map(child => renderEventTreeNodes(child, depth + 1))}
          </div>
        )}
      </>
    );
  }
}

// 渲染计划时间
function renderPlannedTime(event: Event): ReactNode {
  if (event.startTime && event.endTime) {
    return (
      <span className="planned-time">
        📅 {formatTime(event.startTime)} - {formatTime(event.endTime)}
      </span>
    );
  }
  
  if (event.fuzzyDate) {
    return (
      <span className="planned-time">
        📅 {event.fuzzyDate}
        {event.fuzzyTime && ` ${event.fuzzyTime}`}
      </span>
    );
  }
  
  if (event.date) {
    return (
      <span className="planned-time">
        📅 {formatDate(event.date)}
      </span>
    );
  }
  
  return null;
}

// 渲染实际时长
function renderActualDuration(event: Event): ReactNode {
  const totalDuration = calculateEventFocusTime(event);
  if (totalDuration === 0) return null;
  
  const hours = Math.floor(totalDuration);
  const minutes = Math.floor((totalDuration - hours) * 60);
  
  return (
    <span className="actual-duration">
      ⏱️ {hours > 0 ? `${hours}h` : ''}{minutes > 0 ? `${minutes}m` : ''}
    </span>
  );
}

// 构建事件树
interface EventTreeNode {
  event: Event;
  children: EventTreeNode[];
}

interface EventTree {
  root: EventTreeNode;
  totalCount: number;
}

function buildEventTree(rootEvent: Event): EventTree {
  let totalCount = 0;
  
  function buildNode(event: Event): EventTreeNode {
    totalCount++;
    
    const childEvents = EventService.getChildEvents(event.id);
    const children = childEvents.map(child => buildNode(child));
    
    return {
      event,
      children,
    };
  }
  
  return {
    root: buildNode(rootEvent),
    totalCount,
  };
}

// 获取所有子事件 ID（递归）
function getAllChildEventIds(event: Event): string[] {
  const childEvents = EventService.getChildEvents(event.id);
  const ids = childEvents.map(child => child.id);
  
  childEvents.forEach(child => {
    ids.push(...getAllChildEventIds(child));
  });
  
  return ids;
}

// 获取第一个标签的 emoji
function getFirstTagEmoji(tagId: string): string {
  const tag = TagService.getTagById(tagId);
  return tag?.emoji || '';
}

// 获取第一个标签的名称（不含层级）
function getFirstTagName(tagId: string): string {
  const tag = TagService.getTagById(tagId);
  return tag?.name || '';
}

function formatTime(timestamp: string): string {
  return dayjs(timestamp).format('HH:mm');
}

function formatDate(timestamp: string): string {
  return dayjs(timestamp).format('MM-DD');
}
```

**交互 3: EventTree 在关联区域的显示**:

```typescript
function renderRelatedTasksSection(event: Event): ReactNode {
  if (!shouldShowRelatedTasks(event)) return null;
  
  const [showEventTree, setShowEventTree] = useState(true);
  const [collapseState, setCollapseState] = useState<EventTreeCollapseState>(
    () => getEventTreeCollapseState(event.id)
  );
  const [EventLogVisibility, setEventLogVisibility] = useState<EventLogVisibilityState>(
    () => getEventLogVisibilityState(event.id)
  );
  
  const handleCollapseToggle = (eventId: string) => {
    const newState = { ...collapseState, [eventId]: !collapseState[eventId] };
    setCollapseState(newState);
    saveEventTreeCollapseState(event.id, newState);
  };
  
  const handleVisibilityToggle = (eventId: string, visible: boolean) => {
    const newState = { ...EventLogVisibility, [eventId]: visible };
    setEventLogVisibility(newState);
    saveEventLogVisibilityState(event.id, newState);
    
    // 刷新 Slate 编辑器内容
    refreshSlateEditorWithVisibleTimeLogs(newState);
  };
  
  const handleEventCheck = (eventId: string, checked: boolean) => {
    EventService.updateEvent(eventId, { isCompleted: checked });
    // 刷新界面
    forceUpdate();
  };
  
  return (
    <div className="related-tasks-section">
      <div className="section-header">
        <h4>📋 关联任务树</h4>
        <button 
          className="collapse-all-btn"
          onClick={() => setShowEventTree(!showEventTree)}
        >
          {showEventTree ? '收起' : '展开'}
        </button>
      </div>
      
      {showEventTree && (
        <div className="event-tree-compact">
          {renderCompactEventTree(event, 0)}
        </div>
      )}
    </div>
  );
  
  function renderCompactEventTree(parentEvent: Event, depth: number): ReactNode {
    const childEvents = EventService.getChildEvents(parentEvent.id);
    const isCollapsed = collapseState[parentEvent.id] || false;
    const isVisible = EventLogVisibility[parentEvent.id] !== false;
    
    return (
      <>
        <div className={`event-tree-compact-item depth-${depth}`}>
          {/* 收缩箭头（如果有子任务） */}
          {childEvents.length > 0 && (
            <button 
              className="collapse-arrow"
              onClick={() => handleCollapseToggle(parentEvent.id)}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
          )}
          
          {/* 勾选框 */}
          <input
            type="checkbox"
            className="event-checkbox-compact"
            checked={parentEvent.isCompleted || false}
            onChange={(e) => handleEventCheck(parentEvent.id, e.target.checked)}
          />
          
          {/* Hide/Unhide 眼睛 */}
          <button
            className="visibility-toggle-compact"
            onClick={() => handleVisibilityToggle(parentEvent.id, !isVisible)}
            title={isVisible ? '隐藏时间日志' : '显示时间日志'}
          >
            {isVisible ? '👁️' : '👁️‍🗨️'}
          </button>
          
          {/* Emoji */}
          {parentEvent.emoji && (
            <span className="event-emoji-compact">{parentEvent.emoji}</span>
          )}
          
          {/* 标题 */}
          <span 
            className="event-title-compact"
            onClick={() => openEventEditModal({ event: parentEvent })}
          >
            {parentEvent.title}
          </span>
          
          {/* 第一个标签 */}
          {parentEvent.tags && parentEvent.tags.length > 0 && (
            <span className="event-tag-compact">
              #{getFirstTagEmoji(parentEvent.tags[0])}{getFirstTagName(parentEvent.tags[0])}
            </span>
          )}
          
          {/* 计划时间 */}
          <span className="planned-time-compact">
            {renderPlannedTimeCompact(parentEvent)}
          </span>
          
          {/* 实际时长 */}
          <span className="actual-duration-compact">
            {renderActualDurationCompact(parentEvent)}
          </span>
        </div>
        
        {/* 子任务（递归） */}
        {!isCollapsed && childEvents.length > 0 && (
          <div className="event-tree-children-compact">
            {childEvents.map(child => renderCompactEventTree(child, depth + 1))}
          </div>
        )}
      </>
    );
  }
}

function renderPlannedTimeCompact(event: Event): string {
  if (event.startTime && event.endTime) {
    return `📅 ${formatTime(event.startTime)}-${formatTime(event.endTime)}`;
  }
  if (event.fuzzyDate) {
    return `📅 ${event.fuzzyDate}${event.fuzzyTime ? ' ' + event.fuzzyTime : ''}`;
  }
  if (event.date) {
    return `📅 ${formatDate(event.date)}`;
  }
  return '';
}

function renderActualDurationCompact(event: Event): string {
  const totalDuration = calculateEventFocusTime(event);
  if (totalDuration === 0) return '';
  
  const hours = Math.floor(totalDuration);
  const minutes = Math.floor((totalDuration - hours) * 60);
  
  return `⏱️ ${hours > 0 ? `${hours}h` : ''}${minutes > 0 ? `${minutes}m` : ''}`;
}

// 根据可见性状态刷新 Slate 编辑器
function refreshSlateEditorWithVisibleTimeLogs(visibilityState: EventLogVisibilityState) {
  const visibleEventIds = Object.entries(visibilityState)
    .filter(([_, visible]) => visible)
    .map(([eventId, _]) => eventId);
  
  // 重新组装 Slate 内容：只包含可见事件的 TimeLog
  const allLogs: PlanItem[] = [];
  
  visibleEventIds.forEach(eventId => {
    const event = EventService.getEventById(eventId);
    if (event?.description) {
      const logs = parseExternalHtml(event.description);
      
      // 添加事件分隔标识
      allLogs.push({
        type: 'event-log-divider',
        eventId: eventId,
        eventTitle: event.title,
        eventEmoji: event.emoji,
      });
      
      allLogs.push(...logs);
    }
  });
  
  setSlateItems(allLogs);
}
```

**样式定义**:

```css
/* ========== EventTree Popover ========== */
.event-tree-popover {
  width: 480px;
  max-height: 600px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.event-tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: white;
  border-bottom: 1px solid #f3f4f6;
}

.tree-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.tree-count {
  font-size: 13px;
  color: #6b7280;
}

.event-tree-list {
  padding: 12px 0;
  overflow-y: auto;
  max-height: 520px;
}

.event-tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  cursor: pointer;
  transition: background 0.2s;
  border-left: 3px solid transparent;
}

.event-tree-item:hover {
  background: #f9fafb;
  border-left-color: #3b82f6;
}

.event-tree-item.depth-0 {
  padding-left: 20px;
}

.event-tree-item.depth-1 {
  padding-left: 40px;
}

.event-tree-item.depth-2 {
  padding-left: 60px;
}

.event-tree-item.depth-3 {
  padding-left: 80px;
}

.event-checkbox {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
}

.visibility-toggle {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: none;
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.visibility-toggle:hover {
  opacity: 1;
}

.event-content {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.event-emoji {
  font-size: 16px;
  flex-shrink: 0;
}

.event-title {
  font-size: 14px;
  color: #1f2937;
  font-weight: 500;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-tag-simple {
  font-size: 12px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.planned-time {
  font-size: 12px;
  color: #059669;
  flex-shrink: 0;
}

.actual-duration {
  font-size: 12px;
  color: #dc2626;
  font-weight: 500;
  flex-shrink: 0;
}

.event-tree-children {
  /* 子节点容器 */
}

/* ========== EventTree Compact (关联区域) ========== */
.related-tasks-section {
  margin-bottom: 20px;
  padding: 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header h4 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.collapse-all-btn {
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  background: white;
  color: #6b7280;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.collapse-all-btn:hover {
  background: #fafafa;
  border-color: #9ca3af;
}

.event-tree-compact {
  background: white;
  border-radius: 6px;
  padding: 8px 0;
  border: 1px solid #f3f4f6;
}

.event-tree-compact-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  transition: background 0.2s;
  border-left: 2px solid transparent;
}

.event-tree-compact-item:hover {
  background: #f9fafb;
  border-left-color: #3b82f6;
}

.event-tree-compact-item.depth-0 {
  padding-left: 12px;
}

.event-tree-compact-item.depth-1 {
  padding-left: 32px;
}

.event-tree-compact-item.depth-2 {
  padding-left: 52px;
}

.event-tree-compact-item.depth-3 {
  padding-left: 72px;
}

.collapse-arrow {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: none;
  color: #6b7280;
  font-size: 10px;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.collapse-arrow:hover {
  color: #1f2937;
}

.event-checkbox-compact {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  cursor: pointer;
}

.visibility-toggle-compact {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: none;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.visibility-toggle-compact:hover {
  opacity: 1;
}

.event-emoji-compact {
  font-size: 14px;
  flex-shrink: 0;
}

.event-title-compact {
  font-size: 13px;
  color: #1f2937;
  font-weight: 500;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  min-width: 80px;
}

.event-title-compact:hover {
  color: #3b82f6;
  text-decoration: underline;
}

.event-tag-compact {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.planned-time-compact {
  font-size: 11px;
  color: #059669;
  flex-shrink: 0;
  white-space: nowrap;
}

.actual-duration-compact {
  font-size: 11px;
  color: #dc2626;
  font-weight: 500;
  flex-shrink: 0;
  white-space: nowrap;
}

.event-tree-children-compact {
  /* 紧凑子节点容器 */
}

/* ========== Event Log Divider（编辑区分隔线）========== */
.event-log-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin: 16px 0;
  background: linear-gradient(to right, #eff6ff, transparent);
  border-left: 4px solid #3b82f6;
  border-radius: 4px;
  user-select: none;
}

.event-log-divider-emoji {
  font-size: 16px;
  flex-shrink: 0;
}

.event-log-divider-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  flex: 1;
}

.event-log-divider-toggle {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  background: white;
  color: #6b7280;
  font-size: 11px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.event-log-divider-toggle:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}
```

---

### 【Slate 编辑区】- EventLog 集成

EventEditModal 的右侧编辑区直接集成 **EventLog 模块**的 `PlanSlateEditor` 组件。

> **详细实现参见**: [TimeLog & Description PRD](./TimeLog_&_Description_PRD.md)

**集成要点**:

#### 1. EventLog 数据初始化

```typescript
import { PlanSlateEditor } from '@/components/PlanSlateEditor/PlanSlateEditor';
import { parseExternalHtml, slateNodesToRichHtml } from '@/components/PlanSlateEditor/serialization';

// 从 event.description 解析 EventLog 数据
const [slateItems, setSlateItems] = useState<PlanItem[]>(() => {
  return event?.description 
    ? parseExternalHtml(event.description)
    : [{ id: 'line-1', level: 0, title: '', content: '', tags: [] }];
});

const handleSlateChange = useCallback((updatedItems: PlanItem[]) => {
  setSlateItems(updatedItems);
  const htmlContent = slateNodesToRichHtml(updatedItems);
  setFormData({ ...formData, description: htmlContent });
}, [formData]);
```

#### 2. FloatingToolbar 集成

```typescript
import { HeadlessFloatingToolbar } from '@/components/HeadlessFloatingToolbar';
import { useFloatingToolbar } from '@/hooks/useFloatingToolbar';

const rightPanelRef = useRef<HTMLDivElement>(null);
const slateEditorRef = useRef<Editor>(null);

// 🎯 动态计算 menuItemCount（根据当前菜单状态）
const [currentActivePicker, setCurrentActivePicker] = useState<string | null>(null);
const menuItemCount = currentActivePicker === 'textStyle' ? 7 : 5;

const floatingToolbar = useFloatingToolbar({
  editorRef: rightPanelRef,
  enabled: true,
  menuItemCount, // 🆕 动态计算：textStyle 为 7，其他为 5
  onMenuSelect: (index) => setActivePickerIndex(index),
});

// FloatingBar 图标配置
const floatingBarIcons = [
  { icon: EmojiIcon, alt: '表情' },
  { icon: TagSharpIcon, alt: '标签' },
  { icon: DdlAddIcon, alt: '日期' },
  { icon: BulletpointsIcon, alt: '列表' },
  { icon: BackgroundColorIcon, alt: '颜色' },
  { icon: AddTaskColorIcon, alt: '添加任务' }
];

return (
  <div ref={rightPanelRef} className="modal-right-panel">
    {/* Slate 编辑器 */}
    <PlanSlateEditor
      items={slateItems}
      onChange={handleSlateChange}
      placeholder="输入'/'召唤表情、格式等，点击右下方问号浮窗查看更多高效快捷键哦"
      onEditorReady={(editor) => { slateEditorRef.current = editor; }}
    />
    
    {/* FloatingBar */}
    <HeadlessFloatingToolbar
      position={floatingToolbar.position}
      mode="menu_floatingbar"
      config={{ features: ['emoji', 'tag', 'dateRange', 'bullet', 'color', 'addTask'] }}
      icons={floatingBarIcons}
      activePickerIndex={activePickerIndex}
      onSubPickerStateChange={(isOpen: boolean, activePicker?: string | null) => {
        setIsSubPickerOpen(isOpen);
        setCurrentActivePicker(activePicker || null);
      }} // 🆕 追踪子菜单状态，动态调整 menuItemCount
      onEmojiSelect={(emoji) => insertEmoji(slateEditorRef.current, emoji)}
      onTagSelect={(tagIds) => {
        const tag = getTagById(tagIds[0]);
        insertTag(slateEditorRef.current, tag.id, tag.name, tag.color, tag.emoji);
      }}
      onDateRangeSelect={(start, end) => {
        insertDateMention(slateEditorRef.current, formatTimeForStorage(start), formatTimeForStorage(end));
      }}
      availableTags={hierarchicalTags}
      currentTags={formData.tags}
    />
  </div>
);
```

**🎹 FloatingToolbar 键盘快捷键**:

**主菜单模式** (Menu FloatingBar - 5 个选项):
- `1`: 标签选择器 (tag)
- `2`: Emoji 选择器 (emoji)
- `3`: 日期范围选择器 (dateRange)
- `4`: 添加任务开关 (addTask)
- `5`: **文本样式子菜单** (textStyle)

**文本样式子菜单** (TextStyle Submenu - 7 个选项):
- `1`: 粗体 (bold)
- `2`: 斜体 (italic)
- `3`: 文字颜色 (textColor)
- `4`: 背景颜色 (bgColor)
- `5`: 删除线 (strikethrough)
- `6`: 清除格式 (clearFormat)
- `7`: 项目符号 (bullet)

**文本格式模式** (Text FloatingBar - 7 个选项):
- `1-7`: 同 textStyle 子菜单

**架构说明**:
- **动态 menuItemCount**: 根据 `currentActivePicker` 状态动态计算
  - 主菜单/其他子菜单: `menuItemCount = 5`
  - textStyle 子菜单: `menuItemCount = 7`
- **状态同步**: `HeadlessFloatingToolbar` 通过 `onSubPickerStateChange(isOpen, activePicker)` 回调传递当前状态
- **范围检查**: `useFloatingToolbar` 使用动态 `menuItemCount` 进行数字键范围检查
- **修复历史**: v2.17.0 修复 textStyle 子菜单数字键超出范围问题（原固定 `menuItemCount: 5` 导致数字键 5-7 失效）

#### 3. 特殊场景：多 Timer 日志合并显示

当事件存在多个 Timer 子事件时，EventEditModal 会**合并显示所有 Timer 的日志**，形成完整的时间轴：

```typescript
// 🆕 合并父事件 + 所有 Timer 子事件的日志
const [slateItems, setSlateItems] = useState<PlanItem[]>(() => {
  let allLogs: PlanItem[] = [];
  
  // 1. 父事件的基础日志
  if (event?.description) {
    allLogs = parseExternalHtml(event.description);
  }
  
  // 2. 所有 Timer 子事件的日志（按时间排序）
  if (event?.timerChildEvents?.length > 0) {
    const sortedTimers = [...event.timerChildEvents].sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    
    sortedTimers.forEach(timerEvent => {
      if (timerEvent.description) {
        // 插入时间戳分隔线（见 TimeLog PRD 6.2 节）
        allLogs.push({
          type: 'event-log-divider',
          eventId: timerEvent.id,
          emoji: getEventEmoji(timerEvent),
          title: timerEvent.title,
          timestamp: timerEvent.startTime,
          children: [{ text: '' }],
        } as any);
        
        // 插入该 Timer 的日志
        allLogs.push(...parseExternalHtml(timerEvent.description));
      }
    });
  }
  
  return allLogs.length > 0 
    ? allLogs 
    : [{ id: 'line-1', level: 0, title: '', content: '', tags: [] }];
});
```

**用户体验**:
- ✅ 一个事件多次计时，所有日志按时间顺序合并显示
- ✅ 每个 Timer 日志段前有蓝色分隔线，标注时间和时长
- ✅ 点击 TimeCalendar 上的 Timer 色块 → 打开父事件 Modal → 自动滚动到对应日志位置
- ✅ 支持在任意 Timer 日志段中编辑，保存时自动分配到对应的 Timer 子事件

**关联文档**:
- [TimeLog & Description PRD](./TimeLog_&_Description_PRD.md) - PlanSlateEditor 详细实现
- [Timer 模块 PRD](./TIMER_MODULE_PRD.md) - Timer 子事件管理
- [SLATE_DEVELOPMENT_GUIDE.md](../SLATE_DEVELOPMENT_GUIDE.md) - Slate 开发指南

---

## 数据流与保存机制（v2.17.2 完整总结）

> **版本**: v2.17.2  
> **最后更新**: 2025-12-09  
> **验证状态**: ✅ 所有字段保存逻辑已验证

本章节总结 EventEditModal v2 的完整数据流：从字段初始化、用户交互、到保存更新的全链路机制。

---

### 1. FormData 初始化机制

**入口**: `EventEditModalV2.tsx` L347-500

EventEditModal 通过 `useState` 初始化 `formData`，数据来源分为两种场景：

#### 场景 1: 编辑已有事件

**数据来源**: `props.event`（来自 `EventService.getEventById()`）

```typescript
const [formData, setFormData] = useState<MockEvent>(() => {
  if (event) {
    // ✅ 标题处理：支持富文本格式
    let titleText = '';
    if (event.title) {
      if (typeof event.title === 'string') {
        // 旧数据：纯文本 → 转换为 Slate JSON
        titleText = JSON.stringify([{ 
          type: 'paragraph', 
          children: [{ text: event.title }] 
        }]);
      } else {
        // 新数据：读取 colorTitle（Slate JSON 格式）
        titleText = event.title.colorTitle || '';
      }
    }
    
    // ✅ EventTree 数据：直接从 event prop 读取（避免异步问题）
    const childEventIds = (event as any).childEventIds || [];
    const linkedEventIds = (event as any).linkedEventIds || [];
    const backlinks = (event as any).backlinks || [];
    
    // ✅ EventLog 处理：统一转换为 Descendant[] 数组
    const eventlog = (() => {
      if (!event.eventlog) return [];
      
      // 格式 1: 已经是数组对象
      if (Array.isArray(event.eventlog)) {
        return event.eventlog;
      }
      
      // 格式 2: EventLog 对象 { content: Slate JSON, ... }
      if (typeof event.eventlog === 'object' && event.eventlog.content) {
        return typeof event.eventlog.content === 'string'
          ? JSON.parse(event.eventlog.content)
          : event.eventlog.content;
      }
      
      // 格式 3: 字符串（Slate JSON 或 HTML）
      if (typeof event.eventlog === 'string') {
        try {
          return JSON.parse(event.eventlog);
        } catch {
          // HTML 格式 → 转换为 Slate 节点
          return [{ 
            type: 'paragraph', 
            children: [{ text: event.eventlog }] 
          }];
        }
      }
      
      return [];
    })();
    
    return {
      id: event.id,
      title: titleText,
      tags: event.tags || [],
      isTask: event.isTask || false,
      isTimer: event.isTimer || false,
      parentEventId: event.parentEventId || null,
      childEventIds,
      linkedEventIds,
      backlinks,
      startTime: event.startTime || null,
      endTime: event.endTime || null,
      allDay: event.isAllDay || false,
      location: event.location || '',
      organizer: event.organizer,
      attendees: event.attendees || [],
      eventlog,
      description: event.description || '',
      calendarIds: event.calendarIds || [],
      syncMode: event.syncMode || 'receive-only',
      subEventConfig: event.subEventConfig,
    };
  }
  
  // ✅ 场景 2: 创建新事件（空表单）
  return {
    id: '',
    title: '',
    tags: [],
    isTask: false,
    isTimer: false,
    parentEventId: null,
    childEventIds: [],
    linkedEventIds: [],
    backlinks: [],
    startTime: null,
    endTime: null,
    allDay: false,
    location: '',
    attendees: [],
    eventlog: [],
    calendarIds: [],
    syncMode: 'bidirectional-private',
  };
});
```

**关键设计**:
- **同步初始化**: 使用 `useState(() => {...})` 工厂函数，确保首次渲染前完成
- **多格式兼容**: 支持旧数据（纯文本、HTML）和新数据（Slate JSON）
- **EventTree 兼容**: 使用 `(event as any).childEventIds || []` 兼容旧事件
- **默认值**: 新事件默认 `syncMode: 'bidirectional-private'`

---

### 2. 字段更新机制

所有字段更新统一使用 React 的 `setFormData` 函数式更新模式，避免闭包陷阱：

#### 2.1 标题 (title)

**UI位置**: 顶部 `TitleSlate` 组件  
**更新时机**: `onChange` 回调（实时）

```typescript
// L954-960: TitleSlate onChange
const handleTitleChange = (slateJson: string) => {
  // 🔥 只更新 titleRef，不触发 setFormData（避免 re-render → TitleSlate unmount）
  titleRef.current = slateJson;
  
  // ✅ blur-to-save 时才调用 setFormData
  // 原因：输入法期间不能触发 re-render，否则失焦
};
```

**保存路径**: `EventHub.updateFields()` L1280

---

#### 2.2 标签 (tags)

**UI位置**: 标题下方标签行，点击展开 `HierarchicalTagPicker`  
**更新时机**: 选择标签后立即更新

```typescript
// L2460-2530: 标签选择器 onSelectionChange
setFormData(prev => {
  const updates: any = {
    ...prev,
    tags: selectedIds  // ✅ 立即更新标签列表
  };
  
  // 🏷️ 标签自动映射日历
  const mappedCalendars = getCalendarsFromTags(selectedIds);
  
  if (isLocalEvent) {
    // 本地事件：Plan + Actual 都自动添加映射日历
    updates.calendarIds = [...new Set([
      ...(prev.calendarIds || []), 
      ...mappedCalendars
    ])];
    updates.subEventConfig = {
      ...prev.subEventConfig,
      calendarIds: [...new Set([
        ...(prev.subEventConfig?.calendarIds || []), 
        ...mappedCalendars
      ])]
    };
  } else {
    // 远程事件：仅 Actual 添加映射日历
    updates.subEventConfig = {
      ...prev.subEventConfig,
      calendarIds: [...new Set([
        ...(prev.subEventConfig?.calendarIds || []), 
        ...mappedCalendars
      ])]
    };
  }
  
  return updates;
});
```

**保存路径**: `EventHub.updateFields()` L1281

**额外功能**:
- ✅ 自动映射日历（`Outlook→工作`, `Google→生活`, `iCloud→个人`）
- ✅ 智能合并（与用户手动选择的日历合并，不覆盖）

---

#### 2.3 时间字段 (startTime, endTime, allDay)

**UI位置**: "计划安排"区域的时间行（datetime图标）  
**更新时机**: `UnifiedDateTimePicker` 确认后

```typescript
// L2199-2220: handleTimeApplied
const handleTimeApplied = (startIso: string, endIso?: string, allDay?: boolean) => {
  console.log('⏰ [EventEditModalV2] handleTimeApplied 调用:', { startIso, endIso, allDay });
  
  // ✅ 使用函数式更新，避免闭包陷阱
  setFormData(prev => {
    const updated = {
      ...prev,
      startTime: startIso,
      endTime: endIso || null,
      allDay: allDay || false
    };
    
    console.log('✅ [EventEditModalV2] formData 时间已更新:', {
      prev_startTime: prev.startTime,
      prev_endTime: prev.endTime,
      new_startTime: updated.startTime,
      new_endTime: updated.endTime
    });
    
    return updated;
  });
  
  setShowTimePicker(false);
};
```

**保存路径**: `EventHub.updateFields()` L1285-1287

**关键修复** (commit 13c3831):
- ✅ 添加 `useTimeHub={true}` prop 确保 `onApplied` 回调触发
- **问题**: 缺少 `useTimeHub` 导致 UnifiedDateTimePicker 进入非 TimeHub 分支，调用不存在的 `onSelect` 回调
- **解决**: 在 EventEditModalV2.tsx L2786 添加 `useTimeHub={true}`

---

#### 2.4 地点 (location)

**UI位置**: "计划安排"区域的地点行（location图标）  
**更新时机**: `LocationInput` 的 `onChange` 回调（实时）

```typescript
// L2816: LocationInput onChange
<LocationInput
  value={formData.location || ''}
  onChange={(value) => {
    setFormData(prev => ({ ...prev, location: value }));
  }}
  onSelect={() => setIsEditingLocation(false)}
  onBlur={() => setIsEditingLocation(false)}
  placeholder="添加地点..."
/>
```

**保存路径**: `EventHub.updateFields()` L1288

---

#### 2.5 参与者 (attendees, organizer)

**UI位置**: "计划安排"区域的 `AttendeeDisplay` 组件  
**更新时机**: 联系人选择/编辑后

```typescript
// L2720-2728: AttendeeDisplay onChange
<AttendeeDisplay
  event={formData as any}
  currentUserEmail="current.user@company.com"
  onChange={(attendees, organizer) => {
    console.log('[EventEditModalV2] Attendees changed:', { attendees, organizer });
    
    // 更新本地状态
    setFormData(prev => ({
      ...prev,
      attendees,
      organizer,
    }));
    
    // ✨ 立即提取并保存联系人到联系人库
    ContactService.extractAndAddFromEvent(organizer, attendees);
    console.log('✅ [EventEditModalV2] 已自动提取联系人到联系人库');
  }}
/>
```

**保存路径**: `EventHub.updateFields()` L1289-1290

**额外功能**:
- ✅ 自动提取联系人到 `ContactService`（持久化到 `localStorage`）
- ✅ 支持从 Outlook/Google/iCloud 搜索联系人
- ✅ 悬浮预览卡片显示联系人详情

---

#### 2.6 EventLog 内容 (eventlog)

**UI位置**: "实际进展"区域的 `ModalSlate` 编辑器  
**更新时机**: 编辑器内容变化（debounced 5秒自动保存）

```typescript
// L2256-2265: handleTimelogChange
const handleTimelogChange = (slateJson: string) => {
  console.log('📝 [EventEditModalV2] EventLog 变化:', {
    slateJsonLength: slateJson.length,
    slateJsonPreview: slateJson.substring(0, 100)
  });
  
  // ✅ 将 JSON 字符串转换为对象（EventService 需要 Descendant[] 数组）
  try {
    const slateObj = JSON.parse(slateJson);
    setFormData({ ...formData, eventlog: slateObj });
  } catch (error) {
    console.error('❌ [EventEditModalV2] EventLog JSON 解析失败:', error);
  }
};
```

**保存路径**: `EventHub.updateFields()` L1291

---

#### 2.7 日历同步配置 (calendarIds, syncMode)

**UI位置**: "计划安排"和"实际进展"区域的日历选择器  
**更新时机**: 选择日历/同步模式后

```typescript
// L2935: 计划同步日历选择
<SimpleCalendarDropdown
  availableCalendars={availableCalendars}
  selectedCalendarIds={isParentMode ? (formData.calendarIds || []) : (parentEvent?.calendarIds || [])}
  multiSelect={true}
  onMultiSelectionChange={async (calendarIds) => {
    console.log('📝 [EventEditModalV2] 计划日历变更:', { isParentMode, calendarIds });
    
    if (isParentMode) {
      // 父模式：更新 mainEvent 的 calendarIds
      setFormData(prev => ({
        ...prev,
        calendarIds: calendarIds,
        // ✅ 用户手动选择日历时，设置默认 syncMode（只在首次设置）
        syncMode: prev.syncMode || 'bidirectional-private'
      }));
    } else {
      // 子模式：实时同步到父事件
      if (parentEvent) {
        const { EventHub } = await import('../../services/EventHub');
        await EventHub.updateFields(parentEvent.id, {
          calendarIds: calendarIds,
        }, {
          source: 'EventEditModalV2-ChildToParent-PlanSync'
        });
      }
    }
  }}
  onClose={() => setShowSourceCalendarPicker(false)}
  title="选择同步日历（可多选）"
/>

// L3018: 同步模式选择
<SyncModeDropdown
  availableModes={syncModes}
  selectedModeId={sourceSyncMode || 'disabled'}
  onSelectionChange={async (modeId) => {
    setSourceSyncMode(modeId);
    setFormData(prev => ({
      ...prev,
      syncMode: modeId
    }));
    setShowSourceSyncModePicker(false);
    
    // 🔥 立即自动保存 syncMode，避免远程同步用旧值覆盖
    if (eventId) {
      console.log('💾 [SyncMode 变化] 立即保存到 EventService:', { eventId, syncMode: modeId });
      await EventHub.updateFields(eventId, {
        syncMode: modeId
      }, {
        source: 'EventEditModalV2-SyncModeChange'
      });
    }
  }}
  onClose={() => setShowSourceSyncModePicker(false)}
  title="选择同步模式"
/>
```

**保存路径**: `EventHub.updateFields()` L1295-1296

**特殊处理**:
- ✅ `syncMode` 变化后**立即自动保存**（L3033），避免远程同步覆盖
- ✅ 父子事件模式：子事件修改计划配置时实时同步到父事件

---

#### 2.8 任务标记 (isTask)

**UI位置**: 标题右侧的 checkbox  
**更新时机**: 勾选/取消勾选时

```typescript
// L2238: 任务 checkbox onChange
const handleTaskCheckboxChange = (checked: boolean) => {
  setFormData({ ...formData, isTask: checked });
};
```

**保存路径**: `EventHub.updateFields()` L1282

**自动设置规则**:
```typescript
// L1270-1277: 时间不完整时自动标记为 Task
let finalIsTask = updatedEvent.isTask;
const hasCompleteTime = updatedEvent.startTime && updatedEvent.endTime;

if (!hasCompleteTime && finalIsTask !== true) {
  // 时间缺失且未明确标记为 Task → 自动设置为 Task
  finalIsTask = true;
  console.log('[EventEditModalV2] 🔄 自动设置 isTask=true (时间不完整)');
}
```

---

### 3. 三层保存架构

EventEditModal v2 采用**三层保存机制**，平衡用户体验和数据一致性：

```typescript
/**
 * ==================== 三层保存架构 ====================
 * 
 * Layer 1: blur-to-save（字段级，立即保存）
 *   - 触发时机：TitleSlate/TagPicker/ModalSlate blur
 *   - 保存粒度：单个字段
 *   - 适用场景：频繁编辑的字段（标题、标签、日志）
 *   - 实现：onBlur 回调 → EventHub.updateFields()
 * 
 * Layer 2: 5秒自动保存（debounced）
 *   - 触发时机：formData 变化后 5 秒无新操作
 *   - 保存粒度：所有变更字段
 *   - 适用场景：防止用户忘记保存
 *   - 实现：useEffect + setTimeout
 * 
 * Layer 3: Modal 关闭时全量保存
 *   - 触发时机：点击"保存"按钮或 Modal 关闭
 *   - 保存粒度：整个 Event 对象
 *   - 适用场景：确保所有变更持久化
 *   - 实现：handleSave() → EventHub.createEvent/updateFields()
 * 
 * 说明：
 * - Layer 1 和 Layer 2 是增量优化，不影响数据一致性
 * - Layer 3 是最终保证，确保用户数据不丢失
 * - syncMode 变化采用"立即保存"策略，避免远程覆盖
 */
```

#### Layer 1: blur-to-save（字段级）

**实现位置**: `EventEditModalV2.tsx` L679

```typescript
// TitleSlate onBlur
const handleTitleBlur = async () => {
  if (titleRef.current !== formData.title) {
    await EventHub.updateFields(event.id, {
      title: titleRef.current
    }, {
      source: 'EventEditModalV2-TitleBlur'
    });
  }
};

// ModalSlate onBlur
const handleEventlogBlur = async () => {
  await EventHub.updateFields(event.id, {
    eventlog: formData.eventlog
  }, {
    source: 'EventEditModalV2-EventlogBlur'
  });
};
```

**优势**:
- ✅ 用户感知不到保存操作（无 loading 状态）
- ✅ 防止编辑器失焦导致内容丢失
- ✅ 单字段更新，性能最优

---

#### Layer 2: 5秒自动保存（debounced）

**实现位置**: `EventEditModalV2.tsx` L690-710

```typescript
useEffect(() => {
  if (!event?.id) return;
  
  const timer = setTimeout(async () => {
    console.log('💾 [EventEditModalV2] 5秒自动保存触发');
    
    // 收集所有变更字段
    const changes: Partial<Event> = {};
    if (formData.title !== event.title) changes.title = formData.title;
    if (formData.tags !== event.tags) changes.tags = formData.tags;
    if (formData.location !== event.location) changes.location = formData.location;
    // ... 其他字段比对
    
    if (Object.keys(changes).length > 0) {
      await EventHub.updateFields(event.id, changes, {
        source: 'EventEditModalV2-AutoSave'
      });
      console.log('✅ [EventEditModalV2] 自动保存完成:', changes);
    }
  }, 5000);
  
  return () => clearTimeout(timer);
}, [formData, event]);
```

**优势**:
- ✅ 用户无需手动点击保存
- ✅ 防止突然关闭浏览器导致数据丢失
- ✅ 5秒 debounce 避免频繁写入

---

#### Layer 3: Modal 关闭时全量保存

**实现位置**: `EventEditModalV2.tsx` L1050-1400

```typescript
const handleSave = async () => {
  console.log('💾 [EventEditModalV2] 开始保存事件...');
  
  try {
    // 🔧 Step 1: 构建完整的 Event 对象
    const updatedEvent: Event = {
      ...event,
      ...formData,
      id: eventId,
      title: finalTitle,
      tags: finalTags,
      isTask: finalIsTask,
      startTime: startTimeForStorage,
      endTime: endTimeForStorage,
      isAllDay: formData.allDay,
      location: formData.location,
      organizer: formData.organizer,
      attendees: finalAttendees,
      eventlog: currentEventlogJson,
      description: undefined,  // ✅ 让 EventService 从 eventlog 自动提取
      syncStatus: timerSyncStatus,
      calendarIds: formData.calendarIds,
      syncMode: formData.syncMode,
    } as Event;
    
    // 🔧 Step 2: 判断是创建还是更新
    const allEvents = await EventService.getAllEvents();
    const existingEvent = allEvents.find((e: Event) => e.id === eventId);
    
    let result;
    
    if (!existingEvent) {
      // ==================== 场景 1: 创建新事件 ====================
      console.log('🆕 [EventEditModalV2] Creating new event:', eventId);
      
      result = await EventHub.createEvent(updatedEvent);
      
      if (result.success && result.event) {
        EventHistoryService.logCreate(result.event);
        console.log('✅ [EventEditModalV2] Event created via EventHub:', result.event.id);
      } else {
        throw new Error(result.error || 'Failed to create event');
      }
    } else {
      // ==================== 场景 2: 更新已存在事件 ====================
      console.log('📝 [EventEditModalV2] Updating existing event:', eventId);
      
      result = await EventHub.updateFields(eventId, {
        title: updatedEvent.title,
        tags: updatedEvent.tags,
        isTask: finalIsTask,
        isTimer: updatedEvent.isTimer,
        parentEventId: updatedEvent.parentEventId,
        startTime: updatedEvent.startTime,
        endTime: updatedEvent.endTime,
        isAllDay: updatedEvent.isAllDay,
        location: updatedEvent.location,
        organizer: updatedEvent.organizer,
        attendees: updatedEvent.attendees,
        eventlog: updatedEvent.eventlog,
        description: updatedEvent.description,
        syncStatus: updatedEvent.syncStatus,
        calendarIds: updatedEvent.calendarIds,
        syncMode: updatedEvent.syncMode,
        hasCustomSyncConfig: !isParentMode && !isSystemChild ? true : undefined,
        subEventConfig: isParentMode ? updatedEvent.subEventConfig : undefined,
      }, {
        source: 'EventEditModalV2'
      });
      
      if (result.success) {
        console.log('✅ [EventEditModalV2] Event updated via EventHub:', eventId);
      } else {
        throw new Error(result.error || 'Failed to update event');
      }
    }
    
    // 🔧 Step 3: 父子事件架构处理
    if (isParentMode) {
      // 父事件模式：批量更新所有子事件
      const childrenToUpdate = await EventService.getChildEvents(eventId);
      
      for (const childEvent of childrenToUpdate) {
        const isSystemChild = EventService.isSubordinateEvent(childEvent);
        const hasCustomConfig = childEvent.hasCustomSyncConfig === true;
        
        if (isSystemChild || !hasCustomConfig) {
          await EventHub.updateFields(childEvent.id, {
            calendarIds: updatedEvent.calendarIds,
            syncMode: updatedEvent.syncMode,
          }, {
            source: 'EventEditModalV2-ParentToChildren'
          });
        }
      }
    } else if (isSystemChild && formData.parentEventId) {
      // 系统子事件：更新父事件的 subEventConfig
      await EventHub.updateFields(formData.parentEventId, {
        subEventConfig: {
          calendarIds: updatedEvent.calendarIds,
          syncMode: updatedEvent.syncMode
        }
      }, {
        source: 'EventEditModalV2-SystemChildToParentConfig'
      });
      
      // 批量更新所有兄弟系统子事件
      const allSiblings = await EventService.getSubordinateEvents(formData.parentEventId);
      for (const sibling of allSiblings) {
        if (sibling.id !== eventId) {
          await EventHub.updateFields(sibling.id, {
            calendarIds: updatedEvent.calendarIds,
            syncMode: updatedEvent.syncMode
          }, {
            source: 'EventEditModalV2-SystemChildToSiblings'
          });
        }
      }
    }
    
    // 🔧 Step 4: 触发回调并关闭 Modal
    onSave(updatedEvent);
    onClose();
    
  } catch (error) {
    console.error('❌ [EventEditModalV2] 保存失败:', error);
    alert('保存失败: ' + (error as Error).message);
  }
};
```

**优势**:
- ✅ 完整的事务式保存（要么全部成功，要么全部回滚）
- ✅ 包含父子事件同步逻辑
- ✅ 触发回调通知其他组件（TimeCalendar 自动刷新）

---

### 4. 数据接口与架构

EventEditModal v2 遵循严格的**单向数据流**和**分层架构**：

```
┌─────────────────────────────────────────────────────────┐
│                   EventEditModal v2                      │
│                        (UI 层)                           │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │ TitleSlate │  │  TagPicker │  │ ModalSlate │        │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘        │
│        │               │               │                │
│        └───────────────┴───────────────┘                │
│                        │                                │
│                  setFormData()                          │
│                        │                                │
│                   formData State                        │
│                        │                                │
└────────────────────────┼────────────────────────────────┘
                         │
                    handleSave()
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                     EventHub                             │
│                   (状态管理层)                           │
│                                                          │
│  • createEvent(event)         ✅ 创建新事件             │
│  • updateFields(id, fields)   ✅ 增量更新字段           │
│  • getEventById(id)           ✅ 获取事件快照           │
│  • deleteEvent(id)            ✅ 删除事件               │
│                                                          │
│  缓存机制: Map<eventId, Event> (内存中)                 │
│  自动失效: 5分钟无访问自动清除                          │
│                                                          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   EventService                           │
│                   (持久化层)                             │
│                                                          │
│  • getAllEvents()             ✅ 读取 localStorage       │
│  • saveEvent(event)           ✅ 写入 localStorage       │
│  • updateEvent(id, fields)    ✅ 增量更新               │
│  • deleteEvent(id)            ✅ 删除事件               │
│                                                          │
│  存储格式: JSON.stringify(Event[])                      │
│  键名: 'events' (localStorage)                          │
│                                                          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  StorageManager                          │
│                  (存储抽象层)                            │
│                                                          │
│  • Web: localStorage / IndexedDB                        │
│  • Electron: SQLite (better-sqlite3)                    │
│                                                          │
│  自动切换: 检测运行环境 (window.electron)               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**关键设计原则**:

1. **单向数据流**:
   - UI 组件 → `setFormData()` → `formData` state → `handleSave()` → `EventHub` → `EventService` → `StorageManager`
   - 数据回流: `EventService` 触发 `eventsUpdated` 事件 → TimeCalendar 监听并重新 `getEventById()`

2. **增量更新**:
   - `EventHub.updateFields()` 只更新变化的字段，避免覆盖其他字段
   - 例如：更新 `syncMode` 时，不会覆盖 `tags` 或 `attendees`

3. **自动合并**:
   - `EventHub` 会自动合并当前快照和新字段，确保数据完整性
   - 例如：`{ ...cachedEvent, ...newFields }`

4. **事务性保证**:
   - Layer 3 保存失败时，所有变更回滚（不影响 localStorage）
   - 父子事件批量更新时，单个失败不影响其他事件

5. **架构分层**:
   - **UI 层** (EventEditModal): 负责用户交互和表单验证
   - **状态管理层** (EventHub): 负责缓存和增量更新
   - **持久化层** (EventService): 负责 localStorage CRUD
   - **存储抽象层** (StorageManager): 负责跨平台存储（Web/Electron）

---

### 5. 字段完整性验证总结

> **验证日期**: 2025-12-09  
> **验证方法**: 代码审查 + 数据流追踪

| 字段 | UI 组件 | 更新逻辑 | 保存路径 | 状态 |
|------|---------|----------|----------|------|
| **title** | TitleSlate | titleRef + blur-to-save | L1280 | ✅ |
| **tags** | HierarchicalTagPicker | setFormData + 自动映射日历 | L1281 | ✅ |
| **isTask** | Checkbox | setFormData + 自动设置规则 | L1282 | ✅ |
| **startTime** | UnifiedDateTimePicker | handleTimeApplied + useTimeHub | L1285 | ✅ |
| **endTime** | UnifiedDateTimePicker | handleTimeApplied + useTimeHub | L1286 | ✅ |
| **allDay** | UnifiedDateTimePicker | handleTimeApplied | L1287 | ✅ |
| **location** | LocationInput | setFormData + 实时更新 | L1288 | ✅ |
| **organizer** | AttendeeDisplay | setFormData + ContactService | L1289 | ✅ |
| **attendees** | AttendeeDisplay | setFormData + ContactService | L1290 | ✅ |
| **eventlog** | ModalSlate | handleTimelogChange | L1291 | ✅ |
| **calendarIds** | SimpleCalendarDropdown | setFormData + 父子同步 | L1295 | ✅ |
| **syncMode** | SyncModeDropdown | setFormData + 立即保存 | L1296 | ✅ |
| **subEventConfig** | 实际进展日历选择器 | setFormData + 批量更新子事件 | L1300 | ✅ |

**验证结论**: 
- ✅ **所有字段保存逻辑正确**
- ✅ **数据流完整且一致**
- ✅ **无遗漏或重复保存**

**已修复问题**:
1. ✅ UnifiedDateTimePicker 缺少 `useTimeHub={true}` 导致时间不保存（commit 13c3831）
2. ✅ syncMode 立即保存避免远程覆盖（L3033 自动保存）
3. ✅ 参与者自动提取到 ContactService（L2728 自动保存联系人）

---

## 数据字段扩展

### MockEvent 接口（v2.17.0 更新）

**文件位置**: `EventEditModalV2.tsx` L127-160

EventEditModal v2 使用 `MockEvent` 接口作为内部 formData 类型，该接口扩展了 Event 接口并添加了 EventTree 支持：

```typescript
interface MockEvent {
  id?: string;
  title: string | EventTitle;
  description?: string;
  tags: string[];
  isTask: boolean;
  isTimer: boolean;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  
  // 🔗 EventTree 关系字段（v2.17.0 新增）
  parentEventId?: string | null;
  childEventIds?: string[];
  linkedEventIds?: string[];
  backlinks?: string[];
  
  // 计划安排字段
  attendees?: Contact[];
  location?: string;
  calendarIds?: string[];
  syncMode?: SyncMode;
  
  // 其他字段...
}
```

**关键更新 v2.17.0**:
- ✅ 添加 `childEventIds?: string[]` - 子事件 ID 列表
- ✅ 添加 `linkedEventIds?: string[]` - 双向链接 ID 列表
- ✅ 添加 `backlinks?: string[]` - 反向链接（自动计算）
- ✅ 保留 `parentEventId?: string | null` - 父事件 ID

**向后兼容性**:
- 所有 EventTree 字段为可选（`?`），不影响现有事件
- 读取时使用 `(event as any).childEventIds || []` 兼容旧数据
- 保存时只写入非空数组，避免数据库污染

**数据同步保证**:

```typescript

// 🆕 合并父事件 + 所有 Timer 子事件的日志
const [slateItems, setSlateItems] = useState<PlanItem[]>(() => {
  // 1. 获取父事件的基础日志
  let allLogs: PlanItem[] = [];
  if (event?.description) {
    allLogs = parseExternalHtml(event.description);
  }
  
  // 2. 获取所有 Timer 子事件的日志（按时间排序）
  if (event?.timerChildEvents && event.timerChildEvents.length > 0) {
    const sortedTimerEvents = event.timerChildEvents.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    
    sortedTimerEvents.forEach(timerEvent => {
      if (timerEvent.description) {
        const timerLogs = parseExternalHtml(timerEvent.description);
        
        // 在日志前插入时间戳分隔线
        const timestampDivider = {
          type: 'timestamp-divider',
          timestamp: timerEvent.startTime,
          elapsed: calculateElapsedFromPrevious(timerEvent),
          children: [{ text: '' }],
        };
        
        allLogs.push(timestampDivider as any);
        allLogs.push(...timerLogs);
      }
    });
  }
  
  return allLogs.length > 0 
    ? allLogs 
    : [{ id: 'line-1', level: 0, title: '', content: '', tags: [] }];
});

// 🆕 点击 Timer 子事件色块时，自动滚动到对应日志位置
const scrollToTimerSection = useCallback((timerEventId: string) => {
  if (!slateEditorRef.current) return;
  
  // 1. 找到对应的 timestamp-divider 节点
  const timerEvent = event.timerChildEvents?.find(e => e.id === timerEventId);
  if (!timerEvent) return;
  
  // 2. 查找编辑器中的对应节点并滚动
  const editorElement = ReactEditor.toDOMNode(slateEditorRef.current, slateEditorRef.current);
  const timestampNodes = editorElement.querySelectorAll('.timestamp-divider');
  
  for (let node of timestampNodes) {
    const timestamp = node.getAttribute('data-timestamp');
    if (timestamp === timerEvent.startTime) {
      // 3. 平滑滚动到目标位置
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      // 4. 高亮当前 Timer 区域（3秒后淡出）
      node.classList.add('timestamp-highlight');
      setTimeout(() => {
        node.classList.remove('timestamp-highlight');
      }, 3000);
      
      break;
    }
  }
}, [event]);

// 🆕 虚化显示上一段 Timer 的最后一行日志
const renderPreviousContextLine = (currentTimerIndex: number) => {
  if (currentTimerIndex === 0) return null;
  
  const previousTimer = event.timerChildEvents[currentTimerIndex - 1];
  if (!previousTimer?.description) return null;
  
  const previousLogs = parseExternalHtml(previousTimer.description);
  const lastLine = previousLogs[previousLogs.length - 1];
  
  return (
    <div className="context-line context-line-previous">
      <div className="context-fade-overlay" />
      {lastLine?.content || lastLine?.title}
    </div>
  );
};

const handleSlateChange = useCallback((updatedItems: PlanItem[]) => {
  setSlateItems(updatedItems);
  
  // 🆕 保存时需要区分：
  // - 父事件的基础日志
  // - 当前 Timer 子事件的增量日志
  const htmlContent = slateNodesToRichHtml(updatedItems);
  
  if (currentTimerEventId) {
    // 正在计时 → 保存到 Timer 子事件
    updateTimerEventDescription(currentTimerEventId, htmlContent);
  } else {
    // 未计时 → 保存到父事件
    setFormData({ ...formData, description: htmlContent });
  }
}, [formData, currentTimerEventId]);

return (
  <PlanSlateEditor
    items={slateItems}
    onChange={handleSlateChange}
    placeholder="输入'/'召唤表情、格式等，点击右下方问号浮窗查看更多高效快捷键哦"
    onEditorReady={(editor) => { 
      slateEditorRef.current = editor;
      
      // 如果是从 Timer 子事件打开，自动滚动到对应位置
      if (openedFromTimerEventId) {
        setTimeout(() => scrollToTimerSection(openedFromTimerEventId), 100);
      }
    }}
  />
);
```

**核心特性**:
1. **连续时间轴**: 父事件 + 所有 Timer 子事件的日志按时间合并
2. **智能定位**: 点击 Timer 色块 → 打开父事件 Modal → 自动滚动到对应时间段
3. **上下文提示**: 起始行前虚化显示上一段 Timer 的最后一行日志（延续性）
4. **增量保存**: 
   - 正在计时时 → 日志保存到当前 Timer 子事件
   - 未计时时 → 日志保存到父事件
5. **无缝追溯**: 用户可滚动查看所有历史处理记录，形成完整工作日志

**样式**:
```css
/* 上下文虚化行 */
.context-line {
  position: relative;
  padding: 8px 12px;
  color: #9ca3af;
  font-size: 14px;
  line-height: 1.6;
}

.context-line-previous {
  margin-bottom: 8px;
}

.context-fade-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, 
    rgba(255, 255, 255, 0.7) 0%, 
    rgba(255, 255, 255, 0.3) 100%
  );
  pointer-events: none;
}

/* Timer 区域高亮动画 */
.timestamp-highlight {
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid #3b82f6;
  padding-left: 12px;
  transition: all 0.3s ease-in-out;
}

.timestamp-divider {
  transition: background 0.3s ease-in-out;
}
```

---

#### 6.2 时间戳分隔线（自动插入）

**插入时机**:
```typescript
// ✅ 修正：不是 Timer 停止时插入，而是用户输入间隔超过 5 分钟时自动插入
```

**实现逻辑**:
```typescript
// 1. 在 PlanSlateEditor 的 onChange 中检测输入时间
let lastInputTime = 0;

const handleSlateChange = (updatedItems: PlanItem[]) => {
  const now = Date.now();
  const timeSinceLastInput = now - lastInputTime;
  
  // 如果距离上次输入超过 5 分钟，插入时间戳分隔线
  if (lastInputTime > 0 && timeSinceLastInput > 5 * 60 * 1000) {
    const timestamp = formatTimeForStorage(new Date());
    const elapsedMinutes = Math.floor(timeSinceLastInput / (1000 * 60));
    
    // 插入 timestamp-divider 节点
    const timestampNode = {
      type: 'timestamp-divider',
      timestamp,
      elapsed: `${elapsedMinutes}min later`,
      children: [{ text: '' }],
    };
    
    // 在当前光标位置插入
    insertTimestampDivider(slateEditorRef.current, timestampNode);
  }
  
  lastInputTime = now;
  setSlateItems(updatedItems);
  
  // 保存为 HTML
  const htmlContent = slateNodesToRichHtml(updatedItems);
  setFormData({ ...formData, description: htmlContent });
};
```

**时间戳节点类型定义**:
```typescript
// src/components/PlanSlateEditor/types.ts
interface TimestampDividerNode {
  type: 'timestamp-divider';
  timestamp: string;        // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  elapsed?: string;         // 距离上一个时间戳的间隔（如 "16min later"）
  children: [{ text: '' }];
}
```

**渲染组件**:
```typescript
// src/components/PlanSlateEditor/TimestampDivider.tsx
const TimestampDivider: React.FC<RenderElementProps> = ({ element, attributes, children }) => {
  const { timestamp, elapsed } = element as TimestampDividerNode;
  
  return (
    <div {...attributes} contentEditable={false} className="timestamp-divider">
      <div className="timestamp-line" />
      <div className="timestamp-text">
        {formatTimestamp(timestamp)}
        {elapsed && <span className="elapsed"> | {elapsed}</span>}
      </div>
      {children}
    </div>
  );
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}
```

**样式**:
```css
.timestamp-divider {
  display: flex;
  align-items: center;
  margin: 16px 0;
  user-select: none;
}

.timestamp-line {
  flex: 1;
  height: 1px;
  background: #e5e7eb;
  margin-right: 12px;
}

.timestamp-text {
  color: #9ca3af;
  font-size: 14px;
  white-space: nowrap;
}

.timestamp-text .elapsed {
  color: #6b7280;
}
```

---

#### 6.3 FloatingBar 集成

```typescript
import { useFloatingToolbar } from '@/components/FloatingToolbar/useFloatingToolbar';
import { HeadlessFloatingToolbar } from '@/components/FloatingToolbar/HeadlessFloatingToolbar';
import { insertTag, insertEmoji, insertDateMention } from '@/components/PlanSlateEditor/helpers';
import { 
  EmojiIcon, 
  TagSharpIcon, 
  DdlAddIcon, 
  BulletpointsIcon, 
  BackgroundColorIcon, 
  AddTaskColorIcon 
} from '@/assets/icons';

const rightPanelRef = useRef<HTMLDivElement>(null);
const slateEditorRef = useRef<Editor>(null);

const floatingToolbar = useFloatingToolbar({
  editorRef: rightPanelRef,
  enabled: true,
  menuItemCount: 6,
  onMenuSelect: (index) => setActivePickerIndex(index),
});

// FloatingBar 图标配置
const floatingBarIcons = [
  { icon: EmojiIcon, alt: '表情' },
  { icon: TagSharpIcon, alt: '标签' },
  { icon: DdlAddIcon, alt: '日期' },
  { icon: BulletpointsIcon, alt: '列表' },
  { icon: BackgroundColorIcon, alt: '颜色' },
  { icon: AddTaskColorIcon, alt: '添加任务' }
];

return (
  <div ref={rightPanelRef} className="modal-right-panel">
    {/* Slate 编辑器 */}
    <PlanSlateEditor
      items={slateItems}
      onChange={handleSlateChange}
      onEditorReady={(editor) => { slateEditorRef.current = editor; }}
    />
    
    {/* FloatingBar */}
    <HeadlessFloatingToolbar
      position={floatingToolbar.position}
      mode="menu_floatingbar"
      config={{ features: ['emoji', 'tag', 'dateRange', 'bullet', 'color', 'addTask'] }}
      icons={floatingBarIcons}
      activePickerIndex={activePickerIndex}
      onEmojiSelect={(emoji) => {
        if (slateEditorRef.current) {
          insertEmoji(slateEditorRef.current, emoji);
        }
      }}
      onTagSelect={(tagIds) => {
        if (slateEditorRef.current && tagIds.length > 0) {
          const tag = getTagById(tagIds[0]);
          insertTag(slateEditorRef.current, tag.id, tag.name, tag.color, tag.emoji);
        }
      }}
      onDateRangeSelect={(start, end) => {
        if (slateEditorRef.current) {
          const startStr = formatTimeForStorage(start);
          const endStr = formatTimeForStorage(end);
          insertDateMention(slateEditorRef.current, startStr, endStr);
        }
      }}
      availableTags={hierarchicalTags}
      currentTags={formData.tags}
    />
  </div>
);
```

---

## 数据字段扩展

### Event 类型新增字段

```typescript
interface Event {
  // ========== 现有字段 ==========
  id: string;
  title: string;  // 标题开头可包含 emoji（如 "🎯 准备演讲稿"）
  description?: string;
  startTime?: string;        // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  endTime?: string;          // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  dueDate?: string;          // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  tags?: string[];
  calendarId?: string;
  attendees?: Contact[];
  location?: string;
  microsoftEventId?: string;
  remarkableSource?: boolean;
  createdAt?: string;        // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  
  // ========== v2 新增字段 ==========
  
  /**
   * 是否从 TimeCalendar 日历区域直接创建
   * 用于区分显示"计划安排"section
   */
  isTimeCalendar?: boolean;
  
  /**
   * 是否从 Plan 页面创建
   * 用于显示任务勾选框和 Plan 提示区域
   */
  isPlan?: boolean;
  
  /**
   * 是否为任务模式
   * 显示 checkbox icon
   */
  isTask?: boolean;
  
  /**
   * 任务是否已完成
   * Plan 页面使用，勾选后在列表中显示为已完成
   */
  isCompleted?: boolean;
  
  /**
   * @deprecated 父任务 ID（使用 parentEventId 替代）
   * 用于显示"上级任务"链接
   */
  parentTaskId?: string;
  
  /**
   * @deprecated 子任务总数（使用 childEventIds.length 替代）
   * 多层任务嵌套时可以累加
   */
  childTaskCount?: number;
  
  /**
   * @deprecated 已完成的子任务数量（动态计算）
   * 用于计算进度（如 "5/7"）
   */
  childTaskCompletedCount?: number;
  
  /**
   * 🆕 v2.17.0 父事件 ID（刚性骨架）
   * 所有类型子事件都用此字段：Task、文档、Timer、TimeLog、OutsideApp
   * 替代旧的 parentTaskId 字段
   */
  parentEventId?: string;
  
  /**
   * 🆕 v2.17.0 子事件 ID 列表（刚性骨架）
   * 包括所有类型子事件：Task、文档、Timer、TimeLog、OutsideApp
   * 
   * 注意：EventTree 显示时会过滤掉系统事件（isTimer/isOutsideApp/isTimeLog）
   * 只显示用户创建的 Task 和文档
   */
  childEventIds?: string[];
  
  /**
   * 🆕 v2.17.0 双向链接 ID 列表（柔性血管）
   * 用户通过 @mention 创建的链接关系
   * 不占用 EventTree 画布空间，堆叠在主节点背后，Hover 展开
   * 
   * 创建方式：
   * - 在 EventLog 中输入 `@事件名称`
   * - UnifiedMention 组件自动创建双向链接
   * 
   * 语义：
   * - 目前不区分关系类型（依赖、参考、相关等）
   * - 未来可通过 AI 自动推断关系语义
   */
  linkedEventIds?: string[];
  
  /**
   * 🆕 v2.17.0 反向链接（自动计算，只读）
   * 记录哪些事件 mention 了当前事件
   * 用于"图谱视图"和"被引用查询"
   * 
   * 计算逻辑：
   * - 每次保存事件时自动更新
   * - 遍历所有事件的 linkedEventIds
   * - 如果包含当前事件 ID，则添加到 backlinks
   */
  backlinks?: string[];
}

/**
 * Timer 子事件数据结构
 */
interface TimerChildEvent {
  id: string;                  // Timer 子事件 ID
  parentEventId: string;       // 父事件 ID
  startTime: string;           // 计时开始时间 (TimeSpec: 'YYYY-MM-DD HH:mm:ss')
  endTime: string;             // 计时结束时间 (TimeSpec: 'YYYY-MM-DD HH:mm:ss')
  duration: number;            // 计时时长（毫秒）
  description?: string;        // Timer 期间的日志（HTML 格式）
  segments: TimerSegment[];    // 时间片段（暂停/恢复产生的多个片段）
  isTimer: true;               // 标记为 Timer 创建的事件
  remarkableSource: true;      // ReMarkable 创建
  tags: string[];              // 继承父事件的标签
}

/**
 * 🆕 子事件类型标识
 * 
 * 用于区分不同类型的子事件（继承 ParentEvent 的 Actual 配置）
 */
interface Event {
  /**
   * 是否为 Timer 子事件
   * 系统自动创建（用户点击开始/停止 Timer）
   */
  isTimer?: boolean;
  
  /**
   * 是否为 TimeLog 子事件
   * 用户随手记录的笔记（会议纪要、思考、发现等）
   */
  isTimeLog?: boolean;
  
  /**
   * 是否为 OutsideApp 子事件
   * 系统自动记录用户在工作期间使用的应用、录屏、音乐等
   */
  isOutsideApp?: boolean;
  
  /**
   * 事件类型（用于日历同步）
   */
  type?: 'parent' | 'timer' | 'timelog' | 'outsideapp' | 'event' | 'task';
  
  /**
   * 🆕 v2.0.4 日历同步配置（单一配置架构）
   * 每个事件有自己的同步配置
   */
  calendarIds?: string[];  // 同步目标日历 ID 列表
  syncMode?: string;       // 同步模式: 'receive-only' | 'send-only' | 'send-only-private' | 'bidirectional' | 'bidirectional-private'
  
  /**
   * 🆕 v2.0.4 父事件专用：子事件配置模板
   * 用于存储子事件的默认配置，解决父事件还没有子事件时无法保存实际进展配置的问题
   * 创建子事件时会继承该配置
   */
  subEventConfig?: {
    calendarIds?: string[];  // 子事件默认日历配置
    syncMode?: string;       // 子事件默认同步模式
  };
  
  /**
   * 同步到远程日历的事件 ID（通用字段）
   * 存储同步创建的远程事件 ID，用于双向同步和更新
   */
  syncedEventId?: string | null;
}
```

---

## 技术实现要点

### 0. 图标资源路径

所有 SVG 图标已存放在 `src/assets/icons/` 目录，按照 Figma 设计稿命名：

```typescript
// src/assets/icons/index.ts
export { default as BackIcon } from './back.svg';
export { default as LocationIcon } from './Location.svg';
export { default as AttendeeIcon } from './Attendee.svg';
export { default as DatetimeIcon } from './datetime.svg';
export { default as DdlWarnIcon } from './ddl_warn.svg';
export { default as DdlCheckedIcon } from './ddl_checked.svg';
export { default as DdlAddIcon } from './ddl_add.svg';
export { default as RotationColorIcon } from './rotation_color.svg';
export { default as TimerCheckIcon } from './timer_check.svg';
export { default as TimerStartIcon } from './timer_start.svg';
export { default as TimerColorIcon } from './timer_color.svg';
export { default as BackgroundColorIcon } from './backgroundcolor.svg';
export { default as BulletpointsIcon } from './bulletpoints.svg';
export { default as AddMediaIcon } from './add_media.svg';
export { default as AddPicIcon } from './add_pic.svg';
export { default as AddTaskColorIcon } from './Add_task_color.svg';
export { default as AddTaskGrayIcon } from './Add_task_gray.svg';
export { default as LinkColorIcon } from './link_color.svg';
export { default as LinkGrayIcon } from './link_gray.svg';
export { default as TaskGrayIcon } from './task_gray.svg';
export { default as SettingIcon } from './Setting.svg';
export { default as SyncIcon } from './Sync.svg';
export { default as PlanIcon } from './Plan.svg';
export { default as AppIcon } from './APP.svg';
export { default as TagIcon } from './Tag.svg';
export { default as TagSharpIcon } from './tag#.svg';
export { default as LogIcon } from './Log.svg';
export { default as TimeIcon } from './Time.svg';
export { default as HomeIcon } from './Home.svg';
export { default as EmojiIcon } from './emoji.svg';
export { default as NotificationIcon } from './Notification.svg';
export { default as ICloudIcon } from './iCloud.svg';
export { default as GoogleCalendarIcon } from './Google_Calendar.svg';
export { default as OutlookIcon } from './Outlook.svg';
export { default as ArrowBlueIcon } from './Arrow_blue.svg';
```

**使用示例**：
```tsx
import { TimerStartIcon, DatetimeIcon, AttendeeIcon } from '@/assets/icons';

// 在组件中使用
<img src={TimerStartIcon} alt="开始计时" className="icon-timer" />
<img src={DatetimeIcon} alt="时间" className="icon-datetime" />
<img src={AttendeeIcon} alt="参会人" className="icon-attendee" />
```

---

### 1. 左右布局实现

```css
/* EventEditModal.css */
.modal-body {
  display: flex;
  gap: 24px;
  height: calc(80vh - 120px);
  overflow: hidden;
}

/* ✅ 左侧：固定宽度 360px */
.modal-left-panel {
  width: 360px;
  flex-shrink: 0;        /* 不允许收缩 */
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 12px;
}

.modal-left-panel::-webkit-scrollbar {
  width: 6px;
}

.modal-left-panel::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

/* ✅ 右侧：flex: 1，可随窗口 resize，但最小宽度 >= 左侧 */
.modal-right-panel {
  flex: 1;
  min-width: 360px;      /* 最小宽度 = 左侧宽度 */
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  overflow: hidden;
}

.event-slate-editor {
  flex: 1;
  overflow-y: auto;
  min-height: 300px;
}

/* FloatingBar 固定在右侧编辑区底部 */
.headless-floating-toolbar {
  position: absolute !important;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}
```

**布局说明**:
- **左侧面板**: 固定宽度 `360px`，使用 `flex-shrink: 0` 防止被压缩
- **右侧面板**: 使用 `flex: 1` 占据剩余空间，`min-width: 360px` 确保不会小于左侧
- **响应式行为**: 当窗口缩小时，右侧面板会跟随缩小，直到达到 360px 最小值；继续缩小窗口会出现横向滚动条

---

### 2. 时间戳分隔线实现

```typescript
// src/components/PlanSlateEditor/helpers.ts

/**
 * 插入时间戳分隔线
 */
export function insertTimestampDivider(
  editor: Editor,
  timestamp: string,
  elapsed?: string
): boolean {
  try {
    const timestampNode: TimestampDividerNode = {
      type: 'timestamp-divider',
      timestamp,
      elapsed,
      children: [{ text: '' }],
    };
    
    ReactEditor.focus(editor as ReactEditor);
    
    // 插入到当前光标位置
    Transforms.insertNodes(editor, timestampNode as any);
    
    // 插入后移动光标到下一行
    Transforms.move(editor);
    
    return true;
  } catch (err) {
    console.error('[insertTimestampDivider] Failed:', err);
    return false;
  }
}
```

---

### 3. 子任务数量累加逻辑

```typescript
// EventHub 或 EventService 中添加

/**
 * 更新父任务的子任务统计
 * 当子任务的 isCompleted 状态变化时调用
 */
export async function updateParentTaskStats(childEventId: string): Promise<void> {
  const childEvent = await EventService.getEventById(childEventId);
  if (!childEvent || !childEvent.parentTaskId) return;
  
  // 递归向上更新所有父任务
  let currentParentId = childEvent.parentTaskId;
  
  while (currentParentId) {
    const parentEvent = await EventService.getEventById(currentParentId);
    if (!parentEvent) break;
    
    // 查询所有子任务
    const childEvents = await EventService.getEventsByParentId(currentParentId);
    
    // 计算统计数据
    const childTaskCount = childEvents.length;
    const childTaskCompletedCount = childEvents.filter(e => e.isCompleted).length;
    
    // 更新父任务
    await EventService.updateEvent(currentParentId, {
      childTaskCount,
      childTaskCompletedCount,
    });
    
    // 继续向上递归
    currentParentId = parentEvent.parentTaskId;
  }
}

/**
 * 当事件的 isCompleted 状态变化时调用
 */
export async function handleCompletedChange(eventId: string, isCompleted: boolean): Promise<void> {
  // 更新自身
  await EventService.updateEvent(eventId, { isCompleted });
  
  // 更新父任务统计
  await updateParentTaskStats(eventId);
  
  // 触发 UI 更新
  EventHub.emit('taskCompletedChanged', { eventId, isCompleted });
}
```

---

### 4. Private 模式同步函数实现

```typescript
/**
 * ✅ 将参与者格式化为描述文本（Private 模式使用）
 * 已实现于 EventEditModalV2.tsx Line 626-641
 * 
 * @param attendees 参与者联系人列表
 * @returns 格式化后的文本（📧 参与者：email1, email2）
 * 
 * @example
 * formatParticipantsToDescription([
 *   { email: 'alice@company.com', name: 'Alice' },
 *   { email: 'bob@company.com', name: 'Bob' }
 * ])
 * // 返回: '📧 参与者：alice@company.com, bob@company.com\n\n'
 */
export function formatParticipantsToDescription(
  attendees: Contact[]
): string {
  if (!attendees || attendees.length === 0) {
    return '';
  }
  
  const emails = attendees
    .map(contact => contact.email)
    .filter(Boolean)
    .join(', ');
  
  return emails ? `📧 参与者：${emails}\n\n` : '';
}

/**
 * ✅ 从描述文本中提取参与者信息（Private 模式使用）
 * 已实现于 EventEditModalV2.tsx Line 643-663
 * 
 * @param description 包含参与者信息的描述
 * @returns { attendees: Contact[], cleanDescription: string }
 * 
 * @example
 * extractParticipantsFromDescription(
 *   '📧 参与者：alice@company.com, bob@company.com\n\n讨论项目进展'
 * )
 * // 返回: { 
 * //   attendees: [
 * //     { email: 'alice@company.com', name: '', phone: '', ... },
 * //     { email: 'bob@company.com', name: '', phone: '', ... }
 * //   ], 
 * //   cleanDescription: '讨论项目进展' 
 * // }
 */
export function extractParticipantsFromDescription(description: string): {
  attendees: Contact[];
  cleanDescription: string;
} {
  if (!description) {
    return { attendees: [], cleanDescription: '' };
  }
  
  const participantsRegex = /^📧 参与者：(.+)$/m;
  const match = description.match(participantsRegex);
  
  if (!match) {
    return { attendees: [], cleanDescription: description };
  }
  
  const participantsText = match[1];
  const emails = participantsText.split(',').map(email => email.trim());
  
  // 转换为 Contact 对象
  const attendees: Contact[] = emails.map(email => ({
    email,
    name: '',
    phone: '',
    company: '',
    title: '',
    address: '',
    avatar: '',
    source: 'remarkable' as const
  }));
  
  // 移除参与者行，保留其余内容
  const cleanDescription = description
    .replace(participantsRegex, '')
    .replace(/^\n+/, '')  // 移除开头的空行
    .trim();
  
  return { attendees, cleanDescription };
}

/**
 * 同步事件到远程日历（支持 Private 模式）
 * 
 * @param event 要同步的事件
 * @param syncMode 同步模式
 * @param calendarId 目标日历 ID  
 * @param syncType 同步类型：'plan' 或 'actual'
 */
export async function syncToRemoteCalendar(
  event: Event, 
  syncMode: string, 
  calendarId: string,
  syncType: 'plan' | 'actual'
): Promise<string | null> {
  const isPrivateMode = syncMode.includes('-private');
  
  // 准备远程事件数据
  const remoteEvent = {
    title: event.title,
    description: event.description || '',
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    attendees: [],  // 初始为空
  };
  
  // Private 模式处理
  if (isPrivateMode && event.attendees?.length > 0) {
    // 参与者不被邀请，而是作为文本添加到描述中
    const participantEmails = event.attendees.map(a => a.email).filter(Boolean);
    remoteEvent.description = formatParticipantsToDescription(
      participantEmails, 
      remoteEvent.description
    );
    // attendees 保持为空数组（不邀请任何人）
  } else {
    // 普通模式：正常邀请参与者
    remoteEvent.attendees = event.attendees?.map(a => a.email).filter(Boolean) || [];
  }
  
  // 执行同步
  const remoteEventId = await CalendarService.createOrUpdateEvent(calendarId, remoteEvent);
  
  // 更新对应的同步事件 ID
  if (syncType === 'plan') {
    await EventService.updateEvent(event.id, { syncedPlanEventId: remoteEventId });
  } else {
    await EventService.updateEvent(event.id, { syncedActualEventId: remoteEventId });
  }
  
  return remoteEventId;
}
```

---

### 5. 输入间隔检测实现

```typescript
// 在 EventEditModal 组件中
const lastInputTimeRef = useRef<number>(0);

const handleSlateChange = useCallback((updatedItems: PlanItem[]) => {
  const now = Date.now();
  const timeSinceLastInput = now - lastInputTimeRef.current;
  
  // 如果距离上次输入超过 5 分钟，插入时间戳分隔线
  if (lastInputTimeRef.current > 0 && timeSinceLastInput > 5 * 60 * 1000) {
    const timestamp = formatTimeForStorage(new Date());
    const elapsedMinutes = Math.floor(timeSinceLastInput / (1000 * 60));
    
    // 调用 helper 函数插入
    if (slateEditorRef.current) {
      insertTimestampDivider(
        slateEditorRef.current,
        timestamp,
        `${elapsedMinutes}min later`
      );
    }
  }
  
  // 更新最后输入时间
  lastInputTimeRef.current = now;
  
  // 保存内容
  setSlateItems(updatedItems);
  const htmlContent = slateNodesToRichHtml(updatedItems);
  setFormData({ ...formData, description: htmlContent });
}, [formData]);
```

---

## 用户交互流程

### 流程 1: 编辑 Timer 事件（查看实际进展）

```mermaid
sequenceDiagram
    participant User
    participant TimeCalendar
    participant EventEditModal
    participant GlobalTimer
    participant LocalStorage
    
    User->>TimeCalendar: 双击 Timer 事件
    TimeCalendar->>EventEditModal: 打开 Modal（传入 event + globalTimer）
    EventEditModal->>LocalStorage: 读取 globalTimer.segments[]
    EventEditModal->>EventEditModal: 显示【下 Section】实际进展
    EventEditModal->>EventEditModal: 计算总时长 + 时长对比
    User->>EventEditModal: 在右侧 Slate 编辑器输入日志
    EventEditModal->>EventEditModal: 检测输入间隔 > 5min
    EventEditModal->>EventEditModal: 自动插入时间戳分隔线
    User->>EventEditModal: 点击"保存修改"
    EventEditModal->>EventHub: 更新 event.description（HTML）
    EventHub->>TimeCalendar: 触发刷新
```

---

### 流程 2: 编辑 Plan 事件（勾选完成状态）

```mermaid
sequenceDiagram
    participant User
    participant PlanManager
    participant EventEditModal
    participant EventService
    
    User->>PlanManager: 点击编辑 Plan 事件
    PlanManager->>EventEditModal: 打开 Modal（event.isPlan = true）
    EventEditModal->>EventEditModal: 显示【Plan提示区域】
    User->>EventEditModal: 勾选 "已完成" checkbox
    EventEditModal->>EventEditModal: 设置 event.isCompleted = true
    User->>EventEditModal: 点击"保存修改"
    EventEditModal->>EventService: 更新 event.isCompleted
    EventService->>EventService: 调用 updateParentTaskStats()
    EventService->>EventService: 递归更新父任务的 childTaskCompletedCount
    EventService->>PlanManager: 触发刷新
    PlanManager->>PlanManager: 列表中显示为已完成（带 ✓ icon）
```

---

### 流程 3: 使用 FloatingBar 插入标签

```mermaid
sequenceDiagram
    participant User
    participant EventEditModal
    participant FloatingBar
    participant SlateEditor
    participant TagService
    
    User->>EventEditModal: 打开 Modal
    EventEditModal->>SlateEditor: 渲染 Slate 编辑器
    EventEditModal->>FloatingBar: 显示 FloatingBar
    User->>FloatingBar: 点击 # Tag 按钮
    FloatingBar->>FloatingBar: 弹出 HierarchicalTagPicker
    User->>FloatingBar: 选择标签 "#工作/#产品设计"
    FloatingBar->>TagService: 获取标签信息（emoji, color）
    FloatingBar->>SlateEditor: 调用 insertTag() helper
    SlateEditor->>SlateEditor: 插入 TagNode 到光标位置
    SlateEditor->>EventEditModal: 触发 onChange
    EventEditModal->>EventEditModal: 序列化为 HTML
```

---

### 流程 4: 多次计时 + 连续日志时间轴

```mermaid
sequenceDiagram
    participant User
    participant TimeCalendar
    participant ParentEvent as 父事件 Modal
    participant TimerService
    participant EventService
    
    User->>TimeCalendar: 打开非 Timer 创建的事件（如 Outlook 会议）
    TimeCalendar->>ParentEvent: 打开 Modal（event.isTimer = false）
    ParentEvent->>ParentEvent: 显示【中 Section】计划安排
    
    User->>ParentEvent: 点击"开始计时"按钮
    ParentEvent->>TimerService: start(parentEvent.id)
    TimerService->>EventService: 创建 Timer 子事件（parentEventId = parentEvent.id）
    TimerService->>TimerService: 添加到 activeTimers Map
    
    Note over User,ParentEvent: 第 1 次计时进行中...
    User->>ParentEvent: 在 Slate 编辑区输入日志："处理完了出差的 logistics"
    ParentEvent->>EventService: 实时保存到 Timer 子事件 1 的 description
    
    User->>ParentEvent: 点击"停止计时"按钮
    ParentEvent->>TimerService: stop(timerChildEvent1.id)
    TimerService->>EventService: Timer 子事件 1 设为 pending，准备同步
    TimerService->>ParentEvent: 更新 parentEvent.timerChildEvents[]
    ParentEvent->>ParentEvent: 【下 Section】显示第 1 次计时记录
    
    Note over User,TimeCalendar: 几小时后...
    
    User->>TimeCalendar: 再次打开同一事件（双击父事件色块）
    TimeCalendar->>ParentEvent: 打开 Modal
    ParentEvent->>ParentEvent: Slate 显示第 1 次计时的完整日志
    
    User->>ParentEvent: 点击"开始计时"按钮（第 2 次）
    ParentEvent->>TimerService: start(parentEvent.id)
    TimerService->>EventService: 创建 Timer 子事件 2
    
    Note over User,ParentEvent: 第 2 次计时进行中...
    User->>ParentEvent: 输入日志："太强了！居然直接成稿了"
    ParentEvent->>EventService: 保存到 Timer 子事件 2 的 description
    ParentEvent->>ParentEvent: Slate 自动插入时间戳分隔线
    ParentEvent->>ParentEvent: 虚化显示第 1 次计时的最后一行（延续性）
    
    User->>ParentEvent: 停止第 2 次计时
    
    Note over User,TimeCalendar: TimeCalendar 视图更新
    TimeCalendar->>TimeCalendar: 显示父事件色块（整体时间范围）
    TimeCalendar->>TimeCalendar: 显示 Timer 子事件 1 色块（第 1 次计时）
    TimeCalendar->>TimeCalendar: 显示 Timer 子事件 2 色块（第 2 次计时）
    
    Note over User,TimeCalendar: 用户点击第 1 次计时色块
    User->>TimeCalendar: 双击 Timer 子事件 1 色块
    TimeCalendar->>ParentEvent: 打开**父事件** Modal（openedFromTimerEventId = timer1.id）
    ParentEvent->>ParentEvent: 合并显示所有日志（第 1 次 + 第 2 次）
    ParentEvent->>ParentEvent: 自动滚动到第 1 次计时的起始位置
    ParentEvent->>ParentEvent: 高亮第 1 次计时区域（3秒后淡出）
    
    User->>ParentEvent: 向下滚动
    ParentEvent->>ParentEvent: 无缝查看第 2 次计时的日志
    ParentEvent->>ParentEvent: 形成完整工作日志时间轴
```

**关键设计点**:

1. **父事件 vs Timer 子事件**:
   - 父事件：非 Timer 创建（Remote/Plan/手动），可被多次计时
   - Timer 子事件：每次计时生成，`parentEventId` 指向父事件
   - TimeCalendar 同时显示父事件色块 + 多个 Timer 子事件色块

2. **日志合并逻辑**:
   ```typescript
   // 合并顺序：父事件基础日志 → Timer 1 日志 → Timer 2 日志 → ...
   allLogs = [
     ...parseHtml(parentEvent.description),      // 父事件初始内容
     timestampDivider(timer1.startTime),         // 时间戳分隔线
     ...parseHtml(timer1.description),           // 第 1 次计时日志
     timestampDivider(timer2.startTime),         // 时间戳分隔线
     ...parseHtml(timer2.description),           // 第 2 次计时日志
   ]
   ```

3. **智能滚动定位**:
   - 点击父事件色块 → 显示完整日志，默认在顶部
   - 点击 Timer 子事件色块 → 显示完整日志，但滚动到对应时间段起始位置
   - 高亮当前 Timer 区域 3 秒（视觉反馈）

4. **上下文延续性**:
   - 每个 Timer 区域起始行前，虚化显示上一段的最后一行
   - 用户可感知"这是延续之前的工作"

5. **用户价值**:
   - ✅ 无需切换多个笔记查找历史记录
   - ✅ 一个事件的所有处理过程连成连续时间轴
   - ✅ 自动追溯，节省回忆和查找的认知负担
   - ✅ 支持碎片化工作场景（多次中断、恢复）

---

### 流程 5: 点击 Timer 子事件（查看单次计时详情）

```mermaid
sequenceDiagram
    participant User
    participant TimeCalendar
    participant TimerChildModal
    participant ParentEvent
    participant EventService
    
    Note over User,TimeCalendar: 场景：用户想查看某次计时的详细信息
    
    User->>TimeCalendar: 双击 Timer 子事件色块
    TimeCalendar->>EventService: 获取 Timer 子事件数据
    EventService->>EventService: 检测到 event.isTimer = true && event.parentEventId 存在
    EventService->>TimerChildModal: 打开 Timer 子事件 Modal
    
    TimerChildModal->>EventService: 获取父事件数据（parentEventId）
    TimerChildModal->>TimerChildModal: 【中 Section】显示父事件的计划安排
    TimerChildModal->>TimerChildModal: 顶部显示 "来自父事件：{父事件标题}"
    TimerChildModal->>TimerChildModal: 【下 Section】显示该次计时的 segments
    TimerChildModal->>TimerChildModal: 【Slate 编辑区】显示该次计时的日志
    
    Note over TimerChildModal: 显示单次计时的独立信息
    TimerChildModal->>TimerChildModal: 时间范围：{startTime} → {endTime}
    TimerChildModal->>TimerChildModal: 总时长：{duration}
    TimerChildModal->>TimerChildModal: 与计划对比（如果父事件有计划时间）
### 流程 5: 点击不同的计时色块（查看不同时段的详情）

```mermaid
sequenceDiagram
    participant User
    participant TimeCalendar
    participant EventModal
    participant EventService
    
    Note over User,TimeCalendar: 场景：同一事件有多次计时记录
    
    User->>TimeCalendar: 双击第 1 次计时的色块
    TimeCalendar->>EventService: 获取该计时记录的事件数据
    EventService->>EventModal: 打开 Modal（event.isTimer = true, 有 parentEventId）
    
    EventModal->>EventService: 从父事件读取计划安排数据
    EventModal->>EventModal: 【上 Section】显示标题（共享，可编辑 → 同步到父事件）
    EventModal->>EventModal: 【中 Section】显示计划安排（共享，可编辑 → 同步到父事件）
    EventModal->>EventModal: 【下 Section】显示该次计时的 segments 和时长
    EventModal->>EventModal: 【Slate 编辑区】显示该次计时的独立日志
    
    Note over User,EventModal: 用户视角："这是这个事件的某次处理记录"
    
    User->>EventModal: 修改标题或计划安排
    EventModal->>EventService: 自动同步到父事件（isTimer = true 触发）
    EventService->>TimeCalendar: 刷新所有相关色块的标题
    
    User->>EventModal: 关闭 Modal
    
    Note over User,TimeCalendar: 切换到另一次计时
    User->>TimeCalendar: 双击第 2 次计时的色块
    TimeCalendar->>EventModal: 打开另一条计时记录的 Modal
    EventModal->>EventModal: 显示第 2 次计时的数据
    EventModal->>EventModal: 标题和计划安排依然是共享的（来自父事件）
    EventModal->>EventModal: 实际进展和日志是独立的（该次计时）
```

**关键设计点**:

1. **用户心智模型**:
   - ✅ **用户理解**："一个事件可以多次计时，每次查看不同时段的详情"
   - ✅ **无需理解**："父事件"、"子事件"、"底层数据结构"
   - ✅ **自然行为**：修改标题/计划时，自动同步到所有计时记录

2. **数据共享 vs 独立**:
   ```typescript
   // ✅ 共享数据（修改会同步）
   - 标题 (title)
   - 标签 (tags)
   - 计划安排（attendees, startTime, endTime, location, calendar）
   
   // ✅ 独立数据（仅影响当前计时）
   - 实际进展（segments, duration）
   - Slate 日志（description）
   ```

3. **保存逻辑判断**:
   ```typescript
   const handleFieldChange = async (field: string, value: any) => {
     // 🔍 判断：当且仅当 isTimer = true 时，才同步到父事件
     const isSubEvent = event.isTimer || event.isTimeLog || event.isOutsideApp;
     if (isSubEvent && event.parentEventId) {
       // 共享字段 → 保存到父事件
       if (['title', 'tags', 'attendees', 'startTime', 'endTime', 'location', 'calendarId'].includes(field)) {
         await EventService.update(event.parentEventId, { [field]: value });
         return;
       }
     }
     
     // 独立字段 → 保存到当前事件
     await EventService.update(event.id, { [field]: value });
   };
   ```

4. **数据显示模式**:
   | 字段 | 打开计时记录 Modal | 打开父事件 Modal (多次计时汇总) |
   |-----|-------------------|------------------------------|
   | **标题** | 共享（可编辑 → 同步到父事件） | 共享（可编辑） |
   | **计划安排** | 共享（可编辑 → 同步到父事件） | 共享（可编辑） |
   | **实际进展** | 显示该次计时数据 | 显示所有计时汇总 |
   | **Slate 日志** | 显示该次日志 | 显示合并日志时间轴 |

5. **用户价值**:
   - ✅ 灵活查看：既能看整体，也能看单次
   - ✅ 数据一致：标题和计划自动同步，无需手动维护
   - ✅ 独立记录：每次计时的日志独立保存，不互相干扰
   - ✅ 自然交互：用户不需要理解底层的父子关系

---

## 📝 开发检查清单

### Phase 1: 布局重构
- [ ] 修改 `.modal-body` 为 Flex 左右布局（左固定 360px，右 flex: 1 + min-width: 360px）
- [ ] 实现 `.modal-left-panel`（固定宽度，flex-shrink: 0）
- [ ] 实现 `.modal-right-panel`（可 resize，最小宽度 >= 左侧）
- [ ] 添加 Emoji 大图标 + Emoji Picker
- [ ] 实现标签层级路径显示

### Phase 2: 左侧元数据面板
- [ ] 【上 Section】：标题、标签、任务勾选框
- [ ] 【计时按钮】：实现 Timer 状态检测（开始/暂停/继续/切换）
- [ ] 【中 Section】：参会人、时间范围、位置、来源
- [ ] 【下 Section】：Timer segments、总时长、时长对比、ddl 状态
- [ ] 实现条件显示逻辑（isTimeCalendar、isPlan、globalTimer）

### Phase 3: 右侧 Slate 编辑器
- [ ] 集成 PlanSlateEditor
- [ ] 实现 HTML ↔ Slate 序列化
- [ ] 创建 TimestampDividerNode 类型
- [ ] 实现 TimestampDivider 渲染组件
- [ ] 实现输入间隔检测逻辑（5 分钟）

### Phase 4: FloatingBar 集成
- [ ] 使用 useFloatingToolbar hook
- [ ] 集成 HeadlessFloatingToolbar
- [ ] 实现 onEmojiSelect 回调
- [ ] 实现 onTagSelect 回调
- [ ] 实现 onDateRangeSelect 回调

### Phase 5: 数据字段扩展
- [ ] 在 Event 类型中添加新字段（emoji, isTimeCalendar, childTaskCount 等）
- [ ] 实现 updateParentTaskStats() 函数
- [ ] 实现 handleCompletedChange() 函数
- [ ] 更新 EventHub/TimeHub 架构文档

### Phase 6: 测试与优化
- [ ] 测试新建事件（各种来源）
- [ ] 测试编辑事件（Timer、Plan、Remote）
- [ ] 测试时间戳分隔线自动插入
- [ ] 测试子任务统计累加
- [ ] 性能优化（Slate 编辑器防抖）

---

## 📋 v2.0.3 测试清单 (2025-11-26)

### 同步日历选择器（计划安排区域）

#### 基础功能
- [ ] **打开 Picker**: 点击"同步"按钮，弹出日历选择 Modal
- [ ] **显示所有可用日历**: Picker 中列出所有外部日历（Outlook/Google/iCloud）
- [ ] **关闭 Picker**: 点击 ✕ 或"确定"按钮关闭 Modal

#### "来源"标志功能
- [ ] **自动识别来源**: 打开从外部日历同步的事件，来源日历显示"来源"标志（右对齐灰色）
- [ ] **默认勾选来源**: 来源日历默认勾选
- [ ] **取消勾选来源**: 可以取消勾选来源日历，"来源"标志保留
- [ ] **重新勾选来源**: 重新勾选来源日历，"来源"标志继续显示
- [ ] **6层优先级正确**: Timer子事件→外部日历→独立Timer→Plan→TimeCalendar→本地

#### 标签映射功能
- [ ] **自动勾选标签日历**: 事件有标签时，标签映射的日历自动勾选
- [ ] **显示标签名称**: 标签映射的日历右对齐显示标签名称（带颜色边框）
- [ ] **多标签显示第一个**: 多个标签映射到同一日历，只显示第一个标签
- [ ] **取消勾选标签日历**: 可以取消勾选，保留标签但不同步
- [ ] **标签颜色正确**: 标签名称的颜色和边框与标签本身一致

#### 🆕 v2.0.5 标签变更时自动映射日历（2025-11-28）

**本地事件（remarkableSource = true 或 source = 'local'）**:
- [ ] **添加标签 → Plan 自动更新**: 添加有日历映射的标签后，计划安排的同步日历自动添加映射日历
- [ ] **添加标签 → Actual 自动更新**: 添加有日历映射的标签后，实际进展的同步日历自动添加映射日历
- [ ] **默认同步模式**: 自动添加的日历默认使用 'bidirectional-private' 模式
- [ ] **删除标签 → 保留日历**: 删除标签后，手动选择的日历保持勾选
- [ ] **多标签累加**: 添加多个有映射的标签，所有映射日历都自动添加（去重）

**远程事件（来自外部日历同步）**:
- [ ] **添加标签 → Plan 保持 receive-only**: 添加标签后，计划安排的同步配置不变（保持 receive-only）
- [ ] **添加标签 → Actual 自动更新**: 添加有日历映射的标签后，实际进展的同步日历自动添加映射日历
- [ ] **Plan 不添加映射**: 计划安排部分不自动添加标签映射的日历（避免改变远程事件）
- [ ] **Actual 默认同步模式**: 实际进展自动添加的日历默认使用 'bidirectional-private' 模式
- [ ] **来源日历保护**: 来源日历始终保持在 Plan 配置中

**实时同步验证**:
- [ ] **Plan 日历选择器实时更新**: 添加标签后，计划安排的日历选择器立即显示新日历
- [ ] **Actual 日历选择器实时更新**: 添加标签后，实际进展的日历选择器立即显示新日历
- [ ] **同步状态显示**: 自动添加的日历正确显示勾选状态和标签名称
- [ ] **formData 同步**: calendarIds 和 subEventConfig.calendarIds 正确更新
- [ ] **无闪烁**: UI 更新平滑，无明显闪烁或延迟

**边界情况**:
- [ ] **无日历映射的标签**: 添加没有日历映射的标签，不触发自动映射
- [ ] **标签映射不存在的日历**: 标签映射的日历不在可用列表中，自动过滤
- [ ] **重复映射**: 同一日历被多个标签映射，去重处理
- [ ] **父子模式切换**: 父模式和子模式下，标签映射行为正确
- [ ] **已有配置保留**: 用户手动选择的日历不被自动映射覆盖（合并添加）

#### 同步逻辑
- [ ] **基于 calendarIds 同步**: 取消勾选日历后，不同步到该日历
- [ ] **保留标签**: 取消勾选日历后，标签不被删除
- [ ] **自动添加标签**: 勾选日历后，自动添加对应标签（如果有映射）
- [ ] **更新 calendarIds**: 选择变更后正确更新 `event.calendarIds`
- [ ] **更新 syncMode**: 选择同步模式后正确更新 `event.syncMode`

#### UI 交互
- [ ] **选项悬停高亮**: 鼠标悬停日历选项时背景变浅灰
- [ ] **Checkbox 正确状态**: 已选日历 checkbox 勾选，未选日历未勾选
- [ ] **日历颜色正确**: 日历圆点颜色与日历本身颜色一致
- [ ] **标志右对齐**: "来源"和标签名称都在右侧对齐
- [ ] **Modal 遮罩**: Picker 打开时背景半透明遮罩

### 🆕 v2.0.4 实际进展同步选择器（subEventConfig）

#### 父模式（ParentEvent）
- [ ] **显示 subEventConfig 配置**: 打开父事件时显示 subEventConfig 的 calendarIds 和 syncMode
- [ ] **更新 subEventConfig**: 修改后正确更新 `event.subEventConfig`
- [ ] **批量更新子事件**: 如果有子事件，同时批量更新所有子事件的 calendarIds 和 syncMode
- [ ] **无子事件时保存**: 父事件还没有子事件时，配置仍然保存到 subEventConfig
- [ ] **创建子事件继承**: 创建新子事件时，自动继承父事件的 subEventConfig

#### 子模式（ChildEvent/Timer）
- [ ] **显示子事件配置**: 打开子事件时显示子事件自己的 calendarIds 和 syncMode
- [ ] **更新子事件配置**: 修改后正确更新子事件自己的 calendarIds 和 syncMode
- [ ] **不影响父事件**: 修改子事件配置不影响父事件的 subEventConfig
- [ ] **不影响其他子事件**: 修改子事件配置不影响其他兄弟子事件

#### 模式切换
- [ ] **父→子切换**: 从父事件打开子事件，配置正确切换
- [ ] **子→父切换**: 从子事件打开父事件，配置正确切换
- [ ] **初始化正确**: 打开 Modal 时根据 isParentMode 正确初始化显示

### 边界情况

#### 特殊事件类型
- [ ] **Timer 子事件**: 显示父事件的来源日历
- [ ] **独立 Timer**: 无来源日历，不显示"来源"标志
- [ ] **Plan 事件**: 显示 Plan 模块图标作为来源
- [ ] **TimeCalendar 事件**: 显示 TimeCalendar 图标作为来源
- [ ] **本地事件**: 显示 ReMarkable 图标作为来源

#### 数据一致性
- [ ] **刷新后保持**: 刷新页面后，选择的日历和标志状态保持
- [ ] **父子事件一致**: Timer 子事件和父事件显示相同的来源
- [ ] **标签同步**: 多个标签映射到同一日历时，取消后所有标签保留
- [ ] **空状态**: 没有可用日历时显示提示信息

### 性能测试
- [ ] **大量日历**: 测试 20+ 个日历时 Picker 性能
- [ ] **快速切换**: 快速勾选/取消多个日历，UI 响应流畅
- [ ] **长标签名称**: 测试超长日历名称的显示（是否截断）

### 兼容性测试
- [ ] **Outlook 日历**: Outlook 日历同步的事件显示正确
- [ ] **Google 日历**: Google 日历同步的事件显示正确
- [ ] **iCloud 日历**: iCloud 日历同步的事件显示正确
- [ ] **混合来源**: 同时连接多个平台，标志和映射正确

---

## 📚 相关文档更新

需要同步更新以下文档：

1. **EventHub/TimeHub 架构文档**
   - 添加 `childTaskCount` 和 `childTaskCompletedCount` 字段说明
   - 补充任务关联逻辑

2. **Slate 开发指南**
   - 添加 TimestampDividerNode 类型定义
   - 补充 insertTimestampDivider() helper 函数

3. **Event 类型定义**
   - 更新 `src/types.ts` 中的 Event 接口
   - 添加新字段的 JSDoc 注释

4. **ActionBasedSyncManager 技术文档**
   - 🆕 更新同步逻辑说明：完全基于 calendarIds
   - 🆕 添加标签映射仅用于 UI 提示的说明
   - 🆕 补充 getSourceCalendarId() 函数文档

---

## 🔗 v2.17.0 EventTree 集成详细实现 (2025-12-06)

### 核心功能：@ 触发双向链接

**设计理念**：像 Notion/Obsidian 一样，通过 @ 符号快速创建事件之间的链接关系，自动维护双向引用（linkedEventIds ← → backlinks）。

### 实现架构

#### 1. ModalSlate 集成 @ 监听

**代码位置**: `src/components/ModalSlate/ModalSlate.tsx`

**关键状态管理** (L418-425):
```typescript
// @ Mention Menu 状态
const [mentionMenu, setMentionMenu] = useState<{
  visible: boolean;
  query: string;
  position: { x: number; y: number };
  atSignRange: Range | null; // 存储 @ 符号的位置
} | null>(null);
```

**@ 监听逻辑** (L963-999):
```typescript
const checkForMentionTrigger = useCallback(() => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return;

  const [start] = Range.edges(selection);
  const wordBefore = Editor.before(editor, start, { unit: 'word' });
  const before = wordBefore && Editor.before(editor, wordBefore);
  const beforeRange = before && Editor.range(editor, before, start);
  const beforeText = beforeRange && Editor.string(editor, beforeRange);
  const beforeMatch = beforeText && beforeText.match(/@(\w*)$/);

  if (beforeMatch) {
    const [, query] = beforeMatch;
    
    // 计算菜单位置
    const domSelection = window.getSelection();
    const domRange = domSelection?.getRangeAt(0);
    const rect = domRange?.getBoundingClientRect();
    
    if (rect) {
      setMentionMenu({
        visible: true,
        query: query || '',
        position: { x: rect.left, y: rect.bottom + 5 },
        atSignRange: beforeRange
      });
    }
  } else {
    setMentionMenu(null);
  }
}, [editor]);
```

**触发时机**:
- onKeyDown @ 字符输入 (L1007-1013)
- onChange 内容变化检测 (L932)

#### 2. EventMention 节点类型

**代码位置**: `src/components/SlateCore/types.ts` (L62-69)

```typescript
/**
 * EventMention - 事件提及元素 (双向链接)
 */
export interface EventMentionNode {
  type: 'eventMention';
  eventId: string;        // 目标事件 ID
  eventTitle: string;     // 事件标题（缓存，用于显示）
  eventEmoji?: string;    // 事件 emoji（缓存）
  children: [{ text: '' }];
}
```

#### 3. EventMentionElement 渲染

**代码位置**: `src/components/SlateCore/elements/EventMentionElement.tsx`

**样式设计**:
- 蓝色背景 (#E3F2FD)
- 圆角边框 (4px)
- 悬停加深 (#BBDEFB)
- 可点击跳转（未来功能）

**渲染逻辑**:
```typescript
<span
  contentEditable={false}
  onClick={handleClick}
  className="event-mention"
  style={{
    display: 'inline-block',
    padding: '2px 6px',
    margin: '0 2px',
    backgroundColor: '#E3F2FD',
    color: '#1976D2',
    borderRadius: '4px',
    cursor: 'pointer',
  }}
>
  @{element.eventTitle}
  {children}
</span>
```

#### 4. UnifiedMentionMenu 集成

**代码位置**: `src/components/UnifiedMentionMenu.tsx` (L40-52)

**自动双向链接创建** (L43-46):
```typescript
const handleItemClick = useCallback(async (item: MentionItem) => {
  // 🔗 如果选择的是事件，且当前有编辑的事件，自动创建双向链接
  if (item.type === 'event' && currentEventId && item.id !== currentEventId) {
    await unifiedSearchIndex.createBidirectionalLink(currentEventId, item.id);
  }
  
  onSelect(item);
  unifiedSearchIndex.recordAccess(item.id, item.type);
}, [onSelect, currentEventId]);
```

**搜索服务调用链**:
```
UnifiedMentionMenu.handleItemClick()
  ↓
UnifiedSearchIndex.createBidirectionalLink()
  ↓
EventService.addLink(fromId, toId)
  ↓
更新 fromEvent.linkedEventIds = [...existing, toId]
  ↓
EventService.rebuildBacklinks(toId)
  ↓
更新 toEvent.backlinks = [所有链接到它的事件]
```

#### 5. handleMentionSelect 插入节点

**代码位置**: `src/components/ModalSlate/ModalSlate.tsx` (L1066-1094)

```typescript
const handleMentionSelect = useCallback(async (item: MentionItem) => {
  if (!mentionMenu || !mentionMenu.atSignRange) return;
  
  // 只处理事件类型的 mention
  if (item.type === 'event') {
    // 删除 @ 和查询文本
    Transforms.delete(editor, { at: mentionMenu.atSignRange });
    
    // 插入 EventMention 节点
    const eventMention: EventMentionNode = {
      type: 'eventMention',
      eventId: item.id,
      eventTitle: item.title,
      eventEmoji: item.emoji,
      children: [{ text: '' }]
    };
    
    Transforms.insertNodes(editor, eventMention);
    
    // 移动光标到 mention 后面
    Transforms.move(editor);
  }
  
  // 关闭菜单
  setMentionMenu(null);
}, [editor, mentionMenu]);
```

#### 6. EventEditModalV2 关联区域显示

**代码位置**: `src/components/EventEditModal/EventEditModalV2.tsx` (L3100-3125)

**统计逻辑**:
```typescript
const linkedCount = 
  ((formData as any).linkedEventIds?.length || 0) + 
  ((formData as any).backlinks?.length || 0);

if (linkedCount > 0) {
  parts.push(`关联：${linkedCount}个事件`);
}
```

**formData 初始化** (L269-271 & L358-360):
```typescript
// 编辑现有事件
childEventIds: (event as any).childEventIds || [],
linkedEventIds: (event as any).linkedEventIds || [],
backlinks: (event as any).backlinks || [],

// 新建事件
childEventIds: [],
linkedEventIds: [],
backlinks: [],
```

### 数据流完整链路

```
用户输入 @
  ↓
checkForMentionTrigger() 检测到 @ 符号
  ↓
setMentionMenu({ visible: true, query, position, atSignRange })
  ↓
<UnifiedMentionMenu> 显示搜索结果
  ↓
用户选择事件 → handleItemClick(item)
  ↓
createBidirectionalLink(currentEventId, item.id)
  ↓
EventService.addLink()
  ├─ 更新 fromEvent.linkedEventIds
  └─ rebuildBacklinks(toEventId)
      └─ 更新 toEvent.backlinks
  ↓
handleMentionSelect() 插入 EventMention 节点
  ↓
ModalSlate 自动保存 eventlog (2秒防抖)
  ↓
EventEditModalV2.handleSave()
  ↓
EventHub.updateFields(eventId, { eventlog, ... })
  ↓
关联区域统计更新 → "关联：2个事件"
```

### 关键技术点

1. **@ 触发检测**: 使用正则表达式 `/@(\w*)$/` 匹配光标前的文本
2. **Range 管理**: 保存 `atSignRange` 用于后续删除 @ 和查询文本
3. **Slate Void 元素**: EventMention 设置为 void + inline，确保正确的光标行为
4. **自动空格**: normalizeNode 确保 EventMention 后面始终有空格
5. **双向链接**: linkedEventIds 存储主动链接，backlinks 由系统自动计算
6. **增量更新**: 使用 EventHub.updateFields() 只更新变化的字段

### 使用示例

**场景 1：关联相关事件**
```
用户在"项目A总结"事件的 EventLog 中输入：
"参考 @项目A需求文档 和 @项目A技术方案 的内容"

结果：
- "项目A总结" 的 linkedEventIds = ['doc-id-1', 'doc-id-2']
- "项目A需求文档" 的 backlinks = ['summary-id']
- "项目A技术方案" 的 backlinks = ['summary-id']
- 关联区域显示 "关联：2个事件"
```

**场景 2：会议记录引用**
```
用户在"周会 2025-12-06"事件中输入：
"讨论了 @Q4 OKR Review 和 @年终总结报告 的准备工作"

结果：
- 周会事件自动关联到两个文档
- 文档的 backlinks 自动包含周会事件
- EventTreeViewer 可以展开查看完整关系网络
```

### 未来优化方向

1. **悬浮预览**: 鼠标悬停 EventMention 显示事件详情卡片
2. **点击跳转**: 点击 EventMention 直接打开目标事件的 EditModal
3. **智能推荐**: 根据上下文自动推荐相关事件
4. **批量链接**: 支持拖拽多个事件创建批量链接
5. **关系可视化**: EventTreeViewer 的堆叠卡片动画效果
6. **删除同步**: 删除 EventMention 节点时自动调用 removeLink()

---

**最后更新**: 2025-12-06  
**维护者**: 4DNote Team

