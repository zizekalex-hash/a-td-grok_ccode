/**
 * The game's cfg: every number, switch and name in config.json as a "cvar"
 * (path = value), changeable from Options → Advanced. Changes are kept on this
 * device and laid over config.json when the game starts. If a start with them
 * never finishes, the next start leaves them off (safe mode) so a bad value can
 * be fixed. No imports, so config.ts and the tests can load this file directly.
 */

export type CfgValue = number | boolean | string | number[];
export type Overrides = Record<string, CfgValue>;
export type CvarKind = "number" | "boolean" | "string" | "numbers";

export interface Cvar {
  path: string;
  kind: CvarKind;
  value: CfgValue;
  def: CfgValue;
}

export interface CfgStatus {
  /** Changes laid over config.json for this run. */
  active: number;
  /** Saved changes left off because the last start with them failed. */
  paused: boolean;
}

/** Parts of config.json the cfg leaves to their own screens: settings, the default text and the narrator. */
const SKIP_TOP = new Set(["settings", "textPool", "narrator"]);

export const CFG_KEY = "azshara-cfg-v1";
const BOOT_KEY = "azshara-cfg-boot";
const PAUSED_KEY = "azshara-cfg-paused";

function kindOf(v: unknown): CvarKind | null {
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") return "string";
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number")) return "numbers";
  return null;
}

/**
 * Every changeable value of a config, by path ("td.towers.ink.cost"). Notes (keys
 * starting with "_") and lists of names are left out; objects and lists of
 * objects are walked.
 */
export function flatten(config: unknown): Map<string, CfgValue> {
  const out = new Map<string, CfgValue>();
  const walk = (v: unknown, path: string) => {
    const kind = kindOf(v);
    if (kind) {
      if (path) out.set(path, Array.isArray(v) ? [...(v as number[])] : (v as CfgValue));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (typeof x === "object" && x !== null) walk(x, `${path}.${i}`);
      });
      return;
    }
    if (typeof v !== "object" || v === null) return;
    for (const [key, child] of Object.entries(v)) {
      if (key.startsWith("_")) continue;
      if (!path && SKIP_TOP.has(key)) continue;
      walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(config, "");
  return out;
}

export function cvars(defaults: unknown, overrides: Overrides): Cvar[] {
  const out: Cvar[] = [];
  for (const [path, def] of flatten(defaults)) {
    const kind = kindOf(def);
    if (!kind) continue;
    out.push({ path, kind, def, value: path in overrides ? (overrides[path] as CfgValue) : def });
  }
  return out;
}

/** Why a value cannot replace a default, or null when it can. */
export function check(def: CfgValue, value: CfgValue): string | null {
  const kind = kindOf(def);
  if (kind !== kindOf(value)) return `Must be ${kind === "numbers" ? "a list of numbers" : `a ${kind}`}`;
  const num = (d: number, n: number): string | null => {
    if (!Number.isFinite(n)) return "Must be a number";
    if (d > 0 && n <= 0) return "Must be above 0";
    if (d >= 0 && n < 0) return "Cannot be below 0";
    return null;
  };
  if (kind === "number") return num(def as number, value as number);
  if (kind === "numbers") {
    const d = def as number[];
    const v = value as number[];
    if (v.length !== d.length) return `Needs ${d.length} numbers`;
    for (let i = 0; i < v.length; i++) {
      const r = num(d[i] ?? 0, v[i] ?? NaN);
      if (r) return r;
    }
    return null;
  }
  if (kind === "string" && !(value as string).trim()) return "Cannot be empty";
  return null;
}

/** Reads what a player typed for a cvar of this kind. */
export function parse(kind: CvarKind, text: string): { ok: true; value: CfgValue } | { ok: false; reason: string } {
  const t = text.trim();
  if (kind === "boolean") {
    if (/^(true|on|yes|1)$/i.test(t)) return { ok: true, value: true };
    if (/^(false|off|no|0)$/i.test(t)) return { ok: true, value: false };
    return { ok: false, reason: "Must be on or off" };
  }
  if (kind === "string") return { ok: true, value: text };
  if (kind === "number") {
    const n = Number(t);
    return t && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: "Must be a number" };
  }
  const parts = t.split(/[\s,]+/).filter(Boolean);
  const nums = parts.map(Number);
  if (!parts.length || nums.some((n) => !Number.isFinite(n))) return { ok: false, reason: "Must be numbers, comma separated" };
  return { ok: true, value: nums };
}

/** How a value shows in a text box. */
export function show(value: CfgValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function same(a: CfgValue | undefined, b: CfgValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

/** Only the overrides that name a real value, fit it, and differ from the default. */
export function sanitize(defaults: unknown, overrides: unknown): Overrides {
  const out: Overrides = {};
  if (typeof overrides !== "object" || overrides === null) return out;
  const flat = flatten(defaults);
  for (const [path, value] of Object.entries(overrides as Record<string, unknown>)) {
    const def = flat.get(path);
    if (def === undefined || !kindOf(value)) continue;
    if (check(def, value as CfgValue) || same(def, value as CfgValue)) continue;
    out[path] = Array.isArray(value) ? [...(value as number[])] : (value as CfgValue);
  }
  return out;
}

/** Writes overrides into a config in place. Returns how many were applied. */
export function applyOverrides(config: object, overrides: Overrides): number {
  let applied = 0;
  for (const [path, value] of Object.entries(sanitize(config, overrides))) {
    const keys = path.split(".");
    let node: unknown = config;
    for (const key of keys.slice(0, -1)) {
      node = (node as Record<string, unknown>)[key];
      if (typeof node !== "object" || node === null) break;
    }
    const last = keys[keys.length - 1];
    if (typeof node !== "object" || node === null || last === undefined) continue;
    (node as Record<string, unknown>)[last] = Array.isArray(value) ? [...value] : value;
    applied += 1;
  }
  return applied;
}

// ---- Keeping them on the device ----

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadOverrides(): Overrides {
  try {
    const raw = storage()?.getItem(CFG_KEY);
    const data: unknown = raw ? JSON.parse(raw) : {};
    return typeof data === "object" && data !== null ? (data as Overrides) : {};
  } catch {
    return {};
  }
}

/** Saves overrides and turns them back on; they apply from the next start. */
export function saveOverrides(overrides: Overrides) {
  const store = storage();
  if (!store) return;
  try {
    if (Object.keys(overrides).length) store.setItem(CFG_KEY, JSON.stringify(overrides));
    else store.removeItem(CFG_KEY);
    store.removeItem(PAUSED_KEY);
    store.removeItem(BOOT_KEY);
  } catch {
    /* quota or private mode */
  }
}

/**
 * Lays the saved overrides over the config at start. A marker stays set until the
 * game reports it is running (bootDone); finding it at the next start means that
 * start failed, so the overrides are left off until they are applied again.
 */
export function bootCfg(config: object): CfgStatus {
  const store = storage();
  if (!store) return { active: 0, paused: false };
  try {
    const overrides = loadOverrides();
    if (!Object.keys(overrides).length) return { active: 0, paused: false };
    if (store.getItem(BOOT_KEY)) {
      store.removeItem(BOOT_KEY);
      store.setItem(PAUSED_KEY, "1");
    }
    if (store.getItem(PAUSED_KEY)) return { active: 0, paused: true };
    store.setItem(BOOT_KEY, "1");
    return { active: applyOverrides(config, overrides), paused: false };
  } catch {
    return { active: 0, paused: false };
  }
}

/** The game started fine with the current overrides. */
export function bootDone() {
  try {
    storage()?.removeItem(BOOT_KEY);
  } catch {
    /* nothing to clear */
  }
}
