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
  canPour,
  newTalk,
  opensUp,
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
const W = CONFIG.court.wine;

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
    bottles: 0,
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
    assert.deepEqual([back.sound.phrase, back.sound.lines], [true, true]);
    // A save from before the talk screen, and a broken one.
    const old = newSave();
    loadTalk(old, {});
    assert.deepEqual(old.tried.jaina, []);
    assert.equal(old.talked.day, 0);
    loadTalk(old, { tried: { jaina: ["sweet", "nonsense", 3] }, talked: { day: "x", count: { jaina: -4 } }, sound: { phrase: false } });
    assert.deepEqual(old.tried.jaina, ["sweet"]);
    assert.equal(old.talked.count.jaina, 0);
    assert.deepEqual([old.sound.phrase, old.sound.lines], [false, true]);
  });
});

describe("the talk screen: long talks never break", () => {
  it("always has something to say next, in whole words, for every queen in every state", () => {
    const bad = /[{}]|undefined|null|NaN|\[object/;
    const states: Partial<TalkContext>[] = [
      {},
      { tier: 0 },
      { tier: 5, feeling: "satisfied", passes: 300 },
      { jealous: true, rival: "Azshara", feeling: "jealous" },
      { wish: { count: 15, skill: "Lore" } },
      { wish: { count: 40, skill: "Charisma" }, tier: 4, feeling: "seeking" },
      { feeling: "lonely", tier: 3 },
      { feeling: "distant", tier: 1 },
      { bottles: 3, tier: 3 },
      { bottles: 1, tier: 5, feeling: "satisfied", passes: 300 },
    ];
    let turns = 0;
    for (const q of QUEEN_KEYS) {
      states.forEach((over, k) => {
        const rand = seeded(1000 + QUEEN_KEYS.indexOf(q) * 31 + k);
        const c = ctx(over);
        const t = newTalk(q);
        // A long talk: whatever comes up, never goodbye till the end.
        for (let i = 0; i < 60; i++) {
          const list = choicesFor(t, c, rand);
          assert.ok(list.length >= 2, `${q}/${k}: turn ${i} offers something besides goodbye`);
          assert.equal(new Set(list.map((x) => x.id)).size, list.length, `${q}/${k}: no choice twice`);
          for (const x of list)
            assert.ok(x.text.trim() && !bad.test(x.text), `${q}/${k}: choice "${x.text}"`);
          const others = list.filter((x) => x.kind !== "bye");
          const pick = others[Math.floor(rand() * others.length)]!;
          const r = replyTo(t, pick, c, rand);
          assert.ok(r.lines.length >= 1, `${q}/${k}: she answers "${pick.text}"`);
          for (const line of r.lines)
            assert.ok(line.trim() && !bad.test(line), `${q}/${k}: her line "${line}"`);
          assert.equal(r.ended, false, `${q}/${k}: only goodbye ends a talk`);
          assert.ok(Number.isFinite(r.affection), `${q}/${k}: affection is a number`);
          turns += 1;
        }
        // A question of hers is answered first (the screen's Leave button aside); then goodbye is there.
        let list = choicesFor(t, c, rand);
        if (!list.some((x) => x.kind === "bye")) {
          assert.ok(list.every((x) => x.kind === "reply"), `${q}/${k}: only her question holds goodbye back`);
          replyTo(t, list[0]!, c, rand);
          list = choicesFor(t, c, rand);
        }
        const bye = list.find((x) => x.kind === "bye");
        assert.ok(bye, `${q}/${k}: goodbye is there once her question is answered`);
        const last = replyTo(t, bye, c, rand);
        assert.equal(last.ended, true);
        assert.ok(last.lines.length >= 1 && !bad.test(last.lines.join(" ")), `${q}/${k}: her goodbye`);
      });
    }
    assert.equal(turns, QUEEN_KEYS.length * states.length * 60);
  });
});

describe("the talk screen: crystal wine", () => {
  const bottle = (over: Partial<TalkContext> = {}) => ctx({ bottles: 2, tier: 3, ...over });

  it("offers the bottle first, only with a bottle, from the tier, and never while she is jealous", () => {
    const q: QueenKey = "azshara";
    assert.equal(find(choicesFor(newTalk(q), ctx(), seeded(1)), "pour").length, 0, "no bottle, nothing to pour");
    const list = choicesFor(newTalk(q), bottle(), seeded(1));
    assert.equal(list[0]!.kind, "pour", "the bottle comes first");
    assert.equal(find(list, "pour").length, 1);
    assert.equal(list[list.length - 1]!.kind, "bye", "goodbye still comes last");
    assert.ok(list[0]!.text.trim() && !/[{}]/.test(list[0]!.text));
    assert.equal(canPour(newTalk(q), bottle()), true);
    assert.equal(canPour(newTalk(q), bottle({ tier: W.minTier - 1 })), false, "she is not fond enough yet");
    assert.equal(canPour(newTalk(q), bottle({ jealous: true, rival: "Jaina" })), false, "she is jealous");
    assert.equal(canPour(newTalk(q), bottle({ bottles: 0 })), false);
  });

  it("holds the bottle back while she waits for your answer to her question", () => {
    const q: QueenKey = "ysera";
    const t = newTalk(q);
    t.asked = herAsks()[0]!;
    assert.ok(choicesFor(t, bottle(), seeded(2)).every((c) => c.kind === "reply"));
    t.asked = null;
    assert.equal(choicesFor(t, bottle(), seeded(2))[0]!.kind, "pour");
  });

  it("pours: affection outside the day's limit, a bottle used, then deeper things to ask for a few sips", () => {
    for (const q of QUEEN_KEYS) {
      const rand = seeded(5 + QUEEN_KEYS.indexOf(q));
      const t = newTalk(q);
      const c = bottle();
      const pour = choicesFor(t, c, rand)[0]!;
      const r = replyTo(t, pour, c, rand);
      assert.equal(r.poured, true, q);
      assert.equal(r.free, true);
      assert.equal(r.affection, W.pour);
      assert.equal(t.wine, W.sips);
      assert.equal(r.lines.length, 1);
      assert.ok(r.lines[0]!.trim() && !/[{}]/.test(r.lines[0]!), `${q}: "${r.lines[0]}"`);
      const asked: string[] = [];
      for (let sip = 1; sip <= W.sips; sip++) {
        const list = choicesFor(t, c, rand);
        assert.equal(find(list, "exotic").length, W.choices, `${q}: sip ${sip} offers ${W.choices} deeper things`);
        assert.equal(list.length, W.choices + 1, "only those, and goodbye");
        assert.equal(list[list.length - 1]!.kind, "bye");
        assert.equal(find(list, "pour").length, 0, "the bottle is open already");
        for (const x of list) assert.ok(x.text.trim() && !/[{}]/.test(x.text), `${q}: "${x.text}"`);
        const ask = find(list, "exotic")[0]!;
        asked.push(ask.topic!);
        const s = replyTo(t, ask, c, rand);
        assert.equal(s.free, true);
        assert.equal(s.poured, false);
        assert.equal(s.affection, W.sipAffection);
        assert.equal(t.wine, W.sips - sip);
        assert.equal(s.lines.length, sip === W.sips ? 2 : 1, `${q}: the last sip empties the bottle, and she says so`);
        for (const line of s.lines) assert.ok(line.trim() && !/[{}]|undefined|null|NaN/.test(line), `${q}: "${line}"`);
      }
      assert.equal(new Set(asked).size, W.sips, `${q}: each deeper thing is asked once while others are left`);
      // The usual choices return; the bottle is not poured twice in a talk.
      const after = choicesFor(t, c, rand);
      assert.ok(find(after, "topic").length > 0, `${q}: the usual topics are back`);
      assert.equal(find(after, "exotic").length, 0);
      assert.equal(find(after, "pour").length, 0, `${q}: once a talk`);
      assert.equal(canPour(newTalk(q), c), true, "but a new talk can pour another");
    }
  });

  it("adds no line of her own and asks nothing back over the wine, even where the dice would", () => {
    const q: QueenKey = "sylvanas";
    const zero = () => 0;
    const t = newTalk(q);
    const c = bottle();
    const r = replyTo(t, choicesFor(t, c, zero)[0]!, c, zero);
    assert.equal(r.lines.length, 1);
    assert.equal(t.asked, null);
    const s = replyTo(t, find(choicesFor(t, c, zero), "exotic")[0]!, c, zero);
    assert.equal(s.lines.length, 1);
    assert.equal(t.asked, null);
  });

  it("goodbye ends the talk over the wine as it does any other", () => {
    const q: QueenKey = "valeera";
    const rand = seeded(9);
    const t = newTalk(q);
    const c = bottle();
    replyTo(t, choicesFor(t, c, rand)[0]!, c, rand);
    const bye = choicesFor(t, c, rand).find((x) => x.kind === "bye")!;
    assert.equal(replyTo(t, bye, c, rand).ended, true);
  });

  it("keeps the bottles in a save, read defensively", () => {
    const save = newSave();
    assert.equal(save.wine, W.start);
    save.wine = 3;
    save.wineShared.jaina = 2;
    const back = newSave();
    loadTalk(back, JSON.parse(JSON.stringify(save)));
    assert.equal(back.wine, 3);
    assert.equal(back.wineShared.jaina, 2);
    const old = newSave();
    loadTalk(old, {});
    assert.equal(old.wine, W.start, "a save from before the wine");
    assert.equal(old.wineShared.ysera, 0);
    loadTalk(old, { wine: 999, wineShared: { jaina: -3, ysera: "x", tyrande: 7.9 } });
    assert.equal(old.wine, W.max, "never more than the bag holds");
    assert.deepEqual([old.wineShared.jaina, old.wineShared.ysera, old.wineShared.tyrande], [0, 0, 7]);
    loadTalk(old, { wine: -5 });
    assert.equal(old.wine, 0);
    loadTalk(old, { wine: "lots" });
    assert.equal(old.wine, W.start);
  });
});

describe("the talk screen: opening up over the wine, on a date night", () => {
  it("says something deeper in her own voice, never the same thing twice, until there is no more", () => {
    for (const q of QUEEN_KEYS) {
      const rand = seeded(21 + QUEEN_KEYS.indexOf(q));
      const c = ctx({ tier: 3 });
      const told: string[] = [];
      const lines: string[] = [];
      for (let i = 0; i < 100; i++) {
        const line = opensUp(q, told, c, rand);
        if (line === null) break;
        assert.ok(line.trim() && !/[{}]|undefined|null|NaN/.test(line), `${q}: "${line}"`);
        lines.push(line);
      }
      assert.ok(lines.length >= 12, `${q}: at least a dozen before it runs out (${lines.length})`);
      assert.equal(told.length, lines.length, "each one said is remembered");
      assert.equal(new Set(told).size, told.length, `${q}: no answer twice`);
      assert.equal(opensUp(q, told, c, rand), null, `${q}: and then nothing more`);
    }
  });

  it("is her voice, not the same for every queen", () => {
    const a = new Set<string>();
    const b = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const line = (q: QueenKey, set: Set<string>) => set.add(opensUp(q, [], ctx({ tier: 4 }), seeded(100 + i)) ?? "");
      line("sylvanas", a);
      line("eltharia", b);
    }
    assert.ok([...a].every((l) => l.trim()) && [...b].every((l) => l.trim()));
    assert.notDeepEqual([...a].sort(), [...b].sort(), "the same words, dressed differently for each queen");
  });
});
