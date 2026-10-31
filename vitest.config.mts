import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest configuration.
 *
 * The application code imports across the repo with the `@/` alias that
 * `tsconfig.json` declares (`"@/*": ["./*"]`). Vitest does not read
 * tsconfig paths on its own, so without this the very first test that
 * imports an application module — or an App Router route handler, which
 * imports its dependencies that way — fails to resolve. The alias below
 * mirrors the tsconfig mapping exactly.
 *
 * `include` covers the `__tests__` directories the repo already uses
 * (`src/services/__tests__`, `src/utils/__tests__`) plus `app/api/__tests__`
 * for route-handler tests. `node_modules` is excluded by default.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
  },
});
