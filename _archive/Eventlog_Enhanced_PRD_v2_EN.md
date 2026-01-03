# Eventlog Enhanced — 产品需求文档 v2.0

**产品名称：** 4DNote — 智能记忆与叙事系统  
**版本：** v2.0（整合版）  
**状态：** 已批准开发  
**最后更新：** 2025-01-23

---

## 0. 执行摘要

**产品愿景**  
将碎片化的日常交互（思考、会议、AI 对话、网页剪藏）转化为结构化、可回顾的叙事记忆，用户投入最少精力。

**核心价值主张**  
- **对于忙碌的专业人士**：通过自动生成的时间骨架叙事，获得"今天我做了什么"的安心感
- **对于知识工作者**：通过智能收获捕获和基于证据的回顾，提炼"今天我理解了什么"
- **对于 AI 深度用户**：通过自动结算机制，将长时间 AI 协作会话转化为清晰、可复用的收获
- **对于会议参与者**：用智能定帧快照捕获视觉证据，而非侵入性的全程录屏
- **对于音频笔记用户**：通过 RECNote 锚点将音频与文字笔记同步，实现轻松的回放导航

**设计哲学**  
- **基于来源的信号优于语义猜测**：用户行为（高亮、手动标记、疑问）驱动优先级排序
- **复利式回顾**：每日 → 每周 → 每月叙事通过证据积累相互构建
- **本地优先的隐私保护**：音频和截图默认存储在设备上；云同步可选
- **零焦虑归档**：所有交互自动捕获为潜在证据，可随时过滤/检索

---

## 1. Product Background & User Problems

### 1.1 Target Users

**Primary Personas**
1. **Knowledge Workers** (researchers, engineers, analysts)
   - Heavy note-takers who struggle with "where did I see that idea?"
   - AI conversation partners generating valuable insights that get lost in chat history
   
2. **Meeting-Heavy Professionals** (managers, consultants)
   - Need meeting minutes but hate manual note-taking
   - Privacy-conscious about full video recording
   
3. **Reflective Learners** (students, self-improvement enthusiasts)
   - Want to review "what resonated with me this week"
   - Struggle to maintain journaling consistency

### 1.2 User Pain Points

**P1: Fragmentation & Loss** (碎碎念维护成本高)
- Scattered notes across tools (chat logs, docs, sticky notes)
- No automatic consolidation → manual copy-paste burden
- Important thoughts buried in noise

**P2: Non-retrievable Emotional Context** (情绪/挣扎不可搜索)
- "I remember feeling excited about something last Tuesday" → unsearchable
- Key struggles/breakthroughs lost without deliberate journaling

**P3: AI Conversation Sedimentation** (AI 对话沉淀难)
- Long AI cowork sessions produce value but lack structured outputs
- Insights exist only as chat history, not as reusable knowledge cards

**P4: Meeting Evidence Overload** (会议证据成本高)
- Full screen recording = storage bloat + privacy concerns
- Manual screenshot timing misses key moments
- Audio-note sync requires manual timestamp tagging

### 1.3 Opportunity Space

**Market Gaps**
- Granola: Great meeting notes but lacks daily narrative continuity
- Reflect/Mem: Good for manual inputs, weak on automatic evidence capture
- Notion/Obsidian: Powerful but require manual organization upfront

**Our Differentiator**: Automatic evidence collection + intelligent review synthesis + privacy-first design

---

## 2. Core Concepts & Terminology

### 2.1 Structural Primitives

**Note** (文档)  
Top-level container representing a day, project, or topic. Contains Paragraphs.

**Paragraph** (段落)  
Block-level content unit. Can be:
- Text body (思考、记录)
- Heading (标题)
- AI Answer (Q&A 结果)
- Summary Card (多卡集成总结)
- Web Clip (带来源的引用)

**Anchor** (锚点)  
Inline reference to other Paragraphs/Cards, enabling bidirectional linking.

**Card** (卡片)  
Unified abstraction for various content types (Answer, Summary, Clip, Resonance). All cards are stored as specialized Paragraphs with `meta.card_type`.

### 2.2 Evidence & Memory System

**EventLog** (事件日志)  
Immutable log of all user interactions with timestamped metadata:
- `ASK_AI`, `ANSWER_RECEIVED`
- `CARD_EXPANDED`, `CARD_COLLAPSED`
- `HIGHLIGHT_ADDED`, `TAG_CHANGED`
- `SESSION_STARTED`, `SESSION_ENDED`

**Signal** (重点信号)  
User-initiated markers indicating importance:
- `HIGHLIGHT` (⭐ 重点)
- `QUESTION` (❓ 疑问/Open Loop)
- `ACTION_ITEM` (✅ 待办)
- `OBJECTION` (🧊 反对/风险)
- Additional: `CONFIRM`, `BOOKMARK`, `TOPIC_SHIFT`

**Session** (会话)  
Continuous recording period (meeting, study session, voice memo) containing:
- Audio stream (optional, local-first)
- Real-time transcription
- User manual notes
- Timestamped Signals

