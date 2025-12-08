# Bullet Level 同步 Bug 修复报告

> **问题**: Plan 页面通过 Tab 创建的二级、三级标题刷新后丢失  
> **修复日期**: 2025-12-03  
> **优先级**: 🔴 Critical P0  
> **状态**: ✅ 已修复

---

## 📋 问题描述

### 用户报告
- **现象**: 在 Plan 页面中，通过 Tab 键缩进创建的二级标题（●）、三级标题（○）能够正常显示
- **Bug**: 刷新页面后，这些缩进层级**全部丢失**，所有标题都回到一级状态
- **影响**: 用户无法使用多级列表功能，严重影响笔记结构化能力

### 技术表现
```
操作前：
  ● 一级标题
    ○ 二级标题  <- Tab 创建
      – 三级标题  <- Tab Tab 创建

刷新后：
  ● 一级标题
  ● 二级标题  <- ❌ 层级丢失
  ● 三级标题  <- ❌ 层级丢失
```

---

## 🔍 根本原因分析

### Bug 1: Tab 键处理逻辑中的字段不同步

**位置**: `src/components/PlanSlate/PlanSlate.tsx` L2513-2577

**问题代码**:
```typescript
// Tab 键增加缩进
if (paragraph.bullet) {
  const currentBulletLevel = paragraph.bulletLevel || 0;
  const newBulletLevel = Math.min(currentBulletLevel + 1, 4);
  
  // ❌ 错误: bulletLevel 正确更新，但 EventLine.level 使用了错误的计算
  Editor.withoutNormalizing(editor, () => {
    Transforms.setNodes(editor, { bulletLevel: newBulletLevel } as any, ...);
    
    // ❌ 问题所在: 使用 eventLine.level + 1，而不是 newBulletLevel
    const newEventLineLevel = eventLine.level + 1;
    Transforms.setNodes(editor, { level: newEventLineLevel } as unknown as Partial<Node>, ...);
  });
}
```

**问题分析**:
1. `paragraph.bulletLevel` 正确更新（0→1→2→3→4）
2. `EventLine.level` 使用 `eventLine.level + 1` 计算，而不是直接使用 `newBulletLevel`
3. 导致两个字段**不同步**：
   ```typescript
   // 第1次 Tab (从 level=0 开始)
   bulletLevel: 0 → 1  ✅
   level: 0 + 1 = 1    ✅ (一致)
   
   // 第2次 Tab (从 level=1 开始)
   bulletLevel: 1 → 2  ✅
   level: 1 + 1 = 2    ✅ (一致)
   
   // 但如果中间有删除操作或其他修改
   bulletLevel: 2 → 3  ✅
   level: 1 + 1 = 2    ❌ (不一致！应该是 3)
   ```

### Bug 2: 序列化时的字段选择策略

**位置**: `src/components/PlanSlate/serialization.ts` L466-479

**相关代码**:
```typescript
// 序列化 Eventlog 行
const bullet = (para as any).bullet;
const bulletLevel = (para as any).bulletLevel || 0;
// ⚠️ 使用 bulletLevel 作为 level
const level = bullet ? bulletLevel : (node.level || 0);

if (bullet) {
  return `<p data-bullet="true" data-bullet-level="${bulletLevel}" data-level="${level}">${html}</p>`;
}
```

**分析**:
- 保存时，`data-level` 优先使用 `bulletLevel`（正确）
- 但如果 `EventLine.level` 与 `bulletLevel` 不一致，会导致混乱
- 加载时，`parseHtmlToParagraphsWithLevel` 读取 `data-level` 并赋值给 `EventLine.level`
- **虽然这段代码有保护机制**，但无法修复上游 Tab 逻辑的 Bug

---

## ✅ 修复方案

### 核心思路
确保 `paragraph.bulletLevel` 和 `EventLine.level` **始终同步**，都使用相同的值。

### 修复代码

#### 修复 Tab 键（增加缩进）

**文件**: `src/components/PlanSlate/PlanSlate.tsx` L2513-2549

```typescript
if (paragraph.bullet) {
  const currentBulletLevel = paragraph.bulletLevel || 0;
  const newBulletLevel = Math.min(currentBulletLevel + 1, 4);
  
  // ✅ FIX: 确保 bulletLevel 和 level 始终同步
  console.log('[Tab] 增加 bullet 层级', {
    旧bulletLevel: currentBulletLevel,
    新bulletLevel: newBulletLevel,
    旧EventLineLevel: eventLine.level,
    新EventLineLevel: newBulletLevel,
    '同步状态': '✅ bulletLevel === level'
  });
  
  Editor.withoutNormalizing(editor, () => {
    Transforms.setNodes(editor, { bulletLevel: newBulletLevel } as any, ...);
    
    // ✅ 关键修复: 使用 newBulletLevel，而不是 eventLine.level + 1
    Transforms.setNodes(
      editor,
      { level: newBulletLevel } as unknown as Partial<Node>,
      { at: currentPath }
    );
  });
}
```

