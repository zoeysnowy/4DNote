
# PRD 增补：智能定帧快照（Intelligent Snapshotting）

## 1. 背景 / 问题
会议纪要场景中，“全量录屏/录像”带来：
- 存储成本高（时长越长越难控）
- 隐私压力大（用户对“被录屏”更敏感）
- 后处理成本高（关键帧提取、OCR、索引都更重）

我们希望实现：
- **不保存完整视频**，只在**页面内容发生变化**时截取截图
- 在同一页内容逐步出现（例如 PPT 逐行动画）时，**只保留信息最全（most informative）**的截图
- **音频本地保存**，用于回溯（隐私优先）
- 用户在会议中可进行**重点标注**，系统将标注与**截图时间戳**绑定
- 会后根据“重点标注 + 截图 OCR 文本”，生成**bullet 格式**纪要，并且每条要点可**精准引用 ImageID（时间戳）**，一键定位信息源

---

## 2. 目标与非目标

### 2.1 目标（Goals）
1. 截图数量显著少于录屏逐帧（典型 1h 会议：30–80 张）
2. 每个“页面场景”仅保留**信息最完整**的截图（避免保留动画中间态）
3. 重点标注可生成带证据链的 bullet 笔记：`- 要点 … [ref: image 20260103142856]`
4. 音频仅落在用户本地，可回放并与截图时间戳联动定位

### 2.2 非目标（Non-Goals）
- 不做全量视频回放
- 不在 MVP 阶段做高成本视觉大模型逐帧理解
- 不在 MVP 阶段承诺完美 OCR（先以“可回溯 + 可修正”为准）

---

## 3. 核心体验（User Experience）

### 3.1 会议进行中
- 用户点击「开始会议记录」
- 应用请求：
  - 屏幕/窗口捕捉权限（用于**分析与截图**，不保存视频文件）
  - 麦克风权限（录音**仅本地保存**）
- 页面发生显著变化时自动截图
- 用户可点击「标注重点」按钮（或快捷键）：
  - 记录 `audio_offset_ms`
  - 记录 `current_image_id`（若此刻未生成新截图，则绑定最近一次有效截图或触发一次强制截图）

### 3.2 会后生成纪要
- 系统对最终保留的截图执行 OCR（可按需/延迟）
- 以“重点标注”为锚点，组合：
  - 标注附近时间窗口的转写（可选）
  - 对应截图 OCR 文本
- 输出 bullet 笔记，每条要点附带 `ref: image {ImageID}`  
  用户点击引用可：
  - 打开对应截图
  - （可选）定位到音频回放的时间点

---

## 4. 功能需求（Functional Requirements）

### 4.1 智能定帧快照（不录视频）
**输入：** `getDisplayMedia` 的视频流  
**输出：** 一组截图 `images[]`（带时间戳与质量信息），不落盘视频

- FR-1：采样帧率可配置，默认 `1 fps`（节能）
- FR-2：检测到“场景切换（Scene Change）”才生成候选截图
- FR-3：同一场景内多次变化（PPT 动画逐步出现）应通过“候选槽”机制只保留最终最信息密集的一张
- FR-4：对最终输出的截图进行压缩（WebP/JPEG）并生成缩略图

### 4.2 候选槽优选（Most Informative）
- FR-5：对“相似画面”的新截图进行比较，若信息量更高则替换候选槽
- FR-6：当检测到“翻页级变化”时，将候选槽最终截图定稿保存，并开启下一槽

### 4.3 本地录音与回溯
- FR-7：会议音频录制仅保存在本地（文件系统或应用沙盒）
- FR-8：音频时间轴与截图时间戳统一为同一时钟源（至少可转换映射）

### 4.4 重点标注（Highlights）
- FR-9：支持按钮与快捷键创建标注
- FR-10：每个标注必须保存：
  - `highlight_id`
  - `created_at_ms`
  - `audio_offset_ms`
  - `image_id`（截图时间戳）
  - （可选）用户输入的短备注

### 4.5 OCR 与笔记生成（Bullet Notes with Evidence）
- FR-11：对最终保留截图执行 OCR，输出 `ocr_text` 与置信度
- FR-12：生成 bullet 笔记时，每条要点必须带引用：`[ref: image 20260103142856]`
- FR-13：点击引用应打开截图并支持快速定位（缩略图 → 原图）
- FR-14（可选）：在截图查看器中提供「替换为同场景其他快照」以纠错

---

## 5. 关键数据结构（供 Copilot/实现参考）

