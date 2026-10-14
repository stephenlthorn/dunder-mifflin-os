// The local append-only audit log (~/.dunder-mifflin-os/audit.log, DMOS_AUDIT_LOG): one JSON line per entry, written
// with O_APPEND to a 0600 file in a 0700 directory, never rewritten or rotated by the server. Callers write an entry
// BEFORE they act and refuse to act when append() returns false (fail closed). Text values are scrubbed (no tokens,
// home paths, phone numbers or chat ids) and capped; JSON encoding keeps a newline in a value from forging an entry.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { scrubText } from '../domain/scrub.ts';
import { log, redact } from '../log.ts';

export type AuditValue = string | number | boolean | undefined;
export type AuditEntry = Readonly<Record<string, AuditValue>> & { readonly event: string };
export type AuditLog = { readonly file: string; append(entry: AuditEntry): boolean };

const MAX_TEXT = 500;

const clean = (value: AuditValue): AuditValue => (typeof value === 'string' ? scrubText(value).slice(0, MAX_TEXT) : value);

export function createAuditLog(opts: { file: string; now?: () => number }): AuditLog {
  const now = opts.now ?? Date.now;

  function append(entry: AuditEntry): boolean {
    const fields = Object.entries(entry).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]);
    const line = `${JSON.stringify({ at: new Date(now()).toISOString(), ...Object.fromEntries(fields) })}\n`;
    try {
      mkdirSync(path.dirname(opts.file), { recursive: true, mode: 0o700 });
      appendFileSync(opts.file, line, { flag: 'a', mode: 0o600 });
      return true;
    } catch (error) {
      log('audit.write_failed', { detail: redact(error instanceof Error ? error.message : String(error)) });
      return false;
    }
  }

  return { file: opts.file, append };
}
