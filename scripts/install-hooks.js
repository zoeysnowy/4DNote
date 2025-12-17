#!/usr/bin/env node
/**
 * 安装 Git Hooks
 */

const fs = require('fs');
const path = require('path');

const hookSource = path.join(__dirname, 'pre-commit');
const hookTarget = path.join(__dirname, '..', '.git', 'hooks', 'pre-commit');

try {
  // 检查 .git 目录是否存在
  const gitDir = path.join(__dirname, '..', '.git');
  if (!fs.existsSync(gitDir)) {
    console.error('❌ 错误：未找到 .git 目录。请确保在 Git 仓库中运行此脚本。');
    process.exit(1);
  }

  // 复制 pre-commit hook
  fs.copyFileSync(hookSource, hookTarget);
  
  // 在 Windows 上，Node.js 会忽略文件权限，但我们仍然可以尝试设置
  if (process.platform !== 'win32') {
    fs.chmodSync(hookTarget, 0o755);
  }
  
  console.log('✅ Git pre-commit hook 安装成功！');
  console.log('');
  console.log('现在每次提交前都会自动检查 TimeSpec 规范。');
  console.log('');
  console.log('如需手动检查，运行：npm run check-timespec');
  
} catch (error) {
  console.error('❌ 安装失败：', error.message);
  process.exit(1);
}
