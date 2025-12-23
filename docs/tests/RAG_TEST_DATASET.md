# RAG 测试数据集

> **用途**: 评估 ChatFlow RAG 系统的检索和生成质量  
> **更新时间**: 2025-12-23

---

## 📊 测试集结构

每个测试用例包含：
- **question**: 用户问题
- **expectedDocs**: 期望检索到的文档 ID（用于评估检索质量）
- **goldenAnswer**: 标准答案（用于评估生成质量）
- **difficulty**: 难度等级 (easy/medium/hard)
- **category**: 类别 (事实查询/时间推理/多跳推理/模糊查询)

---

## 🧪 测试用例

### Category 1: 事实查询 (Factual Retrieval)

#### Test Case 1.1 - 精确匹配
```json
{
  "id": "fact_001",
  "question": "我今天的会议安排是什么？",
  "context": {
    "currentDate": "2025-12-23",
    "userTimezone": "Asia/Shanghai"
  },
  "expectedDocs": [
    "event_20251223_meeting_001",
    "event_20251223_meeting_002"
  ],
  "goldenAnswer": "您今天有 2 个会议：\n1. 上午 10:00 - 产品评审会议\n2. 下午 15:00 - 技术架构讨论",
  "difficulty": "easy",
  "evaluationCriteria": {
    "mustInclude": ["10:00", "产品评审", "15:00", "技术架构"],
    "mustNotInclude": ["明天", "昨天"]
  }
}
```

#### Test Case 1.2 - 模糊查询
```json
{
  "id": "fact_002",
  "question": "我上周见过哪些客户？",
  "context": {
    "currentDate": "2025-12-23",
    "lastWeekRange": "2025-12-16 ~ 2025-12-22"
  },
  "expectedDocs": [
    "event_20251217_client_meeting_alibaba",
    "event_20251219_client_meeting_tencent"
  ],
  "goldenAnswer": "上周您见过 2 位客户：\n1. 12月17日 - 阿里巴巴产品经理张三\n2. 12月19日 - 腾讯技术总监李四",
  "difficulty": "medium",
  "evaluationCriteria": {
    "mustInclude": ["阿里巴巴", "腾讯", "张三", "李四"],
    "mustNotInclude": ["本周", "下周"]
  }
}
```

---

### Category 2: 时间推理 (Temporal Reasoning)

#### Test Case 2.1 - 相对时间
```json
{
  "id": "time_001",
  "question": "那上周呢？",
  "context": {
    "currentDate": "2025-12-23",
    "conversationHistory": [
      {"role": "user", "content": "我这周的会议安排是什么？"},
      {"role": "assistant", "content": "这周您有 3 个会议..."}
    ]
  },
  "expectedQueryRewrite": "查找用户 2025-12-16 到 2025-12-22 的所有会议安排",
  "expectedDocs": ["event_20251217_*", "event_20251219_*"],
  "difficulty": "hard",
  "evaluationCriteria": {
    "requiresQueryRewriting": true,
    "mustResolveContextualReference": true
  }
}
```

---

### Category 3: 多跳推理 (Multi-Hop Reasoning)

#### Test Case 3.1 - 跨事件推理
```json
{
  "id": "multihop_001",
  "question": "我和张三讨论的项目进展如何？",
  "expectedLogic": [
    "Step 1: 检索所有与张三相关的会议",
    "Step 2: 从会议记录中提取项目信息",
    "Step 3: 按时间排序，总结项目进展"
  ],
  "expectedDocs": [
    "event_20251210_meeting_zhangsan",
    "event_20251217_meeting_zhangsan",
    "note_project_progress_summary"
  ],
  "goldenAnswer": "根据您和张三的会议记录：\n- 12月10日：项目启动，确定需求\n- 12月17日：完成 UI 设计稿，进入开发阶段\n当前项目处于开发阶段，预计 12 月底完成。",
  "difficulty": "hard"
}
```

---

### Category 4: 负面测试 (Negative Cases)

