// Live end-to-end run against the REAL ~/.hermes (read-only): `npm run e2e:live`. Builds the web app and starts the
// server exactly like `npm run start`, but on its own port so a running instance on 4318 is left alone.
// The specs never send chat messages or create kanban cards (POSTs are blocked in the browser).
import { defineConfig, devices } from '@playwright/test';

const PORT = 4328;

export default defineConfig({
  testDir: './e2e-live',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build -w @dmos/web && DMOS_PORT=${PORT} npm run serve -w @dmos/server`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/api/office`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
