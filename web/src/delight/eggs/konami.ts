// The Konami code (↑ ↑ ↓ ↓ ← → ← → B A) rolls the "Threat Level Midnight" credits.
export const KONAMI: readonly string[] = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

export function konamiStep(progress: number, key: string): { progress: number; done: boolean } {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === KONAMI[progress]) return progress + 1 === KONAMI.length ? { progress: 0, done: true } : { progress: progress + 1, done: false };
  if (k === 'ArrowUp') return { progress: progress >= 2 ? 2 : 1, done: false }; // ↑ ↑ ↑ … still counts as a start
  return { progress: 0, done: false };
}
