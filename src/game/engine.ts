import { sfx } from "@/game/audio";
import { Backdrop } from "@/game/backdrop";
import { drawCoreImage } from "@/game/coreImage";
import { DEFAULT_CODEX, parseCodex } from "@/game/codex";
import { CONFIG } from "@/game/config";
import { pickCouncilLine, QUEEN } from "@/game/council";
import { FrameLimiter, frameStats, renderDpr } from "@/game/frameLimiter";
import { pickLine, type Mood } from "@/game/dialogue";
import { clampCenter, overlapArea } from "@/game/layout";
import { cancelNarration, narrate } from "@/game/narrator";
import { getGame, setActiveGame, type GameBase } from "@/game/registry";
import { byName, gateOpen, readChunk, wrapped, type Cursor, type PhraseGate } from "@/game/reader";
import { mergeTexts } from "@/game/texts";
import { DISPLAY, FONT, PAL } from "@/game/palette";
import { defaultSettings, useGame, type LoadedText, type Settings } from "@/game/store";
import { coreDamageMultiplier, coreLevel, type SkillKey } from "@/game/recite";
import {
  cooldownMultiplier,
  damageMultiplier,
  DRAUGHT_SECONDS,
  DRAUGHT_SLOW,
  potionSpec,
  SALVE_HEAL,
  upgradeSpec,
  verseChars,
  type PotionKey,
  type UpgradeKey,
} from "@/game/upgrades";
import { cancelSleep, resting, sleepFrames } from "@/game/rest";

const SAVE_KEY = "azshara-signal-v1";

/** Slider ranges, from config.json. */
export const FIELD_SPEC = CONFIG.settingLimits;

type FieldKey = keyof typeof FIELD_SPEC;
type Kind = "adenosine" | "gaba" | "vlpo" | "pressure";

interface Enemy {
  alive: boolean;
  kind: Kind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  r: number;
  flash: number;
  leak: number;
}

interface Shot {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  life: number;
  dmg: number;
}

interface Mote {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  ch: string;
  color: string;
}

interface FloatNum {
  alive: boolean;
  x: number;
  y: number;
  life: number;
  text: string;
}

interface Glyph {
  phi: number;
  theta: number;
  text: string;
  op: number;
  cool: number;
  x: number;
  y: number;
  s: number;
  /** Box reserved for this chaos phrase when it was placed, so phrases do not pile up. */
  bw: number;
  bh: number;
}

const KIND_LABEL: Record<Kind, string> = {
  adenosine: "ADN",
  gaba: "GABA",
  vlpo: "VLPO",
  pressure: "PRS",
};

const KIND_STROKE: Record<Kind, string> = {
  adenosine: PAL.adenosine,
  gaba: PAL.gaba,
  vlpo: PAL.vlpo,
  pressure: PAL.pressure,
};

const KIND_FILL: Record<Kind, string> = {
  adenosine: "rgba(126, 231, 255, 0.16)",
  gaba: "rgba(192, 132, 252, 0.16)",
  vlpo: "rgba(240, 171, 252, 0.14)",
  pressure: "rgba(232, 200, 114, 0.18)",
};

function deadEnemy(): Enemy {
  return {
    alive: false,
    kind: "adenosine",
    x: 0,
    y: 0,
    hp: 0,
    maxHp: 1,
    speed: 0,
    r: 12,
    flash: 0,
    leak: 0,
  };
}

function deadShot(): Shot {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0, text: "", life: 0, dmg: 0 };
}

function deadMote(): Mote {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, ch: "0", color: PAL.cyan };
}

function deadNum(): FloatNum {
  return { alive: false, x: 0, y: 0, life: 0, text: "" };
}

function waveSpec(wave: number) {
  const w = CONFIG.arcade.waves;
  return {
    count: Math.min(w.maxCount, w.baseCount + wave * w.countPerWave),
    interval: Math.max(w.minInterval, w.baseInterval - wave * w.intervalDropPerWave),
  };
}

function isKind(kind: string): kind is Kind {
  return kind in KIND_LABEL;
}

/** Which sleep-signal comes next, from the spawn rules in config.json. */
function pickKind(wave: number, remaining: number): Kind {
  const { waves, spawnRules } = CONFIG.arcade;
  if (waves.bossEvery > 0 && wave % waves.bossEvery === 0 && remaining === 0) return "pressure";
  const roll = Math.random();
  for (const rule of spawnRules) {
    if (wave >= rule.fromWave && roll < rule.chance && isKind(rule.kind)) return rule.kind;
  }
  return "adenosine";
}

function clampSettings(input: Settings): Settings {
  const num = (key: FieldKey, value: number) => {
    const spec = FIELD_SPEC[key];
    const n = Number.isFinite(value) ? value : defaultSettings[key];
    return Math.min(spec.max, Math.max(spec.min, n));
  };
  return {
    flashMs: num("flashMs", input.flashMs),
    textSize: num("textSize", input.textSize),
    opacity: Math.round(num("opacity", input.opacity) * 100) / 100,
    density: Math.round(num("density", input.density)),
    mode: input.mode === "chaos" || input.mode === "sphere" ? input.mode : "field",
    holo: Boolean(input.holo),
    shake: input.shake !== false,
    muted: Boolean(input.muted),
    textScale: Math.round(num("textScale", input.textScale)),
    binaryOpacity: Math.round(num("binaryOpacity", input.binaryOpacity) * 100) / 100,
    binaryPitch: Math.round(num("binaryPitch", input.binaryPitch)),
    wordFlashMs: Math.round(num("wordFlashMs", input.wordFlashMs)),
    gameSpeed: Math.round(num("gameSpeed", input.gameSpeed) * 100) / 100,
    uiScale: Math.round(num("uiScale", input.uiScale)),
    fpsCap: Math.round(num("fpsCap", input.fpsCap)),
    renderScale: Math.round(num("renderScale", input.renderScale)),
    phraseEvery: Math.round(num("phraseEvery", input.phraseEvery)),
    phrasePauseMs: Math.round(num("phrasePauseMs", input.phrasePauseMs)),
    textPauseMs: Math.round(num("textPauseMs", input.textPauseMs)),
    volume: Math.round(num("volume", input.volume)),
    showFps: Boolean(input.showFps),
  };
}

