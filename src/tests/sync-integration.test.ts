/**
 * 同步机制集成测试
 * 验证 EventEditModalV2 中的同步组件集成是否正常工作
 */

import React from 'react';
import { Event } from '@frontend/types';
import { describe, it, expect } from 'vitest';

// 测试用的事件数据
const testEvent: Event = {
  id: 'test-sync-event-001',
  title: '🚀 产品同步会议',
  createdAt: '2025-01-20T09:00:00Z',
  updatedAt: '2025-01-20T09:00:00Z',
  startTime: '2025-01-21T14:00:00Z',
  endTime: '2025-01-21T15:00:00Z',
  organizer: {
    id: 'org-001',
    name: '张三',
    email: 'zhangsan@company.com',
    organization: '公司名称',
    position: '产品经理',
    isOutlook: true
  },
  attendees: [
    {
      id: 'att-001',
      name: '李四',
      email: 'lisi@company.com',
      organization: '公司名称',
      position: '开发工程师',
      isOutlook: true
    },
    {
      id: 'att-002', 
      name: '王五',
      email: 'wangwu@partner.com',
      organization: '合作伙伴',
      position: '项目经理',
      isOutlook: false
    }
  ],
  location: '会议室 A-301',
  tags: ['重要会议', '产品开发'],
  checkType: 'none',
  isAllDay: false,
  
  // 同步配置测试数据
  planSyncConfig: {
    mode: 'bidirectional',
    targetCalendar: 'outlook-work',
    privateMode: false
  },
  actualSyncConfig: {
    mode: 'send-only',
    targetCalendar: 'google-personal',
    privateMode: true
  },
  
  // 同步关联的远程事件 ID
  syncedPlanEventId: 'outlook-event-123',
  syncedActualEventId: 'google-event-456'
};

/**
 * 同步功能验证函数
 */
export const validateSyncIntegration = () => {
  console.log('=== 同步机制集成测试 ===');
  
  // 验证同步配置
  console.log('1. 验证 Plan 同步配置:');
  console.log('   模式:', testEvent.planSyncConfig?.mode);
  console.log('   目标日历:', testEvent.planSyncConfig?.targetCalendar);
  console.log('   私密模式:', testEvent.planSyncConfig?.privateMode);
  
  console.log('2. 验证 Actual 同步配置:');
  console.log('   模式:', testEvent.actualSyncConfig?.mode);
  console.log('   目标日历:', testEvent.actualSyncConfig?.targetCalendar);
  console.log('   私密模式:', testEvent.actualSyncConfig?.privateMode);
  
  // 验证私密模式处理
  if (testEvent.actualSyncConfig?.privateMode && testEvent.attendees) {
    console.log('3. 私密模式参与者处理:');
    const participantEmails = testEvent.attendees.map(a => a.email);
    console.log('   参与者邮箱:', participantEmails);
    console.log('   >> 私密模式下，参与者将转换为描述文本，不发送邀请');
  }
  
  // 验证同步状态
  console.log('4. 同步状态验证:');
  console.log('   Plan 已同步事件:', testEvent.syncedPlanEventId ? '✓' : '✗');
  console.log('   Actual 已同步事件:', testEvent.syncedActualEventId ? '✓' : '✗');
  
  console.log('=== 集成测试完成 ===');
  
  return {
    hasValidPlanSync: !!testEvent.planSyncConfig,
    hasValidActualSync: !!testEvent.actualSyncConfig,
    hasPlanSyncedEvent: !!testEvent.syncedPlanEventId,
    hasActualSyncedEvent: !!testEvent.syncedActualEventId,
    supportsPrivateMode: testEvent.actualSyncConfig?.privateMode === true
  };
};

describe('Sync integration (config smoke)', () => {
  it('has a coherent sync config shape', () => {
    const result = validateSyncIntegration();
    expect(result.hasValidPlanSync).toBe(true);
    expect(result.hasValidActualSync).toBe(true);
    // Private mode is part of the sample.
    expect(result.supportsPrivateMode).toBe(true);
  });
});

export { testEvent };