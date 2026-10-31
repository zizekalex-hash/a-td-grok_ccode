/**
 * The Court's world: a small grid read from court.map in config.json, and the
 * paths you walk on it. Pure, with relative imports, so the tests can load it.
 */

import { CONFIG, type CourtPlaceKey, type CourtRegionKey } from "../config.ts";

export type Terrain =
  | "grass"
  | "path"
  | "tree"
  | "water"
  | "rock"
  | "flowers"
  | "void"
  | "sand"
  | "ash"
  | "lava"
  | "building"
  | "door";
export type Spot = [number, number];

export interface Cell {
  terrain: Terrain;
  /** The place a door, spot or building belongs to. */
  place?: CourtPlaceKey;
  walk: boolean;
}

export interface World {
  cols: number;
  rows: number;
  /** Rows of cells: cells[row][col]. */
  cells: Cell[][];
  /** The cell you stand on to use a place. */
  doors: Partial<Record<CourtPlaceKey, Spot>>;
  /** The box a building fills, for drawing: first and last column and row. */
  buildings: Partial<Record<CourtPlaceKey, { c0: number; r0: number; c1: number; r1: number }>>;
}

const TERRAIN: Record<string, { terrain: Terrain; walk: boolean }> = {
  ".": { terrain: "grass", walk: true },
  "=": { terrain: "path", walk: true },
  T: { terrain: "tree", walk: false },
  "~": { terrain: "water", walk: false },
  "^": { terrain: "rock", walk: false },
  "*": { terrain: "flowers", walk: true },
  ",": { terrain: "void", walk: true },
  _: { terrain: "sand", walk: true },
  ":": { terrain: "ash", walk: true },
  "#": { terrain: "lava", walk: false },
};

export const PLACE_KEYS = Object.keys(CONFIG.court.places) as CourtPlaceKey[];
export const REGION_KEYS = Object.keys(CONFIG.court.regions) as CourtRegionKey[];

/** The places that stand in a region. */
export function placesIn(region: CourtRegionKey): CourtPlaceKey[] {
  return PLACE_KEYS.filter((k) => CONFIG.court.places[k].region === region);
}

/**
 * Reads a region's map: the letter of one of its places marks that place's door
 * (lowercase) or building (uppercase).
 */
export function parseWorld(region: CourtRegionKey = "realm", map: string[] = CONFIG.court.regions[region].map): World {
  const rows = map.length;
  const cols = Math.max(0, ...map.map((r) => r.length));
  const byLetter = new Map<string, CourtPlaceKey>();
  for (const key of placesIn(region)) byLetter.set(CONFIG.court.places[key].letter.toLowerCase(), key);
  const doors: World["doors"] = {};
  const buildings: World["buildings"] = {};
  const cells: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const line = map[r] ?? "";
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      const ch = line[c] ?? ".";
      const t = TERRAIN[ch];
      const place = byLetter.get(ch.toLowerCase());
      if (t) row.push({ ...t });
      else if (place && ch === ch.toLowerCase()) {
        row.push({ terrain: "door", place, walk: true });
        doors[place] = [c, r];
      } else if (place) {
        row.push({ terrain: "building", place, walk: false });
        const b = buildings[place];
        buildings[place] = b
          ? { c0: Math.min(b.c0, c), r0: Math.min(b.r0, r), c1: Math.max(b.c1, c), r1: Math.max(b.r1, r) }
          : { c0: c, r0: r, c1: c, r1: r };
      } else row.push({ terrain: "grass", walk: true });
    }
    cells.push(row);
  }
  return { cols, rows, cells, doors, buildings };
}

export function cellAt(w: World, c: number, r: number): Cell | undefined {
  return w.cells[r]?.[c];
}

export function walkable(w: World, c: number, r: number): boolean {
  return cellAt(w, c, r)?.walk === true;
}

const STEPS: Spot[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The shortest walk from one cell to another, without the start; null when there is none. */
export function pathTo(w: World, from: Spot, to: Spot): Spot[] | null {
  if (!walkable(w, to[0], to[1])) return null;
  if (from[0] === to[0] && from[1] === to[1]) return [];
  const key = (c: number, r: number) => r * w.cols + c;
  const prev = new Map<number, number>();
  const queue: Spot[] = [from];
  prev.set(key(from[0], from[1]), -1);
  while (queue.length) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of STEPS) {
      const nc = c + dc;
      const nr = r + dr;
      const k = key(nc, nr);
      if (prev.has(k) || !walkable(w, nc, nr)) continue;
      prev.set(k, key(c, r));
      if (nc === to[0] && nr === to[1]) {
        const out: Spot[] = [];
        let at = k;
        while (at !== key(from[0], from[1])) {
          out.push([at % w.cols, Math.floor(at / w.cols)]);
          at = prev.get(at)!;
        }
        return out.reverse();
      }
      queue.push([nc, nr]);
    }
  }
  return null;
}

/**
 * Where a tap sends you: a building's door, or the tapped cell, or the nearest
 * cell you can stand on beside a tree, rock or water.
 */
export function destinationFor(w: World, c: number, r: number): Spot | null {
  const cell = cellAt(w, c, r);
  if (!cell) return null;
  if (cell.terrain === "building" && cell.place) return w.doors[cell.place] ?? null;
  if (cell.walk) return [c, r];
  return nearestWalkable(w, [c, r]);
}

/** The closest cell you can stand on, around a spot. */
export function nearestWalkable(w: World, at: Spot): Spot | null {
  for (let d = 1; d < Math.max(w.cols, w.rows); d++) {
    let best: Spot | null = null;
    let bestD = Infinity;
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
        const c = at[0] + dc;
        const r = at[1] + dr;
        const dist = Math.hypot(dc, dr);
        if (walkable(w, c, r) && dist < bestD) {
          best = [c, r];
          bestD = dist;
        }
      }
    }
    if (best) return best;
  }
  return null;
}
