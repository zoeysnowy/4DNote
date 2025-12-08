# 🧪 快速开始 - 数据流测试

## 一键测试

### 方法 1: 浏览器测试页面（最简单）

1. **启动应用**
   ```bash
   npm run dev
   ```

2. **打开测试页面**
   ```
   http://localhost:5173/test-data-flow.html
   ```

3. **点击「开始测试」按钮**

4. **查看结果**
   - 实时显示测试输出
   - 通过率统计
   - 失败项详情

---

### 方法 2: 控制台测试（开发者）

1. **启动应用并打开 DevTools**
   ```bash
   npm run dev
   # 按 F12 打开 DevTools
   ```

2. **加载测试脚本**
   ```javascript
   // 在 Console 中执行
   const script = document.createElement('script');
   script.src = '/scripts/test-data-flow-complete.js';
   document.head.appendChild(script);
   ```

3. **运行测试**
   ```javascript
   // 等待脚本加载完成后执行
   await window.testDataFlow()
   ```

---

### 方法 3: Electron 测试（完整功能）

1. **启动 Electron 应用**
   ```bash
   npm run electron-dev
   ```

2. **打开 DevTools**
   - 快捷键: `Ctrl+Shift+I` (Windows)
   - 或菜单: View → Toggle Developer Tools

3. **运行测试**
   ```javascript
   await window.testDataFlow()
   ```

   **Electron 额外测试**: 会验证 SQLite 存储功能

---

## 测试覆盖范围

✅ **10 个测试套件，31 个测试用例**

| 模块 | 测试数 |
|------|--------|
| 存储架构 | 6 |
| EventService Hub | 4 |
| EventHub | 3 |
| TimeHub | 2 |
| ContactService | 4 |
| TagService | 3 |
| EventTree | 3 |
| 双向链接 | 2 |
| 跨模块联动 | 2 |
| 性能测试 | 2 |

---

## 预期测试时间

- ⚡ **30-60 秒** （包含 50 个事件的批量操作）

---

## 测试数据

- 📊 **创建**: 约 60 个临时测试事件
- 🧹 **清理**: 测试完成后自动删除（软删除）
- 💾 **存储**: IndexedDB（浏览器）+ SQLite（Electron）

---

## 成功标准

```
📊 测试统计：
   总计：31 个测试
   通过：31 个 ✅
   失败：0 个 ❌
   通过率：100.00%

🎉 所有测试通过！
```

---

## 故障排除

### 问题 1: "测试脚本未加载"
**解决**: 刷新页面或手动加载脚本

### 问题 2: "EventService is not defined"
**解决**: 确保应用已完全启动（等待 5 秒）

### 问题 3: "SQLite 读取失败"
**解决**: 正常现象，仅在 Electron 中测试 SQLite

---

## 详细文档

📖 完整文档: [TEST_DATA_FLOW_GUIDE.md](./docs/TEST_DATA_FLOW_GUIDE.md)

---

**快速帮助**: 有问题？请查看 [故障排除部分](./docs/TEST_DATA_FLOW_GUIDE.md#故障排除)
