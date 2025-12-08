/**
 * 清理事件历史记录脚本
 * 
 * 用途：
 * 1. 清理 localStorage 中的 4dnote_event_history
 * 2. 只保留最近 30 天的记录
 * 3. 或只保留最近 1000 条记录
 * 
 * 使用方法：
 * 1. 在浏览器控制台执行：
 *    > const script = document.createElement('script');
 *    > script.src = '/scripts/cleanup-event-history.js';
 *    > document.head.appendChild(script);
 * 
 * 2. 或直接复制此文件内容到控制台执行
 */

(function() {
  const HISTORY_STORAGE_KEY = '4dnote_event_history';
  const RETENTION_DAYS = 30;
  const MAX_COUNT = 1000;

  console.log('🧹 开始清理事件历史记录...');

  try {
    // 1. 读取现有历史
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) {
      console.log('✅ 没有历史记录需要清理');
      return;
    }

    const logs = JSON.parse(stored);
    console.log(`📊 当前历史记录数量：${logs.length} 条`);

    // 2. 按时间过滤（保留最近 30 天）
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffMs = cutoffDate.getTime();

    const recentLogs = logs.filter(log => {
      try {
        const logDate = new Date(log.timestamp.replace(' ', 'T'));
        return logDate.getTime() >= cutoffMs;
      } catch {
        return false; // 无效时间戳，丢弃
      }
    });

    console.log(`📅 保留最近 ${RETENTION_DAYS} 天的记录：${recentLogs.length} 条`);

    // 3. 如果仍然过多，只保留最近的记录
    let finalLogs = recentLogs;
    if (recentLogs.length > MAX_COUNT) {
      finalLogs = recentLogs.slice(-MAX_COUNT);
      console.log(`✂️ 限制数量到 ${MAX_COUNT} 条`);
    }

    // 4. 保存清理后的数据
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(finalLogs));

    // 5. 显示结果
    const beforeSize = stored.length * 2; // 估算字节数
    const afterSize = JSON.stringify(finalLogs).length * 2;
    const savedSize = beforeSize - afterSize;

    console.log('✅ 清理完成！');
    console.log(`📊 清理统计：`);
    console.log(`  - 删除记录：${logs.length - finalLogs.length} 条`);
    console.log(`  - 保留记录：${finalLogs.length} 条`);
    console.log(`  - 释放空间：${(savedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - 当前占用：${(afterSize / 1024 / 1024).toFixed(2)} MB`);

    // 6. 建议
    if (finalLogs.length > 800) {
      console.warn('⚠️ 历史记录仍然较多，建议定期清理或禁用历史记录功能');
    }

  } catch (error) {
    console.error('❌ 清理失败:', error);
  }
})();
