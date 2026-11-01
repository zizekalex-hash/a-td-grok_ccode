import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import { xpForLevel } from "../recite.ts";
import {
  advance,
  affectionGain,
  firstGate,
  gateOf,
  queensIn,
  REGION_KEYS,
  regionOf,
  GIFT_KEYS,
  giftValue,
  isSkill,
  lettersIn,
  meetsNeed,
  newSave,
  passAt,
  passXp,
  phrasesOf,
  pickPhrase,
  QUEEN_KEYS,
  queenAt,
  queenLine,
  SKILL_KEYS,
  skillAt,
  startSession,
  streakMult,
  passMs,
  nextRound,
  skipPhrase,
  tapComplete,
  timeLeft,
  tierOf,
  totalLevel,
  wordsIn,
  type LineKey,
  type QueenKey,
  type Reward,
  type Session,
  bonusReward,
} from "./rules.ts";
import {
  cellAt,
  destinationFor,
  parseWorld,
  pathTo,
  PLACE_KEYS,
  placesIn,
  walkable,
  type World,
} from "./world.ts";
import {
  canBlink,
  portraitAirSvg,
  placeBanner,
  portraitSvg,
  queenAir,
  queenPortrait,
  shade,
} from "./portrait.ts";
import {
  alpha,
  BUILDING_STYLE,
  hash,
  nightLevel,
  PALETTES,
  runsOf,
  sceneOf,
  walkerAt,
} from "./art.ts";
import { ADORNMENTS, closedOutfit, OUTFITS, outfitOf, scene } from "./attire.ts";
import {
  baseMood,
  MOODS,
  countWish,
  GALLERY_SIZE,
  hasSeen,
  hoursAway,
  jealousMult,
  loadHearts,
  markSeen,
  memoryAt,
  missesYou,
  moodOf,
  seenCount,
  soothe,
  stirJealousy,
  wishOf,
  bondOf,
  bondsOf,
  goodWord,
  rivalsOf,
  ARC_KEYS,
  arcMult,
  arcOf,
  setArc,
} from "./hearts.ts";
import { comeOutChance, encounterOf, foundKind, pairKey, presenceLine } from "./presence.ts";
import {
  addNews,
  ago,
  bondTalk,
  buzzMult,
  buzzOf,
  fillLine,
  loadNews,
  makeRumor,
  RUMOR_KINDS,
  rumorsNow,
  unreadNews,
} from "./news.ts";

const C = CONFIG.court;

/** A session on a known phrase: 4 words at 100 ms each, so a pass lasts 400 ms. */
function session(
  o: Partial<{ reps: number; round: number; queen: Session["queen"]; date: boolean }> = {},
): Session {
  return startSession(
    {
      place: "yard",
      skill: "strength",
      queen: o.queen ?? null,
      date: o.date ?? false,
      wordMs: 100,
      reps: o.reps ?? 3,
      round: o.round ?? 3,
    },
    "Keep the light steady.",
    0,
  );
}

describe("court world", () => {
  for (const region of REGION_KEYS) {
    describe(C.regions[region].name, () => {
      const w = parseWorld(region);
      const map = C.regions[region].map;
      const startAt = C.regions[region].start as [number, number];

      it("reads the map, with a door for every place in the region", () => {
        assert.equal(w.rows, map.length);
        assert.ok(
          map.every((r) => r.length === w.cols),
          "every map row is as long as the first",
        );
        for (const key of placesIn(region))
          assert.ok(w.doors[key], `${key} has a door or spot on the map`);
      });

      it("lets you walk from the start to every place and every queen", () => {
        assert.ok(walkable(w, startAt[0], startAt[1]), "the start is walkable");
        for (const key of placesIn(region))
          assert.ok(pathTo(w, startAt, w.doors[key]!), `no way to ${key}`);
        for (const q of queensIn(region)) {
          const [c, r] = C.queens[q].at as [number, number];
          assert.ok(walkable(w, c, r), `${q} stands on open ground`);
          assert.ok(pathTo(w, startAt, [c, r]), `no way to ${q}`);
        }
      });
    });
  }

  it("links regions with gates both ways, and the way back is always open", () => {
    for (const key of PLACE_KEYS) {
      const g = gateOf(key);
      if (!g) continue;
      assert.equal(regionOf(g.toPlace), g.to, `${key} leads to a place in ${g.to}`);
      const back = gateOf(g.toPlace);
      assert.ok(
        back && back.to === regionOf(key) && back.toPlace === key,
        `${g.toPlace} leads back to ${key}`,
      );
    }
    assert.equal(gateOf("isles_ferry")!.need.level, 0, "you can always go home");
    assert.equal(gateOf("peaks_road")!.need.level, 0);
    assert.ok(
      gateOf("to_isles")!.need.level > 0 &&
        gateOf("to_peaks")!.need.level > gateOf("to_isles")!.need.level,
    );
  });

  it("finds the gate to walk to on the way to another region", () => {
    assert.equal(firstGate("realm", "realm"), null);
    assert.equal(firstGate("realm", "isles"), "to_isles");
    assert.equal(
      firstGate("isles", "peaks"),
      "isles_ferry",
      "the isles reach the peaks through the realm",
    );
    assert.equal(firstGate("peaks", "realm"), "peaks_road");
  });

  it("walks around buildings, trees and water, one step at a time", () => {
    const w = parseWorld("realm");
    const startAt = C.regions.realm.start as [number, number];
    const to = w.doors.mine!;
    const path = pathTo(w, startAt, to)!;
    let at = startAt;
    for (const step of path) {
      assert.equal(Math.abs(step[0] - at[0]) + Math.abs(step[1] - at[1]), 1, "one cell per step");
      assert.ok(walkable(w, step[0], step[1]));
      at = step;
    }
    assert.deepEqual(at, to);
  });

  it("sends a tap on a building to its door, and a tap on a tree beside it", () => {
    const w = parseWorld("realm");
    const b = w.buildings.inn!;
    assert.deepEqual(destinationFor(w, b.c0, b.r0), w.doors.inn);
    assert.equal(cellAt(w, 0, 0)?.terrain, "tree");
    const near = destinationFor(w, 0, 0);
    assert.ok(near && walkable(w, near[0], near[1]));
  });

  it("keeps lava and water out of reach, and sand and ash underfoot", () => {
    const peaks = parseWorld("peaks");
    const lava = peaks.cells.flat().filter((c) => c.terrain === "lava");
    assert.ok(lava.length > 0 && lava.every((c) => !c.walk));
    assert.ok(peaks.cells.flat().some((c) => c.terrain === "ash" && c.walk));
    assert.ok(
      parseWorld("isles")
        .cells.flat()
        .some((c) => c.terrain === "sand" && c.walk),
    );
  });
});

