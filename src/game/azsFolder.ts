/**
 * The app's own folder on the phone, azs-folder (AzsFolderPlugin.java): chosen
 * once with Android's folder picker, then the app reads and writes in it, also
 * files other apps made there (Termux's .wav files). In it: input_perphrase/
 * (each Rehearse phrase as a .txt, its .wav next to it) and azs-backup.json
 * (everything else), so the folder alone carries the app to another phone.
 * In a browser there is no such folder: every call says so (null or false).
 */

interface AzsFolderApi {
  pick(): Promise<{ picked: boolean; name?: string }>;
  status(): Promise<{ picked: boolean; name?: string }>;
  writeText(o: { path: string; text: string }): Promise<void>;
  readText(o: { path: string }): Promise<{ text: string }>;
  list(o: { dir: string }): Promise<{ files: FolderFile[] }>;
  cacheFile(o: { path: string }): Promise<{ file: string; size: number; modified: number }>;
}

export interface FolderFile {
  name: string;
  size: number;
  modified: number;
}

/** The backup kept in the folder. */
export const FOLDER_BACKUP = "azs-backup.json";

let plugin: Promise<{ api: AzsFolderApi; convert: (path: string) => string } | null> | null = null;

/** The folder's plugin, in the Android app only (wrapped: a plugin is not a promise's result). */
function folderPlugin() {
  plugin ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }) =>
      Capacitor.getPlatform() === "android"
        ? {
            api: registerPlugin<AzsFolderApi>("AzsFolder"),
            convert: (path: string) => Capacitor.convertFileSrc(path),
          }
        : null,
    )
    .catch(() => null);
  return plugin;
}

/** Whether this is the phone app (the folder works there). */
export async function hasFolder(): Promise<boolean> {
  return !!(await folderPlugin());
}

/** The chosen folder's name, or null if none (or not the phone app). */
export async function folderName(): Promise<string | null> {
  const p = await folderPlugin();
  if (!p) return null;
  try {
    const s = await p.api.status();
    return s.picked ? s.name || "azs-folder" : null;
  } catch {
    return null;
  }
}

/** Opens Android's folder picker: the folder's name, or null if none was picked. */
export async function pickFolder(): Promise<string | null> {
  const p = await folderPlugin();
  if (!p) return null;
  const r = await p.api.pick();
  return r.picked ? r.name || "azs-folder" : null;
}

export async function writeFolderText(path: string, text: string): Promise<void> {
  const p = await folderPlugin();
  if (!p) throw new Error("The azs-folder is in the Android app");
  await p.api.writeText({ path, text });
}

export async function readFolderText(path: string): Promise<string> {
  const p = await folderPlugin();
  if (!p) throw new Error("The azs-folder is in the Android app");
  return (await p.api.readText({ path })).text;
}

/** The files in a folder inside azs-folder ([] if none). */
export async function listFolder(dir: string): Promise<FolderFile[]> {
  const p = await folderPlugin();
  if (!p) return [];
  try {
    return (await p.api.list({ dir })).files;
  } catch {
    return [];
  }
}

/** A file in azs-folder as an address the page can fetch (null if it cannot). */
export async function folderFileUrl(path: string): Promise<string | null> {
  const p = await folderPlugin();
  if (!p) return null;
  try {
    return p.convert((await p.api.cacheFile({ path })).file);
  } catch {
    return null;
  }
}
