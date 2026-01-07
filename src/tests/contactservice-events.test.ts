/**
 * ContactService 事件机制测试
 * 验证 Phase 1 实现
 */

import { ContactService } from '@backend/ContactService';
import { EventService } from '@backend/EventService';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

async function waitForExpectation(
  expectation: () => void | Promise<void>,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 500;
  const intervalMs = options?.intervalMs ?? 20;
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < timeoutMs) {
    try {
      await expectation();
      return;
    } catch (err) {
      lastError = err;
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  throw lastError ?? new Error('waitForExpectation timed out');
}

// 清空 localStorage
beforeEach(() => {
  localStorage.clear();
});

describe('ContactService Event Mechanism (Phase 1)', () => {
  it('应该在创建联系人时触发 contact.created 事件', async () => {
    const listener = jest.fn();
    ContactService.addEventListener('contact.created', listener);
    
    const contact = await ContactService.addContact({
      name: '张三',
      email: 'zhangsan@example.com',
    });
    
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contact.created',
        data: expect.objectContaining({
          contact: expect.objectContaining({
            name: '张三',
            email: 'zhangsan@example.com',
          })
        })
      })
    );
  });

  it('应该在更新联系人时触发 contact.updated 事件', async () => {
    const listener = jest.fn();
    
    // 先创建联系人
    const contact = await ContactService.addContact({
      name: '张三',
      email: 'zhangsan@example.com',
    });
    
    // 订阅更新事件
    ContactService.addEventListener('contact.updated', listener);
    
    // 更新联系人
    await ContactService.updateContact(contact.id!, {
      phone: '13800138000',
    });
    
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contact.updated',
        data: expect.objectContaining({
          id: contact.id,
          after: expect.objectContaining({
            name: '张三',
            phone: '13800138000',
          })
        })
      })
    );
  });

  it('应该在删除联系人时触发 contact.deleted 事件', async () => {
    const listener = jest.fn();
    
    // 先创建联系人
    const contact = await ContactService.addContact({
      name: '张三',
      email: 'zhangsan@example.com',
    });
    
    // 订阅删除事件
    ContactService.addEventListener('contact.deleted', listener);
    
    // 删除联系人
    await ContactService.deleteContact(contact.id!);
    
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contact.deleted',
        data: expect.objectContaining({
          id: contact.id,
          contact: expect.objectContaining({
            name: '张三',
          })
        })
      })
    );
  });

  it('应该支持移除事件监听器', async () => {
    const listener = jest.fn();
    
    // 添加监听器
    ContactService.addEventListener('contact.created', listener);
    
    // 创建第一个联系人
    await ContactService.addContact({ name: '张三' } as any);
    expect(listener).toHaveBeenCalledTimes(1);
    
    // 移除监听器
    ContactService.removeEventListener('contact.created', listener);
    
    // 创建第二个联系人
    await ContactService.addContact({ name: '李四' } as any);
    expect(listener).toHaveBeenCalledTimes(1); // 仍然是 1 次
  });

  it('应该支持多个监听器订阅同一事件', async () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    
    ContactService.addEventListener('contact.created', listener1);
    ContactService.addEventListener('contact.created', listener2);
    
    await ContactService.addContact({ name: '张三' } as any);
    
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });
});

describe('EventService 订阅 ContactService 事件', () => {
  beforeEach(() => {
    // 初始化 EventService（使用 mock sync manager）
    EventService.initialize({
      recordLocalAction: jest.fn(),
    });
  });

  it('联系人更新时，应该同步到相关事件的参会人', async () => {
    // 1. 创建联系人
    const contact = await ContactService.addContact({
      name: '张三',
      email: 'zhangsan@example.com',
    });
    
    // 2. 创建包含该联系人的事件
    const created = await EventService.createEvent({
      title: { fullTitle: '会议' } as any,
      source: 'local:timecalendar',
      startTime: formatTimeForStorage(new Date()),
      endTime: formatTimeForStorage(new Date(Date.now() + 60 * 60 * 1000)),
      tags: [],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
      attendees: [contact],
    } as any);
    expect(created.success).toBe(true);
    const eventId = created.event!.id!;
    
    // 3. 更新联系人
    await ContactService.updateContact(contact.id!, {
      phone: '13800138000',
    });

    await waitForExpectation(async () => {
      const updatedEvent = await EventService.getEventById(eventId);
      expect(updatedEvent?.attendees?.[0].phone).toBe('13800138000');
    });
  });

  it('联系人删除时，应该从相关事件中移除', async () => {
    // 1. 创建联系人
    const contact = await ContactService.addContact({
      name: '张三',
      email: 'zhangsan@example.com',
    });
    
    // 2. 创建包含该联系人的事件
    const created = await EventService.createEvent({
      title: { fullTitle: '会议' } as any,
      source: 'local:timecalendar',
      startTime: formatTimeForStorage(new Date()),
      endTime: formatTimeForStorage(new Date(Date.now() + 60 * 60 * 1000)),
      tags: [],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
      attendees: [contact],
    } as any);
    expect(created.success).toBe(true);
    const eventId = created.event!.id!;
    const event = await EventService.getEventById(eventId);
    expect(event?.attendees?.length).toBe(1);
    
    // 3. 删除联系人
    await ContactService.deleteContact(contact.id!);

    await waitForExpectation(async () => {
      const updatedEvent = await EventService.getEventById(eventId);
      expect(updatedEvent?.attendees?.length).toBe(0);
    });
  });

  it('联系人更新时，应该同步到相关事件的发起人', async () => {
    // 1. 创建联系人
    const organizer = await ContactService.addContact({
      name: '张三',
      email: 'zhangsan@example.com',
    });
    
    // 2. 创建事件（该联系人是发起人）
    const created = await EventService.createEvent({
      title: { fullTitle: '会议' } as any,
      source: 'local:timecalendar',
      startTime: formatTimeForStorage(new Date()),
      endTime: formatTimeForStorage(new Date(Date.now() + 60 * 60 * 1000)),
      tags: [],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
      organizer,
    } as any);
    expect(created.success).toBe(true);
    const eventId = created.event!.id!;
    
    // 3. 更新联系人
    await ContactService.updateContact(organizer.id!, {
      organization: '字节跳动',
    });

    // 等待 EventService 的异步事件处理完成
    await new Promise((r) => setTimeout(r, 0));
    
    // 4. 验证事件的发起人信息已更新
    const updatedEvent = await EventService.getEventById(eventId);
    expect(updatedEvent?.organizer?.organization).toBe('字节跳动');
  });
});
