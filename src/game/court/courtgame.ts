import { sfx } from "@/game/audio";
import { Backdrop } from "@/game/backdrop";
import { CONFIG } from "@/game/config";
import { FrameLimiter, frameStats, renderDpr } from "@/game/frameLimiter";
import { speakAs } from "@/game/narrator";
import { DISPLAY, FONT, PAL } from "@/game/palette";
import { loadPieceFont, PIECE_FONT, TEXT_VS } from "@/game/pieceFont";
import { getGame, setActiveGame, type GameBase } from "@/game/registry";
import { useGame, type CourtPanel, type CourtTalkEntry, type CourtView } from "@/game/store";
import {
  advance,
  affectionGain,
  dateBonus,
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
  bonusReward,
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
import { looksRev, queenPortrait, youLook } from "./portrait.ts";
import { readLooks, youName } from "./looks.ts";
import { choose, doing, mark, roamRadius, stayFor, type Plan } from "./life.ts";
import { FIGURE_H, FIGURE_W, queenFigure, youFigure } from "./figure.ts";
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
  allianceOf,
  arcOf,
  bondsOf,
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
import {
  addNews,
  bondTalk,
  buzzMult,
  buzzOf,
  fillLine,
  loadNews,
  makeRumor,
  unreadNews,
} from "./news.ts";
import { comeOutChance, encounterOf, foundKind, pairKey, presenceLine } from "./presence.ts";
import {
  dress,
  feedLine,
  giftSay,
  midSentence,
  placeSay,
  speak,
  type Fill,
} from "./speech.ts";
import {
  clearTexts,
  deckTexts,
  hashOf,
  percentOf,
  pickFresh,
  reciteDone,
  type DeckText,
} from "./bag.ts";
import { chosenText, labelOf, textMark, unitsFrom, wholeText } from "./source.ts";
import { duoLines, duoReplyLines, pairTalk } from "./talk.ts";
import {
  choicesFor,
  countTalk,
  knownTaste,
  loadTalk,
  markTried,
  newTalk,
  opensUp,
  replyTo,
  talksLeft,
  type Choice,
  type Talk,
  type TalkContext,
} from "./converse.ts";
import { VOICES } from "./voices.ts";
import { queenLines } from "./talk.ts";
import { pickBonus, readReps } from "@/game/reps";
import type { CourtArcKey } from "@/game/config";
import { cancelSleep, restedTotal, resting, sleepFrames } from "@/game/rest";
import {
  courtHush,
  courtSay,
  courtScreen,
  courtSound,
  courtTapSound,
  checkText,
  rehearseLibrary,
  rehearseState,
  subscribeRehearse,
  type CourtText,
} from "@/game/rehearseRun";

const C = CONFIG.court;
const H = C.hearts;
const N = C.news;
const P = C.presence;
const F = C.presence.feed;
const G = C.presence.group;
/** Notices on screen at once, and how many may wait for room. */
const NOTICES_SHOWN = 3;
const NOTICE_QUEUE = 24;
/** Lines that may wait their turn. */
const LINE_QUEUE = 8;
/** Lines of a talk kept on screen to read back. */
const TALK_LOG = 60;
/** Long enough to read a line before the next one takes its place (ms). */
function readMs(line: { text: string }): number {
  return Math.min(6000, Math.max(2500, 1500 + line.text.length * 45));
}

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
  /** When she will ask to be fed (ms; 0 for not at all), what she asks for, and whether she has been fed. */
  hungerAt: number;
  hungry: {
    /** Feeding (a set of reps) or a prayer (a timed set). */
    kind: "feed" | "pray";
    id: string;
    text: string;
    size: number;
    minutes: number;
    since: number;
    hiddenUntil: number;
  } | null;
  fed: boolean;
  /** Where she goes back to: her own place, or for a companion from another region, where she came in. */
  homeAt: Spot;
}
const SAVE_KEY = "azshara-court-v1";
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
    loadTalk(save, d);
  } catch {
    /* private mode / broken save */
  }
  return save;
}

/** Which phrases of the texts have come in this round of the deck (see bag.ts). */
const BAG_KEY = "azshara-court-bag-v1";
let deck: {
  from: unknown[];
  /** Each text of the library: its phrases, and how many are recited this round. */
  texts: DeckText[];
  /** What the deck draws from, by the chosen text ("" for all of them mixed). */
  by: Map<string, { units: string[]; hashes: Set<string>; mark: string }>;
} | null = null;

/**
 * Every text of Rehearse's library (the .txt files of input_pertext, a .zip
 * folder's too, or the built-in one) with its phrases and how far through it the
 * recites are (`done` is the Court's bag of phrases recited through), worked out
 * again only when the texts change.
 */
function deckOf(done: Set<string>): NonNullable<typeof deck> {
  const g = useGame.getState();
  const from = [g.texts, g.lines, g.folders, g.custom];
  if (!deck || deck.from.some((f, i) => f !== from[i])) {
    deck = { from, texts: deckTexts(rehearseLibrary(), C.minPhraseWords, done), by: new Map() };
  }
  return deck;
}

/** What a recite draws from: the phrases of the chosen text, or of all of them mixed. */
function deckUnits(done: Set<string>, source: string) {
  const d = deckOf(done);
  let by = d.by.get(source);
  if (!by) {
    const units = unitsFrom(rehearseLibrary(), source, C.minPhraseWords);
    by = { units, hashes: new Set(units.map(hashOf)), mark: textMark(source || "all", units) };
    d.by.set(source, by);
  }
  return by;
}

