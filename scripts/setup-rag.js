/**
 * 设置 RAG 系统：将 Timestamp Nodes 导入向量数据库
 */

const fs = require('fs');
const { ChromaClient } = require('chromadb');
const OpenAI = require('openai');

// 配置
const CONFIG = {
  inputFile: './test-data/timestamp-nodes.json',
  collectionName: '4dnote-vlog-events',
  openaiApiKey: process.env.OPENAI_API_KEY,
  chromaUrl: 'http://localhost:8000',
  batchSize: 10, // 批量处理，避免 API 限流
};

const openai = new OpenAI({ apiKey: CONFIG.openaiApiKey });
const chroma = new ChromaClient({ path: CONFIG.chromaUrl });

/**
 * 生成 Embedding
 */
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('❌ Embedding 生成失败:', error.message);
    throw error;
  }
}

/**
 * 批量处理节点
 */
async function batchProcess(nodes, collection) {
  const batches = [];
  for (let i = 0; i < nodes.length; i += CONFIG.batchSize) {
    batches.push(nodes.slice(i, i + CONFIG.batchSize));
  }
  
  console.log(`📦 分为 ${batches.length} 个批次处理...\n`);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`🔄 处理批次 ${i + 1}/${batches.length} (${batch.length} 个节点)`);
    
    const embeddings = [];
    const ids = [];
    const documents = [];
    const metadatas = [];
    
    for (const node of batch) {
      const text = `标题: ${node.title}\n内容: ${node.content}`;
      const embedding = await generateEmbedding(text);
      
      embeddings.push(embedding);
      ids.push(node.id);
      documents.push(text);
      metadatas.push({
        timestamp: node.timestamp,
        title: node.title,
        language: node.metadata.language,
        source: node.metadata.source,
        videoTimestamp: node.metadata.videoTimestamp,
        contentLength: node.content.length
      });
    }
    
    await collection.add({
      ids,
      embeddings,
      documents,
      metadatas
    });
    
    console.log(`  ✅ 批次 ${i + 1} 完成`);
    
    // 避免 API 限流
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * 测试检索
 */
async function testSearch(collection) {
  const queries = [
    '早上做了什么事情？',
    '有什么学习或工作相关的内容？',
    '去了哪些地方旅行？',
    '最近在读什么书？',
    '运动健身的记录'
  ];
  
  console.log('\n🔍 测试检索功能...\n');
  
  for (const query of queries) {
    console.log(`❓ 查询: "${query}"`);
    
    const queryEmbedding = await generateEmbedding(query);
    
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: 3
    });
    
    console.log('📌 结果:');
    results.documents[0].forEach((doc, i) => {
      const metadata = results.metadatas[0][i];
      const preview = doc.slice(0, 80).replace(/\n/g, ' ');
      console.log(`  ${i + 1}. [${metadata.timestamp}] ${preview}...`);
      console.log(`     来源: ${metadata.source} @ ${metadata.videoTimestamp}`);
    });
    console.log('');
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始设置 RAG 系统...\n');
  
  // 1. 检查输入文件
  if (!fs.existsSync(CONFIG.inputFile)) {
    console.error(`❌ 文件不存在: ${CONFIG.inputFile}`);
    console.log(`💡 请先运行: node parse-subtitles.js`);
    process.exit(1);
  }
  
  // 2. 加载数据
  const nodes = JSON.parse(fs.readFileSync(CONFIG.inputFile, 'utf-8'));
  console.log(`📊 加载 ${nodes.length} 个 Timestamp Nodes\n`);
  
  // 3. 检查 API Key
  if (!CONFIG.openaiApiKey) {
    console.error('❌ 请设置环境变量 OPENAI_API_KEY');
    process.exit(1);
  }
  
  // 4. 创建/获取 Collection
  try {
    console.log(`🗄️  创建 Collection: ${CONFIG.collectionName}`);
    await chroma.deleteCollection({ name: CONFIG.collectionName }).catch(() => {});
    const collection = await chroma.createCollection({
      name: CONFIG.collectionName,
      metadata: { 
        'hnsw:space': 'cosine',
        description: '4DNote Vlog Timestamp Nodes'
      }
    });
    console.log(`  ✅ Collection 创建成功\n`);
    
    // 5. 批量处理节点
    await batchProcess(nodes, collection);
    
    console.log(`\n✅ 数据导入完成！`);
    console.log(`📊 统计:`);
    console.log(`  - 总节点数: ${nodes.length}`);
    console.log(`  - Collection: ${CONFIG.collectionName}`);
    
    // 6. 测试检索
    await testSearch(collection);
    
    console.log('✅ RAG 系统设置完成！');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 请先启动 ChromaDB:');
      console.log('   docker run -d -p 8000:8000 chromadb/chroma');
    }
    process.exit(1);
  }
}

// 运行
main();
