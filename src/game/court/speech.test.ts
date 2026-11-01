import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import { QUEEN_KEYS, type LineKey } from "./rules.ts";
import { chat, dress, feedLine, fillAll, speak, variety } from "./speech.ts";
import { TOPICS, VOICES } from "./voices.ts";

const C = CONFIG.court;
const KNOWN = new Set([
  "pet",
  "thing",
  "place",
  "region",
  "skill",
  "level",
  "total",
  "gift",
  "time",
  "sister",
  "friend",
  "foe",
  "phrase",
  "count",
  "passes",
]);
const FULL = {
  place: "the Gilded Inn",
  region: "The Realm",
  skill: "Charisma",
  level: 42,
  total: 300,
  gift: "Jewel",
  time: "tonight",
  sister: "Xal'atath",
  friend: "Jaina",
  foe: "Onyxia",
  phrase: "name the signal",
  count: 100,
  passes: 77,
};

/** A steady stand-in for Math.random. */
function seq(seed = 1) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

describe("queens' voices", () => {
  it("gives every queen a full voice, using only known placeholders", () => {
    for (const q of QUEEN_KEYS) {
      const v = VOICES[q];
      assert.ok(v, q);
      assert.ok(v.open.length >= 8 && v.close.length >= 8 && v.warm.length >= 4, q);
      assert.ok(v.pet.length >= 5 && v.things.length >= 5 && v.talk.length >= 8, q);
      assert.ok(v.feed.length >= 4 && v.fed.length >= 4 && v.hungry.length >= 3, q);
      for (const l of [
        ...v.open,
        ...v.close,
        ...v.warm,
        ...v.talk,
        ...v.feed,
        ...v.fed,
        ...v.hungry,
      ])
        for (const [, k] of l.matchAll(/\{(\w+)\}/g))
          assert.ok(KNOWN.has(k!), `${q}: {${k}} in "${l}"`);
      for (const l of v.feed)
        assert.ok(l.includes("{count}") && l.includes("{phrase}"), `${q} feed: ${l}`);
    }
    for (const [name, t] of Object.entries(TOPICS))
      for (const l of [...t.ask, ...t.answer])
        for (const [, k] of l.matchAll(/\{(\w+)\}/g)) assert.ok(KNOWN.has(k!), `${name}: {${k}}`);
  });

  it("has at least a hundred times the lines it had, for every queen and moment", () => {
    for (const q of QUEEN_KEYS)
      for (const key of Object.keys(C.queens[q].lines) as LineKey[]) {
        const before = C.queens[q].lines[key]!.length;
        assert.ok(variety(q, key) >= before * 100, `${q} ${key}: ${variety(q, key)} vs ${before}`);
      }
  });

  it("dresses her lines in her own words, and they really vary", () => {
    const rand = seq(7);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const line = speak("azshara", "greet", rand, FULL, 4);
      assert.ok(!/\{(pet|thing)\}/.test(line), line);
      assert.ok(
        C.queens.azshara.lines.greet!.some((g) => line.includes(g)),
        line,
      );
      seen.add(line);
    }
    assert.ok(seen.size > 40, `only ${seen.size} different greetings`);
    // Old placeholders still fill as before.
    assert.ok(speak("azshara", "jealous", seq(3), { rival: "Onyxia" }).includes("Onyxia"));
    // Not a line just said, when another turns up.
    const once = speak("jaina", "greet", seq(5), FULL);
    assert.notEqual(speak("jaina", "greet", seq(5), FULL, 0, [once]), once);
  });

  it("leaves off an opener the line already starts with", () => {
    const always = () => 0;
    const text = dress("eltharia", "Oh! You came back.", always);
    assert.ok(!text.startsWith("Oh! Oh!"), text);
  });

  it("talks about many things, and only about what she knows", () => {
    const rand = seq(11);
    const topics = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const c = chat("tyrande", rand, FULL, 2);
      topics.add(c.topic);
      assert.ok(!c.ask.includes("{") && !c.answer.includes("{"), `${c.ask} / ${c.answer}`);
    }
    assert.ok(topics.size >= 10, [...topics].join());
    // No sister, friend, rival or phrase: those topics wait.
    for (let i = 0; i < 100; i++) {
      const c = chat("valeera", rand, {
        skill: "Dance",
        level: 3,
        total: 40,
        place: "the Arena",
        gift: "Dagger",
        time: "today",
        region: "Ashen Peaks",
        passes: 1,
      });
      assert.ok(!["sister", "friend", "foe", "reps"].includes(c.topic), c.topic);
      assert.ok(!c.answer.includes("{"), c.answer);
    }
    // Topics just talked about wait when there are others.
    const recent = [
      "day",
      "her",
      "you",
      "sister",
      "friend",
      "foe",
      "place",
      "gift",
      "dream",
      "reps",
      "flirt",
    ];
    assert.equal(chat("jaina", seq(2), FULL, 0, recent).topic, "own");
  });

  it("asks to be fed a set of one of your phrases, and thanks you", () => {
    const ask = feedLine("onyxia", "feed", seq(4), { count: 100, phrase: "xyz" });
    assert.ok(ask.includes("100") && ask.includes("“xyz”"), ask);
    assert.ok(feedLine("onyxia", "fed", seq(4)).length > 0);
    assert.ok(!feedLine("onyxia", "hungry", seq(9)).includes("{"));
    assert.equal(fillAll("{count} × “{phrase}”", { count: 5 }), null, "no phrase, no ask");
  });
});
