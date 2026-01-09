# AI Features: Agent vs Workflow 分类分析

**分析日期**: 2026-01-09  
**分析范围**: AI_NotesManager_PRD, AI_ChatFlow_PRD, AI_TaskManager_PRD  
**决策框架**: 基于 RAG improvement methodology.md 第二部分

---

## 📊 决策框架

### Agent 适用场景
- ✅ **多步推理**: 需要根据中间结果动态调整策略
- ✅ **动态工具选择**: 根据情况选择不同的API/工具
- ✅ **错误恢复**: 需要重试、回退、自我纠正
- ✅ **复杂状态管理**: 维护多轮上下文、决策树
- ✅ **不确定性高**: 输入格式多变、需求模糊

### Workflow + AI API 适用场景
- ✅ **固定序列**: 步骤确定、流程清晰
- ✅ **确定性逻辑**: 输入输出明确、可预测
- ✅ **单次调用**: 一个LLM调用即可完成
- ✅ **简单编排**: Prompt Chaining、条件分支足够
- ✅ **低延迟要求**: 无需复杂决策过程

---

## 🎯 分类结果总览

| 文档 | Agent功能数 | Workflow功能数 | 混合功能数 |
|------|-------------|----------------|------------|
| AI_NotesManager | 4 (新增高级编辑) | 8 | 2 |
| AI_ChatFlow | 1 | 5 | 1 |
| AI_TaskManager | 2 | 7 | 1 |
| **AI_UserManner (新增)** | **1 (自进化学习)** | **0** | **0** |
| **合计** | **8** | **20** | **4** |

**核心洞察**: 77% 的功能使用 Workflow + AI API 即可，仅 25% 需要完整 Agent 架构（含自进化学习系统）

**新增**: AI_UserManner - 用户行为模式学习系统（自进化 Agent，Phase 3-4 实施）

---

## 🧠 AI UserManner - 自进化用户意图学习系统

### 核心概念

**定位**: UserManner 是一个**元 Agent**（Meta-Agent），它不直接提供 AI 功能，而是通过学习用户行为模式，为所有其他 AI Agent 提供个性化决策权重。

**核心工作流**:
```
用户行为 (Signal) 
    ↓ 聚合分析 (30天数据)
UserMannerAgent (LLM 模式识别)
    ↓ 自动归纳
UserManner (行为模式抽象)
    ↓ 应用权重
所有 AI 服务 (ChatFlow/NotesManager/TaskManager/MediaManager)
    ↓ 隐式反馈
UserMannerEvaluator (自动评估)
    ↓ 权重调整 (指数移动平均)
更新 UserManner.decisionWeight
    ↓ 循环迭代
持续优化决策
```

### 与各模块的衔接

#### 1. 与 SignalService 的衔接

**数据流**: Signal (SSOT) → UserMannerAgent → UserManner (Derived)

```typescript
// UserMannerAgent 定期读取 Signal
class UserMannerAgent {
  async mineUserManners(userId: string) {
    // 1. 读取近 30 天的 Signal
    const signals = await SignalService.getRecentSignals(userId, {
      days: 30,
      minCount: 100
    });
    
    // 2. 聚合分析
    const aggregated = this.aggregateSignals(signals);
    // 示例: { 
    //   highlightInMeetings: 45次, 
    //   questionInTechDocs: 32次,
    //   actionItemAt21h: 28次 
    // }
    
    // 3. LLM 模式识别
    const patterns = await this.llm.chat({
      model: 'gpt-4',
      prompt: `分析以下用户行为数据，识别明显的行为模式...`
    });
    
    // 4. 创建 UserManner
    const newManners = await UserMannerService.batchCreate(patterns);
    return newManners;
  }
}
```

**SSOT 合规性**:
- ✅ Signal 是 SSOT（真相源）
- ✅ UserManner 是 Derived（派生数据，可重建）
- ✅ SignalService 不感知 UserManner（职责分离）
- ✅ UserMannerAgent 是唯一的 Derived Builder

#### 2. 与 ChatFlowAgent 的衔接

**应用点**: RAG 检索权重调整

```typescript
class ChatFlowAgent {
  async answer(query: string, userId: string) {
    // 1. 获取用户的 UserManner
    const manners = await UserMannerService.getActiveManners(userId, {
      targetService: 'ChatFlow',
      category: 'content_preference',
      minWeight: 0.5  // 只用高置信度的模式
    });
    
    // 2. RAG 检索
    let ragResults = await RAGIndexService.search(query, { topK: 20 });
    
    // 3. 应用 UserManner 权重调整
    if (manners.length > 0) {
      ragResults = ragResults.map(chunk => {
        let adjustedScore = chunk.score;
        
        for (const manner of manners) {
          if (this.matchesTriggerPattern(chunk, manner)) {
            // 权重加成: adjustedScore *= (1 + weight * 0.5)
            // 如果 manner 说用户喜欢技术文档，技术类 chunk 得分 +25%
            adjustedScore *= (1 + manner.decisionWeight * 0.5);
          }
        }
        
        return { ...chunk, score: adjustedScore };
      }).sort((a, b) => b.score - a.score);
    }
    
    // 4. 生成回答
    const answer = await this.llm.chat({
      prompt: this.buildPrompt(query, ragResults),
      temperature: this.getAdaptiveTemperature(manners)  // 动态调整
    });
    
    // 5. 记录应用（用于后续评估）
    for (const manner of manners) {
      await UserMannerService.logApplication(manner.id, {
        appliedTo: conversationId,
        service: 'ChatFlow',
        action: 'rag_rerank'
      });
    }
    
    return answer;
  }
}
```

**效果示例**:
- 用户 A 经常搜索技术文档 → 技术类笔记权重 +30%
- 用户 B 经常搜索会议纪要 → 会议类笔记权重 +30%
- 同样的问题，不同用户得到不同的检索结果

#### 3. 与 TaskManagerAgent 的衔接

**应用点**: 自动提取 vs 预览确认

```typescript
class TaskExtractionAgent {
  async extractTasks(event: Event, userId: string) {
    // 1. 获取相关 UserManner
    const manners = await UserMannerService.getActiveManners(userId, {
      targetService: 'TaskManager',
      category: 'decision_style'
    });
    
    // 2. 检查是否有"自动提取任务"的偏好
    const autoExtractManner = manners.find(m => 
      m.targetServices.some(s => s.actions.includes('auto_extract_tasks'))
    );
    
    if (autoExtractManner && autoExtractManner.decisionWeight > 0.7) {
      // 用户习惯自动提取，直接执行
      const tasks = await this.llm.extractTasks(event.content);
      await TaskService.batchCreate(tasks);
      
      // 记录应用
      await UserMannerService.logApplication(autoExtractManner.id, {
        appliedTo: event.id,
        service: 'TaskManager',
        action: 'auto_extract'
      });
    } else {
      // 用户习惯手动确认，显示预览
      const tasks = await this.llm.extractTasks(event.content);
      await this.showConfirmationDialog(tasks);
    }
  }
}
```

**效果示例**:
- 用户 A 总是接受自动提取 → 权重 0.9 → 直接执行
- 用户 B 经常修改/拒绝 → 权重 0.3 → 显示预览

#### 4. 与 NotesManagerAgent 的衔接

**应用点**: 智能插入目标选择

```typescript
class SmartContentInsertionAgent {
  async findBestInsertionTarget(content: string, userId: string) {
    // 1. RAG 全局检索 Top 10
    const candidates = await RAGIndexService.search(content, { topK: 10 });
    
    // 2. 获取用户的文档类型偏好
    const manners = await UserMannerService.getActiveManners(userId, {
      category: 'content_preference'
    });
    
    // 3. 应用偏好权重
    const scored = candidates.map(doc => {
      let score = doc.relevance;
      
      // 如果用户偏好技术文档，技术类文档得分 +30%
      for (const manner of manners) {
        if (manner.name.includes('技术') && doc.tags.includes('技术')) {
          score *= (1 + manner.decisionWeight * 0.3);
        }
      }
      
      return { ...doc, score };
    }).sort((a, b) => b.score - a.score);
    
    return scored.slice(0, 3);  // Top 3 候选
  }
}
```

#### 5. 与 MediaManagerAgent 的衔接

**应用点**: 图片质量评分个性化

```typescript
class SmartMediaDeduplicationAgent {
  async evaluateImageQuality(image: MediaArtifact, userId: string) {
    // 基础评分
    let baseScore = {
      resolutionScore: this.calculateResolution(image),
      sharpnessScore: this.calculateSharpness(image),
      aestheticScore: this.calculateAesthetic(image)
    };
    
    // 获取用户的图片偏好
    const manners = await UserMannerService.getActiveManners(userId, {
      category: 'content_preference',
      targetService: 'MediaManager'
    });
    
    // 根据用户偏好调整权重
    let resolutionWeight = 0.4;
    let aestheticWeight = 0.6;
    
    for (const manner of manners) {
      if (manner.name.includes('高分辨率')) {
        resolutionWeight += manner.decisionWeight * 0.2;  // 最高 +20%
        aestheticWeight -= manner.decisionWeight * 0.2;
      }
      if (manner.name.includes('美观')) {
        aestheticWeight += manner.decisionWeight * 0.2;
        resolutionWeight -= manner.decisionWeight * 0.2;
      }
    }
    
    // 计算最终评分
    const finalScore = 
      baseScore.resolutionScore * resolutionWeight +
      baseScore.aestheticScore * aestheticWeight;
    
    return finalScore;
  }
}
```

**效果示例**:
- 用户 A 总是保留高分辨率版本 → 学习到"高分辨率偏好" → 分辨率权重 +20%
- 用户 B 总是保留美观版本 → 学习到"美观偏好" → 美学权重 +20%

### 反馈采集机制

#### 隐式反馈（推荐，用户无感知）

```typescript
// 1. 用户接受 AI 建议
eventBus.on('ai:suggestion:accepted', (data) => {
  UserMannerEvaluator.evaluateApplication(data.mannerId, {
    appliedTo: data.suggestionId,
    userAction: 'accept',
    timestamp: new Date().toISOString()
  });
});

// 2. 用户删除 AI 创建的内容
eventBus.on('event:deleted', async (eventId) => {
  const event = await EventService.get(eventId);
  if (event.createdBy === 'ai') {
    const manner = await this.findAppliedManner(eventId);
    if (manner) {
      await UserMannerEvaluator.evaluateApplication(manner.id, {
        appliedTo: eventId,
        userAction: 'reject',
        timestamp: new Date().toISOString()
      });
    }
  }
});

// 3. 用户修改 AI 生成的内容
eventBus.on('event:updated', async (eventId, changes) => {
  const event = await EventService.get(eventId);
  if (event.createdBy === 'ai' && this.hasSignificantChanges(changes)) {
    const manner = await this.findAppliedManner(eventId);
    if (manner) {
      await UserMannerEvaluator.evaluateApplication(manner.id, {
        appliedTo: eventId,
        userAction: 'modify',
        timestamp: new Date().toISOString()
      });
    }
  }
});
```

#### 权重自适应调整

**算法**: 指数移动平均（EMA）

$$
W_{t+1} = W_t \cdot (1 - \alpha) + S_t \cdot \alpha
$$

其中：
- $W_t$: 当前权重
- $S_t$: 本次评分（0-1）
- $\alpha = 0.2$: 学习率

**示例**:
```typescript
// 初始权重: 0.5
// 用户接受 (score=1.0): newWeight = 0.5 * 0.8 + 1.0 * 0.2 = 0.6
// 用户拒绝 (score=0.0): newWeight = 0.6 * 0.8 + 0.0 * 0.2 = 0.48
// 用户修改 (score=0.7): newWeight = 0.48 * 0.8 + 0.7 * 0.2 = 0.524
```

