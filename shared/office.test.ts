import { describe, expect, it } from 'vitest';
import { AREAS, type Area, FURNITURE, OFFICE, SEATS, STAFF, areaRects, toPerson } from './office';

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);
const unique = (xs: string[]) => new Set(xs).size === xs.length;
const rect = (id: string) => AREAS.find((a) => a.id === id)!.rect;
const seatOf = (personId: string) => SEATS.find((seat) => seat.id === STAFF.find((s) => s.id === personId)!.seatId)!;
const inRect = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
const kindsIn = (areaId: string) => FURNITURE.filter((f) => f.areaId === areaId).map((f) => f.kind);

describe('office data', () => {
  it('has the areas of the floor plan plus the stairwell down to the warehouse', () => {
    expect(ids(AREAS).sort()).toEqual(
      ['annex', 'breakroom', 'bullpen', 'conference', 'kitchen', 'lobby', 'michael', 'reception', 'restrooms', 'stairwell', 'warehouse'],
    );
  });

  it('uses unique ids everywhere', () => {
    expect(unique(ids(FURNITURE))).toBe(true);
    expect(unique(ids(SEATS))).toBe(true);
    expect(unique(ids(STAFF))).toBe(true);
  });

  it('lists all 23 staff members, each with a real seat', () => {
    expect(STAFF).toHaveLength(23);
    const seatIds = new Set(ids(SEATS));
    for (const s of STAFF) expect(seatIds.has(s.seatId), s.id).toBe(true);
    expect(unique(STAFF.map((s) => s.seatId))).toBe(true);
  });

  it('gives the twelve Hermes bots their profiles', () => {
    const profiles = STAFF.filter((s) => s.bot).map((s) => s.bot!.profile).sort();
    expect(profiles).toEqual(
      ['ai-strategist', 'campaigns', 'cfo', 'chief', 'cmo', 'general', 'health', 'skool', 'social', 'strategist', 'teacher', 'tech'],
    );
  });

  it('seats people in the areas of the floor plan', () => {
    const area = (id: string) => SEATS.find((seat) => seat.id === STAFF.find((s) => s.id === id)!.seatId)!.areaId;
    expect(area('pam')).toBe('reception');
    expect(area('michael')).toBe('michael');
    expect(area('dwight')).toBe('bullpen');
    expect(area('kelly')).toBe('annex');
    expect(area('david')).toBe('lobby');
    expect(area('ira')).toBe('kitchen');
    expect(area('darryl')).toBe('warehouse');
    expect(area('roy')).toBe('warehouse');
  });

  it("casts the health bot as Sensei Ira, Dwight's sensei, in a white gi at the kitchen table", () => {
    const ira = STAFF.find((s) => s.id === 'ira')!;
    expect(ira).toMatchObject({
      name: 'Sensei Ira', title: "Health & fitness · Dwight's sensei", seatId: 'seat.ira',
      bot: { profile: 'health', role: 'Personal health' },
    });
    expect(ira.look).toMatchObject({ hairStyle: 'short', jacket: expect.stringMatching(/^#f/i), belt: expect.stringMatching(/^#[0-2]/) });
    expect(ira.keepName).toBe(true); // the map says "Sensei Ira" even though Hermes may name the persona differently
    expect(STAFF.filter((s) => s.keepName).map((s) => s.id)).toEqual(['ira']);
  });

  it('has ten meeting seats in the conference room', () => {
    expect(SEATS.filter((s) => s.areaId === 'conference' && s.kind === 'meeting')).toHaveLength(10);
  });

  it('keeps furniture and seats inside their area (its rect or one of its bays)', () => {
    const rects = new Map(AREAS.map((a) => [a.id, areaRects(a)]));
    const holds = (r: { x: number; y: number; w: number; h: number }, f: { x: number; y: number; w: number; d: number }) =>
      f.x >= r.x - 0.01 && f.x + f.w <= r.x + r.w + 0.01 && f.y >= r.y - 0.01 && f.y + f.d <= r.y + r.h + 0.01;
    for (const f of FURNITURE) {
      const rs = rects.get(f.areaId)!;
      expect(rs, f.id).toBeDefined();
      expect(rs.some((r) => holds(r, f)), f.id).toBe(true);
    }
    for (const s of SEATS) {
      const rs = rects.get(s.areaId)!;
      expect(rs.some((r) => s.x > r.x && s.x < r.x + r.w && s.y > r.y && s.y < r.y + r.h), s.id).toBe(true);
    }
  });

  it('gives an area its rect plus any bays as floor', () => {
    const area: Area = {
      id: 'a', name: 'A', rect: { x: 0, y: 0, w: 4, h: 4 }, floor: 'carpet', level: 'main', sign: { x: 1, y: 1 },
      bays: [{ x: 1, y: -2, w: 2, h: 2 }],
    };
    expect(areaRects(area)).toEqual([{ x: 0, y: 0, w: 4, h: 4 }, { x: 1, y: -2, w: 2, h: 2 }]);
    expect(areaRects({ ...area, bays: undefined })).toEqual([{ x: 0, y: 0, w: 4, h: 4 }]);
  });

  it('maps a staff entry to a contract Person without sharing objects', () => {
    const entry = STAFF.find((s) => s.id === 'dwight')!;
    const person = toPerson(entry);
    expect(person).toMatchObject({ id: 'dwight', name: 'Dwight Schrute', seatId: entry.seatId, bot: { profile: 'campaigns' } });
    expect(person.look).not.toBe(entry.look);
  });
});

// The Drawbotics render of the Scranton office (docs/ARCHITECTURE.md, "Floor plan").
describe('floor plan after the reference render', () => {
  const back = OFFICE.size.h;
  const main = AREAS.filter((a) => a.level === 'main');

  it('is a long building, deep enough to read like the render', () => {
    expect(OFFICE.size.w / OFFICE.size.h).toBeGreaterThanOrEqual(2);
    expect(OFFICE.size.h).toBeGreaterThanOrEqual(34);
    expect(rect('bullpen').y + rect('bullpen').h).toBeGreaterThanOrEqual(26); // the open-plan room is ≥ 24 deep
    const right = Math.max(...main.map((a) => a.rect.x + a.rect.w));
    expect(right).toBe(OFFICE.size.w);
  });

  it('runs the back wall, left to right: lobby, Michael, conference, stairwell, break room', () => {
    const row = main.filter((a) => a.rect.y + a.rect.h === back).sort((a, b) => a.rect.x - b.rect.x).map((a) => a.id);
    expect(row).toEqual(['lobby', 'michael', 'conference', 'stairwell', 'breakroom']);
  });

  it('puts the elevator lobby at the far left, sticking out past the main room at the back', () => {
    expect(rect('lobby').x).toBe(Math.min(...main.map((a) => a.rect.x)));
    expect(rect('bullpen').x).toBeGreaterThan(rect('lobby').x);
    expect(rect('lobby').y).toBeGreaterThanOrEqual(rect('bullpen').y + rect('bullpen').h);
    expect(FURNITURE.find((f) => f.kind === 'wall-sign' && f.areaId === 'lobby')?.label).toBe('DUNDER MIFFLIN');
    expect(kindsIn('lobby')).toEqual(expect.arrayContaining(['elevator', 'plant']));
  });

  it('stretches the elevator hallway out to the left, with the elevator in an alcove jutting out of its front wall', () => {
    const lobby = AREAS.find((a) => a.id === 'lobby')!;
    expect(rect('bullpen').x - lobby.rect.x).toBeGreaterThanOrEqual(16);
    const elevator = FURNITURE.find((f) => f.areaId === 'lobby' && f.kind === 'elevator')!;
    const alcove = (lobby.bays ?? []).find((b) => elevator.x >= b.x && elevator.x + elevator.w <= b.x + b.w)!;
    expect(alcove).toBeDefined();
    expect(alcove.y + alcove.h).toBe(lobby.rect.y); // in front of the hallway
    expect(alcove.h).toBeGreaterThanOrEqual(3.5);
    // the car fills the alcove, its doors on the hallway side
    expect(elevator.w).toBeGreaterThanOrEqual(alcove.w - 0.6);
    expect(elevator.d).toBeGreaterThanOrEqual(alcove.h - 0.6);
    expect(lobby.rect.y - (elevator.y + elevator.d)).toBeLessThan(0.3);
    expect(elevator.facing).toBe('n');
    const walls = (pred: (w: (typeof OFFICE.walls)[number]) => boolean) => OFFICE.walls.filter(pred);
    expect(walls((w) => w.axis === 'x' && w.at === alcove.y && w.from <= alcove.x && w.to >= alcove.x + alcove.w)).toHaveLength(1);
    expect(walls((w) => w.axis === 'y' && (w.at === alcove.x || w.at === alcove.x + alcove.w))).toHaveLength(2);
  });

  it('gives the hallway the render’s stair door on its end wall and a plant in its front bay', () => {
    const lobby = AREAS.find((a) => a.id === 'lobby')!;
    const end = OFFICE.walls.find((w) => w.axis === 'y' && w.at === lobby.rect.x)!;
    expect(end.openings?.some((o) => o.kind === 'wood-door' && o.from >= lobby.rect.y)).toBe(true);
    const bay = (lobby.bays ?? []).find((b) => b.x === lobby.rect.x)!;
    expect(bay).toBeDefined();
    expect(FURNITURE.some((f) => f.areaId === 'lobby' && f.kind === 'plant' && f.x >= bay.x && f.y + f.d <= bay.y + bay.h)).toBe(true);
  });

  it('steps the front wall back between the accounting corner and the restrooms, with a jog at the corner', () => {
    const bp = AREAS.find((a) => a.id === 'bullpen')!;
    const front = OFFICE.walls.filter((w) => w.exterior && w.axis === 'x' && w.at < bp.rect.y + 5 && w.from >= bp.rect.x && w.from < rect('restrooms').x);
    const levels = [...new Set(front.map((w) => w.at))].sort((a, b) => a - b);
    expect(levels).toHaveLength(2);
    expect(levels[1] - levels[0]).toBeGreaterThanOrEqual(1.5);
    const corner = front.find((w) => w.at === levels[0])!;
    const recess = front.find((w) => w.at === levels[1])!;
    expect(corner.from).toBe(bp.rect.x);
    expect(recess.to).toBeGreaterThanOrEqual(rect('restrooms').x);
    expect(OFFICE.walls.some((w) => w.axis === 'y' && w.at === corner.to && w.from === levels[0] && w.to === levels[1])).toBe(true);
    expect(Math.min(...areaRects(AREAS.find((a) => a.id === 'restrooms')!).map((r) => r.y))).toBeLessThan(levels[0]);
    // the bullpen's floor stops at the recessed wall
    expect(areaRects(bp).some((r) => 30 > r.x && 30 < r.x + r.w && levels[1] - 0.5 > r.y && levels[1] - 0.5 < r.y + r.h)).toBe(false);
    // the small jog: a short exterior stub sticking out of the accounting corner's front wall
    const jog = OFFICE.walls.find((w) => w.exterior && w.axis === 'y' && w.to === levels[0] && w.from < levels[0] && w.at > corner.from && w.at < corner.to);
    expect(jog).toBeDefined();
  });

  it('puts reception just inside the entrance: curved desk, waiting sofa and armchair, copier and supplies in front', () => {
    expect(rect('reception').x).toBe(rect('bullpen').x);
    expect(kindsIn('reception')).toEqual(expect.arrayContaining(['reception-desk', 'couch', 'armchair', 'copier', 'supplies']));
    expect(seatOf('pam').areaId).toBe('reception');
  });

  it('fills the middle with the bullpen and puts the annex at the right end, restrooms at the front-right', () => {
    const bp = rect('bullpen');
    expect(rect('annex').x + rect('annex').w).toBe(OFFICE.size.w);
    expect(rect('annex').y).toBe(0);
    expect(rect('restrooms').x).toBeGreaterThanOrEqual(bp.x + bp.w);
    expect(Math.min(...areaRects(AREAS.find((a) => a.id === 'restrooms')!).map((r) => r.y))).toBeLessThan(0); // stalls jut out of the front
    expect(rect('breakroom').x).toBeGreaterThanOrEqual(rect('annex').x);
  });

  it('seats the bullpen like the reference: Jim/Dwight near reception, accounting at the front-left, pairs by the front windows', () => {
    const rec = rect('reception');
    for (const id of ['jim', 'dwight']) expect(seatOf(id).x - (rec.x + rec.w), id).toBeLessThan(8);
    for (const id of ['angela', 'oscar', 'kevin']) {
      expect(seatOf(id).x, id).toBeLessThan(rec.x + rec.w);
      expect(seatOf(id).y, id).toBeLessThan(rec.y);
    }
    for (const id of ['creed', 'meredith', 'andy']) expect(seatOf(id).y, id).toBeLessThan(7);
    expect(seatOf('phyllis').x).toBeGreaterThan(seatOf('jim').x);
  });

  it('seats meetings in chair rows facing the conference screen', () => {
    const meeting = SEATS.filter((s) => s.areaId === 'conference' && s.kind === 'meeting');
    const screen = FURNITURE.find((f) => f.areaId === 'conference' && f.kind === 'tv-stand')!;
    expect(meeting.every((s) => s.facing === 'w' && s.x > screen.x + screen.w)).toBe(true);
    expect(new Set(meeting.map((s) => s.x)).size).toBeGreaterThanOrEqual(3); // rows, not a table
  });

  it('links the stairwell’s red-carpet stairs to the warehouse inset', () => {
    const stairs = FURNITURE.find((f) => f.kind === 'stairs' && f.areaId === 'stairwell')!;
    expect(stairs.color).toBeDefined();
    expect(inRect(OFFICE.stairLink.from, rect('stairwell'))).toBe(true);
    expect(inRect(OFFICE.stairLink.to, rect('warehouse'))).toBe(true);
  });

  // The render's back centre: a corridor beside the conference room leads to the stair door of a walled stairwell
  // whose red-carpet stairs rise toward the back wall; the kitchen's cabinet run sits on the stairwell's front wall.
  describe('stairwell and kitchen like the render', () => {
    const sw = rect('stairwell'); // the stair room
    const swX0 = Math.min(...areaRects(AREAS.find((a) => a.id === 'stairwell')!).map((r) => r.x)); // incl. the corridor
    const kitchen = AREAS.find((a) => a.id === 'kitchen')!;
    const wallsAt = (axis: 'x' | 'y', at: number) => OFFICE.walls.filter((w) => w.axis === axis && Math.abs(w.at - at) < 0.01);
    const stairs = FURNITURE.find((f) => f.kind === 'stairs' && f.areaId === 'stairwell')!;
    const roomLeft = OFFICE.walls.find((w) => w.id === 'corridor|stairs')!;

    it('starts at the conference room, with a corridor in front of the stair room’s left wall', () => {
      expect(swX0).toBe(rect('conference').x + rect('conference').w);
      expect(roomLeft.axis).toBe('y');
      expect(roomLeft.at - swX0).toBeGreaterThanOrEqual(2);
      expect(roomLeft.from).toBeLessThanOrEqual(sw.y);
      expect(roomLeft.to).toBe(sw.y + sw.h);
      const front = OFFICE.walls.find((w) => w.id === 'backrow.front')!;
      expect(front.openings?.some((o) => o.kind === 'door' && o.from >= swX0 && o.to <= roomLeft.at)).toBe(true);
    });

    it('walls the stair room on every side, entered only by the stair door at the back of the corridor', () => {
      const front = OFFICE.walls.find((w) => w.id === 'stairs.front')!;
      expect(front.axis).toBe('x');
      expect(front.from).toBeLessThanOrEqual(roomLeft.at);
      expect(front.to).toBe(sw.x + sw.w);
      expect(front.at).toBeLessThanOrEqual(sw.y);
      expect(front.openings ?? []).toEqual([]);
      const right = wallsAt('y', sw.x + sw.w).find((w) => w.from <= front.at && w.to >= sw.y + sw.h);
      expect(right).toBeDefined();
      const door = roomLeft.openings?.find((o) => o.kind === 'wood-door');
      expect(door).toBeDefined();
      expect(door!.from).toBeGreaterThan(sw.y + sw.h / 2); // by the landing at the back
      expect(roomLeft.from).toBeLessThanOrEqual(front.at);
      // a big box like the render's, reaching forward past the back row's front wall
      expect(sw.x + sw.w - roomLeft.at).toBeGreaterThanOrEqual(10);
      expect(sw.x).toBe(roomLeft.at);
      expect(sw.y + sw.h - front.at).toBeGreaterThanOrEqual(12); // the original's reaches ~13 deep
    });

    it('widens the conference room like the original and stands the stair room’s side walls full height', () => {
      expect(rect('conference').w).toBeGreaterThanOrEqual(15);
      const columns = new Set([
        ...SEATS.filter((x) => x.areaId === 'conference').map((x) => x.x),
        ...FURNITURE.filter((f) => f.areaId === 'conference' && f.kind === 'chair').map((f) => f.x + f.w / 2),
      ]);
      expect(columns.size).toBeGreaterThanOrEqual(5);
      const full = OFFICE.walls.find((w) => w.id === 'ext.back')!.height;
      const front = OFFICE.walls.find((w) => w.id === 'stairs.front')!;
      expect(roomLeft.height).toBe(full);
      expect(wallsAt('y', sw.x + sw.w).find((w) => w.from <= front.at && w.to >= sw.y + sw.h)?.height).toBe(full);
      expect(front.height ?? 0).toBeGreaterThan(OFFICE.wallHeight); // tall enough to hang the kitchen's wall cabinets
      const kitchenLeft = OFFICE.walls.find((w) => w.axis === 'y' && w.at <= roomLeft.at && w.to === front.at && w.at === AREAS.find((a) => a.id === 'kitchen')!.rect.x)!;
      expect(kitchenLeft).toBeDefined();
      expect(kitchenLeft.height ?? OFFICE.wallHeight).toBe(OFFICE.wallHeight);
    });

    it('sizes the stairwell and the break room against the conference room like the original', () => {
      // measured on the Reddit original along the back wall: conference ≈ 16, stairwell (corridor + stair room) ≈ 14.5,
      // waiting nook ≈ 7, break room ≈ 10
      const c = rect('conference').w;
      expect(c).toBeGreaterThanOrEqual(15.5);
      expect((sw.x + sw.w - swX0) / c).toBeGreaterThan(0.8);
      expect(rect('breakroom').w / c).toBeGreaterThan(0.55);
      expect(rect('breakroom').w / c).toBeLessThan(0.7);
      const left = OFFICE.walls.find((w) => w.axis === 'y' && w.at === rect('breakroom').x && w.from <= rect('breakroom').y && w.to >= back);
      expect(left?.openings?.some((o) => o.kind === 'wood-door')).toBe(true); // entered from the nook, as in the original
      const nook = AREAS.flatMap((a) => (a.bays ?? []).map((b) => ({ id: a.id, b })))
        .find(({ b }) => b.x === sw.x + sw.w && b.x + b.w === rect('breakroom').x);
      expect(nook?.id).toBe('annex');
    });

    it('rises toward the back wall onto a raised landing, beside a grey strip that leads from the stair door', () => {
      expect(stairs.facing).toBe('n');
      expect(stairs.x).toBeGreaterThan(roomLeft.at + 1.5); // the strip by the door wall
      expect(stairs.y + stairs.d).toBeGreaterThan(back - 0.5);
      expect(stairs.h ?? 0).toBeGreaterThanOrEqual(1.8);
      const door = roomLeft.openings!.find((o) => o.kind === 'wood-door')!;
      expect(door.from).toBeGreaterThanOrEqual(stairs.y + stairs.d - 5);
      const rail = FURNITURE.find((f) => f.kind === 'balustrade' && f.areaId === 'stairwell')!;
      expect(rail.x + rail.w).toBeLessThanOrEqual(stairs.x + 0.01);
      expect(kindsIn('stairwell').filter((k) => k === 'picture').length).toBeGreaterThanOrEqual(2);
    });

    it('puts the kitchen in front of the stair room, its cabinet run along the stair room’s front wall', () => {
      const front = OFFICE.walls.find((w) => w.id === 'stairs.front')!;
      expect(kitchen.rect.y + kitchen.rect.h).toBe(front.at);
      expect(kitchen.rect.x).toBeLessThanOrEqual(roomLeft.at);
      expect(kitchen.rect.x + kitchen.rect.w).toBeGreaterThanOrEqual(sw.x + sw.w);
      // as in the original, the kitchen reaches left past the stair room; its left wall has a wood door and a blinds window
      expect(kitchen.rect.x).toBeLessThan(roomLeft.at - 2);
      const left = OFFICE.walls.find((w) => w.axis === 'y' && w.at === kitchen.rect.x && w.to === front.at)!;
      expect(left.openings?.map((o) => o.kind)).toEqual(expect.arrayContaining(['wood-door', 'window-blinds']));
      const counter = FURNITURE.find((f) => f.areaId === 'kitchen' && f.kind === 'counter')!;
      expect(front.at - (counter.y + counter.d)).toBeLessThan(0.3);
      expect(counter.items).toEqual(expect.arrayContaining(['sink', 'microwave', 'coffee']));
      const uppers = FURNITURE.find((f) => f.areaId === 'kitchen' && f.kind === 'wall-cabinets')!;
      expect(uppers.z).toBeGreaterThan(counter.h ?? 1.8);
      expect(uppers.x).toBeGreaterThanOrEqual(counter.x - 0.01);
      const fridge = FURNITURE.find((f) => f.areaId === 'kitchen' && f.kind === 'fridge')!;
      expect(fridge.x).toBeGreaterThanOrEqual(counter.x + counter.w - 0.01);
      expect(front.at - (fridge.y + fridge.d)).toBeLessThan(0.3);
    });

    it('lays a red/brown doormat in front of the counter and a round table with chairs beside the fridge', () => {
      const counter = FURNITURE.find((f) => f.areaId === 'kitchen' && f.kind === 'counter')!;
      const mats = FURNITURE.filter((f) => f.areaId === 'kitchen' && f.kind === 'mat' && f.y + f.d <= counter.y && f.x < counter.x + counter.w);
      expect(mats.length).toBeGreaterThanOrEqual(1);
      const tables = FURNITURE.filter((f) => f.areaId === 'kitchen' && f.kind === 'round-table');
      expect(tables).toHaveLength(1);
      expect(FURNITURE.filter((f) => f.areaId === 'kitchen' && f.kind === 'chair').length).toBeGreaterThanOrEqual(3);
      const t = tables[0];
      expect(Math.hypot(seatOf('ira').x - (t.x + t.w / 2), seatOf('ira').y - (t.y + t.d / 2))).toBeLessThan(3);
    });

    it('keeps the break room as the separate back-right room: vending machines, round tables, a bulletin board, plants', () => {
      expect(rect('breakroom').x).toBeGreaterThanOrEqual(sw.x + sw.w);
      expect(kindsIn('breakroom').filter((k) => k === 'vending').length).toBeGreaterThanOrEqual(3);
      expect(kindsIn('breakroom').filter((k) => k === 'round-table').length).toBeGreaterThanOrEqual(3);
      expect(kindsIn('breakroom')).toContain('bulletin');
      // doors as in the original: from the nook on its left and from the annex in its front wall
      const front = OFFICE.walls.find((w) => w.axis === 'x' && w.at === rect('breakroom').y && w.from <= rect('breakroom').x)!;
      expect(front.openings?.some((o) => o.kind === 'wood-door')).toBe(true);
      // the kitchen opens onto the annex through a pair of wood doors
      const east = OFFICE.walls.find((w) => w.id === 'kitchen|east')!;
      expect(east.openings?.filter((o) => o.kind === 'wood-door')).toHaveLength(2);
      expect(kindsIn('breakroom').filter((k) => k === 'plant').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('furnishes the kitchen, break room and restrooms like the reference', () => {
    expect(kindsIn('kitchen')).toEqual(expect.arrayContaining(['counter', 'fridge', 'round-table']));
    expect(kindsIn('breakroom').filter((k) => k === 'vending').length).toBeGreaterThanOrEqual(3);
    expect(kindsIn('breakroom').filter((k) => k === 'round-table').length).toBeGreaterThanOrEqual(3);
    expect(kindsIn('restrooms').filter((k) => k === 'toilet')).toHaveLength(2);
    expect(OFFICE.walls.filter((w) => w.color).map((w) => w.id)).toEqual(expect.arrayContaining(['wc.women-side']));
    expect(kindsIn('annex')).toEqual(expect.arrayContaining(['bulletin', 'partition']));
  });

  it('clutters the office desks like the render: screens, papers, trays, binders, mugs, lamps and plants', () => {
    const desks = FURNITURE.filter((f) => f.kind === 'desk' && f.areaId !== 'warehouse');
    for (const d of desks) expect(d.items?.length ?? 0, d.id).toBeGreaterThanOrEqual(5);
    const all = desks.flatMap((d) => d.items ?? []);
    for (const item of ['tray', 'binders', 'folders', 'lamp', 'plant', 'mug', 'papers'] as const) {
      expect(all.filter((i) => i === item).length, item).toBeGreaterThanOrEqual(4);
    }
  });

  it('puts bookshelves between paired desks, filing cabinets, and coloured binder shelving at reception', () => {
    const shelves = FURNITURE.filter((f) => f.areaId === 'bullpen' && (f.kind === 'binder-shelf' || f.kind === 'bookshelf'));
    expect(shelves.length).toBeGreaterThanOrEqual(7);
    const cabinets = FURNITURE.filter((f) => f.kind === 'cabinet' && !f.color);
    expect(cabinets.filter((f) => f.areaId === 'bullpen').length).toBeGreaterThanOrEqual(3);
    expect(kindsIn('reception')).toContain('supply-shelf');
  });

  // The Reddit original's restroom block: the men's room and the women's pink lounge behind, two toilet stalls jutting
  // out of the front wall (men's on the left, women's on the right).
  it('juts two toilet stalls out of the front of the restroom block: men’s (blue) left, women’s (pink) right', () => {
    const wc = AREAS.find((a) => a.id === 'restrooms')!;
    const stalls = (wc.bays ?? []).filter((b) => b.y < 0).sort((a, b) => a.x - b.x);
    expect(stalls).toHaveLength(2);
    expect(stalls[0].x + stalls[0].w).toBeLessThan(stalls[1].x); // a gap between them
    for (const b of stalls) {
      expect(b.y + b.h).toBe(wc.rect.y); // out of the block's front wall
      const toilets = FURNITURE.filter((f) => f.kind === 'toilet' && f.x >= b.x && f.x + f.w <= b.x + b.w && f.y >= b.y && f.y + f.d <= b.y + b.h);
      expect(toilets).toHaveLength(1);
      const sides = OFFICE.walls.filter((w) => w.axis === 'y' && (w.at === b.x || w.at === b.x + b.w) && w.from === b.y);
      expect(sides).toHaveLength(2);
    }
    const doorInto = (b: { x: number; w: number }) => OFFICE.walls.find((w) => w.axis === 'x' && w.at === wc.rect.y)!
      .openings!.find((o) => o.kind === 'wood-door' && o.from >= b.x && o.to <= b.x + b.w)!;
    expect(doorInto(stalls[0]).color).toBe('#3d7ea6');
    expect(doorInto(stalls[1]).color).toBe('#d98fa0');
    // as wide as the original's: the men's room ≈ 6.8 (to the urinal wall), the women's lounge ≈ 4.7
    const divider = OFFICE.walls.find((w) => w.id === 'wc.divider')!;
    expect(divider.at - wc.rect.x).toBeGreaterThanOrEqual(6.5);
    expect(wc.rect.x + wc.rect.w - divider.at).toBeGreaterThanOrEqual(4.5);
    expect(stalls[0].x).toBeGreaterThan(wc.rect.x + 2); // the men's stall sits toward the urinal wall, as in the original
    const lounge = FURNITURE.find((f) => f.id === 'wc.w.lounge')!;
    expect(lounge.y).toBeGreaterThanOrEqual(wc.rect.y); // the pink lounge chair sits in the room behind the stalls
    expect(lounge.x).toBeGreaterThan(stalls[1].x - 1);
  });

  it('cuts the front walls lower than the interior walls so the front of the rooms reads clearly', () => {
    const front = OFFICE.walls.filter((w) => w.exterior && w.axis === 'x' && w.at <= 2 && w.from >= 10);
    expect(front.length).toBeGreaterThanOrEqual(4);
    for (const w of front) expect(w.height ?? OFFICE.wallHeight, w.id).toBeLessThanOrEqual(1.8);
  });

  // Desk clusters where the original has them (positions measured off the 4K render through the map's camera).
  it('places the bullpen’s desk clusters like the original', () => {
    const near = (id: string, x: number, y: number, tol: number) => {
      const f = FURNITURE.find((g) => g.id === id)!;
      expect(Math.hypot(f.x + f.w / 2 - x, f.y + f.d / 2 - y), id).toBeLessThan(tol);
    };
    near('rec.desk', 14.9, 16.2, 1.5);
    near('bp.desk.jim', 22.5, 16.2, 1.5);
    near('bp.desk.dwight', 23.3, 13.8, 1.5);
    near('bp.desk.phyllis', 30.5, 14.0, 1.6);
    near('bp.desk.andy', 25.3, 4.2, 1.5);
    near('bp.desk.creed', 35.1, 4.2, 1.5);
    for (const [person, desk] of [['jim', 'bp.desk.jim'], ['dwight', 'bp.desk.dwight'], ['pam', 'rec.desk'], ['phyllis', 'bp.desk.phyllis'], ['andy', 'bp.desk.andy']]) {
      const f = FURNITURE.find((g) => g.id === desk)!;
      const s = seatOf(person);
      expect(Math.hypot(s.x - (f.x + f.w / 2), s.y - (f.y + f.d / 2)), person).toBeLessThan(2.6); // seats move with their desks
    }
  });

  it('places the annex like the original: Ryan’s glass cubicle by the end wall next to Holly, partitions and shelves by the restrooms', () => {
    expect(seatOf('ryan').x).toBeGreaterThan(64);
    expect(seatOf('ryan').y).toBeLessThan(10);
    expect(Math.abs(seatOf('ryan').x - seatOf('holly').x)).toBeLessThan(3);
    const byRestrooms = FURNITURE.filter((f) => f.areaId === 'annex' && f.x < 62 && f.y < 8);
    expect(byRestrooms.map((f) => f.kind)).toEqual(expect.arrayContaining(['partition', 'binder-shelf', 'desk']));
    const cabinets = FURNITURE.filter((f) => f.areaId === 'annex' && f.kind === 'cabinet' && (f.h ?? 0) >= 2.4 && f.x + f.w > 71);
    expect(cabinets.length).toBeGreaterThanOrEqual(2); // tall filing cabinets against the end wall
  });

  // measured off the 4K original through the map's camera: Kelly's desk by the break-room door (≈ 67.3, 17.4), Toby's HR
  // desk under the HR board on the end wall (≈ 69.5, 7.5)
  it('puts Kelly’s and Toby’s desks where the original has them, each person in a seat at their desk', () => {
    const at = (id: string) => { const f = FURNITURE.find((g) => g.id === id)!; return { x: f.x + f.w / 2, y: f.y + f.d / 2 }; };
    const kelly = at('anx.kelly.desk');
    const toby = at('anx.toby.desk');
    expect(Math.hypot(kelly.x - 67.3, kelly.y - 17.4)).toBeLessThan(0.8);
    expect(Math.hypot(toby.x - 69.5, toby.y - 7.5)).toBeLessThan(0.8);
    expect(Math.hypot(seatOf('kelly').x - kelly.x, seatOf('kelly').y - kelly.y)).toBeLessThan(2.6);
    expect(Math.hypot(seatOf('toby').x - toby.x, seatOf('toby').y - toby.y)).toBeLessThan(2.6);
    const cube = at('anx.cube2.desk'); // the empty cubicle in the middle of the annex (≈ 61.9, 12.8)
    expect(Math.hypot(cube.x - 61.9, cube.y - 12.8)).toBeLessThan(0.8);
    const chair = FURNITURE.find((f) => f.id === 'anx.cube2.chair')!;
    expect(Math.hypot(chair.x + chair.w / 2 - cube.x, chair.y + chair.d / 2 - cube.y)).toBeLessThan(2.2);
    const board = FURNITURE.find((f) => f.id === 'anx.hr.board')!;
    expect(board.y).toBeLessThan(toby.y);
    expect(board.y + board.d).toBeGreaterThan(toby.y); // the HR board hangs on the end wall behind Toby
  });

  it('gives the accounting corner the original’s supply cabinets: along the left wall, the front wall and behind the desks', () => {
    const supplies = FURNITURE.filter((f) => f.areaId === 'bullpen' && f.kind === 'supplies' && f.x < 22);
    expect(supplies.length).toBeGreaterThanOrEqual(3);
    const angela = FURNITURE.find((f) => f.id === 'bp.desk.angela')!;
    expect(supplies.some((f) => f.y > angela.y + angela.d && f.y < rect('reception').y)).toBe(true);
  });

  it('overlaps areas only where reception sits inside the open-plan bullpen', () => {
    const overlaps: string[] = [];
    main.forEach((a, i) => main.slice(i + 1).forEach((b) => {
      const r = a.rect;
      const q = b.rect;
      if (r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h) overlaps.push([a.id, b.id].sort().join('+'));
    }));
    expect(overlaps).toEqual(['bullpen+reception']);
  });
});