**TakeawayCandidate** (候选收获)  
Micro-conclusion extracted from interactions:
- Auto-generated from AI Answers, Summaries, Session Key Moments
- User-manually tagged highlights
- Aggregated daily → weekly → monthly via compounding reviews

### 2.3 Review & Synthesis Outputs

**Daily Narrative** (每日叙事)  
Structured review output generated from Evidence:
1. **Narrative Summary**: Time-skeleton overview (morning/afternoon/evening)
2. **Top Takeaways**: 3-7 key learnings with evidence links
3. **Open Loops**: Unanswered questions
4. **Action Items**: Tagged tasks
5. **Resonance**: Cross-note connections (optional)

**Focus Window** (重点窗口)  
Time range around a Signal (e.g., [t-20s, t+60s]) marked for detailed processing:
- Higher ASR transcription accuracy
- Finer-grained segmentation
- Preserved verbatim quotes for Key Moments

**Holographic Map** (全息目录)  
Auto-generated filterable outline showing note structure with:
- Signal-based highlighting (⭐/❓/✅)
- Collapsible hierarchy
- Click-to-jump navigation

---

## 3. User Experience Design

### 3.1 Core User Flows

#### Flow A: Daily Knowledge Capture (知识工作者场景)

**Morning: Note Creation**
1. User creates Note "2025-01-23 Project Alpha Research"
2. Types initial thoughts → auto-logs `INSERT_TEXT` events
3. Asks AI "What are best practices for X?" → logs `ASK_AI`
4. AI responds with detailed answer → system generates:
   - Answer Card (paragraph with `card_type: ai_answer`)
   - TakeawayCandidate: "Best practice for X is Y" (auto-extracted)
5. User marks AI answer as highlight (⭐) → weight boost for daily review

**Afternoon: Multi-Source Integration**
1. User selects 3 existing cards (from different notes)
2. Clicks "Summarize Together" → logs `MULTI_SELECT_SUMMARIZE`
3. System generates Summary Card with:
   - Integrated synthesis
   - 3-5 TakeawayCandidates (one per key point)
   - `evidence_refs` to all source card IDs

**Evening: Automatic Daily Review**
1. System triggers Daily Narrative generation (9 PM or manual)
2. Reads Evidence:
   - Timeline: sessions, Signal timestamps
   - Interactions: Ask AI, card toggles, highlights
   - Outcomes: Answer cards, Summary cards
3. Outputs Daily Narrative with:
   - "Today you focused on Project Alpha (3h), had 2 key AI discussions"
   - Top 5 Takeaways (clickable to source cards)
   - 2 Open Loops (unanswered questions)
4. User reviews in <3 min, marks satisfactory → archives to knowledge base

#### Flow B: Meeting with Smart Evidence Capture (会议场景)

**Pre-Meeting**
1. User clicks "Start Meeting Session" in calendar event
2. System requests permissions:
   - Screen capture (for intelligent frame snapshots, not full video)
   - Microphone (audio saved **locally only**)
3. Starts monitoring:
   - Screen content changes → auto-snapshot when page/slide changes
   - Audio recording → local file with timestamp alignment

**During Meeting**
1. **Slide appears**: System detects scene change → captures screenshot
2. **Slide animates**: System holds candidate slot, only saves most informative final frame
3. **User takes note**: Types "Decision: migrate to new API" → auto-logs with audio offset
4. **User presses Highlight hotkey** (`Ctrl+Shift+H`): Creates `HIGHLIGHT` Signal
   - Marks current audio timestamp
   - Marks current screenshot ID
   - Opens Focus Window [t-20s, t+60s] for detailed transcription
5. **Voice cue detected**: User says "重点" → same as hotkey

**Post-Meeting**
1. System runs OCR on saved screenshots (throttled, on-demand)
2. Generates Meeting Bullet Notes:
   ```
   - Decision: migrate to new API [ref: image 20250123143012]
   - Risk: backward compatibility concerns [ref: image 20250123143145]
   - Action: @John to prepare migration checklist [ref: image 20250123143230]
   ```
3. User clicks `[ref: image ...]` → opens screenshot + seeks audio to that timestamp
4. Bullet notes auto-added as TakeawayCandidates for daily aggregation

#### Flow C: Voice Memo with RECNote Sync (语音记录场景)

**Scenario**: Walking and recording thoughts

1. User opens Note, starts recording via RECNote
2. Speaks continuously while occasionally typing keywords
3. Each typed paragraph gets `audioAnchor` in metadata:
   ```typescript
   meta: {
     audioAnchor: {
       recordingId: "rec_20250123_1430",
       offsetMs: 125000  // 2min 5sec into recording
     }
   }
   ```
4. Later review: clicks paragraph → audio player seeks to `offsetMs` and plays
5. Audio stored locally as **16kHz mono Opus @ 24kbps** → ~12MB/hour
6. Desktop app auto-runs local Whisper during idle time → generates FTS index
7. User searches "prototype feedback" → finds audio segment + linked paragraph