export function applySound(settings: Settings) {
  sfx.muted = settings.muted;
  sfx.volume = settings.volume / 100;
}

export function applyUiScale(percent: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = `${(16 * percent) / 100}px`;
}

let toastTimer = 0;
let persistTimer = 0;

/** The arcade engine, if it is the running game. */
export function getEngine(): Engine | null {
  const game = getGame();
  return game instanceof Engine ? game : null;
}

export function flashToast(msg: string) {
  useGame.setState({ toast: msg });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => useGame.setState({ toast: "" }), 2200);
}

/**
 * Saves what every mode shares: settings, the loaded text and skills. It keeps the
 * arcade's best scores already in the save, so this works from any mode.
 */
function persistShared() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const prev: unknown = raw ? JSON.parse(raw) : {};
    const s = useGame.getState();
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        ...(typeof prev === "object" && prev !== null ? prev : {}),
        v: 2,
        settings: s.settings,
        custom: s.custom,
        lines: s.custom ? s.lines : null,
        texts: s.custom ? s.texts : null,
        textIndex: s.textIndex,
        skills: s.skills,
      }),
    );
  } catch {
    /* private mode / quota */
  }
}

/** Writes every save now, the running game's too, so a backup has the latest. */
export function saveAllNow() {
  persistShared();
  try {
    getGame()?.persist();
  } catch {
    /* the game keeps its save on the next change */
  }
}

function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistShared();
    getGame()?.persist();
  }, 200);
}

export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const prev = useGame.getState().settings;
  const settings = clampSettings({ ...prev, [key]: value });
  useGame.setState({ settings });
  applySound(settings);
  if (key === "uiScale") applyUiScale(settings.uiScale);
  if (key === "holo" && settings.holo && !prev.holo) getGame()?.say("holo");
  schedulePersist();
}

export function nudgeSetting(key: FieldKey, dir: number) {
  const spec = FIELD_SPEC[key];
  const cur = useGame.getState().settings[key];
  const next = Math.min(spec.max, Math.max(spec.min, Math.round((cur + dir * spec.step) * 100) / 100));
  updateSetting(key, next as Settings[typeof key]);
}

/** Most text files kept at once. */
export const MAX_TEXTS = 30;

/** Loads one pasted text, in place of whatever was loaded. */
export function loadCodexText(raw: string) {
  loadCodexTexts([{ name: "Pasted text", raw }]);
}

/**
 * Loads one or more text files, in name order (1, 2, 3 ... 10). The first is used
 * at once; each of the others takes over when the one before has been read
 * through, and after the last the first comes back.
 */
export function loadCodexTexts(files: { name: string; raw: string }[]) {
  const incoming = [...files]
    .sort((a, b) => byName(a.name, b.name))
    .map((f) => ({ name: f.name.replace(/\.txt$/i, "") || "Text", lines: parseCodex(f.raw) }))
    .filter((t) => t.lines.length > 0);
  if (!incoming.length) {
    flashToast(files.length > 1 ? "No usable lines in those texts" : "No usable lines in that text");
    return;
  }
  // Loading adds: the texts already loaded stay until removed with their ✕.
  const { texts: have, custom, textIndex } = useGame.getState();
  const base = custom ? have : [];
  const r = mergeTexts(base, incoming, MAX_TEXTS);
  if (!r.added) {
    flashToast(
      r.full
        ? `${MAX_TEXTS} texts at most: remove some with ✕ first`
        : r.already > 1
          ? "Those texts are loaded already"
          : "That text is loaded already",
    );
    return;
  }
  // The text in use stays in use; with only the built-in text, the first new one starts.
  const index = base.length ? Math.min(textIndex, r.texts.length - 1) : 0;
  const texts: LoadedText[] = r.texts;
  useGame.setState({ texts, textIndex: index, lines: texts[index]!.lines, custom: true });
  if (!base.length) getGame()?.onCodex(texts[index]!.lines.length);
  const total = texts.reduce((n, t) => n + t.lines.length, 0);
  const extra = [
    r.already ? `${r.already} already loaded` : "",
    r.full ? `${r.full} over the ${MAX_TEXTS}-text limit` : "",
  ]
    .filter(Boolean)
    .join(", ");
  flashToast(
    `Added ${r.added} text${r.added === 1 ? "" : "s"}: ${texts.length} loaded, ${total} sectors${extra ? ` (${extra})` : ""}`,
  );
  schedulePersist();
}

/** Puts a loaded text in use, by its place in the list (it wraps). */
export function selectText(index: number) {
  const { texts } = useGame.getState();
  if (!texts.length) return;
  const i = ((index % texts.length) + texts.length) % texts.length;
  const t = texts[i];
  if (!t) return;
  useGame.setState({ textIndex: i, lines: t.lines });
  getGame()?.onCodex(t.lines.length);
  if (texts.length > 1) flashToast(`Text ${i + 1} of ${texts.length}: ${t.name}`);
  schedulePersist();
}

/** Drops one loaded text; the built-in text returns when none are left. */
export function removeText(index: number) {
  const { texts, textIndex } = useGame.getState();
  const rest = texts.filter((_, i) => i !== index);
  if (!rest.length) {
    useGame.setState({ texts: [], textIndex: 0, lines: DEFAULT_CODEX, custom: false });
    getGame()?.onCodex(DEFAULT_CODEX.length);
    schedulePersist();
    return;
  }
  const next = index < textIndex ? textIndex - 1 : Math.min(textIndex, rest.length - 1);
  useGame.setState({ texts: rest, textIndex: next, lines: rest[next]!.lines });
  getGame()?.onCodex(rest[next]!.lines.length);
  schedulePersist();
}

/** Shared by every mode: when the last phrase came, and when a pause between texts ends. */
const gate: PhraseGate = { until: 0, last: -Infinity };

