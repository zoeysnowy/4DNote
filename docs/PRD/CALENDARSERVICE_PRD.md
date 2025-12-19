# CalendarService 产品需求文档 (PRD)

## 文档信息
- **创建日期**: 2025-12-19
- **版本**: v2.0.0
- **状态**: ✅ 已完成重构
- **负责人**: 系统架构
- **相关文档**: MicrosoftCalendarService PRD, EventService PRD, ActionBasedSyncManager PRD

---

## 一、概述

### 1.1 背景

#### 重构前的问题
在 v1.x 版本中，日历数据管理存在严重的架构问题：

1. **数据获取混乱**（至少3种不同方式）
   - 方式1：直接从 localStorage 读取 `4dnote-calendars-cache`
   - 方式2：通过 `microsoftService.getCachedCalendars()`
   - 方式3：通过 props 层层传递

2. **颜色读取逻辑重复且不统一**（4个重复实现）
   - `calendarUtils.ts` 中的 `convertMicrosoftColorToHex`
   - `SyncTargetPicker.tsx` 中的颜色映射表
   - `CalendarMappingPicker.tsx` 中的颜色映射表
   - `CalendarService.ts` v1 中的哈希颜色生成

3. **名称处理分散**（6处重复的emoji清理逻辑）
   - `EventEditModalV2.tsx` - `getCalendarInfo()`
   - `LogTab.tsx` - `getCalendarInfo()`
   - `TimeLog.tsx` - `getMultiCalendarDisplayInfo()`
   - `SimpleCalendarDropdown.tsx` - `getCalendarName()`
   - `CalendarPicker.tsx` - `getCalendarName()`
   - 所有地方都使用相同的正则：`/^[\uD83C-\uDBFF\uDC00-\uDFFF]+\s*/`

4. **接口定义不统一**（3个版本）
   ```typescript
   // 版本1
   {id: string, name: string, color: string}
   
   // 版本2
   {id: string, name?: string, displayName?: string, color?: string}
   
   // 版本3
   {id: string, name: string, hexColor?: string, backgroundColor?: string, color?: string}
   ```

### 1.2 目标

重构 CalendarService 为统一的日历数据管理服务，参考其他业务模块的设计模式：

- ✅ **单一数据源**：CalendarService 作为日历数据的唯一真实来源
- ✅ **统一接口**：所有 Calendar 对象使用统一的类型定义
- ✅ **工具函数集中**：颜色转换、名称处理等工具函数统一管理
- ✅ **智能缓存**：自动管理 localStorage 缓存和服务同步
- ✅ **多账户支持**：为未来的 Google/iCloud 集成预留扩展点

### 1.3 适用范围

- 所有日历列表的获取和显示
- 日历选择器组件（CalendarPicker, SyncTargetPicker 等）
- 事件关联的日历信息展示
- 日历分组管理
- 日历颜色和名称处理

---

## 二、架构设计

### 2.1 核心模块

```
src/
├── types/
│   └── calendar.ts                    # 统一类型定义
├── utils/
│   ├── calendarColorUtils.ts         # 颜色转换工具
│   └── calendarNameUtils.ts          # 名称处理工具
├── services/
│   └── CalendarService.ts            # 核心服务（v2.0）
└── components/
    ├── Calendar/
    │   ├── CalendarPicker.tsx        # 日历选择组件
    │   └── CalendarListItem.tsx      # 列表项组件（待实现）
    └── EventEditModal/
        └── SyncTargetPicker.tsx      # 同步目标选择器
```

### 2.2 类型定义

#### 2.2.1 Calendar 接口

```typescript
// src/types/calendar.ts

export interface Calendar {
  /** 日历唯一ID */
  id: string;
  
  /** 日历显示名称（可能包含emoji） */
  name: string;
  
  /** 备用显示名称 */
  displayName?: string;
  
  /** 十六进制颜色值（统一格式） */
  color: string;
  
  /** 原始颜色值（Microsoft颜色名称等） */
  rawColor?: string;
  
  /** 背景颜色（向后兼容） */
  backgroundColor?: string;
  
  /** 日历分组ID */
  groupId?: string;
  
  /** 日历提供商 */
  provider?: CalendarProvider;
  
  /** 是否可编辑 */
  canEdit?: boolean;
  
  /** 是否为默认日历 */
  isDefault?: boolean;
  
  /** 所有者邮箱 */
  ownerEmail?: string;
}

export type CalendarProvider = 'outlook' | 'google' | 'icloud' | 'local';
```

