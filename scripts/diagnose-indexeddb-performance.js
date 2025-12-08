/**
 * 🔍 IndexedDB 性能诊断工具
 * 
 * 问题：查询耗时 273 秒，严重异常
 * 
 * 可能原因：
 * 1. 索引损坏或缺失
 * 2. 数据库文件膨胀（大量删除后未压缩）
 * 3. 事务死锁或长时间持有读锁
 * 4. 浏览器缓存/配额问题
 * 5. 数据碎片化严重
 */

console.log('🔍 Starting IndexedDB Performance Diagnosis...\n');

const DB_NAME = '4DNote';
const DB_VERSION = 10;

async function diagnose() {
  try {
    // ==================== 1. 打开数据库 ====================
    console.log('📂 Opening database...');
    const openStart = performance.now();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        console.warn('⚠️ Upgrade triggered - this should not happen in diagnosis mode');
      };
    });
    const openDuration = performance.now() - openStart;
    console.log(`✅ Database opened in ${openDuration.toFixed(1)}ms\n`);

    // ==================== 2. 检查 ObjectStores ====================
    console.log('📊 Checking object stores...');
    const storeNames = Array.from(db.objectStoreNames);
    console.log(`Found ${storeNames.length} stores: ${storeNames.join(', ')}\n`);

    // ==================== 3. 检查 Events Store ====================
    if (!storeNames.includes('events')) {
      console.error('❌ Events store not found!');
      db.close();
      return;
    }

    console.log('🔍 Analyzing events store...');
    const tx = db.transaction('events', 'readonly');
    const store = tx.objectStore('events');

    // 检查索引
    console.log('\n📌 Indexes:');
    const indexNames = Array.from(store.indexNames);
    console.log(`  - Found ${indexNames.length} indexes: ${indexNames.join(', ')}`);
    
    if (!indexNames.includes('startTime')) {
      console.error('  ❌ Missing critical index: startTime');
    } else {
      console.log('  ✅ startTime index exists');
    }

    // ==================== 4. 测试查询性能 ====================
    console.log('\n⚡ Running performance tests...\n');

    // Test 1: Count all records
    console.log('Test 1: Count all records');
    const countStart = performance.now();
    const count = await new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const countDuration = performance.now() - countStart;
    console.log(`  ✅ Total records: ${count} in ${countDuration.toFixed(1)}ms`);

    // Test 2: Get first 10 records using getAll
    console.log('\nTest 2: Get first 10 records (getAll with limit)');
    const getAllStart = performance.now();
    const sampleEvents = await new Promise((resolve, reject) => {
      const request = store.getAll(undefined, 10);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const getAllDuration = performance.now() - getAllStart;
    console.log(`  ✅ Retrieved ${sampleEvents.length} events in ${getAllDuration.toFixed(1)}ms`);

    // Test 3: Get ALL records using getAll
    console.log('\nTest 3: Get ALL records (getAll without limit)');
    console.log('  ⏳ This may take a while if database is corrupted...');
    const fullGetAllStart = performance.now();
    const allEvents = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      
      // Add timeout to detect hangs
      setTimeout(() => {
        reject(new Error('Query timeout after 30 seconds'));
      }, 30000);
    });
    const fullGetAllDuration = performance.now() - fullGetAllStart;
    console.log(`  ✅ Retrieved ${allEvents.length} events in ${fullGetAllDuration.toFixed(1)}ms`);
    
    // Analyze performance
    if (fullGetAllDuration > 1000) {
      console.warn(`  ⚠️ SLOW QUERY: ${fullGetAllDuration.toFixed(1)}ms for ${allEvents.length} records`);
      console.warn(`     Expected: <500ms for ${allEvents.length} records`);
      console.warn(`     Performance degradation: ${(fullGetAllDuration / 500).toFixed(1)}x slower`);
    }

    // Test 4: Index query performance
    console.log('\nTest 4: Query using startTime index');
    const indexQueryStart = performance.now();
    const index = store.index('startTime');
    const indexedEvents = await new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const indexQueryDuration = performance.now() - indexQueryStart;
    console.log(`  ✅ Retrieved ${indexedEvents.length} events via index in ${indexQueryDuration.toFixed(1)}ms`);

    // Test 5: Cursor iteration (should be slower but more memory efficient)
    console.log('\nTest 5: Cursor iteration (sample 100 records)');
    const cursorStart = performance.now();
    let cursorCount = 0;
    await new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && cursorCount < 100) {
          cursorCount++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
    const cursorDuration = performance.now() - cursorStart;
    console.log(`  ✅ Iterated ${cursorCount} records via cursor in ${cursorDuration.toFixed(1)}ms`);

    // ==================== 5. 数据质量检查 ====================
    console.log('\n🔍 Data quality analysis...');
    
    // Sample size of events
    const sampleSize = Math.min(100, allEvents.length);
    const samples = allEvents.slice(0, sampleSize);
    
    let totalSize = 0;
    let maxSize = 0;
    let maxSizeEvent = null;
    
    samples.forEach(event => {
      const size = JSON.stringify(event).length;
      totalSize += size;
      if (size > maxSize) {
        maxSize = size;
        maxSizeEvent = event;
      }
    });
    
    const avgSize = totalSize / sampleSize;
    const estimatedTotalSize = avgSize * allEvents.length;
    
    console.log(`  - Average event size: ${avgSize.toFixed(0)} bytes`);
    console.log(`  - Largest event size: ${maxSize} bytes`);
    console.log(`  - Estimated total size: ${(estimatedTotalSize / 1024 / 1024).toFixed(2)} MB`);
    
    if (maxSize > 100000) {
      console.warn(`  ⚠️ Large event detected: ${maxSize} bytes`);
      console.warn(`     Event ID: ${maxSizeEvent?.id}`);
    }

    // Check for deleted events
    const deletedCount = allEvents.filter(e => e.deletedAt).length;
    const deletedRatio = (deletedCount / allEvents.length * 100).toFixed(1);
    console.log(`  - Deleted events: ${deletedCount} (${deletedRatio}%)`);
    
    if (deletedCount > allEvents.length * 0.3) {
      console.warn(`  ⚠️ HIGH deletion ratio: ${deletedRatio}%`);
      console.warn('     Recommend running cleanup to remove soft-deleted events');
    }

    // ==================== 6. 存储配额检查 ====================
    console.log('\n💾 Storage quota check...');
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usedMB = (estimate.usage / 1024 / 1024).toFixed(2);
      const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
      const usagePercent = (estimate.usage / estimate.quota * 100).toFixed(1);
      
      console.log(`  - Used: ${usedMB} MB`);
      console.log(`  - Quota: ${quotaMB} MB`);
      console.log(`  - Usage: ${usagePercent}%`);
      
      if (estimate.usage / estimate.quota > 0.8) {
        console.warn(`  ⚠️ Storage usage is high: ${usagePercent}%`);
      }
    }

    // ==================== 7. 总结和建议 ====================
    console.log('\n📋 DIAGNOSIS SUMMARY');
    console.log('='.repeat(50));
    
    if (fullGetAllDuration > 10000) {
      console.error('❌ CRITICAL: Query performance is severely degraded');
      console.error('   Root cause likely:');
      console.error('   1. Database file corruption or excessive fragmentation');
      console.error('   2. Browser storage system under heavy load');
      console.error('   3. Antivirus software interfering with disk I/O');
      console.log('\n   RECOMMENDED ACTIONS:');
      console.log('   □ Close all other tabs and applications');
      console.log('   □ Run database rebuild (export → delete → import)');
      console.log('   □ Check browser storage folder permissions');
      console.log('   □ Consider migrating to a new database instance');
    } else if (fullGetAllDuration > 1000) {
      console.warn('⚠️ WARNING: Query performance is degraded');
      console.log('\n   RECOMMENDED ACTIONS:');
      console.log('   □ Clean up soft-deleted events');
      console.log('   □ Rebuild indexes');
      console.log('   □ Check for background sync processes');
    } else {
      console.log('✅ Database performance is normal');
    }

    // Close database
    db.close();
    console.log('\n✅ Diagnosis complete');

  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
  }
}

// Run diagnosis
diagnose();
