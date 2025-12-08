# EditableEventTree 单一编辑器重构计划

**当前状态**: 每个节点独立 Slate 编辑器  
**目标**: 单一 Slate 编辑器 + 自定义树节点类型  
**参考**: PlanSlate `event-line` 架构

---

## 🎯 问题

### 当前架构限制
```tsx
// ❌ 每个节点独立编辑器
const TreeNodeItem = ({ node }) => {
  const [editor] = useState(() => withReact(createEditor()));
  
  return (
    <Slate editor={editor}>
      <Editable />
    </Slate>
  );
};
```

**缺陷**:
1. ❌ **无法跨行选择**: 每个编辑器隔离，无法选择多个节点
2. ❌ **性能问题**: N 个节点 = N 个编辑器实例
3. ❌ **复制粘贴受限**: 无法跨节点复制
4. ❌ **撤销/重做隔离**: 每个节点独立历史记录

---

## ✅ 目标架构

### 单一编辑器 + 自定义节点类型
```tsx
// ✅ 单一编辑器包含所有节点
const EditableEventTree = ({ rootEventId }) => {
  const [editor] = useState(() => 
    withTreeNodes(withReact(withHistory(createEditor())))
  );
  
  // Slate value 结构
  const initialValue = [
    {
      type: 'tree-node',
      level: 0,
      isOpen: true,
      eventId: 'event_123',
      children: [{ text: '一级标题' }]
    },
    {
      type: 'tree-node',
      level: 1,
      isOpen: true,
      eventId: 'event_456',
      parentId: 'event_123',
      children: [{ text: '二级标题' }]
    },
    // ...
  ];
  
  return (
    <Slate editor={editor} initialValue={initialValue}>
      <Editable renderElement={renderTreeNode} />
    </Slate>
  );
};
```

---

## 📐 数据结构

### TreeNode 元素类型
```typescript
interface TreeNodeElement extends BaseElement {
  type: 'tree-node';
  eventId: string;
  parentEventId?: string;
  childEventIds?: string[];
  level: number;           // 视觉缩进层级（0, 1, 2...）
  isOpen: boolean;         // 折叠状态
  linkedEventIds?: string[];
  children: Descendant[];  // Slate 子节点（text）
}
```

### Editor Value 示例
```json
[
  {
    "type": "tree-node",
    "eventId": "event_-AVODUf_KGqeYDMqdfOcq",
    "level": 0,
    "isOpen": true,
    "childEventIds": ["event_ZcBwJJQmrzgyC_m4k8tka"],
    "children": [{ "text": "一级标题" }]
  },
  {
    "type": "tree-node",
    "eventId": "event_ZcBwJJQmrzgyC_m4k8tka",
    "parentEventId": "event_-AVODUf_KGqeYDMqdfOcq",
    "level": 1,
    "isOpen": true,
    "childEventIds": ["event_x6E_vZMchCaSaRDOdQ7vz"],
    "children": [{ "text": "二级标题" }]
  },
  {
    "type": "tree-node",
    "eventId": "event_x6E_vZMchCaSaRDOdQ7vz",
    "parentEventId": "event_ZcBwJJQmrzgyC_m4k8tka",
    "level": 2,
    "isOpen": true,
    "children": [{ "text": "三级标题" }]
  }
]
```

---

## 🎨 renderElement 实现

```tsx
const renderTreeNode = (props: RenderElementProps) => {
  const { attributes, children, element } = props;
  
  if (element.type === 'tree-node') {
    const node = element as TreeNodeElement;
    const hasChildren = node.childEventIds && node.childEventIds.length > 0;
    
    return (
      <div
        {...attributes}
        className="tree-node"
        style={{
          paddingLeft: `${node.level * 24}px`, // 缩进
        }}
      >
        {/* L 型连接线 */}
        {node.level > 0 && (
          <>
            <div className="tree-line" />
            <div className="tree-connector" />
          </>
        )}
        
        <div className="tree-content">
          {/* 折叠/展开按钮 */}
          <button
            contentEditable={false}
            onClick={() => toggleNode(node.eventId)}
          >
            {hasChildren ? (
              node.isOpen ? <ChevronDown /> : <ChevronRight />
            ) : (
              <Circle />
            )}
          </button>
          
          {/* 可编辑标题 */}
          <div className="tree-title">
            {children}
          </div>
          
          {/* Link 按钮 */}
          {node.linkedEventIds && node.linkedEventIds.length > 0 && (
            <Tippy content={<LinkedCardsStack eventIds={node.linkedEventIds} />}>
              <button contentEditable={false}>
                <LinkIcon />
                <span>{node.linkedEventIds.length}</span>
              </button>
            </Tippy>
          )}
        </div>
      </div>
    );
  }
  
  return <DefaultElement {...props} />;
};
```

