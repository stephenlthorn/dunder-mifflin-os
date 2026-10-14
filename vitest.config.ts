import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  test: {
    include: ['web/src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts'], // server tests run with server/vitest.config.ts
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
});
