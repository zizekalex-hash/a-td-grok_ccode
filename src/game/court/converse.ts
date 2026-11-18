/**
 * Talking with a queen face to face (the talk screen): what you can say each
 * turn, and what she answers. You pick from a short list, as in a role-playing
 * game: topics to ask about, lines in a tone (sweet, bold, witty, humble,
 * honest), and now and then her wish, her feelings, your story together, or a
 * sister, friend or rival of hers. Each queen loves one tone, likes one and
 * dislikes one (court.talk.tastes), so the same line lands differently with
 * each. She sometimes adds a line of her own, or asks you something back. When
 * she is jealous the tones are apologies. A bottle of crystal wine, poured once
 * a talk, opens an exotic conversation: for a few exchanges what you can ask
 * turns to deeper things, each worth a little affection outside the day's limit
 * (the game answers each only after a phrase has been recited for her).
 *
 * The words live in the talk pack (talk/shared.json and each queen's file).
 * Pure: randomness is passed in. No path aliases (tests).
 */
import { CONFIG } from "../config.ts";
import { QUEEN_KEYS, type CourtSave, type QueenKey } from "./rules.ts";
import { bondsOf, type Mood } from "./hearts.ts";
import { dress, fillAll, speak, WARM_TIER, type Fill } from "./speech.ts";
import {
  answerLines,
  askLines,
  bondTalkLines,
  exoticTopics,
  herAsks,
  pickupLines,
  reactLines,
  sorryLines,
  TONE_KEYS,
  toneLines,
  type HerAsk,
} from "./talk.ts";
import { TOPICS, VOICES } from "./voices.ts";
import { cleanVoice } from "./hervoice.ts";
import { loadLife } from "./life.ts";

const C = CONFIG.court;
const T = C.talk;

export type Tone = (typeof TONE_KEYS)[number];
export type Taste = "loved" | "liked" | "plain" | "disliked";
export const TONES: readonly Tone[] = TONE_KEYS;

/** Each tone's name on a choice. */
export const TONE_NAME: Record<Tone, string> = {
  sweet: "Sweet",
  bold: "Bold",
  witty: "Witty",
  humble: "Humble",
  honest: "Honest",
};

/** How a queen takes a tone: the one she loves, the one she likes, the one she dislikes; plainly, any other. */
export function tasteOf(q: QueenKey, tone: string): Taste {
  const t = T.tastes[q];
  if (t?.loved === tone) return "loved";
  if (t?.liked === tone) return "liked";
  if (t?.disliked === tone) return "disliked";
  return "plain";
}

/** What kind of thing a choice says. */
export type ChoiceKind =
  | "topic"
  | "more"
  | "tone"
  | "reply"
  | "sorry"
  | "bond"
  | "wish"
  | "memory"
  | "feeling"
  | "pour"
  | "exotic"
  | "bye";

export interface Choice {
  id: string;
  kind: ChoiceKind;
  /** What you say. */
  text: string;
  /** The topic it asks about; the tone it is said in; the queen it asks about. */
  topic?: string;
  tone?: Tone;
  other?: QueenKey;
}

/** A conversation as it goes. */
export interface Talk {
  queen: QueenKey;
  /** Exchanges so far. */
  turns: number;
  /** Topics talked about, the latest last; the one just answered, and what she has said on it. */
  topics: string[];
  last: string | null;
  told: string[];
  /** Tones offered lately, so all five come round. */
  tones: Tone[];
  /** A question of hers waiting for your answer, and the ones she has asked in this talk. */
  asked: HerAsk | null;
  askedAll: string[];
  /** What has been asked once already in this talk (wish, memory, feeling, a bond by its queen). */
  done: string[];
  /** An apology has eased her jealousy in this talk. */
  soothed: boolean;
  /** Sips left of the crystal wine poured in this talk (0: no bottle is open). */
  wine: number;
}