### UserManner 分类示例

| 分类 | 示例 Manner | 应用服务 | 效果 |
|------|-------------|---------|------|
| `content_preference` | "技术内容偏好" | ChatFlow | RAG 检索时，技术笔记权重 +30% |
| `content_preference` | "会议行动项偏好" | TaskManager | 会议纪要自动提取任务 |
| `time_preference` | "晚间规划习惯" | TaskManager | 21:00 后，dueDate 默认明天 |
| `interaction_style` | "详细预览偏好" | 所有 Agent | 显示预览而非直接执行 |
| `organization_habit` | "标签分类偏好" | NotesManager | 自动提取标签并分类 |
| `search_pattern` | "语义搜索偏好" | ChatFlow | 优先使用 RAG 而非关键词 |
| `decision_style` | "快速确认偏好" | 所有 Agent | 减少确认步骤，直接执行 |

### 实施优先级

| Phase | 功能 | 时间 | 数据需求 |
|-------|------|------|---------|
| **Phase 0.5** (Phase 3 前置) | UserManner 基础框架 + 隐式反馈采集 | 2周 | 5个手动 Manner, 30条操作记录 |
| **Phase 2** | ChatFlow 集成（RAG 权重调整） | 3周 | 30篇笔记, 20条 query |
| **Phase 3** | 自动评估 + 权重调整 | 2周 | 50次应用记录, 观察 2周 |
| **Phase 3D** | AI 模式挖掘（LLM 自动归纳） | 4周 | 500条 Signal, 10个标注模式 |
| **Phase 3D** | 扩展到其他服务 | 4周 | TaskManager/NotesManager/MediaManager 测试数据 |

### 成功指标

| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| **个性化准确率** | > 70% | AI 建议被用户采纳的比例 |
| **学习速度** | < 14天 | 从注册到生成首个有效 Manner |
| **权重收敛速度** | < 20次应用 | 权重稳定到 ±0.1 区间 |
| **用户满意度** | > 4.2/5 | AI 服务体验评分 |

**详细 PRD**: [docs/PRD/AI_UserManner_PRD.md](../PRD/AI_UserManner_PRD.md)

---

## 📝 AI NotesManager PRD 分类

### 🤖 需要 Agent (3个)

#### 1. 会议纪要自动生成 (⭐⭐⭐⭐⭐)
**功能**: 从会议录音生成结构化纪要

**为什么需要 Agent**:
- **多步推理**: 需要先转写 → 说话人识别 → 主题分割 → 决策提取 → 行动项识别
- **动态工具选择**: 根据音质选择不同ASR模型、根据语言切换分词器
- **错误恢复**: ASR错误需要上下文修正、说话人识别失败需要回退
- **复杂状态**: 维护对话上下文、追踪议程进度、关联讨论话题

**实现建议**:
```typescript
class MeetingMinutesAgent {
  tools = [
    { name: 'asr', api: 'whisper' },
    { name: 'speaker_diarization', api: 'pyannote' },
    { name: 'topic_segmentation', model: 'llm' },
    { name: 'decision_extraction', model: 'llm' },
    { name: 'action_item_parser', model: 'llm' }
  ];
  
  async run(audioUrl: string) {
    // Agent 工作流:
    // 1. 转写 (可能失败 → 换模型)
    // 2. 说话人分离 (低质量 → 跳过)
    // 3. 主题分割 (根据长度调整策略)
    // 4. 决策提取 (需要理解上下文)
    // 5. 行动项识别 (关联责任人)
    // 6. 自我验证 (完整性检查)
  }
}
```

**优先级**: P0 (核心差异化功能)

---

#### 2. 知识图谱自动构建 (⭐⭐⭐⭐)
**功能**: 从笔记自动提取概念、实体、关系，构建知识网络

**为什么需要 Agent**:
- **多步推理**: 实体识别 → 关系抽取 → 冲突解决 → 图谱合并 → 质量验证
- **动态决策**: 根据笔记类型选择不同的NER模型（技术文档 vs 会议纪要）
- **错误恢复**: 实体歧义消解（"苹果"是水果还是公司？）需要上下文推理
- **状态管理**: 维护全局图谱状态、增量更新、去重

**实现建议**:
```typescript
class KnowledgeGraphAgent {
  tools = [
    { name: 'ner', models: ['bert-ner', 'spacy', 'llm'] },
    { name: 'relation_extraction', model: 'llm' },
    { name: 'entity_linking', db: 'wikidata' },
    { name: 'graph_merge', algo: 'entity_resolution' }
  ];
  
  async run(notes: Note[]) {
    // Agent 工作流:
    // 1. 批量NER (选择合适模型)
    // 2. 实体链接 (消歧义)
    // 3. 关系抽取 (多轮LLM推理)
    // 4. 图谱合并 (冲突检测)
    // 5. 质量评估 (低质量节点 → 人工审核)
  }
}
```

**优先级**: P1 (高级功能，非刚需)

---

#### 3. 多模态笔记理解 (⭐⭐⭐)
**功能**: 理解复杂图片（白板、手写、图表）并提取结构化信息

**为什么需要 Agent**:
- **动态工具选择**: 根据图片类型切换OCR引擎（印刷体 vs 手写体）
- **多步推理**: 畸变矫正 → OCR → 布局分析 → 表格识别 → 公式提取
- **错误恢复**: OCR低置信度 → 多引擎投票、布局识别失败 → 回退简单模式
- **不确定性**: 白板照片质量多变、手写识别难度高

**实现建议**:
```typescript
class MultimodalUnderstandingAgent {
  tools = [
    { name: 'ocr', engines: ['tesseract', 'paddleocr', 'mathpix'] },
    { name: 'deskew', algo: 'opencv' },
    { name: 'layout_analysis', model: 'layoutlmv3' },
    { name: 'table_detection', model: 'yolo' },
    { name: 'formula_recognition', api: 'mathpix' }
  ];
  
  async run(image: File) {
    // Agent 工作流:
    // 1. 图片预处理 (畸变矫正)
    // 2. 场景分类 (选择OCR引擎)
    // 3. OCR (多引擎投票)
    // 4. 结构化提取 (表格/公式/列表)
    // 5. 质量验证 (低质量 → 提示用户重拍)
  }
}
```

**优先级**: P2 (Nice to have，但开发成本高)

---

#### 4. 智能编辑与批量操作 Agent (⭐⭐⭐⭐⭐)
**功能**: 复杂的笔记编辑、内容重组、批量创建

**为什么需要 Agent**:
- **复杂意图理解**: 需要理解用户的高级指令（"每行3张图"、"插入到相关章节"）
- **多步编辑操作**: 解析内容 → 理解结构 → 执行编辑 → 验证结果
- **上下文推理**: 理解文档结构、章节语义、日期规则
- **错误恢复**: 编辑失败 → 回滚、重试、请求澄清

**高级场景示例**:

##### 场景 A: 从表格批量创建子页面
```
用户指令:
"帮我把这个表格里的每一行都生成一个子页面，
标签设置为 Project Ace，
每个事项都设置一个 ddl，分别是本周五、下周五、下下周五依次类推，
并自动跳过国定假日"

Agent 工作流:
1. 表格解析 (识别列: 事项名称、描述、负责人等)
2. 日期计算:
   - 获取当前日期
   - 计算本周五、下周五...
   - 调用假日API (或内置假日库)
   - 遇到假日 → 顺延到下一工作日
3. 批量创建 Event:
   - 每行 → 1个 Event
   - title = 表格第一列
   - tags = ['Project Ace']
   - dueDate = 计算好的日期
   - description = 其他列内容
4. 关联管理:
   - 设置父事件关联
   - 生成甘特图视图
5. 验证:
   - 检查日期合理性
   - 预览创建结果
   - 用户确认后执行
```

**实现建议**:
```typescript
class BatchContentCreationAgent {
  tools = [
    { name: 'table_parser', model: 'llm' },
    { name: 'date_calculator', lib: 'date-fns' },
    { name: 'holiday_api', service: 'chinese-holiday-api' },
    { name: 'event_creator', service: 'EventService' },
    { name: 'validator', model: 'llm' }
  ];
  
  async run(userCommand: string, context: NoteContext) {
    // 1. 理解用户意图
    const intent = await this.llm.parseIntent(userCommand);
    // 提取: 表格范围、标签、日期规则、假日处理
    
    // 2. 解析表格
    const table = await this.parseTable(context.selection);
    
    // 3. 计算日期序列
    const dates = [];
    let currentDate = this.getNextFriday(new Date());
    for (let i = 0; i < table.rows.length; i++) {
      // 跳过假日
      while (await this.isHoliday(currentDate)) {
        currentDate = this.addDays(currentDate, 1);
      }
      dates.push(currentDate);
      currentDate = this.addWeeks(currentDate, 1);
    }
    
    // 4. 生成预览
    const preview = table.rows.map((row, i) => ({
      title: row[0],
      tags: intent.tags,
      dueDate: dates[i],
      description: row.slice(1).join('\n')
    }));
    
    // 5. 用户确认
    const confirmed = await this.showPreview(preview);
    if (!confirmed) return { status: 'cancelled' };
    
    // 6. 批量创建
    const events = await Promise.all(
      preview.map(p => this.eventService.create(p))
    );
    
    // 7. 建立关联
    await this.linkEvents(context.parentEventId, events);
    
    return { status: 'success', created: events.length };
  }
}
```

---

##### 场景 B: 智能内容定位插入（跨文档 + 交互式预览）
```
用户指令:
"把这段文字插入到相关的笔记里"
（不指定目标文档，Agent 自动在整个笔记库中搜索）

Agent 工作流:
1. 理解待插入内容的语义
2. 全局文档检索:
   - RAG 语义搜索整个笔记库
   - 返回 Top 10 最相关文档
3. 多文档结构分析:
   - 并行解析候选文档的章节结构
   - 为每个章节计算与内容的相似度
4. 候选位置生成:
   - 综合文档相关性 + 章节相关性
   - 生成 Top 3 候选位置
   - 每个候选包含: 文档名、章节路径、插入位置、理由
5. 交互式预览:
   - 以卡片形式展示 3 个候选方案
   - 每张卡片显示:
     * 目标文档标题 + 图标
     * 章节路径 (如 "第3章 > 3.2 实现细节")
     * 插入位置预览 (前后文各3行)
     * AI 推荐理由 (为什么适合插这里)
     * 相似度评分 (0-100)
   - 用户点击查看完整 diff 预览
6. 格式智能调整:
   - 根据目标章节的格式规范调整内容
   - Markdown 层级自动对齐
   - 代码块语言标记统一
   - 行号引用自动更新
7. 用户选择后执行插入
```

