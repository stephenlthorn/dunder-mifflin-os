// `npx dunder-mifflin-os`: parse flags, make sure the web app is built, start the server (which serves it), wait
// until it answers, print the URL and optionally open a browser. config.ts reads process.env when first imported,
// so this file must not import it (or anything that does) before the environment is set.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP_TEXT, parseCliArgs } from './args.ts';
import { browserUrl, openCommand, serverEnv } from './env.ts';
import { banner, webBuildState } from './startup.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const STARTUP_TIMEOUT_MS = 20_000;

function fail(message: string, code = 1): never {
  process.stderr.write(`dunder-mifflin-os: ${message}\n`);
  process.exit(code);
}

function version(): string {
  const pkg: unknown = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return typeof pkg === 'object' && pkg !== null && 'version' in pkg ? String(pkg.version) : 'unknown';
}

function ensureWebBuild(): void {
  const state = webBuildState(ROOT);
  if (state === 'ready') return;
  if (state === 'missing') fail('the built web app (web/dist) is missing; reinstall the package, or run `npm run build` in a checkout');
  process.stdout.write('Building the web app once (npm run build)…\n');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) fail('`npm run build` failed');
}

/** node:sqlite still prints an ExperimentalWarning on Node 22; it is noise for CLI users. */
function quietSqliteWarning(): void {
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const type = typeof rest[0] === 'string' ? rest[0] : (rest[0] as { type?: string } | undefined)?.type;
    if (type === 'ExperimentalWarning' && String(warning).includes('SQLite')) return;
    (original as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
}

async function waitUntilUp(url: string): Promise<boolean> {
  const health = new URL('/api/health', url).toString();
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(health, { signal: AbortSignal.timeout(1000) });
      return true; // any HTTP answer means it is listening
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return false;
}

function openBrowser(url: string): void {
  const cmd = openCommand(process.platform, url);
  if (!cmd) return void process.stdout.write(`Open ${url} in your browser.\n`);
  const child = spawn(cmd.file, cmd.args, { stdio: 'ignore', detached: true });
  child.on('error', () => process.stdout.write(`Could not open a browser; open ${url} yourself.\n`));
  child.unref();
}

async function main(): Promise<void> {
  const cmd = parseCliArgs(process.argv.slice(2));
  if (cmd.kind === 'help') return void process.stdout.write(HELP_TEXT);
  if (cmd.kind === 'version') return void process.stdout.write(`${version()}\n`);
  if (cmd.kind === 'error') fail(`${cmd.message}\nRun with --help for the options.`, 2);

  ensureWebBuild();
  const env = serverEnv(cmd.options, process.env, { home: os.homedir(), webDist: path.join(ROOT, 'web', 'dist') });
  Object.assign(process.env, env); // the server reads its settings from process.env
  quietSqliteWarning();
  await import('../main.ts');

  const url = browserUrl(env);
  if (!(await waitUntilUp(url))) fail(`the server did not answer at ${url} within ${STARTUP_TIMEOUT_MS / 1000}s`);
  process.stdout.write(`${banner(env, url, os.homedir())}\n`);
  if (cmd.options.open) openBrowser(url);
}

await main();
