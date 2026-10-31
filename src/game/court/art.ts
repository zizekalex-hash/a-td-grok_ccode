/**
 * The Court's world, drawn in detail: ground that blends at its edges, cobbles,
 * boardwalks and flagstones, trees and mountains, a building for every place,
 * and the moving parts (water, lava, the void's stars, smoke, fireflies and
 * embers). drawWorld draws the still parts once, into a cache; drawLive runs
 * every frame over it. Everything is shapes, so it looks the same on every
 * device and needs no network.
 */

import { CONFIG, type CourtPlaceKey, type CourtRegionKey } from "../config.ts";
import { shade } from "./portrait.ts";
import type { Spot, Terrain, World } from "./world.ts";

type Ctx = CanvasRenderingContext2D;

/** Room above the first row, in cells, for roofs, towers and peaks to rise into. */
export const HEADROOM = 0.6;

export type BuildingStyle =
  "castle" | "dome" | "house" | "market" | "cave" | "tower" | "forge" | "arena" | "pool";

/** How each place with a building looks; any other place is a house. */
export const BUILDING_STYLE: Partial<Record<CourtPlaceKey, BuildingStyle>> = {
  palace: "castle",
  library: "dome",
  temple: "dome",
  inn: "house",
  harbor: "house",
  hall: "house",
  market: "market",
  mine: "cave",
  grotto: "cave",
  spire: "tower",
  sanctum: "tower",
  forge: "forge",
  arena: "arena",
  springs: "pool",
};

