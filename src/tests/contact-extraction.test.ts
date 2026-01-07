/**
 * 联系人自动提取功能测试
 * 
 * 测试目的：验证从事件中自动提取联系人到联系人库的功能
 */

import { ContactService } from '@backend/ContactService';
import { Event } from '@frontend/types';
import { describe, it, expect } from 'vitest';
import { EventHub } from '@backend/EventHub';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

describe('Contact extraction (smoke)', () => {
  it('extracts organizer/attendees when saving an event', async () => {
    await ContactService.initialize();

    const testEvent: Event = {
      id: 'temp-test-event-' + Date.now(),
      title: '产品评审会',
      startTime: formatTimeForStorage(new Date()),
      endTime: formatTimeForStorage(new Date(Date.now() + 3600000)),
      organizer: {
        name: '测试组织者',
        email: 'organizer@test.com',
        organization: '产品部',
        position: '产品总监',
      },
      attendees: [
        {
          name: '测试参会人1',
          email: 'attendee1@test.com',
          organization: '设计部',
        },
        {
          name: '测试参会人2',
          email: 'attendee2@test.com',
          organization: '研发部',
        },
        {
          name: '无邮箱参会人',
        },
      ],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
      tags: [],
        checkType: 'none',
    } as any;

    // Use EventHub as the UI-facing save path.
    await EventHub.saveEvent(testEvent as any);

    const extractedOrganizer = await ContactService.getContactByEmail('organizer@test.com');
    const extractedAttendee1 = await ContactService.getContactByEmail('attendee1@test.com');
    const extractedAttendee2 = await ContactService.getContactByEmail('attendee2@test.com');

    expect(extractedOrganizer).toBeTruthy();
    expect(extractedAttendee1).toBeTruthy();
    expect(extractedAttendee2).toBeTruthy();
  });
});