/**
 * Reads the phrase a shot carries, from the text in use. When that read finishes
 * the text, the next loaded text takes over and the reader starts it from the top:
 * text 1, 2, 3, then 1 again. Between two phrases there is at least the
 * phrase-pause setting, and after a text a text-pause; a shot inside a pause
 * gets "" and flies plain. `gaps: false` (arcade shots, spells) always reads.
 */
export function shotText(
  cursor: Cursor,
  read: (lines: string[], cur: Cursor) => string,
  { gaps = true }: { gaps?: boolean } = {},
): string {
  const { lines, texts, textIndex, settings } = useGame.getState();
  const now = performance.now();
  if (gaps && !gateOpen(gate, now, settings.phrasePauseMs)) return "";
  const before = { ...cursor };
  const text = read(lines, cursor);
  gate.last = now;
  if (wrapped(before, cursor, lines.length)) {
    if (texts.length > 1) {
      selectText(textIndex + 1);
      cursor.line = 0;
      cursor.word = 0;
    }
    gate.until = now + settings.textPauseMs;
  }
  return text;
}

/** Adds XP to a skill and saves it. Used by the rhythm drill and recall checks. */
export function grantSkillXp(key: SkillKey, xp: number) {
  if (xp <= 0) return;
  const skills = useGame.getState().skills;
  useGame.setState({ skills: { ...skills, [key]: skills[key] + xp } });
  schedulePersist();
}

export class Engine implements GameBase {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private backdrop = new Backdrop();
  private limiter = new FrameLimiter();
  /** Render-resolution setting the canvas was last sized for. */
  private renderScale = 0;
  private raf = 0;
  private running = false;
  private last = 0;
  private ro: ResizeObserver | null = null;
  private reduce = false;
  private onReduce: ((e: MediaQueryListEvent) => void) | null = null;
  private mq: MediaQueryList | null = null;

  w = 1;
  h = 1;
  private dpr = 1;
  private coreR = 32;
  private time = 0;
  private flashT = 0;
  private spin = 0;
  private binScroll = 0;

  private wave = 0;
  private toSpawn = 0;
  private spawnEvery = 0.7;
  private spawnAcc = 0;
  private armory = false;
  private integrity = 100;
  private oi = 0;
  private combo = 0;
  private kills = 0;
  private bestWave = 0;
  private bestOi = 0;
  private blessT = 0;
  private blessReady = false;
  private drag = false;
  private fireCd = 0;
  private slowT = 0;
  private upgrades: Record<UpgradeKey, number> = { sharpen: 0, tempo: 0, verse: 0 };
  /** Shot damage multiplier from the core level, which the recitation drill raises. */
  private coreBoost = 1;
  private potions: Record<PotionKey, number> = { salve: 0, draught: 0 };
  private aiming = false;
  private aimX = 0;
  private aimY = 0;
  private pointerId = -1;

  private trauma = 0;
  private hurt = 0;
  private muzzle = 0;
  private freeze = 0;
  private banner = "";
  private bannerLife = 0;
  private speaker = useGame.getState().hud.speaker;
  private line = useGame.getState().hud.line;
  private saidAt = -10;
  private lowTold = false;
  private critTold = false;
  /** Sequential readers over the text: one for shots, one for sphere and chaos phrases. */
  private shotCursor: Cursor = { line: 0, word: 0 };
  private glyphCursor: Cursor = { line: 0, word: 0 };
  private glyphN = -1;
  private glyphMode = "";

