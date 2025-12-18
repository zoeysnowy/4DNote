# AI ChatFlow PRD - 内联 AI 对话流

## 📋 产品概述

### 愿景
在 EventLog 笔记中通过 `@ai` 触发 AI 对话，提问和回答自动保存为 Toggle 节点，支持多模型切换，无缝融入用户的笔记工作流。

### 核心价值
- 🚀 **零切换成本**：无需离开笔记，直接对话 AI
- 💾 **自动归档**：对话历史自动保存，可折叠查看
- 🎯 **上下文感知**：理解当前事件和笔记内容
- 🔀 **多模型支持**：GPT-4、Claude、Gemini 等自由切换
- 📝 **笔记原生**：AI 回答可编辑、可引用、可搜索

---

## 🎯 目标用户 & 使用场景

### 目标用户
1. **知识工作者**：需要快速查询资料、总结内容
2. **项目管理者**：需要 AI 辅助规划任务、分析数据
3. **学习者**：需要 AI 解释概念、整理笔记
4. **创作者**：需要 AI 头脑风暴、润色文案

### 核心场景

#### 场景 1：笔记中快速提问
```
用户在记录会议笔记时：
1. 输入 "@ai 帮我总结上面的讨论要点"
2. AI 自动读取上文，生成摘要
3. 回答保存为 Toggle 节点，可折叠
```

#### 场景 2：多轮对话深入探讨
```
用户在学习新概念时：
1. "@ai 什么是 LangGraph？"
2. AI 回答基础概念
3. 继续追问："给我一个实际例子"
4. AI 提供代码示例
5. 所有 Q&A 折叠在一个 Thread 里
```

#### 场景 3：切换模型获得不同视角
```
用户需要对比不同 AI 的观点：
1. "@ai:gpt4 如何设计这个系统？"
2. GPT-4 给出建议
3. "@ai:claude 同样的问题"
4. Claude 给出不同方案
5. 用户对比选择最佳方案
```

#### 场景 4：基于上下文的智能助手
```
用户在活动策划笔记中：
1. "@ai 基于这个活动，帮我生成报名表问题"
2. AI 读取活动信息（时间、地点、类型）
3. 生成个性化的报名表
```

---

## 🏗️ 功能设计

### 1. 触发机制

#### 1.1 触发方式
- **主触发器**：`@ai` 或 `@AI`
- **模型指定**：`@ai:gpt4`, `@ai:claude`, `@ai:gemini`
- **快捷命令**：
  - `@ai.sum` - 总结上文
  - `@ai.explain` - 解释选中内容
  - `@ai.translate` - 翻译
  - `@ai.fix` - 修正语法
  - `@ai.expand` - 扩展内容

#### 1.2 交互流程
```
用户输入 "@ai" → UnifiedMentionMenu 弹出
    ↓
选择模型（可选）→ 输入问题
    ↓
按 Enter 发送 → 显示加载动画
    ↓
流式响应显示 → 自动保存为 Toggle 节点
```

### 2. Toggle 节点设计

#### 2.1 节点结构
```typescript
interface AIChatToggle extends ParagraphNode {
  type: 'ai-chat-toggle';
  collapsed: boolean;  // 是否折叠
  threadId: string;    // 对话线程 ID
  children: [
    {
      type: 'ai-question';
      question: string;
      timestamp: string;
      user: string;
    },
    {
      type: 'ai-answer';
      answer: string;
      model: 'gpt4' | 'claude' | 'gemini' | 'hunyuan';
      timestamp: string;
      tokens: { prompt: number; completion: number };
      followUp?: string[];  // 建议的后续问题
    }
  ];
}
```

#### 2.2 视觉设计
```
┌─────────────────────────────────────────┐
│ 🤖 AI 对话 · GPT-4 · 2分钟前      [▼]  │  ← 折叠标题栏
├─────────────────────────────────────────┤
│ 👤 你: 帮我总结上面的会议讨论要点      │  ← 问题（用户头像）
│                                         │
│ 🤖 GPT-4:                               │  ← 回答（模型图标）
│ 根据上文，会议的核心讨论要点包括：     │
│ 1. 项目进度更新                         │
│ 2. 资源分配问题                         │
│ 3. 下周里程碑                           │
│                                         │
│ 💡 你可能还想问:                        │  ← 建议的后续问题
│   • 如何优化资源分配？                  │
│   • 下周里程碑的具体任务是什么？        │
│                                         │
│ [继续对话] [切换模型] [复制] [删除]     │  ← 操作按钮
└─────────────────────────────────────────┘
```

折叠后：
```
┌─────────────────────────────────────────┐
│ 🤖 AI 对话 · GPT-4 · 2分钟前      [▶]  │  ← 点击展开
│ "帮我总结上面的会议讨论要点"           │  ← 显示问题预览
└─────────────────────────────────────────┘
```

### 3. 模型管理

