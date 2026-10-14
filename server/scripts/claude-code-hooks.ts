// Prints the Claude Code settings.json "hooks" block for this server. Usage:
//   npm run claude-code:hooks -w @dmos/server            (http://127.0.0.1:4318)
//   DMOS_PORT=4400 npm run claude-code:hooks -w @dmos/server
import { claudeCodeHookSettings } from '../src/adapters/claudeCode/settings.ts';
import { HOST, PORT } from '../src/config.ts';

process.stdout.write(`${JSON.stringify(claudeCodeHookSettings(`http://${HOST}:${PORT}/api/hooks/claude-code`), null, 2)}\n`);
