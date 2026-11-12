/**
 * Tower-defense maps: a 9 by 9 grid with one lane (or two) that ends at the
 * wake core. Each map's waypoints come from config.json; creeps walk the
 * straight lines between them. A map with lanes has a gate for each; the creeps
 * of a wave take them in turn.
 *
 * Maps can also be stitched: two to four of them side by side as one map. The
 * lane is one line through all of them: from where a board's own lane ends it
 * runs on, across the boards, to the next board's gate, and only the last board
 * holds the core. A stitched map's key is its maps' keys joined with "+", such
 * as "coil+zigzag".
 *
 * Imports are relative with extensions so the tests can load this file directly.
 */
import { CONFIG, type TdMapSpec } from "../config.ts";

/** Size of one board. A stitched map is several of them: see a map's cols and rows. */
export const COLS = 9;
export const ROWS = 9;

export type Cell = readonly [number, number];

/** One lane: its corners from its gate to the core, the cells it crosses, and its length. */
export interface TdLane {
  waypoints: readonly Cell[];
  gate: Cell;
  path: readonly Cell[];
  length: number;
}

/** One board of a map, and where it sits on the whole grid. */
export interface TdSection {
  key: string;
  name: string;
  /** Its top left cell on the whole grid. */
  col: number;
  row: number;
  /** Where its lanes come in, and where its own lanes end (the core, or the start of the link to the next board). */
  gates: readonly Cell[];
  end: Cell;
}

export interface TdMap {
  key: string;
  name: string;
  blurb: string;
  /** Corners of the lane, from the gate (first) to the core (last). */
  waypoints: readonly Cell[];
  /** Where the creeps come in. */
  gate: Cell;
  core: Cell;
  /** Every cell the lane passes through, in order, with no repeats at the joins. */
  path: readonly Cell[];
  /** Length of the lane in cells, along the waypoints. */
  length: number;
  startGold: number;
  /** Cells on any lane, as "col,row". */
  lane: ReadonlySet<string>;
  /** Every lane (the first is waypoints, gate, path and length above). */
  lanes: readonly TdLane[];
  /** Size of the whole grid, in cells. */
  cols: number;
  rows: number;
  /** The boards it is made of, in the order the lane runs through them (one for a plain map). */
  sections: readonly TdSection[];
  /** On a stitched map: where each board's own lane ends and the lane runs on to the next board. */
  joins: readonly Cell[];
}

function segmentCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  const dc = Math.sign(b[0] - a[0]);
  const dr = Math.sign(b[1] - a[1]);
  let c = a[0];
  let r = a[1];
  out.push([c, r]);
  while (c !== b[0] || r !== b[1]) {
    if (c !== b[0]) c += dc;
    else r += dr;
    out.push([c, r]);
  }
  return out;
}

function makeLane(corners: readonly (readonly number[])[]): TdLane {
  const waypoints = corners.map(([c = 0, r = 0]) => [c, r] as Cell);
  const path: Cell[] = [];
  let length = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i] as Cell;
    const b = waypoints[i + 1] as Cell;
    const seg = segmentCells(a, b);
    for (const cell of i === 0 ? seg : seg.slice(1)) path.push(cell);
    length += Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
  }
  return { waypoints, gate: waypoints[0] ?? [0, 0], path, length };
}

export function makeMap(key: string, spec: TdMapSpec): TdMap {
  const lanes = (spec.lanes?.length ? spec.lanes : [spec.waypoints]).map((l) => makeLane(l));
  const first = lanes[0] as TdLane;
  const core = first.waypoints[first.waypoints.length - 1] ?? [0, 0];
  return {
    key,
    name: spec.name,
    blurb: spec.blurb,
    waypoints: first.waypoints,
    gate: first.gate,
    core,
    path: first.path,
    length: first.length,
    startGold: spec.startGold ?? CONFIG.td.startGold,
    lane: new Set(lanes.flatMap((l) => l.path.map(([c, r]) => `${c},${r}`))),
    lanes,
    cols: COLS,
    rows: ROWS,
    sections: [{ key, name: spec.name, col: 0, row: 0, gates: lanes.map((l) => l.gate), end: core }],
    joins: [],
  };
}

/** How many lanes a map has. */
export function laneCount(map: TdMap): number {
  return Math.max(1, map.lanes.length);
}