#### 3.1 支持的模型
| 模型 | 触发器 | 特点 | 用途 |
|------|--------|------|------|
| GPT-4 | `@ai:gpt4` | 全能、推理强 | 复杂分析、代码 |
| Claude | `@ai:claude` | 长文本、创作 | 文章写作、总结 |
| Gemini | `@ai:gemini` | 多模态 | 图片理解、视频 |
| 混元 | `@ai:hunyuan` | 中文优化 | 中文创作、本地化 |

#### 3.2 模型选择器
```
┌─────────────────────────────┐
│ 选择 AI 模型                │
├─────────────────────────────┤
│ ✓ GPT-4 (默认)              │
│   • 最强推理能力            │
│   • $0.03/1K tokens         │
│                             │
│   Claude 3 Sonnet           │
│   • 200K 上下文             │
│   • $0.003/1K tokens        │
│                             │
│   Gemini Pro                │
│   • 支持图片输入            │
│   • 免费                    │
│                             │
│   混元 (腾讯)               │
│   • 中文优化                │
│   • 已配置                  │
└─────────────────────────────┘
```

### 4. 上下文管理

#### 4.1 上下文来源
1. **EventLog 内容**：当前笔记的全部文字
2. **Event 元数据**：标题、标签、时间、地点
3. **对话历史**：同一 Thread 的前序 Q&A
4. **选中文本**：用户高亮的内容
5. **关联事件**：通过 @mention 引用的事件

#### 4.2 上下文构建
```typescript
interface ChatContext {
  // Event 信息
  event: {
    id: string;
    title: string;
    tags: string[];
    startTime?: string;
    location?: string;
  };
  
  // 笔记内容
  eventLog: {
    plainText: string;      // 纯文本内容
    slateNodes: Descendant[];  // Slate 节点（包含格式）
    images?: string[];      // 图片 URL
    attachments?: Attachment[];
  };
  
  // 对话历史
  chatHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  
  // 选中内容
  selection?: {
    text: string;
    nodeType: string;
  };
  
  // 关联事件
  linkedEvents?: Event[];
}
```

#### 4.3 智能上下文压缩
- **Token 限制**：根据模型 context window 自动压缩
- **优先级排序**：
  1. 用户问题
  2. 选中文本
  3. 最近 3 轮对话
  4. Event 元数据
  5. EventLog 最后 2000 字
- **压缩策略**：
  - 移除 Markdown 格式
  - 提取关键句子
  - 保留数字和日期

### 5. 流式响应

#### 5.1 显示效果
```
🤖 正在思考...

🤖 GPT-4:
根据上文，会议的核心█  ← 打字机效果

🤖 GPT-4:
根据上文，会议的核心讨论要点包括：
1. 项目进度更新█
```

#### 5.2 技术实现
```typescript
async function* streamChatResponse(
  question: string,
  context: ChatContext,
  model: AIModel
): AsyncGenerator<string> {
  const llm = getLLMService(model);
  
  // 构建 prompt
  const prompt = buildChatPrompt(question, context);
  
  // 流式调用
  for await (const chunk of llm.stream(prompt)) {
    yield chunk.text;
  }
}

// 在 Slate 中实时插入
editor.insertText(chunk, { at: answerPath });
```

### 6. 快捷命令

#### 6.1 预定义命令
| 命令 | 说明 | Prompt 模板 |
|------|------|-------------|
| `@ai.sum` | 总结上文 | "请总结以下内容的核心要点：\n{context}" |
| `@ai.explain` | 解释选中内容 | "请详细解释：{selection}" |
| `@ai.translate` | 翻译为英文/中文 | "请翻译为{lang}：{selection}" |
| `@ai.fix` | 修正语法和拼写 | "请修正以下文字的语法错误：{selection}" |
| `@ai.expand` | 扩展内容 | "请将以下内容扩展为3段详细说明：{selection}" |
| `@ai.code` | 生成代码 | "请生成{lang}代码：{selection}" |

#### 6.2 自定义命令
用户可以在设置中添加自定义命令：
```typescript
interface CustomCommand {
  trigger: string;        // 如 "@ai.review"
  name: string;           // "代码审查"
  promptTemplate: string; // "请审查以下代码：{selection}"
  model: AIModel;         // 默认模型
  autoRun: boolean;       // 是否自动运行
}
```

---

## 🛠️ 技术实现

### 1. 架构设计

```
┌─────────────────────────────────────────┐
│         用户交互层 (ModalSlate)          │
│  - UnifiedMentionMenu (@ai 触发)        │
│  - AIChatToggle 组件                     │
│  - 流式响应显示                          │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│       AI ChatFlow Service               │
│  - 上下文提取                            │
│  - Prompt 构建                           │
│  - 流式调用管理                          │
│  - 对话历史管理                          │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│        多模型适配层                      │
│  - GPT-4 Adapter                        │
│  - Claude Adapter                       │
│  - Gemini Adapter                       │
│  - Hunyuan Adapter                      │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         LLMService (统一接口)           │
│  - stream(prompt)                       │
│  - chat(messages)                       │
│  - embeddings(text)                     │
└─────────────────────────────────────────┘
```

