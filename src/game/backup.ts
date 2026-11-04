/**
 * A backup of everything the game keeps on this device, as one file to take to
 * another phone: options and advanced settings, loaded texts, skills and best
 * scores, the Court, Reps and their history, chess and tower defense, the
 * narrator. Saves are copied exactly as they are stored.
 *
 * Restoring is staged: the backup is put aside, the app restarts, and before
 * anything reads a save it replaces this device's saves with the backup's. That
 * way nothing still running can write its old save over the restored one.
 * Pure (storage is passed in) apart from the device helpers at the end, so the
 * tests can load it.
 */

export const BACKUP_APP = "azshara-signal-defense";
export const BACKUP_VERSION = 1;
const PREFIX = "azshara-";
/** A restore waiting for the next start. */
export const PENDING_KEY = "azshara-restore-pending";
/** Advanced settings switched off after a bad start; a restore switches them back on. */
const PAUSED_KEY = "azshara-cfg-paused";
/** Kept out of backups: start-up bookkeeping, and the pending restore itself. */
const SKIP = new Set(["azshara-cfg-boot", PAUSED_KEY, PENDING_KEY]);

/** What each save holds, in plain words, for the summary before a restore. */
export const SAVE_NAMES: Record<string, string> = {
  "azshara-signal-v1": "Options, texts, skills and best scores",
  "azshara-cfg-v1": "Advanced settings",
  "azshara-court-v1": "The Court",
  "azshara-court-bag-v1": "The Court's phrases already recited",
  "azshara-reps-v1": "Reps and their history",
  "azshara-rehearse-v1":
    "The Rehearse tab: its phrases, their counts and the tap's sound and picture",
  "azshara-reader-v1": "The Read tab: its settings and your place in each text",
  "azshara-chess-v1": "Auto chess",
  "azshara-td-v1": "Tower defense",
  "azshara-td-run-v1": "A tower defense run in progress",
  "azshara-narrator-v1": "Narrator",
  "azshara-drill-tab": "The drill's last tab",
};

export interface Backup {
  app: string;
  kind: "backup";
  version: number;
  /** When it was made (ms since 1970). */
  exportedAt: number;
  /** Each save, exactly as stored. */
  keys: Record<string, string>;
}

/** The part of Storage this needs, so tests can pass a stand-in. */
export type Store = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

function ours(key: string | null): key is string {
  return !!key && key.startsWith(PREFIX) && !SKIP.has(key);
}

/** Every save this game keeps on the device, as a backup. */
export function collect(store: Store, now: number): Backup {
  const keys: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (!ours(k)) continue;
    const v = store.getItem(k);
    if (v !== null) keys[k] = v;
  }
  return { app: BACKUP_APP, kind: "backup", version: BACKUP_VERSION, exportedAt: now, keys };
}

/** Reads a backup file's text; an error in plain words when it is not one. */
export function parseBackup(
  text: string,
): { ok: true; backup: Backup } | { ok: false; error: string } {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return { ok: false, error: "That is not a backup file (it is not JSON)." };
  }
  const b = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  if (b.app !== BACKUP_APP || b.kind !== "backup")
    return { ok: false, error: "That file is not a backup of this game." };
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION)
    return { ok: false, error: "That backup is from a newer version. Update the app first." };
  const raw = (b.keys && typeof b.keys === "object" ? b.keys : {}) as Record<string, unknown>;
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (ours(k) && typeof v === "string") keys[k] = v;
  if (!Object.keys(keys).length) return { ok: false, error: "That backup is empty." };
  const at = typeof b.exportedAt === "number" && Number.isFinite(b.exportedAt) ? b.exportedAt : 0;
  return {
    ok: true,
    backup: { app: BACKUP_APP, kind: "backup", version: b.version, exportedAt: at, keys },
  };
}

/** What a backup holds, in plain words, and its size in bytes. */
export function summary(b: Backup): { what: string[]; bytes: number } {
  const what = Object.keys(b.keys)
    .map((k) => SAVE_NAMES[k] ?? k.slice(PREFIX.length))
    .sort();
  const bytes = Object.entries(b.keys).reduce((n, [k, v]) => n + k.length + v.length, 0);
  return { what, bytes };
}

/** "azshara-backup-2026-11-01.json" */
export function backupFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  return `azshara-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Puts a backup aside, to replace this device's saves at the next start. */
export function stageRestore(store: Store, b: Backup) {
  store.setItem(PENDING_KEY, JSON.stringify(b));
}

/**
 * At start, before anything reads a save: if a restore is waiting, this device's
 * saves are replaced by the backup's (saves the backup does not have are
 * removed, so it is the same as the other device). True when it did.
 */
export function applyPendingRestore(store: Store): boolean {
  const raw = store.getItem(PENDING_KEY);
  if (raw === null) return false;
  store.removeItem(PENDING_KEY);
  const parsed = parseBackup(raw);
  if (!parsed.ok) return false;
  const old: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (ours(k)) old.push(k);
  }
  for (const k of old) store.removeItem(k);
  store.removeItem(PAUSED_KEY);
  for (const [k, v] of Object.entries(parsed.backup.keys)) store.setItem(k, v);
  return true;
}

/** The device's storage, or null where there is none (tests, server rendering). */
export function deviceStore(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
