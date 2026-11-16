/**
 * The talk screen's rules: what you can say each turn, how each queen takes a
 * tone, what an exchange is worth and what a save keeps of it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import { newSave, QUEEN_KEYS, type QueenKey } from "./rules.ts";
import { bondsOf } from "./hearts.ts";
import {
  choicesFor,
  countTalk,
  knownTaste,
  loadTalk,
  markTried,
  newTalk,
  replyTo,
  talksLeft,
  talkVariety,
  tasteOf,
  TONES,
  type Choice,
  type TalkContext,
} from "./converse.ts";
import { FEELING_KEYS, herAsks, TONE_KEYS } from "./talk.ts";

const T = CONFIG.court.talk;

/** A small seeded generator, so a test's talk is the same every run. */
function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function ctx(over: Partial<TalkContext> = {}): TalkContext {
  return {
    tier: 2,
    fill: {
      place: "Azshara's Palace",
      region: "the Realm",
      skill: "Lore",
      level: 40,
      total: 600,
      gift: "the Jewel of the Tides",
      time: "this evening",
      phrase: "name the signal",
      passes: "120",
    },
    feeling: "calm",
    jealous: false,
    rival: "",
    wish: null,
    passes: 0,
    ...over,
  };
}

const find = (list: Choice[], kind: string) => list.filter((c) => c.kind === kind);

describe("the talk screen: tastes", () => {
  it("gives every queen a tone she loves, one she likes and one she dislikes, all different", () => {
    for (const q of QUEEN_KEYS) {
      const t = T.tastes[q];
      assert.ok(t, `${q} has tastes`);
      const set = [t.loved, t.liked, t.disliked];
      for (const tone of set) assert.ok((TONE_KEYS as readonly string[]).includes(tone), `${q}: ${tone}`);
      assert.equal(new Set(set).size, 3, `${q}: three different tones`);
      assert.equal(tasteOf(q, t.loved), "loved");
      assert.equal(tasteOf(q, t.liked), "liked");
      assert.equal(tasteOf(q, t.disliked), "disliked");
      assert.equal(TONES.filter((tone) => tasteOf(q, tone) === "plain").length, 2);
    }
    // Every tone is some queen's favourite, so each is worth learning.
    for (const tone of TONES)
      assert.ok(QUEEN_KEYS.some((q) => T.tastes[q].loved === tone), `someone loves ${tone}`);
    assert.ok(T.affection.loved > T.affection.liked && T.affection.liked > T.affection.plain);
    assert.ok(T.affection.disliked < 0);
  });
});

describe("the talk screen: what you can say", () => {
  it("offers topics, tones, a rarer question and goodbye, each choice once", () => {
    for (const q of QUEEN_KEYS) {
      const rand = seeded(7);
      const t = newTalk(q);
      const list = choicesFor(t, ctx(), rand);
      assert.equal(find(list, "topic").length, T.topics, `${q}: topics`);
      assert.equal(find(list, "tone").length, T.tones, `${q}: tones`);
      assert.equal(find(list, "bye").length, 1);
      assert.equal(list[list.length - 1]!.kind, "bye", "goodbye comes last");
      assert.equal(new Set(list.map((c) => c.id)).size, list.length, "no choice twice");
      for (const c of list) {
        assert.ok(c.text.trim(), "every choice says something");
        assert.ok(!/[{}]/.test(c.text), `${q}: a placeholder left in "${c.text}"`);
      }
      const tones = find(list, "tone").map((c) => c.tone);
      assert.equal(new Set(tones).size, tones.length, "two different tones");
    }
  });

  it("brings every tone round within a few turns", () => {
    const rand = seeded(3);
    const t = newTalk("azshara");
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) for (const c of find(choicesFor(t, ctx(), rand), "tone")) seen.add(c.tone!);
    assert.equal(seen.size, TONES.length);
  });

  it("offers a follow-up on the topic just talked about, with another answer", () => {
    const rand = seeded(11);
    const t = newTalk("jaina");
    const c0 = ctx();
    const topic = find(choicesFor(t, c0, rand), "topic")[0]!;
    const first = replyTo(t, topic, c0, rand);
    assert.equal(t.last, topic.topic);
    const again = choicesFor(t, c0, rand);
    const more = find(again, "more")[0];
    assert.ok(more, "tell me more is offered");
    assert.equal(find(again, "topic").length, T.topics - 1, "in a topic's place");
    const told = [...t.told];
    replyTo(t, more, c0, rand);
    assert.ok(t.told.length > told.length, "she says something she had not said");
    assert.ok(first.lines[0]);
  });

  it("asks for her wish first while she has one, and each rarer question once a talk", () => {
    const rand = seeded(5);
    const t = newTalk("ysera");
    const c0 = ctx({ wish: { count: 15, skill: "Lore" }, passes: 40 });
    const wish = find(choicesFor(t, c0, rand), "wish")[0];
    assert.ok(wish, "the wish is offered at the start");
    const r = replyTo(t, wish, c0, rand);
    assert.equal(r.toldWish, true);
    assert.ok(/15/.test(r.lines[0]!) || /Lore/.test(r.lines[0]!), `her wish: ${r.lines[0]}`);
    for (let i = 0; i < 12; i++) {
      const list = choicesFor(t, c0, rand);
      assert.equal(find(list, "wish").length, 0, "not asked twice");
      const next = list.find((c) => c.kind !== "bye" && c.kind !== "reply") ?? list[0]!;
      t.asked = null;
      replyTo(t, next, c0, rand);
    }
  });

  it("asks about her sisters, friends and rivals by name", () => {
    const q: QueenKey = "azshara";
    const names = bondsOf(q).map((b) => CONFIG.court.queens[b.queen].name);
    assert.ok(names.length > 0);
    const seenNames = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const t = newTalk(q);
      for (const c of find(choicesFor(t, ctx(), seeded(seed)), "bond")) {
        assert.ok(c.other);
        seenNames.add(CONFIG.court.queens[c.other!].name);
        assert.ok(c.text.includes(CONFIG.court.queens[c.other!].name));
      }
    }
    assert.deepEqual([...seenNames].sort(), [...names].sort());
  });
});