### 3.2 UI Component Specifications

#### 3.2.1 Holographic Map (全息目录)

**Location**: Right sidebar (collapsible)

**Visual Design**
```
📄 Daily Research Log 2025-01-23

├─ 🔹 Morning Review
│   ├─ ⭐ Key insight on API design
│   └─ ❓ How to handle edge cases?
├─ 🔹 Meeting Notes
│   ├─ Decision: use GraphQL
│   ├─ ✅ @Alice: draft schema by Friday
│   └─ 🧊 Concern: team onboarding cost
└─ 🔹 Evening Summary
    └─ 3 takeaways collected
```

**Interaction**
- Click any line → scroll to paragraph + highlight briefly
- Filter buttons: [⭐ Highlights] [❓ Questions] [✅ Actions] [All]
- Auto-updates on edit (debounced 500ms)
- Collapse/expand sections

#### 3.2.2 Daily Narrative Panel (每日回顾面板)

**Trigger**: Manual invoke or scheduled (9 PM daily)

**Layout**
```
┌─────────────────────────────────────────────────┐
│ Daily Narrative — 2025-01-23                    │
├─────────────────────────────────────────────────┤
│                                                  │
│ 📖 NARRATIVE SUMMARY                            │
│ ─────────────────────────────────────────────   │
│ Morning: Focused on Project Alpha research      │
│ (2.5h). Had productive AI discussion on API     │
│ architecture patterns.                           │
│                                                  │
│ Afternoon: Team meeting (1h), finalized Q1      │
│ roadmap. Light code review session.              │
│                                                  │
│ 🎯 TOP TAKEAWAYS (5)                            │
│ ─────────────────────────────────────────────   │
│ 1. REST vs GraphQL trade-offs in our context   │
│    [📎 See: AI Answer Card #abc123]             │
│                                                  │
│ 2. Team consensus: prioritize user auth feature │
│    [📎 See: Meeting Summary #def456]             │
│ ...                                              │
│                                                  │
│ ❓ OPEN LOOPS (2)                               │
│ ─────────────────────────────────────────────   │
│ • How to migrate existing REST clients?         │
│ • Performance benchmarks needed for GraphQL     │
│                                                  │
│ ✅ ACTION ITEMS (3)                             │
│ ─────────────────────────────────────────────   │
│ • @Me: Draft API migration plan by Thu          │
│ • @Alice: Set up dev environment for GraphQL    │
│ • @Team: Review security checklist              │
│                                                  │
│ 🔗 RESONANCE (Optional)                         │
│ ─────────────────────────────────────────────   │
│ Related to: "API Design Principles" note (3mo)  │
│                                                  │
└─────────────────────────────────────────────────┘
[Archive & Mark Complete]  [Regenerate]  [Export]
```

**Interaction**
- All `[📎 See: ...]` links open source card in context
- Action Items can be one-click exported to task manager (future)
- Regenerate uses updated weights/filters if user edited source notes

#### 3.2.3 Focus Window Indicator (Granola-style)

**During Session Recording**
```
🎙️ Recording: 00:12:34

Timeline:
█████░░░░░░░░░░░░░░█████░░░░░░
 ↑                    ↑
Key Moment 1      Key Moment 2
(user highlighted)
```

**Post-Session Summary Template**
```
Meeting Summary: Q1 Planning
Duration: 45 min | 3 Key Moments | 8 Screenshots

📌 KEY MOMENTS
─────────────────────────────────
1. [00:03:12 - 00:04:30] Decision: GraphQL adoption
   "We agreed the flexibility outweighs learning curve"
   [🖼️ Screenshot] [🔊 Audio]

2. [00:15:44 - 00:17:10] Risk: Team capacity concerns
   "Alice raised valid point about current sprint load"
   [🖼️ Screenshot] [🔊 Audio]

📝 SUPPORTING NOTES
─────────────────────────────────
- Brief introductions and team updates (00:00-00:03)
- Administrative logistics discussion (00:25-00:30)
```

---

## 4. Detailed Functional Requirements

### 4.1 Evidence Collection System

**FR-Evidence-1: EventLog Capture**  
System MUST log all user interactions with immutable, timestamped events:
- Required fields: `event_id`, `user_id`, `timestamp`, `event_type`, `metadata`
- Minimum captured events: `ASK_AI`, `ANSWER_RECEIVED`, `CARD_EXPANDED`, `HIGHLIGHT_ADDED`, `TAG_CHANGED`, `SESSION_STARTED`, `SESSION_ENDED`
- Log storage: append-only, indexed by `timestamp` and `event_type`

**FR-Evidence-2: Signal Recording**  
System MUST support user-initiated Signals with:
- Hotkey support (global shortcuts, customizable)
- Voice cue detection (keyword-triggered: "重点", "问题", "待办")
- UI button access (recording panel)
- Storage: linked to `note_id`, `paragraph_id`, `audio_offset_ms`, `image_id` (if applicable)

**FR-Evidence-3: Timeline Evidence**  
System SHOULD integrate calendar events (optional) and session time ranges as evidence inputs.

