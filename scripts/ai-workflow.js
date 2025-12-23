# 多 AI 角色协作架构设计

> **用途**: RAG 系统的多 AI 协作开发和测试框架  
> **创建时间**: 2025-12-23

---

## 🎭 AI 角色定义

### 1. Orchestrator AI (统筹 AI)

**职责**: 任务分解、角色调度、结果汇总

```typescript
interface OrchestratorAI {
  role: "orchestrator";
  
  // 核心功能
  decomposeTasks(userRequest: string): Task[];
  assignRoles(tasks: Task[]): RoleAssignment[];
  synthesizeResults(results: Result[]): FinalOutput;
  
  // 系统提示词
  systemPrompt: `
你是一个 RAG 系统的项目经理。你的职责是：
1. 理解用户需求，分解为具体任务
2. 为每个任务分配最合适的 AI 角色
3. 监控任务执行进度
4. 汇总所有结果，生成最终报告

你擅长：
- 任务规划和优先级排序
- 风险识别和问题升级
- 跨团队协调和沟通

你的输出格式：
{
  "tasks": [
    {"id": "T001", "description": "...", "assignedTo": "developer", "priority": "high"}
  ],
  "timeline": "预计 2 小时完成",
  "risks": ["可能遇到的问题..."]
}
  `;
}
```

**使用场景**:
```typescript
// 示例：用户要求 "优化 RAG 检索精度"
const orchestrator = new OrchestratorAI();

const plan = await orchestrator.decomposeTasks(
  "优化 RAG 检索精度，目标 Precision@5 > 0.85"
);

// 输出：
// tasks: [
//   { id: "T001", desc: "分析当前检索失败的测试用例", assignTo: "reviewer" },
//   { id: "T002", desc: "实现混合搜索算法", assignTo: "developer" },
//   { id: "T003", desc: "运行回归测试", assignTo: "tester" }
// ]
```

---

### 2. Reviewer AI (测试和评审 AI)

**职责**: 代码审查、测试用例设计、质量评估

```typescript
interface ReviewerAI {
  role: "reviewer";
  
  // 核心功能
  reviewCode(code: string): CodeReview;
  designTestCases(feature: string): TestCase[];
  evaluateRAGQuality(
    query: string,
    retrievedDocs: Document[],
    answer: string
  ): QualityScore;
  
  // 系统提示词
  systemPrompt: `
你是一个严格的 QA 工程师和代码审查专家。你的职责是：
1. 审查代码质量（可读性、性能、安全性）
2. 设计全面的测试用例（正常、边界、异常）
3. 评估 RAG 系统的输出质量

你的评审标准：
- 代码必须符合 TypeScript 严格模式
- 测试覆盖率必须 > 80%
- RAG 答案必须无幻觉、有依据

你的输出格式：
{
  "issues": [
    {"severity": "high", "description": "...", "suggestion": "..."}
  ],
  "testCases": [...],
  "qualityScore": {"faithfulness": 8, "relevance": 9, ...}
}
  `;
}
```

**使用场景**:
```typescript
// 示例：评估 RAG 输出质量
const reviewer = new ReviewerAI();

const quality = await reviewer.evaluateRAGQuality({
  query: "我上周的会议安排",
  retrievedDocs: [doc1, doc2, doc3],
  answer: "上周您有 2 个会议：..."
});

// 输出：
// {
//   faithfulness: 9,  // 答案基于检索文档，无幻觉
//   relevance: 8,     // 回答了问题，但缺少部分细节
//   coherence: 10,    // 语句流畅
//   issues: [
//     { severity: "low", description: "遗漏了 12 月 18 日的会议" }
//   ]
// }
```

---

### 3. Developer AI (执行 AI)

**职责**: 具体代码实现、问题解决、功能开发

```typescript
interface DeveloperAI {
  role: "developer";
  
  // 核心功能
  implementFeature(spec: Specification): Code;
  fixBug(issue: Issue): Patch;
  optimizePerformance(bottleneck: string): Optimization;
  
  // 系统提示词
  systemPrompt: `
你是一个全栈 TypeScript 工程师，专精 RAG 系统开发。你的职责是：
1. 根据需求文档实现功能
2. 修复测试失败的 Bug
3. 优化性能瓶颈

