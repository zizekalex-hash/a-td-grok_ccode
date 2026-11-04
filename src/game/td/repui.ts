/**
 * How the Tower defense rep controls are set up, kept on the device: the batch
 * (reps one tap counts), the phrase, the rep window's place, size and opacity,
 * the tap button's (its own place, size and opacity, shown even with the window
 * closed), and whether tapping the core, or beside the board, counts too. Places
 * are fractions of the room beside the box (0 the left or top edge, 1 the right
 * or bottom), so they hold on any screen. Pure, with relative imports, for the tests.
 */
import { CONFIG } from "../config.ts";

export const REP_UI_KEY = "azshara-td-repui-v1";

export interface RepUi {
  /** The Reps phrase being said ("" for the first). */
  phraseId: string;
  /** Reps one tap counts: one of td.void.batches. */
  batch: number;
  /** The window: its place (fractions), size (scale), opacity, and folded to its top bar. */
  win: { x: number; y: number; scale: number; opacity: number; min: boolean };
  /** The tap button: shown, its place (fractions), size (px) and opacity. */
  tap: { on: boolean; x: number; y: number; size: number; opacity: number };
  /** Tapping the core on the board counts the batch too. */
  coreTap: boolean;
  /** Tapping beside the board (off its cells) counts the batch too. */
  offTap: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function batches(): number[] {
  const list = CONFIG.td.void.batches.filter((n) => Number.isInteger(n) && n >= 1 && n <= 100);
  return list.length ? list : [1];
}

/** The batch nearest n among td.void.batches. */
export function clampBatch(n: number): number {
  const list = batches();
  return list.reduce((best, b) => (Math.abs(b - n) < Math.abs(best - n) ? b : best), list[0]!);
}

export const clampOpacity = (v: number) => clamp(Math.round(v * 100) / 100, 0.15, 1);
export const clampScale = (v: number) => clamp(Math.round(v * 20) / 20, 0.6, 1.6);
export const clampTapSize = (v: number) => clamp(Math.round(v), 44, 160);
export const clampSpot = (v: number) => clamp(Math.round(v * 1000) / 1000, 0, 1);

export function defaultRepUi(): RepUi {
  const list = batches();
  return {
    phraseId: "",
    batch: list.includes(10) ? 10 : list[0]!,
    win: { x: 0.5, y: 0.26, scale: 1, opacity: 0.92, min: false },
    tap: { on: true, x: 1, y: 0.4, size: 72, opacity: 0.85 },
    coreTap: false,
    offTap: false,
  };
}

/** A setup from a save, each value checked. */
export function loadRepUi(data: unknown): RepUi {
  const u = defaultRepUi();
  const d = obj(data);
  if (typeof d.phraseId === "string") u.phraseId = d.phraseId.slice(0, 80);
  u.batch = clampBatch(num(d.batch, u.batch));
  const w = obj(d.win);
  u.win = {
    x: clampSpot(num(w.x, u.win.x)),
    y: clampSpot(num(w.y, u.win.y)),
    scale: clampScale(num(w.scale, u.win.scale)),
    opacity: clampOpacity(num(w.opacity, u.win.opacity)),
    min: typeof w.min === "boolean" ? w.min : u.win.min,
  };
  const t = obj(d.tap);
  u.tap = {
    on: typeof t.on === "boolean" ? t.on : u.tap.on,
    x: clampSpot(num(t.x, u.tap.x)),
    y: clampSpot(num(t.y, u.tap.y)),
    size: clampTapSize(num(t.size, u.tap.size)),
    opacity: clampOpacity(num(t.opacity, u.tap.opacity)),
  };
  if (typeof d.coreTap === "boolean") u.coreTap = d.coreTap;
  if (typeof d.offTap === "boolean") u.offTap = d.offTap;
  return u;
}

export function readRepUi(): RepUi {
  try {
    const raw = localStorage.getItem(REP_UI_KEY);
    return loadRepUi(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultRepUi();
  }
}

export function writeRepUi(u: RepUi) {
  try {
    localStorage.setItem(REP_UI_KEY, JSON.stringify(u));
  } catch {
    /* private mode or full */
  }
}

/** Milliseconds a batch takes. */
export function batchMs(batch: number): number {
  return Math.max(0, CONFIG.td.void.repSeconds) * 1000 * Math.max(1, batch);
}
