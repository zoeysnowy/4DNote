import { describe, expect, it, vi } from 'vitest';

import { parseLocalTimeString } from './timeUtils';
import {
  resolveCalendarDateRange,
  resolveCheckState,
  resolveTaskAnchorTimestamp,
  resolveTimelineAnchor,
} from './TimeResolver';

describe('TimeResolver', () => {
  describe('resolveCheckState', () => {
    it('当没有 checked/unchecked 时，返回未完成', () => {
      expect(resolveCheckState({ checked: undefined, unchecked: undefined })).toEqual({
        isChecked: false,
        lastChecked: undefined,
        lastUnchecked: undefined,
      });
    });

    it('当只有 checked 时，返回完成且 lastChecked 正确', () => {
      expect(resolveCheckState({ checked: ['2025-12-01 10:00:00'], unchecked: [] })).toEqual({
        isChecked: true,
        lastChecked: '2025-12-01 10:00:00',
        lastUnchecked: undefined,
      });
    });

    it('当最后一次操作是 unchecked 时，返回未完成', () => {
      expect(
        resolveCheckState({
          checked: ['2025-12-01 10:00:00'],
          unchecked: ['2025-12-02 09:00:00'],
        })
      ).toEqual({
        isChecked: false,
        lastChecked: '2025-12-01 10:00:00',
        lastUnchecked: '2025-12-02 09:00:00',
      });
    });

		it('当数组无序时，仍能正确取最新操作', () => {
			expect(
				resolveCheckState({
					checked: ['2025-12-01 10:00:00', '2025-12-05 10:00:00', '2025-12-03 10:00:00'],
					unchecked: ['2025-12-04 09:00:00'],
				})
			).toEqual({
				isChecked: true,
				lastChecked: '2025-12-05 10:00:00',
				lastUnchecked: '2025-12-04 09:00:00',
			});
		});
  });

  describe('resolveTaskAnchorTimestamp', () => {
    it('默认：已完成 task 以 lastChecked 作为落位锚点（优先于 createdAt）', () => {
      const anchor = resolveTaskAnchorTimestamp({
        createdAt: '2025-12-01 08:00:00',
        endTime: '2025-12-20 23:59:59',
        checked: ['2025-12-30 23:59:59'],
        unchecked: [],
      });
      expect(anchor).toBe('2025-12-30 23:59:59');
    });

    it('默认：未完成且设置了 endTime 时，优先使用 endTime（而不是 createdAt）', () => {
      const anchor = resolveTaskAnchorTimestamp({
        createdAt: '2025-12-01 08:00:00',
        endTime: '2025-12-20 23:59:59',
        checked: [],
        unchecked: [],
      });
      expect(anchor).toBe('2025-12-20 23:59:59');
    });

    it('当 preferCompletionDayWhenChecked=false 时，始终使用 createdAt', () => {
      const anchor = resolveTaskAnchorTimestamp(
        {
          createdAt: '2025-12-01 08:00:00',
          endTime: '2025-12-20 23:59:59',
          checked: ['2025-12-30 23:59:59'],
          unchecked: [],
        },
        { preferCompletionDayWhenChecked: false }
      );
      expect(anchor).toBe('2025-12-01 08:00:00');
    });

    it('当没有任何时间来源且 fallbackToNow=false 时，返回 undefined', () => {
      const anchor = resolveTaskAnchorTimestamp(
        { createdAt: undefined, endTime: undefined, checked: undefined, unchecked: undefined },
        { fallbackToNow: false }
      );
      expect(anchor).toBeUndefined();
    });
  });

  describe('resolveCalendarDateRange', () => {
    it('无时间 task（未完成）：使用 createdAt 的日期并 clamp 到 00:00', () => {
      const createdAt = '2025-12-01 08:00:00';
      const { start, end, kind } = resolveCalendarDateRange({
        checkType: 'once',
        startTime: undefined,
        endTime: undefined,
        createdAt,
        checked: [],
        unchecked: [],
      });

      const createdDate = parseLocalTimeString(createdAt);
      expect(kind).toBe('task-date-only');
      expect(start.getFullYear()).toBe(createdDate.getFullYear());
      expect(start.getMonth()).toBe(createdDate.getMonth());
      expect(start.getDate()).toBe(createdDate.getDate());
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
      expect(start.getMilliseconds()).toBe(0);
      expect(end.getTime()).toBe(start.getTime());
    });

    it('无时间 task（已完成）：使用 lastChecked 的日期并 clamp 到 00:00', () => {
      const createdAt = '2025-12-01 08:00:00';
      const lastChecked = '2025-12-30 23:59:59';

      const { start, end, kind } = resolveCalendarDateRange({
        checkType: 'once',
        startTime: undefined,
        endTime: undefined,
        createdAt,
        checked: [lastChecked],
        unchecked: [],
      });

      const checkedDate = parseLocalTimeString(lastChecked);
      expect(kind).toBe('task-date-only');
      expect(start.getFullYear()).toBe(checkedDate.getFullYear());
      expect(start.getMonth()).toBe(checkedDate.getMonth());
      expect(start.getDate()).toBe(checkedDate.getDate());
      expect(start.getHours()).toBe(0);
      expect(end.getTime()).toBe(start.getTime());
    });

    it('无时间 task（缺失 createdAt 等）：fallbackToNow=true 时使用当前日期（00:00）', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-12-31T12:34:56'));

      const { start, kind } = resolveCalendarDateRange({
        checkType: 'once',
        startTime: undefined,
        endTime: undefined,
        createdAt: undefined,
        checked: undefined,
        unchecked: undefined,
      });

      expect(kind).toBe('task-date-only');
      expect(start.getFullYear()).toBe(2025);
      expect(start.getMonth()).toBe(11); // 0-based
      expect(start.getDate()).toBe(31);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);

      vi.useRealTimers();
    });

    it('仅 startTime 的 task：按 time-based 渲染（end 回填为 start）', () => {
      const { start, end, kind } = resolveCalendarDateRange({
        checkType: 'once',
        startTime: '2025-12-01 09:00:00',
        endTime: undefined,
        createdAt: '2025-12-01 08:00:00',
        checked: [],
        unchecked: [],
      });

      expect(kind).toBe('time-based');
      expect(start.getHours()).toBe(9);
      expect(end.getTime()).toBe(start.getTime());
    });

    it('有明确时间段：使用 startTime/endTime（time-based）', () => {
      const { start, end, kind } = resolveCalendarDateRange({
        startTime: '2025-12-01 09:00:00',
        endTime: '2025-12-01 10:00:00',
        createdAt: '2025-12-01 08:00:00',
        checked: [],
        unchecked: [],
      });

      expect(kind).toBe('time-based');
      expect(start.getHours()).toBe(9);
      expect(end.getHours()).toBe(10);
    });
  });

  describe('resolveTimelineAnchor', () => {
    it('time-based：锚点为 startTime 对应的时间', () => {
      const { date, kind } = resolveTimelineAnchor({
        startTime: '2025-12-01 09:00:00',
        endTime: '2025-12-01 10:00:00',
        createdAt: '2025-12-01 08:00:00',
        checked: [],
        unchecked: [],
      });

      expect(kind).toBe('time-based');
      expect(date.getHours()).toBe(9);
    });

    it('task-date-only：无 startTime 且为 task 时，锚点 clamp 到当天 00:00', () => {
      const { date, kind } = resolveTimelineAnchor({
        checkType: 'once',
        startTime: undefined,
        endTime: undefined,
        createdAt: '2025-12-01 08:00:00',
        checked: [],
        unchecked: [],
      });

      expect(kind).toBe('task-date-only');
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    });
  });
});
