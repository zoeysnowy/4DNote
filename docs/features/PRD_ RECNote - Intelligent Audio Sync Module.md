
# Product Requirements Document: RECNote Module
**Project:** 4D Note (RECNote Sub-module)  
**Version:** 1.0.0  
**Status:** Approved for Development  
**Core Philosophy:** "Infinite Memory, Zero Anxiety"

---

## 1. 概述 (Overview)

RECNote 是 4D Note 的核心组件，旨在解决“会议记录难回顾”的痛点。它模仿并超越 OneNote 的录音体验，通过**极低码率的高清语音压缩**和**笔记-音频时间戳锚定**，实现“所记即所听”。

同时，结合 **Local-First AI** 架构，在不增加边际成本的前提下，提供全量音频的模糊搜索和转录服务。

---

## 2. 核心技术规范 (Core Technical Specs)

### 2.1 音频录制引擎 (The Engine)
目标：实现 **< 12MB/小时** 的文件体积，同时保留对 AI 友好的高频细节。

*   **容器格式**: `audio/webm` (Web) 或 `audio/ogg` (Native)
*   **编码器 (Codec)**: **Opus** (必须)
*   **声道 (Channels)**: **Mono (单声道)**
*   **采样率 (Sample Rate)**: **16,000 Hz** (匹配 Whisper 原生需求)
*   **码率 (Bitrate)**: **24 kbps** (CBR)
    *   *决策理由*: 16kbps 人耳可辨但 AI 易幻觉；24kbps 是体积与 AI 准确率的黄金平衡点。
*   **预处理**:
    *   Echo Cancellation (AEC): ON
    *   Noise Suppression (NS): ON
    *   Auto Gain Control (AGC): ON

### 2.2 音频-文本锚定机制 (The Anchor)
利用 CRUD 事件流，将时间戳隐式注入文档结构，而非修改音频文件。

*   **触发时机**: 用户在编辑器 (Slate.js/ProseMirror) 中产生 `insert_text` 或 `insert_node` 操作时。
*   **数据结构**:
    ```typescript
    interface AudioAnchor {
      recordingId: string;      // 关联的音频文件 ID
      offsetMs: number;         // 距离录音开始的毫秒数
    }

    // 在 Block Level 存储
    type EditorBlock = {
      id: string;
      type: 'paragraph' | 'heading';
      children: TextNode[];
      meta?: {
        audioAnchor?: AudioAnchor; // 注入点
      };
    }
    ```
*   **交互逻辑**:
    *   **记录时**: 实时计算 `CurrentTime - StartTime` 并写入 Block Meta。
    *   **回放时**: 点击 Block -> 读取 `offsetMs` -> AudioPlayer `seek()` -> Play。

---

## 3. 系统架构 (System Architecture)

### 3.1 混合 AI 处理流 (Hybrid AI Pipeline)
采用 **"Desktop Hub"** 策略，最大化利用用户本地算力，最小化云端成本。

#### 场景 A: 桌面端录制 (Windows/Mac)
1.  **录制**: 本地 Electron 进程录制 Opus 文件。
2.  **存储**: 存入本地 `File System`，元数据存入 `SQLite`。
3.  **AI 处理 (Idle Time)**:
    *   检测到 CPU 空闲。
    *   启动 `whisper-node` (或 `transformers.js`) 本地模型。
    *   生成 Transcript (纯文本) + Vector (向量)。
    *   存入 `FTS5` 和 `sqlite-vss` 索引。
4.  **同步**: 仅将 **Opus 文件** 和 **生成的索引数据** 上传至云端 (R2)。

#### 场景 B: 移动端录制 (Mobile)
1.  **录制**: 调用 Native API (iOS/Android) 录制 Opus。
2.  **上传**: 立即上传 Opus 文件 (因体积极小，速度极快)。
3.  **处理分流**:
    *   **Free 用户**: 仅存储。等待用户下次打开桌面端 App 时，自动拉取文件并在本地跑 AI 索引。
    *   **Pro 用户**: 触发云端 Worker (Serverless GPU)，即时生成索引并回写数据库。

