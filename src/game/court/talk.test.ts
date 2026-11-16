/**
 * Checks the talk pack (src/game/court/talk/*.json), so a file filled in
 * elsewhere (by hand or by another AI) can be dropped in safely: every key in
 * its place, only the {placeholders} each list can fill, no empty or repeated
 * lines, nothing too long. `npm run talk:check` runs just this.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import { QUEEN_KEYS, type LineKey } from "./rules.ts";
import { RUMOR_KINDS } from "./news.ts";
import {
  ASK_FILLS,
  BASE_FILLS,
  BOND_TALK_FILLS,
  DUO_FILLS,
  FEED_FILLS,
  PRAY_FILLS,
  LINE_FILLS,
  PAIR_FILLS,
  pairName,
  pairTalk,
  PRESENCE_FILLS,
  QUEEN_TALK,
  RUMOR_FILLS,
  SHARED,
  FEELING_KEYS,
  SORRY_FILLS,
  TASTE_KEYS,
  TONE_FILLS,
  TONE_KEYS,
} from "./talk.ts";

const C = CONFIG.court;
const MAX_LEN = 240;
const VOICE_KEYS = [
  "open",
  "close",
  "warm",
  "pet",
  "things",
  "talk",
  "feed",
  "fed",
  "hungry",
  "pray",
  "prayed",
];
const LINE_KEYS = Object.keys(C.queens.azshara.lines) as LineKey[];

/** Problems with one list of lines, as readable messages. */
function check(where: string, list: unknown, allowed: readonly string[], problems: string[]) {
  if (!Array.isArray(list) || !list.length) {
    problems.push(`${where}: should be a list with at least one line`);
    return;
  }
  const seen = new Set<string>();
  for (const line of list) {
    if (typeof line !== "string" || !line.trim()) {
      problems.push(`${where}: an empty or non-text line`);
      continue;
    }
    if (line !== line.trim()) problems.push(`${where}: spaces around "${line}"`);
    if (line.length > MAX_LEN) problems.push(`${where}: longer than ${MAX_LEN}: "${line}"`);
    const key = line.toLowerCase();
    if (seen.has(key)) problems.push(`${where}: said twice: "${line}"`);
    seen.add(key);
    for (const [, name] of line.matchAll(/\{(\w*)\}/g))
      if (!allowed.includes(name!))
        problems.push(`${where}: {${name}} cannot be filled here: "${line}"`);
    if (/[{}]/.test(line.replace(/\{\w+\}/g, "")))
      problems.push(`${where}: a stray { or }: "${line}"`);
  }
}

/** Keys other than the ones expected (and notes starting with "_"). */
function extra(where: string, obj: object, expected: readonly string[], problems: string[]) {
  for (const k of Object.keys(obj))
    if (!k.startsWith("_") && !expected.includes(k)) problems.push(`${where}: unknown key "${k}"`);
}

function report(problems: string[]) {
  assert.equal(
    problems.length,
    0,
    `\n${problems.slice(0, 40).join("\n")}${problems.length > 40 ? `\n... and ${problems.length - 40} more` : ""}`,
  );
}

