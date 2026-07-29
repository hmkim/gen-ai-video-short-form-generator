import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Repo's first test harness. jsdom + Testing Library for React component
// smoke tests. CSS imports are left mocked (vitest default): Cloudscape's
// stylesheets crash jsdom's nwsapi selector engine ("\8 and \9 not allowed in
// strict mode"), and component logic/markup under test does not depend on CSS.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