### 3.2 存储架构
*   **云存储**: Cloudflare R2 / AWS S3 (低频访问存储)。
*   **本地缓存**: LRU Cache 保留最近 7 天的音频，其余冷存档（点击播放时流式加载）。

---

## 4. 商业模式与权益 (Monetization Strategy)

产品不以 "Token" 计费，而是以 **"存储容量"** 和 **"处理时效性"** 为核心卖点。

| 特性 | Free Plan (体验者) | Pro Plan (订阅者) | 商业逻辑说明 |
| :--- | :--- | :--- | :--- |
| **音频存储容量** | 500 MB (~40小时) | 50 GB (~4000小时) | 核心付费点：买地皮 |
| **AI 搜索/转录** | **无限量 (依赖本地)** | **无限量 (依赖本地)** | 不卖 Token，鼓励多用 |
| **云端极速处理** | 不支持 (需电脑挂机) | **每月 10 小时** | 卖"快"和"便利" (覆盖 GPU 成本) |
| **多端同步** | 2 台设备 | 无限制 | |

---

## 5. 开发实施指南 (Implementation Guide)

**To Copilot:** 请严格遵循以下代码范式进行模块开发。

### 5.1 前端录音配置 (MediaRecorder)
```typescript
// utils/recorder.ts
export const getRecordingConstraints = () => ({
  audio: {
    channelCount: 1,        // 强制单声道
    sampleRate: 16000,      // 锁定 16kHz
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }
});

export const getMimeType = () => {
  // 优先使用 Opus
  const types = [
    'audio/webm; codecs=opus', 
    'audio/ogg; codecs=opus',
    'audio/webm'
  ];
  return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
};

// 必须设置 bitsPerSecond 限制体积
export const recorderOptions = {
  mimeType: getMimeType(),
  audioBitsPerSecond: 24000 // 24kbps target
};
```

### 5.2 数据库 Schema (SQLite)
```sql
-- events.db

-- 1. 存储音频元数据
CREATE TABLE audio_assets (
  id TEXT PRIMARY KEY,
  event_id TEXT,             -- 关联的日程/笔记ID
  file_path TEXT,            -- 本地路径
  remote_url TEXT,           -- R2 URL
  duration_ms INTEGER,
  size_bytes INTEGER,
  is_transcribed BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 全文搜索索引 (FTS5) - 包含转录内容
-- content 字段存储 Whisper 转录出的纯文本
CREATE VIRTUAL TABLE audio_transcripts_fts USING fts5(
  audio_id UNINDEXED, 
  transcript_text, 
  tokenize='porter'
);

-- 3. 向量索引 (sqlite-vss) - 用于语义搜索
CREATE VIRTUAL TABLE audio_vectors_vss USING vss0(
  embedding(384)
);
```

### 5.3 播放器逻辑 (Audio Player)
*   **UI**: 极简条状播放器，悬浮或嵌入底部。
*   **交互**: 
    *   当编辑器光标移动到带有 `audioAnchor` 的 Block 时，高亮播放器进度条上的对应点。
    *   点击 Block 侧边的 "Play Icon" -> 触发 `GlobalAudioPlayer.seek(anchor.offsetMs / 1000)`.

---

## 6. 风险控制 (Risk Management)

1.  **浏览器兼容性**: Safari 对 WebM 支持不佳。
    *   *对策*: 移动端使用 Native 录音，PC 端 Electron 环境可控 (Chromium)。
2.  **AI 幻觉**: 低码率可能导致部分吞音。
    *   *对策*: 在 UI 上展示 Transcript 时，标注 "AI Generated" 并允许用户手动修正。修正后的文本反馈给 FTS 索引，提高搜索准确度。
3.  **存储爆炸**: 虽然 Opus 很小，但架不住用户一直录。
    *   *对策*: 监控本地缓存大小，超过阈值自动清理本地旧音频文件（保留数据库索引和云端备份）。