**实现建议**:
```typescript
class SmartContentInsertionAgent {
  tools = [
    { name: 'rag_search', service: 'RAGIndexService' },
    { name: 'doc_structure_parser', model: 'llm' },
    { name: 'semantic_matcher', service: 'EmbeddingService' },
    { name: 'format_adjuster', model: 'llm' },
    { name: 'diff_generator', lib: 'diff' },
    { name: 'preview_renderer', lib: 'react' }
  ];
  
  async run(contentToInsert: string, userLibrary: NoteLibrary) {
    // 1. 理解内容主题
    const contentTheme = await this.llm.extractTheme(contentToInsert);
    const contentEmbedding = await this.embeddings.embed(contentToInsert);
    
    // 2. 全局文档检索 (RAG)
    const candidateDocs = await this.ragSearch({
      query: contentToInsert,
      topK: 10,
      filter: { library: userLibrary.id }
    });
    // 返回: [{ noteId, title, relevance: 0.85 }, ...]
    
    // 3. 并行分析候选文档的章节结构
    const docStructures = await Promise.all(
      candidateDocs.map(async (doc) => {
        const structure = await this.parseDocStructure(doc.content);
        return { doc, structure };
      })
    );
    
    // 4. 为每个章节计算匹配度
    const sectionCandidates = [];
    for (const { doc, structure } of docStructures) {
      for (const section of structure) {
        const sectionEmbedding = await this.embeddings.embed(
          section.title + '\n' + section.preview
        );
        const similarity = cosineSimilarity(contentEmbedding, sectionEmbedding);
        
        // 综合文档相关性 + 章节相关性
        const score = doc.relevance * 0.4 + similarity * 0.6;
        
        sectionCandidates.push({
          docId: doc.noteId,
          docTitle: doc.title,
          sectionPath: section.path, // "第3章 > 3.2 实现细节"
          sectionTitle: section.title,
          insertPosition: await this.decidePosition(section, contentToInsert),
          score,
          reasoning: await this.llm.explainMatch({
            content: contentToInsert,
            section: section.title + '\n' + section.preview,
            instruction: "为什么这段内容适合插入到这个章节？"
          })
        });
      }
    }
    
    // 5. 排序并取 Top 3
    const top3 = sectionCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    // 6. 生成预览卡片数据
    const previewCards = await Promise.all(
      top3.map(async (candidate) => {
        const targetDoc = await this.loadDocument(candidate.docId);
        const targetSection = this.findSection(targetDoc, candidate.sectionPath);
        
        // 格式调整
        const adjusted = await this.adjustFormat(contentToInsert, {
          mdLevel: targetSection.level + 1,
          indentStyle: targetSection.indentStyle,
          codeBlockLang: targetSection.codeBlockLang
        });
        
        // 生成 diff
        const diff = this.generateDiff(
          targetDoc.content,
          adjusted,
          candidate.insertPosition
        );
        
        // 提取上下文预览 (前后各3行)
        const contextPreview = this.extractContext(
          targetDoc.content,
          candidate.insertPosition,
          { before: 3, after: 3 }
        );
        
        return {
          id: candidate.docId + ':' + candidate.sectionPath,
          docTitle: candidate.docTitle,
          docIcon: targetDoc.icon || '📄',
          sectionPath: candidate.sectionPath,
          insertPosition: candidate.insertPosition,
          reasoning: candidate.reasoning,
          score: Math.round(candidate.score * 100),
          contextPreview,
          fullDiff: diff,
          adjustedContent: adjusted
        };
      })
    );
    
    // 7. 渲染交互式预览 UI
    const selectedCard = await this.showPreviewCards(previewCards);
    
    // 8. 用户选择后执行插入
    if (selectedCard) {
      const targetDoc = await this.loadDocument(selectedCard.docId);
      await this.applyInsertion(
        targetDoc,
        selectedCard.adjustedContent,
        selectedCard.insertPosition
      );
      
      return {
        status: 'success',
        insertedTo: selectedCard.docTitle,
        section: selectedCard.sectionPath
      };
    }
    
    return { status: 'cancelled' };
  }
  
  // UI 组件: 预览卡片
  async showPreviewCards(cards: PreviewCard[]): Promise<PreviewCard | null> {
    return new Promise((resolve) => {
      const CardList = () => (
        <div className="insertion-preview">
          <h3>🎯 找到 {cards.length} 个适合插入的位置</h3>
          {cards.map((card, idx) => (
            <Card
              key={card.id}
              rank={idx + 1}
              className="insertion-card"
              onClick={() => this.showDetailDiff(card)}
            >
              {/* 文档信息 */}
              <CardHeader>
                <span className="doc-icon">{card.docIcon}</span>
                <span className="doc-title">{card.docTitle}</span>
                <span className="score-badge">{card.score}% 匹配</span>
              </CardHeader>
              
              {/* 章节路径 */}
              <CardSection>
                <span className="section-path">📍 {card.sectionPath}</span>
              </CardSection>
              
              {/* 上下文预览 */}
              <CardContent>
                <div className="context-preview">
                  <pre>{card.contextPreview.before}</pre>
                  <div className="insert-marker">
                    ▼ 内容将插入到这里 ▼
                  </div>
                  <pre>{card.contextPreview.after}</pre>
                </div>
              </CardContent>
              
              {/* AI 推荐理由 */}
              <CardFooter>
                <span className="reasoning">💡 {card.reasoning}</span>
              </CardFooter>
              
              {/* 操作按钮 */}
              <CardActions>
                <Button onClick={() => this.showDetailDiff(card)}>
                  查看完整 Diff
                </Button>
                <Button primary onClick={() => resolve(card)}>
                  插入到这里
                </Button>
              </CardActions>
            </Card>
          ))}
          
          <Button secondary onClick={() => resolve(null)}>
            取消操作
          </Button>
        </div>
      );
      
      // 渲染 UI
      this.renderModal(<CardList />);
    });
  }
}
```

**UI 预览效果**:
```
┌─────────────────────────────────────────────────────┐
│ 🎯 找到 3 个适合插入的位置                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─ #1 ──────────────────────────────────────┐      │
│ │ 📄 RAG_EMBEDDING_ARCHITECTURE.md  [92% 匹配] │    │
│ │ 📍 第3章 > 3.2 Contextual BM25 实现        │      │
│ │                                            │      │
│ │ ┌─ 上下文预览 ──────────────────────┐      │      │
│ │ │ 3.2.1 双字段索引设计               │      │      │
│ │ │ ElasticsearchBM25Service 支持...  │      │      │
│ │ │                                    │      │      │
│ │ │   ▼ 内容将插入到这里 ▼             │      │      │
│ │ │                                    │      │      │
│ │ │ 3.2.2 查询策略                     │      │      │
│ │ │ multi_match 查询使用 content...    │      │      │
│ │ └────────────────────────────────────┘      │      │
│ │                                            │      │
│ │ 💡 这段内容详细说明了 BM25 的配置参数，    │      │
│ │    非常适合插入到实现细节章节              │      │
│ │                                            │      │
│ │ [查看完整 Diff]  [✓ 插入到这里]           │      │
│ └────────────────────────────────────────────┘      │
│                                                     │
│ ┌─ #2 ──────────────────────────────────────┐      │
│ │ 📄 RAG improvement methodology.md [87% 匹配]│     │
│ │ 📍 Part I > 1.2 Contextual BM25           │      │
│ │ ... (类似结构)                             │      │
│ └────────────────────────────────────────────┘      │
│                                                     │
│ ┌─ #3 ──────────────────────────────────────┐      │
│ │ 📄 SEARCH_OPTIMIZATION.md        [81% 匹配]│      │
│ │ 📍 第2章 > 检索策略                        │      │
│ │ ... (类似结构)                             │      │
│ └────────────────────────────────────────────┘      │
│                                                     │
│                    [取消操作]                        │
└─────────────────────────────────────────────────────┘
```

---

##### 场景 C: 智能图片管理与布局优化
```
用户指令场景 C1:
"帮我把页面里所有图片整理成每行3张图，行高一致"

用户指令场景 C2:
"把关于 xx 项目的会议图片，都插入到这里"
（跨笔记检索符合条件的图片，批量插入）

用户指令场景 C3:
"清理我的图片库，删除重复和低质量的图片"
（智能去重、质量评分、分组展示）
```

**Agent 工作流**:

**C1: 布局优化（基础）**
1. 提取所有图片节点
2. 分析图片尺寸和比例
3. 计算目标行高 (保证所有图等高)
4. 生成布局预览 → 用户确认 → 应用

**C2: 跨笔记图片检索与插入**
1. 解析查询条件:
   - 项目标签: "xx项目"
   - 图片类型: "会议图片"（PPT、白板、截图）
   - 时间范围: 可选
2. 全局Media检索:
   - RAG搜索关联笔记（包含"xx项目"标签）
   - 提取所有Media附件
   - 过滤图片类型（排除音频、视频）
3. 图片内容识别（多模态）:
   - OCR识别图片中的文字
   - 场景分类: PPT/白板/照片/截图
   - 匹配"会议"相关内容
4. 候选图片展示:
   - 缩略图网格 + 元数据（来源、日期、尺寸）
   - 用户多选确认
5. 批量插入到目标位置

**C3: 智能图片去重与分组**
1. 文档类图片去重:
   - OCR提取文字内容
   - 计算文本相似度（编辑距离）
   - 比较图像清晰度（PSNR、SSIM）
   - 推荐保留信息最全、质量最高的版本
2. 相似图片分组:
   - 感知哈希算法（pHash）计算相似度
   - CLIP多模态embedding聚类
   - 图像质量评分（分辨率、锐度、噪声）
   - 美学评分（构图、色彩、对比度）
3. 智能分组展示:
   - 每组第一张为最优图片（大图显示）
   - 其余图片叠放后方（卡片堆叠效果）
   - 标记质量评分差异
4. 用户交互:
   - 一键清理低质量图片
   - 手动调整保留图片
   - SignalService记录用户偏好

