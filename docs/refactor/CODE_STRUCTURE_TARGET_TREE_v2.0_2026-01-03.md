# 4DNote 目标目录树 v2.0（完整架构重组方案）

**日期**：2026-01-03  
**状态**：🟢 已落地（持续维护）  
**基于**：App Architecture PRD + README + 现有代码扫描  
**目的**：基于应用实际功能和架构，制定清晰的目录结构重组方案

---

## 📊 应用架构概述

**4DNote** 是一个**四维时间管理系统**，整合了计划、执行、日志和计时器四个维度：

| 维度 | 功能模块 | 核心组件 | 页面路径 |
|------|----------|---------|----------|
| **Plan** | 计划管理 | PlanManager, PlanSlate | `/plan` |
| **Actual** | 执行追踪 | TimeCalendar | `/calendar` |
| **TimeLog** | 时间日志 | TimeLogPage | `/timelog` |
| **Timer** | 计时器 | TimerCard | 嵌入式 Widget |

**技术栈核心**：
- **Slate.js** 富文本编辑器：3 个专用编辑器 + 1 个共享核心层
- **存储架构**：IndexedDB（主） + SQLite（扩展） + LocalStorage（缓存）
- **状态管理**：EventHub/TimeHub 订阅模式 + Zustand stores
- **同步机制**：ActionBasedSyncManager + Microsoft Outlook 集成

---

## 🎯 目录结构设计原则

1. **按功能模块组织** (`features/`)：每个产品功能一个独立目录
2. **页面入口分离** (`pages/`)：薄编排层，只负责路由和组合
3. **服务层集中** (`services/`)：EventService 为中枢，按职责分包
4. **组件可复用** (`components/`)：跨模块通用 UI，不承载业务逻辑
5. **工具纯函数** (`utils/`)：无副作用，可被任意层安全调用
6. **导入路径明确且可重构**：所有导入必须使用 TypeScript Path Alias（`@frontend/*`, `@backend/*`, `@shared/*`），禁止任何 shim/兼容层

### TypeScript Path Alias（强制）

目标：
- IDE 可稳定跳转到定义（Go to Definition）
- 重构/移动文件时导入可自动更新（减少手动改路径）
- 编译错误尽量等价于运行时错误（提前暴露模块边界问题）

约定：
- `@frontend/*`：UI 与产品层（`src/pages`, `src/features`, `src/components`, `src/hooks`, `src/styles`, `src/assets` 等）
- `@backend/*`：领域/数据服务层（`src/services/*`）
- `@shared/*`：跨前后端共用的“纯模块”（建议目标位置：`src/shared/*`，包含 utils/constants/types/contracts 等）

禁止：
- 任何形式的 shim 或兼容层（例如旧路径 re-export、CSS @import 转发等）
- `shim.d.ts` 与任何通配符模块声明（例如 `declare module '*/something'`）
- 模糊的全局模块声明（例如 `declare module 'utils'`）

### 补充约定（建议）

1. **services 子目录命名统一（避免 Windows 大小写坑）**：
  - `services/` 下所有子目录一律使用小写 camel（例如 `eventTree/`, `eventlogProcessing/`, `sync/`, `storage/`）。
  - 严禁出现仅大小写不同的路径（例如 `EventTree` vs `eventTree`），否则在不同系统上会导致 TypeScript “only in casing” 问题。

2. **services 子包提供稳定入口**：
  - 每个 services 子目录（例如 `services/eventTree/`, `services/eventlogProcessing/`）建议提供 `index.ts` 作为唯一公共导出点。
  - 外部调用尽量只 import `services/<pkg>` 的导出，避免直接依赖内部文件路径，便于后续重排文件不引发 import churn。

3. **eventlogProcessing 定位为“纯转换管线”**：
  - 内容以“无状态转换/清洗/解析”为主（HTML 清洗 → 解析 → Slate JSON → 压缩/归一化）。
  - 尽量不直接依赖 UI、store；避免在此层做网络/存储 IO。
  - EventService 负责编排调用、落库与广播（EventHub/TimeHub）。