你的技术栈：
- 前端: React, Zustand, Slate.js
- 后端: Node.js, Dexie.js, FlexSearch
- AI: Transformers.js, OpenAI API

你的编码原则：
- 优先使用现有工具和库
- 代码必须有完整的 TypeScript 类型
- 关键逻辑必须有注释

你的输出格式：
{
  "files": [
    {"path": "src/services/ragService.ts", "action": "update", "code": "..."}
  ],
  "explanation": "实现了混合搜索算法，结合关键词和语义检索"
}
  `;
}
```

**使用场景**:
```typescript
// 示例：实现查询重写功能
const developer = new DeveloperAI();

const code = await developer.implementFeature({
  name: "Query Rewriting",
  spec: "将对话式查询转换为结构化检索条件",
  examples: [
    { input: "那上周呢？", output: "2025-12-16 到 2025-12-22 的会议" }
  ]
});

// 输出：
// {
//   files: [{
//     path: "src/services/queryRewriter.ts",
//     code: `
//       export async function rewriteQuery(
//         query: string,
//         conversationHistory: Message[]
//       ): Promise<StructuredQuery> {
//         // 实现逻辑...
//       }
//     `
//   }]
// }
```

---

## 🔄 协作工作流

### Workflow 1: 新功能开发

```mermaid
sequenceDiagram
    participant User
    participant Orchestrator
    participant Developer
    participant Reviewer
    
    User->>Orchestrator: "实现查询重写功能"
    Orchestrator->>Orchestrator: 分解任务
    Orchestrator->>Developer: Task 1: 实现核心逻辑
    Developer->>Developer: 编写代码
    Developer->>Reviewer: 提交代码审查
    Reviewer->>Reviewer: 审查代码质量
    Reviewer-->>Developer: 发现问题 (返回修改)
    Developer->>Developer: 修复问题
    Developer->>Reviewer: 重新提交
    Reviewer->>Orchestrator: 审查通过 ✅
    Orchestrator->>User: 功能已完成
```

### Workflow 2: Bug 修复

```mermaid
sequenceDiagram
    participant User
    participant Orchestrator
    participant Reviewer
    participant Developer
    
    User->>Orchestrator: "时间推理测试失败"
    Orchestrator->>Reviewer: Task 1: 分析失败原因
    Reviewer->>Reviewer: 运行测试，定位 Bug
    Reviewer->>Orchestrator: 诊断报告
    Orchestrator->>Developer: Task 2: 修复 Bug
    Developer->>Developer: 编写补丁
    Developer->>Reviewer: 提交测试
    Reviewer->>Reviewer: 验证修复
    Reviewer->>Orchestrator: 测试通过 ✅
    Orchestrator->>User: Bug 已修复
```

### Workflow 3: RAG 质量优化

```mermaid
sequenceDiagram
    participant User
    participant Orchestrator
    participant Reviewer
    participant Developer
    
    User->>Orchestrator: "提升检索精度"
    Orchestrator->>Reviewer: Task 1: 评估当前质量
    Reviewer->>Reviewer: 运行测试集
    Reviewer->>Orchestrator: 报告: Precision 只有 0.72
    Orchestrator->>Developer: Task 2: 实现 Rerank
    Developer->>Developer: 集成 Jina AI Rerank
    Developer->>Reviewer: 提交测试
    Reviewer->>Reviewer: 重新评估
    Reviewer->>Orchestrator: 报告: Precision 提升至 0.86 ✅
    Orchestrator->>User: 优化完成
```

---

## 🛠️ 实现方式

### 方案 A: GitHub Copilot Chat 多角色模式

使用 VS Code 的 Copilot Chat，通过不同的对话窗口模拟角色：

```typescript
// 1. 统筹 AI (在主对话窗口)
@workspace /plan 实现查询重写功能，提升时间推理准确率

// 2. 测试 AI (在终端或新窗口)
@workspace /test 评估当前查询重写的测试覆盖率