### 5.1 Image（截图）
```ts
type ImageRecord = {
  image_id: string;              // 例如 "20260103142856"（建议：YYYYMMDDHHmmssSSS 或 Unix ms）
  created_at_ms: number;         // 单调时钟/系统时钟统一
  source: "screen";
  scene_id: string;              // 场景分组（翻页分段）
  hash_32x32?: string;           // 感知哈希/灰度签名
  similarity_to_prev?: number;   // 0..1
  sharpness?: number;            // 清晰度指标
  density?: number;              // 信息密度（边缘数/熵）
  blob_uri?: string;             // 本地存储引用（IndexedDB/File）
  thumb_uri?: string;
  ocr_text?: string;
  ocr_confidence?: number;
};
```

### 5.2 Highlight（重点标注）
```ts
type HighlightRecord = {
  highlight_id: string;
  created_at_ms: number;
  audio_offset_ms: number;
  image_id: string;              // 绑定截图证据
  note?: string;                 // 用户补充
};
```

### 5.3 NoteItem（生成的 bullet）
```ts
type NoteItem = {
  id: string;
  text: string;                  // bullet 文本
  refs: Array<{ image_id: string; audio_offset_ms?: number }>;
};
```

---

## 6. 技术方案（MVP 优先：前端低成本）

### 6.1 采集层：无感截屏流（不落盘）
- 使用 `navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 } })`
- 使用 `<video>` + `<canvas>` 或 `ImageCapture(grabFrame)` 取帧
- **不启用 MediaRecorder 保存视频**

### 6.2 检测层：轻量变化检测（推荐）
- 将帧缩小至 `32×32` 灰度，计算差异：
  - `DiffRatio = changed_pixels / total_pixels`
- 判定：
  - 若 `DiffRatio > 0.05` → 进入“变化事件”
  - 若 `DiffRatio > 0.20` → 视为“翻页级变化（scene boundary）”
- 也可用简化感知哈希（pHash/dHash）替代像素差

### 6.3 优选层：候选槽 + 贪婪替换（解决逐行动画）
- 维护当前 `slot_best_frame`
- 对于“相似画面”（相似度 > 0.8）：
  - 计算信息量指标 `density`：
    - `Canny edges count`（边缘像素数量）
    - 或 `Blob size`（压缩后大小作为 proxy）
  - 若 `new_density > best_density * 1.05` 或 `new_sharpness > best_sharpness` → 替换 `slot_best_frame`
- 当翻页级变化出现：将 `slot_best_frame` 定稿保存为 `ImageRecord`，清空槽

### 6.4 存储与引用：ImageID = 时间戳
- `image_id` 推荐用可读时间戳：`YYYYMMDDHHmmssSSS`
- 笔记引用格式统一：
  - `ref: image 20260103142856`
- UI 点击后直接定位截图；（可选）联动音频 offset

### 6.5 OCR 与总结（LLM）
- OCR：仅对最终定稿的 `ImageRecord` 批量处理（大幅降低调用量）
- LLM 总结输入建议使用“带标签上下文”：
```md
[ImageID: 20260103142856]
OCR: ...

[Highlight: h_01 | audio_offset=123400ms | image_id=20260103142856]
User note: ...
```
- 输出强约束：每条 bullet 必须带 `image_id`

---

## 7. 交互与 UI（最小可用）
1. 会议记录页显示：
   - 当前状态（录音中/截图中）
   - 最近一次截图缩略图
   - 「标注重点」按钮/快捷键提示
2. 会后笔记页：
   - 左侧 bullet 列表
   - 每条 bullet 显示 `ref image_id`（可点击）
   - 点击后右侧打开截图（原图/缩略图切换）
   - （可选）播放音频并跳转到 `audio_offset_ms`

---

## 8. 边界情况与容错
- 翻页动画/过渡糊：通过 `sharpness` 过滤（拉普拉斯方差过低的不入槽或不替换）
- 选图失败：为每个 `scene_id` 可在本地保留 `pre/post` 两张备选，不默认上传；提供“替换快照”入口
- 权限失败：允许仅录音模式 / 仅手动截图模式
- 超长会议：分段写入 IndexedDB，避免内存累积

---

## 9. 指标（Success Metrics）
- 截图压缩后总大小 / 会议时长（MB/h）
- 平均每小时截图张数（images/h）
- 用户点击引用定位成功率（ref click → 正确截图）
- 用户手动替换快照比例（越低越好）
- 会后笔记生成耗时（端到端）

---

## 10. 实现优先级（Phasing）
### P0（MVP）
- 1fps 截屏流 + 变化检测 + 候选槽优选
- 本地录音 + 标注重点 + ImageID 引用
- OCR（仅定稿截图）+ bullet 笔记生成

### P1
- 备选快照纠错（同场景多版本）
- 音频回放与图片引用联动
- 更稳的相似度（SSIM/更优 hash）

### P2
- 多窗口/双屏策略
- 结构化抽取（Decisions / Action Items / Risks）
- 团队协作分享（可控的隐私与脱敏）
