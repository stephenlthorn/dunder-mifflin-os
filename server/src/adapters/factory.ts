// Config adapter specs -> running adapters. Inbound adapters need DMOS_INGEST_TOKEN; without it startup fails. The demo
// adapter needs nothing at all.
import type { Runner } from '../chat/runner.ts';
import { isOn } from '../envFlags.ts';
import { createFixtureSource } from '../hermes/fixtureSource.ts';
import { createLiveSource } from '../hermes/liveSource.ts';
import type { AdapterSpec } from '../officeConfig.ts';
import { createClaudeCodeAdapter } from './claudeCode/adapter.ts';
import { createDemoAdapter } from './demo/adapter.ts';
import { createHermesAdapter } from './hermes.ts';
import { readIngestToken } from './ingest/auth.ts';
import type { AgentAdapter } from './types.ts';
import { createWebhookAdapter } from './webhook.ts';

export type AdapterDeps = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runner: Runner;
  readonly hermesHome: string;
  readonly hermesBin: string;
  readonly statusUrl: string | null;
};

/** Where a hermes adapter reads from: its config `source`, else DMOS_SOURCE=fixture (npm run demo), else ~/.hermes. */
export function hermesSourceKind(spec: AdapterSpec, env: AdapterDeps['env']): 'live' | 'fixture' {
  return spec.source ?? (env.DMOS_SOURCE === 'fixture' ? 'fixture' : 'live');
}

function createOne(spec: AdapterSpec, deps: AdapterDeps): AgentAdapter {
  switch (spec.kind) {
    case 'hermes': {
      const source = hermesSourceKind(spec, deps.env) === 'fixture'
        ? createFixtureSource({ shift: true })
        : createLiveSource({ hermesHome: deps.hermesHome, statusUrl: deps.statusUrl });
      return createHermesAdapter({ id: spec.id, source, runner: deps.runner, hermesBin: deps.hermesBin });
    }
    case 'webhook':
      return createWebhookAdapter({ id: spec.id, token: readIngestToken(deps.env.DMOS_INGEST_TOKEN) });
    case 'claude-code': // holding a permission prompt for the office is opt-in and needs writes on
      return createClaudeCodeAdapter({
        id: spec.id, token: readIngestToken(deps.env.DMOS_INGEST_TOKEN),
        decisions: spec.decide === true && isOn(deps.env.DMOS_ALLOW_WRITES),
        ...(spec.holdSeconds === undefined ? {} : { holdMs: spec.holdSeconds * 1000 }),
      });
    case 'demo':
      return createDemoAdapter({ id: spec.id, ...spec.demo });
  }
}

export function createAdapters(specs: ReadonlyArray<AdapterSpec>, deps: AdapterDeps): AgentAdapter[] {
  return specs.map((spec) => createOne(spec, deps));
}
