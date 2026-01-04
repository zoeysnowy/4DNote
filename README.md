# 4DNote v1.3.0

**四维时间管理系统 - 集成 Plan/Actual/TimeLog/Timer 的智能生产力工具**

[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](https://github.com/zoeysnowy/4DNote/releases)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](./LICENSE)
[![React](https://img.shields.io/badge/React-19.2.0-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![Slate.js](https://img.shields.io/badge/Slate.js-0.118-00a67e.svg)](https://www.slatejs.org/)

4DNote 是一个四维时间管理系统，整合了 **计划 (Plan)**、**执行 (Actual)**、**日志 (TimeLog)** 和 **计时器 (Timer)** 四个维度，提供完整的时间管理闭环。支持与 Microsoft Outlook 日历双向同步，采用 Slate.js 富文本编辑器和本地优先存储架构。

> **📖 [用户功能手册](./USER_MANUAL.md)** - 面向用户的完整功能指南  
> 包含详细的功能说明、使用场景、快捷键参考和常见问题

---

## 🧭 代码结构与导入约定（开发者）

- 目录结构目标与边界说明：`docs/refactor/CODE_STRUCTURE_TARGET_TREE_v2.0_2026-01-03.md`
- 应用整体架构（包含目录结构/分层约定补充）：`docs/architecture/APP_ARCHITECTURE_PRD.md`
- TypeScript Path Alias（强制）：
  - `@frontend/*` → `src/*`（pages/features/components/hooks/utils/styles/assets...）
  - `@backend/*` → `src/services/*`
  - `@shared/*` → `src/shared/*`

约定：跨目录引用优先使用 alias；同目录/同模块内部可使用 `./`。

## 🌟 核心特性

### 📊 四维时间管理架构

4DNote 独创的四维时间管理体系：

| 维度 | 组件 | 功能描述 | 核心价值 |
|-----|------|---------|---------|
| **📅 Plan** | PlanManager | 计划视图 - 规划未来事件，时间轴组织 | 前瞻性规划 |
| **✅ Actual** | TimeCalendar | 执行视图 - 记录实际发生的事件 | 真实执行追踪 |
| **📝 TimeLog** | ContentSelectionPanel | 日志视图 - 详细记录事件内容和思考 | 深度复盘与知识沉淀 |
| **⏱️ Timer** | Timer Widget | 计时器 - 实时专注时间追踪 | 专注力量化 |

**架构亮点**：
- ✅ **事件双态系统**：Plan 事件可转化为 Actual 事件，实现计划与执行的闭环
- ✅ **父子事件树**：Timer 作为子事件自动关联到父事件，构建完整的时间层级
- ✅ **智能同步**：Plan/Actual 事件可独立或批量同步至 Outlook 日历
- ✅ **统一存储**：所有事件共享 Event 数据模型，通过 `isActual`/`isTimer` 标记区分类型

### ✨ Slate.js 富文本编辑系统

基于 **SlateCore 共享层**的三编辑器架构（v3.0）：

```
SlateCore (共享层 - 1500+ 行)
├── 类型定义 (ParagraphNode, TagNode, DateMentionNode, TimestampDividerElement)
├── 序列化工具 (JSON ↔ Slate Nodes ↔ HTML)
├── 元素组件 (TagElement, DateMentionElement, TimestampDivider)
├── 格式化工具 (粗体/斜体/删除线/项目符号)
├── Timestamp 服务 (EventLogTimestampService)
└── Clipboard 增强 (纯文本/HTML/项目符号智能解析)

      ↓ 被复用于

ModalSlate (事件编辑器)       PlanSlate (计划编辑器)       EventLine (时间轴行内编辑)
├── 富文本内容编辑            ├── 单行简洁编辑            ├── 快速内联编辑
├── 时间戳分隔符              ├── Tag/DateMention        ├── 轻量级交互
├── 版本历史管理              ├── 键盘导航优化            └── 实时保存
└── 完整格式支持              └── PlanManager 集成
```

**SlateCore 重构成果**：
- 📉 代码减少：247 行（ModalSlate 从 1265 → 1018 行）
- 🔄 共享复用：30+ 函数，3 个元素组件，1 个 Timestamp 服务
- 🏗️ 架构清晰：共享核心 + 专注场景，职责分明

### 💾 Storage Architecture v2.4.0

**本地优先 + 云端预留** 的渐进式存储架构：

```typescript
// 当前架构（MVP 阶段）
IndexedDB (主存储)
├── Events Table (事件完整数据)
├── Tags Table (标签系统)
├── Contacts Table (联系人)
└── Snapshots Table (快照备份)

SQLite (扩展支持 - Electron)
├── 无限版本历史
├── 大附件存储
└── 离线查询优化

LocalStorage (缓存层)
├── 快速访问缓存
├── 用户偏好设置
└── 智能去重键

// 未来扩展（Beta 阶段 - 预留字段已就位）
4DNote Cloud (Supabase)
├── remarkableUserId (App 账号)
├── syncMode (同步模式)
├── cloudSyncStatus (云端状态)
└── 跨设备同步
```

**架构优势**：
- ✅ **零重构升级**：云端字段已预留在 Event 类型中，开启即用
- ✅ **软删除机制**：`deletedAt` 字段实现数据恢复和同步协调
- ✅ **UUID 生成**：`nanoid()` 生成唯一 ID，支持离线创建
- ✅ **版本历史**：EventLog 支持无限版本追踪（SQLite 存储）

### 🔄 日历同步系统

**双向同步 + 智能映射** 的日历集成方案：

- **🔗 双向同步**：Plan/Actual 事件与 Outlook 日历实时同步
- **📧 Private 模式**：`send-only-private` 和 `bidirectional-private` 支持隐私保护
- **🏷️ 自动标签映射**：
  - Outlook 日历 → `工作` + `Outlook` 标签
  - Google Calendar → `生活` + `Google` 标签
  - iCloud → `个人` + `iCloud` 标签
- **🎯 6 层优先级来源**：
  1. Timer 子事件
  2. 外部日历同步
  3. 独立 Timer 事件
  4. Plan 事件
  5. TimeCalendar 事件
  6. 本地创建事件
- **⚙️ 冲突解决**：基于 `lastModifiedDateTime` 的三路合并策略
- **🧹 自动去重**：双层保护（内存缓存 + localStorage 键值检测）

### 🎨 现代化 UI 组件

- **HeadlessFloatingToolbar**：统一浮动工具栏
  - 两种模式：`menu_floatingbar`（标签/表情/日期）+ `text_floatingbar`（粗体/斜体/颜色）
  - 键盘导航：Alt+1-5 快捷键，数字键选择，Esc 关闭
  - 智能定位：自动避免遮挡选区，跟随滚动

- **EventEditModalV2**：增强事件编辑器
  - 可拖拽 modal，记忆位置
  - 多选日历同步目标
  - 智能参与者格式化（Private 模式）
  - 地址智能输入（高德地图 API）

- **ContentSelectionPanel**：TimeLog 内容面板
  - 树形结构展示事件层级
  - 折叠/展开状态记忆
  - Hide/Unhide 节点管理
  - 事件关系可视化

- **UnifiedDateTimePicker**：统一时间选择器
  - Time Field State Bitmap（v2.6）：精确追踪用户设置的字段
  - Fuzzy Date 支持："下周日中午" → `12:00` 单时间点
  - 三层架构：数据层（完整时间戳）→ 元数据层（用户意图）→ 显示层（精确渲染）
- **Snapshot 状态可视化**：事件历史追溯系统
  - 五种状态标识：New（蓝）、Updated（橙）、Done（绿）、Missed（红）、Deleted（灰）
  - 彩色竖线可视化事件生命周期
  - 多线并行显示，智能列分配算法
  - Ghost 事件（已删除）完整历史查看
  - 适用场景：项目复盘、时间段分析、习惯追踪
### 🌳 EventTree 层级系统

**自动维护 + 双向链接** 的事件关系管理：

```typescript
// EventTree 自动维护机制
EventService.createEvent() → 自动设置 parentEventId/childEventIds
EventService.updateEvent() → 自动同步父子关系
EventService.deleteEvent() → 软删除，保留关系链

// 双向链接功能
EventService.addLink(sourceId, targetId)       // 添加链接
EventService.removeLink(sourceId, targetId)    // 移除链接
EventService.getLinkedEvents(eventId)          // 获取所有链接事件
EventService.getBacklinks(eventId)             // 获取反向链接
```

**可视化组件**（规划中）：
- Canvas 图谱视图（React Flow）
- 拖拽编辑关系
- 自动布局算法

### 🤖 AI 智能助手

**已实现功能**：

#### AI 事件提取
- 📄 **文档解析**：上传 PDF/TXT，AI 自动识别会议信息
- 🤖 **多模型支持**：DashScope（阿里云）、腾讯混元、Ollama（本地）
- ✅ **智能提取**：标题、时间、地点、参与人、议程、行动项
- 📝 **可编辑预览**：提取后可修改，一键创建事件
- 💰 **成本极低**：单次提取 < ¥0.01，支持本地模型免费使用

**规划中功能**：

#### AI 内联对话
- 💬 在 EventLog 中通过 `@ai` 触发对话
- 📦 对话历史自动保存为 Toggle 节点
- 🎯 上下文感知，理解当前事件和笔记内容
- 🔀 多模型支持（GPT-4、Claude、Gemini）

#### AI 笔记管理器
- 🏷️ 自动分类和标签提取
- 🔗 智能关联相关笔记、事件、任务
- 🔍 语义搜索，理解搜索意图
- 📊 知识图谱可视化

#### AI 任务管理器
- 📥 从邮件、文档、图片自动提取任务
- 🤖 智能判断优先级和所需时间
- ⏰ 在日历空闲时段自动安排任务
- 📊 时间使用分析和优化建议

#### AI 语音与图像
- 🎤 语音转写（实时转写、说话人分离、智能摘要）
- 🖼️ 图片识别（白板、文档扫描、海报、名片）
- 📝 自动生成结构化笔记

---

## 🚀 技术栈

### 核心框架
- **React 19.2.0** - 最新 React 版本，Concurrent 渲染
- **TypeScript 5.x** - 完整类型安全
- **Vite 7.2.2** - 极速开发体验
- **Electron** (可选) - 跨平台桌面应用

### 编辑器与 UI
- **Slate.js 0.118** - 富文本编辑框架
- **TOAST UI Calendar** - 高性能日历组件
- **Framer Motion 12.x** - 流畅动画
- **Ant Design 5.x** - 企业级组件库
- **React Flow 11.x** - 图形可视化（EventTree）

### 存储与同步
- **IndexedDB** - 浏览器本地数据库
- **SQLite** (Electron) - 离线持久化
- **Microsoft Graph API** - Outlook 日历同步
- **Azure MSAL** - OAuth 身份认证

### AI 与智能服务
- **DashScope** (阿里云通义千问) - AI 事件提取（推荐）
- **腾讯混元** - 多模型 AI 支持
- **Ollama** - 本地 AI 模型部署
- **AI Proxy Server** - 跨域请求代理

### 开发工具
- **Vitest** - 单元测试
- **ESLint + Prettier** - 代码规范
- **TypeScript Compiler** - 类型检查

---

## 📦 快速开始

### 环境要求
- **Node.js** 16+ 
- **npm** 或 **yarn**
- **Azure AD 应用注册** (用于 Outlook 同步)
- **高德地图 API Key** (用于地址功能，可选)

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm start
# 或使用 Vite
npm run dev
```

应用将在 [http://localhost:3000](http://localhost:3000) 启动（或 Vite 的 5173 端口）。

### 构建生产版本
```bash
npm run build
```

构建产物将输出到 `dist/` 文件夹，适合生产环境部署。

### 启动 Electron 桌面应用
```bash
npm run electron-dev
# 或使用快捷命令
npm run ed
```

---

## 🔧 配置指南

### 1. Outlook 日历同步配置

1. **注册 Azure AD 应用**：
   - 访问 [Azure Portal](https://portal.azure.com/)
   - 应用程序（客户端）ID 和租户 ID
   - 添加重定向 URI: `http://localhost:3000`

2. **配置权限**：
   - `Calendars.ReadWrite` - 读写日历
   - `User.Read` - 读取用户信息

3. **环境变量**（`src/authConfig.ts`）：
```typescript
export const msalConfig = {
  auth: {
    clientId: "YOUR_CLIENT_ID",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: "http://localhost:3000"
  }
};
```

### 2. 高德地图地址功能（可选）

1. **申请 API Key**：
   - 访问 [高德开放平台](https://console.amap.com/)
   - 免费配额：300,000 次/天

2. **配置环境变量**：
```bash
cp .env.example .env
```

编辑 `.env` 文件：
```env
VITE_AMAP_KEY=your_actual_api_key_here
```

详细配置见 [地址功能设置文档](./docs/LOCATION_FEATURE_SETUP.md)

---

## 📖 文档

### 用户文档
- **[用户功能手册](./USER_MANUAL.md)** - 完整的功能指南（推荐从这里开始）
  - 四维时间管理详解
  - AI 功能使用指南
  - 8 个市场稀缺亮点功能
  - 5 个真实使用场景
  - 快捷键参考和常见问题

### 核心架构 PRD
- **[Storage Architecture](./docs/architecture/STORAGE_ARCHITECTURE.md)** - 存储架构设计（v2.4.0）
- **[Slate Editor PRD](./docs/PRD/SLATEEDITOR_PRD.md)** - Slate.js 编辑器系统（v3.0）
- **[EventTree Module PRD](./docs/PRD/EVENTTREE_MODULE_PRD.md)** - 事件树模块设计
- **[EventService Module PRD](./docs/PRD/EVENTSERVICE_MODULE_PRD.md)** - 事件服务 API
- **[App Architecture PRD](./docs/architecture/APP_ARCHITECTURE_PRD.md)** - 应用整体架构
- **[EventHub & TimeHub Architecture](./docs/architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md)** - 事件中心架构
- **[Snapshot Status Visualization PRD](./docs/PRD/SNAPSHOT_STATUS_VISUALIZATION_PRD.md)** - 快照状态可视化系统

### 功能模块 PRD
- **[PlanManager Module PRD](./docs/PRD/PLANMANAGER_MODULE_PRD.md)** - Plan 视图模块
- **[TimeCalendar Module PRD](./docs/PRD/TIMECALENDAR_MODULE_PRD.md)** - 日历视图模块
- **[TimeLog & Description PRD](./docs/PRD/TimeLog_&_Description_PRD.md)** - 日志视图模块
- **[Timer Module PRD](./docs/PRD/TIMER_MODULE_PRD.md)** - 计时器模块
- **[EventEditModal V2 PRD](./docs/PRD/EVENTEDITMODAL_V2_PRD.md)** - 增强事件编辑器
- **[Floating Components PRD](./docs/PRD/FLOATING_COMPONENTS_PRD.md)** - 浮动工具栏系统
- **[UnifiedMention PRD](./docs/PRD/UnifiedMention_PRD.md)** - @提及 和日期引用
- **[TagManager Module PRD](./docs/PRD/TAGMANAGER_MODULE_PRD.md)** - 标签管理系统
- **[ContactService PRD](./docs/PRD/CONTACTSERVICE_PRD.md)** - 联系人服务

### AI 功能 PRD
- **[AI Event Extraction Demo PRD](./docs/PRD/AI_DEMO_PRD.md)** - AI 事件提取（已实现）
- **[AI ChatFlow PRD](./docs/PRD/AI_ChatFlow_PRD.md)** - AI 内联对话系统
- **[AI Notes Manager PRD](./docs/PRD/AI_NotesManager_PRD.md)** - AI 笔记管理器
- **[AI Task Manager PRD](./docs/PRD/AI_TaskManager_PRD.md)** - AI 任务管理器

### AI 使用指南
- **[AI Demo V2 Guide](./docs/AI_DEMO_V2_GUIDE.md)** - AI 事件提取使用指南
- **[Activity Poster Recognition](./docs/ACTIVITY_POSTER_RECOGNITION_GUIDE.md)** - 海报识别指南
- **[AI Framework Phase 1](./docs/AI_FRAMEWORK_PHASE1_REPORT.md)** - AI 框架阶段 1 报告
- **[AI Framework Phase 2](./docs/AI_FRAMEWORK_PHASE2_REPORT.md)** - AI 框架阶段 2 报告
- **[RAG Quick Start](./docs/RAG_QUICK_START.md)** - RAG 快速开始
- **[RAG Usage Guide](./docs/RAG_USAGE_GUIDE.md)** - RAG 使用指南

### 同步与存储
- **[ActionBasedSyncManager PRD](./docs/PRD/ACTIONBASEDSYNCMANAGER_PRD.md)** - 同步管理器
- **[MicrosoftCalendarService PRD](./docs/PRD/MICROSOFTCALENDARSERVICE_PRD.md)** - Outlook 同步服务
- **[EventHistory Module PRD](./docs/PRD/EVENTHISTORY_MODULE_PRD.md)** - 事件历史模块
- **[Attachment System PRD](./docs/PRD/ATTACHMENT_SYSTEM_PRD.md)** - 附件系统

### 测试与开发
- **[Location Feature Setup](./docs/LOCATION_FEATURE_SETUP.md)** - 地址功能配置
- **[Location Test Checklist](./docs/LOCATION_TEST_CHECKLIST.md)** - 地址功能测试清单
- **[快捷键速查表](./docs/shortcuts-cheatsheet.md)** - 所有快捷键列表

### 架构演进
- **[CHANGELOG.md](./CHANGELOG.md)** - 完整更新日志

---

## 🧪 测试工具

项目包含一些调试与诊断页面/脚本（主要位于 `build/` 目录，直接用浏览器打开即可）：

### 数据与存储诊断
- `build/diagnose-indexeddb.html` - IndexedDB 环境/数据诊断
- `build/diagnose-sync-normalize.html` - 同步 normalize 诊断
- `build/test-sqlite.js` - SQLite 相关测试脚本（Electron/本地环境）

### 同步与循环更新
- `build/test-circular-updates.html` - 循环更新检测
- `build/debug-circular-updates.js` - 循环更新调试脚本

### UI/交互验证
- `build/test-vertical-line-status.html` - 状态线/布局验证
- `build/test-searchbox-design.html` - 搜索框样式验证
- `build/tab-design-test.html` - Tab 设计验证

使用方法：直接打开对应 HTML；JS 文件按需在控制台执行或作为页面脚本引用。

---

## 🔄 版本与变更

详见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献流程
1. **Fork 本仓库**
2. **创建特性分支**
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **提交更改**
   ```bash
   git commit -m 'feat: Add some AmazingFeature'
   ```
4. **推送到分支**
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **开启 Pull Request**

### 提交规范
使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：
- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更新
- `refactor:` - 代码重构
- `perf:` - 性能优化
- `test:` - 测试相关
- `chore:` - 构建/工具变更

---

## 📄 许可证

**本项目为商业闭源软件，版权所有。**

Copyright (C) 2024-2025 Zoey. All Rights Reserved.

未经授权，严禁通过任何媒介复制、分发或修改本软件。本软件为专有和机密信息。

查看 [LICENSE](./LICENSE) 文件了解详情。

---

## 🙏 致谢

- **[TOAST UI Calendar](https://github.com/nhn/tui.calendar)** - 优秀的日历组件库
- **[Slate.js](https://www.slatejs.org/)** - 强大的富文本编辑框架
- **[Microsoft Graph API](https://docs.microsoft.com/en-us/graph/)** - Outlook 集成支持
- **[React](https://reactjs.org/)** - 前端框架
- **[Vite](https://vitejs.dev/)** - 构建工具
- 所有贡献者和测试者

---

## 📞 联系方式

- **GitHub Issues**: [提交问题](https://github.com/zoeysnowy/4DNote/issues)
- **GitHub Discussions**: [参与讨论](https://github.com/zoeysnowy/4DNote/discussions)
- **邮箱**: zoey@4dnote.app (计划中)

---

## 🗺️ 发展路线图

### Phase 1: MVP (已完成 ✅)
- ✅ 本地存储架构（IndexedDB + SQLite）
- ✅ Outlook 日历同步
- ✅ 四维时间管理（Plan/Actual/TimeLog/Timer）
- ✅ Slate.js 富文本编辑器（SlateCore 共享层）
- ✅ EventTree 层级系统（父子关系 + 双向链接）
- ✅ Snapshot 快照可视化（事件历史追溯系统）
- ✅ AI 事件提取（PDF/TXT 文档智能解析）
- ✅ 多 AI 模型支持（DashScope/腾讯混元/Ollama）
- ✅ 标签管理系统（层级标签 + 日历映射）
- ✅ 联系人管理
- ✅ 附件系统（多类型文件支持）

### Phase 2: Beta (3-6 个月) - AI 增强
- 🚧 AI 内联对话（@ai 触发，多模型支持）
- 🚧 AI 笔记管理器（自动分类、智能关联、语义搜索）
- 🚧 AI 任务管理器（智能提取、自动规划）
- 🚧 AI 语音转写（实时转写、说话人分离）
- 🚧 AI 图片识别（白板、文档、海报、名片）
- ⏳ 4DNote Cloud (Supabase)
- ⏳ App 账号系统
- ⏳ 跨设备同步
- ⏳ Google Calendar 集成
- ⏳ iCloud 集成
- ⏳ 移动端适配

### Phase 3: 1.0 Release (6-12 个月) - 协作与开放
- ⏳ AI 驱动的时间建议和优化
- ⏳ 智能事件分类和预测
- ⏳ 高级可视化（EventTree Canvas 图谱）
- ⏳ 团队协作功能（共享事件、评论）
- ⏳ API 开放平台
- ⏳ 插件市场
- ⏳ 高级数据分析和报表

---

**Made with ❤️ by the 4DNote Team**
