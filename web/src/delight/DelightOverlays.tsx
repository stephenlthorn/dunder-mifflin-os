// The delight layer's overlays: toasts (easter eggs), the Friday-evening Dundies invitation and the "Threat Level
// Midnight" credits. None of them takes a click it doesn't need: toasts and the credits let clicks through to the
// office (the credits keep only their Close button), and the invitation is a small card you can ignore.
import { useEffect } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { creditsFor } from './eggs/credits';
import type { ShownToast } from './useToasts';

export function ToastStack({ toasts }: { toasts: readonly ShownToast[] }) {
  return (
    <div className="delight-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="delight-toast" data-toast="">
          <strong>{t.text}</strong>
          {t.sub && <span>{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export function DundiesInvite({ awards, onStart, onDismiss }: { awards: number; onStart: () => void; onDismiss: () => void }) {
  return (
    <section className="dundies-invite" role="region" aria-label="The Dundies are tonight">
      <strong>The Dundies are tonight</strong>
      <p>Michael has {awards} award{awards === 1 ? '' : 's'} to hand out for the week, all won on real numbers.</p>
      <div className="dundies-invite-actions">
        <button type="button" className="primary" onClick={onStart}>Start the ceremony</button>
        <button type="button" onClick={onDismiss}>Not now</button>
      </div>
    </section>
  );
}

const ROLL_MS = 26_000;

export function Credits({ snapshot, motion, onClose }: { snapshot: OfficeSnapshot; motion: boolean; onClose: () => void }) {
  const c = creditsFor(snapshot);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const timer = motion ? setTimeout(onClose, ROLL_MS) : undefined;
    return () => { window.removeEventListener('keydown', onKey); if (timer) clearTimeout(timer); };
  }, [motion, onClose]);
  return (
    <div className={`credits${motion ? ' is-rolling' : ''}`} role="dialog" aria-label={`${c.title} credits`} data-testid="credits">
      <button type="button" className="credits-close" onClick={onClose}>Close</button>
      <div className="credits-roll">
        <p className="credits-kicker">A Michael Scott production</p>
        <h2>{c.title}</h2>
        <h3>Starring</h3>
        <dl>{c.starring.map((s) => <div key={s.name}><dt>{s.name}</dt><dd>as {s.as}</dd></div>)}</dl>
        {c.featuring.length > 0 && (<><h3>Also featuring, with no bot yet</h3><p>{c.featuring.join(' · ')}</p></>)}
        <h3>Special thanks</h3>
        <p>{c.thanks.join(' · ')}</p>
        <p className="credits-end">No bots were harmed in the making of this office.</p>
      </div>
    </div>
  );
}
