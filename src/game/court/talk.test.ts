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
  BASE_FILLS,
  BOND_TALK_FILLS,
  DUO_FILLS,
  FEED_FILLS,
  PRAY_FILLS,
  LINE_FILLS,
  PRESENCE_FILLS,
  QUEEN_TALK,
  RUMOR_FILLS,
  SHARED,
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
      ["topics", "pickupLines", "presence", "rumors", "bondTalk", "duo", "duoReply"],
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
    extra("shared.json bondTalk", s.bondTalk ?? {}, Object.keys(BOND_TALK_FILLS), problems);
    for (const [kind, list] of Object.entries(s.bondTalk ?? {}))
      if (!kind.startsWith("_"))
        check(`shared.json bondTalk.${kind}`, list, BOND_TALK_FILLS[kind] ?? [], problems);
    report(problems);
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
