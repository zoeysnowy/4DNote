/**
 * 解析 SRT/VTT 字幕为 Timestamp Nodes
 * 规则：段落之间超过 5 分钟生成新的 timestamp node
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  inputDir: './AI训练素材/vlog-subtitles',
  outputFile: './test-data/timestamp-nodes.json',
  mergeThreshold: 5 * 60 * 1000, // 5 分钟（毫秒）
  minNodeLength: 50, // 最小节点字符数
};

/**
 * 解析 SRT 时间戳为毫秒
 * 格式: 00:00:10,500 --> 00:00:13,000
 */
function parseSrtTimestamp(timestamp) {
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;
  
  const [_, hours, minutes, seconds, milliseconds] = match;
  return (
    parseInt(hours) * 3600000 +
    parseInt(minutes) * 60000 +
    parseInt(seconds) * 1000 +
    parseInt(milliseconds)
  );
}

/**
 * 解析单个 SRT 文件
 */
function parseSrtFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const blocks = content.trim().split(/\n\n+/);
  
  const subtitles = [];
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    
    const timeRange = lines[1];
    const text = lines.slice(2).join(' ').trim();
    
    if (!timeRange.includes('-->')) continue;
    
    const [startStr, endStr] = timeRange.split('-->').map(s => s.trim());
    const startTime = parseSrtTimestamp(startStr);
    const endTime = parseSrtTimestamp(endStr);
    
    subtitles.push({
      startTime,
      endTime,
      text
    });
  }
  
  return subtitles;
}

/**
 * 将字幕合并为 Timestamp Nodes
 * 规则：超过 5 分钟间隔则创建新节点
 */
function mergeToNodes(subtitles, videoTitle, videoDate) {
  const nodes = [];
  let currentNode = null;
  
  for (const subtitle of subtitles) {
    // 如果是第一个字幕，或距离上一个节点超过阈值
    if (!currentNode || 
        (subtitle.startTime - currentNode.endTime) > CONFIG.mergeThreshold) {
      
      // 保存上一个节点
      if (currentNode && currentNode.content.length >= CONFIG.minNodeLength) {
        nodes.push(currentNode);
      }
      
      // 创建新节点
      currentNode = {
        id: `evt_${videoDate.getTime()}_${nodes.length}`,
        timestamp: new Date(videoDate.getTime() + subtitle.startTime).toISOString().replace('T', ' ').slice(0, 19),
        title: `${videoTitle} - Part ${nodes.length + 1}`,
        content: subtitle.text,
        startTime: subtitle.startTime,
        endTime: subtitle.endTime,
        metadata: {
          source: videoTitle,
          language: detectLanguage(subtitle.text),
          videoTimestamp: formatTimestamp(subtitle.startTime)
        }
      };
    } else {
      // 合并到当前节点
      currentNode.content += ' ' + subtitle.text;
      currentNode.endTime = subtitle.endTime;
    }
  }
  
  // 保存最后一个节点
  if (currentNode && currentNode.content.length >= CONFIG.minNodeLength) {
    nodes.push(currentNode);
  }
  
  return nodes;
}

/**
 * 简单的语言检测
 */
function detectLanguage(text) {
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  return chineseChars && chineseChars.length > text.length * 0.3 ? 'zh' : 'en';
}

/**
 * 格式化毫秒为可读时间
 */
function formatTimestamp(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * 处理所有字幕文件
 */
function processAllSubtitles() {
  console.log('🔄 开始解析字幕文件...\n');
  
  if (!fs.existsSync(CONFIG.inputDir)) {
    console.error(`❌ 目录不存在: ${CONFIG.inputDir}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(CONFIG.inputDir)
    .filter(f => f.endsWith('.srt') || f.endsWith('.vtt'));
  
  if (files.length === 0) {
    console.error(`❌ 未找到字幕文件 (.srt/.vtt)`);
    console.log(`💡 请先运行: node download-subtitles.js`);
    process.exit(1);
  }
  
  console.log(`📁 找到 ${files.length} 个字幕文件\n`);
  
  const allNodes = [];
  
  for (const file of files) {
    const filePath = path.join(CONFIG.inputDir, file);
    const videoTitle = path.basename(file, path.extname(file))
      .replace(/\.(zh-Hans|en)$/, ''); // 移除语言后缀
    
    console.log(`📄 解析: ${file}`);
    
    try {
      const subtitles = parseSrtFile(filePath);
      const videoDate = new Date(2024, 0, 1); // 可以从文件名或元数据提取
      const nodes = mergeToNodes(subtitles, videoTitle, videoDate);
      
      allNodes.push(...nodes);
      
      console.log(`  ✅ 生成 ${nodes.length} 个节点 (${subtitles.length} 条字幕)`);
      
    } catch (error) {
      console.error(`  ❌ 解析失败:`, error.message);
    }
  }
  
  // 保存结果
  const outputDir = path.dirname(CONFIG.outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(
    CONFIG.outputFile,
    JSON.stringify(allNodes, null, 2)
  );
  
  console.log(`\n✅ 解析完成！`);
  console.log(`📊 统计:`);
  console.log(`  - 总节点数: ${allNodes.length}`);
  console.log(`  - 平均长度: ${Math.round(allNodes.reduce((sum, n) => sum + n.content.length, 0) / allNodes.length)} 字符`);
  console.log(`  - 输出文件: ${CONFIG.outputFile}`);
  
  // 显示示例
  console.log(`\n📝 示例节点:\n`);
  console.log(JSON.stringify(allNodes[0], null, 2));
  
  console.log(`\n💡 下一步: 运行 'node setup-rag.js' 导入到向量数据库`);
}

// 运行
processAllSubtitles();
