#!/usr/bin/env node
/**
 * Git Hooks 安装脚本
 * 
 * 安装pre-commit hook以自动检查SSOT规范
 * 
 * @created 2026-01-09
 */

const fs = require('fs');
const path = require('path');

const hookSource = path.join(__dirname, 'git-hooks', 'pre-commit');
const hookTarget = path.join(__dirname, '..', '.git', 'hooks', 'pre-commit');

try {
  // 检查.git目录是否存在
  if (!fs.existsSync(path.join(__dirname, '..', '.git'))) {
    console.error('❌ 错误：找不到.git目录');
    process.exit(1);
  }
  
  // 复制hook文件
  fs.copyFileSync(hookSource, hookTarget);
  
  // 设置可执行权限（Unix系统）
  if (process.platform !== 'win32') {
    fs.chmodSync(hookTarget, '755');
  }
  
  console.log('✅ Git pre-commit hook安装成功！');
  console.log('📍 位置：', hookTarget);
  console.log('\n现在每次提交前都会自动检查SSOT规范。');
  console.log('如需跳过检查，使用：git commit --no-verify');
} catch (error) {
  console.error('❌ 安装失败：', error.message);
  process.exit(1);
}
