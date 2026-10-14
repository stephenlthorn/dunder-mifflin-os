# Security

## Reporting a vulnerability

Please report security problems **privately**: open this repository's **Security** tab and choose
**Report a vulnerability** (GitHub private vulnerability reporting). Don't open a public issue, pull request or
discussion for a suspected vulnerability.

Include what you found, how to reproduce it, the version (`npx dunder-mifflin-os --version` or the commit) and how
you run it (npx, Docker or from source). Never paste real tokens, chat ids or Hermes data into a report; redacted
examples are enough. You'll get an acknowledgement within 7 days. Fixes land on `main` and in the next release.

## Threat model

Dunder Mifflin OS is a **local-first, read-only-by-default** dashboard for one person's own bots. It is built to be
safe on a laptop with no configuration, and to be reachable from your other devices only when you explicitly
publish it and set an access token.

### Defaults

- **Loopback only.** The server binds `127.0.0.1` unless `DMOS_HOST` says otherwise. Requests must carry a
  `127.0.0.1` / `localhost` Host header (or the host of a configured public origin), which blocks DNS rebinding.
- **Read-only.** Chat, task creation and every other write (any non-GET API route) answer `403` unless the server
  runs with `DMOS_ALLOW_WRITES=1` (`--allow-writes`). The snapshot tells the browser, which hides those controls.
- **Writes need a same-origin JSON request.** A POST that carries an `Origin` must come from the server's own origin,
  the Vite dev origin or a configured public origin, and must be `application/json`. Task creation is rate-limited.
- **No token needed locally.** Local use (loopback bind, no public origins) has no sign-in.

### Remote access

- Setting `DMOS_PUBLIC_ORIGINS` (e.g. a `tailscale serve` URL) or binding beyond loopback with `DMOS_HOST` (as the
  Docker image does) makes the server **refuse to start without `DMOS_ACCESS_TOKEN`** (16+ characters; use
  `openssl rand -hex 24`). With a token, every request is checked, including ones that arrive on loopback.
- Browsers sign in once on `/login`, a no-JavaScript form with a strict Content-Security-Policy. The token is compared
  in constant time; sign-in attempts are rate-limited (10 a minute, server-wide).
