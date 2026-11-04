import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { isTextPath, textNames, unzipTexts, zipEntries } from "./unzip.ts";

/** A small zip, made by hand: each file stored or deflated, with a central directory. */
function makeZip(files: { path: string; text: string; deflate?: boolean }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.path);
    const raw = enc.encode(f.text);
    const data = f.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = f.deflate ? 8 : 0;
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const dirSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, end];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of all) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

describe("zip folders of texts", () => {
  it("reads the .txt files of a zip, stored or deflated, and skips the rest", async () => {
    const zip = makeZip([
      { path: "Notes/one.txt", text: "First text. Line one.\nLine two." },
      { path: "Notes/sub/two.txt", text: "Second text, deflated. ".repeat(20), deflate: true },
      { path: "Notes/picture.png", text: "not text" },
      { path: "__MACOSX/Notes/._one.txt", text: "litter" },
      { path: "Notes/", text: "" },
      { path: "Notes/ü-ñ.txt", text: "Unicode names ✓", deflate: true },
    ]);
    assert.equal(zipEntries(zip).length, 6);
    const texts = await unzipTexts(zip);
    assert.deepEqual(
      texts.map((t) => t.name),
      ["one", "sub/two", "ü-ñ"],
      "the shared top folder is dropped, subfolders kept",
    );
    assert.equal(texts[0]!.text, "First text. Line one.\nLine two.");
    assert.equal(texts[1]!.text, "Second text, deflated. ".repeat(20));
    assert.equal(texts[2]!.text, "Unicode names ✓");
    assert.equal((await unzipTexts(zip, 1)).length, 1, "at most so many");
  });

  it("knows a text file, and names texts by their paths", () => {
    assert.ok(isTextPath("a/b.TXT"));
    assert.ok(!isTextPath("a/b.md"));
    assert.ok(!isTextPath("a/.hidden.txt"));
    assert.ok(!isTextPath("__MACOSX/a.txt"));
    assert.ok(!isTextPath("folder/"));
    assert.deepEqual(textNames(["a.txt", "b.txt"]), ["a", "b"]);
    assert.deepEqual(textNames(["x/a.txt", "y/b.txt"]), ["x/a", "y/b"], "no shared top: kept");
    assert.deepEqual(textNames(["top/a.txt"]), ["a"]);
  });

  it("refuses what is not a zip", async () => {
    await assert.rejects(
      () => unzipTexts(new TextEncoder().encode("just text, no zip")),
      /not a zip/,
    );
  });
});
