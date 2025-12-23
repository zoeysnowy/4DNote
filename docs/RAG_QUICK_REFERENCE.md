# RAG 开发速查表

> 快速参考：如何用多 AI 角色迭代开发 RAG 系统

---

## 🚀 快速开始

```bash
# 1. 运行测试，看看哪里有问题
node scripts/test-rag.js

# 2. 让 AI 分析问题
@workspace 分析 test-results/rag-test-latest.md，找出主要问题

# 3. 让 AI 实现改进
@workspace /new 实现查询重写功能，参考 docs/RAG_DEVELOPMENT_WORKFLOW.md

# 4. 重新测试验证
node scripts/test-rag.js
```

---

## 🤖 三个 AI 角色速查

| 角色 | 职责 | 使用场景 | VS Code 命令 |
|------|------|----------|--------------|
| **Orchestrator** | 任务规划、调度 | 不知道从哪开始 | `@workspace /plan [任务描述]` |
| **Reviewer** | 测试、评审 | 判断质量好坏 | `@workspace /review [文件路径]` |
| **Developer** | 写代码 | 具体实现功能 | `Ctrl+I` 选中代码后输入需求 |

---

## 📊 如何判断 RAG 对不对

### 核心指标（必看）

```
✅ Precision@5 > 0.80  （检索到的文档有 80% 是相关的）
✅ Recall@5 > 0.70     （相关文档中检索到了 70%）
✅ Faithfulness > 8/10 （答案无幻觉，忠于文档）
✅ Relevance > 8.5/10  （答案回答了问题）
✅ Latency < 2s        （响应时间少于 2 秒）
```

### 快速检查

```bash
# 运行测试
node scripts/test-rag.js

# 看报告（关注通过率和失败用例）
cat test-results/rag-test-latest.md
```

### 手动测试

在你的应用中试试这些问题：
- ✅ "我今天的会议安排" （简单事实查询）
- ⚠️ "那上周呢？" （需要上下文理解）
- ⚠️ "我和张三讨论的项目进展如何？" （多跳推理）
- ✅ "我明年的度假计划" （负面测试：应该承认不知道）

---

## 🔧 典型问题与解决方案

### 问题 1: 检索不准确（Precision 低）

**症状**: 返回的文档包含很多无关内容

**诊断**:
```bash
@workspace 分析测试用例 fact_002 为什么检索到无关文档
```

**解决**:
1. 实现混合搜索（关键词 + 语义）
2. 添加 Rerank 步骤
3. 优化向量模型

### 问题 2: 答案有幻觉（Faithfulness 低）

**症状**: AI 编造了不存在的信息

**诊断**:
```bash
@workspace 为什么 AI 回答中出现了检索文档中不存在的内容？
```

**解决**:
1. 强化系统提示词：
   ```
   你必须仅基于检索到的文档回答问题。
   如果文档中没有相关信息，请明确说明 "没有找到相关信息"。
   严禁编造或推测任何内容。
   ```
2. 添加引用机制：要求 AI 标注信息来源

### 问题 3: 时间推理失败

**症状**: "上周"、"明天" 等相对时间词无法理解

**诊断**:
```bash
@workspace 为什么 "那上周呢？" 查询失败了？
```

**解决**:
实现查询重写模块（参考 `docs/RAG_DEVELOPMENT_WORKFLOW.md` Phase 3）

### 问题 4: 多跳推理不完整

**症状**: 涉及多个文档的问题回答不全

**诊断**:
```bash
@workspace 分析 multihop_001 测试用例，为什么只返回了部分信息？
```

**解决**:
1. 增加检索文档数量（5 → 10）
2. 实现 Chain-of-Thought 推理
3. 添加 Rerank 提升相关文档排序

---

## 🎯 典型迭代场景

### 场景 1: 新功能开发

```
用户需求: "实现查询重写功能"

Step 1 (Orchestrator): 规划任务
@workspace /plan 实现查询重写功能，支持时间推理

Step 2 (Developer): 写代码
@workspace /new 创建 QueryRewriter 模块
> 选中代码 -> Ctrl+I -> "添加缓存和错误处理"

Step 3 (Reviewer): 审查
@workspace /review src/services/queryRewriter.ts

Step 4 (Reviewer): 测试
node scripts/test-rag.js

Step 5 (Orchestrator): 总结
@workspace 根据测试报告总结本次迭代成果
```

### 场景 2: Bug 修复