/** What a conversation knows of the moment. */
export interface TalkContext {
  /** Her affection tier (0 Stranger to 5 Devoted). */
  tier: number;
  /** Values for the placeholders in her lines (speech.ts). */
  fill: Fill;
  /** How she feels: one of talk.ts FEELING_KEYS. */
  feeling: string;
  jealous: boolean;
  /** Who she is jealous of. */
  rival: string;
  /** Today's wish, while it can still be granted. */
  wish: { count: number; skill: string } | null;
  /** Passes recited for her. */
  passes: number;
  /** Bottles of crystal wine you carry. */
  bottles: number;
}

export interface Reply {
  /** What she says, a line at a time. */
  lines: string[];
  /** How she took it, when it was said in a tone. */
  taste: Taste | null;
  /** What the exchange is worth (before the day's limit). */
  affection: number;
  /** A mood it leaves her in for a while. */
  mood: Mood | null;
  /** She told today's wish. An apology eased her jealousy. The talk is over. */
  toldWish: boolean;
  soothed: boolean;
  ended: boolean;
  /** The exchange counts outside the day's limit (the wine's). */
  free: boolean;
  /** A bottle was poured: one less in the bag. */
  poured: boolean;
}

export function newTalk(queen: QueenKey): Talk {
  return {
    queen,
    turns: 0,
    topics: [],
    last: null,
    told: [],
    tones: [],
    asked: null,
    askedAll: [],
    done: [],
    soothed: false,
    wine: 0,
  };
}

function pick<T>(list: readonly T[], rand: () => number): T | undefined {
  return list.length
    ? list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
    : undefined;
}

/** The lines of a list that can be said now (every placeholder filled). */
function ready(list: readonly string[], fill: Fill): string[] {
  return list.map((l) => fillAll(l, fill)).filter((l): l is string => !!l);
}

/** `n` different items of a list, at random. */
function some<T>(list: readonly T[], n: number, rand: () => number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const i = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    out.push(pool.splice(i, 1)[0] as T);
  }
  return out;
}

/** Her pet name for you and something on her mind, with her name for your own lines. */
function fills(q: QueenKey, ctx: TalkContext, rand: () => number): Fill {
  const v = VOICES[q];
  return {
    pet: pick(v.pet, rand),
    thing: pick(v.things, rand),
    queen: C.queens[q].name,
    rival: ctx.rival || undefined,
    ...ctx.fill,
  };
}

/** A topic's answers that she can give now and has not given in this talk. */
function untold(t: Talk, topic: string, fill: Fill): string[] {
  const all =
    topic === "own" ? ready(VOICES[t.queen].talk, fill) : ready(TOPICS[topic]?.answer ?? [], fill);
  return all.filter((a) => !t.told.includes(a));
}

/** The tones to offer now: the ones not offered lately first, so all come round. */
function nextTones(t: Talk, n: number, rand: () => number): Tone[] {
  const recent = t.tones.slice(-(TONES.length - n));
  const fresh = TONES.filter((tone) => !recent.includes(tone));
  const out = some(fresh.length >= n ? fresh : TONES, n, rand);
  t.tones.push(...out);
  if (t.tones.length > 12) t.tones.splice(0, t.tones.length - 12);
  return out;
}

/** The exotic answers to a topic that she can give now and has not given in this talk. */
function exoticUntold(t: Talk, topic: string, fill: Fill): string[] {
  return ready(exoticTopics()[topic]?.answer ?? [], fill).filter((a) => !t.told.includes(a));
}

/** The bottle can be poured now: you carry one, she is fond enough and not jealous, and it is not poured yet in this talk. */
export function canPour(t: Talk, ctx: TalkContext): boolean {
  return (
    ctx.bottles > 0 &&
    ctx.tier >= C.wine.minTier &&
    !ctx.jealous &&
    t.wine === 0 &&
    !t.done.includes("pour")
  );
}

