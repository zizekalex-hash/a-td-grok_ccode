/**
 * The pictures brought in for the Court's portraits (artwork.ts), kept on this
 * device: read once and put in place (portrait.ts setArt), saved whenever one
 * changes. A picture is made smaller when it is brought in, so a few fit.
 */

import type { CourtQueenKey } from "../config.ts";
import { ART_KEY, ART_MAX_CHARS, ART_MAX_EDGE, cleanArt, loadArts, type Art, type Arts } from "./artwork.ts";
import { setArt } from "./portrait.ts";

let kept: Arts | null = null;

/** The pictures kept on the device, read the first time and put in place; the same ones after. */
export function readArts(): Arts {
  if (kept) return kept;
  let data: unknown = null;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(ART_KEY);
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* nothing kept, or it cannot be read: the drawn portraits */
  }
  const read = loadArts(data);
  kept = read;
  for (const q of Object.keys(read.queens) as CourtQueenKey[]) setArt(q, read.queens[q] ?? null);
  if (read.you) setArt("you", read.you);
  return read;
}

/** Saved on the device: false when it will not fit (the picture still shows till the app closes). */
function keep(next: Arts): boolean {
  kept = next;
  try {
    localStorage.setItem(ART_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** A picture put in place for a queen or for you (null: taken away). Gives back whether it was kept. */
export function applyArt(who: CourtQueenKey | "you", art: Art | null): boolean {
  const now = readArts();
  const clean = art ? cleanArt(art) : null;
  let ok: boolean;
  if (who === "you") ok = keep({ ...now, you: clean });
  else {
    const queens = { ...now.queens };
    if (clean) queens[who] = clean;
    else delete queens[who];
    ok = keep({ ...now, queens });
  }
  setArt(who, clean);
  return ok;
}

/** What someone has now. */
export function artFor(who: CourtQueenKey | "you"): Art | null {
  const now = readArts();
  return who === "you" ? now.you : (now.queens[who] ?? null);
}

/**
 * A picture file brought in: made no larger than ART_MAX_EDGE on its long side and
 * kept as a jpeg, so it takes little room. Throws why it could not be.
 */
export async function readArtFile(file: File): Promise<Art> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("That file is not a picture this device can open (use a jpg, png or webp).");
  }
  const k = Math.min(1, ART_MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device cannot make the picture smaller.");
  ctx.fillStyle = "#05020c";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  let src = canvas.toDataURL("image/jpeg", 0.86);
  if (src.length > ART_MAX_CHARS) src = canvas.toDataURL("image/jpeg", 0.68);
  const art = cleanArt({ src, w, h, fx: 0.5, fy: 0.35, zoom: 1, mix: 1 });
  if (!art) throw new Error("That picture is too large to keep: try a smaller one.");
  return art;
}
