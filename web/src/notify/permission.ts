// The browser's notification permission, read without ever asking (asking happens only from Settings).
export type NotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function notifyPermission(): NotifyPermission {
  try {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  } catch {
    return 'unsupported';
  }
}

/** Ask the browser (call only from a click). Resolves to the resulting permission. */
export async function askNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === 'unsupported') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return notifyPermission();
  }
}
