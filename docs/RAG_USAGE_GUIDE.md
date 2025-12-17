# RAG 系统使用指南

## 🎯 两种模式

### 1. 简化模式（立即可用，无需额外依赖）

使用关键词匹配，适合快速测试和演示。

```bash
# 生成测试数据并运行批量测试
npm run rag-demo

# 自定义查询
npm run rag-simple "早上 起床 运动"
npm run rag-simple "学习 开发 编程"
npm run rag-simple "健身 运动 锻炼"
```

**特点**：
- ✅ 无需 OpenAI API Key
- ✅ 无需 ChromaDB 数据库
- ✅ 立即可用
- ⚠️ 仅支持关键词匹配（非语义理解）
- ⚠️ 中文查询需要使用关键词，不支持完整句子

**查询技巧**：
```bash
# ❌ 不推荐：完整句子
npm run rag-simple "今天早上做了什么事情？"

# ✅ 推荐：关键词组合
npm run rag-simple "早上 事情 活动"
npm run rag-simple "学习 工作 任务"
```

---

### 2. 完整模式（需要 OpenAI + ChromaDB）

使用语义 Embeddings，支持自然语言理解。

#### 前置准备

```bash
# 1. 启动 ChromaDB
docker run -d -p 8000:8000 chromadb/chroma
# 或
pip install chromadb && chroma run --host localhost --port 8000

# 2. 设置 OpenAI API Key
$env:OPENAI_API_KEY="sk-your-key-here"
```

#### 使用流程

```bash
# 方式 1: 使用测试数据
node scripts/generate-mock-data.js
npm run setup-rag

# 方式 2: 从视频字幕生成（推荐）
# 2.1 下载字幕
npm run download-subs --channel "https://youtube.com/@example" 10

# 2.2 解析字幕为 Timestamp Nodes
npm run parse-subs

# 2.3 导入向量数据库
npm run setup-rag

# 3. 测试检索
npm run test-rag "今天早上做了什么事情？"
npm run test-rag -- --batch  # 批量测试
```

**特点**：
- ✅ 支持自然语言查询
- ✅ 语义理解（"早上活动" = "morning routine"）
- ✅ 相关度更准确
- ⚠️ 需要 API 费用（~$0.01/100 queries）

---

## 📋 完整命令列表

| 命令 | 说明 | 前置要求 |
|------|------|---------|
| `npm run rag-demo` | 一键演示（生成数据+批量测试） | 无 |
| `npm run rag-simple "查询"` | 简化版检索 | 无 |
| `npm run download-subs` | 下载视频字幕 | yt-dlp |
| `npm run parse-subs` | 解析字幕为节点 | 字幕文件 |
| `npm run setup-rag` | 导入向量数据库 | ChromaDB + OpenAI |
| `npm run test-rag "查询"` | 完整版检索 | setup-rag 完成 |

---

## 🚀 快速开始

### 零配置演示（30秒）

```bash
npm run rag-demo
```

这会：
1. 生成 12 个模拟的 timestamp nodes
2. 运行 7 个预设查询
3. 显示检索结果

### 自定义查询

```bash
# 简化版（关键词）
npm run rag-simple "编程 开发 React"
npm run rag-simple "阅读 书籍 笔记"
npm run rag-simple "健身 运动 锻炼"

# 完整版（自然语言，需要先 setup-rag）
npm run test-rag "最近在学习什么技术？"
npm run test-rag "有哪些运动相关的记录？"
```

---

## 📊 数据来源

### 1. 模拟数据（测试用）

```bash
node scripts/generate-mock-data.js
```

生成 12 个包含中文内容的 vlog 节点。

### 2. 视频字幕（真实数据）

#### 2.1 编辑视频列表

编辑 `scripts/download-subtitles.js`：

```javascript
const CONFIG = {
  videoSources: [
    'https://www.youtube.com/watch?v=VIDEO_ID_1',
    'https://www.youtube.com/watch?v=VIDEO_ID_2',
  ],
};
```

