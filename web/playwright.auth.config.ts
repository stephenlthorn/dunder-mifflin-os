// Sign-in end to end against the REAL server (fixture data, so no Hermes needed): `npm run e2e:auth`.
// Builds the web app and starts the server with an access token, the way remote access runs.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4338;
export const E2E_TOKEN = 'e2e-access-token-0123456789abcdef';

export default defineConfig({
  testDir: './e2e-auth',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build -w @dmos/web && DMOS_PORT=${PORT} DMOS_SOURCE=fixture DMOS_ACCESS_TOKEN=${E2E_TOKEN} npm run serve -w @dmos/server`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
