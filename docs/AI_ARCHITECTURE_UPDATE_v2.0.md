# AI 架构文档更新说明 v2.0

> **更新时间**: 2025-12-15  
> **更新内容**: 新增移动端云端优先架构章节

---

## 📋 更新摘要

**主文档**: [AI_STORAGE_ARCHITECTURE.md](architecture/AI_STORAGE_ARCHITECTURE.md)

**版本变更**: v1.0 → v2.0

**核心变化**:
- ✅ 从"本地优先 AI"升级为"混合架构 - 桌面端本地优先 + 移动端云端优先"
- ✅ 新增第4章：移动端云端优先架构
- ✅ 新增技术决策：9.5 为什么移动端采用云端优先策略

---

## 📝 主要更新内容

### 1. 平台策略对比表 (§2.1)

新增桌面端与移动端的 AI 策略对比：

| 维度 | 桌面端 | 移动端 |
|------|--------|--------|
| 核心策略 | 本地优先 (Local-First) | 云端优先 (Cloud-First) |
| AI 推理位置 | 浏览器 Web Worker | 云端 API Gateway |
| 向量检索位置 | 本地 IndexedDB | 云端向量数据库 |
| 优势 | 隐私保护、离线可用 | 省电省流量、性能更好 |

### 2. 技术栈分层 (§2.2)

**原版本**：单一技术栈（仅桌面端）

**新版本**：双技术栈
- **§2.2.1 桌面端技术栈**: Dexie.js + FlexSearch + Transformers.js
- **§2.2.2 移动端技术栈**: React Native + AI Gateway + Cloud AI APIs

### 3. 新增第4章：移动端云端优先架构

完整的移动端 AI 架构设计，包含：

#### 4.1 架构总览
- React Native App 层（UI + 本地缓存 + 后台任务队列）
- 云端服务层（API Gateway + AI Gateway + 数据存储层）

#### 4.2 AI Gateway 服务设计
```typescript
interface AIGatewayService {
  chat(request: ChatRequest): Promise<ChatResponse>;
  extractTasksFromImage(imageUrl: string): Promise<Task[]>;
  organizeNotes(noteIds: string[]): Promise<NoteOrganization>;
  embedText(text: string): Promise<number[]>;
  searchSemantic(query: string, limit: number): Promise<Event[]>;
}
```

**核心优化**：
- **请求批处理**：10 个任务合并为 1 次 API 调用（节省 90% 成本）
- **多级缓存**：Redis (1小时) + PostgreSQL (永久) + AsyncStorage (离线)
- **成本控制**：免费用户 100 次/月，付费用户 10000 次/月

#### 4.3 移动端数据同步策略
- **智能同步时机**：WiFi 立即同步，移动网络延迟同步
- **冲突解决**：Last-Write-Wins (基于 updated_at 时间戳)

#### 4.4 成本优化策略
- **图片压缩**：OCR 前压缩到 1024x1024，JPEG 质量 80%
- **增量同步**：仅传输变更字段，不传整个 event
- **Gzip 压缩**：API 请求/响应启用 gzip

### 4. 章节编号调整

原章节 4-8 依次后移：
- 第 4 章：混合搜索引擎架构 → **第 5 章**（桌面端）
- 第 5 章：核心服务模块 → **第 6 章**
- 第 6 章：性能优化策略 → **第 7 章**
- 第 7 章：实施路线图 → **第 8 章**
- 第 8 章：技术决策记录 → **第 9 章**

### 5. 新增技术决策：9.5 为什么移动端采用云端优先策略？

**关键对比**：

| 对比维度 | 本地优先 (桌面端) | 云端优先 (移动端) |
|----------|------------------|------------------|
| 电池消耗 | ⚠️ Web Worker 计算耗电可接受 | ✅ 云端计算，移动端省电 |
| 内存占用 | ⚠️ 模型 ~23MB，浏览器可承受 | ✅ 移动端内存紧张，云端无压力 |
| 模型更新 | ❌ 需重新下载模型文件 | ✅ 云端更新，客户端无感知 |
| 离线能力 | ✅ 完全离线可用 | ❌ 需网络连接 (但可降级) |

**降级策略**：
```typescript
if (!isOnline) {
  return await localCache.searchByKeyword(query); // 关键词搜索
} else if (quota.exceeded) {
  return await localCache.searchByKeyword(query); // 配额耗尽降级
} else {
  return await cloudAI.semanticSearch(query); // 正常 AI 搜索
}
```

### 6. 更新 9.2 技术决策标题

**原标题**：为什么选择 Transformers.js 而非云端 API？

**新标题**：桌面端为什么选择 Transformers.js 而非云端 API？

**新增内容**：
- 明确区分桌面端和移动端的选择理由
- 补充移动端选择云端 API 的优势（省电、性能、内存占用低）

---

## 🔗 相关文档

- [AI 移动端可行性评估](PRD/AI_MOBILE_FEASIBILITY.md) - 移动端 AI 功能详细评估
- [AI ChatFlow PRD](PRD/AI_ChatFlow_PRD.md) - ChatFlow 功能规范与优化策略

---

## ✅ 验证清单

- [x] 目录章节编号已更新（1-9）
- [x] 所有子章节编号已调整（4.x → 5.x, 5.x → 6.x, ...）
- [x] 新增移动端云端优先架构章节（第4章）
- [x] 技术栈表格分为桌面端和移动端两部分
- [x] 平台策略对比表已添加
- [x] 混合架构数据流图已添加
- [x] 技术决策 9.5 已新增（移动端云端优先原因）
- [x] 技术决策 9.2 已更新（区分桌面端和移动端）
- [x] 文档版本号已更新（v1.0 → v2.0）
- [x] 核心理念已更新（本地优先 → 混合架构）

---

## 📊 影响范围

**兼容性**：
- ✅ **向后兼容**：桌面端本地优先架构保持不变
- ✅ **数据模型统一**：桌面端和移动端共享 `UniversalEvent` 数据结构
- ✅ **API 独立**：移动端新增 AI Gateway，不影响现有服务

**开发工作量**：
- **桌面端**：无需改动（已有 Transformers.js 实现）
- **移动端**：需新建 AI Gateway 服务（预计 2-3 周，见 AI_MOBILE_FEASIBILITY.md §5）

**成本预估**：
- **开发成本**：AI Gateway 后端开发 + React Native 集成（2-3 周）
- **运营成本**：API 调用费用（免费用户 $0，付费用户按实际使用量）
- **维护成本**：云端服务运维 + 模型更新（持续）

---

## 🎯 下一步行动

1. [ ] **基础设施**：搭建 AI Gateway 服务（Node.js + Express + Redis）
2. [ ] **API 集成**：接入 GPT-4、Jina AI Rerank、Google Vision API
3. [ ] **移动端开发**：React Native App 接入 AI Gateway
4. [ ] **测试验证**：移动端 ChatFlow、TaskManager、NotesManager 功能测试
5. [ ] **性能优化**：批处理、缓存、降级策略实施
6. [ ] **成本监控**：API 调用量统计与限流机制

---

**文档维护者**: GitHub Copilot  
**审核状态**: ✅ 已完成  
**备注**: 本次更新确保 4DNote 能够灵活支持桌面端和移动端的不同 AI 需求
