# Architecture

Dunder Mifflin OS is a browser dashboard for a fleet of AI agents, drawn as an isometric office. This page explains how
the pieces fit together: the shared data contract, the agent adapters, how rooms map to places on the map, the
security model, and how to add a character or a seat. For running it, see the [README](../README.md); for agent
sources, [docs/adapters](adapters/README.md); for the threat model, [SECURITY.md](../SECURITY.md).

## The big picture

```
 agent sources                 server (Node 22, node:http)                         browser (React + SVG)
 ─────────────                 ───────────────────────────                         ─────────────────────
 ~/.hermes (read-only) ──┐
 webhook POSTs ──────────┼──▶ adapters ──▶ office layer ──▶ OfficeSnapshot ──▶ GET /api/office
 Claude Code http hooks ─┤    (one per      (seating:          (shared/         SSE /api/events
 demo day (in memory) ───┘     source)       agent → person)    contract.ts)    windows, map, list
                                    ▲                                  │
                                    └──── chat / tasks / approvals ◀───┘  POST (writes on + capability)
```

- **`shared/`** holds what both sides import: the contract (`contract.ts`, `controls.ts`, `observability.ts`), the
  office data (`office.ts` + `office/`: areas, walls, furniture, seats, staff), the demo day (`demo/`), the cron
  expander (`schedule/`) and demo fixtures. It is plain data and pure functions; nothing in it does I/O.
- **`server/`** runs the adapters, seats their agents at characters, composes one snapshot, serves it over HTTP and
  pushes changes over Server-Sent Events. It also serves the built web app (`DMOS_SERVE_WEB=1`, the CLI turns it on).
- **`web/`** is a Vite + React app. The map is an SVG renderer with a pinhole camera (`web/src/iso/projection.ts`) and
  a painter's sort (`web/src/iso/depth.ts`); the OS chrome (top bar, windows, taskbar, Ask Pam) sits on top. Below
  720 px the map becomes a list.

## The contract (`shared/contract.ts`)

The browser only ever sees display data. The main types:

