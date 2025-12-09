/**
 * 标签系统诊断脚本
 * 在浏览器控制台运行，检查 TagManager 和 TagService 的数据链路
 */

async function diagnoseTags() {
  console.log('='.repeat(80));
  console.log('🔍 标签系统诊断开始');
  console.log('='.repeat(80));

  // 1. 检查 localStorage
  console.log('\n📦 1. 检查 localStorage');
  console.log('-'.repeat(80));
  const devKey = '4dnote-dev-persistent-4dnote-hierarchical-tags';
  const prodKey = '4dnote-hierarchical-tags';
  
  const devData = localStorage.getItem(devKey);
  const prodData = localStorage.getItem(prodKey);
  
  console.log('开发环境 key:', devKey);
  if (devData) {
    const parsed = JSON.parse(devData);
    console.log('✅ 找到数据:', parsed.value?.length, '个标签');
    console.table(parsed.value?.map(t => ({
      id: t.id,
      name: t.name,
      parentId: t.parentId || '(根标签)',
      emoji: t.emoji
    })));
  } else {
    console.log('❌ 未找到数据');
  }
  
  console.log('\n生产环境 key:', prodKey);
  if (prodData) {
    const parsed = JSON.parse(prodData);
    console.log('✅ 找到数据:', parsed.value?.length || parsed.length, '个标签');
  } else {
    console.log('❌ 未找到数据');
  }

  // 2. 检查 IndexedDB
  console.log('\n📦 2. 检查 IndexedDB');
  console.log('-'.repeat(80));
  const dbRequest = indexedDB.open('4DNote', 6);
  
  await new Promise((resolve, reject) => {
    dbRequest.onsuccess = async (event) => {
      const db = event.target.result;
      const tx = db.transaction('tags', 'readonly');
      const store = tx.objectStore('tags');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const tags = getAllRequest.result;
        console.log('IndexedDB 中的标签数量:', tags.length);
        if (tags.length > 0) {
          console.table(tags.map(t => ({
            id: t.id,
            name: t.name,
            parentId: t.parentId || '(根标签)',
            emoji: t.emoji,
            createdAt: t.createdAt
          })));
        }
        resolve();
      };
      
      getAllRequest.onerror = () => {
        console.error('❌ 读取 IndexedDB 失败:', getAllRequest.error);
        reject();
      };
    };
    
    dbRequest.onerror = () => {
      console.error('❌ 打开 IndexedDB 失败:', dbRequest.error);
      reject();
    };
  });

  // 3. 检查 TagService 内存状态
  console.log('\n📦 3. 检查 TagService 内存状态');
  console.log('-'.repeat(80));
  const { TagService } = await import('../src/services/TagService.js');
  
  console.log('TagService.isInitialized():', TagService.isInitialized());
  
  const hierarchicalTags = TagService.getTags();
  console.log('TagService.getTags() 返回:', hierarchicalTags.length, '个根标签');
  if (hierarchicalTags.length > 0) {
    console.table(hierarchicalTags.map(t => ({
      id: t.id,
      name: t.name,
      childrenCount: t.children?.length || 0
    })));
  }
  
  const flatTags = TagService.getFlatTags();
  console.log('TagService.getFlatTags() 返回:', flatTags.length, '个标签（含子标签）');
  if (flatTags.length > 0) {
    console.table(flatTags.map(t => ({
      id: t.id,
      name: t.name,
      parentId: t.parentId || '(根标签)',
      level: t.level
    })));
  }

  // 4. 检查数据一致性
  console.log('\n📦 4. 检查数据一致性');
  console.log('-'.repeat(80));
  
  const localStorageTags = devData ? JSON.parse(devData).value : (prodData ? JSON.parse(prodData) : []);
  const indexedDBTags = await new Promise((resolve) => {
    const dbRequest = indexedDB.open('4DNote', 6);
    dbRequest.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction('tags', 'readonly');
      const store = tx.objectStore('tags');
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
    };
  });
  
  console.log('localStorage 标签数:', localStorageTags.length);
  console.log('IndexedDB 标签数:', indexedDBTags.length);
  console.log('TagService flatTags 数:', flatTags.length);
  console.log('TagService hierarchicalTags 根数:', hierarchicalTags.length);
  
  if (localStorageTags.length !== indexedDBTags.length) {
    console.warn('⚠️ localStorage 和 IndexedDB 数据不一致！');
  } else {
    console.log('✅ localStorage 和 IndexedDB 数据数量一致');
  }
  
  if (indexedDBTags.length !== flatTags.length) {
    console.warn('⚠️ IndexedDB 和 TagService flatTags 数据不一致！');
  } else {
    console.log('✅ IndexedDB 和 TagService flatTags 数据数量一致');
  }

  // 5. 检查 ID 格式
  console.log('\n📦 5. 检查 ID 格式');
  console.log('-'.repeat(80));
  
  const checkIdFormat = (tags, source) => {
    const invalidIds = tags.filter(t => !t.id.startsWith('tag_'));
    if (invalidIds.length > 0) {
      console.warn(`⚠️ ${source} 中有 ${invalidIds.length} 个无效 ID:`);
      console.table(invalidIds.map(t => ({ id: t.id, name: t.name })));
    } else {
      console.log(`✅ ${source} 所有 ID 格式正确`);
    }
  };
  
  checkIdFormat(localStorageTags, 'localStorage');
  checkIdFormat(indexedDBTags, 'IndexedDB');
  checkIdFormat(flatTags, 'TagService');

  console.log('\n' + '='.repeat(80));
  console.log('🔍 诊断完成');
  console.log('='.repeat(80));
}

// 运行诊断
diagnoseTags().catch(err => console.error('诊断失败:', err));
