import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chosenText, labelOf, textMark, unitsFrom, wholeText, type SourceText } from "./source.ts";
import { loadTalk } from "./converse.ts";
import { newSave } from "./rules.ts";

const text = (key: string, lines: string[], folder?: string): SourceText => ({
  key,
  name: key.toUpperCase(),
  lines,
  ...(folder ? { folder } : {}),
});
const a = text("a", ["The first gate opens slowly. The second one does not open at all."]);
const b = text("b", ["A lamp burns in the window. Nobody lit it, and nobody will put it out."], "Zip");
const MIN = 3;

describe("where a recite's phrases come from", () => {
  it("draws from every text mixed, or from the one chosen", () => {
    const all = unitsFrom([a, b], "", MIN);
    const onlyA = unitsFrom([a, b], "a", MIN);
    const onlyB = unitsFrom([a, b], "b", MIN);
    assert.ok(all.length >= onlyA.length + onlyB.length - 1, "all of them, once each");
    assert.ok(onlyA.every((u) => all.includes(u)) && onlyB.every((u) => all.includes(u)));
    assert.ok(onlyA.every((u) => !onlyB.includes(u)), "each text's phrases are its own");
    assert.ok(onlyA.some((u) => /gate/.test(u)) && !onlyA.some((u) => /lamp/.test(u)));
    // A key no text has (a text since removed): all of them.
    assert.deepEqual(unitsFrom([a, b], "gone", MIN), all);
    assert.deepEqual(unitsFrom([], "", MIN), []);
  });

  it("reads one text whole: the chosen one, or the only one there is", () => {
    assert.equal(wholeText([a, b], "b"), b);
    assert.equal(wholeText([a], ""), a);
    assert.equal(wholeText([a, b], ""), null, "several mixed: no one text to read");
    assert.equal(wholeText([a, b], "gone"), null);
    assert.equal(wholeText([], ""), null);
    assert.equal(chosenText([a, b], "a"), a);
    assert.equal(chosenText([a, b], ""), null);
  });

  it("knows a text by its phrases, and names it for a list", () => {
    const u = unitsFrom([a], "a", MIN);
    assert.equal(textMark("a", u), textMark("a", [...u]));
    assert.notEqual(textMark("a", u), textMark("a", [...u, "One more phrase here."]));
    assert.notEqual(textMark("a", u), textMark("b", u));
    assert.equal(labelOf(a), "A");
    assert.equal(labelOf(b), "Zip · B");
  });

  it("is kept in the save, and read defensively", () => {
    assert.equal(newSave().source, "");
    const s = newSave();
    loadTalk(s, { source: "text-key" });
    assert.equal(s.source, "text-key");
    for (const junk of [null, 5, {}, [], "x".repeat(500)]) {
      loadTalk(s, { source: junk });
      assert.equal(s.source, "");
    }
  });
});
