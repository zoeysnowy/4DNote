#!/usr/bin/env node
/**
 * TimeSpec 规则验证脚本
 * 
 * 检查代码库中是否存在违反 TimeSpec 规范的代码
 */

const fs = require('fs');
const path = require('path');

const VIOLATIONS = [
  {
    pattern: /\.toISOString\(\)/g,
    name: 'toISOString()',
    severity: 'ERROR',
    message: '禁止使用 toISOString()！请使用 formatTimeForStorage()'
  },
  {
    pattern: /\.toISOString\(\)\.replace\(['"]T['"]/g,
    name: 'toISOString().replace(T)',
    severity: 'ERROR',
    message: '禁止手动转换 ISO 格式！请使用 formatTimeForStorage()'
  },
  {
    pattern: /new Date\([^)]*\)\.toISOString\(\)/g,
    name: 'new Date().toISOString()',
    severity: 'ERROR',
    message: '禁止使用 new Date().toISOString()！'
  }
];

const EXCLUDE_PATTERNS = [
  /node_modules/,
  /build/,
  /dist/,
  /\.git/,
  /timeUtils\.ts$/,  // 允许在工具函数中使用
  /\.test\.(ts|tsx)$/,  // 允许在测试文件中使用
  /debug.*\.ts$/,  // 允许在调试文件中使用
  /performance.*\.ts$/  // 允许在性能文件中使用
];

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  
  VIOLATIONS.forEach(({ pattern, name, severity, message }) => {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const lines = content.substring(0, match.index).split('\n');
      const lineNumber = lines.length;
      const lineContent = lines[lines.length - 1] + content.substring(match.index).split('\n')[0];
      
      violations.push({
        file: filePath,
        line: lineNumber,
        column: lines[lines.length - 1].length + 1,
        severity,
        rule: name,
        message,
        code: lineContent.trim()
      });
    }
  });
  
  return violations;
}

function scanDirectory(dir, violations = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (shouldExclude(filePath)) {
      return;
    }
    
    if (stat.isDirectory()) {
      scanDirectory(filePath, violations);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      const fileViolations = scanFile(filePath);
      violations.push(...fileViolations);
    }
  });
  
  return violations;
}

// 主函数
function main() {
  console.log('🔍 扫描 TimeSpec 规范违规...\n');
  
  const srcDir = path.join(__dirname, '..', 'src');
  const violations = scanDirectory(srcDir);
  
  if (violations.length === 0) {
    console.log('✅ 未发现违规！代码符合 TimeSpec 规范。\n');
    return;
  }
  
  console.log(`❌ 发现 ${violations.length} 处违规：\n`);
  
  // 按文件分组
  const byFile = {};
  violations.forEach(v => {
    if (!byFile[v.file]) {
      byFile[v.file] = [];
    }
    byFile[v.file].push(v);
  });
  
  // 输出
  Object.keys(byFile).sort().forEach(file => {
    const relPath = path.relative(process.cwd(), file);
    console.log(`\n📄 ${relPath}`);
    
    byFile[file].forEach(v => {
      console.log(`  Line ${v.line}:${v.column} - ${v.severity}: ${v.message}`);
      console.log(`    ${v.code}`);
    });
  });
  
  console.log(`\n\n💡 提示：运行 'npm run lint' 查看详细的 ESLint 错误。`);
  console.log(`📖 参考文档：docs/TimeSpec.md\n`);
  
  process.exit(1);
}

main();
