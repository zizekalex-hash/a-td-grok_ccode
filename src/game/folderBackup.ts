/**
 * Everything the app keeps, saved into azs-folder as azs-backup.json (the same
 * file as Options → Backup), by hand or by itself whenever you leave the app.
 * With input_perphrase beside it, the folder alone carries the app to another
 * phone: install the app there, choose the copied folder, load everything.
 */
import { collect, deviceStore, parseBackup, type Backup } from "@/game/backup";
import { saveAllNow } from "@/game/engine";
import { FOLDER_BACKUP, folderName, readFolderText, writeFolderText } from "@/game/azsFolder";

export const FOLDER_AUTO_KEY = "azshara-folder-auto";

/** Saving to the folder by itself when you leave the app (on to start). */
export function folderAuto(): boolean {
  try {
    return localStorage.getItem(FOLDER_AUTO_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setFolderAuto(on: boolean) {
  try {
    localStorage.setItem(FOLDER_AUTO_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

/** Saves everything into the folder; gives back the folder's name. */
export async function saveToFolder(): Promise<string> {
  const name = await folderName();
  if (!name) throw new Error("Choose the azs-folder first (Recitation drill → Rehearse).");
  saveAllNow();
  const store = deviceStore();
  if (!store) throw new Error("This device keeps no saves.");
  await writeFolderText(FOLDER_BACKUP, JSON.stringify(collect(store, Date.now())));
  return name;
}

/** The backup in the folder, read and checked. */
export async function loadFromFolder(): Promise<Backup> {
  const r = parseBackup(await readFolderText(FOLDER_BACKUP));
  if (!r.ok) throw new Error(r.error);
  return r.backup;
}

let last = 0;

/** Leaving the app: saves into the folder if one is chosen and auto is on (at most every 20 s). */
export function autoSaveToFolder() {
  if (!folderAuto() || Date.now() - last < 20_000) return;
  last = Date.now();
  void folderName()
    .then((n) => (n ? saveToFolder() : null))
    .catch(() => {});
}