// 3. 执行 AI (在编辑器内)
// 选中代码 -> Copilot Inline Chat -> 实现具体功能
```

**优点**: 
- ✅ 无需额外配置
- ✅ VS Code 原生支持
- ✅ 上下文自动共享

**缺点**:
- ⚠️ 需要手动切换角色
- ⚠️ 对话历史分散

---

### 方案 B: 自定义 AI Agents 脚本

创建独立的 Node.js 脚本，调用不同的 LLM API：

<function_calls>
<invoke name="create_file">
<parameter name="content">#!/usr/bin/env node
/**
 * 多 AI 角色协作脚本
 * 用法: node scripts/ai-workflow.js --task "优化 RAG 检索精度"
 */

import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';

// ============= AI 角色配置 =============

const ROLES = {
  orchestrator: {
    model: 'gpt-4',
    systemPrompt: `你是项目经理，负责任务分解和调度...`,
    temperature: 0.3,
  },
  
  reviewer: {
    model: 'gpt-4',
    systemPrompt: `你是 QA 工程师，负责测试和评审...`,
    temperature: 0.2,
  },
  
  developer: {
    model: 'gpt-4-turbo',
    systemPrompt: `你是全栈工程师，负责实现功能...`,
    temperature: 0.1,
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============= 角色调用函数 =============

async function callAI(role: keyof typeof ROLES, userMessage: string) {
  const config = ROLES[role];
  
  console.log(`\n🤖 [${role.toUpperCase()}] 思考中...\n`);
  
  const response = await openai.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: config.temperature,
  });
  
  const reply = response.choices[0].message.content;
  console.log(`📝 [${role.toUpperCase()}] 回复:\n${reply}\n`);
  
  return reply;
}

// ============= 工作流示例 =============

async function optimizeRAGWorkflow(task: string) {
  console.log(`🎯 任务: ${task}\n`);
  console.log('=' .repeat(60));
  
  // Step 1: Orchestrator 分解任务
  const plan = await callAI('orchestrator', `
任务: ${task}

请分解为具体的子任务，包括：
1. 评估当前问题的步骤
2. 实现改进的步骤
3. 验证效果的步骤

返回 JSON 格式的任务列表。
  `);
  
  const tasks = JSON.parse(plan);
  
  // Step 2: Reviewer 评估当前质量
  if (tasks.some(t => t.type === 'evaluate')) {
    const evaluation = await callAI('reviewer', `
运行 RAG 测试集，评估当前系统质量。

测试集路径: docs/tests/RAG_TEST_DATASET.md

返回评估报告，包括：
- Precision@5
- Recall@5
- 失败的测试用例
- 问题分析
    `);
    
    // 保存评估报告
    await fs.writeFile(
      'test-results/rag-evaluation-latest.md',
      evaluation,
      'utf-8'
    );
  }
  
  // Step 3: Developer 实现改进
  if (tasks.some(t => t.type === 'implement')) {
    const implementation = await callAI('developer', `
根据评估报告，实现以下改进：
${tasks.find(t => t.type === 'implement').description}

技术栈：
- FlexSearch (关键词搜索)
- Transformers.js (语义搜索)
- Voyager (向量检索)

返回需要修改的文件路径和代码。
    `);
    
    // 这里可以自动应用代码补丁（需要谨慎）
    console.log('⚠️  请手动审查以下代码变更:\n', implementation);
  }
  
  // Step 4: Reviewer 验证改进效果
  if (tasks.some(t => t.type === 'verify')) {
    const verification = await callAI('reviewer', `
重新运行 RAG 测试集，验证改进效果。

对比指标：
- 改进前 vs 改进后
- 是否达到目标（Precision@5 > 0.85）

返回测试报告。
    `);
    
    await fs.writeFile(
      'test-results/rag-verification-latest.md',
      verification,
      'utf-8'
    );
  }
  
  // Step 5: Orchestrator 汇总结果
  const summary = await callAI('orchestrator', `
所有任务已完成，请汇总结果：

1. 评估报告: test-results/rag-evaluation-latest.md
2. 实现变更: [由 Developer 提供]
3. 验证报告: test-results/rag-verification-latest.md

生成最终报告，包括：
- 改进效果总结
- 遗留问题
- 下一步建议
  `);
  
  console.log('\n✅ 工作流完成！\n');
  console.log('=' .repeat(60));
  console.log(summary);
}

// ============= 主函数 =============

async function main() {
  const args = process.argv.slice(2);
  const taskIndex = args.indexOf('--task');
  
  if (taskIndex === -1 || !args[taskIndex + 1]) {
    console.error('用法: node ai-workflow.js --task "任务描述"');
    process.exit(1);
  }
  
  const task = args[taskIndex + 1];
  await optimizeRAGWorkflow(task);
}

main().catch(console.error);
