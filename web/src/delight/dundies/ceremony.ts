// When Michael hands out the Dundies by himself: Friday evening (17:00 to midnight, the viewer's local time), once a
// week per browser. Any other time the ceremony is on demand (Ask Pam). Never in Toby mode.

const pad = (n: number) => String(n).padStart(2, '0');

/** The week a local date falls in, named by its Monday ('2026-10-12'). */
export function weekKey(d: Date): string {
  const back = (d.getDay() + 6) % 7; // days since Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

export function ceremonyDue(d: Date, lastSeenWeek: string | null): boolean {
  return d.getDay() === 5 && d.getHours() >= 17 && lastSeenWeek !== weekKey(d);
}
