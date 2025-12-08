/**
 * 🔄 重置同步状态
 * 清空 IndexMap 和 ActionQueue，让同步从干净状态重新开始
 * 
 * 用途：
 * - 修复 IndexMap 损坏导致的队列爆炸问题
 * - 清理历史遗留的错误同步状态
 * - 在同步机制升级后重置状态
 * 
 * 使用方法：
 * 1. 关闭所有 4DNote 窗口
 * 2. 在浏览器 Console 中运行此脚本
 * 3. 重新打开 4DNote
 */

(function() {
  console.log('🔄 [Reset Sync State] Starting cleanup...');
  
  // 1. 清空 IndexMap (localStorage)
  const indexMapKey = 'sync_indexmap';
  const oldIndexMap = localStorage.getItem(indexMapKey);
  if (oldIndexMap) {
    const entries = JSON.parse(oldIndexMap);
    console.log(`🗺️ [IndexMap] Found ${entries.length} entries, removing...`);
    localStorage.removeItem(indexMapKey);
    console.log(`✅ [IndexMap] Cleared`);
  } else {
    console.log(`ℹ️ [IndexMap] No data found`);
  }
  
  // 2. 清空 ActionQueue (IndexedDB)
  console.log('📦 [ActionQueue] Opening IndexedDB...');
  const request = indexedDB.open('4DNoteDB', 2);
  
  request.onerror = () => {
    console.error('❌ [ActionQueue] Failed to open IndexedDB:', request.error);
  };
  
  request.onsuccess = () => {
    const db = request.result;
    
    if (!db.objectStoreNames.contains('syncQueue')) {
      console.log('ℹ️ [ActionQueue] No syncQueue store found');
      db.close();
      return;
    }
    
    const transaction = db.transaction(['syncQueue'], 'readwrite');
    const store = transaction.objectStore('syncQueue');
    
    // 先统计数量
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      const count = countRequest.result;
      console.log(`📦 [ActionQueue] Found ${count} actions, removing...`);
      
      // 清空
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => {
        console.log(`✅ [ActionQueue] Cleared`);
        
        console.log('\n🎉 [Reset Sync State] Cleanup complete!');
        console.log('📝 Next steps:');
        console.log('   1. Close all 4DNote windows');
        console.log('   2. Reopen 4DNote');
        console.log('   3. IndexMap will be rebuilt from scratch on first sync');
        
        db.close();
      };
      clearRequest.onerror = () => {
        console.error('❌ [ActionQueue] Failed to clear:', clearRequest.error);
        db.close();
      };
    };
    countRequest.onerror = () => {
      console.error('❌ [ActionQueue] Failed to count:', countRequest.error);
      db.close();
    };
  };
  
  request.onupgradeneeded = () => {
    console.log('ℹ️ [ActionQueue] Database needs upgrade, skipping cleanup');
  };
})();
