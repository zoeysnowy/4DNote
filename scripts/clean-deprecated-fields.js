/**
 * Deprecated字段清理工具
 * 
 * 自动扫描并替换代码中使用deprecated字段的地方
 * 
 * 使用方法：
 *   node scripts/clean-deprecated-fields.js [--dry-run] [--fix]
 * 
 * @created 2026-01-09
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ts = require('typescript');

const DRY_RUN = process.argv.includes('--dry-run');
const AUTO_FIX = process.argv.includes('--fix');

// Type-aware规则：只针对 Event 类型的 deprecated 字段（避免误伤 item.content/node.content 等）
const EVENT_FIELD_REPLACEMENTS = [
  {
    field: 'isTask',
    replacement: obj => `hasTaskFacet(${obj})`,
    requireImport: "import { hasTaskFacet } from '@frontend/utils/eventFacets';",
    description: 'event.isTask → hasTaskFacet(event)',
  },
  {
    field: 'isPlan',
    replacement: obj => `shouldShowInPlan(${obj})`,
    requireImport: "import { shouldShowInPlan } from '@frontend/utils/eventFacets';",
    description: 'event.isPlan → shouldShowInPlan(event)',
  },
  {
    field: 'isTimeCalendar',
    replacement: obj => `shouldShowInTimeCalendar(${obj})`,
    requireImport: "import { shouldShowInTimeCalendar } from '@frontend/utils/eventFacets';",
    description: 'event.isTimeCalendar → shouldShowInTimeCalendar(event)',
  },
  {
    field: 'content',
    replacement: obj => `resolveDisplayTitle(${obj})`,
    requireImport: "import { resolveDisplayTitle } from '@frontend/utils/TitleResolver';",
    description: 'event.content (read) → resolveDisplayTitle(event)',
  },
  {
    field: 'isTimer',
    replacement: obj => `${obj}.id.startsWith('timer-')`,
    description: 'event.isTimer → event.id.startsWith("timer-")',
  },
  {
    field: 'isTimeLog',
    replacement: obj => `${obj}.source === 'local:timelog'`,
    description: 'event.isTimeLog → event.source === "local:timelog"',
  },
  {
    field: 'isOutsideApp',
    replacement: obj => `${obj}.source === 'local:timelog'`,
    description: 'event.isOutsideApp → event.source === "local:timelog"',
  },
];

const DATE_TO_ISO_REPLACEMENT = {
  requireImport: "import { formatTimeForStorage } from '@frontend/utils/timeUtils';",
  description: 'date.toISOString() → formatTimeForStorage(date)',
};

// 扫描的文件模式
const SCAN_PATTERNS = [
  'src/**/*.ts',
  'src/**/*.tsx',
  '!src/**/*.test.ts',
  '!src/**/*.test.tsx',
  '!src/__tests__/**',
  // vendored third-party sources: do not enforce SSOT here
  '!src/lib/tui.calendar/**',
];

// 获取所有需要扫描的文件
function getFilesToScan() {
  const files = [];
  
  for (const pattern of SCAN_PATTERNS) {
    if (pattern.startsWith('!')) continue;
    
    try {
      const result = execSync(`git ls-files "${pattern}"`, { encoding: 'utf-8' });
      files.push(...result.trim().split('\n').filter(Boolean));
    } catch (error) {
      // 忽略错误
    }
  }
  
  // 过滤排除模式
  const excludePatterns = SCAN_PATTERNS.filter(p => p.startsWith('!')).map(p => p.slice(1));
  
  return files.filter(file => {
    return !excludePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(file);
    });
  });
}

function getTsConfigOptions() {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    return { options: { allowJs: true, checkJs: false } };
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return { options: { allowJs: true, checkJs: false } };
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
  return { options: parsed.options };
}