#### 2.2 下载字幕

```bash
# 下载单个视频
npm run download-subs

# 从频道下载最新 20 个视频
npm run download-subs -- --channel "https://youtube.com/@example" 20
```

#### 2.3 解析字幕

```bash
npm run parse-subs
```

**规则**：字幕段落间隔 > 5 分钟会创建新的 timestamp node

---

## ⚙️ 配置选项

### 修改时间间隔阈值

编辑 `scripts/parse-subtitles.js`：

```javascript
const CONFIG = {
  mergeThreshold: 5 * 60 * 1000,  // 5分钟 → 改为 3分钟: 3 * 60 * 1000
};
```

### 修改最小节点长度

```javascript
const CONFIG = {
  minNodeLength: 50,  // 最少 50 字符 → 改为 100: 100
};
```

---

## 🎬 完整工作流演示

```bash
# === 方案 A: 快速测试（1分钟） ===
npm run rag-demo
npm run rag-simple "学习 编程"

# === 方案 B: 使用视频数据（15分钟） ===

# 1. 下载字幕（5分钟）
npm run download-subs -- --channel "https://youtube.com/@example" 10

# 2. 解析数据（1分钟）
npm run parse-subs

# 3. 启动 ChromaDB（需要 Docker）
docker run -d -p 8000:8000 chromadb/chroma

# 4. 设置 API Key
$env:OPENAI_API_KEY="sk-xxx"

# 5. 导入数据（5分钟，取决于数据量）
npm run setup-rag

# 6. 测试检索
npm run test-rag "今天早上做了什么？"
npm run test-rag -- --batch
```

---

## 💡 使用建议

### 查询技巧

**简化模式**：
- ✅ 使用具体的名词和动词
- ✅ 多个关键词组合
- ❌ 避免"什么"、"如何"等虚词

**完整模式**：
- ✅ 自然语言句子
- ✅ 支持同义词理解
- ✅ 支持跨语言（中英混合）

### 数据质量

1. **视频选择**：
   - 优先选择带人工字幕的视频（准确率高）
   - vlog、日常记录类视频效果最好
   - 避免快剪、混剪类视频

2. **数据量**：
   - 测试：10-20 个视频（~100 nodes）
   - 生产：50-100 个视频（~500-1000 nodes）

---

## 📚 相关文档

- [完整 RAG 快速开始指南](./docs/RAG_QUICK_START.md)
- [视频源推荐](./AI训练素材/VIDEO_SOURCES.md)
- [架构文档](./docs/architecture/APP_ARCHITECTURE_PRD.md)

---

## ❓ 常见问题

### 1. 简化版检索不到结果？

**原因**：查询使用了完整句子而非关键词

**解决**：
```bash
# ❌ 错误
npm run rag-simple "今天早上做了什么事情？"

# ✅ 正确
npm run rag-simple "早上 活动 事情"
```

### 2. ChromaDB 连接失败？

```bash
# 检查服务是否运行
curl http://localhost:8000/api/v1/heartbeat

# 重启 Docker 容器
docker restart <container_id>
```

### 3. OpenAI API 报错？

```bash
# 检查 API Key 是否设置
echo $env:OPENAI_API_KEY

# 重新设置
$env:OPENAI_API_KEY="sk-your-key"
```

### 4. 字幕下载失败？

```bash
# 更新 yt-dlp
pip install --upgrade yt-dlp

# 检查视频是否有字幕
yt-dlp --list-subs <video_url>
```

---

## 🎯 下一步

1. ✅ 先运行 `npm run rag-demo` 体验基础功能
2. ✅ 如果满意，准备 ChromaDB + OpenAI 环境
3. ✅ 下载真实视频字幕数据
4. ✅ 集成到 4DNote UI（待开发）

需要帮助？查看 [RAG_QUICK_START.md](./docs/RAG_QUICK_START.md)
