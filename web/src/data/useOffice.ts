// Load the office: GET /api/office, then SSE /api/events merged immutably. Demo snapshot when asked or unreachable.
import { useCallback, useEffect, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { DEMO_OFFICE } from '@shared/fixtures/demo-approvals';
import { SignInRequiredError, fetchSnapshot, isDemoRequested } from './api';
import { parseEvent } from './guards';
import { type OfficeEvent, applyEvent } from './merge';

export type OfficeState =
  | { phase: 'loading'; snapshot: null }
  | { phase: 'live'; snapshot: OfficeSnapshot; connected: boolean }
  | { phase: 'demo'; snapshot: OfficeSnapshot; reason: string };

const LOAD_TIMEOUT_MS = 4000;

export function useOffice(): { state: OfficeState; applyLocal: (event: OfficeEvent) => void } {
  const demoAsked = isDemoRequested(window.location.search, import.meta.env.MODE);
  const [state, setState] = useState<OfficeState>(() =>
    demoAsked ? { phase: 'demo', snapshot: DEMO_OFFICE, reason: 'Demo mode' } : { phase: 'loading', snapshot: null });

  useEffect(() => {
    if (demoAsked) return undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
    let source: EventSource | null = null;
    let closed = false;

    const onEvent = (e: MessageEvent) => {
      const event = parseEvent(e.data);
      if (!event) return;
      setState((s) => (s.phase === 'live' ? { ...s, snapshot: applyEvent(s.snapshot, event), connected: true } : s));
    };

    fetchSnapshot(ctrl.signal)
      .then((snapshot) => {
        if (closed) return;
        setState({ phase: 'live', snapshot, connected: false });
        source = new EventSource('/api/events');
        source.onopen = () => setState((s) => (s.phase === 'live' ? { ...s, connected: true } : s));
        source.onerror = () => setState((s) => (s.phase === 'live' ? { ...s, connected: false } : s));
        source.addEventListener('message', onEvent);
        source.addEventListener('update', onEvent as EventListener);
      })
      .catch((error: unknown) => {
        if (error instanceof SignInRequiredError && window.location.pathname !== '/login') {
          window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        if (!closed) setState({ phase: 'demo', snapshot: DEMO_OFFICE, reason: 'Server unreachable — showing demo data' });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      closed = true;
      ctrl.abort();
      source?.close();
    };
  }, [demoAsked]);

  /** Apply a local change (e.g. a task we just created) before the server echoes it over SSE. */
  const applyLocal = useCallback((event: OfficeEvent) => {
    setState((s) => (s.snapshot ? { ...s, snapshot: applyEvent(s.snapshot, event) } as OfficeState : s));
  }, []);

  return { state, applyLocal };
}
