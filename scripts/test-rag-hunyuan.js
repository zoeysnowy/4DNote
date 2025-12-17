/**
 * 使用腾讯混元 API 的 RAG 检索测试
 */

const fs = require('fs');
require('dotenv').config({ path: './ai-proxy/.env' });

const CONFIG = {
  cacheFile: './test-data/embeddings-cache.json',
  proxyUrl: 'http://localhost:3001/api/hunyuan',
  hunyuanSecretId: process.env.HUNYUAN_SECRET_ID,
  hunyuanSecretKey: process.env.HUNYUAN_SECRET_KEY
};

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
 * 生成简单 Embedding
 */
function generateSimpleEmbedding(text, vocabulary) {
  const words = text.match(/[\u4e00-\u9fa5]+/g) || [];
  const embedding = new Array(vocabulary.length).fill(0);
  
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  vocabulary.forEach((word, index) => {
    embedding[index] = wordCount[word] || 0;
  });
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    return embedding.map(val => val / magnitude);
  }
  
  return embedding;
}

/**
 * 使用腾讯混元 API 进行智能问答
 */
async function askHunyuan(query, context) {
  if (!CONFIG.hunyuanSecretId || !CONFIG.hunyuanSecretKey) {
    console.log('⚠️  腾讯混元 API 密钥未配置');
    return null;
  }
  
  try {
    const messages = [
      {
        role: 'user',
        content: `基于以下时间日志，回答问题："${query}"\n\n时间日志：\n${context}\n\n请提供简洁的回答。`
      }
    ];
    
    const response = await fetch(CONFIG.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secretId: CONFIG.hunyuanSecretId,
        secretKey: CONFIG.hunyuanSecretKey,
        model: 'hunyuan-lite',
        messages,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('[Debug] API响应:', JSON.stringify(data, null, 2));
    
    // 兼容不同的响应格式
    if (data.choices && data.choices[0]) {
      return data.choices[0].message.content;
    } else if (data.Response && data.Response.Choices && data.Response.Choices[0]) {
      return data.Response.Choices[0].Message.Content;
    } else {
      throw new Error('未知的响应格式: ' + JSON.stringify(data));
    }
    
  } catch (error) {
    console.error('❌ 混元 API 调用失败:', error.message);
    console.error('   详细信息:', error);
    return null;
  }
}

/**
 * 执行检索
 */
async function search(query) {
  console.log(`\n🔍 查询: "${query}"\n`);
  
  // 加载缓存
  if (!fs.existsSync(CONFIG.cacheFile)) {
    console.error(`❌ 缓存文件不存在: ${CONFIG.cacheFile}`);
    console.log(`💡 请先运行: node scripts/setup-rag-hunyuan.js`);
    return;
  }
  
  const cache = JSON.parse(fs.readFileSync(CONFIG.cacheFile, 'utf-8'));
  const { vocabulary, embeddings } = cache;
  
  // 1. 本地向量检索
  console.log('📊 本地向量检索:');
  const queryEmbedding = generateSimpleEmbedding(query, vocabulary);
  const results = embeddings
    .map(item => ({
      node: item.node,
      score: cosineSimilarity(queryEmbedding, item.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  
  results.forEach((item, i) => {
    console.log(`  ${i + 1}. [相似度: ${(item.score * 100).toFixed(1)}%]`);
    console.log(`     ${item.node.timestamp} - ${item.node.title}`);
    console.log(`     ${item.node.content.slice(0, 80)}...`);
    console.log('');
  });
  
  // 2. 使用混元 API 增强理解
  if (CONFIG.hunyuanSecretId) {
    console.log('🤖 腾讯混元 AI 分析:\n');
    
    const context = results.map((item, i) => 
      `${i + 1}. ${item.node.timestamp} - ${item.node.title}\n   ${item.node.content}`
    ).join('\n\n');
    
    const answer = await askHunyuan(query, context);
    
    if (answer) {
      console.log(answer);
    }
  } else {
    console.log('\n💡 提示: 配置腾讯混元 API 密钥可获得 AI 增强分析');
    console.log('   1. 进入 ai-proxy 目录');
    console.log('   2. 复制 .env.example 为 .env');
    console.log('   3. 填入腾讯云密钥');
    console.log('   4. 启动代理: npm start');
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--help') {
    console.log(`
使用方法:
  node scripts/test-rag-hunyuan.js "查询内容"

示例:
  node scripts/test-rag-hunyuan.js "早上做了什么？"
  node scripts/test-rag-hunyuan.js "学习相关的记录"

前置条件:
  1. 先运行: node scripts/setup-rag-hunyuan.js
  2. 配置混元 API（可选，但推荐）:
     - 进入 ai-proxy 目录
     - 复制 .env.example 为 .env
     - 填入腾讯云密钥
     - 启动代理: npm start
    `);
    return;
  }
  
  if (!args[0]) {
    console.log('💡 用法: node scripts/test-rag-hunyuan.js "查询内容"');
    console.log('   或运行: node scripts/test-rag-hunyuan.js --help');
    return;
  }
  
  const query = args.join(' ');
  await search(query);
}

main();
