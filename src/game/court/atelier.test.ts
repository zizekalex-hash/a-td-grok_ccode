import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONFIG, type CourtQueenKey } from "../config.ts";
import {
  cleanLook,
  cleanName,
  cleanShape,
  COLOURS,
  loadLooks,
  NAME_MAX,
  originalLook,
  PAGES,
  randomLook,
  sameLook,
  SLIDERS,
  TRAITS,
  withShape,
  type ColourKey,
  type TraitKey,
} from "./atelier.ts";
import {
  BODY_KEYS,
  lookOf,
  looksRev,
  portraitSvg,
  queenPortrait,
  setLook,
  SHAPE_KEYS,
  subscribeLooks,
  youLook,
  youPortrait,
  type Look,
} from "./portrait.ts";
import { rng } from "./svgkit.ts";
import { figureSvg } from "./figure.ts";

const C = CONFIG.court;
const A = C.atelier;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const jaina = C.queens.jaina.look as Look;
const draw = (look: Look) => portraitSvg(look, "#7fb8ff", "water", { style: "dark" });

describe("the Atelier's lists", () => {
  it("has a reach in config.json for every slider, and a name for each", () => {
    assert.deepEqual([...SHAPE_KEYS].sort(), Object.keys(A.shape).sort());
    for (const key of SHAPE_KEYS) {
      assert.ok(A.shape[key]! > 0, `${key}: its reach is above 0`);
      const s = SLIDERS[key];
      assert.ok(s.name && s.low && s.high, `${key}: a name and both ends`);
    }
  });

  it("offers every slider, trait and colour on exactly one page", () => {
    const count = <T>(pick: (p: (typeof PAGES)[number]) => T[]) => {
      const seen = new Map<T, number>();
      for (const p of PAGES) for (const k of pick(p)) seen.set(k, (seen.get(k) ?? 0) + 1);
      return seen;
    };
    const sliders = count((p) => p.sliders);
    for (const key of SHAPE_KEYS) assert.equal(sliders.get(key), 1, `slider ${key}`);
    const traits = count((p) => p.traits);
    for (const key of Object.keys(TRAITS) as TraitKey[]) assert.equal(traits.get(key), 1, `trait ${key}`);
    const colours = count((p) => p.colours);
    for (const key of Object.keys(COLOURS) as ColourKey[])
      assert.equal(colours.get(key), 1, `colour ${key}`);
    assert.equal(PAGES.filter((p) => p.bg).length, 1, "one page chooses the background");
  });

  it("has swatches that are all colours, and a look to start you with that is sound", () => {
    for (const [name, list] of Object.entries(A.palettes)) {
      assert.ok(list.length >= 4, `${name}: a few to choose from`);
      for (const v of list.flat()) assert.match(v, HEX, `${name}: ${v}`);
    }
    for (const pair of A.palettes.bg) assert.equal(pair.length, 2);
    for (const c of Object.values(COLOURS)) assert.ok(A.palettes[c.palette], c.name);
    const mine = A.you.look as Look;
    assert.ok(sameLook(cleanLook(mine, mine), mine), "nothing in it needs mending");
    assert.equal(cleanName(A.you.name), A.you.name);
    assert.ok(A.random > 0 && A.random <= 1);
  });

  it("knows every look in config.json as sound, each trait one it offers", () => {
    for (const q of Object.keys(C.queens) as CourtQueenKey[]) {
      const look = C.queens[q].look as Look;
      assert.ok(sameLook(cleanLook(look, look), look), `${q}: unchanged by the check`);
      for (const key of Object.keys(TRAITS) as TraitKey[]) {
        const v = cleanLook(look, look)[key];
        assert.ok(TRAITS[key].options.some(([o]) => o === v), `${q}.${key}: ${v}`);
      }
    }
  });
});