#### 2.2.2 CalendarGroup 接口

```typescript
export interface CalendarGroup {
  id: string;
  name: string;
  calendars?: Calendar[];
  provider?: CalendarProvider;
}
```

#### 2.2.3 特殊日历常量

```typescript
export const SPECIAL_CALENDAR_IDS = {
  LOCAL_CREATED: 'local-created',    // 🔮 创建自本地
  NOT_SYNCED: 'not-synced',          // 🔄 未同步至日历
  NONE: 'none'                        // 不映射到日历
} as const;
```

### 2.3 数据流

```
┌─────────────────────────────────────────────────────────┐
│                   CalendarService                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │         初始化 (initialize)                        │  │
│  │  1. 从 localStorage 加载缓存                       │  │
│  │  2. 如果缓存为空，从 MicrosoftService 同步         │  │
│  │  3. 规范化所有 Calendar 对象                       │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │         内部状态                                   │  │
│  │  • calendars: Map<id, Calendar>                   │  │
│  │  • calendarGroups: Map<id, CalendarGroup>        │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │         公共 API                                   │  │
│  │  • getCalendars(includeSpecial?)                  │  │
│  │  • getCalendar(id)                                │  │
│  │  • getColor(id)                                   │  │
│  │  • getDisplayName(id, options?)                   │  │
│  │  • searchCalendars(query)                         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┴─────────────────┐
        ↓                                   ↓
┌──────────────────┐              ┌──────────────────┐
│   UI Components  │              │  Utility Tools   │
│ • CalendarPicker │              │ • calendarUtils  │
│ • SyncTarget...  │              │ • EventService   │
└──────────────────┘              └──────────────────┘
```

---

## 三、核心功能

### 3.1 初始化与数据加载

#### 3.1.1 初始化流程

```typescript
// App.tsx 中调用
await CalendarService.initialize(microsoftCalendarService);
```

**流程步骤：**
1. 从 `localStorage` 加载 `4dnote-calendars-cache`
2. 从 `localStorage` 加载 `4dnote-calendar-groups-cache`
3. 如果缓存为空，调用 `syncFromServices()`
4. 规范化所有日历对象（统一格式）
5. 标记 `isInitialized = true`

#### 3.1.2 数据规范化

所有日历对象经过 `normalizeCalendar()` 处理：

```typescript
private normalizeCalendar(raw: any): Calendar {
  return {
    id: raw.id,
    name: raw.name || raw.displayName || raw.id,
    displayName: raw.displayName || raw.name,
    color: getCalendarColor(raw),           // 统一颜色格式
    rawColor: raw.color,
    backgroundColor: raw.backgroundColor,
    groupId: raw.groupId || raw.calendarGroupId,
    provider: raw.provider || this.inferProvider(raw.id),
    canEdit: raw.canEdit !== false,
    isDefault: raw.isDefault || false,
    ownerEmail: raw.ownerEmail || raw.owner?.address
  };
}
```

### 3.2 数据查询

#### 3.2.1 基础查询

```typescript
// 获取所有日历
const calendars = CalendarService.getCalendars();

// 包含特殊选项（本地创建、未同步）
const allCalendars = CalendarService.getCalendars(true);

// 获取单个日历
const calendar = CalendarService.getCalendar(calendarId);

// 按提供商筛选
const outlookCalendars = CalendarService.getCalendarsByProvider('outlook');

// 按分组筛选
const groupCalendars = CalendarService.getCalendarsByGroup(groupId);
```

#### 3.2.2 搜索功能

```typescript
// 模糊搜索日历名称
const results = CalendarService.searchCalendars('工作');
```

#### 3.2.3 便捷方法

```typescript
// 获取颜色
const color = CalendarService.getColor(calendarId);  // 返回十六进制颜色

// 获取显示名称
const name = CalendarService.getDisplayName(calendarId);

// 带提供商前缀的名称
const fullName = CalendarService.getDisplayName(calendarId, { 
  withProvider: true 
}); // "Outlook: 工作日历"

// 批量获取信息（用于UI渲染）
const infos = CalendarService.getBatchInfo(['cal-1', 'cal-2']);
// 返回: [{ id, name, color, provider }, ...]
```

### 3.3 数据管理

#### 3.3.1 重新加载

```typescript
// 从缓存重新加载
await CalendarService.reload();

// 强制从服务同步
await CalendarService.reload(true);
```

#### 3.3.2 更新日历

