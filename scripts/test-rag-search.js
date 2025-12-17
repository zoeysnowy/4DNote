/**
 * 测试 RAG 检索功能
 * 用法: npm run test-rag "查询内容"
 */

const { ChromaClient } = require('chromadb');
const OpenAI = require('openai');

const CONFIG = {
  collectionName: '4dnote-vlog-events',
  chromaUrl: 'http://localhost:8000',
  openaiApiKey: process.env.OPENAI_API_KEY,
  defaultQueries: [
    '早上做了什么事情？',
    '有什么学习或工作相关的内容？',
    '去了哪些地方旅行？',
    '最近在读什么书？',
    '运动健身的记录',
    '中午吃了什么？',
    '晚上的活动安排'
  ]
};

const openai = new OpenAI({ apiKey: CONFIG.openaiApiKey });
const chroma = new ChromaClient({ path: CONFIG.chromaUrl });

/**
 * 执行检索
 */
async function search(query, nResults = 5) {
  console.log(`\n🔍 查询: "${query}"\n`);
  
  try {
    const collection = await chroma.getCollection({ name: CONFIG.collectionName });
    
    // 生成查询的 Embedding
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });
    
    // 检索
    const results = await collection.query({
      queryEmbeddings: [embedding.data[0].embedding],
      nResults
    });
    
    // 显示结果
    if (results.documents[0].length === 0) {
      console.log('❌ 未找到相关结果\n');
      return;
    }
    
    console.log(`📌 找到 ${results.documents[0].length} 个相关结果:\n`);
    
    results.documents[0].forEach((doc, i) => {
      const metadata = results.metadatas[0][i];
      const distance = results.distances[0][i];
      
      console.log(`${i + 1}. 【相似度: ${(1 - distance).toFixed(3)}】`);
      console.log(`   时间: ${metadata.timestamp}`);
      console.log(`   来源: ${metadata.source} @ ${metadata.videoTimestamp}`);
      console.log(`   语言: ${metadata.language === 'zh' ? '中文' : '英文'}`);
      console.log(`   内容: ${doc.slice(0, 150).replace(/\n/g, ' ')}...`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ 检索失败:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 请先启动 ChromaDB:');
      console.log('   docker run -d -p 8000:8000 chromadb/chroma');
    } else if (error.message.includes('does not exist')) {
      console.log('\n💡 Collection 不存在，请先运行:');
      console.log('   npm run setup-rag');
    }
    
    process.exit(1);
  }
}

/**
 * 批量测试预设查询
 */
async function batchTest() {
  console.log('🧪 批量测试预设查询...\n');
  console.log(`总共 ${CONFIG.defaultQueries.length} 个查询\n`);
  console.log('=' .repeat(80));
  
  for (let i = 0; i < CONFIG.defaultQueries.length; i++) {
    const query = CONFIG.defaultQueries[i];
    await search(query, 3);
    
    if (i < CONFIG.defaultQueries.length - 1) {
      console.log('-'.repeat(80));
    }
  }
  
  console.log('=' .repeat(80));
  console.log('\n✅ 批量测试完成！');
}

/**
 * 统计信息
 */
async function showStats() {
  try {
    const collection = await chroma.getCollection({ name: CONFIG.collectionName });
    const count = await collection.count();
    
    console.log('\n📊 数据库统计:');
    console.log(`  Collection: ${CONFIG.collectionName}`);
    console.log(`  总节点数: ${count}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ 获取统计信息失败:', error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (!CONFIG.openaiApiKey) {
    console.error('❌ 请设置环境变量 OPENAI_API_KEY');
    process.exit(1);
  }
  
  // 显示统计
  await showStats();
  
  if (args[0] === '--batch') {
    // 批量测试
    await batchTest();
    
  } else if (args[0] === '--help') {
    // 帮助信息
    console.log(`
使用方法:
  npm run test-rag "查询内容"           # 单次查询
  npm run test-rag -- --batch          # 批量测试预设查询
  npm run test-rag -- --help           # 显示帮助

示例:
  npm run test-rag "今天早上做了什么？"
  npm run test-rag "学习相关的记录"
  npm run test-rag -- --batch

参数:
  --batch    运行所有预设查询
  --help     显示此帮助信息
    `);
    
  } else if (args[0]) {
    // 单次查询
    const query = args.join(' ');
    await search(query);
    
  } else {
    // 默认：显示示例
    console.log('💡 用法示例:');
    console.log('   npm run test-rag "今天做了什么？"');
    console.log('   npm run test-rag -- --batch\n');
    console.log('运行 "npm run test-rag -- --help" 查看更多选项');
  }
}

// 运行
main();