function isAssignmentToProperty(node) {
  const parent = node.parent;
  if (!parent) return false;

  if (ts.isBinaryExpression(parent) && parent.left === node) {
    const op = parent.operatorToken.kind;
    // =, +=, -=, ...
    return op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment;
  }

  if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) {
    // ++obj.prop / obj.prop++
    return true;
  }

  if (ts.isDeleteExpression(parent)) {
    return true;
  }

  return false;
}

function isEventType(type, checker) {
  const seen = new Set();
  const queue = [type];

  while (queue.length > 0) {
    const t = queue.pop();
    if (!t || seen.has(t)) continue;
    seen.add(t);

    if (t.isUnion()) {
      queue.push(...t.types);
      continue;
    }

    if (t.isIntersection()) {
      queue.push(...t.types);
      continue;
    }

    const symbol = t.getSymbol();
    if (symbol && symbol.getName && symbol.getName() === 'Event') {
      return true;
    }

    // Sometimes the type is an alias; check alias symbol too.
    const aliasSymbol = t.aliasSymbol;
    if (aliasSymbol && aliasSymbol.getName && aliasSymbol.getName() === 'Event') {
      return true;
    }

    // Fallback heuristic: structural check for core Event fields.
    // Keep this conservative to avoid misclassifying other domain models (e.g. AI Fact).
    const idProp = t.getProperty && t.getProperty('id');
    const sourceProp = t.getProperty && t.getProperty('source');
    const titleProp = t.getProperty && t.getProperty('title');
    if (idProp && sourceProp && titleProp) {
      // Ensure at least one of the deprecated fields exists on this type.
      const hasAnyDeprecated = EVENT_FIELD_REPLACEMENTS.some(r => t.getProperty && t.getProperty(r.field));
      if (hasAnyDeprecated) return true;
    }

    // Walk base types
    if (t.getBaseTypes) {
      const bases = t.getBaseTypes() || [];
      queue.push(...bases);
    }
  }

  return false;
}

function isDateType(type, checker) {
  if (!type) return false;
  if (type.isUnion()) return type.types.some(t => isDateType(t, checker));
  const symbol = type.getSymbol && type.getSymbol();
  if (symbol && symbol.getName && symbol.getName() === 'Date') return true;
  // Sometimes it's the global Date interface but unnamed; rely on toString.
  try {
    const text = checker.typeToString(type);
    return text === 'Date';
  } catch {
    return false;
  }
}

// 添加import语句
function addImport(content, importStatement) {
  // 检查是否已存在
  if (content.includes(importStatement)) {
    return content;
  }
  
  // 找到最后一个import语句的位置
  const importLines = content.split('\n');
  let lastImportIndex = -1;
  
  for (let i = 0; i < importLines.length; i++) {
    if (importLines[i].trim().startsWith('import ')) {
      lastImportIndex = i;
    }
  }
  
  // 在最后一个import后插入新的import
  if (lastImportIndex >= 0) {
    importLines.splice(lastImportIndex + 1, 0, importStatement);
  } else {
    // 没有import语句，插入到文件开头
    importLines.unshift(importStatement);
  }
  
  return importLines.join('\n');
}

