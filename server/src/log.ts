// Minimal structured logging to stderr. Never log message text, chat ids, tokens or Hermes stderr verbatim.
const LONG_DIGITS = /\d{6,}/g;
const HOME_PATH = /\/Users\/[^\s/]+|\/home\/[^\s/]+/g;
const SECRETISH = /\b(token|key|secret|password|auth)\b\S*/gi;

export function redact(text: string, max = 200): string {
  return text.replace(SECRETISH, '$1=<redacted>').replace(HOME_PATH, '~').replace(LONG_DIGITS, '<n>').slice(0, max);
}

export function log(event: string, fields: Readonly<Record<string, string | number | boolean | null>> = {}): void {
  if (typeof process === 'undefined' || process.env.DMOS_QUIET === '1') return; // the static demo runs server code in a browser
  process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);
}