  private enemies: Enemy[] = Array.from({ length: 72 }, deadEnemy);
  private shots: Shot[] = Array.from({ length: 40 }, deadShot);
  private motes: Mote[] = Array.from({ length: 180 }, deadMote);
  private nums: FloatNum[] = Array.from({ length: 28 }, deadNum);
  private glyphs: Glyph[] = [];
  private order: number[] = [];
  private glyphZ: number[] = [];

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    sfx.unlock();
    const p = this.rel(e);
    this.aiming = true;
    this.aimX = p.x;
    this.aimY = p.y;
    this.pointerId = e.pointerId;
    this.tryFire();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already released */
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.aiming || e.pointerId !== this.pointerId) return;
    const p = this.rel(e);
    this.aimX = p.x;
    this.aimY = p.y;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.aiming = false;
    this.pointerId = -1;
  };

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.code === "Space") {
      e.preventDefault();
      this.togglePause();
    } else if (e.key === "b" || e.key === "B") {
      this.bless();
    }
  };

  private onVis = () => {
    if (document.visibilityState === "visible") sfx.resume();
  };

  private onContext = (e: Event) => e.preventDefault();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    this.ctx = ctx;
  }

  start() {
    setActiveGame(this);
    this.mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduce = this.mq.matches;
    this.onReduce = (e) => {
      this.reduce = e.matches;
    };
    this.mq.addEventListener("change", this.onReduce);
    this.loadSave();
    applyUiScale(useGame.getState().settings.uiScale);
    this.resize();
    this.rebuildGlyphs();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("contextmenu", this.onContext);
    window.addEventListener("keydown", this.onKey);
    document.addEventListener("visibilitychange", this.onVis);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.pushHud(true);
  }

  stop() {
    cancelSleep(this.wake);
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    window.removeEventListener("keydown", this.onKey);
    document.removeEventListener("visibilitychange", this.onVis);
    if (this.mq && this.onReduce) this.mq.removeEventListener("change", this.onReduce);
    cancelNarration();
    if (getGame() === this) setActiveGame(null);
  }

  engage() {
    sfx.unlock();
    const state = useGame.getState();
    if (!state.lines.length) {
      useGame.setState({ lines: DEFAULT_CODEX });
    }
    this.coreBoost = coreDamageMultiplier(coreLevel(state.skills), CONFIG.core.damagePerLevel, CONFIG.core.maxDamageBonus);
    this.clearEntities();
    this.integrity = 100;
    this.oi = 0;
    this.combo = 0;
    this.kills = 0;
    this.blessT = 0;
    this.blessReady = false;
    this.drag = false;
    this.fireCd = 0;
    this.freeze = 0;
    this.slowT = 0;
    this.upgrades = { sharpen: 0, tempo: 0, verse: 0 };
    this.potions = { salve: 0, draught: 0 };
    this.shotCursor = { line: 0, word: 0 };
    this.glyphCursor = { line: 0, word: 0 };
    this.lowTold = false;
    this.critTold = false;
    this.hurt = 0;
    useGame.setState({ phase: "battle", tomeOpen: false, paused: false, drawer: false });
    this.armWave(1, false);
    this.say("engage", true);
    flashToast("Tap a shape. Hold to chain fire.");
    this.pushHud(true);
  }

  toTitle() {
    this.clearEntities();
    this.slowT = 0;
    this.bannerLife = 0;
    useGame.setState({ phase: "title", paused: false, tomeOpen: false });
    this.say("title", true);
    this.pushHud(true);
  }

  togglePause() {
    if (useGame.getState().phase !== "battle") return;
    useGame.setState({ paused: !useGame.getState().paused });
    this.pushHud(true);
  }

  toggleTome() {
    const open = !useGame.getState().tomeOpen;
    useGame.setState({ tomeOpen: open });
    if (open) this.say("read");
  }

  bless() {
    if (!this.blessReady || useGame.getState().phase !== "battle") return;
    this.blessReady = false;
    this.blessT = 5.5;
    this.say("bless", true);
    sfx.bless();
    this.buzz(18);
    this.pushHud(true);
  }

  /** Closes the armory and starts the next wave. */
  nextWave() {
    if (!this.armory) return;
    this.armory = false;
    this.armWave(this.wave + 1, true);
  }

  buyUpgrade(key: UpgradeKey) {
    if (!this.armory) return;
    const spec = upgradeSpec(key);
    const level = this.upgrades[key];
    if (level >= spec.max) {
      flashToast(`${spec.name} is at its limit`);
      return;
    }
    const cost = spec.cost(level);
    if (this.oi < cost) {
      flashToast(`${spec.name} needs ${cost} O/I`);
      return;
    }
    this.oi -= cost;
    this.upgrades[key] = level + 1;
    sfx.ready();
    this.pushHud(true);
  }

  buyPotion(key: PotionKey) {
    if (!this.armory) return;
    const spec = potionSpec(key);
    const count = this.potions[key];
    if (count >= spec.max) {
      flashToast(`You carry ${spec.max} of those`);
      return;
    }
    if (this.oi < spec.cost) {
      flashToast(`${spec.name} needs ${spec.cost} O/I`);
      return;
    }
    this.oi -= spec.cost;
    this.potions[key] = count + 1;
    sfx.ready();
    this.pushHud(true);
  }

  usePotion(key: PotionKey) {
    if (useGame.getState().phase !== "battle" || this.potions[key] <= 0) return;
    this.potions[key] -= 1;
    if (key === "salve") {
      this.integrity = Math.min(100, this.integrity + SALVE_HEAL);
    } else {
      this.slowT = DRAUGHT_SECONDS;
    }
    sfx.ready();
    this.pushHud(true);
  }

  onCodex(count: number) {
    this.rebuildGlyphs();
    this.say("read");
    this.pushHud(true);
    void count;
  }

  say(mood: Mood, force = false) {
    if (!force && this.time - this.saidAt < 3.2) return;
    this.saidAt = this.time;
    const council = pickCouncilLine(mood, this.speaker);
    this.speaker = council ? council.speaker : QUEEN;
    this.line = council ? council.text : pickLine(mood);
    this.pushHud(true);
    narrate(
      mood,
      {
        Mode: "core defense",
        Wave: this.wave,
        "Core integrity": `${Math.round(this.integrity)}%`,
        Combo: this.combo,
        Kills: this.kills,
      },
      (speaker, text) => this.speak(speaker, text),
    );
  }

  /** A line from the narrator model takes the speech box and holds it like a scripted one. */
  private speak(speaker: string, text: string) {
    if (!this.running) return;
    this.speaker = speaker;
    this.line = text;
    this.saidAt = this.time;
    this.pushHud(true);
  }

  persist() {
    try {
      const s = useGame.getState();
      const payload = {
        v: 2,
        bestWave: this.bestWave,
        bestOi: this.bestOi,
        settings: s.settings,
        custom: s.custom,
        lines: s.custom ? s.lines : null,
        texts: s.custom ? s.texts : null,
        textIndex: s.textIndex,
        skills: s.skills,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {
      /* private mode / quota */
    }
  }

  private loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        bestWave?: number;
        bestOi?: number;
        settings?: Settings;
        custom?: boolean;
        lines?: unknown;
        texts?: unknown;
        textIndex?: unknown;
        skills?: Partial<Record<SkillKey, number>>;
      };
      if (data.settings && typeof data.settings === "object") {
        useGame.setState({ settings: clampSettings({ ...defaultSettings, ...data.settings }) });
        applySound(useGame.getState().settings);
      }
      const clean = (v: unknown) =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 4).slice(0, 400) : [];
      const texts: LoadedText[] = data.custom && Array.isArray(data.texts)
        ? data.texts
            .map((t) => {
              const o = (typeof t === "object" && t !== null ? t : {}) as { name?: unknown; lines?: unknown };
              return { name: typeof o.name === "string" ? o.name.slice(0, 120) : "Text", lines: clean(o.lines) };
            })
            .filter((t) => t.lines.length > 0)
            .slice(0, MAX_TEXTS)
        : [];
      if (texts.length) {
        const i = Math.max(0, Math.min(texts.length - 1, Math.floor(Number(data.textIndex) || 0)));
        useGame.setState({ texts, textIndex: i, lines: texts[i]!.lines, custom: true });
      } else if (data.custom) {
        // Saves from before several texts: one text, kept as the only one.
        const lines = clean(data.lines);
        if (lines.length) useGame.setState({ lines, texts: [{ name: "Your text", lines }], textIndex: 0, custom: true });
      }
      if (data.skills && typeof data.skills === "object") {
        const skills = useGame.getState().skills;
        useGame.setState({
          skills: {
            recitation: Math.max(0, Number(data.skills.recitation) || skills.recitation),
            recall: Math.max(0, Number(data.skills.recall) || skills.recall),
          },
        });
      }
      if (typeof data.bestWave === "number") this.bestWave = data.bestWave;
      if (typeof data.bestOi === "number") this.bestOi = data.bestOi;
    } catch {
      /* ignore broken save */
    }
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
    if (!this.limiter.ready(t, fpsCap)) return;
    if (renderScale !== this.renderScale) this.resize();
    // Up to a tenth of a second per step, so a low frame-rate cap keeps real-time speed.
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.tick(dt);
    this.draw();
    frameStats.draws += 1;
  };

  private tick(dt: number) {
    const { phase, paused, tomeOpen, settings, lines } = useGame.getState();
    applySound(settings);
    this.time += dt;
    this.flashT += dt;
    this.spin += dt * (settings.holo ? 0.42 : 0.2) * (this.reduce ? 0.3 : 1);
    this.binScroll += dt * (this.reduce ? CONFIG.rain.reducedMotionSpeed : CONFIG.rain.speed);
    this.backdrop.ensureBinary(settings, lines);
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.hurt = Math.max(0, this.hurt - dt * 1.35);
    this.muzzle = Math.max(0, this.muzzle - dt);
    if (this.bannerLife > 0) this.bannerLife -= dt;
    if (settings.mode !== "field") {
      if (settings.density !== this.glyphN || settings.mode !== this.glyphMode) this.rebuildGlyphs();
      this.stepGlyphs(dt, settings);
    }

    if (phase === "battle" && this.blessT > 0) this.blessT = Math.max(0, this.blessT - dt);
    this.slowT = Math.max(0, this.slowT - dt);

    const combat = phase === "battle" && !paused && !tomeOpen && !this.armory;
    if (!combat) {
      this.aiming = false;
      this.drag = false;
      this.stepMotes(dt);
      this.pushHud(false);
      return;
    }
    if (this.freeze > 0 && !this.reduce) {
      this.freeze -= dt;
      this.stepMotes(dt * 0.25);
      this.pushHud(false);
      return;
    }
    this.stepCombat(dt, settings);
    this.pushHud(false);
  }

  private stepGlyphs(dt: number, settings: Settings) {
    const pace = Math.max(0.02, settings.flashMs / 1000);
    for (const g of this.glyphs) {
      g.cool -= dt;
      if (g.cool <= 0) {
        g.text = readChunk(useGame.getState().lines, this.glyphCursor, settings.mode === "sphere" ? 18 : 24);
        g.op = 0.5 + Math.random() * 0.5;
        g.cool = pace * (0.55 + Math.random() * 0.9);
        if (settings.mode === "chaos") this.placeChaos(g, settings.textSize);
      }
    }
  }

  private stepCombat(dt: number, settings: Settings) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    const speed = settings.gameSpeed;

    if (this.toSpawn > 0) {
      this.spawnAcc += dt * speed;
      while (this.toSpawn > 0 && this.spawnAcc >= this.spawnEvery) {
        this.spawnAcc -= this.spawnEvery;
        this.toSpawn -= 1;
        this.spawnOne(this.wave, this.toSpawn);
      }
    } else if (!this.anyAlive()) {
      this.onCleared();
      return;
    }

    const cx = this.w / 2;
    const cy = this.h / 2;
    const pace = speed * (this.slowT > 0 ? DRAUGHT_SLOW : 1);
    let drag = false;
    const dragR = Math.min(this.w, this.h) * 0.3;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = cx - e.x;
      const dy = cy - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt * pace;
      e.y += (dy / d) * e.speed * dt * pace;
      if (e.flash > 0) e.flash -= dt;
      if (e.kind === "gaba" && d < dragR) drag = true;
      if (d < this.coreR + e.r * 0.45) this.leak(e);
    }
    this.drag = drag;
    this.separate();

    for (const s of this.shots) {
      if (!s.alive) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0 || s.x < -40 || s.y < -40 || s.x > this.w + 40 || s.y > this.h + 40) {
        s.alive = false;
        continue;
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const hitR = e.r + 12;
        if (dx * dx + dy * dy <= hitR * hitR) {
          this.strike(e, s.dmg);
          s.alive = false;
          break;
        }
      }
    }

    this.stepMotes(dt);
    if (this.aiming) this.tryFire();
  }

  private stepMotes(dt: number) {
    for (const m of this.motes) {
      if (!m.alive) continue;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx *= 0.985;
      m.vy *= 0.985;
      m.life -= dt;
      if (m.life <= 0) m.alive = false;
    }
    for (const n of this.nums) {
      if (!n.alive) continue;
      n.y -= 26 * dt;
      n.life -= dt;
      if (n.life <= 0) n.alive = false;
    }
  }

  private armWave(wave: number, announce: boolean) {
    this.wave = wave;
    const spec = waveSpec(wave);
    this.toSpawn = spec.count;
    this.spawnEvery = spec.interval;
    this.spawnAcc = Math.max(0, spec.interval - 0.28);
    this.banner = `WAVE ${wave}`;
    this.bannerLife = 1.2;
    if (announce) this.say("wave", true);
    this.pushHud(true);
  }

  /** Wave cleared: open the armory until the player starts the next wave. */
  private onCleared() {
    this.armory = true;
    this.aiming = false;
    this.banner = "WAVE SECURED";
    this.bannerLife = 1.45;
    if (this.wave > this.bestWave) this.bestWave = this.wave;
    if (this.oi > this.bestOi) this.bestOi = this.oi;
    this.say("clear", true);
    this.persist();
    this.pushHud(true);
  }

  private spawnOne(wave: number, remaining: number) {
    const e = this.enemies.find((en) => !en.alive);
    if (!e) return;
    const m = 1 + (wave - 1) * CONFIG.arcade.waves.hpGrowthPerWave;
    const kind = pickKind(wave, remaining);
    const stats = CONFIG.arcade.enemies[kind];
    const p = this.spawnPoint();
    e.alive = true;
    e.kind = kind;
    e.x = p.x;
    e.y = p.y;
    e.hp = stats.hp * m;
    e.maxHp = e.hp;
    e.speed = stats.speed;
    e.r = stats.radius;
    e.leak = stats.leak;
    e.flash = 0;
  }

  private spawnPoint() {
    const top = 96;
    const bottom = Math.max(top + 120, this.h - 176);
    const left = 18;
    const right = Math.max(left + 40, this.w - 18);
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) return { x: left + Math.random() * (right - left), y: top };
    if (edge === 1) return { x: right, y: top + Math.random() * (bottom - top) };
    if (edge === 2) return { x: left + Math.random() * (right - left), y: bottom };
    return { x: left, y: top + Math.random() * (bottom - top) };
  }

  private separate() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a?.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b?.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r + 8;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 0 || d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.45;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }
  }

  private leak(e: Enemy) {
    if (!e.alive) return;
    e.alive = false;
    const shield = this.blessT > 0;
    if (shield) {
      this.burst(e.x, e.y, 8, PAL.gold);
      sfx.shield();
      return;
    }
    this.integrity = Math.max(0, this.integrity - e.leak);
    this.combo = 0;
    this.blessReady = false;
    this.hurt = 1;
    this.trauma = Math.min(1, this.trauma + (e.kind === "pressure" ? 0.75 : 0.42));
    this.burst(e.x, e.y, 10, PAL.danger);
    sfx.leak();
    this.buzz(e.kind === "pressure" ? 36 : 16);
    if (this.integrity <= 0) {
      this.gameOver();
      return;
    }
    if (this.integrity <= 22 && !this.critTold) {
      this.critTold = true;
      this.say("critical", true);
    } else if (this.integrity <= 45 && !this.lowTold) {
      this.lowTold = true;
      this.say("low", true);
    } else {
      this.say("leak");
    }
    this.pushHud(true);
  }

  private strike(e: Enemy, dmg: number) {
    e.hp -= dmg;
    e.flash = 0.07;
    this.float(e.x, e.y - e.r, String(Math.round(dmg)));
    if (e.hp > 0) {
      sfx.hit();
      return;
    }
    e.alive = false;
    const gain = Math.round(10 + e.maxHp * 0.35);
    this.oi += gain;
    this.kills += 1;
    this.combo += 1;
    this.trauma = Math.min(1, this.trauma + (e.kind === "pressure" ? 0.7 : 0.25));
    if (!this.reduce) this.freeze = e.kind === "pressure" ? 0.07 : 0.035;
    this.burst(e.x, e.y, e.kind === "pressure" ? 24 : 12, e.kind === "pressure" ? PAL.gold : PAL.cyan);
    sfx.kill(e.kind === "pressure");
    if (e.kind === "pressure") this.say("kill", true);
    if (this.combo > 0 && this.combo % 6 === 0) {
      this.blessReady = true;
      this.say("blessReady", true);
      sfx.ready();
    } else if (this.combo % 4 === 0) {
      this.say("combo");
    }
  }

  private tryFire() {
    const { phase, paused, tomeOpen } = useGame.getState();
    if (phase !== "battle" || paused || tomeOpen || this.armory || this.fireCd > 0) return;
    const target = this.pickTarget(this.aimX, this.aimY);
    if (!target) return;
    const shot = this.shots.find((s) => !s.alive);
    if (!shot) return;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const dx = target.x - cx;
    const dy = target.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 620;
    shot.alive = true;
    shot.x = cx + (dx / len) * (this.coreR + 8);
    shot.y = cy + (dy / len) * (this.coreR + 8);
    shot.vx = (dx / len) * speed;
    shot.vy = (dy / len) * speed;
    shot.life = 1.15;
    const chars = verseChars(this.upgrades.verse);
    const text = shotText(this.shotCursor, (lines, cur) => readChunk(lines, cur, chars), { gaps: false });
    shot.text = text;
    // Longer verse carries more words, so a shot hits harder. 22 characters is neutral.
    const words = Math.max(0.5, text.length / 22);
    const base = 20 + Math.min(18, (this.wave - 1) * 1.15);
    shot.dmg =
      base * damageMultiplier(this.upgrades.sharpen) * this.coreBoost * words * (this.blessT > 0 ? 1.4 : 1);
    const rate = (this.blessT > 0 ? 0.08 : 0.23) * cooldownMultiplier(this.upgrades.tempo) * (this.drag ? 1.65 : 1);
    this.fireCd = rate;
    this.muzzle = 0.07;
    sfx.fire();
  }

  private pickTarget(px: number, py: number) {
    let best: Enemy | null = null;
    let bestD = 110 * 110;
    let threat: Enemy | null = null;
    let threatD = Infinity;
    const cx = this.w / 2;
    const cy = this.h / 2;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
      const cd = (e.x - cx) ** 2 + (e.y - cy) ** 2;
      if (cd < threatD) {
        threatD = cd;
        threat = e;
      }
    }
    return best ?? threat;
  }

  private gameOver() {
    this.integrity = 0;
    this.aiming = false;
    this.armory = false;
    if (this.wave > this.bestWave) this.bestWave = this.wave;
    if (this.oi > this.bestOi) this.bestOi = this.oi;
    this.banner = "CORE DARK";
    this.bannerLife = 2;
    useGame.setState({ phase: "over", paused: false });
    this.say("over", true);
    sfx.over();
    this.buzz(40);
    this.persist();
    this.pushHud(true);
  }

  private anyAlive() {
    return this.enemies.some((e) => e.alive);
  }

  private clearEntities() {
    for (const e of this.enemies) e.alive = false;
    for (const s of this.shots) s.alive = false;
    this.toSpawn = 0;
    this.armory = false;
  }

  private burst(x: number, y: number, n: number, color: string) {
    let left = n;
    for (const m of this.motes) {
      if (left <= 0) break;
      if (m.alive) continue;
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 180;
      m.alive = true;
      m.x = x;
      m.y = y;
      m.vx = Math.cos(a) * sp;
      m.vy = Math.sin(a) * sp;
      m.life = 0.55 + Math.random() * 0.35;
      m.max = m.life;
      m.ch = String(this.backdrop.nextBit());
      m.color = color;
      left -= 1;
    }
  }

  private float(x: number, y: number, text: string) {
    const n = this.nums.find((f) => !f.alive);
    if (!n) return;
    n.alive = true;
    n.x = x;
    n.y = y;
    n.life = 0.6;
    n.text = text;
  }

  private buzz(ms: number) {
    if (!useGame.getState().settings.shake || this.reduce) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* ignore */
    }
  }

  private rebuildGlyphs() {
    const settings = useGame.getState().settings;
    const n = settings.density;
    this.glyphN = n;
    this.glyphMode = settings.mode;
    this.glyphs = [];
    for (let i = 0; i < n; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / n);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      this.glyphs.push({
        phi,
        theta,
        text: readChunk(useGame.getState().lines, this.glyphCursor, 20),
        op: 0.45 + Math.random() * 0.55,
        cool: Math.random() * 0.6,
        x: 0,
        y: 0,
        s: 1,
        bw: 0,
        bh: 0,
      });
    }
    this.order = this.glyphs.map((_, i) => i);
    this.glyphZ = this.glyphs.map(() => 0);
    if (settings.mode === "chaos") {
      for (const g of this.glyphs) this.placeChaos(g, settings.textSize);
    }
  }

  /** Places a chaos phrase in the field where it overlaps the fewest others. */
  private placeChaos(g: Glyph, size: number) {
    const box = this.backdrop.fieldBox(useGame.getState().chrome);
    const bw = Math.min(g.text.length * size * 0.6, this.w * 0.3);
    const bh = size * 1.3;
    let best = { x: this.w / 2, y: box.y + box.h / 2, overlap: Infinity };
    for (let t = 0; t < 14 && best.overlap > 0; t++) {
      const x = clampCenter(8 + Math.random() * (this.w - 16), bw, 8, this.w - 8);
      const y = box.y + Math.random() * box.h;
      let overlap = 0;
      for (const o of this.glyphs) {
        if (o === g || o.bw === 0) continue;
        overlap += overlapArea(x - bw / 2, y - bh / 2, bw, bh, o.x - o.bw / 2, o.y - o.bh / 2, o.bw, o.bh);
      }
      if (overlap < best.overlap) best = { x, y, overlap };
    }
    g.x = best.x;
    g.y = best.y;
    g.bw = bw;
    g.bh = bh;
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderScale = useGame.getState().settings.renderScale;
    const dpr = renderDpr(window.devicePixelRatio, this.renderScale);
    if (Math.abs(w - this.w) < 0.5 && Math.abs(h - this.h) < 0.5 && this.canvas.width === Math.floor(w * dpr)) {
      return;
    }
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.coreR = Math.max(26, Math.min(w, h) * 0.058);
    this.backdrop.setFrame(w, h, dpr);
  }

  private draw() {
    const ctx = this.ctx;
    const { settings, phase, lines, chrome } = useGame.getState();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const amp = settings.shake && !this.reduce ? this.trauma * this.trauma : 0;
    const ox = amp * (Math.sin(this.time * 43) * 8 + Math.sin(this.time * 19) * 3);
    const oy = amp * Math.cos(this.time * 37) * 6;
    ctx.translate(ox, oy);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(-24, -24, this.w + 48, this.h + 48);

    this.backdrop.drawBinary(ctx, settings, this.binScroll);

    this.drawGrid(ctx);
    if (settings.mode === "field") {
      this.backdrop.drawField(ctx, settings, lines, chrome, this.flashT, this.reduce);
    } else {
      this.drawGlyphs(ctx, settings, false);
    }
    this.drawEnemies(ctx);
    this.drawCore(ctx, lines);
    if (settings.mode !== "field") this.drawGlyphs(ctx, settings, true);
    this.drawShots(ctx);
    this.drawMotes(ctx);
    this.drawNums(ctx);
    this.backdrop.drawVignette(ctx);
    if (this.hurt > 0.02) {
      ctx.fillStyle = `rgba(255, 77, 109, ${this.hurt * 0.28})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    if (this.armory) {
      ctx.fillStyle = "rgba(2, 0, 5, 0.35)";
      ctx.fillRect(-24, -24, this.w + 48, this.h + 48);
    }

    if (this.bannerLife > 0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, this.bannerLife));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 22px ${DISPLAY}`;
      ctx.fillStyle = PAL.gold;
      ctx.fillText(this.banner, this.w / 2, 118);
      ctx.globalAlpha = 1;
    }

    if (phase === "over") {
      ctx.fillStyle = "rgba(2, 0, 5, 0.45)";
      ctx.fillRect(-24, -24, this.w + 48, this.h + 48);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D) {
    const cx = this.w / 2;
    const cy = this.h / 2;
    ctx.strokeStyle = "rgba(0, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const maxR = Math.hypot(this.w, this.h) * 0.5;
    for (let r = 36; r < maxR; r += 46) ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = this.spin * 0.15 + (i / 8) * Math.PI * 2;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
    }
    ctx.stroke();
  }

  private drawGlyphs(ctx: CanvasRenderingContext2D, settings: Settings, front: boolean) {
    const n = this.glyphs.length;
    if (!n) return;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const radius = Math.min(this.w, this.h) * (settings.holo ? 0.33 : 0.29);
    const pitch = settings.holo ? 0.58 : 0.16;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const fov = 480;
    if (!front && settings.mode === "sphere") {
      for (let i = 0; i < n; i++) {
        const g = this.glyphs[i];
        if (!g) continue;
        const th = g.theta + this.spin;
        const x3 = radius * Math.sin(g.phi) * Math.cos(th);
        const y3 = radius * Math.cos(g.phi);
        const z3 = radius * Math.sin(g.phi) * Math.sin(th);
        const y2 = y3 * cp - z3 * sp;
        const z2 = y3 * sp + z3 * cp;
        const scale = fov / (fov + z2);
        g.x = cx + x3 * scale;
        g.y = cy + y2 * scale * 0.92;
        g.s = scale;
        this.glyphZ[i] = z2;
      }
      this.order.sort((a, b) => (this.glyphZ[a] ?? 0) - (this.glyphZ[b] ?? 0));
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const glow = settings.holo && n <= 40;
    const maxW = settings.mode === "sphere" ? radius * 0.9 : this.w * 0.3;
    const measure = this.backdrop.measure;
    let font = 0;
    for (const i of this.order) {
      const g = this.glyphs[i];
      if (!g) continue;
      const z = this.glyphZ[i] ?? 0;
      const isFront = settings.mode !== "sphere" ? true : z >= 0;
      if (front !== isFront) continue;
      if (settings.mode === "chaos") g.s = 1;
      let size = Math.max(7, settings.textSize * (settings.mode === "sphere" ? g.s : 1));
      // Shrink to fit the glyph's width. Phrases are whole words, so this never cuts one.
      const width = measure(g.text, size);
      if (width > maxW) size = Math.max(6, (size * maxW) / width);
      // Half-pixel steps, rounded down so the phrase still fits. Fewer distinct sizes
      // means the font is set less often and rendered glyphs are reused between frames.
      size = Math.max(6, Math.floor(size * 2) / 2);
      if (size !== font) {
        ctx.font = `${size}px ${FONT}`;
        font = size;
      }
      // Keep every phrase fully on screen, not clipped at the edges.
      const drawW = measure(g.text, size);
      const x = clampCenter(g.x, drawW, 8, this.w - 8);
      const y = Math.min(this.h - size, Math.max(size, g.y));
      const alpha = Math.max(0.05, Math.min(1, settings.opacity * g.op * (0.4 + 0.6 * Math.min(1.4, g.s))));
      if (glow) {
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillStyle = PAL.violet;
        ctx.fillText(g.text, x + 1.4, y + 1.4);
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = settings.holo && i % 3 === 0 ? PAL.violet : PAL.cyan;
      ctx.fillText(g.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  private drawEnemies(ctx: CanvasRenderingContext2D) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const color = KIND_STROKE[e.kind];
      ctx.beginPath();
      const sides = e.kind === "gaba" ? 6 : e.kind === "vlpo" ? 3 : e.kind === "pressure" ? 8 : 4;
      const rot = this.time * (e.kind === "vlpo" ? 2.4 : 0.7) + e.x * 0.01;
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2 - Math.PI / 2;
        const px = e.x + Math.cos(a) * e.r;
        const py = e.y + Math.sin(a) * e.r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = e.flash > 0 ? "rgba(244,247,255,0.85)" : KIND_FILL[e.kind];
      ctx.fill();
      ctx.lineWidth = e.kind === "pressure" ? 2.5 : 1.6;
      ctx.strokeStyle = color;
      ctx.stroke();
      if (e.kind === "pressure") {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "rgba(2,0,5,0.55)";
      ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2, 3);
      ctx.fillStyle = color;
      ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2 * pct, 3);
      ctx.font = `10px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PAL.fg;
      ctx.fillText(KIND_LABEL[e.kind], e.x, e.y);
    }
  }

  /**
   * The wake core. It is see-through: a soft glow and the loaded text as a raw image
   * inside, so phrases and sphere text behind it still show.
   */
  private drawCore(ctx: CanvasRenderingContext2D, lines: string[]) {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const pulse = 1 + Math.sin(this.time * (2.2 + this.kills * 0.01)) * 0.04 + this.muzzle * 0.8;
    const r = this.coreR * pulse;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 2.4);
    g.addColorStop(0, "rgba(232, 200, 114, 0.35)");
    g.addColorStop(0.35, "rgba(0, 255, 255, 0.28)");
    g.addColorStop(1, "rgba(0, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    drawCoreImage(ctx, lines, cx, cy, r, this.spin * 0.6, 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PAL.cyan;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.45, this.spin * 2, this.spin * 2 + Math.PI * 1.3);
    ctx.strokeStyle = PAL.violet;
    ctx.stroke();

    const integ = useGame.getState().phase === "title" ? 1 : this.integrity / 100;
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = integ < 0.35 ? PAL.danger : PAL.cyan;
    ctx.arc(cx, cy, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, integ));
    ctx.stroke();

    if (this.blessT > 0) {
      ctx.beginPath();
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PAL.gold;
      ctx.arc(cx, cy, r + 18, this.time * 1.5, this.time * 1.5 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (this.drag) {
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = PAL.gaba;
      ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawShots(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `13px ${FONT}`;
    for (const s of this.shots) {
      if (!s.alive) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.globalAlpha = Math.max(0.25, Math.min(1, s.life * 1.4));
      ctx.fillStyle = PAL.violet;
      ctx.fillText(s.text, 2, 1);
      ctx.fillStyle = PAL.cyan;
      ctx.fillText(s.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawMotes(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `12px ${FONT}`;
    for (const m of this.motes) {
      if (!m.alive) continue;
      ctx.globalAlpha = Math.max(0, m.life / m.max);
      ctx.fillStyle = m.color;
      ctx.fillText(m.ch, m.x, m.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawNums(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    ctx.font = `700 12px ${DISPLAY}`;
    for (const n of this.nums) {
      if (!n.alive) continue;
      ctx.globalAlpha = Math.max(0, n.life / 0.6);
      ctx.fillStyle = PAL.gold;
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  }

  private rel(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private pushHud(force: boolean) {
    const now = performance.now();
    if (!force && now - this.hudAt < 100) return;
    this.hudAt = now;
    const hz = 8 + this.kills * 0.22 + Math.max(0, this.wave - 1) * 0.35;
    useGame.setState({
      hud: {
        wave: this.wave,
        integrity: this.integrity,
        hz,
        oi: this.oi,
        combo: this.combo,
        blessing: this.blessT > 0 ? this.blessT / 5.5 : 0,
        blessingReady: this.blessReady,
        speaker: this.speaker,
        line: this.line,
        bestWave: this.bestWave,
        bestOi: this.bestOi,
        banner: this.bannerLife > 0 ? this.banner : "",
        gaba: this.drag,
        shield: this.blessT > 0,
        armory: this.armory,
        slowed: this.slowT > 0,
        upgrades: { ...this.upgrades },
        potions: { ...this.potions },
      },
    });
  }

  private hudAt = 0;
}

