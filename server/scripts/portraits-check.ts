// Lists which people on the map have a local portrait in DMOS_PORTRAITS_DIR (default ~/.dunder-mifflin-os/portraits)
// and which will show their bot headshot or the drawn character. Read-only; it never downloads anything.
// Usage: npm run portraits:check
import { readdirSync } from 'node:fs';
import os from 'node:os';
import { STAFF } from '../../shared/office.ts';
import { PORTRAITS_DIR } from '../src/config.ts';
import { formatPortraitReport, portraitReport } from '../src/portraitCheck.ts';

function listFiles(dir: string): string[] | null {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() || e.isSymbolicLink()).map((e) => e.name);
  } catch {
    return null;
  }
}

const home = os.homedir();
const label = PORTRAITS_DIR.startsWith(`${home}/`) ? `~${PORTRAITS_DIR.slice(home.length)}` : PORTRAITS_DIR;
const files = listFiles(PORTRAITS_DIR);
if (!files) console.log(`No portraits directory at ${label}: everyone is drawn (bots may show their Hermes headshot).\n`);
const people = STAFF.map((s) => ({ id: s.id, name: s.name, bot: Boolean(s.bot) }));
console.log(formatPortraitReport(portraitReport(people, files ?? []), label));