**实现建议**:
```typescript
class SmartMediaManagementAgent {
  tools = [
    { name: 'rag_search', service: 'RAGIndexService' },
    { name: 'media_extractor', service: 'MediaService' },
    { name: 'image_classifier', model: 'clip-vit' },
    { name: 'ocr', api: 'paddleocr' },
    { name: 'image_quality_scorer', lib: 'sharp' },
    { name: 'perceptual_hash', lib: 'imghash' },
    { name: 'aesthetic_scorer', model: 'nima' },
    { name: 'signal_recorder', service: 'SignalService' }
  ];
  
  // C2: 跨笔记图片检索
  async searchAndInsertImages(query: string, insertTarget: Note) {
    // 1. 解析查询意图
    const intent = await this.llm.parseIntent(query);
    // 提取: { project: 'xx项目', imageType: '会议', keywords: [...] }
    
    // 2. 全局笔记检索
    const relatedNotes = await this.ragSearch({
      tags: [intent.project],
      keywords: intent.keywords,
      hasMedia: true
    });
    
    // 3. 提取所有图片
    const allImages = [];
    for (const note of relatedNotes) {
      const media = await this.mediaService.getByNote(note.id);
      const images = media.filter(m => m.type === 'image');
      allImages.push(...images.map(img => ({
        ...img,
        sourceNote: note.title,
        sourceDate: note.createdAt
      })));
    }
    
    // 4. 多模态内容识别
    const candidates = await Promise.all(
      allImages.map(async (img) => {
        // OCR文字识别
        const ocrText = await this.ocr.recognize(img.url);
        
        // 场景分类
        const sceneType = await this.imageClassifier.classify(img.url);
        // 返回: 'ppt' | 'whiteboard' | 'photo' | 'screenshot'
        
        // 匹配度评分
        const relevance = await this.calculateRelevance({
          ocrText,
          sceneType,
          targetType: intent.imageType, // '会议'
          keywords: intent.keywords
        });
        
        return { ...img, ocrText, sceneType, relevance };
      })
    );
    
    // 5. 排序并展示候选图片
    const sorted = candidates
      .filter(c => c.relevance > 0.6)
      .sort((a, b) => b.relevance - a.relevance);
    
    const selected = await this.showImageSelector(sorted);
    
    // 6. 批量插入
    if (selected.length > 0) {
      await this.batchInsertImages(insertTarget, selected, {
        layout: 'grid',
        perRow: 3
      });
      
      return {
        status: 'success',
        inserted: selected.length,
        from: new Set(selected.map(s => s.sourceNote)).size + ' 篇笔记'
      };
    }
  }
  
  // C3: 智能去重与分组
  async deduplicateAndGroupImages(library: MediaLibrary) {
    // 1. 提取所有图片
    const allImages = await this.mediaService.getAllImages(library.id);
    
    // 2. 分类处理
    const documentImages = [];
    const photoImages = [];
    
    for (const img of allImages) {
      const sceneType = await this.imageClassifier.classify(img.url);
      if (['ppt', 'whiteboard', 'screenshot'].includes(sceneType)) {
        documentImages.push(img);
      } else {
        photoImages.push(img);
      }
    }
    
    // 3. 文档类去重（基于内容）
    const docDuplicates = await this.deduplicateDocuments(documentImages);
    
    // 4. 照片类分组（基于视觉相似度）
    const photoGroups = await this.groupSimilarPhotos(photoImages);
    
    // 5. 展示结果
    await this.showDeduplicationUI({
      docDuplicates,
      photoGroups,
      totalSavings: this.calculateStorageSavings([...docDuplicates, ...photoGroups])
    });
  }
  
  // 文档类去重
  async deduplicateDocuments(images: Media[]): Promise<DuplicateGroup[]> {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();
    
    for (const img of images) {
      if (processed.has(img.id)) continue;
      
      // OCR提取文字
      const text = await this.ocr.recognize(img.url);
      
      // 查找相似文档
      const similar = [];
      for (const other of images) {
        if (other.id === img.id || processed.has(other.id)) continue;
        
        const otherText = await this.ocr.recognize(other.url);
        const similarity = this.calculateTextSimilarity(text, otherText);
        
        if (similarity > 0.85) { // 85%相似度阈值
          similar.push({
            image: other,
            similarity,
            quality: await this.evaluateImageQuality(other.url)
          });
          processed.add(other.id);
        }
      }
      
      if (similar.length > 0) {
        // 添加原图
        similar.push({
          image: img,
          similarity: 1.0,
          quality: await this.evaluateImageQuality(img.url)
        });
        
        // 按质量排序
        similar.sort((a, b) => b.quality.score - a.quality.score);
        
        groups.push({
          type: 'document',
          best: similar[0].image,
          duplicates: similar.slice(1).map(s => s.image),
          reasoning: `保留最高质量版本 (分辨率: ${similar[0].quality.resolution}, 清晰度: ${similar[0].quality.sharpness.toFixed(2)})`
        });
        
        processed.add(img.id);
      }
    }
    
    return groups;
  }
  
  // 照片类分组
  async groupSimilarPhotos(images: Media[]): Promise<PhotoGroup[]> {
    // 1. 计算感知哈希
    const hashes = await Promise.all(
      images.map(async (img) => ({
        image: img,
        hash: await this.perceptualHash.compute(img.url),
        embedding: await this.imageClassifier.embed(img.url) // CLIP embedding
      }))
    );
    
    // 2. 聚类
    const clusters = this.hierarchicalClustering(hashes, {
      hashThreshold: 5,      // 汉明距离阈值
      embeddingThreshold: 0.9 // 余弦相似度阈值
    });
    
    // 3. 每组选最优图片
    const groups = await Promise.all(
      clusters.map(async (cluster) => {
        // 评估质量和美学
        const scored = await Promise.all(
          cluster.map(async (item) => ({
            image: item.image,
            quality: await this.evaluateImageQuality(item.image.url),
            aesthetic: await this.aestheticScorer.score(item.image.url)
          }))
        );
        
        // 综合评分: 质量 40% + 美学 60%
        scored.forEach(s => {
          s.finalScore = s.quality.score * 0.4 + s.aesthetic * 0.6;
        });
        
        scored.sort((a, b) => b.finalScore - a.finalScore);
        
        return {
          type: 'photo' as const,
          best: scored[0].image,
          similar: scored.slice(1).map(s => s.image),
          avgSimilarity: this.calculateAvgSimilarity(cluster),
          scoreGap: scored[0].finalScore - (scored[1]?.finalScore || 0)
        };
      })
    );
    
    // 只返回有相似图片的组
    return groups.filter(g => g.similar.length > 0);
  }
  
  // 图像质量评估
  async evaluateImageQuality(imageUrl: string): Promise<QualityScore> {
    const image = await sharp(imageUrl);
    const metadata = await image.metadata();
    
    // 1. 分辨率评分
    const resolution = metadata.width * metadata.height;
    const resolutionScore = Math.min(resolution / 2073600, 1); // 1920x1080 为基准
    
    // 2. 清晰度评估（拉普拉斯方差）
    const { data } = await image.raw().toBuffer({ resolveWithObject: true });
    const sharpness = this.calculateSharpness(data, metadata.width, metadata.height);
    const sharpnessScore = Math.min(sharpness / 100, 1);
    
    // 3. 噪声检测
    const noise = this.calculateNoise(data);
    const noiseScore = 1 - Math.min(noise / 50, 1);
    
    // 综合评分
    const score = (resolutionScore * 0.4 + sharpnessScore * 0.4 + noiseScore * 0.2);
    
    return {
      score,
      resolution: `${metadata.width}x${metadata.height}`,
      sharpness,
      noise,
      fileSize: metadata.size
    };
  }
  
  // 展示去重UI
  async showDeduplicationUI(result: DeduplicationResult) {
    return new Promise((resolve) => {
      const UI = () => (
        <div className="media-dedup">
          <h2>🎨 智能图片整理</h2>
          
          {/* 文档类去重 */}
          {result.docDuplicates.length > 0 && (
            <section>
              <h3>📄 文档类图片去重 ({result.docDuplicates.length} 组)</h3>
              {result.docDuplicates.map((group, idx) => (
                <DuplicateCard key={idx}>
                  <div className="best-image">
                    <img src={group.best.url} />
                    <span className="badge">✓ 推荐保留</span>
                    <span className="reason">{group.reasoning}</span>
                  </div>
                  <div className="duplicates">
                    {group.duplicates.map(dup => (
                      <img key={dup.id} src={dup.url} className="duplicate" />
                    ))}
                    <button onClick={() => this.deleteDuplicates(group.duplicates)}>
                      删除 {group.duplicates.length} 张重复图片
                    </button>
                  </div>
                </DuplicateCard>
              ))}
            </section>
          )}
          
          {/* 照片类分组 */}
          {result.photoGroups.length > 0 && (
            <section>
              <h3>📸 相似照片分组 ({result.photoGroups.length} 组)</h3>
              {result.photoGroups.map((group, idx) => (
                <PhotoGroupCard key={idx}>
                  {/* 最优图片（大图） */}
                  <div className="best-photo">
                    <img src={group.best.url} />
                    <div className="score-badge">
                      质量: {group.best.quality?.score.toFixed(2)}
                      美学: {group.best.aesthetic?.toFixed(2)}
                    </div>
                  </div>
                  
                  {/* 相似图片（堆叠） */}
                  <div className="similar-stack">
                    {group.similar.map((img, i) => (
                      <img
                        key={img.id}
                        src={img.url}
                        className="stacked"
                        style={{ zIndex: group.similar.length - i }}
                      />
                    ))}
                    <span className="count">+{group.similar.length}</span>
                  </div>
                  
                  {/* 操作 */}
                  <div className="actions">
                    <button onClick={() => this.expandGroup(group)}>
                      展开查看全部
                    </button>
                    <button onClick={() => this.cleanupGroup(group)}>
                      保留最佳，清理其余
                    </button>
                  </div>
                </PhotoGroupCard>
              ))}
            </section>
          )}
          
          {/* 统计 */}
          <div className="summary">
            <p>💾 预计节省空间: {formatBytes(result.totalSavings)}</p>
            <button onClick={() => this.batchCleanup(result)}>
              一键清理全部重复图片
            </button>
          </div>
        </div>
      );
      
      this.renderModal(<UI />);
    });
  }
  
  // 记录用户行为
  async recordUserCleanupBehavior(
    kept: Media[],
    deleted: Media[],
    context: CleanupContext
  ) {
    await this.signalService.emit({
      type: 'media_cleanup_preference',
      data: {
        keptImages: kept.map(img => ({
          quality: img.qualityScore,
          aesthetic: img.aestheticScore,
          resolution: img.resolution,
          fileSize: img.fileSize
        })),
        deletedImages: deleted.map(img => ({
          quality: img.qualityScore,
          aesthetic: img.aestheticScore,
          reason: context.reason
        })),
        timestamp: new Date()
      }
    });
    
    // 更新用户偏好模型
    await this.updateUserPreferenceModel({
      qualityThreshold: this.calculatePreferredQuality(kept),
      aestheticThreshold: this.calculatePreferredAesthetic(kept),
      resolutionPreference: this.calculatePreferredResolution(kept)
    });
  }
}

// 类型定义
interface DuplicateGroup {
  type: 'document';
  best: Media;
  duplicates: Media[];
  reasoning: string;
}

interface PhotoGroup {
  type: 'photo';
  best: Media;
  similar: Media[];
  avgSimilarity: number;
  scoreGap: number;
}

interface QualityScore {
  score: number;        // 0-1
  resolution: string;   // "1920x1080"
  sharpness: number;    // 拉普拉斯方差
  noise: number;        // 噪声水平
  fileSize: number;     // 文件大小
}
```

---

**这些场景的共同特点**:
1. **需要深度理解**: 用户意图 → 文档结构 → 数据关系
2. **多步决策**: 不是简单的API调用链，需要根据中间结果动态调整
3. **状态管理**: 维护编辑上下文、预览状态、回滚历史
4. **复杂交互**: 需要预览确认、卡片展示、diff对比、错误提示、进度反馈
5. **全局检索**: 场景B需要跨文档RAG检索，场景A/C在单文档内操作

**优先级**: P1 (高级功能，但用户价值极高，差异化明显)

**实施建议**:
- Phase 1 (MVP): 不做，让用户手动操作
- Phase 2 (Agent基础): 实现场景A（批量创建）
- Phase 3 (Agent高级): 
  - Week 1-2: 实现场景B（智能插入）- 核心差异化功能
  - Week 3-4: 实现场景C（布局优化）
- Phase 4 (UI打磨): 优化预览卡片、diff展示、交互流程

**成本估算**:

| 场景 | LLM调用 | CV/OCR调用 | 成本/次 | 月度估算 (1000用户) |
|------|---------|------------|---------|---------------------|
| **场景A: 批量创建** | 3-5次 | 0 | $0.005 | $15 (30次/月, 10%用户) |
| **场景B: 智能插入** | 10-15次 | 0 | $0.02 | $40 (20次/月, 10%用户) |
| **场景C1: 布局优化** | 3次 | 0 | $0.003 | $9 (30次/月, 10%用户) |
| **场景C2: 图片检索插入** | 2次 | 20次OCR+CLIP | $0.025 | $25 (10次/月, 10%用户) |
| **场景C3: 智能去重** | 1次 | 100次质量评估 | $0.05 | $50 (10次/月, 10%用户) |
| **合计** | - | - | - | **$139/月** |

**详细成本拆解**:

**场景B (智能插入)**:
- 全局RAG检索 (1次LLM)
- Top 10文档结构解析 (10次LLM并行)
- Top 3候选位置格式调整 (3次LLM)
- 推荐理由生成 (3次LLM)

**场景C2 (图片检索)**:
- 意图解析 (1次LLM)
- 相关性计算 (1次LLM)
- OCR识别 (平均20张图 × $0.001)
- CLIP分类 (20张图 × 免费/自部署)

**场景C3 (智能去重)**:
- 分组推荐 (1次LLM)
- OCR去重 (50张文档图 × $0.001)
- 感知哈希 (100张图 × 免费)
- 图像质量评估 (100张图 × 免费/本地sharp库)
- 美学评分 (可选，NIMA模型自部署或跳过)

