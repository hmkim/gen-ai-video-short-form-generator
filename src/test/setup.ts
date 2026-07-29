// Vitest global setup.
//
// 1. Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.).
// 2. Polyfills browser APIs that jsdom omits but Cloudscape components use at
//    render time (matchMedia, ResizeObserver). Without these, rendering a
//    Cloudscape Container/Button in jsdom throws.

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests to avoid cross-test DOM leakage.
afterEach(() => {
  cleanup();
});

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

if (typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })) as unknown as typeof window.ResizeObserver;
}