| Type | What it is |
|---|---|
| `Person` | a member of staff: `id`, `name`, `title`, `seatId`, `look` (drawing parameters) and, when an agent sits there, `bot: { profile, role, adapter, capabilities }` |
| `Presence` | per person: `status` (`working` · `idle` · `meeting` · `needs-input` · `error` · `offline` · `no-bot`), a short `activity` line, `since`, and `roomId` when they are away from their desk |
| `Room` | a chat room: `id`, `name`, `areaId` (where it is on the map), `kind` (`ops` · `team` · `dm` · `common`), `memberIds` |
| `Task` | a card: `title`, `status` (`todo` · `doing` · `blocked` · `done`), `ownerId`, `roomId`, `shared` |
| `ScheduledJob` | a person's scheduled job, with an optional parsed `rule` and `timeZone` (the calendar expands these) |
| `Approval` | something an agent waits on you for (the inbox at Toby's desk), with a `risk` and whether it is `decidable` here |
| `AgentCapabilities` | what an agent's adapter can do: `chat`, `createTask`, `approvals`, `pause`, `stop`, `runJob`, `reassign` |
| `OfficeSnapshot` | everything above in one value, plus the server's own `capabilities.writes` and the list of adapters |
| `ChatMessage` | `authorId` is a person id, a bot profile, or `'you'` for the human at the keyboard |

Endpoints, all behind the same sign-in when a token is set: `GET /api/office` (the snapshot), `GET /api/events` (SSE:
clients merge `presence` by person id and replace `tasks` and `approvals`), `GET /api/rooms/:id/messages`,
`POST /api/chat`, `POST /api/tasks`, `GET|POST /api/approvals[/:id]`, `POST /api/people/:id/actions` (control verbs),
`GET /api/people/:id/timeline`, `GET /api/usage`, `GET /api/budgets`, `GET /api/schedule`, `GET /api/meetings`,
`GET /api/unattributed`, `GET /api/portraits/:id` and `GET /api/health`.

Changes to the contract should be additive: older servers and the built-in demo snapshot leave new fields out, and
the browser treats a missing field as "not supported".

## Adapters

Every agent source is an `AgentAdapter` (`server/src/adapters/types.ts`). An adapter speaks in its own agent ids (a
Hermes profile key, a webhook agent id, a Claude Code project) and never sees people. It returns a snapshot (agents,
presence, tasks, rooms, jobs) and, optionally, messages, a timeline, usage, meetings, approvals and the control
verbs, each behind a capability flag that is true exactly when the method exists.

Built in: `hermes` (reads `~/.hermes`: gateway state, kanban, sessions, cron; writes only through the `hermes` CLI),
`webhook` (anything that can POST JSON), `claude-code` (Claude Code's `http` hooks) and `demo` (the scripted
"Threat Level Midnight" day, `shared/demo/`). The invariants every adapter keeps are checked by one shared test
suite, `server/test/adapters/contractSuite.ts`: free text is scrubbed, snapshots are immutable, room ids are global,
inbound endpoints refuse a missing or wrong token. [docs/adapters](adapters/README.md) has the full contract and a
how-to for writing a new adapter.

## The office layer: agents become people

`server/src/office/` is the only place where agent ids turn into person ids:

1. **Seating** (`seating.ts`). The built-in seating (`server/src/roster.ts`) puts each Hermes profile of the example
   roster at an Office character's desk; `seats:` in `~/.dunder-mifflin-os/config.yaml` overrides it for any adapter.
   Agents nobody placed sit at the spare desks as temps; the rest show up in Creed's corner (`unattributed.ts`).
2. **Compose** (`compose.ts`, `composeApprovals.ts`). Readings from every adapter plus the seating become one
   `OfficeSnapshot`. Free text is scrubbed again on the way out (`server/src/domain/scrub.ts`), so an adapter that
   forgets cannot leak a token or a home path to the browser.
3. **Writes** (`writes.ts`, `approvalActions.ts`, `controls.ts`). Every write needs the server to allow writes and the
   adapter to declare the capability; approvals and control verbs are written to the audit log before the adapter
   acts.

## Status

For Hermes the status rule lives in `server/src/domain/presence.ts`, first match wins: `offline` (gateway down or the
bot's messaging platform not connected), `error` (a platform error, or a crashed or timed-out run, or a failed job in
the last 60 minutes), `meeting` (a running run on a shared task), `working` (a fresh heartbeat or session activity under
5 minutes old), else `idle`. Other adapters report status directly. A working or idle agent with a pending approval is
shown as `needs-input`.

## Rooms and areas

A **room** is a conversation; an **area** is a place on the floor plan. Each `Room` carries the `areaId` it is drawn
in:

- Group rooms of the example Hermes roster are defined in `server/src/rooms.ts` (`GROUP_ROOMS`): id, display name, the
  room's name inside Hermes, `areaId`, lead profile and members. The Conference Room (`conference`) hosts the shared
  rooms (Ops and Council, `SHARED_ROOM_IDS`); the others sit in the area of their team (the Bullpen, the Annex, the
  Break Room, the Warehouse, Reception).
- A **direct line** (`dm-<profile>`) has no fixed area: it is drawn wherever its bot's seat is, so it follows the desk.
- Rooms from other adapters are prefixed with the adapter id and placed by that adapter.
- Hermes links a room to its messaging group by name, on the server (`server/src/domain/roomChats.ts`); chat ids
  become opaque per-process keys and never leave the adapter.

On the map (`web/src/office/placement.ts`) a person whose presence has a `roomId` is drawn in a meeting seat of that
room's area instead of at their desk; that is how agents working a shared task end up in the Conference Room.

### Floor plan

All of the office is data in `shared/office/`: `areas.ts` (rectangles plus optional bays), `walls.ts` (with door,
window and glass openings), `furniture-*.ts` (desks, shelves, appliances; desks carry up to six items), `seats.ts` and
`staff.ts`. Units are floor units of about 0.5 m: x runs right, y runs to the back, z up. The layout follows the
well-known isometric render of the show's office (see the README's acknowledgements): a long building with the
elevator lobby at the back-left, Michael's office, the Conference Room, the stairwell, the Annex's waiting nook and the
Break Room along the back wall, the Bullpen and Reception in the middle, the Kitchen and Restrooms toward the right, the
Annex at the right end and the Warehouse drawn as an inset floor behind the building.

