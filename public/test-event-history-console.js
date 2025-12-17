// ========================================
// EventHistory 测试命令集
// 在浏览器控制台中运行这些命令来测试历史记录功能
// ========================================

// 🔧 1. 初始化（首先运行）
const { EventHistoryService } = await import('/src/services/EventHistoryService.ts');
const { storageManager } = await import('/src/services/storage/StorageManager.ts');
const { default: EventService } = await import('/src/services/EventService.ts');

// ========================================
// 📊 统计查询
// ========================================

// 查看基本统计
const stats = await EventHistoryService.getBasicStatistics();
console.log('📊 基本统计:', stats);
console.log(`  总记录: ${stats.total}`);
console.log(`  Create: ${stats.byOperation?.create || 0}`);
console.log(`  Update: ${stats.byOperation?.update || 0}`);
console.log(`  Delete: ${stats.byOperation?.delete || 0}`);
console.log(`  Backfill: ${stats.bySource?.['backfill-from-timestamp'] || 0}`);
console.log(`  最旧记录: ${stats.oldestRecord}`);

// 查看详细统计
const detailedStats = await EventHistoryService.getStatistics();
console.log('📈 详细统计:', detailedStats);

// ========================================
// 📜 查询历史记录
// ========================================

// 查询最近 20 条记录
const recent = await EventHistoryService.queryHistory({ limit: 20 });
console.log('📜 最近 20 条:', recent);

// 查询特定事件的历史
const eventHistory = await EventHistoryService.queryHistory({
  eventId: 'your-event-id-here',
  limit: 100
});
console.log('📝 事件历史:', eventHistory);

// 查询特定操作类型
const creates = await EventHistoryService.queryHistory({
  operation: 'create',
  limit: 50
});
console.log('➕ Create 操作:', creates);

// 查询特定时间范围
const rangeHistory = await EventHistoryService.queryHistory({
  startTime: '2025-12-01 00:00:00',
  endTime: '2025-12-15 23:59:59',
  limit: 1000
});
console.log('📅 时间范围查询:', rangeHistory);

// ========================================
// 🧪 测试 extractChanges 修复
// ========================================

// 测试：只添加 Block Timestamp 元数据（不应记录变更）
const testBlockTimestamp = async () => {
  console.log('🧪 测试 1: Block Timestamp 元数据变化');
  
  const before = {
    id: 'test-' + Date.now(),
    title: { simpleTitle: '测试事件' },
    eventlog: {
      slateJson: JSON.stringify([
        { type: 'paragraph', children: [{ text: '原始内容' }] }
      ])
    }
  };
  
  const event = await EventService.createEvent(before, { source: 'test' });
  
  // 添加 Block Timestamp 元数据
  await EventService.updateEvent(event.id, {
    eventlog: {
      slateJson: JSON.stringify([
        { type: 'paragraph', createdAt: Date.now(), children: [{ text: '原始内容' }] }
      ])
    }
  }, { source: 'test' });
  
  // 查询历史
  const history = await EventHistoryService.queryHistory({
    eventId: event.id,
    limit: 10
  });
  
  const updateLogs = history.filter(h => h.operation === 'update');
  
  console.log(`  结果: ${updateLogs.length} 个 update 记录`);
  console.log(`  ✅ 预期: 0 个 update 记录（因为只是元数据变化）`);
  console.log(`  ${updateLogs.length === 0 ? '✅ 通过' : '❌ 失败'}`);
  
  // 清理
  await EventService.deleteEvent(event.id);
  
  return updateLogs.length === 0;
};

// 测试：实际内容变更（应该记录）
const testContentChange = async () => {
  console.log('🧪 测试 2: 实际内容变更');
  
  const before = {
    id: 'test-' + Date.now(),
    title: { simpleTitle: '测试事件' },
    eventlog: {
      slateJson: JSON.stringify([
        { type: 'paragraph', children: [{ text: '原始内容' }] }
      ])
    }
  };
  
  const event = await EventService.createEvent(before, { source: 'test' });
  
  // 修改实际内容
  await EventService.updateEvent(event.id, {
    eventlog: {
      slateJson: JSON.stringify([
        { type: 'paragraph', children: [{ text: '修改后的内容' }] }
      ])
    }
  }, { source: 'test' });
  
  // 查询历史
  const history = await EventHistoryService.queryHistory({
    eventId: event.id,
    limit: 10
  });
  
  const updateLogs = history.filter(h => h.operation === 'update');
  
  console.log(`  结果: ${updateLogs.length} 个 update 记录`);
  console.log(`  变更字段: ${updateLogs[0]?.changes?.map(c => c.field).join(', ') || '无'}`);
  console.log(`  ✅ 预期: 1 个 update 记录（eventlog 字段变更）`);
  console.log(`  ${updateLogs.length > 0 ? '✅ 通过' : '❌ 失败'}`);
  
  // 清理
  await EventService.deleteEvent(event.id);
  
  return updateLogs.length > 0;
};