### 4.2 Intelligent Transcription & Snapshots

**FR-Audio-1: RECNote Integration**  
System MUST implement audio-note sync via RECNote spec:
- Audio format: **16kHz mono Opus @ 24kbps** (target <12MB/hour)
- Anchor storage: `audioAnchor { recordingId, offsetMs }` in paragraph metadata
- Playback: click paragraph → audio seeks to `offsetMs` and plays
- Local processing: idle-time Whisper transcription → FTS5 index
- Privacy: audio files stored locally by default, cloud sync opt-in

**FR-Audio-2: Focus Window Processing**  
For audio segments within Focus Windows (Signal ± time delta):
- Higher transcription quality (preserve verbatim)
- Finer segmentation (sentence-level)
- Outside focus windows: aggressive compression (1-2 sentence summaries)

**FR-Snapshot-1: Intelligent Frame Capture**  
During screen recording sessions, system MUST:
- Detect scene changes (threshold: >5% pixel difference for minor change, >20% for scene boundary)
- Implement candidate slot mechanism: only save most informative frame per scene
- NOT save full video files (only discrete screenshots)
- Generate screenshots with metadata: `image_id`, `scene_id`, `created_at_ms`, `hash_32x32`, `similarity_to_prev`

**FR-Snapshot-2: OCR Integration**  
System SHOULD run OCR on saved screenshots:
- Execution: throttled/on-demand to avoid blocking UI
- Output: `ocr_text` + `ocr_confidence` stored with image
- Usage: searchable, included in meeting note generation

**FR-Snapshot-3: Evidence Linking**  
Each Highlight/Signal MUST record `image_id` of current/nearest screenshot for clickable references in generated notes.

### 4.3 Takeaway Settlement Layer

**FR-Takeaway-1: Automatic Candidate Generation**  
System MUST auto-generate TakeawayCandidates on:
- `AI_ANSWERED`: 1 candidate from answer summary
- `SUMMARY_GENERATED`: 3-5 candidates from key points
- `SESSION_ENDED`: N candidates from Key Moments (focus windows)

**FR-Takeaway-2: Manual Tagging**  
User MUST be able to manually mark any paragraph/card as Takeaway:
- UI: star/bookmark icon or context menu
- Creates `source_type: manual` candidate with highest weight

**FR-Takeaway-3: Candidate Schema**  
TakeawayCandidate storage MUST include:
```typescript
{
  takeaway_id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  source_type: 'card' | 'session' | 'web_clip' | 'manual';
  source_id: string;
  created_at: timestamp;
  text: string; // ≤200 chars
  topic?: string;
  embedding?: Float32Array; // optional, for clustering
  weight: number;
  evidence_refs: Array<{type: string, id: string}>;
  status: 'active' | 'archived' | 'rejected';
}
```

**FR-Takeaway-4: Weight Calculation**  
Weight formula: `manual_signal + system_signal + behavior_signal + recency_signal`

| Signal Type | Weight Component | MVP Inclusion |
|-------------|------------------|---------------|
| Manual HIGHLIGHT | +10 | ✅ Yes |
| Manual ACTION_ITEM | +15 | ✅ Yes |
| Manual QUESTION | +12 | ✅ Yes |
| From Focus Window Key Moment | +8 | ✅ Yes |
| From Multi-Card Summary | +6 | ✅ Yes |
| Card expand count | +1 per expand (max +5) | ⚠️ Optional |
| Reference count | +2 per reference | ⚠️ Optional |
| Recency boost | +3 if within last 2h | ❌ Post-MVP |

### 4.4 Daily/Weekly/Monthly Review Generation

**FR-Review-1: Daily Narrative Generation**  
System MUST support on-demand or scheduled Daily Narrative generation with:
- Input: all Evidence from target date (Timeline, Interactions, Outcomes)
- Output sections:
  1. **Narrative Summary**: 2-4 paragraphs, time-segmented (morning/afternoon/evening or session-based)
  2. **Top Takeaways**: 3-7 items ranked by weight, each with clickable `evidence_refs`
  3. **Open Loops**: extracted Questions + AI-detected unresolved items
  4. **Action Items**: extracted from `ACTION_ITEM` Signals + summary parsing
  5. **Resonance** (optional): cross-note connections via embedding similarity

**FR-Review-2: Weekly/Monthly Synthesis**  
System SHOULD support compounding reviews:
- Weekly: aggregate Daily Narratives from past 7 days → meta-synthesis
- Monthly: aggregate Weekly summaries → thematic trends
- All reviews maintain backward `evidence_refs` to atomic sources

**FR-Review-3: Regeneration Support**  
User MUST be able to regenerate any review after:
- Editing source notes
- Changing Signal tags
- Adjusting filters (e.g., exclude certain topics)

### 4.5 Holographic Map (Filterable Outline)

**FR-Map-1: Auto-Generation**  
System MUST auto-generate outline from note structure:
- Hierarchy: H1/H2/H3 → nested list
- Signal decoration: prefix lines with ⭐/❓/✅ icons based on paragraph Signals
- Update trigger: debounced on any note edit (500ms delay)

