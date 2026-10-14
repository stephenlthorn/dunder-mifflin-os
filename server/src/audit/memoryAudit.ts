// An audit log kept in memory (the last `max` entries): for the demo, whose verbs only reach fictional in-memory bots,
// so they never land in your real ~/.dunder-mifflin-os/audit.log. Also runs in the browser (the static demo): no I/O.
import type { AuditEntry, AuditLog } from './auditLog.ts';

export type MemoryAuditLog = AuditLog & { entries(): ReadonlyArray<AuditEntry & { readonly at: string }> };

export function createMemoryAudit(opts: { max?: number; now?: () => number } = {}): MemoryAuditLog {
  const max = opts.max ?? 200;
  const now = opts.now ?? Date.now;
  let kept: ReadonlyArray<AuditEntry & { readonly at: string }> = [];
  return {
    file: 'memory',
    append: (entry) => {
      kept = [...kept, { ...entry, at: new Date(now()).toISOString() }].slice(-max);
      return true;
    },
    entries: () => kept,
  };
}
