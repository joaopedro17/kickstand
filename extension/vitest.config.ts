import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    coverage: {
      provider: 'istanbul',
      // lcov is what the CRAP and mutation gates read (coverage/lcov.info).
      reporter: ['lcov', 'text-summary'],
      include: ['lib/**/*.ts', 'entrypoints/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts'],
    },
  },
});
