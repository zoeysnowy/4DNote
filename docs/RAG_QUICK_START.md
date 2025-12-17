# RAG 系统快速开始指南

本指南帮助你从零开始设置基于视频字幕的 RAG 系统。

---

## 📋 前置要求

### 1. 安装 Python 和 yt-dlp

```bash
# 安装 Python (如果还没有)
# 下载: https://www.python.org/downloads/

# 安装 yt-dlp
pip install yt-dlp
```

### 2. 安装 Node.js 依赖

```bash
# 在 4DNote 项目根目录
npm install chromadb openai
```

### 3. 启动 ChromaDB

```bash
# 方法 1: Docker (推荐)
docker run -d -p 8000:8000 chromadb/chroma

# 方法 2: Python
pip install chromadb
chroma run --host localhost --port 8000
```

### 4. 设置 OpenAI API Key

```bash
# Windows (PowerShell)
$env:OPENAI_API_KEY="sk-your-api-key-here"

# macOS/Linux
export OPENAI_API_KEY="sk-your-api-key-here"
```

---

## 🚀 完整流程

### 步骤 1: 下载视频字幕

```bash
# 编辑 scripts/download-subtitles.js，添加视频链接
# 然后运行:
node scripts/download-subtitles.js

# 或从频道批量下载:
node scripts/download-subtitles.js --channel "https://www.youtube.com/@example" 20
```

**预期结果**: 
- ✅ 字幕文件保存在 `AI训练素材/vlog-subtitles/`
- ✅ 格式: `视频标题.zh-Hans.srt`, `视频标题.en.srt`

---

### 步骤 2: 解析字幕为 Timestamp Nodes

```bash
node scripts/parse-subtitles.js
```

**预期结果**:
- ✅ 生成 `test-data/timestamp-nodes.json`
- ✅ 每个节点包含: id, timestamp, title, content
- ✅ 段落间隔 > 5 分钟会创建新节点

**示例输出**:
```
📁 找到 10 个字幕文件

📄 解析: My Morning Routine.zh-Hans.srt
  ✅ 生成 15 个节点 (342 条字幕)

✅ 解析完成！
📊 统计:
  - 总节点数: 156
  - 平均长度: 423 字符
  - 输出文件: ./test-data/timestamp-nodes.json
```

---

### 步骤 3: 导入到向量数据库

```bash
node scripts/setup-rag.js
```

**预期结果**:
- ✅ 生成 Embeddings 并导入 ChromaDB
- ✅ 自动运行测试检索
- ✅ 显示检索结果示例

**示例输出**:
```
🚀 开始设置 RAG 系统...

📊 加载 156 个 Timestamp Nodes

🗄️  创建 Collection: 4dnote-vlog-events
  ✅ Collection 创建成功

📦 分为 16 个批次处理...

🔄 处理批次 1/16 (10 个节点)
  ✅ 批次 1 完成
...

✅ 数据导入完成！

🔍 测试检索功能...

❓ 查询: "早上做了什么事情？"
📌 结果:
  1. [2024-01-15 08:30:00] 标题: Morning Routine - Part 1 内容: 早上7点起床，先做了15分钟的拉伸...
     来源: My Morning Routine @ 00:08:30
  2. [2024-02-03 07:45:00] 标题: Productive Morning - Part 2 内容: 今天早上特别早起，6点半就...
     来源: Productive Morning @ 00:07:45
```

---

## 🧪 测试检索

创建 `scripts/test-rag-search.js` 来测试自定义查询：

```javascript
const { ChromaClient } = require('chromadb');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient({ path: 'http://localhost:8000' });

async function search(query) {
  const collection = await chroma.getCollection({ name: '4dnote-vlog-events' });
  
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  });
  
  const results = await collection.query({
    queryEmbeddings: [embedding.data[0].embedding],
    nResults: 5
  });
  
  console.log(`\n🔍 查询: "${query}"\n`);
  results.documents[0].forEach((doc, i) => {
    console.log(`${i + 1}. ${doc.slice(0, 100)}...`);
  });
}

// 测试查询
search(process.argv[2] || '今天做了什么？');
```

运行:
```bash
node scripts/test-rag-search.js "上周学习了什么？"
```

---

## 📊 数据量建议

| 阶段 | 视频数 | 字幕条数 | Nodes 数 | 所需时间 |
|------|--------|---------|---------|---------|
| **快速测试** | 3-5 | 500-1000 | 30-80 | 5 分钟 |
| **完整测试** | 10-20 | 2000-5000 | 150-400 | 15 分钟 |
| **生产数据** | 50-100 | 10000+ | 1000-3000 | 30-60 分钟 |

**注意**: 
- OpenAI API 调用成本: ~$0.0001/1k tokens
- 1000 个节点约 $0.10-0.20
- 建议先用 5-10 个视频测试

---

## 🔧 配置调整

### 调整节点生成规则

编辑 `scripts/parse-subtitles.js`:

```javascript
const CONFIG = {
  mergeThreshold: 5 * 60 * 1000,  // 改为 3 分钟: 3 * 60 * 1000
  minNodeLength: 50,               // 最小节点长度（字符）
};
```

### 调整检索语言

编辑 `scripts/download-subtitles.js`:

```javascript
const CONFIG = {
  languages: ['zh-Hans'],  // 仅中文
  // languages: ['en'],     // 仅英文
  // languages: ['zh-Hans', 'en'],  // 双语
};
```

---

## ❓ 常见问题

### 1. yt-dlp 下载失败

```bash
# 更新 yt-dlp 到最新版本
pip install --upgrade yt-dlp

# 检查视频是否可用
yt-dlp --list-subs <video_url>
```

### 2. ChromaDB 连接失败

```bash
# 检查 ChromaDB 是否运行
curl http://localhost:8000/api/v1/heartbeat

# 重启 ChromaDB
docker restart <container_id>
```

### 3. OpenAI API 限流

```javascript
// 在 setup-rag.js 中增加延迟
await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒
```

### 4. 字幕文件为空

- 检查视频是否有字幕（YouTube 自动字幕需要一定时长）
- 尝试添加 `--write-auto-sub` 参数

---

## 📚 下一步

1. ✅ 跑通基础流程（5-10 个视频）
2. ✅ 测试检索质量
3. ✅ 调整节点生成规则（mergeThreshold）
4. ✅ 集成到 4DNote UI
5. ✅ 添加用户自己的笔记数据

---

## 📞 需要帮助？

参考文档:
- [视频源推荐](./AI训练素材/VIDEO_SOURCES.md)
- [yt-dlp 文档](https://github.com/yt-dlp/yt-dlp)
- [ChromaDB 文档](https://docs.trychroma.com/)
