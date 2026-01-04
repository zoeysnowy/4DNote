import { defaultTimePolicy } from '@frontend/config/time.config';
import type { TimePolicy, TimeSpec } from '@frontend/types/time';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';
import { parseNaturalDate } from '@frontend/utils/dateParser';

// Compute start/end of the week window (local), weekStart: 0=Sun,1=Mon
function getWeekWindow(now: Date, offsetWeeks: number, weekStart: 0 | 1) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const currentDow = base.getDay(); // 0..6 (0=Sun)
  const mondayDelta = weekStart === 1 ? ((currentDow + 6) % 7) : currentDow; // days since weekStart
  const start = new Date(base);
  start.setDate(base.getDate() - mondayDelta + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start: formatTimeForStorage(start),
    end: formatTimeForStorage(end),
  };
}

// Detect pure CN week words
function detectCnWeekWindow(text: string): { label: string; offset: number } | null {
  const t = text.trim();
  if (/^(下周|下週)$/.test(t)) return { label: '下周', offset: 1 };
  if (/^(本周|本週|这周|這週)$/.test(t)) return { label: '本周', offset: 0 };
  if (/^(上周|上週)$/.test(t)) return { label: '上周', offset: -1 };
  return null;
}

export function parseToTimeSpec(
  text: string,
  now: Date = new Date(),
  policy: TimePolicy = defaultTimePolicy
): TimeSpec | null {
  // 1) Pure week window like "下周"
  const cnWindow = detectCnWeekWindow(text);
  if (cnWindow) {
    const window = getWeekWindow(now, cnWindow.offset, policy.weekStart ?? 1);
    return {
      kind: 'window',
      source: 'parser',
      rawText: text,
      window: { start: window.start, end: window.end, label: cnWindow.label },
      // The resolved concrete start defaults based on windowResolution
      resolved:
        (policy.windowResolution ?? 'snap-to-start') === 'snap-to-start'
          ? { start: window.start }
          : (policy.windowResolution === 'snap-to-end' ? { start: window.end } : undefined),
      policy,
    };
  }

  // 2) Fallback to general natural date parser
  const parsed = parseNaturalDate(text);
  if (!parsed) return null;

  const start = parsed.start ? formatTimeForStorage(parsed.start) : undefined;
  const end = parsed.end ? formatTimeForStorage(parsed.end) : undefined;

  // If end exists and not equal start -> range, else fixed
  if (start && end && start !== end) {
    return {
      kind: 'range',
      source: 'parser',
      rawText: text,
      resolved: { start, end },
      policy,
    };
  }

  if (start) {
    return {
      kind: 'fixed',
      source: 'parser',
      rawText: text,
      resolved: { start },
      policy,
    };
  }

  return null;
}
