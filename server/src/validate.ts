// Input validation for everything arriving over HTTP. Fail fast with a clear message.
export const CHAT_TEXT_MAX = 2000;
export const TASK_TITLE_MAX = 200;

export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

// C0 controls except tab/newline/carriage return, plus DEL.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function validateChatText(value: unknown): Valid<string> {
  if (typeof value !== 'string') return { ok: false, error: 'text must be a string' };
  const text = value.trim();
  if (!text) return { ok: false, error: 'text is empty' };
  if (text.length > CHAT_TEXT_MAX) return { ok: false, error: `text is longer than ${CHAT_TEXT_MAX} characters` };
  if (CONTROL.test(text)) return { ok: false, error: 'text contains control characters' };
  return { ok: true, value: text };
}

export function validateTaskTitle(value: unknown): Valid<string> {
  if (typeof value !== 'string') return { ok: false, error: 'title must be a string' };
  const title = value.trim();
  if (!title) return { ok: false, error: 'title is empty' };
  if (title.length > TASK_TITLE_MAX) return { ok: false, error: `title is longer than ${TASK_TITLE_MAX} characters` };
  if (/[\r\n]/.test(title) || CONTROL.test(title)) return { ok: false, error: 'title must be a single line of plain text' };
  if (title.startsWith('-')) return { ok: false, error: "title must not start with '-'" };
  return { ok: true, value: title };
}

const ROOM_ID = /^[a-z][a-z0-9-]{0,40}$/;

export function isRoomIdShape(value: unknown): value is string {
  return typeof value === 'string' && ROOM_ID.test(value);
}