describe("talk pack", () => {
  it("has a file for every queen, with her voice and her lines, in shape", () => {
    const problems: string[] = [];
    for (const q of QUEEN_KEYS) {
      const t = QUEEN_TALK[q];
      if (!t) {
        problems.push(`${q}.json: missing`);
        continue;
      }
      if (t.queen !== q) problems.push(`${q}.json: "queen" should be "${q}"`);
      extra(`${q}.json`, t, ["queen", "voice", "lines"], problems);
      extra(`${q}.json voice`, t.voice ?? {}, VOICE_KEYS, problems);
      for (const k of VOICE_KEYS) {
        const allowed = ["feed", "fed", "hungry"].includes(k)
          ? FEED_FILLS
          : ["pray", "prayed"].includes(k)
            ? PRAY_FILLS
            : BASE_FILLS;
        check(
          `${q}.json voice.${k}`,
          (t.voice as unknown as Record<string, unknown>)?.[k],
          allowed,
          problems,
        );
      }
      for (const line of t.voice?.feed ?? [])
        if (!line.includes("{count}") || !line.includes("{phrase}"))
          problems.push(`${q}.json voice.feed: needs {count} and {phrase}: "${line}"`);
      for (const line of t.voice?.pray ?? [])
        if (!line.includes("{minutes}") || !line.includes("{phrase}"))
          problems.push(`${q}.json voice.pray: needs {minutes} and {phrase}: "${line}"`);
      for (const line of t.voice?.pet ?? [])
        if (/[{}]/.test(line)) problems.push(`${q}.json voice.pet: no placeholders in a pet name`);
      extra(`${q}.json lines`, t.lines ?? {}, LINE_KEYS, problems);
      for (const k of LINE_KEYS)
        if (t.lines?.[k])
          check(
            `${q}.json lines.${k}`,
            t.lines[k],
            [...BASE_FILLS, ...(LINE_FILLS[k] ?? [])],
            problems,
          );
    }
    report(problems);
  });

  it("has the shared words in shape", () => {
    const problems: string[] = [];
    const s = SHARED;
    extra(
      "shared.json",
      s,
      [
        "topics",
        "pickupLines",
        "presence",
        "rumors",
        "bondTalk",
        "duo",
        "duoReply",
        "pairs",
        "tones",
        "reacts",
        "sorry",
        "ask",
        "answers",
        "herAsks",
      ],
      problems,
    );
    for (const part of ["duo", "duoReply"] as const) {
      extra(`shared.json ${part}`, s[part] ?? {}, Object.keys(DUO_FILLS), problems);
      for (const [kind, list] of Object.entries(s[part] ?? {}))
        if (!kind.startsWith("_"))
          check(`shared.json ${part}.${kind}`, list, DUO_FILLS[kind] ?? [], problems);
    }
    for (const [name, t] of Object.entries(s.topics ?? {})) {
      extra(`shared.json topics.${name}`, t, ["ask", "answer"], problems);
      check(`shared.json topics.${name}.ask`, t.ask, BASE_FILLS, problems);
      check(`shared.json topics.${name}.answer`, t.answer, BASE_FILLS, problems);
    }
    check("shared.json pickupLines", s.pickupLines, [], problems);
    extra("shared.json presence", s.presence ?? {}, ["lines", "notices"], problems);
    for (const from of ["lines", "notices"] as const) {
      const kinds = PRESENCE_FILLS[from];
      extra(`shared.json presence.${from}`, s.presence?.[from] ?? {}, Object.keys(kinds), problems);
      for (const [kind, list] of Object.entries(s.presence?.[from] ?? {}))
        if (!kind.startsWith("_"))
          check(`shared.json presence.${from}.${kind}`, list, kinds[kind] ?? [], problems);
    }
    extra("shared.json rumors", s.rumors ?? {}, RUMOR_KINDS, problems);
    for (const [kind, list] of Object.entries(s.rumors ?? {}))
      if (!kind.startsWith("_"))
        check(`shared.json rumors.${kind}`, list, RUMOR_FILLS[kind] ?? [], problems);
    // Pairs: "a+b" of two queens, in alphabetical order; a notice and/or lines for either of the two.
    for (const [key, entry] of Object.entries(s.pairs ?? {})) {
      if (key.startsWith("_")) continue;
      const [a, b, more] = key.split("+");
      const known = (q?: string) => !!q && (QUEEN_KEYS as readonly string[]).includes(q);
      if (!known(a) || !known(b) || more !== undefined || a === b || pairName(a!, b!) !== key) {
        problems.push(
          `shared.json pairs: "${key}" should be two queens in alphabetical order, as a+b`,
        );
        continue;
      }
      extra(`shared.json pairs.${key}`, entry, ["notice", a!, b!], problems);
      for (const [who, list] of Object.entries(entry))
        if (!who.startsWith("_"))
          check(
            `shared.json pairs.${key}.${who}`,
            list,
            who === "notice" ? PAIR_FILLS.notice : PAIR_FILLS.queen,
            problems,
          );
    }
    extra("shared.json bondTalk", s.bondTalk ?? {}, Object.keys(BOND_TALK_FILLS), problems);
    for (const [kind, list] of Object.entries(s.bondTalk ?? {}))
      if (!kind.startsWith("_"))
        check(`shared.json bondTalk.${kind}`, list, BOND_TALK_FILLS[kind] ?? [], problems);
    report(problems);
  });

  it("has the talk screen's words in shape: tones, reactions, asks, answers and her questions", () => {
    const problems: string[] = [];
    const s = SHARED;
    // What you say, by tone: every tone has lines.
    extra("shared.json tones", s.tones ?? {}, TONE_KEYS, problems);
    for (const tone of TONE_KEYS) check(`shared.json tones.${tone}`, s.tones?.[tone], TONE_FILLS, problems);
    // Her answer to each way of taking a tone.
    extra("shared.json reacts", s.reacts ?? {}, TASTE_KEYS, problems);
    for (const taste of TASTE_KEYS) check(`shared.json reacts.${taste}`, s.reacts?.[taste], BASE_FILLS, problems);
    // Your apologies, in every tone.
    extra("shared.json sorry", s.sorry ?? {}, TONE_KEYS, problems);
    for (const tone of TONE_KEYS) check(`shared.json sorry.${tone}`, s.sorry?.[tone], SORRY_FILLS, problems);
    // The other things you can say.
    extra("shared.json ask", s.ask ?? {}, Object.keys(ASK_FILLS), problems);
    for (const [kind, fills] of Object.entries(ASK_FILLS))
      check(`shared.json ask.${kind}`, s.ask?.[kind], fills, problems);
    for (const line of s.ask?.bond ?? [])
      if (!line.includes("{other}")) problems.push(`shared.json ask.bond: needs {other}: "${line}"`);
    // And her answers to them.
    extra("shared.json answers", s.answers ?? {}, ["more", "feeling", "sorry", "bye", "byeWarm"], problems);
    for (const kind of ["more", "bye", "byeWarm"]) check(`shared.json answers.${kind}`, s.answers?.[kind], BASE_FILLS, problems);
    const feeling = (s.answers?.feeling ?? {}) as Record<string, string[]>;
    extra("shared.json answers.feeling", feeling, FEELING_KEYS, problems);
    for (const k of FEELING_KEYS) check(`shared.json answers.feeling.${k}`, feeling[k], BASE_FILLS, problems);
    const sorry = (s.answers?.sorry ?? {}) as Record<string, string[]>;
    extra("shared.json answers.sorry", sorry, TASTE_KEYS, problems);
    for (const k of TASTE_KEYS) check(`shared.json answers.sorry.${k}`, sorry[k], [...BASE_FILLS, "rival"], problems);
    // Her questions: an ask, and two to five answers of yours, each in a tone.
    const list = s.herAsks?.list ?? [];
    if (!list.length) problems.push("shared.json herAsks.list: should have at least one question");
    check("shared.json herAsks asks", list.map((h) => h.ask), BASE_FILLS, problems);
    list.forEach((h, i) => {
      const tones = Object.keys(h.replies ?? {});
      if (tones.length < 2 || tones.length > TONE_KEYS.length)
        problems.push(`shared.json herAsks.list.${i}: needs two to five replies`);
      for (const t of tones)
        if (!(TONE_KEYS as readonly string[]).includes(t))
          problems.push(`shared.json herAsks.list.${i}: "${t}" is not a tone`);
      check(`shared.json herAsks.list.${i}.replies`, Object.values(h.replies ?? {}), [], problems);
    });
    report(problems);
  });

  it("finds a pair's lines whichever way round the two are asked for", () => {
    const one = pairTalk("xalatath", "azshara");
    const two = pairTalk("azshara", "xalatath");
    assert.ok(one.notice.length > 0);
    assert.deepEqual(one.notice, two.notice);
    assert.ok((one.says.azshara ?? []).length > 0 && (one.says.xalatath ?? []).length > 0);
    assert.deepEqual(pairTalk("jaina", "valeera"), { notice: [], says: {} });
  });

  it("knows every fill the game gives", () => {
    assert.deepEqual(Object.keys(RUMOR_FILLS).sort(), [...RUMOR_KINDS].sort());
    assert.deepEqual(
      Object.keys(PRESENCE_FILLS.lines).sort(),
      Object.keys(C.presence.lines).sort(),
    );
    assert.deepEqual(
      Object.keys(PRESENCE_FILLS.notices).sort(),
      Object.keys(C.presence.notices).sort(),
    );
  });
});
