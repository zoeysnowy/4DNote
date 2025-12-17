/**
 * 生成模拟的 Timestamp Nodes 用于测试
 */

const fs = require('fs');
const path = require('path');

const testNodes = [
  {
    id: 'evt_1704096000000_001',
    timestamp: '2024-01-01 08:30:00',
    title: 'Morning Routine - Part 1',
    content: '早上7点起床，先做了15分钟的拉伸运动。然后冲了个热水澡，感觉整个人都清醒了。今天打算去附近的咖啡馆工作，那里环境安静，适合专注。',
    startTime: 510000,
    endTime: 810000,
    metadata: {
      source: 'My Morning Routine Vlog',
      language: 'zh',
      videoTimestamp: '00:08:30'
    }
  },
  {
    id: 'evt_1704099600000_002',
    timestamp: '2024-01-01 09:30:00',
    title: 'Morning Routine - Part 2',
    content: '到达咖啡馆后，点了一杯美式咖啡。打开笔记本电脑，开始处理邮件。今天有三个重要的会议要开，需要提前准备一下资料。',
    startTime: 3870000,
    endTime: 4170000,
    metadata: {
      source: 'My Morning Routine Vlog',
      language: 'zh',
      videoTimestamp: '01:04:30'
    }
  },
  {
    id: 'evt_1704103200000_003',
    timestamp: '2024-01-01 10:30:00',
    title: 'Work Session - Part 1',
    content: '开始进入深度工作状态。今天的任务是完成一个 React 组件的开发。使用 TypeScript 写代码，确保类型安全。遇到了一个棘手的 bug，花了半小时才解决。',
    startTime: 7470000,
    endTime: 7770000,
    metadata: {
      source: 'Productive Day Vlog',
      language: 'zh',
      videoTimestamp: '02:04:30'
    }
  },
  {
    id: 'evt_1704110400000_004',
    timestamp: '2024-01-01 12:30:00',
    title: 'Lunch Break',
    content: '中午休息时间。去附近的餐厅吃了份沙拉和三明治。午餐时看了几篇技术博客，学到了关于性能优化的新技巧。饭后在公园散步了15分钟。',
    startTime: 14970000,
    endTime: 15270000,
    metadata: {
      source: 'Productive Day Vlog',
      language: 'zh',
      videoTimestamp: '04:09:30'
    }
  },
  {
    id: 'evt_1704114000000_005',
    timestamp: '2024-01-01 13:30:00',
    title: 'Afternoon Study',
    content: '下午学习时间。看了一个关于 AI 和机器学习的教程视频。做了笔记，记录了几个重要的概念。特别是关于 RAG（检索增强生成）的部分很有启发。',
    startTime: 18570000,
    endTime: 18870000,
    metadata: {
      source: 'Learning Journey Vlog',
      language: 'zh',
      videoTimestamp: '05:09:30'
    }
  },
  {
    id: 'evt_1704121200000_006',
    timestamp: '2024-01-01 15:30:00',
    title: 'Exercise Time',
    content: '运动时间到！去健身房做了一小时的力量训练。主要练习了胸部和手臂。运动后喝了蛋白奶昔补充能量。感觉身体状态很好。',
    startTime: 26070000,
    endTime: 26370000,
    metadata: {
      source: 'Fitness Journey Vlog',
      language: 'zh',
      videoTimestamp: '07:14:30'
    }
  },
  {
    id: 'evt_1704128400000_007',
    timestamp: '2024-01-01 17:30:00',
    title: 'Evening Routine',
    content: '晚上回到家，准备了晚餐。做了炒青菜和煎鱼。边吃饭边看了一集纪录片。饭后整理了一下今天的笔记，写了简短的日记总结今天的收获。',
    startTime: 33570000,
    endTime: 33870000,
    metadata: {
      source: 'Evening Routine Vlog',
      language: 'zh',
      videoTimestamp: '09:19:30'
    }
  },
  {
    id: 'evt_1704182400000_008',
    timestamp: '2024-01-02 08:00:00',
    title: 'Weekend Morning',
    content: '周末的早晨，睡到自然醒。今天计划去图书馆看书。选了几本关于产品设计和用户体验的书籍。在图书馆待了整个上午，非常安静和专注。',
    startTime: 54000000,
    endTime: 54300000,
    metadata: {
      source: 'Weekend Vlog',
      language: 'zh',
      videoTimestamp: '15:00:00'
    }
  },
  {
    id: 'evt_1704196800000_009',
    timestamp: '2024-01-02 12:00:00',
    title: 'Reading Session',
    content: '继续阅读。今天读到了关于设计系统的章节，很有启发。做了详细的笔记和思维导图。下午打算去咖啡馆继续学习。',
    startTime: 68400000,
    endTime: 68700000,
    metadata: {
      source: 'Weekend Vlog',
      language: 'zh',
      videoTimestamp: '19:00:00'
    }
  },
  {
    id: 'evt_1704211200000_010',
    timestamp: '2024-01-02 16:00:00',
    title: 'Creative Work',
    content: '下午在咖啡馆做了一些创意项目。用 Figma 设计了几个界面原型。尝试了新的设计风格，效果还不错。晚上准备和朋友聚餐。',
    startTime: 82800000,
    endTime: 83100000,
    metadata: {
      source: 'Creative Day Vlog',
      language: 'zh',
      videoTimestamp: '23:00:00'
    }
  },
  {
    id: 'evt_1704268800000_011',
    timestamp: '2024-01-03 08:00:00',
    title: 'New Week Planning',
    content: '新的一周开始了。早上花时间做了周计划，列出了这周要完成的任务清单。包括三个开发任务、两个学习目标和一个健身计划。感觉很有动力。',
    startTime: 140400000,
    endTime: 140700000,
    metadata: {
      source: 'Weekly Planning Vlog',
      language: 'zh',
      videoTimestamp: '39:00:00'
    }
  },
  {
    id: 'evt_1704279600000_012',
    timestamp: '2024-01-03 11:00:00',
    title: 'Team Meeting',
    content: '上午参加了团队会议。讨论了项目的进度和遇到的问题。分享了自己的想法和建议。会后和同事一起去吃了午餐，聊了聊工作之外的话题。',
    startTime: 151200000,
    endTime: 151500000,
    metadata: {
      source: 'Work Week Vlog',
      language: 'zh',
      videoTimestamp: '42:00:00'
    }
  }
];

// 确保目录存在
const outputDir = path.dirname('./test-data/timestamp-nodes.json');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 保存测试数据
fs.writeFileSync(
  './test-data/timestamp-nodes.json',
  JSON.stringify(testNodes, null, 2)
);

console.log('✅ 生成测试数据成功！');
console.log(`📊 节点数量: ${testNodes.length}`);
console.log(`📁 保存位置: ./test-data/timestamp-nodes.json`);
console.log('\n💡 下一步: 运行 "npm run setup-rag" 导入数据');
