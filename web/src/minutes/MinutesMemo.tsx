// One meeting's minutes as an inter-office memo: To/From/Date/Re, who was present, the agenda, the proceedings with
// times, and how it ended. Built from the kanban record by the server (no LLM). Print-friendly (minutes.css).
import type { Meeting, Person } from '@shared/contract';
import { RUN_META } from '../calendar/words';
import { MEETING_META, lineWho, presentText, proceedingsText } from './memo';

type Props = { meeting: Meeting; people: ReadonlyMap<string, Person>; roomName: string; onBack: () => void };

const TASK_WORD: Record<Meeting['agenda'][number]['status'], string> = { todo: 'not started', doing: 'in progress', blocked: 'blocked', done: 'done' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function MinutesMemo({ meeting: m, people, roomName, onBack }: Props) {
  const owner = people.get(m.participantIds[0] ?? '')?.name;
  const results = m.lines.filter((l) => l.kind === 'result');
  const multiDay = m.lines.some((l) => dayOf(l.at) !== dayOf(m.startedAt));
  return (
    <div className="minutes-memo-wrap">
      <div className="memo-actions">
        <button type="button" className="link-btn" onClick={onBack}>← All minutes</button>
        <button type="button" className="cal-btn" onClick={() => window.print()}>Print</button>
      </div>
      <article className="memo" aria-label={`Minutes: ${m.title}`} data-testid="memo">
        <header className="memo-head">
          <p className="memo-letterhead">Dunder Mifflin · Scranton Branch</p>
          <h3>Memorandum</h3>
          <dl className="memo-fields">
            <dt>To</dt><dd>All staff</dd>
            <dt>From</dt><dd>The {roomName} room{owner ? `, ${owner}` : ''}</dd>
            <dt>Date</dt><dd>{when(m.startedAt)}</dd>
            <dt>Re</dt><dd>Minutes: {m.title}</dd>
          </dl>
        </header>
        <p className="memo-status">
          <span className={`mtg-pill ${MEETING_META[m.status].className}`}>{MEETING_META[m.status].word}</span>
          {' '}{proceedingsText(m, clock)}
        </p>
        <h4>Present</h4>
        <p>{presentText(m, people)}</p>
        <h4>Agenda</h4>
        <ol className="memo-agenda">
          {m.agenda.map((a) => (
            <li key={a.taskId}>{a.title}{a.ownerId ? ` (${people.get(a.ownerId)?.name ?? a.ownerId})` : ''} <span className="muted">· {TASK_WORD[a.status]}</span></li>
          ))}
        </ol>
        <h4>Proceedings</h4>
        {m.truncated && <p className="muted">Earlier lines are left out; these are the latest.</p>}
        <ul className="memo-lines">
          {m.lines.map((l, i) => {
            const who = lineWho(l, people);
            return (
              <li key={`${l.at}-${i}`} className={`memo-line line-${l.kind}`}>
                <time dateTime={l.at}>{multiDay ? `${dayOf(l.at)} ` : ''}{clock(l.at)}</time>
                <span>{who && <strong>{who}: </strong>}{l.kind === 'comment' ? `“${l.text}”` : l.text}</span>
              </li>
            );
          })}
        </ul>
        {results.length > 0 && (
          <>
            <h4>Outcome</h4>
            <ul className="memo-results">
              {results.map((l, i) => <li key={`${l.at}-${i}`}><span aria-hidden="true">{RUN_META.ok.icon} </span>{lineWho(l, people) && <strong>{lineWho(l, people)}: </strong>}{l.text}</li>)}
            </ul>
          </>
        )}
        <footer className="memo-foot">Taken from the kanban record by Dunder Mifflin OS. No AI wrote these minutes.</footer>
      </article>
    </div>
  );
}