4. **按“来源语义”分组（可选）**：
  - 带强 Outlook 语义的步骤建议归类到 `eventlogProcessing/outlook/*`。
  - 通用 HTML/Slate 转换步骤建议归类到 `eventlogProcessing/html/*` 或 `eventlogProcessing/slate/*`。
  - 目标是让未来接入新来源（例如 Gmail/其他）时不互相挤压。

5. **pages 持续保持“薄编排”**：
  - `pages/` 只做路由/窗口壳/组合与依赖注入；实现细节下沉到 `features/*/pages` 或 `features/*/components`。
  - 对于超大页面文件（例如 `LogTab.tsx`），重构目标是：页面入口保留壳，业务按 `sections/` 等子模块拆分。

---

## 📁 目标目录树（完整版）

```text
src/
  App.tsx                                # 根组件（路由 + 服务初始化 + 全局事件协调）
  index.tsx                              # 应用入口

  ┌─────────────────────────────────────────────────────────────
  │ pages/ - 页面入口（薄编排：路由/窗口/Tab）
  └─────────────────────────────────────────────────────────────
  pages/
    Home/
      index.tsx                          # 首页（统计面板 + 快速访问）
    
    Plan/
      index.tsx                          # Plan 页面入口
    
    Calendar/
      index.tsx                          # Calendar 主页入口
      WidgetWindow.tsx                   # Desktop Widget 窗口（原 DesktopCalendarWidget.tsx；已删除旧路径 shim）
      WidgetSettings.tsx                 # Widget 设置页
    
    TimeLog/
      index.tsx                          # TimeLog 页面入口
    
    Event/
      DetailTab.tsx                      # 事件详情页（原 LogTab.tsx，4181 行大文件；已删除旧路径 shim）
      EditorWindow.tsx                   # 独立编辑器窗口（Electron 多窗口）
    
    Tag/
      index.tsx                          # 标签管理页
    
    Settings/
      index.tsx                          # 设置页

  ┌─────────────────────────────────────────────────────────────
  │ features/ - 功能模块包（业务逻辑 + 领域组件）
  └─────────────────────────────────────────────────────────────
  features/
    Plan/                                # ✅ 已部分迁移
      components/
        PlanManager.tsx                  # ✅ 已迁移 (d0989ec)
        PlanSlate/                       # Plan 专用 Slate 编辑器
          PlanSlate.tsx
          operations/
          plugins/
      helpers/                           # ✅ 已迁移 (89bf1cf)
        planManagerFilters.ts
        planManagerHelpers.ts
      hooks/
        usePlanSnapshot.ts
        usePlanTree.ts
      styles/
        PlanManager.css
        PlanSlate.css
      index.ts                           # 导出公共 API

    Calendar/                            # ✅ 已存在
      TimeCalendar.tsx                   # 日历主组件
      components/
        CalendarSync.tsx
        CalendarToolbar.tsx
        MonthView.tsx
        WeekView.tsx
        DayView.tsx
      hooks/
        useCalendarEvents.ts
        useCalendarView.ts
      styles/
        TimeCalendar.css
        DesktopCalendarWidget.css
      index.ts

    TimeLog/                             # ✅ 已迁移 (8d13a61)
      pages/
        TimeLogPage.tsx                  # 主页面实现
        TimeLogPage_new.tsx
      components/
        CompressedDateRange.tsx          # 压缩日期范围
        TimeGap.tsx                      # 时间间隙插入
        TimelineEventCard.tsx            # 时间轴事件卡片
        TimelineGrid.tsx                 # 时间轴网格
        LogSlate/                        # TimeLog 专用编辑器
          LogSlate.tsx
          TimelineEditor.tsx
      hooks/
        useTimeLogEvents.ts
        useTimelineView.ts
      viewModels/
        timelineViewModel.ts             # 时间轴视图模型
      styles/
        TimeLog.css
        TimelineGrid.css
      index.ts

    Event/                               # ✅ 已迁移：事件编辑功能包
      components/
        EventEditModal/                  # 模态框编辑器
          EventEditModalV2.tsx
          sections/
            BasicInfoSection.tsx
            TimeSection.tsx
            EventLogSection.tsx
          hooks/
            useEventForm.ts
        ModalSlate/                      # 事件内容富文本编辑器
          ModalSlate.tsx
          TitleSlate.tsx
          plugins/
        EventTree/                       # 事件树可视化
          EventTreeCanvas.tsx
          EditableEventTree.tsx
          CustomEventNode.tsx
          EventRelationSummary.tsx
          EventTreeSlate.tsx
      hooks/
        useEventEditor.ts
        useEventValidation.ts
      styles/
        EventEditModal.css
        EventTree.css
      index.ts

    Tag/                                 # ✅ 已迁移：标签管理
      components/
        TagManager.tsx                   # Figma 风格标签管理器
        HierarchicalTagPicker/
          TagPicker.tsx
          TagTree.tsx
      hooks/
        useTagService.ts
        useTagHierarchy.ts
      styles/
        TagManager.css
      index.ts

    Contact/                             # ✅ 已迁移：联系人管理
      components/
        ContactModal/
          ContactModal.tsx
          ContactForm.tsx
      hooks/
        useContacts.ts
      styles/
        ContactModal.css
      index.ts

    Timer/                               # ✅ 已迁移：计时器
      components/
        TimerCard.tsx                    # 计时器卡片
        TimeHoverCard/
          HoverCard.tsx
      hooks/
        useTimer.ts
        useTimerParentDetection.ts
      styles/
        TimerCard.css
      index.ts

    Dashboard/                           # ✅ 已迁移：仪表盘
      components/
        DailyStatsCard.tsx
        UpcomingEventsPanel.tsx
        StatisticsPanel.tsx
      hooks/
        useStats.ts
        useDailyMetrics.ts
      styles/
        Dashboard.css
      index.ts

  ┌─────────────────────────────────────────────────────────────
  │ components/ - 跨 feature 可复用 UI
  └─────────────────────────────────────────────────────────────
  components/
    common/                              # 通用 UI 组件
      PageContainer.tsx
      Logo.tsx
      ErrorBoundary.tsx
      ColorPicker.tsx
      Button.tsx
      Modal.tsx
      Dropdown.tsx
    
    shared/                              # 共享业务组件
      StatusLineContainer.tsx
      SyncNotification.tsx
      FloatingToolbar/
        FloatingToolbar.tsx
        ToolbarButton.tsx
      GlassIconBar.tsx
      UnifiedMentionMenu.tsx             # 统一 @mention 菜单
    
    layout/                              # 布局组件
      AppLayout.tsx
      Sidebar.tsx
      Header.tsx
    
    SlateCore/                           # ✅ Slate.js 共享核心层（1500+ 行）
      types/
        slateTypes.ts                    # ParagraphNode, TagNode, DateMentionNode 等
        customTypes.ts
      operations/                        # Slate 操作函数
        paragraphOperations.ts
        formatOperations.ts              # 粗体/斜体/删除线等
        bulletOperations.ts
      elements/                          # Slate 元素组件
        TagElement.tsx
        DateMentionElement.tsx
        TimestampDivider.tsx
      serialization/                     # 序列化工具
        jsonToSlate.ts
        slateToHtml.ts
        slateToPlainText.ts
      services/
        EventLogTimestampService.ts      # Timestamp 服务
      clipboard/
        clipboardEnhancement.ts
      index.ts
    
    attachments/                         # 附件组件
      AttachmentUploader.tsx
      AttachmentViewContainer.tsx
      AttachmentViewModeSwitcher.tsx
      DocumentLibView.tsx
      GalleryView.tsx
      VideoStreamView.tsx
      AudioStreamView.tsx
      TranscriptView.tsx
    
    demos/                               # 演示/测试组件
      AIDemo.tsx
      AIDemoV2.tsx
      RAGDemo.tsx

  ┌─────────────────────────────────────────────────────────────
  │ hooks/ - 跨功能 hooks
  └─────────────────────────────────────────────────────────────
  hooks/
    # EventHub 相关
    useEventHubSnapshot.ts               # ✅ 订阅事件快照
    useEventHubQuery.ts                  # ✅ 查询事件
    useEventHubEvent.ts                  # ✅ 单事件订阅
    useAllEventsSnapshot.ts              # 全量事件快照
    useEventsUpdatedSubscription.ts      # 事件更新订阅
    
    # TimeHub 相关
    useEventTime.ts                      # 事件时间管理
    
    # 其他通用 hooks
    useDebounce.ts
    useThrottle.ts
    useLocalStorage.ts

  ┌─────────────────────────────────────────────────────────────
  │ services/ - 领域服务层
  └─────────────────────────────────────────────────────────────
  services/
    # 约定：每个子包建议提供 index.ts 作为公共入口（稳定 API）
    # ========== 核心服务 ==========
    EventService.ts                      # ✅ normalize 中枢 + CRUD 编排
    EventHub.ts                          # ✅ eventId -> Event cache + 广播
    TimeHub.ts                           # ✅ eventId -> Time snapshot + setEventTime
    
    # ========== 事件树服务 ==========
    eventTree/                           # ✅ 已归拢
      engine/                            # 纯逻辑层（可测试）
        TreeEngine.ts                    # 树构建核心算法
        TreeEngine.test.ts
      EventNodeService.ts                # ✅ 已迁移 (13d8d90)
      TreeAPI.ts                         # 高级 API
      TreeCache.ts                       # 树缓存优化
      PerformanceMonitor.ts
      stats/                             # ✅ 已迁移 (52a0c6b)
        eventTreeStats.ts
      types.ts
      index.ts
    
    # ========== EventLog 处理 ==========
    eventlogProcessing/                  # ✅ 处理管线
      outlookHtmlCleanup.ts              # ✅ Outlook HTML 清洗
      # 待提取（目前在 EventService 内部）：
      htmlToSlateJsonWithRecognition.ts  # HTML -> Slate JSON 转换
      parseHtmlNode.ts                   # HTML 节点解析
      signatureStrip.ts                  # 签名处理
      eventlogCompression.ts             # 空白节点压缩
    
    # ========== 同步服务 ==========
    sync/                                # ✅ 已归拢
      ActionBasedSyncManager.ts          # ✅ 已迁移 (29cc0f1)
      guards/
        syncGuards.ts
      queue/
        syncQueue.ts
      strategies/
        syncStrategy.ts
    
    # ========== 存储服务 ==========
    storage/
      StorageManager.ts                  # 统一存储接口
      IndexedDBService.ts                # IndexedDB 实现
      SQLiteService.ts                   # SQLite 实现（Electron）
      types.ts
      migrations/
    
    # ========== AI 服务 ==========
    ai/
      AIService.ts
      RAGService.ts
      embeddings/
    
    # ========== 外部集成 ==========
    integrations/
      microsoft/
        MicrosoftCalendarService.ts
        AuthService.ts
      outlook/
        OutlookSyncService.ts
      google/                            # 预留
    
    # ========== 其他领域服务 ==========
    CalendarService.ts                   # 日历业务逻辑
    ContactService.ts                    # 联系人管理
    TagService.ts                        # 标签服务
    AttachmentService.ts                 # 附件管理
    PDFParserService.ts                  # PDF 解析
    TimeParsingService.ts                # 时间解析
    EventHistoryService.ts               # 事件历史
    ConflictDetectionService.ts          # 冲突检测
    
    search/                              # 搜索服务
      SearchService.ts
      indexer/

  ┌─────────────────────────────────────────────────────────────
  │ state/ - 全局状态管理（Zustand stores）
  └─────────────────────────────────────────────────────────────
  state/
    authStore.ts                         # 认证状态（MS 账号登录状态）
    syncStatusStore.ts                   # 同步状态（同步进度/错误）
    uiStore.ts                           # UI 状态（侧边栏/主题等）

  ┌─────────────────────────────────────────────────────────────
  │ utils/ - 纯工具函数（无副作用）
  └─────────────────────────────────────────────────────────────
  utils/
    time/                                # 时间相关
      timeUtils.ts
      dateParser.ts
      relativeDateFormatter.ts
      TimeResolver.ts
    
    calendar/                            # 日历相关
      calendarUtils.ts
    
    event/                               # 事件相关
      eventUtils.ts
      uuidGenerator.ts
    
    text/                                # 文本处理
      TitleResolver.ts
      signatureUtils.ts
    
    dom/                                 # DOM 操作
      domUtils.ts
    
    logger.ts                            # 日志工具

  ┌─────────────────────────────────────────────────────────────
  │ shared/ - 跨层共享的纯模块（建议目标归拢目录）
  └─────────────────────────────────────────────────────────────
  shared/
    constants/
    contracts/
    types/
    utils/

  ┌─────────────────────────────────────────────────────────────
  │ 其他目录
  └─────────────────────────────────────────────────────────────
  config/
    time.config.ts
    sync.config.ts
    app.config.ts
  
  styles/
    globals.css
    calendar.css
    variables.css
    themes/
  
  lib/                                   # 第三方库（vendored）
    tui.calendar/                        # ✅ 已瘦身（~821 文件）
  
  assets/
    icons/
    images/
    fonts/
```

