import { describe, expect, it } from 'vitest';
import { auditLogFrom } from '../src/config.ts';

describe('DMOS_AUDIT_LOG', () => {
  it('defaults to ~/.dunder-mifflin-os/audit.log and expands ~/', () => {
    expect(auditLogFrom(undefined, '/h/me')).toBe('/h/me/.dunder-mifflin-os/audit.log');
    expect(auditLogFrom('  ', '/h/me')).toBe('/h/me/.dunder-mifflin-os/audit.log');
    expect(auditLogFrom('~/logs/dmos.log', '/h/me')).toBe('/h/me/logs/dmos.log');
    expect(auditLogFrom('/var/log/dmos/audit.log', '/h/me')).toBe('/var/log/dmos/audit.log');
  });
});
