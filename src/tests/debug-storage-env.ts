/**
 * 存储模块调试工具
 * 
 * 在控制台运行以检查存储模块状态
 */

// 自动暴露到全局
if (typeof window !== 'undefined') {
  (window as any).checkStorageEnv = function() {
    console.log('🔍 Storage Environment Check');
    console.log('═══════════════════════════════════════');
    
    // 1. 检查环境
    console.log('\n1️⃣  Environment:');
    console.log('   - NODE_ENV:', process.env.NODE_ENV);
    console.log('   - window exists:', typeof window !== 'undefined');
    console.log('   - Electron:', typeof (window as any).electronAPI !== 'undefined');
    console.log('   - electronAPI.isElectron:', (window as any).electronAPI?.isElectron);
    
    // 2. 检查测试函数
    console.log('\n2️⃣  Test Functions:');
    console.log('   - testStorageModule:', typeof (window as any).testStorageModule);
    console.log('   - testSQLiteModule:', typeof (window as any).testSQLiteModule);
    
    // 3. 检查存储服务
    console.log('\n3️⃣  Storage Services:');
    try {
      const { storageManager } = require('@backend/storage');
      console.log('   - StorageManager:', storageManager ? '✅ Available' : '❌ Not available');
    } catch (e) {
      console.log('   - StorageManager: ❌ Import failed');
    }
    
    // 4. 建议
    console.log('\n💡 Suggestions:');
    if (typeof (window as any).electronAPI === 'undefined') {
      console.log('   ⚠️  Not in Electron environment');
      console.log('   → Run: npm run e');
    } else {
      if (typeof (window as any).testSQLiteModule === 'undefined') {
        console.log('   ⚠️  testSQLiteModule not loaded');
        console.log('   → Try refreshing the page (Ctrl+R)');
        console.log('   → Or manually import:');
        console.log('      import("./tests/test-storage-sqlite").then(m => {');
        console.log('        window.testSQLiteModule = m.testSQLiteModule;');
        console.log('        console.log("✅ Loaded!");');
        console.log('      });');
      } else {
        console.log('   ✅ All tests available!');
        console.log('   → Run: await testStorageModule()');
        console.log('   → Run: await testSQLiteModule()');
      }
    }
    
    console.log('\n═══════════════════════════════════════');
  };
  
  console.log('🔧 Debug tool loaded. Run: checkStorageEnv()');
}

export {};