---

## 🔄 关键变更说明

### 1. Pages 重组（解决"什么都有，什么都没有"的问题）

**历史问题（已解决）**：pages/ 曾包含多个旧入口与超大文件（如 LogTab / DesktopCalendarWidget 等），现已收敛为“薄编排”并按模块归位。

**目标结构**：
```
pages/
  Home/index.tsx
  Plan/index.tsx
  Calendar/
    index.tsx           # 主日历页
    WidgetWindow.tsx    # Desktop Widget
    WidgetSettings.tsx
  TimeLog/index.tsx
  Event/
    DetailTab.tsx       # LogTab 重命名，明确职责
    EditorWindow.tsx
  Tag/index.tsx
  Settings/index.tsx
```

**改进**：
- ✅ 每个页面有明确的功能归属
- ✅ pages/ 只负责路由和组合，不包含业务逻辑
- ✅ 大文件 LogTab.tsx 归入 Event/ 模块

### 2. Features 完善（建立完整的功能边界）

**新增模块**：
- `Event/` - 整合所有事件编辑相关组件
- `Tag/` - 标签管理
- `Contact/` - 联系人管理
- `Timer/` - 计时器
- `Dashboard/` - 仪表盘

**每个 feature 标准结构**：
```
Feature/
  components/     # 领域组件
  hooks/          # 领域 hooks
  helpers/        # 领域辅助函数（非通用）
  styles/         # 样式
  index.ts        # 公共 API
```

