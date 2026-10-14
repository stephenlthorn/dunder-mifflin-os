// "The documentary crew": a to-camera card with the bot's portrait in a viewfinder (REC dot, corner marks), a
// lower third with their name and role, and the day in one paragraph (observability/talkingHead.ts, no LLM).
import type { Person } from '@shared/contract';
import { Portrait } from '../Portrait';
import { clockTime } from '../../observability/timelineModel';

type Props = { person: Person; text: string; now: number; live: boolean };

export function TalkingHead({ person, text, now, live }: Props) {
  return (
    <figure className="talking-head" aria-label={`Talking head: ${person.name}`}>
      <div className="th-frame">
        <span className="th-rec" aria-hidden="true"><i /> REC {clockTime(now)}</span>
        <Portrait person={person} live={live} decorative />
        <div className="th-lower-third">
          <strong>{person.name}</strong>
          <span>{person.bot?.role ?? person.title}</span>
        </div>
      </div>
      <blockquote className="th-quote" data-testid="talking-head">{text}</blockquote>
    </figure>
  );
}