// 处理单个文件
function processFile(absFilePath, program, checker) {
  const content = fs.readFileSync(absFilePath, 'utf-8');
  const sourceFile = program.getSourceFile(absFilePath);
  if (!sourceFile) {
    return { modified: false, newContent: content, changes: [] };
  }

  const requiredImports = new Set();
  const occurrencesByRule = new Map();
  const edits = [];

  const record = (description, requireImport, start, end, replacementText) => {
    edits.push({ start, end, replacementText, description, requireImport });
    occurrencesByRule.set(description, (occurrencesByRule.get(description) || 0) + 1);
    if (requireImport) requiredImports.add(requireImport);
  };

  const visit = node => {
    // Event deprecated fields
    if (ts.isPropertyAccessExpression(node)) {
      const fieldName = node.name && node.name.text;
      const rule = EVENT_FIELD_REPLACEMENTS.find(r => r.field === fieldName);

      if (rule) {
        // Skip writes
        if (!isAssignmentToProperty(node)) {
          const exprType = checker.getTypeAtLocation(node.expression);
          if (isEventType(exprType, checker)) {
            const objText = content.slice(node.expression.getStart(sourceFile), node.expression.getEnd());
            const replacementText = rule.replacement(objText);
            record(rule.description, rule.requireImport, node.getStart(sourceFile), node.getEnd(), replacementText);
          }
        }
      }
    }

    // Date.toISOString()
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const prop = node.expression.name && node.expression.name.text;
      if (prop === 'toISOString') {
        const receiver = node.expression.expression;
        const receiverType = checker.getTypeAtLocation(receiver);
        if (isDateType(receiverType, checker)) {
          const receiverText = content.slice(receiver.getStart(sourceFile), receiver.getEnd());
          const replacementText = `formatTimeForStorage(${receiverText})`;
          record(DATE_TO_ISO_REPLACEMENT.description, DATE_TO_ISO_REPLACEMENT.requireImport, node.getStart(sourceFile), node.getEnd(), replacementText);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (edits.length === 0) {
    return { modified: false, newContent: content, changes: [] };
  }

  // Apply edits from back to front
  const sorted = edits.sort((a, b) => b.start - a.start);
  let newContent = content;
  for (const e of sorted) {
    newContent = newContent.slice(0, e.start) + e.replacementText + newContent.slice(e.end);
  }

  // Add required imports
  if (requiredImports.size > 0) {
    for (const importStatement of requiredImports) {
      newContent = addImport(newContent, importStatement);
    }
  }

  const changes = Array.from(occurrencesByRule.entries()).map(([description, count]) => ({ description, count }));
  return { modified: true, newContent, changes };
}

// 主函数
function main() {
  console.log('🔍 扫描deprecated字段使用...\n');
  
  const files = getFilesToScan();
  console.log(`📂 找到 ${files.length} 个文件待检查\n`);

  const absFiles = files.map(f => path.resolve(process.cwd(), f));
  const { options } = getTsConfigOptions();
  const program = ts.createProgram({ rootNames: absFiles, options });
  const checker = program.getTypeChecker();
  
  let totalModified = 0;
  const report = [];
  
  for (const file of files) {
    const absPath = path.resolve(process.cwd(), file);
    const result = processFile(absPath, program, checker);
    
    if (result.modified) {
      totalModified++;
      report.push({ file, changes: result.changes });
      
      console.log(`⚠️  ${file}`);
      for (const change of result.changes) {
        console.log(`   - ${change.description} (${change.count}次)`);
      }
      console.log();
      
      // 自动修复
      if (AUTO_FIX) {
        fs.writeFileSync(absPath, result.newContent, 'utf-8');
        console.log(`   ✅ 已自动修复\n`);
      }
    }
  }
  
  // 总结
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 扫描结果：`);
  console.log(`   - 检查文件：${files.length}`);
  console.log(`   - 需要修复：${totalModified}`);
  console.log(`   - 清洁文件：${files.length - totalModified}\n`);
  
  if (totalModified > 0) {
    if (AUTO_FIX) {
      console.log('✅ 所有文件已自动修复！');
      console.log('\n请运行以下命令验证：');
      console.log('   npm run lint');
      console.log('   npm test');
    } else if (DRY_RUN) {
      console.log('💡 这是dry-run模式，没有修改任何文件。');
      console.log('\n要自动修复这些问题，请运行：');
      console.log('   node scripts/clean-deprecated-fields.js --fix');
    } else {
      console.log('⚠️  发现需要手动修复的问题。');
      console.log('\n可以运行以下命令自动修复：');
      console.log('   node scripts/clean-deprecated-fields.js --fix');
    }
  } else {
    console.log('🎉 没有发现deprecated字段使用，代码符合SSOT规范！');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // 退出码
  process.exit(totalModified > 0 && !AUTO_FIX ? 1 : 0);
}

// 运行
main();
