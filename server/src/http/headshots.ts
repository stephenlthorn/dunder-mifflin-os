// GET /api/headshots/:profile. Whitelisted profile keys only: <profile>.jpg, else <profile>.png, from the headshots
// directory (DMOS_HEADSHOTS_DIR, default ~/.dunder-mifflin-os/headshots; never part of the repo).
import path from 'node:path';
import { isBotProfile } from '../roster.ts';
import { readImageFile, type Image } from './images.ts';

const EXTENSIONS = ['.jpg', '.png'] as const;

/** The files a profile's headshot may live in, in the order they are tried; none for a profile off the roster. */
export function headshotPaths(profile: string, headshotDir: string): string[] {
  return isBotProfile(profile) ? EXTENSIONS.map((ext) => path.join(headshotDir, `${profile}${ext}`)) : [];
}

export async function readHeadshot(profile: string, headshotDir: string): Promise<Image | null> {
  for (const file of headshotPaths(profile, headshotDir)) {
    const image = await readImageFile(file, `headshot:${profile}`);
    if (image) return image;
  }
  return null;
}