**ROI分析**:
- 成本: $139/月 (1000用户) = **$0.14/用户/月**
- 用户价值: 
  - 场景A/B: 节省每用户每月约30分钟手动整理时间
  - 场景C2: 跨笔记图片管理，节省15分钟查找时间
  - 场景C3: 存储空间节省30-50%（重复图片），用户价值极高
- 差异化竞争力:
  - **Notion**: 无跨页面图片检索、无智能去重
  - **飞书**: 无AI辅助的图片整理
  - **Obsidian**: 无图片内容理解和去重
  - **Eagle/Billfish**: 专业图片管理工具，但不与笔记集成
- **建议**: **强烈推荐实施全部场景**，尤其是C3（智能去重）是刚需且无竞品对标

**用户行为学习的战略价值**:
- 通过SignalService记录用户清理偏好
- 个性化质量/美学阈值
- 未来可自动化建议："根据您的偏好，这10张图片建议清理"
- 形成用户粘性（系统越用越懂我）

---

### ⚙️ Workflow + AI API 即可 (8个)

#### 1. 语音笔记转写 ✅
**功能**: 实时语音转文字 + 智能标点

**为什么不需要 Agent**:
- 固定流程: 音频 → ASR → 标点修正 → 摘要
- 无需动态决策
- 单向数据流

**实现建议**:
```typescript
// 简单的 Prompt Chaining
async function transcribeVoice(audio: File) {
  // Step 1: ASR (固定API)
  const transcript = await whisperAPI.transcribe(audio);
  
  // Step 2: 标点修正 (单次LLM调用)
  const punctuated = await llm.chat({
    prompt: `为以下文本添加标点符号：\n${transcript}`
  });
  
  // Step 3: 摘要生成 (可选)
  const summary = await llm.chat({
    prompt: `总结以下内容的关键要点：\n${punctuated}`
  });
  
  return { transcript: punctuated, summary };
}
```

---

#### 2. 单篇笔记摘要 ✅
**功能**: 生成 TLDR、关键要点、实体提取

**为什么不需要 Agent**:
- 单次 LLM 调用即可
- Prompt 固定
- 无需错误恢复

**实现建议**:
```typescript
async function summarizeNote(note: Note) {
  const prompt = `
请总结以下笔记：

${note.content}

输出JSON格式：
{
  "tldr": "一句话摘要",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "entities": {
    "people": [...],
    "organizations": [...],
    "dates": [...]
  }
}`;

  return await llm.chat({ prompt, responseFormat: 'json' });
}
```

---

#### 3. 自动标签提取 ✅
**功能**: 从笔记内容提取主题、实体、情感标签

**实现**: 单次 LLM 调用 + JSON Schema

---

#### 4. 自动分类 ✅
**功能**: 将笔记分类到 work/personal/learning 等

**实现**: 
```typescript
// 方案1: Few-shot Classification
const category = await llm.classify(note.content, {
  labels: ['work', 'personal', 'learning', 'idea', 'reference'],
  examples: fewShotExamples
});

// 方案2: Embedding + 向量搜索 (更快)
const embedding = await embeddings.embed(note.content);
const similar = await vectorDB.search(embedding, topK: 5);
const category = mostCommonCategory(similar);
```

---

#### 5. 语义搜索 (RAG) ✅
**功能**: 基于语义的笔记检索

**为什么不需要 Agent**:
- 标准 RAG 流程: Query → Embedding → VectorDB → Rerank → Return
- 无需动态工具选择
- Workflow 固定

**实现**: 参考 RAG_EMBEDDING_ARCHITECTURE.md v1.1

---

#### 6. 笔记增强（润色/扩展/翻译）✅
**功能**: 一键优化笔记文字

**实现**: 单次 LLM 调用，Prompt Template 即可

---

#### 7. 图片 OCR (简单场景) ✅
**功能**: 印刷体文字提取

**实现**: 调用 OCR API (Tesseract / PaddleOCR) → 后处理

---

#### 8. 批量笔记摘要 ✅
**功能**: 将多篇笔记合并摘要

**实现**:
```typescript
async function summarizeMultiple(notes: Note[]) {
  // Step 1: 每篇生成摘要 (并行)
  const summaries = await Promise.all(
    notes.map(n => summarizeNote(n))
  );
  
  // Step 2: 合并摘要 (单次LLM)
  const overall = await llm.chat({
    prompt: `基于以下摘要，生成整体总结：\n${summaries.join('\n')}`
  });
  
  return overall;
}
```

---

### 🔀 混合模式 (2个)

#### 1. 智能笔记补全 (Workflow为主 + Agent增强)
**基础版 (Workflow)**: 基于上下文的简单补全
**高级版 (Agent)**: 
- 引用推荐 (需要检索相关笔记)
- 格式智能补全 (需要理解文档结构)

**建议**: MVP 先做 Workflow，后续升级 Agent

---

#### 2. RAG 问答 (Workflow为主 + Agent增强)
**基础版 (Workflow)**: 
```
Query → Rewrite → VectorDB → Rerank → LLM → Answer
```

**高级版 (Agent)**: 
- 多跳推理 (问题需要跨多篇笔记推理)
- 自动补充检索 (首次检索结果不足时，自动调整query重新检索)
- 来源验证 (检查引用的准确性)

**建议**: MVP 做 Workflow，高级场景再考虑 Agent

---

## 💬 AI ChatFlow PRD 分类

### 🤖 需要 Agent (1个)

#### 1. 多轮对话 + 上下文管理 (⭐⭐⭐⭐⭐)
**功能**: `@ai` 触发对话，支持多轮、上下文感知

**为什么需要 Agent**:
- **复杂状态管理**: 维护对话历史、用户偏好、Event上下文
- **动态策略**: 根据问题类型选择不同处理方式（检索 vs 生成）
- **多步推理**: 
  1. 理解问题意图
  2. 判断是否需要检索
  3. 如果需要，查询重写 → 检索 → Rerank
  4. 构建Prompt（历史 + 检索结果 + 问题）
  5. 生成回答
  6. 后续问题推荐
- **错误恢复**: 检索无结果 → 回退到纯生成模式

**实现建议**:
```typescript
class ChatFlowAgent {
  tools = [
    { name: 'query_rewriter', model: 'llm' },
    { name: 'rag_retrieval', service: 'RAGIndexService' },
    { name: 'reranker', api: 'jina-rerank' },
    { name: 'llm_chat', models: ['gpt4', 'claude', 'gemini'] },
    { name: 'follow_up_generator', model: 'llm' }
  ];
  
  async run(question: string, history: Message[], context: EventContext) {
    // Agent 决策流程:
    // 1. 意图理解 (需要检索 vs 纯对话)
    // 2. 如果需要检索:
    //    - 查询重写 (考虑历史)
    //    - RAG检索
    //    - 检索失败 → 回退
    // 3. Prompt构建 (动态选择上下文)
    // 4. 模型选择 (根据问题复杂度)
    // 5. 生成回答
    // 6. 后续问题生成
  }
}
```

**优先级**: P0 (核心功能)

---

### ⚙️ Workflow + AI API 即可 (5个)

#### 1. 快捷命令 (@ai.sum, @ai.explain) ✅
**功能**: 预定义的单次操作

**实现**:
```typescript
const shortcuts = {
  'sum': (text) => llm.chat({ prompt: `总结：${text}` }),
  'explain': (text) => llm.chat({ prompt: `解释：${text}` }),
  'translate': (text) => llm.chat({ prompt: `翻译为英文：${text}` }),
  'fix': (text) => llm.chat({ prompt: `修正语法：${text}` })
};
```

---

#### 2. 单次问答 (无上下文) ✅
**功能**: `@ai 问题` 单次回答

**实现**: 
```
EventLog Context → LLM → Answer
```

---

#### 3. 模型切换 ✅
**功能**: `@ai:gpt4` 指定模型

**实现**: 简单的配置切换，无需 Agent

---

#### 4. Toggle 节点展开/折叠 ✅
**功能**: UI 交互

**实现**: React 组件状态管理

---

#### 5. 流式响应显示 ✅
**功能**: 打字机效果

**实现**: SSE / WebSocket 接收流式输出

---

### 🔀 混合模式 (1个)

#### 1. 建议后续问题 (Workflow为主 + Agent增强)
**基础版 (Workflow)**: 
```typescript
// 基于当前回答生成3个后续问题
const followUp = await llm.chat({
  prompt: `基于以下回答，生成3个用户可能感兴趣的后续问题：\n${answer}`
});
```

**高级版 (Agent)**: 
- 分析用户历史问题模式
- 预测用户真实意图
- 个性化推荐

**建议**: MVP 做简单版，数据积累后再优化

---

## 📋 AI TaskManager PRD 分类

### 🤖 需要 Agent (2个)

#### 1. 多源任务提取 (⭐⭐⭐⭐⭐)
**功能**: 从邮件、图片、网页、会议纪要自动提取任务

**为什么需要 Agent**:
- **输入多变**: 需要根据输入类型动态选择处理流程
- **多步推理**: 
  - 图片 → OCR → 结构识别 → 任务提取
  - 邮件 → 正文提取 → 意图理解 → 任务识别 → 责任人关联
  - 会议纪要 → 说话人识别 → 行动项提取 → 任务创建
- **动态工具选择**: 海报用OCR+QR识别、会议用NLU、邮件用规则+LLM
- **错误恢复**: 提取失败 → 降级为手动辅助
- **质量验证**: 低置信度任务 → 要求人工确认

**实现建议**:
```typescript
class TaskExtractionAgent {
  tools = [
    { name: 'ocr', engines: ['tesseract', 'paddleocr'] },
    { name: 'qr_reader', lib: 'jsqr' },
    { name: 'email_parser', lib: 'mailparser' },
    { name: 'ner', model: 'bert-ner' },
    { name: 'date_parser', lib: 'chrono' },
    { name: 'task_validator', model: 'llm' }
  ];
  
  async run(input: TaskExtractionInput) {
    // Agent 决策流程:
    // 1. 输入类型识别
    // 2. 选择处理流程:
    //    - 图片 → OCR → QR识别 → 任务提取
    //    - 文本 → NLU → 任务识别
    //    - 邮件 → 解析 → 行动项提取
    // 3. 置信度评估
    // 4. 低置信度 → 人工确认
    // 5. 关联Event/标签/责任人
  }
}
```

**优先级**: P0 (核心差异化功能)

---

#### 2. 智能时间规划 (⭐⭐⭐⭐)
**功能**: 根据日历、精力曲线、任务依赖，智能安排任务时间

**为什么需要 Agent**:
- **复杂约束**: 日历空闲时段 + 精力曲线 + 任务依赖 + 优先级
- **动态优化**: 
  1. 获取日历空闲时段
  2. 分析历史精力模式
  3. 计算任务依赖图
  4. 生成初步排程
  5. 冲突检测 → 调整
  6. 用户偏好匹配 → 微调
- **多步推理**: 需要综合多个数据源、多次迭代优化
- **状态管理**: 维护排程状态、处理动态变化

**实现建议**:
```typescript
class TimeSchedulingAgent {
  tools = [
    { name: 'calendar_query', service: 'CalendarService' },
    { name: 'energy_analyzer', algo: 'historical_pattern' },
    { name: 'dependency_resolver', algo: 'topological_sort' },
    { name: 'constraint_solver', algo: 'genetic_algorithm' },
    { name: 'llm_refiner', model: 'llm' }
  ];
  
  async run(tasks: Task[], timeRange: [Date, Date]) {
    // Agent 工作流:
    // 1. 获取约束 (日历、精力、依赖)
    // 2. 初步排程 (算法求解)
    // 3. 冲突检测
    // 4. LLM微调 (考虑用户偏好)
    // 5. 生成解释 (为什么这样安排)
  }
}
```

