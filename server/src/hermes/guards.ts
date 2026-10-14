// Hand-written guards for data read from Hermes files and APIs. Never trust their shape.

export type UnknownRecord = Readonly<Record<string, unknown>>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function str(value: unknown, maxLength = 500): string | null {
  return typeof value === 'string' ? value.slice(0, maxLength) : null;
}

export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function arr(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

/** Hermes profile keys: lower-case, digits, dashes. Anything else is ignored (also blocks path tricks). */
const PROFILE_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function isProfileKey(value: unknown): value is string {
  return typeof value === 'string' && PROFILE_RE.test(value);
}

/** Chat ids in Hermes config/DBs are numbers, bigints or numeric strings. */
export function chatIdText(value: unknown): string | null {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value === 'string' && /^-?\d{1,20}$/.test(value.trim())) return value.trim();
  return null;
}
