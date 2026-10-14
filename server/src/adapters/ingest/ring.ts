// A bounded, immutable ring buffer: pushing returns a new frozen array holding at most `cap` newest items.
export function pushRing<T>(items: ReadonlyArray<T>, item: T, cap: number): ReadonlyArray<T> {
  const kept = items.length >= cap ? items.slice(items.length - cap + 1) : items;
  return Object.freeze([...kept, item]);
}
