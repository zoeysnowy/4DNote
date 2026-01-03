/**
 * EventService 双向链接功能测试
 * 
 * 测试场景：
 * 1. 添加链接
 * 2. 移除链接
 * 3. 重建反向链接
 * 4. 获取链接事件
 * 5. 检查链接存在性
 */

import { EventService } from '../EventService';
import { Event } from '../../types';
import { formatTimeForStorage } from '../../utils/timeUtils';

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('EventService - 双向链接功能', () => {
  beforeEach(() => {
    localStorageMock.clear();
    EventService.initialize(null); // 不需要同步管理器
  });

  const createTestEvent = async (label: string) => {
    const result = await EventService.createEvent({
      title: { fullTitle: label },
      startTime: formatTimeForStorage(new Date()),
      endTime: formatTimeForStorage(new Date()),
    } as any, true);
    expect(result.success).toBe(true);
    return result.event!;
  };

  describe('addLink', () => {
    it('应该成功添加双向链接', async () => {
      // 创建两个事件
      const eventA = await createTestEvent('事件 A');
      const eventB = await createTestEvent('事件 B');

      // 添加链接：A → B
      const result = await EventService.addLink(eventA.id, eventB.id);
      
      expect(result.success).toBe(true);

      // 验证 A 的 linkedEventIds
      const updatedA = await EventService.getEventById(eventA.id);
      expect(updatedA?.linkedEventIds).toContain(eventB.id);

      // 验证 B 的 backlinks
      const updatedB = await EventService.getEventById(eventB.id);
      expect(updatedB?.backlinks).toContain(eventA.id);
    });

    it('应该阻止自己链接自己', async () => {
      const event = await createTestEvent('事件 A');

      const result = await EventService.addLink(event.id, event.id);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('不能链接自己');
    });

    it('应该阻止链接不存在的事件', async () => {
      const event = await createTestEvent('事件 A');

      const result = await EventService.addLink(event.id, 'non-existent-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('目标事件不存在');
    });

    it('应该支持多个链接', async () => {
      const eventA = await createTestEvent('事件 A');
      const eventB = await createTestEvent('事件 B');
      const eventC = await createTestEvent('事件 C');

      // A → B, A → C
      await EventService.addLink(eventA.id, eventB.id);
      await EventService.addLink(eventA.id, eventC.id);

      const updatedA = await EventService.getEventById(eventA.id);
      expect(updatedA?.linkedEventIds?.length).toBe(2);
      expect(updatedA?.linkedEventIds).toContain(eventB.id);
      expect(updatedA?.linkedEventIds).toContain(eventC.id);
    });
  });

  describe('removeLink', () => {
    it('应该成功移除链接', async () => {
      const eventA = await createTestEvent('事件 A');
      const eventB = await createTestEvent('事件 B');

      // 添加链接
      await EventService.addLink(eventA.id, eventB.id);

      // 移除链接
      const result = await EventService.removeLink(eventA.id, eventB.id);
      
      expect(result.success).toBe(true);

      // 验证 A 的 linkedEventIds
      const updatedA = await EventService.getEventById(eventA.id);
      expect(updatedA?.linkedEventIds).not.toContain(eventB.id);

      // 验证 B 的 backlinks
      const updatedB = await EventService.getEventById(eventB.id);
      expect(updatedB?.backlinks).not.toContain(eventA.id);
    });
  });

  describe('getLinkedEvents', () => {
    it('应该正确获取正向和反向链接', async () => {
      const eventA = await createTestEvent('事件 A');
      const eventB = await createTestEvent('事件 B');
      const eventC = await createTestEvent('事件 C');

      // A → B (正向)
      await EventService.addLink(eventA.id, eventB.id);
      
      // C → A (反向，从 A 的视角)
      await EventService.addLink(eventC.id, eventA.id);

      const links = await EventService.getLinkedEvents(eventA.id);

      expect(links.outgoing.length).toBe(1);
      expect(links.outgoing[0].id).toBe(eventB.id);

      expect(links.incoming.length).toBe(1);
      expect(links.incoming[0].id).toBe(eventC.id);
    });
  });

  describe('hasLink', () => {
    it('应该正确检测链接是否存在', async () => {
      const eventA = await createTestEvent('事件 A');
      const eventB = await createTestEvent('事件 B');

      // 初始状态：无链接
      expect(await EventService.hasLink(eventA.id, eventB.id)).toBe(false);

      // 添加链接后
      await EventService.addLink(eventA.id, eventB.id);
      expect(await EventService.hasLink(eventA.id, eventB.id)).toBe(true);

      // 移除链接后
      await EventService.removeLink(eventA.id, eventB.id);
      expect(await EventService.hasLink(eventA.id, eventB.id)).toBe(false);
    });
  });

  describe('shouldShowInEventTree', () => {
    it('应该显示用户创建的事件', () => {
      const taskEvent: Event = {
        id: '1',
        title: { fullTitle: 'Task' },
        isTask: true,
      } as Event;

      const docEvent: Event = {
        id: '2',
        title: { fullTitle: 'Document' },
      } as Event;

      expect(EventService.shouldShowInEventTree(taskEvent)).toBe(true);
      expect(EventService.shouldShowInEventTree(docEvent)).toBe(true);
    });

    it('应该隐藏系统事件', () => {
      const timerEvent: Event = {
        id: '1',
        title: { fullTitle: 'Timer' },
        isTimer: true,
      } as Event;

      const outsideAppEvent: Event = {
        id: '2',
        title: { fullTitle: 'OutsideApp' },
        isOutsideApp: true,
      } as Event;

      const timeLogEvent: Event = {
        id: '3',
        title: { fullTitle: 'TimeLog' },
        isTimeLog: true,
      } as Event;

      expect(EventService.shouldShowInEventTree(timerEvent)).toBe(false);
      expect(EventService.shouldShowInEventTree(outsideAppEvent)).toBe(false);
      expect(EventService.shouldShowInEventTree(timeLogEvent)).toBe(false);
    });
  });
});
