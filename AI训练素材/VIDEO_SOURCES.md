# Vlog 视频源配置

## 推荐的 CC 授权 Vlog 频道（无版权问题）

### YouTube
- **Casey Neistat** (部分视频 CC BY)
  - https://www.youtube.com/@caseyneistat
  
- **Creative Commons Vlogs**
  - 搜索: "creative commons vlog"
  - 筛选: Creative Commons 许可

### 中文 Vlog
- **小高姐的 Magic Ingredients** (美食 vlog)
  - https://www.youtube.com/@magicingredients
  
- **日食记** (生活 vlog)
  - https://space.bilibili.com/13327199

## 数据量建议

| 阶段 | 视频数量 | 预估节点数 | 用途 |
|------|----------|-----------|------|
| **初期测试** | 5-10 个 | 50-150 | 验证解析和 RAG 链路 |
| **完整测试** | 20-50 个 | 200-500 | 测试检索质量 |
| **生产环境** | 100+ 个 | 1000-3000 | 实际应用 |

## 视频选择标准

### 适合的 Vlog 类型
✅ **生活记录类** - 日常活动、时间管理
✅ **学习记录类** - Study with me, 学习 vlog
✅ **工作记录类** - 程序员/设计师工作日常
✅ **旅行记录类** - 带时间线的旅行 vlog

### 不适合的类型
❌ 教程类 - 没有时间流动感
❌ 剪辑混剪 - 时间线跳跃太大
❌ 音乐视频 - 内容不连续

## 下载示例

```bash
# 1. 下载单个视频
node scripts/download-subtitles.js

# 2. 从频道下载最新 20 个视频
node scripts/download-subtitles.js --channel "https://www.youtube.com/@example" 20

# 3. 批量下载（编辑 download-subtitles.js 配置）
node scripts/download-subtitles.js
```

## 注意事项

### 版权
- ✅ 优先选择 CC 授权视频
- ✅ 仅用于个人学习/测试
- ❌ 不要用于商业用途

### 语言
- 中文字幕: `--sub-lang zh-Hans`
- 英文字幕: `--sub-lang en`
- 双语: `--sub-lang zh-Hans,en`

### 字幕质量
- 自动生成字幕准确率: 70-85%
- 人工字幕准确率: 95%+
- 建议优先下载带人工字幕的视频

## 资源链接

- **yt-dlp 文档**: https://github.com/yt-dlp/yt-dlp
- **CC 视频搜索**: https://www.youtube.com/results?search_query=vlog&sp=EgIwAQ%253D%253D
- **B站创作中心**: https://member.bilibili.com/
