// Seeded randomness for the demo: the same seed always gives the same day (tests and screenshots stay stable).
// mulberry32 over a string hash of the inputs. Pure.

export function hashOf(...parts: ReadonlyArray<string | number>): number {
  return parts.join('|').split('').reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

/** A generator of numbers in [0, 1), fixed by its inputs. */
export function rng(...parts: ReadonlyArray<string | number>): () => number {
  let a = hashOf(...parts);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(items: ReadonlyArray<T>, next: () => number): T | undefined {
  return items[Math.floor(next() * items.length)];
}
