// Light through the windows by the clock (the viewer's, or the demo day's office time): night, dawn, day, dusk.
export type Daylight = 'night' | 'dawn' | 'day' | 'dusk';

export function daylightAt(hour: number): Daylight {
  if (hour < 6 || hour >= 20) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 17) return 'day';
  return 'dusk';
}