```typescript
// 添加或更新日历
CalendarService.upsertCalendar({
  id: 'new-cal',
  name: '新日历',
  color: '#ff0000'
});

// 删除日历
CalendarService.removeCalendar('cal-id');
```

### 3.4 统计信息

```typescript
const stats = CalendarService.getStats();
// 返回:
// {
//   totalCalendars: 5,
//   byProvider: { outlook: 3, google: 2 },
//   totalGroups: 2
// }
```

---

## 四、工具函数

### 4.1 颜色工具 (calendarColorUtils.ts)

#### 4.1.1 Microsoft 颜色转换

```typescript
import { convertMicrosoftColorToHex } from '../utils/calendarColorUtils';

const hexColor = convertMicrosoftColorToHex('lightBlue');  // '#5194f0'
```

**支持的颜色：**
- `lightBlue` → `#5194f0`
- `lightGreen` → `#42b883`
- `lightOrange` → `#ff8c42`
- `lightGray` → `#9ca3af`
- `lightYellow` → `#f1c40f`
- `lightTeal` → `#48c9b0`
- `lightPink` → `#f48fb1`
- `lightBrown` → `#a0826d`
- `lightRed` → `#e74c3c`
- `maxColor` → `#6366f1`

#### 4.1.2 统一颜色获取

```typescript
import { getCalendarColor } from '../utils/calendarColorUtils';

const color = getCalendarColor(calendar);
```

**优先级：**
1. `color`（如果是 `#` 开头的十六进制）
2. `hexColor`
3. `backgroundColor`
4. `rawColor`（转换 Microsoft 颜色名称）
5. `provider` 默认颜色
6. `id` 哈希生成颜色
7. 默认蓝色 `#3b82f6`

#### 4.1.3 其他颜色工具

```typescript
// ID哈希生成颜色
const color = generateColorFromId('calendar-id');

// 提供商默认颜色
const color = getProviderColor('outlook');  // '#0078d4'

// 验证十六进制颜色
const isValid = isValidHexColor('#ff0000');  // true

// 获取颜色亮度
const brightness = getColorBrightness('#ff0000');  // 0-255

// 获取最佳文字颜色（黑或白）
const textColor = getTextColor('#ff0000');  // '#ffffff'
```

### 4.2 名称工具 (calendarNameUtils.ts)

#### 4.2.1 Emoji 处理

```typescript
import { removeLeadingEmoji, extractEmojiAndName } from '../utils/calendarNameUtils';

// 移除开头的 emoji
const cleanName = removeLeadingEmoji('📅 工作日历');  // '工作日历'

// 提取 emoji 和名称
const { emoji, name } = extractEmojiAndName('📅 工作日历');
// emoji: '📅', name: '工作日历'
```

#### 4.2.2 名称格式化

```typescript
import { 
  getCalendarDisplayName,
  splitCalendarName,
  getShortCalendarName,
  getCalendarNameWithProvider
} from '../utils/calendarNameUtils';

// 获取显示名称（清理emoji）
const displayName = getCalendarDisplayName(calendar);

// 分割名称（处理 "主名称: 子名称"）
const { mainName, subName } = splitCalendarName('Outlook: 工作日历');
// mainName: 'Outlook', subName: '工作日历'

// 获取简短名称
const shortName = getShortCalendarName(calendar, 8);  // 最多8个字符

// 带提供商前缀
const fullName = getCalendarNameWithProvider(calendar);
// 'Outlook: 工作日历'
```

#### 4.2.3 多日历显示

```typescript
import { formatMultiCalendarDisplay } from '../utils/calendarNameUtils';

// 格式化多个日历的显示
const display = formatMultiCalendarDisplay(calendars, 1);
// "工作日历 等3个"
```

---

## 五、UI 组件集成

### 5.1 CalendarPicker 组件

#### 使用示例

```typescript
import { CalendarPicker } from '../features/Calendar/components/CalendarPicker';

// 获取日历列表
const calendars = CalendarService.getCalendars();

<CalendarPicker
  availableCalendars={calendars}
  selectedCalendarIds={selectedIds}
  onSelectionChange={setSelectedIds}
  placeholder="选择日历..."
  maxSelection={5}
/>
```

#### 迁移指南

**之前：**
```typescript
// 组件内部获取日历
const [calendars, setCalendars] = useState([]);

useEffect(() => {
  const loadCalendars = async () => {
    if (microsoftService) {
      const cals = microsoftService.getCachedCalendars();
      setCalendars(cals.map(cal => ({
        id: cal.id,
        name: cal.name,
        color: convertMicrosoftColorToHex(cal.color)
      })));
    }
  };
  loadCalendars();
}, [microsoftService]);
```