/** While a bottle is open: deeper things to ask (the ones not asked yet in this talk first), and goodbye. */
function exoticChoices(t: Talk, fill: Fill, rand: () => number): Choice[] {
  const all = exoticTopics();
  const able = Object.keys(all).filter(
    (k) => ready(all[k]!.ask, fill).length > 0 && exoticUntold(t, k, fill).length > 0,
  );
  const fresh = able.filter((k) => !t.done.includes(`exotic:${k}`));
  const out: Choice[] = [];
  for (const k of some(fresh.length ? fresh : able, Math.max(1, Math.floor(C.wine.choices)), rand)) {
    const ask = pick(ready(all[k]!.ask, fill), rand);
    if (ask) out.push({ id: `exotic:${k}`, kind: "exotic", text: ask, topic: k });
  }
  if (!out.length) return out;
  const bye = pick(ready(askLines("bye"), fill), rand);
  out.push({ id: "bye", kind: "bye", text: bye ?? "Goodbye for now." });
  return out;
}

/**
 * Something deeper she says by herself over the wine, with no question asked (on a
 * date night, between the phrases you recite): an answer from the exotic topics, in
 * her own voice. `told` holds the answers already said, as they are written in the
 * pack (not as filled, since her pet name for you changes), and this one is added to
 * it. Null when none is left.
 */
export function opensUp(q: QueenKey, told: string[], ctx: TalkContext, rand: () => number): string | null {
  const fill = fills(q, ctx, rand);
  // A topic at random (each equally likely), then an answer of it not said yet that can be filled in now.
  const topics = Object.values(exoticTopics())
    .map((topic) => topic.answer.filter((raw) => !told.includes(raw) && fillAll(raw, fill) !== null))
    .filter((raws) => raws.length > 0);
  const raws = pick(topics, rand);
  const raw = raws ? pick(raws, rand) : undefined;
  const line = raw ? fillAll(raw, fill) : null;
  if (!raw || !line) return null;
  told.push(raw);
  return dress(q, line, rand, ctx.tier, fill);
}

/**
 * What you can say now. Her question, when she has asked one: your answers to
 * it. While a bottle of crystal wine is open: deeper things to ask. Else topics
 * (or "tell me more" on the last one), lines in a tone (apologies while she is
 * jealous), one of the rarer questions, and goodbye; and the bottle, first,
 * while you have one to pour.
 */
