/**
 * 修复标签数据脚本
 * 
 * 问题：StorageManager 中有损坏的标签数据（name 为空）
 * 解决：清空 StorageManager 中的标签，从 localStorage 重新导入
 * 
 * 使用方法：
 * 1. 在浏览器控制台中运行此脚本
 * 2. 刷新页面
 */

async function fixTagData() {
  console.log('🔧 [Fix] Starting tag data repair...');
  
  // 1. 检查 localStorage 中的标签数据
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const localStorageKey = isDevelopment ? '4dnote-dev-persistent-4dnote-hierarchical-tags' : '4dnote-hierarchical-tags';
  
  console.log(`📍 [Fix] Looking for localStorage key: ${localStorageKey}`);
  const rawData = localStorage.getItem(localStorageKey);
  
  if (!rawData) {
    console.error('❌ [Fix] No tags found in localStorage');
    return;
  }
  
  const parsed = JSON.parse(rawData);
  const localTags = parsed.value || parsed;
  
  console.log(`✅ [Fix] Found ${localTags.length} tags in localStorage:`, 
    localTags.map(t => ({ id: t.id, name: t.name, emoji: t.emoji, position: t.position }))
  );
  
  // 2. 清空 StorageManager 中的所有标签
  console.log('🗑️ [Fix] Clearing tags from StorageManager...');
  const result = await window.storageManagerInstance.queryTags({ limit: 1000 });
  console.log(`📊 [Fix] Found ${result.items.length} tags in StorageManager`);
  
  for (const tag of result.items) {
    await window.storageManagerInstance.hardDeleteTag(tag.id);
    console.log(`✅ [Fix] Deleted tag: ${tag.id} (name: "${tag.name}")`);
  }
  
  console.log('✅ [Fix] All tags cleared from StorageManager');
  
  // 3. 清空 IndexedDB 中的标签
  console.log('🗑️ [Fix] Clearing tags from IndexedDB...');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('4DNote', 6);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  
  const transaction = db.transaction(['tags'], 'readwrite');
  const store = transaction.objectStore('tags');
  await new Promise((resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  
  console.log('✅ [Fix] IndexedDB tags cleared');
  
  // 4. 提示刷新页面
  console.log('');
  console.log('✅ [Fix] Tag data repair completed!');
  console.log('🔄 [Fix] Please refresh the page to reload tags from localStorage');
  console.log('');
  console.log('Expected result:');
  console.log(`  - ${localTags.length} tags will be loaded from localStorage`);
  console.log(`  - Tags: ${localTags.map(t => t.name).join(', ')}`);
}

// 运行修复
fixTagData().catch(error => {
  console.error('❌ [Fix] Failed to fix tag data:', error);
});