**现在：**
```typescript
// 直接使用 CalendarService
const calendars = CalendarService.getCalendars();
```

### 5.2 SyncTargetPicker 组件

#### 使用示例

```typescript
<SyncTargetPicker
  startTime={event.startTime}
  endTime={event.endTime}
  selectedCalendarIds={calendarIds}
  selectedTodoListIds={todoListIds}
  onCalendarIdsChange={setCalendarIds}
  onTodoListIdsChange={setTodoListIds}
  // ✅ 不再需要传递 availableCalendars prop
  // ✅ 内部使用 CalendarService.getCalendars()
/>
```

### 5.3 ContentSelectionPanel 日历section（待实现）

```typescript
// ContentSelectionPanel.tsx

const CalendarSection = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 获取日历分组
  const groups = CalendarService.getCalendarGroups();
  const calendars = CalendarService.getCalendars();
  
  return (
    <div className="collapsible-section">
      <div className="section-header-simple" onClick={() => setIsExpanded(!isExpanded)}>
        <h3 className="section-title">日历选择</h3>
        <button className="panel-toggle-btn">
          <RightIcon />
        </button>
      </div>
      
      {isExpanded && (
        <div className="collapsible-content">
          {/* 多账户支持 */}
          {groups.length > 1 ? (
            // 显示标签页（Outlook/Google/iCloud）
            <CalendarGroupTabs groups={groups} />
          ) : (
            // 单账户直接显示日历列表
            <CalendarList calendars={calendars} />
          )}
        </div>
      )}
    </div>
  );
};
```

---

## 六、迁移指南

### 6.1 旧代码模式 → 新代码模式

#### 模式1: 直接从 localStorage 读取

**之前：**
```typescript
const calendarsCache = localStorage.getItem('4dnote-calendars-cache');
const calendars = calendarsCache ? JSON.parse(calendarsCache) : [];
const calendar = calendars.find(cal => cal.id === calendarId);
const color = convertMicrosoftColorToHex(calendar?.color) || '#3b82f6';
```

**现在：**
```typescript
const color = CalendarService.getColor(calendarId);
```

#### 模式2: 从 MicrosoftService 获取

**之前：**
```typescript
const calendars = microsoftService.getCachedCalendars();
const formatted = calendars.map(cal => ({
  id: cal.id,
  name: cal.name,
  color: convertMicrosoftColorToHex(cal.color)
}));
```

**现在：**
```typescript
const calendars = CalendarService.getCalendars();
// 已经规范化，直接使用
```

#### 模式3: Props 传递

**之前：**
```typescript
// 父组件
<ChildComponent availableCalendars={calendars} />

// 子组件
interface Props {
  availableCalendars: Calendar[];
}
```

**现在：**
```typescript
// 子组件直接使用
const calendars = CalendarService.getCalendars();
// 不需要 props
```

### 6.2 颜色处理迁移

**之前：**
```typescript
// 重复的颜色映射表
const colorMap = {
  'lightBlue': '#5194f0',
  'lightGreen': '#42b883',
  // ...
};
const hexColor = colorMap[colorName] || '#3b82f6';
```

**现在：**
```typescript
import { convertMicrosoftColorToHex } from '../utils/calendarColorUtils';
const hexColor = convertMicrosoftColorToHex(colorName);
```

### 6.3 名称处理迁移

**之前：**
```typescript
// 重复的 emoji 清理
const cleanName = calendar.name.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF]+\s*/, '');
```

**现在：**
```typescript
import { removeLeadingEmoji } from '../utils/calendarNameUtils';
const cleanName = removeLeadingEmoji(calendar.name);

// 或者直接使用
const displayName = CalendarService.getDisplayName(calendarId);
```

### 6.4 向后兼容

为保持向后兼容，`calendarUtils.ts` 中保留了 deprecated 函数：

```typescript
/**
 * @deprecated 使用 CalendarService.getColor() 代替
 */
export function getCalendarGroupColor(calendarId: string): string | null {
  return CalendarService.getColor(calendarId);
}

/**
 * @deprecated 使用 CalendarService.getCalendars(true) 代替
 */
export function getAvailableCalendarsForSettings(): Array<{ id: string; name: string; color: string }> {
  const calendars = CalendarService.getCalendars(true);
  return calendars.map(cal => ({ id: cal.id, name: cal.name, color: cal.color }));
}
```

---

## 七、扩展性设计

