import { sfx } from "@/game/audio";
import { Backdrop } from "@/game/backdrop";
import { CONFIG } from "@/game/config";
import { FrameLimiter, frameStats, renderDpr } from "@/game/frameLimiter";
import { speakAs } from "@/game/narrator";
import { DISPLAY, FONT, PAL } from "@/game/palette";
import { loadPieceFont, PIECE_FONT, TEXT_VS } from "@/game/pieceFont";
import { getGame, setActiveGame, type GameBase } from "@/game/registry";
import { useGame, type CourtPanel, type CourtView } from "@/game/store";
import {
  advance,
  affectionGain,
  firstGate,
  gateOf,
  isRegion,
  needLabel,
  needMet,
  queensIn,
  giftValue,
  meetsNeed,
  newSave,
  passAt,
  passMs,
  pickPhrase,
  QUEEN_KEYS,
  queenAt,
  regionOf,
  queenLine,
  SKILL_KEYS,
  GIFT_KEYS,
  skillAt,
  skillLevel,
  startSession,
  nextRound,
  skipPhrase,
  tapComplete,
  timeLeft,
  tierOf,
  totalLevel,
  type CourtSave,
  type Element,
  type GiftKey,
  type LineKey,
  type PlaceKey,
  type QueenKey,
  type RegionKey,
  type Reward,
  type Session,
  type SkillKey,
} from "./rules.ts";
import {
  destinationFor,
  nearestWalkable,
  parseWorld,
  pathTo,
  walkable,
  type Spot,
  type World,
} from "./world.ts";
import { queenPortrait } from "./portrait.ts";
import { shade } from "./svgkit.ts";
import {
  drawLive,
  drawWorld,
  HEADROOM,
  nightLevel,
  sceneOf,
  vignette,
  type Light,
  type Scene,
} from "./art.ts";
import {
  arcMult,
  arcOf,
  BOND_NAME,
  bondOf,
  countWish,
  dayOf,
  goodWord,
  hoursAway,
  jealousMult,
  loadHearts,
  markSeen,
  memoryAt,
  missesYou,
  MOOD_INFO,
  moodOf,
  rollDay,
  setArc,
  soothe,
  stirJealousy,
  wishOf,
  type Flash,
  type Mood,
} from "./hearts.ts";
import { addNews, bondTalk, buzzMult, buzzOf, loadNews, makeRumor, unreadNews } from "./news.ts";
import { comeOutChance, encounterOf, foundKind, pairKey, presenceLine } from "./presence.ts";
import type { CourtArcKey } from "@/game/config";

const C = CONFIG.court;
const H = C.hearts;
const N = C.news;
const P = C.presence;

/** A queen out on the map looking for you. */
interface Outing {
  /** Where she is, in cells, and the cells still to walk. */
  x: number;
  y: number;
  path: Spot[];
  /** When she came out and when she found you (ms; 0 for not yet). */
  since: number;
  foundAt: number;
  /** You talked to her, gave her a gift or recited for her while she was out. */
  met: boolean;
  /** On her way home. */
  home: boolean;
  /** How she felt when she came out. */
  was: CourtArcKey | null;
}
const SAVE_KEY = "azshara-court-v1";
const PLAYER = "Alien X";
export const STANCE_COLOR: Record<Element, string> = { fire: "#ff8a3d", water: "#5cc8ff" };

function readSave(): CourtSave {
  const save = newSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const d = (raw ? JSON.parse(raw) : null) as Partial<CourtSave> | null;
    if (!d || typeof d !== "object") return save;
    const num = (v: unknown, lo = 0) =>
      typeof v === "number" && Number.isFinite(v) ? Math.max(lo, v) : null;
    for (const k of SKILL_KEYS) save.skills[k] = num(d.skills?.[k]) ?? 0;
    for (const q of QUEEN_KEYS) {
      save.affection[q] = num(d.affection?.[q]) ?? 0;
      save.dates[q] = num(d.dates?.[q]) ?? 0;
    }
    for (const g of GIFT_KEYS) save.gifts[g] = Math.floor(num(d.gifts?.[g]) ?? 0);
    save.gold = Math.floor(num(d.gold) ?? 0);
    save.stance = d.stance === "water" ? "water" : "fire";
    save.region = isRegion(d.region) ? d.region : "realm";
    save.elixirReps = Math.floor(num(d.elixirReps) ?? 0);
    save.wordMs = Math.min(C.wordMsMax, Math.max(C.wordMsMin, num(d.wordMs) ?? C.wordMs));
    save.phrasesPerRound = Math.min(
      10,
      Math.max(1, Math.round(num(d.phrasesPerRound, 1) ?? C.phrasesPerRound)),
    );
    save.repsPerPhrase = Math.min(
      10,
      Math.max(1, Math.round(num(d.repsPerPhrase, 1) ?? C.repsPerPhrase)),
    );
    save.stats = {
      reps: num(d.stats?.reps) ?? 0,
      phrases: num(d.stats?.phrases) ?? 0,
      bestStreak: num(d.stats?.bestStreak) ?? 0,
    };
    const pos = d.pos;
    if (Array.isArray(pos) && typeof pos[0] === "number" && typeof pos[1] === "number")
      save.pos = [pos[0], pos[1]];
    loadHearts(save, d);
    loadNews(save, d);
  } catch {
    /* private mode / broken save */
  }
  return save;
}

/** The loaded texts' sectors, or the built-in text. */
function allTexts(): string[][] {
  const { texts, lines } = useGame.getState();
  return texts.length ? texts.map((t) => t.lines) : [lines];
}

function skillName(k: SkillKey) {
  return C.skills[k].name;
}

