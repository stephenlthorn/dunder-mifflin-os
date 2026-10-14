// GET /api/portraits/:personId: a photo of someone on the map. Photos are never part of the repo; they live in a local
// directory (DMOS_PORTRAITS_DIR, default ~/.dunder-mifflin-os/portraits) as <personId>.jpg or <personId>.png.
// Only ids of people on the map are answered (allow-list), so a request can never name a path. Without a portrait
// file, a person with a Hermes bot gets the bot's headshot; everyone else gets a 404 and the drawn character.
import path from 'node:path';
import { STAFF } from '../../../shared/office.ts';
import { profileForPerson } from '../roster.ts';
import { readHeadshot } from './headshots.ts';
import { readImageFile, type Image } from './images.ts';

export type PortraitDirs = { portraitsDir: string | null; headshotDir: string | null };

const PERSON_IDS: ReadonlySet<string> = new Set(STAFF.map((s) => s.id));
const SAFE_ID = /^[a-z][a-z0-9-]{0,31}$/;
const EXTENSIONS = ['.jpg', '.png'] as const;

export const isPortraitId = (id: string): boolean => SAFE_ID.test(id) && PERSON_IDS.has(id);

/** profileOf: the Hermes profile seated at a person's desk (its headshot is the fallback); default the built-in seating. */
export async function readPortrait(
  personId: string, dirs: PortraitDirs, profileOf: (personId: string) => string | undefined = profileForPerson,
): Promise<Image | null> {
  if (!isPortraitId(personId)) return null;
  if (dirs.portraitsDir) {
    for (const ext of EXTENSIONS) {
      const image = await readImageFile(path.join(dirs.portraitsDir, `${personId}${ext}`), `portrait:${personId}`);
      if (image) return image;
    }
  }
  const profile = profileOf(personId);
  return profile && dirs.headshotDir ? readHeadshot(profile, dirs.headshotDir) : null;
}