**FR-Map-2: Filtering**  
User MUST be able to filter outline by Signal type:
- Buttons: [⭐ Highlights] [❓ Questions] [✅ Actions] [All]
- Filtered view hides non-matching items, shows ancestors for context

**FR-Map-3: Navigation**  
Click any outline item → scroll to paragraph + brief highlight animation (500ms)

### 4.6 Resonance (Cross-Note Connections)

**FR-Resonance-1: Query Mechanism**  
System MUST support Resonance queries:
- Input: selected text/paragraph embedding
- Search: vector similarity across all notes (excluding current)
- Threshold: configurable similarity score (default 0.75)
- Output: ranked list of related paragraphs with preview snippets

**FR-Resonance-2: Resonance Cards**  
User can save Resonance results as Cards:
- Card type: `resonance`
- Stores: query source + matched results + similarity scores
- Bidirectional links: both source and target paragraphs gain backlinks

**FR-Resonance-3: Review Integration**  
Daily/Weekly Narratives SHOULD include Resonance section showing:
- "Today's ideas relate to [Note X from 3 months ago]"
- Auto-detected via highest similarity match above threshold

---

## 5. Technical Architecture

### 5.1 Data Models

#### EventLog Schema (Immutable)
```sql
CREATE TABLE event_log (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,  -- Unix ms
  event_type TEXT NOT NULL,    -- 'ASK_AI', 'HIGHLIGHT_ADDED', etc.
  note_id TEXT,
  paragraph_id TEXT,
  session_id TEXT,
  metadata JSON,               -- flexible event-specific data
  
  INDEX idx_timestamp (timestamp),
  INDEX idx_event_type (event_type),
  INDEX idx_user_date (user_id, date(timestamp/1000, 'unixepoch'))
);
```

#### Signals Schema
```sql
CREATE TABLE signals (
  signal_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  paragraph_id TEXT,
  signal_type TEXT NOT NULL,   -- 'HIGHLIGHT', 'QUESTION', 'ACTION_ITEM'
  created_at INTEGER NOT NULL,
  audio_offset_ms INTEGER,
  image_id TEXT,
  metadata JSON,
  
  FOREIGN KEY (note_id) REFERENCES notes(id),
  INDEX idx_note_signals (note_id),
  INDEX idx_signal_type (signal_type)
);
```

#### TakeawayCandidate Schema
```sql
CREATE TABLE takeaway_candidates (
  takeaway_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  source_type TEXT NOT NULL,   -- 'card', 'session', 'manual'
  source_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  text TEXT NOT NULL,          -- max 200 chars
  topic TEXT,
  embedding BLOB,              -- Float32Array serialized
  weight REAL NOT NULL,
  evidence_refs JSON NOT NULL, -- [{type, id}, ...]
  status TEXT DEFAULT 'active',
  
  INDEX idx_user_date (user_id, date),
  INDEX idx_weight (weight DESC)
);
```

#### Session Schema (Audio/Meeting)
```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  note_id TEXT,
  session_type TEXT,           -- 'meeting', 'voice_memo', 'study'
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_ms INTEGER,
  audio_file_path TEXT,        -- local file system path
  audio_remote_url TEXT,       -- R2/S3 URL (optional)
  metadata JSON,
  
  INDEX idx_user_sessions (user_id, started_at)
);
```

#### Image (Snapshot) Schema
```sql
CREATE TABLE images (
  image_id TEXT PRIMARY KEY,   -- timestamp-based: YYYYMMDDHHmmssSSS
  session_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  scene_id TEXT NOT NULL,
  hash_32x32 TEXT,
  similarity_to_prev REAL,
  sharpness REAL,
  density REAL,
  blob_uri TEXT NOT NULL,      -- IndexedDB or File System ref
  thumb_uri TEXT,
  ocr_text TEXT,
  ocr_confidence REAL,
  
  FOREIGN KEY (session_id) REFERENCES sessions(session_id),
  INDEX idx_session_images (session_id, created_at_ms)
);
```

### 5.2 Weight Calculation Implementation

```typescript
interface WeightConfig {
  manualHighlight: number;    // 10
  manualQuestion: number;     // 12
  manualAction: number;       // 15
  focusWindowMoment: number;  // 8
  multiCardSummary: number;   // 6
  cardExpand: number;         // 1 per expand, max 5
  referenceCount: number;     // 2 per ref
  recencyBoost: number;       // 3 if <2h old
}

function calculateTakeawayWeight(
  candidate: TakeawayCandidate,
  config: WeightConfig,
  behaviorData?: {
    expandCount: number;
    refCount: number;
    ageMs: number;
  }
): number {
  let weight = 0;
  
  // Manual signals (highest priority)
  const signalType = candidate.metadata?.signalType;
  if (signalType === 'HIGHLIGHT') weight += config.manualHighlight;
  if (signalType === 'QUESTION') weight += config.manualQuestion;
  if (signalType === 'ACTION_ITEM') weight += config.manualAction;
  
  // System signals
  if (candidate.source_type === 'session' && candidate.metadata?.isFocusWindow) {
    weight += config.focusWindowMoment;
  }
  if (candidate.source_type === 'card' && candidate.metadata?.isMultiCardSummary) {
    weight += config.multiCardSummary;
  }
  
  // Behavior signals (optional)
  if (behaviorData) {
    weight += Math.min(behaviorData.expandCount * config.cardExpand, 5);
    weight += behaviorData.refCount * config.referenceCount;
    if (behaviorData.ageMs < 2 * 60 * 60 * 1000) { // <2h
      weight += config.recencyBoost;
    }
  }
  
  return weight;
}
```

