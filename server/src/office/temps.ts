// Temps: agents with no character of their own sit at the spare desks as generic office temps.
import type { Look, Person } from '../../../shared/contract.ts';

const TEMP_LOOKS: ReadonlyArray<Look> = Object.freeze([
  { skin: '#e8c4a0', hair: '#3a2a1e', hairStyle: 'short', shirt: '#7d8fa6', tie: '#33415c' },
  { skin: '#c99a6e', hair: '#1d1714', hairStyle: 'ponytail', shirt: '#9bbf9b', cardigan: '#55705a', build: 'slim' },
  { skin: '#f0cfb0', hair: '#b07a3c', hairStyle: 'bob', shirt: '#d8a5a5', glasses: true },
  { skin: '#8d5f3e', hair: '#141010', hairStyle: 'buzz', shirt: '#c9b77d', tie: '#5c4a2a' },
].map((l) => Object.freeze(l as Look)));

function hash(text: string): number {
  return [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
}

export function tempLook(personId: string): Look {
  return { ...(TEMP_LOOKS[hash(personId) % TEMP_LOOKS.length] ?? TEMP_LOOKS[0]!) };
}

export function tempPerson(personId: string, seatId: string, name: string, adapterLabel: string): Omit<Person, 'bot'> {
  return { id: personId, name, title: `Temp · ${adapterLabel}`, seatId, look: tempLook(personId) };
}
