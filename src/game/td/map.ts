/**
 * Tower-defense maps: a 9 by 9 grid with one lane that ends at the wake core.
 * Each map's waypoints come from config.json; creeps walk the straight lines
 * between them. Imports are relative with extensions so the tests can load this
 * file directly.
 */
import { CONFIG, type TdMapSpec } from "../config.ts";

export const COLS = 9;
export const ROWS = 9;

export type Cell = readonly [number, number];

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
  /** Cells on the lane, as "col,row". */
  lane: ReadonlySet<string>;
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

export function makeMap(key: string, spec: TdMapSpec): TdMap {
  const waypoints = spec.waypoints.map(([c = 0, r = 0]) => [c, r] as Cell);
  const path: Cell[] = [];
  let length = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i] as Cell;
    const b = waypoints[i + 1] as Cell;
    const seg = segmentCells(a, b);
    for (const cell of i === 0 ? seg : seg.slice(1)) path.push(cell);
    length += Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
  }
  return {
    key,
    name: spec.name,
    blurb: spec.blurb,
    waypoints,
    gate: waypoints[0] ?? [0, 0],
    core: waypoints[waypoints.length - 1] ?? [0, 0],
    path,
    length,
    startGold: spec.startGold ?? CONFIG.td.startGold,
    lane: new Set(path.map(([c, r]) => `${c},${r}`)),
  };
}

export const MAPS: Record<string, TdMap> = Object.fromEntries(
  Object.entries(CONFIG.td.maps).map(([key, spec]) => [key, makeMap(key, spec)]),
);

export const MAP_KEYS = Object.keys(MAPS);

export const DEFAULT_MAP: TdMap =
  MAPS[CONFIG.td.defaultMap] ?? (MAPS[MAP_KEYS[0] ?? ""] as TdMap);

/** The map with this key, or the default one. */
export function mapFor(key: string | null | undefined): TdMap {
  return (key && MAPS[key]) || DEFAULT_MAP;
}

export function onPath(map: TdMap, col: number, row: number): boolean {
  return map.lane.has(`${col},${row}`);
}

export function inGrid(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < COLS && row < ROWS;
}

/** Towers can go on any free cell that is not on the lane and not the core. */
export function buildable(map: TdMap, col: number, row: number): boolean {
  if (!inGrid(col, row)) return false;
  if (onPath(map, col, row)) return false;
  return !(col === map.core[0] && row === map.core[1]);
}

/** Position in grid units (column, row, centres at +0.5) after walking `dist` cells. */
export function pointAt(map: TdMap, dist: number): { x: number; y: number } {
  let left = Math.max(0, dist);
  const w = map.waypoints;
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
