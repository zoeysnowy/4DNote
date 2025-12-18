# AI 功能移动端可行性评估

**版本**: v1.0  
**日期**: 2024-12-18  
**负责人**: Zoey Gong  
**状态**: 评估中

---

## 📋 目录

1. [评估概述](#评估概述)
2. [移动端挑战分析](#移动端挑战分析)
3. [三大功能评估](#三大功能评估)
4. [架构调整方案](#架构调整方案)
5. [实施路线图](#实施路线图)

---

## 评估概述

### 评估维度

| 维度 | 权重 | 说明 |
|-----|------|------|
| **技术可行性** | 30% | 能否在移动端实现？需要哪些技术调整？ |
| **用户体验** | 40% | 操作是否流畅？是否符合移动端习惯？ |
| **性能成本** | 20% | 流量消耗、电池消耗、响应速度 |
| **开发成本** | 10% | 开发工作量、维护复杂度 |

### 移动端核心约束

```typescript
const MOBILE_CONSTRAINTS = {
  // 屏幕限制
  screen: {
    size: 'small',           // 6-7 英寸
    orientation: 'vertical', // 竖屏为主
    multiWindow: false       // 不支持多窗口
  },
  
  // 输入限制
  input: {
    keyboard: 'virtual',     // 虚拟键盘占屏幕 40%
    mouse: false,            // 无鼠标悬停
    multiSelect: 'difficult' // 多选操作困难
  },
  
  // 性能限制
  performance: {
    cpu: 'limited',          // CPU 性能受限
    memory: 'limited',       // 内存受限（2-6GB）
    battery: 'critical',     // 电池消耗敏感
    network: 'unstable'      // 网络不稳定
  },
  
  // 平台限制
  platform: {
    fileAccess: 'restricted', // 文件访问受限
    clipboard: 'limited',     // 剪贴板受限
    background: 'suspended'   // 后台受限
  }
};
```

---

## 移动端挑战分析

### 1. 通用技术挑战

#### 1.1 AI API 调用延迟
**问题**：
- 移动网络不稳定（4G/5G 切换、信号弱）
- LLM API 响应时间 2-10s
- 用户对移动端响应速度要求更高（< 3s）

**解决方案**：
```typescript
// 方案 1: 请求优化
const aiRequest = {
  timeout: 5000,               // 5秒超时
  retry: 2,                    // 重试 2 次
  cache: true,                 // 本地缓存
  compression: true,           // 启用压缩
  streamResponse: true         // 流式响应（边生成边显示）
};

// 方案 2: 离线降级
if (isOffline || slowNetwork) {
  return cachedResponse || localLLM || simpleRule;
}

// 方案 3: 后台处理
async function backgroundAITask(input) {
  // 显示"后台处理中"提示
  showNotification('AI 正在处理，完成后通知您');
  
  // 后台调用
  const result = await processInBackground(input);
  
  // 推送通知
  sendPushNotification('AI 处理完成');
}
```

#### 1.2 电池和流量消耗
**问题**：
- AI API 调用消耗流量（每次 10-100KB）
- 图片上传消耗更大（每张 0.5-5MB）
- 持续运行耗电

**解决方案**：
```typescript
// 流量优化
const trafficOptimization = {
  // 1. WiFi 优先
  wifiOnly: true,              // 仅 WiFi 下自动处理
  
  // 2. 图片压缩
  imageCompression: {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 0.8,              // 80% 质量
    format: 'webp'             // WebP 格式（更小）
  },
  
  // 3. 批处理
  batchSize: 5,                // 批量处理 5 个任务
  batchInterval: 300000,       // 5 分钟合并一次
  
  // 4. 增量同步
  deltaSync: true,             // 只同步变更部分
  
  // 5. 用户确认
  confirmBeforeLargeRequest: true  // 超过 1MB 询问用户
};
```

#### 1.3 本地存储限制
**问题**：
- 向量数据库大（1000 条笔记 ≈ 50MB）
- 缓存数据积累（AI 响应、图片）
- 手机存储空间有限

**解决方案**：
```typescript
const storageStrategy = {
  // 1. 云端为主，本地缓存为辅
  syncMode: 'cloud-first',
  
  // 2. 最近访问优先
  localCache: {
    maxSize: 100,              // 只缓存最近 100 条
    ttl: 7 * 24 * 3600,        // 7 天过期
    evictionPolicy: 'LRU'      // 最少使用淘汰
  },
  
  // 3. 向量数据延迟加载
  vectorDB: {
    mode: 'remote',            // 向量搜索走服务端
    localIndex: false          // 不在本地建索引
  },
  
  // 4. 定期清理
  cleanup: {
    autoClean: true,
    interval: 'weekly',
    keepRecent: 30             // 保留最近 30 天
  }
};
```

### 2. 交互体验挑战

#### 2.1 键盘输入困难
**问题**：
- 虚拟键盘占屏幕 40%
- 输入长文本困难
- 无法快捷键操作

**解决方案**：
```typescript
// 方案 1: 语音优先
const inputMethods = {
  primary: 'voice',            // 主输入方式：语音
  secondary: 'text',           // 次要：文本
  fallback: 'template'         // 降级：模板选择
};

// 方案 2: 快捷短语
const quickPhrases = [
  '总结一下',
  '提取任务',
  '生成待办',
  '分析数据'
];

// 方案 3: 上下文菜单
// 长按 → 弹出菜单 → 选择操作
```

#### 2.2 多窗口/多选操作困难
**问题**：
- 无法同时查看笔记和 AI 回答
- 无法批量选择多个项目
- 拖拽操作不便

**解决方案**：
```typescript
// 方案 1: 抽屉式 AI 面板
const aiPanel = {
  position: 'bottom',          // 底部抽屉
  mode: 'overlay',             // 覆盖模式
  swipeable: true,             // 可滑动
  snapPoints: [0.3, 0.6, 0.9]  // 三档高度
};

// 方案 2: 简化批量操作
// 批量操作 → 智能选择 → AI 自动判断范围

// 方案 3: 悬浮按钮
// AI 助手悬浮球 → 一键触发
```

#### 2.3 富文本编辑困难
**问题**：
- 移动端富文本编辑器性能差
- 格式化操作复杂
- Markdown 编辑不便

**解决方案**：
```typescript
// 方案 1: AI 辅助格式化
'用户输入纯文本 → AI 自动格式化 → 生成富文本';

// 方案 2: 简化编辑器
const mobileEditor = {
  features: [
    'bold', 'italic',          // 只保留基础格式
    'list', 'link',
    'image'
  ],
  autoFormat: true,            // AI 自动格式化
  voiceInput: true             // 语音输入
};

// 方案 3: 模板化
// 提供常用模板，填空即可
```

---

## 三大功能评估

### 1. AI ChatFlow - 内联对话

#### ✅ 可行性评分：9/10（极高）

**移动端优势**：
- ✅ 对话是移动端天然场景（类似微信）
- ✅ 流式响应适合移动端（逐字显示）
- ✅ 语音输入比桌面端更方便
- ✅ 单一焦点，不需要多窗口

**技术挑战**：
| 挑战 | 影响 | 解决方案 | 工作量 |
|-----|------|---------|--------|
| 键盘占屏 | 中 | 抽屉式 AI 面板 | 低 |
| Toggle 节点展开 | 低 | 原生支持 | 无 |
| 历史对话加载 | 中 | 懒加载 + 虚拟列表 | 中 |
| 离线使用 | 高 | 缓存最近对话 | 中 |

**移动端适配方案**：

```typescript
// ChatFlow 移动端配置
const mobileChatFlow = {
  // 1. UI 调整
  ui: {
    layout: 'drawer',                // 抽屉式布局
    inputPosition: 'bottom',         // 输入框底部固定
    aiPanelHeight: '60vh',           // AI 面板占 60%
    collapsible: true,               // 可收起
    gestures: {
      swipeDown: 'collapse',         // 下滑收起
      swipeUp: 'expand'              // 上滑展开
    }
  },
  
  // 2. 输入优化
  input: {
    primary: 'voice',                // 主输入：语音
    showKeyboard: 'onTap',           // 点击显示键盘
    quickReplies: [                  // 快捷回复
      '总结一下',
      '继续',
      '换个说法',
      '更详细'
    ]
  },
  
  // 3. 响应优化
  response: {
    streaming: true,                 // 必须流式
    chunkDelay: 30,                  // 30ms 显示一块
    showTypingIndicator: true,       // 显示输入中动画
    maxLength: 500,                  // 限制 500 字
    autoCollapse: true               // 自动折叠历史对话
  },
  
  // 4. 性能优化
  performance: {
    virtualScroll: true,             // 虚拟滚动
    lazyLoadHistory: true,           // 懒加载历史
    cacheSize: 20,                   // 缓存 20 条对话
    backgroundFetch: false           // 禁用后台获取
  }
};
```

**需要阉割的功能**：
- ❌ 多模型并行对比（一次只能选一个模型）
- ❌ 复杂的 Markdown 编辑（简化为纯文本 + 基础格式）
- ⚠️ 长文本总结（限制 500 字，超出需要确认）

**推荐优先级**：⭐⭐⭐⭐⭐ **最优先**

---

### 2. AI TaskManager - 任务管理

#### ✅ 可行性评分：7.5/10（高）

**移动端优势**：
- ✅ 任务管理是移动端刚需（随时随地添加）
- ✅ 拍照提取任务非常适合移动端
- ✅ 语音输入"提醒我..."很自然
- ✅ 推送通知是移动端强项

**技术挑战**：
| 挑战 | 影响 | 解决方案 | 工作量 |
|-----|------|---------|--------|
| 图片识别延迟 | 高 | 后台处理 + 推送 | 中 |
| 批量任务编辑 | 中 | 简化为单任务 | 低 |
| 多窗口操作 | 中 | 单窗口 + 抽屉面板 | 低 |
| 富文本编辑 | 中 | 简化编辑器 | 中 |
| 拖拽排序 | 中 | 改为按钮操作 | 低 |

**移动端适配方案**：

```typescript
const mobileTaskManager = {
  // 1. 输入简化
  taskInput: {
    methods: {
      voice: {
        enabled: true,
        examples: [
          '提醒我明天下午3点开会',
          '添加任务：买菜',
          '截止本周五的报告'
        ]
      },
      camera: {
        enabled: true,
        modes: ['poster', 'whiteboard', 'document'],
        processing: 'background'  // 后台处理
      },
      text: {
        enabled: true,
        placeholder: '输入或粘贴任务...',
        quickAdd: true            // 快捷添加
      }
    }
  },
  
  // 2. 视图简化
  views: {
    // 主视图：列表
    list: {
      groupBy: ['today', 'upcoming', 'someday'],
      sortBy: 'priority',
      filters: ['all', 'active', 'completed']
    },
    
    // 次要视图：日历集成
    calendar: {
      mode: 'agenda',            // 议程模式
      range: 'week',             // 只显示一周
      integration: 'TimeCalendar' // 复用现有 TimeCalendar
    }
  },
  
  // 3. AI 功能调整
  ai: {
    extraction: {
      maxImageSize: 2,           // 2MB
      timeout: 10000,            // 10秒
      mode: 'background',        // 后台处理
      notification: true         // 完成后推送
    },
    
    smartSuggestions: {
      enabled: true,
      triggers: [
        'afterAdd',              // 添加后建议分类
        'beforeDue',             // 临期提醒
        'onIdle'                 // 闲时建议规划
      ]
    },
    
    autoOrganize: {
      enabled: false,            // 禁用自动整理（耗电）
      manualTrigger: true        // 手动触发
    }
  },
  
  // 4. 性能优化
  performance: {
    pagination: 50,              // 分页加载
    imageCompress: true,         // 图片压缩
    ocrCache: true,              // OCR 结果缓存
    syncInterval: 300000         // 5 分钟同步
  }
};
```

**需要阉割的功能**：
- ❌ **复杂依赖关系图**（如果未来添加，改为简单的"前置任务"单选）
- ❌ **批量编辑**（改为单任务编辑 + AI 智能批量）
- ❌ **拖拽排序**（改为长按菜单 → 上移/下移）
- ❌ **桌面端特有的多窗口对比**（移动端单窗口聚焦）
- ⚠️ **自动时间规划**（改为手动触发，避免耗电）
- ⚠️ **实时 OCR**（改为后台处理 + 推送）

**架构调整**：
```typescript
// 移动端专用 TaskManager 服务
class MobileTaskManagerService {
  // 1. 后台任务队列
  private backgroundQueue = new Queue({
    concurrency: 1,              // 一次处理一个
    timeout: 30000,              // 30秒超时
    retry: 2
  });
  
  // 2. 智能批处理
  async addTasksInBatch(tasks: Task[]) {
    // WiFi 下立即处理
    if (isWiFi) {
      return await this.processImmediately(tasks);
    }
    
    // 移动网络下批量队列
    this.backgroundQueue.add(tasks);
    showNotification('任务已加入队列，WiFi 下自动处理');
  }
  
  // 3. OCR 降级策略
  async extractTaskFromImage(image: File) {
    // 检查网络
    if (isOffline) {
      return this.localOCR(image);  // 本地 OCR（质量差但快）
    }
    
    // 后台云端 OCR
    const jobId = await this.cloudOCR(image);
    
    // 推送通知
    this.onComplete(jobId, () => {
      sendPushNotification('任务识别完成');
    });
  }
}
```

**推荐优先级**：⭐⭐⭐⭐ **次优先**

---

### 3. AI NotesManager - 笔记管理

#### ⚠️ 可行性评分：6/10（中等）

**移动端优势**：
- ✅ 语音笔记非常适合移动端
- ✅ 拍照记录是移动端强项
- ✅ 随时随地记录灵感

**技术挑战**：
| 挑战 | 影响 | 解决方案 | 工作量 |
|-----|------|---------|--------|
| 富文本编辑 | 高 | 简化编辑器 + AI 格式化 | 高 |
| 向量检索 | 高 | 服务端检索 | 中 |
| 知识图谱展示 | 极高 | 移除或简化 | 高 |
| 多模态搜索 | 高 | 限制功能 | 中 |
| 长文本处理 | 高 | 分页 + 摘要 | 中 |
| 会议纪要 | 高 | 后台处理 | 高 |

**移动端适配方案**：

```typescript
const mobileNotesManager = {
  // 1. 输入方式
  input: {
    quick: {
      voice: true,               // 语音笔记（主要）
      camera: true,              // 拍照笔记
      text: true                 // 文字笔记（次要）
    },
    
    advanced: {
      meetingRecord: 'background', // 会议录音（后台）
      fileImport: 'wifi-only',     // 文件导入（WiFi）
      webClip: 'simplified'        // 网页剪藏（简化版）
    }
  },
  
  // 2. 编辑器简化
  editor: {
    type: 'simple-markdown',     // 简化 Markdown
    features: [
      'heading', 'bold', 'italic',
      'list', 'checkbox',
      'link', 'image'
    ],
    
    // AI 辅助
    aiAssist: {
      autoFormat: true,          // 自动格式化
      smartPaste: true,          // 智能粘贴
      voiceToText: true          // 语音转文字
    },
    
    // 禁用功能
    disabled: [
      'table',                   // 表格（编辑困难）
      'code-block',              // 代码块（屏幕小）
      'embed',                   // 嵌入（性能差）
      'diagram'                  // 图表（复杂）
    ]
  },
  
  // 3. 搜索简化
  search: {
    mode: 'cloud',               // 云端搜索
    
    types: {
      text: true,                // 文本搜索
      semantic: true,            // 语义搜索
      image: false,              // 图片搜索（禁用）
      audio: false               // 音频搜索（禁用）
    },
    
    display: {
      maxResults: 20,            // 最多 20 条
      preview: 'summary',        // 只显示摘要
      highlight: true            // 高亮关键词
    }
  },
  
  // 4. 知识图谱
  knowledgeGraph: {
    enabled: false,              // 禁用可视化图谱
    
    alternative: {
      // 改为简单的"相关笔记"列表
      relatedNotes: {
        mode: 'ai-recommend',
        maxCount: 5,
        display: 'list'          // 列表展示
      }
    }
  },
  
  // 5. 性能优化
  performance: {
    // 笔记列表
    list: {
      pagination: 30,            // 30 条分页
      virtualScroll: true,
      thumbnailSize: 'small',    // 小缩略图
      preloadNext: true
    },
    
    // 笔记详情
    detail: {
      lazyLoad: true,            // 懒加载图片
      imageCompress: true,       // 压缩图片
      maxImageWidth: 800,
      cacheStrategy: 'aggressive'
    },
    
    // AI 功能
    ai: {
      summaryCache: true,        // 缓存摘要
      tagCache: true,            // 缓存标签
      ocrCache: true,            // 缓存 OCR
      ttl: 7 * 24 * 3600
    }
  }
};
```

**需要阉割的功能**：
- ❌ **知识图谱可视化**（改为"相关笔记"列表）
- ❌ **多模态搜索**（只保留文本 + 语义，移除图片/音频）
- ❌ **富文本编辑器**（简化为基础 Markdown）
- ❌ **表格编辑**（只支持查看，编辑需要桌面端）
- ❌ **实时会议纪要**（改为录音后台处理）
- ❌ **文件导入**（限制为 WiFi + 后台）
- ⚠️ **OCR 识别**（限制图片大小，后台处理）
- ⚠️ **自动分类**（改为手动触发）

**架构调整**：
```typescript
// 移动端专用 NotesManager 架构
class MobileNotesManagerService {
  // 1. 云端向量检索
  async semanticSearch(query: string) {
    // 移动端不建本地向量索引
    return await this.apiClient.post('/api/search/semantic', {
      query,
      limit: 20,
      userId: this.userId
    });
  }
  
  // 2. 渐进式加载
  async loadNote(noteId: string) {
    // 先加载文本
    const text = await this.loadTextContent(noteId);
    this.render(text);
    
    // 后台加载图片
    this.loadImagesInBackground(noteId);
  }
  
  // 3. 智能缓存
  private cache = new LRUCache({
    max: 100,                  // 缓存 100 条笔记
    ttl: 7 * 24 * 3600 * 1000,
    updateAgeOnGet: true
  });
  
  // 4. 后台同步
  async syncInBackground() {
    if (!isWiFi) return;
    
    const queue = await this.getPendingSync();
    
    for (const item of queue) {
      await this.syncItem(item);
    }
  }
}
```

**推荐优先级**：⭐⭐⭐ **低优先**（建议先做 ChatFlow 和 TaskManager）

---

## 架构调整方案

### 1. 总体架构：云端优先

```
┌─────────────────────────────────────────┐
│          Mobile App (React Native)      │
├─────────────────────────────────────────┤
│  UI Layer                               │
│  - 简化交互组件                          │
│  - 原生手势                              │
│  - 离线 UI                               │
├─────────────────────────────────────────┤
│  Business Layer                         │
│  - Lightweight Logic                    │
│  - Cache Manager                        │
│  - Background Queue                     │
├─────────────────────────────────────────┤
│  Network Layer                          │
│  - API Client (重试 + 超时)             │
│  - Request Queue                        │
│  - Traffic Monitor                      │
└─────────────────────────────────────────┘
                 ↕ HTTPS
┌─────────────────────────────────────────┐
│          Cloud Backend                  │
├─────────────────────────────────────────┤
│  API Gateway                            │
│  - Rate Limiting                        │
│  - Authentication                       │
│  - Response Compression                 │
├─────────────────────────────────────────┤
│  AI Services (重点在这里)               │
│  - LLM API (GPT-4/Claude/Gemini)       │
│  - Vector Search (Supabase/Pinecone)   │
│  - OCR (Google Vision/Tesseract)       │
│  - ASR (Whisper/腾讯云)                 │
│  - Reranking (Jina AI)                 │
├─────────────────────────────────────────┤
│  Data Layer                             │
│  - PostgreSQL (结构化数据)              │
│  - Vector DB (笔记向量)                 │
│  - Object Storage (图片/音频)           │
│  - Redis (缓存 + 队列)                  │
└─────────────────────────────────────────┘
```

### 2. 关键设计原则

#### 2.1 计算在云端，数据在本地
```typescript
const architecture = {
  // ✅ 云端负责
  cloud: [
    'AI 推理（LLM）',
    '向量检索',
    'OCR 识别',
    '语音转写',
    '复杂计算'
  ],
  
  // ✅ 本地负责
  local: [
    '数据缓存',
    'UI 渲染',
    '手势交互',
    '离线查看',
    '队列管理'
  ]
};
```

#### 2.2 后台处理 + 推送通知
```typescript
// 耗时操作全部后台化
async function handleExpensiveTask(task) {
  // 1. 立即返回，显示"处理中"
  showProcessing(task.id);
  
  // 2. 加入后台队列
  backgroundQueue.add(task);
  
  // 3. 完成后推送通知
  onTaskComplete(task.id, () => {
    sendPushNotification({
      title: '任务完成',
      body: task.summary
    });
  });
}

// 适用场景
const backgroundTasks = [
  'OCR 图片识别',
  '会议录音转写',
  '大文件上传',
  '批量任务处理',
  '知识图谱构建'
];
```

#### 2.3 WiFi 优先策略
```typescript
// 流量敏感操作在 WiFi 下进行
const wifiOnlyOperations = {
  // 大文件上传
  fileUpload: {
    autoUpload: 'wifi-only',
    mobileConfirm: true        // 移动网络需确认
  },
  
  // 批量同步
  batchSync: {
    trigger: 'wifi-connected',
    interval: 300000           // 5 分钟检查一次
  },
  
  // 向量索引更新
  vectorIndexUpdate: {
    mode: 'wifi-only',
    queue: true                // WiFi 下自动处理队列
  }
};
```

#### 2.4 渐进式降级
```typescript
// 根据网络状况自动降级
function getServiceLevel() {
  if (isOffline) {
    return {
      ai: 'cached',            // 使用缓存响应
      search: 'local',         // 本地搜索
      sync: 'disabled'
    };
  }
  
  if (is2G || isSlow) {
    return {
      ai: 'limited',           // 限制请求
      search: 'text-only',     // 只文本搜索
      sync: 'manual'           // 手动同步
    };
  }
  
  if (is4G) {
    return {
      ai: 'standard',
      search: 'hybrid',
      sync: 'auto'
    };
  }
  
  if (is5G || isWiFi) {
    return {
      ai: 'full',              // 全功能
      search: 'full',
      sync: 'realtime'
    };
  }
}
```

### 3. 新增服务：AI Gateway

为移动端专门设计一个 AI Gateway 服务：

```typescript
// AI Gateway 职责
class AIGateway {
  // 1. 请求合并（减少网络请求）
  async batchRequest(requests: AIRequest[]) {
    // 将多个小请求合并成一个大请求
    const merged = this.mergeRequests(requests);
    const response = await this.callAI(merged);
    return this.splitResponse(response);
  }
  
  // 2. 智能缓存
  async cachedRequest(request: AIRequest) {
    const cacheKey = this.generateCacheKey(request);
    
    // 检查缓存
    const cached = await this.cache.get(cacheKey);
    if (cached && !this.isStale(cached)) {
      return cached;
    }
    
    // 调用 AI
    const response = await this.callAI(request);
    
    // 缓存结果
    await this.cache.set(cacheKey, response, {
      ttl: this.getTTL(request.type)
    });
    
    return response;
  }
  
  // 3. 流量优化
  async optimizeRequest(request: AIRequest) {
    // 压缩请求
    request.content = this.compress(request.content);
    
    // 限制长度
    if (request.content.length > MAX_LENGTH) {
      request.content = this.truncate(request.content);
    }
    
    // 移除图片（如果移动网络）
    if (isMobileNetwork && request.images) {
      request.images = this.compressImages(request.images);
    }
    
    return request;
  }
  
  // 4. 降级策略
  async requestWithFallback(request: AIRequest) {
    try {
      // 尝试主模型
      return await this.callPrimaryModel(request);
    } catch (error) {
      if (error.code === 'TIMEOUT' || error.code === 'RATE_LIMIT') {
        // 降级到备用模型
        return await this.callFallbackModel(request);
      }
      
      if (error.code === 'NETWORK_ERROR') {
        // 返回缓存
        return await this.getCachedResponse(request);
      }
      
      throw error;
    }
  }
}
```

### 4. 数据同步策略

```typescript
const syncStrategy = {
  // 1. 增量同步（减少流量）
  delta: {
    enabled: true,
    fields: ['updatedAt', 'version'],
    compression: true
  },
  
  // 2. 冲突解决
  conflict: {
    strategy: 'server-wins',   // 移动端性能有限，服务端优先
    backup: true               // 本地变更备份
  },
  
  // 3. 优先级队列
  priority: {
    high: ['taskUpdate', 'noteCreate'],    // 立即同步
    medium: ['taskCreate', 'noteUpdate'],  // WiFi 同步
    low: ['analytics', 'cache']            // 批量同步
  },
  
  // 4. 智能调度
  schedule: {
    immediate: ['userAction'],             // 用户操作后立即
    periodic: ['backgroundSync'],          // 定期（5 分钟）
    onWiFi: ['batchUpload'],              // WiFi 触发
    onIdle: ['indexUpdate']                // 空闲时
  }
};
```

---

## 实施路线图

### Phase 1: 基础设施（2-3 周）

**目标**：搭建移动端 AI 基础架构

```typescript
const phase1 = {
  backend: [
    '✅ AI Gateway 服务',
    '✅ 请求队列系统',
    '✅ 缓存层',
    '✅ 推送通知服务'
  ],
  
  frontend: [
    '✅ React Native 项目初始化',
    '✅ API Client（重试 + 超时）',
    '✅ 本地存储（SQLite + AsyncStorage）',
    '✅ 后台任务管理'
  ],
  
  testing: [
    '✅ 弱网测试',
    '✅ 流量监控',
    '✅ 性能基准'
  ]
};
```

### Phase 2: ChatFlow 移动端（3-4 周）

**目标**：最高优先级功能上线

```typescript
const phase2 = {
  week1: [
    '✅ 抽屉式 AI 面板 UI',
    '✅ 语音输入集成',
    '✅ 流式响应显示'
  ],
  
  week2: [
    '✅ Toggle 节点适配',
    '✅ 快捷短语',
    '✅ 历史对话懒加载'
  ],
  
  week3: [
    '✅ 离线缓存',
    '✅ 推送通知',
    '✅ WiFi 优先策略'
  ],
  
  week4: [
    '✅ 性能优化',
    '✅ 用户测试',
    '✅ Bug 修复'
  ]
};
```

### Phase 3: TaskManager 移动端（4-5 周）

**目标**：核心任务管理功能

```typescript
const phase3 = {
  week1: [
    '✅ 任务列表 UI',
    '✅ 快捷添加（语音/文本）',
    '✅ 日历视图'
  ],
  
  week2: [
    '✅ 拍照识别任务',
    '✅ 后台 OCR 处理',
    '✅ 推送通知'
  ],
  
  week3: [
    '✅ AI 智能建议',
    '✅ 任务分类',
    '✅ 优先级算法'
  ],
  
  week4: [
    '✅ 批量操作简化',
    '✅ 性能优化',
    '✅ 用户测试'
  ],
  
  week5: [
    '✅ Bug 修复',
    '✅ 文档完善',
    '✅ 上线准备'
  ]
};
```

### Phase 4: NotesManager 移动端（待定）

**建议**：观察用户反馈后再决定是否开发

```typescript
const phase4 = {
  priority: 'low',
  reason: [
    '移动端笔记编辑体验差',
    '用户可能更倾向桌面端记录笔记',
    'ChatFlow + TaskManager 已覆盖核心场景'
  ],
  
  alternative: [
    '只做简化版（语音笔记 + 查看）',
    '聚焦快速记录，详细编辑引导到桌面端'
  ]
};
```

---

## 总结与建议

### ✅ 可行性总结

| 功能 | 移动端评分 | 推荐优先级 | 关键挑战 | 开发周期 |
|-----|-----------|-----------|---------|---------|
| **ChatFlow** | 9/10 | ⭐⭐⭐⭐⭐ | 键盘占屏 | 3-4 周 |
| **TaskManager** | 7.5/10 | ⭐⭐⭐⭐ | 图片识别延迟 | 4-5 周 |
| **NotesManager** | 6/10 | ⭐⭐⭐ | 富文本编辑 | 6-8 周 |

### 🎯 核心建议

1. **先做 ChatFlow**
   - 移动端适配最简单
   - 用户价值最直接
   - 技术风险最低

2. **再做 TaskManager**
   - 任务管理是移动端刚需
   - 拍照识别是差异化亮点
   - 推送通知增强粘性

3. **暂缓 NotesManager**
   - 移动端编辑体验差
   - 可先做简化版（查看 + 语音记录）
   - 观察用户反馈再决定

### 🏗️ 架构关键调整

1. **云端优先**：重计算放云端，轻数据在本地
2. **后台处理**：耗时操作全部异步 + 推送
3. **WiFi 策略**：大流量操作自动延迟到 WiFi
4. **渐进降级**：根据网络自动调整功能

### ⚠️ 必须阉割的功能

| 功能 | 原因 | 替代方案 |
|-----|------|---------|
| 知识图谱可视化 | 屏幕小 + 交互复杂 | 相关笔记列表 |
| 多窗口并行操作 | 移动端单窗口限制 | 抽屉面板 + 快速切换 |
| 桌面端复杂表格 | 编辑困难 | 只读查看，引导到桌面端编辑 |
| 富文本编辑 | 性能差 + 格式化困难 | 简化 Markdown + AI 格式化 |
| 多模型并行 | 流量 + 性能消耗 | 单模型选择 |
| 实时会议纪要 | 电池消耗 | 录音后台处理 |

### 💡 差异化亮点

移动端可以做得比桌面端更好的地方：

1. **语音优先**：语音输入比桌面端更自然
2. **拍照识别**：随时随地拍照提取任务
3. **推送通知**：任务提醒、AI 处理完成通知
4. **地理位置**：基于位置的任务提醒（如"到公司后..."）
5. **快捷输入**：Siri 快捷指令、Widget

---

**总结**：移动端 AI 功能完全可行！关键是**云端计算 + 本地缓存 + 后台处理**，聚焦核心场景，简化复杂功能。预计 **7-9 周**完成 ChatFlow + TaskManager，即可满足移动端核心需求。🚀