### 5.3 Focus Window Detection

```typescript
interface Signal {
  timestamp: number; // Unix ms
  type: 'HIGHLIGHT' | 'QUESTION' | 'ACTION_ITEM';
}

interface FocusWindow {
  startMs: number;
  endMs: number;
  signals: Signal[];
}

function detectFocusWindows(
  signals: Signal[],
  config: {
    preBuffer: number;  // 20000 (20s)
    postBuffer: number; // 60000 (60s)
    mergeThreshold: number; // 30000 (30s)
    maxWindowDuration: number; // 300000 (5min)
  }
): FocusWindow[] {
  const windows: FocusWindow[] = [];
  
  signals
    .filter(s => s.type === 'HIGHLIGHT') // Focus primarily on highlights
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((signal, idx) => {
      const start = signal.timestamp - config.preBuffer;
      const end = signal.timestamp + config.postBuffer;
      
      // Try merge with last window
      const lastWindow = windows[windows.length - 1];
      if (lastWindow && start - lastWindow.endMs < config.mergeThreshold) {
        // Merge and extend
        lastWindow.endMs = Math.min(end, lastWindow.startMs + config.maxWindowDuration);
        lastWindow.signals.push(signal);
      } else {
        // Create new window
        windows.push({
          startMs: start,
          endMs: Math.min(end, start + config.maxWindowDuration),
          signals: [signal]
        });
      }
    });
  
  return windows;
}
```

### 5.4 Intelligent Snapshot Algorithm

```typescript
interface FrameMetadata {
  timestamp: number;
  hash: string;      // 32x32 perceptual hash
  sharpness: number; // Laplacian variance
  density: number;   // Edge count / entropy
}

class SnapshotManager {
  private candidateSlot: FrameMetadata | null = null;
  private lastSavedHash: string | null = null;
  
  processFrame(frame: ImageData, timestamp: number): boolean {
    const meta = this.analyzeFrame(frame, timestamp);
    
    // Detect scene change
    const diffRatio = this.lastSavedHash 
      ? this.hammingDistance(meta.hash, this.lastSavedHash) / 1024
      : 1.0;
    
    if (diffRatio > 0.20) {
      // Major scene change → save candidate and start new slot
      this.saveCandidate();
      this.candidateSlot = meta;
      return true;
    } else if (diffRatio > 0.05) {
      // Minor change → update candidate if more informative
      if (!this.candidateSlot || this.isMoreInformative(meta, this.candidateSlot)) {
        this.candidateSlot = meta;
      }
      return false;
    }
    
    return false; // No significant change
  }
  
  private isMoreInformative(newFrame: FrameMetadata, oldFrame: FrameMetadata): boolean {
    // Weighted scoring: prefer sharper + denser frames
    const newScore = newFrame.sharpness * 0.6 + newFrame.density * 0.4;
    const oldScore = oldFrame.sharpness * 0.6 + oldFrame.density * 0.4;
    return newScore > oldScore * 1.1; // 10% threshold to avoid jitter
  }
  
  private analyzeFrame(frame: ImageData, timestamp: number): FrameMetadata {
    // Implementation: compute perceptual hash, Laplacian variance, edge density
    // Placeholder return
    return {
      timestamp,
      hash: 'computed_hash',
      sharpness: 120.5,
      density: 0.34
    };
  }
  
  private saveCandidate(): void {
    if (this.candidateSlot) {
      // Persist to IndexedDB/File System
      this.lastSavedHash = this.candidateSlot.hash;
      // ... storage logic
      this.candidateSlot = null;
    }
  }
  
  private hammingDistance(hash1: string, hash2: string): number {
    // Count differing bits
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    return distance;
  }
}
```

---

## 6. External Integrations & Dependencies

### 6.1 RECNote Audio Module

**Purpose**: Provide audio-note timestamp sync for click-to-play navigation

**Integration Points**
1. **Recording API**:
   ```typescript
   interface RECNoteRecorder {
     startRecording(noteId: string): Promise<{ recordingId: string }>;
     stopRecording(): Promise<{ duration: number; filePath: string }>;
     getCurrentOffset(): number; // milliseconds since start
   }
   ```

2. **Playback API**:
   ```typescript
   interface RECNotePlayer {
     loadRecording(recordingId: string): Promise<void>;
     seekTo(offsetMs: number): void;
     play(): void;
     pause(): void;
   }
   ```

