// Gateway status: GET http://127.0.0.1:9119/api/status (preferred) or ~/.hermes/gateway_state.json.
// Only '<profile>:telegram' platforms are kept, and never their error_message (it can quote secrets).
import type { GatewayStatus, PlatformState } from './types.ts';
import { isProfileKey, isRecord, num, str } from './guards.ts';

const TELEGRAM_SUFFIX = ':telegram';

function parsePlatforms(value: unknown): PlatformState[] | null {
  if (!isRecord(value)) return null;
  return Object.entries(value).flatMap(([key, entry]): PlatformState[] => {
    if (!key.endsWith(TELEGRAM_SUFFIX) || !isRecord(entry)) return [];
    const profile = key.slice(0, -TELEGRAM_SUFFIX.length);
    if (!isProfileKey(profile)) return [];
    return [{
      profile,
      state: str(entry.state, 40) ?? 'unknown',
      errorCode: str(entry.error_code, 80),
      updatedAt: str(entry.updated_at, 40),
    }];
  });
}

export function parseGatewayFile(json: unknown, pidAlive: (pid: number) => boolean): GatewayStatus | null {
  if (!isRecord(json)) return null;
  const platforms = parsePlatforms(json.platforms);
  if (!platforms) return null;
  const pid = num(json.pid);
  const running = json.gateway_state === 'running' && pid !== null && pidAlive(pid);
  return { running, platforms };
}

export function parseStatusApi(json: unknown): GatewayStatus | null {
  if (!isRecord(json)) return null;
  const platforms = parsePlatforms(json.gateway_platforms);
  if (!platforms) return null;
  return { running: json.gateway_running === true, platforms };
}
