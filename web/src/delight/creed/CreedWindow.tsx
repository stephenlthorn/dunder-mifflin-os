// Creed's corner: the raw list of activity the office can't put at anyone's desk (agents without a desk, cards nobody
// owns, requests from deskless agents), with the adapter and agent ids as reported. "Unattributed activity" in Toby mode.
import { sinceText } from '../../office/status';
import { useDelight } from '../DelightContext';

const KIND: Record<string, string> = { agent: 'Agent', card: 'Card', approval: 'Request' };

export function CreedWindow({ now }: { now: number }) {
  const { mode, unattributed } = useDelight();
  const toby = mode.toby;
  return (
    <div className="creed" data-testid="creed-corner">
      <p className="creed-intro">
        {toby ? '' : 'Creed knows something. '}
        Activity no desk can hold: agents an adapter reports with no desk free, open cards nobody owns, and requests from agents without a desk.
      </p>
      {unattributed.length === 0
        ? <p className="muted creed-empty">{toby ? 'Nothing unattributed: every agent, card and request has a desk.' : 'Creed knows nothing. For now.'}</p>
        : (
          <ul className="creed-list" aria-label={toby ? 'Unattributed activity' : 'What Creed knows'}>
            {unattributed.map((i) => (
              <li key={i.id} className={`creed-item kind-${i.kind}`} data-unattributed={i.id}>
                <span className="creed-kind">{KIND[i.kind] ?? i.kind}</span>
                <div className="creed-body">
                  <strong className="creed-title">{i.title}</strong>
                  <span className="creed-detail">{i.detail}</span>
                  <code className="creed-raw">
                    {[i.adapter && `adapter: ${i.adapter}`, i.agentId && `agent: ${i.agentId}`, `id: ${i.id}`].filter(Boolean).join(' · ')}
                    {i.at ? ` · ${sinceText(i.at, now) ?? i.at}` : ''}
                  </code>
                </div>
              </li>
            ))}
          </ul>
        )}
      <p className="muted creed-foot">Give an agent a desk under <code>seats:</code> in config.yaml; a card or request moves to its desk once its agent has one.</p>
    </div>
  );
}