// 运行所有测试
const runTests = async () => {
  console.log('🧪 开始测试 extractChanges 修复...\n');
  
  const test1 = await testBlockTimestamp();
  const test2 = await testContentChange();
  
  console.log('\n📊 测试总结:');
  console.log(`  测试 1 (Block Timestamp): ${test1 ? '✅ 通过' : '❌ 失败'}`);
  console.log(`  测试 2 (内容变更): ${test2 ? '✅ 通过' : '❌ 失败'}`);
  console.log(`  总体: ${test1 && test2 ? '✅ 全部通过' : '❌ 存在失败'}`);
};

// ========================================
// 🔍 诊断工具
// ========================================

// 检查重复记录
const checkDuplicates = async () => {
  console.log('🔍 检查重复记录...');
  
  const logs = await EventHistoryService.queryHistory({ limit: 10000 });
  const seen = new Map();
  const duplicates = [];
  
  logs.forEach(log => {
    const key = `${log.eventId}|${log.operation}|${log.timestamp}`;
    if (seen.has(key)) {
      duplicates.push({ original: seen.get(key), duplicate: log });
    } else {
      seen.set(key, log);
    }
  });
  
  console.log(`✅ 检查完成: 找到 ${duplicates.length} 组重复记录`);
  
  if (duplicates.length > 0) {
    console.log('重复记录示例:', duplicates.slice(0, 5));
  }
  
  return duplicates;
};

// 查找频繁更新的事件
const findFrequentUpdates = async () => {
  console.log('🔍 查找频繁更新的事件...');
  
  const logs = await EventHistoryService.queryHistory({ 
    operation: 'update',
    limit: 5000 
  });
  
  const updateCounts = new Map();
  
  logs.forEach(log => {
    const count = updateCounts.get(log.eventId) || 0;
    updateCounts.set(log.eventId, count + 1);
  });
  
  const sorted = Array.from(updateCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  console.log('Top 10 频繁更新的事件:');
  sorted.forEach(([eventId, count], index) => {
    console.log(`  ${index + 1}. ${eventId?.slice(-8)}: ${count} 次更新`);
  });
  
  return sorted;
};

// 分析 Backfill 记录
const analyzeBackfill = async () => {
  console.log('🔍 分析 Backfill 记录...');
  
  const backfillLogs = await EventHistoryService.queryHistory({
    source: 'backfill-from-timestamp',
    limit: 5000
  });
  
  console.log(`  总计: ${backfillLogs.length} 条 Backfill 记录`);
  
  const byOperation = {};
  backfillLogs.forEach(log => {
    byOperation[log.operation] = (byOperation[log.operation] || 0) + 1;
  });
  
  console.log('  按操作分类:', byOperation);
  
  return backfillLogs;
};

// ========================================
// 🧹 清理操作
// ========================================

// 运行自动清理
const runCleanup = async () => {
  console.log('🧹 运行自动清理...');
  
  const deleted = await EventHistoryService.autoCleanup();
  
  console.log(`✅ 清理完成: 删除 ${deleted} 条记录`);
  
  // 重新查看统计
  const newStats = await EventHistoryService.getBasicStatistics();
  console.log('📊 清理后统计:', newStats);
  
  return deleted;
};

// 清理 Backfill 记录
const cleanBackfill = async () => {
  console.log('🧹 清理 Backfill 记录...');
  
  const backfillLogs = await EventHistoryService.queryHistory({
    source: 'backfill-from-timestamp',
    limit: 10000
  });
  
  console.log(`  找到 ${backfillLogs.length} 条 Backfill 记录`);
  
  let deleted = 0;
  for (const log of backfillLogs) {
    await storageManager.deleteEventHistory(log.id);
    deleted++;
    
    if (deleted % 100 === 0) {
      console.log(`  已删除 ${deleted}/${backfillLogs.length}`);
    }
  }
  
  console.log(`✅ 清理完成: 删除 ${deleted} 条 Backfill 记录`);
  
  return deleted;
};

// 清理重复记录
const cleanDuplicates = async () => {
  console.log('🧹 清理重复记录...');
  
  const duplicates = await checkDuplicates();
  
  if (duplicates.length === 0) {
    console.log('✅ 没有重复记录');
    return 0;
  }
  
  console.log(`  开始删除 ${duplicates.length} 条重复记录...`);
  
  for (const { duplicate } of duplicates) {
    await storageManager.deleteEventHistory(duplicate.id);
  }
  
  console.log(`✅ 清理完成: 删除 ${duplicates.length} 条重复记录`);
  
  return duplicates.length;
};

// ========================================
// 🚀 快速命令
// ========================================

console.log(`
========================================
🧪 EventHistory 测试命令已加载
========================================

📊 统计查询:
  stats                    - 查看基本统计
  detailedStats            - 查看详细统计
  recent                   - 最近 20 条记录

🧪 测试:
  runTests()              - 运行所有测试
  testBlockTimestamp()    - 测试 Block Timestamp 修复
  testContentChange()     - 测试内容变更检测

🔍 诊断:
  checkDuplicates()       - 检查重复记录
  findFrequentUpdates()   - 查找频繁更新的事件
  analyzeBackfill()       - 分析 Backfill 记录

🧹 清理:
  runCleanup()           - 运行自动清理
  cleanBackfill()        - 清理 Backfill 记录
  cleanDuplicates()      - 清理重复记录

========================================
`);
