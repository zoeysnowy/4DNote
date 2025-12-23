#!/usr/bin/env node
/**
 * RAG 自动化测试脚本
 * 用法: node scripts/test-rag.js
 */

import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';

// ============= 配置 =============

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TEST_DATASET_PATH = 'docs/tests/RAG_TEST_DATASET.md';
const RESULTS_DIR = 'test-results';

// ============= 测试用例 =============

const TEST_CASES = [
  {
    id: 'fact_001',
    question: '我今天的会议安排是什么？',
    context: { currentDate: '2025-12-23' },
    expectedDocs: ['event_20251223_morning_standup', 'event_20251223_afternoon_review'],
    goldenAnswer: '您今天有 2 个会议：\n1. 上午 10:00 - 晨会\n2. 下午 15:00 - 产品评审',
    difficulty: 'easy',
  },
  
  {
    id: 'time_001',
    question: '那上周呢？',
    context: {
      currentDate: '2025-12-23',
      conversationHistory: [
        { role: 'user', content: '我这周的会议安排是什么？' },
        { role: 'assistant', content: '这周您有 3 个会议...' },
      ],
    },
    expectedQueryRewrite: '查找用户 2025-12-16 到 2025-12-22 的所有会议安排',
    difficulty: 'hard',
  },
  
  {
    id: 'multihop_001',
    question: '我和张三讨论的项目进展如何？',
    expectedLogic: [
      'Step 1: 检索所有与张三相关的会议',
      'Step 2: 从会议记录中提取项目信息',
      'Step 3: 按时间排序，总结项目进展',
    ],
    goldenAnswer: '根据您和张三的会议记录：\n- 12月10日：项目启动\n- 12月17日：完成设计稿\n当前项目处于开发阶段。',
    difficulty: 'hard',
  },
  
  {
    id: 'negative_001',
    question: '我明年的度假计划是什么？',
    expectedDocs: [],
    goldenAnswer: '抱歉，我没有找到您明年的度假计划相关信息。',
    mustNotHallucinate: true,
    difficulty: 'easy',
  },
];

// ============= 评估函数 =============

/**
 * 评估检索质量
 */
function evaluateRetrieval(retrievedDocs, expectedDocs) {
  if (expectedDocs.length === 0) {
    // 负面测试：不应该检索到文档
    return {
      precision: retrievedDocs.length === 0 ? 1.0 : 0.0,
      recall: 1.0,
      f1: retrievedDocs.length === 0 ? 1.0 : 0.0,
    };
  }
  
  const relevant = retrievedDocs.filter(d => expectedDocs.includes(d));
  const precision = retrievedDocs.length > 0 ? relevant.length / retrievedDocs.length : 0;
  const recall = expectedDocs.length > 0 ? relevant.length / expectedDocs.length : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  
  return { precision, recall, f1 };
}

/**
 * 使用 GPT-4 评估生成质量
 */
async function evaluateGeneration(answer, goldenAnswer, retrievedDocs) {
  const prompt = `
你是一个 RAG 系统的质量评估专家。请评估以下答案的质量：

标准答案:
${goldenAnswer}

实际答案:
${answer}

检索到的文档:
${retrievedDocs.join(', ')}

评分标准（0-10 分）：
1. Faithfulness (忠实度): 答案是否基于检索到的文档，无幻觉
2. Relevance (相关性): 答案是否回答了问题
3. Coherence (连贯性): 答案是否流畅易懂
4. Completeness (完整性): 答案是否包含所有关键信息

请返回 JSON 格式:
{
  "faithfulness": 8,
  "relevance": 9,
  "coherence": 10,
  "completeness": 7,
  "issues": ["遗漏了..."]
}
  `;
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });
  
  return JSON.parse(response.choices[0].message.content);
}

/**
 * 运行单个测试用例
 */