```
测试失败: time_001 测试用例失败

Step 1 (Reviewer): 诊断
@workspace 分析为什么 time_001 测试失败

Step 2 (Developer): 修复
@workspace 修复时间解析的 Bug

Step 3 (Reviewer): 验证
node scripts/test-rag.js

Step 4 (Orchestrator): 确认
@workspace 确认 Bug 已修复，无副作用
```

### 场景 3: 质量优化

```
目标: Precision 从 0.72 提升至 0.85

Step 1 (Reviewer): 评估现状
node scripts/test-rag.js
@workspace 分析检索质量低的原因

Step 2 (Orchestrator): 规划方案
@workspace 提出 3 种提升检索精度的方案，对比优劣

Step 3 (Developer): 实现最优方案
@workspace 实现混合搜索 + Rerank

Step 4 (Reviewer): 验证效果
node scripts/test-rag.js
@workspace 对比优化前后的指标变化
```

---

## 📁 关键文件速查

| 文件 | 用途 | 何时使用 |
|------|------|----------|
| `docs/tests/RAG_TEST_DATASET.md` | 测试用例集 | 添加新测试用例 |
| `scripts/test-rag.js` | 自动化测试脚本 | 每次改动后验证 |
| `test-results/rag-test-latest.md` | 最新测试报告 | 分析问题、对比改进 |
| `docs/RAG_DEVELOPMENT_WORKFLOW.md` | 完整开发流程 | 详细参考指南 |
| `docs/PRD/AI_ChatFlow_PRD.md` | ChatFlow 需求文档 | 理解功能设计 |

---

## 🛠️ 调试技巧

### 1. 分步调试

```typescript
// 在代码中添加日志
console.log('查询重写结果:', rewrittenQuery);
console.log('检索到的文档:', retrievedDocs.map(d => d.id));
console.log('最终答案:', answer);
```

### 2. 单独测试某个模块

```typescript
// 只测试查询重写
const rewriter = new QueryRewriter();
const result = await rewriter.rewrite("那上周呢？", history);
console.log(result);
```

### 3. 使用不同的 LLM 温度

```typescript
// 温度越低，输出越稳定
const TEMPERATURES = {
  orchestrator: 0.3,  // 规划任务，需要创造性
  reviewer: 0.2,      // 评审代码，需要严格
  developer: 0.1,     // 写代码，需要精确
};
```

### 4. 对比不同提示词

```bash
# 提示词 A
@workspace 实现查询重写功能

# 提示词 B
@workspace 实现查询重写功能，将对话式查询转换为结构化检索条件，支持相对时间解析和上下文理解

# 看哪个输出更好
```

---

## ⚡ 快捷命令

```bash
# 测试
alias test-rag="node scripts/test-rag.js"

# 查看报告
alias show-report="cat test-results/rag-test-latest.md"

# 完整工作流
alias rag-workflow="node scripts/ai-workflow.js"

# 对比测试结果
alias compare-tests="node scripts/compare-test-results.js"
```

---

## 💡 最佳实践

1. **每次改动后运行测试**: 确保没有引入新问题
2. **先写测试用例，再写代码**: TDD 方法提升质量
3. **小步迭代**: 一次只解决一个问题
4. **记录决策**: 在代码注释中说明为什么这样做
5. **定期评估**: 每周运行完整测试集，监控质量趋势

---

## 🎓 学习资源

- [RAG 完整开发流程](RAG_DEVELOPMENT_WORKFLOW.md)
- [测试数据集格式](tests/RAG_TEST_DATASET.md)
- [ChatFlow PRD](PRD/AI_ChatFlow_PRD.md)
- [AI 架构文档](architecture/AI_STORAGE_ARCHITECTURE.md)

---

**快速问题？**

- **Q**: 怎么知道我的 RAG 系统好不好？
  - **A**: 运行 `node scripts/test-rag.js`，看通过率和 Precision/Recall

- **Q**: 测试失败了怎么办？
  - **A**: 用 Reviewer AI 分析：`@workspace 分析 test-results/rag-test-latest.md`

- **Q**: 如何让不同的 AI 角色协作？
  - **A**: 参考上面的"典型迭代场景"，按步骤调用不同角色

- **Q**: 可以自动化整个流程吗？
  - **A**: 可以，运行 `node scripts/ai-workflow.js --task "你的任务"`

---

**更新时间**: 2025-12-23
