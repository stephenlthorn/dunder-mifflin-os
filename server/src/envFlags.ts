// Side-effect-free env helpers, shared by config.ts and the CLI (which must not import config.ts before it sets env).

/** Boolean env flags are on only for 1/true/yes/on. */
export function isOn(raw: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((raw ?? '').trim().toLowerCase());
}

/** Explicitly off: 0/false/no/off (unset is neither on nor off). */
export function isOff(raw: string | undefined): boolean {
  return ['0', 'false', 'no', 'off'].includes((raw ?? '').trim().toLowerCase());
}
