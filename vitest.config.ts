import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@trade-normalizer/core': fileURLToPath(
        new URL('./packages/core/src/index.ts', import.meta.url),
      ),
      '@trade-normalizer/adapter-ibkr': fileURLToPath(
        new URL('./packages/adapters/ibkr/src/index.ts', import.meta.url),
      ),
      '@trade-normalizer/adapter-robinhood': fileURLToPath(
        new URL('./packages/adapters/robinhood/src/index.ts', import.meta.url),
      ),
      '@trade-normalizer/schemas': fileURLToPath(
        new URL('./packages/schemas/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      exclude: ['**/*.test.ts'],
      include: ['packages/*/src/**/*.ts', 'packages/adapters/*/src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    include: ['packages/**/*.test.ts'],
  },
});
