# AI Event Extraction Demo - Product Requirements Document

> **文档版本**: v1.0  
> **创建日期**: 2025-12-03  
> **维护者**: Zoey Gong  
> **状态**: 🚧 开发中 (50% 完成)  
> **相关组件**: `src/components/AIDemo.tsx`

---

## 📋 目录

1. [产品概述](#产品概述)
2. [核心功能](#核心功能)
3. [技术架构](#技术架构)
4. [使用流程](#使用流程)
5. [API 配置](#api-配置)
6. [数据模型](#数据模型)
7. [性能指标](#性能指标)
8. [开发进度](#开发进度)
9. [测试指南](#测试指南)
10. [部署方案](#部署方案)

---

## 产品概述

### 1.1 产品定位

**AI Event Extraction Demo** 是 4DNote 应用中的独立测试页面，用于验证 AI 事件提取功能的完整流程。通过上传 PDF 或文本文件，AI 自动识别会议信息并创建日历事件。

### 1.2 目标用户

- **产品经理**: 测试 AI 功能可用性
- **开发人员**: 验证 AI 服务集成
- **高级用户**: 体验 AI 辅助功能

### 1.3 核心价值

- ✅ **零手动输入**: AI 自动提取标题、时间、地点、参与人
- ✅ **多模型支持**: 云端 API (DashScope, 腾讯混元) + 本地模型 (Ollama)
- ✅ **可编辑预览**: Before/After 对比，支持修改后创建
- ✅ **低成本**: 优先免费额度，单次提取成本 < ¥0.01

---

## 核心功能

### 2.1 功能模块

```
AI Demo 页面
├── 1. AI 服务状态检测
│   ├── 显示当前服务商 (DashScope/腾讯混元/Ollama)
│   ├── 显示模型版本和配置
│   └── 一键检测可用性
│
├── 2. API 配置管理
│   ├── 服务商切换 (单选框)
│   ├── API Key 输入 (DashScope)
│   ├── 腾讯云密钥输入 (SecretId/Key)
│   ├── 预设管理 (保存/应用/删除)
│   └── 配置持久化 (localStorage)
│
├── 3. 文档上传
│   ├── 拖拽上传
│   ├── 点击选择
│   ├── 支持格式: PDF, TXT
│   └── 文件预览 (名称/大小)
│
├── 4. 事件信息提取
│   ├── AI 解析文档
│   ├── 结构化输出 (JSON)
│   ├── 置信度评分
│   └── 错误处理
│
├── 5. 结果编辑与创建
│   ├── 表单编辑 (标题/时间/地点/议程)
│   ├── 参与人列表 (只读标签)
│   ├── 创建事件 (通过 EventHub)
│   └── 成功反馈
│
└── 6. 代理服务器管理 (仅 Electron)
    ├── 状态检测 (运行中/已停止)
    ├── 一键启动代理
    ├── 实时日志显示
    └── 自动健康检查
```

### 2.2 功能优先级

| 功能 | 优先级 | 状态 | 备注 |
|------|--------|------|------|
| DashScope 云端 API | P0 | ✅ 完成 | 推荐方案 |
| Ollama 本地模型 | P1 | ✅ 完成 | 高级用户 |
| 腾讯混元云端 API | P1 | ✅ 完成 | 需代理 |
| 预设管理 | P1 | ✅ 完成 | 多账号切换 |
| 代理服务器 Electron 集成 | P1 | ✅ 完成 | 一键启动 |
| Before/After 预览 | P2 | ⏸️ 未开始 | v2.0 |
| 批量处理 | P2 | ⏸️ 未开始 | v2.0 |
| Google AI Studio | P2 | ⏸️ 未开始 | 海外用户 |

---

## 技术架构

### 3.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      AIDemo.tsx (UI Layer)                  │
│  - 状态管理 (useState)                                       │
│  - 配置管理 (AIConfigManager)                               │
│  - 代理控制 (Electron IPC)                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   AIService (Service Layer)                 │
│  - Provider 选择逻辑                                         │
│  - 文档解析 (PDFParserService)                              │
│  - AI 推理调用                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ↓             ↓             ↓
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ DashScopeProvider│ │  HunyuanProvider │ │  OllamaProvider  │
│  (云端 - 推荐)   │ │  (云端 - 需代理) │ │  (本地 - 离线)   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     EventHub (Event Layer)                  │
│  - 创建事件 (createEvent)                                    │
│  - 数据持久化 (StorageManager)                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
用户上传文件
    ↓
PDFParserService.parseDocument()
    ↓
提取纯文本 (text: string)
    ↓
AIService.extractEventFromDocument()
    ↓
选择 Provider (DashScope/Hunyuan/Ollama)
    ↓
调用 AI API (POST /api/generate)
    ↓
解析 JSON 响应
    ↓
返回 ExtractedEventInfo
    ↓
用户编辑确认
    ↓
EventHub.createEvent()
    ↓
保存到 StorageManager (IndexedDB + SQLite)
    ↓
同步到日历视图
```

### 3.3 核心服务

#### AIService (`src/services/ai/AIService.ts`)

```typescript
export class AIService {
  private provider: AIProvider;
  
  constructor() {
    // 自动选择最优 Provider
    this.provider = this.selectProvider();
  }
  
  // 测试可用性
  async testAvailability(): Promise<{
    available: boolean;
    model: string;
    error?: string;
  }>;
  
  // 从文档提取事件
  async extractEventFromDocument(file: File): Promise<ExtractedEventInfo>;
  
  // 从纯文本提取事件
  async extractEventFromText(text: string): Promise<ExtractedEventInfo>;
}
```

#### AIConfigManager (`src/services/ai/AIConfig.ts`)

```typescript
export interface AIConfig {
  provider: 'ollama' | 'dashscope' | 'hunyuan';
  
  // DashScope 配置
  dashscopeApiKey?: string;
  dashscopeModel?: string;
  
  // 腾讯混元配置
  hunyuanSecretId?: string;
  hunyuanSecretKey?: string;
  hunyuanModel?: string;
  
  // Ollama 配置
  ollamaBaseUrl?: string;
  currentModel?: 'qwen' | 'gemma';
}

export class AIConfigManager {
  static saveConfig(config: Partial<AIConfig>): void;
  static getConfig(): AIConfig;
  
  // 预设管理
  static savePreset(preset: APIPreset): void;
  static getPresets(): APIPreset[];
  static applyPreset(preset: APIPreset): void;
  static deletePreset(id: string): void;
}
```

---

## 使用流程

### 4.1 首次使用 (DashScope 云端)

1. **访问 AI Demo 页面**
   - 点击侧边栏 "AI Demo" 菜单

2. **配置 API Key**
   - 点击 "⚙️ 配置 API" 按钮
   - 选择 "DashScope 云端"
   - 访问 https://dashscope.console.aliyun.com/apiKey 获取 Key
   - 粘贴到输入框
   - 点击 "💾 保存配置"

3. **检测可用性**
   - 点击 "🔍 检测 AI 可用性"
   - 等待 2-3 秒
   - 看到 "✅ qwen-plus 可用" 提示

4. **上传文档**
   - 拖拽 PDF 文件到虚线框
   - 或点击虚线框选择文件

5. **提取事件**
   - 点击 "🚀 开始提取"
   - 等待 3-5 秒
   - 查看提取结果

6. **编辑并创建**
   - 修改标题/时间/地点等字段
   - 点击 "✅ 确认创建事件"
   - 成功后可在 TimeCalendar 中查看

### 4.2 使用腾讯混元 (需代理)

**Electron 环境 (推荐)**:
1. 选择 "腾讯混元云端（需代理）"
2. 如果提示 "❌ 代理未启动"
3. 点击 "🚀 一键启动代理服务器" 按钮
4. 等待 2-3 秒，代理自动启动
5. 输入 SecretId 和 SecretKey
6. 保存配置并使用

**Web 环境**:
1. 打开新终端，运行:
   ```bash
   cd ai-proxy
   npm install
   npm start
   ```
2. 等待看到 "🚀 腾讯混元 API 代理服务器已启动"
3. 返回 AI Demo 页面配置密钥

### 4.3 使用 Ollama 本地模型

1. **安装 Ollama**
   - Windows: `winget install Ollama.Ollama`
   - macOS: `brew install ollama`

2. **启动服务**
   ```bash
   ollama serve
   ```

3. **下载模型**
   ```bash
   ollama pull qwen2.5:7b
   ```

4. **配置应用**
   - 在 AI Demo 中选择 "Ollama 本地"
   - 点击 "检测 AI 可用性"
   - 确认 "✅ qwen2.5:7b 可用"

---

## API 配置

### 5.1 DashScope 云端 API (推荐)

**优势**:
- ✅ 零安装，应用体积不变
- ✅ 免费额度 100 万 tokens (约 1000-2000 次调用)
- ✅ 响应速度快 (3-5 秒)
- ✅ 中文优化

**配置步骤**:
1. 访问 [DashScope 控制台](https://dashscope.console.aliyun.com/apiKey)
2. 登录阿里云账号
3. 创建 API Key
4. 复制 Key (格式: `sk-xxxxxxxx`)
5. 在 AI Demo 中配置

**成本**:
- qwen-plus: ¥0.004/1k tokens
- qwen-turbo: ¥0.002/1k tokens
- 单次提取约 500-1000 tokens (¥0.002-0.004)

### 5.2 腾讯混元云端 API

**优势**:
- ✅ 免费额度 10 万 tokens/月
- ✅ 中文理解能力强
- ⚠️ 需要本地代理 (CORS 限制)

**配置步骤**:
1. 访问 [腾讯云 API 密钥管理](https://console.cloud.tencent.com/cam/capi)
2. 创建密钥对 (SecretId/SecretKey)
3. 启动代理服务器 (见 [使用流程](#42-使用腾讯混元-需代理))
4. 在 AI Demo 中配置密钥

**代理架构**:
```
浏览器 → localhost:3001 (代理) → 腾讯云 API
   ✅         ✅                     ✅
无 CORS     转发请求              官方 API
```

### 5.3 Ollama 本地模型

**优势**:
- ✅ 100% 本地处理，数据不离开设备
- ✅ 完全免费
- ✅ 离线可用
- ⚠️ 需要下载 4.7GB 模型
- ⚠️ 占用 4-6GB 内存

**推荐模型**:
- **qwen2.5:7b** (推荐) - 中文优化，4.7GB
- **gemma2:9b** - 海外优化，5.4GB

**系统要求**:
- RAM: 最低 8GB，推荐 16GB
- 磁盘: 至少 10GB 可用空间
- GPU: 可选 (CUDA/Metal 加速)

---

## 数据模型

### 6.1 ExtractedEventInfo

```typescript
export interface ExtractedEventInfo {
  title: string;                    // 会议标题
  startTime: string;                // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  endTime: string;                  // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  location?: string;                // 地点
  attendees?: Array<{               // 参与人列表
    name: string;
    email?: string;
  }>;
  agenda?: string;                  // 详细议程
  confidence: number;               // 置信度 (0-1)
}
```

**示例**:
```json
{
  "title": "4DNote v1.0 产品评审会",
  "startTime": "2025-11-10T14:00:00+08:00",
  "endTime": "2025-11-10T16:00:00+08:00",
  "location": "北京市朝阳区办公楼 3 楼会议室",
  "attendees": [
    { "name": "张三", "email": null },
    { "name": "李四", "email": null }
  ],
  "agenda": "1. 产品功能演示（30分钟）\n2. 技术架构讨论（40分钟）",
  "confidence": 0.95
}
```

### 6.2 AIConfig (localStorage)

```typescript
// 存储键: 'remarkable-ai-config'
{
  "provider": "dashscope",
  "dashscopeApiKey": "sk-xxxxx",
  "dashscopeModel": "qwen-plus",
  "hunyuanSecretId": null,
  "hunyuanSecretKey": null,
  "ollamaBaseUrl": "http://localhost:11434",
  "currentModel": "qwen"
}
```

### 6.3 APIPreset (localStorage)

```typescript
// 存储键: 'remarkable-ai-presets'
[
  {
    "id": "preset_20251203_001",
    "name": "工作账号 (DashScope)",
    "provider": "dashscope",
    "dashscopeApiKey": "sk-xxxxx",
    "dashscopeModel": "qwen-plus",
    "createdAt": "2025-12-03T10:00:00Z"
  },
  {
    "id": "preset_20251203_002",
    "name": "个人账号 (腾讯混元)",
    "provider": "hunyuan",
    "hunyuanSecretId": "AKIDxxxxx",
    "hunyuanSecretKey": "xxxxx",
    "hunyuanModel": "hunyuan-lite",
    "createdAt": "2025-12-03T11:00:00Z"
  }
]
```

---

## 性能指标

### 7.1 响应时间

| 阶段 | DashScope | 腾讯混元 | Ollama (7B) |
|------|----------|---------|-------------|
| **文档解析** | 0.5-2s | 0.5-2s | 0.5-2s |
| **AI 推理** | 3-5s | 4-6s | 5-15s |
| **总耗时** | 3.5-7s | 4.5-8s | 5.5-17s |

### 7.2 准确率

| 模型 | 准确率 | 中文优化 | 成本 |
|------|--------|---------|------|
| qwen-plus (DashScope) | 95-98% | ✅ | ¥0.004/次 |
| hunyuan-lite (腾讯) | 93-96% | ✅ | ¥0.008/次 |
| qwen2.5:7b (Ollama) | 92-95% | ✅ | 免费 |
| gemma2:9b (Ollama) | 90-93% | ❌ | 免费 |

### 7.3 资源占用

| 指标 | 云端 API | Ollama 本地 |
|------|---------|------------|
| **应用体积** | +0 MB | +0 MB |
| **模型体积** | 0 MB | 4700 MB |
| **内存占用** | <50 MB | 4000-6000 MB |
| **CPU 占用** | 5-10% | 50-80% (推理时) |
| **GPU 占用** | 无 | 可选 (CUDA/Metal) |

---

## 开发进度

### 8.1 已完成功能 (50%)

✅ **核心服务层** (100%)
- AIService.ts - 统一接口
- DashScopeProvider.ts - DashScope API 适配器
- HunyuanProvider.ts - 腾讯混元 API 适配器
- OllamaProvider.ts - Ollama 本地模型适配器
- PDFParserService.ts - PDF 解析
- AIConfig.ts - 配置管理
- prompts.ts - AI 提示词

✅ **UI 组件** (100%)
- AIDemo.tsx - 主页面 (800+ 行)
- AIDemo.css - 样式文件

✅ **配置管理** (100%)
- API Key 输入和持久化
- 服务商切换 (单选框)
- 预设保存/应用/删除
- 配置验证和错误提示

✅ **代理服务器** (100%)
- ai-proxy/ - Express 代理服务
- Electron 集成 (一键启动)
- 实时日志显示
- 健康检查

✅ **应用集成** (100%)
- 路由配置 (App.tsx)
- 侧边栏菜单 (AppLayout.tsx)
- EventHub 创建事件

### 8.2 进行中功能 (0%)

⏸️ **功能增强** (v2.0)
- Before/After 预览模态框
- 批量文档处理
- 多语言支持 (英文/日文)

### 8.3 待开发功能

🔜 **云端扩展** (P2)
- Google AI Studio 支持 (海外用户)
- Azure OpenAI 支持 (企业用户)

🔜 **高级特性** (P2)
- OCR 图片识别
- 语音转文字 (Whisper)
- 智能分类标签推荐

---

## 测试指南

### 9.1 单元测试

**测试文件**: `src/services/ai/__tests__/AIService.test.ts`

```typescript
describe('AIService', () => {
  it('应该选择可用的 Provider', async () => {
    const service = new AIService();
    const result = await service.testAvailability();
    expect(result.available).toBe(true);
  });
  
  it('应该正确提取中文会议信息', async () => {
    const text = '会议主题：产品评审\n时间：2025-11-10 14:00-16:00';
    const result = await service.extractEventFromText(text);
    expect(result.title).toBe('产品评审');
  });
});
```

### 9.2 集成测试

**测试用例 1: 中文会议邀请函**

**输入** (`test_meeting.txt`):
```
会议通知

主题：4DNote v1.0 产品评审会
时间：2025年11月10日 14:00 - 16:00
地点：北京市朝阳区办公楼 3 楼会议室
参会人员：张三、李四、王五

会议议程：
1. 产品功能演示（30分钟）
2. 技术架构讨论（40分钟）
```

**预期输出**:
```json
{
  "title": "4DNote v1.0 产品评审会",
  "startTime": "2025-11-10T14:00:00+08:00",
  "endTime": "2025-11-10T16:00:00+08:00",
  "location": "北京市朝阳区办公楼 3 楼会议室",
  "attendees": [
    { "name": "张三" },
    { "name": "李四" },
    { "name": "王五" }
  ],
  "agenda": "1. 产品功能演示（30分钟）\n2. 技术架构讨论（40分钟）",
  "confidence": 0.95
}
```

**测试用例 2: 英文会议邀请**

**输入**:
```
Meeting Invitation

Subject: Q4 Planning Meeting
Date & Time: November 15, 2025, 10:00 AM - 12:00 PM (GMT+8)
Location: Zoom Meeting Room
Attendees: John Smith, Emily Chen

Agenda:
1. Review Q3 achievements
2. Set Q4 OKRs
```

**预期输出**:
```json
{
  "title": "Q4 Planning Meeting",
  "startTime": "2025-11-15T10:00:00+08:00",
  "endTime": "2025-11-15T12:00:00+08:00",
  "location": "Zoom Meeting Room",
  "attendees": [
    { "name": "John Smith" },
    { "name": "Emily Chen" }
  ],
  "confidence": 0.92
}
```

### 9.3 性能测试

**测试指标**:
- 首次加载: < 15 秒
- 后续调用: < 7 秒
- 内存占用: < 100 MB (云端 API)
- 准确率: > 90%

**测试命令**:
```bash
npm run test:ai
```

---

## 部署方案

### 10.1 开发环境

**启动应用**:
```bash
npm start
```

**启动代理** (如果使用腾讯混元):
```bash
cd ai-proxy
npm start
```

**启动 Ollama** (如果使用本地模型):
```bash
ollama serve
```

### 10.2 生产环境

**Electron 打包**:
```bash
npm run build
npm run electron:build
```

**配置 Electron Builder**:
```json
{
  "build": {
    "appId": "com.remarkable.desktop",
    "productName": "ReMarkable",
    "extraResources": [
      {
        "from": "ai-proxy",
        "to": "ai-proxy",
        "filter": ["**/*", "!node_modules"]
      }
    ]
  }
}
```

**代理服务器自动启动** (`electron/main.js`):
```javascript
let proxyProcess = null;

function startAIProxy() {
  const proxyPath = path.join(process.resourcesPath, 'ai-proxy');
  proxyProcess = spawn('node', ['proxy-server.js'], {
    cwd: proxyPath,
    env: process.env
  });
}

app.on('ready', () => {
  createWindow();
  startAIProxy(); // 自动启动代理
});
```

### 10.3 Web 部署

**前端部署** (Vercel/Netlify):
```bash
npm run build
# 部署 build/ 目录
```

**代理部署** (独立服务器):
```bash
cd ai-proxy
npm install --production
pm2 start proxy-server.js --name hunyuan-proxy
pm2 save
pm2 startup
```

**配置 Nginx 反向代理**:
```nginx
server {
  listen 443 ssl;
  server_name api.remarkable.com;
  
  location /api/hunyuan {
    proxy_pass http://localhost:3001;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

---

## 附录

### A. 相关文档

- **快速启动指南**: `docs/features/AI_DEMO_QUICKSTART.md`
- **云端 API 指南**: `docs/features/AI_CLOUD_API_GUIDE.md`
- **代理快速启动**: `docs/features/AI_PROXY_QUICKSTART.md`
- **完整实现指南**: `docs/features/AI_EVENT_EXTRACTION_GUIDE.md`

### B. 源码位置

```
src/
├── components/
│   └── AIDemo.tsx              # 主页面 (800+ 行)
├── services/
│   └── ai/
│       ├── AIService.ts        # 核心服务
│       ├── AIConfig.ts         # 配置管理
│       ├── AIProvider.interface.ts
│       └── providers/
│           ├── DashScopeProvider.ts
│           ├── HunyuanProvider.ts
│           └── OllamaProvider.ts
├── constants/
│   └── ai/
│       └── prompts.ts          # AI 提示词
└── utils/
    └── proxyHelper.ts          # 代理健康检查

ai-proxy/
├── proxy-server.js             # Express 代理服务
├── package.json
└── README.md
```

### C. 环境变量

```bash
# ai-proxy/.env
HUNYUAN_SECRET_ID=你的SecretId
HUNYUAN_SECRET_KEY=你的SecretKey
PORT=3001
NODE_ENV=production
```

### D. 常见问题

**Q1: 提示 "Cannot find module 'pdfjs-dist'"**
```bash
npm install pdfjs-dist@4.0.379 --legacy-peer-deps
```

**Q2: "❌ 不可用" - fetch failed**
```bash
# 启动 Ollama 服务
ollama serve
```

**Q3: 腾讯混元 "代理未启动"**
- Electron: 点击 "一键启动代理服务器"
- Web: 手动运行 `cd ai-proxy && npm start`

**Q4: AI 提取结果不准确**
- 调整 `src/constants/ai/prompts.ts` 中的 prompt
- 使用更大的模型 (qwen2.5:14b)
- 增加样本数据训练

---

## 版本历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2025-12-03 | Zoey Gong | 初始版本，整合所有文档 |

---

**📧 联系方式**: GitHub Issues  
**📚 更多文档**: `docs/features/` 目录