### 3. Components 职责清晰

**分类**：
- `common/` - 纯 UI 组件（Button, Modal 等）
- `shared/` - 跨模块业务组件（StatusLine, SyncNotification）
- `layout/` - 布局组件
- `SlateCore/` - Slate.js 共享核心（1500+ 行）
- `attachments/` - 附件相关
- `demos/` - 演示组件

### 4. Services 按职责分包

**核心原则**：
- EventService 保持单一入口
- 相关服务按子目录分组（eventTree/, sync/, storage/）
- eventlogProcessing/ 待完善（提取 EventService 内部的 HTML 处理逻辑）

### 5. State 管理集中

使用 Zustand 管理跨组件状态：
- `authStore` - 认证状态
- `syncStatusStore` - 同步状态
- `uiStore` - UI 状态

---

## 📋 执行计划（分阶段）

### P0 - 已完成 ✅
- [x] Plan helpers 迁移 (89bf1cf)
- [x] EventTree 重命名 (bd235ae)
- [x] EventNodeService 迁移 (13d8d90)
- [x] eventTreeStats 迁移 (52a0c6b)
- [x] ActionBasedSyncManager 迁移 (29cc0f1)
- [x] PlanManager 迁移 (d0989ec)
- [x] TimeLog 迁移 (8d13a61)