**优先级**: P1 (高级功能，但用户价值高)

---

### ⚙️ Workflow + AI API 即可 (7个)

#### 1. 任务自动分类 ✅
**功能**: work/personal/learning 分类

**实现**: 
```typescript
const category = await llm.classify(task.title, {
  labels: ['work', 'personal', 'learning', 'health', 'social']
});
```

---

#### 2. 优先级判断 ✅
**功能**: 综合紧迫性、重要性、工作量评分

**实现**:
```typescript
// 方案1: 规则 + LLM
function calculatePriority(task: Task) {
  const urgency = calculateUrgency(task.dueDate);      // 规则
  const importance = await llm.judge(task.description); // LLM
  const effort = estimateEffort(task.checklistItems);  // 规则
  
  return weightedScore({ urgency, importance, effort });
}

// 方案2: 纯LLM (少样本学习)
const priority = await llm.chat({
  prompt: `判断任务优先级 (high/medium/low)：
任务: ${task.title}
截止: ${task.dueDate}
描述: ${task.description}`,
  examples: fewShotExamples
});
```

---

#### 3. 任务关联推荐 ✅
**功能**: 推荐相关笔记、事件、标签

**实现**:
```typescript
// Embedding 相似度搜索
const taskEmbedding = await embeddings.embed(task.title + task.description);
const relatedNotes = await vectorDB.search(taskEmbedding, collection: 'notes');
const relatedEvents = await vectorDB.search(taskEmbedding, collection: 'events');
```

---

#### 4. 执行建议生成 ✅
**功能**: 推荐最佳执行时间、准备清单

**实现**: 单次 LLM 调用 + JSON Schema

---

#### 5. 单任务进度跟踪 ✅
**功能**: 状态更新、时间记录

**实现**: 纯数据管理，无需 AI

---

#### 6. 个人效率分析 ✅
**功能**: 统计完成率、准时率、时间分布

**实现**:
```typescript
// 数据统计 + LLM 生成建议
const stats = calculateStats(tasks);
const recommendations = await llm.chat({
  prompt: `基于以下数据，给出效率改进建议：\n${JSON.stringify(stats)}`
});
```

---

#### 7. 任务质量评分 ✅
**功能**: 评估任务描述的完整性、清晰度

**实现**: LLM 单次评分 + 规则检查

---

### 🔀 混合模式 (1个)

#### 1. 批量任务智能排序 (Workflow为主 + Agent增强)
**基础版 (Workflow)**: 
```typescript
// 根据优先级、截止日期排序
tasks.sort((a, b) => {
  if (a.priority !== b.priority) return priorityScore[a.priority] - priorityScore[b.priority];
  return a.dueDate - b.dueDate;
});
```

**高级版 (Agent)**: 
- 考虑任务依赖关系
- 动态调整（新任务插入时重新优化）
- 个性化排序（学习用户习惯）

**建议**: MVP 做规则排序，后续升级

---

## 📊 实施建议

### Phase 1: MVP (Workflow Only) - 4周
**目标**: 快速验证核心价值

#### Week 1-2: AI ChatFlow
- ✅ 单次问答 (Workflow)
- ✅ 快捷命令 (Workflow)
- ✅ Toggle 节点 (UI)

#### Week 3-4: AI NotesManager + TaskManager
- ✅ 语音转写 (Workflow)
- ✅ 简单OCR (Workflow)
- ✅ 笔记摘要/分类/标签 (Workflow)
- ✅ 任务分类/优先级 (Workflow)

**验收标准**:
- 用户可以通过 `@ai` 与笔记对话
- 语音笔记可自动转写 + 摘要
- 笔记自动分类、打标签
- 简单任务可自动提取

---

### Phase 2: Agent 增强 - 6周
**目标**: 实现差异化功能

#### Week 5-7: ChatFlow Agent
- 🤖 多轮对话 + 上下文管理
- 🤖 RAG 检索集成
- 🤖 查询重写

#### Week 8-10: 核心 Agent
- 🤖 会议纪要生成 (NotesManager)
- 🤖 多源任务提取 (TaskManager)

#### Week 11-12: 高级 Agent
- 🤖 智能时间规划 (TaskManager)
- 🤖 多模态图片理解 (NotesManager，可选)

---

### Phase 3: 打磨优化 - 2周
- 错误处理完善
- UI/UX 优化
- 性能优化
- 用户测试

---

## 💰 成本评估

### Workflow 方案成本
| 功能 | API调用 | 成本/次 | 月度估算 (1000用户) |
|------|---------|---------|---------------------|
| 笔记摘要 | 1次LLM | $0.001 | $50 (50次/人/月) |
| 任务分类 | 1次LLM | $0.0005 | $25 (50次/人/月) |
| 语音转写 | ASR | $0.006/分钟 | $300 (50分钟/人/月) |
| OCR | API | $0.001/张 | $10 (10张/人/月) |
| **合计** | - | - | **$385/月** |

### Agent 方案额外成本
| 功能 | 额外调用 | 成本/次 | 月度估算 (1000用户) |
|------|---------|---------|---------------------|
| ChatFlow | +2-3次LLM (对话) | $0.003 | $150 (50次/人/月) |
| 会议纪要 | +5-8次LLM (多步) | $0.01 | $50 (5次/人/月) |
| 任务提取 | +3-5次LLM (多步) | $0.005 | $100 (20次/人/月) |
| 时间规划 | +2-3次LLM (优化) | $0.003 | $30 (10次/人/月) |
| 智能编辑 (高级) | +5-10次LLM (复杂) | $0.015 | $20 (1-2次/人/月) |
| **合计** | - | - | **+$350/月** |

**总成本**: $735/月 (1000用户)  
**单用户成本**: $0.74/月
| **智能图片管理与去重** | ⭐⭐⭐⭐⭐ | 高 | 高 | P1 | Agent (刚需) |

**核心洞察**: Agent 虽然调用次数多，但因为用户使用频率低，总成本增加有限（+91%）

---

## 🎯 决策矩阵

| 功能 | 用户价值 | 开发成本 | Agent必要性 | 优先级 | 建议方案 |
|------|----------|----------|-------------|--------|----------|
| **ChatFlow 多轮对话** | ⭐⭐⭐⭐⭐ | 中 | 高 | P0 | Agent |
| **会议纪要生成** | ⭐⭐⭐⭐⭐ | 高 | 高 | P0 | Agent |
| **多源任务提取** | ⭐⭐⭐⭐⭐ | 高 | 高 | P0 | Agent |
| **智能编辑与批量操作** | ⭐⭐⭐⭐⭐ | 极高 | 极高 | P1 | Agent (高级) |
| **智能时间规划** | ⭐⭐⭐⭐ | 高 | 中 | P1 | Agent (可选) |
| **知识图谱构建** | ⭐⭐⭐ | 高 | 中 | P1 | Agent (可选) |
| **多模态图片理解** | ⭐⭐⭐ | 极高 | 中 | P2 | Agent (后期) |
| 笔记摘要/分类/标签 | ⭐⭐⭐⭐ | 低 | 低 | P0 | Workflow |
| 语音转写 | ⭐⭐⭐⭐ | 低 | 低 | P0 | Workflow |
| 任务分类/优先级 | ⭐⭐⭐⭐ | 低 | 低 | P0 | Workflow |
| RAG 检索 | ⭐⭐⭐⭐ | 中 | 低 | P0 | Workflow |
| 快捷命令 | ⭐⭐⭐ | 低 | 低 | P0 | Workflow |

---

## 🚀 最终建议

### 立即实施 (Workflow)
1. ✅ **AI ChatFlow 基础版**: 单次问答 + 快捷命令
2. ✅ **笔记智能化**: 摘要、分类、标签、语音转写
3. ✅ **任务基础功能**: 分类、优先级、关联推荐
4. ✅ **RAG 检索**: 语义搜索 + Rerank

**时间**: 4周  
**成本**: $385/月 (1000用户)  
**风险**: 低

---
 - 核心功能
### 后续升级 (Agent)
1. 🤖 **ChatFlow 增强**: 多轮对话 + 上下文管理 (Week 5-7)
2. 🤖 **会议纪要**: 自动生成结构化纪要 (Week 8-9)
3. 🤖 **任务提取**: 多源智能提取 (Week 10-11)

**时间**: 6周  
**成本**: +$330/月  
**风险**: 中

---
高级 Agent 功能 (可选)

#### Phase 4A: 智能编辑 Agent (⭐⭐⭐⭐⭐ 差异化竞争力)
1. 🤖 **批量内容创建**: 跨文档语义检索 + 交互式预览插入
3. 🤖 **智能图片管理**: 
   - 跨笔记图片检索与批量插入
   - 文档类图片去重（OCR内容比对）
   - 照片类图片分组（感知哈希 + 质量评分）
   - 用户行为学习（SignalService记录偏好）
4. 🤖 **布局优化**: 批量调整图片/表格布局

**时间**: 6周  
- Week 1-2: 批量创建 + 智能插入
- Week 3-4: 图片管理（去重、分组、检索）
- Week 5-6: 布局优化 + UI打磨

**成本**: +$139/月 ($0.14/用户/月)  
**用户价值**: 极高  
- 这是 **Notion/飞书/Obsidian 都没有的功能组合**
- 图片去重节省30-50%存储空间（用户直接感知价值）
- 跨笔记图片检索是专业图片管理工具（Eagle）的能力下沉到笔记

**建议**: **强烈推荐实施**，作为产品的 Killer Feature  
**优先级**: 图片去重 > 智能插入 > 批量创建 > 布局优化
**建议**: **强烈推荐实施**，作为产品的 Killer Feature

#### Phase 4B: 其他高级功能
### 可选高级功能 (Agent77% 功能用 Workflow 即可，仅 23% 需要 Agent
2. **Agent 价值**: 体现在**多步推理**、**动态决策**、**错误恢复**、**复杂编辑**
3. **成本可控**: Agent 额外成本 +91%，但绝对值低 ($0.74/用户/月)
4. **渐进式实+ 图片管理 Agent 的战略价值
这是一个**高风险、高回报**的功能组合：

**差异化竞争力** (无竞品对标):
- ✅ **Notion**: 无跨页面内容智能插入、无图片去重
- ✅ **飞书**: 无AI文档结构理解、无图片内容识别
- ✅ **Obsidian**: 有双链但无语义定位、无图片管理
- ✅ **Eagle/Billfish**: 专业图片管理但不集成笔记、无文档类去重

**强需求场景**:
1. 项目管理: 批量创建任务、跨文档内容整理
2. 文档整理: 会议图片归档、PPT截图去重
3. 存储优化: 图片去重节省30-50%空间（直接感知价值）
4. 知识管理: 跨笔记语义检索与链接

**技术护城河**:
- 需要深度理解 Slate 数据结构 + 文档语义
- 计算机视觉 + NLP 多模态融合
- 用户行为学习（SignalService）个性化
- 难以被快速复制（需要3-6个月积累）

**风险与挑战**:
- ⚠️ **高开发成本**: 预计需要 6周 + 大量测试
- ⚠️ **算法调优**: 图片去重阈值、质量评分需要迭代
- ⚠️ **用户教育**: 需要引导用户理解 Agent 的能力边界
- ⚠️ **性能优化**: 大规模图片库（1000+张）的处理速度

