# TimeSpec 规范

## 核心原则

**4DNote 使用本地时间格式，禁止使用 ISO 8601 格式。**

### ✅ 正确格式

```
YYYY-MM-DD HH:mm:ss
```

- **分隔符**：空格（不是 `T`）
- **时区**：本地时间（不是 UTC）
- **示例**：`2025-12-15 22:30:00`

### ❌ 禁止格式

```
YYYY-MM-DDTHH:mm:ss.sssZ  ❌ ISO 8601
```

- 使用 `T` 分隔符
- 使用 `Z` 或时区偏移
- 包含毫秒

## 为什么禁止 ISO 格式？

### 致命问题：时区偏移

```javascript
// ❌ 错误：使用 toISOString()
const time = new Date('2025-12-15 22:30:00');
const isoString = time.toISOString();
// 结果：'2025-12-15T14:30:00.000Z'  （GMT+8 减去 8 小时！）

// 当同步到 Outlook 时：
// - Outlook 看到 'T' 分隔符，认为是 UTC 时间
// - 转换为本地时间：14:30 + 8 = 22:30（看起来对）
// - 但实际存储的是错误的 UTC 时间！
// - 在其他时区查看会出现 8 小时偏差
```

### 数据同步风险

1. **Outlook 同步**：我们的数据会同步到 Microsoft Outlook
2. **时区误判**：ISO 格式的 `T` 会被 Outlook 识别为 UTC 时间
3. **时间偏移**：在 GMT+8 时区，会产生 8 小时偏差
4. **数据损坏**：时间信息永久错误，无法恢复

## 正确的使用方式

### 格式化时间（Date → String）

```typescript
import { formatTimeForStorage } from '@/utils/timeUtils';

// ✅ 正确
const timeStr = formatTimeForStorage(new Date());
// 结果：'2025-12-15 22:30:00'

// ❌ 错误
const timeStr = new Date().toISOString();
const timeStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
```

### 解析时间（String → Date）

```typescript
import { parseLocalTimeString } from '@/utils/timeUtils';

// ✅ 正确
const date = parseLocalTimeString('2025-12-15 22:30:00');

// ❌ 错误
const date = new Date('2025-12-15T22:30:00Z');
```

### 直接构造 Date 对象

```typescript
// ✅ 正确：使用参数构造（避免字符串解析）
const date = new Date(2025, 11, 15, 22, 30, 0); // 月份从 0 开始

// ⚠️ 谨慎：字符串构造可能有兼容性问题
const date = new Date('2025-12-15 22:30:00'); // 某些浏览器可能无法识别
```

## ESLint 规则

项目已配置 ESLint 规则，**使用 `toISOString()` 会报错**：

```javascript
// ❌ ESLint 错误
const time = new Date().toISOString();
// Error: 禁止使用 toISOString()！
// 请使用 formatTimeForStorage() 代替。
```

### 例外情况

以下场景允许使用：

1. **timeUtils.ts**：工具函数封装层
2. **测试文件**：`*.test.ts`、`*.test.tsx`（降级为警告）
3. **调试文件**：`debug*.ts`、`performance*.ts`（降级为警告）

## 工具函数清单

### 来自 `@/utils/timeUtils`

```typescript
// 格式化为 TimeSpec 格式
formatTimeForStorage(date: Date): string
// → '2025-12-15 22:30:00'

// 解析 TimeSpec 格式
parseLocalTimeString(timeStr: string): Date | null
// ← '2025-12-15 22:30:00'

// 获取当前时间（TimeSpec 格式）
getCurrentTimeString(): string
// → '2025-12-15 22:30:00'

// 格式化为日期字符串
formatDateForStorage(date: Date): string
// → '2025-12-15'
```

## 数据库存储规范

### 事件时间字段

```typescript
interface StorageEvent {
  startTime: string;    // '2025-12-15 09:00:00'
  endTime: string;      // '2025-12-15 10:00:00'
  createdAt: string;    // '2025-12-15 22:30:00'
  updatedAt: string;    // '2025-12-15 22:30:00'
  deletedAt?: string;   // '2025-12-15 22:30:00'
}
```

### 历史记录

```typescript
interface EventLog {
  timestamp: string;     // '2025-12-15 22:30:00'
  createdAt?: string;    // '2025-12-15 22:30:00'
  updatedAt?: string;    // '2025-12-15 22:30:00'
}
```

### Block-Level Timestamp

```typescript
interface ParagraphNode {
  type: 'paragraph';
  createdAt?: string;    // '2025-12-15 22:30:00'
  updatedAt?: string;    // '2025-12-15 22:30:00'
  children: TextNode[];
}
```

## 常见错误示例

### ❌ 错误 1：直接使用 toISOString()

```typescript
const event = {
  startTime: new Date().toISOString(), // ❌
  createdAt: new Date().toISOString()  // ❌
};
```

**修复：**
```typescript
import { formatTimeForStorage } from '@/utils/timeUtils';

const event = {
  startTime: formatTimeForStorage(new Date()), // ✅
  createdAt: formatTimeForStorage(new Date())  // ✅
};
```

### ❌ 错误 2：手动转换 ISO 格式

```typescript
const timeStr = new Date().toISOString().replace('T', ' ').slice(0, 19); // ❌
```

**修复：**
```typescript
const timeStr = formatTimeForStorage(new Date()); // ✅
```

### ❌ 错误 3：使用 ISO 格式解析

```typescript
const date = new Date('2025-12-15T22:30:00Z'); // ❌ UTC 时间
```

**修复：**
```typescript
const date = parseLocalTimeString('2025-12-15 22:30:00'); // ✅ 本地时间
```

## 迁移指南

### 如果发现 toISOString()

1. **检查用途**：确定是否用于存储
2. **替换为工具函数**：
   ```typescript
   // Before
   const time = new Date().toISOString();
   
   // After
   import { formatTimeForStorage } from '@/utils/timeUtils';
   const time = formatTimeForStorage(new Date());
   ```
3. **运行测试**：确保时间解析正确

### 如果发现 replace('T', ' ')

1. **识别模式**：
   ```typescript
   .toISOString().replace('T', ' ').slice(0, 19)
   ```
2. **直接替换**：
   ```typescript
   formatTimeForStorage(date)
   ```

## 验证工具

### 运行 ESLint 检查

```bash
npm run lint
```

### 搜索潜在问题

```bash
# 搜索 toISOString 使用
grep -r "toISOString" src/

# 搜索 T 替换
grep -r "replace.*'T'" src/
```

## 参考

- **工具函数实现**：`src/utils/timeUtils.ts`
- **ESLint 配置**：`.eslintrc.js`
- **相关文档**：
  - `docs/STORAGE_DIAGNOSIS_SUMMARY.md`
  - `docs/UUID_MIGRATION_VERIFICATION.md`

---

**最后更新**：2025-12-15
**版本**：v1.0
**维护者**：4DNote Team
