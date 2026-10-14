# Claude Code adapter

Every Claude Code session shows up in the office as a character: working while its tools run, **needs you** (the
orange ring) when it asks for permission, idle when it finishes its turn, offline when the session ends. Claude's
final answer each turn lands in the session's direct line. It uses Claude Code's
[`http` hooks](https://code.claude.com/docs/en/hooks): Claude Code POSTs each hook event to the server, which by
default only watches. It answers `204` with no decision, so your sessions behave exactly as they would without it.
What a session asks you shows up in the approvals inbox at Toby's desk; if you turn on [decisions](#answer-permission-prompts-in-the-office),
you can allow or deny a permission prompt from there. The
[Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) project showed that hooks are enough for this.

## Turn it on

1. Make a token (at least 24 characters) and export it both where the server runs **and** in the shell you start
   `claude` from (Claude Code reads it from its own environment):

   ```sh
   export DMOS_INGEST_TOKEN="$(openssl rand -hex 32)"   # e.g. in ~/.zshrc
   ```

2. List the adapter in `~/.dunder-mifflin-os/config.yaml` and restart the server:

   ```yaml
   adapters:
     - hermes          # keep it if you also run Hermes
     - claude-code
   ```

3. Add the hooks to `~/.claude/settings.json` (every session) or a project's `.claude/settings.local.json` (one
   project). `npm run claude-code:hooks -w @dmos/server` prints this block for your port:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "UserPromptSubmit": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "PreToolUse": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "PostToolUse": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "PostToolUseFailure": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "PermissionRequest": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 300, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "Notification": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "SubagentStart": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "SubagentStop": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "Stop": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "StopFailure": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }],
    "SessionEnd": [{ "hooks": [{"type": "http", "url": "http://127.0.0.1:4318/api/hooks/claude-code", "timeout": 2, "headers": {"Authorization": "Bearer $DMOS_INGEST_TOKEN"}, "allowedEnvVars": ["DMOS_INGEST_TOKEN"]}] }]
  }
}
```

   If you merge it into existing settings, add these entries next to your own hooks. If your settings define
   `allowedHttpHookUrls` or `httpHookAllowedEnvVars`, add the URL and `DMOS_INGEST_TOKEN` to them.

4. Start a new `claude` session. It appears at a spare desk as "Temp · Claude Code", named after the project folder.

## What the office shows

| Hook event | Status | Chip text |
|---|---|---|
| `SessionStart` | idle | Session started |
| `UserPromptSubmit` | working | Working on your prompt (the prompt itself is never kept) |
| `PreToolUse` | working | Reading checkout.ts · Editing checkout.ts · Running: *Bash's own description* · Searching the code · Fetching *host* · Using *tool* |
| `PostToolUse` | working | (unchanged) |
| `PostToolUseFailure` | working, or idle if you interrupted | Bash failed · Interrupted |
| `PermissionRequest` | **needs-input** | Needs permission for Bash (Run the checkout tests) |
| `Notification` | needs-input for `permission_prompt`, `elicitation_dialog`, `agent_needs_input`; idle for `idle_prompt`, `agent_completed` | the notification's message, or "Has a question for you" / "Waiting for your next prompt" |
| `SubagentStart` / `SubagentStop` | working | Running an Explore subagent · Explore subagent finished |
| `Stop` | idle | (Claude's last message goes to the direct line) |
| `StopFailure` | error | Stopped: rate_limit |
| `SessionEnd` | offline, then gone after 5 minutes | Session ended |

`PermissionRequest` fires as soon as Claude asks; the `permission_prompt` notification only after the prompt has
waited about six seconds, so both are hooked.

## Answer permission prompts in the office

Claude Code's `PermissionRequest` hook can answer a permission prompt itself (`allow` or `deny`), so the office can
too. It is off unless you ask for it, because a held prompt keeps the terminal waiting:

```yaml
adapters:
  - { kind: claude-code, decide: true, holdSeconds: 120 }   # holdSeconds: 5-270, default 120
```

and start the server with `--allow-writes` (`DMOS_ALLOW_WRITES=1`). Then each permission request:

1. raises the session's hand on the map, rings Pam's phone and appears in **HR · Approvals** (Toby's desk) with the
   tool, the command, file or URL it wants (secrets masked) and a risk (`high` for Bash, `medium` for edits and MCP
   tools, `low` for reads, searches and fetches);
2. is held open until you click **Approve** (answers `allow`, once) or **Reject** (answers `deny`; your note becomes
   the reason Claude sees: "Rejected in Dunder Mifflin OS: *note*"). Every decision is written to the audit log first;
3. if you don't decide within `holdSeconds`, if Claude Code gives up (the hook's `timeout` is 300 s) or if the session
   moves on, it is answered with no decision and Claude Code asks you in the terminal as usual.

With decisions off (the default), or on a read-only server, permission requests and asking notifications
(`permission_prompt`, `elicitation_dialog`, `agent_needs_input`) still appear in the inbox, marked "answer it in
Claude Code", without buttons. The office never answers on its own: no auto-approve, no "always allow" rules.

## Stop a session from the office

With `--allow-writes`, a working session's window has **Stop current run**. Claude Code hooks can end a turn: the
office answers the session's next `PreToolUse` or `PostToolUse` hook with `{"continue": false, "stopReason": "Stopped
from Dunder Mifflin OS"}`, so Claude stops before or after its next tool call (a reply that is only text can't be cut
short). The request lapses after two minutes if no tool hook comes, so it can never end a later, unrelated turn.
There is no pause: hooks can end a turn but cannot hold or resume a session. Each stop is written to the audit log
first.

## Which character a session becomes

A session's agent id is its project folder's name as a slug (`/work/Paper Site` → `paper-site`). A second session in
the same folder at the same time is `paper-site-2`, and so on. Unmapped sessions sit at the spare desks as temps.
To give a project a character, map it in the config:

```yaml
seats:
  jim: { adapter: claude-code, agent: paper-site, role: Pair programmer }
```

## Privacy and limits

- **Kept:** the session id, the event name, the project folder's *name*, the tool name, and a short summary (a file's
  base name, Bash's own `description`, a URL's host, a subagent type, an MCP server name), plus Claude's final message
  each turn. All of it is scrubbed of tokens, API keys, chat ids, phone numbers and home paths.
- **Never kept:** prompts, commands, file contents, tool input and output, `cwd`, transcript paths. They are dropped
  as the payload is parsed, and nothing is written to disk. The one exception is what a pending permission request
  asks for (the command, the file path inside the project, the URL without its query string): you can't approve
  what you can't see. It is masked (secret-looking variables and flags, `-u user:pass`, `Authorization` headers,
  `user:pass@` in URLs, API keys), scrubbed, capped at 400 characters, kept in memory only until the request is
  answered, and never logged; the audit log records the title, not the command.
- **Auth:** the bearer token (constant-time compare); the server won't start this adapter without it. It replaces the browser sign-in for this endpoint: a session cookie or `DMOS_ACCESS_TOKEN` won't do, and the endpoint works on a read-only server (it only reports).
- **Limits:** bodies up to 1 MB (a `PostToolUse` carries the tool's output); 600 events a minute per session;
  64 sessions at once; a session that goes quiet while working shows as idle after 15 minutes and is forgotten after
  6 hours.
- **If the server is down:** Claude Code treats a failed http hook as a non-blocking error and carries on. The
  2-second `timeout` keeps a stuck server from slowing your session.
