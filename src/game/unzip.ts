/**
 * Opens a .zip and gives back the .txt files in it, for the Read tab's folders.
 * Files stored as they are (method 0) or deflated (method 8, the usual one); the
 * deflate is undone by the platform (DecompressionStream "deflate-raw", in every
 * current browser and Android WebView). Folders and macOS litter (__MACOSX, ._
 * files) are skipped; a folder all the texts share at the top is dropped from
 * their names. Relative imports only, so the tests can load it.
 */

export interface ZipText {
  /** Its path in the zip, and its name: the path without the shared top folder and ".txt". */
  path: string;
  name: string;
  text: string;
}

export interface ZipEntry {
  path: string;
  /** 0 stored, 8 deflated. */
  method: number;
  data: Uint8Array;
  size: number;
}

const u16 = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u32 = (b: Uint8Array, o: number) =>
  ((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16) | ((b[o + 3] ?? 0) << 24)) >>> 0;

/** Every entry of a zip, from its central directory (the trustworthy list at the end). */
export function zipEntries(bytes: Uint8Array): ZipEntry[] {
  // The end record: its signature, searched from the end (a comment of up to 64 KB may follow it).
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("That is not a zip file");
  const count = u16(bytes, end + 10);
  let p = u32(bytes, end + 16);
  const names = new TextDecoder("utf-8");
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error("The zip's list of files is broken");
    const method = u16(bytes, p + 10);
    const csize = u32(bytes, p + 20);
    const usize = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const path = names.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    // The file's own header, then its data.
    if (u32(bytes, local) !== 0x04034b50) continue;
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    out.push({ path, method, data: bytes.subarray(start, start + csize), size: usize });
  }
  return out;
}

/** A .txt file worth loading: not a folder, not inside __MACOSX, not a hidden ._ file. */
export function isTextPath(path: string): boolean {
  if (path.endsWith("/")) return false;
  const parts = path.split("/");
  if (parts.some((part) => part === "__MACOSX" || part.startsWith("."))) return false;
  return /\.txt$/i.test(path);
}

/** Names for the texts: their paths, without a top folder they all share, and without ".txt". */
export function textNames(paths: string[]): string[] {
  const split = paths.map((p) => p.split("/"));
  const top = split[0]?.length && split[0].length > 1 ? split[0][0] : undefined;
  const shared = top !== undefined && split.every((s) => s.length > 1 && s[0] === top);
  return split.map((s) => (shared ? s.slice(1) : s).join("/").replace(/\.txt$/i, "") || "Text");
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (!DS) throw new Error("This device cannot open zipped files");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The .txt files of a zip, in the zip's order: all of them, unless maxFiles says fewer. Files packed another way are skipped. */
export async function unzipTexts(bytes: Uint8Array, maxFiles = Infinity): Promise<ZipText[]> {
  const entries = zipEntries(bytes).filter(
    (e) => isTextPath(e.path) && (e.method === 0 || e.method === 8),
  );
  const picked = entries.slice(0, Math.max(0, maxFiles));
  const names = textNames(picked.map((e) => e.path));
  const decode = new TextDecoder("utf-8");
  const out: ZipText[] = [];
  for (const [i, e] of picked.entries()) {
    const raw = e.method === 0 ? e.data : await inflate(e.data);
    out.push({ path: e.path, name: names[i] ?? "Text", text: decode.decode(raw) });
  }
  return out;
}
