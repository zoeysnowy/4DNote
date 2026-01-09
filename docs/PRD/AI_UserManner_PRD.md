# AI UserManner PRD - 用户行为模式学习系统

**版本**: v1.0  
**日期**: 2026-01-10  
**状态**: 设计阶段  
**优先级**: P1 (高级功能，Phase 3-4)

---

## 📋 目录

1. [产品概述](#产品概述)
2. [核心概念](#核心概念)
3. [架构设计](#架构设计)
4. [功能详细设计](#功能详细设计)
5. [数据模型](#数据模型)
6. [与现有模块集成](#与现有模块集成)
7. [实施路线](#实施路线)
8. [风险与挑战](#风险与挑战)
9. [成功指标](#成功指标)

---

## 产品概述

### 1.1 产品定位

UserManner 是 4DNote 的**自进化用户意图学习系统**，通过分析用户行为 Signal，自动归纳个性化行为模式，并将这些模式应用到所有 AI 智能服务中，实现**越用越懂你**的智能体验。

**核心价值**:
- 🧠 **自动学习**: AI 自动识别用户习惯，无需手动配置
- 🎯 **个性化决策**: 每个用户的 AI 服务都基于其独特偏好优化
- 🔄 **持续进化**: 通过反馈闭环，系统自动调整权重，越用越准
- 🔍 **可解释性**: 用户能理解 AI 为什么做出某个决策
- 🛡️ **隐私保护**: 所有学习数据本地存储，不上传云端

### 1.2 产品目标

| 目标 | 指标 | 现状 | 目标值 |
|------|------|------|--------|
| **个性化准确率** | AI 建议被用户采纳的比例 | - | >70% |
| **学习速度** | 从注册到建立有效 Manner 的天数 | - | <14天 |
| **用户满意度** | AI 服务体验评分（1-5） | - | >4.2 |
| **适应性** | 权重调整响应速度（接受/拒绝后） | - | 实时更新 |
| **冷启动时间** | 新用户首个 Manner 生成时间 | - | <7天 |

### 1.3 适用场景

**场景 1: 内容偏好学习**
- **用户行为**: 总是在会议纪要中标记行动项
- **学习模式**: "会议行动项偏好"
- **自适应决策**: TaskManager 自动提取会议中的 TODO，优先级提升

**场景 2: 时间习惯识别**
- **用户行为**: 每晚 9 点后标记明天的任务
- **学习模式**: "晚间规划习惯"
- **自适应决策**: 21:00 后提示"规划明天任务"，自动设置 dueDate 为明天

**场景 3: 搜索模式优化**
- **用户行为**: 80% 的搜索是技术文档相关
- **学习模式**: "技术内容偏好"
- **自适应决策**: RAG 检索时，技术类笔记权重 +30%

**场景 4: 交互风格适配**
- **用户行为**: 经常修改 AI 生成的内容（高编辑率）
- **学习模式**: "详细预览偏好"
- **自适应决策**: AI 建议时，默认显示详细预览而非直接执行

**场景 5: 图片质量偏好**
- **用户行为**: 图片去重时，总是保留高分辨率版本
- **学习模式**: "高分辨率偏好"
- **自适应决策**: 图片质量评分时，分辨率权重 +20%

---

## 核心概念

### 2.1 核心工作流

```
用户行为 (Signal)
    ↓ 聚合分析
UserMannerAgent (AI 模式挖掘)
    ↓ 归纳模式
UserManner (行为模式抽象)
    ↓ 应用权重
智能服务决策 (ChatFlow/NotesManager/TaskManager/MediaManager)
    ↓ 用户反馈
UserMannerEvaluator (自动评估)
    ↓ 权重调整
更新 UserManner.decisionWeight
    ↓ 循环迭代
持续优化决策
```

### 2.2 关键概念定义

#### UserManner（用户行为模式）

**定义**: 从用户 Signal 中归纳出的稳定行为模式，包含触发条件、所需数据、目标服务、决策权重。

**示例**:
```json
{
  "name": "会议纪要行动项偏好",
  "description": "用户在会议纪要中高频标记行动项，倾向于立即提取 TODO",
  "category": "content_preference",
  "triggerPattern": {
    "signalTypes": ["highlight", "action_item"],
    "contextFilters": { "eventTypes": ["meeting_notes"] },
    "minOccurrence": 10
  },
  "targetServices": [
    { "service": "TaskManager", "actions": ["auto_extract_tasks"] }
  ],
  "decisionWeight": 0.85,
  "confidence": 0.92
}
```

#### UserMannerCategory（模式分类）

| 分类 | 说明 | 示例 |
|------|------|------|
| `content_preference` | 内容偏好 | 喜欢技术文档、会议纪要 |
| `time_preference` | 时间偏好 | 晚间规划、早晨回顾 |
| `interaction_style` | 交互风格 | 喜欢高亮、喜欢问答、详细预览 |
| `organization_habit` | 组织习惯 | 喜欢标签、喜欢分类 |
| `search_pattern` | 搜索模式 | 关键词 vs 语义搜索 |
| `decision_style` | 决策风格 | 快速确认 vs 详细预览 |

#### Decision Weight（决策权重）

**定义**: 0-1 的数值，表示该 UserManner 对决策的影响强度。

**权重解释**:
- `0.0 - 0.3`: 低置信度，仅作为辅助参考
- `0.3 - 0.7`: 中等置信度，适度影响决策
- `0.7 - 1.0`: 高置信度，显著影响决策

**更新机制**: 指数移动平均（EMA）
```typescript
newWeight = oldWeight * (1 - α) + score * α
// α = 0.2 (学习率)
```

### 2.3 反馈闭环机制

#### 隐式反馈（推荐，用户无感知）

| 用户行为 | 反馈类型 | 评分 | 说明 |
|---------|---------|------|------|
| 接受 AI 建议 | `accept` | 1.0 | 用户点击"应用"或"确认" |
| 修改后接受 | `modify` | 0.7 | 用户修改 AI 生成内容后保存 |
| 忽略建议 | `ignore` | 0.3 | 用户未操作，建议超时关闭 |
| 删除 AI 内容 | `reject` | 0.0 | 用户删除 AI 创建的 Event/Task |

#### 显式反馈（可选，用户主动评价）

```typescript
// UI 示例
<AISuggestion>
  <Content>{suggestion.text}</Content>
  <FeedbackButtons>
    <ThumbsUp onClick={() => feedback('positive')} />  // 评分: 1.0
    <ThumbsDown onClick={() => feedback('negative')} />  // 评分: 0.0
  </FeedbackButtons>
</AISuggestion>
```

---

## 架构设计

### 3.1 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                   Data Collection Layer                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Signal     │  │   Event      │  │  Interaction │  │
│  │   Capture    │  │   Tracking   │  │   Logging    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ Raw Data
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Pattern Mining Layer                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │            UserMannerAgent (AI)                   │  │
│  │  • Signal 聚合分析                                │  │
│  │  • LLM 模式识别                                   │  │
│  │  • 相似模式合并                                   │  │
│  │  • UserManner 创建                                │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ UserManner
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Application Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐│
│  │ChatFlow  │  │NotesManager│ │TaskManager│ │Media    ││
│  │Agent     │  │Agent       │ │Agent      │ │Manager  ││
│  │          │  │            │ │           │ │Agent    ││
│  │应用权重  │  │应用权重    │ │应用权重   │ │应用权重 ││
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘│
└────────────────────────┬────────────────────────────────┘
                         │ User Feedback
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Evaluation Layer                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │          UserMannerEvaluator                      │  │
│  │  • 隐式反馈采集                                   │  │
│  │  • 显式反馈记录                                   │  │
│  │  • 权重自适应调整                                 │  │
│  │  • 低效模式废弃                                   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ Weight Update
                         ▼
                  Update UserManner
                         │
                         └──────┐
                                │ Feedback Loop
                                └──► (循环)
```

### 3.2 模块职责

#### UserMannerService（核心服务）

**职责**: UserManner 的 CRUD 和查询

**接口**:
```typescript
class UserMannerService {
  // CRUD
  static async create(data: Partial<UserManner>): Promise<UserManner>;
  static async get(id: string): Promise<UserManner | null>;
  static async update(id: string, data: Partial<UserManner>): Promise<void>;
  static async delete(id: string): Promise<void>;
  
  // 查询
  static async getActiveManners(userId: string, filters?: {
    targetService?: string;
    category?: UserMannerCategory;
    minWeight?: number;
  }): Promise<UserManner[]>;
  
  static async getAll(userId: string): Promise<UserManner[]>;
  
  // 应用日志
  static async logApplication(
    mannerId: string,
    context: { appliedTo: string; service: string; action: string }
  ): Promise<void>;
}
```

**Single Writer**: 只有 `UserMannerService` 能写入 `user_manners` 表（符合 SSOT）

#### UserMannerAgent（AI 模式挖掘）

**职责**: 从 Signal 中自动归纳 UserManner

**工作流**:
```typescript
class UserMannerAgent {
  /**
   * 定期分析 Signal 数据，归纳新的 UserManner
   * 
   * 触发时机: 
   * - 每周自动运行
   * - 积累 100 条新 Signal 后
   * - 用户主动请求
   */
  async mineUserManners(userId: string): Promise<UserManner[]> {
    // 1. 获取近期 Signal 数据 (30天)
    const signals = await SignalService.getRecentSignals(userId, { days: 30 });
    
    // 2. 聚合分析
    const aggregated = this.aggregateSignals(signals);
    // 示例输出: { 
    //   highlightInMeetings: 45次, 
    //   questionInTechDocs: 32次,
    //   actionItemAt21h: 28次 
    // }
    
    // 3. LLM 模式识别
    const patterns = await this.llm.chat({
      model: 'gpt-4',
      prompt: `
分析以下用户行为数据，识别明显的行为模式...
${JSON.stringify(aggregated, null, 2)}
`,
      responseFormat: 'json'
    });
    
    // 4. 验证并创建 UserManner
    const newManners: UserManner[] = [];
    for (const pattern of patterns) {
      if (pattern.confidence < 0.7) continue;  // 低置信度跳过
      
      const existing = await this.findSimilarManner(pattern);
      if (existing) {
        await this.mergeManner(existing, pattern);
      } else {
        const manner = await UserMannerService.create({
          ...pattern,
          userId,
          decisionWeight: 0.5,  // 初始权重
          status: 'learning'    // 学习阶段
        });
        newManners.push(manner);
      }
    }
    
    return newManners;
  }
}
```

#### UserMannerEvaluator（自动评估）

**职责**: 评估 UserManner 效果，自适应调整权重

**核心算法**:
```typescript
class UserMannerEvaluator {
  /**
   * 评估单次 UserManner 应用效果
   */
  async evaluateApplication(
    mannerId: string,
    applicationContext: {
      appliedTo: string;
      userAction: 'accept' | 'reject' | 'modify' | 'ignore';
      timestamp: string;
    }
  ): Promise<void> {
    const manner = await UserMannerService.get(mannerId);
    
    // 1. 计算本次评分
    const score = this.calculateScore(applicationContext.userAction);
    
    // 2. 指数移动平均更新权重
    const alpha = 0.2;  // 学习率
    const newWeight = manner.decisionWeight * (1 - alpha) + score * alpha;
    
    // 3. 记录评估历史
    await UserMannerService.update(mannerId, {
      decisionWeight: newWeight,
      evaluationHistory: [
        ...manner.evaluationHistory,
        {
          timestamp: applicationContext.timestamp,
          appliedTo: applicationContext.appliedTo,
          userFeedback: this.mapActionToFeedback(applicationContext.userAction),
          score,
          adjustedWeight: newWeight
        }
      ]
    });
    
    // 4. 检查是否需要降级/废弃
    if (newWeight < 0.2 && manner.stats.totalApplications > 20) {
      await UserMannerService.update(mannerId, { status: 'deprecated' });
    } else if (newWeight > 0.8 && manner.stats.totalApplications > 10) {
      await UserMannerService.update(mannerId, { status: 'active' });
    }
  }
  
  private calculateScore(action: string): number {
    switch (action) {
      case 'accept': return 1.0;
      case 'modify': return 0.7;
      case 'ignore': return 0.3;
      case 'reject': return 0.0;
      default: return 0.5;
    }
  }
}
```

---

## 功能详细设计

### 4.1 Feature 1: AI 模式挖掘

**功能描述**: 自动从 Signal 数据中识别用户行为模式

**触发条件**:
- 每周日 凌晨 2:00 自动运行
- 新增 Signal 数量 >= 100 条
- 用户手动触发："分析我的使用习惯"

**算法流程**:

```typescript
// 1. Signal 聚合
const aggregated = signals.reduce((acc, signal) => {
  const key = `${signal.type}_${getEventType(signal.eventId)}_${getTimeSlot(signal.timestamp)}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

// 2. 过滤高频模式（至少 10 次）
const highFreq = Object.entries(aggregated).filter(([_, count]) => count >= 10);

// 3. LLM 模式识别
const prompt = `
分析以下用户行为数据，识别 3-5 个最明显的行为模式：

${highFreq.map(([pattern, count]) => `- ${pattern}: ${count}次`).join('\n')}

要求：
1. 模式名称简洁清晰（如"会议行动项偏好"）
2. 说明触发条件（Signal 类型 + 上下文过滤）
3. 推断用户意图（为什么这样做？）
4. 推荐关联的智能服务（ChatFlow/TaskManager/NotesManager/MediaManager）
5. 置信度评估（0-1）

输出 JSON 格式。
`;

const patterns = await llm.chat({ prompt, responseFormat: 'json' });
```

**输出示例**:
```json
[
  {
    "name": "会议纪要行动项偏好",
    "description": "用户在会议纪要中高频标记行动项，倾向于立即提取 TODO",
    "category": "content_preference",
    "triggerPattern": {
      "signalTypes": ["highlight", "action_item"],
      "contextFilters": { "eventTypes": ["meeting_notes"] },
      "minOccurrence": 10
    },
    "targetServices": [
      { "service": "TaskManager", "actions": ["auto_extract_tasks", "priority_boost"] }
    ],
    "confidence": 0.92
  }
]
```

**防止误判**:
- 最小样本量: 10 次
- 置信度阈值: 0.7
- 相似模式合并（避免重复）

### 4.2 Feature 2: ChatFlow 集成

**功能描述**: 在多轮对话中应用 UserManner 权重

**应用场景**:

**场景 A: RAG 检索权重调整**
```typescript
class ChatFlowAgent {
  async answer(query: string, userId: string) {
    // 1. 获取用户的 UserManner
    const manners = await UserMannerService.getActiveManners(userId, {
      targetService: 'ChatFlow',
      category: 'content_preference',
      minWeight: 0.5
    });
    
    // 2. RAG 检索
    let ragResults = await RAGIndexService.search(query, { topK: 20 });
    
    // 3. 应用 UserManner 权重
    if (manners.length > 0) {
      ragResults = ragResults.map(chunk => {
        let adjustedScore = chunk.score;
        
        for (const manner of manners) {
          // 检查是否匹配触发条件
          if (this.matchesTriggerPattern(chunk, manner)) {
            // 权重加成: adjustedScore *= (1 + weight * 0.5)
            adjustedScore *= (1 + manner.decisionWeight * 0.5);
          }
        }
        
        return { ...chunk, score: adjustedScore };
      }).sort((a, b) => b.score - a.score);
    }
    
    // 4. 生成回答
    const answer = await this.llm.chat({
      prompt: this.buildPrompt(query, ragResults)
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

**示例效果**:
- 用户 A 经常搜索技术文档 → 技术类笔记权重 +30%
- 用户 B 经常搜索会议纪要 → 会议类笔记权重 +30%
- 同样的问题，不同用户得到不同的检索结果

**场景 B: LLM 参数自适应**
```typescript
// 根据 UserManner 动态调整 temperature
private getAdaptiveTemperature(manners: UserManner[]): number {
  const creativityManner = manners.find(m => 
    m.category === 'interaction_style' && m.name.includes('创意')
  );
  
  return creativityManner && creativityManner.decisionWeight > 0.7
    ? 0.9  // 高创意用户：提高 temperature
    : 0.3; // 精确用户：降低 temperature
}
```

### 4.3 Feature 3: TaskManager 集成

**功能描述**: 根据用户习惯自动提取/优先级调整任务

**场景 A: 自动提取 vs 预览确认**
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
      await this.evaluateMannerApplication(autoExtractManner, tasks);
    } else {
      // 用户习惯手动确认，显示预览
      const tasks = await this.llm.extractTasks(event.content);
      await this.showConfirmationDialog(tasks);
    }
  }
}
```

**场景 B: 优先级智能调整**
```typescript
// 用户总是在会议中标记的任务设置为高优先级
if (manner.name === '会议行动项偏好' && event.type === 'meeting_notes') {
  task.priority = 'high';  // 自动提升优先级
}
```

### 4.4 Feature 4: NotesManager 集成

**功能描述**: 智能内容插入时，根据用户偏好选择目标文档

**场景: 智能插入目标选择**
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
      if (doc.tags.includes('技术') && this.hasTechPreference(manners)) {
        score *= 1.3;
      }
      
      return { ...doc, score };
    }).sort((a, b) => b.score - a.score);
    
    return scored.slice(0, 3);  // Top 3 候选
  }
}
```

### 4.5 Feature 5: MediaManager 集成

**功能描述**: 图片去重时，根据用户偏好选择保留版本

**场景: 图片质量评分个性化**
```typescript
class SmartMediaDeduplicationAgent {
  async evaluateImageQuality(image: MediaArtifact, userId: string) {
    // 基础评分
    let score = 0.5;
    
    // 分辨率评分
    const resolutionScore = this.calculateResolutionScore(image.width, image.height);
    
    // 获取用户的图片偏好
    const manners = await UserMannerService.getActiveManners(userId, {
      category: 'content_preference',
      targetService: 'MediaManager'
    });
    
    // 根据用户偏好调整权重
    const resolutionPreference = manners.find(m => 
      m.name.includes('高分辨率')
    );
    
    if (resolutionPreference) {
      // 用户偏好高分辨率，分辨率权重 +20%
      const resolutionWeight = 0.4 + resolutionPreference.decisionWeight * 0.2;
      score = resolutionScore * resolutionWeight + otherScores * (1 - resolutionWeight);
    }
    
    return score;
  }
}
```

### 4.6 Feature 6: 用户管理界面

**界面原型**:

```
┌─────────────────────────────────────────────────────────┐
│  🧠 我的使用习惯                                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📊 已学习到 5 个行为模式                                │
│  📅 上次分析: 2026-01-08                                 │
│  [🔄 重新分析]  [➕ 手动添加]  [⚙️ 设置]                 │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ 会议纪要行动项偏好 ──────────────────┐ 🟢 活跃      │
│  │  📝 内容偏好  |  📊 置信度: 92%  |  ⚖️ 权重: 0.85   │
│  │                                                      │
│  │  📍 触发条件: 在会议纪要中标记行动项                 │
│  │  🎯 应用到: TaskManager (自动提取任务)               │
│  │  📈 成功率: 87% (应用 45 次)                         │
│  │                                                      │
│  │  💡 说明: 您经常在会议记录中标记待办事项，系统会     │
│  │           自动帮您提取为任务，并提升优先级           │
│  │                                                      │
│  │  [📊 查看历史]  [✏️ 编辑]  [🗑️ 删除]                │
│  └──────────────────────────────────────────────────────┘
│                                                          │
│  ┌─ 技术内容偏好 ────────────────────────┐ 🟢 活跃      │
│  │  📚 搜索模式  |  📊 置信度: 88%  |  ⚖️ 权重: 0.78   │
│  │                                                      │
│  │  📍 触发条件: 80% 的搜索涉及技术文档                 │
│  │  🎯 应用到: ChatFlow (RAG 检索权重调整)              │
│  │  📈 成功率: 82% (应用 67 次)                         │
│  │                                                      │
│  │  💡 说明: 您偏好技术类内容，搜索时技术笔记会         │
│  │           优先展示                                   │
│  │                                                      │
│  │  [📊 查看历史]  [✏️ 编辑]  [🗑️ 删除]                │
│  └──────────────────────────────────────────────────────┘
│                                                          │
│  ┌─ 晚间规划习惯 ────────────────────────┐ 🟡 学习中    │
│  │  ⏰ 时间偏好  |  📊 置信度: 65%  |  ⚖️ 权重: 0.52   │
│  │                                                      │
│  │  📍 触发条件: 21:00 后标记明天任务                   │
│  │  🎯 应用到: TaskManager (dueDate 自动设置明天)       │
│  │  📈 成功率: 68% (应用 12 次)                         │
│  │                                                      │
│  │  💡 说明: 系统仍在学习您的晚间规划习惯，需要更       │
│  │           多数据才能稳定生效                         │
│  │                                                      │
│  │  [📊 查看历史]  [✏️ 编辑]  [🗑️ 删除]                │
│  └──────────────────────────────────────────────────────┘
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**功能**:
- ✅ 查看所有 UserManner
- ✅ 查看详细统计（成功率、应用次数、权重变化曲线）
- ✅ 手动编辑/删除 Manner
- ✅ 手动触发重新分析
- ✅ 导入/导出 Manner（迁移设备时）

---

## 数据模型

### 5.1 user_manners 表

```sql
CREATE TABLE user_manners (
  id TEXT PRIMARY KEY,              -- manner_${nanoid()}
  user_id TEXT NOT NULL,            -- FK → users.id
  name TEXT NOT NULL,               -- "会议纪要行动项偏好"
  description TEXT,                 -- AI 生成的解释
  category TEXT NOT NULL,           -- content_preference / time_preference / ...
  trigger_pattern JSON NOT NULL,    -- 触发条件
  required_data_schema JSON,        -- 所需数据类型
  target_services JSON NOT NULL,    -- 关联服务
  decision_weight REAL DEFAULT 0.5, -- 决策权重 (0-1)
  confidence REAL DEFAULT 0.5,      -- 模式置信度 (0-1)
  evaluation_history JSON,          -- 评估历史
  status TEXT DEFAULT 'learning',   -- active / learning / deprecated
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,         -- ai / user
  last_applied_at TEXT,             -- 上次应用时间
  stats JSON                        -- 统计数据
);

CREATE INDEX idx_user_manners_user_status ON user_manners(user_id, status);
CREATE INDEX idx_user_manners_category ON user_manners(category);
CREATE INDEX idx_user_manners_weight ON user_manners(decision_weight DESC);
```

### 5.2 manner_applications 表（应用日志）

```sql
CREATE TABLE manner_applications (
  id TEXT PRIMARY KEY,              -- app_${nanoid()}
  manner_id TEXT NOT NULL,          -- FK → user_manners.id
  applied_to TEXT NOT NULL,         -- 应用到的对象 ID
  service TEXT NOT NULL,            -- ChatFlow / TaskManager / ...
  action TEXT NOT NULL,             -- rag_rerank / auto_extract_tasks / ...
  user_feedback TEXT,               -- positive / negative / neutral
  score REAL,                       -- 0-1
  timestamp TEXT NOT NULL,
  context JSON                      -- 额外上下文数据
);

CREATE INDEX idx_manner_apps_manner ON manner_applications(manner_id);
CREATE INDEX idx_manner_apps_timestamp ON manner_applications(timestamp DESC);
CREATE INDEX idx_manner_apps_service ON manner_applications(service);
```

### 5.3 TypeScript Interface

```typescript
interface UserManner {
  id: string;
  userId: string;
  name: string;
  description: string;
  category: UserMannerCategory;
  
  triggerPattern: {
    signalTypes: SignalType[];
    contextFilters: {
      eventTypes?: string[];
      timeRange?: { start: string; end: string };
      tags?: string[];
    };
    minOccurrence: number;
  };
  
  requiredDataSchema: {
    signalData: string[];
    eventData: string[];
    contextData: string[];
  };
  
  targetServices: {
    service: 'ChatFlow' | 'NotesManager' | 'TaskManager' | 'MediaManager';
    actions: string[];
  }[];
  
  decisionWeight: number;
  confidence: number;
  
  evaluationHistory: {
    timestamp: string;
    appliedTo: string;
    userFeedback: 'positive' | 'negative' | 'neutral';
    score: number;
    adjustedWeight: number;
  }[];
  
  status: 'active' | 'learning' | 'deprecated';
  createdAt: string;
  updatedAt: string;
  createdBy: 'ai' | 'user';
  lastAppliedAt: string;
  
  stats: {
    totalApplications: number;
    successRate: number;
    averageScore: number;
  };
}

type UserMannerCategory = 
  | 'content_preference'
  | 'time_preference'
  | 'interaction_style'
  | 'organization_habit'
  | 'search_pattern'
  | 'decision_style';
```

---

## 与现有模块集成

### 6.1 与 SignalService 集成

**数据流**: Signal → UserMannerAgent → UserManner

```typescript
// 1. UserMannerAgent 定期读取 Signal
class UserMannerAgent {
  async mineUserManners(userId: string) {
    // 读取近 30 天的 Signal
    const signals = await SignalService.getRecentSignals(userId, {
      days: 30,
      minCount: 100
    });
    
    // 分析模式...
  }
}

// 2. Signal 不直接写入 UserManner（保持职责分离）
// ❌ 错误做法:
// SignalService.create() → 触发 UserManner 创建

// ✅ 正确做法:
// SignalService.create() → 仅写入 signals 表
// UserMannerAgent (定期任务) → 读取 signals → 创建 UserManner
```

**SSOT 合规**:
- Signal 是 SSOT（真相源）
- UserManner 是 Derived（派生数据，可重建）
- UserMannerAgent 是唯一的 Derived Builder

### 6.2 与 RAGIndexService 集成

**应用点**: ChatFlow 检索权重调整

```typescript
class ChatFlowAgent {
  async search(query: string, userId: string) {
    // 1. 基础 RAG 检索
    const results = await RAGIndexService.search(query, { topK: 20 });
    
    // 2. 获取 UserManner
    const manners = await UserMannerService.getActiveManners(userId, {
      targetService: 'ChatFlow',
      minWeight: 0.5
    });
    
    // 3. 应用权重调整
    const reranked = this.applyMannerWeights(results, manners);
    
    return reranked.slice(0, 10);
  }
}
```

**不修改 RAGIndexService**:
- RAGIndexService 保持通用性，不感知 UserManner
- 权重调整在 ChatFlowAgent 层完成

### 6.3 与 EventService 集成

**应用点**: 反馈采集（隐式）

```typescript
// 监听 Event 删除事件
eventBus.on('event:deleted', async (eventId) => {
  const event = await EventService.get(eventId);
  
  // 如果是 AI 创建的 Event
  if (event.createdBy === 'ai') {
    // 查找应用的 UserManner
    const manner = await this.findAppliedManner(eventId);
    
    if (manner) {
      // 记录负面反馈（用户删除 = 拒绝）
      await UserMannerEvaluator.evaluateApplication(manner.id, {
        appliedTo: eventId,
        userAction: 'reject',
        timestamp: new Date().toISOString()
      });
    }
  }
});
```

**SSOT 合规**:
- EventService 不感知 UserManner
- UserManner 通过事件监听被动接收反馈
- 不违反 Single Writer 原则

### 6.4 与 TaskService 集成

**应用点**: 自动提取 vs 预览确认

```typescript
class TaskExtractionAgent {
  async extractTasks(event: Event, userId: string) {
    // 1. 查询用户偏好
    const manner = await UserMannerService.getActiveManners(userId, {
      targetService: 'TaskManager',
      category: 'decision_style'
    }).then(manners => 
      manners.find(m => m.name.includes('自动提取'))
    );
    
    // 2. 根据权重决策
    if (manner && manner.decisionWeight > 0.7) {
      // 自动提取
      const tasks = await this.llm.extractTasks(event.content);
      await TaskService.batchCreate(tasks);
    } else {
      // 显示预览
      const tasks = await this.llm.extractTasks(event.content);
      await this.showConfirmationDialog(tasks);
    }
  }
}
```

### 6.5 与 MediaService 集成

**应用点**: 图片质量评分个性化

```typescript
class SmartMediaDeduplicationAgent {
  async evaluateImageQuality(image: MediaArtifact, userId: string) {
    // 基础评分
    let score = this.baseQualityScore(image);
    
    // 获取用户偏好
    const manners = await UserMannerService.getActiveManners(userId, {
      targetService: 'MediaManager'
    });
    
    // 根据偏好调整权重
    for (const manner of manners) {
      if (manner.name.includes('高分辨率')) {
        score.resolutionWeight += manner.decisionWeight * 0.2;
      }
      if (manner.name.includes('美观')) {
        score.aestheticWeight += manner.decisionWeight * 0.2;
      }
    }
    
    return this.calculateFinalScore(score);
  }
}
```

---

## 实施路线

### 7.1 Phase 1: 基础框架 (2周)

**目标**: 建立 UserManner 数据模型和基础服务

**任务**:
- [x] 创建 `user_manners` 表和 `manner_applications` 表
- [x] 实现 `UserMannerService` CRUD
- [x] 实现隐式反馈采集机制（事件监听）
  - `event:deleted` → reject
  - `event:updated` → modify
  - `ai:suggestion:accepted` → accept

**交付物**:
- 数据表 Schema
- UserMannerService 完整实现
- 反馈采集中间件

**数据样本需求**: 无（基础设施）

---

### 7.2 Phase 2: ChatFlow 集成 (3周)

**目标**: 在 ChatFlow 中应用 UserManner 权重

**任务**:
- [ ] 在 ChatFlowAgent 中集成 UserManner 查询
- [ ] 实现 RAG 结果权重调整算法
- [ ] 记录应用日志（manner_applications）
- [ ] 手动创建 3-5 个典型 UserManner 测试

**交付物**:
- ChatFlowAgent 集成代码
- 权重调整算法
- 测试用例（5个 UserManner）

**数据样本需求**:
- 30 篇不同类型的笔记（技术/会议/日记）
- 20 条测试 query
- 5 个手动创建的 UserManner

---

### 7.3 Phase 3: 自动评估 (2周)

**目标**: 实现权重自适应调整

**任务**:
- [ ] 实现 `UserMannerEvaluator.evaluateApplication()`
- [ ] 指数移动平均权重更新算法
- [ ] 低效模式自动废弃逻辑
- [ ] 定期批量评估任务（Cron Job）

**交付物**:
- UserMannerEvaluator 完整实现
- 权重更新算法（EMA）
- 定期任务配置

**数据样本需求**:
- 50 次 UserManner 应用记录
- 观察 2 周的权重变化

---

### 7.4 Phase 4: AI 模式挖掘 (4周)

**目标**: LLM 自动归纳 UserManner

**任务**:
- [ ] 实现 `UserMannerAgent.mineUserManners()`
- [ ] Signal 聚合分析算法
- [ ] LLM Prompt 调优（模式识别准确率）
- [ ] 相似模式检测与合并逻辑
- [ ] 定期任务（每周自动分析）

**交付物**:
- UserMannerAgent 完整实现
- LLM Prompt 模板
- 模式合并算法

**数据样本需求**:
- 500 条 Signal 数据（真实用户行为）
- 10 个人工标注的"正确模式"（用于验证）

---

### 7.5 Phase 5: 扩展到其他服务 (4周)

**目标**: TaskManager、NotesManager、MediaManager 集成

**任务**:
- [ ] TaskManager 集成（自动提取 vs 预览）
- [ ] NotesManager 集成（智能插入目标选择）
- [ ] MediaManager 集成（图片质量评分）
- [ ] 跨服务 UserManner 协同（一个 Manner 影响多个服务）

**交付物**:
- 3 个服务的集成代码
- 跨服务协同机制

**数据样本需求**:
- 30 条会议纪要（任务提取测试）
- 20 次智能插入操作（目标选择测试）
- 100 张图片（质量评分测试）

---

### 7.6 Phase 6: 用户管理界面 (2周)

**目标**: 提供 UserManner 管理功能

**任务**:
- [ ] UserManner 列表页面
- [ ] 详细统计页面（权重变化曲线）
- [ ] 手动编辑/删除功能
- [ ] 手动触发重新分析
- [ ] 导入/导出功能

**交付物**:
- 完整的管理界面
- 数据可视化组件

**数据样本需求**: 无（UI 开发）

---

### 7.7 总时间线（17周 = 4.2个月）

```
Week 1-2:   Phase 1 - 基础框架
Week 3-5:   Phase 2 - ChatFlow 集成
Week 6-7:   Phase 3 - 自动评估
Week 8-11:  Phase 4 - AI 模式挖掘
Week 12-15: Phase 5 - 扩展到其他服务
Week 16-17: Phase 6 - 用户管理界面
```

**里程碑**:
- ✅ Week 2: UserManner 基础框架可用
- ✅ Week 5: ChatFlow 权重调整生效
- ✅ Week 7: 自动评估闭环建立
- ✅ Week 11: AI 自动挖掘上线
- ✅ Week 15: 所有服务集成完成
- ✅ Week 17: 用户管理界面上线

---

## 风险与挑战

### 8.1 冷启动问题

**问题**: 新用户没有足够 Signal 数据，无法归纳 UserManner

**解决方案**:
1. **默认 UserManner**: 基于人群统计提供通用模式
   ```typescript
   const defaultManners = [
     { name: "技术内容偏好", weight: 0.3 },  // 低权重
     { name: "会议行动项偏好", weight: 0.3 }
   ];
   ```
2. **快速收集 Signal**: 引导用户标记/搜索（新手任务）
3. **Few-shot Learning**: 少量数据也能学习（10 次即可）

**预期效果**: 7 天内生成首个 UserManner

---

### 8.2 过拟合风险

**问题**: AI 学习到错误的模式（偶然行为被误认为习惯）

**解决方案**:
1. **最小样本量**: 至少 10 次才算模式
2. **置信度阈值**: 低于 0.7 不启用
3. **定期重新评估**: 每月重新分析，废弃失效模式
4. **用户确认**: 新模式生成后，提示用户确认

**预期效果**: 误判率 < 10%

---

### 8.3 隐私担忧

**问题**: UserManner 存储敏感行为数据

**解决方案**:
1. **本地存储**: 所有数据存储在本地 IndexedDB，不上传云端
2. **用户可控**: 
   - 允许用户关闭功能
   - 允许用户查看/删除任何 Manner
   - 允许用户重置学习数据
3. **定期清理**: 90 天后自动清理旧的 evaluation_history
4. **透明说明**: 隐私政策明确说明数据用途

**预期效果**: 用户信任度 > 80%

---

### 8.4 计算成本

**问题**: 每次决策都要查询 UserManner + 调整权重

**解决方案**:
1. **缓存活跃 Manner**: 
   ```typescript
   const cache = new Map<string, UserManner[]>();
   cache.set(userId, activeManners);  // 缓存 30 分钟
   ```
2. **只在必要时触发**: 不是每次查询都应用权重
3. **异步评估**: 反馈评估不阻塞主流程
   ```typescript
   // ✅ 异步评估
   evaluateApplication(...).catch(console.error);  // fire-and-forget
   ```

**预期效果**: 额外延迟 < 50ms

---

### 8.5 用户理解成本

**问题**: 用户不理解为什么 AI 做出某个决策

**解决方案**:
1. **可解释性 UI**: 
   ```
   💡 因为您通常在会议纪要中标记行动项，
       系统自动为您提取了 3 个待办任务。
   ```
2. **透明展示**: 用户能查看所有 UserManner
3. **允许编辑**: 用户可以手动调整权重
4. **重置选项**: 提供"重置学习"按钮

**预期效果**: 用户理解度 > 75%

---

## 成功指标

### 9.1 核心指标

| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| **个性化准确率** | > 70% | AI 建议被用户采纳的比例 |
| **学习速度** | < 14 天 | 从注册到生成首个有效 Manner |
| **权重收敛速度** | < 20 次应用 | 权重稳定到 ±0.1 区间 |
| **模式识别准确率** | > 85% | LLM 识别的模式与人工标注一致性 |
| **用户满意度** | > 4.2/5 | AI 服务体验评分 |

### 9.2 业务指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **功能使用率** | > 60% | 活跃用户中启用 UserManner 的比例 |
| **留存提升** | + 15% | 相比未启用 UserManner 的用户 |
| **AI 服务使用频率** | + 30% | ChatFlow/TaskManager 使用次数提升 |
| **用户推荐意愿** | > 8/10 | NPS 评分 |

### 9.3 技术指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **模式挖掘性能** | < 5s | 分析 500 条 Signal 的耗时 |
| **权重调整延迟** | < 100ms | 单次评估 + 更新的耗时 |
| **存储占用** | < 1MB/用户 | UserManner + 应用日志总大小 |
| **误判率** | < 10% | 错误模式的比例 |

---

## 附录

### A.1 LLM Prompt 模板（模式识别）

```
您是一个用户行为分析专家。请分析以下用户在笔记软件中的行为数据，识别明显的行为模式。

===== 用户行为数据 =====
${aggregatedSignals}

===== 任务要求 =====
1. 识别 3-5 个最明显的行为模式
2. 每个模式至少出现 10 次
3. 模式应该有实际意义（能指导 AI 决策）
4. 输出 JSON 格式

===== 输出格式 =====
[
  {
    "name": "简洁的模式名称",
    "description": "详细说明用户为什么这样做",
    "category": "content_preference | time_preference | interaction_style | organization_habit | search_pattern | decision_style",
    "triggerPattern": {
      "signalTypes": ["highlight", "action_item"],
      "contextFilters": {
        "eventTypes": ["meeting_notes"],
        "timeRange": { "start": "21:00", "end": "23:00" }
      },
      "minOccurrence": 10
    },
    "targetServices": [
      {
        "service": "ChatFlow | NotesManager | TaskManager | MediaManager",
        "actions": ["具体的智能服务动作"]
      }
    ],
    "confidence": 0.92
  }
]

===== 示例输出 =====
[
  {
    "name": "会议纪要行动项偏好",
    "description": "用户在会议纪要中高频标记行动项，倾向于立即提取 TODO",
    "category": "content_preference",
    "triggerPattern": {
      "signalTypes": ["highlight", "action_item"],
      "contextFilters": { "eventTypes": ["meeting_notes"] },
      "minOccurrence": 10
    },
    "targetServices": [
      { "service": "TaskManager", "actions": ["auto_extract_tasks", "priority_boost"] }
    ],
    "confidence": 0.92
  }
]
```

### A.2 权重更新算法（数学公式）

**指数移动平均（EMA）**:

$$
W_{t+1} = W_t \cdot (1 - \alpha) + S_t \cdot \alpha
$$

其中：
- $W_t$: 当前权重
- $W_{t+1}$: 更新后权重
- $S_t$: 本次评分（0-1）
- $\alpha$: 学习率（推荐 0.2）

**学习率选择**:
- $\alpha = 0.1$: 保守学习，权重变化慢
- $\alpha = 0.2$: 平衡（推荐）
- $\alpha = 0.5$: 激进学习，权重变化快

**权重边界**:
```typescript
newWeight = Math.max(0, Math.min(1, newWeight));  // 限制在 [0, 1]
```

### A.3 相似模式检测算法

```typescript
function findSimilarManner(newPattern: any): UserManner | null {
  const existing = await UserMannerService.getAll(userId);
  
  for (const manner of existing) {
    // 1. 名称相似度（Levenshtein 距离）
    const nameSim = levenshtein(newPattern.name, manner.name);
    
    // 2. 触发条件相似度（Signal 类型交集）
    const signalSim = jaccard(
      newPattern.triggerPattern.signalTypes,
      manner.triggerPattern.signalTypes
    );
    
    // 3. 目标服务相似度
    const serviceSim = jaccard(
      newPattern.targetServices.map(s => s.service),
      manner.targetServices.map(s => s.service)
    );
    
    // 综合相似度
    const similarity = (nameSim + signalSim + serviceSim) / 3;
    
    if (similarity > 0.7) {
      return manner;  // 找到相似模式
    }
  }
  
  return null;  // 无相似模式
}
```

---

**文档版本**: v1.0  
**创建日期**: 2026-01-10  
**作者**: 4DNote Product Team
