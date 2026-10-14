import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { OFFICE } from '@shared/office';
import { areaRooms, chipsFor, contentBounds, occupantsBySeat, placementsFor, signsFor } from './mapModel';

describe('map model', () => {
  const placements = placementsFor(DEMO_SNAPSHOT);

  it('orders an area’s rooms with Ops first and hides direct lines', () => {
    expect(areaRooms(DEMO_SNAPSHOT.rooms, 'conference').map((r) => r.id)).toEqual(['ops', 'council']);
    expect(areaRooms(DEMO_SNAPSHOT.rooms, 'bullpen').map((r) => r.id)).toEqual(['outreach']);
    expect(areaRooms(DEMO_SNAPSHOT.rooms, 'lobby')).toEqual([]);
  });

  it('labels every occupant for screen readers', () => {
    const labels = [...occupantsBySeat(DEMO_SNAPSHOT, placements).values()].map((o) => o.label);
    expect(labels).toHaveLength(23);
    expect(labels).toContain('Dwight Schrute — campaigns — working');
    expect(labels).toContain('Jim Halpert — no bot yet');
  });

  it('makes one chip per person, naming the meeting room', () => {
    const chips = chipsFor(DEMO_SNAPSHOT, placements);
    expect(chips).toHaveLength(23);
    expect(chips.find((c) => c.personId === 'michael')!.text).toBe('In Council');
  });

  it('labels room signs with their rooms', () => {
    const conf = signsFor(DEMO_SNAPSHOT).find((s) => s.area.id === 'conference')!;
    expect(conf.label).toBe('Conference Room — Ops room, Council room');
  });

  it('frames an area’s bays too', () => {
    const lobby = OFFICE.areas.find((a) => a.id === 'lobby')!;
    const far = { ...lobby, bays: [{ x: -60, y: lobby.rect.y, w: 2, h: 2 }] };
    const wider = contentBounds({ ...OFFICE, areas: OFFICE.areas.map((a) => (a.id === 'lobby' ? far : a)) });
    expect(wider.minX).toBeLessThan(contentBounds().minX - 500);
  });

  it('frames the drawing with positive size', () => {
    const b = contentBounds();
    expect(b.maxX - b.minX).toBeGreaterThan(500);
    expect(b.maxY - b.minY).toBeGreaterThan(300);
  });
});
