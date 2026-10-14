// Ops room: create a shared task for one of the bots (POST /api/tasks to this room; local only in demo mode).
import { type FormEvent, useState } from 'react';
import type { Person, Task } from '@shared/contract';
import { createSharedTask } from '../../data/api';
import { shortName } from '../../office/names';

type Props = { bots: readonly Person[]; demo: boolean; onCreated: (task: Task) => void; roomId?: string };

export function NewTaskForm({ bots, demo, onCreated, roomId = 'ops' }: Props) {
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState(bots[0]?.bot?.profile ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = title.trim().slice(0, 200);
    if (!clean || !assignee) return;
    setBusy(true);
    setError(null);
    const owner = bots.find((b) => b.bot?.profile === assignee);
    const res = demo
      ? { ok: true as const, task: { id: `local-task-${Date.now()}`, title: clean, status: 'todo' as const, ownerId: owner?.id, roomId, shared: true, updatedAt: new Date().toISOString() } }
      : await createSharedTask(clean, assignee, roomId);
    setBusy(false);
    if (res.ok) {
      onCreated(res.task);
      setTitle('');
    } else {
      setError(res.error);
    }
  };

  return (
    <form className="new-task" onSubmit={submit} aria-label="New shared task">
      <h3>New shared task</h3>
      <div className="new-task-row">
        <label className="sr-only" htmlFor="new-task-title">Task title</label>
        <input id="new-task-title" value={title} maxLength={200} placeholder="What needs doing?" onChange={(e) => setTitle(e.target.value)} />
        <label className="sr-only" htmlFor="new-task-assignee">Assignee</label>
        <select id="new-task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          {bots.map((b) => <option key={b.id} value={b.bot!.profile}>{shortName(b.name)} ({b.bot!.profile})</option>)}
        </select>
        <button type="submit" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create'}</button>
      </div>
      {error && <p className="chat-error" role="alert">{error}</p>}
    </form>
  );
}
