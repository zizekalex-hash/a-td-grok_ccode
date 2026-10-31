import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accentFor, COUNCIL, pickCouncilLine, QUEEN } from "./council.ts";

const everyLine = COUNCIL.flatMap((s) => Object.values(s.lines).flat());

describe("pickCouncilLine", () => {
  it("returns null for a mood no council member speaks to, so the Queen's own lines are used", () => {
    assert.equal(pickCouncilLine("title", "", () => 0), null);
  });

  it("returns a roster speaker with a line from that speaker's own bank", () => {
    const pick = pickCouncilLine("leak", "", () => 0);
    assert.ok(pick);
    const speaker = COUNCIL.find((s) => s.name === pick.speaker);
    assert.ok(speaker, `unknown speaker ${pick.speaker}`);
    assert.ok(speaker.lines.leak?.includes(pick.text));
  });

  it("does not repeat the previous speaker when someone else can speak the mood", () => {
    for (let i = 0; i < 50; i++) {
      const pick = pickCouncilLine("leak", QUEEN, () => i / 50);
      assert.ok(pick);
      assert.notEqual(pick.speaker, QUEEN);
    }
  });

  it("keeps the only available speaker when no one else can speak the mood", () => {
    const pick = pickCouncilLine("low", "Eltharia", () => 0);
    assert.equal(pick?.speaker, "Eltharia");
  });
});

describe("accentFor", () => {
  it("maps a speaker to their palette class and falls back to the Queen's colour", () => {
    assert.equal(accentFor("Eltharia"), "text-gold");
    assert.equal(accentFor("Nobody"), "text-violet");
  });
});

describe("council lines", () => {
  it("contains no romantic or sexual wording aimed at the player", () => {
    const banned = /seduc|flirt|erotic|sexy|sensual|intimate|romanc|kiss|darling|my king|worship|desire/i;
    for (const line of everyLine) {
      assert.doesNotMatch(line, banned, line);
    }
  });
});
