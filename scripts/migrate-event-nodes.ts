/**
 * 数据迁移脚本：为所有存量 Events 生成 EventNodes
 * 
 * 执行方式：
 * npm run migrate:nodes
 * 
 * 功能：
 * 1. 遍历所有未删除的 Events
 * 2. 为每个 Event 调用 EventNodeService.syncNodesFromEvent()
 * 3. 记录迁移进度和错误
 * 4. 支持断点续传（跳过已有 Nodes 的 Events）
 * 
 * @since v2.19.0
 */

import { storageManager } from '../src/services/StorageManager';
import { EventNodeService } from '../src/services/EventNodeService';

interface MigrationStats {
  total: number;
  processed: number;
  skipped: number;
  succeeded: number;
  failed: number;
  errors: Array<{ eventId: string; error: string }>;
}

async function migrateEventNodes(options: {
  dryRun?: boolean;
  skipExisting?: boolean;
  batchSize?: number;
} = {}): Promise<MigrationStats> {
  const {
    dryRun = false,
    skipExisting = true,
    batchSize = 100,
  } = options;

  const stats: MigrationStats = {
    total: 0,
    processed: 0,
    skipped: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  console.log('📊 [Migration] Starting EventNodes migration...');
  console.log(`   Dry Run: ${dryRun}`);
  console.log(`   Skip Existing: ${skipExisting}`);
  console.log(`   Batch Size: ${batchSize}`);

  try {
    // 1. 获取所有未删除的 Events
    const result = await storageManager.queryEvents({
      filters: {},
      limit: 10000, // 假设不超过 1 万条事件
    });

    const events = result.events.filter(e => !e.deletedAt);
    stats.total = events.length;

    console.log(`✅ [Migration] Found ${stats.total} events to process`);

    // 2. 批量处理
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      console.log(`\n🔄 [Migration] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(events.length / batchSize)}`);

      for (const event of batch) {
        try {
          // 2.1 如果 skipExisting，检查是否已有 Nodes
          if (skipExisting) {
            const existingCount = await EventNodeService.countNodesByEventId(event.id);
            if (existingCount > 0) {
              console.log(`⏭️  [Migration] Skipping event ${event.id.slice(-8)} (${existingCount} nodes exist)`);
              stats.skipped++;
              stats.processed++;
              continue;
            }
          }

          // 2.2 执行迁移
          if (!dryRun) {
            const createdCount = await EventNodeService.syncNodesFromEvent(event);
            console.log(`✅ [Migration] Event ${event.id.slice(-8)}: created ${createdCount} nodes`);
            stats.succeeded++;
          } else {
            console.log(`🔍 [Migration] [DRY-RUN] Would process event ${event.id.slice(-8)}`);
            stats.succeeded++;
          }

          stats.processed++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`❌ [Migration] Event ${event.id.slice(-8)} failed:`, errorMsg);
          stats.failed++;
          stats.processed++;
          stats.errors.push({
            eventId: event.id,
            error: errorMsg,
          });
        }
      }

      // 3. 每批次后暂停，避免阻塞
      if (i + batchSize < events.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 4. 输出统计
    console.log('\n📊 [Migration] Completed!');
    console.log(`   Total:      ${stats.total}`);
    console.log(`   Processed:  ${stats.processed}`);
    console.log(`   Skipped:    ${stats.skipped}`);
    console.log(`   Succeeded:  ${stats.succeeded}`);
    console.log(`   Failed:     ${stats.failed}`);

    if (stats.errors.length > 0) {
      console.log('\n❌ [Migration] Errors:');
      stats.errors.forEach(({ eventId, error }) => {
        console.log(`   - ${eventId}: ${error}`);
      });
    }

    return stats;
  } catch (error) {
    console.error('❌ [Migration] Fatal error:', error);
    throw error;
  }
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipExisting = !args.includes('--force');
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 100;

  migrateEventNodes({ dryRun, skipExisting, batchSize })
    .then(stats => {
      if (stats.failed > 0) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ [Migration] Failed:', error);
      process.exit(1);
    });
}

export { migrateEventNodes };