describe("court config", () => {
  it("names real skills, places and gifts everywhere", () => {
    for (const key of PLACE_KEYS) {
      const p = C.places[key];
      for (const style of ["fire", "water"] as const)
        assert.ok(p[style] === "" || isSkill(p[style]), `${key}.${style}`);
      assert.ok(REGION_KEYS.includes(p.region as never), `${key}.region`);
    }
    for (const q of QUEEN_KEYS) {
      const spec = C.queens[q];
      assert.ok(PLACE_KEYS.includes(spec.place as never), `${q}.place`);
      assert.ok(spec.element === "fire" || spec.element === "water", `${q}.element`);
      assert.ok(spec.favored.every(isSkill), `${q}.favored`);
      assert.ok(GIFT_KEYS.includes(spec.gift as never), `${q}.gift`);
      assert.ok(
        spec.need.skill === "" || spec.need.skill === "total" || isSkill(spec.need.skill),
        `${q}.need`,
      );
      for (const k of Object.keys(spec.lines) as LineKey[])
        assert.ok(spec.lines[k].length > 0, `${q}.lines.${k}`);
    }
    const tiers = C.affectionTiers;
    assert.equal(tiers[0]?.at, 0);
    for (let i = 1; i < tiers.length; i++) assert.ok(tiers[i]!.at > tiers[i - 1]!.at, "tiers rise");
    assert.ok(C.wordMsMin <= C.wordMs && C.wordMs <= C.wordMsMax);
    for (const s of SKILL_KEYS)
      assert.ok(C.skills[s].element === "fire" || C.skills[s].element === "water");
  });
});

describe("court phrases", () => {
  it("counts letters and splits sectors at sentence ends", () => {
    assert.equal(lettersIn("Hi, you two!"), 8);
    assert.deepEqual(
      phrasesOf("One two. Three four five! Six").map((p) => p.join(" ")),
      ["One two.", "Three four five!", "Six"],
    );
  });

  it("picks phrases from the loaded texts, within the length limits", () => {
    const texts = [
      [
        "Short one. A much longer sentence that keeps going and going for quite a few words in a row here.",
      ],
      ["Another text entirely, with its own words."],
    ];
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const all = new Set(texts.flat().join(" ").split(/\s+/));
    const sentences = new Set([
      "Short one. A much longer sentence that keeps going and going for quite a few words in a row here.",
      "A much longer sentence that keeps going and going for quite a few words in a row here.",
      "Another text entirely, with its own words.",
    ]);
    for (let i = 0; i < 50; i++) {
      const p = pickPhrase(texts, rand, 3, 30);
      assert.ok(wordsIn(p).length >= 3, p);
      for (const word of wordsIn(p)) assert.ok(all.has(word), `${word} comes from the texts`);
      // Always whole sentences: never a slice out of the middle of one.
      assert.ok(sentences.has(p), `"${p}" is whole`);
    }
  });

  it("never cuts a sentence: a long one comes whole when nothing shorter turns up", () => {
    const long =
      "Neuromodulatory catecholaminergic projections from the locus coeruleus continuously recalibrate cortical responsiveness, attentional gain, and wakefulness-promoting excitability throughout extraordinarily demanding cognitive circumstances.";
    const rand = () => 0.5;
    assert.equal(pickPhrase([[long]], rand, 3, 10), long);
    // With a shorter sentence around, the shorter one is preferred.
    const mixed = [[long + " Then a short one ends it."]];
    let seed = 7;
    const r2 = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const seen = new Set(Array.from({ length: 20 }, () => pickPhrase(mixed, r2, 3, 10)));
    assert.ok(seen.has("Then a short one ends it."));
    for (const p of seen) assert.ok(p === long || p === "Then a short one ends it.", p);
  });
});

describe("court recite sessions", () => {
  const next = () => "A fresh phrase arrives here.";
  /** Lets the words of the pass finish, then taps: what the tap paid. */
  const complete = (s: Session, elixir = false) => {
    const at = s.start + passMs(s);
    advance(s, at);
    return tapComplete(s, at, next, elixir);
  };
  const pass = (r: Reward[]) =>
    r.find((x) => x.type === "pass") as Extract<Reward, { type: "pass" }> | undefined;

  it("lights one word at a time, then waits for the tap when the words finish", () => {
    const s = session();
    assert.equal(passAt(s, 150).word, 1);
    assert.equal(timeLeft(s, 150), 250);
    assert.equal(advance(s, 399), false, "not before the words finish");
    assert.deepEqual(tapComplete(s, 200, next, false), [], "a tap while reading does nothing");
    assert.equal(advance(s, 400), true);
    assert.equal(s.waiting, true);
    assert.equal(s.totals.reps, 0, "nothing counts until the tap");
    assert.equal(passAt(s, 99999).pass, 0, "it waits, however long");
  });

  it("completes the pass on the tap and starts the next one at once", () => {
    const s = session();
    const r = complete(s);
    const p = pass(r);
    assert.ok(p && p.xp > 0 && p.gold > 0);
    assert.equal(s.totals.reps, 1);
    assert.equal(s.pass, 1, "the next pass has begun");
    assert.equal(s.waiting, false);
    assert.equal(passAt(s, s.start).word, 0, "from its first word");
    assert.deepEqual(
      tapComplete(s, s.start + 10, next, false),
      [],
      "a double tap does not count twice",
    );
  });

  it("pays a phrase bonus after its passes and brings the next phrase", () => {
    const s = session({ reps: 2 });
    complete(s);
    const r = complete(s);
    assert.ok(pass(r) && r.some((x) => x.type === "phrase"));
    assert.equal(s.phrase, "A fresh phrase arrives here.");
    assert.equal(s.pass, 0);
    assert.equal(s.roundPhrases, 1);
    assert.equal(s.roundDone, false);
  });

  it("completes a round of phrases, then starts another on request", () => {
    const s = session({ reps: 3, round: 3 });
    let rewards: Reward[] = [];
    for (let i = 0; i < 9; i++) rewards = complete(s);
    assert.ok(rewards.some((x) => x.type === "round"));
    assert.equal(s.roundDone, true);
    assert.deepEqual(s.roundTotals.reps, 9);
    assert.equal(s.roundTotals.phrases, 3);
    assert.equal(s.totals.reps, 9);
    assert.deepEqual(complete(s), [], "nothing more until the next round");
    nextRound(s, 50_000, "Round two begins with this.", 2);
    assert.equal(s.roundDone, false);
    assert.equal(s.round, 2);
    assert.equal(s.roundTotals.reps, 0);
    assert.equal(s.phrase, "Round two begins with this.");
    for (let i = 0; i < 6; i++) rewards = complete(s);
    assert.ok(rewards.some((x) => x.type === "round"));
    assert.equal(s.totals.reps, 15);
  });

  it("pays more for longer phrases, and more again on a streak, up to the cap", () => {
    assert.ok(passXp(9, 40) > passXp(3, 12));
    assert.equal(streakMult(1), 1);
    assert.ok(streakMult(3) > streakMult(2));
    assert.equal(streakMult(1000), C.streakMax);
    const s = session();
    const a = pass(complete(s))!;
    const b = pass(complete(s))!;
    assert.ok(b.xp > a.xp, "the second pass in a row is worth more");
  });

  it("swaps in a different phrase on Skip, keeping the round's count", () => {
    const s = session();
    complete(s);
    skipPhrase(s, 9000, "Another phrase entirely here.");
    assert.equal(s.pass, 0);
    assert.equal(s.roundPhrases, 0);
    assert.equal(s.phrase, "Another phrase entirely here.");
    assert.equal(s.totals.reps, 1, "what was earned stays");
  });

  it("doubles XP with the elixir and adds a watching queen's bonus", () => {
    const plain = pass(complete(session()))!.xp;
    assert.equal(pass(complete(session(), true))!.xp, plain * C.elixir.mult);
    assert.ok(pass(complete(session({ queen: "eltharia" })))!.xp > plain);
  });

  it("ends a date with its round", () => {
    const s = session({ date: true, reps: 1, round: 3 });
    let ended = false;
    for (let i = 0; i < 10 && !ended; i++) ended = complete(s).some((r) => r.type === "end");
    assert.ok(ended && s.over && s.phrases === 3);
    assert.deepEqual(complete(s), []);
  });
});

