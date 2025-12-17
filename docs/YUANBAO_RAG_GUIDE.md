# 腾讯混元 RAG 配置指南

腾讯元宝（Yuanbao）底层使用的是**腾讯混元大模型**，你的项目已经集成了完整的混元 API 支持！

---

## 🎯 快速开始

### 选项 1: 本地模式（无需 API Key，立即可用）

```bash
# 1. 设置 RAG 系统
npm run rag-setup-hunyuan

# 2. 测试检索
npm run rag-hunyuan "早上做了什么？"
npm run rag-hunyuan "学习相关的记录"
```

**特点**：
- ✅ 无需配置，立即可用
- ✅ 本地向量检索
- ⚠️ 仅支持关键词匹配

---

### 选项 2: 腾讯混元增强模式（推荐）

使用腾讯混元 API 进行智能理解和检索增强。

#### 步骤 1: 获取腾讯云密钥

1. 访问：https://console.cloud.tencent.com/cam/capi
2. 创建或复制你的 **SecretId** 和 **SecretKey**

#### 步骤 2: 配置密钥

```bash
# 进入代理目录
cd ai-proxy

# 创建配置文件
copy .env.example .env  # Windows
# 或
cp .env.example .env    # macOS/Linux

# 编辑 .env 文件
notepad .env  # Windows
# 或
vi .env       # macOS/Linux
```

`.env` 文件内容：
```env
HUNYUAN_SECRET_ID=你的SecretId
HUNYUAN_SECRET_KEY=你的SecretKey
PORT=3001
```

#### 步骤 3: 启动代理服务器

**为什么需要代理？**
腾讯云 API 不支持浏览器直接调用（CORS 限制），需要通过本地代理转发请求。

```bash
# 方式 1: 使用 npm 快捷命令（推荐）
npm run proxy-start

# 方式 2: 手动启动
cd ai-proxy
npm install  # 仅首次需要
npm start
```

启动成功后会看到：
```
🚀 腾讯混元 API 代理服务器已启动
📡 监听端口: http://localhost:3001
```

**保持这个窗口运行！**

#### 步骤 4: 测试 RAG 检索

打开新的终端窗口：

```bash
# 设置 RAG 系统
npm run rag-setup-hunyuan

# 测试检索（现在会使用混元 AI 增强）
npm run rag-hunyuan "今天早上做了什么事情？"
npm run rag-hunyuan "最近有什么学习相关的活动？"
npm run rag-hunyuan "运动健身的记录"
```

---

## 📊 完整示例

### 1. 本地检索（关键词匹配）

```bash
npm run rag-simple "早上 起床 运动"
```

**输出**：
```
📌 找到 3 个相关结果:

1. [相似度: 100.0%]
   时间: 2024-01-01 08:30:00
   来源: My Morning Routine Vlog
   内容: 早上7点起床，先做了15分钟的拉伸运动...
```

### 2. 混元增强检索（AI 理解）

```bash
# 确保代理服务器运行中
npm run proxy-start  # 另一个终端窗口

# 然后测试
npm run rag-hunyuan "今天早上做了什么？"
```

**输出**：
```
📊 本地向量检索:
  1. [相似度: 85.3%]
     2024-01-01 08:30:00 - Morning Routine - Part 1
     早上7点起床，先做了15分钟的拉伸运动...

🤖 腾讯混元 AI 分析:

根据时间日志，今天早上主要做了以下活动：
1. 7点起床，进行了15分钟的拉伸运动
2. 冲了热水澡
3. 9:30到达咖啡馆，开始处理邮件和准备会议资料
这是一个健康且高效的早晨安排。
```

---

## 🔧 架构说明

```
┌─────────────────────────────────────────────────────────┐
│                    RAG 系统架构                          │
└─────────────────────────────────────────────────────────┘

1. 本地向量检索
   用户查询 → 生成 Embedding → 余弦相似度 → 返回相关结果

2. 混元增强检索
   用户查询 → 本地检索(Top 5) → 混元 AI 分析 → 智能回答
              ↓
         提取上下文
              ↓
   浏览器 → 本地代理(3001) → 腾讯云 API
   (绕过CORS)
```

---

## 💰 费用说明

### 腾讯混元免费额度

- **免费调用量**: 10万次/月
- **适用模型**: hunyuan-lite
- **成本估算**: 
  - 每次查询 ≈ 1次 API 调用
  - 1000 次查询 = 免费
  - 10万次查询 = 免费

### 推荐配置

```javascript
// scripts/test-rag-hunyuan.js 中的配置
{
  model: 'hunyuan-lite',     // 免费额度模型
  temperature: 0.7,           // 创造性适中
  max_tokens: 500            // 限制输出长度，节省额度
}
```

---

## 📚 命令对比

| 命令 | 检索方式 | 需要配置 | 准确度 | 速度 |
|------|---------|---------|--------|------|
| `npm run rag-simple "查询"` | 关键词匹配 | ❌ 否 | ⭐⭐ | ⚡⚡⚡ |
| `npm run rag-hunyuan "查询"` | 向量 + AI | ✅ 是 | ⭐⭐⭐⭐⭐ | ⚡⚡ |

---

## 🐛 常见问题

### 1. 代理服务器启动失败

**问题**：`Error: EADDRINUSE`

**解决**：
```bash
# Windows: 杀掉占用 3001 端口的进程
netstat -ano | findstr :3001
taskkill /PID <进程ID> /F

# macOS/Linux
lsof -ti:3001 | xargs kill
```

### 2. 混元 API 调用失败

**检查清单**：
- ✅ 代理服务器是否运行？
- ✅ `.env` 文件是否配置正确？
- ✅ SecretId 和 SecretKey 是否正确？

**调试命令**：
```bash
# 测试代理服务器
curl http://localhost:3001/api/health

# 查看代理日志
# 在代理服务器终端窗口查看输出
```

### 3. 检索结果不准确

**优化方法**：

1. **增加数据量**：
```bash
# 下载更多视频字幕
npm run download-subs -- --channel "https://youtube.com/@example" 50

# 解析字幕
npm run parse-subs

# 重新设置 RAG
npm run rag-setup-hunyuan
```

2. **调整查询方式**：
```bash
# ❌ 太宽泛
npm run rag-hunyuan "做了什么"

# ✅ 具体明确
npm run rag-hunyuan "早上7点到9点的活动安排"
```

---

## 🎯 下一步

1. ✅ 先用本地模式测试基础功能
2. ✅ 配置腾讯混元 API 获得 AI 增强
3. ✅ 下载真实视频字幕数据
4. ✅ 集成到 4DNote UI（待开发）

---

## 📞 相关文档

- [腾讯混元 API 文档](https://cloud.tencent.com/document/product/1729)
- [RAG 完整使用指南](./RAG_USAGE_GUIDE.md)
- [AI Proxy 快速开始](../_archive/docs/implementation/AI_PROXY_QUICKSTART.md)
- [混元 CORS 限制说明](../_archive/legacy-docs/fixes/HUNYUAN_CORS_LIMITATION.md)

---

**提示**: 腾讯元宝就是腾讯混元大模型的应用版本，使用的是同一套 API！
