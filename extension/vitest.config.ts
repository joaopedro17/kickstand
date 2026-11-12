import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // Component tests opt into a DOM with a `// @vitest-environment happy-dom`
    // docblock; lib/ tests stay in node, where crypto.subtle is the real one.
    setupFiles: ['./tests/support/setup.ts'],
    coverage: {
      provider: 'istanbul',
      // lcov is what the CRAP and mutation gates read (coverage/lcov.info).
      reporter: ['lcov', 'text-summary'],
      include: ['lib/**/*.ts', 'entrypoints/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts'],
    },
  },
});