/** A steady random number from 0 to 1 for a cell, so the world looks the same every time. */
export function hash(c: number, r: number, k = 0): number {
  let h =
    (Math.imul(c + 1, 374761393) + Math.imul(r + 1, 668265263) + Math.imul(k + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A #rrggbb colour at an opacity. */
export function alpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

interface Palette {
  grass: string;
  grassDark: string;
  grassLight: string;
  blade: string;
  path: string;
  stones: string[];
  pathStyle: "cobble" | "plank" | "flag";
  water: string;
  shallow: string;
  foam: string;
  sand: string;
  sandDark: string;
  ash: string;
  ashDark: string;
  ember: string;
  lava: string;
  lavaHot: string;
  crust: string;
  void: string;
  voidGlow: string;
  rock: string;
  rockLight: string;
  rockDark: string;
  cap: string;
  /** What lies under mountains and buildings. */
  ground: Terrain;
  leaves: string[];
  trunk: string;
  tree: "oak" | "palm";
  wall: string;
  wallDark: string;
  trim: string;
  window: string;
}

const SHARED = {
  water: "#164a85",
  shallow: "#2a6fb0",
  foam: "#cfeaff",
  sand: "#c9b07a",
  sandDark: "#a88f5c",
  ash: "#3b302f",
  ashDark: "#2b2322",
  ember: "#ff8a4c",
  lava: "#d4480f",
  lavaHot: "#ffb02e",
  crust: "#3a1a10",
  void: "#1c0c36",
  voidGlow: "#b48cff",
};

export const PALETTES: Record<CourtRegionKey, Palette> = {
  realm: {
    ...SHARED,
    grass: "#25512d",
    grassDark: "#1b3f22",
    grassLight: "#3b7c40",
    blade: "#74c463",
    path: "#3b332b",
    stones: ["#8a7f70", "#9b9080", "#7a7062", "#a89c8a"],
    pathStyle: "cobble",
    rock: "#6e6b7d",
    rockLight: "#a5a2b8",
    rockDark: "#45425a",
    cap: "#eef2ff",
    ground: "grass",
    leaves: ["#1d5a2c", "#2c7a3a", "#4aa651"],
    trunk: "#5b3a22",
    tree: "oak",
    wall: "#e2d3b4",
    wallDark: "#a8957a",
    trim: "#4a3424",
    window: "#ffd27a",
  },
  isles: {
    ...SHARED,
    water: "#0d5d8f",
    shallow: "#25b6cc",
    foam: "#effcff",
    sand: "#e3cc94",
    sandDark: "#c9ad70",
    grass: "#2e7240",
    grassDark: "#225a30",
    grassLight: "#4c9e52",
    blade: "#8ad86c",
    path: "#3a2616",
    stones: ["#9a7048", "#8a6440", "#a77c52", "#7f5a38"],
    pathStyle: "plank",
    rock: "#7a6f66",
    rockLight: "#b0a294",
    rockDark: "#4e4640",
    cap: "#6f9a5a",
    ground: "sand",
    leaves: ["#1f7a3a", "#2f9a48", "#5cc65c"],
    trunk: "#8a6a44",
    tree: "palm",
    wall: "#ece6d6",
    wallDark: "#aaa28e",
    trim: "#2f5f8a",
    window: "#bfe9ff",
  },
  peaks: {
    ...SHARED,
    grass: "#3a3a2a",
    grassDark: "#2c2c20",
    grassLight: "#4a4a36",
    blade: "#7a7a50",
    path: "#1c1616",
    stones: ["#7a6a64", "#86746c", "#6c5e59", "#927e74"],
    pathStyle: "flag",
    rock: "#4a3d3f",
    rockLight: "#76625f",
    rockDark: "#2a2224",
    cap: "#a09490",
    ground: "ash",
    leaves: ["#3a3a2a", "#4a4a36", "#5a5a40"],
    trunk: "#2a1e1a",
    tree: "oak",
    wall: "#5e504b",
    wallDark: "#3a302e",
    trim: "#ff6a3d",
    window: "#ffb347",
  },
};

/** The ground colour of a kind of terrain. */
function baseOf(t: Terrain, P: Palette): string {
  switch (t) {
    case "path":
      return P.path;
    case "water":
      return P.water;
    case "sand":
      return P.sand;
    case "ash":
      return P.ash;
    case "lava":
      return P.lava;
    case "void":
      return P.void;
    case "tree":
      return P.grassDark;
    case "rock":
      return baseOf(P.ground, P);
    case "building":
      return baseOf(P.ground, P);
    default:
      return P.grass;
  }
}

/** Which ground overgrows which at an edge: the higher spills over the lower. */
const PRIORITY: Partial<Record<Terrain, number>> = {
  grass: 5,
  flowers: 5,
  tree: 5,
  rock: 4,
  sand: 3,
  ash: 3,
  path: 2,
  void: 1,
};

/** Everything drawLive needs about a region, found once. */
export interface Scene {
  region: CourtRegionKey;
  cols: number;
  rows: number;
  water: Spot[];
  lava: Spot[];
  void: Spot[];
  /** Open-air places and gates: their spot and colour. */
  spots: { place: CourtPlaceKey; at: Spot; color: string; gate: boolean }[];
  /** Where smoke (or steam) rises from, in cells. */
  smoke: { x: number; y: number; kind: "smoke" | "forge" | "steam" }[];
  /** Spots in the trees and flowers, for fireflies. */
  green: Spot[];
  /** Townsfolk walking the streets, and boats on the water: to and fro along a straight run. */
  walkers: Walker[];
}

export interface Walker {
  kind: "folk" | "boat";
  /** The ends of the run, in cells. */
  a: Spot;
  b: Spot;
  /** Cells a second, and where in the walk they start. */
  speed: number;
  phase: number;
  color: string;
  /** A hat or hood, and whether they carry a lantern. */
  hat: string;
  lantern: boolean;
}

/** A light that glows at night: a window, a door, a lamp, a portal. In map pixels. */
export interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
}

/** Lights found while the world is drawn. */
let lights: Light[] | null = null;

/** A window's light at night: its glass colour, warmer. */
function light0(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffd27a";
}

function addLight(x: number, y: number, r: number, color: string) {
  lights?.push({ x, y, r, color });
}

/** Straight runs of a kind of ground at least min cells long, across and down. */
export function runsOf(
  w: World,
  test: (t: Terrain) => boolean,
  min: number,
): { a: Spot; b: Spot }[] {
  const out: { a: Spot; b: Spot }[] = [];
  for (let r = 0; r < w.rows; r++) {
    let start = -1;
    for (let c = 0; c <= w.cols; c++) {
      const ok = c < w.cols && test(w.cells[r]![c]!.terrain);
      if (ok && start < 0) start = c;
      if (!ok && start >= 0) {
        if (c - start >= min) out.push({ a: [start, r], b: [c - 1, r] });
        start = -1;
      }
    }
  }
  for (let c = 0; c < w.cols; c++) {
    let start = -1;
    for (let r = 0; r <= w.rows; r++) {
      const ok = r < w.rows && test(w.cells[r]![c]!.terrain);
      if (ok && start < 0) start = r;
      if (!ok && start >= 0) {
        if (r - start >= min) out.push({ a: [c, start], b: [c, r - 1] });
        start = -1;
      }
    }
  }
  return out;
}

const FOLK: Record<
  CourtRegionKey,
  { count: number; colors: string[]; hats: string[]; lantern: boolean }
> = {
  realm: {
    count: 5,
    colors: ["#b03a2e", "#2e6db0", "#2e8a4a", "#7d3c98", "#c27d0e"],
    hats: ["#5b3a22", "#e8c872", "#3a2a1a", "#a0a0b0", "#6a1a2a"],
    lantern: false,
  },
  isles: {
    count: 3,
    colors: ["#eef2f5", "#1f5f8b", "#f0b04a"],
    hats: ["#1f3a5a", "#eef2f5", "#c0392b"],
    lantern: false,
  },
  peaks: {
    count: 3,
    colors: ["#5d4037", "#4e342e", "#6d4c41"],
    hats: ["#2a1e1a", "#8a7f7d", "#2a1e1a"],
    lantern: true,
  },
};

/** Who walks the region's streets, and the boats off the Isles. */
function walkersOf(w: World, region: CourtRegionKey): Walker[] {
  const f = FOLK[region];
  const out: Walker[] = [];
  const streets = runsOf(w, (t) => t === "path", 4).sort(
    (x, y) =>
      Math.abs(y.b[0] - y.a[0]) +
      Math.abs(y.b[1] - y.a[1]) -
      (Math.abs(x.b[0] - x.a[0]) + Math.abs(x.b[1] - x.a[1])),
  );
  for (let i = 0; i < f.count && streets.length; i++) {
    const run = streets[Math.floor(hash(i, 3, 800) * Math.min(streets.length, 8))]!;
    out.push({
      kind: "folk",
      a: run.a,
      b: run.b,
      speed: 0.5 + hash(i, 4, 801) * 0.5,
      phase: hash(i, 5, 802),
      color: f.colors[i % f.colors.length]!,
      hat: f.hats[i % f.hats.length]!,
      lantern: f.lantern,
    });
  }
  if (region === "isles") {
    const sea = runsOf(w, (t) => t === "water", 7).filter((r) => r.a[1] === r.b[1]);
    for (let i = 0; i < 2 && sea.length; i++) {
      const run = sea[Math.floor(hash(i, 6, 803) * sea.length)]!;
      out.push({
        kind: "boat",
        a: run.a,
        b: run.b,
        speed: 0.35 + hash(i, 7, 804) * 0.2,
        phase: hash(i, 8, 805),
        color: i ? "#8a5a32" : "#6a4426",
        hat: i ? "#f2eee4" : "#e8c872",
        lantern: false,
      });
    }
  }
  return out;
}

/** Where a walker is at time t, and which way it faces. Pure, for the tests. */
export function walkerAt(
  wk: Walker,
  t: number,
): { x: number; y: number; dir: number; moving: boolean } {
  const len = Math.max(1, Math.abs(wk.b[0] - wk.a[0]) + Math.abs(wk.b[1] - wk.a[1]));
  // To one end, a short rest, back to the other.
  const cycle = (len / wk.speed) * 2 + 3;
  const u = (((t + wk.phase * cycle) % cycle) + cycle) % cycle;
  const leg = len / wk.speed;
  let f: number;
  let dir: number;
  let moving = true;
  if (u < leg) {
    f = u / leg;
    dir = 1;
  } else if (u < leg + 1.5) {
    f = 1;
    dir = 1;
    moving = false;
  } else if (u < leg * 2 + 1.5) {
    f = 1 - (u - leg - 1.5) / leg;
    dir = -1;
  } else {
    f = 0;
    dir = -1;
    moving = false;
  }
  return {
    x: wk.a[0] + (wk.b[0] - wk.a[0]) * f,
    y: wk.a[1] + (wk.b[1] - wk.a[1]) * f,
    dir,
    moving,
  };
}

/**
 * How dark it is at a moment of the day, by the device's clock: 0 by day, 1 at
 * night, and in between at dusk (18:00 to 20:00) and dawn (5:00 to 7:00).
 */
export function nightLevel(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 20 || h < 5) return 1;
  if (h >= 18) return (h - 18) / 2;
  if (h < 7) return 1 - (h - 5) / 2;
  return 0;
}

const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** The ground a door stands on: whatever most of its open neighbours are, or path. */
function doorGround(w: World, c: number, r: number): Terrain {
  const count = new Map<Terrain, number>();
  for (const [dc, dr] of DIRS) {
    const t = w.cells[r + dr]?.[c + dc]?.terrain;
    if (!t || t === "building" || t === "door" || t === "tree" || t === "rock") continue;
    count.set(t, (count.get(t) ?? 0) + 1);
  }
  let best: Terrain = "path";
  let n = 0;
  for (const [t, k] of count) if (k > n || (k === n && t === "path")) [best, n] = [t, k];
  return best;
}

/** What each cell shows as ground: doors take their surroundings', and lava or water never sit under a door. */
function groundGrid(w: World, P: Palette): Terrain[][] {
  return w.cells.map((row, r) =>
    row.map((cell, c) => {
      if (cell.terrain === "door") {
        const t = doorGround(w, c, r);
        return t === "water" || t === "lava" ? "path" : t;
      }
      return cell.terrain === "building" ? P.ground : cell.terrain;
    }),
  );
}

/** Which side of its building a door is on. */
function doorSide(box: Box, door: Spot | undefined): "bottom" | "left" | "right" | "top" {
  if (!door) return "bottom";
  if (door[1] > box.r1) return "bottom";
  if (door[1] < box.r0) return "top";
  return door[0] < box.c0 ? "left" : "right";
}

interface Box {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

export function sceneOf(
  w: World,
  region: CourtRegionKey,
  colorOf: (p: CourtPlaceKey) => string,
): Scene {
  const water: Spot[] = [];
  const lava: Spot[] = [];
  const voids: Spot[] = [];
  const green: Spot[] = [];
  for (let r = 0; r < w.rows; r++) {
    for (let c = 0; c < w.cols; c++) {
      const t = w.cells[r]![c]!.terrain;
      if (t === "water") water.push([c, r]);
      else if (t === "lava") lava.push([c, r]);
      else if (t === "void") voids.push([c, r]);
      else if (t === "tree" || t === "flowers") green.push([c, r]);
    }
  }
  const spots: Scene["spots"] = [];
  for (const [place, at] of Object.entries(w.doors) as [CourtPlaceKey, Spot][]) {
    if (w.buildings[place]) continue;
    spots.push({ place, at, color: colorOf(place), gate: !!CONFIG.court.places[place].gate });
  }
  const smoke: Scene["smoke"] = [];
  for (const [place, box] of Object.entries(w.buildings) as [CourtPlaceKey, Box][]) {
    const style = BUILDING_STYLE[place] ?? "house";
    const bw = box.c1 - box.c0 + 1;
    if (style === "house") smoke.push({ x: box.c0 + bw * 0.78, y: box.r0 - 0.3, kind: "smoke" });
    else if (style === "forge")
      smoke.push({ x: box.c0 + bw * 0.8, y: box.r0 - 0.45, kind: "forge" });
    else if (style === "pool")
      smoke.push({ x: box.c0 + bw / 2, y: box.r0 + (box.r1 - box.r0 + 1) / 2, kind: "steam" });
  }
  return {
    region,
    cols: w.cols,
    rows: w.rows,
    water,
    lava,
    void: voids,
    spots,
    smoke,
    green,
    walkers: walkersOf(w, region),
  };
}

// ---- The still world ----

export interface WorldOptions {
  region: CourtRegionKey;
  /** The width of a cell, in CSS pixels. */
  s: number;
  font: string;
  colorOf: (place: CourtPlaceKey) => string;
  /** What a place's sign says. */
  label: (place: CourtPlaceKey) => string;
  /** The map's width, in CSS pixels, to keep names on it. */
  mapW: number;
}

/** Draws the whole region at (0, 0): ground, edges, details, then trees, mountains and buildings from back to front. */
export function drawWorld(g: Ctx, w: World, o: WorldOptions): Light[] {
  lights = [];
  const P = PALETTES[o.region];
  const s = o.s;
  const ground = groundGrid(w, P);
  const lw = Math.max(0.5, s * 0.03);
  // 1. The ground's surface.
  for (let r = 0; r < w.rows; r++) {
    for (let c = 0; c < w.cols; c++) surface(g, ground[r]![c]!, c, r, s, P, ground);
  }
  // Shallows: soft light pools along every shore, kept to the water so they blend across cells.
  const water: Spot[] = [];
  for (let r = 0; r < w.rows; r++)
    for (let c = 0; c < w.cols; c++) if (ground[r]![c] === "water") water.push([c, r]);
  if (water.length) {
    g.save();
    g.beginPath();
    for (const [c, r] of water) g.rect(c * s - 0.25, r * s - 0.25, s + 0.5, s + 0.5);
    g.clip();
    for (const [c, r] of water) {
      for (const [dc, dr] of DIRS) {
        const n = ground[r + dr]?.[c + dc];
        if (!n || n === "water") continue;
        const ex = (c + 0.5 + dc * 0.5) * s;
        const ey = (r + 0.5 + dr * 0.5) * s;
        const pool = g.createRadialGradient(ex, ey, 1, ex, ey, s * 0.85);
        pool.addColorStop(0, alpha(P.shallow, 0.75));
        pool.addColorStop(1, alpha(P.shallow, 0));
        g.fillStyle = pool;
        g.fillRect(ex - s, ey - s, s * 2, s * 2);
      }
    }
    g.restore();
  }
  // 2. Edges: grass spills over paths, water foams at the shore, the void glows at its rim.
  for (let r = 0; r < w.rows; r++) {
    for (let c = 0; c < w.cols; c++) edges(g, ground, c, r, s, P);
  }
  // 3. Small things on the ground.
  for (let r = 0; r < w.rows; r++) {
    for (let c = 0; c < w.cols; c++) {
      if (w.cells[r]![c]!.terrain === "building") continue;
      details(g, ground[r]![c]!, c, r, s, P, lw);
    }
  }
  // 4. Doors: a step and a soft glow in the place's colour.
  for (const [place, at] of Object.entries(w.doors) as [CourtPlaceKey, Spot][]) {
    const color = o.colorOf(place);
    const x = at[0] * s;
    const y = at[1] * s;
    const glow = g.createRadialGradient(x + s / 2, y + s / 2, 1, x + s / 2, y + s / 2, s * 0.6);
    glow.addColorStop(0, alpha(color, 0.35));
    glow.addColorStop(1, alpha(color, 0));
    g.fillStyle = glow;
    g.fillRect(x - s * 0.2, y - s * 0.2, s * 1.4, s * 1.4);
  }
  // 5. Tall things, from the back row to the front, so nearer ones overlap.
  type Thing = { row: number; order: number; draw: () => void };
  const things: Thing[] = [];
  for (let r = 0; r < w.rows; r++) {
    for (let c = 0; c < w.cols; c++) {
      const t = w.cells[r]![c]!.terrain;
      if (t === "tree") things.push({ row: r, order: 1, draw: () => tree(g, c, r, s, P, lw) });
      else if (t === "rock")
        things.push({ row: r, order: 0, draw: () => mountain(g, c, r, s, P, lw, o.region) });
    }
  }
  for (const [place, box] of Object.entries(w.buildings) as [CourtPlaceKey, Box][]) {
    const side = doorSide(box, w.doors[place]);
    const door = w.doors[place];
    things.push({
      row: box.r1,
      order: 2,
      draw: () => building(g, place, box, side, door, s, P, o, lw),
    });
  }
  for (const spot of Object.entries(w.doors) as [CourtPlaceKey, Spot][]) {
    const [place, at] = spot;
    if (w.buildings[place]) continue;
    things.push({ row: at[1], order: 3, draw: () => openPlace(g, place, at, s, P, o, lw) });
  }
  things.sort((a, b) => a.row - b.row || a.order - b.order);
  for (const t of things) t.draw();
  // 6. Signs over open-air places last, so nothing covers them.
  for (const [place, at] of Object.entries(w.doors) as [CourtPlaceKey, Spot][]) {
    if (w.buildings[place]) continue;
    sign(
      g,
      o.label(place),
      o.colorOf(place),
      (at[0] + 0.5) * s,
      at[1] * s - s * 0.34,
      s,
      w.cols * s,
      o.font,
    );
  }
  // Open-air places and gates glow at night too.
  for (const [place, at] of Object.entries(w.doors) as [CourtPlaceKey, Spot][]) {
    if (!w.buildings[place])
      addLight((at[0] + 0.5) * s, (at[1] + 0.5) * s, s * 1.3, o.colorOf(place));
  }
  const found = lights;
  lights = null;
  return found;
}

function surface(
  g: Ctx,
  t: Terrain,
  c: number,
  r: number,
  s: number,
  P: Palette,
  ground: Terrain[][],
) {
  const x = c * s;
  const y = r * s;
  const h = hash(c, r);
  g.fillStyle = baseOf(t, P);
  // A hair over the cell, so no seam shows between neighbours.
  g.fillRect(x - 0.25, y - 0.25, s + 0.5, s + 0.5);
  if (t === "grass" || t === "flowers" || t === "tree") {
    // Soft light and dark patches.
    for (let k = 0; k < 2; k++) {
      g.fillStyle = k ? alpha(P.grassLight, 0.35) : alpha(P.grassDark, 0.45);
      g.beginPath();
      g.ellipse(
        x + s * (0.25 + hash(c, r, k + 3) * 0.5),
        y + s * (0.25 + hash(c, r, k + 5) * 0.5),
        s * (0.22 + h * 0.12),
        s * 0.16,
        h * 3,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  } else if (t === "path") {
    paving(g, x, y, s, c, r, P, ground);
  } else if (t === "water") {
    g.strokeStyle = alpha(shade(P.water, -0.35), 0.6);
    g.lineWidth = Math.max(0.6, s * 0.035);
    for (const k of [0.32, 0.72]) {
      const off = (hash(c, r, k * 10) - 0.5) * s * 0.3;
      g.beginPath();
      g.moveTo(x + s * 0.18 + off, y + s * k);
      g.quadraticCurveTo(x + s * 0.32 + off, y + s * (k - 0.07), x + s * 0.46 + off, y + s * k);
      g.stroke();
    }
  } else if (t === "sand") {
    g.strokeStyle = alpha(P.sandDark, 0.55);
    g.lineWidth = Math.max(0.5, s * 0.025);
    for (const k of [0.3, 0.62]) {
      g.beginPath();
      g.moveTo(x + s * 0.1, y + s * (k + h * 0.12));
      g.quadraticCurveTo(
        x + s * 0.5,
        y + s * (k - 0.1 + h * 0.12),
        x + s * 0.9,
        y + s * (k + h * 0.12),
      );
      g.stroke();
    }
  } else if (t === "ash") {
    g.fillStyle = alpha(P.ashDark, 0.7);
    g.beginPath();
    g.ellipse(
      x + s * (0.3 + h * 0.4),
      y + s * (0.3 + hash(c, r, 2) * 0.4),
      s * 0.28,
      s * 0.18,
      h * 3,
      0,
      Math.PI * 2,
    );
    g.fill();
    // Cracks.
    g.strokeStyle = alpha("#120c0c", 0.7);
    g.lineWidth = Math.max(0.5, s * 0.03);
    g.beginPath();
    let px = x + s * hash(c, r, 7);
    let py = y;
    g.moveTo(px, py);
    for (let i = 0; i < 4; i++) {
      px += (hash(c, r, 10 + i) - 0.5) * s * 0.4;
      py += s * 0.25;
      g.lineTo(px, py);
    }
    g.stroke();
  } else if (t === "lava") {
    const hot = g.createRadialGradient(x + s / 2, y + s / 2, 1, x + s / 2, y + s / 2, s * 0.75);
    hot.addColorStop(0, P.lavaHot);
    hot.addColorStop(0.55, P.lava);
    hot.addColorStop(1, shade(P.lava, -0.35));
    g.fillStyle = hot;
    g.fillRect(x - 0.25, y - 0.25, s + 0.5, s + 0.5);
    // Plates of cooling crust, with bright seams.
    for (let k = 0; k < 3; k++) {
      const cx = x + s * (0.2 + hash(c, r, k + 20) * 0.6);
      const cy = y + s * (0.2 + hash(c, r, k + 30) * 0.6);
      const rr = s * (0.1 + hash(c, r, k + 40) * 0.1);
      g.fillStyle = alpha(P.crust, 0.85);
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + k;
        const rad = rr * (0.7 + hash(c, r, k * 10 + i + 50) * 0.5);
        if (i) g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        else g.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = alpha("#fff2a0", 0.6);
      g.lineWidth = Math.max(0.4, s * 0.02);
      g.stroke();
    }
  } else if (t === "void") {
    for (let k = 0; k < 2; k++) {
      const col = ["#7a3cff", "#ff4fd8", "#3cc8ff"][Math.floor(hash(c, r, k + 60) * 3)]!;
      const neb = g.createRadialGradient(
        x + s * hash(c, r, k + 61),
        y + s * hash(c, r, k + 62),
        1,
        x + s * hash(c, r, k + 61),
        y + s * hash(c, r, k + 62),
        s * 0.6,
      );
      neb.addColorStop(0, alpha(col, 0.28));
      neb.addColorStop(1, alpha(col, 0));
      g.fillStyle = neb;
      g.fillRect(x, y, s, s);
    }
    for (let k = 0; k < 3; k++) {
      g.fillStyle = k ? "rgba(220, 200, 255, 0.75)" : "rgba(140, 240, 255, 0.85)";
      const sz = Math.max(0.8, s * 0.04);
      g.fillRect(x + s * hash(c, r, k + 70), y + s * hash(c, r, k + 80), sz, sz);
    }
  }
}

/** Cobbles, boards or flagstones on a path cell. */
function paving(
  g: Ctx,
  x: number,
  y: number,
  s: number,
  c: number,
  r: number,
  P: Palette,
  ground: Terrain[][],
) {
  const lw = Math.max(0.4, s * 0.025);
  if (P.pathStyle === "plank") {
    // Boards across the way you walk.
    const along = ground[r]?.[c - 1] === "path" || ground[r]?.[c + 1] === "path";
    const across = ground[r - 1]?.[c] === "path" || ground[r + 1]?.[c] === "path";
    const vertical = along && !across;
    const n = 4;
    for (let i = 0; i < n; i++) {
      g.fillStyle = P.stones[Math.floor(hash(c, r, i + 90) * P.stones.length)]!;
      const a = (i / n) * s + lw;
      const b = s / n - lw * 2;
      if (vertical) g.fillRect(x + a, y + lw, b, s - lw * 2);
      else g.fillRect(x + lw, y + a, s - lw * 2, b);
      g.fillStyle = "rgba(40, 24, 10, 0.55)";
      const nail = Math.max(0.8, s * 0.035);
      if (vertical) {
        g.fillRect(x + a + b / 2 - nail / 2, y + s * 0.12, nail, nail);
        g.fillRect(x + a + b / 2 - nail / 2, y + s * 0.84, nail, nail);
      } else {
        g.fillRect(x + s * 0.12, y + a + b / 2 - nail / 2, nail, nail);
        g.fillRect(x + s * 0.84, y + a + b / 2 - nail / 2, nail, nail);
      }
    }
    return;
  }
  const n = P.pathStyle === "flag" ? 2 : 3;
  const cell = s / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      const jx = (hash(c, r, k + 100) - 0.5) * cell * 0.18;
      const jy = (hash(c, r, k + 110) - 0.5) * cell * 0.18;
      const sx = x + j * cell + cell * 0.08 + jx;
      const sy = y + i * cell + cell * 0.08 + jy;
      const sw = cell * 0.84;
      g.fillStyle = P.stones[Math.floor(hash(c, r, k + 120) * P.stones.length)]!;
      g.beginPath();
      g.roundRect(sx, sy, sw, sw, cell * (P.pathStyle === "flag" ? 0.12 : 0.32));
      g.fill();
      g.strokeStyle = "rgba(255, 255, 255, 0.18)";
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(sx + sw * 0.2, sy + lw * 1.5);
      g.lineTo(sx + sw * 0.8, sy + lw * 1.5);
      g.stroke();
    }
  }
  if (P.pathStyle === "flag") {
    // A faint ember glow between the stones of the Peaks.
    g.strokeStyle = alpha(P.ember, 0.22);
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(x + s / 2, y);
    g.lineTo(x + s / 2, y + s);
    g.moveTo(x, y + s / 2);
    g.lineTo(x + s, y + s / 2);
    g.stroke();
  }
}

function edges(g: Ctx, ground: Terrain[][], c: number, r: number, s: number, P: Palette) {
  const t = ground[r]![c]!;
  const x = c * s;
  const y = r * s;
  DIRS.forEach(([dc, dr], d) => {
    const n = ground[r + dr]?.[c + dc];
    if (!n || n === t) return;
    // The shared edge, from one end to the other.
    const ex0 = x + (dc > 0 ? s : 0);
    const ey0 = y + (dr > 0 ? s : 0);
    const ex1 = dc ? ex0 : ex0 + s;
    const ey1 = dr ? ey0 : ey0 + s;
    if (t === "water") {
      // Foam just off the shore, a little wavy.
      g.strokeStyle = alpha(P.foam, 0.7);
      g.lineWidth = Math.max(0.7, s * 0.045);
      g.beginPath();
      const inset = s * 0.08;
      const ix = -dc * inset;
      const iy = -dr * inset;
      g.moveTo(ex0 + ix, ey0 + iy);
      for (let i = 1; i <= 4; i++) {
        const f = i / 4;
        const wob = (i % 2 ? 1 : -1) * s * 0.035;
        g.lineTo(
          ex0 + (ex1 - ex0) * f + ix + (dr ? 0 : wob),
          ey0 + (ey1 - ey0) * f + iy + (dc ? 0 : wob),
        );
      }
      g.stroke();
      return;
    }
    if (t === "lava") {
      g.strokeStyle = alpha(P.crust, 0.9);
      g.lineWidth = s * 0.14;
      g.beginPath();
      g.moveTo(ex0, ey0);
      g.lineTo(ex1, ey1);
      g.stroke();
      return;
    }
    if (t === "void" && n !== "water" && n !== "lava") {
      g.strokeStyle = alpha(P.voidGlow, 0.55);
      g.lineWidth = Math.max(0.8, s * 0.06);
      g.beginPath();
      g.moveTo(ex0 - dc * s * 0.05, ey0 - dr * s * 0.05);
      g.lineTo(ex1 - dc * s * 0.05, ey1 - dr * s * 0.05);
      g.stroke();
    }
    const mine = PRIORITY[t] ?? 0;
    const theirs = PRIORITY[n] ?? -1;
    if (mine <= theirs || n === "water" || n === "lava") return;
    // Round bumps of this ground over the neighbour's, so edges look grown, not tiled.
    g.fillStyle = baseOf(t, P);
    for (let i = 0; i < 3; i++) {
      const f = 0.2 + i * 0.3 + (hash(c, r, d * 3 + i + 140) - 0.5) * 0.12;
      const bx = ex0 + (ex1 - ex0) * f;
      const by = ey0 + (ey1 - ey0) * f;
      g.beginPath();
      g.arc(bx, by, s * (0.1 + hash(c, r, d * 3 + i + 150) * 0.08), 0, Math.PI * 2);
      g.fill();
    }
  });
}

function details(g: Ctx, t: Terrain, c: number, r: number, s: number, P: Palette, lw: number) {
  const x = c * s;
  const y = r * s;
  const h = hash(c, r, 200);
  if (t === "grass" || t === "flowers") {
    // Tufts of blades.
    g.strokeStyle = P.blade;
    g.lineWidth = lw;
    g.lineCap = "round";
    const tufts = t === "flowers" ? 1 : 3;
    for (let i = 0; i < tufts; i++) {
      const tx = x + s * (0.15 + hash(c, r, i + 210) * 0.7);
      const ty = y + s * (0.25 + hash(c, r, i + 220) * 0.65);
      g.beginPath();
      for (const a of [-0.5, -0.15, 0.25]) {
        g.moveTo(tx, ty);
        g.quadraticCurveTo(
          tx + a * s * 0.08,
          ty - s * 0.08,
          tx + a * s * 0.18,
          ty - s * (0.14 + Math.abs(a) * 0.04),
        );
      }
      g.stroke();
    }
    if (t === "grass" && h < 0.12) {
      // A pebble, or a tiny mushroom.
      if (h < 0.06) {
        g.fillStyle = "#c7c2b8";
        g.beginPath();
        g.ellipse(x + s * 0.7, y + s * 0.7, s * 0.06, s * 0.04, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = "#f2e6d0";
        g.fillRect(x + s * 0.64, y + s * 0.62, s * 0.03, s * 0.08);
        g.fillStyle = "#e0503a";
        g.beginPath();
        g.arc(x + s * 0.655, y + s * 0.62, s * 0.06, Math.PI, 0);
        g.fill();
      }
    }
    if (t === "flowers") {
      const colors = ["#ff9ecf", "#ffd36b", "#c4a3ff", "#ff7a6b", "#ffffff", "#7ad7ff"];
      for (let i = 0; i < 5; i++) {
        const fx = x + s * (0.14 + hash(c, r, i + 230) * 0.72);
        const fy = y + s * (0.14 + hash(c, r, i + 240) * 0.72);
        const pr = s * 0.045;
        g.fillStyle = "#2f7a34";
        g.beginPath();
        g.ellipse(fx + pr, fy + pr * 1.6, pr * 1.3, pr * 0.6, 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = colors[Math.floor(hash(c, r, i + 250) * colors.length)]!;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2 + h;
          g.beginPath();
          g.arc(fx + Math.cos(a) * pr, fy + Math.sin(a) * pr, pr * 0.85, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#ffe066";
        g.beginPath();
        g.arc(fx, fy, pr * 0.7, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (t === "sand" && h < 0.18) {
    if (h < 0.08) {
      // A starfish.
      g.fillStyle = "#ff8a5c";
      const cx = x + s * 0.68;
      const cy = y + s * 0.62;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 ? s * 0.04 : s * 0.1;
        if (i) g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        else g.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      g.closePath();
      g.fill();
    } else {
      // A shell.
      g.fillStyle = "#fff1e0";
      g.beginPath();
      g.arc(x + s * 0.3, y + s * 0.75, s * 0.07, Math.PI, 0);
      g.fill();
      g.strokeStyle = "rgba(180, 140, 110, 0.8)";
      g.lineWidth = Math.max(0.4, s * 0.015);
      g.beginPath();
      for (const a of [-0.6, 0, 0.6]) {
        g.moveTo(x + s * 0.3, y + s * 0.75);
        g.lineTo(x + s * 0.3 + Math.sin(a) * s * 0.06, y + s * 0.75 - Math.cos(a) * s * 0.06);
      }
      g.stroke();
    }
  } else if (t === "ash" && h < 0.35) {
    // Embers, and charred stones.
    g.fillStyle = alpha(P.ember, 0.8);
    const e = Math.max(0.8, s * 0.04);
    g.fillRect(x + s * hash(c, r, 260), y + s * hash(c, r, 261), e, e);
    g.fillStyle = "#1a1414";
    g.beginPath();
    g.ellipse(x + s * 0.3, y + s * 0.7, s * 0.08, s * 0.05, 0.3, 0, Math.PI * 2);
    g.fill();
  }
}

/** A soft dark oval under something that stands up. */
function shadow(g: Ctx, x: number, y: number, rx: number, ry: number, a = 0.35) {
  g.fillStyle = `rgba(0, 0, 0, ${a})`;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function tree(g: Ctx, c: number, r: number, s: number, P: Palette, lw: number) {
  const x = c * s + s / 2 + (hash(c, r, 300) - 0.5) * s * 0.12;
  const y = r * s + s;
  const h = hash(c, r, 301);
  shadow(g, x + s * 0.12, y - s * 0.1, s * 0.42, s * 0.14);
  if (P.tree === "palm") {
    // A leaning trunk in rings, fronds, and coconuts.
    const lean = (h - 0.5) * s * 0.5;
    const top: Spot = [x + lean, y - s * 0.95];
    g.strokeStyle = P.trunk;
    g.lineWidth = s * 0.11;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x, y - s * 0.1);
    g.quadraticCurveTo(x + lean * 0.2, y - s * 0.55, top[0], top[1]);
    g.stroke();
    g.strokeStyle = shade(P.trunk, -0.35);
    g.lineWidth = lw;
    for (let i = 1; i < 5; i++) {
      const f = i / 5;
      const px = x + (top[0] - x) * f * f;
      const py = y - s * 0.1 + (top[1] - y + s * 0.1) * f;
      g.beginPath();
      g.moveTo(px - s * 0.055, py);
      g.lineTo(px + s * 0.055, py - s * 0.02);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.55 + (h - 0.5) * 0.3;
      const len = s * (0.5 + hash(c, r, i + 310) * 0.12);
      const ex = top[0] + Math.cos(a) * len;
      const ey = top[1] + Math.sin(a) * len * 0.6 + s * 0.22;
      const mx = top[0] + Math.cos(a) * len * 0.5;
      const my = top[1] + Math.sin(a) * len * 0.5 - s * 0.08;
      g.fillStyle = P.leaves[i % P.leaves.length]!;
      g.beginPath();
      g.moveTo(top[0], top[1]);
      g.quadraticCurveTo(mx - s * 0.06, my - s * 0.06, ex, ey);
      g.quadraticCurveTo(mx + s * 0.06, my + s * 0.08, top[0], top[1]);
      g.fill();
      g.strokeStyle = alpha(shade(P.leaves[0]!, -0.3), 0.8);
      g.lineWidth = lw * 0.8;
      g.beginPath();
      g.moveTo(top[0], top[1]);
      g.quadraticCurveTo(mx, my, ex, ey);
      g.stroke();
    }
    g.fillStyle = "#5a3a1a";
    for (const dx of [-0.06, 0.05]) {
      g.beginPath();
      g.arc(top[0] + dx * s, top[1] + s * 0.06, s * 0.055, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  if (h < 0.3) {
    // A pine: dark layered tiers.
    g.fillStyle = P.trunk;
    g.fillRect(x - s * 0.05, y - s * 0.3, s * 0.1, s * 0.25);
    for (let i = 0; i < 3; i++) {
      const ty = y - s * (0.25 + i * 0.25);
      const tw = s * (0.42 - i * 0.1);
      g.fillStyle = i % 2 ? P.leaves[0]! : P.leaves[1]!;
      g.beginPath();
      g.moveTo(x - tw, ty);
      g.lineTo(x, ty - s * 0.42);
      g.lineTo(x + tw, ty);
      g.closePath();
      g.fill();
      g.fillStyle = alpha(P.leaves[2]!, 0.55);
      g.beginPath();
      g.moveTo(x - tw * 0.8, ty - s * 0.02);
      g.lineTo(x, ty - s * 0.4);
      g.lineTo(x - tw * 0.1, ty - s * 0.02);
      g.closePath();
      g.fill();
    }
    return;
  }
  // A round oak: trunk, then clumps of leaves from dark to light, and a sunlit top.
  g.fillStyle = P.trunk;
  g.beginPath();
  g.moveTo(x - s * 0.08, y - s * 0.08);
  g.lineTo(x - s * 0.04, y - s * 0.45);
  g.lineTo(x + s * 0.04, y - s * 0.45);
  g.lineTo(x + s * 0.08, y - s * 0.08);
  g.closePath();
  g.fill();
  const clumps: [number, number, number, number][] = [
    [-0.2, -0.5, 0.26, 0],
    [0.2, -0.52, 0.26, 0],
    [0, -0.7, 0.3, 1],
    [-0.1, -0.58, 0.22, 1],
    [0.12, -0.66, 0.2, 2],
    [-0.08, -0.78, 0.16, 2],
  ];
  for (const [dx, dy, rr, tone] of clumps) {
    g.fillStyle = P.leaves[tone]!;
    g.beginPath();
    g.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
    g.fill();
  }
  if (h > 0.75) {
    // Some trees bear fruit or blossom.
    g.fillStyle = h > 0.88 ? "#ffb3d1" : "#ff5a4a";
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(
        x + (hash(c, r, i + 320) - 0.5) * s * 0.5,
        y - s * (0.5 + hash(c, r, i + 330) * 0.3),
        s * 0.035,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  }
}

function mountain(
  g: Ctx,
  c: number,
  r: number,
  s: number,
  P: Palette,
  lw: number,
  region: CourtRegionKey,
) {
  const x = c * s;
  const y = r * s + s;
  const h = hash(c, r, 400);
  const peak: Spot = [x + s * (0.4 + h * 0.2), y - s * (1.05 + hash(c, r, 401) * 0.3)];
  const left = x - s * 0.12;
  const right = x + s * 1.12;
  shadow(g, x + s * 0.6, y - s * 0.06, s * 0.6, s * 0.14, 0.3);
  // The lit face, then the shaded one.
  g.fillStyle = P.rock;
  g.beginPath();
  g.moveTo(left, y);
  g.lineTo(peak[0], peak[1]);
  g.lineTo(right, y);
  g.closePath();
  g.fill();
  g.fillStyle = P.rockDark;
  g.beginPath();
  g.moveTo(peak[0], peak[1]);
  g.lineTo(right, y);
  g.lineTo(peak[0] + s * 0.1, y);
  g.closePath();
  g.fill();
  g.fillStyle = alpha(P.rockLight, 0.7);
  g.beginPath();
  g.moveTo(peak[0], peak[1]);
  g.lineTo(left + s * 0.2, y - s * 0.15);
  g.lineTo(peak[0] - s * 0.08, y - s * 0.4);
  g.closePath();
  g.fill();
  // Ridges.
  g.strokeStyle = alpha(P.rockDark, 0.8);
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(peak[0] - s * 0.05, peak[1] + s * 0.3);
  g.lineTo(peak[0] - s * 0.18, y - s * 0.2);
  g.moveTo(peak[0] + s * 0.14, peak[1] + s * 0.4);
  g.lineTo(peak[0] + s * 0.3, y - s * 0.1);
  g.stroke();
  // A cap: snow in the Realm, moss on the Isles, ash in the Peaks.
  const capH = s * 0.32;
  const f = capH / (y - peak[1]);
  g.fillStyle = P.cap;
  g.beginPath();
  g.moveTo(peak[0], peak[1]);
  g.lineTo(peak[0] + (right - peak[0]) * f, peak[1] + capH);
  g.lineTo(peak[0] + s * 0.06, peak[1] + capH * 0.75);
  g.lineTo(peak[0] - s * 0.04, peak[1] + capH * 1.05);
  g.lineTo(peak[0] + (left - peak[0]) * f, peak[1] + capH);
  g.closePath();
  g.fill();
  if (region === "peaks" && h > 0.6) {
    // A glowing seam of lava down the side.
    g.strokeStyle = alpha(P.ember, 0.85);
    g.lineWidth = Math.max(0.8, s * 0.05);
    g.beginPath();
    g.moveTo(peak[0] + s * 0.02, peak[1] + capH);
    g.lineTo(peak[0] + s * 0.12, y - s * 0.45);
    g.lineTo(peak[0] + s * 0.05, y - s * 0.1);
    g.stroke();
  }
}

/** A name on a plaque, as large as fits the width given. */
function plaque(
  g: Ctx,
  name: string,
  color: string,
  cx: number,
  cy: number,
  maxW: number,
  s: number,
  font: string,
  mapW: number,
) {
  // One line if it reads at a fair size; else two, split between words.
  const fit = (lines: string[], min: number) => {
    let size = Math.min(s * 0.36, 15);
    const widest = () => Math.max(...lines.map((l) => g.measureText(l).width));
    g.font = `700 ${size}px ${font}`;
    while (size > min && widest() > maxW - 8) {
      size -= 0.5;
      g.font = `700 ${size}px ${font}`;
    }
    return { size, ok: widest() <= maxW - 8 };
  };
  let lines = [name];
  let { size } = fit(lines, Math.max(6, s * 0.26));
  const words = name.split(" ");
  if (g.measureText(name).width > maxW - 8 && words.length > 1) {
    let best = 1;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ").length;
      const b = words.slice(i).join(" ").length;
      const bestA = words.slice(0, best).join(" ").length;
      const bestB = words.slice(best).join(" ").length;
      if (Math.max(a, b) < Math.max(bestA, bestB)) best = i;
    }
    lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
    size = fit(lines, 5).size;
  }
  const tw = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width)) + 10);
  const lh = size * 1.1;
  const th = lh * lines.length + 5;
  const x = Math.min(mapW - tw / 2 - 1, Math.max(tw / 2 + 1, cx));
  g.fillStyle = "rgba(14, 6, 26, 0.92)";
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  g.roundRect(x - tw / 2, cy - th / 2, tw, th, Math.min(th, 20) * 0.3);
  g.fill();
  g.stroke();
  g.strokeStyle = alpha("#e8c872", 0.5);
  g.lineWidth = Math.max(0.5, s * 0.02);
  g.beginPath();
  g.roundRect(x - tw / 2 + 2, cy - th / 2 + 2, tw - 4, th - 4, Math.min(th, 20) * 0.25);
  g.stroke();
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, x, cy - (lh * (lines.length - 1)) / 2 + i * lh + 0.5));
}

/** A sign on a post above an open-air place, kept on the map. */
function sign(
  g: Ctx,
  name: string,
  color: string,
  cx: number,
  cy: number,
  s: number,
  mapW: number,
  font: string,
) {
  const size = Math.max(7, Math.min(13, s * 0.3));
  g.font = `700 ${size}px ${font}`;
  const tw = g.measureText(name).width + 10;
  const x = Math.min(mapW - tw / 2, Math.max(tw / 2, cx));
  const th = size + 6;
  g.fillStyle = "#3a2616";
  g.fillRect(cx - s * 0.03, cy, s * 0.06, s * 0.2);
  g.fillStyle = "rgba(20, 10, 30, 0.9)";
  g.strokeStyle = alpha(color, 0.9);
  g.lineWidth = Math.max(1, s * 0.04);
  g.beginPath();
  g.roundRect(x - tw / 2, cy - th / 2, tw, th, 3);
  g.fill();
  g.stroke();
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(name, x, cy + 0.5);
}

/** A glowing window: frame, light and a cross of bars. */
function windowAt(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  light: string,
  frame: string,
  arched: boolean,
  lw: number,
) {
  addLight(x + w / 2, y + h / 2, Math.max(w, h) * 2.4, light0(light));
  const glow = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 1.4);
  glow.addColorStop(0, alpha(light, 0.45));
  glow.addColorStop(1, alpha(light, 0));
  g.fillStyle = glow;
  g.fillRect(x - w, y - h * 0.6, w * 3, h * 2.2);
  g.fillStyle = frame;
  g.beginPath();
  if (arched) g.roundRect(x - lw, y - lw, w + lw * 2, h + lw * 2, [w / 2 + lw, w / 2 + lw, lw, lw]);
  else g.rect(x - lw, y - lw, w + lw * 2, h + lw * 2);
  g.fill();
  const pane = g.createLinearGradient(x, y, x, y + h);
  pane.addColorStop(0, shade(light, 0.4));
  pane.addColorStop(1, light);
  g.fillStyle = pane;
  g.beginPath();
  if (arched) g.roundRect(x, y, w, h, [w / 2, w / 2, 0, 0]);
  else g.rect(x, y, w, h);
  g.fill();
  g.strokeStyle = frame;
  g.lineWidth = lw * 0.8;
  g.beginPath();
  g.moveTo(x + w / 2, y);
  g.lineTo(x + w / 2, y + h);
  g.moveTo(x, y + h * 0.55);
  g.lineTo(x + w, y + h * 0.55);
  g.stroke();
}

/** An arched door: dark wood, planks, a frame and a ring. */
function doorAt(
  g: Ctx,
  cx: number,
  bottom: number,
  w: number,
  h: number,
  frame: string,
  lw: number,
  inner = "#3a2214",
) {
  addLight(cx, bottom - h * 0.45, w * 2.6, inner === "#3a2214" ? "#ffb35c" : inner);
  g.fillStyle = frame;
  g.beginPath();
  g.roundRect(cx - w / 2 - lw * 1.5, bottom - h - lw * 1.5, w + lw * 3, h + lw * 1.5, [
    w / 2 + lw,
    w / 2 + lw,
    0,
    0,
  ]);
  g.fill();
  g.fillStyle = inner;
  g.beginPath();
  g.roundRect(cx - w / 2, bottom - h, w, h, [w / 2, w / 2, 0, 0]);
  g.fill();
  g.strokeStyle = "rgba(0, 0, 0, 0.45)";
  g.lineWidth = lw * 0.7;
  g.beginPath();
  for (const f of [0.33, 0.66]) {
    g.moveTo(cx - w / 2 + w * f, bottom - h + w * 0.2);
    g.lineTo(cx - w / 2 + w * f, bottom);
  }
  g.stroke();
  g.fillStyle = "#e8c872";
  g.beginPath();
  g.arc(cx + w * 0.22, bottom - h * 0.42, Math.max(0.6, w * 0.07), 0, Math.PI * 2);
  g.fill();
}

/** Brick courses across a wall. */
function bricks(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  color: string,
  lw: number,
) {
  g.strokeStyle = color;
  g.lineWidth = lw * 0.7;
  g.beginPath();
  const row = s * 0.17;
  let i = 0;
  for (let yy = y + row; yy < y + h; yy += row, i++) {
    g.moveTo(x, yy);
    g.lineTo(x + w, yy);
    for (let xx = x + (i % 2 ? s * 0.15 : 0); xx < x + w; xx += s * 0.3) {
      g.moveTo(xx, yy - row);
      g.lineTo(xx, yy);
    }
  }
  g.stroke();
}

function building(
  g: Ctx,
  place: CourtPlaceKey,
  box: Box,
  side: "bottom" | "left" | "right" | "top",
  door: Spot | undefined,
  s: number,
  P: Palette,
  o: WorldOptions,
  lw: number,
) {
  const x = box.c0 * s;
  const y = box.r0 * s;
  const w = (box.c1 - box.c0 + 1) * s;
  const h = (box.r1 - box.r0 + 1) * s;
  const color = o.colorOf(place);
  const name = o.label(place);
  const style = BUILDING_STYLE[place] ?? "house";
  // Where the door is drawn on the front: at the door's column, or near the side it's on.
  const doorX =
    side === "bottom" || side === "top"
      ? ((door?.[0] ?? box.c0) + 0.5) * s
      : side === "left"
        ? x + s * 0.45
        : x + w - s * 0.45;
  const rise = Math.min(s * HEADROOM, y + s * HEADROOM);
  shadow(g, x + w / 2 + s * 0.12, y + h - s * 0.04, w * 0.56, s * 0.24);
  if (style === "castle") castle(g, x, y, w, h, s, P, color, doorX, rise, lw);
  else if (style === "dome") dome(g, x, y, w, h, s, P, color, doorX, lw, place);
  else if (style === "market") market(g, x, y, w, h, s, color, lw);
  else if (style === "cave") cave(g, x, y, w, h, s, P, color, side, doorX, lw, place);
  else if (style === "tower") tower(g, x, y, w, h, s, P, color, rise, lw, place);
  else if (style === "arena") arena(g, x, y, w, h, s, P, color, lw);
  else if (style === "pool") pool(g, x, y, w, h, s, P, color, lw);
  else house(g, x, y, w, h, s, P, color, doorX, lw, style === "forge");
  // The name: on the wall's top for buildings with a roof, lower for the rest.
  const at =
    style === "house" || style === "forge" || style === "dome"
      ? y + h * 0.48
      : style === "castle"
        ? y + h * 0.5
        : style === "tower"
          ? y + h * 0.82
          : style === "market"
            ? y + h * 0.22
            : y + h * 0.84;
  plaque(g, name, color, x + w / 2, at, Math.max(w - s * 0.2, s * 3), s, o.font, o.mapW);
}

function house(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  P: Palette,
  color: string,
  doorX: number,
  lw: number,
  forge: boolean,
) {
  const wallTop = y + h * 0.42;
  const wx = x + s * 0.1;
  const ww = w - s * 0.2;
  const wb = y + h - s * 0.04;
  // Chimney behind the roof.
  const chX = x + w * (forge ? 0.8 : 0.78);
  g.fillStyle = forge ? "#2a2222" : shade(P.wallDark, -0.2);
  g.fillRect(
    chX - s * (forge ? 0.16 : 0.1),
    y - s * (forge ? 0.45 : 0.3),
    s * (forge ? 0.32 : 0.2),
    s * 0.6,
  );
  g.fillStyle = forge ? "#1a1414" : shade(P.wallDark, -0.4);
  g.fillRect(
    chX - s * (forge ? 0.2 : 0.13),
    y - s * (forge ? 0.5 : 0.34),
    s * (forge ? 0.4 : 0.26),
    s * 0.08,
  );
  if (forge) {
    const fire = g.createRadialGradient(chX, y - s * 0.48, 0, chX, y - s * 0.48, s * 0.35);
    fire.addColorStop(0, "rgba(255, 190, 80, 0.9)");
    fire.addColorStop(1, "rgba(255, 90, 30, 0)");
    g.fillStyle = fire;
    g.fillRect(chX - s * 0.4, y - s * 0.85, s * 0.8, s * 0.7);
  }
  // Walls.
  const wall = g.createLinearGradient(0, wallTop, 0, wb);
  wall.addColorStop(0, P.wall);
  wall.addColorStop(1, P.wallDark);
  g.fillStyle = wall;
  g.fillRect(wx, wallTop, ww, wb - wallTop);
  if (forge || P.pathStyle === "flag")
    bricks(g, wx, wallTop, ww, wb - wallTop, s, "rgba(0, 0, 0, 0.35)", lw);
  else {
    // Timber framing.
    g.strokeStyle = P.trim;
    g.lineWidth = Math.max(1, s * 0.06);
    g.beginPath();
    g.moveTo(wx, wallTop + (wb - wallTop) * 0.12);
    g.lineTo(wx + ww, wallTop + (wb - wallTop) * 0.12);
    for (let bx = wx; bx <= wx + ww + 0.1; bx += ww / Math.max(2, Math.round(ww / (s * 0.9)))) {
      g.moveTo(bx, wallTop);
      g.lineTo(bx, wb);
    }
    g.stroke();
  }
  // Windows on either side of the door.
  const n = Math.max(2, Math.floor(ww / (s * 0.75)));
  const winW = s * 0.24;
  const winH = s * 0.3;
  for (let i = 0; i < n; i++) {
    const cx = wx + (ww / n) * (i + 0.5);
    if (Math.abs(cx - doorX) < s * 0.45) continue;
    windowAt(
      g,
      cx - winW / 2,
      wallTop + (wb - wallTop) * 0.5 - winH / 2,
      winW,
      winH,
      forge ? "#ff9a3d" : P.window,
      P.trim,
      false,
      lw,
    );
  }
  if (forge) {
    // The furnace mouth for a door.
    const glow = g.createRadialGradient(doorX, wb - s * 0.2, 0, doorX, wb - s * 0.2, s * 0.7);
    glow.addColorStop(0, "rgba(255, 200, 90, 0.85)");
    glow.addColorStop(1, "rgba(255, 80, 20, 0)");
    g.fillStyle = glow;
    g.fillRect(doorX - s * 0.8, wb - s * 0.9, s * 1.6, s);
    doorAt(g, doorX, wb, s * 0.42, s * 0.42, "#2a2222", lw, "#ff8a2a");
  } else doorAt(g, doorX, wb, s * 0.32, s * 0.42, P.trim, lw);
  // The roof: tiles in the place's colour, a ridge, and eaves over the walls.
  const roofTop = y - s * 0.16;
  const eave = wallTop + s * 0.08;
  const roof = g.createLinearGradient(0, roofTop, 0, eave);
  roof.addColorStop(0, shade(color, forge ? -0.6 : -0.15));
  roof.addColorStop(1, shade(color, forge ? -0.8 : -0.55));
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(x - s * 0.04, eave);
  g.lineTo(x + s * 0.3, roofTop);
  g.lineTo(x + w - s * 0.3, roofTop);
  g.lineTo(x + w + s * 0.04, eave);
  g.closePath();
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = "rgba(0, 0, 0, 0.3)";
  g.lineWidth = lw * 0.8;
  g.beginPath();
  let i = 0;
  for (let ty = roofTop + s * 0.14; ty < eave; ty += s * 0.14, i++) {
    g.moveTo(x - s, ty);
    g.lineTo(x + w + s, ty);
    for (let tx = x + (i % 2 ? s * 0.09 : 0); tx < x + w; tx += s * 0.18) {
      g.moveTo(tx, ty - s * 0.14);
      g.lineTo(tx, ty);
    }
  }
  g.stroke();
  g.restore();
  g.strokeStyle = forge ? alpha(P.ember, 0.8) : shade(color, 0.35);
  g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  g.moveTo(x + s * 0.3, roofTop);
  g.lineTo(x + w - s * 0.3, roofTop);
  g.stroke();
  g.strokeStyle = "rgba(0, 0, 0, 0.45)";
  g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  g.moveTo(x - s * 0.04, eave);
  g.lineTo(x + w + s * 0.04, eave);
  g.stroke();
}

function castle(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  P: Palette,
  color: string,
  doorX: number,
  rise: number,
  lw: number,
) {
  const stone = shade(P.wall, -0.05);
  const stoneDark = shade(P.wallDark, -0.15);
  // The keep behind: a tall hall with a steep roof and lit windows.
  const kx = x + w * 0.28;
  const kw = w * 0.44;
  const kTop = y + s * 0.15;
  g.fillStyle = stoneDark;
  g.fillRect(kx, kTop, kw, h * 0.5);
  bricks(g, kx, kTop, kw, h * 0.5, s, "rgba(0, 0, 0, 0.25)", lw);
  g.fillStyle = shade(color, -0.35);
  g.beginPath();
  g.moveTo(kx - s * 0.1, kTop + s * 0.05);
  g.lineTo(kx + kw / 2, y - rise * 0.7);
  g.lineTo(kx + kw + s * 0.1, kTop + s * 0.05);
  g.closePath();
  g.fill();
  g.strokeStyle = shade(color, 0.3);
  g.lineWidth = lw;
  g.stroke();
  for (let i = 0; i < 3; i++)
    windowAt(
      g,
      kx + kw * (0.2 + i * 0.25),
      kTop + s * 0.25,
      s * 0.16,
      s * 0.26,
      "#e6c8ff",
      stoneDark,
      true,
      lw,
    );
  // The curtain wall, with battlements.
  const wTop = y + h * 0.42;
  const wall = g.createLinearGradient(0, wTop, 0, y + h);
  wall.addColorStop(0, stone);
  wall.addColorStop(1, shade(stone, -0.25));
  g.fillStyle = wall;
  g.fillRect(x + s * 0.3, wTop, w - s * 0.6, y + h - wTop - s * 0.04);
  bricks(g, x + s * 0.3, wTop, w - s * 0.6, y + h - wTop - s * 0.04, s, "rgba(0, 0, 0, 0.22)", lw);
  g.fillStyle = stone;
  for (let mx = x + s * 0.3; mx < x + w - s * 0.35; mx += s * 0.28)
    g.fillRect(mx, wTop - s * 0.12, s * 0.16, s * 0.13);
  // Banners either side of the gate.
  for (const bx of [doorX - s * 0.75, doorX + s * 0.55]) {
    if (bx < x + s * 0.4 || bx > x + w - s * 0.6) continue;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(bx, wTop + s * 0.1);
    g.lineTo(bx + s * 0.2, wTop + s * 0.1);
    g.lineTo(bx + s * 0.2, wTop + s * 0.62);
    g.lineTo(bx + s * 0.1, wTop + s * 0.52);
    g.lineTo(bx, wTop + s * 0.62);
    g.closePath();
    g.fill();
    g.fillStyle = "#e8c872";
    g.beginPath();
    g.arc(bx + s * 0.1, wTop + s * 0.28, s * 0.05, 0, Math.PI * 2);
    g.fill();
  }
  // The gate: a glowing arch with a raised portcullis.
  const gw = s * 0.5;
  const gb = y + h - s * 0.04;
  const glow = g.createRadialGradient(doorX, gb - s * 0.25, 0, doorX, gb - s * 0.25, s * 0.6);
  glow.addColorStop(0, alpha(color, 0.7));
  glow.addColorStop(1, alpha(color, 0));
  g.fillStyle = glow;
  g.fillRect(doorX - s * 0.7, gb - s * 0.9, s * 1.4, s * 0.9);
  doorAt(g, doorX, gb, gw, s * 0.55, stoneDark, lw, shade(color, -0.5));
  g.strokeStyle = "rgba(20, 10, 30, 0.8)";
  g.lineWidth = lw;
  g.beginPath();
  for (let i = 1; i < 4; i++) {
    g.moveTo(doorX - gw / 2 + (gw / 4) * i, gb - s * 0.5);
    g.lineTo(doorX - gw / 2 + (gw / 4) * i, gb - s * 0.32);
  }
  g.stroke();
  // Round towers at the corners, with pointed roofs and pennants.
  for (const tx of [x + s * 0.32, x + w - s * 0.32]) {
    const tw = s * 0.62;
    const tTop = y + s * 0.2;
    const body = g.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
    body.addColorStop(0, shade(stone, 0.15));
    body.addColorStop(1, shade(stone, -0.35));
    g.fillStyle = body;
    g.fillRect(tx - tw / 2, tTop, tw, y + h - tTop - s * 0.04);
    bricks(g, tx - tw / 2, tTop, tw, y + h - tTop - s * 0.04, s, "rgba(0, 0, 0, 0.2)", lw);
    windowAt(g, tx - s * 0.06, tTop + s * 0.35, s * 0.12, s * 0.22, "#e6c8ff", stoneDark, true, lw);
    const roofTip = y - rise;
    const roof = g.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
    roof.addColorStop(0, shade(color, 0.1));
    roof.addColorStop(1, shade(color, -0.5));
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(tx - tw / 2 - s * 0.07, tTop + s * 0.04);
    g.lineTo(tx, roofTip + s * 0.08);
    g.lineTo(tx + tw / 2 + s * 0.07, tTop + s * 0.04);
    g.closePath();
    g.fill();
    g.fillStyle = "#e8c872";
    g.beginPath();
    g.arc(tx, roofTip + s * 0.08, Math.max(1, s * 0.04), 0, Math.PI * 2);
    g.fill();
  }
}

function dome(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  P: Palette,
  color: string,
  doorX: number,
  lw: number,
  place: CourtPlaceKey,
) {
  const marble = place === "temple" ? "#e8ecf8" : shade(P.wall, 0.15);
  const hallTop = y + h * 0.4;
  const hb = y + h - s * 0.04;
  // The dome, rising behind the hall, with ribs and a glowing lantern on top.
  const dcx = x + w / 2;
  const drx = w * 0.32;
  const dry = h * 0.48;
  const dg = g.createRadialGradient(
    dcx - drx * 0.35,
    hallTop - dry * 0.6,
    1,
    dcx,
    hallTop,
    drx * 1.2,
  );
  dg.addColorStop(0, shade(color, 0.45));
  dg.addColorStop(0.6, shade(color, -0.1));
  dg.addColorStop(1, shade(color, -0.55));
  g.fillStyle = dg;
  g.beginPath();
  g.ellipse(dcx, hallTop + s * 0.04, drx, dry, 0, Math.PI, 0);
  g.closePath();
  g.fill();
  g.strokeStyle = alpha(shade(color, 0.5), 0.6);
  g.lineWidth = lw;
  g.beginPath();
  for (const f of [-0.6, -0.25, 0.25, 0.6]) {
    g.moveTo(dcx, hallTop + s * 0.04 - dry);
    g.quadraticCurveTo(dcx + drx * f * 1.2, hallTop - dry * 0.5, dcx + drx * f, hallTop + s * 0.04);
  }
  g.stroke();
  const ly = hallTop + s * 0.04 - dry;
  const lantern = g.createRadialGradient(dcx, ly - s * 0.1, 0, dcx, ly - s * 0.1, s * 0.35);
  lantern.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  lantern.addColorStop(0.3, alpha(color, 0.8));
  lantern.addColorStop(1, alpha(color, 0));
  g.fillStyle = lantern;
  g.fillRect(dcx - s * 0.35, ly - s * 0.45, s * 0.7, s * 0.7);
  // The hall: steps, columns and lit windows between them.
  g.fillStyle = shade(marble, -0.12);
  g.fillRect(x + s * 0.05, hallTop, w - s * 0.1, hb - hallTop);
  g.fillStyle = shade(marble, -0.3);
  g.fillRect(x, hb - s * 0.08, w, s * 0.08);
  g.fillStyle = marble;
  g.fillRect(x + s * 0.02, hallTop, w - s * 0.04, s * 0.14);
  const cols = Math.max(4, Math.round(w / (s * 0.45)));
  for (let i = 0; i <= cols; i++) {
    const cx = x + s * 0.12 + ((w - s * 0.24) / cols) * i;
    const col = g.createLinearGradient(cx - s * 0.05, 0, cx + s * 0.05, 0);
    col.addColorStop(0, "#ffffff");
    col.addColorStop(1, shade(marble, -0.3));
    g.fillStyle = col;
    g.fillRect(cx - s * 0.05, hallTop + s * 0.14, s * 0.1, hb - hallTop - s * 0.22);
    g.fillStyle = marble;
    g.fillRect(cx - s * 0.075, hallTop + s * 0.14, s * 0.15, s * 0.04);
    if (i < cols) {
      const mid = cx + (w - s * 0.24) / cols / 2;
      if (Math.abs(mid - doorX) > s * 0.3)
        windowAt(
          g,
          mid - s * 0.06,
          hallTop + s * 0.3,
          s * 0.12,
          s * 0.22,
          place === "temple" ? "#dfe6ff" : "#a8f0ff",
          shade(marble, -0.4),
          true,
          lw * 0.8,
        );
    }
  }
  doorAt(g, doorX, hb - s * 0.08, s * 0.3, s * 0.38, shade(marble, -0.4), lw, shade(color, -0.6));
}

function market(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  color: string,
  lw: number,
) {
  const n = Math.max(2, Math.round(w / (s * 1.3)));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const sx = x + i * sw + s * 0.06;
    const ww = sw - s * 0.12;
    const top = y + h * 0.32;
    const counter = y + h * 0.62;
    // Posts and a counter with goods.
    g.fillStyle = "#5a3a22";
    g.fillRect(sx + s * 0.04, top, s * 0.06, h * 0.64);
    g.fillRect(sx + ww - s * 0.1, top, s * 0.06, h * 0.64);
    g.fillStyle = "#7a5232";
    g.fillRect(sx, counter, ww, y + h - counter - s * 0.04);
    g.strokeStyle = "rgba(0, 0, 0, 0.35)";
    g.lineWidth = lw * 0.7;
    g.beginPath();
    for (let yy = counter + s * 0.12; yy < y + h - s * 0.05; yy += s * 0.12) {
      g.moveTo(sx, yy);
      g.lineTo(sx + ww, yy);
    }
    g.stroke();
    const goods = ["#ff5a4a", "#ffd36b", "#7ad7ff", "#c4a3ff", "#8ae36a", "#ff9ecf"];
    for (let k = 0; k < 6; k++) {
      g.fillStyle = goods[(k + i * 2) % goods.length]!;
      g.beginPath();
      g.arc(sx + ww * (0.15 + k * 0.14), counter - s * 0.05, s * 0.06, 0, Math.PI * 2);
      g.fill();
    }
    // A striped awning with a scalloped edge.
    const stripes = 5;
    for (let k = 0; k < stripes; k++) {
      g.fillStyle = k % 2 ? "#f6ecd6" : i % 2 ? shade(color, -0.2) : color;
      const a = sx - s * 0.06 + ((ww + s * 0.12) / stripes) * k;
      const b = (ww + s * 0.12) / stripes;
      g.beginPath();
      g.moveTo(a + b * 0.15, y + h * 0.08);
      g.lineTo(a + b * 0.85, y + h * 0.08);
      g.lineTo(a + b, top + s * 0.06);
      g.lineTo(a, top + s * 0.06);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(a + b / 2, top + s * 0.06, b / 2, 0, Math.PI);
      g.fill();
    }
  }
}

function cave(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  P: Palette,
  color: string,
  side: string,
  doorX: number,
  lw: number,
  place: CourtPlaceKey,
) {
  // A rocky mound with facets.
  const pts: Spot[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const px = x + f * w;
    const top = y - s * 0.15 + Math.pow(Math.abs(f - 0.5) * 2, 1.6) * h * 0.55;
    pts.push([px, top + (hash(i, 7, 500) - 0.5) * s * 0.18]);
  }
  const mound = g.createLinearGradient(x, y, x + w, y + h);
  mound.addColorStop(0, P.rockLight);
  mound.addColorStop(0.5, P.rock);
  mound.addColorStop(1, P.rockDark);
  g.fillStyle = mound;
  g.beginPath();
  g.moveTo(x - s * 0.05, y + h);
  for (const [px, py] of pts) g.lineTo(px, py);
  g.lineTo(x + w + s * 0.05, y + h);
  g.closePath();
  g.fill();
  g.strokeStyle = alpha(P.rockDark, 0.8);
  g.lineWidth = lw;
  g.beginPath();
  for (let i = 1; i < n; i += 2) {
    const [px, py] = pts[i]!;
    g.moveTo(px, py + s * 0.05);
    g.lineTo(px + (hash(i, 9, 501) - 0.5) * s * 0.4, py + s * 0.5);
  }
  g.stroke();
  // The mouth, glowing deep inside.
  const mx = side === "left" ? x + s * 0.4 : side === "right" ? x + w - s * 0.4 : doorX;
  const mb = y + h - s * 0.04;
  const mw = s * 0.62;
  const mh = s * 0.62;
  const inner = g.createRadialGradient(mx, mb - mh * 0.3, 0, mx, mb - mh * 0.3, mw * 0.7);
  inner.addColorStop(0, alpha(color, 0.9));
  inner.addColorStop(0.5, "rgba(20, 8, 20, 0.95)");
  inner.addColorStop(1, "#080308");
  g.fillStyle = inner;
  g.beginPath();
  g.roundRect(mx - mw / 2, mb - mh, mw, mh, [mw / 2, mw / 2, 0, 0]);
  g.fill();
  if (place === "mine") {
    // Timber props, rails and a lantern; ore glinting in the rock.
    g.strokeStyle = "#7a5232";
    g.lineWidth = Math.max(1.5, s * 0.08);
    g.beginPath();
    g.moveTo(mx - mw / 2, mb);
    g.lineTo(mx - mw / 2, mb - mh * 0.85);
    g.lineTo(mx + mw / 2, mb - mh * 0.85);
    g.lineTo(mx + mw / 2, mb);
    g.stroke();
    g.strokeStyle = "#9a9aa8";
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(mx - s * 0.12, mb - s * 0.2);
    g.lineTo(mx - s * 0.2, mb + s * 0.3);
    g.moveTo(mx + s * 0.12, mb - s * 0.2);
    g.lineTo(mx + s * 0.2, mb + s * 0.3);
    g.stroke();
    const lamp = g.createRadialGradient(
      mx + mw / 2 + s * 0.1,
      mb - mh * 0.7,
      0,
      mx + mw / 2 + s * 0.1,
      mb - mh * 0.7,
      s * 0.3,
    );
    lamp.addColorStop(0, "rgba(255, 220, 120, 0.95)");
    lamp.addColorStop(1, "rgba(255, 160, 60, 0)");
    g.fillStyle = lamp;
    g.fillRect(mx + mw / 2 - s * 0.2, mb - mh - s * 0.1, s * 0.6, s * 0.6);
    for (let i = 0; i < 6; i++) {
      const gx = x + w * (0.12 + hash(i, 3, 510) * 0.76);
      const gy = y + h * (0.15 + hash(i, 4, 511) * 0.4);
      if (Math.abs(gx - mx) < mw * 0.6 && gy > mb - mh) continue;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(gx, gy - s * 0.07);
      g.lineTo(gx + s * 0.05, gy);
      g.lineTo(gx, gy + s * 0.07);
      g.lineTo(gx - s * 0.05, gy);
      g.closePath();
      g.fill();
    }
  } else {
    // Coral and a pool of sea water at the mouth.
    g.fillStyle = alpha(P.shallow, 0.85);
    g.beginPath();
    g.ellipse(mx, mb + s * 0.02, mw * 0.55, s * 0.1, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#ff7a9a";
    g.lineWidth = Math.max(1, s * 0.05);
    g.lineCap = "round";
    for (const [cx, k] of [
      [x + s * 0.2, 0],
      [x + w - s * 0.2, 1],
      [x + w * 0.5 + s * 0.45, 2],
    ] as const) {
      g.strokeStyle = ["#ff7a9a", "#ffb36b", "#c77dff"][k]!;
      const base = y + h - s * 0.06;
      g.beginPath();
      g.moveTo(cx, base);
      g.lineTo(cx, base - s * 0.3);
      g.moveTo(cx, base - s * 0.15);
      g.lineTo(cx - s * 0.12, base - s * 0.32);
      g.moveTo(cx, base - s * 0.2);
      g.lineTo(cx + s * 0.12, base - s * 0.36);
      g.stroke();
    }
  }
}

function tower(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  P: Palette,
  color: string,
  rise: number,
  lw: number,
  place: CourtPlaceKey,
) {
  const dark = place === "sanctum";
  const stone = dark ? "#1c1028" : "#eef0f6";
  const tx = x + w / 2;
  const tw = w * 0.5;
  const top = y + s * 0.05;
  const bottom = y + h - s * 0.04;
  // Low wings either side.
  g.fillStyle = shade(stone, dark ? 0.08 : -0.15);
  g.fillRect(x + s * 0.12, y + h * 0.55, w - s * 0.24, bottom - (y + h * 0.55));
  g.fillStyle = shade(color, -0.4);
  g.fillRect(x + s * 0.08, y + h * 0.5, w - s * 0.16, s * 0.1);
  // The tower, round, banded, with a stack of lit windows.
  const body = g.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
  body.addColorStop(0, shade(stone, dark ? 0.2 : 0));
  body.addColorStop(1, shade(stone, dark ? -0.3 : -0.35));
  g.fillStyle = body;
  g.fillRect(tx - tw / 2, top, tw, bottom - top);
  g.strokeStyle = dark ? alpha(color, 0.5) : "rgba(0, 0, 0, 0.18)";
  g.lineWidth = lw;
  g.beginPath();
  for (let yy = top + s * 0.3; yy < bottom; yy += s * 0.3) {
    g.moveTo(tx - tw / 2, yy);
    g.lineTo(tx + tw / 2, yy);
  }
  g.stroke();
  for (let i = 0; i < 2; i++)
    windowAt(
      g,
      tx - s * 0.07,
      top + s * (0.25 + i * 0.5),
      s * 0.14,
      s * 0.24,
      dark ? color : P.window,
      dark ? "#0a0410" : shade(stone, -0.45),
      true,
      lw,
    );
  if (dark) {
    // Runes glowing up the obsidian.
    g.strokeStyle = alpha(color, 0.9);
    g.lineWidth = lw;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const ry = top + s * (0.2 + i * 0.35);
      const rx = tx + (i % 2 ? tw * 0.3 : -tw * 0.3);
      g.moveTo(rx, ry);
      g.lineTo(rx + s * 0.05, ry + s * 0.08);
      g.lineTo(rx, ry + s * 0.16);
      g.lineTo(rx - s * 0.05, ry + s * 0.08);
      g.closePath();
    }
    g.stroke();
  }
  // A tall cone of a roof and a glowing orb at its tip.
  const tip = y - rise;
  const roof = g.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
  roof.addColorStop(0, shade(color, 0.2));
  roof.addColorStop(1, shade(color, -0.55));
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(tx - tw / 2 - s * 0.1, top + s * 0.05);
  g.lineTo(tx, tip + s * 0.1);
  g.lineTo(tx + tw / 2 + s * 0.1, top + s * 0.05);
  g.closePath();
  g.fill();
  const orb = g.createRadialGradient(tx, tip + s * 0.1, 0, tx, tip + s * 0.1, s * 0.22);
  orb.addColorStop(0, "#ffffff");
  orb.addColorStop(0.35, alpha(color, 0.9));
  orb.addColorStop(1, alpha(color, 0));
  g.fillStyle = orb;
  g.fillRect(tx - s * 0.25, tip - s * 0.15, s * 0.5, s * 0.5);
}

function arena(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  P: Palette,
  color: string,
  lw: number,
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2 - s * 0.04;
  const ry = h / 2 - s * 0.02;
  // The outer wall, a ring of dark arches, then the sand floor.
  const wall = g.createLinearGradient(0, y, 0, y + h);
  wall.addColorStop(0, P.rockLight);
  wall.addColorStop(1, P.rockDark);
  g.fillStyle = wall;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(10, 4, 4, 0.75)";
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * 0.08 + (i / 11) * Math.PI * 0.84;
    const ax = cx + Math.cos(a) * rx * 0.88;
    const ay = cy + Math.sin(a) * ry * 0.82;
    g.beginPath();
    g.roundRect(ax - s * 0.05, ay - s * 0.08, s * 0.1, s * 0.14, [s * 0.05, s * 0.05, 0, 0]);
    g.fill();
  }
  const sand = g.createRadialGradient(cx, cy, 1, cx, cy, rx * 0.7);
  sand.addColorStop(0, "#d8b878");
  sand.addColorStop(1, "#9a7a48");
  g.fillStyle = sand;
  g.beginPath();
  g.ellipse(cx, cy - s * 0.04, rx * 0.66, ry * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  // Crossed blades in the middle, banners on the rim.
  g.strokeStyle = "#e8e8f0";
  g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  g.moveTo(cx - s * 0.2, cy - s * 0.2);
  g.lineTo(cx + s * 0.2, cy + s * 0.12);
  g.moveTo(cx + s * 0.2, cy - s * 0.2);
  g.lineTo(cx - s * 0.2, cy + s * 0.12);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i / 5) * Math.PI;
    const bx = cx + Math.cos(a) * rx * 0.95;
    const by = cy + Math.sin(a) * ry * 0.95;
    g.strokeStyle = "#3a2a20";
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx, by - s * 0.3);
    g.stroke();
    g.fillStyle = i % 2 ? color : "#e8c872";
    g.beginPath();
    g.moveTo(bx, by - s * 0.3);
    g.lineTo(bx + s * 0.18, by - s * 0.24);
    g.lineTo(bx, by - s * 0.18);
    g.closePath();
    g.fill();
  }
}

function pool(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  P: Palette,
  color: string,
  lw: number,
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  // A rim of stones round hot water.
  g.fillStyle = P.rock;
  g.beginPath();
  g.ellipse(cx, cy, w / 2 - s * 0.02, h / 2 - s * 0.06, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.fillStyle = i % 2 ? P.rockLight : shade(P.rock, -0.15);
    g.beginPath();
    g.ellipse(
      cx + Math.cos(a) * (w / 2 - s * 0.14),
      cy + Math.sin(a) * (h / 2 - s * 0.18),
      s * 0.13,
      s * 0.09,
      a,
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  const water = g.createRadialGradient(cx, cy, 1, cx, cy, w * 0.4);
  water.addColorStop(0, "#ffd08a");
  water.addColorStop(0.35, alpha(color, 0.9));
  water.addColorStop(1, "#2aa8b8");
  g.fillStyle = water;
  g.beginPath();
  g.ellipse(cx, cy, w / 2 - s * 0.26, h / 2 - s * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(255, 255, 255, 0.45)";
  g.lineWidth = lw;
  for (const k of [0.35, 0.6]) {
    g.beginPath();
    g.ellipse(cx, cy, (w / 2 - s * 0.26) * k, (h / 2 - s * 0.3) * k, 0, 0, Math.PI * 2);
    g.stroke();
  }
}

/** The open-air places: a fairy ring, a rift, a round door, a yard, and arches to other regions. */
function openPlace(
  g: Ctx,
  place: CourtPlaceKey,
  at: Spot,
  s: number,
  P: Palette,
  o: WorldOptions,
  lw: number,
) {
  const x = at[0] * s;
  const y = at[1] * s;
  const cx = x + s / 2;
  const cy = y + s / 2;
  const color = o.colorOf(place);
  if (CONFIG.court.places[place].gate) {
    // A stone arch, its opening swirling in the colour of where it leads.
    shadow(g, cx, y + s * 0.92, s * 0.45, s * 0.1);
    const portal = g.createRadialGradient(cx, cy, 1, cx, cy, s * 0.4);
    portal.addColorStop(0, "#ffffff");
    portal.addColorStop(0.3, alpha(color, 0.95));
    portal.addColorStop(1, alpha(shade(color, -0.6), 0.9));
    g.fillStyle = portal;
    g.beginPath();
    g.roundRect(cx - s * 0.28, y + s * 0.1, s * 0.56, s * 0.82, [s * 0.28, s * 0.28, 0, 0]);
    g.fill();
    g.strokeStyle = P.rockLight;
    g.lineWidth = s * 0.12;
    g.beginPath();
    g.moveTo(cx - s * 0.34, y + s * 0.95);
    g.lineTo(cx - s * 0.34, y + s * 0.38);
    g.arc(cx, y + s * 0.38, s * 0.34, Math.PI, 0);
    g.lineTo(cx + s * 0.34, y + s * 0.95);
    g.stroke();
    g.strokeStyle = alpha(P.rockDark, 0.8);
    g.lineWidth = lw;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i / 4) * Math.PI;
      g.moveTo(cx + Math.cos(a) * s * 0.28, y + s * 0.38 + Math.sin(a) * s * 0.28);
      g.lineTo(cx + Math.cos(a) * s * 0.4, y + s * 0.38 + Math.sin(a) * s * 0.4);
    }
    g.stroke();
    return;
  }
  if (place === "forest") {
    // A ring of glowing mushrooms.
    const glow = g.createRadialGradient(cx, cy, 1, cx, cy, s * 0.5);
    glow.addColorStop(0, alpha(color, 0.45));
    glow.addColorStop(1, alpha(color, 0));
    g.fillStyle = glow;
    g.fillRect(x - s * 0.1, y - s * 0.1, s * 1.2, s * 1.2);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const mx = cx + Math.cos(a) * s * 0.34;
      const my = cy + Math.sin(a) * s * 0.26;
      g.fillStyle = "#f2e6d0";
      g.fillRect(mx - s * 0.02, my - s * 0.02, s * 0.04, s * 0.08);
      g.fillStyle = i % 2 ? "#7af0ff" : "#c4a3ff";
      g.beginPath();
      g.arc(mx, my - s * 0.01, s * 0.07, Math.PI, 0);
      g.fill();
    }
    return;
  }
  if (place === "void") {
    // A rift: a dark tear with a violet rim.
    const rift = g.createRadialGradient(cx, cy, 1, cx, cy, s * 0.45);
    rift.addColorStop(0, "#000000");
    rift.addColorStop(0.55, "#12002a");
    rift.addColorStop(0.8, alpha(color, 0.9));
    rift.addColorStop(1, alpha(color, 0));
    g.fillStyle = rift;
    g.beginPath();
    g.ellipse(cx, cy, s * 0.26, s * 0.46, 0.2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (place === "shire") {
    // A round green door in a grassy mound.
    g.fillStyle = shade(P.grass, 0.1);
    g.beginPath();
    g.ellipse(cx, y + s * 0.95, s * 0.55, s * 0.6, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = "#6a4a2a";
    g.beginPath();
    g.arc(cx, y + s * 0.7, s * 0.27, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2f8a46";
    g.beginPath();
    g.arc(cx, y + s * 0.7, s * 0.22, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(0, 0, 0, 0.35)";
    g.lineWidth = lw;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      g.moveTo(cx + Math.cos(a) * s * 0.22, y + s * 0.7 + Math.sin(a) * s * 0.22);
      g.lineTo(cx - Math.cos(a) * s * 0.22, y + s * 0.7 - Math.sin(a) * s * 0.22);
    }
    g.stroke();
    g.fillStyle = "#ffd36b";
    g.beginPath();
    g.arc(cx, y + s * 0.7, s * 0.04, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (place === "yard") {
    // A training dummy and a rack of blades.
    shadow(g, cx, y + s * 0.92, s * 0.4, s * 0.09);
    g.fillStyle = "#6a4a2a";
    g.fillRect(cx - s * 0.03, y + s * 0.3, s * 0.06, s * 0.62);
    g.fillRect(cx - s * 0.25, y + s * 0.42, s * 0.5, s * 0.06);
    g.fillStyle = "#d8b878";
    g.beginPath();
    g.ellipse(cx, y + s * 0.52, s * 0.14, s * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(cx, y + s * 0.24, s * 0.1, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, s * 0.04);
    g.beginPath();
    g.arc(cx, y + s * 0.52, s * 0.08, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, y + s * 0.52, s * 0.03, 0, Math.PI * 2);
    g.fill();
    return;
  }
  // Anything else: a circle of runes on the ground.
  g.strokeStyle = alpha(color, 0.8);
  g.lineWidth = Math.max(1, s * 0.04);
  g.beginPath();
  g.ellipse(cx, cy, s * 0.38, s * 0.3, 0, 0, Math.PI * 2);
  g.stroke();
}

// ---- What moves ----

/**
 * Shapes gathered by brightness into four paths, so a frame makes a handful of
 * draw calls instead of one per spark.
 */
class Levels {
  private paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  private used = [false, false, false, false];

  /** The path for a brightness from 0 to 1. */
  at(a: number): Path2D {
    const i = Math.max(0, Math.min(3, Math.floor(a * 4)));
    this.used[i] = true;
    return this.paths[i]!;
  }

  /** Fills or strokes each level in a colour, from faint to full (times most). */
  paint(ctx: Ctx, color: string, how: "fill" | "stroke", most = 1, least = 0) {
    this.paths.forEach((path, i) => {
      if (!this.used[i]) return;
      ctx.globalAlpha = least + ((i + 0.5) / 4) * (most - least);
      if (how === "fill") {
        ctx.fillStyle = color;
        ctx.fill(path);
      } else {
        ctx.strokeStyle = color;
        ctx.stroke(path);
      }
    });
    ctx.globalAlpha = 1;
  }
}

function cross(path: Path2D, x: number, y: number, len: number) {
  path.moveTo(x - len, y);
  path.lineTo(x + len, y);
  path.moveTo(x, y - len);
  path.lineTo(x, y + len);
}

function dot(path: Path2D, x: number, y: number, r: number) {
  path.moveTo(x + r, y);
  path.arc(x, y, r, 0, Math.PI * 2);
}

/**
 * Draws the moving parts over the cached world. t is in seconds. lite keeps
 * only the water and lava moving, for a phone that cannot keep up.
 */
export function drawLive(
  ctx: Ctx,
  scene: Scene,
  ox: number,
  oy: number,
  s: number,
  t: number,
  lite = false,
) {
  const W = scene.cols * s;
  const H = scene.rows * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy - s * HEADROOM, W, H + s * HEADROOM);
  ctx.clip();
  ctx.lineCap = "round";
  // Glints drifting across the water.
  ctx.lineWidth = Math.max(0.8, s * 0.045);
  const glints = new Levels();
  for (const [c, r] of scene.water) {
    const h = hash(c, r, 600);
    for (let k = 0; k < 2; k++) {
      const phase = (t * 0.22 + h + k * 0.5) % 1;
      const px = ox + (c + phase) * s;
      const py = oy + (r + 0.28 + k * 0.42 + Math.sin(t * 1.6 + h * 9) * 0.04) * s;
      const path = glints.at(Math.sin(phase * Math.PI));
      path.moveTo(px - s * 0.12, py);
      path.quadraticCurveTo(px, py - s * 0.05, px + s * 0.12, py);
    }
  }
  glints.paint(ctx, "rgb(225, 248, 255)", "stroke", 0.5);
  // Lava breathing, and bubbles that swell and pop.
  const glow = new Levels();
  const bubbles = new Levels();
  for (const [c, r] of scene.lava) {
    const h = hash(c, r, 610);
    glow.at((1 + Math.sin(t * 2.2 + h * 6.28)) * 0.5).rect(ox + c * s, oy + r * s, s, s);
    const phase = (t * 0.5 + h) % 1;
    if (!lite && phase < 0.3) {
      const bx = ox + (c + 0.25 + hash(c, r, 611) * 0.5) * s;
      const by = oy + (r + 0.25 + hash(c, r, 612) * 0.5) * s;
      dot(bubbles.at(1 - phase / 0.3), bx, by, s * 0.12 * (phase / 0.3));
    }
  }
  glow.paint(ctx, "rgb(255, 200, 80)", "fill", 0.18, 0.08);
  ctx.lineWidth = Math.max(0.6, s * 0.03);
  bubbles.paint(ctx, "rgb(255, 240, 160)", "stroke");
  if (lite) {
    ctx.restore();
    return;
  }
  // Stars twinkling in the void.
  const stars = new Levels();
  for (const [c, r] of scene.void) {
    for (let k = 0; k < 2; k++) {
      const h = hash(c, r, 620 + k);
      const a = Math.max(0, Math.sin(t * (1.5 + h * 2) + h * 40));
      if (a < 0.05) continue;
      cross(
        stars.at(a),
        ox + (c + hash(c, r, 630 + k)) * s,
        oy + (r + hash(c, r, 640 + k)) * s,
        s * 0.09 * a,
      );
    }
  }
  ctx.lineWidth = Math.max(0.6, s * 0.025);
  stars.paint(ctx, "rgb(230, 215, 255)", "stroke");
  // Open-air places: a ring turning, and gates swirling.
  for (const sp of scene.spots) {
    const cx = ox + (sp.at[0] + 0.5) * s;
    const cy = oy + (sp.at[1] + 0.5) * s;
    if (sp.gate) {
      ctx.lineWidth = Math.max(0.8, s * 0.04);
      for (let k = 0; k < 3; k++) {
        const a = t * 2 + (k * Math.PI * 2) / 3;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 - k * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy + s * 0.12, s * (0.08 + k * 0.06), s * (0.16 + k * 0.08), 0, a, a + 2.2);
        ctx.stroke();
      }
      continue;
    }
    ctx.strokeStyle = alpha(sp.color, 0.55 + Math.sin(t * 3) * 0.2);
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.setLineDash([s * 0.12, s * 0.1]);
    ctx.lineDashOffset = -t * s * 0.4;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy + s * 0.08,
      s * (0.44 + Math.sin(t * 3) * 0.03),
      s * 0.32,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Smoke from chimneys, sparks over the forge, steam from the springs.
  const smoke = { smoke: new Levels(), forge: new Levels(), steam: new Levels() };
  const sparks = new Levels();
  for (const sm of scene.smoke) {
    for (let k = 0; k < 4; k++) {
      const phase = (t * (sm.kind === "steam" ? 0.3 : 0.25) + k / 4 + sm.x * 0.13) % 1;
      const px = ox + (sm.x + Math.sin(phase * 5 + k) * 0.12 + phase * 0.25) * s;
      const py = oy + (sm.y - phase * 1.1) * s;
      dot(smoke[sm.kind].at(1 - phase), px, py, s * (0.07 + phase * 0.16));
      if (sm.kind === "forge" && k % 2 === 0) {
        const sz = Math.max(1, s * 0.04);
        sparks.at(1 - phase).rect(px + Math.sin(phase * 13) * s * 0.15, py + s * 0.1, sz, sz);
      }
    }
  }
  smoke.smoke.paint(ctx, "rgb(200, 200, 210)", "fill", 0.32);
  smoke.forge.paint(ctx, "rgb(60, 50, 50)", "fill", 0.4);
  smoke.steam.paint(ctx, "rgb(255, 255, 255)", "fill", 0.35);
  sparks.paint(ctx, "rgb(255, 180, 80)", "fill");
  // Each region's own life: fireflies in the Realm, glitter and gulls on the Isles, embers and ash in the Peaks.
  if (scene.region === "realm") {
    const halo = new Levels();
    const core = new Levels();
    for (let i = 0; i < 22; i++) {
      const home = scene.green[Math.floor(hash(i, 1, 700) * scene.green.length)] ?? [
        hash(i, 2, 701) * scene.cols,
        hash(i, 3, 702) * scene.rows,
      ];
      const fx = ox + (home[0] + 0.5 + Math.sin(t * 0.5 + i) * 0.7) * s;
      const fy = oy + (home[1] + 0.3 + Math.cos(t * 0.37 + i * 1.3) * 0.5) * s;
      const a = Math.max(0, Math.sin(t * 1.8 + i * 2.1));
      if (a < 0.05) continue;
      dot(halo.at(a), fx, fy, s * 0.14);
      dot(core.at(a), fx, fy, Math.max(0.8, s * 0.04));
    }
    halo.paint(ctx, "rgb(255, 245, 150)", "fill", 0.25);
    core.paint(ctx, "rgb(255, 252, 200)", "fill");
  } else if (scene.region === "isles") {
    const glitter = new Levels();
    for (let i = 0; i < 20 && scene.water.length; i++) {
      const [c, r] = scene.water[Math.floor(hash(i, 4, 710) * scene.water.length)]!;
      const a = Math.max(0, Math.sin(t * 2.4 + i * 1.7));
      if (a < 0.1) continue;
      cross(glitter.at(a), ox + (c + 0.5) * s, oy + (r + 0.5) * s, s * 0.12 * a);
    }
    ctx.lineWidth = Math.max(0.6, s * 0.03);
    glitter.paint(ctx, "rgb(255, 255, 255)", "stroke");
    const gulls = new Path2D();
    for (let i = 0; i < 3; i++) {
      const gx = ox + (((t * 0.04 + i * 0.37) % 1.2) - 0.1) * W;
      const gy = oy + (0.15 + i * 0.3 + Math.sin(t * 0.8 + i) * 0.03) * H;
      const flap = Math.sin(t * 8 + i) * s * 0.06;
      gulls.moveTo(gx - s * 0.18, gy - flap);
      gulls.quadraticCurveTo(gx - s * 0.08, gy - s * 0.08, gx, gy);
      gulls.quadraticCurveTo(gx + s * 0.08, gy - s * 0.08, gx + s * 0.18, gy - flap);
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = Math.max(0.8, s * 0.04);
    ctx.stroke(gulls);
  } else {
    const sources = scene.lava.length ? scene.lava : ([[scene.cols / 2, scene.rows / 2]] as Spot[]);
    const hot = new Levels();
    const warm = new Levels();
    const sz = Math.max(1, s * 0.05);
    for (let i = 0; i < 30; i++) {
      const [c, r] = sources[Math.floor(hash(i, 5, 720) * sources.length)]!;
      const phase = (t * (0.25 + hash(i, 6, 721) * 0.2) + hash(i, 7, 722)) % 1;
      const ex = ox + (c + 0.5 + Math.sin(phase * 6 + i) * 0.35) * s;
      const ey = oy + (r + 0.5 - phase * 3) * s;
      (i % 2 ? hot : warm).at(1 - phase).rect(ex, ey, sz, sz);
    }
    hot.paint(ctx, "rgb(255, 180, 70)", "fill");
    warm.paint(ctx, "rgb(255, 106, 61)", "fill");
    const ash = new Path2D();
    const az = Math.max(1, s * 0.035);
    for (let i = 0; i < 16; i++) {
      const ax =
        ox +
        ((hash(i, 8, 730) * scene.cols + Math.sin(t * 0.6 + i) * 0.6 + t * 0.15) % scene.cols) * s;
      const ay = oy + ((hash(i, 9, 731) * scene.rows + t * 0.35) % scene.rows) * s;
      ash.rect(ax, ay, az, az);
    }
    ctx.fillStyle = "rgba(200, 190, 185, 0.5)";
    ctx.fill(ash);
  }
  // Townsfolk on the streets, boats on the sea.
  for (const wk of scene.walkers) {
    const p = walkerAt(wk, t);
    const x = ox + (p.x + 0.5) * s;
    const y = oy + (p.y + 0.5) * s;
    if (wk.kind === "boat") drawBoat(ctx, x, y, s, p.dir, t, wk);
    else drawFolk(ctx, x, y + s * 0.1, s, p.moving ? t : 0, p.dir, wk);
  }
  ctx.restore();
}

/** A small townsperson: legs that step, a tunic, a head and a hat; a lantern in the Peaks. */
function drawFolk(ctx: Ctx, x: number, y: number, s: number, t: number, dir: number, wk: Walker) {
  const step = Math.sin(t * 9 + wk.phase * 10);
  const bob = Math.abs(step) * s * 0.025;
  const u = s * 0.1;
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + u * 2.4, u * 1.6, u * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2a2018";
  ctx.lineWidth = Math.max(0.8, u * 0.5);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - u * 0.4, y + u * 0.8);
  ctx.lineTo(x - u * 0.4 + step * u * 0.5, y + u * 2.2);
  ctx.moveTo(x + u * 0.4, y + u * 0.8);
  ctx.lineTo(x + u * 0.4 - step * u * 0.5, y + u * 2.2);
  ctx.stroke();
  ctx.fillStyle = wk.color;
  ctx.beginPath();
  ctx.moveTo(x - u * 0.8, y - u * 0.6 - bob);
  ctx.lineTo(x + u * 0.8, y - u * 0.6 - bob);
  ctx.lineTo(x + u * 1.05, y + u * 1.1 - bob);
  ctx.lineTo(x - u * 1.05, y + u * 1.1 - bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8c4a0";
  ctx.beginPath();
  ctx.arc(x, y - u * 1.3 - bob, u * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wk.hat;
  ctx.beginPath();
  ctx.arc(x, y - u * 1.5 - bob, u * 0.8, Math.PI, 0);
  ctx.fill();
  if (wk.lantern) {
    const lx = x + dir * u * 1.4;
    const ly = y + u * 0.4 - bob;
    ctx.fillStyle = "rgba(255, 190, 90, 0.35)";
    ctx.beginPath();
    ctx.arc(lx, ly, u * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd27a";
    ctx.fillRect(lx - u * 0.35, ly - u * 0.35, u * 0.7, u * 0.7);
  }
}

/** A little boat with a sail, its wake behind it. */
function drawBoat(ctx: Ctx, x: number, y: number, s: number, dir: number, t: number, wk: Walker) {
  const u = s * 0.1;
  const rock = Math.sin(t * 2 + wk.phase * 6) * u * 0.25;
  ctx.strokeStyle = "rgba(230, 248, 255, 0.55)";
  ctx.lineWidth = Math.max(0.6, u * 0.3);
  ctx.beginPath();
  ctx.moveTo(x - dir * u * 3, y + u * 0.9);
  ctx.lineTo(x - dir * u * 6, y + u * 0.4);
  ctx.moveTo(x - dir * u * 3, y + u * 1.3);
  ctx.lineTo(x - dir * u * 6, y + u * 1.8);
  ctx.stroke();
  ctx.fillStyle = wk.color;
  ctx.beginPath();
  ctx.moveTo(x - u * 3, y + rock);
  ctx.lineTo(x + u * 3, y - rock);
  ctx.lineTo(x + u * 2 * dir, y + u * 1.6);
  ctx.lineTo(x - u * 2 * dir, y + u * 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#3a2414";
  ctx.lineWidth = Math.max(0.6, u * 0.3);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - u * 5);
  ctx.stroke();
  ctx.fillStyle = wk.hat;
  ctx.beginPath();
  ctx.moveTo(x + dir * u * 0.3, y - u * 4.8);
  ctx.quadraticCurveTo(x + dir * u * 3.4, y - u * 2.6, x + dir * u * 0.3, y - u * 0.6);
  ctx.closePath();
  ctx.fill();
}

/** Darkens the map's edges a little, so the middle feels lit. Drawn once, with the still world. */
export function vignette(ctx: Ctx, ox: number, oy: number, w: number, h: number) {
  const cx = ox + w / 2;
  const cy = oy + h / 2;
  const v = ctx.createRadialGradient(
    cx,
    cy,
    Math.min(w, h) * 0.35,
    cx,
    cy,
    Math.hypot(w, h) * 0.55,
  );
  v.addColorStop(0, "rgba(0, 0, 0, 0)");
  v.addColorStop(1, "rgba(0, 0, 0, 0.38)");
  ctx.fillStyle = v;
  ctx.fillRect(ox, oy, w, h);
}