| Area id | Name | Floor | What is there |
|---|---|---|---|
| `lobby` | Elevator Lobby | carpet | the wall sign, the elevator, David Wallace's visitor chair |
| `bullpen` | Bullpen | carpet | the sales desks, accounting in the front-left corner, spare desks |
| `reception` | Reception | carpet | Pam's curved desk, Erin's side desk, the copier, the IT cart, the temp desk |
| `michael` | Michael's Office | carpet | Michael's desk, guest chairs |
| `conference` | Conference Room | carpet | rows of chairs facing a TV: the meeting seats for Ops, Council and shared tasks |
| `stairwell` | Stairwell | carpet | the corridor and the stair room (the link down to the warehouse) |
| `kitchen` | Kitchen | tile | counter, fridge, the round table where Sensei Ira sits |
| `restrooms` | Restrooms | tile | the men's and women's rooms and their stalls |
| `breakroom` | Break Room | slate | vending machines, tables, the Party Planning Committee board |
| `annex` | The Annex | carpet | Kelly, Ryan, Toby (HR · Approvals) and Holly |
| `warehouse` | Warehouse (downstairs) | concrete | Darryl's office, Roy, shelving |

### Drawing

Boxes have three shaded faces (top lightest), walls are cut away so every room shows, and the painter's sort orders
everything from the camera's eye. Characters (`web/src/chars/`) are drawn from a `Look`: skin, hair colour and style,
shirt, tie, jacket or cardigan, glasses, mustache, beard, build. Status shows as a coloured ring under the figure and
a chip above it: green working, amber idle, blue meeting, orange needs you, red error, grey offline, sepia "No bot
yet".

## Security model

The short version (the full threat model is in [SECURITY.md](../SECURITY.md)):

- **Local and read-only by default.** The server binds `127.0.0.1`, checks the Host header (DNS rebinding), and answers
  every write with `403` unless it runs with `--allow-writes` / `DMOS_ALLOW_WRITES=1`.
- **Two yeses for a write.** A write to an agent needs writes on and the adapter's capability; approvals and control
  verbs also need a confirmation in the page and an audit log entry written first (no log, no action).
- **A token for anything remote.** Binding beyond loopback or publishing the app (`DMOS_PUBLIC_ORIGINS`) needs
  `DMOS_ACCESS_TOKEN`; browsers sign in once and get an `HttpOnly`, `SameSite=Strict` cookie holding an HMAC.
- **Inbound endpoints** (webhook, Claude Code hooks) exist only when configured, need `DMOS_INGEST_TOKEN`, validate
  and rate-limit every event and keep it in memory only.
- **Secrets stay on the server.** Chat ids become opaque keys; all free text is scrubbed of tokens, chat ids, phone
  numbers and home paths; `server/test/liveLeak.test.ts` scans live responses for leaks. Commands run through
  `execFile` with fixed argv lists, never a shell.

## Adding a character or a seat

1. **Seat.** Add a seat to `shared/office/seats.ts`: `id`, `areaId`, `x`/`y` in floor units, `facing`, `kind`
   (`desk`, `meeting`, `spare` or `spot`) and `chair`. Usually you also add a desk to the matching
   `shared/office/furniture-*.ts`.
2. **Character.** Add an entry to `shared/office/staff.ts` with a unique `id`, `name`, `title`, its `seatId` and a
   `look`. Give it a `bot` only if it should be part of the built-in Hermes seating; otherwise leave it without one
   and seat an agent there from the config.
3. **Agent.** To put an agent at the new desk without touching code, map it in `~/.dunder-mifflin-os/config.yaml`:

   ```yaml
   seats:
     toby: { adapter: webhook, agent: deploy-bot, role: Release checks }
   ```

   To change the built-in Hermes seating instead, edit `server/src/roster.ts` (and, for group rooms,
   `server/src/rooms.ts`).
4. **Check.** Run `npm test`: the shared tests check that every person has a real, unique seat inside its area, and a
   server test checks that `shared/office/staff.ts` and `server/src/roster.ts` agree. Then `npm run screenshots` if
   the change shows in `docs/screenshots/`.

Keep new art original: characters are drawn from parameters, and the repository ships no photos or material from
the show (see [ASSETS-LICENSE](../ASSETS-LICENSE)).

## The demo day

`shared/demo/` is a scripted, deterministic day ("Threat Level Midnight") on a 1x/10x/60x clock: who arrives when,
which cards and jobs run, the Council meeting, the chili spill and the approval that waits on you. The `demo` adapter
plays it on the server (`--demo`, Docker's demo profile), and the static build (`npm run build:demo-static`) runs the
same adapter and office code in the browser, so the GitHub Pages demo needs no server.
