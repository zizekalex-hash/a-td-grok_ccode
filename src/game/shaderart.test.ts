import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONFIG } from "./config.ts";
import {
  drawSize,
  elementLook,
  fragmentSource,
  hexToRgb,
  nebulaLook,
  paletteOf,
  qualityOf,
  queenLook,
  SHADER_KINDS,
  UNIFORMS,
  VERTEX_SOURCE,
  type ShaderLook,
} from "./shaderart.ts";

const inRange = (c: readonly number[]) => c.length === 3 && c.every((n) => Number.isFinite(n) && n >= 0 && n <= 1);

describe("shader art: colours", () => {
  it("reads a colour, in three digits or six, and falls back for anything else", () => {
    assert.deepEqual(hexToRgb("#ff0000"), [1, 0, 0]);
    assert.deepEqual(hexToRgb("#0f0"), [0, 1, 0]);
    assert.ok(Math.abs(hexToRgb("#336699")[1]! - 0x66 / 255) < 1e-9);
    for (const junk of [undefined, "", "red", "#12", "#gggggg", "rgb(1,2,3)", "#1234567", '"><script>']) {
      assert.deepEqual(hexToRgb(junk as string), [0.5, 0.4, 0.8], String(junk));
    }
    assert.deepEqual(hexToRgb("nope", [0, 0, 0]), [0, 0, 0]);
  });

  it("makes a palette of four colours from one, darkest to lightest", () => {
    const p = paletteOf("#ff7a2e");
    assert.equal(p.length, 4);
    for (const c of p) assert.ok(inRange(c));
    const lum = (c: number[]) => c[0]! * 0.3 + c[1]! * 0.6 + c[2]! * 0.1;
    assert.ok(lum(p[0]) < lum(p[1]) && lum(p[1]) < lum(p[2]) && lum(p[2]) < lum(p[3]), "dark to light");
    assert.deepEqual(p[2], hexToRgb("#ff7a2e"), "its own colour in the middle");
    assert.deepEqual(paletteOf("#ff7a2e", "#00ff00")[3], [0, 1, 0], "an accent takes the last place");
    for (const c of paletteOf("not a colour")) assert.ok(inRange(c), "a bad colour still gives a palette");
  });

  it("has a look for each use, every one sound", () => {
    const looks: ShaderLook[] = [elementLook("fire"), elementLook("water"), nebulaLook("#a855f7")];
    for (const q of Object.values(CONFIG.court.queens)) looks.push(queenLook(q.color));
    for (const l of looks) {
      assert.ok(SHADER_KINDS.includes(l.kind));
      assert.ok(l.speed > 0 && l.scale > 0 && l.warp > 0);
      for (const c of l.palette) assert.ok(inRange(c));
    }
    assert.notDeepEqual(elementLook("fire").palette, elementLook("water").palette);
    assert.equal(new Set(Object.values(CONFIG.court.queens).map((q) => JSON.stringify(queenLook(q.color).palette))).size, 11);
  });
});

describe("shader art: quality", () => {
  it("follows the setting, the render resolution and the frame cap", () => {
    assert.deepEqual(qualityOf(0, 100, 60), { strength: 0, scale: 0.5, fps: 30 });
    assert.equal(qualityOf(55, 100, 60).strength, 0.55);
    assert.equal(qualityOf(100, 100, 120).fps, 30, "never above 30");
    assert.equal(qualityOf(100, 100, 20).fps, 20, "never above the cap");
    assert.equal(qualityOf(100, 100, 1).fps, 5, "never below 5");
    assert.equal(qualityOf(100, 50, 60).scale, 0.25, "a lower resolution draws it smaller still");
    for (const junk of [Number.NaN, -5, Infinity, undefined as unknown as number]) {
      const q = qualityOf(junk, junk, junk);
      assert.ok(Number.isFinite(q.strength) && q.strength >= 0 && q.strength <= 1);
      assert.ok(Number.isFinite(q.scale) && q.scale > 0 && q.scale <= 0.5);
      assert.ok(Number.isFinite(q.fps) && q.fps >= 5 && q.fps <= 30);
    }
    const s = CONFIG.settings.shaderArt;
    assert.ok(s > 0 && s <= 100, "on to start");
  });

  it("is drawn small: half the screen, never over 720 on a side, never under 32", () => {
    assert.deepEqual(drawSize(360, 640, 0.5), { w: 180, h: 320 });
    const big = drawSize(4000, 3000, 0.5);
    assert.ok(Math.max(big.w, big.h) <= 720);
    assert.ok(Math.abs(big.w / big.h - 4000 / 3000) < 0.02, "the same shape");
    assert.deepEqual(drawSize(0, 0, 0.5), { w: 32, h: 32 });
    assert.ok(drawSize(10, 10, 0.25).w >= 32);
  });
});

describe("shader art: the shaders", () => {
  it("are whole programs that read the uniforms the runner sets, with loops a phone's GPU accepts", () => {
    assert.match(VERTEX_SOURCE, /attribute vec2 aPos/);
    assert.match(VERTEX_SOURCE, /gl_Position/);
    for (const kind of SHADER_KINDS) {
      const src = fragmentSource(kind);
      assert.match(src, /void main\(\)/, kind);
      assert.match(src, /gl_FragColor/, kind);
      assert.match(src, /precision highp float;/, `${kind}: high precision where there is, medium else`);
      assert.match(src, /precision mediump float;/);
      for (const u of UNIFORMS) assert.match(src, new RegExp(`uniform \\w+ ${u};`), `${kind}: ${u}`);
      // GLSL ES 1.00: a loop's bound is a constant.
      for (const m of src.matchAll(/for \(int \w+ = 0; \w+ < (\w+); \w+\+\+\)/g)) assert.match(m[1]!, /^\d+$/, kind);
      // Balanced, and no template left behind.
      assert.equal((src.match(/\{/g) ?? []).length, (src.match(/\}/g) ?? []).length, `${kind}: braces`);
      assert.equal((src.match(/\(/g) ?? []).length, (src.match(/\)/g) ?? []).length, `${kind}: parentheses`);
      assert.ok(!/\$\{|undefined|NaN/.test(src), kind);
      assert.ok(src.length < 6000, `${kind}: small`);
    }
    assert.equal(new Set(SHADER_KINDS.map(fragmentSource)).size, SHADER_KINDS.length, "three different pictures");
    assert.match(fragmentSource("marble"), /fbm\(p \+ uWarp \* r\)/, "the warp of a warp of a warp");
    assert.match(fragmentSource("nebula"), /step\(0\.99/, "stars");
  });
});
