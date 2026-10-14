// The demo day end to end, as people will run it: `npm run e2e:demo`.
//  - static: `npm run build:demo-static`, served by a plain static file server under a sub-path (as GitHub Pages would);
//  - server: the real server with DMOS_SOURCE=demo (what `npx dunder-mifflin-os --demo` and Docker run), no keys.
import { defineConfig, devices } from '@playwright/test';

const STATIC_PORT = Number(process.env.DMOS_E2E_STATIC_PORT) || 4351;
const SERVER_PORT = Number(process.env.DMOS_E2E_DEMO_PORT) || 4352;
export const STATIC_BASE = `http://127.0.0.1:${STATIC_PORT}/dunder-mifflin-os/`;

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: './e2e-demo',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'static', testMatch: /static\.spec\.ts/, use: { ...desktop, baseURL: STATIC_BASE } },
    { name: 'server', testMatch: /server\.spec\.ts/, use: { ...desktop, baseURL: `http://127.0.0.1:${SERVER_PORT}` } },
  ],
  webServer: [
    {
      command: `npm run build:demo-static && PORT=${STATIC_PORT} node web/e2e-demo/serve-static.mjs`,
      cwd: '..',
      url: STATIC_BASE,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build -w @dmos/web && DMOS_PORT=${SERVER_PORT} DMOS_SOURCE=demo DMOS_DEMO_START=09:00 npm run serve -w @dmos/server`,
      cwd: '..',
      url: `http://127.0.0.1:${SERVER_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
