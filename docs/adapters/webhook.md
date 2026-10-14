# Webhook adapter

If it can POST, it can sit at a desk. Any agent, script or CI job can show up in the office by sending small JSON
events to the server. The office keeps them in memory only. A webhook agent has no chat composer and can't be given
tasks. What the office sends back goes to callback URLs the agent names: your answer to an
[approval request](#approval-requests), and pause / resume / stop when the agent offers [controls](#control-verbs).

## Turn it on

1. Make a token and export it where the server runs (at least 24 characters):

   ```sh
   export DMOS_INGEST_TOKEN="$(openssl rand -hex 32)"
   ```

2. List the adapter in `~/.dunder-mifflin-os/config.yaml` (see [README.md](README.md#config)):

   ```yaml
   adapters:
     - hermes        # keep it if you also run Hermes
     - webhook
   ```

3. Restart the server. It refuses to start with the webhook adapter and no token.

## Send an event

`POST http://127.0.0.1:4318/api/ingest/<agent-id>` with `Content-Type: application/json` and
`Authorization: Bearer $DMOS_INGEST_TOKEN`. The agent id is 1-28 lower-case letters, digits or dashes; the agent
appears on its first event. A success is `204 No Content`.

```sh
curl -sS -X POST http://127.0.0.1:4318/api/ingest/deploy-bot \
  -H "Authorization: Bearer $DMOS_INGEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"status","status":"working","activity":"Deploying v1.2 to staging","name":"Deploy Bot","role":"Ships releases"}'
```

The server only listens on 127.0.0.1, so post from the same machine (or through the `tailscale serve` origin you set
in `DMOS_PUBLIC_ORIGINS`).

## Events

One event per request. The full JSON Schema is [webhook.schema.json](webhook.schema.json). Every event may also carry
`name` (≤ 60 characters, the name on the map), `role` (≤ 80, what it does) and `at` (an ISO 8601 time; default now).
Unknown fields are refused, so a typo gets a 400 that names it.

| `type` | Fields | Effect |
|---|---|---|
| `status` | `status`: `working` · `idle` · `offline` · `error` · `meeting` · `needs-input`; optional `activity` (one line, ≤ 200), `room` | Sets the status ring and chip. `meeting` with a `room` (e.g. `ops`) draws the agent in that room. `needs-input` means it is waiting on you. |
| `activity` | `text` (one line, ≤ 200) | What it is doing now. Marks the agent `working`. |
| `task` | `id` (≤ 64 of `A-Z a-z 0-9 . _ -`), `title` (≤ 200), `status`: `todo` · `doing` · `blocked` · `done`; optional `room`, `shared` | Creates or updates one of its tasks. Done tasks drop off after two days. |
| `message` | `text` (≤ 4000, may span lines) | A message in the agent's direct line (the chat in its window). |
| `approval` | `id` (like a task id), `title` (≤ 200); optional `detail` (≤ 600, may span lines), `kind`: `permission` (default) · `question` · `task`, `risk`: `low` · `medium` (default) · `high`, `callback` | It waits on you: the request goes to the approvals inbox (Toby's desk) and the agent shows as needing you. Same `id` again replaces it. See [Approval requests](#approval-requests). |
| `approval-withdrawn` | `id` | It no longer waits for that request (answered elsewhere, timed out). |
| `controls` | `verbs`: a list of `pause` · `stop` (`[]` withdraws them); `callback` (required with verbs) | Lets the office pause, resume and stop the agent: signed `control` events go to `callback`. See [Control verbs](#control-verbs). |

```sh
# what it is doing
curl ... -d '{"type":"activity","text":"Running database migrations"}'
# it needs you
curl ... -d '{"type":"status","status":"needs-input","activity":"Approve the production deploy?"}'
# a task card
curl ... -d '{"type":"task","id":"deploy-42","title":"Deploy v1.2","status":"doing"}'
# a message in its direct line
curl ... -d '{"type":"message","text":"Deployed v1.2 to staging. All checks green."}'
```

## Approval requests

```sh
curl -sS -X POST http://127.0.0.1:4318/api/ingest/deploy-bot \
  -H "Authorization: Bearer $DMOS_INGEST_TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"approval","id":"deploy-42","title":"Deploy v1.2 to production?","detail":"3 migrations, no downtime","risk":"high",
       "callback":"https://deploy.example.com/dmos/decision"}'
```

When you click **Approve** or **Reject** in HR · Approvals (writes on, signed in if the server asks for it), the
office writes the decision to its audit log and POSTs it to `callback`:

```http
POST /dmos/decision HTTP/1.1
Content-Type: application/json
X-DMOS-Timestamp: 1791900000
X-DMOS-Signature: sha256=5d1c…   (hex HMAC-SHA256 of "<timestamp>.<body>" keyed with DMOS_INGEST_TOKEN)

{"type":"approval-decision","id":"deploy-42","agent":"deploy-bot","decision":"reject","note":"Not on a Friday","decidedAt":"2026-10-13T15:00:00.000Z"}
```

- **Callback rules:** `https://` anywhere, or plain `http://` only on `127.0.0.1` / `localhost`; no `user:password@`;
  up to 500 characters. The URL stays on the server: the browser never sees it. No redirects are followed.
- **Check the signature** before you act, and reject old timestamps (say, more than 5 minutes) so a captured request
  can't be replayed. The token itself is never sent. In Node:

  ```js
  import { createHmac, timingSafeEqual } from 'node:crypto';
  const ts = req.headers['x-dmos-timestamp'];
  const want = `sha256=${createHmac('sha256', process.env.DMOS_INGEST_TOKEN).update(`${ts}.${rawBody}`).digest('hex')}`;
  const got = String(req.headers['x-dmos-signature'] ?? '');
  const ok = Math.abs(Date.now() / 1000 - Number(ts)) < 300
    && got.length === want.length && timingSafeEqual(Buffer.from(want), Buffer.from(got));
  ```

- **Answer with any 2xx** once you have the decision; the request then leaves the inbox. A non-2xx answer, no answer
  within 5 seconds, or a connection error leaves it there and shows the error, so you can try again.
- **No callback:** the request is shown in the inbox ("answer it where the agent runs") without buttons. Send
  `approval-withdrawn` when it is settled.
- At most 20 pending requests per agent (`429` after that); they go when the agent is forgotten.

## Control verbs

An agent that wants the office's **Pause**, **Resume** and **Stop** buttons offers them once (and again after a
restart; the office keeps them in memory):

```bash
curl -sS -X POST http://127.0.0.1:4318/api/ingest/deploy-bot -H "Authorization: Bearer $DMOS_INGEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"controls","verbs":["pause","stop"],"callback":"https://deploy.example.com/dmos/control"}'
```

When you confirm a verb in its window (writes on, signed in if the server asks for it), the office writes it to the
audit log and POSTs it to `callback`, signed exactly like a decision (same headers, same checks):

```json
{"type":"control","id":"0b6f…-uuid","agent":"deploy-bot","action":"pause","requestedAt":"2026-10-13T15:00:00.000Z"}
```

`action` is `pause`, `resume` (offered with `pause`) or `stop`. Answer with any 2xx once you have it; the office then
shows the agent gone home (offline, "Paused from the office") or idle until your next event says otherwise. A verb
the agent did not offer is not shown; the callback rules are those of approval callbacks. Budgets with `autoPause`
(Corporate) pause through this callback too.

## Where it sits

An agent with no desk of its own sits at a spare desk as a temp ("Temp · Webhook"). To make it a character, map it
in the config; the desk is kept for it (shown offline) until its first event:

```yaml
seats:
  jim: { adapter: webhook, agent: deploy-bot, role: Release manager }
```

## Limits and safety

- **Auth:** the bearer token, compared in constant time. Without a token the server won't start this adapter. It replaces the browser sign-in for this endpoint: a session cookie or `DMOS_ACCESS_TOKEN` won't do, and the endpoint works on a read-only server (it only reports).
- **Validation:** the schema above; bodies over 16 KB get `413`, anything that isn't JSON `400`/`415`.
- **Rate limits:** 120 events a minute per agent (`429` with `Retry-After`), 1200 a minute across all inbound
  endpoints, at most 64 agents at once.
- **Memory only:** nothing is written to disk (except your approval decisions, in the office's audit log). Per agent it keeps the last 100 messages and 50 tasks. An agent that
  is `working` or in a `meeting` and goes quiet for 15 minutes shows as idle; after 24 hours of silence it is
  forgotten.
- **Scrubbing:** names, roles, activity, task titles and messages are scrubbed of tokens, API keys, chat ids, phone
  numbers and home paths before they are stored, and again before they leave the server.
- **Browsers can't post:** a request from a web page on another origin is refused (`403`), so a malicious page
  can't use your browser to post events.