### 7.1 多账户支持

CalendarService 设计时已考虑多账户场景：

```typescript
// 按提供商获取日历
const outlookCalendars = CalendarService.getCalendarsByProvider('outlook');
const googleCalendars = CalendarService.getCalendarsByProvider('google');
const icloudCalendars = CalendarService.getCalendarsByProvider('icloud');

// 获取所有分组
const groups = CalendarService.getCalendarGroups();
// [
//   { id: 'group-1', name: 'Outlook', provider: 'outlook', calendars: [...] },
//   { id: 'group-2', name: 'Google', provider: 'google', calendars: [...] },
//   { id: 'group-3', name: 'iCloud', provider: 'icloud', calendars: [...] }
// ]
```

### 7.2 新提供商集成

添加新的日历提供商只需：

1. 在类型定义中添加：
```typescript
export type CalendarProvider = 'outlook' | 'google' | 'icloud' | 'apple' | 'local';
```

2. 在 `CalendarService.syncFromServices()` 中添加同步逻辑：
```typescript
// Google Calendar Service
if (this.googleService && typeof this.googleService.getCachedCalendars === 'function') {
  const googleCalendars = this.googleService.getCachedCalendars();
  googleCalendars.forEach((cal: any) => {
    const normalized = this.normalizeCalendar({ ...cal, provider: 'google' });
    this.calendars.set(normalized.id, normalized);
  });
}
```

3. 在 `calendarColorUtils.ts` 中添加默认颜色：
```typescript
const PROVIDER_COLORS: Record<string, string> = {
  'outlook': '#0078d4',
  'google': '#ea4335',
  'icloud': '#007aff',
  'apple': '#000000',  // 新增
  'local': '#7b1fa2'
};
```

### 7.3 自定义字段扩展

Calendar 接口支持任意扩展：

```typescript
export interface Calendar {
  // ... 现有字段
  
  /** 自定义字段（用户备注、标签等） */
  metadata?: Record<string, any>;
}

// 使用示例
CalendarService.upsertCalendar({
  id: 'cal-1',
  name: '工作日历',
  metadata: {
    tags: ['重要', '工作'],
    notes: '仅用于工作相关事件',
    customColor: '#ff0000'
  }
});
```

---

## 八、性能优化

### 8.1 缓存策略

1. **内存缓存**：所有日历数据存储在 `Map<id, Calendar>` 中，O(1) 查询
2. **localStorage 持久化**：应用重启后快速恢复
3. **按需同步**：仅在缓存为空时从服务同步

### 8.2 批量操作

```typescript
// 批量获取信息（单次遍历）
const infos = CalendarService.getBatchInfo(['cal-1', 'cal-2', 'cal-3']);

// 而不是
const info1 = CalendarService.getCalendar('cal-1');
const info2 = CalendarService.getCalendar('cal-2');
const info3 = CalendarService.getCalendar('cal-3');
```

### 8.3 懒加载

ContentSelectionPanel 中的日历 section 默认折叠，仅在展开时加载：

```typescript
const [isExpanded, setIsExpanded] = useState(false);

useEffect(() => {
  if (isExpanded) {
    // 展开时才加载日历
    const calendars = CalendarService.getCalendars();
    setCalendars(calendars);
  }
}, [isExpanded]);
```

---

## 九、测试用例

### 9.1 单元测试

```typescript
describe('CalendarService', () => {
  beforeEach(async () => {
    await CalendarService.initialize();
  });

  test('应该正确初始化', () => {
    expect(CalendarService.getCalendars()).toBeDefined();
  });

  test('应该返回正确的颜色', () => {
    const color = CalendarService.getColor('test-calendar');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('应该正确搜索日历', () => {
    const results = CalendarService.searchCalendars('工作');
    expect(results.every(cal => cal.name.includes('工作'))).toBe(true);
  });

  test('应该包含特殊日历', () => {
    const calendars = CalendarService.getCalendars(true);
    expect(calendars.some(cal => cal.id === 'local-created')).toBe(true);
    expect(calendars.some(cal => cal.id === 'not-synced')).toBe(true);
  });
});
```

### 9.2 集成测试

```typescript
describe('CalendarService Integration', () => {
  test('应该与 MicrosoftCalendarService 同步', async () => {
    const mockMsService = {
      getCachedCalendars: () => [
        { id: 'cal-1', name: '工作', color: 'lightBlue' }
      ]
    };

    await CalendarService.initialize(mockMsService);
    const calendar = CalendarService.getCalendar('cal-1');
    
    expect(calendar?.name).toBe('工作');
    expect(calendar?.color).toBe('#5194f0');
    expect(calendar?.provider).toBe('outlook');
  });
});
```