### 2. 核心组件

#### 2.1 AIChatToggle 组件
```typescript
// src/components/SlateCore/elements/AIChatToggle.tsx
interface AIChatToggleProps {
  question: string;
  answer?: string;
  model: AIModel;
  threadId: string;
  collapsed: boolean;
  onToggle: () => void;
  onContinue: () => void;
  onSwitchModel: (model: AIModel) => void;
  onDelete: () => void;
}

export const AIChatToggle: React.FC<AIChatToggleProps> = ({
  question,
  answer,
  model,
  collapsed,
  onToggle,
  onContinue,
  onSwitchModel,
  onDelete
}) => {
  return (
    <div className="ai-chat-toggle" data-collapsed={collapsed}>
      {/* 标题栏 */}
      <div className="toggle-header" onClick={onToggle}>
        <span className="model-icon">{getModelIcon(model)}</span>
        <span className="question-preview">{question}</span>
        <span className="toggle-icon">{collapsed ? '▶' : '▼'}</span>
      </div>
      
      {/* 内容区（折叠时隐藏）*/}
      {!collapsed && (
        <div className="toggle-content">
          {/* 问题 */}
          <div className="question-block">
            <span className="user-icon">👤</span>
            <div className="question-text">{question}</div>
          </div>
          
          {/* 回答 */}
          <div className="answer-block">
            <span className="ai-icon">{getModelIcon(model)}</span>
            <div className="answer-text">
              {answer ? (
                <Markdown>{answer}</Markdown>
              ) : (
                <LoadingDots />
              )}
            </div>
          </div>
          
          {/* 操作按钮 */}
          <div className="action-buttons">
            <button onClick={onContinue}>继续对话</button>
            <ModelSelector current={model} onChange={onSwitchModel} />
            <button onClick={() => copyToClipboard(answer)}>复制</button>
            <button onClick={onDelete}>删除</button>
          </div>
        </div>
      )}
    </div>
  );
};
```

#### 2.2 AIChatFlowService
```typescript
// src/services/AIChatFlowService.ts
export class AIChatFlowService {
  private llmService: LLMService;
  private contextExtractor: ContextExtractor;
  
  /**
   * 发送 AI 问题
   */
  async *askAI(
    question: string,
    options: {
      eventId: string;
      model: AIModel;
      threadId?: string;
      selection?: string;
    }
  ): AsyncGenerator<string> {
    // 1. 提取上下文
    const context = await this.contextExtractor.extract({
      eventId: options.eventId,
      threadId: options.threadId,
      selection: options.selection
    });
    
    // 2. 构建 prompt
    const prompt = this.buildPrompt(question, context);
    
    // 3. 流式调用 LLM
    const llm = this.getLLM(options.model);
    for await (const chunk of llm.stream(prompt)) {
      yield chunk.text;
    }
    
    // 4. 保存对话历史
    await this.saveChatHistory({
      threadId: options.threadId || generateThreadId(),
      question,
      answer: fullAnswer,
      model: options.model,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * 构建 prompt
   */
  private buildPrompt(question: string, context: ChatContext): string {
    return `你是一个智能助手，帮助用户在笔记中回答问题。

当前事件信息：
- 标题：${context.event.title}
- 标签：${context.event.tags.join(', ')}
${context.event.startTime ? `- 时间：${context.event.startTime}` : ''}

笔记内容：
${context.eventLog.plainText.slice(0, 2000)}

${context.chatHistory.length > 0 ? `
对话历史：
${context.chatHistory.map(h => `${h.role === 'user' ? '用户' : 'AI'}: ${h.content}`).join('\n')}
` : ''}

用户问题：${question}

请回答用户的问题。如果问题与上下文相关，请结合上下文回答。`;
  }
  
  /**
   * 获取 LLM 实例
   */
  private getLLM(model: AIModel): LLMService {
    switch (model) {
      case 'gpt4':
        return new GPT4Service(config.openai);
      case 'claude':
        return new ClaudeService(config.anthropic);
      case 'gemini':
        return new GeminiService(config.google);
      case 'hunyuan':
        return new HunyuanService(config.tencent);
      default:
        return this.llmService; // 默认
    }
  }
}
```

