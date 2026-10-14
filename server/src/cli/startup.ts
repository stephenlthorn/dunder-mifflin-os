// What the CLI checks and prints around starting the server. Pure apart from the injected `exists`.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { isOff, isOn } from '../envFlags.ts';
import { DEMO_TITLE } from '../../../shared/demo/time.ts';
import type { Env } from './env.ts';

export type WebBuildState = 'ready' | 'build' | 'missing';

/** `ready`: the package ships web/dist. `build`: a source checkout with dev dependencies, so build once. */
export function webBuildState(root: string, exists: (p: string) => boolean = existsSync): WebBuildState {
  if (exists(path.join(root, 'web', 'dist', 'index.html'))) return 'ready';
  const checkout = exists(path.join(root, 'web', 'src', 'main.tsx')) && exists(path.join(root, 'node_modules', 'vite', 'package.json'));
  return checkout ? 'build' : 'missing';
}

const tildify = (p: string, home: string) => (p === home || p.startsWith(`${home}${path.sep}`) ? `~${p.slice(home.length)}` : p);

/** The lines printed once the server answers. Never includes the access token. */
export function banner(env: Env, url: string, home: string): string {
  const hermes = tildify(env.HERMES_HOME?.trim() || path.join(home, '.hermes'), home);
  const demo = env.DMOS_SOURCE === 'demo';
  const data = demo ? `the demo day, "${DEMO_TITLE}" (fictional; nothing is read from Hermes)`
    : env.DMOS_SOURCE === 'fixture' ? 'recorded sample (nothing is read from Hermes)' : `live, from ${hermes} (read only)`;
  const writes = demo ? (isOff(env.DMOS_ALLOW_WRITES) ? 'off (read-only)' : 'on, in memory only: the demo bots answer with canned lines')
    : isOn(env.DMOS_ALLOW_WRITES)
      ? 'on: chat and task creation reach your bots'
      : 'off (read-only). Restart with --allow-writes to chat with bots and create tasks';
  const signIn = env.DMOS_ACCESS_TOKEN?.trim() ? ['  Sign-in: required (the access token in DMOS_ACCESS_TOKEN)'] : [];
  return [
    '',
    `  Dunder Mifflin OS is open at ${url}`,
    `  Data:    ${data}`,
    `  Writes:  ${writes}`,
    ...signIn,
    '  Stop:    Ctrl+C',
    '',
  ].join('\n');
}