3. **Anchor Storage**: Paragraphs with audio anchors store:
   ```typescript
   meta: {
     audioAnchor: {
       recordingId: string;
       offsetMs: number;
     }
   }
   ```

**Technical Specs** (from RECNote PRD)
- Audio format: **16kHz mono Opus @ 24kbps** → ~12MB/hour
- Local processing: Whisper transcription during idle CPU time
- FTS indexing: `FTS5` + `sqlite-vss` for semantic search
- Privacy: Local-first storage, cloud sync opt-in

**Responsibilities**
- RECNote handles: recording, encoding, playback, transcription
- Eventlog handles: anchor metadata, UI triggers, review integration

### 6.2 Intelligent Snapshot Module

**Purpose**: Capture meeting/screen evidence without full video recording

**Integration Points**
1. **Session Lifecycle**:
   ```typescript
   interface SnapshotSession {
     startCapture(config: CaptureConfig): Promise<{ sessionId: string }>;
     stopCapture(): Promise<{ imageCount: number; totalSize: number }>;
     onFrameCaptured: (imageId: string, timestamp: number) => void;
   }
   ```

2. **Image Retrieval**:
   ```typescript
   interface SnapshotAPI {
     getImage(imageId: string): Promise<{ blob: Blob; ocr?: string }>;
     getSessionImages(sessionId: string): Promise<ImageRecord[]>;
     runOCR(imageId: string): Promise<{ text: string; confidence: number }>;
   }
   ```

3. **Highlight Binding**: When user creates `HIGHLIGHT` Signal during session:
   ```typescript
   // EventLog creates Signal with current context
   const signal = {
     signal_id: uuid(),
     signal_type: 'HIGHLIGHT',
     created_at: Date.now(),
     image_id: await snapshotAPI.getCurrentImageId(), // latest or force capture
     audio_offset_ms: recnoteRecorder.getCurrentOffset()
   };
   ```

**Technical Specs** (from Snapshot PRD)
- Scene detection: >20% change → new scene, >5% → candidate update
- Candidate slot: only save most informative frame per scene
- Quality metrics: sharpness (Laplacian variance) + density (edge count)
- Storage: IndexedDB (web) or File System (Electron), compressed WebP/JPEG

**Responsibilities**
- Snapshot module handles: frame capture, scene detection, OCR execution
- Eventlog handles: Signal-to-image binding, reference rendering in reviews

---

## 7. Implementation Roadmap

### MVP-1: Evidence Foundation (Weeks 1-3)

**Goal**: Establish reliable evidence capture without review generation

**Deliverables**
- [ ] EventLog table + logging infrastructure for core events (`ASK_AI`, `CARD_EXPANDED`, `HIGHLIGHT_ADDED`)
- [ ] Signals table + UI for manual tagging (⭐/❓/✅ buttons)
- [ ] Holographic Map auto-generation with Signal decoration
- [ ] Basic filtering (by Signal type)

**Success Criteria**
- All user interactions logged with <50ms latency
- Holographic Map updates within 500ms of note edits
- Manual Signals persist correctly and display in outline

### MVP-2: Takeaway Settlement (Weeks 4-6)

**Goal**: Auto-generate TakeawayCandidates from interactions

**Deliverables**
- [ ] TakeawayCandidate schema + storage
- [ ] Auto-generation logic:
  - AI Answer → 1 takeaway
  - Multi-card Summary → 3-5 takeaways
- [ ] Manual tagging UI (star icon on paragraphs)
- [ ] Weight calculation (manual + system signals only)

**Success Criteria**
- Takeaways auto-created on all qualifying events
- Manual tagging adds highest-weight candidates
- Can query top N takeaways for a given date

### MVP-3: Daily Narrative (Weeks 7-10)

**Goal**: First end-to-end review generation

**Deliverables**
- [ ] Daily Narrative generation service
- [ ] UI panel for viewing/regenerating narratives
- [ ] Evidence linking (clickable `[📎 See: ...]` refs)
- [ ] Sections: Narrative Summary, Top Takeaways, Open Loops, Action Items

**Success Criteria**
- Generate coherent 1-page summary from day's evidence
- All takeaways clickable to source cards
- User can regenerate after editing notes
- <30s generation time for typical day (50-100 events)

### MVP-4: Audio Sync (Weeks 11-13)

**Goal**: Integrate RECNote for audio-note anchoring

**Deliverables**
- [ ] RECNote recording integration (start/stop in note UI)
- [ ] `audioAnchor` metadata storage in paragraphs
- [ ] Click-to-play: paragraph → audio seeks to offset
- [ ] Local Whisper transcription (background task)

**Success Criteria**
- Audio recorded at <12MB/hour (Opus 24kbps)
- Accurate offset capture (±1s)
- Smooth playback seeking
- Transcription completes within 2x real-time on idle CPU

### MVP-5: Meeting Snapshots (Weeks 14-17)

**Goal**: Intelligent frame capture for meeting evidence

