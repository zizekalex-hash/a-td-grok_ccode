import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { colorsOf, loadTheme, newTheme, THEME_BOOT, THEMES, themeVars } from "./theme.ts";

describe("theme: the look", () => {
  it("void crystal and compact to start; a saved look checked", () => {
    const t = newTheme();
    assert.equal(t.id, "void");
    assert.equal(t.density, "compact");
    assert.equal(colorsOf(t).on, "#8b5cf6");
    const back = loadTheme({
      id: "custom",
      density: "comfortable",
      custom: { bg: "#112233", accent: "#ABCDEF", on: "nope", hi: 7 },
    });
    assert.equal(back.id, "custom");
    assert.equal(back.density, "comfortable");
    assert.equal(back.custom.bg, "#112233");
    assert.equal(back.custom.accent, "#abcdef");
    assert.equal(back.custom.on, THEMES[0]!.colors.on, "a colour that is not one: as it was");
    assert.equal(loadTheme({ id: "plaid", density: "huge" }).id, "void");
    assert.equal(loadTheme(null).density, "compact");
  });
  it("puts its colours where the page reads them (cyan: the accent, violet: on, gold: what stands out)", () => {
    const v = themeVars(loadTheme({ id: "rose" }));
    const rose = THEMES.find((x) => x.id === "rose")!.colors;
    assert.equal(v["--color-cyan"], rose.accent);
    assert.equal(v["--color-violet"], rose.on);
    assert.equal(v["--color-gold"], rose.hi);
    assert.equal(v["--color-bg"], rose.bg);
  });
  it("its first script runs, and puts the saved look on (a broken save: the stylesheet's void crystal)", () => {
    const props: Record<string, string> = {};
    const attrs: Record<string, string> = {};
    const fake = (saved: string | null) => ({
      localStorage: { getItem: () => saved },
      document: {
        documentElement: {
          style: { setProperty: (k: string, v: string) => (props[k] = v) },
          setAttribute: (k: string, v: string) => (attrs[k] = v),
        },
      },
    });
    const run = (saved: string | null) =>
      new Function("localStorage", "document", THEME_BOOT)(
        fake(saved).localStorage,
        fake(saved).document,
      );
    run(JSON.stringify({ id: "emerald", density: "comfortable" }));
    assert.equal(props["--color-cyan"], THEMES.find((x) => x.id === "emerald")!.colors.accent);
    assert.equal(attrs["data-density"], "comfortable");
    for (const k of Object.keys(props)) delete props[k];
    run("{not json");
    assert.equal(
      props["--color-cyan"],
      undefined,
      "nothing put on: the stylesheet's own (void crystal)",
    );
    run(JSON.stringify({ id: "custom", custom: { accent: "#123456", bg: "bad" } }));
    assert.equal(props["--color-cyan"], "#123456");
    assert.equal(props["--color-bg"], THEMES[0]!.colors.bg, "a colour that is not one: void's");
  });
});