/** A lane's length in cells (the first lane for a lane the map does not have). */
export function laneLength(map: TdMap, lane = 0): number {
  return (map.lanes[lane] ?? map.lanes[0])?.length ?? map.length;
}

export const MAPS: Record<string, TdMap> = Object.fromEntries(
  Object.entries(CONFIG.td.maps).map(([key, spec]) => [key, makeMap(key, spec)]),
);

export const MAP_KEYS = Object.keys(MAPS);

export const DEFAULT_MAP: TdMap =
  MAPS[CONFIG.td.defaultMap] ?? (MAPS[MAP_KEYS[0] ?? ""] as TdMap);

// ---- Stitched maps ----

/** What joins the keys of a stitched map's boards. */
export const STITCH_SEP = "+";

/** Most boards one stitched map can have. */
export function maxStitch(): number {
  return Math.max(2, Math.min(4, Math.floor(CONFIG.td.stitch.maxMaps)));
}

/** The keys of the maps a key names: one for a plain map, several for a stitched one. */
export function stitchKeys(key: string): string[] {
  return key.split(STITCH_SEP).filter(Boolean);
}

/** The key of the stitched map made of these maps, in this order (a plain map's own key for one). */
export function stitchKey(keys: readonly string[]): string {
  return keys.join(STITCH_SEP);
}

/**
 * Where each board of a stitched map sits, in boards: along the top, then back
 * along the bottom, so every board touches the one before it.
 */
