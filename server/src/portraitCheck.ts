// `npm run portraits:check`: which people on the map have a local portrait file and which don't. Pure logic here;
// scripts/portraits-check.ts does the directory listing. Matches the server's rules: <id>.jpg first, then <id>.png.
export type CheckPerson = { id: string; name: string; bot: boolean };
export type PortraitReport = {
  have: { id: string; name: string; file: string }[];
  missing: { id: string; name: string; fallback: 'bot headshot' | 'drawn' }[];
  ignored: string[]; // image files the server will never serve (not a person on the map, wrong case, a .png behind a .jpg)
};

const EXTENSIONS = ['.jpg', '.png'];
const IMAGE = /\.(jpe?g|png)$/i;

export function portraitReport(people: ReadonlyArray<CheckPerson>, files: ReadonlyArray<string>): PortraitReport {
  const present = new Set(files);
  const used = new Set<string>();
  const have: PortraitReport['have'] = [];
  const missing: PortraitReport['missing'] = [];
  for (const p of people) {
    const file = EXTENSIONS.map((ext) => `${p.id}${ext}`).find((f) => present.has(f));
    if (file) {
      used.add(file);
      have.push({ id: p.id, name: p.name, file });
    } else {
      missing.push({ id: p.id, name: p.name, fallback: p.bot ? 'bot headshot' : 'drawn' });
    }
  }
  const ignored = files.filter((f) => IMAGE.test(f) && !used.has(f)).sort();
  return { have, missing, ignored };
}

const row = (id: string, name: string, note: string) => `  ${id.padEnd(10)} ${name.padEnd(18)} ${note}`;

export function formatPortraitReport(report: PortraitReport, dirLabel: string): string {
  return [
    `Portraits directory: ${dirLabel}`,
    '',
    `Have a portrait (${report.have.length}):`,
    ...report.have.map((h) => row(h.id, h.name, h.file)),
    '',
    `No portrait (${report.missing.length}):`,
    ...report.missing.map((m) => row(m.id, m.name, m.fallback === 'drawn' ? 'drawn character' : 'bot headshot if Hermes has one, else drawn')),
    ...(report.ignored.length ? ['', `Ignored files (${report.ignored.length}): ${report.ignored.join(', ')}`] : []),
  ].join('\n');
}
