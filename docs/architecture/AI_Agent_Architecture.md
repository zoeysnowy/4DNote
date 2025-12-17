# AI Agent Architecture - 4DNote AI 智能体架构设计

**版本**: v1.0  
**日期**: 2024-12-16  
**负责人**: Zoey Gong  
**状态**: 设计中

---

## 📋 目录

1. [架构概览](#架构概览)
2. [核心概念](#核心概念)
3. [技术选型](#技术选型)
4. [系统架构](#系统架构)
5. [工作流引擎](#工作流引擎)
6. [Agent 设计](#agent-设计)
7. [数据流设计](#数据流设计)
8. [部署方案](#部署方案)
9. [监控与优化](#监控与优化)
10. [迁移路线](#迁移路线)

---

## 架构概览

### 设计原则

1. **模块化**：每个 AI 功能独立封装，可插拔
2. **可组合**：通过工作流编排实现复杂逻辑
3. **可观测**：全链路日志、监控、追踪
4. **可优化**：基于反馈持续优化 Prompt 和工作流
5. **渐进式**：从简单到复杂，逐步迁移

### 架构分层

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface                        │
│           (React Components + AI Assistants)             │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│                  Agent Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐│
│  │ Task     │  │ Note     │  │ Search   │  │ Meeting ││
│  │ Agent    │  │ Agent    │  │ Agent    │  │ Agent   ││
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘│
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│              Workflow Orchestration                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │         LangGraph Workflow Engine                 │  │
│  │  • State Management  • Conditional Routing        │  │
│  │  • Error Handling    • Retry Logic                │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│                  Tool Layer                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐     │
│  │  OCR    │ │ QR Code │ │  ASR    │ │ Embedding│     │
│  │ Service │ │ Service │ │ Service │ │ Service  │     │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐     │
│  │  LLM    │ │ Vector  │ │  NER    │ │ Calendar │     │
│  │ Service │ │   DB    │ │ Service │ │ Service  │     │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘     │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│                 Data Layer                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ IndexedDB│  │ ChromaDB │  │ LocalKV  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## 核心概念

### Agent（智能体）

```typescript
/**
 * Agent 是一个具有特定能力和职责的自治实体
 * 可以感知环境、做出决策、执行行动
 */
interface Agent {
  name: string;
  description: string;
  capabilities: Capability[];     // 能力列表
  tools: Tool[];                  // 可用工具
  memory: Memory;                 // 记忆/上下文
  planningStrategy: Strategy;     // 规划策略
  
  // 核心方法
  perceive(input: any): Observation;       // 感知
  plan(observation: Observation): Plan;    // 规划
  act(plan: Plan): Action[];               // 行动
  reflect(result: Result): Insight;        // 反思
}
```

### Workflow（工作流）

```typescript
/**
 * Workflow 定义了完成特定任务的步骤序列
 * 可以包含条件分支、循环、并行执行
 */
interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  
  // 工作流定义
  nodes: WorkflowNode[];          // 节点
  edges: WorkflowEdge[];          // 连接
  entryPoint: string;             // 入口节点
  
  // 执行配置
  config: {
    timeout?: number;
    retryPolicy?: RetryPolicy;
    errorHandling?: ErrorHandler;
  };
  
  // 元数据
  metadata: {
    author: string;
    createdAt: Date;
    tags: string[];
    performance: PerformanceMetrics;
  };
}
```

### Tool（工具）

```typescript
/**
 * Tool 是 Agent 可以调用的具体功能
 * 输入 → 处理 → 输出
 */
interface Tool {
  name: string;
  description: string;
  
  // Schema 定义
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  
  // 执行函数
  execute(input: any): Promise<any>;
  
  // 可选配置
  config?: {
    timeout?: number;
    cache?: CacheConfig;
    rateLimit?: RateLimitConfig;
  };
}
```

### Memory（记忆）

```typescript
/**
 * Memory 存储 Agent 的上下文和历史
 */
interface Memory {
  // 短期记忆（当前会话）
  shortTerm: {
    conversationHistory: Message[];
    currentContext: Context;
    workingMemory: Map<string, any>;
  };
  
  // 长期记忆（持久化）
  longTerm: {
    facts: Fact[];                // 事实知识
    experiences: Experience[];     // 经验
    preferences: Preference[];     // 偏好
    patterns: Pattern[];          // 模式
  };
  
  // 向量记忆（语义检索）
  vectorStore: VectorStore;
}
```

---

## 技术选型

### 核心框架：LangChain + LangGraph

#### 为什么选择 LangChain？

1. **成熟生态**：丰富的集成和工具
2. **灵活抽象**：LLM、Embedding、VectorStore 统一接口
3. **活跃社区**：持续更新和优化
4. **TypeScript 支持**：原生 TS，类型安全
5. **生产就绪**：错误处理、重试、缓存等

#### 为什么选择 LangGraph？

1. **状态管理**：内置状态机，管理复杂流程
2. **条件路由**：基于状态动态决定下一步
3. **并行执行**：支持多任务并发
4. **循环控制**：支持迭代和递归
5. **可视化**：自动生成工作流图

### 技术栈对比

| 能力 | LangChain + LangGraph | Semantic Kernel | AutoGPT |
|-----|----------------------|-----------------|---------|
| 工作流编排 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 状态管理 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| TypeScript 支持 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| 学习曲线 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 社区生态 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 生产成熟度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |

### 依赖包选择

```json
{
  "dependencies": {
    // LangChain 核心
    "langchain": "^0.1.0",
    "@langchain/core": "^0.1.0",
    "@langchain/community": "^0.0.20",
    
    // LangGraph 工作流
    "@langchain/langgraph": "^0.0.10",
    
    // LLM 提供商
    "@langchain/openai": "^0.0.14",      // OpenAI (备用)
    "@langchain/anthropic": "^0.0.3",    // Claude (备用)
    
    // 向量数据库
    "chromadb": "^1.7.0",
    "hnswlib-node": "^2.0.0",            // 本地向量检索
    
    // Embedding
    "@tensorflow/tfjs": "^4.15.0",       // 本地 embedding
    "@xenova/transformers": "^2.9.0",    // Transformers.js
    
    // 工具服务
    "pdf-parse": "^1.1.1",               // PDF 解析
    "mammoth": "^1.6.0",                 // Word 解析
    "node-html-parser": "^6.1.11",       // HTML 解析
    "qrcode-reader": "^1.0.4",           // 二维码
    
    // 基础设施
    "zod": "^3.22.4",                    // Schema 验证
    "p-queue": "^7.4.1",                 // 任务队列
    "p-retry": "^5.1.2",                 // 重试逻辑
    "cache-manager": "^5.2.4"            // 缓存管理
  }
}
```

---

## 系统架构

### 整体架构图

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│                                                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │ Task UI    │  │ Notes UI   │  │ Search UI  │         │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘         │
│        │                │                │                 │
│        └────────────────┼────────────────┘                │
│                         │                                  │
└─────────────────────────┼──────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│                   Agent Orchestrator                        │
│                                                             │
│  ┌───────────────────────────────────────────────────┐    │
│  │          Agent Registry & Router                   │    │
│  │  • Agent Discovery  • Agent Lifecycle              │    │
│  │  • Load Balancing   • Health Check                 │    │
│  └───────────────────────────────────────────────────┘    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Task     │  │ Notes    │  │ Search   │  │ Meeting  │ │
│  │ Agent    │  │ Agent    │  │ Agent    │  │ Agent    │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                  LangGraph Workflow Layer                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Workflow Repository                         │  │
│  │  • EventExtraction.workflow.ts                        │  │
│  │  • TaskGeneration.workflow.ts                         │  │
│  │  • MeetingMinutes.workflow.ts                         │  │
│  │  • NoteEnhancement.workflow.ts                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Workflow Engine (LangGraph)                 │  │
│  │  • Graph Compilation   • State Management             │  │
│  │  • Conditional Edges   • Parallel Execution           │  │
│  │  • Error Recovery      • Checkpointing                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────┬────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────┐
│                      Tool Layer                               │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  Tool Registry                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ OCR     │ │ QRCode  │ │  ASR    │ │  NER    │           │
│  │ Tool    │ │  Tool   │ │  Tool   │ │  Tool   │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Hunyuan │ │ Vector  │ │Calendar │ │ Event   │           │
│  │   LLM   │ │ Search  │ │ Service │ │ Service │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                               │
└─────────────────────────┬─────────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────────┐
│                    Service Layer                               │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │   LLM    │  │ Embedding│  │  Vector  │  │  Cache   │     │
│  │ Provider │  │ Provider │  │   Store  │  │  Layer   │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│                                                                │
└─────────────────────────┬──────────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────────┐
│                     Data Layer                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │IndexedDB │  │ ChromaDB │  │  LocalKV │  │ FileStore│      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### 目录结构

```
src/
├── ai/
│   ├── agents/                          # Agent 定义
│   │   ├── TaskAgent.ts                 # 任务 Agent
│   │   ├── NotesAgent.ts                # 笔记 Agent
│   │   ├── SearchAgent.ts               # 搜索 Agent
│   │   ├── MeetingAgent.ts              # 会议 Agent
│   │   └── base/
│   │       ├── Agent.ts                 # Agent 基类
│   │       ├── Memory.ts                # 记忆管理
│   │       └── Planner.ts               # 规划器
│   │
│   ├── workflows/                       # 工作流定义
│   │   ├── EventExtraction.workflow.ts  # 事件提取
│   │   ├── TaskGeneration.workflow.ts   # 任务生成
│   │   ├── MeetingMinutes.workflow.ts   # 会议纪要
│   │   ├── NoteEnhancement.workflow.ts  # 笔记增强
│   │   ├── ImageProcessing.workflow.ts  # 图片处理
│   │   └── base/
│   │       ├── WorkflowBuilder.ts       # 工作流构建器
│   │       ├── WorkflowExecutor.ts      # 执行器
│   │       └── WorkflowState.ts         # 状态定义
│   │
│   ├── tools/                           # 工具集合
│   │   ├── ocr/
│   │   │   ├── TencentOCR.ts
│   │   │   └── OCRTool.ts
│   │   ├── qrcode/
│   │   │   └── QRCodeTool.ts
│   │   ├── asr/
│   │   │   └── ASRTool.ts
│   │   ├── llm/
│   │   │   ├── HunyuanLLM.ts
│   │   │   └── LLMTool.ts
│   │   ├── vector/
│   │   │   └── VectorSearchTool.ts
│   │   └── base/
│   │       └── Tool.ts                  # Tool 基类
│   │
│   ├── services/                        # AI 服务
│   │   ├── LLMService.ts                # LLM 服务
│   │   ├── EmbeddingService.ts          # Embedding 服务
│   │   ├── VectorStoreService.ts        # 向量存储
│   │   ├── CacheService.ts              # 缓存服务
│   │   └── PromptManager.ts             # Prompt 管理
│   │
│   ├── prompts/                         # Prompt 模板库
│   │   ├── event-extraction.ts
│   │   ├── task-generation.ts
│   │   ├── meeting-minutes.ts
│   │   ├── note-enhancement.ts
│   │   └── base/
│   │       ├── PromptTemplate.ts
│   │       └── PromptOptimizer.ts       # Prompt 优化器
│   │
│   ├── orchestration/                   # 编排层
│   │   ├── AgentOrchestrator.ts         # Agent 编排器
│   │   ├── WorkflowRegistry.ts          # 工作流注册表
│   │   ├── ToolRegistry.ts              # 工具注册表
│   │   └── Router.ts                    # 路由器
│   │
│   └── monitoring/                      # 监控
│       ├── Logger.ts                    # 日志
│       ├── Metrics.ts                   # 指标
│       ├── Tracer.ts                    # 追踪
│       └── ErrorHandler.ts              # 错误处理
│
├── types/
│   └── ai/
│       ├── agent.types.ts
│       ├── workflow.types.ts
│       ├── tool.types.ts
│       └── memory.types.ts
│
└── config/
    └── ai/
        ├── agents.config.ts
        ├── workflows.config.ts
        └── tools.config.ts
```

---

## 工作流引擎

### LangGraph 核心概念

#### 1. State（状态）

```typescript
// 工作流状态定义
interface WorkflowState {
  // 输入数据
  input: {
    type: 'file' | 'text' | 'image' | 'url';
    content: any;
    metadata?: Record<string, any>;
  };
  
  // 中间状态
  processing: {
    currentStep: string;
    completedSteps: string[];
    intermediateResults: Map<string, any>;
  };
  
  // 输出结果
  output: {
    success: boolean;
    data?: any;
    error?: Error;
  };
  
  // 上下文信息
  context: {
    userId: string;
    sessionId: string;
    timestamp: Date;
    config: Record<string, any>;
  };
}
```

#### 2. Nodes（节点）

```typescript
// 节点函数签名
type NodeFunction = (state: WorkflowState) => Promise<Partial<WorkflowState>>;

// 示例：OCR 节点
const ocrNode: NodeFunction = async (state) => {
  const { input } = state;
  
  if (input.type !== 'image') {
    return state; // 跳过
  }
  
  try {
    const ocrTool = new TencentOCRTool();
    const result = await ocrTool.execute({ image: input.content });
    
    return {
      ...state,
      processing: {
        ...state.processing,
        currentStep: 'ocr',
        completedSteps: [...state.processing.completedSteps, 'ocr'],
        intermediateResults: state.processing.intermediateResults.set('ocrText', result.text)
      }
    };
  } catch (error) {
    return {
      ...state,
      output: {
        success: false,
        error: error as Error
      }
    };
  }
};
```

#### 3. Edges（边）

```typescript
// 条件边：根据状态决定下一步
const conditionalEdge = (state: WorkflowState): string => {
  const { input, processing } = state;
  
  // 如果有图片，执行 OCR
  if (input.type === 'image' && !processing.completedSteps.includes('ocr')) {
    return 'ocrNode';
  }
  
  // 如果有 URL，抓取内容
  if (input.type === 'url' && !processing.completedSteps.includes('fetch')) {
    return 'fetchNode';
  }
  
  // 否则直接提取
  return 'extractNode';
};
```

### 工作流示例：事件提取

```typescript
import { StateGraph, END } from "@langchain/langgraph";

// 1. 定义状态
interface EventExtractionState {
  input: {
    type: 'file' | 'text' | 'image' | 'url';
    content: any;
  };
  htmlContent?: string;
  images?: File[];
  ocrText?: string;
  qrCodes?: string[];
  extractedEvent?: ExtractedEventInfo;
  subTasks?: Task[];
  error?: Error;
}

// 2. 定义节点
const parseHTMLNode = async (state: EventExtractionState) => {
  if (state.input.type === 'url' || state.input.type === 'file') {
    const htmlContent = await extractHTML(state.input.content);
    const images = await findImages(htmlContent);
    return { ...state, htmlContent, images };
  }
  return state;
};

const ocrNode = async (state: EventExtractionState) => {
  if (state.images && state.images.length > 0) {
    const ocrResults = await Promise.all(
      state.images.map(img => ocrTool.execute({ image: img }))
    );
    const ocrText = ocrResults.map(r => r.text).join('\n\n');
    return { ...state, ocrText };
  }
  return state;
};

const qrCodeNode = async (state: EventExtractionState) => {
  if (state.images && state.images.length > 0) {
    const qrResults = await Promise.all(
      state.images.map(img => qrCodeTool.execute({ image: img }))
    );
    const qrCodes = qrResults
      .filter(r => r.found)
      .map(r => r.content);
    return { ...state, qrCodes };
  }
  return state;
};

const extractEventNode = async (state: EventExtractionState) => {
  const context = [
    state.htmlContent,
    state.ocrText,
    state.qrCodes?.join('\n')
  ].filter(Boolean).join('\n\n');
  
  const llm = new HunyuanLLM();
  const extractedEvent = await llm.extractEvent(context);
  
  return { ...state, extractedEvent };
};

const analyzeRegistrationNode = async (state: EventExtractionState) => {
  if (!state.extractedEvent) return state;
  
  const llm = new HunyuanLLM();
  const registrationInfo = await llm.analyzeRegistration({
    event: state.extractedEvent,
    qrCodes: state.qrCodes
  });
  
  return { ...state, registrationInfo };
};

const generateTasksNode = async (state: EventExtractionState) => {
  if (!state.extractedEvent) return state;
  
  const tasks: Task[] = [
    {
      title: state.extractedEvent.title,
      type: 'main-event',
      dueDate: state.extractedEvent.startTime,
      ...
    }
  ];
  
  // 如果需要报名
  if (state.registrationInfo?.required) {
    tasks.push({
      title: `报名：${state.extractedEvent.title}`,
      type: 'registration',
      dueDate: state.registrationInfo.deadline,
      qrCodeLink: state.qrCodes?.[0],
      ...
    });
  }
  
  return { ...state, subTasks: tasks };
};

// 3. 构建工作流图
const buildEventExtractionWorkflow = () => {
  const workflow = new StateGraph<EventExtractionState>({
    channels: {
      input: null,
      htmlContent: null,
      images: null,
      ocrText: null,
      qrCodes: null,
      extractedEvent: null,
      registrationInfo: null,
      subTasks: null,
      error: null
    }
  });
  
  // 添加节点
  workflow
    .addNode("parseHTML", parseHTMLNode)
    .addNode("ocr", ocrNode)
    .addNode("qrCode", qrCodeNode)
    .addNode("extractEvent", extractEventNode)
    .addNode("analyzeRegistration", analyzeRegistrationNode)
    .addNode("generateTasks", generateTasksNode);
  
  // 添加边
  workflow
    .addEdge("parseHTML", "ocr")
    .addEdge("parseHTML", "qrCode")  // 并行执行
    .addEdge("ocr", "extractEvent")
    .addEdge("qrCode", "extractEvent")
    .addEdge("extractEvent", "analyzeRegistration")
    .addConditionalEdges(
      "analyzeRegistration",
      (state) => state.registrationInfo?.required ? "generateTasks" : END,
      {
        generateTasks: "generateTasks",
        [END]: END
      }
    )
    .addEdge("generateTasks", END);
  
  // 设置入口
  workflow.setEntryPoint("parseHTML");
  
  return workflow.compile();
};

// 4. 使用工作流
const executeWorkflow = async (input: any) => {
  const workflow = buildEventExtractionWorkflow();
  
  const result = await workflow.invoke({
    input: {
      type: 'image',
      content: input
    }
  });
  
  return result;
};
```

### 工作流可视化

```typescript
// 自动生成 Mermaid 图
const visualizeWorkflow = (workflow: StateGraph) => {
  const mermaid = workflow.getGraph().drawMermaid();
  console.log(mermaid);
};

/*
输出：
graph TD
    START --> parseHTML
    parseHTML --> ocr
    parseHTML --> qrCode
    ocr --> extractEvent
    qrCode --> extractEvent
    extractEvent --> analyzeRegistration
    analyzeRegistration -->|required| generateTasks
    analyzeRegistration -->|not required| END
    generateTasks --> END
*/
```

---

## Agent 设计

### Agent 基类

```typescript
// Agent 基类
abstract class BaseAgent {
  protected name: string;
  protected description: string;
  protected tools: Tool[];
  protected memory: Memory;
  protected llm: LanguageModel;
  
  constructor(config: AgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.tools = config.tools;
    this.memory = new Memory();
    this.llm = config.llm;
  }
  
  // 感知：接收输入并理解
  async perceive(input: any): Promise<Observation> {
    // 1. 提取特征
    const features = await this.extractFeatures(input);
    
    // 2. 检索相关记忆
    const relevantMemories = await this.memory.retrieve(features);
    
    // 3. 构建观察
    return {
      input,
      features,
      context: relevantMemories,
      timestamp: new Date()
    };
  }
  
  // 规划：制定行动计划
  async plan(observation: Observation): Promise<Plan> {
    const prompt = this.buildPlanningPrompt(observation);
    const response = await this.llm.generate(prompt);
    
    return this.parsePlan(response);
  }
  
  // 行动：执行计划
  async act(plan: Plan): Promise<Result> {
    const results = [];
    
    for (const step of plan.steps) {
      const tool = this.findTool(step.toolName);
      const result = await tool.execute(step.input);
      results.push(result);
      
      // 记录到记忆
      await this.memory.store({
        action: step,
        result,
        timestamp: new Date()
      });
    }
    
    return { results };
  }
  
  // 反思：从结果中学习
  async reflect(result: Result): Promise<Insight> {
    // 1. 评估结果质量
    const quality = await this.evaluateQuality(result);
    
    // 2. 提取经验
    const experience = await this.extractExperience(result, quality);
    
    // 3. 更新策略
    if (quality.score < 0.7) {
      await this.updateStrategy(experience);
    }
    
    return {
      quality,
      experience,
      improvements: await this.suggestImprovements(result, quality)
    };
  }
  
  // 主循环
  async run(input: any): Promise<any> {
    try {
      const observation = await this.perceive(input);
      const plan = await this.plan(observation);
      const result = await this.act(plan);
      const insight = await this.reflect(result);
      
      return {
        success: true,
        data: result,
        insight
      };
    } catch (error) {
      return {
        success: false,
        error
      };
    }
  }
  
  protected abstract extractFeatures(input: any): Promise<Features>;
  protected abstract buildPlanningPrompt(observation: Observation): string;
  protected abstract parsePlan(response: string): Plan;
  protected abstract findTool(name: string): Tool;
}
```

### Task Agent 实现

```typescript
class TaskAgent extends BaseAgent {
  constructor() {
    super({
      name: "TaskAgent",
      description: "智能任务管理 Agent",
      tools: [
        new OCRTool(),
        new QRCodeTool(),
        new HunyuanLLMTool(),
        new CalendarTool(),
        new EventServiceTool()
      ],
      llm: new HunyuanLLM()
    });
  }
  
  protected async extractFeatures(input: any): Promise<Features> {
    return {
      inputType: this.detectInputType(input),
      hasImages: this.hasImages(input),
      hasText: this.hasText(input),
      hasQRCodes: await this.detectQRCodes(input),
      language: await this.detectLanguage(input)
    };
  }
  
  protected buildPlanningPrompt(observation: Observation): string {
    return `
你是一个任务管理助手。根据以下信息，制定任务创建计划：

输入类型：${observation.features.inputType}
包含图片：${observation.features.hasImages}
包含文本：${observation.features.hasText}
包含二维码：${observation.features.hasQRCodes}

历史经验：
${observation.context.map(m => m.summary).join('\n')}

请制定详细的执行计划，包括：
1. 需要使用的工具
2. 执行顺序
3. 预期输出

以 JSON 格式返回计划。
    `;
  }
  
  protected parsePlan(response: string): Plan {
    const parsed = JSON.parse(response);
    return {
      steps: parsed.steps.map(step => ({
        toolName: step.tool,
        input: step.input,
        expectedOutput: step.output
      })),
      confidence: parsed.confidence || 0.8
    };
  }
  
  protected findTool(name: string): Tool {
    return this.tools.find(t => t.name === name)!;
  }
}
```

### Notes Agent 实现

```typescript
class NotesAgent extends BaseAgent {
  private vectorStore: VectorStore;
  
  constructor() {
    super({
      name: "NotesAgent",
      description: "智能笔记管理 Agent",
      tools: [
        new OCRTool(),
        new ASRTool(),
        new HunyuanLLMTool(),
        new VectorSearchTool(),
        new SummaryTool()
      ],
      llm: new HunyuanLLM()
    });
    
    this.vectorStore = new ChromaVectorStore();
  }
  
  // 智能笔记创建
  async createNote(input: MultiModalInput): Promise<Note> {
    // 1. 感知输入
    const observation = await this.perceive(input);
    
    // 2. 处理不同模态
    let content = '';
    
    if (observation.features.hasAudio) {
      const asr = this.findTool('ASRTool') as ASRTool;
      const transcript = await asr.execute({ audio: input.audio });
      content += transcript.text;
    }
    
    if (observation.features.hasImages) {
      const ocr = this.findTool('OCRTool') as OCRTool;
      const ocrResults = await Promise.all(
        input.images.map(img => ocr.execute({ image: img }))
      );
      content += '\n\n' + ocrResults.map(r => r.text).join('\n');
    }
    
    if (observation.features.hasText) {
      content += '\n\n' + input.text;
    }
    
    // 3. AI 增强
    const llm = this.findTool('HunyuanLLMTool') as HunyuanLLMTool;
    const enhanced = await llm.execute({
      action: 'enhance',
      content
    });
    
    // 4. 创建笔记
    const note: Note = {
      id: generateId(),
      title: enhanced.suggestedTitle,
      content,
      aiGenerated: {
        summary: enhanced.summary,
        keyPoints: enhanced.keyPoints,
        topics: enhanced.topics
      },
      ...
    };
    
    // 5. 索引向量
    await this.vectorStore.index(note);
    
    return note;
  }
  
  // 语义搜索
  async search(query: string): Promise<SearchResult[]> {
    // 1. 向量检索
    const vectorResults = await this.vectorStore.search(query);
    
    // 2. 重排序
    const reranked = await this.rerank(query, vectorResults);
    
    // 3. RAG 问答（可选）
    if (this.shouldAnswer(query)) {
      const answer = await this.generateAnswer(query, reranked);
      return {
        answer,
        sources: reranked
      };
    }
    
    return { results: reranked };
  }
  
  private async generateAnswer(query: string, sources: Note[]): Promise<string> {
    const context = sources.map(n => n.content).join('\n\n');
    
    const llm = this.findTool('HunyuanLLMTool') as HunyuanLLMTool;
    const answer = await llm.execute({
      action: 'answer',
      query,
      context
    });
    
    return answer.text;
  }
}
```

---

## 数据流设计

### 事件提取完整流程

```
用户上传活动海报图片
         │
         ▼
┌─────────────────────┐
│  TaskAgent.run()    │
│  - perceive()       │ ← 感知：识别输入类型（图片）
│  - plan()           │ ← 规划：制定处理步骤
│  - act()            │ ← 行动：执行工作流
│  - reflect()        │ ← 反思：评估结果质量
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  EventExtractionWorkflow                    │
│                                              │
│  parseHTML() → 无 HTML，跳过                │
│       │                                      │
│       ├──→ ocr() ─────────┐                │
│       │   ↓                │                │
│       │   TencentOCRTool   │                │
│       │   ↓                │                │
│       │   提取文字：         │                │
│       │   "科技型中小企业..." │               │
│       │                    │                │
│       └──→ qrCode() ───────┤                │
│           ↓                │                │
│           QRCodeTool       │                │
│           ↓                │                │
│           识别二维码 x2     │                │
│           - 报名链接        ▼                │
│           - 视频号链接   extractEvent()      │
│                          ↓                  │
│                       HunyuanLLM            │
│                          ↓                  │
│                       提取事件信息：          │
│                       - 标题："科技型..."    │
│                       - 时间：12/19 14:00   │
│                       - 地点：线上          │
│                          │                  │
│                          ▼                  │
│                   analyzeRegistration()     │
│                          ↓                  │
│                       HunyuanLLM            │
│                          ↓                  │
│                       分析：需要报名         │
│                       - 报名方式：二维码     │
│                       - 建议截止：12/18     │
│                          │                  │
│                          ▼                  │
│                   generateTasks()           │
│                          ↓                  │
│                       创建任务：             │
│                       1. 主事件              │
│                       2. 报名子任务          │
│                       3. 提醒设置            │
└──────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│  返回结果           │
│  - extractedEvent   │
│  - subTasks         │
│  - insight          │
└─────────────────────┘
           │
           ▼
    创建到日历和任务列表
```

### RAG 检索流程

```
用户查询："上次客户提到的技术方案"
         │
         ▼
┌─────────────────────┐
│  SearchAgent.run()  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  SemanticSearchWorkflow                     │
│                                              │
│  embedQuery()                                │
│       ↓                                      │
│  EmbeddingService                            │
│       ↓                                      │
│  生成查询向量 [0.12, -0.45, ...]            │
│       │                                      │
│       ▼                                      │
│  vectorSearch()                              │
│       ↓                                      │
│  ChromaDB.query()                            │
│       ↓                                      │
│  返回 Top-10 相关笔记                         │
│       │                                      │
│       ▼                                      │
│  rerank()                                    │
│       ↓                                      │
│  HunyuanLLM 重新排序                          │
│       ↓                                      │
│  Top-5 最相关笔记                             │
│       │                                      │
│       ▼                                      │
│  generateAnswer()                            │
│       ↓                                      │
│  构建 Prompt：                               │
│  "基于以下笔记回答：\n{context}\n问题：{q}"  │
│       ↓                                      │
│  HunyuanLLM 生成答案                          │
│       ↓                                      │
│  返回：答案 + 来源笔记                         │
└─────────────────────────────────────────────┘
           │
           ▼
    展示搜索结果和 AI 答案
```

---

## 部署方案

### 本地部署（Electron）

```typescript
// electron/ai/AIService.ts
class ElectronAIService {
  private agents: Map<string, BaseAgent>;
  private workflows: Map<string, StateGraph>;
  
  constructor() {
    this.initializeAgents();
    this.initializeWorkflows();
  }
  
  private initializeAgents() {
    this.agents.set('task', new TaskAgent());
    this.agents.set('notes', new NotesAgent());
    this.agents.set('search', new SearchAgent());
  }
  
  private initializeWorkflows() {
    this.workflows.set('event-extraction', buildEventExtractionWorkflow());
    this.workflows.set('meeting-minutes', buildMeetingMinutesWorkflow());
    // ...
  }
  
  // IPC 处理
  async handleAIRequest(event: IpcMainInvokeEvent, request: AIRequest) {
    const agent = this.agents.get(request.agent);
    if (!agent) {
      throw new Error(`Agent not found: ${request.agent}`);
    }
    
    return await agent.run(request.input);
  }
}

// 主进程注册
ipcMain.handle('ai:execute', (event, request) => {
  return aiService.handleAIRequest(event, request);
});
```

### 渲染进程调用

```typescript
// src/ai/client/AIClient.ts
class AIClient {
  async executeWorkflow(workflowName: string, input: any) {
    // 如果在 Electron 环境
    if (window.electron) {
      return await window.electron.invoke('ai:execute', {
        type: 'workflow',
        workflow: workflowName,
        input
      });
    }
    
    // 如果在 Web 环境，调用 API
    return await fetch('/api/ai/workflow', {
      method: 'POST',
      body: JSON.stringify({ workflow: workflowName, input })
    }).then(r => r.json());
  }
  
  async invokeAgent(agentName: string, action: string, params: any) {
    if (window.electron) {
      return await window.electron.invoke('ai:execute', {
        type: 'agent',
        agent: agentName,
        action,
        params
      });
    }
    
    return await fetch('/api/ai/agent', {
      method: 'POST',
      body: JSON.stringify({ agent: agentName, action, params })
    }).then(r => r.json());
  }
}

export const aiClient = new AIClient();
```

---

## 监控与优化

### 性能监控

```typescript
// ai/monitoring/Metrics.ts
class MetricsCollector {
  private metrics: Map<string, Metric[]>;
  
  recordWorkflowExecution(workflow: string, duration: number, success: boolean) {
    this.metrics.get('workflow_execution')?.push({
      workflow,
      duration,
      success,
      timestamp: Date.now()
    });
  }
  
  recordLLMCall(model: string, tokens: number, latency: number) {
    this.metrics.get('llm_calls')?.push({
      model,
      tokens,
      latency,
      timestamp: Date.now()
    });
  }
  
  recordToolExecution(tool: string, duration: number, success: boolean) {
    this.metrics.get('tool_execution')?.push({
      tool,
      duration,
      success,
      timestamp: Date.now()
    });
  }
  
  // 生成报告
  generateReport(): MetricsReport {
    return {
      workflows: this.aggregateWorkflows(),
      llm: this.aggregateLLM(),
      tools: this.aggregateTools()
    };
  }
}
```

### Prompt 优化

```typescript
// ai/prompts/PromptOptimizer.ts
class PromptOptimizer {
  private history: PromptVersion[];
  
  async optimizePrompt(
    currentPrompt: string,
    feedback: Feedback[]
  ): Promise<string> {
    // 1. 分析反馈
    const issues = this.analyzeFeedback(feedback);
    
    // 2. 识别问题模式
    const patterns = this.identifyPatterns(issues);
    
    // 3. 生成优化建议
    const suggestions = await this.generateSuggestions(currentPrompt, patterns);
    
    // 4. 应用优化
    const optimizedPrompt = this.applyOptimizations(currentPrompt, suggestions);
    
    // 5. 记录版本
    this.history.push({
      prompt: optimizedPrompt,
      improvements: suggestions,
      timestamp: new Date()
    });
    
    return optimizedPrompt;
  }
  
  private analyzeFeedback(feedback: Feedback[]): Issue[] {
    const lowRated = feedback.filter(f => f.rating < 3);
    
    return lowRated.map(f => ({
      type: this.classifyIssue(f.comment),
      frequency: this.countOccurrence(f.comment, feedback),
      examples: [f]
    }));
  }
}
```

---

## 迁移路线

### Phase 1: 基础设施（Week 1）

**目标**：搭建 LangChain + LangGraph 基础框架

```typescript
// 任务清单
const phase1Tasks = [
  {
    task: "安装依赖",
    items: [
      "npm install langchain @langchain/langgraph",
      "npm install chromadb",
      "npm install zod p-queue p-retry"
    ]
  },
  {
    task: "创建目录结构",
    items: [
      "src/ai/agents/",
      "src/ai/workflows/",
      "src/ai/tools/",
      "src/ai/prompts/"
    ]
  },
  {
    task: "实现基类",
    items: [
      "BaseAgent",
      "BaseTool",
      "WorkflowBuilder",
      "Memory"
    ]
  },
  {
    task: "配置服务",
    items: [
      "LLMService (Hunyuan)",
      "EmbeddingService",
      "VectorStoreService (ChromaDB)",
      "CacheService"
    ]
  }
];
```

### Phase 2: 迁移现有功能（Week 2-3）

**目标**：将现有 AI 功能迁移到新架构

```typescript
const phase2Tasks = [
  {
    task: "迁移事件提取",
    items: [
      "创建 EventExtractionWorkflow",
      "集成 OCR Tool",
      "集成 QR Code Tool",
      "测试端到端流程"
    ]
  },
  {
    task: "迁移 RAG 检索",
    items: [
      "创建 SemanticSearchWorkflow",
      "迁移向量索引逻辑",
      "实现 RAG 问答",
      "优化检索性能"
    ]
  },
  {
    task: "迁移批量处理",
    items: [
      "创建 BatchProcessingWorkflow",
      "实现队列管理",
      "添加进度追踪",
      "错误处理和重试"
    ]
  }
];
```

### Phase 3: 新功能开发（Week 4-5）

**目标**：基于新架构开发新功能

```typescript
const phase3Tasks = [
  {
    task: "会议纪要生成",
    items: [
      "创建 MeetingMinutesWorkflow",
      "集成 ASR Tool",
      "说话人分离",
      "结构化输出"
    ]
  },
  {
    task: "笔记增强",
    items: [
      "创建 NoteEnhancementWorkflow",
      "自动摘要",
      "自动标签",
      "自动关联"
    ]
  },
  {
    task: "智能任务规划",
    items: [
      "创建 TaskPlanningWorkflow",
      "时间推荐",
      "优先级排序",
      "依赖分析"
    ]
  }
];
```

### Phase 4: 优化与监控（Week 6）

**目标**：性能优化和监控系统

```typescript
const phase4Tasks = [
  {
    task: "性能优化",
    items: [
      "缓存策略优化",
      "并行执行优化",
      "向量检索优化",
      "Prompt 精简"
    ]
  },
  {
    task: "监控系统",
    items: [
      "指标收集",
      "日志追踪",
      "错误监控",
      "性能报告"
    ]
  },
  {
    task: "质量提升",
    items: [
      "Prompt 优化器",
      "A/B 测试框架",
      "用户反馈收集",
      "持续优化机制"
    ]
  }
];
```

---

## 附录

### A. 关键代码示例

见工作流示例和 Agent 实现部分。

### B. 参考资料

- [LangChain 官方文档](https://js.langchain.com/docs/)
- [LangGraph 教程](https://langchain-ai.github.io/langgraphjs/)
- [ChromaDB 文档](https://docs.trychroma.com/)
- [腾讯混元 API](https://cloud.tencent.com/document/product/1729)

### C. 术语表

- **Agent**: 自治智能体，能感知、规划、行动、反思
- **Workflow**: 工作流，定义任务执行的步骤和逻辑
- **Tool**: 工具，Agent 可调用的具体功能
- **State**: 状态，工作流执行过程中的数据
- **Node**: 节点，工作流中的一个处理步骤
- **Edge**: 边，节点之间的连接和流转逻辑
- **Memory**: 记忆，Agent 的上下文和历史
- **RAG**: Retrieval-Augmented Generation，检索增强生成
- **Embedding**: 向量嵌入，文本的向量表示

### D. 变更日志

- 2024-12-16: v1.0 初始版本

---

## 总结

本架构设计文档定义了 4DNote AI 系统的核心架构：

1. **采用 LangChain + LangGraph**：成熟、灵活、可扩展
2. **Agent-Workflow 双层设计**：Agent 负责智能决策，Workflow 负责流程编排
3. **工具化封装**：所有 AI 能力封装为 Tool，可组合复用
4. **渐进式迁移**：6 周计划，从基础到高级逐步实施
5. **监控与优化**：全链路追踪，持续优化

**下一步行动**：
1. 开始 Phase 1：搭建基础框架
2. 并行进行：设计第一个工作流（事件提取）
3. 持续迭代：根据实际使用反馈优化

---

**End of Document**
