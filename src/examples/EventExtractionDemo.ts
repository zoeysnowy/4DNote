/**
 * 活动海报提取示例
 * 演示如何使用 EventExtractionWorkflow 从活动海报中提取信息
 */

import { EventExtractionWorkflow } from '../ai/workflows/EventExtractionWorkflow';
import { QRCodeInfo } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 运行活动海报提取示例
 */
export async function runEventExtractionDemo() {
  console.log('🎨 活动海报信息提取示例\n');
  console.log('=' .repeat(60));

  // 创建工作流
  const workflow = new EventExtractionWorkflow();

  // 示例 1: 使用模拟图片（实际使用时替换为真实图片）
  console.log('\n📸 示例 1: 从图片中提取活动信息\n');
  
  try {
    // 这里应该是真实的图片文件
    // const imagePath = 'path/to/activity-poster.jpg';
    // const imageBuffer = fs.readFileSync(imagePath);
    
    // 为了演示，我们创建一个模拟的 Blob
    const mockImageBlob = new Blob(['mock image data'], { type: 'image/jpeg' });

    const result = await workflow.execute(mockImageBlob);

    // 打印结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 提取结果汇总\n');

    if (result.error) {
      console.error('❌ 发生错误:', result.error.message);
      return;
    }

    // OCR 结果
    if (result.ocrText) {
      console.log('📝 OCR 识别文字:');
      console.log('  置信度:', (result.ocrConfidence! * 100).toFixed(1) + '%');
      console.log('  内容预览:', result.ocrText.substring(0, 200) + '...\n');
    }

    // 二维码结果
    if (result.qrCodes && result.qrCodes.length > 0) {
      console.log(`🔲 识别到 ${result.qrCodes.length} 个二维码:\n`);
      result.qrCodes.forEach((qr, i) => {
        console.log(`  ${i + 1}. ${qr.metadata?.title || qr.type.toUpperCase()}`);
        console.log(`     类型: ${qr.type}`);
        console.log(`     内容: ${qr.content.substring(0, 60)}...`);
        if (qr.metadata?.action) {
          console.log(`     建议: ${qr.metadata.action}`);
        }
        if (qr.imageData) {
          console.log(`     图片: 已保存 (${(qr.imageData.length / 1024).toFixed(1)} KB)`);
        }
        console.log();
      });
    }

    // 事件信息
    if (result.extractedEvent) {
      console.log('📅 提取的活动信息:\n');
      console.log(`  标题: ${result.extractedEvent.title}`);
      console.log(`  时间: ${result.extractedEvent.startTime || '未知'}`);
      console.log(`  地点: ${result.extractedEvent.location || '未知'}`);
      console.log(`  主办: ${result.extractedEvent.organizer || '未知'}`);
      if (result.extractedEvent.tags?.length) {
        console.log(`  标签: ${result.extractedEvent.tags.join(', ')}`);
      }
      console.log();
    }

    // 注册信息
    if (result.registrationInfo) {
      console.log('📝 报名信息:\n');
      if (result.registrationInfo.required) {
        console.log('  需要报名: 是 ✓');
        console.log(`  截止时间: ${result.registrationInfo.deadline || '未知'}`);
        console.log(`  报名方式: ${result.registrationInfo.method || '未知'}`);
        if (result.registrationInfo.url) {
          console.log(`  报名链接: ${result.registrationInfo.url}`);
        }
      } else {
        console.log('  需要报名: 否');
      }
      console.log();
    }

    // 建议的任务
    if (result.suggestedTasks && result.suggestedTasks.length > 0) {
      console.log(`📋 生成了 ${result.suggestedTasks.length} 个任务:\n`);
      result.suggestedTasks.forEach((task, i) => {
        const priorityEmoji = task.priority === 'high' ? '🔴' : 
                             task.priority === 'medium' ? '🟡' : '🟢';
        console.log(`  ${i + 1}. ${priorityEmoji} ${task.title}`);
        console.log(`     类型: ${task.type}`);
        if (task.dueDate) {
          console.log(`     时间: ${task.dueDate}`);
        }
        if (task.description) {
          console.log(`     说明: ${task.description}`);
        }
        if (task.qrCodeId) {
          const qr = result.qrCodes?.find(q => q.id === task.qrCodeId);
          if (qr) {
            console.log(`     二维码: ${qr.metadata?.title || qr.type}`);
          }
        }
        console.log();
      });
    }

    // 演示如何保存到 EventLog
    console.log('💾 保存到 EventLog:\n');
    const eventLogData = convertToEventLog(result);
    console.log(JSON.stringify(eventLogData, null, 2).substring(0, 500) + '...\n');

  } catch (error: any) {
    console.error('❌ 执行失败:', error.message);
    console.error(error.stack);
  }

  console.log('='.repeat(60));
  console.log('\n✅ 示例执行完成！\n');
}

/**
 * 将工作流结果转换为 EventLog 格式
 */
function convertToEventLog(result: any) {
  const eventLog: any = {
    slateJson: JSON.stringify([
      {
        type: 'paragraph',
        children: [
          { text: result.extractedEvent?.description || '从活动海报提取的信息' }
        ]
      }
    ]),
    plainText: result.ocrText || '',
    qrCodes: result.qrCodes?.map((qr: any) => ({
      id: qr.id,
      content: qr.content,
      type: qr.type,
      url: qr.url,
      metadata: qr.metadata,
      imageData: qr.imageData,
      extractedAt: qr.extractedAt
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return eventLog;
}

/**
 * 二维码下载功能示例
 */
export function downloadQRCode(qrCode: QRCodeInfo, filename?: string) {
  if (!qrCode.imageData) {
    console.warn('该二维码没有图片数据');
    return;
  }

  // 浏览器环境
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const link = document.createElement('a');
    link.href = qrCode.imageData;
    link.download = filename || `qr_${qrCode.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log(`✅ 二维码已下载: ${link.download}`);
  }
  // Node.js 环境
  else if (typeof process !== 'undefined') {
    const base64Data = qrCode.imageData.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const filepath = path.join(process.cwd(), filename || `qr_${qrCode.id}.png`);
    fs.writeFileSync(filepath, buffer);
    console.log(`✅ 二维码已保存: ${filepath}`);
  }
}

/**
 * 批量下载所有二维码
 */
export function downloadAllQRCodes(qrCodes: QRCodeInfo[], folderPath?: string) {
  console.log(`📥 开始下载 ${qrCodes.length} 个二维码...\n`);

  qrCodes.forEach((qr, i) => {
    if (qr.imageData) {
      const filename = `${i + 1}_${qr.metadata?.title || qr.type}_${qr.id}.png`;
      const fullPath = folderPath ? path.join(folderPath, filename) : filename;
      downloadQRCode(qr, fullPath);
    }
  });

  console.log(`\n✅ 所有二维码下载完成！`);
}

// 如果直接运行此文件
if (require.main === module) {
  runEventExtractionDemo().catch(console.error);
}