**Deliverables**
- [ ] Screen capture session management
- [ ] Scene detection + candidate slot algorithm
- [ ] Signal-to-image binding (Highlight → current screenshot)
- [ ] OCR processing (throttled)
- [ ] Meeting bullet notes generation with `[ref: image ...]`

**Success Criteria**
- 1-hour meeting → 30-80 screenshots (not thousands)
- Key moments linked to correct images
- OCR text searchable
- User can click ref → view image + play audio at timestamp

### Post-MVP: Advanced Features

**Phase 2 (Months 6-9)**
- [ ] Weekly/Monthly compounding reviews
- [ ] Resonance query + card generation
- [ ] Voice cue detection for hands-free Signal creation
- [ ] Behavior-based weight components (expand count, ref count)
- [ ] Mobile app with cloud processing for Pro users

**Phase 3 (Months 10-12)**
- [ ] Calendar integration (import events as Timeline Evidence)
- [ ] Task manager export (Action Items → Todoist/etc.)
- [ ] Collaborative session sharing (privacy-controlled)
- [ ] Advanced analytics (topic trends, productivity insights)

---

## 8. Success Metrics

### User Engagement
- **Daily Active Users with Review**: % of users generating ≥1 Daily Narrative per week
- **Average Review Time**: Target <3 min to read daily narrative
- **Takeaway Retention**: % of takeaways marked as valuable (upvoted/archived vs. deleted)

### Technical Performance
- **EventLog Write Latency**: p95 <50ms
- **Daily Narrative Generation Time**: p95 <30s for typical day
- **Audio Processing**: Whisper transcription completes within 2x real-time
- **Snapshot Efficiency**: Meeting sessions generate <10% frame count vs. 1fps full recording

### Quality Indicators
- **Takeaway Relevance**: User feedback score (1-5 scale) avg >3.5
- **Signal Precision**: % of manually tagged Highlights appearing in Top Takeaways >80%
- **OCR Accuracy**: Avg confidence score >70% on saved screenshots

---

## 9. Privacy & Security Considerations

### Data Residency
- **Local-First by Default**: Audio files and screenshots stored on-device
- **Cloud Sync Opt-In**: User explicitly enables cloud backup, with clear data policy disclosure
- **Encryption**: All cloud-synced media encrypted at rest (AES-256)

### User Control
- **Granular Deletion**: User can delete individual events, sessions, images
- **Session Privacy Mode**: Option to record "off the record" (no cloud sync, auto-delete after N days)
- **Evidence Redaction**: Ability to blur/delete specific screenshots retroactively

### Compliance
- **GDPR**: Right to access, export, delete all personal data
- **Data Export**: Full evidence archive exportable as JSON + media files
- **Transparency**: Clear disclosure in UI when recording audio/screen

---

## 10. Open Questions & Future Explorations

### Technical Debt Items
- **Embedding Model Selection**: Which model for takeaway clustering? (sentence-transformers vs. OpenAI)
- **OCR Library**: Tesseract.js (local) vs. cloud OCR (Google Vision)? Latency vs. cost trade-off
- **Mobile Audio Processing**: Can we run lightweight Whisper on-device, or always defer to desktop?

### Design Ambiguities
- **Resonance Threshold Tuning**: What similarity score works best? User-adjustable or auto-calibrated?
- **Focus Window Merging**: How to handle 3+ highlights in rapid succession? Current logic may over-merge
- **Takeaway Deduplication**: How to detect near-duplicate takeaways across days? Embedding similarity + text fuzzy match?

### Product Strategy
- **Monetization**: Free tier (local-only) vs. Pro (cloud + instant processing)? Storage limits?
- **Collaboration**: Should sessions be shareable? Privacy implications for meeting recordings
- **Third-Party Integrations**: Which calendar/task managers to prioritize? API design?

---

## 11. Appendix: Key Terminology Quick Reference

| Term | Definition | Storage |
|------|------------|---------|
| **EventLog** | Immutable interaction log | `event_log` table |
| **Signal** | User-initiated importance marker | `signals` table |
| **Session** | Continuous recording period | `sessions` table |
| **TakeawayCandidate** | Micro-conclusion for daily aggregation | `takeaway_candidates` table |
| **Focus Window** | High-priority time range around Signal | Computed on-demand |
| **Holographic Map** | Auto-generated filterable outline | Generated from note structure |
| **Daily Narrative** | Structured daily review output | Generated document, optionally saved |
| **Resonance** | Cross-note semantic connections | `resonance_queries` + card type |
| **RECNote** | Audio-note timestamp sync module | Separate module, integrated via API |
| **Intelligent Snapshot** | Smart meeting screenshot capture | Separate module, integrated via API |

---

**Document Status**: Ready for implementation. All core requirements specified with sufficient detail for development. Open questions flagged for resolution during sprint planning.

**Next Steps**: 
1. Technical review with engineering team
2. Finalize MVP-1 sprint backlog
3. Set up EventLog infrastructure and testing framework
4. Begin Holographic Map UI implementation
