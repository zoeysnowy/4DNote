/**
 * 🔧 IndexedDB 数据库重建工具
 * 
 * 问题：IndexedDB 查询耗时 273 秒，数据库已严重损坏
 * 
 * 解决方案：导出数据 → 删除旧库 → 重建新库 → 导入数据
 * 
 * 使用方法：
 * 1. 在浏览器控制台运行此脚本
 * 2. 等待导出完成（会下载 JSON 文件）
 * 3. 确认后删除旧数据库
 * 4. 刷新页面，应用会自动创建新数据库
 * 5. 运行导入脚本恢复数据
 */

const DB_NAME = '4DNoteDB';
const DB_VERSION = 2;

class DatabaseRebuilder {
  constructor() {
    this.exportData = null;
  }

  /**
   * Step 1: 导出所有数据
   */
  async exportAllData() {
    console.log('📦 Step 1: Exporting all data from IndexedDB...\n');
    
    try {
      const db = await this.openDatabase();
      const allData = {};
      
      const storeNames = Array.from(db.objectStoreNames);
      console.log(`Found ${storeNames.length} object stores: ${storeNames.join(', ')}\n`);
      
      for (const storeName of storeNames) {
        console.log(`  📂 Exporting ${storeName}...`);
        const data = await this.exportStore(db, storeName);
        allData[storeName] = data;
        console.log(`    ✅ Exported ${data.length} items`);
      }
      
      db.close();
      
      this.exportData = allData;
      
      // 下载备份文件
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `4dnote-backup-${timestamp}.json`;
      const json = JSON.stringify(allData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
      console.log(`\n✅ Export complete! Backup saved as: ${filename}`);
      console.log(`   Total size: ${(json.length / 1024 / 1024).toFixed(2)} MB\n`);
      
      // 统计
      let totalItems = 0;
      for (const [store, items] of Object.entries(allData)) {
        totalItems += items.length;
      }
      console.log(`📊 Export Summary:`);
      console.log(`   - Total stores: ${storeNames.length}`);
      console.log(`   - Total items: ${totalItems}`);
      console.log(`   - Backup file: ${filename}\n`);
      
      return allData;
    } catch (error) {
      console.error('❌ Export failed:', error);
      throw error;
    }
  }

  /**
   * Step 2: 删除旧数据库
   */
  async deleteOldDatabase() {
    console.log('🗑️ Step 2: Deleting old database...\n');
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      
      request.onsuccess = () => {
        console.log('✅ Old database deleted successfully\n');
        resolve();
      };
      
      request.onerror = () => {
        console.error('❌ Failed to delete database:', request.error);
        reject(request.error);
      };
      
      request.onblocked = () => {
        console.warn('⚠️ Database deletion blocked - close all tabs using this database');
        alert('请关闭所有使用 4DNote 的标签页，然后刷新此页面重试');
      };
    });
  }

  /**
   * Step 3: 导入数据到新数据库
   */
  async importAllData(data) {
    console.log('📥 Step 3: Importing data to new database...\n');
    
    try {
      // 等待新数据库创建
      console.log('  ⏳ Waiting for new database to be created...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const db = await this.openDatabase();
      console.log('  ✅ New database opened\n');
      
      for (const [storeName, items] of Object.entries(data)) {
        if (!db.objectStoreNames.contains(storeName)) {
          console.warn(`  ⚠️ Store ${storeName} not found in new database, skipping`);
          continue;
        }
        
        console.log(`  📂 Importing ${storeName} (${items.length} items)...`);
        await this.importStore(db, storeName, items);
        console.log(`    ✅ Imported ${items.length} items`);
      }
      
      db.close();
      
      console.log(`\n✅ Import complete!\n`);
      console.log('📊 Import Summary:');
      let totalItems = 0;
      for (const items of Object.values(data)) {
        totalItems += items.length;
      }
      console.log(`   - Total items imported: ${totalItems}\n`);
      
      return true;
    } catch (error) {
      console.error('❌ Import failed:', error);
      throw error;
    }
  }

  /**
   * 完整重建流程
   */
  async rebuild() {
    console.log('🔧 Starting Database Rebuild Process...\n');
    console.log('='.repeat(50) + '\n');
    
    try {
      // Step 1: Export
      const data = await this.exportAllData();
      
      console.log('⏸️  Please confirm you have downloaded the backup file.');
      const confirmed = confirm('已成功导出数据！\n\n请确认：\n1. 已下载备份文件\n2. 准备删除旧数据库\n\n是否继续？');
      
      if (!confirmed) {
        console.log('❌ Rebuild cancelled by user');
        return false;
      }
      
      // Step 2: Delete
      await this.deleteOldDatabase();
      
      console.log('⏸️  Please refresh the page to create a new database.');
      alert('旧数据库已删除！\n\n请刷新页面创建新数据库，然后运行导入脚本恢复数据。\n\n导入脚本请在控制台运行：\nrebuildTool.importFromFile()');
      
      return true;
    } catch (error) {
      console.error('❌ Rebuild failed:', error);
      return false;
    }
  }

  /**
   * 从文件导入数据
   */
  async importFromFile() {
    console.log('📂 Select backup file to import...\n');
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    return new Promise((resolve, reject) => {
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
          console.log('❌ No file selected');
          return reject(new Error('No file selected'));
        }
        
        console.log(`📥 Reading file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)\n`);
        
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const data = JSON.parse(event.target.result);
            console.log('✅ File loaded successfully\n');
            
            await this.importAllData(data);
            
            console.log('✅ Database rebuild complete!');
            console.log('\n🎉 You can now use 4DNote normally.');
            alert('数据库重建成功！\n\n所有数据已恢复，现在可以正常使用了。');
            
            resolve(true);
          } catch (error) {
            console.error('❌ Failed to parse or import file:', error);
            reject(error);
          }
        };
        
        reader.onerror = () => {
          console.error('❌ Failed to read file');
          reject(reader.error);
        };
        
        reader.readAsText(file);
      };
      
      input.click();
    });
  }

  // ==================== Helper Methods ====================

  async openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = (event) => {
        console.log('  ℹ️  Database upgrade triggered');
      };
    });
  }

  async exportStore(db, storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async importStore(db, storeName, items) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      
      // 批量写入
      for (const item of items) {
        store.put(item);
      }
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// 全局导出
window.rebuildTool = new DatabaseRebuilder();

console.log('🔧 Database Rebuild Tool Ready\n');
console.log('Usage:');
console.log('  1. Export and delete old database:');
console.log('     await rebuildTool.rebuild()');
console.log('');
console.log('  2. After page refresh, import data:');
console.log('     await rebuildTool.importFromFile()');
console.log('');
console.log('  Or run all steps:');
console.log('     await rebuildTool.rebuild()');
console.log('     // Refresh page');
console.log('     await rebuildTool.importFromFile()');
console.log('');
