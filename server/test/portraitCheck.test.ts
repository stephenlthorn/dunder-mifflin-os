import { describe, expect, it } from 'vitest';
import { formatPortraitReport, portraitReport } from '../src/portraitCheck.ts';

const PEOPLE = [
  { id: 'dwight', name: 'Dwight Schrute', bot: true },
  { id: 'jim', name: 'Jim Halpert', bot: false },
  { id: 'jarvis', name: 'Jarvis', bot: true },
  { id: 'roy', name: 'Roy Anderson', bot: false },
];

describe('portraitReport', () => {
  it('sorts people into have / lack a local portrait and lists stray files', () => {
    const report = portraitReport(PEOPLE, ['jim.jpg', 'jarvis.png', 'hank.jpg', 'SOURCES.md', 'raw', 'Dwight.JPG']);
    expect(report.have).toEqual([{ id: 'jim', name: 'Jim Halpert', file: 'jim.jpg' }, { id: 'jarvis', name: 'Jarvis', file: 'jarvis.png' }]);
    expect(report.missing).toEqual([{ id: 'dwight', name: 'Dwight Schrute', fallback: 'bot headshot' }, { id: 'roy', name: 'Roy Anderson', fallback: 'drawn' }]);
    expect(report.ignored).toEqual(['Dwight.JPG', 'hank.jpg']);
  });

  it('prefers .jpg like the server does', () => {
    expect(portraitReport(PEOPLE, ['jim.png', 'jim.jpg']).have[0]).toMatchObject({ id: 'jim', file: 'jim.jpg' });
  });

  it('formats a readable summary', () => {
    const text = formatPortraitReport(portraitReport(PEOPLE, ['jim.jpg']), '~/.dunder-mifflin-os/portraits');
    expect(text).toContain('~/.dunder-mifflin-os/portraits');
    expect(text).toMatch(/Have a portrait \(1\)/);
    expect(text).toMatch(/No portrait \(3\)/);
    expect(text).toMatch(/roy\s+Roy Anderson\s+drawn character/);
    expect(text).toMatch(/dwight\s+Dwight Schrute\s+bot headshot/);
  });
});
