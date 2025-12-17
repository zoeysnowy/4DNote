/**
 * 简化版 RAG 测试（不需要 ChromaDB 和 OpenAI）
 * 使用简单的关键词匹配来演示检索功能
 */

const fs = require('fs');

const CONFIG = {
  dataFile: './test-data/timestamp-nodes.json'
};

/**
 * 简单的关键词匹配检索（改进版：支持中文）
 */
function simpleSearch(nodes, query, limit = 5) {
  // 提取查询中的关键词（移除标点符号，支持中文）
  const queryWords = query
    .replace(/[？！，。、：；""''（）《》【】]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
  
  // 计算每个节点的相关度分数
  const scored = nodes.map(node => {
    const text = `${node.title} ${node.content}`;
    
    // 计算匹配分数
    let score = 0;
    
    for (const word of queryWords) {
      if (text.includes(word)) {
        score += 1;
      }
      // 部分匹配（词语包含关键字）
      else if (word.length >= 2) {
        for (let i = 0; i < text.length - word.length + 1; i++) {
          if (text.substring(i, i + word.length) === word) {
            score += 0.5;
            break;
          }
        }
      }
    }
    
    // 归一化分数
    const normalizedScore = score / Math.max(queryWords.length, 1);
    
    return { node, score: normalizedScore };
  });
  
  // 按分数排序并返回前 N 个
  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * 显示检索结果
 */
function displayResults(query, results) {
  console.log(`\n🔍 查询: "${query}"\n`);
  
  if (results.length === 0) {
    console.log('❌ 未找到相关结果\n');
    return;
  }
  
  console.log(`📌 找到 ${results.length} 个相关结果:\n`);
  
  results.forEach((item, i) => {
    const { node, score } = item;
    
    console.log(`${i + 1}. 【相关度: ${(score * 100).toFixed(1)}%】`);
    console.log(`   时间: ${node.timestamp}`);
    console.log(`   来源: ${node.metadata.source} @ ${node.metadata.videoTimestamp}`);
    console.log(`   标题: ${node.title}`);
    console.log(`   内容: ${node.content.slice(0, 100)}...`);
    console.log('');
  });
}

/**
 * 批量测试
 */
function batchTest(nodes) {
  const queries = [
    '早上做了什么事情？',
    '有什么学习或工作相关的内容？',
    '运动健身的记录',
    '中午吃了什么？',
    '阅读和学习',
    '设计相关的工作',
    '周计划'
  ];
  
  console.log('🧪 批量测试（简化版 - 关键词匹配）\n');
  console.log(`📊 数据: ${nodes.length} 个节点`);
  console.log(`📋 查询: ${queries.length} 个\n`);
  console.log('=' .repeat(80));
  
  queries.forEach((query, i) => {
    const results = simpleSearch(nodes, query, 3);
    displayResults(query, results);
    
    if (i < queries.length - 1) {
      console.log('-'.repeat(80));
    }
  });
  
  console.log('=' .repeat(80));
  console.log('\n✅ 批量测试完成！');
  console.log('\n💡 这是简化版本，使用关键词匹配');
  console.log('💡 真实的 RAG 系统会使用语义理解，效果更好');
  console.log('💡 要使用完整版，请运行: npm run setup-rag');
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  
  // 加载数据
  if (!fs.existsSync(CONFIG.dataFile)) {
    console.error(`❌ 数据文件不存在: ${CONFIG.dataFile}`);
    console.log(`💡 请先运行: node scripts/generate-mock-data.js`);
    process.exit(1);
  }
  
  const nodes = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf-8'));
  
  console.log(`\n📊 加载数据: ${nodes.length} 个节点\n`);
  
  if (args[0] === '--batch') {
    // 批量测试
    batchTest(nodes);
    
  } else if (args[0] === '--help') {
    console.log(`
使用方法:
  node scripts/simple-rag-test.js "查询内容"    # 单次查询
  node scripts/simple-rag-test.js --batch       # 批量测试
  node scripts/simple-rag-test.js --help        # 显示帮助

示例:
  node scripts/simple-rag-test.js "今天早上做了什么？"
  node scripts/simple-rag-test.js "学习相关的记录"
  node scripts/simple-rag-test.js --batch

注意:
  这是简化版本，使用关键词匹配
  要使用完整的语义检索，请安装 ChromaDB 和 OpenAI
    `);
    
  } else if (args[0]) {
    // 单次查询
    const query = args.join(' ');
    const results = simpleSearch(nodes, query);
    displayResults(query, results);
    
  } else {
    console.log('💡 用法示例:');
    console.log('   node scripts/simple-rag-test.js "今天做了什么？"');
    console.log('   node scripts/simple-rag-test.js --batch\n');
  }
}

main();