/** The Court: walk a small world by tapping, recite at its places to raise skills, and win the queens over. */
export class CourtGame implements GameBase {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private backdrop = new Backdrop();
  private limiter = new FrameLimiter();
  private renderScale = 0;
  private save = readSave();
  /** Each region's map, read once. */
  private worlds = new Map<RegionKey, World>();
  /** What moves in each region, found once. */
  private scenes = new Map<RegionKey, Scene>();
  /** A queen in another region you asked to visit: the walk goes through the gates to her. */
  private visiting: QueenKey | null = null;
  /** Each queen's portrait in each mood, ready to draw on the map once loaded. */
  private portraits = new Map<string, HTMLImageElement>();
  private shown = new Map<QueenKey, CanvasImageSource>();
  /** Portraits painted at the size the map draws them, by mood, tier and pixels. */
  private bitmaps = new Map<string, HTMLCanvasElement>();
  /** Glows by colour, painted once. */
  private glows = new Map<string, HTMLCanvasElement>();
  /** How dark it is, by the clock (0 day, 1 night), and when that was last checked. */
  private night = 0;
  private nightAt = -1;
  /** The average frame time, and whether the map has dropped its smaller effects to keep up. */
  private frameAvg = 0;
  private lite = false;
  private startedAt = 0;
  /** A mood from a moment, per queen, and who each jealous queen is jealous of. */
  private flash = new Map<QueenKey, Flash>();
  private rivals = new Map<QueenKey, QueenKey>();
  /** Queens who have told you today's wish. */
  private wishTold = new Set<string>();
  /** Where you are drawn, in cells, and the cells still to walk. */
  private pos: { x: number; y: number };
  private path: Spot[] = [];
  private goal: { kind: "place"; place: PlaceKey } | { kind: "queen"; queen: QueenKey } | null =
    null;
  private at: PlaceKey | null = null;
  private panel: CourtPanel = null;
  private session: Session | null = null;
  private pausedAt: number | null = null;
  private drops: { id: number; text: string; color: string; born: number }[] = [];
  private dropId = 1;
  /** Notices about the queens: they stay on screen longer than drops, and go into the News. */
  private notices: {
    id: number;
    text: string;
    queen: QueenKey | null;
    color: string;
    born: number;
  }[] = [];
  /** Seconds until the town talks again, and what it said last (so it says something else). */
  private gossipIn = N.firstGossipSeconds;
  private lastRumor: { kind?: string; queen?: QueenKey | null } = {};
  /** Queens out on the map looking for you; seconds until one may come out, until they look where you are again, and until meetings are checked. */
  private out = new Map<QueenKey, Outing>();
  private presenceIn = P.firstSeconds;
  private retargetIn = 0;
  private encounterIn = 1;
  /** When each pair of queens last met on the map (ms). */
  private encounters = new Map<string, number>();
  private line: CourtView["line"] = null;
  private message = "Tap anywhere to walk there. Tap a place to train, a queen to talk.";
  private raf = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private flashT = 0;
  private reduce = false;
  private ro: ResizeObserver | null = null;
  private viewAt = 0;
  private viewSig = "";
  /** The map has been drawn once under the recite screen. */
  private coveredDrawn = false;
  private saveAt = 0;
  private cell = 32;
  private ox = 0;
  private oy = 0;
  private w = 1;
  private h = 1;
  private board: HTMLCanvasElement = document.createElement("canvas");
  private boardKey = "";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    this.ctx = ctx;
    const [c, r] = walkable(this.world, this.save.pos[0], this.save.pos[1])
      ? this.save.pos
      : (C.regions[this.save.region].start as Spot);
    this.pos = { x: c, y: r };
  }

  /** The map of the region you are in. */
  private get world(): World {
    const region = this.save.region;
    let w = this.worlds.get(region);
    if (!w) {
      w = parseWorld(region);
      this.worlds.set(region, w);
    }
    return w;
  }

  start() {
    setActiveGame(this);
    loadPieceFont();
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("keydown", this.onKey);
    document.addEventListener("visibilitychange", this.onHide);
    this.running = true;
    this.last = performance.now();
    this.startedAt = this.last;
    this.raf = requestAnimationFrame(this.frame);
    this.pushView(true);
  }

  stop() {
    this.persist();
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKey);
    document.removeEventListener("visibilitychange", this.onHide);
    if (getGame() === this) setActiveGame(null);
  }

  private onHide = () => {
    if (document.visibilityState === "hidden") this.persist();
  };

  engage() {
    sfx.unlock();
    this.session = null;
    this.panel = null;
    useGame.setState({ phase: "battle", paused: false, tomeOpen: false, drawer: false });
    // Queens who missed you while you were away are lonely for a while.
    const now = Date.now();
    for (const q of QUEEN_KEYS)
      if (missesYou(this.save, q, now) && !arcOf(this.save, q, now))
        setArc(this.save, q, "lonely", now);
    this.out.clear();
    this.presenceIn = P.firstSeconds;
    this.say0("eltharia", "greet");
    this.pushView(true);
  }

  toTitle() {
    this.endSession();
    this.panel = null;
    this.persist();
    useGame.setState({ phase: "title", paused: false, tomeOpen: false, drawer: false });
    this.pushView(true);
  }

  togglePause() {
    if (useGame.getState().phase !== "battle") return;
    useGame.setState({ paused: !useGame.getState().paused });
  }

  toggleTome() {
    useGame.setState({ tomeOpen: !useGame.getState().tomeOpen });
  }

  persist() {
    this.save.pos = [Math.round(this.pos.x), Math.round(this.pos.y)];
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* private mode / quota */
    }
  }

  onCodex() {
    this.pushView(true);
  }

  say() {
    /* The Court's queens speak for themselves. */
  }

  // ---- Lines ----

  /** A queen's scripted line, then (with a model connected) one in her own words. */
  private queenSays(
    q: QueenKey,
    key: LineKey,
    fill: Record<string, string | number> = {},
    situation = "",
  ) {
    const spec = C.queens[q];
    this.line = {
      speaker: spec.name,
      text: queenLine(q, key, Math.random(), fill),
      color: spec.color,
      queen: q,
    };
    this.see(q);
    if (situation) {
      speakAs(`${spec.name}, ${spec.title}: ${spec.persona}`, situation, (text) => {
        if (!this.running) return;
        this.line = { speaker: spec.name, text, color: spec.color, queen: q };
        this.pushView(true);
      });
    }
    this.pushView(true);
  }

  private say0(q: QueenKey, key: LineKey) {
    this.queenSays(q, key, { need: C.queens[q].need.level });
  }

  private drop(text: string, color: string) {
    this.drops.push({ id: this.dropId++, text, color, born: performance.now() });
    if (this.drops.length > 8) this.drops.shift();
  }

  /** A notice about a queen (or the town): on screen for court.news.noticeSeconds, and kept in the News. */
  private notice(text: string, queen: QueenKey | null, kind = "notice") {
    const color = queen ? C.queens[queen].color : PAL.gold;
    this.notices.push({ id: this.dropId++, text, queen, color, born: performance.now() });
    if (this.notices.length > 6) this.notices.shift();
    addNews(this.save, { at: Date.now(), text, queen, kind });
  }

  /** Taps a notice away; on the map, a notice about a queen opens her sheet. */
  courtNotice(id: number) {
    const n = this.notices.find((x) => x.id === id);
    this.notices = this.notices.filter((x) => x.id !== id);
    if (n?.queen && !this.session) this.courtOpen({ kind: "queen", queen: n.queen });
    else this.pushView(true);
  }

  // ---- Queens who come out to find you ----

  /** Where she is now, in cells: out on the map, or at her place. */
  private queenSpot(q: QueenKey): { x: number; y: number } {
    const o = this.out.get(q);
    if (o) return { x: o.x, y: o.y };
    const [c, r] = C.queens[q].at as Spot;
    return { x: c, y: r };
  }

  private queenCell(q: QueenKey): Spot {
    const { x, y } = this.queenSpot(q);
    return [Math.round(x), Math.round(y)];
  }

  /** The queen who has found you and walks with you, if any. */
  private withYou(): QueenKey | null {
    for (const [q, o] of this.out) if (o.foundAt && !o.home) return q;
    return null;
  }

  /** You spent time with her: if she is out, she will go home happy, and stays a little longer. */
  private touch(q: QueenKey) {
    const o = this.out.get(q);
    if (!o) return;
    o.met = true;
    o.home = false;
    if (o.foundAt) o.foundAt = Date.now();
  }

  /** On the map: queens come out now and then, walk to you, stay a while, and go home. */
  private presence(dt: number) {
    if (!P.enabled) {
      for (const q of [...this.out.keys()]) this.endOuting(q, false);
      return;
    }
    this.moveOutings(dt);
    this.encounterIn -= dt;
    if (this.encounterIn <= 0) {
      this.encounterIn = 1;
      this.checkEncounters();
    }
    this.presenceIn -= dt;
    if (this.presenceIn > 0) return;
    this.presenceIn = Math.max(1, P.tickSeconds);
    // Not while a window is open: she comes when you are free to see her.
    if (this.panel || this.out.size >= P.maxOut) return;
    const now = Date.now();
    const day = dayOf(now);
    const ready = queensIn(this.save.region)
      .filter((q) => !this.out.has(q))
      .sort(() => Math.random() - 0.5);
    for (const q of ready) {
      if (Math.random() < comeOutChance(this.save, q, day, now, P.tickSeconds)) {
        this.comeOut(q);
        break;
      }
    }
  }

  /** She leaves her place and walks to you. */
  private comeOut(q: QueenKey) {
    const from = C.queens[q].at as Spot;
    const path = pathTo(this.world, from, this.cellOf());
    if (!path || path.length < 2) return;
    const now = Date.now();
    const was = arcOf(this.save, q, now)?.id ?? null;
    if (was !== "confront") setArc(this.save, q, "seeking", now);
    this.out.set(q, {
      x: from[0],
      y: from[1],
      path,
      since: now,
      foundAt: 0,
      met: false,
      home: false,
      was,
    });
    sfx.ready();
    const place = C.places[C.queens[q].place as PlaceKey].name;
    const text = presenceLine(
      was === "confront" ? "outConfront" : "out",
      { queen: C.queens[q].name, place },
      Math.random,
      "notices",
    );
    if (text) this.notice(text, q);
    this.pushView(true);
  }

  /** Each queen out walks on: to you, after you once she has found you, or home. */
  private moveOutings(dt: number) {
    if (!this.out.size) return;
    this.retargetIn -= dt;
    const retarget = this.retargetIn <= 0;
    if (retarget) this.retargetIn = 0.8;
    const now = Date.now();
    const me = this.cellOf();
    const linger = P.lingerMinutes * 60_000;
    // Each queen with you stands on her own cell beside you, so they never pile up.
    const taken = new Set<string>();
    for (const [q, o] of this.out) {
      if (!o.home) {
        const slot = this.besideYou(me, o, taken);
        taken.add(`${slot[0]},${slot[1]}`);
        if (!o.foundAt && Math.hypot(o.x - this.pos.x, o.y - this.pos.y) <= P.followDist)
          this.found(q, o);
        if (Math.hypot(o.x - slot[0], o.y - slot[1]) < 0.2) o.path = [];
        else if (retarget || !o.path.length)
          o.path = pathTo(this.world, [Math.round(o.x), Math.round(o.y)], slot) ?? o.path;
        // She stays a while once she has found you; if she never does, she gives up quietly.
        if (o.foundAt ? now - o.foundAt > linger : now - o.since > linger * 2) this.goHome(q, o);
      }
      this.stepAlong(o, dt * C.walkSpeed * P.speed);
      if (o.home && !o.path.length) this.endOuting(q, true);
    }
  }

  /** A free cell next to you (the one nearest her), or your own when none is free. */
  private besideYou(me: Spot, o: Outing, taken: Set<string>): Spot {
    let best: Spot = me;
    let bestD = Infinity;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const c = me[0] + dc;
        const r = me[1] + dr;
        if (!walkable(this.world, c, r) || taken.has(`${c},${r}`)) continue;
        const d = Math.hypot(c - o.x, r - o.y);
        if (d < bestD) {
          best = [c, r];
          bestD = d;
        }
      }
    }
    return best;
  }

  /** Moves her along her way by a distance in cells. */
  private stepAlong(o: Outing, dist: number) {
    let left = dist;
    while (left > 0 && o.path.length) {
      const [tc, tr] = o.path[0]!;
      const dx = tc - o.x;
      const dy = tr - o.y;
      const d = Math.hypot(dx, dy);
      if (d <= left) {
        o.x = tc;
        o.y = tr;
        left -= d;
        o.path.shift();
      } else {
        o.x += (dx / d) * left;
        o.y += (dy / d) * left;
        left = 0;
      }
    }
  }

  /** She has found you: she says so, in her mood. */
  private found(q: QueenKey, o: Outing) {
    const now = Date.now();
    o.foundAt = now;
    if (o.was !== "confront") setArc(this.save, q, "present", now);
    const kind = foundKind(o.was, hoursAway(this.save, q, now), Math.random);
    const text = presenceLine(
      kind,
      {
        hours: Math.floor(hoursAway(this.save, q, now)),
        rival: this.rivalName(q),
        passes: this.save.devotion[q].toLocaleString("en"),
        streak: this.save.stats.bestStreak,
      },
      Math.random,
      "lines",
      [
        ...(this.save.devotion[q] < 10 ? ["passes"] : []),
        ...(this.save.stats.bestStreak < 3 ? ["streak"] : []),
      ],
    );
    sfx.bless();
    const spec = C.queens[q];
    if (text) this.line = { speaker: spec.name, text, color: spec.color, queen: q };
    this.see(q);
    this.pushView(true);
  }

  /** Time to go: happy if you spent time with her, hurt if she found you and you ignored her. */
  private goHome(q: QueenKey, o: Outing) {
    o.home = true;
    const [hc, hr] = C.queens[q].at as Spot;
    const target = walkable(this.world, hc, hr)
      ? ([hc, hr] as Spot)
      : nearestWalkable(this.world, [hc, hr]);
    o.path = (target && pathTo(this.world, [Math.round(o.x), Math.round(o.y)], target)) || [];
    if (!o.foundAt) return;
    const now = Date.now();
    const spec = C.queens[q];
    const happy = o.met;
    setArc(this.save, q, happy ? "satisfied" : "distant", now);
    const line = presenceLine(happy ? "leaveHappy" : "leaveHurt", {}, Math.random);
    if (line) this.line = { speaker: spec.name, text: line, color: spec.color, queen: q };
    const notice = presenceLine(
      happy ? "leftHappy" : "leftHurt",
      { queen: spec.name },
      Math.random,
      "notices",
    );
    if (notice) this.notice(notice, q);
    this.persist();
    this.pushView(true);
  }

  /** She is back at her place (or you left her region): no longer out. */
  private endOuting(q: QueenKey, arrived: boolean) {
    const o = this.out.get(q);
    if (!o) return;
    // Leaving her region while she is with you and you never spoke: that hurts too.
    if (!arrived && !o.home && o.foundAt && !o.met) this.goHome(q, o);
    this.out.delete(q);
    this.pushView(true);
  }

  /** Two queens who meet on the map react to each other, if they are sisters, friends or rivals. */
  private checkEncounters() {
    if (!this.out.size) return;
    const now = Date.now();
    const here = queensIn(this.save.region);
    for (const q of this.out.keys()) {
      const a = this.queenSpot(q);
      for (const r of here) {
        if (r === q) continue;
        const b = this.queenSpot(r);
        if (Math.hypot(a.x - b.x, a.y - b.y) > P.encounterDist) continue;
        const key = pairKey(q, r);
        if (now - (this.encounters.get(key) ?? 0) < P.encounterMinutes * 60_000) continue;
        const e = encounterOf(q, r);
        if (!e) continue;
        this.encounters.set(key, now);
        // Rivals bristle; sisters and friends are glad to see each other.
        this.feel(q, e.kind === "rivals" ? "fierce" : "delighted");
        this.feel(r, e.kind === "rivals" ? "fierce" : "delighted");
        const text = presenceLine(
          e.kind,
          { queen: C.queens[q].name, other: C.queens[r].name, bond: e.bond },
          Math.random,
          "notices",
        );
        if (text) this.notice(text, q);
      }
    }
  }

  /** The town talks: a rumor now and then while you walk the map. */
  private gossip(dt: number) {
    if (N.gossipEverySeconds <= 0 || this.panel) return;
    this.gossipIn -= dt;
    if (this.gossipIn > 0) return;
    this.gossipIn = N.gossipEverySeconds * (0.75 + Math.random() * 0.5);
    const now = Date.now();
    const r = makeRumor(this.save, dayOf(now), now, Math.random, this.lastRumor);
    if (!r) return;
    this.lastRumor = { kind: r.kind, queen: r.queen };
    this.notice(r.text, r.queen, "rumor");
    this.pushView(true);
  }

  // ---- How the queens feel ----

  private moodNow(q: QueenKey): Mood {
    return moodOf(this.save, q, this.flash.get(q), Date.now());
  }

  /** A mood from a moment, for a while. */
  private feel(q: QueenKey, mood: Mood) {
    this.flash.set(q, { mood, until: Date.now() + H.flashSeconds * 1000 });
  }

  /** Her face as you see it now goes into the gallery; a new one pays a little gold. */
  private see(q: QueenKey) {
    if (!this.save.met[q] && meetsNeed(q, this.save.skills)) this.save.met[q] = Date.now();
    const mood = this.moodNow(q);
    if (!markSeen(this.save, q, mood)) return;
    this.save.gold += H.galleryGold;
    sfx.ready();
    this.notice(
      `New portrait: ${C.queens[q].name}, ${MOOD_INFO[mood].name} (+${H.galleryGold} gold)`,
      q,
    );
  }

  /** Time with her: if she has missed you, a reunion (and true). Either way she remembers you came. */
  private meet(q: QueenKey): boolean {
    const now = Date.now();
    const missed = missesYou(this.save, q, now);
    const hours = Math.floor(hoursAway(this.save, q, now));
    this.save.lastSeen[q] = now;
    if (!missed) return false;
    this.feel(q, "longing");
    const gained = this.addAffection(q, H.reunion, true);
    this.notice(`${C.queens[q].name} missed you so much: +${gained} ♥ reunion`, q);
    this.queenSays(
      q,
      "missed",
      { hours },
      `The player is back after ${hours} hours away. You missed them terribly and are overjoyed, a little teary.`,
    );
    return true;
  }

  /** She tells you today's wish, once a day; true when she did. */
  private tellWish(q: QueenKey): boolean {
    const day = dayOf(Date.now());
    rollDay(this.save, day);
    const key = `${day}|${q}`;
    if (this.wishTold.has(key) || this.save.wishes.done[q]) return false;
    this.wishTold.add(key);
    const w = wishOf(q, day);
    this.queenSays(
      q,
      "wish",
      { count: w.passes, skill: skillName(w.skill) },
      `You ask the player, sweetly, to recite ${w.passes} passes of ${skillName(w.skill)} for you today.`,
    );
    return true;
  }

  /** Courting q: her rivals notice, and her sisters and friends who know you put in a good word. */
  private courted(q: QueenKey) {
    for (const r of stirJealousy(this.save, q)) {
      this.rivals.set(r, q);
      // Upset: she may come out to have it out with you.
      setArc(this.save, r, "confront", Date.now());
      const rival = bondOf(q, r) === "rival" ? `, her rival` : "";
      this.notice(`${C.queens[r].name} saw you with ${C.queens[q].name}${rival} 💔`, r);
    }
    for (const f of goodWord(this.save, q)) {
      const kind = bondOf(q, f);
      const gained = this.addAffection(f, N.goodWord, true);
      this.notice(
        `${C.queens[f].name} heard how sweet you were to her ${kind ? BOND_NAME[kind] : "friend"} ${C.queens[q].name}: +${gained} ♥`,
        f,
      );
    }
  }

  /** Making up with a jealous queen: all at once with a gift, a little with each phrase for her. True when it is over. */
  private makeUp(q: QueenKey, all: boolean): boolean {
    if (!soothe(this.save, q, all)) return false;
    this.rivals.delete(q);
    setArc(this.save, q, "softened", Date.now());
    this.addAffection(q, H.makeUp, true);
    this.feel(q, "delighted");
    this.notice(`${C.queens[q].name} forgave you ♥`, q);
    this.queenSays(
      q,
      "reconciled",
      {},
      "You forgive the player after being jealous, and melt a little.",
    );
    return true;
  }

  /** Who she is jealous of: the one you courted, or (after a reload) her nearest rival in your affections. */
  private rivalName(q: QueenKey): string {
    const region = regionOf(C.queens[q].place as PlaceKey);
    const r =
      this.rivals.get(q) ??
      QUEEN_KEYS.filter((k) => k !== q && regionOf(C.queens[k].place as PlaceKey) === region).sort(
        (a, b) => this.save.affection[b] - this.save.affection[a],
      )[0];
    return r ? C.queens[r].name : "Another queen";
  }

  // ---- Commands from the screens ----

  courtStance() {
    if (this.session) return;
    this.save.stance = this.save.stance === "fire" ? "water" : "fire";
    sfx.shield();
    this.message =
      this.save.stance === "fire"
        ? "Fire: the warrior's way. Places train Strength, Charisma, Magic and the like."
        : "Water: the flowing way. Places train Grace, Song, Dream and the like.";
    this.boardKey = "";
    this.persist();
    this.pushView(true);
  }

  courtOpen(panel: CourtPanel) {
    // Opening the News, or closing it, reads everything in it; the sheet marks what was new.
    if (panel?.kind === "news") panel = { kind: "news", since: this.save.newsRead };
    if (panel?.kind === "news" || this.panel?.kind === "news") this.save.newsRead = Date.now();
    this.panel = panel;
    if (panel?.kind === "queen" && meetsNeed(panel.queen, this.save.skills)) this.see(panel.queen);
    this.pushView(true);
  }

  /** Walks to a queen, from the Queens list: through the gates first if she is in another region. */
  courtVisit(q: QueenKey) {
    this.panel = null;
    const there = queensIn(this.save.region).includes(q);
    if (there) {
      this.visiting = null;
      return this.walkToQueen(q);
    }
    this.visiting = q;
    this.walkToGateFor(q);
  }

  private walkToGateFor(q: QueenKey) {
    const target = (Object.keys(C.regions) as RegionKey[]).find((r) => queensIn(r).includes(q));
    const gate = target ? firstGate(this.save.region, target) : null;
    const door = gate ? this.world.doors[gate] : undefined;
    if (!gate || !door) {
      this.visiting = null;
      return;
    }
    this.walkTo(door, { kind: "place", place: gate });
  }

  /** Through a gate to another region, if you meet its need. */
  courtTravel(place: PlaceKey) {
    const g = gateOf(place);
    if (!g) return;
    if (!needMet(g.need, this.save.skills)) {
      this.visiting = null;
      this.message = `${C.places[place].name}: needs ${needLabel(g.need)}.`;
      this.panel = { kind: "place", place };
      return this.pushView(true);
    }
    sfx.bless();
    // Queens out looking for you go home when you leave their region.
    for (const q of [...this.out.keys()]) this.endOuting(q, false);
    this.save.region = g.to;
    const door = this.world.doors[g.toPlace] ?? (C.regions[g.to].start as Spot);
    this.pos = { x: door[0], y: door[1] };
    this.path = [];
    this.goal = null;
    this.at = g.toPlace;
    this.panel = null;
    this.boardKey = "";
    const region = C.regions[g.to];
    this.drop(region.name.toUpperCase(), region.tint);
    this.message = `${region.name}. ${region.blurb}`;
    this.persist();
    if (this.visiting) {
      const q = this.visiting;
      if (queensIn(g.to).includes(q)) {
        this.visiting = null;
        this.walkToQueen(q);
      } else this.walkToGateFor(q);
    }
    this.pushView(true);
  }

  courtGreet(q: QueenKey) {
    this.touch(q);
    const lines = C.pickupLines;
    const pickup = lines[Math.floor(Math.random() * lines.length)] ?? "";
    if (!meetsNeed(q, this.save.skills)) {
      this.say0(q, "locked");
      return;
    }
    // A reunion, jealousy or today's wish comes before small talk.
    if (this.meet(q)) return;
    if (this.save.jealous[q] > 0) {
      this.queenSays(
        q,
        "jealous",
        { rival: this.rivalName(q) },
        `You are jealous: the player has been spoiling ${this.rivalName(q)}. Pout, tease, make them win you back.`,
      );
      return;
    }
    if (this.tellWish(q)) return;
    this.line = { speaker: PLAYER, text: pickup, color: STANCE_COLOR[this.save.stance] };
    this.pushView(true);
    window.setTimeout(() => {
      if (!this.running) return;
      // Sometimes she talks about a sister, a friend or a rival instead.
      const talk =
        tierOf(this.save.affection[q]).index >= 1 && Math.random() < N.talkChance
          ? bondTalk(q, Math.random)
          : null;
      if (talk) {
        const spec = C.queens[q];
        this.line = { speaker: spec.name, text: talk.text, color: spec.color, queen: q };
        this.see(q);
        this.pushView(true);
        return;
      }
      this.queenSays(
        q,
        "greet",
        {},
        `The player greets you with this line: "${pickup}". You are at tier ${tierOf(this.save.affection[q]).name}.`,
      );
    }, 1400);
  }

  courtBuy(item: GiftKey | "elixir") {
    const cost = item === "elixir" ? C.elixir.cost : C.gifts[item].cost;
    if (this.save.gold < cost) {
      this.message = `Not enough gold: ${cost} needed. Recite at the Forest or the Mine for more.`;
      return this.pushView(true);
    }
    this.save.gold -= cost;
    if (item === "elixir") this.save.elixirReps += C.elixir.reps;
    else this.save.gifts[item] += 1;
    sfx.ready();
    this.message =
      item === "elixir"
        ? `${C.elixir.name}: double XP for ${this.save.elixirReps} reps.`
        : `Bought ${C.gifts[item].name}.`;
    this.persist();
    this.pushView(true);
  }

  courtGift(q: QueenKey, gift: GiftKey) {
    if (this.save.gifts[gift] <= 0) return;
    this.touch(q);
    this.save.gifts[gift] -= 1;
    const loved = C.queens[q].gift === gift;
    const value = this.addAffection(q, giftValue(q, gift), false);
    sfx.bless();
    this.drop(`+${value} ♥ ${C.queens[q].name}`, C.queens[q].color);
    this.save.lastSeen[q] = Date.now();
    this.save.given[q] += 1;
    // A gift ends her jealousy; any gift makes her rivals nearby jealous.
    if (this.makeUp(q, true)) {
      this.courted(q);
      this.persist();
      return;
    }
    if (loved) this.feel(q, "delighted");
    this.courted(q);
    this.queenSays(
      q,
      loved ? "giftLoved" : "gift",
      {},
      `The player gives you ${C.gifts[gift].name}${loved ? ", your favourite" : ""}.`,
    );
    this.persist();
  }

  /** Recite at a place. A queen who stands there watches, if you meet her need. */
  courtRecite(place: PlaceKey, opts: { queen?: QueenKey | null; date?: boolean } = {}) {
    sfx.unlock();
    const date = opts.date === true;
    // A queen who has found you and walks with you watches wherever you recite.
    const q = opts.queen !== undefined ? opts.queen : (queenAt(place) ?? this.withYou());
    const watching = q && meetsNeed(q, this.save.skills) ? q : null;
    if (watching) this.touch(watching);
    const skill = date && watching ? this.dateSkill(watching) : skillAt(place, this.save.stance);
    if (!skill) return;
    this.panel = null;
    this.session = startSession(
      {
        place,
        skill,
        queen: watching,
        date,
        wordMs: this.save.wordMs,
        reps: this.save.repsPerPhrase,
        // A date is its own round of phrases.
        round: date && watching ? C.datePhrases : this.save.phrasesPerRound,
      },
      pickPhrase(allTexts(), Math.random),
      performance.now(),
    );
    if (watching) {
      this.save.lastSeen[watching] = Date.now();
      if (!date && this.save.jealous[watching] > 0)
        this.queenSays(watching, "jealous", { rival: this.rivalName(watching) });
      else this.queenSays(watching, date ? "dateStart" : "watch");
    } else this.line = null;
    this.message =
      "Read along as the words light up. When they finish, tap to complete the pass and go on.";
    this.pushView(true);
  }

  courtDate(q: QueenKey) {
    const tier = tierOf(this.save.affection[q]).index;
    if (tier < C.dateTier) {
      this.message = `${C.queens[q].name} is not ready for a date. Win her over to ${C.affectionTiers[C.dateTier]?.name} first.`;
      return this.pushView(true);
    }
    this.courtRecite(C.queens[q].place as PlaceKey, { queen: q, date: true });
    this.courted(q);
  }

  /**
   * A tap: once the words of a pass have finished, it completes the pass (XP,
   * gold) and goes straight on to the next pass, phrase or the round's end.
   * While the words are still lighting up, a tap only says how long is left.
   * On the round's summary, it starts the next round.
   */
  courtTap() {
    const s = this.session;
    if (!s || s.over) return;
    if (s.roundDone) return this.courtNextRound();
    const now = this.now();
    advance(s, now);
    if (!s.waiting) {
      this.drop(
        `Read along: ${(timeLeft(s, now) / 1000).toFixed(1)} s to go`,
        "rgba(244, 247, 255, 0.75)",
      );
      return this.pushView(true);
    }
    const elixir = this.save.elixirReps > 0;
    for (const r of tapComplete(s, now, () => pickPhrase(allTexts(), Math.random), elixir)) {
      if (r.type === "pass") this.onPass(s, r, elixir);
      else if (r.type === "phrase") {
        this.save.skills[s.skill] += r.xp;
        this.drop(`+${Math.round(r.xp)} phrase bonus`, PAL.gold);
        // A whole phrase for a jealous queen softens her.
        const q = s.queen;
        if (q && this.save.jealous[q] > 0 && !this.makeUp(q, false))
          this.notice(`${C.queens[q].name} softens a little`, q);
      } else if (r.type === "round") {
        sfx.bless();
        this.persist();
      } else if (r.type === "end" && s.queen) {
        this.save.dates[s.queen] += 1;
        this.addAffection(s.queen, C.affection.dateBonus, true);
        this.queenSays(s.queen, "dateEnd", {}, "Your date with the player just ended beautifully.");
        this.endSession();
      }
    }
    this.pushView(true);
  }

  /** After a complete round: another, of the round size set now. */
  courtNextRound() {
    const s = this.session;
    if (!s?.roundDone) return;
    sfx.unlock();
    nextRound(s, this.now(), pickPhrase(allTexts(), Math.random), this.save.phrasesPerRound);
    this.pushView(true);
  }

  /** More or fewer phrases in a round (1 to 10). */
  courtRound(dir: number) {
    this.save.phrasesPerRound = Math.min(10, Math.max(1, this.save.phrasesPerRound + dir));
    const s = this.session;
    if (s && !s.date && !s.roundDone)
      s.round = Math.max(this.save.phrasesPerRound, s.roundPhrases + 1);
    this.persist();
    this.pushView(true);
  }

  /** Moves the session on: when the words of a pass finish, it waits for its tap. */
  private stepSession() {
    const s = this.session;
    if (s && advance(s, this.now())) sfx.ready();
  }

  /** A pass counted: XP, gold, the watching queen's affection, wishes and level-ups. */
  private onPass(s: Session, r: Extract<Reward, { type: "pass" }>, elixir: boolean) {
    sfx.hit();
    // A short buzz on phones, so the tap that counts can be felt.
    try {
      navigator.vibrate?.(12);
    } catch {
      /* not allowed here */
    }
    const save = this.save;
    const before = skillLevel(save.skills[s.skill]);
    save.skills[s.skill] += r.xp;
    save.gold += r.gold;
    save.stats.reps += 1;
    save.stats.bestStreak = Math.max(save.stats.bestStreak, r.streak);
    if (elixir) save.elixirReps -= 1;
    const color = STANCE_COLOR[C.skills[s.skill].element === "water" ? "water" : "fire"];
    this.drop(`+${Math.round(r.xp)} ${skillName(s.skill)} XP`, color);
    if (r.gold > 0) this.drop(`+${r.gold} gold`, PAL.gold);
    if (s.queen) {
      const q = s.queen;
      // Less while she is jealous.
      this.addAffection(
        q,
        affectionGain(s.words.length, q, save.stance, r.streak, s.date) * jealousMult(save, q),
        true,
      );
      save.lastSeen[q] = Date.now();
      const remembered = memoryAt(save.devotion[q], save.devotion[q] + 1);
      save.devotion[q] += 1;
      if (r.streak === H.fierceStreak) this.feel(q, "fierce");
      if (remembered) {
        this.notice(`${C.queens[q].name} remembers: ${remembered} passes just for her`, q);
        this.queenSays(
          q,
          "memory",
          { count: remembered },
          `The player has now recited ${remembered} passes just for you. You remember every one.`,
        );
      }
      const at = [3, 5, 10].indexOf(r.streak);
      if (at >= 0) {
        const list = C.queens[s.queen].lines.streak;
        const spec = C.queens[s.queen];
        this.line = {
          speaker: spec.name,
          text: list[Math.min(at, list.length - 1)] ?? "",
          color: spec.color,
          queen: s.queen,
        };
      }
    }
    // Wishes: every queen who wished for this skill today counts the pass.
    const granted = countWish(save, s.skill, dayOf(Date.now()));
    for (const g of granted) {
      this.addAffection(g, H.wishAffection, true);
      save.gold += H.wishGold;
      this.feel(g, "delighted");
      this.notice(
        `${C.queens[g].name}'s wish granted: +${H.wishAffection} ♥ +${H.wishGold} gold`,
        g,
      );
    }
    const thrilled = granted.find((g) => g === s.queen) ?? granted[0];
    if (thrilled)
      this.queenSays(thrilled, "wishDone", {}, "The player just granted your wish for today.");
    const after = skillLevel(save.skills[s.skill]);
    if (after > before) this.levelUp(s.skill, after);
    if (save.stats.reps % 10 === 0) this.persist();
    this.pushView(true);
  }

  courtEndSession() {
    this.endSession();
    this.pushView(true);
  }

  /** Slower or faster words: dir is -1 or 1 (100 ms each). */
  courtPace(dir: number) {
    this.save.wordMs = Math.min(C.wordMsMax, Math.max(C.wordMsMin, this.save.wordMs + dir * 100));
    const s = this.session;
    if (s) {
      // Keep the lit word where it is: re-anchor the pass at the new pace.
      const now = this.now();
      const { word } = passAt(s, now);
      s.wordMs = this.save.wordMs;
      if (!s.waiting) s.start = now - word * s.wordMs;
    }
    this.persist();
    this.pushView(true);
  }

  courtReps(dir: number) {
    this.save.repsPerPhrase = Math.min(10, Math.max(1, this.save.repsPerPhrase + dir));
    if (this.session)
      this.session.reps = Math.max(this.session.reps + dir, this.session.pass + 1, 1);
    this.persist();
    this.pushView(true);
  }

  /** A different phrase now, without a bonus for the old one. */
  courtSkip() {
    const s = this.session;
    if (!s) return;
    skipPhrase(s, this.now(), pickPhrase(allTexts(), Math.random));
    this.pushView(true);
  }

  private dateSkill(q: QueenKey): SkillKey {
    const favored = C.queens[q].favored.filter((k): k is SkillKey => k in C.skills);
    return (
      favored.find((k) => C.skills[k].element === this.save.stance) ?? favored[0] ?? "charisma"
    );
  }

  private endSession() {
    const s = this.session;
    if (!s) return;
    this.session = null;
    this.save.stats.phrases += s.phrases;
    if (s.totals.reps > 0) {
      this.message = `Session: +${Math.round(s.totals.xp).toLocaleString()} ${skillName(s.skill)} XP, +${s.totals.gold} gold, ${s.totals.reps} reps.`;
    }
    this.persist();
  }

  /** Adds affection (more for the queen the town talks about today); what was added. */
  private addAffection(q: QueenKey, amount: number, quietTier: boolean): number {
    const gained =
      amount > 0
        ? Math.round(
            amount * buzzMult(q, dayOf(Date.now())) * arcMult(this.save, q, Date.now()) * 10,
          ) / 10
        : amount;
    const before = tierOf(this.save.affection[q]);
    this.save.affection[q] += gained;
    const after = tierOf(this.save.affection[q]);
    if (after.index > before.index) {
      sfx.bless();
      this.notice(`${C.queens[q].name} and you: ${after.name}!`, q);
      this.queenSays(
        q,
        "tierUp",
        { tier: after.name },
        `You and the player just became ${after.name}.`,
      );
    } else if (!quietTier) this.pushView(true);
    return gained;
  }

  private levelUp(skill: SkillKey, level: number) {
    sfx.ready();
    this.drop(`LEVEL UP! ${skillName(skill)} ${level}`, PAL.gold);
    addNews(this.save, {
      at: Date.now(),
      text: `You reached ${skillName(skill)} ${level}.`,
      queen: null,
      kind: "you",
    });
    // Every queen who loves this skill grows fonder; the one watching (or nearest) says so.
    const fans = QUEEN_KEYS.filter((q) => C.queens[q].favored.includes(skill));
    for (const q of fans) {
      this.addAffection(q, C.affection.levelUp, true);
      this.feel(q, "delighted");
    }
    const watching = this.session?.queen;
    const speaker =
      watching && fans.includes(watching)
        ? watching
        : (watching ?? fans.find((q) => C.queens[q].place === this.at));
    if (speaker) {
      this.queenSays(
        speaker,
        "levelUp",
        { skill: skillName(skill), level },
        `The player just reached ${skillName(skill)} level ${level}.`,
      );
    }
  }

  // ---- Walking ----

  private cellOf(): Spot {
    return [Math.round(this.pos.x), Math.round(this.pos.y)];
  }

  private walkTo(dest: Spot, goal: CourtGame["goal"]) {
    const path = pathTo(this.world, this.cellOf(), dest);
    if (!path) return;
    this.path = path;
    this.goal = goal;
    this.at = null;
    if (!path.length) this.arrive();
  }

  private walkToQueen(q: QueenKey) {
    const [qc, qr] = this.queenCell(q);
    // Stand next to her, on the side nearest you.
    const me = this.cellOf();
    const around: Spot[] = [
      [qc - 1, qr],
      [qc + 1, qr],
      [qc, qr - 1],
      [qc, qr + 1],
    ];
    const spots = around
      .filter(([c, r]) => walkable(this.world, c, r))
      .sort(
        (a, b) => Math.hypot(a[0] - me[0], a[1] - me[1]) - Math.hypot(b[0] - me[0], b[1] - me[1]),
      );
    const dest = spots[0] ?? ([qc, qr] as Spot);
    this.walkTo(dest, { kind: "queen", queen: q });
  }

  private arrive() {
    const goal = this.goal;
    this.goal = null;
    const [c, r] = this.cellOf();
    const cell = this.world.cells[r]?.[c];
    this.at = cell?.terrain === "door" && cell.place ? cell.place : null;
    const gatePlace = goal?.kind === "place" ? goal.place : this.at;
    if (gatePlace && gateOf(gatePlace)) {
      // A gate: through it at once (or told what it needs).
      this.courtTravel(gatePlace);
      return;
    }
    if (goal?.kind === "queen") {
      this.panel = { kind: "queen", queen: goal.queen };
      this.courtGreet(goal.queen);
    } else if (goal?.kind === "place" || this.at) {
      const place = goal?.kind === "place" ? goal.place : this.at!;
      this.panel = { kind: place === "market" ? "shop" : "place", place } as CourtPanel;
    }
    this.persist();
    this.pushView(true);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || useGame.getState().phase !== "battle" || this.session) return;
    sfx.unlock();
    const rect = this.canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left - this.ox) / this.cell);
    const r = Math.floor((e.clientY - rect.top - this.oy) / this.cell);
    this.panel = null;
    this.visiting = null;
    const queen = queensIn(this.save.region).find((q) => {
      const [qc, qr] = this.queenCell(q);
      return qc === c && qr === r;
    });
    if (queen) return this.walkToQueen(queen);
    const dest = destinationFor(this.world, c, r);
    if (!dest) return this.pushView(true);
    const cell = this.world.cells[dest[1]]?.[dest[0]];
    const place = cell?.terrain === "door" ? cell.place : undefined;
    this.walkTo(dest, place ? { kind: "place", place } : null);
    this.pushView(true);
  };

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (useGame.getState().phase !== "battle") return;
    if (this.session && (e.code === "Space" || e.key === "Enter")) {
      e.preventDefault();
      this.courtTap();
    } else if (e.key === "Escape" && (this.session || this.panel)) {
      // Closing the session or sheet uses up the key; the next Esc opens the menu.
      e.preventDefault();
      if (this.session) this.endSession();
      else this.panel = null;
      this.pushView(true);
    } else if (!this.session && e.key.toLowerCase() === "x") this.courtStance();
  };

  // ---- Frame loop ----

  /** Session time: it stands still while the game is held. */
  private now(): number {
    return this.pausedAt ?? performance.now();
  }

  private frame = (t: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const { fpsCap, renderScale } = useGame.getState().settings;
    if (!this.limiter.ready(t, fpsCap)) return;
    if (renderScale !== this.renderScale) this.resize();
    // A frame stamped just before start() would give a negative step.
    const dt = Math.max(0, Math.min(0.1, (t - this.last) / 1000));
    this.last = t;
    this.pace(dt, fpsCap);
    this.tick(dt);
    // The recite screen covers the map: drawing it once is enough until it closes.
    if (!this.session || !this.coveredDrawn) {
      this.draw();
      this.coveredDrawn = !!this.session;
      frameStats.draws += 1;
    }
  };

  /**
   * Watches the frame rate: on a phone that stays well under its target for a
   * few seconds, the map drops fireflies, smoke, sparks and the like (the water,
   * lava, places and queens stay). The first seconds, while pictures are made,
   * do not count.
   */
  private pace(dt: number, fpsCap: number) {
    if (this.lite || performance.now() - this.startedAt < 3000 || document.hidden) return;
    this.frameAvg = this.frameAvg ? this.frameAvg * 0.98 + dt * 0.02 : dt;
    const target = 1 / (fpsCap > 0 ? Math.min(60, fpsCap) : 60);
    if (this.frameAvg > Math.max(0.036, target * 1.8)) this.lite = true;
  }

  private tick(dt: number) {
    const { phase, paused, tomeOpen, settings, lines, menu } = useGame.getState();
    this.time += dt;
    // Day or night, by the clock, checked now and then.
    if (this.nightAt < 0 || this.time - this.nightAt > 20) {
      this.nightAt = this.time;
      this.night = C.night.enabled ? nightLevel(new Date()) : 0;
    }
    this.flashT += dt;
    this.backdrop.ensureBinary(settings, lines);
    const held = paused || tomeOpen || menu;
    // A held session keeps its place: when play resumes, its clock moves on by the time held.
    if (this.session && held && this.pausedAt === null) this.pausedAt = performance.now();
    if (this.session && !held && this.pausedAt !== null) {
      const away = performance.now() - this.pausedAt;
      this.session.start += away;
      this.pausedAt = null;
    }
    if (phase === "battle" && !held) {
      this.walk(dt);
      this.stepSession();
      if (!this.session) {
        this.gossip(dt);
        this.presence(dt);
      }
    }
    // Her face while she watches you recite goes into the gallery.
    if (this.session?.queen) this.see(this.session.queen);
    const nowMs = performance.now();
    this.drops = this.drops.filter((d) => nowMs - d.born < N.dropMs);
    this.notices = this.notices.filter((n) => nowMs - n.born < N.noticeSeconds * 1000);
    this.pushView(false);
  }

  private walk(dt: number) {
    let left = dt * C.walkSpeed;
    while (left > 0 && this.path.length) {
      const [tc, tr] = this.path[0]!;
      const dx = tc - this.pos.x;
      const dy = tr - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d <= left) {
        this.pos.x = tc;
        this.pos.y = tr;
        left -= d;
        this.path.shift();
        if (!this.path.length) this.arrive();
      } else {
        this.pos.x += (dx / d) * left;
        this.pos.y += (dy / d) * left;
        left = 0;
      }
    }
  }

  private pushView(force: boolean) {
    const now = performance.now();
    // During a session the lit word and the pass bar move, so the screen updates often.
    const every = this.session ? 33 : 120;
    if (!force && now - this.viewAt < every) return;
    // The screens change only with drops, moods, messages and (while reciting) the
    // lit word or the pass: skip the update, and the redraw of every open window,
    // when none has. The pass bar fills by itself.
    const moods = QUEEN_KEYS.map((q) => this.moodNow(q)).join();
    const r = this.session;
    const at = r ? passAt(r, this.now()) : null;
    const reading =
      r && at
        ? `${r.phrase}|${r.pass}|${at.word}|${r.waiting}|${r.roundDone}|${r.wordMs}|${r.reps}|${r.round}`
        : "";
    const nowMs = Date.now();
    const feelings = QUEEN_KEYS.map((q) => arcOf(this.save, q, nowMs)?.id ?? "").join();
    // Queens out looking for you (not those already on their way home).
    const looking = [...this.out].filter(([, o]) => !o.home).map(([q]) => q);
    const out = looking.join();
    const sig = `${this.drops.length}|${this.drops[0]?.id ?? 0}|${this.notices.length}|${this.notices[0]?.id ?? 0}|${moods}|${feelings}|${out}|${this.message}|${this.line?.text ?? ""}|${reading}`;
    if (!force && sig === this.viewSig && now - this.viewAt < 1000) return;
    this.viewSig = sig;
    this.viewAt = now;
    const s = this.session;
    let session: CourtView["session"] = null;
    if (s) {
      const at = passAt(s, this.now());
      session = {
        place: s.place,
        skill: s.skill,
        queen: s.queen,
        date: s.date,
        phrase: s.phrase,
        words: s.words,
        word: at.word,
        pass: Math.min(at.pass, s.reps - 1),
        progress: Math.min(1, at.progress),
        reps: s.reps,
        counted: [...s.hits],
        streak: s.streak,
        totals: { ...s.totals },
        over: s.over,
        waiting: s.waiting,
        passMs: passMs(s),
        round: s.round,
        roundPhrases: s.roundPhrases,
        roundDone: s.roundDone,
        roundTotals: { ...s.roundTotals },
      };
    }
    const day = dayOf(Date.now());
    rollDay(this.save, day);
    useGame.setState({
      courtView: {
        save: { ...this.save },
        total: totalLevel(this.save.skills),
        panel: this.panel,
        session,
        drops: this.drops.map(({ id, text, color }) => ({ id, text, color })),
        notices: this.notices.slice(-3).map(({ id, text, queen, color }) => ({
          id,
          text,
          queen,
          color,
        })),
        unread: unreadNews(this.save),
        buzz: buzzOf(day),
        feelings: Object.fromEntries(
          QUEEN_KEYS.flatMap((q) => {
            const a = arcOf(this.save, q, nowMs);
            return a ? [[q, { id: a.id, ends: a.ends }]] : [];
          }),
        ),
        out: looking,
        line: this.line,
        at: this.at,
        region: this.save.region,
        message: this.message,
        moods: Object.fromEntries(
          QUEEN_KEYS.map((q) => [q, this.moodNow(q)]),
        ) as CourtView["moods"],
        rivals: Object.fromEntries(this.rivals),
        wishes: Object.fromEntries(
          QUEEN_KEYS.map((q) => {
            const w = wishOf(q, day);
            return [
              q,
              {
                skill: w.skill,
                passes: w.passes,
                progress: Math.min(w.passes, this.save.wishes.progress[q]),
                done: this.save.wishes.done[q],
              },
            ];
          }),
        ) as CourtView["wishes"],
      },
    });
    if (now - this.saveAt > 15000) {
      this.saveAt = now;
      this.persist();
    }
  }

  // ---- Drawing ----

  private resize() {
    this.bitmaps.clear();
    this.coveredDrawn = false;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderScale = useGame.getState().settings.renderScale;
    const dpr = renderDpr(window.devicePixelRatio, this.renderScale);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.backdrop.setFrame(w, h, dpr);
    this.boardKey = "";
  }

  private geometry() {
    const box = this.backdrop.fieldBox(useGame.getState().chrome);
    // Headroom above the first row for roofs and peaks.
    const rows = this.world.rows + HEADROOM;
    const cell = Math.max(8, Math.min(box.w / this.world.cols, box.h / rows));
    this.cell = cell;
    this.ox = Math.round(box.x + (box.w - this.world.cols * cell) / 2);
    this.oy = Math.round(box.y + (box.h - rows * cell) / 2 + HEADROOM * cell);
  }

  private draw() {
    const ctx = this.ctx;
    const { settings, lines, chrome } = useGame.getState();
    const dpr = this.backdrop.dpr;
    this.geometry();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    const water = this.save.stance === "water";
    // Water is the calm way: the rain falls slower.
    const rain =
      (this.reduce ? CONFIG.rain.reducedMotionSpeed : CONFIG.rain.speed) * (water ? 0.5 : 1);
    this.backdrop.drawBinary(ctx, settings, this.time * rain);
    this.drawBoard(ctx);
    this.drawRegionName(ctx);
    // The texts drift over the map faintly, so its detail still shows.
    this.backdrop.drawField(
      ctx,
      { ...settings, opacity: settings.opacity * 0.22 },
      lines,
      chrome,
      this.flashT,
      this.reduce,
    );
    this.drawPath(ctx);
    this.drawQueens(ctx);
    this.drawPlayer(ctx);
  }

  /** Terrain, buildings and signs, drawn into a cache once per size and region; then what moves, over it. */
  private drawBoard(ctx: CanvasRenderingContext2D) {
    const dpr = this.backdrop.dpr;
    const s = this.cell;
    const { cols, rows } = this.world;
    const head = HEADROOM * s;
    // Night is painted into the board too, in tenths, so it costs nothing a frame.
    const night = Math.round(this.night * 10) / 10;
    const key = `${this.w}|${this.h}|${dpr}|${s}|${this.save.region}|${night}`;
    if (key !== this.boardKey) {
      this.boardKey = key;
      const b = this.board;
      b.width = Math.ceil(cols * s * dpr) + 2;
      b.height = Math.ceil((rows * s + head) * dpr) + 2;
      const g = b.getContext("2d");
      if (g) {
        g.setTransform(dpr, 0, 0, dpr, 0, head * dpr);
        const found = drawWorld(g, this.world, {
          region: this.save.region,
          s,
          font: DISPLAY,
          mapW: cols * s,
          colorOf: (p) => this.placeColor(p),
          label: (p) => {
            const gate = gateOf(p);
            return (gate ? `To ${C.regions[gate.to].name}` : C.places[p].name).toUpperCase();
          },
        });
        if (night > 0) this.paintNight(g, found, night, cols * s, rows * s, head);
        vignette(g, 0, 0, cols * s, rows * s);
      }
    }
    ctx.drawImage(
      this.board,
      this.ox,
      this.oy - head,
      this.board.width / dpr,
      this.board.height / dpr,
    );
    drawLive(ctx, this.scene, this.ox, this.oy, s, this.reduce ? 0 : this.time, this.lite);
    // The Fire or Water glow over everything.
    ctx.fillStyle =
      this.save.stance === "water" ? "rgba(70, 150, 255, 0.06)" : "rgba(255, 120, 50, 0.05)";
    ctx.fillRect(this.ox, this.oy, cols * s, rows * s);
  }

  private get scene(): Scene {
    const region = this.save.region;
    let scene = this.scenes.get(region);
    if (!scene) {
      scene = sceneOf(this.world, region, (p) => this.placeColor(p));
      this.scenes.set(region, scene);
    }
    return scene;
  }

  /** The region's name above the map; inside its lower corner when the top bar leaves no room. */
  private drawRegionName(ctx: CanvasRenderingContext2D) {
    const region = C.regions[this.save.region];
    const size = Math.max(9, Math.min(16, this.cell * 0.4));
    const top = this.backdrop.fieldBox(useGame.getState().chrome).y;
    const above = this.oy - HEADROOM * this.cell - 3;
    const inside = above - size < top;
    ctx.font = `700 ${size}px ${DISPLAY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const x = this.ox + (inside ? 6 : 2);
    const y = inside ? this.oy + this.world.rows * this.cell - 5 : above;
    if (inside) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(2, 0, 5, 0.85)";
      ctx.strokeText(region.name.toUpperCase(), x, y);
    }
    ctx.fillStyle = region.tint;
    ctx.globalAlpha = 0.9;
    ctx.fillText(region.name.toUpperCase(), x, y);
    ctx.globalAlpha = 1;
  }

  private placeColor(place: PlaceKey): string {
    const q = queenAt(place);
    if (q) return C.queens[q].color;
    const gate = gateOf(place);
    if (gate) return C.regions[gate.to].tint;
    return place === "market" ? PAL.gold : PAL.cyan;
  }

  private drawPath(ctx: CanvasRenderingContext2D) {
    if (!this.path.length) return;
    ctx.fillStyle = STANCE_COLOR[this.save.stance];
    ctx.globalAlpha = 0.6;
    for (const [c, r] of this.path) {
      ctx.beginPath();
      ctx.arc(
        this.ox + (c + 0.5) * this.cell,
        this.oy + (r + 0.5) * this.cell,
        Math.max(1.5, this.cell * 0.06),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawQueens(ctx: CanvasRenderingContext2D) {
    const s = this.cell;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const q of queensIn(this.save.region)) {
      const spec = C.queens[q];
      const o = this.out.get(q);
      if (o) {
        // Where she usually stands: an empty ring while she is out.
        const [hc, hr] = spec.at as Spot;
        ctx.strokeStyle = `${spec.color}66`;
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.setLineDash([s * 0.12, s * 0.1]);
        ctx.beginPath();
        ctx.ellipse(
          this.ox + (hc + 0.5) * s,
          this.oy + (hr + 0.92) * s,
          s * 0.5,
          s * 0.15,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const c = o ? o.x : (spec.at as Spot)[0];
      const r = o ? o.y : (spec.at as Spot)[1];
      const bob = this.reduce ? 0 : Math.sin(this.time * (o ? 6 : 2) + c) * s * 0.05;
      const x = this.ox + (c + 0.5) * s;
      const y = this.oy + (r + 0.5) * s + bob;
      // A shadow and a ring on the ground where she stands.
      const gy = this.oy + (r + 0.92) * s;
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.ellipse(x, gy, s * 0.42, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `${spec.color}aa`;
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath();
      ctx.ellipse(x, gy, s * 0.5, s * 0.15, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.drawImage(this.glowOf(spec.color, "66"), x - s * 0.95, y - s * 0.95, s * 1.9, s * 1.9);
      const pr = s * 0.62;
      const img = this.portrait(q, pr * 2);
      if (img) {
        ctx.drawImage(img, x - pr, y - pr, pr * 2, pr * 2);
      } else {
        // Until her portrait has loaded, a crown.
        ctx.font = `${Math.round(s * 0.8)}px ${PIECE_FONT}`;
        ctx.fillStyle = spec.color;
        ctx.fillText(`♛${TEXT_VS}`, x, y);
      }
      const tier = tierOf(this.save.affection[q]).index;
      ctx.font = `700 ${Math.max(7, Math.round(s * 0.26))}px ${DISPLAY}`;
      const jealous = this.save.jealous[q] > 0;
      const label = `${spec.name.toUpperCase()}${tier > 0 ? ` ${"♥".repeat(Math.min(tier, 5))}` : ""}${jealous ? " 💔" : ""}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(2, 0, 5, 0.9)";
      ctx.strokeText(label, x, y + s * 0.8);
      ctx.fillStyle = spec.color;
      ctx.fillText(label, x, y + s * 0.8);
      // A wish she has not had granted today: a little bubble that beckons.
      if (meetsNeed(q, this.save.skills) && !this.save.wishes.done[q]) {
        const bx = x + s * 0.5;
        const by = y - s * 0.62 + (this.reduce ? 0 : Math.sin(this.time * 3 + c) * s * 0.04);
        const br = Math.max(5, s * 0.2);
        ctx.fillStyle = "rgba(14, 6, 26, 0.92)";
        ctx.strokeStyle = PAL.gold;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = PAL.gold;
        ctx.font = `700 ${Math.round(br * 1.3)}px ${DISPLAY}`;
        ctx.fillText("!", bx, by + 0.5);
      }
    }
  }

  /** Her portrait in her mood now; the last one shown stays up while a new one loads. */
  /**
   * Her portrait in her mood now, painted once into a bitmap the size it is
   * drawn: drawing the vector picture itself every frame is slow. The last one
   * shown stays up while a new one loads.
   */
  private portrait(q: QueenKey, size: number): CanvasImageSource | null {
    const mood = this.moodNow(q);
    const tier = tierOf(this.save.affection[q]).index;
    const key = `${q}|${mood}|${tier}`;
    let img = this.portraits.get(key);
    if (!img) {
      img = new Image();
      img.src = queenPortrait(q, { mood, tier });
      this.portraits.set(key, img);
    }
    if (!img.complete || img.naturalWidth <= 0) return this.shown.get(q) ?? null;
    const px = Math.max(16, Math.ceil(size * this.backdrop.dpr));
    const bkey = `${key}|${px}`;
    let bmp = this.bitmaps.get(bkey);
    if (!bmp) {
      bmp = document.createElement("canvas");
      bmp.width = px;
      bmp.height = px;
      bmp.getContext("2d")?.drawImage(img, 0, 0, px, px);
      this.bitmaps.set(bkey, bmp);
    }
    this.shown.set(q, bmp);
    return bmp;
  }

  /** Night over the board just drawn: the map darkens, and its windows, doors and gates glow. */
  private paintNight(
    g: CanvasRenderingContext2D,
    found: Light[],
    night: number,
    w: number,
    h: number,
    head: number,
  ) {
    g.fillStyle = `rgba(6, 8, 34, ${(C.night.darkness * night).toFixed(3)})`;
    g.fillRect(0, -head, w, h + head);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = night;
    for (const l of found) {
      const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grad.addColorStop(0, `${l.color}aa`);
      grad.addColorStop(0.4, `${l.color}44`);
      grad.addColorStop(1, `${l.color}00`);
      g.fillStyle = grad;
      g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    g.restore();
  }

  /** A soft round glow in a colour, painted once and stretched to size when drawn. */
  private glowOf(color: string, strength: string): HTMLCanvasElement {
    const key = `${color}${strength}`;
    let sprite = this.glows.get(key);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = 64;
      sprite.height = 64;
      const g = sprite.getContext("2d");
      if (g) {
        const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
        grad.addColorStop(0, `${color}${strength}`);
        grad.addColorStop(1, `${color}00`);
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
      }
      this.glows.set(key, sprite);
    }
    return sprite;
  }

  /** You: a hooded wanderer with a cape in your style's colour, eyes glowing under the hood; stepping while you walk. */
  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const s = this.cell;
    const x = this.ox + (this.pos.x + 0.5) * s;
    const y = this.oy + (this.pos.y + 0.5) * s;
    const color = STANCE_COLOR[this.save.stance];
    const walking = this.path.length > 0 && !this.reduce;
    const step = walking ? Math.sin(this.time * 11) : 0;
    const bob = walking ? Math.abs(step) * s * 0.035 : 0;
    const pulse = this.reduce ? 1 : 1 + Math.sin(this.time * 4) * 0.08;
    const u = s * 0.1;
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(x, y + u * 3.8, u * 3, u * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    const gr = s * 0.75 * pulse;
    ctx.drawImage(this.glowOf(color, "77"), x - gr, y - gr, gr * 2, gr * 2);
    const top = y - bob;
    // The cape, swaying as you go.
    ctx.fillStyle = shade(color, -0.45);
    ctx.beginPath();
    ctx.moveTo(x - u * 1.6, top - u * 1.2);
    ctx.quadraticCurveTo(
      x - u * 3 - step * u * 0.6,
      top + u * 1.6,
      x - u * 2.4 - step * u,
      top + u * 3.4,
    );
    ctx.lineTo(x + u * 2.4 - step * u, top + u * 3.4);
    ctx.quadraticCurveTo(x + u * 3 - step * u * 0.6, top + u * 1.6, x + u * 1.6, top - u * 1.2);
    ctx.closePath();
    ctx.fill();
    // Legs, then the robe.
    ctx.strokeStyle = "#140a1c";
    ctx.lineWidth = Math.max(1, u * 0.7);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - u * 0.6, top + u * 2.2);
    ctx.lineTo(x - u * 0.6 + step * u * 0.8, top + u * 3.6);
    ctx.moveTo(x + u * 0.6, top + u * 2.2);
    ctx.lineTo(x + u * 0.6 - step * u * 0.8, top + u * 3.6);
    ctx.stroke();
    ctx.fillStyle = "#1c1030";
    ctx.beginPath();
    ctx.moveTo(x - u * 1.3, top - u * 1);
    ctx.lineTo(x + u * 1.3, top - u * 1);
    ctx.lineTo(x + u * 1.8, top + u * 2.6);
    ctx.lineTo(x - u * 1.8, top + u * 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.8, u * 0.3);
    ctx.beginPath();
    ctx.moveTo(x, top - u * 0.8);
    ctx.lineTo(x, top + u * 2.5);
    ctx.moveTo(x - u * 1.7, top + u * 2.4);
    ctx.lineTo(x + u * 1.7, top + u * 2.4);
    ctx.stroke();
    // The hood, a dark face and two glowing eyes.
    ctx.fillStyle = shade(color, -0.25);
    ctx.beginPath();
    ctx.moveTo(x - u * 1.5, top - u * 0.6);
    ctx.quadraticCurveTo(x - u * 1.7, top - u * 3.6, x, top - u * 4.2);
    ctx.quadraticCurveTo(x + u * 1.7, top - u * 3.6, x + u * 1.5, top - u * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#06020c";
    ctx.beginPath();
    ctx.ellipse(x, top - u * 2, u * 0.95, u * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(color, 0.5);
    ctx.fillRect(x - u * 0.6, top - u * 2.2, u * 0.4, u * 0.25);
    ctx.fillRect(x + u * 0.2, top - u * 2.2, u * 0.4, u * 0.25);
    // Your name, small, above.
    ctx.font = `700 ${Math.max(7, Math.round(s * 0.22))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(2, 0, 5, 0.85)";
    ctx.strokeText("AX", x, top - u * 5.2);
    ctx.fillStyle = color;
    ctx.fillText("AX", x, top - u * 5.2);
  }
}