describe("court skills and queens", () => {
  it("starts everyone at level 1 and adds levels across skills", () => {
    const save = newSave();
    assert.equal(totalLevel(save.skills), SKILL_KEYS.length);
    save.skills.strength = xpForLevel(10);
    assert.equal(totalLevel(save.skills), SKILL_KEYS.length + 9);
  });

  it("trains the place's Fire skill or Water skill by stance", () => {
    assert.equal(skillAt("yard", "fire"), "strength");
    assert.equal(skillAt("yard", "water"), "grace");
    assert.equal(skillAt("market", "fire"), null);
  });

  it("warms queens faster in their element, on a streak and on a date", () => {
    const base = affectionGain(10, "eltharia", "fire", 1, false);
    assert.ok(affectionGain(10, "eltharia", "water", 1, false) > base, "Eltharia is Water");
    assert.ok(affectionGain(10, "eltharia", "fire", 5, false) > base);
    assert.ok(affectionGain(10, "eltharia", "fire", 1, true) > base);
  });

  it("names the tier and the next step", () => {
    assert.equal(tierOf(0).name, C.affectionTiers[0]!.name);
    const t = tierOf(C.affectionTiers[2]!.at);
    assert.equal(t.index, 2);
    assert.equal(t.next, C.affectionTiers[3]!.at);
  });

  it("keeps some queens out of reach until you meet their need", () => {
    const save = newSave();
    assert.ok(meetsNeed("eltharia", save.skills));
    assert.equal(meetsNeed("onyxia", save.skills), false);
    save.skills.strength = xpForLevel(C.queens.onyxia.need.level);
    assert.ok(meetsNeed("onyxia", save.skills));
    assert.equal(meetsNeed("azshara", save.skills), false);
  });

  it("values a queen's favourite gift double", () => {
    assert.equal(giftValue("eltharia", "mead"), C.gifts.mead.value * 2);
    assert.equal(giftValue("onyxia", "mead"), C.gifts.mead.value);
  });

  it("fills in lines and finds who stands where", () => {
    const line = queenLine("eltharia", "levelUp", 0, { skill: "Song", level: 7 });
    assert.ok(line.includes("Song") && line.includes("7") && !line.includes("{"));
    assert.equal(queenAt("inn"), "eltharia");
    assert.equal(queenAt("yard"), null);
  });
});

describe("queen portraits", () => {
  it("draws every queen as a complete picture, each one different", () => {
    const seen = new Set<string>();
    for (const q of QUEEN_KEYS) {
      const spec = C.queens[q];
      const svg = portraitSvg(spec.look, spec.color);
      assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), q);
      assert.ok(!/undefined|NaN|null/.test(svg), `${q}: nothing missing`);
      assert.equal(
        (svg.match(/<g[ >]/g) ?? []).length,
        (svg.match(/<\/g>/g) ?? []).length,
        `${q}: groups closed`,
      );
      assert.ok(svg.includes(spec.look.skin) && svg.includes(spec.color), `${q}: her own colours`);
      seen.add(svg);
      assert.ok(queenPortrait(q).startsWith("data:image/svg+xml"));
    }
    assert.equal(seen.size, QUEEN_KEYS.length);
  });

  it("draws horns, elf ears, closed eyes and headpieces when asked", () => {
    const base = C.queens.eltharia.look;
    const plain = portraitSvg(base, "#ffffff");
    assert.ok(portraitSvg({ ...base, horns: "#123456" }, "#ffffff").length > plain.length);
    assert.notEqual(portraitSvg({ ...base, ears: "elf" }, "#ffffff"), plain);
    assert.notEqual(portraitSvg({ ...base, eyeStyle: "closed" }, "#ffffff"), plain);
    for (const h of ["crown", "tiara", "circlet", "hood", "none"])
      assert.ok(portraitSvg({ ...base, headpiece: h }, "#ffffff").startsWith("<svg"));
  });

  it("keeps bad values out of the picture", () => {
    const svg = portraitSvg(
      { ...C.queens.eltharia.look, skin: '"><script>', hairStyle: "mohawk" },
      "red;x",
    );
    assert.ok(!svg.includes("<script>") && !svg.includes("red;x"));
    assert.equal(shade("#808080", 1), "#ffffff");
    assert.equal(shade("#808080", -1), "#000000");
  });
});