### P1 - Pages 重组（推荐下一步）
- [x] 创建 `pages/Event/` 并移入 LogTab.tsx (重命名为 DetailTab.tsx) (80f0f38, 65e5b81)
- [x] 创建 `pages/Event/` 并移入 EventEditorWindow.tsx (重命名为 EditorWindow.tsx) (b4bdf4f, 656b5ce)
- [x] 创建 `pages/Calendar/` 并移入 DesktopCalendarWidget.tsx (重命名为 WidgetWindow.tsx) (ac23942)
- [x] 创建 `pages/Calendar/` 并移入 WidgetSettings.tsx (1108318)
- [x] 创建 `pages/Home/` 并移入 HomePage (ff20db4 + 30bd75f)

### P2 - Features 完善
- [x] 创建 `features/Event/` 并迁移 EventEditModal + EventTree 组件 (abe2e9e, 0e16f2a)
- [x] 创建 `features/Tag/` 并迁移 TagManager (87ca372)
- [x] 创建 `features/Contact/` 并迁移 ContactModal (b72f9ff)
- [x] 创建 `features/Timer/` 并迁移 TimerCard
- [x] 创建 `features/Dashboard/` 并迁移 DailyStatsCard + UpcomingEventsPanel (3c9d16b)

### P3 - Services 优化
- [x] 提取 EventService 内部的 HTML 处理逻辑到 `eventlogProcessing/` (ba0c853, f107898)
- [x] 创建 `state/` 目录并迁移 Zustand stores (bf1f594)

