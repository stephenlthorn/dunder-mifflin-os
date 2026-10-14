// The office's seats plus the places idle bots stand on a coffee run, for drawing and placing people.
import { OFFICE, type OfficeData } from '@shared/office';
import { SPOTS } from './trips';

export const DELIGHT_SEATS = [...OFFICE.seats, ...SPOTS.map((s) => s.seat)];
export const DELIGHT_OFFICE: OfficeData = { ...OFFICE, seats: DELIGHT_SEATS };