### 9.3 性能测试

```typescript
describe('CalendarService Performance', () => {
  test('批量查询应该快于单次查询', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `cal-${i}`);
    
    // 批量查询
    const start1 = performance.now();
    CalendarService.getBatchInfo(ids);
    const batch = performance.now() - start1;
    
    // 单次查询
    const start2 = performance.now();
    ids.forEach(id => CalendarService.getCalendar(id));
    const individual = performance.now() - start2;
    
    expect(batch).toBeLessThan(individual);
  });
});
```

---

## 十、后续规划

### 10.1 近期计划（v2.1）

- [ ] **ContentSelectionPanel 集成**
  - 实现日历选择 section
  - 支持多账户标签页切换
  - 参考收藏事件 section 的样式

- [ ] **CalendarListItem 组件**
  - 统一的日历列表项渲染
  - 支持显示/隐藏切换
  - 支持拖拽排序

### 10.2 中期计划（v2.2-v2.3）

- [ ] **Google Calendar 集成**
  - 实现 GoogleCalendarService
  - 集成到 CalendarService

- [ ] **iCloud Calendar 集成**
  - 实现 iCloudCalendarService
  - 集成到 CalendarService

- [ ] **日历筛选和排序**
  - 支持按颜色、提供商筛选
  - 支持自定义排序规则

### 10.3 长期计划（v3.0+）

- [ ] **日历订阅功能**
  - 支持订阅外部日历（ICS URL）
  - 定时同步订阅内容

- [ ] **日历分享**
  - 分享日历给其他用户
  - 权限管理（只读/编辑）

- [ ] **智能建议**
  - 根据历史习惯推荐日历
  - 自动分类事件到合适的日历

---

## 十一、FAQ

### Q1: 为什么要重构 CalendarService？

**A:** 旧版本存在严重的架构问题：
- 数据获取方式混乱（3种不同方式）
- 工具函数重复（颜色转换4处重复，emoji清理6处重复）
- 接口定义不统一（3个版本）
- 难以维护和扩展

### Q2: 重构后如何保持向后兼容？

**A:** 
- `calendarUtils.ts` 中保留了 deprecated 函数
- 旧代码可以继续工作，但会显示弃用警告
- 建议逐步迁移到新 API

### Q3: 如何添加新的日历提供商？

**A:** 参考 [7.2 新提供商集成](#72-新提供商集成) 章节，只需：
1. 更新类型定义
2. 添加同步逻辑
3. 添加默认颜色

### Q4: CalendarService 与 MicrosoftCalendarService 的关系？

**A:**
- `MicrosoftCalendarService`：负责与 Microsoft Graph API 通信，获取原始数据
- `CalendarService`：数据管理层，统一处理所有提供商的日历数据
- 关系：CalendarService 消费 MicrosoftCalendarService 的数据，并规范化

### Q5: 为什么使用 Map 而不是数组？

**A:** Map 提供 O(1) 的查询性能，而数组需要 O(n)。对于频繁的 `getCalendar(id)` 操作，Map 更高效。

---

## 十二、参考文档

### 相关 PRD
- [MicrosoftCalendarService PRD](./MICROSOFTCALENDARSERVICE_PRD.md)
- [EventService PRD](./EVENTSERVICE_MODULE_PRD.md)
- [ActionBasedSyncManager PRD](./ACTIONBASEDSYNCMANAGER_PRD.md)
- [ContactService PRD](./CONTACTSERVICE_PRD.md)

### 技术文档
- [日历同步架构](../architecture/CALENDAR_SYNC_ARCHITECTURE.md)
- [存储管理](../architecture/STORAGE_ARCHITECTURE.md)

### API 文档
- [CalendarService API](../api/CalendarService.md)（待创建）
- [Calendar Utils API](../api/CalendarUtils.md)（待创建）

---

## 变更记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v2.0.0 | 2025-12-19 | System | ✅ 完成重构，创建 PRD 文档 |
| v1.0.0 | 2024-xx-xx | System | 初始版本（已废弃） |

---

**审批流程**
- [x] 架构设计评审
- [x] 代码实现完成
- [x] 单元测试通过
- [x] 文档编写完成
- [ ] 产品验收
- [ ] 发布上线

**负责人签名**
- 架构师：System ✅
- 开发：System ✅
- 测试：待指定
- 产品：待指定
