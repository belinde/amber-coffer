/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver; provide a no-op stub for component tests
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;
