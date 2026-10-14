// A webhook event (ingest/schema.ts) -> the timeline event it stands for. Text is already validated; it is made one
// short scrubbed line here (oneLine.ts) like every other timeline title.
import type { BotStatus, Task } from '../../../../shared/contract.ts';
import type { TimelineKind } from '../../../../shared/observability.ts';
import { oneLine } from '../../domain/oneLine.ts';
import type { IngestEvent } from './schema.ts';
import type { NewTimelineEvent } from './timelineLog.ts';

const TASK_KIND: Readonly<Record<Task['status'], TimelineKind>> = { todo: 'task.created', doing: 'task.started', done: 'task.finished', blocked: 'task.blocked' };
const STATUS_WORD: Readonly<Record<BotStatus, string>> = {
  working: 'Working', idle: 'Idle', offline: 'Offline', error: 'Error', meeting: 'In a meeting', 'needs-input': 'Needs your input',
};

export function timelineOfIngest(e: IngestEvent, source: string): NewTimelineEvent {
  const at = new Date(e.at).toISOString();
  switch (e.type) {
    case 'status':
      if (e.status === 'error') return { at, kind: 'error', title: oneLine(e.activity ?? 'Reported an error'), source };
      return { at, kind: 'status', title: STATUS_WORD[e.status], ...(e.activity ? { detail: oneLine(e.activity) } : {}), source };
    case 'activity':
      return { at, kind: 'activity', title: oneLine(e.text), source };
    case 'task':
      return { at, kind: TASK_KIND[e.status], title: oneLine(e.title), source };
    case 'message':
      return { at, kind: 'message.out', title: oneLine(e.text), source };
    case 'approval':
      return { at, kind: 'status', title: 'Asked for your approval', detail: oneLine(e.title), source };
    case 'approval-withdrawn':
      return { at, kind: 'status', title: 'Withdrew an approval request', source };
    case 'controls':
      return { at, kind: 'status', title: e.verbs.length ? 'Gave the office its controls' : 'Withdrew its controls', ...(e.verbs.length ? { detail: e.verbs.join(', ') } : {}), source };
  }
}
