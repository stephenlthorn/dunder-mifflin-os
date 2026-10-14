// Room window for an area: tabs for each room located there (Conference Room: Ops + Council + Minutes), members, shared
// tasks, chat. The break room's window links to the Party Planning Committee calendar.
import type { OfficeSnapshot, Room, Task } from '@shared/contract';
import { AREAS } from '@shared/office';
import { areaRooms } from '../../map/mapModel';
import { presenceFor } from '../../office/status';
import { canCreateTask, taskAssignees } from '../../office/capabilities';
import { ChatPanel } from './ChatPanel';
import { NewTaskForm } from './NewTaskForm';
import { MemberList, ReadOnlyHint, TaskList } from './sections';
import { MINUTES_TAB } from './windowState';
import { MinutesPanel } from '../../minutes/MinutesPanel';
import { CalendarIcon } from '../icons';

type Props = {
  areaId: string;
  room: Room;
  snapshot: OfficeSnapshot;
  demo: boolean;
  writable: boolean; // false on a read-only server: no new-task form, no chat composer
  onSelectRoom: (roomId: string) => void;
  onOpenPerson: (id: string) => void;
  onTaskCreated: (task: Task) => void;
  minutes?: { now: number }; // the Conference Room's Minutes tab is showing
  onOpenCalendar?: () => void; // the break room hosts the Party Planning Committee
};

/** The area whose window has a Minutes tab, and the one that holds the Party Planning Committee calendar. */
export const MINUTES_AREA = 'conference';
const COMMITTEE_AREA = 'breakroom';

const KIND: Record<Room['kind'], string> = { ops: 'Ops room · shared tasks', team: 'Team room', common: 'Common room', dm: 'Direct line' };

export function selectedRoom(snapshot: OfficeSnapshot, areaId: string, roomId?: string): Room | undefined {
  const rooms = areaRooms(snapshot.rooms, areaId);
  return rooms.find((r) => r.id === roomId) ?? rooms[0];
}

export function AreaWindow({ areaId, room, snapshot, demo, writable, onSelectRoom, onOpenPerson, onTaskCreated, minutes, onOpenCalendar }: Props) {
  const rooms = areaRooms(snapshot.rooms, areaId);
  const area = AREAS.find((a) => a.id === areaId);
  const members = room.memberIds.flatMap((id) => snapshot.people.filter((p) => p.id === id));
  const here = snapshot.people.filter((p) => snapshot.presence[p.id]?.roomId === room.id);
  const tasks = snapshot.tasks.filter((t) => t.roomId === room.id || (room.kind === 'ops' && t.shared && !t.roomId));
  const bots = taskAssignees(room, snapshot.people);
  const lead = members[0];

  const hasMinutes = areaId === MINUTES_AREA;
  const tabs = (rooms.length > 1 || hasMinutes) && (
    <div className="tabs" role="tablist" aria-label={`Rooms in ${area?.name ?? areaId}`}>
      {rooms.map((r) => (
        <button key={r.id} type="button" role="tab" aria-selected={!minutes && r.id === room.id} className="tab" onClick={() => onSelectRoom(r.id)}>
          {r.name}
        </button>
      ))}
      {hasMinutes && (
        <button type="button" role="tab" aria-selected={Boolean(minutes)} className="tab" onClick={() => onSelectRoom(MINUTES_TAB)}>Minutes</button>
      )}
    </div>
  );
  if (minutes) return <div className="area-window">{tabs}<MinutesPanel snapshot={snapshot} demo={demo} now={minutes.now} /></div>;

  return (
    <div className="area-window">
      {tabs}
      {areaId === COMMITTEE_AREA && onOpenCalendar && (
        <button type="button" className="ppc-open" onClick={onOpenCalendar}>
          <CalendarIcon /> Party Planning Committee calendar <span className="muted">· every scheduled job</span>
        </button>
      )}
      <p className="muted">{KIND[room.kind]} · Location: {area?.name ?? areaId}{lead ? ` · Lead: ${lead.name}` : ''}</p>
      <h3>Members</h3>
      <MemberList members={members} presenceOf={(p) => presenceFor(p, snapshot.presence)} onOpen={onOpenPerson} live={!demo} />
      {here.length > 0 && (
        <>
          <h3>In the room now</h3>
          <MemberList members={here} presenceOf={(p) => presenceFor(p, snapshot.presence)} onOpen={onOpenPerson} live={!demo} />
        </>
      )}
      <h3>{room.kind === 'ops' ? 'Shared tasks' : 'Tasks'}</h3>
      <TaskList tasks={tasks} empty="No tasks in this room." />
      {room.kind === 'ops' && canCreateTask(room) && bots.length > 0
        && (writable ? <NewTaskForm bots={bots} demo={demo} onCreated={onTaskCreated} roomId={room.id} /> : <ReadOnlyHint what="creating shared tasks" />)}
      <h3 className="chat-heading">Chat room: {room.name} — {area?.name ?? areaId}</h3>
      <ChatPanel key={room.id} room={room} lead={lead} people={snapshot.people} demo={demo} writable={writable} />
    </div>
  );
}