---

## 🔧 自定义插件

### withTreeNodes 插件
```typescript
const withTreeNodes = (editor: Editor) => {
  const { deleteBackward, insertBreak } = editor;
  
  // Tab 键调整层级
  editor.onKeyDown = (event) => {
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      increaseLevel();
    }
    
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      decreaseLevel();
    }
  };
  
  // Enter 创建新节点
  editor.insertBreak = () => {
    const [node, path] = Editor.above(editor, {
      match: n => n.type === 'tree-node'
    }) || [];
    
    if (node) {
      const newNode: TreeNodeElement = {
        type: 'tree-node',
        eventId: `line-${Date.now()}`,
        level: node.level,
        isOpen: true,
        children: [{ text: '' }],
      };
      
      Transforms.insertNodes(editor, newNode);
    } else {
      insertBreak();
    }
  };
  
  // 折叠节点时隐藏子节点
  editor.toggleNode = (eventId: string) => {
    const [node, path] = Editor.above(editor, {
      match: n => n.eventId === eventId
    }) || [];
    
    if (node) {
      Transforms.setNodes(editor, { isOpen: !node.isOpen }, { at: path });
      
      // 隐藏子节点（通过 CSS display: none）
      // 或者删除子节点（从 Slate value 中移除）
    }
  };
  
  return editor;
};
```

---

## 📊 对比

| 特性 | 当前架构（多编辑器） | 目标架构（单编辑器） |
|------|---------------------|---------------------|
| 跨行选择 | ❌ 无法选择 | ✅ 完全支持 |
| 性能 | ❌ N 个实例 | ✅ 单一实例 |
| 复制粘贴 | ❌ 单节点 | ✅ 跨节点 |
| 撤销/重做 | ❌ 隔离 | ✅ 全局 |
| Tab 缩进 | ✅ 支持 | ✅ 支持 |
| Link 卡片 | ✅ Tippy | ✅ Tippy |
| 折叠/展开 | ✅ 支持 | ✅ 支持 |

---

## 🚀 实施步骤

### Phase 1: 数据结构转换
1. ✅ 定义 `TreeNodeElement` 接口
2. ✅ 实现 `buildSlateValue()` 从 EventTree 构建 Slate value
3. ✅ 实现 `parseSlateValue()` 从 Slate value 解析事件

### Phase 2: 渲染函数
1. ✅ 实现 `renderTreeNode()` 渲染函数
2. ✅ 处理 L 型连接线样式
3. ✅ 折叠/展开按钮逻辑
4. ✅ Link 按钮 + Tippy

### Phase 3: 编辑器插件
1. ✅ `withTreeNodes` 插件
2. ✅ Tab/Shift+Tab 调整 level
3. ✅ Enter 创建新节点
4. ✅ 折叠节点隐藏子节点

### Phase 4: 同步逻辑
1. ✅ onChange 序列化并保存到 EventService
2. ✅ 乐观更新 level → 异步保存 parentEventId
3. ✅ 刷新后从数据库重建 Slate value

---

## 📝 参考代码

- **PlanSlate**: `src/components/PlanSlate/PlanSlate.tsx` (event-line 实现)
- **serialization**: `src/utils/serialization.ts` (Slate ↔ Event 转换)
- **withEventLine**: PlanSlate 自定义插件逻辑

---

**预计工作量**: 2-3 天  
**优先级**: 中（体验优化）  
**版本**: v2.19