describe("world art", () => {
  it("gives every building a style and a door beside it", () => {
    for (const region of REGION_KEYS) {
      const w = parseWorld(region);
      for (const [place, box] of Object.entries(w.buildings)) {
        const style = BUILDING_STYLE[place as keyof typeof BUILDING_STYLE] ?? "house";
        assert.ok(
          ["castle", "dome", "house", "market", "cave", "tower", "forge", "arena", "pool"].includes(
            style,
          ),
        );
        const door = w.doors[place as keyof typeof w.doors];
        assert.ok(door, `${place} has a door`);
        const [c, r] = door!;
        const beside =
          (r === box!.r1 + 1 || r === box!.r0 - 1) && c >= box!.c0 && c <= box!.c1
            ? true
            : (c === box!.c0 - 1 || c === box!.c1 + 1) && r >= box!.r0 && r <= box!.r1;
        assert.ok(beside, `${place}'s door touches its building`);
      }
    }
    for (const place of Object.keys(BUILDING_STYLE)) assert.ok(place in CONFIG.court.places, place);
  });

  it("finds what moves in each region", () => {
    const realm = sceneOf(parseWorld("realm"), "realm", () => "#ffffff");
    const isles = sceneOf(parseWorld("isles"), "isles", () => "#ffffff");
    const peaks = sceneOf(parseWorld("peaks"), "peaks", () => "#ffffff");
    assert.ok(realm.water.length > 0 && realm.void.length > 0 && realm.green.length > 0);
    assert.ok(isles.water.length > realm.water.length);
    assert.ok(peaks.lava.length > 0 && peaks.water.length === 0);
    // Every open-air place and gate gets a spot; the gates are marked.
    const open = (Object.keys(parseWorld("realm").doors) as string[]).filter(
      (p) => !parseWorld("realm").buildings[p as keyof World["buildings"]],
    );
    assert.deepEqual(realm.spots.map((s) => s.place).sort(), open.sort());
    assert.ok(
      realm.spots.some((s) => s.gate) &&
        peaks.spots.every((s) => s.gate === !!CONFIG.court.places[s.place].gate),
    );
    // Smoke from the inn and the forge, steam from the springs.
    assert.ok(realm.smoke.some((s) => s.kind === "smoke"));
    assert.ok(
      peaks.smoke.some((s) => s.kind === "forge") && peaks.smoke.some((s) => s.kind === "steam"),
    );
  });

  it("is the same every time, with colours it can use", () => {
    assert.equal(hash(3, 4, 5), hash(3, 4, 5));
    assert.notEqual(hash(3, 4, 5), hash(4, 3, 5));
    for (let i = 0; i < 200; i++) {
      const h = hash(i, i * 7, i % 5);
      assert.ok(h >= 0 && h < 1);
    }
    assert.equal(alpha("#ff8000", 0.5), "rgba(255, 128, 0, 0.500)");
    assert.equal(alpha("#ff8000", 2), "rgba(255, 128, 0, 1.000)");
    for (const region of REGION_KEYS) {
      const P = PALETTES[region];
      for (const v of Object.values(P)) {
        if (typeof v === "string" && v.startsWith("#")) assert.match(v, /^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe("hearts", () => {
  const H = C.hearts;
  const fond = (save: ReturnType<typeof newSave>, q: QueenKey, tier: number) => {
    save.affection[q] = C.affectionTiers[tier]!.at;
  };
  /** A save that meets every queen's need. */
  const strong = () => {
    const save = newSave();
    for (const k of SKILL_KEYS) save.skills[k] = xpForLevel(99);
    return save;
  };

  it("has every line for every queen, and a mood for every tier", () => {
    for (const q of QUEEN_KEYS) {
      for (const k of [
        "missed",
        "jealous",
        "reconciled",
        "wish",
        "wishDone",
        "memory",
      ] as LineKey[])
        assert.ok(C.queens[q].lines[k].length > 0, `${q}.lines.${k}`);
    }
    assert.deepEqual(
      C.affectionTiers.map((_, i) => baseMood(i)),
      ["aloof", "smile", "smile", "blush", "smitten", "adoring"],
    );
    assert.equal(GALLERY_SIZE, QUEEN_KEYS.length * 9);
    assert.ok(queenLine("azshara", "missed", 0, { hours: 13 }).includes("13"));
  });

  it("feels jealousy first, then a moment, then her tier", () => {
    const save = newSave();
    fond(save, "ysera", 4);
    assert.equal(moodOf(save, "ysera", undefined, 0), "smitten");
    assert.equal(moodOf(save, "ysera", { mood: "fierce", until: 100 }, 50), "fierce");
    assert.equal(moodOf(save, "ysera", { mood: "fierce", until: 100 }, 150), "smitten");
    save.jealous.ysera = 1;
    assert.equal(moodOf(save, "ysera", { mood: "fierce", until: 100 }, 50), "jealous");
  });

  it("collects each portrait once", () => {
    const save = newSave();
    assert.equal(markSeen(save, "jaina", "blush"), true);
    assert.equal(markSeen(save, "jaina", "blush"), false);
    assert.equal(markSeen(save, "jaina", "fierce"), true);
    assert.equal(hasSeen(save, "jaina", "smile"), false);
    assert.equal(seenCount(save, "jaina"), 2);
    assert.equal(seenCount(save), 2);
  });

  it("misses you after a long time away, once you know each other", () => {
    const save = newSave();
    const t0 = 1_000_000_000_000;
    const later = t0 + (H.missAfterHours + 1) * 3_600_000;
    assert.equal(missesYou(save, "eltharia", later), false, "never met");
    save.lastSeen.eltharia = t0;
    assert.equal(missesYou(save, "eltharia", later), false, "a stranger does not");
    fond(save, "eltharia", 1);
    assert.equal(missesYou(save, "eltharia", later), true);
    assert.equal(missesYou(save, "eltharia", t0 + 3_600_000), false);
    assert.equal(Math.round(hoursAway(save, "eltharia", later)), H.missAfterHours + 1);
  });

  it("makes rivals in the same region jealous, and lets you make up", () => {
    const save = strong();
    // Ysera (Realm) is fond enough to care; Jaina (Isles) is in another region; Onyxia is not fond yet.
    fond(save, "ysera", H.jealousTier);
    fond(save, "jaina", H.jealousTier);
    assert.deepEqual(stirJealousy(save, "azshara"), ["ysera"]);
    assert.equal(save.jealous.ysera, 1);
    assert.equal(save.jealous.jaina, 0);
    assert.equal(save.jealous.onyxia, 0);
    assert.equal(jealousMult(save, "ysera"), H.jealousMult);
    for (let i = 0; i < 10; i++) stirJealousy(save, "azshara");
    assert.equal(save.jealous.ysera, H.jealousMax, "jealousy is capped");
    assert.equal(soothe(save, "ysera", false), false);
    assert.equal(save.jealous.ysera, H.jealousMax - 1);
    assert.equal(soothe(save, "ysera", true), true);
    assert.equal(jealousMult(save, "ysera"), 1);
    assert.equal(soothe(save, "ysera", true), false, "nothing to make up");
  });

  it("wishes for one of her skills each day, and grants it after enough passes", () => {
    const save = strong();
    const day = 20000;
    for (const q of QUEEN_KEYS) {
      const w = wishOf(q, day);
      assert.ok(C.queens[q].favored.includes(w.skill), `${q} wishes for a skill she loves`);
      assert.deepEqual(wishOf(q, day), w, "the same all day");
    }
    // Over many days a queen wishes for more than one of her skills.
    const kinds = new Set(Array.from({ length: 30 }, (_, i) => wishOf("azshara", day + i).skill));
    assert.ok(kinds.size > 1);
    const wish = wishOf("tyrande", day);
    let granted: QueenKey[] = [];
    for (let i = 0; i < wish.passes; i++) granted = countWish(save, wish.skill, day);
    assert.ok(granted.includes("tyrande"));
    assert.equal(save.wishes.done.tyrande, true);
    assert.ok(!countWish(save, wish.skill, day).includes("tyrande"), "granted once");
    // A new day starts again.
    countWish(save, "strength", day + 1);
    assert.equal(save.wishes.done.tyrande, false);
    assert.equal(save.wishes.day, day + 1);
  });

  it("remembers milestones once each", () => {
    assert.equal(memoryAt(49, 50), 50);
    assert.equal(memoryAt(50, 51), 0);
    assert.equal(memoryAt(199, 200), 200);
    assert.equal(memoryAt(10, 11), 0);
  });

  it("reads saved hearts and drops bad values", () => {
    const save = newSave();
    loadHearts(save, {
      lastSeen: { azshara: 123, jaina: "x" },
      jealous: { ysera: 99, onyxia: -4 },
      devotion: { tyrande: 7.6 },
      seen: { valeera: 0xffffff },
      wishes: { day: 5, progress: { sylvanas: 3 }, done: { sylvanas: true, jaina: "yes" } },
    });
    assert.equal(save.lastSeen.azshara, 123);
    assert.equal(save.lastSeen.jaina, 0);
    assert.equal(save.jealous.ysera, H.jealousMax);
    assert.equal(save.jealous.onyxia, 0);
    assert.equal(save.devotion.tyrande, 7);
    assert.equal(seenCount(save, "valeera"), 9);
    assert.equal(save.wishes.day, 5);
    assert.equal(save.wishes.progress.sylvanas, 3);
    assert.equal(save.wishes.done.sylvanas, true);
    assert.equal(save.wishes.done.jaina, false);
    loadHearts(save, null);
    assert.equal(save.lastSeen.azshara, 0);
  });
});

describe("portrait moods", () => {
  const q = C.queens.jaina;
  it("draws nine different faces for nine moods", () => {
    const all = MOODS.map((m) => portraitSvg(q.look, q.color, q.element, { mood: m }));
    assert.equal(new Set(all).size, MOODS.length);
    for (const svg of all) assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
    // The air around her: a storm, rain, a flare, petals and hearts.
    assert.ok(all[MOODS.indexOf("jealous")]!.includes('class="flash"'));
    assert.ok(all[MOODS.indexOf("longing")]!.includes('class="fall"'));
    assert.ok(all[MOODS.indexOf("longing")]!.includes('class="tear"'));
    assert.ok(all[MOODS.indexOf("fierce")]!.includes('class="rise"'));
    assert.ok(all[MOODS.indexOf("smitten")]!.includes('class="drift"'));
    assert.ok(all[MOODS.indexOf("adoring")]!.includes('class="float"'));
  });

  it("is a still picture, with what moves in a light overlay of its own", () => {
    const full = portraitSvg(q.look, q.color, q.element, { mood: "longing" });
    const bare = portraitSvg(q.look, q.color, q.element, { mood: "longing", air: false });
    assert.ok(!full.includes("<style>") && !bare.includes("<style>"));
    // The full picture holds the rain and the tear; the bare one leaves them to the overlay.
    assert.ok(full.includes('class="fall"') && full.includes('class="tear"'));
    assert.ok(!bare.includes('class="fall"') && !bare.includes('class="tear"'));
    const air = portraitAirSvg(q.look, "longing", 2);
    assert.ok(
      air.includes("<style>") && air.includes('class="fall"') && air.includes('class="tear"'),
    );
    assert.ok(air.includes("prefers-reduced-motion"));
    // No blurs in the overlay, so it is cheap to keep moving.
    assert.ok(!air.includes("filter="));
    // Nothing moves around a calm queen until her hair has glints.
    assert.equal(portraitAirSvg(q.look, "smile", 0), "");
    assert.ok(portraitAirSvg(q.look, "smile", 4).includes('class="tw"'));
  });

  it("has a shut-eyed frame for blinking, unless her eyes are already closed", () => {
    const open = portraitSvg(q.look, q.color, q.element, { mood: "smile", air: false });
    const shut = portraitSvg(q.look, q.color, q.element, {
      mood: "smile",
      air: false,
      blink: true,
    });
    assert.notEqual(open, shut);
    assert.equal(canBlink(q.look, "smile"), true);
    assert.equal(canBlink(q.look, "delighted"), false, "laughing eyes are closed");
    assert.equal(canBlink(C.queens.ysera.look, "smile"), false, "dreaming eyes are closed");
  });

  it("wears more as she falls for you", () => {
    const at = (tier: number) => portraitSvg(q.look, q.color, q.element, { mood: "smile", tier });
    assert.ok(at(5).length > at(3).length && at(3).length > at(0).length);
    assert.ok(at(5).includes('stroke="#ffe08a"') && !at(4).includes('stroke="#ffe08a"'));
    // Out-of-range tiers are clamped.
    assert.equal(at(99), at(5));
    assert.equal(at(-3), at(0));
  });

  it("caches each mood, tier and motion separately", () => {
    const a = queenPortrait("azshara", { mood: "jealous", tier: 2 });
    assert.equal(queenPortrait("azshara", { mood: "jealous", tier: 2 }), a);
    assert.notEqual(queenPortrait("azshara", { mood: "smile", tier: 2 }), a);
    assert.notEqual(queenPortrait("azshara", { mood: "jealous", tier: 2, air: false }), a);
    assert.notEqual(queenPortrait("azshara", { mood: "jealous", tier: 2, blink: true }), a);
    assert.equal(queenAir("azshara", "jealous", 2), queenAir("azshara", "jealous", 2));
    assert.equal(queenAir("azshara", "smile", 0), "");
    assert.ok(a.startsWith("data:image/svg+xml"));
  });
});

describe("queen attire", () => {
  const look = C.queens.jaina.look;
  const draw = (o: Partial<typeof look>, scene = "") =>
    portraitSvg({ ...look, ...o }, "#7fb8ff", "water", { scene, region: "isles" });

  it("dresses every queen in her own outfit and adornment, before her own scenery", () => {
    for (const q of QUEEN_KEYS) {
      const l = C.queens[q].look;
      assert.ok(OUTFITS.includes(outfitOf(l.outfit)), `${q} has a known outfit`);
      assert.ok(
        !l.adorn || (ADORNMENTS as readonly string[]).includes(l.adorn),
        `${q} has a known adornment`,
      );
      assert.ok(
        scene(C.queens[q].place, "", "#202040", "#a855f7").length > 100,
        `${q}'s place has scenery`,
      );
    }
    // Each outfit draws differently.
    const all = OUTFITS.map((o) => draw({ outfit: o }));
    assert.equal(new Set(all).size, OUTFITS.length);
    assert.equal(
      draw({ outfit: "bogus" }),
      draw({ outfit: "gown" }),
      "an unknown outfit is a gown",
    );
    // Adornments change the picture; an unknown one adds nothing.
    for (const a of ADORNMENTS) assert.notEqual(draw({ adorn: a }), draw({ adorn: "" }), a);
    assert.equal(draw({ adorn: "nonsense" }), draw({ adorn: "" }));
    // Scenery by place, and a region's own for places without one.
    assert.notEqual(draw({}, "harbor"), draw({}, ""));
    assert.notEqual(
      scene("market", "isles", "#202040", "#a855f7"),
      scene("market", "peaks", "#202040", "#a855f7"),
    );
  });

  it("keeps the necklace off a high leather collar", () => {
    assert.ok(closedOutfit("leather"));
    assert.ok(!closedOutfit("gown") && !closedOutfit("armor"));
    const leather = draw({ outfit: "leather" });
    const gown = draw({ outfit: "gown" });
    assert.ok(
      gown.includes("M41.8 73.2 Q50 78.6 58.2 73.2") &&
        !leather.includes("M41.8 73.2 Q50 78.6 58.2 73.2"),
    );
  });
});

describe("court life", () => {
  it("puts townsfolk on the streets of every region, and boats off the Isles", () => {
    const realm = sceneOf(parseWorld("realm"), "realm", () => "#ffffff");
    const isles = sceneOf(parseWorld("isles"), "isles", () => "#ffffff");
    const peaks = sceneOf(parseWorld("peaks"), "peaks", () => "#ffffff");
    assert.equal(realm.walkers.filter((w) => w.kind === "folk").length, 5);
    assert.equal(isles.walkers.filter((w) => w.kind === "boat").length, 2);
    assert.ok(
      peaks.walkers.every((w) => w.lantern),
      "smiths carry lanterns",
    );
    for (const [region, sc] of [
      ["realm", realm],
      ["isles", isles],
      ["peaks", peaks],
    ] as const) {
      const w = parseWorld(region);
      for (const wk of sc.walkers) {
        // Every cell of the run is street (or sea, for a boat).
        const want = wk.kind === "boat" ? "water" : "path";
        for (let t = 0; t <= 1; t += 0.25) {
          const c = Math.round(wk.a[0] + (wk.b[0] - wk.a[0]) * t);
          const r = Math.round(wk.a[1] + (wk.b[1] - wk.a[1]) * t);
          assert.equal(cellAt(w, c, r)?.terrain, want, `${region} ${wk.kind} at ${c},${r}`);
        }
      }
    }
  });

  it("walks there and back along the run, resting at each end", () => {
    const wk = {
      kind: "folk",
      a: [2, 5],
      b: [8, 5],
      speed: 1,
      phase: 0,
      color: "#fff",
      hat: "#000",
      lantern: false,
    } as const;
    const start = walkerAt({ ...wk, a: [2, 5], b: [8, 5] }, 0);
    assert.deepEqual([start.x, start.y, start.dir], [2, 5, 1]);
    assert.equal(walkerAt({ ...wk, a: [2, 5], b: [8, 5] }, 3).x, 5, "halfway out");
    const rest = walkerAt({ ...wk, a: [2, 5], b: [8, 5] }, 6.5);
    assert.equal(rest.x, 8);
    assert.equal(rest.moving, false);
    const back = walkerAt({ ...wk, a: [2, 5], b: [8, 5] }, 10.5);
    assert.equal(back.dir, -1);
    assert.equal(back.x, 5, "halfway home");
    for (let t = 0; t < 40; t += 0.7) {
      const p = walkerAt({ ...wk, a: [2, 5], b: [8, 5] }, t);
      assert.ok(p.x >= 2 && p.x <= 8 && p.y === 5);
    }
  });

  it("finds straight runs of ground", () => {
    const runs = runsOf(parseWorld("realm"), (t) => t === "path", 4);
    assert.ok(runs.length >= 3, "the high street, the main road and the side street");
    assert.ok(runs.every((r) => r.a[0] === r.b[0] || r.a[1] === r.b[1]));
  });

  it("darkens at night by the clock, with dusk and dawn between", () => {
    const at = (h: number, m = 0) => nightLevel(new Date(2026, 9, 31, h, m));
    assert.equal(at(12), 0);
    assert.equal(at(23), 1);
    assert.equal(at(3), 1);
    assert.equal(at(19), 0.5);
    assert.equal(at(6), 0.5);
    assert.equal(at(7), 0);
    assert.equal(at(18), 0);
  });

  it("gives every place a scenic banner", () => {
    for (const p of PLACE_KEYS) {
      const url = placeBanner(p);
      assert.ok(url.startsWith("data:image/svg+xml") && url.length > 500, p);
    }
    assert.notEqual(placeBanner("harbor"), placeBanner("forge"));
  });
});

describe("news, rumors and bonds", () => {
  const N = C.news;
  const fond = (save: ReturnType<typeof newSave>, q: QueenKey, tier: number) => {
    save.affection[q] = C.affectionTiers[tier]!.at;
  };
  const strong = () => {
    const save = newSave();
    for (const k of SKILL_KEYS) save.skills[k] = xpForLevel(99);
    return save;
  };
  /** A steady stream of numbers, so a test always picks the same way. */
  const seq = (seed: number) => {
    let x = seed >>> 0 || 1;
    return () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 2 ** 32;
    };
  };
  const DAY = 20_000;
  const NOW = 1_700_000_000_000;

  it("binds only real queens, each pair once, with a known kind", () => {
    const seen = new Set<string>();
    for (const [a, row] of Object.entries(N.bonds)) {
      assert.ok((QUEEN_KEYS as string[]).includes(a), a);
      for (const [b, kind] of Object.entries(row)) {
        assert.ok((QUEEN_KEYS as string[]).includes(b), `${a}.${b}`);
        assert.ok(["sister", "friend", "rival"].includes(kind), `${a}.${b}: ${kind}`);
        const key = [a, b].sort().join("|");
        assert.ok(!seen.has(key), `${key} twice`);
        seen.add(key);
      }
    }
    assert.equal(bondOf("azshara", "xalatath"), "sister");
    assert.equal(bondOf("xalatath", "azshara"), "sister", "either way round");
    assert.equal(bondOf("azshara", "tyrande"), "rival");
    assert.equal(bondOf("azshara", "eltharia"), null);
    assert.equal(bondOf("azshara", "azshara"), null);
    assert.deepEqual(
      bondsOf("azshara").map((b) => b.kind),
      ["sister", "rival"],
      "sisters first",
    );
  });

  it("sisters and friends put in a good word instead of growing jealous; rivals are jealous anywhere", () => {
    const save = strong();
    fond(save, "xalatath", C.hearts.jealousTier);
    fond(save, "tyrande", C.hearts.jealousTier);
    fond(save, "ysera", C.hearts.jealousTier);
    // Xal'atath is in Azshara's region but her sister; Tyrande is far away but her rival.
    assert.deepEqual(rivalsOf(save, "azshara").sort(), ["tyrande", "ysera"]);
    assert.deepEqual(goodWord(save, "azshara"), ["xalatath"]);
    assert.deepEqual(goodWord(newSave(), "azshara"), [], "only those who know you");
  });

  it("talks about one queen a day, the same all day", () => {
    const days = new Set<string>();
    for (let d = DAY; d < DAY + 60; d++) {
      const q = buzzOf(d);
      assert.ok(QUEEN_KEYS.includes(q));
      assert.equal(buzzOf(d), q);
      days.add(q);
      assert.equal(buzzMult(q, d), N.buzzMult);
      assert.equal(
        buzzMult(
          QUEEN_KEYS.find((k) => k !== q)!,
          d,
        ),
        1,
      );
    }
    assert.ok(days.size >= 6, "different queens on different days");
  });

  it("has lines for every kind of rumor and talk, and fills them all in", () => {
    for (const k of RUMOR_KINDS) assert.ok((N.rumors[k]?.length ?? 0) > 0, `rumors.${k}`);
    for (const k of ["sister", "friend", "rival"]) assert.ok((N.talk[k]?.length ?? 0) > 0, k);
    assert.equal(fillLine("{queen} and {other}", { queen: "A" }), "A and {other}");
    // Every kind can come up, and nothing is left unfilled.
    const save = strong();
    for (const q of QUEEN_KEYS) fond(save, q, 2);
    fond(save, "azshara", 4);
    fond(save, "eltharia", 0);
    save.jealous.ysera = 1;
    save.lastSeen.jaina = NOW - (C.hearts.missAfterHours + 2) * 3_600_000;
    save.stats.reps = 40;
    const weak = newSave();
    const kinds = new Set([
      ...rumorsNow(save, DAY, NOW, seq(1)).map((c) => c.kind),
      ...rumorsNow(weak, DAY, NOW, seq(1)).map((c) => c.kind),
    ]);
    assert.deepEqual(
      RUMOR_KINDS.filter((k) => !kinds.has(k)),
      [],
      "every kind can come up",
    );
    const rand = seq(7);
    for (let i = 0; i < 300; i++) {
      for (const s of [save, weak]) {
        const r = makeRumor(s, DAY, NOW, rand)!;
        assert.ok(r.text.length > 10);
        assert.ok(!/\{\w+\}/.test(r.text), `unfilled: ${r.text}`);
      }
    }
  });

  it("tells strangers apart, and does not tell the same kind or queen twice in a row", () => {
    const save = strong();
    assert.ok(rumorsNow(save, DAY, NOW, seq(2)).some((c) => c.kind === "stranger"));
    const rand = seq(3);
    let last = makeRumor(save, DAY, NOW, rand)!;
    for (let i = 0; i < 100; i++) {
      const r = makeRumor(save, DAY, NOW, rand, { kind: last.kind, queen: last.queen })!;
      assert.notEqual(r.kind, last.kind);
      last = r;
    }
    // A save on another day: every wish is open today.
    save.wishes.day = DAY - 1;
    for (const q of QUEEN_KEYS) save.wishes.done[q] = true;
    assert.ok(rumorsNow(save, DAY, NOW, seq(4)).some((c) => c.kind === "wish"));
  });

  it("lets a queen talk about her sisters, friends and rivals", () => {
    const rand = seq(5);
    for (let i = 0; i < 30; i++) {
      const t = bondTalk("azshara", rand)!;
      assert.ok(["xalatath", "tyrande"].includes(t.other));
      assert.ok(t.text.includes(C.queens[t.other].name), t.text);
    }
    const lonely = QUEEN_KEYS.find((q) => bondsOf(q).length === 0);
    if (lonely) assert.equal(bondTalk(lonely, rand), null);
  });

  it("keeps the newest news, counts the unread and reads saves defensively", () => {
    const save = newSave();
    for (let i = 0; i < N.keep + 5; i++)
      addNews(save, { at: NOW + i, text: `n${i}`, queen: "ysera", kind: "rumor" });
    assert.equal(save.news.length, N.keep);
    assert.equal(save.news[0]!.text, `n${N.keep + 4}`, "newest first");
    assert.equal(unreadNews(save), N.keep);
    save.newsRead = NOW + N.keep + 2;
    assert.equal(unreadNews(save), 2);
    const back = newSave();
    loadNews(back, {
      met: { ysera: NOW, onyxia: "x" },
      given: { ysera: 3.7, azshara: -2 },
      newsRead: 5,
      news: [
        { at: 9, text: "ok", queen: "ysera", kind: "rumor" },
        { at: 1, text: 4 },
        { at: 2, text: "who", queen: "nobody" },
        "junk",
      ],
    });
    assert.equal(back.met.ysera, NOW);
    assert.equal(back.met.onyxia, 0);
    assert.equal(back.given.ysera, 3);
    assert.equal(back.given.azshara, 0);
    assert.equal(back.newsRead, 5);
    assert.deepEqual(
      back.news.map((n) => [n.text, n.queen, n.kind]),
      [
        ["ok", "ysera", "rumor"],
        ["who", null, "notice"],
      ],
    );
    loadNews(back, null);
    assert.deepEqual(back.news, []);
    assert.equal(ago(NOW, NOW + 20_000), "just now");
    assert.equal(ago(NOW, NOW + 5 * 60_000), "5 min ago");
    assert.equal(ago(NOW, NOW + 3 * 3_600_000), "3 h ago");
    assert.equal(ago(NOW, NOW + 2 * 86_400_000), "2 days ago");
  });
});

describe("feelings and queens who come out to find you", () => {
  const A = C.hearts.arcs;
  const P = C.presence;
  const NOW = 1_700_000_000_000;
  const DAY = 20_000;
  const fond = (save: ReturnType<typeof newSave>, q: QueenKey, tier: number) => {
    save.affection[q] = C.affectionTiers[tier]!.at;
  };
  const strong = () => {
    const save = newSave();
    for (const k of SKILL_KEYS) save.skills[k] = xpForLevel(99);
    return save;
  };
  /** A queen who is not the talk of the town on DAY, so no bonus muddles the sums. */
  const plain = QUEEN_KEYS.find((q) => q !== buzzOf(DAY) && q !== "azshara")!;

  it("has a real mood, a name and a length for every feeling, and every line it needs", () => {
    for (const k of ARC_KEYS) {
      assert.ok(MOODS.includes(A[k].mood as (typeof MOODS)[number]), `${k}: ${A[k].mood}`);
      assert.ok(A[k].name && A[k].copy && A[k].durationMinutes > 0 && A[k].affection > 0, k);
    }
    for (const k of ["seeking", "lonely", "confront", "present", "leaveHappy", "leaveHurt"])
      assert.ok((P.lines[k]?.length ?? 0) > 0, `lines.${k}`);
    for (const k of ["out", "outConfront", "leftHappy", "leftHurt", "rivals", "close"])
      assert.ok((P.notices[k]?.length ?? 0) > 0, `notices.${k}`);
  });

  it("sets her mood for a while, after jealousy and a moment's mood, and changes her affection", () => {
    const save = strong();
    fond(save, plain, 3);
    assert.equal(arcOf(save, plain, NOW), null);
    assert.equal(moodOf(save, plain, undefined, NOW), "blush");
    setArc(save, plain, "distant", NOW);
    const a = arcOf(save, plain, NOW + 60_000)!;
    assert.equal(a.id, "distant");
    assert.equal(a.mood, A.distant.mood);
    assert.equal(a.ends, NOW + A.distant.durationMinutes * 60_000);
    assert.equal(moodOf(save, plain, undefined, NOW + 1), A.distant.mood);
    assert.equal(moodOf(save, plain, { mood: "fierce", until: NOW + 10 }, NOW + 1), "fierce");
    save.jealous[plain] = 1;
    assert.equal(moodOf(save, plain, undefined, NOW + 1), "jealous");
    save.jealous[plain] = 0;
    assert.equal(arcMult(save, plain, NOW + 1), A.distant.affection);
    // It wears off.
    assert.equal(arcOf(save, plain, a.ends), null);
    assert.equal(arcMult(save, plain, a.ends), 1);
    assert.equal(moodOf(save, plain, undefined, a.ends), "blush");
  });

  it("reads feelings from a save defensively", () => {
    const save = newSave();
    loadHearts(save, {
      arcs: {
        ysera: { id: "lonely", start: NOW },
        jaina: { id: "bored", start: NOW },
        onyxia: { id: "seeking", start: "x" },
        azshara: 7,
      },
    });
    assert.deepEqual(save.arcs.ysera, { id: "lonely", start: NOW });
    assert.deepEqual(save.arcs.jaina, { id: "", start: 0 });
    assert.deepEqual(save.arcs.onyxia, { id: "seeking", start: 0 });
    assert.deepEqual(save.arcs.azshara, { id: "", start: 0 });
    assert.equal(arcOf(save, "jaina", NOW), null);
  });

  it("comes out only when she knows you, more when warm, lonely or upset, never when hurt", () => {
    const save = strong();
    const per = (q: QueenKey) => comeOutChance(save, q, DAY, NOW, 60);
    assert.equal(per(plain), 0, "a stranger does not");
    fond(save, plain, P.minTier);
    const low = per(plain);
    assert.ok(low > 0);
    fond(save, plain, 4);
    const warm = per(plain);
    assert.ok(warm > low, "warmer tiers come out more");
    setArc(save, plain, "lonely", NOW);
    assert.ok(Math.abs(per(plain) - Math.min(1, warm * P.arcBoost)) < 1e-9, "lonely: more");
    setArc(save, plain, "distant", NOW);
    assert.equal(per(plain), 0, "hurt: she won't come");
    const weak = newSave();
    fond(weak, "azshara", 5);
    setArc(weak, "azshara", "confront", NOW);
    assert.equal(comeOutChance(weak, "azshara", DAY, NOW, 60), 0, "not before you meet her need");
    const buzz = buzzOf(DAY);
    const b = strong();
    fond(b, buzz, 2);
    fond(b, plain, 2);
    assert.ok(
      comeOutChance(b, buzz, DAY, NOW, 60) > comeOutChance(b, plain, DAY, NOW, 60),
      "the talk of the town comes out more",
    );
    // A stranger who is upset still comes to have it out with you.
    const u = strong();
    setArc(u, plain, "confront", NOW);
    assert.ok(comeOutChance(u, plain, DAY, NOW, 60) > 0);
  });

  it("says the right thing when she finds you, and fills her lines in", () => {
    const zero = () => 0;
    assert.equal(foundKind("confront", 20, zero), "confront");
    assert.equal(foundKind("lonely", 20, zero), "lonely");
    assert.equal(foundKind("lonely", 0.2, zero), "seeking", "not lonely after minutes");
    assert.equal(
      foundKind(null, 0, () => 0.9),
      "present",
    );
    const line = presenceLine("lonely", { hours: 13 }, zero);
    assert.ok(line.includes("13"), line);
    const notice = presenceLine("out", { queen: "Ysera", place: "Void" }, () => 0.99, "notices");
    assert.ok(notice.includes("Ysera") && !/\{\w+\}/.test(notice), notice);
    assert.equal(presenceLine("nothing", {}, zero), "");
    // Lines that would sound wrong now are left out.
    for (let i = 0; i < 20; i++) {
      const r = (i + 0.5) / 20;
      const said = presenceLine("present", { passes: 0, streak: 0 }, () => r, "lines", [
        "passes",
        "streak",
      ]);
      assert.ok(!/\b0\b/.test(said), said);
    }
  });

  it("knows how two queens who meet react", () => {
    assert.deepEqual(encounterOf("azshara", "xalatath"), { kind: "close", bond: "sister" });
    assert.deepEqual(encounterOf("azshara", "tyrande"), { kind: "rivals", bond: "rival" });
    assert.equal(encounterOf("azshara", "eltharia"), null);
    assert.equal(pairKey("ysera", "azshara"), pairKey("azshara", "ysera"));
  });
});

describe("portrait styles", () => {
  it("draws the dark look by default from config, and the classic look on request", () => {
    assert.ok(["dark", "classic"].includes(C.portraits.style));
    for (const q of QUEEN_KEYS) {
      const dark = queenPortrait(q, { mood: "smitten", tier: 4, style: "dark" });
      const classic = queenPortrait(q, { mood: "smitten", tier: 4, style: "classic" });
      assert.notEqual(dark, classic, q);
      const svg = decodeURIComponent(dark.slice(dark.indexOf(",") + 1));
      assert.ok(svg.includes('id="backlight"') && svg.includes('id="vignetteDark"'), q);
      assert.ok(!/NaN|undefined/.test(svg), `${q}: nothing undrawable`);
      assert.ok(!decodeURIComponent(classic).includes('id="backlight"'), `${q}: classic stays classic`);
    }
    assert.equal(
      queenPortrait("azshara", { mood: "smile" }),
      queenPortrait("azshara", { mood: "smile", style: C.portraits.style }),
      "the style comes from config when not given",
    );
  });
});

describe("court bonus set", () => {
  it("pays a bonus set from Reps as that many passes, more when a queen watches", () => {
    const B = C.bonus;
    const one = bonusReward("xyz", 1, "forest", false);
    const hundred = bonusReward("xyz", 100, "forest", false);
    assert.ok(one.xp > 0);
    assert.ok(Math.abs(hundred.xp - one.xp * 100) < 1e-6, "a hundred passes' worth");
    assert.equal(hundred.affection, 0, "no queen, no affection");
    const watched = bonusReward("xyz", 100, "forest", true);
    assert.ok(Math.abs(watched.xp - hundred.xp * (1 + C.watchedBonus)) < 1e-6);
    assert.equal(watched.affection, B.affection);
    assert.ok(bonusReward("one two three", 100, "forest", false).xp > hundred.xp, "longer phrases pay more");
    assert.deepEqual(bonusReward("xyz", 0, "forest", true), { xp: 0, gold: 0, affection: 0 });
    assert.ok(B.maxWords >= 1 && B.xpMult >= 0 && B.goldMult >= 0);
  });
});