#### 2.3 UnifiedMentionMenu 扩展
```typescript
// src/components/UnifiedMentionMenu/UnifiedMentionMenu.tsx
// 添加 AI 类型的 mention

// 检测 @ai 触发
if (query.startsWith('ai')) {
  const aiQuery = query.slice(2).trim(); // 移除 "ai"
  
  // 检测模型指定 (如 @ai:gpt4)
  const modelMatch = aiQuery.match(/^:(\w+)\s*/);
  const model = modelMatch ? modelMatch[1] : 'default';
  const actualQuery = modelMatch ? aiQuery.slice(modelMatch[0].length) : aiQuery;
  
  setMentionType('ai');
  setAIModel(model);
  setAIQuery(actualQuery);
}

// 渲染 AI 菜单
if (mentionType === 'ai') {
  return (
    <AIChatMenu
      query={aiQuery}
      model={aiModel}
      onSubmit={(question) => {
        handleAIChat(question, aiModel);
        onClose();
      }}
      onModelChange={setAIModel}
    />
  );
}
```

### 3. 数据存储

#### 3.1 Chat Thread 存储
```typescript
// LocalStorage: ai-chat-threads-{eventId}
interface ChatThread {
  id: string;
  eventId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    model: AIModel;
    timestamp: string;
    tokens?: { prompt: number; completion: number };
  }>;
  createdAt: string;
  updatedAt: string;
}
```

#### 3.2 EventLog 集成
```typescript
// 在 EventLog.slateJson 中保存为特殊节点
{
  type: 'ai-chat-toggle',
  threadId: 'thread_123',
  collapsed: true,
  children: [
    {
      type: 'ai-question',
      text: '帮我总结上面的会议讨论要点',
      timestamp: '2024-12-17T10:30:00Z'
    },
    {
      type: 'ai-answer',
      text: '根据上文，会议的核心讨论要点包括：...',
      model: 'gpt4',
      timestamp: '2024-12-17T10:30:05Z'
    }
  ]
}
```

---

## 🎨 UI/UX 设计

### 1. 交互流程

#### 流程 1：基础提问
```
1. 用户输入 "@ai"
   ↓
2. 弹出 AI 菜单（显示模型选择）
   ↓
3. 用户输入问题，按 Enter
   ↓
4. 显示加载动画
   ↓
5. 流式显示 AI 回答（打字机效果）
   ↓
6. 回答完成，自动保存为 Toggle 节点
```

#### 流程 2：多轮对话
```
1. 点击已有 Toggle 的"继续对话"
   ↓
2. 展开输入框
   ↓
3. 输入后续问题
   ↓
4. AI 基于对话历史回答
   ↓
5. 新的 Q&A 追加到 Toggle 里
```

#### 流程 3：切换模型
```
1. 点击 Toggle 的"切换模型"
   ↓
2. 选择新模型（如 Claude）
   ↓
3. 同样问题重新发送
   ↓
4. 新回答显示在下方
   ↓
5. 用户对比两个回答
```

### 2. 视觉规范

#### 2.1 颜色系统
```css
/* AI 主题色 */
--ai-primary: #8B5CF6;      /* 紫色 - AI 标识色 */
--ai-secondary: #EC4899;    /* 粉色 - 强调色 */
--ai-success: #10B981;      /* 绿色 - 成功状态 */
--ai-warning: #F59E0B;      /* 橙色 - 警告 */

/* 模型颜色 */
--model-gpt4: #74AA9C;      /* GPT-4: 青绿 */
--model-claude: #CC785C;    /* Claude: 橙红 */
--model-gemini: #4285F4;    /* Gemini: 蓝色 */
--model-hunyuan: #00A870;   /* 混元: 腾讯绿 */

/* Toggle 节点 */
--toggle-bg: #F9FAFB;
--toggle-border: #E5E7EB;
--toggle-hover: #F3F4F6;
```

#### 2.2 图标系统
- **AI 总图标**：🤖 或 ✨
- **GPT-4**：🟢 (OpenAI 绿)
- **Claude**：🟠 (Anthropic 橙)
- **Gemini**：🔵 (Google 蓝)
- **混元**：🟩 (腾讯绿)

#### 2.3 动画效果
```css
/* 打字机效果 */
@keyframes typing {
  from { opacity: 0.3; }
  to { opacity: 1; }
}

.ai-typing-cursor {
  animation: typing 0.8s infinite;
}

/* 展开/折叠 */
@keyframes expand {
  from {
    max-height: 0;
    opacity: 0;
  }
  to {
    max-height: 1000px;
    opacity: 1;
  }
}
```

---

## 📊 实现难度评估

### 难度等级：⭐⭐⭐ (中等偏上)

### 已有基础 ✅
1. **UnifiedMentionMenu**：@ 触发机制已实现
2. **ModalSlate**：富文本编辑器已完成
3. **LLMService**：AI 调用框架已搭建
4. **EventLog 存储**：Slate JSON 存储已完善

### 需要新增 🆕
1. **AIChatToggle 组件**：可折叠的 Q&A 节点（中等）
2. **流式响应集成**：实时显示 AI 输出（中等）
3. **上下文提取**：从 EventLog 提取智能上下文（简单）
4. **多模型适配**：GPT-4/Claude/Gemini 统一接口（中等）
5. **对话历史管理**：Thread 存储和检索（简单）