export function choicesFor(t: Talk, ctx: TalkContext, rand: () => number): Choice[] {
  const q = t.queen;
  const fill = fills(q, ctx, rand);
  const out: Choice[] = [];
  if (t.asked) {
    for (const [tone, text] of Object.entries(t.asked.replies))
      if ((TONES as readonly string[]).includes(tone))
        out.push({ id: `reply:${tone}`, kind: "reply", text, tone: tone as Tone });
    if (out.length) return out;
    t.asked = null;
  }
  // A bottle is open: the exotic conversation (with no exotic words in the pack, the bottle is spent).
  if (t.wine > 0) {
    const exotic = exoticChoices(t, fill, rand);
    if (exotic.length) return exotic;
    t.wine = 0;
  }
  // Topics: fresh ones first; a follow-up on the last one takes the first place.
  const able = Object.keys(TOPICS).filter(
    (k) => ready(TOPICS[k]!.ask, fill).length > 0 && untold(t, k, fill).length > 0,
  );
  const recent = t.topics.slice(-8);
  const fresh = able.filter((k) => !recent.includes(k));
  const topics = some(fresh.length >= T.topics ? fresh : able, Math.max(1, T.topics), rand);
  if (t.last && untold(t, t.last, fill).length > 0) {
    const more = pick(ready(askLines("more"), fill), rand);
    if (more) {
      out.push({ id: "more", kind: "more", text: more, topic: t.last });
      topics.length = Math.max(0, topics.length - 1);
    }
  }
  for (const k of topics) {
    const ask = pick(ready(TOPICS[k]!.ask, fill), rand);
    if (ask) out.push({ id: `topic:${k}`, kind: "topic", text: ask, topic: k });
  }
  // Tones: apologies while she is jealous (until one has landed), else plain lines.
  const sorry = ctx.jealous && !t.soothed;
  for (const tone of nextTones(t, Math.max(1, T.tones + (sorry ? 1 : 0)), rand)) {
    // Your old pick-up lines are witty ones.
    const lines = sorry
      ? sorryLines(tone)
      : tone === "witty"
        ? [...toneLines(tone), ...pickupLines()]
        : toneLines(tone);
    const line = pick(ready(lines, fill), rand);
    if (line)
      out.push({ id: `${sorry ? "sorry" : "tone"}:${tone}`, kind: sorry ? "sorry" : "tone", text: line, tone });
  }
  // One of the rarer questions, each once a talk.
  const rare: Choice[] = [];
  const once = (kind: "wish" | "memory" | "feeling") => {
    if (t.done.includes(kind)) return;
    const line = pick(ready(askLines(kind), fill), rand);
    if (line) rare.push({ id: kind, kind, text: line });
  };
  if (ctx.wish) once("wish");
  if (ctx.passes > 0) once("memory");
  once("feeling");
  for (const b of bondsOf(q)) {
    if (t.done.includes(`bond:${b.queen}`) || !bondTalkLines(b.kind).length) continue;
    const line = pick(ready(askLines("bond"), { ...fill, other: C.queens[b.queen].name }), rand);
    if (line) rare.push({ id: `bond:${b.queen}`, kind: "bond", text: line, other: b.queen });
  }
  // Her wish comes up first, while she has one to tell.
  const wish = rare.find((r) => r.kind === "wish");
  const special = wish && t.turns < 2 ? wish : pick(rare, rand);
  if (special) out.push(special);
  const bye = pick(ready(askLines("bye"), fill), rand);
  out.push({ id: "bye", kind: "bye", text: bye ?? "Goodbye for now." });
  // The bottle comes first.
  if (canPour(t, ctx)) {
    const pour = pick(ready(askLines("pour"), fill), rand);
    if (pour) out.unshift({ id: "pour", kind: "pour", text: pour });
  }
  return out;
}

/** The mood a tone leaves her in. */
function moodFor(taste: Taste, tier: number): Mood | null {
  if (taste === "loved") return tier >= WARM_TIER ? "smitten" : "delighted";
  if (taste === "liked") return "blush";
  if (taste === "disliked") return "aloof";
  return null;
}

/**
 * Her answer to what you said, and what it does. The conversation moves on:
 * the topic is remembered, a question of hers is answered, and now and then she
 * adds a line of her own or asks you something back.
 */
