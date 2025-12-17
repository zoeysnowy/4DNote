# AI 模块

这是 4DNote 的 AI 智能体模块，基于 LangChain + LangGraph 构建。

## 📁 目录结构

```
src/ai/
├── agents/              # Agent 实现
│   ├── base/           # Agent 基类
│   │   ├── Agent.ts    # Agent 基类
│   │   └── Memory.ts   # Memory 实现
│   ├── TaskAgent.ts    # 任务 Agent
│   ├── NotesAgent.ts   # 笔记 Agent
│   └── SearchAgent.ts  # 搜索 Agent
│
├── tools/              # 工具集合
│   ├── base/
│   │   └── Tool.ts     # Tool 基类
│   ├── ocr/
│   ├── qrcode/
│   └── llm/
│
├── services/           # AI 服务
│   ├── LLMService.ts           # LLM 服务
│   ├── EmbeddingService.ts     # Embedding 服务
│   └── VectorStoreService.ts   # 向量存储
│
├── workflows/          # 工作流定义
│   ├── base/
│   └── ...
│
└── prompts/           # Prompt 模板
    ├── base/
    └── ...
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install langchain @langchain/core @langchain/langgraph
npm install chromadb zod p-queue p-retry
```

### 2. 创建一个简单的 Tool

```typescript
import { BaseTool } from './ai/tools/base/Tool';
import { z } from 'zod';

class MyTool extends BaseTool<{ input: string }, { output: string }> {
  constructor() {
    super(
      'MyTool',
      'My custom tool',
      z.object({ input: z.string() }),
      z.object({ output: z.string() })
    );
  }

  protected async _execute(input: { input: string }) {
    return { output: `Processed: ${input.input}` };
  }
}
```

### 3. 创建一个 Agent

```typescript
import { BaseAgent } from './ai/agents/base/Agent';
import { LLMService } from './ai/services/LLMService';

class MyAgent extends BaseAgent {
  protected async extractFeatures(input: any) {
    return {
      inputType: typeof input,
      length: JSON.stringify(input).length
    };
  }

  protected buildPlanningPrompt(observation: Observation) {
    return `Plan how to process: ${JSON.stringify(observation.features)}`;
  }

  protected parsePlan(response: string): Plan {
    return {
      steps: [{ toolName: 'MyTool', input: { input: 'test' } }],
      confidence: 0.9
    };
  }
}
```

### 4. 使用 Agent

```typescript
const llm = new LLMService({ provider: 'hunyuan' });
const agent = new MyAgent({
  name: 'MyAgent',
  description: 'Test agent',
  tools: [new MyTool()],
  llm
});

const result = await agent.run({ data: 'test' });
console.log(result);
```

## 📚 核心概念

### Agent（智能体）

Agent 是具有感知、规划、行动、反思能力的自治实体：

- **感知 (Perceive)**: 理解输入，提取特征
- **规划 (Plan)**: 制定执行计划
- **行动 (Act)**: 调用工具执行
- **反思 (Reflect)**: 评估结果，学习经验

### Tool（工具）

Tool 是 Agent 可调用的具体功能：

- 输入/输出 Schema 验证（Zod）
- 缓存支持
- 限流控制
- 重试机制

### Memory（记忆）

Memory 管理 Agent 的上下文和历史：

- **短期记忆**: 会话历史
- **长期记忆**: 事实、经验、偏好
- **向量记忆**: 语义检索

### Workflow（工作流）

Workflow 定义多步骤任务的执行流程（基于 LangGraph）：

- 状态管理
- 条件分支
- 并行执行
- 错误处理

## 🔧 配置

配置文件位于 `src/config/ai.config.ts`：

```typescript
import { llmConfig, embeddingConfig, agentConfig } from './config/ai.config';
```

## 📖 更多文档

- [Architecture](../../docs/architecture/AI_Agent_Architecture.md)
- [Task Manager PRD](../../docs/PRD/AI_TaskManager_PRD.md)
- [Notes Manager PRD](../../docs/PRD/AI_NotesManager_PRD.md)

## 🛣️ Roadmap

- [x] Phase 1: 基础框架 (Week 1)
- [ ] Phase 2: 迁移现有功能 (Week 2-3)
- [ ] Phase 3: 新功能开发 (Week 4-5)
- [ ] Phase 4: 优化与监控 (Week 6)