describe("the talk screen: what she answers", () => {
  it("takes a tone as her tastes say, with affection and a mood to match", () => {
    for (const q of QUEEN_KEYS) {
      for (const tone of TONES) {
        const t = newTalk(q);
        const r = replyTo(t, { id: `tone:${tone}`, kind: "tone", text: "x", tone }, ctx(), () => 0.99);
        const taste = tasteOf(q, tone);
        assert.equal(r.taste, taste);
        assert.equal(r.affection, T.affection[taste]);
        assert.ok(r.lines[0] && !/[{}]/.test(r.lines[0]), `${q} ${tone}: ${r.lines[0]}`);
        if (taste === "loved") assert.ok(r.mood === "delighted" || r.mood === "smitten");
        if (taste === "disliked") assert.equal(r.mood, "aloof");
        if (taste === "plain") assert.equal(r.mood, null);
        assert.equal(r.ended, false);
      }
    }
  });

  it("answers how she feels, for every feeling", () => {
    for (const feeling of FEELING_KEYS) {
      const t = newTalk("tyrande");
      const r = replyTo(t, { id: "feeling", kind: "feeling", text: "x" }, ctx({ feeling }), () => 0.99);
      assert.ok(r.lines[0], feeling);
      assert.ok(t.done.includes("feeling"));
    }
  });

  it("ends on goodbye, warmly when she is fond of you", () => {
    const cold = replyTo(newTalk("sylvanas"), { id: "bye", kind: "bye", text: "x" }, ctx({ tier: 0 }), seeded(2));
    const warm = replyTo(newTalk("sylvanas"), { id: "bye", kind: "bye", text: "x" }, ctx({ tier: 4 }), seeded(2));
    assert.equal(cold.ended, true);
    assert.equal(warm.ended, true);
    assert.equal(cold.affection, 0);
    assert.notEqual(cold.lines[0], warm.lines[0]);
  });

  it("sometimes asks you something back: your answers then are tones, and she takes them as such", () => {
    const q: QueenKey = "onyxia";
    // moreChance and askChance both met by a low roll at the end.
    let k = 0;
    const rolls = [0.5, 0.5, 0.5, 0.99, 0.99, 0.01, 0.5, 0.01, 0.5];
    const rand = () => rolls[Math.min(rolls.length - 1, k++)]!;
    const t = newTalk(q);
    const topic = find(choicesFor(t, ctx(), seeded(4)), "topic")[0]!;
    let r = replyTo(t, topic, ctx(), rand);
    for (let seed = 1; !t.asked && seed < 200; seed++) {
      const t2 = newTalk(q);
      r = replyTo(t2, topic, ctx(), seeded(seed));
      if (t2.asked) Object.assign(t, t2);
    }
    assert.ok(t.asked, "she asks something");
    assert.ok(r.lines.length >= 2, "her question comes after her answer");
    const answers = choicesFor(t, ctx(), seeded(1));
    assert.ok(answers.length >= 2 && answers.every((c) => c.kind === "reply" && c.tone));
    const pickOne = answers[0]!;
    const back = replyTo(t, pickOne, ctx(), seeded(1));
    assert.equal(back.taste, tasteOf(q, pickOne.tone!));
    assert.equal(t.asked, null, "the question is answered");
    assert.equal(back.lines.length, 1, "no new question straight after her own");
  });

  it("never asks the same thing twice in a talk", () => {
    const t = newTalk("valeera");
    const asked: string[] = [];
    const rand = seeded(9);
    for (let i = 0; i < 80; i++) {
      t.asked = null;
      replyTo(t, { id: "tone:bold", kind: "tone", text: "x", tone: "bold" }, ctx(), rand);
      if (t.asked) asked.push((t.asked as { ask: string }).ask);
    }
    assert.equal(new Set(asked).size, asked.length);
    assert.ok(asked.length <= herAsks().length);
  });
});