- The session cookie is `HttpOnly`, `SameSite=Strict`, `Path=/`, lasts 30 days and holds an HMAC derived from the
  token, never the token itself. Rotating the token signs every browser out. The cookie is `Secure` on every
  HTTPS or proxied origin; only plain loopback requests (Docker's published port, `http://localhost`) get it without
  `Secure`, because Safari refuses Secure cookies there and loopback traffic never crosses a network.
- API calls without a session get `401`; pages redirect to `/login`. `GET /api/health` stays open (it returns only
  `{ "ok": true }`) for container health checks.
- The token is never logged, printed or sent to the browser.
- Use HTTPS for anything beyond this machine: `tailscale serve` (tailnet only) or your own TLS reverse proxy. Public
  exposure (for example Tailscale Funnel) is not a supported setup.

### Inbound agent endpoints (webhook, Claude Code)

- `POST /api/ingest/:agentId` and `POST /api/hooks/claude-code` exist only while the `webhook` / `claude-code`
  adapter is listed in `~/.dunder-mifflin-os/config.yaml`; otherwise they are `404`.
- Agents can't sign in with a cookie, so these two skip the sign-in and require `Authorization: Bearer
  $DMOS_INGEST_TOKEN` instead: a separate secret of at least 24 characters, compared in constant time (hashed first),
  checked before the body is read. The server refuses to start either adapter without it. A session cookie or the
  access token does not open them, and the ingest token opens nothing else.
- Every event is validated (strict schema, size cap: 16 KB for webhooks, 1 MB for Claude Code hooks), rate-limited
  per agent or session and across all inbound endpoints, kept in memory only, and scrubbed like all other text.
  Claude Code hooks keep only display-safe fields: never prompts, commands, tool input or output, or paths, except
  what a pending permission request asks for (the command, a project-relative path or a URL without its query),
  masked and scrubbed, in memory only until it is answered, never logged.
- They only report. They work on a read-only server; no inbound event can make an agent do anything. A write to an
  agent (chat, tasks, approvals, control verbs) needs both `DMOS_ALLOW_WRITES=1` and that agent's adapter capability.

### Approvals

- Deciding an approval (`POST /api/approvals/:id`) needs writes on, the adapter's `approvals` flag, a JSON body from
  an allowed origin and, with `DMOS_ACCESS_TOKEN`, a signed-in browser. Decisions are rate-limited (30 a minute).
- Each decision is appended to a local audit log (`~/.dunder-mifflin-os/audit.log` or `DMOS_AUDIT_LOG`; 0600 file in
  a 0700 directory; JSON lines with the time, approval id, agent, person, kind, risk, title, decision, scrubbed note
  and whether you were signed in) **before** the adapter acts. If it can't be written, nothing is done.
- Nothing is ever approved automatically. Hermes decisions run fixed `hermes kanban` argv lists through `execFile`
  (no shell) after re-reading the card; a card that changed state is refused. A Claude Code permission request is
  held only with `decide: true` and writes on, for at most `holdSeconds`, and otherwise falls back to the terminal.
- Webhook decisions go only to the callback URL the agent gave: `https://`, or `http://` on loopback, no credentials,
  no redirects, 5-second timeout. They carry an HMAC-SHA256 signature of the timestamp and body keyed with
  `DMOS_INGEST_TOKEN`; the token itself is never sent, and the callback URL never reaches the browser.

### Control verbs and budgets

- Pause, resume, stop, run-now and reassign (`POST /api/people/:id/actions`) need writes on, the adapter's flag (and
  the agent's own: a webhook agent offers verbs with a callback), a JSON body from an allowed origin, sign-in with
  `DMOS_ACCESS_TOKEN`, and a confirmation step in the page. They are rate-limited (20 a minute). Arguments are checked
  against a fresh snapshot (the job, the card and the new owner must belong to that desk and adapter).
- Each verb is appended to the audit log (who asked: `local`, `signed-in` or `corporate`) **before** the adapter acts;
  no log, no action. Hermes verbs run fixed `hermes` argv lists through `execFile` (no shell) holding only validated
  ids and fixed text, after re-reading Hermes. Webhook verbs go to the agent's control callback, signed and checked
  like decisions. Claude Code stops only by answering its own next hook.
- Budgets never pause anything unless `budgets.autoPause: true`, and then only bots whose adapter can pause, once per
  period; usage without a price never counts. `GET /api/budgets` is read-only, signed-in and rate-limited.

### Secrets and data

- The server never reads `.env`, `auth.json` or tokens from the Hermes home. Telegram chat ids become opaque,
  per-process HMAC keys inside the adapter and never reach the browser.
- Free text that leaves the server (messages, task titles, activity, job names) is scrubbed of chat ids, Hermes and
  home paths, tokens, API keys and phone numbers (`server/src/domain/scrub.ts`); `server/test/liveLeak.test.ts` scans
  every live API response for leaks.
- Hermes files and databases are only read (SQLite opens read-only). Chat runs the `hermes` CLI with `execFile`
  (no shell), for whitelisted profiles only, with a length cap and one message in flight per bot.
- Logs are JSON on stderr and never include message text, the access token or the ingest token.
- Portraits and headshots are local files only; the repository ships no photos and git-ignores both directories.

### Docker

The image runs as an unprivileged user (uid 1000), needs no writable filesystem, and `docker-compose.yml` publishes
the port on `127.0.0.1` only, mounts the Hermes home, portraits and headshots read-only, drops all capabilities and sets
`no-new-privileges`.

### Out of scope

- Other software or users on the same machine. Anything that can run code as you can read your Hermes home directly.
- Multiple users or per-user permissions: there is one token and one level of access.
- Denial of service against the sign-in rate limit (it is server-wide, so repeated bad attempts can lock sign-in
  for a minute).
- Third-party services the bots talk to; report those to their owners.
