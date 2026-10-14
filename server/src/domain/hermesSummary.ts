// What the Hermes adapter can do: chat (`hermes chat`), create shared cards (`hermes kanban create`) and answer the
// kanban cards that wait on you (`hermes kanban unblock/complete/reopen-review/archive`, domain/hermesApprovals.ts).
// Control verbs (chat/controlService.ts): stop a running card, run a cron job now, hand a card to another bot. No
// pause: Hermes has no safe per-profile pause (`hermes pause` is fleet-wide; see controlService.ts).
import type { AgentCapabilities } from '../../../shared/contract.ts';

export const HERMES_CAPABILITIES: AgentCapabilities = Object.freeze({
  chat: true, createTask: true, approvals: true, pause: false, stop: true, runJob: true, reassign: true,
});

export const HERMES_SUMMARY = Object.freeze({ id: 'hermes', kind: 'hermes' as const, label: 'Hermes', capabilities: HERMES_CAPABILITIES });
