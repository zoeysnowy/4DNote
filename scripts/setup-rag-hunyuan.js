/**
 * 使用腾讯混元 API 的 RAG 设置脚本
 * 腾讯元宝底层使用的就是混元大模型
 */

const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: '../ai-proxy/.env' });

// 配置
const CONFIG = {
  inputFile: './test-data/timestamp-nodes.json',
  outputFile: './test-data/embeddings-cache.json',
  hunyuanSecretId: process.env.HUNYUAN_SECRET_ID,
  hunyuanSecretKey: process.env.HUNYUAN_SECRET_KEY,
  proxyUrl: 'http://localhost:3001/api/hunyuan',
  batchSize: 5, // 批量处理，避免 API 限流
};

/**
 * 简单的文本 Embedding（使用词频）
 * 注意：腾讯混元目前主要提供对话能力，Embedding 功能有限
 * 这里使用简单的 TF-IDF 实现
 */
function generateSimpleEmbedding(text, vocabulary) {
  const words = text.match(/[\u4e00-\u9fa5]+/g) || [];
  const embedding = new Array(vocabulary.length).fill(0);
  
  // 计算词频
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  // 生成向量
  vocabulary.forEach((word, index) => {
    embedding[index] = wordCount[word] || 0;
  });
  
  // 归一化
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    return embedding.map(val => val / magnitude);
  }
  
  return embedding;
}

/**
 * 从所有文本中提取词汇表
 */
function buildVocabulary(nodes) {
  const wordSet = new Set();
  
  nodes.forEach(node => {
    const text = `${node.title} ${node.content}`;
    const words = text.match(/[\u4e00-\u9fa5]+/g) || [];
    words.forEach(word => {
      if (word.length >= 2) { // 过滤单字
        wordSet.add(word);
      }
    });
  });
  
  return Array.from(wordSet).slice(0, 500); // 限制词汇表大小
}

/**
 * 计算余弦相似度
 */
function cosineSimilarity(vec1, vec2) {
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  
  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);
  
  if (mag1 === 0 || mag2 === 0) return 0;
  
  return dotProduct / (mag1 * mag2);
}

/**
 * 使用腾讯混元 API 进行智能检索（对话模式）
 */
async function searchWithHunyuan(query, nodes) {
  if (!CONFIG.hunyuanSecretId || !CONFIG.hunyuanSecretKey) {
    console.log('⚠️  腾讯混元 API 密钥未配置，使用本地检索');
    return null;
  }
  
  console.log('🤖 使用腾讯混元 API 增强检索...');
  
  try {
    // 构建上下文
    const context = nodes.slice(0, 10).map((node, i) => 
      `[${i + 1}] ${node.timestamp} - ${node.title}: ${node.content.slice(0, 100)}...`
    ).join('\n\n');
    
    const messages = [
      {
        role: 'user',
        content: `根据以下时间日志，找出与查询"${query}"最相关的3条记录，并解释原因：\n\n${context}\n\n请直接返回最相关的3条记录编号和原因，格式如：\n1. [编号] 原因\n2. [编号] 原因\n3. [编号] 原因`
      }
    ];
    
    const payload = JSON.stringify({
      model: 'hunyuan-lite',
      messages,
      stream: false
    });
    
    // 调用代理服务器
    const response = await fetch(CONFIG.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secretId: CONFIG.hunyuanSecretId,
        secretKey: CONFIG.hunyuanSecretKey,
        payload
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const answer = data.choices[0].message.content;
    
    console.log('💬 混元分析结果:');
    console.log(answer);
    
    return answer;
    
  } catch (error) {
    console.error('❌ 混元 API 调用失败:', error.message);
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始设置 RAG 系统（腾讯混元版）...\n');
  
  // 1. 检查输入文件
  if (!fs.existsSync(CONFIG.inputFile)) {
    console.error(`❌ 文件不存在: ${CONFIG.inputFile}`);
    console.log(`💡 请先运行: node scripts/generate-mock-data.js`);
    process.exit(1);
  }
  
  // 2. 加载数据
  const nodes = JSON.parse(fs.readFileSync(CONFIG.inputFile, 'utf-8'));
  console.log(`📊 加载 ${nodes.length} 个 Timestamp Nodes\n`);
  
  // 3. 构建词汇表
  console.log('📚 构建词汇表...');
  const vocabulary = buildVocabulary(nodes);
  console.log(`  ✅ 词汇表大小: ${vocabulary.length}\n`);
  
  // 4. 生成 Embeddings
  console.log('🔄 生成 Embeddings...');
  const embeddings = nodes.map((node, i) => {
    const text = `${node.title} ${node.content}`;
    const embedding = generateSimpleEmbedding(text, vocabulary);
    
    if ((i + 1) % 5 === 0) {
      console.log(`  进度: ${i + 1}/${nodes.length}`);
    }
    
    return {
      id: node.id,
      embedding,
      node
    };
  });
  console.log(`  ✅ 完成\n`);
  
  // 5. 保存到本地缓存
  const cacheData = {
    vocabulary,
    embeddings,
    createdAt: new Date().toISOString()
  };
  
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(cacheData, null, 2));
  console.log(`💾 缓存已保存: ${CONFIG.outputFile}\n`);
  
  // 6. 测试检索
  console.log('🔍 测试检索功能...\n');
  
  const testQueries = [
    '早上的活动',
    '学习和工作',
    '运动健身'
  ];
  
  for (const query of testQueries) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`查询: "${query}"\n`);
    
    // 本地向量检索
    const queryEmbedding = generateSimpleEmbedding(query, vocabulary);
    const results = embeddings
      .map(item => ({
        node: item.node,
        score: cosineSimilarity(queryEmbedding, item.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    console.log('📊 本地向量检索结果:');
    results.forEach((item, i) => {
      console.log(`  ${i + 1}. [相似度: ${(item.score * 100).toFixed(1)}%]`);
      console.log(`     ${item.node.timestamp} - ${item.node.title}`);
    });
    
    // 尝试使用混元 API 增强
    await searchWithHunyuan(query, nodes);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('\n✅ RAG 系统设置完成！');
  console.log(`\n💡 使用方法:`);
  console.log(`   node scripts/test-rag-hunyuan.js "查询内容"`);
}

main();