const STITCH_SPOTS: readonly Cell[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const cellKey = ([c, r]: Cell) => `${c},${r}`;

/**
 * The corner of the link from where one board's lane ends to the next board's
 * gate: straight along a row and a column, one way round or the other. It takes
 * the way that walks over the fewest cells already on a lane; if both are alike,
 * the one that turns on the board it leaves. None when the two are in line.
 */
function linkCorner(end: Cell, gate: Cell, lanes: ReadonlySet<string>, from: { col: number; row: number }): Cell[] {
  if (end[0] === gate[0] || end[1] === gate[1]) return [];
  const cost = (corner: Cell) =>
    [...segmentCells(end, corner).slice(1), ...segmentCells(corner, gate).slice(1, -1)].filter((cell) =>
      lanes.has(cellKey(cell)),
    ).length;
  const onFrom = ([c, r]: Cell) => c >= from.col && c < from.col + COLS && r >= from.row && r < from.row + ROWS;
  const ways: Cell[] = [
    [end[0], gate[1]],
    [gate[0], end[1]],
  ];
  ways.sort((x, y) => cost(x) - cost(y) || Number(onFrom(y)) - Number(onFrom(x)));
  return [ways[0] as Cell];
}

/**
 * Joins maps into one. Each keeps its own lanes, moved to its place on the grid;
 * lane i of the whole runs through lane i of every board (a board with fewer
 * lanes lends its lanes in turn), and from each board's end it runs on to the
 * next board's gate, so the whole is one connected lane.
 */
export function stitch(parts: readonly TdMap[]): TdMap {
  const key = stitchKey(parts.map((p) => p.key));
  const place = (i: number) => {
    const [c, r] = STITCH_SPOTS[i] ?? [0, 0];
    return { col: c * COLS, row: r * ROWS };
  };
  const wide = parts.length > 1 ? 2 : 1;
  const tall = parts.length > 2 ? 2 : 1;
  const sections: TdSection[] = parts.map((part, i) => {
    const at = place(i);
    return {
      key: part.key,
      name: part.name,
      col: at.col,
      row: at.row,
      gates: part.lanes.map((l) => [l.gate[0] + at.col, l.gate[1] + at.row] as Cell),
      end: [part.core[0] + at.col, part.core[1] + at.row] as Cell,
    };
  });
  // Every cell the boards' own lanes use, so a link can keep clear of them where it can.
  const own = new Set<string>();
  parts.forEach((part, i) => {
    const at = place(i);
    for (const cell of part.lane) {
      const [c = 0, r = 0] = cell.split(",").map(Number);
      own.add(`${c + at.col},${r + at.row}`);
    }
  });
  const laneTotal = Math.max(...parts.map((p) => p.lanes.length));
  const lanes: TdLane[] = [];
  for (let n = 0; n < laneTotal; n++) {
    const corners: Cell[] = [];
    parts.forEach((part, i) => {
      const at = place(i);
      const lane = part.lanes[n % part.lanes.length] as TdLane;
      const moved = lane.waypoints.map(([c, r]) => [c + at.col, r + at.row] as Cell);
      const end = corners[corners.length - 1];
      if (end) corners.push(...linkCorner(end, moved[0] as Cell, own, place(i - 1)));
      corners.push(...moved);
    });
    lanes.push(makeLane(corners));
  }
  const first = lanes[0] as TdLane;
  const last = sections[sections.length - 1] as TdSection;
  const extra = parts.length - 1;
  return {
    key,
    name: parts.map((p) => p.name).join(" + "),
    blurb: `${parts.length} maps joined into one: the lane runs through each in turn, on from its end to the next one's gate, and the core is on the last.`,
    waypoints: first.waypoints,
    gate: first.gate,
    core: last.end,
    path: first.path,
    length: first.length,
    startGold: Math.round(
      Math.max(...parts.map((p) => p.startGold)) * (1 + Math.max(0, CONFIG.td.stitch.startGoldPerBoard) * extra),
    ),
    lane: new Set(lanes.flatMap((l) => l.path.map(cellKey))),
    lanes,
    cols: wide * COLS,
    rows: tall * ROWS,
    sections,
    joins: sections.slice(0, -1).map((sec) => sec.end),
  };
}

const stitched = new Map<string, TdMap>();

/** The map a key names, plain or stitched, or undefined when it names none. */
export function findMap(key: string | null | undefined): TdMap | undefined {
  if (!key) return undefined;
  if (MAPS[key]) return MAPS[key];
  const made = stitched.get(key);
  if (made) return made;
  const keys = stitchKeys(key);
  if (keys.length < 2 || keys.length > maxStitch() || stitchKey(keys) !== key) return undefined;
  const parts = keys.map((k) => MAPS[k]);
  if (parts.some((p) => !p)) return undefined;
  const map = stitch(parts as TdMap[]);
  stitched.set(key, map);
  return map;
}

/** The map with this key, or the default one. */
export function mapFor(key: string | null | undefined): TdMap {
  return findMap(key) ?? DEFAULT_MAP;
}

/** How many boards a map is made of. */
export function boardCount(map: TdMap): number {
  return Math.max(1, map.sections.length);
}

/** How much more life creeps have, and how much more kills pay, on a stitched map. */
export function stitchScale(map: TdMap): { hp: number; gold: number } {
  const extra = boardCount(map) - 1;
  const S = CONFIG.td.stitch;
  return { hp: 1 + Math.max(0, S.hpPerBoard) * extra, gold: 1 + Math.max(0, S.goldPerBoard) * extra };
}

export function onPath(map: TdMap, col: number, row: number): boolean {
  return map.lane.has(`${col},${row}`);
}

/** True for a cell of one board (and of any map, when the map is given). */
export function inGrid(col: number, row: number, map?: TdMap): boolean {
  return col >= 0 && row >= 0 && col < (map?.cols ?? COLS) && row < (map?.rows ?? ROWS);
}

/** Towers can go on any free cell that is not on the lane and not the core. */
export function buildable(map: TdMap, col: number, row: number): boolean {
  if (!inGrid(col, row, map)) return false;
  if (onPath(map, col, row)) return false;
  return !(col === map.core[0] && row === map.core[1]);
}

/** Position in grid units (column, row, centres at +0.5) after walking `dist` cells along a lane. */
export function pointAt(map: TdMap, dist: number, lane = 0): { x: number; y: number } {
  let left = Math.max(0, dist);
  const w = (map.lanes[lane] ?? map.lanes[0])?.waypoints ?? map.waypoints;
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i] as Cell;
    const b = w[i + 1] as Cell;
    const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    if (left <= len) {
      const t = len === 0 ? 0 : left / len;
      return { x: a[0] + (b[0] - a[0]) * t + 0.5, y: a[1] + (b[1] - a[1]) * t + 0.5 };
    }
    left -= len;
  }
  return { x: map.core[0] + 0.5, y: map.core[1] + 0.5 };
}

/** The board a point of the grid is on (the first, for a point on none). */
export function sectionAt(map: TdMap, x: number, y: number): number {
  const i = map.sections.findIndex((s) => x >= s.col && x < s.col + COLS && y >= s.row && y < s.row + ROWS);
  return i < 0 ? 0 : i;
}