export function replyTo(t: Talk, c: Choice, ctx: TalkContext, rand: () => number): Reply {
  const q = t.queen;
  const fill = fills(q, ctx, rand);
  const say = (core: string) => dress(q, core, rand, ctx.tier, fill);
  const out: Reply = {
    lines: [],
    taste: null,
    affection: 0,
    mood: null,
    toldWish: false,
    soothed: false,
    ended: false,
    free: false,
    poured: false,
  };
  t.turns += 1;
  const wasAsked = t.asked;
  t.asked = null;
  // "Tell me more" follows a topic's answer only: anything else said in between drops the thread.
  if (c.kind !== "topic" && c.kind !== "more") t.last = null;

  if (c.kind === "bye") {
    const pool = ready(answerLines(ctx.tier >= WARM_TIER ? "byeWarm" : "bye"), fill);
    out.lines.push(pick(pool, rand) ?? "Until next time.");
    out.ended = true;
    return out;
  }

  if (c.kind === "topic" || c.kind === "more") {
    const topic = c.topic ?? t.last ?? "own";
    if (topic !== t.last) t.told = [];
    const core = pick(untold(t, topic, fill), rand) ?? pick(ready(VOICES[q].talk, fill), rand) ?? "...";
    t.told.push(core);
    t.last = topic;
    t.topics = [...t.topics.filter((k) => k !== topic), topic].slice(-12);
    // More on a topic: a lead-in and what she adds, with no opener in between.
    const lead = c.kind === "more" ? pick(ready(answerLines("more"), fill), rand) : undefined;
    out.lines.push(lead ? `${lead} ${core}` : say(core));
    out.affection = T.affection.topic;
  } else if (c.kind === "tone" || c.kind === "reply" || c.kind === "sorry") {
    const taste = tasteOf(q, c.tone ?? "");
    out.taste = taste;
    const pool =
      c.kind === "sorry" ? ready(answerLines("sorry", taste), fill) : ready(reactLines(taste), fill);
    out.lines.push(say(pick(pool, rand) ?? "..."));
    out.affection = T.affection[taste];
    out.mood = moodFor(taste, ctx.tier);
    if (c.kind === "sorry" && (taste === "loved" || taste === "liked")) {
      out.soothed = true;
      t.soothed = true;
    }
  } else if (c.kind === "bond" && c.other) {
    t.done.push(`bond:${c.other}`);
    const kind = bondsOf(q).find((b) => b.queen === c.other)?.kind;
    const pool = ready(kind ? bondTalkLines(kind) : [], { ...fill, other: C.queens[c.other].name });
    out.lines.push(say(pick(pool, rand) ?? "..."));
    out.affection = T.affection.topic;
  } else if (c.kind === "pour") {
    // The bottle is poured: she is glad of it, and what you can ask turns to deeper things.
    t.done.push("pour");
    t.wine = Math.max(1, Math.floor(C.wine.sips));
    out.lines.push(say(pick(ready(answerLines("pour"), fill), rand) ?? "..."));
    out.affection = C.wine.pour;
    out.mood = moodFor("loved", ctx.tier);
    out.free = true;
    out.poured = true;
  } else if (c.kind === "exotic") {
    // A sip, and something she would not say sober; the last sip empties the bottle.
    const topic = c.topic ?? "";
    t.done.push(`exotic:${topic}`);
    const core =
      pick(exoticUntold(t, topic, fill), rand) ??
      pick(ready(exoticTopics()[topic]?.answer ?? [], fill), rand) ??
      pick(ready(VOICES[q].talk, fill), rand) ??
      "...";
    t.told.push(core);
    out.lines.push(say(core));
    out.affection = C.wine.sipAffection;
    out.mood = moodFor("loved", ctx.tier);
    out.free = true;
    t.wine = Math.max(0, t.wine - 1);
    if (t.wine === 0) {
      const last = pick(ready(answerLines("empty"), fill), rand);
      if (last) out.lines.push(say(last));
    }
  } else if (c.kind === "wish") {
    t.done.push("wish");
    if (ctx.wish) {
      out.lines.push(speak(q, "wish", rand, { ...fill, ...ctx.wish }, ctx.tier));
      out.toldWish = true;
    } else out.lines.push(say(pick(ready(answerLines("feeling", "calm"), fill), rand) ?? "..."));
    out.affection = T.affection.topic;
  } else if (c.kind === "memory") {
    t.done.push("memory");
    out.lines.push(
      speak(q, "memory", rand, { ...fill, count: ctx.passes.toLocaleString("en") }, ctx.tier),
    );
    out.affection = T.affection.topic;
  } else if (c.kind === "feeling") {
    t.done.push("feeling");
    const pool = ready(answerLines("feeling", ctx.feeling), fill);
    const calm = ready(answerLines("feeling", "calm"), fill);
    out.lines.push(say(pick(pool.length ? pool : calm, rand) ?? "..."));
    out.affection = T.affection.topic;
  }

  // Not after her own question, nor while she is angry, nor over the wine: now and then a line of her own, or a question back.
  if (!wasAsked && !ctx.jealous && out.taste !== "disliked" && !out.free) {
    if (rand() < T.moreChance) {
      const own = ready(VOICES[q].talk, fill).filter((l) => !t.told.includes(l) && !out.lines.includes(l));
      const extra = pick(own, rand);
      if (extra) {
        t.told.push(extra);
        out.lines.push(extra);
      }
    }
    if (rand() < T.askChance) {
      const open = herAsks().filter((h) => !t.askedAll.includes(h.ask));
      const h = pick(open, rand);
      const ask = h ? fillAll(h.ask, fill) : null;
      if (h && ask) {
        t.asked = h;
        t.askedAll.push(h.ask);
        out.lines.push(ask);
      }
    }
  }
  return out;
}

