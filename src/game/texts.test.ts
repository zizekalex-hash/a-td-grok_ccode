import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeTexts } from "./texts.ts";

const t = (name: string, ...lines: string[]) => ({ name, lines });

describe("loaded texts", () => {
  it("adds new texts to those loaded, keeping them all", () => {
    const have = [t("a", "one"), t("b", "two")];
    const r = mergeTexts(have, [t("c", "three")], 30);
    assert.deepEqual(
      r.texts.map((x) => x.name),
      ["a", "b", "c"],
    );
    assert.equal(r.added, 1);
    assert.equal(have.length, 2, "the old list is left as it was");
  });

  it("skips a text already loaded, and numbers a new one with a taken name", () => {
    const have = [t("notes", "one")];
    const r = mergeTexts(
      have,
      [t("notes", "one"), t("copy", "one"), t("notes", "other"), t("notes", "third")],
      30,
    );
    assert.equal(r.already, 2, "the same lines, whatever the name");
    assert.deepEqual(
      r.texts.map((x) => x.name),
      ["notes", "notes (2)", "notes (3)"],
    );
  });

  it("stops at the limit and says how many did not fit", () => {
    const r = mergeTexts([t("a", "1")], [t("b", "2"), t("c", "3"), t("d", "4")], 2);
    assert.equal(r.texts.length, 2);
    assert.equal(r.added, 1);
    assert.equal(r.full, 2);
    assert.equal(mergeTexts([], [t("e")], 5).added, 0, "an empty text is not added");
  });
});
