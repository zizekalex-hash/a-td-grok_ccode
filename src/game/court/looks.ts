/**
 * The looks made in the Atelier, kept on this device: read once, laid over
 * config.json's looks (portrait.ts setLook), and saved whenever one is applied.
 * Everything else about a look (what it may be, the lists) is atelier.ts.
 */

import type { CourtQueenKey } from "../config.ts";
import {
  cleanLook,
  cleanName,
  loadLooks,
  LOOKS_KEY,
  originalLook,
  sameLook,
  type Looks,
  type Who,
} from "./atelier.ts";
import { setLook, type Look } from "./portrait.ts";

let looks: Looks | null = null;

/** The looks kept on the device, read the first time and put in place; the same ones after. */
export function readLooks(): Looks {
  if (looks) return looks;
  let data: unknown = null;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(LOOKS_KEY);
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* nothing kept, or it cannot be read: the originals */
  }
  const read = loadLooks(data);
  looks = read;
  for (const q of Object.keys(read.queens) as CourtQueenKey[]) setLook(q, read.queens[q] ?? null);
  if (read.you) setLook("you", read.you);
  return read;
}

/** Kept on the device as they are now. */
function keep(next: Looks) {
  looks = next;
  try {
    localStorage.setItem(LOOKS_KEY, JSON.stringify(next));
  } catch {
    /* private mode or full: the look still shows till the app closes */
  }
}

/**
 * A look applied: a queen's, or your own. The same as the original (or null)
 * takes the change away. Every portrait of hers draws from it at once.
 */
export function applyLook(who: Who, look: Look | null) {
  const now = readLooks();
  const base = originalLook(who);
  const clean = look ? cleanLook(look, base) : null;
  const kept = clean && !sameLook(clean, base) ? clean : null;
  if (who === "you") keep({ ...now, you: kept });
  else {
    const queens = { ...now.queens };
    if (kept) queens[who] = kept;
    else delete queens[who];
    keep({ ...now, queens });
  }
  setLook(who, kept);
}

/** Your name, over your figure on the map. */
export function youName(): string {
  return readLooks().name;
}

export function applyName(name: string) {
  keep({ ...readLooks(), name: cleanName(name) });
}

/** Whether a look was changed by hand (a queen's, or yours). */
export function lookChanged(who: Who): boolean {
  const now = readLooks();
  return who === "you" ? !!now.you : !!now.queens[who];
}