/** How many different exchanges a queen's talk can have (for the tests): what you can say times what she can answer. */
export function talkVariety(q: QueenKey): number {
  const v = VOICES[q];
  const dressed = (n: number) => n * (1 + v.open.length) * (1 + v.close.length + v.warm.length);
  let total = 0;
  for (const t of Object.values(TOPICS)) total += t.ask.length * dressed(t.answer.length);
  for (const tone of TONES)
    total += toneLines(tone).length * dressed(reactLines(tasteOf(q, tone)).length);
  return total;
}

// ---- What a save keeps of your talks ----

/** Reads the talk screen's part of a save, each value checked. */
export function loadTalk(save: CourtSave, data: unknown) {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const tried = rec(d.tried);
  const talked = rec(d.talked);
  const count = rec(talked.count);
  const day = talked.day;
  save.talked.day = typeof day === "number" && Number.isFinite(day) ? Math.max(0, Math.floor(day)) : 0;
  for (const q of QUEEN_KEYS) {
    const list = Array.isArray(tried[q]) ? (tried[q] as unknown[]) : [];
    save.tried[q] = TONES.filter((tone) => list.includes(tone));
    const n = count[q];
    save.talked.count[q] = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  save.near = d.near !== false;
  save.source = typeof d.source === "string" && d.source.length <= 200 ? d.source : "";
  const wine = d.wine;
  save.wine =
    typeof wine === "number" && Number.isFinite(wine)
      ? Math.max(0, Math.min(CONFIG.court.wine.max, Math.floor(wine)))
      : CONFIG.court.wine.start;
  const shared = rec(d.wineShared);
  for (const q of QUEEN_KEYS) {
    const n = shared[q];
    save.wineShared[q] = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1_000_000, Math.floor(n))) : 0;
  }
  save.textRounds = {};
  for (const [key, n] of Object.entries(rec(d.textRounds)).slice(0, 500))
    if (key.length <= 200 && typeof n === "number" && Number.isFinite(n) && n >= 1)
      save.textRounds[key] = Math.min(1_000_000, Math.floor(n));
  save.life = loadLife(d.life, QUEEN_KEYS);
  const sound = rec(d.sound);
  const voices = rec(sound.voices);
  save.sound = {
    phrase: sound.phrase !== false,
    lines: sound.lines !== false,
    voices: Object.fromEntries(QUEEN_KEYS.map((q) => [q, cleanVoice(voices[q])])) as Record<
      QueenKey,
      string
    >,
  };
}

/** Exchanges with her that still add affection today. */
export function talksLeft(save: CourtSave, q: QueenKey, day: number): number {
  const used = save.talked.day === day ? save.talked.count[q] : 0;
  return Math.max(0, Math.floor(T.perDay) - used);
}

/** Counts an exchange with her today; false when the day's exchanges are used up. */
export function countTalk(save: CourtSave, q: QueenKey, day: number): boolean {
  if (save.talked.day !== day) {
    save.talked.day = day;
    for (const k of QUEEN_KEYS) save.talked.count[k] = 0;
  }
  if (save.talked.count[q] >= Math.floor(T.perDay)) return false;
  save.talked.count[q] += 1;
  return true;
}

/** A tone tried on her is remembered: the choices then show how she takes it. */
export function markTried(save: CourtSave, q: QueenKey, tone: Tone) {
  if (!save.tried[q].includes(tone)) save.tried[q] = [...save.tried[q], tone];
}

/** How she takes a tone, if you have tried it on her; null while you do not know. */
export function knownTaste(save: CourtSave, q: QueenKey, tone: Tone): Taste | null {
  return save.tried[q].includes(tone) ? tasteOf(q, tone) : null;
}