describe("a look's shape", () => {
  it("draws exactly the same with no shape, an empty one, or every slider at 0", () => {
    const plain = draw(jaina);
    assert.equal(draw({ ...jaina, shape: {} }), plain);
    assert.equal(draw({ ...jaina, shape: Object.fromEntries(SHAPE_KEYS.map((k) => [k, 0])) }), plain);
    assert.equal(draw({ ...jaina, lashes: "full" }), plain);
  });

  it("changes the picture with every slider, both ways", () => {
    // A queen with horns, so the horns' slider has something to move.
    const horned = C.queens.alexstrasza.look as Look;
    for (const key of SHAPE_KEYS) {
      // The body's sliders show on a whole figure, the others on a portrait.
      const pic = BODY_KEYS.includes(key) ? (l: Look) => figureSvg(l, "#ff7a6b") : draw;
      const plain = pic(horned);
      const up = pic(withShape(horned, key, 1));
      const down = pic(withShape(horned, key, -1));
      assert.notEqual(up, plain, `${key} at +1`);
      assert.notEqual(down, plain, `${key} at -1`);
      assert.notEqual(up, down, `${key}: its two ends differ`);
      assert.ok(up.startsWith("<svg") && up.endsWith("</svg>"));
    }
  });

  it("keeps a slider in range, to two places, and leaves out one at 0", () => {
    assert.deepEqual(cleanShape({ jaw: 5, chin: -9, cheeks: 0.123456, blush: 0, bogus: 1 }), {
      jaw: 1,
      chin: -1,
      cheeks: 0.12,
    });
    assert.equal(cleanShape({ jaw: 0 }), undefined);
    assert.equal(cleanShape({ jaw: "wide", chin: Number.NaN, cheeks: Infinity }), undefined);
    assert.equal(cleanShape(null), undefined);
    assert.equal(withShape(withShape(jaina, "jaw", 0.5), "jaw", 0).shape, undefined);
    assert.deepEqual(withShape(jaina, "jaw", 0.5).shape, { jaw: 0.5 });
    // Out of range in a look: drawn as the nearest end, never further.
    assert.equal(draw({ ...jaina, shape: { jaw: 40 } }), draw({ ...jaina, shape: { jaw: 1 } }));
  });

  it("draws every trait there is, short hair and plain lids among them", () => {
    const plain = draw(jaina);
    for (const key of Object.keys(TRAITS) as TraitKey[]) {
      for (const [value] of TRAITS[key].options) {
        const svg = draw({ ...jaina, [key]: value });
        assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${key}: ${value}`);
      }
    }
    assert.notEqual(draw({ ...jaina, hairStyle: "short" }), plain);
    const noLashes = draw({ ...jaina, lashes: "none" });
    assert.notEqual(noLashes, plain);
    assert.ok(noLashes.length < plain.length, "a plain lid is less to draw");
  });
});

describe("a look that was saved", () => {
  it("falls back to the original for anything that is not what it should be", () => {
    const got = cleanLook(
      {
        skin: '"><script>alert(1)</script>',
        hair: "red",
        eyes: "#12345",
        accent: 7,
        hairStyle: "mohawk",
        outfit: "bikini",
        ears: null,
        bg: ["#fff"],
        shape: { jaw: 3 },
      },
      jaina,
    );
    assert.equal(got.skin, jaina.skin);
    assert.equal(got.hair, jaina.hair);
    assert.equal(got.eyes, jaina.eyes);
    assert.equal(got.accent, jaina.accent);
    assert.equal(got.hairStyle, jaina.hairStyle);
    assert.equal(got.outfit, jaina.outfit);
    assert.equal(got.ears, jaina.ears);
    assert.deepEqual(got.bg, jaina.bg);
    assert.deepEqual(got.shape, { jaw: 1 });
    assert.ok(!draw(got).includes("<script"), "nothing of it reaches the picture");
  });

  it("keeps what is sound: colours, traits, a colour left to itself", () => {
    const got = cleanLook(
      { skin: "#ABCDEF", hair: "#123", sheen: "", horns: "", hairStyle: "short", lashes: "none", bg: ["#111111", "#222222", "#333333"] },
      jaina,
    );
    assert.equal(got.skin, "#ABCDEF");
    assert.equal(got.hair, "#123");
    assert.equal(got.sheen, "");
    assert.equal(got.horns, "");
    assert.equal(got.hairStyle, "short");
    assert.equal(got.lashes, "none");
    assert.deepEqual(got.bg, ["#111111", "#222222"]);
    assert.ok(sameLook(cleanLook(got, jaina), got), "checked twice is checked once");
  });

  it("reads the device's looks whatever is in them", () => {
    for (const junk of [null, undefined, 3, "x", [], { queens: 5 }, { queens: { jaina: "pretty" }, you: [] }]) {
      const l = loadLooks(junk);
      assert.deepEqual(l.queens, {});
      assert.equal(l.you, null);
      assert.equal(l.name, A.you.name);
    }
    const l = loadLooks({
      queens: {
        jaina: { ...jaina, hair: "#000000", shape: { jaw: 0.4 } },
        // Just as config.json has her: nothing to keep.
        ysera: { ...C.queens.ysera.look },
        nobody: { skin: "#ffffff" },
      },
      you: { ...A.you.look, headpiece: "none" },
      name: "  Zed<b>  ",
    });
    assert.deepEqual(Object.keys(l.queens), ["jaina"]);
    assert.equal(l.queens.jaina?.hair, "#000000");
    assert.deepEqual(l.queens.jaina?.shape, { jaw: 0.4 });
    assert.equal(l.you?.headpiece, "none");
    assert.equal(l.name, "Zedb");
    // Yours, when it is just the look you start with, is not kept either.
    assert.equal(loadLooks({ you: { ...A.you.look } }).you, null);
  });

  it("keeps a name short and plain", () => {
    assert.equal(cleanName("Ax"), "Ax");
    assert.equal(cleanName(""), A.you.name);
    assert.equal(cleanName("<<>>"), A.you.name);
    assert.equal(cleanName(42), A.you.name);
    assert.equal(Array.from(cleanName("x".repeat(40))).length, NAME_MAX);
    assert.equal(cleanName("Élan d'Or"), "Élan d'Or");
  });
});

describe("a look thrown together", () => {
  it("is always sound and always draws", () => {
    const rand = rng(20261116);
    const seen = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const look = randomLook(rand);
      assert.ok(sameLook(cleanLook(look, look), look), "nothing in it needs mending");
      for (const v of Object.values(look.shape ?? {}))
        assert.ok(Math.abs(v) <= A.random + 1e-9, "no slider pushed past court.atelier.random");
      assert.equal(look.shape?.figure, undefined, "where she stands is left alone");
      const svg = draw(look);
      assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
      seen.add(svg);
    }
    assert.ok(seen.size > 140, "nearly every one different");
  });

  it("is the same again from the same numbers", () => {
    assert.deepEqual(randomLook(rng(7)), randomLook(rng(7)));
  });
});

describe("looks laid over config.json's", () => {
  it("draws a queen from her new look at once, and from the original again when it is taken away", () => {
    const before = queenPortrait("jaina", { mood: "smile" });
    const rev = looksRev();
    let told = 0;
    const stop = subscribeLooks(() => {
      told += 1;
    });
    setLook("jaina", { ...jaina, hair: "#000000", shape: { jaw: 1 } });
    assert.equal(lookOf("jaina").hair, "#000000");
    assert.ok(looksRev() > rev);
    assert.equal(told, 1);
    const changed = queenPortrait("jaina", { mood: "smile" });
    assert.notEqual(changed, before);
    // Another queen is as she was.
    assert.equal(lookOf("ysera"), C.queens.ysera.look);
    setLook("jaina", null);
    assert.equal(lookOf("jaina"), C.queens.jaina.look);
    assert.equal(queenPortrait("jaina", { mood: "smile" }), before);
    stop();
    setLook("jaina", null);
    assert.equal(told, 2, "no longer told once it stops listening");
  });

  it("draws you from your own look", () => {
    assert.deepEqual(youLook(), A.you.look);
    const before = youPortrait();
    setLook("you", { ...(A.you.look as Look), headpiece: "none", hair: "#ff0000" });
    assert.equal(youLook().hair, "#ff0000");
    assert.notEqual(youPortrait(), before);
    setLook("you", null);
    assert.equal(youPortrait(), before);
    assert.equal(originalLook("you"), A.you.look);
    assert.equal(originalLook("jaina"), C.queens.jaina.look);
  });
});

describe("a whole figure", () => {
  it("stands in every outfit, in both builds, standing and stepping", () => {
    const seen = new Set<string>();
    for (const [outfit] of TRAITS.outfit.options)
      for (const [body] of TRAITS.body.options)
        for (const step of [0, 1, -1]) {
          const svg = figureSvg({ ...jaina, outfit, body }, "#7fb8ff", { step });
          assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${outfit} ${body}`);
          assert.ok(!/NaN|undefined/.test(svg), `${outfit} ${body} ${step}: every number is one`);
          seen.add(svg);
        }
    assert.equal(seen.size, TRAITS.outfit.options.length * 2 * 3, "each one different");
  });

  it("is drawn for every queen and for you", () => {
    for (const q of Object.keys(C.queens) as CourtQueenKey[])
      assert.ok(figureSvg(C.queens[q].look as Look, C.queens[q].color).includes("fskin"));
    assert.equal((A.you.look as Look).body, "masculine");
  });
});