#### 修复 Shift+Tab（减少缩进）

**文件**: `src/components/PlanSlate/PlanSlate.tsx` L2578-2617

```typescript
if (paragraph.bullet) {
  const currentBulletLevel = paragraph.bulletLevel || 0;
  
  if (currentBulletLevel > 0) {
    const newBulletLevel = currentBulletLevel - 1;
    console.log('[Shift+Tab] 减少 bullet 层级', {
      旧bulletLevel: currentBulletLevel,
      新bulletLevel: newBulletLevel,
      旧EventLineLevel: eventLine.level,
      新EventLineLevel: newBulletLevel,
      '同步状态': '✅ bulletLevel === level'
    });
    
    Editor.withoutNormalizing(editor, () => {
      Transforms.setNodes(editor, { bulletLevel: newBulletLevel } as any, ...);
      
      // ✅ 关键修复: 使用 newBulletLevel，而不是 eventLine.level - 1
      Transforms.setNodes(
        editor,
        { level: newBulletLevel } as unknown as Partial<Node>,
        { at: currentPath }
      );
    });
  }
}
```

---

## 🧪 测试验证

### 测试步骤

1. **创建多级列表**:
   ```
   按 `Ctrl/Cmd + L` 创建 bullet
   输入 "一级标题"
   按 Enter，输入 "二级标题"
   按 Tab → 应显示 ○ 符号
   按 Enter，输入 "三级标题"
   按 Tab → 应显示 – 符号
   ```

2. **验证同步状态**（打开控制台）:
   ```
   [Tab] 增加 bullet 层级 {
     旧bulletLevel: 0,
     新bulletLevel: 1,
     旧EventLineLevel: 0,
     新EventLineLevel: 1,  // ✅ 应该一致
     同步状态: "✅ bulletLevel === level"
   }
   ```

3. **刷新页面验证持久化**:
   ```
   刷新页面（F5）
   检查多级列表是否保持：
     ● 一级标题
       ○ 二级标题  ✅ 层级保持
         – 三级标题  ✅ 层级保持
   ```

4. **边界测试**:
   - 连续按 5 次 Tab → 应停在 Level 4（▸ 符号）
   - Level 4 再按 Tab → 无变化
   - 从 Level 4 连续按 Shift+Tab → 应逐级减少，直到取消 bullet

### 预期结果

| 测试场景 | 预期结果 | 实际结果 |
|---------|---------|---------|
| Tab 增加层级 | bulletLevel 和 level 同步 | ✅ 通过 |
| Shift+Tab 减少层级 | bulletLevel 和 level 同步 | ✅ 通过 |
| 刷新页面后持久化 | 多级列表层级保持 | ✅ 通过 |
| 连续 Tab 到 Level 4 | 正确停止在 Level 4 | ✅ 通过 |
| 连续 Shift+Tab 到 Level 0 | 正确取消 bullet | ✅ 通过 |

---

## 📊 影响评估

### 修复前
- ❌ 多级列表功能**完全不可用**（刷新后丢失）
- ❌ 用户体验极差，无法信任该功能
- ❌ 数据不一致风险高

### 修复后
- ✅ 多级列表功能**完全正常**
- ✅ 刷新后数据正确持久化
- ✅ `bulletLevel` 和 `level` 始终同步，消除数据不一致风险

---

## 🔗 相关文档

- [SLATEEDITOR_PRD.md](../PRD/SLATEEDITOR_PRD.md) - Bullet Point 功能设计
- [EVENTHUB_TIMEHUB_ARCHITECTURE.md](../architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md) - 事件架构
- [PlanSlate.tsx](../../src/components/PlanSlate/PlanSlate.tsx) - 核心编辑器实现
- [serialization.ts](../../src/components/PlanSlate/serialization.ts) - 序列化/反序列化逻辑

---

## 💡 关键经验总结

### 设计原则
1. **单一数据源**: 避免多个字段表示同一含义（`bulletLevel` vs `level`）
2. **强制同步**: 如果必须使用多个字段，必须在**所有更新点**强制同步
3. **调试日志**: 关键同步点添加日志，便于快速诊断不一致问题

### 代码审查要点
- ✅ 检查所有修改 `bulletLevel` 的地方，是否同步更新 `level`
- ✅ 检查所有修改 `level` 的地方，是否同步更新 `bulletLevel`（如果是 bullet 段落）
- ✅ 序列化/反序列化是否使用一致的字段优先级

### 未来优化建议
考虑重构为**单一字段架构**：
```typescript
// 选项 1: 只保留 bulletLevel（推荐）
paragraph.bulletLevel  // 0-4 表示层级
EventLine.level = paragraph.bulletLevel  // 自动同步

// 选项 2: 只保留 level（如果不需要区分 bullet 和普通缩进）
EventLine.level  // 0-4 表示层级
paragraph.bulletLevel = EventLine.level  // 派生字段
```

但由于当前架构已稳定，修复同步逻辑是风险最小的方案。
