/// <reference types="vitest/globals" />

import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// Global test isolation helpers.
// We keep this minimal to avoid surprising tests; currently the repo only uses
// fake timers in a single suite, and leaked timers/mocks are a common source of flakes.
afterEach(() => {
  // No-op if real timers are already active.
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Some legacy tests still use Jest globals (jest.fn/jest.mock/etc).
// Provide a minimal alias to keep them running under Vitest.
(globalThis as any).jest = {
  fn: vi.fn,
  mock: vi.mock,
  spyOn: vi.spyOn,
  clearAllMocks: vi.clearAllMocks,
  resetAllMocks: vi.resetAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
  useFakeTimers: vi.useFakeTimers,
  useRealTimers: vi.useRealTimers,
  runAllTimers: vi.runAllTimers,
  advanceTimersByTime: vi.advanceTimersByTime,
};

// Antd / responsive helpers
if (!(window as any).matchMedia) {
  (window as any).matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
