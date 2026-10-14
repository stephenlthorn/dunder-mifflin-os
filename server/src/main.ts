// Entry point: `npm start` (live ~/.hermes), `npm run serve` (live + the built web app at /, DMOS_SERVE_WEB=1),
// DMOS_SOURCE=fixture (the recorded Hermes sample) or DMOS_SOURCE=demo (the scripted demo day alone; demoMode.ts).
// Which agent adapters run and who sits where comes from ~/.dunder-mifflin-os/config.yaml (officeConfig.ts; default:
// Hermes alone). Binds 127.0.0.1 unless DMOS_HOST says otherwise, and then only with an access token (a demo-only
// server excepted). Read-only unless DMOS_ALLOW_WRITES=1 (the demo turns writes on: they stay in memory).
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './http/app.ts';
import { createAdapters, hermesSourceKind } from './adapters/factory.ts';
import type { AgentAdapter } from './adapters/types.ts';
import { execFileRunner } from './chat/runner.ts';
import { loadOfficeConfig, type LoadedConfig } from './officeConfig.ts';
import { defaultOfficeSetup } from './office/office.ts';
import { mergeSeatRules } from './office/seating.ts';
import { demoStartup, isDemoOnly, seatDefaults } from './demoMode.ts';
import { BUILT_IN_PRICES } from './usage/priceTable.ts';
import { mergePriceTables } from './usage/pricing.ts';
import {
  ALLOW_WRITES, AUDIT_LOG, HEADSHOT_DIR, HERMES_BIN, HERMES_HOME, HERMES_STATUS_URL, HOST, POLL_INTERVAL_MS, PORT, PORTRAITS_DIR, PUBLIC_ORIGINS,
  SERVE_WEB, WEB_DIST, type AccessConfig, resolveAccess,
} from './config.ts';
import { log } from './log.ts';
import { createMemoryAudit } from './audit/memoryAudit.ts';

type Startup = { access: AccessConfig; config: LoadedConfig; adapters: AgentAdapter[]; allowWrites: boolean; demoOnly: boolean };

function startup(): Startup {
  try {
    const demo = demoStartup(process.env);
    const config = demo?.config ?? loadOfficeConfig({ env: process.env, home: os.homedir() });
    const demoOnly = isDemoOnly(config.adapters);
    const access = resolveAccess({ host: HOST, publicOrigins: PUBLIC_ORIGINS, token: process.env.DMOS_ACCESS_TOKEN, demoOnly });
    const adapters = createAdapters(config.adapters, {
      env: process.env, runner: execFileRunner, hermesHome: HERMES_HOME, hermesBin: HERMES_BIN, statusUrl: HERMES_STATUS_URL,
    });
    return { access, config, adapters, allowWrites: ALLOW_WRITES || demo?.allowWrites === true, demoOnly };
  } catch (error) {
    // never contains a token: resolveAccess and readIngestToken leave them out of their messages
    log('startup.failed', { detail: error instanceof Error ? error.message : 'invalid startup settings' });
    return process.exit(1);
  }
}

const { access, config, adapters, allowWrites, demoOnly } = startup();
const live = config.adapters.some((s) => s.kind === 'hermes' && hermesSourceKind(s, process.env) === 'live');

if (ALLOW_WRITES && live && !existsSync(HERMES_BIN)) log('startup.warning', { detail: 'hermes CLI not found; chat and task creation will fail' });

if (SERVE_WEB && !existsSync(path.join(WEB_DIST, 'index.html'))) log('startup.warning', { detail: 'web/dist not built; run npm run build' });

const app = createApp({
  adapters,
  setup: defaultOfficeSetup(mergeSeatRules(seatDefaults(config.adapters), config.seats)),
  // the demo is all fiction: no bot headshots, no staff photos (screenshots of it stay drawn)
  hermesHome: HERMES_HOME, headshotDir: demoOnly ? null : HEADSHOT_DIR, portraitsDir: demoOnly ? null : PORTRAITS_DIR,
  pollIntervalMs: POLL_INTERVAL_MS,
  webRoot: SERVE_WEB ? WEB_DIST : null,
  // a demo-only server audits in memory: its verbs only reach fictional bots, so they stay out of your audit log
  allowWrites, accessToken: access.token, auditFile: demoOnly ? null : AUDIT_LOG, ...(demoOnly ? { audit: createMemoryAudit() } : {}),
  prices: mergePriceTables(BUILT_IN_PRICES, config.prices),
  ...(config.budgets ? { budgets: config.budgets } : {}),
});

app.server.on('error', (error: NodeJS.ErrnoException) => {
  log('startup.failed', { code: error.code ?? 'unknown', port: PORT });
  process.exit(1);
});

app.server.listen(PORT, HOST, () => {
  const shown = HOST.includes(':') ? `[${HOST}]` : HOST;
  log('server.listening', {
    url: `http://${shown}:${PORT}`, adapters: adapters.map((a) => a.id).join(','), config: config.file ? 'file' : 'defaults',
    seats: Object.keys(config.seats).length, budgets: Object.keys(config.budgets?.limits ?? {}).length, web: SERVE_WEB, writes: allowWrites, demo: demoOnly,
    signIn: access.token !== null, remote: access.remote,
  });
});

function shutdown(signal: string): void {
  log('server.stopping', { signal });
  app.close().then(() => process.exit(0), () => process.exit(1));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
