# Agent adapters

The office doesn't care where its agents come from. Each agent source is an **adapter**; the server runs any number of
them side by side and seats their agents at the characters you choose. Built in:

| Adapter | Agents | Can the office act? | Guide |
|---|---|---|---|
| `hermes` | Hermes profiles, read-only from `~/.hermes` (gateway, kanban, sessions, cron) | chat (`hermes chat`), create shared tasks (`hermes kanban create`), answer kanban cards that wait on you, stop a running card, run a cron job now, reassign a card (no pause), with `--allow-writes` | [ARCHITECTURE.md](../ARCHITECTURE.md) |
| `webhook` | anything that can POST JSON | answer its approval requests (POSTed to its callback); pause, resume and stop when the agent offers a control callback; with `--allow-writes` | [webhook.md](webhook.md) |
| `claude-code` | Claude Code sessions, through its `http` hooks | allow/deny permission prompts, with `decide: true` and `--allow-writes`; stop a session at its next tool step, with `--allow-writes`; otherwise observe only | [claude-code.md](claude-code.md) |
| `demo` | "Threat Level Midnight": a scripted, fictional office day on a 1x/10x/60x clock (`shared/demo/`); no keys | chat (canned replies), shared tasks, stop a card, run a job now and reassign, in memory; scripted usage for the ledger and budgets | [README](../../README.md#demo-mode-threat-level-midnight) |

The recorded Hermes fixture (`server/fixtures/`) still drives the tests and `npm run demo:server`.

**Writes need two yeses.** The server must allow writes (`DMOS_ALLOW_WRITES=1` / `--allow-writes`; read-only is the
default) and the agent's adapter must declare the capability. The snapshot carries both: `capabilities.writes` for
the server, and `capabilities` on each bot and room for its adapter; the browser offers a control only when both
allow it. Inbound endpoints (webhook, Claude Code hooks) only report, so they work on a read-only server, and they
skip the browser sign-in (`DMOS_ACCESS_TOKEN`) because they carry `DMOS_INGEST_TOKEN` instead. (A Claude Code
`PermissionRequest` is only held for a decision when writes are on and the adapter has `decide: true`.)

## Approvals (the inbox at Toby's desk)

What agents wait on you for goes to **HR · Approvals**: click Toby Flenderson, or the top bar's "N need you". A
working or idle bot with something pending is shown as needing you (status `needs-input`: raised hand, orange ring),
and Pam's reception phone rings. `GET /api/approvals` lists the same items as the snapshot's `approvals`;
`POST /api/approvals/:id` with `{"decision": "approve" | "reject", "note"?: "…"}` decides one. A decision needs
writes on, the adapter's `approvals` flag and (with `DMOS_ACCESS_TOKEN`) a signed-in browser; it is written to the
audit log (`~/.dunder-mifflin-os/audit.log`, `DMOS_AUDIT_LOG`; JSON lines, no secrets) **before** the adapter acts,
and refused if the log can't be written. The office never decides on its own.

| Adapter | What counts as an approval | Approve | Reject |
|---|---|---|---|
| `hermes` | a `blocked` card of a bot (`needs_input`, `capability` or untyped blocks) | `hermes kanban unblock <id> --reason=…` | `comment` + `archive` |
| | a `blocked` card assigned to a person, or to nobody (your to-do) | `hermes kanban complete <id> --result=…` | `comment` + `archive` |
| | a `review` card no bot reviews (no bot assignee) | `complete` | `hermes kanban reopen-review <id> --reason=…` (back with your note) |
| | a `triage` card after an unblock loop | shown only: fix the cause in Hermes | |
| `claude-code` | a `PermissionRequest` hook | answers `allow` (held hook, `decide: true`) | answers `deny`, your note as the reason |
| | a `permission_prompt` / `elicitation_dialog` / `agent_needs_input` notification, or any request with decisions off | shown only: answer in Claude Code | |
| `webhook` | an `approval` event | POSTs `approve` to its `callback` (signed) | POSTs `reject` with your note |
| | an `approval` event without a `callback` | shown only | |

Hermes decisions re-read the board first and refuse a card that changed state since it was listed. Not counted for
Hermes: review cards a bot reviews (Hermes dispatches the assignee with its review skill), plain triage cards (the
decomposer's) and dependency waits. Hermes API-server run approvals (`/v1/runs/{id}/approval`) only exist for runs
started through the API server, which the office doesn't use yet (see below).

## Config

`~/.dunder-mifflin-os/config.yaml` (or `config.yml`, `config.json`, or the file in `DMOS_CONFIG`). Without one the
server runs Hermes alone with the built-in seating, exactly as before. Mistakes stop the server with a message that
names the field.

```yaml
adapters:            # which agent sources run, in this order (default: [hermes])
  - hermes           # { kind: hermes, source: fixture } reads the recorded fixture instead of ~/.hermes
  - webhook          # needs DMOS_INGEST_TOKEN
  - claude-code      # needs DMOS_INGEST_TOKEN
  - demo             # { kind: demo, speed: 10, start: '10:25', seed: 7 }; DMOS_SOURCE=demo runs it alone
seats:               # character -> agent, merged over the built-in Hermes seating (server/src/roster.ts)
  dwight: { adapter: hermes, agent: campaigns }
  jim: { adapter: claude-code, agent: paper-site, role: Pair programmer }
  kevin: { adapter: webhook, agent: deploy-bot }
  pam: null          # this desk has no bot
```

- **Characters** are the staff ids in `shared/office/staff.ts` (`pam`, `dwight`, `jim`, …).
- **A configured desk is kept** for its agent even before the agent first reports (it shows offline). A built-in
  desk only gets its bot when the adapter reports that agent.
- **Moving an agent** to another character frees its old desk, which then shows "No bot yet".
- **Unmapped agents** sit at the spare desks as temps ("Temp · Claude Code"), in adapter order. There are three spare
  desks; agents beyond that aren't drawn until you give them a character.
- **Characters without an agent** keep their desk and show "No bot yet".
- **Names:** a Hermes persona renames its character, as before (unless the staff entry has `keepName`). An agent from
  any other adapter keeps the character's name; its own name shows in the window as "Agent: …". Temps go by the
  agent's name.
- `DMOS_INGEST_TOKEN` (an environment variable, never the config file) is the bearer token for the inbound
  adapters: at least 24 characters, e.g. `openssl rand -hex 32`.

## The contract

One TypeScript interface, `AgentAdapter` in [`server/src/adapters/types.ts`](../../server/src/adapters/types.ts):

| Member | What it gives the office |
|---|---|
| `id`, `kind`, `label` | instance id from the config, `hermes` / `webhook` / `claude-code` / `demo`, a display name |
| `capabilities` | `{ chat, createTask, approvals, pause, stop, runJob, reassign }`: booleans, true exactly when the matching method exists. The browser gets them on each bot and room and hides what an adapter can't do. A snapshot may also turn flags off per agent (`capabilities: { <agentId>: { pause: false } }`, e.g. a webhook agent without a control callback); it can never turn one on. |
| `snapshot()` | `{ agents, presence, tasks, rooms, jobs? }` keyed by the adapter's own agent ids: the roster (`{ id, name?, role }`), one `Presence` per agent (`working` · `idle` · `offline` · `error` · `meeting` · `needs-input`), tasks with an `ownerAgentId`, rooms with `memberAgentIds` |
| `readMessages(roomId, limit)` | a room's recent messages (`authorAgentId`, none = the human), or `null` if it isn't this adapter's room |
| `subscribe(listener)` | push adapters announce changes, and open event streams update at once |
| `invalidate()` | drop a cached reading (the poller calls it) |
| `chat`, `createTask`, `listApprovals` + `resolveApproval`, `pause` + `resume`, `stop(agentId, { taskId? })`, `runJob(agentId, jobId)`, `reassign(agentId, taskId, toAgentId)` | optional actions, each behind its flag. For the control verbs the office has already checked writes, the flags, the arguments (against a fresh snapshot: the job is this agent's and on, the card is this agent's and open, the new owner is another agent of the same adapter) and written the audit entry. A job is run by the `id` the adapter put on its `ScheduledJob`. |
| `timeline(agentId, { since, limit })` | optional read: what the agent did, newest first (sessions, messages in/out, tool calls, tasks, scheduled-job runs, errors), each a short scrubbed line; task events carry titles only. Hermes reads it from `~/.hermes`, the webhook keeps the events agents post, Claude Code keeps its hook events. Feeds a person's Timeline tab |
| `usage(agentId, { from, to })` | optional read: tokens per model (input, output, cache read/write) and any cost the agent recorded. Hermes only, from `state.db` `session_model_usage`. The office prices it (`server/src/usage/`) for Angela's ledger; without it the ledger says "No usage data from <adapter>" |
| `meetings(period)` | optional and read-only (no flag): shared tasks and council sessions active in `{ from, to }` (epoch seconds), with minutes built from the record (no LLM): participants, agenda, timestamped lines. The Conference Room's Minutes tab shows them (`GET /api/meetings`). |
| `routes` | inbound POST endpoints (`authorize` runs before the body is read) |

Adapters never see people: the office layer (`server/src/office/`) seats agents at characters and turns agent ids into
person ids in one place. Every adapter keeps the same promises, and
[`server/test/adapters/contractSuite.ts`](../../server/test/adapters/contractSuite.ts) checks each one: free text is
scrubbed (no tokens, chat ids, phone numbers or home paths), room ids are prefixed with the adapter id (Hermes keeps
its historical ids), snapshots never change after they are handed out, and inbound endpoints refuse a missing or
wrong token.

### Writing an adapter

1. Implement `AgentAdapter` in `server/src/adapters/<name>.ts`. A push adapter can reuse the in-memory agent store
   (`ingest/store.ts`: bounded, scrubbed, immutable) and feed it `IngestEvent`s (`ingest/schema.ts`), as the webhook
   and Claude Code adapters do.
2. Add its kind to `ADAPTER_KINDS` and a case to `adapters/factory.ts`.
3. Add a test that calls `describeAdapterContract('<name>', { make })` and feeds it secrets in every free-text field.

## Planned, not built yet

| Adapter | What it would bring | Reference |
|---|---|---|
| OpenTelemetry GenAI receiver | Any agent framework with an OTel exporter (OpenAI Agents SDK, LangGraph, CrewAI, …) via OTLP/HTTP `invoke_agent` and `execute_tool` spans, `gen_ai.agent.*` and `gen_ai.usage.*` attributes | [semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai), [agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md) |
| AG-UI client | LangGraph, CrewAI, Microsoft Agent Framework, Google ADK, Mastra and other AG-UI endpoints: RunStarted/Finished/Error, ToolCall*, StateSnapshot/Delta, interrupts for approvals | [AG-UI](https://github.com/ag-ui-protocol/ag-ui), [events](https://docs.ag-ui.com/concepts/events) |
| Hermes API server (SSE) | Streaming chat, run events, run approvals and stop for Hermes through `/v1/runs`, `/v1/runs/{id}/events`, `/approval`, `/stop` instead of one-shot `hermes chat` (this is what would light up stopping a Hermes chat turn, not only a kanban card, and dangerous-command approvals in the inbox) | [Hermes API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) |

Community-wanted after those: Codex (session JSONL / notify) and the OpenClaw gateway.
