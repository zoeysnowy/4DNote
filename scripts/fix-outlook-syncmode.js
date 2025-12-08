/**
 * 🔧 修复 Outlook 同步事件的 syncMode
 * 
 * 问题：历史 Outlook 事件的 syncMode 为 'receive-only'（旧逻辑）
 * 解决：将所有 Outlook 事件的 syncMode 更新为 'bidirectional-private'
 * 
 * 运行方式：在浏览器控制台执行此脚本（需要先打开 4DNote 应用）
 */

(async function fixOutlookSyncMode() {
  console.log('🚀 [Migration] 开始修复 Outlook 事件 syncMode...');
  
  // 1. 获取 StorageManager 实例（优先使用全局，否则动态导入）
  let storageManager = window.storageManagerInstance;
  
  if (!storageManager) {
    console.log('📦 [Migration] 从模块动态导入 StorageManager...');
    try {
      const module = await import('/src/services/storage/StorageManager.ts');
      storageManager = module.storageManager || module.default;
      
      if (!storageManager) {
        console.error('❌ [Migration] 无法获取 StorageManager 实例！');
        console.error('   请确保应用正在运行或重启后再试');
        return;
      }
      console.log('✅ [Migration] StorageManager 加载成功');
    } catch (error) {
      console.error('❌ [Migration] 加载失败:', error);
      return;
    }
  } else {
    console.log('✅ [Migration] 使用全局 StorageManager 实例');
  }
  
  const result = await storageManager.queryEvents({
    filters: {},
    limit: 10000
  });
  
  const outlookEvents = result.items.filter(e => 
    e.id.startsWith('outlook-') || 
    e.source === 'outlook' ||
    e.calendarIds?.some(cid => cid.startsWith('outlook-'))
  );
  
  console.log(`📊 [Migration] 找到 ${outlookEvents.length} 个 Outlook 事件`);
  
  // 2. 统计当前 syncMode 分布
  const syncModeStats = {};
  outlookEvents.forEach(e => {
    const mode = e.syncMode || 'undefined';
    syncModeStats[mode] = (syncModeStats[mode] || 0) + 1;
  });
  
  console.log('📊 [Migration] 当前 syncMode 分布:', syncModeStats);
  
  // 3. 筛选需要修复的事件（syncMode 不是 bidirectional-private）
  const needsFixEvents = outlookEvents.filter(e => 
    e.syncMode !== 'bidirectional-private'
  );
  
  console.log(`🔧 [Migration] 需要修复 ${needsFixEvents.length} 个事件`);
  
  if (needsFixEvents.length === 0) {
    console.log('✅ [Migration] 所有事件已是最新状态，无需修复');
    return;
  }
  
  // 4. 确认操作
  const confirmed = confirm(
    `将修复 ${needsFixEvents.length} 个 Outlook 事件的 syncMode:\n` +
    `${Object.entries(syncModeStats).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n\n` +
    `全部改为: bidirectional-private\n\n` +
    `是否继续？`
  );
  
  if (!confirmed) {
    console.log('❌ [Migration] 用户取消操作');
    return;
  }
  
  // 5. 批量更新
  let successCount = 0;
  let failCount = 0;
  
  for (const event of needsFixEvents) {
    try {
      await storageManager.updateEvent(event.id, {
        syncMode: 'bidirectional-private'
      });
      successCount++;
      
      if (successCount % 50 === 0) {
        console.log(`⏳ [Migration] 进度: ${successCount}/${needsFixEvents.length}`);
      }
    } catch (error) {
      console.error(`❌ [Migration] 更新失败: ${event.id}`, error);
      failCount++;
    }
  }
  
  console.log('✅ [Migration] 完成!', {
    总数: needsFixEvents.length,
    成功: successCount,
    失败: failCount
  });
  
  // 6. 验证结果
  const verifyResult = await storageManager.queryEvents({
    filters: {},
    limit: 10000
  });
  
  const verifyOutlookEvents = verifyResult.items.filter(e => 
    e.id.startsWith('outlook-') || 
    e.source === 'outlook' ||
    e.calendarIds?.some(cid => cid.startsWith('outlook-'))
  );
  
  const newStats = {};
  verifyOutlookEvents.forEach(e => {
    const mode = e.syncMode || 'undefined';
    newStats[mode] = (newStats[mode] || 0) + 1;
  });
  
  console.log('📊 [Migration] 修复后 syncMode 分布:', newStats);
  
})();
