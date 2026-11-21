/** Picture art for the Court's portraits. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { artFrame, artSvg, artUrl, cleanArt, loadArts, ART_MAX_CHARS } from "./artwork.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const art = { src: PNG, w: 1536, h: 864, fx: 0.5, fy: 0.3, zoom: 1, mix: 1 };

describe("court picture art", () => {
  it("keeps only pictures that can be kept, each value checked", () => {
    assert.deepEqual(cleanArt(art), art);
    assert.equal(cleanArt(null), null);
    assert.equal(cleanArt({ ...art, src: "https://example.com/a.png" }), null, "only data");
    assert.equal(cleanArt({ ...art, src: "data:image/svg+xml;base64,AAAA" }), null, "no svg (it could carry scripts)");
    assert.equal(cleanArt({ ...art, src: `data:image/jpeg;base64,${"A".repeat(ART_MAX_CHARS)}` }), null, "too big");
    assert.equal(cleanArt({ ...art, w: 0 }), null);
    const odd = cleanArt({ ...art, fx: 9, fy: -3, zoom: 99, mix: "x" })!;
    assert.deepEqual([odd.fx, odd.fy, odd.zoom, odd.mix], [1, 0, 4, 1]);
    const some = loadArts({ queens: { eltharia: art, nobody: art, azshara: { src: "x" } }, you: art });
    assert.deepEqual(Object.keys(some.queens), ["eltharia"]);
    assert.ok(some.you);
    assert.deepEqual(loadArts(7), { queens: {}, you: null });
  });

  it("always covers the round frame, wherever its point and however close", () => {
    for (const [w, h] of [[1536, 864], [864, 1536], [1000, 1000]])
      for (const zoom of [1, 1.7, 4])
        for (const fx of [0, 0.5, 1])
          for (const fy of [0, 0.5, 1]) {
            const f = artFrame({ w, h, fx, fy, zoom });
            assert.ok(f.x <= 0 && f.x + f.width >= 100, `${w}x${h} z${zoom}: across`);
            assert.ok(f.y <= 0 && f.y + f.height >= 100, `${w}x${h} z${zoom}: down`);
            assert.ok(Math.abs(f.width / f.height - w / h) < 1e-9, "its own shape");
          }
    // A wide picture fills the height; the point asked for is in the middle.
    const f = artFrame({ w: 1600, h: 800, fx: 0.5, fy: 0.5, zoom: 1 });
    assert.equal(f.height, 100);
    assert.equal(f.width, 200);
    assert.equal(f.x, -50);
  });

  it("is an SVG in the round frame, the drawn portrait under it only when it shows", () => {
    const only = artSvg(art, "#a855f7");
    assert.ok(only.includes('viewBox="0 0 100 100"') && only.includes(PNG) && only.includes("#a855f7"));
    assert.equal((only.match(/<image /g) ?? []).length, 1);
    const drawn = "data:image/svg+xml;charset=utf-8,%3Csvg%3E";
    const both = artSvg({ ...art, mix: 0.6 }, "#a855f7", drawn);
    assert.equal((both.match(/<image /g) ?? []).length, 2);
    assert.ok(both.includes('opacity="0.6"'));
    // Nothing from outside gets into the picture: a ring that is not a colour, an under that is not a data URL.
    const bad = artSvg(art, '"><script>', 'javascript:alert(1)"');
    assert.ok(!bad.includes("script") && !bad.includes("javascript"));
    assert.ok(artUrl(art, "#fff").startsWith("data:image/svg+xml;charset=utf-8,"));
  });
});
