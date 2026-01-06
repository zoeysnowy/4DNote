export type DevUsageSample = {
  t: number;
  name: string;
  data?: unknown;
};

export type DevUsageLog = {
  version: 1;
  startedAt: number;
  lastAt: number;
  counts: Record<string, number>;
  samples: DevUsageSample[];
};

const STORAGE_KEY = '4dnote-dev-usage-log-v1';
const SAMPLE_LIMIT = 200;

let cached: DevUsageLog | null = null;

function isDev(): boolean {
  // Vite provides import.meta.env.DEV
  try {
    return typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;
  } catch {
    return false;
  }
}

function now(): number {
  return Date.now();
}

function load(): DevUsageLog {
  if (cached) return cached;

  const base: DevUsageLog = {
    version: 1,
    startedAt: now(),
    lastAt: now(),
    counts: {},
    samples: [],
  };

  if (typeof window === 'undefined' || !window.localStorage) {
    cached = base;
    return base;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    cached = base;
    return base;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DevUsageLog>;
    cached = {
      version: 1,
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : base.startedAt,
      lastAt: typeof parsed.lastAt === 'number' ? parsed.lastAt : base.lastAt,
      counts: (parsed.counts && typeof parsed.counts === 'object' ? (parsed.counts as any) : {}) as Record<
        string,
        number
      >,
      samples: Array.isArray(parsed.samples) ? (parsed.samples as DevUsageSample[]) : [],
    };
    return cached;
  } catch {
    cached = base;
    return base;
  }
}

function persist(log: DevUsageLog): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // ignore quota / serialization issues
  }
}

export function recordDevUsage(name: string, data?: unknown): void {
  if (!isDev()) return;

  const log = load();
  log.lastAt = now();
  log.counts[name] = (log.counts[name] ?? 0) + 1;

  // keep a small number of samples for debugging
  const count = log.counts[name];
  if (log.samples.length < SAMPLE_LIMIT && count <= 3) {
    log.samples.push({ t: log.lastAt, name, data });
  }

  persist(log);
}

export function dumpDevUsage(): DevUsageLog {
  return load();
}

export function clearDevUsage(): void {
  cached = {
    version: 1,
    startedAt: now(),
    lastAt: now(),
    counts: {},
    samples: [],
  };
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

declare global {
  interface Window {
    __4dnoteUsage?: {
      dump: () => DevUsageLog;
      clear: () => void;
    };
  }
}

// Dev helper: expose a stable global so you can export/clear from DevTools.
if (isDev() && typeof window !== 'undefined') {
  window.__4dnoteUsage = window.__4dnoteUsage ?? {
    dump: dumpDevUsage,
    clear: clearDevUsage,
  };
}