async function runTestCase(testCase) {
  console.log(`\n🧪 测试用例: ${testCase.id} (${testCase.difficulty})`);
  console.log(`   问题: ${testCase.question}`);
  
  try {
    // TODO: 调用实际的 RAG 系统
    // 这里用 mock 数据演示
    const mockResult = {
      retrievedDocs: testCase.expectedDocs || [],
      answer: testCase.goldenAnswer, // 理想情况
    };
    
    // 1. 评估检索质量
    const retrievalMetrics = evaluateRetrieval(
      mockResult.retrievedDocs,
      testCase.expectedDocs || []
    );
    
    // 2. 评估生成质量
    const generationMetrics = await evaluateGeneration(
      mockResult.answer,
      testCase.goldenAnswer,
      mockResult.retrievedDocs
    );
    
    // 3. 计算综合得分
    const overallScore = (
      retrievalMetrics.f1 * 0.4 +
      generationMetrics.faithfulness / 10 * 0.3 +
      generationMetrics.relevance / 10 * 0.3
    );
    
    const result = {
      testId: testCase.id,
      difficulty: testCase.difficulty,
      passed: overallScore >= 0.7,
      retrieval: retrievalMetrics,
      generation: generationMetrics,
      overallScore,
      timestamp: new Date().toISOString(),
    };
    
    console.log(`   ✅ 综合得分: ${(overallScore * 100).toFixed(1)}%`);
    console.log(`   检索: P=${retrievalMetrics.precision.toFixed(2)} R=${retrievalMetrics.recall.toFixed(2)}`);
    console.log(`   生成: F=${generationMetrics.faithfulness} R=${generationMetrics.relevance}`);
    
    return result;
    
  } catch (error) {
    console.error(`   ❌ 测试失败: ${error.message}`);
    return {
      testId: testCase.id,
      passed: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 生成测试报告
 */
function generateReport(results) {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const passRate = (passed / total * 100).toFixed(1);
  
  const avgRetrieval = {
    precision: results.reduce((sum, r) => sum + (r.retrieval?.precision || 0), 0) / total,
    recall: results.reduce((sum, r) => sum + (r.retrieval?.recall || 0), 0) / total,
  };
  
  const avgGeneration = {
    faithfulness: results.reduce((sum, r) => sum + (r.generation?.faithfulness || 0), 0) / total,
    relevance: results.reduce((sum, r) => sum + (r.generation?.relevance || 0), 0) / total,
  };
  
  const report = `
# RAG 测试报告

**测试时间**: ${new Date().toISOString()}
**测试用例数**: ${total}
**通过率**: ${passRate}% (${passed}/${total})

---

## 📊 总体指标

| 指标 | 得分 | 目标 | 状态 |
|------|------|------|------|
| **通过率** | ${passRate}% | > 80% | ${passRate >= 80 ? '✅' : '❌'} |
| **Precision** | ${avgRetrieval.precision.toFixed(2)} | > 0.80 | ${avgRetrieval.precision >= 0.8 ? '✅' : '⚠️'} |
| **Recall** | ${avgRetrieval.recall.toFixed(2)} | > 0.70 | ${avgRetrieval.recall >= 0.7 ? '✅' : '⚠️'} |
| **Faithfulness** | ${avgGeneration.faithfulness.toFixed(1)}/10 | > 8.0 | ${avgGeneration.faithfulness >= 8 ? '✅' : '⚠️'} |
| **Relevance** | ${avgGeneration.relevance.toFixed(1)}/10 | > 8.5 | ${avgGeneration.relevance >= 8.5 ? '✅' : '⚠️'} |

---

## 📋 详细结果

${results.map(r => `
### ${r.testId} ${r.passed ? '✅' : '❌'}

- **难度**: ${r.difficulty}
- **综合得分**: ${((r.overallScore || 0) * 100).toFixed(1)}%
${r.retrieval ? `
- **检索指标**:
  - Precision: ${r.retrieval.precision.toFixed(2)}
  - Recall: ${r.retrieval.recall.toFixed(2)}
  - F1: ${r.retrieval.f1.toFixed(2)}
` : ''}
${r.generation ? `
- **生成指标**:
  - Faithfulness: ${r.generation.faithfulness}/10
  - Relevance: ${r.generation.relevance}/10
  - Coherence: ${r.generation.coherence}/10
  - Completeness: ${r.generation.completeness}/10
${r.generation.issues?.length > 0 ? `
- **问题**: ${r.generation.issues.join(', ')}
` : ''}
` : ''}
${r.error ? `
- **错误**: ${r.error}
` : ''}
---
`).join('\n')}

## 💡 改进建议

${passRate < 80 ? `
### ⚠️ 通过率低于目标 (${passRate}% < 80%)

建议优先改进：
1. 分析失败的测试用例
2. 检查检索算法是否需要调优
3. 验证生成模型的提示词质量
` : ''}

${avgRetrieval.precision < 0.8 ? `
### ⚠️ 检索精度不足 (${avgRetrieval.precision.toFixed(2)} < 0.80)

建议：
1. 实现混合搜索（关键词 + 语义）
2. 添加 Rerank 步骤
3. 优化向量模型或 Embedding 质量
` : ''}

${avgGeneration.faithfulness < 8 ? `
### ⚠️ 生成忠实度不足 (${avgGeneration.faithfulness.toFixed(1)} < 8.0)

建议：
1. 加强系统提示词约束（禁止幻觉）
2. 在生成时引用检索到的文档
3. 添加事实核查步骤
` : ''}

---

**生成时间**: ${new Date().toLocaleString('zh-CN')}
  `.trim();
  
  return report;
}

// ============= 主函数 =============

async function main() {
  console.log('🚀 开始运行 RAG 测试...\n');
  console.log('=' .repeat(60));
  
  // 确保结果目录存在
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  
  // 运行所有测试用例
  const results = [];
  for (const testCase of TEST_CASES) {
    const result = await runTestCase(testCase);
    results.push(result);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ 测试完成！\n');
  
  // 生成报告
  const report = generateReport(results);
  console.log(report);
  
  // 保存报告
  const reportPath = path.join(RESULTS_DIR, `rag-test-${Date.now()}.md`);
  await fs.writeFile(reportPath, report, 'utf-8');
  
  // 保存 JSON 格式的原始数据
  const jsonPath = path.join(RESULTS_DIR, `rag-test-${Date.now()}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(results, null, 2), 'utf-8');
  
  console.log(`\n📁 报告已保存: ${reportPath}`);
  console.log(`📁 原始数据: ${jsonPath}`);
  
  // 退出码（失败的测试数）
  const failedCount = results.filter(r => !r.passed).length;
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(console.error);
