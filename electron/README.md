# 4DNote Desktop Application

基于Electron的4DNote桌面应用版本，提供原生桌面体验和系统级监听功能。

## 🚀 快速开始

### 开发环境

1. **安装依赖**
   ```bash
   cd electron
   npm install
   ```

2. **启动开发环境**
   ```bash
   # 方法1: 使用npm脚本
   npm run electron-dev
   
   # 方法2: 使用批处理文件 (Windows)
   start-dev.bat
   ```

3. **单独启动Web和Electron**
   ```bash
   # 终端1: 启动React开发服务器
   cd .. && npm start
   
   # 终端2: 等Web服务启动后，启动Electron
   cd electron && npm run electron
   ```

### 生产构建

1. **构建应用**
   ```bash
   npm run dist
   ```

2. **平台特定构建**
   ```bash
   npm run dist:win    # Windows
   npm run dist:mac    # macOS
   npm run dist:linux  # Linux
   ```

## 📁 项目结构

```
electron/
├── main.js           # Electron主进程
├── preload.js        # 预加载脚本
├── package.json      # Electron配置
├── assets/           # 应用资源
│   ├── icon.png      # 应用图标
│   ├── icon.ico      # Windows图标
│   └── icon.icns     # macOS图标
└── dist/             # 构建输出
```

## ✨ 桌面应用特性

### 🔧 已实现功能

- **原生窗口管理**: 最小化、最大化、关闭
- **系统通知**: 原生桌面通知
- **文件操作**: 导入/导出数据文件
- **菜单栏**: 原生应用菜单
- **快捷键支持**: 
  - `Ctrl+S`: 立即同步
  - `F12`: 开发者工具
  - `F11`: 全屏模式

### 🚧 计划中功能

- **系统监听**: Windows程序活动监听
- **Chrome扩展通信**: 网页活动数据收集
- **地理位置**: 自动位置记录
- **自动启动**: 开机自启动选项
- **系统托盘**: 最小化到系统托盘

## 🔗 API接口

### ElectronService

应用提供了`ElectronService`类来处理桌面应用特有功能：

```typescript
import { electronService } from './services/ElectronService';

// 检查是否为Electron环境
if (electronService.isElectron) {
  // 显示通知
  await electronService.showNotification('标题', '内容');
  
  // 导出数据
  await electronService.exportData(data, 'filename.json');
  
  // 启动系统监听
  await electronService.startSystemMonitoring();
}
```

### 全局API

在开发者控制台中可用的调试API：

```javascript
// Electron服务
window.electronAPI           // Electron API
window.electronService      // ElectronService实例

// 现有的服务
window.microsoftCalendarService
window.actionBasedSyncManager
window.FourDNoteCache
```

## 🔧 开发指南

### 添加新的IPC事件

1. **在main.js中添加处理器**
   ```javascript
   ipcMain.handle('new-feature', async (event, data) => {
     // 处理逻辑
     return result;
   });
   ```

2. **在preload.js中暴露API**
   ```javascript
   contextBridge.exposeInMainWorld('electronAPI', {
     newFeature: (data) => ipcRenderer.invoke('new-feature', data)
   });
   ```

3. **在ElectronService中使用**
   ```typescript
   async newFeature(data: any) {
     if (!this.isElectronEnv) return null;
     return await window.electronAPI.newFeature(data);
   }
   ```

### 添加系统监听功能

1. **安装依赖包**
   ```bash
   npm install active-win  # 获取活动窗口
   npm install @nut-tree/nut-js  # 系统自动化
   ```

2. **在main.js中实现监听逻辑**
3. **通过IPC向渲染进程发送数据**

## 📦 打包配置

应用使用`electron-builder`进行打包，配置在`package.json`的`build`字段中：

- **Windows**: NSIS安装程序 + 便携版
- **macOS**: DMG磁盘映像
- **Linux**: AppImage + DEB包

### 自定义打包

修改`package.json`中的`build`配置：

```json
{
  "build": {
    "appId": "com.4dnote.desktop",
    "productName": "4DNote",
    "directories": {
      "output": "dist"
    }
  }
}
```

## 🐛 常见问题

### 开发环境问题

**问题**: Electron窗口显示空白
**解决**: 确保React开发服务器在`http://localhost:3000`运行

**问题**: 热重载不工作
**解决**: 使用`npm run electron-dev`而不是单独启动

### 构建问题

**问题**: 打包失败
**解决**: 检查所有依赖是否安装，运行`npm run build:web`确保React应用构建成功

**问题**: 图标不显示
**解决**: 确保`assets/`目录下有正确格式的图标文件

## 📝 待办事项

- [ ] 添加系统程序监听功能
- [ ] 实现Chrome扩展通信
- [ ] 添加地理位置服务
- [ ] 实现系统托盘功能
- [ ] 添加自动更新机制
- [ ] 优化应用性能
- [ ] 添加更多快捷键
- [ ] 实现数据加密存储

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个桌面应用！