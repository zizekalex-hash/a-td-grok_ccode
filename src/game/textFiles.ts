/**
 * A text out of the app as a file: a .txt (or a picture) to save or send, and a
 * text checked and confirmed, saved once into the phone's Documents/confirmed_txt.
 * Shared by the Read tab and Rehearse's texts. Needs a page.
 */
import { CONFIG } from "@/game/config";
import { flashToast } from "@/game/engine";

/** "notes.txt", safe for a file name (or "notes.png"). */
export function fileName(name: string, ext = "txt"): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "text";
  const base = clean.replace(/\.txt$/i, "");
  return `${base}.${ext}`;
}

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * A file out of the app: on the phone, the share sheet (save it to Files,
 * Drive, a chat, a computer, …); in a browser, a download.
 */
export async function saveFile(file: string, blob: Blob, title: string) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const out = await Filesystem.writeFile({
        path: file,
        data: await base64Of(blob),
        directory: Directory.Cache,
      });
      await Share.share({ title: file, dialogTitle: title, files: [out.uri] });
      return;
    }
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  flashToast(`Saved ${file}`);
}

/** A text as a .txt. */
export async function exportText(name: string, lines: string[]) {
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
  await saveFile(fileName(name), blob, "Save or send the text");
}

/**
 * A text read through and confirmed: saved once into the phone's
 * Documents/confirmed_txt (the folder is made if it is not there). If the phone
 * will not take it there, the share sheet; in a browser, a download (quiet:
 * neither, only the phone's folder).
 */
export async function saveConfirmed(
  name: string,
  lines: string[],
  sub?: string,
  /** Only where it is saved without asking (the phone app): no download in a browser. */
  quiet = false,
) {
  const folder = (CONFIG.reader.confirmedFolder || "confirmed_txt").replace(/[\\/:*?"<>|]+/g, "-");
  const file = fileName(name);
  const body = `${lines.join("\n")}\n`;
  const blob = () => new Blob([body], { type: "text/plain;charset=utf-8" });
  let native = false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    native = Capacitor.isNativePlatform();
    if (native) {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      const dir = sub ? `${folder}/${sub.replace(/[\\:*?"<>|]+/g, "-")}` : folder;
      await Filesystem.writeFile({
        path: `${dir}/${file}`,
        data: body,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      flashToast(`Checked ✓ saved: Documents/${dir}/${file}`);
      return;
    }
  } catch {
    if (native) {
      if (!quiet) await saveFile(file, blob(), "Save the checked text");
      return;
    }
  }
  if (quiet) return;
  await saveFile(
    `${folder}_${sub ? `${sub.replace(/[\\/:*?"<>|]+/g, "-")}_` : ""}${file}`,
    blob(),
    "Save the checked text",
  );
}
