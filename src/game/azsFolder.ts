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
  cacheWrite(o: {
    name: string;
    data: string;
    append: boolean;
  }): Promise<{ file: string; size: number }>;
  cacheDrop(o: { name: string }): Promise<void>;
  saveCached(o: {
    name: string;
    path: string;
    gain?: number;
    offset?: number;
  }): Promise<{ size: number }>;
  loopPlay(o: { path: string; volume: number }): Promise<void>;
  loopVolume(o: { volume: number }): Promise<void>;
  loopStop(): Promise<void>;
  stereoMake(o: { from: string; to: string; bridged: boolean } & StereoTurn): Promise<{
    frames: number;
    bytes: number;
  }>;
  stereoStop(): Promise<void>;
  addListener(
    event: "stereoProgress",
    fn: (e: { part: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/** How the final export turns (TtsStereo.Turn): none, left-right, the bridge rotation, or 8D. */
export interface StereoTurn {
  turn: "none" | "pan" | "bridge" | "eight";
  hz: number;
  startDeg?: number;
  dual?: boolean;
  wRot?: number;
  wOrig?: number;
  dualAmp?: number;
  gain?: number;
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

/**
 * A big file made here (a .tts.wav), into the folder: written a piece at a time
 * into the app's cache (start: from nothing), then saved into the folder at
 * path (written over if there) and dropped from the cache.
 */
export interface FolderWriter {
  write(bytes: Uint8Array): Promise<void>;
  /** Saved into the folder (each float32 sample (x - offset) x gain on the way): its size. */
  save(path: string, gain?: number, offset?: number): Promise<number>;
  /** Thrown away (stopped, or it failed). */
  drop(): Promise<void>;
}

function base64(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  });
}

/** null: not the phone app. */
export async function folderWriter(name: string): Promise<FolderWriter | null> {
  const p = await folderPlugin();
  if (!p) return null;
  let first = true;
  return {
    async write(bytes) {
      await p.api.cacheWrite({ name, data: await base64(bytes), append: !first });
      first = false;
    },
    async save(path, gain = 1, offset = 0) {
      return (await p.api.saveCached({ name, path, gain, offset })).size;
    },
    async drop() {
      await p.api.cacheDrop({ name }).catch(() => {});
    },
  };
}

/**
 * A .wav of the folder looped by the phone itself, read from the file a piece at
 * a time (any length, any rate, in the background too). False if it cannot.
 */
export async function folderLoop(path: string | null, volume = 1): Promise<boolean> {
  const p = await folderPlugin();
  if (!p) return false;
  try {
    if (!path) await p.api.loopStop();
    else await p.api.loopPlay({ path, volume });
    return !!path;
  } catch {
    return false;
  }
}

export async function folderLoopVolume(volume: number) {
  const p = await folderPlugin();
  await p?.api.loopVolume({ volume }).catch(() => {});
}

/**
 * A .wav of the folder (a finished .tts.wav) made two channels into `to`, by the
 * phone, a piece at a time: the same both sides, or bridged (the right side
 * flipped), turned left-right turnHz times a second if above 0. Nothing is
 * mixed again. Throws why it could not ("Stopped" when stopped).
 */
export async function folderStereo(
  from: string,
  to: string,
  bridged: boolean,
  turn: StereoTurn,
  onPart: (part: number) => void,
): Promise<{ frames: number; bytes: number }> {
  const p = await folderPlugin();
  if (!p) throw new Error("Made in the Android app, from the .tts.wav in the azs-folder");
  const h = await p.api.addListener("stereoProgress", (e) => onPart(e.part));
  try {
    return await p.api.stereoMake({ from, to, bridged, ...turn });
  } finally {
    await h.remove().catch(() => {});
  }
}

export async function folderStereoStop() {
  const p = await folderPlugin();
  await p?.api.stereoStop().catch(() => {});
}