### 技术挑战 ⚠️
1. **流式响应的 Slate 集成**：需要在流式输出时实时更新节点
2. **Token 计算与限制**：避免超出模型 context window
3. **多模型 API 适配**：不同提供商的 API 格式不同
4. **性能优化**：大量对话历史的加载和渲染

### 预估工时
- **核心功能**：2-3 周
  - Week 1: AIChatToggle 组件 + 基础流式响应
  - Week 2: 多模型适配 + 上下文管理
  - Week 3: UI 优化 + 性能调优
- **扩展功能**：1-2 周
  - 快捷命令
  - 自定义 Prompt
  - 高级设置

---

## 💡 用户价值分析

### 会让用户喜欢吗？**强烈推荐实现！** ⭐⭐⭐⭐⭐

### 核心优势
1. **无缝集成** ✅
   - 不需要切换应用
   - AI 回答直接成为笔记一部分
   - 自动保存，无需手动复制

2. **上下文感知** ✅
   - 理解当前事件和笔记内容
   - 提供更相关的回答
   - 比独立 Chat 工具更智能

3. **多模型灵活性** ✅
   - 不同任务用不同模型
   - 避免被单一厂商绑定
   - 成本优化（便宜模型处理简单任务）

4. **知识沉淀** ✅
   - 所有对话自动归档
   - 可搜索、可引用
   - 形成个人知识库

### 对比竞品

| 功能 | 4DNote | Notion AI | Sider Chat | ChatGPT |
|------|--------|-----------|------------|---------|
| 内联对话 | ✅ | ✅ | ❌ | ❌ |
| 自动保存 | ✅ (Toggle) | ⚠️ (仅结果) | ❌ | ⚠️ (需手动) |
| 多模型 | ✅ | ❌ | ✅ | ❌ |
| 上下文感知 | ✅ | ✅ | ⚠️ | ❌ |
| 折叠显示 | ✅ | ❌ | ❌ | ❌ |
| 免费 | ✅ | ❌ ($10/月) | ⚠️ (部分) | ⚠️ (限额) |

### 潜在用户反馈
> "太棒了！终于不用在笔记和 ChatGPT 之间来回切换了！"

> "Toggle 节点设计太贴心，笔记不会被 AI 对话搞乱"

> "多模型支持很实用，写代码用 GPT-4，写文章用 Claude"

> "上下文感知太智能了，它真的理解我的笔记内容"

---

## 🚀 实施计划

### Phase 1: MVP（2周）
**目标**：实现基础 AI 对话功能

#### Week 1: 核心组件
- [x] AIChatToggle 组件（展开/折叠）
- [x] UnifiedMentionMenu 扩展（@ai 触发）
- [x] 基础流式响应显示
- [x] 单模型支持（Hunyuan）

#### Week 2: 上下文与存储
- [x] ContextExtractor 实现
- [x] ChatThread 存储
- [x] EventLog 集成
- [x] 基础 UI 样式

#### 验收标准
- ✅ 能在 ModalSlate 中输入 `@ai 问题`
- ✅ AI 回答流式显示
- ✅ 自动保存为 Toggle 节点
- ✅ 可展开/折叠查看

### Phase 2: 多模型支持（1周）
**目标**：支持 GPT-4/Claude/Gemini

#### Week 3: 模型适配
- [ ] GPT-4 Adapter
- [ ] Claude Adapter
- [ ] Gemini Adapter
- [ ] 模型选择器 UI
- [ ] `@ai:gpt4` 语法支持

#### 验收标准
- ✅ 可切换不同模型
- ✅ 每个模型独立配置
- ✅ 显示模型图标和名称

### Phase 3: 高级功能（1周）
**目标**：快捷命令和优化

#### Week 4: 功能增强
- [ ] 快捷命令 (`@ai.sum`, `@ai.explain` 等)
- [ ] 多轮对话支持
- [ ] 建议后续问题
- [ ] 性能优化

#### 验收标准
- ✅ 6个快捷命令可用
- ✅ 可基于历史继续对话
- ✅ AI 给出 3 个后续问题建议

### Phase 4: 打磨（1周）
**目标**：UI/UX 优化和测试

#### Week 5: 抛光
- [ ] 动画效果优化
- [ ] 错误处理完善
- [ ] 用户文档
- [ ] 性能测试
- [ ] Bug 修复

---

## 🎯 成功指标

### 核心指标
1. **使用频率**
   - 目标：每用户每天 5+ 次 AI 对话
   - 测量：统计 `@ai` 触发次数

2. **留存率**
   - 目标：启用后 7 天留存 > 80%
   - 测量：启用该功能的用户 7 天后仍在使用

3. **对话质量**
   - 目标：平均对话轮数 > 2
   - 测量：统计 Thread 内的消息数

