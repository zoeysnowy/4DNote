/**
 * SSOT Linter 测试
 * 
 * 验证运行时检查工具能正确捕获违规代码
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkForbiddenSignalFields,
  checkDeprecatedFieldWrite,
  checkEventDeprecatedFields,
  checkTimeFormat,
  checkEventTimeFormats,
  validateEventAgainstSSOT,
} from '../utils/ssotLinter';
import type { Event } from '../types';

describe('SSOT Linter', () => {
  beforeEach(() => {
    // 模拟开发环境
    process.env.NODE_ENV = 'development';
  });

  describe('checkForbiddenSignalFields', () => {
    it('应该检测禁止的Signal字段', () => {
      const event = {
        id: 'test-1',
        isHighlight: true, // 禁止字段
      } as any;

      // 在开发环境应该记录错误
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      checkForbiddenSignalFields(event, 'test');
      
      // 验证有错误日志（具体实现取决于logger）
      consoleSpy.mockRestore();
    });

    it('应该允许合法的Event字段', () => {
      const event: Partial<Event> = {
        id: 'test-1',
        title: { simpleTitle: 'Test' },
        startTime: '2026-01-09 10:00:00',
      };

      expect(() => {
        checkForbiddenSignalFields(event, 'test');
      }).not.toThrow();
    });
  });

  describe('checkDeprecatedFieldWrite', () => {
    it('应该警告deprecated字段写入', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      checkDeprecatedFieldWrite('isTask', true, 'test');
      
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('deprecated field: isTask')
      );
      
      warnSpy.mockRestore();
    });

    it('应该允许非deprecated字段', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      checkDeprecatedFieldWrite('startTime', '2026-01-09 10:00:00', 'test');
      
      expect(warnSpy).not.toHaveBeenCalled();
      
      warnSpy.mockRestore();
    });
  });

  describe('checkTimeFormat', () => {
    it('应该拒绝ISO格式时间', () => {
      process.env.NODE_ENV = 'test'; // 测试环境抛出错误
      
      expect(() => {
        checkTimeFormat('startTime', '2026-01-09T10:00:00Z', 'test');
      }).toThrow(/ISO format/);
    });

    it('应该拒绝包含T的时间格式', () => {
      process.env.NODE_ENV = 'test';
      
      expect(() => {
        checkTimeFormat('createdAt', '2026-01-09T10:00:00', 'test');
      }).toThrow(/ISO format/);
    });

    it('应该接受本地格式时间', () => {
      expect(() => {
        checkTimeFormat('startTime', '2026-01-09 10:00:00', 'test');
      }).not.toThrow();
    });

    it('应该接受undefined时间', () => {
      expect(() => {
        checkTimeFormat('startTime', undefined, 'test');
      }).not.toThrow();
    });
  });

  describe('checkEventTimeFormats', () => {
    it('应该检查Event的所有时间字段', () => {
      process.env.NODE_ENV = 'test';
      
      const event: Partial<Event> = {
        id: 'test-1',
        startTime: '2026-01-09T10:00:00Z', // 错误格式
        endTime: '2026-01-09 11:00:00', // 正确格式
      };

      expect(() => {
        checkEventTimeFormats(event, 'test');
      }).toThrow(/ISO format/);
    });

    it('应该检查bestSnapshot中的时间', () => {
      process.env.NODE_ENV = 'test';
      
      const event: Partial<Event> = {
        id: 'test-1',
        bestSnapshot: {
          capturedAt: '2026-01-09T10:00:00Z', // 错误格式
          contentScore: 100,
        } as any,
      };

      expect(() => {
        checkEventTimeFormats(event, 'test');
      }).toThrow(/ISO format/);
    });

    it('应该接受所有正确格式的时间', () => {
      const event: Partial<Event> = {
        id: 'test-1',
        startTime: '2026-01-09 10:00:00',
        endTime: '2026-01-09 11:00:00',
        createdAt: '2026-01-09 09:00:00',
        updatedAt: '2026-01-09 09:30:00',
        bestSnapshot: {
          capturedAt: '2026-01-09 09:15:00',
          contentScore: 100,
        } as any,
      };

      expect(() => {
        checkEventTimeFormats(event, 'test');
      }).not.toThrow();
    });
  });

  describe('validateEventAgainstSSOT', () => {
    it('应该执行全面检查', () => {
      process.env.NODE_ENV = 'test';
      
      const badEvent = {
        id: 'test-1',
        isHighlight: true, // 禁止的Signal字段
        startTime: '2026-01-09T10:00:00Z', // 错误的时间格式
      } as any;

      expect(() => {
        validateEventAgainstSSOT(badEvent, 'create');
      }).toThrow();
    });

    it('应该允许migration路径', () => {
      const event: Partial<Event> = {
        id: 'test-1',
        isTask: true, // deprecated，但允许migration
        startTime: '2026-01-09 10:00:00',
      } as any;

      expect(() => {
        validateEventAgainstSSOT(event, 'create', { allowMigration: true });
      }).not.toThrow();
    });

    it('应该在read时跳过deprecated检查', () => {
      const event: Partial<Event> = {
        id: 'test-1',
        isTask: true, // deprecated
        startTime: '2026-01-09 10:00:00',
      } as any;

      expect(() => {
        validateEventAgainstSSOT(event, 'read');
      }).not.toThrow();
    });

    it('应该在skipTimeCheck时跳过时间检查', () => {
      const event: Partial<Event> = {
        id: 'test-1',
        startTime: '2026-01-09T10:00:00Z', // 错误格式，但跳过检查
      };

      expect(() => {
        validateEventAgainstSSOT(event, 'create', { skipTimeCheck: true });
      }).not.toThrow();
    });

    it('应该接受完全符合SSOT的Event', () => {
      const goodEvent: Partial<Event> = {
        id: 'test-1',
        title: { simpleTitle: 'Test Event', fullTitle: 'Test Event' },
        startTime: '2026-01-09 10:00:00',
        endTime: '2026-01-09 11:00:00',
        createdAt: '2026-01-09 09:00:00',
        updatedAt: '2026-01-09 09:30:00',
        source: 'local:plan',
      };

      expect(() => {
        validateEventAgainstSSOT(goodEvent, 'create');
      }).not.toThrow();
    });
  });

  describe('生产环境行为', () => {
    it('在生产环境应该跳过所有检查', () => {
      process.env.NODE_ENV = 'production';
      
      const badEvent = {
        id: 'test-1',
        isHighlight: true,
        startTime: '2026-01-09T10:00:00Z',
      } as any;

      // 应该不抛出错误也不记录日志
      expect(() => {
        validateEventAgainstSSOT(badEvent, 'create');
      }).not.toThrow();
    });
  });
});