describe("the talk screen: jealousy", () => {
  it("turns the tones into apologies, and one she loves or likes eases her", () => {
    const q: QueenKey = "azshara";
    const c0 = ctx({ jealous: true, rival: "Tyrande" });
    const t = newTalk(q);
    const list = choicesFor(t, c0, seeded(3));
    const sorry = find(list, "sorry");
    assert.equal(find(list, "tone").length, 0);
    assert.equal(sorry.length, T.tones + 1, "one more apology than tones, to find the right one");
    const loved = T.tastes[q].loved;
    const good = replyTo(t, { id: `sorry:${loved}`, kind: "sorry", text: "x", tone: loved as never }, c0, seeded(1));
    assert.equal(good.soothed, true);
    assert.equal(good.lines.length, 1, "no small talk while she is angry");
    // Once eased in this talk, the tones are ordinary again.
    assert.equal(find(choicesFor(t, c0, seeded(2)), "sorry").length, 0);
    const bad = replyTo(
      newTalk(q),
      { id: "sorry:x", kind: "sorry", text: "x", tone: T.tastes[q].disliked as never },
      c0,
      seeded(1),
    );
    assert.equal(bad.soothed, false);
    assert.ok(bad.affection < 0);
  });
});

describe("the talk screen: variety, and what a save keeps", () => {
  it("has thousands of different exchanges for every queen", () => {
    for (const q of QUEEN_KEYS) assert.ok(talkVariety(q) > 5000, `${q}: ${talkVariety(q)}`);
  });

  it("counts a day's exchanges with each queen, and starts again the next day", () => {
    const save = newSave();
    const q: QueenKey = "jaina";
    assert.equal(talksLeft(save, q, 100), T.perDay);
    for (let i = 0; i < T.perDay; i++) assert.equal(countTalk(save, q, 100), true);
    assert.equal(countTalk(save, q, 100), false, "the day's exchanges are used up");
    assert.equal(talksLeft(save, q, 100), 0);
    assert.equal(talksLeft(save, "ysera", 100), T.perDay, "each queen has her own");
    assert.equal(talksLeft(save, q, 101), T.perDay, "a new day");
    assert.equal(countTalk(save, q, 101), true);
    assert.equal(save.talked.count[q], 1);
  });

  it("remembers the tones tried on a queen, and reads a save defensively", () => {
    const save = newSave();
    assert.equal(knownTaste(save, "azshara", "humble"), null);
    markTried(save, "azshara", "humble");
    markTried(save, "azshara", "humble");
    assert.deepEqual(save.tried.azshara, ["humble"]);
    assert.equal(knownTaste(save, "azshara", "humble"), "loved");
    const back = newSave();
    loadTalk(back, JSON.parse(JSON.stringify(save)));
    assert.deepEqual(back.tried.azshara, ["humble"]);
    assert.deepEqual(back.sound, { phrase: true, lines: true });
    // A save from before the talk screen, and a broken one.
    const old = newSave();
    loadTalk(old, {});
    assert.deepEqual(old.tried.jaina, []);
    assert.equal(old.talked.day, 0);
    loadTalk(old, { tried: { jaina: ["sweet", "nonsense", 3] }, talked: { day: "x", count: { jaina: -4 } }, sound: { phrase: false } });
    assert.deepEqual(old.tried.jaina, ["sweet"]);
    assert.equal(old.talked.count.jaina, 0);
    assert.deepEqual(old.sound, { phrase: false, lines: true });
  });
});
