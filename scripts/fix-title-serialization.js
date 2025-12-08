/**
 * 修复标题多重序列化问题
 * 
 * 问题描述：
 * - simpleTitle 字段包含多重嵌套的 Slate JSON 字符串
 * - 每次保存都会将已有的 Slate JSON 再包装一次
 * - 导致显示为 '[{"type":"paragraph",...}]' 而不是实际文本
 * 
 * 修复方案：
 * 1. 检测所有事件的 title.simpleTitle
 * 2. 如果 simpleTitle 是 Slate JSON 数组，提取纯文本
 * 3. 重新生成完整的 EventTitle 对象（fullTitle, colorTitle, simpleTitle）
 */

const fs = require('fs');
const path = require('path');

// 数据库路径（根据实际情况调整）
const DB_PATH = path.join(__dirname, '..', 'database', 'events.json');

/**
 * 从 Slate JSON 提取纯文本
 */
function extractTextFromSlate(slateJson) {
  try {
    const nodes = JSON.parse(slateJson);
    if (!Array.isArray(nodes)) {
      return slateJson; // 不是数组，返回原字符串
    }
    
    let text = '';
    
    function traverse(node) {
      if (typeof node === 'string') {
        text += node;
      } else if (node.text) {
        text += node.text;
      } else if (node.children) {
        node.children.forEach(traverse);
      }
    }
    
    nodes.forEach(traverse);
    return text.trim();
  } catch (e) {
    console.error('❌ 解析 Slate JSON 失败:', e.message);
    return slateJson;
  }
}

/**
 * 检测字符串是否为 Slate JSON
 */
function isSlateJson(str) {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) && parsed.length > 0 && parsed[0].type;
  } catch {
    return false;
  }
}

/**
 * 递归解析多重嵌套的 JSON 字符串
 */
function unwrapNestedJson(str, depth = 0) {
  if (depth > 10) {
    console.warn('⚠️ 递归深度超过 10 层，停止解析');
    return str;
  }
  
  if (!isSlateJson(str)) {
    return str; // 不是 Slate JSON，停止解析
  }
  
  console.log(`  ${'  '.repeat(depth)}🔍 解析第 ${depth + 1} 层 JSON`);
  
  try {
    const parsed = JSON.parse(str);
    const text = extractTextFromSlate(str);
    
    // 检查提取的文本是否还是 JSON
    if (isSlateJson(text)) {
      return unwrapNestedJson(text, depth + 1);
    }
    
    return text;
  } catch (e) {
    console.error('❌ 解析失败:', e.message);
    return str;
  }
}

/**
 * 将纯文本转换为 Slate JSON
 */
function textToSlateJson(text) {
  return JSON.stringify([
    { type: 'paragraph', children: [{ text: text || '' }] }
  ]);
}

/**
 * 修复单个事件的标题
 */
function fixEventTitle(event) {
  if (!event.title) {
    console.log(`  ℹ️ 事件 ${event.id} 无标题，跳过`);
    return { fixed: false, event };
  }
  
  let needsFix = false;
  const originalTitle = JSON.parse(JSON.stringify(event.title)); // 深拷贝
  
  // 检查 simpleTitle
  if (event.title.simpleTitle && isSlateJson(event.title.simpleTitle)) {
    console.log(`  🔧 修复 simpleTitle (检测到 Slate JSON)`);
    needsFix = true;
    
    // 递归解析多重嵌套
    const plainText = unwrapNestedJson(event.title.simpleTitle);
    console.log(`    原始: ${event.title.simpleTitle.substring(0, 100)}...`);
    console.log(`    修复后: ${plainText}`);
    
    // 重新生成完整的标题对象
    event.title = {
      fullTitle: textToSlateJson(plainText),
      colorTitle: textToSlateJson(plainText), // 简化处理，无格式
      simpleTitle: plainText,
      formatMap: []
    };
  }
  
  // 检查 colorTitle
  if (event.title.colorTitle && isSlateJson(event.title.colorTitle)) {
    console.log(`  🔧 修复 colorTitle (检测到 Slate JSON，但应该是 HTML 字符串)`);
    needsFix = true;
    const plainText = unwrapNestedJson(event.title.colorTitle);
    event.title.colorTitle = textToSlateJson(plainText);
  }
  
  return { fixed: needsFix, event, originalTitle };
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始修复标题序列化问题...\n');
  
  // 读取数据库
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ 数据库文件不存在: ${DB_PATH}`);
    process.exit(1);
  }
  
  const dbContent = fs.readFileSync(DB_PATH, 'utf-8');
  const events = JSON.parse(dbContent);
  
  console.log(`📊 共 ${events.length} 个事件\n`);
  
  // 修复所有事件
  let fixedCount = 0;
  const backupPath = DB_PATH + '.backup.' + Date.now();
  
  // 备份原始数据
  fs.writeFileSync(backupPath, dbContent);
  console.log(`💾 已备份原始数据到: ${backupPath}\n`);
  
  events.forEach((event, index) => {
    console.log(`\n[${index + 1}/${events.length}] 检查事件: ${event.id}`);
    const result = fixEventTitle(event);
    
    if (result.fixed) {
      fixedCount++;
      console.log('  ✅ 已修复');
    }
  });
  
  // 保存修复后的数据
  fs.writeFileSync(DB_PATH, JSON.stringify(events, null, 2));
  
  console.log('\n\n' + '='.repeat(60));
  console.log(`✅ 修复完成！共修复 ${fixedCount} 个事件`);
  console.log(`📁 备份文件: ${backupPath}`);
  console.log('='.repeat(60));
}

// 执行
main().catch(console.error);
