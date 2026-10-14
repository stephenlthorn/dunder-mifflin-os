// Notifications glue: tab-title badge and favicon dot for bots that error or need you while you're away, opt-in browser
// notifications and chime, and the "while you were away" summary when the tab gets focus back.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import type { Prefs } from '../prefs/prefs';
import { type AttentionEvent, type Unseen, addUnseen, attentionEvents, notificationText, pruneUnseen } from './attention';
import { type AwayLine, type AwayState, awaySummary } from './away';
import { badgeTitle, faviconHref } from './badge';
import { playChime } from './chime';
import { type NotifyPermission, askNotifyPermission, notifyPermission } from './permission';

export type AwayReport = { away: string; lines: AwayLine[] };

const isAway = () => document.visibilityState === 'hidden' || !document.hasFocus();
const stateOf = (s: OfficeSnapshot): AwayState => ({ presence: s.presence, tasks: s.tasks, at: Date.now() });

function applyFavicon(dot: boolean) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  const href = faviconHref(dot);
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

function notify(e: AttentionEvent, onOpen: (personId: string) => void) {
  try {
    const { title, body } = notificationText(e);
    const n = new Notification(title, { body, tag: `dmos-${e.personId}` });
    n.onclick = () => {
      window.focus();
      onOpen(e.personId);
      n.close();
    };
  } catch {
    // some browsers only allow notifications from a service worker; the badge and summary still work
  }
}

export function useNotifications(snapshot: OfficeSnapshot | null, prefs: Prefs, onOpenPerson: (personId: string) => void) {
  const [unseen, setUnseen] = useState<Unseen>(() => new Map());
  const [report, setReport] = useState<AwayReport | null>(null);
  const [permission, setPermission] = useState<NotifyPermission>(notifyPermission);
  const previous = useRef<OfficeSnapshot | null>(null);
  const awayFrom = useRef<AwayState | null>(null);
  const latest = useRef({ snapshot, prefs, onOpenPerson });
  latest.current = { snapshot, prefs, onOpenPerson };

  useEffect(() => {
    if (!snapshot) return;
    const before = previous.current;
    previous.current = snapshot;
    if (!before) {
      if (isAway()) awayFrom.current = stateOf(snapshot);
      return;
    }
    const events = attentionEvents(snapshot.people, before.presence, snapshot.presence);
    const away = isAway();
    setUnseen((u) => pruneUnseen(away ? addUnseen(u, events) : u, snapshot.presence));
    if (events.length === 0) return;
    const { prefs: p, onOpenPerson: open } = latest.current;
    if (p.chime) playChime();
    if (away && p.notifications && notifyPermission() === 'granted') events.forEach((e) => notify(e, open));
  }, [snapshot]);

  useEffect(() => {
    const onChange = () => {
      const s = latest.current.snapshot;
      if (!s) return;
      if (isAway()) {
        awayFrom.current ??= stateOf(s);
        return;
      }
      const from = awayFrom.current;
      awayFrom.current = null;
      setUnseen(new Map());
      if (!from) return;
      const summary = awaySummary(from, s, Date.now());
      if (summary.lines.length > 0) setReport(summary);
    };
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('focus', onChange);
    window.addEventListener('blur', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
      window.removeEventListener('blur', onChange);
    };
  }, []);

  useEffect(() => {
    document.title = badgeTitle(unseen.size);
    applyFavicon(unseen.size > 0);
  }, [unseen]);

  /** From the Settings switch (a click), so the browser may show its permission prompt. */
  const askPermission = useCallback(async (): Promise<boolean> => {
    const result = await askNotifyPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  return { report, dismissReport: useCallback(() => setReport(null), []), permission, askPermission, unseen: unseen.size };
}
