// The Claude Code settings.json "hooks" block that reports every session to the office
// (docs/adapters/claude-code.md; print it with `npm run claude-code:hooks -w @dmos/server`).
export const HOOK_EVENTS = Object.freeze([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest',
  'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'StopFailure', 'SessionEnd',
] as const);

export const TOKEN_ENV = 'DMOS_INGEST_TOKEN';
/** Seconds the observe-only hooks may take; the server answers at once. */
export const OBSERVE_TIMEOUT_S = 2;
/** PermissionRequest may be held for a decision in the office (config `decide`, at most 270 s): wait longer than that. */
export const PERMISSION_TIMEOUT_S = 300;

export function claudeCodeHookSettings(url: string): { hooks: Record<string, unknown[]> } {
  const hook = (timeout: number) => ({
    type: 'http', url, timeout,
    headers: { Authorization: `Bearer $${TOKEN_ENV}` },
    allowedEnvVars: [TOKEN_ENV],
  });
  return {
    hooks: Object.fromEntries(HOOK_EVENTS.map((event) => [event, [{ hooks: [hook(event === 'PermissionRequest' ? PERMISSION_TIMEOUT_S : OBSERVE_TIMEOUT_S)] }]])),
  };
}
