/**
 * 数据迁移脚本：从 ReMarkable 到 4DNote
 * 
 * 用途：清理改名前遗留的 localStorage 数据
 * 执行：在浏览器控制台运行此脚本
 */

(function migrateFromRemarkable() {
  console.log('🚀 开始数据迁移：ReMarkable → 4DNote');
  
  // 1. 统计旧数据
  const oldKeys = [];
  let oldDataSize = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('remarkable') || key.includes('ReMarkable'))) {
      const value = localStorage.getItem(key);
      const size = value ? value.length : 0;
      oldKeys.push({ key, size });
      oldDataSize += size;
    }
  }
  
  if (oldKeys.length === 0) {
    console.log('✅ 未发现旧版本数据，无需迁移');
    return;
  }
  
  console.log(`\n📊 发现 ${oldKeys.length} 个旧键，总大小 ${(oldDataSize / 1024 / 1024).toFixed(2)} MB:`);
  oldKeys.forEach(({ key, size }) => {
    console.log(`   - ${key}: ${(size / 1024 / 1024).toFixed(3)} MB`);
  });
  
  // 2. 备份提示
  console.log('\n⚠️  准备删除旧数据...');
  console.log('   如果需要保留数据，请手动备份以下内容：');
  oldKeys.forEach(({ key }) => {
    console.log(`   localStorage.getItem('${key}')`);
  });
  
  // 3. 确认删除
  const confirmed = confirm(
    `发现 ${oldKeys.length} 个旧版本 (ReMarkable) 的 localStorage 键，` +
    `总大小 ${(oldDataSize / 1024 / 1024).toFixed(2)} MB。\n\n` +
    `是否删除这些旧数据？\n\n` +
    `（建议删除，释放存储空间）`
  );
  
  if (!confirmed) {
    console.log('❌ 用户取消，保留旧数据');
    return;
  }
  
  // 4. 执行删除
  let deletedCount = 0;
  let deletedSize = 0;
  
  oldKeys.forEach(({ key, size }) => {
    try {
      localStorage.removeItem(key);
      deletedCount++;
      deletedSize += size;
      console.log(`✅ 已删除: ${key}`);
    } catch (error) {
      console.error(`❌ 删除失败: ${key}`, error);
    }
  });
  
  // 5. 清理新版本的 EventHistory（如果过大）
  try {
    const newHistoryKey = '4dnote_event_history';
    const newHistory = localStorage.getItem(newHistoryKey);
    
    if (newHistory) {
      const logs = JSON.parse(newHistory);
      const historySize = newHistory.length;
      
      console.log(`\n📋 检查新版 EventHistory: ${logs.length} 条记录 (${(historySize / 1024 / 1024).toFixed(2)} MB)`);
      
      // 如果超过 1000 条或 1MB，只保留最近 100 条
      if (logs.length > 1000 || historySize > 1024 * 1024) {
        const trimmed = logs.slice(-100);
        localStorage.setItem(newHistoryKey, JSON.stringify(trimmed));
        console.log(`✂️  EventHistory 已裁剪至 100 条`);
      }
    }
  } catch (error) {
    console.warn('⚠️  清理 EventHistory 失败:', error);
  }
  
  // 6. 计算最终结果
  let finalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const value = localStorage.getItem(localStorage.key(i));
    finalSize += value ? value.length : 0;
  }
  
  console.log(`\n✅ 迁移完成！`);
  console.log(`   删除键数: ${deletedCount}`);
  console.log(`   释放空间: ${(deletedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   当前占用: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   可用空间: ${((5 - finalSize / 1024 / 1024)).toFixed(2)} MB (假设限制为 5MB)`);
  
  console.log('\n🎉 建议刷新页面以确保应用正常工作');
})();
