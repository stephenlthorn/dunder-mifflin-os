// The Hermes seam. Everything the server knows about Hermes arrives through a HermesSource as a HermesState.
// Invariant: no Telegram chat id, token, phone number or filesystem path appears in these types. Adapters
// replace chat ids with opaque chat keys (HMAC with a per-process secret) before data leaves them.

import type { ScheduleRule } from '../../../shared/contract.ts';
import type { MeetingRecords } from './meetingTypes.ts';
import type { HermesActivitySource } from './activityTypes.ts'; // timeline + usage reads (optional)

export type EpochSeconds = number;

export type PlatformState = {
  readonly profile: string;
  readonly state: string; // 'connected' when healthy
  readonly errorCode: string | null;
  readonly updatedAt: string | null; // ISO
};

export type GatewayStatus = {
  readonly running: boolean;
  readonly platforms: ReadonlyArray<PlatformState>; // '<profile>:telegram' entries only
};

export type TelegramRoomConfig = {
  readonly profile: string;
  readonly enabled: boolean;
  readonly groupChats: ReadonlyArray<string>; // chat keys of group_allowed_chats
  readonly leadChats: ReadonlyArray<string>; // chat keys of free_response_chats (rooms it leads)
  readonly roomHints: Readonly<Record<string, string>>; // chat key -> room name named in its channel prompt
};

export type KanbanTask = {
  readonly id: string;
  readonly title: string;
  readonly assignee: string | null;
  readonly status: string; // triage|todo|ready|scheduled|running|review|blocked|done|archived
  readonly createdBy: string | null;
  readonly tenant: string | null;
  readonly createdAt: EpochSeconds;
  readonly startedAt: EpochSeconds | null;
  readonly completedAt: EpochSeconds | null;
  readonly lastHeartbeatAt: EpochSeconds | null;
};

export type KanbanRun = {
  readonly taskId: string;
  readonly profile: string | null;
  readonly status: string; // running|done|blocked|crashed|timed_out|failed|released
  readonly outcome: string | null;
  readonly startedAt: EpochSeconds;
  readonly endedAt: EpochSeconds | null;
  readonly lastHeartbeatAt: EpochSeconds | null;
};

export type KanbanSub = {
  readonly taskId: string;
  readonly chatKey: string;
  readonly chatType: string | null; // dm|group|channel|thread
  readonly notifierProfile: string | null;
};

export type KanbanLink = {
  readonly parentId: string;
  readonly childId: string;
  readonly parentAssignee: string | null;
  readonly childAssignee: string | null;
};

/** A card that may be waiting on a human (kanbanWaiting.ts): blocked, in review or in triage. */
export type KanbanWaiting = {
  readonly id: string;
  readonly title: string;
  readonly status: 'blocked' | 'review' | 'triage';
  readonly assignee: string | null;
  readonly createdBy: string | null;
  readonly blockKind: string | null; // needs_input | capability | transient | dependency | null (generic block)
  readonly event: 'blocked' | 'block_loop_detected' | 'review_requested' | null; // the latest of these on the card
  readonly reason: string | null; // that event's reason (or a review's summary)
  readonly since: EpochSeconds; // that event's time, else the card's creation
  readonly comment: string | null; // the card's latest comment
};

export type KanbanState = {
  readonly tasks: ReadonlyArray<KanbanTask>;
  readonly runs: ReadonlyArray<KanbanRun>;
  readonly subs: ReadonlyArray<KanbanSub>;
  readonly links: ReadonlyArray<KanbanLink>;
  readonly waiting?: ReadonlyArray<KanbanWaiting>; // absent in recordings made before the approvals inbox
};

export type SessionActivity = {
  readonly profile: string;
  readonly lastActivityAt: EpochSeconds | null;
  readonly title: string | null;
  readonly source: string | null; // telegram|cli|kanban|cron|...
};

export type CronJob = {
  readonly profile: string;
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly schedule: string;
  readonly nextRunAt: string | null;
  readonly lastRunAt: string | null;
  readonly lastStatus: string | null;
  readonly rule?: ScheduleRule; // from the job's `schedule` object, when it is one we can expand
  readonly timeZone?: string; // the profile's `timezone` in config.yaml, when set; else the machine's
};

export type HermesState = {
  readonly recordedAt: string; // ISO time the reading was taken
  readonly gateway: GatewayStatus | null; // null = could not be read
  readonly telegram: ReadonlyArray<TelegramRoomConfig>;
  readonly chatNames: Readonly<Record<string, string>>; // chat key -> Telegram group title
  readonly kanban: KanbanState;
  readonly sessions: ReadonlyArray<SessionActivity>; // most recent session per profile
  readonly cron: ReadonlyArray<CronJob>;
  readonly personas: Readonly<Record<string, string>>; // profile -> character display name
};

/** A Hermes group room resolved to its Telegram chat (by opaque key) and the profiles configured in it. */
export type RoomChat = { readonly roomId: string; readonly chatKey: string; readonly profiles: ReadonlyArray<string> };

export type MessageQuery = {
  readonly profile: string;
  readonly target: { readonly kind: 'group'; readonly chatKey: string } | { readonly kind: 'dm' } | { readonly kind: 'none' };
  readonly osSessionTitle: string | null; // the Dunder Mifflin OS chat thread for this room in that profile
  readonly limit: number;
};

export type RawMessage = {
  readonly uid: string;
  readonly profile: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly at: EpochSeconds;
  readonly origin: 'telegram' | 'os';
  readonly platformMessageId: string | null;
};

export type MessagesResult =
  | { readonly ok: true; readonly messages: ReadonlyArray<RawMessage> }
  | { readonly ok: false; readonly reason: string };

export interface HermesSource extends Partial<HermesActivitySource> {
  readonly kind: 'live' | 'fixture';
  readState(): Promise<HermesState>;
  readMessages(query: MessageQuery): Promise<MessagesResult>;
  /** Cards that can be meetings, active in [from, to) (epoch seconds), for Conference Room minutes. null = unreadable. */
  readMeetingRecords?(period: { readonly from: EpochSeconds; readonly to: EpochSeconds }): Promise<MeetingRecords | null>;
}
