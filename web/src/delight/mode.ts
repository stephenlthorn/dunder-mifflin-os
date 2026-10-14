// The delight layer's switches, from the viewer's settings and the URL. Toby mode (Settings, or ?toby=1) turns off
// every joke, ambient life, sound and easter egg: a plain dashboard with the same information. Sounds also need the
// chime setting (off by default); reduced motion (system or Settings) keeps the jokes but stills them.

export type DelightMode = {
  toby: boolean; // HR-approved: nothing silly on screen
  jokes: boolean; // chili spills, trophies, Creed's thought bubble, the ceremony's names and Michael
  ambient: boolean; // day and night through the windows, Dwight's bobblehead
  eggs: boolean; // easter eggs
  sounds: boolean; // any sound at all
  motion: boolean; // animations
  trips: boolean; // idle bots get up for coffee (needs ambient life and motion)
};

export type DelightInput = { tobyPref: boolean; search: string; chime: boolean; reduceMotion: boolean };

const ON = new Set(['1', 'true', 'on', 'yes']);

export const tobyFromUrl = (search: string): boolean => ON.has((new URLSearchParams(search).get('toby') ?? '').toLowerCase());

export function delightMode({ tobyPref, search, chime, reduceMotion }: DelightInput): DelightMode {
  const toby = tobyPref || tobyFromUrl(search);
  const motion = !reduceMotion;
  return { toby, jokes: !toby, ambient: !toby, eggs: !toby, sounds: chime && !toby, motion, trips: !toby && motion };
}
