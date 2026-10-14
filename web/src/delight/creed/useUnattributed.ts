// Creed's corner: GET /api/unattributed every minute (live; the static demo answers it too), merged with what the
// snapshot shows by itself. Demo mode and servers without the endpoint get the snapshot's part only.
import { useEffect, useMemo, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import type { UnattributedItem } from '@shared/unattributed';
import { mergeUnattributed, parseUnattributed, snapshotUnattributed } from './unattributed';

const POLL_MS = 60_000;

async function fetchUnattributed(signal: AbortSignal): Promise<UnattributedItem[] | null> {
  const res = await fetch('/api/unattributed', { signal, headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  return parseUnattributed(await res.json().catch(() => null))?.items ?? null;
}

export function useUnattributed(snapshot: OfficeSnapshot | null, demo: boolean): readonly UnattributedItem[] {
  const [server, setServer] = useState<UnattributedItem[] | null>(null);
  const ready = snapshot !== null;
  useEffect(() => {
    if (!ready || demo) return undefined;
    const ctrl = new AbortController();
    const poll = () => fetchUnattributed(ctrl.signal).then((items) => { if (!ctrl.signal.aborted) setServer(items); }, () => undefined);
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => { ctrl.abort(); clearInterval(timer); };
  }, [ready, demo]);
  return useMemo(() => (snapshot ? mergeUnattributed(server, snapshotUnattributed(snapshot)) : []), [snapshot, server]);
}