#### Test Case 4.1 - 无相关数据
```json
{
  "id": "negative_001",
  "question": "我明年的度假计划是什么？",
  "expectedDocs": [],
  "goldenAnswer": "抱歉，我没有找到您明年的度假计划相关信息。您可以在日历中添加相关安排。",
  "difficulty": "easy",
  "evaluationCriteria": {
    "mustNotHallucinate": true,
    "mustAdmitUnknown": true
  }
}
```

#### Test Case 4.2 - 时间冲突检测
```json
{
  "id": "negative_002",
  "question": "帮我在明天下午 2 点安排一个会议",
  "context": {
    "currentDate": "2025-12-23",
    "existingEvents": [
      {
        "id": "event_20251224_140000",
        "title": "技术评审",
        "startTime": "2025-12-24 14:00",
        "endTime": "2025-12-24 15:30"
      }
    ]
  },
  "expectedBehavior": "检测到时间冲突，提示用户现有安排",
  "goldenAnswer": "明天下午 2 点您已经有「技术评审」会议（14:00-15:30），是否要更改时间或取消原有安排？",
  "difficulty": "medium"
}
```

---

## 🎯 评估标准

### 自动化评估指标

```typescript
// 1. 检索质量评估
function evaluateRetrieval(
  retrievedDocs: string[],
  expectedDocs: string[],
  goldDocs: string[]
): RetrievalMetrics {
  const relevant = retrievedDocs.filter(d => goldDocs.includes(d));
  
  return {
    precision: relevant.length / retrievedDocs.length,
    recall: relevant.length / goldDocs.length,
    f1: 2 * (precision * recall) / (precision + recall)
  };
}

// 2. 生成质量评估（使用 GPT-4 作为评审）
function evaluateGeneration(
  answer: string,
  goldenAnswer: string,
  retrievedDocs: string[]
): GenerationMetrics {
  const prompt = `
评估以下 RAG 系统生成的答案质量：

标准答案: ${goldenAnswer}
实际答案: ${answer}
检索到的文档: ${retrievedDocs.join(', ')}

评分标准（0-10 分）：
1. Faithfulness (忠实度): 答案是否基于检索到的文档，无幻觉
2. Relevance (相关性): 答案是否回答了问题
3. Coherence (连贯性): 答案是否流畅易懂
4. Completeness (完整性): 答案是否包含所有关键信息

返回 JSON 格式: {"faithfulness": 8, "relevance": 9, ...}
  `;
  
  return await llm.evaluate(prompt);
}
```

---

## 📈 测试报告模板

```markdown
# RAG 测试报告

**测试日期**: 2025-12-23
**版本**: v2.18.5
**测试集**: 20 个用例

## 总体指标

| 指标 | 得分 | 目标 | 状态 |
|------|------|------|------|
| Precision@5 | 0.85 | > 0.80 | ✅ 通过 |
| Recall@5 | 0.72 | > 0.70 | ✅ 通过 |
| Faithfulness | 8.5/10 | > 8.0 | ✅ 通过 |
| Relevance | 9.2/10 | > 8.5 | ✅ 通过 |
| Avg Latency | 1.2s | < 2.0s | ✅ 通过 |

## 分类表现

| 类别 | 通过率 | 平均得分 | 问题 |
|------|--------|----------|------|
| 事实查询 | 95% (19/20) | 9.1/10 | - |
| 时间推理 | 70% (7/10) | 7.5/10 | ⚠️ 查询重写失败 3 例 |
| 多跳推理 | 60% (6/10) | 7.0/10 | ⚠️ 跨文档推理不足 |
| 负面测试 | 100% (5/5) | 9.5/10 | - |

## 改进建议

1. **查询重写模块**:
   - 问题: "那上周呢？" 未能正确解析为日期范围
   - 方案: 增强对话历史上下文理解

2. **多跳推理**:
   - 问题: 跨多个文档的信息整合不完整
   - 方案: 实现 ReRank + 分步推理链
```

---

## 🔄 持续集成

将测试集成到 CI/CD：

```bash
# 运行 RAG 测试
npm run test:rag

# 生成测试报告
npm run test:rag:report
```