function loadBag(): Set<string> {
  try {
    const raw = localStorage.getItem(BAG_KEY);
    const data: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(data) ? data.filter((h): h is string => typeof h === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function saveBag(used: Set<string>) {
  try {
    localStorage.setItem(BAG_KEY, JSON.stringify([...used]));
  } catch {
    /* private mode / quota */
  }
}

function skillName(k: SkillKey) {
  return C.skills[k].name;
}

/** The Court: walk a small world by tapping, recite at its places to raise skills, and win the queens over. */
/** The talk screen as the game holds it: the conversation, her lines still to come, what you can say, and where it stands. */
type TalkState = {
  t: Talk;
  log: CourtTalkEntry[];
  waiting: CourtTalkEntry[];
  choices: Choice[];
  ended: boolean;
  fresh: boolean;
  locked: boolean;
};

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
  /** The looks' number when the portraits here were made (portrait.ts looksRev). */
  private looksSeen = 0;
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
  /** Lines waiting their turn (none is lost when several queens speak at once), and when the shown one came. */
  private lineQueue: NonNullable<CourtView["line"]>[] = [];
  private lineAt = 0;
  /** The second queen watching you recite, if two walk with you; banter between queens with you; double rivals. */
  private alsoWatching: QueenKey | null = null;
  private banterIn = G.banterSeconds;
  private doubleRivalAt = new Map<string, number>();
  /** When each sister, friend or named pair with you was last noticed together. */
  private groupAt = new Map<string, number>();
  /** Feedings and prayers offered unasked today, by day and queen. */
  private offered = new Map<string, number>();
  /** Notices waiting for room on screen: at most NOTICES_SHOWN at once, each for its full time. */
  private noticeQueue: { id: number; text: string; queen: QueenKey | null; color: string }[] = [];
  /** Time spent resting already counted, and the clock at the last tick (ms). */
  private restedSeen = restedTotal();
  private wallAt = 0;
  /** What each queen said lately, so she does not repeat herself, and your conversations. */
  private said = new Map<QueenKey, string[]>();
  /** Phrases of the texts already come in this round of the deck, and the last one. */
  /** The phrases recited all through this round (by their names; a text finished is cleared for a fresh round). */
  private bag = loadBag();
  /** The last few phrases that came, so a skipped one does not come straight back. */
  private recent: string[] = [];
  private line: CourtView["line"] = null;
  /**
   * The talk screen: the conversation, what has been said, her lines still to
   * come (each shows on a tap), what you can say now, and whether a line of
   * hers is up that has not been tapped past yet.
   */
  private talk: TalkState | null = null;
  private talkSeq = 1;
  /**
   * A deeper question asked over the crystal wine, waiting on the phrase you
   * recite for her: the talk it came from (kept while the recite takes the
   * screen), the question, and your line in the log.
   */
  private toast: { talk: TalkState; choice: Choice; asked: CourtTalkEntry | null } | null = null;
  /** What she has told you on this date night (so she does not say it twice). */
  private dateTold: string[] = [];
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
    // The looks made in the Atelier, before anything is drawn.
    readLooks();
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
    // On the Court's screen only the Court sounds. Pause all sound pressed anywhere (Rehearse, its window)
    // stops the recite's sound; Play all sound starts it.
    courtScreen(true);
    this.pausedSeen = rehearseState().settings.paused;
    this.unsubRehearse = subscribeRehearse(() => {
      const p = rehearseState().settings.paused;
      if (p === this.pausedSeen) return;
      this.pausedSeen = p;
      if (this.session && this.soundMuted !== p) {
        this.soundMuted = p;
        this.pushView(true);
      }
    });
    this.pushView(true);
  }

  private pausedSeen = false;
  private unsubRehearse: (() => void) | null = null;

  stop() {
    cancelSleep(this.wake);
    this.persist();
    // The Court's sound ends with it.
    this.soundKey = "";
    void courtSound(null);
    courtHush();
    courtScreen(false);
    this.unsubRehearse?.();
    this.unsubRehearse = null;
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
    const text = speak(
      q,
      key,
      Math.random,
      { ...this.voiceFill(q), ...fill },
      this.tierOf(q),
      this.said.get(q),
    );
    this.remember(q, text);
    const entry = this.speakLine({ speaker: spec.name, text, color: spec.color, queen: q });
    this.see(q);
    if (situation) {
      speakAs(`${spec.name}, ${spec.title}: ${spec.persona}`, situation, (text) => {
        if (!this.running) return;
        // In the talk screen: her line there, shown or still to come.
        if (entry) {
          entry.text = text;
          return this.pushView(true);
        }
        const better = { speaker: spec.name, text, color: spec.color, queen: q };
        // The model's words take the place of hers, on screen or still waiting.
        if (this.line?.queen === q) this.line = better;
        else {
          const at = this.lineQueue.findIndex((l) => l.queen === q);
          if (at >= 0) this.lineQueue[at] = better;
          else this.speakLine(better);
        }
        this.pushView(true);
      });
    }
    this.pushView(true);
  }

  /** What her lines can use: where you are, your best skill, her bonds, one of your Reps phrases. */
  private voiceFill(q: QueenKey): Fill {
    const spec = C.queens[q];
    const skills = this.save.skills;
    const best = (Object.keys(skills) as SkillKey[]).sort((a, b) => skills[b] - skills[a])[0];
    const bonds = bondsOf(q);
    const of = (kind: string) => {
      const list = bonds.filter((b) => b.kind === kind);
      const b = list[Math.floor(Math.random() * list.length)];
      return b ? C.queens[b.queen].name : undefined;
    };
    const hour = new Date().getHours();
    return {
      place: placeSay(C.places[spec.place as PlaceKey].name),
      region: midSentence(C.regions[this.save.region].name),
      skill: best ? C.skills[best].name : undefined,
      level: best ? skillLevel(skills[best]) : undefined,
      total: totalLevel(skills),
      gift: giftSay(spec.gift),
      time:
        hour < 5
          ? "tonight"
          : hour < 12
            ? "this morning"
            : hour < 18
              ? "this afternoon"
              : "this evening",
      sister: of("sister"),
      friend: of("friend"),
      foe: of("rival"),
      phrase: pickBonus(readReps(), Math.random, C.bonus.maxWords)?.text,
      passes: this.save.devotion[q].toLocaleString("en"),
      dates: this.save.dates[q] > 0 ? this.save.dates[q] : undefined,
    };
  }

  private tierOf(q: QueenKey): number {
    return tierOf(this.save.affection[q]).index;
  }

  /** Her line, in her voice (an opener, an ending), remembered so she does not repeat it soon. */
  private voiced(q: QueenKey, text: string): string {
    const out = dress(q, text, Math.random, this.tierOf(q), this.voiceFill(q));
    this.remember(q, out);
    return out;
  }

  private remember(q: QueenKey, text: string) {
    const list = this.said.get(q) ?? [];
    list.push(text);
    if (list.length > 12) list.shift();
    this.said.set(q, list);
  }

  /**
   * A line to show: at once when the one on screen has been up long enough to
   * read, else after it, in turn. Several queens speaking at once all get heard.
   */
  private speakLine(line: NonNullable<CourtView["line"]>): CourtTalkEntry | null {
    // Face to face, every line is part of the conversation.
    const talk = this.panel?.kind === "talk" ? this.talk : null;
    if (talk && !this.session) {
      if (line.queen === talk.t.queen) return this.talkHer(line.text);
      return this.talkAdd({
        who: line.queen ? "note" : "you",
        text: line.queen ? `${line.speaker}: ${line.text}` : line.text,
      });
    }
    const last = this.lineQueue[this.lineQueue.length - 1] ?? this.line;
    if (last && last.text === line.text && last.speaker === line.speaker) return null;
    // Her sheet is open: what she says there comes first. A line it takes the place of, if
    // not up long enough to have been read, comes back straight after it.
    if (
      this.line &&
      line.queen &&
      this.panel?.kind === "queen" &&
      this.panel.queen === line.queen &&
      this.line.queen !== line.queen
    ) {
      if (performance.now() - this.lineAt < readMs(this.line)) this.lineQueue.unshift(this.line);
      this.line = line;
      this.lineAt = performance.now();
      this.voiceLine(line);
      return null;
    }
    if (
      !this.line ||
      (!this.lineQueue.length && performance.now() - this.lineAt >= readMs(this.line))
    ) {
      this.line = line;
      this.lineAt = performance.now();
      this.voiceLine(line);
    } else {
      this.lineQueue.push(line);
      if (this.lineQueue.length > LINE_QUEUE) this.lineQueue.shift();
    }
    return null;
  }

  /** The next waiting line, once the one on screen has been read. */
  private nextLine(): boolean {
    if (!this.lineQueue.length || !this.line) return false;
    if (performance.now() - this.lineAt < readMs(this.line)) return false;
    this.line = this.lineQueue.shift()!;
    this.lineAt = performance.now();
    this.voiceLine(this.line);
    return true;
  }

  /**
   * A tap on the line: it has been read. The next one waiting shows at once
   * (no waiting out its time); with none waiting, the line goes.
   */
  courtLineDone() {
    const next = this.lineQueue.shift();
    this.line = next ?? null;
    this.lineAt = performance.now();
    if (next) this.voiceLine(next);
    this.pushView(true);
  }

  /**
   * A queen's line said aloud, in Rehearse's robot voice at her own pitch and
   * pace, when the Court's switch for it is on. Not while the phrase you recite
   * is sounding: two voices at once would drown each other.
   */
  private voiceLine(line: { text: string; queen?: QueenKey }) {
    if (!line.queen || !this.save.sound.lines) return;
    if (this.session && this.save.sound.phrase) return;
    void courtSay(line.text, this.herVoice(line.queen), C.sound.lineVoices);
  }

  /** A queen's own voice: her pitch and pace, and the voice chosen for her on her sheet (or picked for her). */
  private herVoice(q: QueenKey) {
    const her = C.sound.queens[q] ?? { pitch: 1, rate: 1 };
    return { ...her, voice: this.save.sound.voices[q], slot: QUEEN_KEYS.indexOf(q) };
  }

  /** Gives a queen a voice (a name, "" for one picked for her, "=" for Rehearse's), and lets you hear it. */
  courtVoice(q: QueenKey, voice: string) {
    this.save.sound = { ...this.save.sound, voices: { ...this.save.sound.voices, [q]: voice } };
    this.persist();
    this.pushView(true);
    this.courtVoiceTry(q);
  }

  /** Her voice, tried: she says a hello aloud, whatever the switches say. */
  courtVoiceTry(q: QueenKey) {
    const hello = speak(q, "greet", Math.random, this.voiceFill(q), this.tierOf(q));
    void courtSay(hello, this.herVoice(q), C.sound.lineVoices);
  }

  /** What the Court last asked Rehearse's players for: the phrase and its pass ("" for nothing). */
  private soundKey = "";

  /**
   * The phrase being recited sounds as Rehearse is set (rehearseRun.ts
   * courtSound), pass by pass; nothing while the game is held, on a round's
   * summary, or once the session is over.
   */
  private syncSound(held: boolean) {
    const s = this.session;
    const on =
      !!s && !s.over && !s.roundDone && !held && this.save.sound.phrase && !this.soundMuted;
    // By phrase, not by pass: the voices keep looping through a phrase's passes, and all
    // start again only on the next phrase (or when the text it is from is another).
    const key = on && s ? `${s.phrases}|${s.phrase}|${this.save.source}` : "";
    if (key === this.soundKey) return;
    this.soundKey = key;
    // Recited for a queen: the main voice is her own.
    void courtSound(
      on && s ? s.phrase : null,
      key,
      on && s?.queen ? this.herVoice(s.queen) : undefined,
      on && s ? this.wholeOf(s.phrase) : undefined,
    );
  }

  /**
   * The text the recite is from, for the voices set to read a whole text: the one
   * chosen (or the only one there is), with the phrase being recited among its
   * phrases. None when several are mixed, or the phrase is not of the text yet.
   */
  private wholeOf(phrase: string): CourtText | undefined {
    const library = rehearseLibrary();
    const t = wholeText(library, this.save.source);
    if (!t) return undefined;
    const d = deckUnits(this.bag, chosenText(library, this.save.source)?.key ?? "");
    const at = d.units.indexOf(phrase);
    return at < 0 ? undefined : { units: d.units, at, mark: d.mark };
  }

  /** The recite's sound stopped by hand (the Sound sheet, or Pause all sound in Rehearse); it starts by itself again with the next recite. */
  private soundMuted = false;

  /** Pauses or plays the sound of the recite you are in. */
  courtMute() {
    this.soundMuted = !this.soundMuted;
    this.message = this.soundMuted
      ? "The recite's sound is paused. It starts by itself again with the next recite."
      : "The recite's sound plays.";
    this.pushView(true);
  }

  /** Chooses the text recites draw their phrases from ("" for all of Rehearse's texts); the next phrase comes from it. */
  courtSource(key: string) {
    this.save.source = chosenText(rehearseLibrary(), key)?.key ?? "";
    this.recent = [];
    this.message = this.save.source
      ? `Phrases from “${chosenText(rehearseLibrary(), this.save.source)?.name ?? "the text"}”, from the next one.`
      : "Phrases from all your texts, from the next one.";
    this.persist();
    this.pushView(true);
  }

  /** Rehearse shown over the Court (its Sound button): the Court's clock is held meanwhile. */
  private away = false;

  courtAway(on: boolean) {
    if (this.away === on) return;
    this.away = on;
    this.pushView(true);
  }

  /** Turns a part of Rehearse's sound in the Court on or off: the phrase you recite, or the queens' lines. */
  courtSoundToggle(part: "phrase" | "lines") {
    this.save.sound = { ...this.save.sound, [part]: !this.save.sound[part] };
    if (part === "lines" && !this.save.sound.lines) courtHush();
    this.message =
      part === "phrase"
        ? this.save.sound.phrase
          ? "The phrase you recite sounds as Rehearse is set."
          : "The phrase you recite is silent."
        : this.save.sound.lines
          ? "Queens say their lines aloud, in Rehearse's voice."
          : "Queens speak in writing only.";
    this.persist();
    this.pushView(true);
  }

  // ---- The talk screen ----

  /** A line into the conversation, shown at once. */
  private talkAdd(e: Omit<CourtTalkEntry, "id">): CourtTalkEntry | null {
    const talk = this.talk;
    if (!talk) return null;
    const entry = { id: this.talkSeq++, ...e };
    talk.log.push(entry);
    if (talk.log.length > TALK_LOG) talk.log.splice(0, talk.log.length - TALK_LOG);
    return entry;
  }

  /**
   * A line of hers: the first shows at once; while one is up that you have not
   * tapped past, the next ones wait their turn behind it.
   */
  private talkHer(text: string): CourtTalkEntry | null {
    const talk = this.talk;
    if (!talk) return null;
    if (talk.fresh || talk.waiting.length) {
      const entry: CourtTalkEntry = { id: this.talkSeq++, who: "her", text };
      talk.waiting.push(entry);
      return entry;
    }
    talk.fresh = true;
    const entry = this.talkAdd({ who: "her", text });
    if (entry) this.voiceLine({ text, queen: talk.t.queen });
    return entry;
  }

  /** What a talk with her knows of the moment: her tier, her feeling, her wish, what you recited for her. */
  private talkContext(q: QueenKey): TalkContext {
    const now = Date.now();
    const day = dayOf(now);
    rollDay(this.save, day);
    const w = wishOf(q, day);
    const jealous = this.save.jealous[q] > 0;
    return {
      tier: this.tierOf(q),
      fill: this.voiceFill(q),
      feeling: jealous ? "jealous" : (arcOf(this.save, q, now)?.id ?? "calm"),
      jealous,
      rival: jealous ? this.rivalName(q) : "",
      wish: this.save.wishes.done[q] ? null : { count: w.passes, skill: skillName(w.skill) },
      passes: this.save.devotion[q],
      bottles: this.save.wine,
    };
  }

  /**
   * Opens the talk screen with a queen: she says hello (or how she missed you,
   * or that she is jealous), and you choose what to say, line after line.
   */
  courtTalk(q: QueenKey) {
    if (this.session) return;
    sfx.unlock();
    this.touch(q);
    const hello = this.line?.queen === q ? this.line.text : "";
    this.line = null;
    this.lineQueue = [];
    const locked = !meetsNeed(q, this.save.skills);
    this.talk = { t: newTalk(q), log: [], waiting: [], choices: [], ended: false, fresh: false, locked };
    this.panel = { kind: "talk", queen: q };
    if (locked) {
      this.say0(q, "locked");
      this.talk.choices = [{ id: "bye", kind: "bye", text: "I'll come back when I'm ready." }];
      return this.pushView(true);
    }
    // What she just said when you walked up carries over; else a reunion or jealousy comes before hello.
    if (hello) this.talkHer(hello);
    else if (this.meet(q)) {
      /* She said how she missed you. */
    } else if (this.save.jealous[q] > 0) {
      this.queenSays(
        q,
        "jealous",
        { rival: this.rivalName(q) },
        `You are jealous: the player has been spoiling ${this.rivalName(q)}. Pout, tease, make them win you back.`,
      );
    } else {
      this.queenSays(
        q,
        "greet",
        {},
        `The player has come to talk with you. You are at tier ${tierOf(this.save.affection[q]).name}.`,
      );
    }
    this.save.lastSeen[q] = Date.now();
    this.talk.choices = choicesFor(this.talk.t, this.talkContext(q), Math.random);
    this.pushView(true);
  }

  /** You say one of the lines on offer: she answers, and it does what it does. */
  courtSay(id: string) {
    const talk = this.talk;
    if (!talk || talk.ended || talk.waiting.length) return;
    const c = talk.choices.find((x) => x.id === id);
    // A bottle can only be poured while one is in the bag.
    if (!c || (c.kind === "pour" && this.save.wine < 1)) return;
    const q = talk.t.queen;
    this.touch(q);
    talk.fresh = false;
    const asked = this.talkAdd({ who: "you", text: c.text, tone: c.tone });
    if (talk.locked) {
      talk.ended = true;
      this.courtTalkEnd();
      return;
    }
    // A deeper question over the wine is answered once you have recited for her: the recite starts by itself.
    if (c.kind === "exotic") return this.courtToast(c, asked);
    this.courtAnswer(c);
  }

  /**
   * A deeper question over the crystal wine: she answers it once a phrase has been
   * recited for her. The recite starts by itself (sipPhrases phrases at her place, her
   * watching, with the usual XP, gold, streak and text progress); when it is through
   * the talk comes back with her answer. Leaving the recite early brings the talk back
   * with the question still waiting (see endSession).
   */
  private courtToast(c: Choice, asked: CourtTalkEntry | null) {
    const talk = this.talk;
    if (!talk) return;
    const q = talk.t.queen;
    this.toast = { talk, choice: c, asked };
    this.courtRecite(C.queens[q].place as PlaceKey, { queen: q, toast: true });
    if (!this.session?.toast) {
      // The recite could not begin: the question waits, as if leaving it early.
      this.toast = null;
      if (asked) talk.log = talk.log.filter((e) => e !== asked);
      return this.pushView(true);
    }
    // What you asked stays in her box while you recite, and what is to be done in the message.
    this.line = { speaker: "You", text: c.text, color: PAL.gold };
    this.lineQueue = [];
    this.lineAt = performance.now();
    this.message = `Recite for ${C.queens[q].name}: she answers when the phrase is through.`;
    this.pushView(true);
  }

  /** Her answer to a line you said, and what it does: affection, her mood, a bottle poured, a wish told. */
  private courtAnswer(c: Choice) {
    const talk = this.talk;
    if (!talk) return;
    const q = talk.t.queen;
    const spec = C.queens[q];
    const day = dayOf(Date.now());
    const r = replyTo(talk.t, c, this.talkContext(q), Math.random);
    if (c.tone) markTried(this.save, q, c.tone);
    if (r.poured) {
      this.save.wine = Math.max(0, this.save.wine - 1);
      this.save.wineShared[q] += 1;
      sfx.bless();
    }
    if (r.mood) this.feel(q, r.mood);
    const first = this.talkHer(r.lines[0] ?? "...");
    if (first) first.taste = r.taste;
    for (const text of r.lines.slice(1)) this.talkHer(text);
    for (const text of r.lines) this.remember(q, text);
    // With a model connected, her first words give way to ones of her own.
    if (first && !r.ended)
      speakAs(
        `${spec.name}, ${spec.title}: ${spec.persona}`,
        `The player says to you${c.tone ? `, in a ${c.tone} tone` : ""}: "${c.text}".${r.taste ? ` You ${r.taste === "plain" ? "are unmoved by" : r.taste === "disliked" ? "dislike" : r.taste === "loved" ? "love" : "like"} that kind of talk.` : ""}${c.kind === "pour" ? " They are pouring you a glass of crystal wine." : c.kind === "exotic" ? " You are sharing crystal wine with them and it loosens your tongue: answer more intimately and honestly than usual." : ""} Answer in one or two short sentences.`,
        (text) => {
          if (!this.running) return;
          first.text = text;
          this.pushView(true);
        },
      );
    // What the exchange is worth: the first few a day add affection (the wine's, always); a tone she dislikes costs a little, never a tier.
    if (r.affection > 0 && (r.free || countTalk(this.save, q, day))) {
      const gained = this.addAffection(q, r.affection, true);
      if (first) first.gain = gained;
    } else if (r.affection < 0) {
      const floor = C.affectionTiers[this.tierOf(q)]?.at ?? 0;
      const before = this.save.affection[q];
      this.save.affection[q] = Math.max(floor, before + r.affection);
      if (first) first.gain = Math.round((this.save.affection[q] - before) * 10) / 10;
    }
    if (r.toldWish) {
      this.wishTold.add(`${day}|${q}`);
      const w = wishOf(q, day);
      const pair = allianceOf(day);
      const partner = pair?.includes(q) ? pair.find((p) => p !== q) : undefined;
      if (partner)
        this.notice(
          `${spec.name} and ${C.queens[partner].name} share one wish today: ${w.passes} passes of ${skillName(w.skill)} grants it to both`,
          q,
        );
    }
    // An apology she took well eases her jealousy a step (and ends it, when that was the last of it).
    if (r.soothed && !this.makeUp(q, false)) this.notice(`${spec.name} softens a little`, q);
    this.save.lastSeen[q] = Date.now();
    this.see(q);
    if (r.ended) talk.ended = true;
    else talk.choices = choicesFor(talk.t, this.talkContext(q), Math.random);
    this.persist();
    this.pushView(true);
  }

  /** A tap on her line: read. Her next line shows; after her goodbye, the talk closes. */
  courtTalkNext() {
    const talk = this.talk;
    if (!talk) return;
    const next = talk.waiting.shift();
    if (next) {
      talk.log.push(next);
      talk.fresh = true;
      this.voiceLine({ text: next.text, queen: talk.t.queen });
    } else if (talk.ended) return this.courtTalkEnd();
    this.pushView(true);
  }

  /** Leaves the talk: back to her sheet. */
  courtTalkEnd() {
    const q = this.talk?.t.queen;
    courtHush();
    this.talk = null;
    this.panel = q ? { kind: "queen", queen: q } : null;
    this.pushView(true);
  }

  /** Waiting notices take any free room on screen. */
  private showNotices() {
    const now = performance.now();
    while (this.notices.length < NOTICES_SHOWN && this.noticeQueue.length)
      this.notices.push({ ...this.noticeQueue.shift()!, born: now });
  }

  /**
   * While you recite or rest (a rep set), the queens with you wait: that time
   * does not count towards their going home, getting hungry or giving up.
   */
  private holdOutings(ms: number) {
    if (ms <= 0) return;
    for (const o of this.out.values()) {
      o.since += ms;
      if (o.foundAt) o.foundAt += ms;
      if (o.hungerAt) o.hungerAt += ms;
      if (o.hungry) o.hungry.since += ms;
    }
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
    // Face to face, it is a note in the conversation (and in the News), not a card over her portrait.
    if (this.panel?.kind === "talk" && this.talk && !this.session) {
      this.talkAdd({ who: "note", text });
      addNews(this.save, { at: Date.now(), text, queen, kind });
      return;
    }
    // It waits for room on screen rather than pushing another off unread.
    this.noticeQueue.push({ id: this.dropId++, text, queen, color });
    if (this.noticeQueue.length > NOTICE_QUEUE) this.noticeQueue.shift();
    this.showNotices();
    addNews(this.save, { at: Date.now(), text, queen, kind });
  }

  /** Taps a notice away; on the map, a notice about a queen opens her sheet. */
  courtNotice(id: number) {
    const n = this.notices.find((x) => x.id === id);
    this.notices = this.notices.filter((x) => x.id !== id);
    this.showNotices();
    if (n?.queen && !this.session) this.courtOpen({ kind: "queen", queen: n.queen });
    else this.pushView(true);
  }

  // ---- Queens who come out to find you ----

  // ---- A life of her own (life.ts) ----

  /** Queens about by themselves in this region: where each is, where she is going and why. */
  private roam = new Map<
    QueenKey,
    { x: number; y: number; path: Spot[]; plan: Plan; thinkIn: number; place: string; queen: string; seed: number }
  >();
  private roamRegion = "";

  /** Each queen of this region does what her brain picks: walks there, stays a while, thinks again. */
  private life(dt: number) {
    const L = C.life;
    if (!L.enabled) return;
    if (this.roamRegion !== this.save.region) {
      this.roam.clear();
      this.roamRegion = this.save.region;
    }
    const think = () => (L.think[0] ?? 5) + Math.random() * Math.max(0, (L.think[1] ?? 14) - (L.think[0] ?? 5));
    for (const q of queensIn(this.save.region)) {
      // Out to find you: that comes first.
      if (this.out.has(q)) {
        this.roam.delete(q);
        continue;
      }
      const [hc, hr] = C.queens[q].at as Spot;
      let r = this.roam.get(q);
      if (!r) {
        r = { x: hc, y: hr, path: [], plan: "home", thinkIn: think(), place: "", queen: "", seed: 0 };
        this.roam.set(q, r);
      }
      // With you (you walk to her, her sheet or a talk is open, you recite for her): she stands still.
      const p = this.panel;
      const busy =
        (this.goal?.kind === "queen" && this.goal.queen === q) ||
        ((p?.kind === "queen" || p?.kind === "talk") && p.queen === q) ||
        (p?.kind === "atelier" && p.who === q);
      if (busy) {
        r.path = [];
        continue;
      }
      if (r.path.length) {
        const [tc, tr] = r.path[0]!;
        const d = Math.hypot(tc - r.x, tr - r.y);
        const step = L.speed * dt;
        if (d <= step) {
          r.x = tc;
          r.y = tr;
          r.path.shift();
          if (!r.path.length) {
            // There: she stays a while; an outing made counts towards what she does next.
            r.thinkIn = stayFor(r.plan);
            if (r.plan !== "home") {
              this.save.life[q] += 1;
              this.persist();
            }
          }
        } else {
          r.x += ((tc - r.x) / d) * step;
          r.y += ((tr - r.y) / d) * step;
        }
        continue;
      }
      r.thinkIn -= dt;
      if (r.thinkIn > 0) continue;
      this.decide(q, r, [hc, hr]);
      if (!r.path.length) r.thinkIn = stayFor(r.plan);
    }
  }

  /** Her brain's turn: what she does next, and the way there. */
  private decide(
    q: QueenKey,
    r: { x: number; y: number; path: Spot[]; plan: Plan; place: string; queen: string; seed: number },
    home: Spot,
  ) {
    const here = queensIn(this.save.region);
    const at: Spot = [Math.round(r.x), Math.round(r.y)];
    const doors = (Object.keys(this.world.doors) as PlaceKey[]).filter(
      (pl) => pl !== C.queens[q].place && !gateOf(pl),
    );
    const friends = bondsOf(q)
      .filter((b) => b.kind !== "rival" && here.includes(b.queen) && !this.out.has(b.queen))
      .map((b) => b.queen);
    const plan = choose({
      hour: new Date().getHours(),
      mood: this.moodNow(q),
      tier: this.tierOf(q),
      outings: this.save.life[q],
      places: doors.length > 0,
      friends: friends.length > 0,
      away: Math.hypot(r.x - home[0], r.y - home[1]) > 0.6,
    });
    const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;
    let to: Spot | null = null;
    r.place = "";
    r.queen = "";
    if (plan === "home") to = home;
    else if (plan === "stroll") {
      const far = roamRadius(this.save.life[q]);
      for (let i = 0; i < 12 && !to; i++) {
        const c = home[0] + Math.round((Math.random() * 2 - 1) * far);
        const row = home[1] + Math.round((Math.random() * 2 - 1) * far);
        if (walkable(this.world, c, row) && (c !== at[0] || row !== at[1])) to = [c, row];
      }
    } else if (plan === "visit") {
      const place = pick(doors);
      to = this.world.doors[place] ?? null;
      r.place = C.places[place].name;
    } else if (plan === "call") {
      const friend = pick(friends);
      const [fc, fr] = this.queenCell(friend);
      to = nearestWalkable(this.world, [fc + (fc > at[0] ? -1 : 1), fr]);
      r.queen = C.queens[friend].name;
    }
    r.plan = plan;
    r.seed += 1;
    if (!to || (to[0] === at[0] && to[1] === at[1])) return;
    const path = pathTo(this.world, at, to);
    // No way there, or a long way round: she stays where she is.
    if (!path || path.length < 2 || path.length > 60) {
      r.plan = Math.hypot(r.x - home[0], r.y - home[1]) > 0.6 ? "rest" : "home";
      return;
    }
    r.path = path.slice(1);
  }

  /** What she is doing by herself now, for her sheet ("" when she is out with you or elsewhere). */
  private lifeNote(q: QueenKey): string {
    const r = this.roam.get(q);
    if (!r || this.out.has(q)) return "";
    return doing(r.plan, r.path.length > 0, { place: r.place || undefined, queen: r.queen || undefined }, r.seed);
  }

  /** Where she is now, in cells: out on the map, or at her place. */
  private queenSpot(q: QueenKey): { x: number; y: number } {
    const o = this.out.get(q);
    if (o) return { x: o.x, y: o.y };
    const about = this.roam.get(q);
    if (about) return { x: about.x, y: about.y };
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
    // Talking to a hungry queen makes her wait a while longer.
    if (o.hungry) o.hungry.since = Date.now();
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
      this.checkDoubleRival();
      this.checkGroupClose();
    }
    this.banterIn -= dt;
    if (this.banterIn <= 0) {
      this.banterIn = Math.max(5, G.banterSeconds * (0.7 + Math.random() * 0.6));
      if (!this.panel) this.banter();
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
    // From wherever she is: at her place, or about by herself.
    const from = this.queenCell(q);
    this.roam.delete(q);
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
      hungerAt: 0,
      hungry: null,
      fed: false,
      homeAt: from,
    });
    sfx.ready();
    const place = placeSay(C.places[C.queens[q].place as PlaceKey].name);
    const text = presenceLine(
      was === "confront" ? "outConfront" : "out",
      { queen: C.queens[q].name, place },
      Math.random,
      "notices",
    );
    if (text) this.notice(text, q);
    // Sometimes her sister or friend comes along.
    if (Math.random() < G.togetherChance) this.bringAlong(q, from, path);
    this.pushView(true);
  }

  /** Her sister or friend (one who knows you, from any region) comes out with her. */
  private bringAlong(q: QueenKey, from: Spot, path: Spot[]) {
    const now = Date.now();
    const options = bondsOf(q).filter(
      (b) =>
        b.kind !== "rival" &&
        !this.out.has(b.queen) &&
        meetsNeed(b.queen, this.save.skills) &&
        tierOf(this.save.affection[b.queen]).index >= P.minTier &&
        arcOf(this.save, b.queen, now)?.id !== "distant",
    );
    const b = options[Math.floor(Math.random() * options.length)];
    if (!b) return;
    const was = arcOf(this.save, b.queen, now)?.id ?? null;
    if (was !== "confront") setArc(this.save, b.queen, "seeking", now);
    this.out.set(b.queen, {
      x: from[0],
      y: from[1],
      path: [...path],
      since: now,
      foundAt: 0,
      met: false,
      home: false,
      was,
      hungerAt: 0,
      hungry: null,
      fed: false,
      homeAt: from,
    });
    const text = presenceLine(
      "together",
      { queen: C.queens[q].name, other: C.queens[b.queen].name, bond: BOND_NAME[b.kind] },
      Math.random,
      "notices",
    );
    if (text) this.notice(text, q);
  }

  /** The queens on this map: those who live here, and any visiting with a sister or friend. */
  private onMap(): QueenKey[] {
    const here = queensIn(this.save.region);
    return [...here, ...[...this.out.keys()].filter((q) => !here.includes(q))];
  }

  /** The queens who have found you and walk with you. */
  private withMe(): QueenKey[] {
    return [...this.out].filter(([, o]) => o.foundAt && !o.home).map(([q]) => q);
  }

  /** Two queens with you talk to each other now and then: sisters and friends warmly, rivals not. */
  private banter() {
    const me = this.withMe();
    const pairs: { a: QueenKey; b: QueenKey; kind: string }[] = [];
    for (let i = 0; i < me.length; i++)
      for (let j = i + 1; j < me.length; j++) {
        const kind = bondOf(me[i]!, me[j]!);
        if (kind) pairs.push({ a: me[i]!, b: me[j]!, kind });
      }
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    if (!pair) return;
    const [a, b] = Math.random() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a];
    const say = duoLines(pair.kind);
    const answer = duoReplyLines(pair.kind);
    const line = say[Math.floor(Math.random() * say.length)];
    const reply = answer[Math.floor(Math.random() * answer.length)];
    if (!line) return;
    const sa = C.queens[a];
    const sb = C.queens[b];
    this.speakLine({
      speaker: sa.name,
      text: this.voiced(a, fillLine(line, { other: sb.name, pet: this.petOf(a) })),
      color: sa.color,
      queen: a,
    });
    if (reply)
      this.speakLine({
        speaker: sb.name,
        text: fillLine(reply, { other: sa.name, pet: this.petOf(b) }),
        color: sb.color,
        queen: b,
      });
    this.see(a);
    this.see(b);
    this.pushView(true);
  }

  /** What she calls you, today. */
  private petOf(q: QueenKey): string {
    const pets = VOICES[q].pet;
    return pets[Math.floor(Math.random() * pets.length)] ?? "you";
  }

  /** Two rivals both walking with you: each grows jealous, and the Court notices (Grok's idea). */
  private checkDoubleRival() {
    const me = this.withMe();
    if (me.length < 2) return;
    const now = Date.now();
    const cool = P.doubleRivalMinutes * 60_000;
    for (let i = 0; i < me.length; i++)
      for (let j = i + 1; j < me.length; j++) {
        const a = me[i]!;
        const b = me[j]!;
        if (bondOf(a, b) !== "rival") continue;
        const key = pairKey(a, b);
        if (now - (this.doubleRivalAt.get(key) ?? 0) < cool) continue;
        this.doubleRivalAt.set(key, now);
        for (const q of [a, b]) {
          this.save.jealous[q] = Math.min(H.jealousMax, this.save.jealous[q] + P.doubleRivalExtra);
          this.rivals.set(q, q === a ? b : a);
          this.feel(q, "jealous");
          setArc(this.save, q, "confront", now);
        }
        const text = presenceLine(
          "doubleRival",
          { queen: C.queens[a].name, other: C.queens[b].name },
          Math.random,
          "notices",
        );
        if (text) this.notice(text, a);
        this.persist();
        return;
      }
  }

  /**
   * Two sisters or friends both walking with you (or two queens with lines of
   * their own for each other): the Court notices, and each says her pair line to
   * the other, at most once every groupMinutes for the pair (Grok's pack).
   */
  private checkGroupClose() {
    const me = this.withMe();
    if (me.length < 2) return;
    const now = Date.now();
    const cool = Math.max(1, P.groupMinutes) * 60_000;
    for (let i = 0; i < me.length; i++)
      for (let j = i + 1; j < me.length; j++) {
        const a = me[i]!;
        const b = me[j]!;
        const bond = bondOf(a, b);
        const pair = pairTalk(a, b);
        const named = pair.notice.length > 0 || Object.values(pair.says).some((l) => l.length);
        if (bond !== "sister" && bond !== "friend" && !named) continue;
        const key = pairKey(a, b);
        if (now - (this.groupAt.get(key) ?? 0) < cool) continue;
        this.groupAt.set(key, now);
        const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
        const own = pick(pair.notice);
        const text =
          own && (Math.random() < 0.5 || (bond !== "sister" && bond !== "friend"))
            ? own
            : bond === "sister" || bond === "friend"
              ? presenceLine(
                  bond === "sister" ? "groupSister" : "groupFriend",
                  { queen: C.queens[a].name, other: C.queens[b].name },
                  Math.random,
                  "notices",
                )
              : "";
        if (text) this.notice(text, a);
        for (const [q, other] of [
          [a, b],
          [b, a],
        ] as const) {
          const line = pick(pair.says[q] ?? []);
          if (!line) continue;
          const spec = C.queens[q];
          this.speakLine({
            speaker: spec.name,
            text: this.voiced(
              q,
              fillLine(line, { other: C.queens[other].name, pet: this.petOf(q) }),
            ),
            color: spec.color,
            queen: q,
          });
        }
        this.see(a);
        this.see(b);
        this.pushView(true);
        return;
      }
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
        if (o.foundAt && o.hungerAt && !o.hungry && now >= o.hungerAt) this.getHungry(q, o);
        // She stays a while once she has found you (hungry, until she gives up on being
        // fed); if she never finds you, she gives up quietly.
        if (
          o.hungry
            ? now - o.hungry.since > F.waitMinutes * 60_000
            : o.foundAt
              ? now - o.foundAt > linger
              : now - o.since > linger * 2
        )
          this.goHome(q, o);
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
        dates: this.save.dates[q],
      },
      Math.random,
      "lines",
      [
        ...(this.save.devotion[q] < 10 ? ["passes"] : []),
        ...(this.save.stats.bestStreak < 3 ? ["streak"] : []),
        ...(this.save.dates[q] < 1 ? ["dates"] : []),
      ],
    );
    sfx.bless();
    const spec = C.queens[q];
    if (text)
      this.speakLine({
        speaker: spec.name,
        text: this.voiced(q, text),
        color: spec.color,
        queen: q,
      });
    // A while with you, and she will want feeding.
    o.hungerAt = F.enabled && !o.fed ? now + F.afterSeconds * 1000 : 0;
    this.see(q);
    this.pushView(true);
  }

  /** Time to go: happy if you spent time with her, hurt if she found you and you ignored her. */
  private goHome(q: QueenKey, o: Outing) {
    o.home = true;
    const [hc, hr] = o.homeAt;
    const target = walkable(this.world, hc, hr)
      ? ([hc, hr] as Spot)
      : nearestWalkable(this.world, [hc, hr]);
    o.path = (target && pathTo(this.world, [Math.round(o.x), Math.round(o.y)], target)) || [];
    if (!o.foundAt) return;
    const now = Date.now();
    const spec = C.queens[q];
    // Left hungry, she is hurt however you spent the time.
    const starved = o.hungry !== null;
    const happy = o.met && !starved;
    o.hungry = null;
    setArc(this.save, q, happy ? "satisfied" : "distant", now);
    const line = starved
      ? feedLine(q, "hungry", Math.random, this.voiceFill(q))
      : presenceLine(happy ? "leaveHappy" : "leaveHurt", {}, Math.random);
    if (line)
      this.speakLine({
        speaker: spec.name,
        text: starved ? line : this.voiced(q, line),
        color: spec.color,
        queen: q,
      });
    const notice = starved
      ? `${spec.name} went home hungry. Feed her next time she walks with you.`
      : presenceLine(
          happy ? "leftHappy" : "leftHurt",
          { queen: spec.name },
          Math.random,
          "notices",
        );
    if (notice) this.notice(notice, q);
    this.persist();
    this.pushView(true);
  }

  /** She wants feeding: a set of reps of one of your Reps phrases. */
  private getHungry(q: QueenKey, o: Outing) {
    o.hungerAt = 0;
    const reps = readReps();
    const item = pickBonus(reps, Math.random, F.maxWords);
    const spec = C.queens[q];
    if (!item) {
      // Nothing to feed her with yet: she says where to find some.
      this.speakLine({
        speaker: spec.name,
        text: this.voiced(
          q,
          "Put some words in your Reps, in the Recitation drill. Then you can feed me.",
        ),
        color: spec.color,
        queen: q,
      });
      return this.pushView(true);
    }
    const now = Date.now();
    // Now and then she asks for a prayer instead: a timed set, repeating nonstop.
    const kind = Math.random() < F.prayChance ? "pray" : "feed";
    const minutes = Math.max(1, Math.round(F.prayMinutes));
    o.hungry = {
      kind,
      id: item.id,
      text: item.text,
      size: reps.set,
      minutes,
      since: now,
      hiddenUntil: 0,
    };
    sfx.ready();
    this.feel(q, "longing");
    this.speakLine({
      speaker: spec.name,
      text: feedLine(q, kind, Math.random, {
        ...this.voiceFill(q),
        count: reps.set,
        minutes,
        phrase: item.text,
      }),
      color: spec.color,
      queen: q,
    });
    this.notice(
      kind === "pray"
        ? `${spec.name} asks for a prayer: ${minutes} min of “${item.text}”`
        : `${spec.name} is hungry: feed her ${reps.set} × “${item.text}”`,
      q,
    );
    this.pushView(true);
  }

  /** The hungry queen to show, if any (not one whose ask you put off for now). */
  private hungryView(): CourtView["hungry"] {
    const now = Date.now();
    const asking = [...this.out].filter(
      ([, o]) => o.hungry && !o.home && o.hungry.hiddenUntil <= now,
    );
    const first = asking[0]?.[1].hungry;
    if (!first) return null;
    // Those who want the same (feeding, or a prayer) are seen to together.
    const all = asking.filter(([, o]) => o.hungry!.kind === first.kind);
    return {
      queen: all[0]![0],
      queens: all.map(([k]) => k),
      kind: first.kind,
      id: first.id,
      text: first.text,
      size: first.size,
      minutes: first.minutes,
      until: Math.min(...all.map(([, x]) => x.hungry!.since)) + F.waitMinutes * 60_000,
    };
  }

  /** Later: the hungry queens' asks go out of sight for a while (they still wait). */
  courtFeedLater() {
    const until = Date.now() + F.snoozeSeconds * 1000;
    for (const o of this.out.values()) if (o.hungry) o.hungry.hiddenUntil = until;
    this.pushView(true);
  }

  /** A feeding set was stopped without Done: they wait again from now. */
  courtFeedStop() {
    for (const o of this.out.values()) if (o.hungry) o.hungry.since = Date.now();
    this.pushView(true);
  }

  /**
   * Fed (a set of reps) or prayed for (a timed set): done for her on the rest
   * screen, or a Court bonus set she watched. She is delighted, warmer, and
   * stays with you a while longer. `share` is the part of the affection she
   * gets (less when she did not ask).
   */
  private devoted(q: QueenKey, kind: "feed" | "pray", what: string, share = 1) {
    const o = this.out.get(q);
    const spec = C.queens[q];
    const now = Date.now();
    if (o) {
      o.hungry = null;
      o.fed = true;
      o.met = true;
      o.home = false;
      if (o.foundAt) o.foundAt = now;
    }
    if (share > 0) {
      const value = this.addAffection(q, F.affection * share * jealousMult(this.save, q), false);
      this.drop(`+${value} ♥ ${spec.name}`, spec.color);
    }
    this.save.lastSeen[q] = now;
    this.feel(q, "delighted");
    this.see(q);
    sfx.bless();
    this.speakLine({
      speaker: spec.name,
      text: this.voiced(
        q,
        feedLine(q, kind === "pray" ? "prayed" : "fed", Math.random, this.voiceFill(q)),
      ),
      color: spec.color,
      queen: q,
    });
    this.notice(what, q);
    this.persist();
    this.pushView(true);
  }

  courtFed(q: QueenKey, text: string, reps: number) {
    this.devoted(q, "feed", `You fed ${C.queens[q].name} ${reps.toLocaleString("en")} × “${text}”`);
  }

  courtPrayed(q: QueenKey, text: string, ms: number) {
    const min = Math.max(1, Math.round(ms / 60_000));
    this.devoted(q, "pray", `You prayed ${min} min of “${text}” for ${C.queens[q].name}`);
  }

  /**
   * Feed her or Pray for her, from her sheet, whenever you like. If she asked
   * for it, it is what she wanted; unasked, it pleases her less, and only
   * court.presence.feed.perDay times a day count.
   */
  courtOffer(q: QueenKey, kind: "feed" | "pray", text: string, reps: number, ms: number) {
    if (this.out.get(q)?.hungry) {
      if (kind === "pray") this.courtPrayed(q, text, ms);
      else this.courtFed(q, text, reps);
      return;
    }
    const key = `${dayOf(Date.now())}|${q}`;
    const n = this.offered.get(key) ?? 0;
    this.offered.set(key, n + 1);
    const share = n < F.perDay ? F.unaskedMult : 0;
    const name = C.queens[q].name;
    const what =
      kind === "pray"
        ? `You prayed ${Math.max(1, Math.round(ms / 60_000))} min of “${text}” for ${name}`
        : `You fed ${name} ${reps.toLocaleString("en")} × “${text}”`;
    this.devoted(q, kind, share > 0 ? what : `${what} (she has had plenty today)`, share);
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
    const here = this.onMap();
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
    const pair = allianceOf(day);
    const partner = pair?.includes(q) ? pair.find((p) => p !== q) : undefined;
    if (partner)
      this.notice(
        `${C.queens[q].name} and ${C.queens[partner].name} share one wish today: ${w.passes} passes of ${skillName(w.skill)} grants it to both`,
        q,
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
    if (panel?.kind !== "talk") this.talk = null;
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

/**
   * Her hello when you walk up to her (shown on her sheet): how she missed you,
   * that she is jealous, today's wish, a word about a sister, friend or rival,
   * or a plain greeting. The conversation itself is the talk screen (courtTalk).
   */
  courtGreet(q: QueenKey) {
    this.touch(q);
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
    // Sometimes she talks about a sister, a friend or a rival instead.
    const talk =
      tierOf(this.save.affection[q]).index >= 1 && Math.random() < N.talkChance
        ? bondTalk(q, Math.random)
        : null;
    if (talk) {
      const spec = C.queens[q];
      this.speakLine({
        speaker: spec.name,
        text: this.voiced(q, talk.text),
        color: spec.color,
        queen: q,
      });
      this.see(q);
      this.pushView(true);
      return;
    }
    this.queenSays(
      q,
      "greet",
      {},
      `The player walks up to you. You are at tier ${tierOf(this.save.affection[q]).name}.`,
    );
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

  /**
   * The next phrase to recite: one at random of those of your texts that have not
   * come yet, so none comes twice until all have (then the deck starts again).
   */
  private nextPhrase(finished?: string): string {
    // The phrase just recited through counts first (and may finish its text).
    if (finished) this.phraseDone(finished);
    const library = rehearseLibrary();
    const source = chosenText(library, this.save.source)?.key ?? "";
    const { units } = deckUnits(this.bag, source);
    // With every text mixed, phrases of texts no longer loaded are forgotten (one text keeps the rest's).
    if (!source) {
      const all = new Set<string>();
      for (const t of deckOf(this.bag).texts) for (const h of t.hashes) all.add(h);
      let gone = false;
      for (const h of this.bag) if (!all.has(h)) gone = this.bag.delete(h) || gone;
      if (gone) deck = null;
    }
    // At random among those not recited through yet (never one that just came, while another is left).
    const phrase = pickFresh(units, this.bag, Math.random, this.recent);
    if (!phrase) return pickPhrase(library.map((t) => t.lines), Math.random);
    this.recent = [...this.recent, phrase].slice(-3);
    return phrase;
  }

  /**
   * A phrase recited all through (every pass): counted towards every text it is
   * in. A text with every phrase done is recited through: checked as read through
   * (✓ in the Read tab, its confirmed copy saved, as Rehearse does), counted in
   * its rounds, and cleared so a fresh round of it begins.
   */
  private phraseDone(phrase: string) {
    const d = deckOf(this.bag);
    const finished = reciteDone(d.texts, this.bag, phrase);
    for (const t of finished) {
      checkText(t.key, "recited through", false);
      this.save.textRounds[t.key] = Math.min(1_000_000, (this.save.textRounds[t.key] ?? 0) + 1);
      // A whole text is worth a bottle of crystal wine (not a tiny one, and never more than the bag holds).
      let wine = "";
      if (t.hashes.size >= C.wine.minPhrases) {
        if (this.save.wine < C.wine.max) {
          this.save.wine += 1;
          wine = ` 🍷 +1 crystal wine (×${this.save.wine}) to pour in a talk or on a date night.`;
        } else wine = ` 🍷 Your bag holds all ${C.wine.max} bottles it can: pour one for a queen.`;
      }
      this.notice(
        `“${t.name}” recited through, all ${t.hashes.size.toLocaleString("en")} phrases: checked ✓ A fresh round of it begins.${wine}`,
        null,
      );
      sfx.bless();
    }
    saveBag(this.bag);
    if (finished.length) this.persist();
  }

  /** Starts a text again from nothing: its phrases all count as not recited yet. ("" for every text.) */
  courtFresh(key: string) {
    const d = deckOf(this.bag);
    const cleared = key ? d.texts.filter((t) => t.key === key) : d.texts;
    if (!cleared.length) return;
    clearTexts(d.texts, this.bag, cleared);
    saveBag(this.bag);
    this.recent = [];
    this.message = key
      ? `“${cleared[0]!.name}” starts again from the first phrase counted.`
      : "Every text starts again.";
    this.pushView(true);
  }

  /** The recite's text and how far through it you are, for the screen: the chosen text, or all of them. */
  private deckView(): CourtView["deck"] {
    const d = deckOf(this.bag);
    const library = rehearseLibrary();
    const one = chosenText(library, this.save.source) ?? wholeText(library, this.save.source);
    const t = one ? d.texts.find((x) => x.key === one.key) : undefined;
    if (t) {
      const total = t.hashes.size;
      return {
        done: t.done,
        total,
        percent: percentOf(t.done, total),
        name: t.name,
        rounds: this.save.textRounds[t.key] ?? 0,
      };
    }
    let done = 0;
    let total = 0;
    for (const x of d.texts) {
      done += x.done;
      total += x.hashes.size;
    }
    return { done, total, percent: percentOf(done, total), name: "all texts", rounds: 0 };
  }

  /** Each text to choose from, with how far through it you are. */
  private sourcesView(): CourtView["sources"] {
    const d = deckOf(this.bag);
    const all = this.deckAll(d.texts);
    const out: CourtView["sources"] = [
      { key: "", label: `All ${d.texts.length} texts`, done: all.done, total: all.total, rounds: 0 },
    ];
    const library = rehearseLibrary();
    for (const t of d.texts) {
      const lib = library.find((x) => x.key === t.key);
      out.push({
        key: t.key,
        label: lib ? labelOf(lib) : t.name,
        done: t.done,
        total: t.hashes.size,
        rounds: this.save.textRounds[t.key] ?? 0,
      });
    }
    return out;
  }

  private deckAll(texts: DeckText[]) {
    let done = 0;
    let total = 0;
    for (const x of texts) {
      done += x.done;
      total += x.hashes.size;
    }
    return { done, total };
  }

  /** Recite at a place. A queen who stands there watches, if you meet her need. */
  courtRecite(
    place: PlaceKey,
    opts: { queen?: QueenKey | null; date?: boolean; wine?: boolean; toast?: boolean } = {},
  ) {
    sfx.unlock();
    const date = opts.date === true;
    const toast = !date && opts.toast === true;
    // A queen who has found you and walks with you watches wherever you recite.
    const q = opts.queen !== undefined ? opts.queen : (queenAt(place) ?? this.withYou());
    const watching = q && meetsNeed(q, this.save.skills) ? q : null;
    if (watching) this.touch(watching);
    // A second queen walking with you watches too (not on a date).
    this.alsoWatching = date
      ? null
      : (this.withMe().find((k) => k !== watching && meetsNeed(k, this.save.skills)) ?? null);
    if (this.alsoWatching) this.touch(this.alsoWatching);
    const skill =
      date && watching
        ? this.dateSkill(watching)
        : (skillAt(place, this.save.stance) ?? (toast && watching ? this.dateSkill(watching) : null));
    if (!skill) return;
    this.panel = null;
    this.talk = null;
    // A line being said aloud gives way to the phrase, whose sound starts by itself.
    if (this.save.sound.phrase) courtHush();
    this.soundMuted = false;
    this.recent = [];
    this.session = startSession(
      {
        place,
        skill,
        queen: watching,
        date,
        wine: date && opts.wine === true,
        toast,
        wordMs: this.save.wordMs,
        reps: this.save.repsPerPhrase,
        // A date is its own round of phrases, and so is a sip of wine.
        round: toast
          ? C.wine.sipPhrases
          : date && watching
            ? C.datePhrases
            : this.save.phrasesPerRound,
      },
      this.nextPhrase(),
      performance.now(),
    );
    this.dateTold = [];
    if (watching) {
      this.save.lastSeen[watching] = Date.now();
      if (toast) {
        /* The question you asked is what she has to say. */
      } else if (!date && this.save.jealous[watching] > 0)
        this.queenSays(watching, "jealous", { rival: this.rivalName(watching) });
      else this.queenSays(watching, date ? "dateStart" : "watch");
    } else this.line = null;
    this.message =
      "Read along as the words light up. When they finish, tap to complete the pass and go on.";
    this.pushView(true);
  }

  /** A date; with `wine`, a date night: a bottle of crystal wine is poured for the evening, so its affection counts more. */
  courtDate(q: QueenKey, wine = false) {
    const tier = tierOf(this.save.affection[q]).index;
    if (tier < C.dateTier) {
      this.message = `${C.queens[q].name} is not ready for a date. Win her over to ${C.affectionTiers[C.dateTier]?.name} first.`;
      return this.pushView(true);
    }
    if (wine && this.save.wine < 1) {
      this.message = "You have no crystal wine: recite a whole text through to earn a bottle.";
      return this.pushView(true);
    }
    this.courtRecite(C.queens[q].place as PlaceKey, { queen: q, date: true, wine });
    // The bottle is poured once the date has begun (a date that could not start keeps it).
    if (wine && this.session?.wine) {
      this.save.wine = Math.max(0, this.save.wine - 1);
      this.save.wineShared[q] += 1;
      this.persist();
      this.pushView(true);
    }
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
    if (this.save.sound.phrase) courtTapSound(s.phrase);
    const finishing = s.phrase;
    for (const r of tapComplete(s, now, (done) => this.nextPhrase(done), elixir)) {
      if (r.type === "pass") this.onPass(s, r, elixir);
      else if (r.type === "phrase") {
        // The round's last phrase has no next one drawn: it is counted here (a phrase counted already is not again).
        if (s.roundDone) this.phraseDone(finishing);
        this.save.skills[s.skill] += r.xp;
        this.drop(`+${Math.round(r.xp)} phrase bonus`, PAL.gold);
        // A whole phrase for a jealous queen softens her.
        const q = s.queen;
        if (q && this.save.jealous[q] > 0 && !this.makeUp(q, false))
          this.notice(`${C.queens[q].name} softens a little`, q);
        // On a date night she opens up between the phrases.
        if (q && s.wine && s.date) this.openUp(q);
      } else if (r.type === "round") {
        sfx.bless();
        this.persist();
      } else if (r.type === "end" && s.queen) {
        this.save.dates[s.queen] += 1;
        this.addAffection(s.queen, dateBonus(s.wine), true);
        this.queenSays(
          s.queen,
          "dateEnd",
          {},
          `Your date with the player just ended beautifully${s.wine ? ", over a bottle of crystal wine" : ""}.`,
        );
        this.endSession();
      }
    }
    // A deeper question over the wine: its phrase is recited through, so the talk comes back with her answer.
    if (s.toast && s.roundDone && this.session === s) this.endSession();
    this.pushView(true);
  }

  /** After a complete round: another, of the round size set now. */
  courtNextRound() {
    const s = this.session;
    if (!s?.roundDone) return;
    sfx.unlock();
    nextRound(s, this.now(), this.nextPhrase(), this.save.phrasesPerRound);
    this.pushView(true);
  }

  /**
   * A bonus set from Reps, done after a round (+1): it pays in the round's skill
   * as that many passes of its phrase, with gold, and pleases a queen who
   * watches. What it paid, for the round's summary.
   */
  courtBonus(text: string, reps: number, ms = 0): { xp: number; gold: number } | null {
    const s = this.session;
    if (!s || !C.bonus.enabled) return null;
    const r = bonusReward(text, reps, s.place, s.queen !== null);
    const save = this.save;
    const before = skillLevel(save.skills[s.skill]);
    save.skills[s.skill] += r.xp;
    save.gold += r.gold;
    s.totals.xp += r.xp;
    s.totals.gold += r.gold;
    s.roundTotals.xp += r.xp;
    s.roundTotals.gold += r.gold;
    sfx.bless();
    const color = STANCE_COLOR[C.skills[s.skill].element === "water" ? "water" : "fire"];
    this.drop(`+${Math.round(r.xp)} ${skillName(s.skill)} XP · bonus`, color);
    if (r.gold > 0) this.drop(`+${r.gold} gold`, PAL.gold);
    if (s.queen && r.affection > 0) {
      this.addAffection(s.queen, r.affection * jealousMult(save, s.queen), true);
      save.lastSeen[s.queen] = Date.now();
      this.notice(`${C.queens[s.queen].name} watched your ${reps} reps of “${text}”`, s.queen);
    }
    // Queens who watched it and wanted feeding or a prayer have it.
    for (const w of [s.queen, this.alsoWatching]) {
      const want = w ? this.out.get(w)?.hungry : null;
      if (!w || !want) continue;
      if (want.kind === "pray") this.courtPrayed(w, text, ms || reps * 2000);
      else this.courtFed(w, text, reps);
    }
    const after = skillLevel(save.skills[s.skill]);
    if (after > before) this.levelUp(s.skill, after);
    this.persist();
    this.pushView(true);
    return { xp: r.xp, gold: r.gold };
  }

  /** More or fewer phrases in a round (1 to 10). */
  courtRound(dir: number) {
    this.save.phrasesPerRound = Math.min(10, Math.max(1, this.save.phrasesPerRound + dir));
    const s = this.session;
    if (s && !s.date && !s.toast && !s.roundDone)
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
    // A second queen watching adds a little more.
    const also = this.alsoWatching;
    const extra = also ? r.xp * G.secondWatcherXp : 0;
    s.totals.xp += extra;
    s.roundTotals.xp += extra;
    save.skills[s.skill] += r.xp + extra;
    save.gold += r.gold;
    save.stats.reps += 1;
    save.stats.bestStreak = Math.max(save.stats.bestStreak, r.streak);
    if (elixir) save.elixirReps -= 1;
    const color = STANCE_COLOR[C.skills[s.skill].element === "water" ? "water" : "fire"];
    this.drop(`+${Math.round(r.xp + extra)} ${skillName(s.skill)} XP`, color);
    if (also) {
      this.addAffection(
        also,
        affectionGain(s.words.length, also, save.stance, r.streak, false) * jealousMult(save, also),
        true,
      );
      save.lastSeen[also] = Date.now();
      this.see(also);
    }
    if (r.gold > 0) this.drop(`+${r.gold} gold`, PAL.gold);
    if (s.queen) {
      const q = s.queen;
      // Less while she is jealous.
      this.addAffection(
        q,
        affectionGain(s.words.length, q, save.stance, r.streak, s.date, s.wine) * jealousMult(save, q),
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
        // Streak lines rise in three steps (3, 5, 10 in a row): a third of the list each.
        const list = queenLines(s.queen, "streak");
        const step = Math.max(1, Math.floor(list.length / 3));
        const from = Math.min(at * step, Math.max(0, list.length - 1));
        const part = list.slice(from, at === 2 ? list.length : from + step);
        const spec = C.queens[s.queen];
        this.speakLine({
          speaker: spec.name,
          text: this.voiced(s.queen, part[Math.floor(Math.random() * part.length)] ?? ""),
          color: spec.color,
          queen: s.queen,
        });
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
    // An alliance's shared wish, granted to both at once: both are delighted, and say so.
    const pair = allianceOf(dayOf(Date.now()));
    if (pair && pair.every((p) => granted.includes(p))) {
      for (const p of pair) this.addAffection(p, H.allianceBonus, true);
      const bond = bondOf(pair[0], pair[1]);
      const text = presenceLine(
        "alliance",
        {
          queen: C.queens[pair[0]].name,
          other: C.queens[pair[1]].name,
          bond: bond ? BOND_NAME[bond] : "friend",
        },
        Math.random,
        "notices",
      );
      if (text) this.notice(`${text} (+${H.allianceBonus} ♥ each)`, pair[0]);
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
    skipPhrase(s, this.now(), this.nextPhrase());
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
    this.alsoWatching = null;
    this.save.stats.phrases += s.phrases;
    if (s.totals.reps > 0) {
      this.message = `Session: +${Math.round(s.totals.xp).toLocaleString()} ${skillName(s.skill)} XP, +${s.totals.gold} gold, ${s.totals.reps} reps.`;
    }
    this.persist();
    // A question asked over the wine goes back to the talk: answered once its phrase was recited through, else still waiting.
    if (s.toast) this.toastBack(s.roundDone);
  }

  /** The talk a recite took the screen from comes back: with her answer, or with the question still waiting. */
  private toastBack(answered: boolean) {
    const t = this.toast;
    this.toast = null;
    if (!t) return;
    this.talk = t.talk;
    this.panel = { kind: "talk", queen: t.talk.t.queen };
    this.line = null;
    this.lineQueue = [];
    if (answered) this.courtAnswer(t.choice);
    else if (t.asked) t.talk.log = t.talk.log.filter((e) => e !== t.asked);
  }

  /** On a date night she opens up between the phrases: something deeper, in her own voice (and in her own words, with a model connected). */
  private openUp(q: QueenKey) {
    const text = opensUp(q, this.dateTold, this.talkContext(q), Math.random);
    if (!text) return;
    const spec = C.queens[q];
    this.remember(q, text);
    this.speakLine({ speaker: spec.name, text, color: spec.color, queen: q });
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
    this.talk = null;
    this.visiting = null;
    const queen = this.onMap().find((q) => {
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
      else if (this.talk) return this.courtTalkEnd();
      else this.panel = null;
      this.pushView(true);
    } else if (!this.session && e.key.toLowerCase() === "x") this.courtStance();
  };

  // ---- Frame loop ----

  /** Session time: it stands still while the game is held. */
  private now(): number {
    return this.pausedAt ?? performance.now();
  }

  /** A rep set's rest ended: draw again. */
  private wake = () => {
    if (this.running && !this.raf) this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (t: number) => {
    if (!this.running) return;
    // While a rep set runs, nothing is drawn: the loop sleeps until it ends.
    if (resting()) {
      this.raf = 0;
      return sleepFrames(this.wake);
    }
    this.raf = requestAnimationFrame(this.frame);
    const { fpsCap, renderScale } = useGame.getState().settings;
    // While you recite, the map is covered: a few updates a second are plenty.
    const cap =
      this.session && C.word.sessionFps > 0
        ? Math.min(fpsCap > 0 ? fpsCap : 120, C.word.sessionFps)
        : fpsCap;
    if (!this.limiter.ready(t, cap)) return;
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
    const held = paused || tomeOpen || menu || this.away;
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
        this.life(dt);
      }
    }
    this.syncSound(held || phase !== "battle");
    // Her face while she watches you recite goes into the gallery.
    if (this.session?.queen) this.see(this.session.queen);
    const nowMs = performance.now();
    this.drops = this.drops.filter((d) => nowMs - d.born < N.dropMs);
    this.notices = this.notices.filter((n) => nowMs - n.born < N.noticeSeconds * 1000);
    this.showNotices();
    // Time reciting or resting does not count against the queens with you.
    const wall = Date.now();
    const rested = restedTotal();
    const restGap = rested - this.restedSeen;
    this.restedSeen = rested;
    const wallGap = this.wallAt ? wall - this.wallAt : 0;
    this.wallAt = wall;
    this.holdOutings(this.session ? wallGap : restGap);
    if (this.nextLine()) this.pushView(true);
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
    const hungry = this.hungryView();
    const talk = this.panel?.kind === "talk" ? this.talk : null;
    const talking = talk
      ? `${talk.t.queen}|${talk.log.length}|${talk.log[talk.log.length - 1]?.id ?? 0}|${talk.waiting.length}|${talk.choices.map((c) => c.id).join()}|${talk.ended}`
      : "";
    const lifeNote = this.panel?.kind === "queen" ? this.lifeNote(this.panel.queen) : "";
    const sig = `${this.soundMuted}|${lifeNote}|${this.drops.length}|${this.drops[0]?.id ?? 0}|${this.notices.length}|${this.notices[0]?.id ?? 0}|${moods}|${feelings}|${out}|${this.message}|${this.line?.text ?? ""}|${this.lineQueue.length}|${talking}|${reading}|${hungry?.queens.join() ?? ""}`;
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
        also: this.alsoWatching,
        date: s.date,
        wine: s.wine,
        toast: s.toast,
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
        hungry,
        deck: this.deckView(),
        sources: this.sourcesView(),
        line: this.line,
        lineMore: this.lineQueue.length,
        away: this.away,
        soundMuted: this.soundMuted,
        lifeNote,
        talk: talk
          ? {
              queen: talk.t.queen,
              log: talk.log.map((e) => ({ ...e })),
              waiting: talk.waiting.length,
              choices: talk.choices.map((c) => ({
                id: c.id,
                kind: c.kind,
                text: c.text,
                tone: c.tone,
                taste: c.tone ? knownTaste(this.save, talk.t.queen, c.tone) : null,
              })),
              ended: talk.ended,
              wine: talk.t.wine,
              left: talksLeft(this.save, talk.t.queen, day),
              perDay: Math.floor(C.talk.perDay),
              locked: talk.locked,
            }
          : null,
        at: this.at,
        region: this.save.region,
        message: this.message,
        moods: Object.fromEntries(
          QUEEN_KEYS.map((q) => [q, this.moodNow(q)]),
        ) as CourtView["moods"],
        rivals: Object.fromEntries(this.rivals),
        wishes: Object.fromEntries(
          QUEEN_KEYS.map((q) => {
            const alliance = allianceOf(day);
            const w = wishOf(q, day);
            return [
              q,
              {
                skill: w.skill,
                passes: w.passes,
                progress: Math.min(w.passes, this.save.wishes.progress[q]),
                done: this.save.wishes.done[q],
                with: alliance?.includes(q) ? alliance.find((p) => p !== q) : undefined,
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
    const far = Math.max(8, Math.min(box.w / this.world.cols, box.h / rows));
    // Near: the map larger, you in the middle of it (never past its edges).
    const cell = this.save.near ? far * C.view.nearZoom : far;
    this.cell = cell;
    const mapW = this.world.cols * cell;
    const mapH = rows * cell;
    const fit = (start: number, room: number, size: number, at: number) =>
      size <= room
        ? start + (room - size) / 2
        : Math.min(start, Math.max(start + room - size, start + room / 2 - at));
    this.ox = Math.round(fit(box.x, box.w, mapW, (this.pos.x + 0.5) * cell));
    this.oy = Math.round(
      fit(box.y, box.h, mapH, (this.pos.y + 0.5 + HEADROOM) * cell) + HEADROOM * cell,
    );
    this.field = box;
  }

  /** Where the map may be drawn (between the bars); near, it is cut off there. */
  private field = { x: 0, y: 0, w: 0, h: 0 };

  /** Near or far: the map larger and following you, or the whole region at once. */
  courtNear() {
    this.save.near = !this.save.near;
    this.boardKey = "";
    this.bitmaps.clear();
    this.message = this.save.near
      ? "Near: the map follows you. Far shows the whole region."
      : "Far: the whole region at once.";
    this.persist();
    this.pushView(true);
  }

  /** People's whole figures, painted once at the size they are drawn (the picture itself is slow to draw each frame). */
  private figures = new Map<string, HTMLImageElement>();

  private figure(url: string, h: number): CanvasImageSource | null {
    if (this.looksSeen !== looksRev()) {
      this.looksSeen = looksRev();
      this.portraits.clear();
      this.bitmaps.clear();
      this.figures.clear();
    }
    let img = this.figures.get(url);
    if (!img) {
      // Not too many kept: moods and steps come and go.
      if (this.figures.size > 80) this.figures.clear();
      img = new Image();
      img.src = url;
      this.figures.set(url, img);
    }
    if (!img.complete || img.naturalWidth <= 0) return null;
    const px = Math.max(24, Math.ceil(h * this.backdrop.dpr));
    const key = `fig|${url.length}|${url.slice(-48)}|${px}`;
    let bmp = this.bitmaps.get(key);
    if (!bmp) {
      bmp = document.createElement("canvas");
      bmp.height = px;
      bmp.width = Math.ceil((px * FIGURE_W) / FIGURE_H);
      bmp.getContext("2d")?.drawImage(img, 0, 0, bmp.width, bmp.height);
      this.bitmaps.set(key, bmp);
    }
    return bmp;
  }

  /** A whole figure standing with its feet at (x, ground); false while its picture is not ready. */
  private drawFigure(ctx: CanvasRenderingContext2D, url: string, x: number, ground: number): boolean {
    const h = this.cell * C.view.figure;
    const bmp = this.figure(url, h);
    if (!bmp) return false;
    const w = (h * FIGURE_W) / FIGURE_H;
    // The picture's floor is a little above its bottom edge.
    ctx.drawImage(bmp, x - w / 2, ground - h * 0.982, w, h);
    return true;
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
    // Near, the map is larger than its place: nothing of it shows under the bars.
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.field.x, this.field.y, this.field.w, this.field.h);
    ctx.clip();
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
    // Whoever stands further down the map is drawn over whoever stands behind.
    this.drawQueens(ctx);
    this.drawPlayer(ctx);
    ctx.restore();
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
    const inside = above - size < top || this.save.near;
    ctx.font = `700 ${size}px ${DISPLAY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const x = this.save.near ? this.field.x + 6 : this.ox + (inside ? 6 : 2);
    const y = this.save.near
      ? this.field.y + size + 6
      : inside
        ? this.oy + this.world.rows * this.cell - 5
        : above;
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
    const here = queensIn(this.save.region);
    for (const q of this.onMap()) {
      const spec = C.queens[q];
      const o = this.out.get(q);
      // Where she usually stands, if she lives on this map.
      const about = o ? undefined : this.roam.get(q);
      const [homeC, homeR] = spec.at as Spot;
      const gone = !!about && Math.hypot(about.x - homeC, about.y - homeR) > 0.6;
      if ((o || gone) && here.includes(q)) {
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
      const c = o ? o.x : about ? about.x : homeC;
      const r = o ? o.y : about ? about.y : homeR;
      const moving = !!o || !!about?.path.length;
      const bob = this.reduce ? 0 : Math.sin(this.time * (moving ? 6 : 2) + c) * s * 0.05;
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
      // Her whole figure, standing there, her face in a small round frame above it.
      const walking = moving && !this.reduce;
      const step = walking ? (Math.sin(this.time * 9 + c) > 0 ? 1 : -1) : 0;
      const stands = this.drawFigure(ctx, queenFigure(q, { mood: this.moodNow(q), step }), x, gy + bob);
      const pr = stands ? s * 0.36 : s * 0.62;
      const py = stands ? gy - s * (C.view.figure + 0.3) + bob : y;
      const img = this.portrait(q, pr * 2);
      if (img) {
        ctx.drawImage(img, x - pr, py - pr, pr * 2, pr * 2);
      } else {
        // Until her portrait has loaded, a crown.
        ctx.font = `${Math.round(s * 0.8)}px ${PIECE_FONT}`;
        ctx.fillStyle = spec.color;
        ctx.fillText(`♛${TEXT_VS}`, x, y);
      }
      // What she is about, as a small mark beside her face.
      const sign = about ? mark(about.plan) : "";
      if (sign && gone) {
        ctx.font = `${Math.max(9, Math.round(s * 0.42))}px ${FONT}`;
        ctx.fillText(sign, x + pr + s * 0.3, py);
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
    // A look changed in the Atelier: every picture made before is of the old one.
    if (this.looksSeen !== looksRev()) {
      this.looksSeen = looksRev();
      this.portraits.clear();
      this.bitmaps.clear();
    }
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

  /**
   * You, as your look in the Atelier has you: a cape in your style's colour, a
   * robe in your look's, and either a hood with your eyes glowing under it or
   * your own head (skin, hair, horns); broader with broader shoulders; your
   * name above. Stepping while you walk.
   */
  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const look = youLook();
    const hooded = look.headpiece === "hood";
    // Broader or narrower with your shoulders' slider.
    const wide = 1 + Math.max(-1, Math.min(1, look.shape?.shoulders ?? 0)) * 0.22;
    const s = this.cell;
    const x = this.ox + (this.pos.x + 0.5) * s;
    const y = this.oy + (this.pos.y + 0.5) * s;
    const color = STANCE_COLOR[this.save.stance];
    const walking = this.path.length > 0 && !this.reduce;
    const step = walking ? Math.sin(this.time * 11) : 0;
    // Your whole figure, as the Atelier has you; the small hooded one below only till its picture is ready.
    {
      const fy = y + s * 0.42;
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.ellipse(x, fy, s * 0.42, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      const gr0 = s * 0.9;
      ctx.drawImage(this.glowOf(STANCE_COLOR[this.save.stance], "55"), x - gr0, fy - gr0 * 1.6, gr0 * 2, gr0 * 2);
      const frame = walking ? (step > 0 ? 1 : -1) : 0;
      if (this.drawFigure(ctx, youFigure({ step: frame }), x, fy - Math.abs(step) * s * 0.03)) {
        const above = fy - s * (C.view.figure + 0.12);
        ctx.font = `700 ${Math.max(7, Math.round(s * 0.24))}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(2, 0, 5, 0.85)";
        ctx.strokeText(youName(), x, above);
        ctx.fillStyle = STANCE_COLOR[this.save.stance];
        ctx.fillText(youName(), x, above);
        return;
      }
    }
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
    ctx.moveTo(x - u * 1.6 * wide, top - u * 1.2);
    ctx.quadraticCurveTo(
      x - u * 3 * wide - step * u * 0.6,
      top + u * 1.6,
      x - u * 2.4 * wide - step * u,
      top + u * 3.4,
    );
    ctx.lineTo(x + u * 2.4 * wide - step * u, top + u * 3.4);
    ctx.quadraticCurveTo(
      x + u * 3 * wide - step * u * 0.6,
      top + u * 1.6,
      x + u * 1.6 * wide,
      top - u * 1.2,
    );
    ctx.closePath();
    ctx.fill();
    // Long hair falls behind your shoulders, when your head is bare.
    const hair = shade(look.hair || "#2b1a14", -0.1);
    if (!hooded && look.hairStyle !== "short" && look.hairStyle !== "bun") {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.moveTo(x - u * 1.25, top - u * 2.6);
      ctx.quadraticCurveTo(x - u * 1.9, top + u * 0.2, x - u * 1.3, top + u * 1.5);
      ctx.lineTo(x + u * 1.3, top + u * 1.5);
      ctx.quadraticCurveTo(x + u * 1.9, top + u * 0.2, x + u * 1.25, top - u * 2.6);
      ctx.closePath();
      ctx.fill();
    }
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
    ctx.fillStyle = shade(look.accent || "#5cc8ff", -0.74);
    ctx.beginPath();
    ctx.moveTo(x - u * 1.3 * wide, top - u * 1);
    ctx.lineTo(x + u * 1.3 * wide, top - u * 1);
    ctx.lineTo(x + u * 1.8 * wide, top + u * 2.6);
    ctx.lineTo(x - u * 1.8 * wide, top + u * 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.8, u * 0.3);
    ctx.beginPath();
    ctx.moveTo(x, top - u * 0.8);
    ctx.lineTo(x, top + u * 2.5);
    ctx.moveTo(x - u * 1.7 * wide, top + u * 2.4);
    ctx.lineTo(x + u * 1.7 * wide, top + u * 2.4);
    ctx.stroke();
    const eyes = look.eyes || "#7fd4ff";
    if (hooded) {
      // The hood, a dark face and your eyes glowing in it.
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
      ctx.fillStyle = shade(eyes, 0.4);
      ctx.fillRect(x - u * 0.6, top - u * 2.2, u * 0.4, u * 0.25);
      ctx.fillRect(x + u * 0.2, top - u * 2.2, u * 0.4, u * 0.25);
    } else {
      // Your own head: horns, a face in your skin, your hair over it, your eyes.
      if (look.horns) {
        ctx.fillStyle = look.horns;
        for (const sd of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + sd * u * 0.5, top - u * 3);
          ctx.quadraticCurveTo(x + sd * u * 1.5, top - u * 3.6, x + sd * u * 1.9, top - u * 4.6);
          ctx.quadraticCurveTo(x + sd * u * 1.1, top - u * 4, x + sd * u * 0.9, top - u * 2.8);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.fillStyle = look.skin || "#e0ac86";
      ctx.beginPath();
      ctx.ellipse(x, top - u * 2, u * 1.05, u * 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.moveTo(x - u * 1.15, top - u * 1.9);
      ctx.quadraticCurveTo(x - u * 1.3, top - u * 3.6, x, top - u * 3.55);
      ctx.quadraticCurveTo(x + u * 1.3, top - u * 3.6, x + u * 1.15, top - u * 1.9);
      ctx.quadraticCurveTo(x + u * 0.6, top - u * 2.9, x, top - u * 2.75);
      ctx.quadraticCurveTo(x - u * 0.6, top - u * 2.9, x - u * 1.15, top - u * 1.9);
      ctx.closePath();
      ctx.fill();
      if (look.hairStyle === "bun") {
        ctx.beginPath();
        ctx.arc(x, top - u * 3.75, u * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = look.eyeStyle === "glow" ? shade(eyes, 0.4) : "#1a0f14";
      ctx.fillRect(x - u * 0.55, top - u * 2.05, u * 0.32, u * 0.26);
      ctx.fillRect(x + u * 0.23, top - u * 2.05, u * 0.32, u * 0.26);
    }
    // Your name, small, above.
    const name = youName();
    const above = top - u * (look.horns && !hooded ? 5.6 : 5.2);
    ctx.font = `700 ${Math.max(7, Math.round(s * 0.22))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(2, 0, 5, 0.85)";
    ctx.strokeText(name, x, above);
    ctx.fillStyle = color;
    ctx.fillText(name, x, above);
  }
}