**实施建议**:
1. **Phase 2**: 完成 Agent 基础功能（ChatFlow、会议纪要、任务提取）
2. **Phase 4A**: 优先实施**图片去重**（用户价值最直接）
3. **Phase 4B**: 实施智能插入（差异化竞争力）
4. **Phase 4C**: 实施批量创建 + 布局优化

**预期ROI**:
- 成本: $0.14/用户/月
- 留存提升: 预计提升15-20%（图片去重解决刚需）
- 付费转化: 作为Premium功能，预计10-15%转化率
- 口碑传播: "唯一能智能管理图片的笔记软件"
### 风险提示
1. **过度工程化**: 不要为了用 Agent 而用 Agent
2. **维护成本**: Agent 的调试和维护比 Workflow 复杂 3-5 倍
3. **用户期待**: Agent 失败时用户会更失望，需要完善的降级方案
4. **复杂度管理**: 智能编辑 Agent 涉及文档结构深度理解，需要大量测试用例

### 智能编辑 Agent 的战略价值
这是一个**高风险、高回报**的功能：
- ✅ **无竞品对标**: Notion AI、飞书文档都没有如此深度的结构化编辑能力
- ✅ **强需求场景**: 项目管理、文档整理、批量操作是刚需
- ✅ **技术护城河**: 需要深度理解 Slate 数据结构 + 文档语义，难以被快速复制
- ⚠️ **高开发成本**: 预计需要 4周 + 大量测试
- ⚠️ **用户教育**: 需要引导用户理解 Agent 的能力边界

**建议**: 在 Phase 2 Agent 基础功能稳定后，优先投入智能编辑 Agent 开发

---

## 📊 完整功能清单与实施矩阵

### 功能分类统计

| 类型 | 数量 | 占比 | 实施优先级 | 预期开发时间 |
|------|------|------|-----------|-------------|
| **Workflow 基础** | 20个 | 65% | P0 (立即) | 4-6周 |
| **Agent 核心** | 3个 | 10% | P0 (立即) | 6-8周 |
| **Agent 高级** | 4个 | 13% | P1 (后续) | 8-12周 |
| **混合模式** | 4个 | 13% | P1-P2 | 4-6周 |

### 详细功能矩阵（按开发优先级排序）

> **说明**: 
> - **复杂度**: [类型] [步骤数] / [分支数] (如: Agent 5步/3分支)
> - **Dependency**: [模块依赖] + [AI功能依赖]
> - **数据样本**: 测试/评估所需的最小数据集规模

#### Phase 0: 基础设施准备 (2周)

| Feature | 所属模块 | 重要性 | 复杂度 | Dependency | 开发优先级 | 数据样本需求 |
|---------|---------|--------|--------|------------|-----------|-------------|
| **RAG基础框架** | RAGIndexService | ⭐⭐⭐⭐⭐ | Workflow 3步/0分支 | - IndexedDB<br>- EmbeddingService (Voyage AI) | **P0-0** (第1周) | - 100条Events<br>- 20条测试query |
| **Embedding生成** | RAGIndexService | ⭐⭐⭐⭐⭐ | Workflow 2步/0分支 | - RAG基础框架<br>- Event/Signal数据 | **P0-0** (第1周) | - 500条chunks<br>- 验证准确性 |
| **向量检索** | RAGIndexService | ⭐⭐⭐⭐⭐ | Workflow 3步/1分支 | - Embedding生成<br>- 相似度算法 | **P0-0** (第2周) | - 50条Golden queries<br>- Pass@10基准 |
| **Signal基础CRUD** | SignalService | ⭐⭐⭐⭐ | Workflow 2步/0分支 | - signals表schema<br>- EventService | **P0-0** (第2周) | - 50条手动标记Signal |

**Phase 0 目标**: 建立AI功能的技术基座，所有后续功能都依赖这4个基础能力。

**Phase 0.5: UserManner 基础框架 (2周，Phase 3 前置)**

| Feature | 所属模块 | 重要性 | 复杂度 | Dependency | 开发优先级 | 数据样本需求 |
|---------|---------|--------|--------|------------|-----------|-------------|
| **UserManner CRUD** | UserMannerService | ⭐⭐⭐⭐ | Workflow 2步/0分支 | - user_manners 表<br>- manner_applications 表 | **P1-0** (Phase 3 前置) | - 5个手动创建的 Manner<br>- 测试数据 |
| **隐式反馈采集** | UserMannerEvaluator | ⭐⭐⭐⭐⭐ | Workflow 3步/0分支 | - EventService 事件监听<br>- UserMannerService | **P1-0** (Phase 3 前置) | - 30条用户操作记录 |

**Phase 0.5 目标**: 建立 UserManner 数据模型，为后续 AI 个性化决策打基础。

---

#### Phase 1: MVP Workflow功能 (4周)

| Feature | 所属模块 | 重要性 | 复杂度 | Dependency | 开发优先级 | 数据样本需求 |
|---------|---------|--------|--------|------------|-----------|-------------|
| **语音笔记转写** | NotesManager | ⭐⭐⭐⭐ | Workflow 3步/0分支 | - Whisper API<br>- EventService | **P0-1** | - 20条语音样本(中英文)<br>- 准确率验证 |
| **笔记摘要生成** | NotesManager | ⭐⭐⭐⭐ | Workflow 1步/0分支 | - LLM API<br>- EventLog | **P0-1** | - 30篇笔记<br>- 人工评分 |
| **自动标签提取** | NotesManager | ⭐⭐⭐⭐ | Workflow 1步/0分支 | - LLM API<br>- 笔记摘要 | **P0-1** | - 50篇笔记<br>- 标签准确率 |
| **自动分类** | NotesManager | ⭐⭐⭐⭐ | Workflow 1步/0分支 | - LLM API 或 Embedding<br>- Few-shot examples | **P0-1** | - 100篇笔记(5类)<br>- 分类准确率>85% |
| **语义搜索(RAG)** | NotesManager | ⭐⭐⭐⭐⭐ | Workflow 4步/1分支 | - RAG基础框架<br>- 向量检索 | **P0-1** | - 100条query<br>- Pass@10>85% |
| **快捷命令** | ChatFlow | ⭐⭐⭐ | Workflow 1步/0分支 | - LLM API<br>- Prompt模板 | **P0-1** | - 6个命令各10次测试 |
| **单次问答** | ChatFlow | ⭐⭐⭐⭐ | Workflow 2步/0分支 | - LLM API<br>- EventLog上下文 | **P0-1** | - 30条问答对 |
| **任务自动分类** | TaskManager | ⭐⭐⭐⭐ | Workflow 1步/0分支 | - LLM API<br>- Few-shot | **P0-1** | - 50条任务(5类) |
| **优先级判断** | TaskManager | ⭐⭐⭐⭐ | Workflow 2步/0分支 | - 规则引擎<br>- LLM API | **P0-1** | - 50条任务<br>- 人工标注优先级 |
| **任务关联推荐** | TaskManager | ⭐⭐⭐ | Workflow 2步/0分支 | - Embedding生成<br>- 向量检索 | **P0-1** | - 30条任务<br>- 关联准确率 |

**Phase 1 交付物**: 
- 用户可以通过 `@ai` 进行基础问答
- 笔记自动整理（摘要/分类/标签）
- 任务智能管理（分类/优先级）
- 基础RAG检索能力

---

#### Phase 2: 核心Agent功能 (8周)

| Feature | 所属模块 | 重要性 | 复杂度 | Dependency | 开发优先级 | 数据样本需求 |
|---------|---------|--------|--------|------------|-----------|-------------|
| **ChatFlow多轮对话** | ChatFlow | ⭐⭐⭐⭐⭐ | Agent 6步/4分支 | - RAG检索<br>- 查询重写<br>- 上下文管理<br>- Rerank API | **P0-2** (Week 1-3) | - 20个多轮对话(3-5轮)<br>- 上下文准确率>90% |
| **查询重写** | ChatFlow (子功能) | ⭐⭐⭐⭐ | Workflow 1步/0分支 | - LLM API<br>- 对话历史 | P0-2 (依赖) | - 50条多轮query<br>- 重写质量评估 |
| **Rerank优化** | RAGIndexService | ⭐⭐⭐⭐ | Workflow 1步/0分支 | - Jina Rerank API<br>- 向量检索 | P0-2 (可选) | - Pass@10提升测试 |
| **会议纪要生成** | NotesManager | ⭐⭐⭐⭐⭐ | Agent 6步/5分支 | - Whisper API<br>- Speaker Diarization<br>- LLM (主题/决策/行动项) | **P0-2** (Week 4-6) | - 10段会议录音(30-60分钟)<br>- 人工评分准确率 |
| **多源任务提取** | TaskManager | ⭐⭐⭐⭐⭐ | Agent 5步/6分支 | - OCR API<br>- QR识别<br>- LLM NER<br>- 日期解析 | **P0-2** (Week 7-8) | - 20张活动海报<br>- 20封邮件<br>- 10段会议纪要 |

**复杂度说明**:
- **ChatFlow多轮对话**: 
  - 步骤: 意图理解 → 检索判断 → 查询重写 → RAG检索 → Rerank → Prompt构建 → 生成回答
  - 分支: 需要检索?、检索成功?、模型选择、后续问题生成
- **会议纪要生成**:
  - 步骤: ASR → 说话人分离 → 主题分割 → 决策提取 → 行动项识别 → 质量验证
  - 分支: ASR质量、说话人识别、语言切换、结构化失败、重试策略
- **多源任务提取**:
  - 步骤: 输入类型识别 → 处理流程选择 → 信息提取 → 结构化 → 置信度评估
  - 分支: 图片/邮件/会议、OCR失败、日期解析、假日跳过、人工确认、关联Event

**Phase 2 交付物**:
- 多轮对话能力（理解上下文、智能检索）
- 会议自动化（录音 → 结构化纪要）
- 任务智能提取（图片/邮件/会议 → 任务）

---

#### Phase 3: 高级Agent功能 (12周)

| Feature | 所属模块 | 重要性 | 复杂度 | Dependency | 开发优先级 | 数据样本需求 |
|---------|---------|--------|--------|------------|-----------|-------------|
| **批量内容创建** | NotesManager | ⭐⭐⭐⭐⭐ | Agent 7步/5分支 | - 表格解析 (LLM)<br>- 日期计算<br>- 假日API<br>- EventService | **P1-3A** (Week 1-2) | - 10个复杂表格<br>- 假日场景测试 |
| **智能内容插入** | NotesManager | ⭐⭐⭐⭐⭐ | Agent 7步/6分支 | - RAG全局检索<br>- 文档结构解析 (LLM)<br>- 格式调整 (LLM)<br>- Diff生成 | **P1-3A** (Week 3-5) | - 30篇候选文档<br>- 20条插入测试<br>- 章节匹配准确率>80% |
| **文档结构解析** | NotesManager (子功能) | ⭐⭐⭐⭐ | Workflow 2步/1分支 | - LLM API<br>- Markdown解析 | P1-3A (依赖) | - 20篇结构化文档 |
| **图片跨笔记检索** | MediaService | ⭐⭐⭐⭐ | Agent 5步/3分支 | - RAG检索<br>- OCR API<br>- CLIP分类<br>- 相关性评分 (LLM) | **P1-3B** (Week 6-7) | - 100张图片(5个项目)<br>- OCR准确率<br>- 检索准确率>75% |
| **智能图片去重** | MediaService | ⭐⭐⭐⭐⭐ | Agent 6步/4分支 | - OCR API<br>- pHash算法<br>- 图像质量评估 (sharp)<br>- 美学评分 (NIMA可选)<br>- SignalService | **P1-3B** (Week 8-10) | - 200张图片(含重复)<br>- 去重准确率>90%<br>- 用户偏好学习 |
| **智能时间规划** | TaskManager | ⭐⭐⭐⭐ | Agent 6步/5分支 | - CalendarService<br>- 精力分析 (历史数据)<br>- 依赖解析<br>- 约束求解<br>- LLM微调 | **P1-3C** (Week 11-12) | - 30条任务<br>- 14天日历数据<br>- 用户满意度>75% |

