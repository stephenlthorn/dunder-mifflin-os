// The Konami code's "Threat Level Midnight" credits: the real cast (every bot as its role), everyone without a bot,
// and what the office is holding right now.
import type { OfficeSnapshot } from '@shared/contract';

export type Credits = { title: string; starring: { name: string; as: string }[]; featuring: string[]; thanks: string[] };

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function creditsFor(s: OfficeSnapshot): Credits {
  const jobs = Object.values(s.jobs ?? {}).reduce((n, list) => n + list.length, 0);
  const waiting = s.approvals?.length ?? 0;
  return {
    title: 'Threat Level Midnight',
    starring: s.people.filter((p) => p.bot).map((p) => ({ name: p.name, as: p.bot!.role || p.bot!.profile })),
    featuring: s.people.filter((p) => !p.bot).map((p) => p.name),
    thanks: [count(s.tasks.length, 'card') + ' on the board', count(jobs, 'scheduled job'), ...(waiting ? [`${count(waiting, 'request')} waiting on you`] : [])],
  };
}
