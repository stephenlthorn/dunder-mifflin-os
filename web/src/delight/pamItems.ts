// Ask Pam's way into the delight layer: the Dundies ceremony (the Weekly review in Toby mode) and Creed's corner
// (Unattributed activity). Both are actions, so they show in the palette's empty state too.
import type { PamItem } from '../pam/items';
import { creedWords } from './creed/unattributed';

export function delightPamItems({ toby, creedCount }: { toby: boolean; creedCount: number }): PamItem[] {
  const creed = creedWords(creedCount, toby);
  const known = creedCount ? creed.label.split(': ')[1] ?? '' : 'Nothing unattributed';
  return [
    {
      id: 'action:dundies', kind: 'action', label: toby ? 'Weekly review' : 'The Dundies',
      detail: toby ? 'Most cards done, zero errors, fastest approvals: the last 7 days' : 'This week’s awards, presented by Michael',
      fields: [[toby ? 'Weekly review' : 'The Dundies', 1], ['awards weekly review dundies winners trophy digest', 0.8]], action: { type: 'dundies' },
    },
    {
      id: 'action:creed', kind: 'action', label: creed.title, detail: known,
      fields: [[creed.title, 1], ['unattributed anomalies orphaned cards unknown agents drift creed', 0.8]], action: { type: 'creed' },
    },
  ];
}