---

## 🎯 验收标准

每一步迁移必须满足：
1. ✅ TypeScript 编译通过（`npx tsc --noEmit`）
2. ✅ 单元测试全绿（`npm test -- --run`）
3. ✅ **禁止 shim/兼容层**：必须同步更新所有导入到 `@frontend/*` / `@backend/*` / `@shared/*`
4. ✅ 禁止 `shim.d.ts` 与通配符模块声明；类型与实现应尽量同目录
5. ✅ 更新 REFACTOR_EXECUTION_LOG
6. ✅ Git commit + push

---

## ✅ 每次“代码搬运/目录迁移”后的必要检查项目（强制）

> 目标：让项目可以安全重构，IDE 可以正确跳转到定义；尽量做到“编译错误 = 运行时错误（提前暴露问题）”。

### A. 类型声明卫生检查（禁止 shim / 通配符）

检查项目中是否出现 `shim.d.ts` 或类似“通配符类型声明”。

如果发现 `declare module ...`：
1. 列出所有 `declare module` 语句（逐条列出模块名与所在文件）
2. 对每个声明判断是否必要：
   - 如果是为了**已有 @types** 的库补声明 → 删除（优先装/修正对应 `@types/*` 或升级依赖）
   - 如果是**通配符路径**（例如 `declare module '*/something'`）→ 删除（必须改成真实可解析的模块路径/别名导入）
   - 如果是把类型“糊成 any”来通过编译 → 重写为精确类型，或删除并在调用点做显式类型收敛
3. 保留的唯一例外：**扩展全局类型**（例如 `process.env`、`ImportMetaEnv`、`Window` 等）

备注：像 `declare module 'slate'` 这类**明确模块名**的第三方库“增量补类型/修补类型”不属于通配符声明，但也必须有明确理由；能通过升级依赖/替换 API 解决的，优先删除该补丁。

### B. Path Alias 与导入路径（强制显式）

1. 在 `tsconfig.json` 配置 TypeScript Path Alias（本仓库单体结构推荐如下；如未来拆分 monorepo，再调整映射）：

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@backend/*": ["src/services/*"],
      "@frontend/*": ["src/*"]
    }
  }
}
```

2. 更新所有导入路径为明确别名：`@shared/*` / `@backend/*` / `@frontend/*`
   - 禁止使用旧路径兼容层（re-export/CSS @import 转发等）

3. 运行 `npm run typecheck`，确保无 TypeScript 错误（本仓库等价于 `tsc --noEmit`）

补充（避免“TS 能过但运行找不到模块”）：
- 如果使用 Vite/打包器，还必须在对应构建配置里同步 alias（例如 Vite `resolve.alias` 或使用 `vite-tsconfig-paths`）。

---

## 📚 参考文档

- `docs/architecture/APP_ARCHITECTURE_PRD.md` - App 架构设计
- `docs/architecture/EVENTSERVICE_ARCHITECTURE.md` - EventService 职责
- `docs/architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md` - 订阅模式
- `docs/refactor/REFACTOR_EXECUTION_LOG_v2.22.md` - 执行日志
- `README.md` - 应用功能概览
