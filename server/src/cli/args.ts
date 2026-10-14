// Command-line flags for `npx dunder-mifflin-os`. Pure: argv in, a command out (no I/O, no process.env).
import { parseArgs } from 'node:util';
import { parseSpeed, type DemoSpeed } from '../../../shared/demo/time.ts';

export type CliOptions = {
  readonly demo: boolean;
  readonly open: boolean;
  readonly allowWrites: boolean;
  readonly port?: number;
  readonly hermesHome?: string;
  readonly portraits?: string;
  readonly speed?: DemoSpeed; // demo only
};

export type CliCommand =
  | { readonly kind: 'run'; readonly options: CliOptions }
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'error'; readonly message: string };

export const HELP_TEXT = `Dunder Mifflin OS: the office floor plan for your Hermes bots, in the browser.

Usage: npx dunder-mifflin-os [options]

Options:
  --demo               The demo day, "Threat Level Midnight": scripted bots, no keys,
                       nothing read from Hermes; chat and new tasks stay in memory
  --speed <1|10|60>    How fast the demo day runs (default 60: a day in 9 minutes)
  --open               Open the office in your browser once it is up
  --port <n>           Port to listen on (default 4318, or DMOS_PORT)
  --hermes-home <dir>  Hermes home directory (default ~/.hermes, or HERMES_HOME)
  --portraits <dir>    Local staff photos (default ~/.dunder-mifflin-os/portraits)
  --allow-writes       Turn on chat and task creation (read-only by default)
  -h, --help           Show this help
  -v, --version        Show the version

The server listens on 127.0.0.1. To reach it from other devices set DMOS_PUBLIC_ORIGINS
(e.g. a tailscale serve URL) and DMOS_ACCESS_TOKEN; see SECURITY.md.
`;

const OPTIONS = {
  demo: { type: 'boolean' },
  open: { type: 'boolean' },
  'allow-writes': { type: 'boolean' },
  port: { type: 'string' },
  'hermes-home': { type: 'string' },
  portraits: { type: 'string' },
  speed: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

function parsePort(raw: string | undefined): number | 'bad' | undefined {
  if (raw === undefined) return undefined;
  const port = Number(raw);
  return /^\d+$/.test(raw.trim()) && port >= 1024 && port <= 65535 ? port : 'bad';
}

function parseDir(raw: string | undefined): string | 'bad' | undefined {
  if (raw === undefined) return undefined;
  return raw.trim() ? raw.trim() : 'bad';
}

export function parseCliArgs(argv: ReadonlyArray<string>): CliCommand {
  let values: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: false }>>['values'];
  try {
    ({ values } = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: false, strict: true }));
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'Invalid arguments' };
  }
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };
  const port = parsePort(values.port);
  if (port === 'bad') return { kind: 'error', message: '--port must be a whole number from 1024 to 65535' };
  const hermesHome = parseDir(values['hermes-home']);
  const portraits = parseDir(values.portraits);
  if (hermesHome === 'bad' || portraits === 'bad') return { kind: 'error', message: '--hermes-home and --portraits need a directory' };
  const speed = values.speed === undefined ? undefined : parseSpeed(values.speed);
  if (speed === null) return { kind: 'error', message: '--speed must be 1, 10 or 60' };
  if (speed !== undefined && values.demo !== true) return { kind: 'error', message: '--speed only applies to the demo (--demo)' };
  return {
    kind: 'run',
    options: {
      demo: values.demo === true, open: values.open === true, allowWrites: values['allow-writes'] === true,
      ...(port === undefined ? {} : { port }),
      ...(hermesHome === undefined ? {} : { hermesHome }),
      ...(portraits === undefined ? {} : { portraits }),
      ...(speed === undefined ? {} : { speed }),
    },
  };
}