**复杂度说明**:
- **批量内容创建**:
  - 步骤: 意图解析 → 表格解析 → 日期计算 → 假日检查 → 预览生成 → 用户确认 → 批量创建
  - 分支: 表格格式、日期规则、假日跳过、用户取消、关联失败
- **智能内容插入**:
  - 步骤: 内容语义理解 → RAG全局检索 → 文档结构解析 → 章节匹配 → 格式调整 → 预览卡片 → 执行插入
  - 分支: 无候选文档、Top3生成、格式调整失败、用户取消、多候选选择、插入失败
- **智能图片去重**:
  - 步骤: 图片分类 (文档/照片) → OCR/pHash → 相似度计算 → 质量评分 → 分组展示 → 用户确认
  - 分支: 文档类/照片类、OCR失败、质量评估、用户偏好学习

**Phase 3 交付物**:
- 高级编辑能力（批量创建、智能插入）
- 图片智能管理（去重、检索）
- 智能时间规划

---

#### Phase 3D: UserManner AI 模式挖掘 (4周)

| Feature | 所属模块 | 重要性 | 复杂度 | Dependency | 开发优先级 | 数据样本需求 |
|---------|---------|--------|--------|------------|-----------|-------------|
| **AI 模式挖掘** | UserMannerAgent | ⭐⭐⭐⭐⭐ | Agent 5步/4分支 | - SignalService<br>- LLM API (GPT-4)<br>- Signal 聚合算法<br>- 相似度检测 | **P1-3D** (Week 1-4) | - 500条 Signal 数据<br>- 10个人工标注模式<br>- LLM Prompt 调优 |
| **跨服务权重应用** | 各 Agent | ⭐⭐⭐⭐ | Agent 4步/3分支 | - UserMannerService<br>- ChatFlow/Task/Notes/Media Agent | **P1-3D** (Week 3-4) | - 20次权重调整测试<br>- A/B 测试数据 |

**复杂度说明**:
- **AI 模式挖掘**:
  - 步骤: Signal 聚合 → LLM 识别模式 → 相似度检测 → 合并/创建 Manner → 置信度评估
  - 分支: 低频跳过、相似模式合并、新模式创建、用户确认
- **跨服务权重应用**:
  - 步骤: 查询 Manner → 权重计算 → 结果调整 → 应用日志记录
  - 分支: 无 Manner、多 Manner 冲突、权重阈值过滤

**Phase 3D 交付物**:
- 自动归纳用户行为模式（LLM 驱动）
- 所有 AI 服务集成 UserManner 权重
- 持续学习闭环（反馈 → 权重调整）

---

#### Phase 4: 可选高级功能 (按需实施)

| Feature | 所属模块 | 重要性 | 复杂度 | Dependency | 开发优先级 | 数据样本需求 |
|---------|---------|--------|--------|------------|-----------|-------------|
| **知识图谱构建** | NotesManager | ⭐⭐⭐ | Agent 5步/4分支 | - NER模型 (多选)<br>- 关系抽取 (LLM)<br>- 实体链接 (Wikidata)<br>- 图谱合并 | **P2-4** | - 100篇笔记<br>- 实体准确率>80%<br>- 关系准确率>70% |
| **多模态图片理解** | NotesManager | ⭐⭐⭐ | Agent 5步/5分支 | - 多OCR引擎<br>- 布局分析 (LayoutLM)<br>- 表格检测 (YOLO)<br>- 公式识别 (Mathpix) | **P2-4** | - 50张白板/手写/图表<br>- OCR准确率>85% |
| **笔记智能补全** | NotesManager | ⭐⭐⭐ | 混合 3步/2分支 | - RAG检索<br>- 文档结构理解<br>- LLM生成 | **P2-4** | - 30个补全场景<br>- 用户接受率>60% |
| **批量任务排序** | TaskManager | ⭐⭐⭐ | 混合 3步/2分支 | - 规则引擎<br>- 依赖解析<br>- LLM优化 (可选) | **P2-4** | - 50条任务<br>- 排序合理性评估 |

**Phase 4 特点**:
- 非刚需功能，根据用户反馈决定
- 技术难度高，需要专门算法支持
- 数据需求大，需要持续迭代

---

### 关键依赖关系图

```
Phase 0: 基础设施
├─ RAG基础框架 ──┐
├─ Embedding生成 ─┤
├─ 向量检索 ──────┤
└─ Signal CRUD ───┤
                  ▼
Phase 1: Workflow基础 ──────────┐
├─ 语音转写                      │
├─ 笔记摘要/分类/标签 ──┐       │
├─ 语义搜索 ────────────┤       │
├─ 快捷命令              │       │
├─ 单次问答 ────────────┤       │
└─ 任务分类/优先级       │       │
                        ▼       ▼
Phase 2: 核心Agent ──────────────┤
├─ ChatFlow多轮对话 ─────────────┤ 依赖: RAG检索、查询重写
├─ 会议纪要生成                  │ 依赖: 语音转写
└─ 多源任务提取 ─────────────────┤ 依赖: OCR、任务分类
                                ▼
Phase 3: 高级Agent
├─ 批量内容创建 ─────────────────┤ 依赖: EventService
├─ 智能内容插入 ─────────────────┤ 依赖: RAG检索、文档结构解析
├─ 图片检索/去重 ────────────────┤ 依赖: MediaService、Signal学习
├─ 智能时间规划 ─────────────────┤ 依赖: CalendarService、任务分类
└─ UserManner AI 模式挖掘 ───────┤ 依赖: SignalService、LLM、所有 Agent
                                │
                                ▼
                    (持续学习闭环建立)

Phase 4: 可选功能 (独立实施)
```

---

### 数据样本需求汇总

| Phase | 总样本量 | 关键数据集 | 标注工作量 | 持续更新 |
|-------|---------|-----------|-----------|---------|
| **Phase 0** | 650条 | - 100 Events<br>- 500 chunks<br>- 50 queries | ✅ 低 (自动生成) | ❌ 一次性 |
| **Phase 1** | 466条 | - 100篇笔记<br>- 50条任务<br>- 100条query | ⚠️ 中 (人工标注) | ✅ 每月10条 |
| **Phase 2** | 120条 | - 20段对话<br>- 10段会议录音<br>- 50封邮件/海报 | ⚠️ 高 (复杂标注) | ✅ 每月5条 |
| **Phase 3** | 300条 | - 30篇文档<br>- 200张图片<br>- 30条任务+日历 | ⚠️ 高 (多模态) | ✅ 每周5条 |
| **Phase 3D (UserManner)** | 510条 | - 500条 Signal<br>- 10个人工标注模式 | ⚠️ 高 (LLM 调优) | ✅ 每周10条 Signal |
| **Phase 4** | 200条 | - 100篇笔记(图谱)<br>- 50张复杂图片 | ⚠️ 极高 (专业) | ✅ 每月10条 |

**数据准备策略**:
1. **Phase 0-1**: 使用现有数据 + 少量人工标注 (2周准备)
2. **Phase 2**: 需要专门录制会议、收集真实邮件 (4周准备)
3. **Phase 3**: 需要大规模图片库、多项目文档 (6周准备)
4. **Phase 4**: 需要领域专家标注、持续迭代 (持续进行)

**标注工具**:
- Phase 0-1: 表格工具 (Excel/Notion)
- Phase 2-3: 专业标注平台 (Label Studio)
- Phase 4: 自定义标注工具

---

### 开发路线图总览

```
时间轴 (32周 = 8个月)

Week 1-2:   Phase 0 - 基础设施准备
             └─ RAG框架 + Embedding + 向量检索 + Signal

Week 3-6:   Phase 1 - MVP Workflow (第1批)
             └─ 语音转写、笔记摘要、标签分类、语义搜索

Week 7-10:  Phase 1 - MVP Workflow (第2批) + 测试
             └─ ChatFlow单次问答、快捷命令、任务管理

Week 11-13: Phase 2 - ChatFlow Agent
             └─ 多轮对话 + 上下文管理 + RAG集成

Week 14-16: Phase 2 - 会议纪要 Agent
             └─ ASR + 说话人识别 + 结构化生成

Week 17-18: Phase 2 - 任务提取 Agent
             └─ 多源识别 + OCR + 结构化

Week 19-20: Phase 3A - 批量创建 Agent
             └─ 表格解析 + 日期计算 + 批量操作

Week 21-23: Phase 3A - 智能插入 Agent
             └─ 全局检索 + 结构解析 + 交互预览

Week 24-25: Phase 3B - 图片检索 Agent
             └─ 多模态检索 + OCR + CLIP分类

Week 26-28: Phase 3B - 图片去重 Agent
             └─ pHash + 质量评分 + 行为学习

Week 29-30: Phase 3C - 智能时间规划 Agent
             └─ 约束求解 + 精力分析 + LLM微调

Week 31-34: Phase 3D - UserManner AI 模式挖掘
             └─ Signal聚合 + LLM识别 + 跨服务集成 + 持续学习闭环

Week 35-36: 集成测试 + 性能优化 + 文档完善
```

**里程碑**:
- ✅ Week 2: RAG基础可用 (Pass@10 > 85%)
- ✅ Week 10: Workflow功能完整 (覆盖80%日常需求)
- ✅ Week 18: Agent核心完成 (差异化竞争力)
- ✅ Week 30: Agent高级完成 (Killer Feature)
- ✅ Week 34: UserManner 自进化系统上线 (越用越懂你)

---

### 技术栈与学习曲线

| 技术 | Phase 0-1 | Phase 2 | Phase 3-4 | 学习难度 | 建议资源 |
|------|-----------|---------|-----------|---------|---------|
| **Prompt工程** | ✅ 必需 | ✅ 必需 | ✅ 必需 | ⭐⭐ | OpenAI Cookbook |
| **LangChain/LangGraph** | ⚠️ 可选 | ✅ 推荐 | ✅ 必需 | ⭐⭐⭐ | LangChain文档 |
| **RAG架构** | ✅ 必需 | ✅ 必需 | ✅ 必需 | ⭐⭐⭐⭐ | Anthropic Guide |
| **Agent框架** | ❌ 不需要 | ✅ 必需 | ✅ 必需 | ⭐⭐⭐⭐⭐ | AutoGPT/BabyAGI |
| **多模态AI** | ❌ 不需要 | ⚠️ 可选 | ✅ 推荐 | ⭐⭐⭐⭐ | OpenAI Vision API |
| **向量数据库** | ✅ 必需 | ✅ 必需 | ✅ 必需 | ⭐⭐⭐ | Chroma/Qdrant |

**学习路径建议** (考虑无AI开发经验):
1. **Week 1-2**: Prompt工程基础 + LLM API调用
2. **Week 3-4**: RAG原理 + Embedding生成
3. **Week 5-6**: LangChain基础 + Chain编排
4. **Week 7-10**: Agent概念 + 状态管理
5. **Week 11+**: 多模态AI + 高级Agent模式

**风险缓解**:
- 📚 每周投入10小时学习新技术
- 🧪 小范围试验后再全面推广
- 👥 寻找AI开发社区支持 (Discord/论坛)
- 📊 持续监控性能指标，及时调优

---

**文档版本**: v1.0  
**创建日期**: 2026-01-09  
**分析人**: GitHub Copilot (Claude Sonnet 4.5)
