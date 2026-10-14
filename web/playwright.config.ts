import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.DMOS_E2E_PORT) || 5180; // override when several checkouts run e2e at once
const screenshots = Boolean(process.env.SCREENSHOTS);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 30_000,
  grep: screenshots ? /@screenshot/ : undefined,
  grepInvert: screenshots ? undefined : /@screenshot/,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run dev -w @dmos/web -- --port ${PORT} --strictPort`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { DMOS_API_TARGET: 'http://127.0.0.1:9' }, // a closed port: anything a test doesn't mock fails, as in CI
  },
});
