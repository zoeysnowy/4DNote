# AI Notes Manager PRD - AI 笔记管理器产品需求文档

**版本**: v1.0  
**日期**: 2024-12-16  
**负责人**: Zoey Gong  
**状态**: 设计中

---

## 📋 目录

1. [产品概述](#产品概述)
2. [核心功能](#核心功能)
3. [用户场景](#用户场景)
4. [数据模型](#数据模型)
5. [AI 能力](#ai-能力)
6. [交互设计](#交互设计)
7. [技术架构](#技术架构)
8. [迭代规划](#迭代规划)

---

## 产品概述

### 产品定位
AI Notes Manager 是 4DNote 的智能笔记管理模块，通过 AI 能力增强传统笔记系统，实现：
- 🔍 **智能检索**：语义搜索、多模态搜索、模糊匹配
- 🏷️ **智能组织**：自动分类、标签提取、知识图谱
- 📝 **智能输入**：语音转写、图片识别、会议纪要
- 🔗 **智能关联**：自动链接相关笔记、事件、任务

### 目标用户
- 知识工作者：记录会议、想法、学习笔记
- 研究人员：管理文献、实验记录、研究笔记
- 创作者：整理灵感、素材、创作思路

### 核心价值
1. **降低记录成本**：从键盘输入 → 语音/图片/自动生成
2. **提升检索效率**：从关键词搜索 → 语义理解 + RAG
3. **增强知识连接**：从孤立笔记 → 知识网络

---

## 核心功能

### 1. 多模态笔记输入

#### 1.1 输入方式矩阵

| 输入类型 | 支持格式 | AI 处理 | 输出结果 |
|---------|---------|---------|---------|
| **文本** | Markdown、富文本 | 格式识别、标题提取 | 结构化笔记 |
| **语音** | 实时录音、音频文件 | ASR 转写 + 摘要 | 文字笔记 + 音频附件 |
| **图片** | 照片、截图、扫描件 | OCR + 场景识别 | 文字笔记 + 图片附件 |
| **文件** | PDF、Word、PPT | 内容提取 + 摘要 | 结构化笔记 + 文件附件 |
| **网页** | URL、收藏夹 | 正文提取 + 摘要 | 笔记 + 原文链接 |
| **会议** | 视频会议录制 | 多人语音分离 + 转写 | 会议纪要 |

#### 1.2 语音笔记

```typescript
interface VoiceNote {
  audioUrl: string;              // 音频文件
  transcript: string;            // 转写文本
  summary: string;               // AI 摘要
  keyPoints: string[];           // 关键要点
  speakers?: {                   // 说话人识别
    name: string;
    segments: TimeSegment[];
  }[];
  emotions?: EmotionAnalysis[];  // 情感分析
  actionItems?: string[];        // 行动项
}

// 实时转写
const voiceRecorder = new VoiceRecorder({
  realtime: true,              // 实时转写
  speakerDiarization: true,    // 说话人分离
  punctuation: true,           // 智能标点
  emotionDetection: true       // 情感检测
});
```

**示例场景**：
```
用户：（语音）"今天和客户开会，他们提出了三个需求..."

AI 处理：
1. 实时转写显示文字
2. 识别关键信息（客户、需求）
3. 自动提取 3 个需求点
4. 生成摘要和行动项
5. 关联到客户标签
```

#### 1.3 图片笔记

```typescript
interface ImageNote {
  imageUrl: string;
  ocrText?: string;              // OCR 提取文字
  sceneType?: 'whiteboard' | 'document' | 'poster' | 'handwriting' | 'photo';
  detectedObjects?: {            // 物体识别
    type: string;
    confidence: number;
    bbox: BoundingBox;
  }[];
  extractedData?: {              // 结构化数据
    tables?: Table[];
    formulas?: string[];
    diagrams?: Diagram[];
  };
  aiDescription?: string;        // AI 生成描述
}
```

**图片类型处理**：
1. **白板照片**
   - 畸变矫正
   - 笔迹清晰化
   - 手写识别
   - 图表提取

2. **文档扫描**
   - 版面分析
   - 表格识别
   - 公式识别
   - PDF 生成

3. **海报/传单**
   - 关键信息提取
   - 二维码识别
   - 日期时间提取
   - 联系方式提取

4. **随手拍照**
   - 场景描述
   - 物体识别
   - 文字提取
   - 地点识别

#### 1.4 会议纪要

```typescript
interface MeetingMinutes {
  meetingInfo: {
    title: string;
    date: Date;
    duration: number;
    participants: string[];
    location?: string;
  };
  agenda: string[];              // 议程
  discussions: {                 // 讨论内容
    topic: string;
    speaker: string;
    content: string;
    timestamp: number;
  }[];
  decisions: string[];           // 决策事项
  actionItems: {                 // 行动项
    task: string;
    assignee: string;
    dueDate?: Date;
  }[];
  keyPoints: string[];           // 关键要点
  nextSteps: string[];           // 下一步计划
}

// 自动生成会议纪要
const generateMinutes = async (audioUrl: string) => {
  const transcript = await asr.transcribe(audioUrl);
  const speakers = await identifySpeakers(transcript);
  const structured = await llm.structureMeeting(transcript, speakers);
  return structured;
};
```

### 2. 智能检索系统

#### 2.1 多维度搜索

```typescript
interface SearchQuery {
  // 基础搜索
  keyword?: string;              // 关键词
  fulltext?: string;             // 全文搜索
  
  // 语义搜索
  semanticQuery?: string;        // 语义理解
  embedding?: number[];          // 向量搜索
  
  // 多模态搜索
  imageQuery?: File;             // 以图搜图/文
  voiceQuery?: File;             // 语音搜索
  
  // 过滤条件
  filters?: {
    dateRange?: [Date, Date];
    tags?: string[];
    type?: NoteType[];
    hasImage?: boolean;
    hasAudio?: boolean;
    relatedTo?: string;          // 关联笔记/事件
  };
  
  // 排序方式
  sort?: 'relevance' | 'time' | 'importance';
}
```

#### 2.2 RAG 检索增强

```typescript
// 向量数据库
class NoteVectorStore {
  private chromaDB: ChromaClient;
  
  async indexNote(note: Note) {
    // 生成 embedding
    const embedding = await this.embeddings.embed(
      note.title + '\n' + note.content
    );
    
    // 存储向量
    await this.chromaDB.add({
      id: note.id,
      embedding,
      metadata: {
        title: note.title,
        tags: note.tags,
        createdAt: note.createdAt,
        type: note.type
      }
    });
  }
  
  async semanticSearch(query: string, topK: number = 10) {
    const queryEmbedding = await this.embeddings.embed(query);
    const results = await this.chromaDB.query({
      embedding: queryEmbedding,
      n_results: topK
    });
    return results;
  }
}

// RAG 问答
class NoteRAG {
  async answer(question: string) {
    // 1. 检索相关笔记
    const relevantNotes = await this.vectorStore.semanticSearch(question, 5);
    
    // 2. 构建上下文
    const context = relevantNotes.map(n => n.content).join('\n\n');
    
    // 3. 生成答案
    const answer = await this.llm.generate({
      prompt: `基于以下笔记回答问题：\n${context}\n\n问题：${question}`,
      temperature: 0.3
    });
    
    return {
      answer,
      sources: relevantNotes
    };
  }
}
```

**搜索示例**：
```
用户输入："上次客户提到的那个技术方案是什么？"

传统关键词搜索：❌ 无结果（没有"技术方案"关键词）

AI 语义搜索：
1. 理解意图：查找客户相关的技术讨论
2. 语义匹配：
   - 笔记1: "客户会议 - 讨论架构设计"（相似度 0.85）
   - 笔记2: "技术评审 - 方案对比"（相似度 0.78）
   - 笔记3: "客户需求 - 系统方案"（相似度 0.92）✅
3. 返回：笔记3 + 相关段落高亮
```

#### 2.3 模糊搜索

```typescript
// 容错搜索
class FuzzySearch {
  // 拼音搜索
  pinyinSearch(query: string): Note[] {
    // "huiyi" → 匹配 "会议"、"汇议"
  }
  
  // 错别字容忍
  typoTolerance(query: string): Note[] {
    // "技术方案" → 匹配 "技书方案"（1个错字）
  }
  
  // 同义词扩展
  synonymExpansion(query: string): Note[] {
    // "客户" → 扩展到 "用户"、"甲方"、"需求方"
  }
  
  // OCR 容错
  ocrCorrection(query: string): Note[] {
    // "0"↔"O", "1"↔"l" 等常见 OCR 错误
  }
}
```

### 3. 智能组织系统

#### 3.1 自动分类

```typescript
interface NoteClassification {
  category: 'work' | 'personal' | 'learning' | 'idea' | 'reference';
  subcategory?: string;
  project?: string;
  confidence: number;
}

// 分类算法
const classifyNote = async (note: Note) => {
  // 方法1: 基于内容的机器学习
  const mlPrediction = await classifier.predict(note.content);
  
  // 方法2: 基于历史的模式匹配
  const historicalPattern = findSimilarNotes(note, userHistory);
  
  // 方法3: 基于关联的推理
  const relatedClassification = inferFromRelations(note.relatedEventIds);
  
  // 融合结果
  return mergeClassifications([mlPrediction, historicalPattern, relatedClassification]);
};
```

#### 3.2 自动标签

```typescript
// 多层级标签提取
class TagExtractor {
  async extractTags(note: Note): Promise<TagHierarchy> {
    const tags = {
      // 实体标签
      entities: await this.extractEntities(note.content),
      // "人物: 张三, 李四"
      // "公司: 阿里巴巴, 腾讯"
      // "产品: iPhone, ChatGPT"
      
      // 主题标签
      topics: await this.extractTopics(note.content),
      // "主题: 技术方案, 项目管理, 用户研究"
      
      // 情感标签
      sentiments: await this.analyzeSentiment(note.content),
      // "情感: 积极, 紧急, 重要"
      
      // 用户自定义标签
      custom: note.tags || []
    };
    
    return tags;
  }
}
```

**示例**：
```
笔记内容：
"今天和张三讨论了新版本的技术方案，决定采用微服务架构。
客户要求下周五前完成初步设计，时间比较紧张。"

自动提取标签：
📋 人物: #张三
🏢 项目: #新版本
💡 主题: #技术方案 #微服务架构 #设计
⏰ 时间: #下周五
⚠️ 状态: #紧急 #待办
```

#### 3.3 知识图谱

```typescript
interface KnowledgeGraph {
  nodes: {
    id: string;
    type: 'note' | 'event' | 'task' | 'person' | 'concept';
    label: string;
    properties: Record<string, any>;
  }[];
  
  edges: {
    from: string;
    to: string;
    type: 'references' | 'related_to' | 'derived_from' | 'mentions';
    weight: number;
  }[];
}

// 自动构建关联
class KnowledgeGraphBuilder {
  async buildGraph(notes: Note[]) {
    const graph: KnowledgeGraph = { nodes: [], edges: [] };
    
    // 1. 添加笔记节点
    notes.forEach(note => {
      graph.nodes.push({
        id: note.id,
        type: 'note',
        label: note.title,
        properties: note
      });
    });
    
    // 2. 提取概念节点
    const concepts = await this.extractConcepts(notes);
    concepts.forEach(concept => graph.nodes.push(concept));
    
    // 3. 建立关联边
    for (const note of notes) {
      // 显式引用
      const references = this.extractReferences(note.content);
      references.forEach(ref => {
        graph.edges.push({
          from: note.id,
          to: ref.id,
          type: 'references',
          weight: 1.0
        });
      });
      
      // 语义相似
      const similar = await this.findSimilarNotes(note);
      similar.forEach(sim => {
        graph.edges.push({
          from: note.id,
          to: sim.id,
          type: 'related_to',
          weight: sim.similarity
        });
      });
    }
    
    return graph;
  }
}
```

**可视化效果**：
```
          会议纪要A
              │
      ┌───────┼───────┐
      │       │       │
   需求文档  技术方案  项目计划
      │       │       │
      └───────┼───────┘
              │
          概念: 微服务
              │
      ┌───────┼───────┐
   学习笔记  参考资料  最佳实践
```

### 4. 智能摘要生成

#### 4.1 单篇摘要

```typescript
interface NoteSummary {
  tldr: string;                  // Too Long; Didn't Read
  keyPoints: string[];           // 关键要点（3-5个）
  entities: {                    // 关键实体
    people: string[];
    organizations: string[];
    locations: string[];
    dates: Date[];
  };
  sentiment: string;             // 整体情感
  actionItems?: string[];        // 行动项
  estimatedReadTime: number;     // 预计阅读时间（秒）
}

// 多级摘要
const generateSummary = async (note: Note, level: 'brief' | 'medium' | 'detailed') => {
  const summaryLengths = {
    brief: 50,      // 一句话摘要
    medium: 200,    // 段落摘要
    detailed: 500   // 详细摘要
  };
  
  return await llm.summarize(note.content, {
    maxLength: summaryLengths[level],
    extractKeyPoints: true,
    extractEntities: true
  });
};
```

#### 4.2 批量摘要

```typescript
// 将多篇笔记合并摘要
const summarizeMultiple = async (notes: Note[], theme?: string) => {
  // 1. 按时间/主题分组
  const grouped = groupNotes(notes, theme);
  
  // 2. 每组生成摘要
  const groupSummaries = await Promise.all(
    grouped.map(group => generateSummary(group))
  );
  
  // 3. 合并高层摘要
  const overallSummary = await llm.synthesize(groupSummaries);
  
  return {
    overall: overallSummary,
    groups: groupSummaries,
    timeline: generateTimeline(notes),
    keyInsights: extractInsights(notes)
  };
};
```

**示例**：
```
输入：本周 15 篇笔记

输出：
📌 本周要点：
1. 完成了新功能设计，客户反馈积极
2. 遇到性能问题，已找到解决方案
3. 团队进展顺利，下周进入开发阶段

👥 关键人物：张三（设计）、李四（开发）、客户王总
📅 重要日期：12/18 设计评审，12/20 开发启动
⚡ 行动项：
   - 完善设计文档（周三前）
   - 准备技术方案（周五前）
   - 跟进客户反馈（本周内）
```

### 5. 智能笔记增强

#### 5.1 自动补全

```typescript
// 上下文感知的智能补全
class NoteAutoComplete {
  async suggest(currentText: string, cursorPosition: number) {
    const context = this.analyzeContext(currentText, cursorPosition);
    
    return {
      // 内容补全
      contentSuggestions: await this.suggestContent(context),
      // "根据上文，可能想写..."
      
      // 格式补全
      formatSuggestions: await this.suggestFormat(context),
      // 自动补全 Markdown 列表、表格
      
      // 引用补全
      referenceSuggestions: await this.suggestReferences(context),
      // 引用相关笔记、链接
      
      // 数据补全
      dataSuggestions: await this.suggestData(context)
      // 自动填充日期、人名、项目名
    };
  }
}
```

#### 5.2 智能改写

```typescript
// 一键优化笔记
const enhanceNote = async (note: Note, options: EnhanceOptions) => {
  return {
    // 语法修正
    grammarFix: await fixGrammar(note.content),
    
    // 润色文字
    polished: await polishWriting(note.content),
    
    // 扩展内容
    expanded: await expandContent(note.content),
    
    // 精简内容
    condensed: await condenseContent(note.content),
    
    // 改变风格
    rewritten: await rewriteStyle(note.content, options.targetStyle),
    
    // 翻译
    translated: await translate(note.content, options.targetLanguage)
  };
};
```

#### 5.3 自动链接

```typescript
// 自动识别并创建链接
class AutoLinker {
  async linkifyNote(note: Note) {
    const links = {
      // 内部链接
      internal: await this.findRelatedNotes(note),
      // "[[相关笔记标题]]"
      
      // 外部链接
      external: await this.extractURLs(note.content),
      // 自动检测并格式化 URL
      
      // 概念链接
      concepts: await this.linkConcepts(note),
      // 链接到概念定义笔记
      
      // 时间链接
      temporal: await this.linkEvents(note),
      // 链接到相关事件
      
      // 人物链接
      people: await this.linkPeople(note)
      // 链接到人物档案
    };
    
    return this.applyLinks(note.content, links);
  }
}
```

---

## 用户场景

### 场景 1: 会议中实时记录

**角色**：产品经理  
**场景**：参加技术评审会，需要快速记录

**传统流程**：
- 手动打字记录，跟不上讨论速度
- 容易遗漏关键信息
- 会后整理费时费力

**AI 增强流程**：
1. 开启语音实时转写
2. AI 自动分离说话人
3. 实时显示文字，可快速批注
4. 会后自动生成结构化纪要：
   - 议程回顾
   - 讨论要点
   - 决策事项
   - 行动项（自动转任务）
5. 自动关联到项目和相关笔记

**效果**：
- 记录完整度：60% → 95%
- 会后整理时间：30分钟 → 5分钟

### 场景 2: 灵感随手记

**角色**：设计师  
**场景**：路上看到有趣的设计，想记录下来

**传统流程**：
- 拍照 → 回去忘记整理
- 或者手动打字描述 → 不够直观

**AI 增强流程**：
1. 拍照上传
2. AI 自动识别：
   - 设计元素（颜色、排版、字体）
   - 场景描述
   - 可能的应用场景
3. 自动分类到"设计灵感"
4. 自动打标签：#UI设计 #配色 #极简风格
5. 关联到正在进行的设计项目

**效果**：
- 灵感利用率：20% → 70%

### 场景 3: 知识检索

**角色**：研究员  
**场景**：回忆某个技术细节，但记不清在哪篇笔记

**传统流程**：
- 关键词搜索 → 无结果
- 翻看历史笔记 → 浪费时间
- 最终放弃或重新查资料

**AI 增强流程**：
1. 语义搜索："上个月讨论的那个性能优化方法"
2. AI 理解意图，找到相关笔记
3. 高亮相关段落
4. 显示关联笔记："还有这些相关内容"
5. RAG 问答："这个方法的具体步骤是？"

**效果**：
- 查找成功率：40% → 90%
- 平均查找时间：10分钟 → 30秒

---

## 数据模型

### Note 核心字段

```typescript
interface Note {
  // ========== 基础信息 ==========
  id: string;
  title: string;
  content: string;              // Markdown 格式
  contentText: string;          // 纯文本（用于搜索）
  excerpt?: string;             // 摘要
  
  // ========== 类型分类 ==========
  type: 'text' | 'voice' | 'image' | 'meeting' | 'web-clip' | 'file';
  category?: string;            // 分类
  tags: string[];               // 标签
  
  // ========== 时间维度 ==========
  createdAt: Date;
  updatedAt: Date;
  lastViewedAt?: Date;
  
  // ========== 附件资源 ==========
  attachments: Attachment[];
  images: string[];             // 图片 URL
  audioUrl?: string;            // 音频文件
  videoUrl?: string;            // 视频文件
  
  // ========== 关联维度 ==========
  relatedNoteIds: string[];     // 关联笔记
  relatedEventIds: string[];    // 关联事件
  relatedTaskIds: string[];     // 关联任务
  relatedPeople: string[];      // 关联人物
  parentNoteId?: string;        // 父笔记（嵌套笔记）
  
  // ========== AI 增强 ==========
  aiGenerated?: {
    summary?: string;           // AI 摘要
    keyPoints?: string[];       // 关键要点
    entities?: EntityExtraction; // 实体提取
    sentiment?: SentimentAnalysis; // 情感分析
    topics?: string[];          // 主题标签
  };
  
  ocrData?: {                   // OCR 数据
    text: string;
    confidence: number;
    language: string;
  };
  
  speechData?: {                // 语音数据
    transcript: string;
    speakers?: Speaker[];
    duration: number;
  };
  
  embedding?: number[];         // 向量 embedding
  
  // ========== 元数据 ==========
  source?: {                    // 来源
    type: 'manual' | 'import' | 'clip' | 'email' | 'meeting';
    url?: string;
    originalFormat?: string;
  };
  
  permissions?: {               // 权限
    isPublic: boolean;
    sharedWith?: string[];
  };
  
  // ========== 统计数据 ==========
  stats?: {
    viewCount: number;
    editCount: number;
    wordCount: number;
    readTime: number;           // 预计阅读时间（秒）
  };
}

interface EntityExtraction {
  people: string[];             // 人物
  organizations: string[];      // 组织
  locations: string[];          // 地点
  dates: Date[];                // 日期
  concepts: string[];           // 概念
}

interface Speaker {
  id: string;
  name?: string;
  segments: {
    start: number;
    end: number;
    text: string;
  }[];
}
```

---

## AI 能力

### 1. 自然语言处理

#### 1.1 文本理解
- **摘要生成**：抽取式 + 生成式
- **关键词提取**：TF-IDF + TextRank + BERT
- **实体识别**：NER（人名、地名、机构名、时间）
- **情感分析**：积极/消极/中性
- **主题建模**：LDA + BERT Topic

#### 1.2 文本生成
- **自动补全**：基于上下文的续写
- **改写润色**：语法修正、风格转换
- **扩展内容**：基于关键点展开
- **翻译**：多语言互译

### 2. 语音处理

#### 2.1 ASR 语音识别
- **实时转写**：延迟 < 500ms
- **离线识别**：隐私保护
- **多语言**：中英文混合
- **口音适配**：方言、外语口音

#### 2.2 说话人识别
- **说话人分离**：区分不同发言人
- **说话人聚类**：自动分组
- **声纹识别**：识别特定人物

### 3. 计算机视觉

#### 3.1 OCR 文字识别
- **印刷体识别**：准确率 > 98%
- **手写体识别**：中英文手写
- **场景文字**：自然场景 OCR
- **版面分析**：表格、公式、图表

#### 3.2 图像理解
- **场景分类**：文档、白板、照片等
- **物体检测**：识别图片中的物体
- **图像描述**：生成文字描述
- **相似图搜索**：以图搜图

### 4. 向量检索

#### 4.1 Embedding 生成
```typescript
// 使用多种 Embedding 模型
class EmbeddingService {
  // 通用文本 embedding
  async embedText(text: string): Promise<number[]> {
    return await this.model.encode(text);
  }
  
  // 多模态 embedding
  async embedMultimodal(content: {
    text?: string;
    image?: File;
    audio?: File;
  }): Promise<number[]> {
    // CLIP、ImageBind 等多模态模型
  }
}
```

#### 4.2 向量数据库
- **ChromaDB**：开源、易用
- **Pinecone**：云服务、高性能
- **Qdrant**：高性能、自托管

---

## 交互设计

### 1. 笔记编辑器

```
┌─────────────────────────────────────────────┐
│  # 标题                            [🎤] [📷]│
│                                              │
│  正文编辑区...                               │
│                                              │
│  ┌──────────────────────────────┐           │
│  │ 💡 AI 建议                    │           │
│  │                               │           │
│  │ 你可能想补充：                 │           │
│  │ • 这次会议的决策事项          │           │
│  │ • 下一步行动计划              │           │
│  │                               │           │
│  │ [采纳] [忽略]                │           │
│  └──────────────────────────────┘           │
│                                              │
│  标签: #工作 #会议 #项目A                    │
│                                              │
│  关联: 📅 周会 (12/16)  📋 任务3            │
└─────────────────────────────────────────────┘
```

### 2. 语音笔记

```
┌─────────────────────────────────────────────┐
│  🎤 正在录音...              00:35  [⏸] [⏹]│
│                                              │
│  实时转写：                                   │
│  "今天和客户讨论了新功能的需求，他们提出..."  │
│   ▲                                          │
│                                              │
│  🤖 AI 实时分析：                            │
│  • 检测到关键词：客户、需求、新功能           │
│  • 建议标签：#客户会议 #需求讨论              │
│  • 识别到行动项：整理需求文档                 │
│                                              │
│  说话人：                                     │
│  👤 我      (80%)                            │
│  👤 客户    (20%)                            │
└─────────────────────────────────────────────┘
```

### 3. 智能搜索

```
┌─────────────────────────────────────────────┐
│  🔍 上次客户提到的技术方案                    │
│                                              │
│  💡 你可能想找：                             │
│  • 客户会议纪要 (12/10) - 90% 匹配          │
│  • 技术方案文档 (12/05) - 85% 匹配          │
│  • 需求讨论笔记 (12/08) - 80% 匹配          │
│                                              │
│  🎯 相关主题：                                │
│  #技术方案 #客户需求 #架构设计                │
│                                              │
│  📊 时间分布：                                │
│  ▓▓▓▓▓░░░░░░░░░░░░░░░░░                      │
│  12/01    12/08    12/15                     │
└─────────────────────────────────────────────┘
```

### 4. 知识图谱

```
┌─────────────────────────────────────────────┐
│  📊 知识图谱                         [×]     │
│                                              │
│          [客户需求]                          │
│               │                              │
│       ┌───────┼───────┐                     │
│       │       │       │                     │
│   [技术    [设计    [项目                    │
│    方案]    文档]    计划]                   │
│       │               │                     │
│       └───────┬───────┘                     │
│               │                              │
│          [开发任务]                          │
│                                              │
│  点击节点查看详情 • 双击展开关联             │
└─────────────────────────────────────────────┘
```

---

## 技术架构

### 1. 前端架构

```typescript
src/
├── features/
│   └── notes/
│       ├── components/
│       │   ├── NoteEditor.tsx          // 编辑器
│       │   ├── VoiceRecorder.tsx       // 语音录制
│       │   ├── ImageCapture.tsx        // 图片采集
│       │   ├── SearchPanel.tsx         // 搜索面板
│       │   ├── KnowledgeGraph.tsx      // 知识图谱
│       │   └── AIAssistant.tsx         // AI 助手
│       ├── services/
│       │   ├── NoteService.ts          // 笔记 CRUD
│       │   ├── VoiceService.ts         // 语音处理
│       │   ├── OCRService.ts           // OCR 服务
│       │   ├── SearchService.ts        // 搜索服务
│       │   └── RAGService.ts           // RAG 问答
│       ├── hooks/
│       │   ├── useVoiceRecording.ts
│       │   ├── useSemanticSearch.ts
│       │   └── useAutoComplete.ts
│       └── stores/
│           └── noteStore.ts
```

### 2. AI 服务架构

```typescript
// AI 笔记服务
class AINoteService {
  private voiceService: VoiceService;
  private ocrService: OCRService;
  private vectorStore: VectorStore;
  private llm: LanguageModel;
  
  // 语音笔记
  async createVoiceNote(audio: Blob): Promise<Note> {
    const transcript = await this.voiceService.transcribe(audio);
    const summary = await this.llm.summarize(transcript);
    const tags = await this.extractTags(transcript);
    
    return this.saveNote({
      type: 'voice',
      content: transcript,
      audioUrl: await this.uploadAudio(audio),
      aiGenerated: { summary, topics: tags }
    });
  }
  
  // 图片笔记
  async createImageNote(image: File): Promise<Note> {
    const ocrResult = await this.ocrService.recognize(image);
    const description = await this.llm.describeImage(image);
    
    return this.saveNote({
      type: 'image',
      content: ocrResult.text,
      images: [await this.uploadImage(image)],
      ocrData: ocrResult
    });
  }
  
  // 语义搜索
  async semanticSearch(query: string): Promise<Note[]> {
    const results = await this.vectorStore.search(query);
    return results.map(r => this.getNote(r.id));
  }
}
```

### 3. 数据存储

```typescript
// IndexedDB Schema
interface NoteDB {
  notes: Note[];
  embeddings: {
    noteId: string;
    vector: number[];
  }[];
  fullTextIndex: {
    word: string;
    noteIds: string[];
  }[];
  voiceCache: {
    audioUrl: string;
    transcript: string;
  }[];
  ocrCache: {
    imageUrl: string;
    text: string;
  }[];
}
```

---

## 迭代规划

### Phase 1: 基础笔记（已完成）
- ✅ Markdown 编辑器
- ✅ 基础 CRUD
- ✅ 标签和分类
- ✅ 全文搜索

### Phase 2: 语音图片（2周）
- 🔄 语音转写
- 🔄 OCR 识别
- 🔄 图片笔记
- 🔄 附件管理

### Phase 3: AI 搜索（2周）
- ⏳ 向量 embedding
- ⏳ 语义搜索
- ⏳ RAG 问答
- ⏳ 相关推荐

### Phase 4: 智能组织（2周）
- ⏳ 自动分类
- ⏳ 自动标签
- ⏳ 知识图谱
- ⏳ 智能关联

### Phase 5: 高级功能（3周）
- ⏳ 会议纪要
- ⏳ 批量摘要
- ⏳ 智能改写
- ⏳ 协作分享

---

## 性能指标

### 用户体验指标
- **语音转写准确率**: > 95%
- **OCR 识别准确率**: > 98%
- **搜索响应时间**: < 500ms
- **RAG 问答质量**: > 4.0/5

### 技术指标
- **向量检索延迟**: < 100ms
- **全文搜索延迟**: < 50ms
- **语音实时转写延迟**: < 500ms
- **离线可用性**: 100%

---

## 附录

### A. 参考产品
- Notion AI、Obsidian、Roam Research
- 语雀、飞书文档、钉钉文档
- Otter.ai、讯飞听见、搜狗录音助手

### B. 技术栈
- **语音**: Web Speech API、讯飞ASR、Azure Speech
- **OCR**: 腾讯云OCR、百度OCR、Tesseract
- **Embedding**: sentence-transformers、OpenAI Embeddings
- **向量DB**: ChromaDB、Qdrant、Pinecone
- **LLM**: 腾讯混元、阿里通义、OpenAI

### C. 变更日志
- 2024-12-16: v1.0 初始版本
