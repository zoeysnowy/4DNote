/**
 * 批量下载 YouTube/B站 视频字幕
 * 使用 yt-dlp 工具
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  outputDir: './AI训练素材/vlog-subtitles',
  languages: ['zh-Hans', 'en'], // 中文和英文字幕
  videoSources: [
    // YouTube Vlog 示例（替换为你要下载的）
    'https://www.youtube.com/watch?v=EXAMPLE1',
    'https://www.youtube.com/watch?v=EXAMPLE2',
    // B站 Vlog 示例
    // 'https://www.bilibili.com/video/BVEXAMPLE',
  ],
  // 推荐的 CC 授权 vlog 频道（无版权问题）
  ccChannels: [
    // 可以搜索 "creative commons vlog" 或 "CC BY vlog"
    'https://www.youtube.com/@example-cc-channel',
  ]
};

// 确保输出目录存在
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

/**
 * 下载单个视频的字幕
 */
function downloadSubtitles(videoUrl, index) {
  console.log(`\n📥 [${index + 1}/${CONFIG.videoSources.length}] 下载: ${videoUrl}`);
  
  const langParam = CONFIG.languages.join(',');
  
  try {
    // yt-dlp 命令
    const command = `yt-dlp \
      --write-auto-sub \
      --write-sub \
      --sub-lang ${langParam} \
      --skip-download \
      --output "${CONFIG.outputDir}/%(title)s.%(ext)s" \
      "${videoUrl}"`;
    
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ 完成: ${videoUrl}`);
    
  } catch (error) {
    console.error(`❌ 失败: ${videoUrl}`, error.message);
  }
}

/**
 * 批量下载
 */
function batchDownload() {
  console.log('🚀 开始批量下载字幕...\n');
  console.log(`目标目录: ${CONFIG.outputDir}`);
  console.log(`语言: ${CONFIG.languages.join(', ')}`);
  console.log(`视频数量: ${CONFIG.videoSources.length}\n`);
  
  CONFIG.videoSources.forEach((url, index) => {
    downloadSubtitles(url, index);
  });
  
  console.log('\n✅ 所有下载任务完成！');
  console.log(`\n💡 提示: 运行 'node parse-subtitles.js' 来解析字幕为 timestamp nodes`);
}

/**
 * 从频道下载最新的 N 个视频字幕
 */
function downloadFromChannel(channelUrl, count = 10) {
  console.log(`\n📺 从频道下载最新 ${count} 个视频的字幕...`);
  
  try {
    const command = `yt-dlp \
      --write-auto-sub \
      --write-sub \
      --sub-lang ${CONFIG.languages.join(',')} \
      --skip-download \
      --playlist-end ${count} \
      --output "${CONFIG.outputDir}/%(title)s.%(ext)s" \
      "${channelUrl}"`;
    
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ 频道下载完成`);
    
  } catch (error) {
    console.error(`❌ 频道下载失败`, error.message);
  }
}

// 命令行参数处理
const args = process.argv.slice(2);

if (args[0] === '--channel') {
  const channelUrl = args[1];
  const count = parseInt(args[2]) || 10;
  downloadFromChannel(channelUrl, count);
} else if (args[0] === '--help') {
  console.log(`
使用方法:
  node download-subtitles.js                    # 下载配置中的视频
  node download-subtitles.js --channel <URL> [N] # 从频道下载最新 N 个视频
  node download-subtitles.js --help             # 显示帮助

示例:
  node download-subtitles.js --channel "https://www.youtube.com/@example" 20

注意:
  1. 需要安装 yt-dlp: pip install yt-dlp
  2. 推荐下载 CC 授权的 vlog，避免版权问题
  3. 字幕文件保存在 ${CONFIG.outputDir}
  `);
} else {
  batchDownload();
}