4. **多模型使用**
   - 目标：30% 用户使用 2+ 模型
   - 测量：统计不同模型的调用比例

### 辅助指标
1. Token 消耗：平均每次对话 < 2000 tokens
2. 响应速度：首 token 延迟 < 1s
3. 错误率：API 调用失败率 < 5%
4. 笔记质量：启用后笔记字数增长 > 20%

---

## 🔧 技术债务与优化

### 需要注意的问题
1. **成本控制**
   - Token 消耗监控
   - 用户配额限制
   - 廉价模型优先

2. **隐私安全**
   - 敏感信息过滤
   - 本地数据不上传
   - 用户明确授权

3. **性能优化**
   - 上下文压缩算法
   - 对话历史分页加载
   - 流式响应取消机制

4. **错误处理**
   - API 限流重试
   - 网络超时处理
   - 降级方案（离线模式）

### 未来扩展方向
1. **语音输入**：语音转文字后发送给 AI
2. **图片理解**：上传图片让 AI 分析
3. **代码执行**：AI 生成的代码可运行
4. **知识图谱**：基于对话构建知识网络
5. **协作 AI**：多用户共享 AI Thread

---

## 📚 参考资料

### 竞品分析
- [Notion AI](https://www.notion.so/product/ai)
- [Sider Chat](https://sider.ai/)
- [Cursor](https://cursor.sh/)
- [GitHub Copilot Chat](https://github.com/features/copilot)

### 技术文档
- [LangChain Streaming](https://js.langchain.com/docs/expression_language/streaming)
- [OpenAI Streaming API](https://platform.openai.com/docs/api-reference/streaming)
- [Slate Custom Elements](https://docs.slatejs.org/concepts/08-rendering#elements)

---

## 📝 附录

### A. Prompt 模板示例

#### 总结模板
```
你是一个擅长总结的助手。请总结以下内容的核心要点：

{content}

要求：
- 提取 3-5 个核心要点
- 每个要点用一句话概括
- 使用 Markdown 列表格式
```

#### 解释模板
```
你是一个耐心的老师。请详细解释以下内容：

{selection}

要求：
- 用简单易懂的语言
- 举例说明
- 如果涉及技术概念，用类比解释
```

### B. API 配置示例

```typescript
// src/config/ai-chat.config.ts
export const aiChatConfig = {
  models: {
    gpt4: {
      provider: 'openai',
      model: 'gpt-4-turbo-preview',
      apiKey: process.env.OPENAI_API_KEY,
      maxTokens: 4096,
      temperature: 0.7,
    },
    claude: {
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxTokens: 4096,
      temperature: 0.7,
    },
    gemini: {
      provider: 'google',
      model: 'gemini-pro',
      apiKey: process.env.GOOGLE_API_KEY,
      maxTokens: 2048,
      temperature: 0.7,
    },
    hunyuan: {
      provider: 'tencent',
      model: 'hunyuan-lite',
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
      maxTokens: 2048,
      temperature: 0.7,
    }
  },
  
  defaultModel: 'hunyuan',
  
  contextLimits: {
    eventLogMaxChars: 2000,
    chatHistoryMaxMessages: 10,
    totalMaxTokens: 4000,
  },
  
  ui: {
    streamingDelay: 20,  // ms between chunks
    typingSpeed: 50,     // chars per second
    autoCollapse: true,  // auto collapse after answer
  }
};
```

---

**文档版本**: v1.0  
**创建日期**: 2024-12-17  
**负责人**: Zoey Gong  
**状态**: 📋 规划中

---

## 📊 回答质量优化策略（基于行业最佳实践）

> **参考**: Sider AI 等成熟 Chatbot 产品的优化方案分析

### 核心认知
要达到 Sider AI 级别的"回答质量"，关键不在算法，而在**工程化**和**交互**。对于 4DNote 这种聚焦于特定数据（日程/笔记）的场景，我们甚至可以做得比通用工具更好。

---

### 1. 查询重写 (Query Rewriting) ⭐⭐⭐⭐⭐

#### 问题场景
```
用户多轮对话：
1. "@ai 我明天的日程是什么？"
2. "@ai 那上周呢？" ❌ 如果直接搜索"那上周呢"，向量库会找不到任何东西
```

#### 解决方案
在向量检索前，先把用户问题 + 历史对话发给 LLM，改写成独立的搜索语句：

```typescript
// src/services/AIQueryRewriter.ts
async function rewriteQuery(
  userQuestion: string,
  chatHistory: Message[]
): Promise<string> {
  const prompt = `
你是一个搜索语句改写助手。用户的问题可能依赖对话上下文，请将其改写为独立的、完整的搜索语句。

对话历史：
${chatHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

当前问题：${userQuestion}

改写要求：
1. 如果问题包含时间词（"明天"、"上周"、"下个月"），转换为具体日期范围
2. 如果问题包含指代词（"那个"、"它"），替换为具体实体
3. 补充必要的上下文信息
4. 保持原问题的核心意图

改写后的搜索语句：`;

  const response = await callLLM(prompt);
  return response.trim();
}

// 使用示例
const originalQuery = "那上周呢？";
const rewrittenQuery = await rewriteQuery(originalQuery, [
  { role: 'user', content: '我明天的日程是什么？' },
  { role: 'assistant', content: '您明天有 3 个日程...' }
]);
// 返回：查找用户 2025-12-10 到 2025-12-16 的所有日程记录
```

**成本评估**：
- 开发成本：✅ 低（几行代码 + Prompt）
- 维护成本：✅ 极低（Prompt 一次性投入）
- 效果提升：⭐⭐⭐⭐⭐（这是 RAG 标配，必须有）

---

### 2. 混合检索 (Hybrid Search) ⭐⭐⭐⭐

#### 问题场景
- 纯向量搜索：擅长语义理解，但对精确匹配（人名、ID）效果差
- 纯关键词搜索：擅长精确匹配，但理解不了语义

#### 解决方案
同时使用两种检索，加权合并结果：

```typescript
// src/services/HybridSearch.ts
async function hybridSearch(
  query: string,
  options: {
    vectorWeight?: number;  // 向量搜索权重 (0-1)
    keywordWeight?: number; // 关键词搜索权重 (0-1)
    topK?: number;
  }
): Promise<SearchResult[]> {
  const { vectorWeight = 0.7, keywordWeight = 0.3, topK = 10 } = options;

  // 1. 向量搜索（语义理解）
  const vectorResults = await vectorSearch(query, topK * 2);

  // 2. 关键词搜索（精确匹配）
  const keywordResults = await fullTextSearch(query, topK * 2);

  // 3. 加权合并（RRF - Reciprocal Rank Fusion）
  const merged = mergeResults(vectorResults, keywordResults, {
    vectorWeight,
    keywordWeight
  });

  return merged.slice(0, topK);
}

function mergeResults(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  weights: { vectorWeight: number; keywordWeight: number }
): SearchResult[] {
  const scoreMap = new Map<string, number>();

  // 向量搜索打分
  vectorResults.forEach((result, index) => {
    const score = (1 / (index + 1)) * weights.vectorWeight;
    scoreMap.set(result.id, (scoreMap.get(result.id) || 0) + score);
  });

  // 关键词搜索打分
  keywordResults.forEach((result, index) => {
    const score = (1 / (index + 1)) * weights.keywordWeight;
    scoreMap.set(result.id, (scoreMap.get(result.id) || 0) + score);
  });

  // 按分数排序
  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}
```

**成本评估**：
- 开发成本：✅ 中（Supabase 等向量库原生支持）
- 维护成本：✅ 低（权重可配置，微调即可）
- 效果提升：⭐⭐⭐⭐（处理人名、ID 等精确查询时很有用）

---

### 3. 结果重排序 (Reranking) ⭐⭐⭐⭐⭐

#### 问题场景
向量搜索返回的 Top 10 结果中，可能有 3-5 条相关性较低。直接喂给 LLM 会：
- 浪费 Token（多余内容占用上下文）
- 降低质量（LLM 被噪声干扰）

#### 解决方案
使用专门的 Rerank 模型对初筛结果重新打分，挑选最相关的内容：

```typescript
// src/services/Reranker.ts
async function rerank(
  query: string,
  candidates: SearchResult[],
  topK: number = 3
): Promise<SearchResult[]> {
  // 方案 1：调用 Rerank API（推荐，性价比高）
  const response = await fetch('https://api.jina.ai/v1/rerank', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${JINA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'jina-reranker-v1-base-en',
      query: query,
      documents: candidates.map(c => c.content),
      top_n: topK
    })
  });

  const { results } = await response.json();
  
  return results.map((r: any) => candidates[r.index]);
}

// 方案 2：本地轻量模型（如 BGE-Reranker，需要部署）
// 方案 3：使用 LLM 自己打分（成本高，不推荐）
```

**推荐 API 服务商**：
- ✅ [Jina AI Rerank](https://jina.ai/reranker)（免费额度 1M tokens/月）
- ✅ [Cohere Rerank](https://cohere.com/rerank)（精度高，但收费）

**成本评估**：
- 开发成本：✅ 极低（调 API，几行代码）
- 维护成本：✅ 极低（API 稳定，无需维护）
- 延迟影响：⚠️ 增加 100-200ms（可接受）
- 效果提升：⭐⭐⭐⭐⭐（**性价比最高的优化手段**）

---

### 4. 系统提示词精细化 (System Prompt Engineering) ⭐⭐⭐

#### 核心理念
一个好的 System Prompt 应该规定：
1. **身份定位**：你是谁？服务谁？
2. **输出格式**：Markdown、列表、JSON？
3. **语气风格**：专业、友好、简洁？
4. **边界约束**：什么不能做？

#### 4DNote 助手 Prompt 模板
```typescript
const SYSTEM_PROMPT = `
你是 4DNote 的 AI 助手，专门帮助用户管理日程、笔记和任务。

## 你的能力
1. 查询用户的日程和笔记（基于检索到的上下文）
2. 总结、解释、翻译笔记内容
3. 辅助规划任务和时间安排

## 输出规范
- 使用 Markdown 格式
- 列表用 - 或 1. 开头
- 重要信息用 **加粗**
- 代码用 \`code\` 或 \`\`\`块包裹
- 保持简洁，避免冗长废话

## 语气风格
- 友好、专业、高效
- 直接给出答案，不要"让我来帮您..."这种开场白
- 如果不确定，明确告知用户

## 边界约束
- 只回答与用户日程、笔记、时间管理相关的问题
- 不提供医疗、法律、金融建议
- 不能访问用户的外部数据（仅限 4DNote 内）
- 如果检索到的内容为空，明确告知"未找到相关信息"

## 上下文数据
以下是检索到的用户数据，请基于这些内容回答：
{context}

## 用户问题
{question}
`;
```

**成本评估**：
- 开发成本：✅ 低（一次性投入，反复测试打磨）
- 维护成本：✅ 极低（模型更新后可能微调，但频率很低）
- 效果提升：⭐⭐⭐（决定交互体验的基础）

---

## 🧰 完整 RAG 流程（推荐实施方案）

```
用户问题 "@ai 上周我参加了哪些活动？"
    ↓
[步骤 1] 查询重写
    → "查找用户 2025-12-10 到 2025-12-16 参加的活动日程"
    ↓
[步骤 2] 混合检索
    → 向量搜索 Top 20 + 关键词搜索 Top 20
    → 合并后 Top 10
    ↓
[步骤 3] 重排序（可选，但推荐）
    → Rerank 模型筛选出最相关的 Top 3
    ↓
[步骤 4] 构建 Prompt
    → System Prompt + 上下文数据 + 用户问题
    ↓
[步骤 5] LLM 生成回答
    → 流式输出到 Toggle 节点
```

---

## 📈 维护成本评估（独立开发者视角）

基于行业经验，你的精力分配应该是：

| 模块               | 维护精力 | 说明                                           |
|--------------------|----------|------------------------------------------------|
| **LLM 接入 (API)** | 5%       | 接口极其稳定，甚至可以用 LangChain/Vercel SDK 一键切换 |
| **Prompt 调优**    | 15%      | 写好一套 Golden Prompts 后，通常只需要微调       |
| **数据清洗 (ETL)** | 50%      | ⚠️ **这才是核心！** 你的笔记格式变了、加了新字段、Timestamp 逻辑改了，需要同步更新"入库脚本"。垃圾进，垃圾出。 |
| **RAG 逻辑 (检索)** | 30%      | 主要是调试"搜得准不准"。这是决定体验上限的地方。 |

### 关键洞察
1. ✅ **模型更新不可怕**：API 向下兼容，模型越强越听话
2. ⚠️ **数据质量是地基**：JSON 结构、Timestamp 逻辑必须搞定
3. 🎯 **RAG 流程是上限**：查询重写 + 混合检索 + 重排序，这三板斧就是大厂的全部秘密

---

## 🚀 实施优先级建议

### Phase 1: MVP（2周） - 基础可用
- ✅ 基础对话 + Toggle 节点
- ✅ System Prompt 打磨
- ❌ 暂不做：查询重写、Rerank

### Phase 2: 体验优化（2周） - 向 Sider 看齐
- ✅ **查询重写**（必做，效果立竿见影）
- ✅ **混合检索**（如果用户反馈搜索不准）
- ⚠️ **Rerank**（可选，但性价比极高）

### Phase 3: 打磨（1周） - 超越通用工具
- ✅ 针对 4DNote 数据结构优化 Prompt
- ✅ 时间相关查询特殊处理（"明天"、"上周"自动转日期）
- ✅ UI/UX 细节优化

---

## 总结

**AI ChatFlow 是一个极具价值的功能**，建议优先级：⭐⭐⭐⭐⭐

### 为什么要做？
1. ✅ 技术可行性高（已有基础框架）
2. ✅ 用户价值明确（无缝集成、自动保存）
3. ✅ 差异化竞争力（Toggle 节点 + 多模型）
4. ✅ 成本可控（按需调用，用户自配 API）

### 建议实施顺序
1. **MVP (2周)**：基础对话 + Toggle 节点
2. **多模型 (1周)**：GPT-4/Claude/Gemini
3. **快捷命令 (1周)**：`@ai.sum` 等
4. **打磨 (1周)**：UI/UX 优化

**总耗时：5周，即可上线完整功能！** 🚀
