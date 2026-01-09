# SSOT架构合规检查工具

本目录包含用于确保代码符合SSOT（Single Source of Truth）架构规范的检查工具。

## 📚 背景

根据 [EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md](../docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md)，我们的代码库需要遵循严格的架构规范：

- ✅ Event不应包含Signal相关字段
- ✅ 时间字段必须使用本地格式（`YYYY-MM-DD HH:mm:ss`），禁止ISO格式
- ✅ Deprecated字段应逐步迁移到facet/resolver
- ✅ Single Writer原则

## 🛠️ 工具清单

### 1. 运行时检查（`src/utils/ssotLinter.ts`）

在开发/测试环境中实时检测违规代码。

**使用方法：**
```typescript
import { validateEventAgainstSSOT } from '@frontend/utils/ssotLinter';

// 在EventService中自动检查
EventService.createEvent(event); // 已集成检查

// 手动检查
validateEventAgainstSSOT(event, 'create');
```

**检查项：**
- ❌ 禁止的Signal字段（`isHighlight`、`hasQuestions`等）
- ⚠️ Deprecated字段警告（`isTask`、`isPlan`、`content`等）
- ❌ ISO时间格式（`2026-01-09T10:00:00Z`）
- ✅ 本地时间格式（`2026-01-09 10:00:00`）

### 2. 静态检查（`eslint-plugin-ssot.js`）

在编译/提交前捕获违规代码。

**配置方法：**
```javascript
// .eslintrc.js
module.exports = {
  plugins: ['@local/ssot'],
  rules: {
    '@local/ssot/no-deprecated-event-fields': 'warn',
    '@local/ssot/no-iso-time-format': 'error',
    '@local/ssot/no-signal-fields-in-event': 'error',
  },
};
```

**使用ESLint插件：**
```bash
npm run lint
```

### 3. 单元测试（`src/__tests__/utils/ssotLinter.test.ts`）

验证检查工具的正确性。

```bash
npm test ssotLinter.test.ts
```

## 🚫 禁止的字段

### Signal相关（完全禁止）
```typescript
// ❌ 错误
event.isHighlight = true;
event.hasQuestions = true;
event.signalCount = 5;
event.isImportant = true;

// ✅ 正确
// Signal数据应存储在独立的signals表中（未来实施）
```

### Deprecated字段（仅允许读取）
```typescript
// ❌ 错误 - 禁止写入
event.isTask = true;
event.isPlan = true;
event.content = 'hello';

// ✅ 正确 - 使用facet/resolver
import { hasTaskFacet, shouldShowInPlan } from '@frontend/utils/eventFacets';
import { resolveDisplayTitle } from '@frontend/utils/TitleResolver';

const isTask = hasTaskFacet(event);
const shouldShow = shouldShowInPlan(event);
const displayText = resolveDisplayTitle(event);
```

## ⏰ 时间格式规范

### 禁止使用
```typescript
// ❌ 错误 - ISO格式
event.startTime = new Date().toISOString(); // "2026-01-09T10:00:00.000Z"
event.createdAt = new Date().toJSON();

// ❌ 错误 - 包含'T'或'Z'
event.updatedAt = "2026-01-09T10:00:00";
```

### 正确使用
```typescript
// ✅ 正确 - 本地格式
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

event.startTime = formatTimeForStorage(new Date()); // "2026-01-09 10:00:00"
event.createdAt = formatTimeForStorage(new Date());
```

## 🔧 迁移指南

### 从deprecated字段迁移

#### isTask → hasTaskFacet
```typescript
// Before
if (event.isTask) { ... }

// After
import { hasTaskFacet } from '@frontend/utils/eventFacets';
if (hasTaskFacet(event)) { ... }
```

#### isPlan → shouldShowInPlan
```typescript
// Before
if (event.isPlan) { ... }

// After
import { shouldShowInPlan } from '@frontend/utils/eventFacets';
if (shouldShowInPlan(event)) { ... }
```

#### content → title.fullTitle
```typescript
// Before
const text = event.content;

// After
import { resolveDisplayTitle } from '@frontend/utils/TitleResolver';
const text = resolveDisplayTitle(event);
// 或直接访问
const text = event.title?.fullTitle || event.title?.simpleTitle || '';
```

#### isTimer/isTimeLog → source + id prefix
```typescript
// Before
if (event.isTimer) { ... }
if (event.isTimeLog) { ... }

// After
const isTimer = event.id.startsWith('timer-');
const isTimeLog = event.source === 'local:timelog';
```

## 🧪 测试覆盖

运行测试验证检查工具：
```bash
npm test ssotLinter.test.ts
```

测试覆盖：
- ✅ 禁止Signal字段检测
- ✅ Deprecated字段警告
- ✅ ISO时间格式拒绝
- ✅ 本地时间格式接受
- ✅ Migration路径豁免
- ✅ 生产环境跳过检查

## 📋 检查清单

在提交代码前，请确认：

- [ ] 没有使用禁止的Signal字段（`isHighlight`、`hasQuestions`等）
- [ ] 没有写入deprecated字段（`isTask`、`isPlan`、`content`等）
- [ ] 所有时间字段使用本地格式（`formatTimeForStorage()`）
- [ ] 没有使用`toISOString()`或`toJSON()`
- [ ] EventService的create/update已通过SSOT验证
- [ ] ESLint检查通过（`npm run lint`）
- [ ] 单元测试通过（`npm test`）

## 🔗 相关文档

- [EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md](../docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md) - SSOT架构规范
- [eventFacets.ts](../src/utils/eventFacets.ts) - Facet推导函数
- [TitleResolver.ts](../src/utils/TitleResolver.ts) - 标题解析器
- [timeUtils.ts](../src/utils/timeUtils.ts) - 时间格式化工具

## 💡 常见问题

### Q: 为什么不能用`event.isTask`？
A: 这是布尔字段，无法表达"既是Task又是Calendar"等复杂状态。使用`hasTaskFacet(event)`可以基于`checkType`字段动态推导，更灵活。

### Q: Migration代码是否豁免？
A: 是的。在`validateEventAgainstSSOT()`中设置`allowMigration: true`即可豁免deprecated字段警告。

### Q: 生产环境是否执行检查？
A: 否。所有检查仅在`NODE_ENV !== 'production'`时执行，不影响生产性能。

### Q: 如何快速查找所有违规代码？
A: 运行`npm run lint`，ESLint会列出所有静态检查问题。

## 🚀 未来计划

- [ ] 实施Signal架构（Phase 1-4）
- [ ] 完全移除deprecated字段（需要数据库migration）
- [ ] 添加pre-commit hook自动检查
- [ ] 生成违规报告dashboard

---

**最后更新：** 2026-01-09  
**维护者：** 4DNote Team  
**版本：** 1.0.0
