import { create } from "zustand";
import { DEFAULT_CODEX } from "@/game/codex";
import { CONFIG } from "@/game/config";
import { QUEEN } from "@/game/council";
import type { PotionKey, UpgradeKey } from "@/game/upgrades";
import type { SkillKey } from "@/game/recite";
import type {
  CreepKind,
  Currency,
  DifficultyKey,
  PerkKey,
  SpellKey,
  TowerKey,
  FelPerkKey,
  VoidPerkKey,
} from "@/game/td/economy";
import type { RunSummary } from "@/game/td/save";
import type { CourtSave, PlaceKey, QueenKey, SkillKey as CourtSkillKey } from "@/game/court/rules";
import type { CourtArcKey } from "@/game/config";
import type { Mood } from "@/game/court/hearts";
import type { Targeting, TdPhase } from "@/game/td/sim";
import type { Area, ChessPhase } from "@/game/chess/sim";
import type { PieceKey } from "@/game/chess/rules";

export type Phase = "title" | "battle" | "over";
export type Mode = "field" | "chaos" | "sphere";
/** Which playable game the stage is running. */
export type GameMode = "arcade" | "td" | "chess" | "court";
/** Tabs of the options window. */
export type OptionsTab = "game" | "display" | "text" | "sound" | "controls" | "backup" | "advanced";
/** Panels laid over the title or the battle. */
export type Panel = "none" | "drill" | "agents";

export type Settings = {
  /** Phrase rewrite speed for sphere and chaos (ms). */
  flashMs: number;
  /** Text size for sphere and chaos (px). */
  textSize: number;
  /** Text opacity everywhere. */
  opacity: number;
  /** How many floating phrases sphere and chaos keep alive. */
  density: number;
  mode: Mode;
  holo: boolean;
  shake: boolean;
  muted: boolean;
  /** Field text size as a percent of the largest size that fits (50 to 150). */
  textScale: number;
  /** Opacity of the binary rain built from your text. */
  binaryOpacity: number;
  /** Spacing between binary columns (px). */
  binaryPitch: number;
  /** Time each sector stays on screen when the text is flashed (ms). */
  wordFlashMs: number;
  /** Speed of sleep-signals and waves (multiplier). */
  gameSpeed: number;
  /** Size of the interface as a percent of normal. */
  uiScale: number;
  /** Most frames drawn per second; 120 or more means no cap. */
  fpsCap: number;
  /** Share of the screen's pixel density the game draws at (percent). Lower is lighter and softer. */
  renderScale: number;
  /** How strongly the flowing shader pictures show behind the Court's screens and the title (0: none). */
  shaderArt: number;
  /** Tower defense and auto chess: the first shot or attack and every Nth after it carry a phrase. */
  phraseEvery: number;
  /** Least time between two phrases on shots (ms). */
  phrasePauseMs: number;
  /** Pause after a text has been read through, before the next one starts (ms). */
  textPauseMs: number;
  /** Sound volume, 0 to 100. */
  volume: number;
  /** Show a frames-per-second counter. */
  showFps: boolean;
};

/** A loaded text file: its name and its sectors. */
export type LoadedText = { name: string; lines: string[] };
/** A folder of texts loaded from a .zip (the Read tab): kept apart from the texts loaded one by one, and from the games. */
export type TextFolder = { name: string; texts: LoadedText[] };

export type Hud = {
  wave: number;
  integrity: number;
  hz: number;
  oi: number;
  combo: number;
  blessing: number;
  blessingReady: boolean;
  speaker: string;
  line: string;
  bestWave: number;
  bestOi: number;
  banner: string;
  gaba: boolean;
  shield: boolean;
  armory: boolean;
  slowed: boolean;
  upgrades: Record<UpgradeKey, number>;
  potions: Record<PotionKey, number>;
};

/** Space the battle HUD takes at the top, bottom and right of the canvas (px). */
export type Chrome = { top: number; bottom: number; right: number };

/** What the tower-defense HUD shows about the board. */
export type TdView = {
  phase: TdPhase;
  gold: number;
  lives: number;
  maxLives: number;
  /** Highest wave called, and highest cleared. */
  wave: number;
  cleared: number;
  kills: number;
  bestWave: number;
  /** Best wave cleared on each map, by map key. */
  bests: Record<string, number>;
  /** Waves still on the board, creeps still to spawn, creeps walking. */
  active: number;
  pending: number;
  onBoard: number;
  auto: boolean;
  /** Fast-forward: 1, 2 or 3. */
  speed: number;
  /** O/I for calling the next wave right now (0 when nothing is on the board). */
  nextBonus: number;
  /** The next wave closes with a boss. */
  bossNext: boolean;
  /** Selected grid cell, or null. */
  selected: { col: number; row: number } | null;
  /** The selected cell can take a new tower right now. */
  canBuild: boolean;
  /** The tower on the selected cell, if any, with what it can do. */
  tower: {
    key: TowerKey;
    level: number;
    damage: number;
    rate: number;
    /** How far it reaches now, with what a Serotonin near it adds (reach). */
    range: number;
    reach: number;
    /** Stopped for a moment by an Atonia slain near it, or by Nyx. */
    jammed: boolean;
    upgradeCost: number;
    /** O/I back on a sale: everything, when the build can still be undone. */
    sellValue: number;
    undo: boolean;
    /** Levels the O/I buys right now with Max, and their price. */
    maxLevels: number;
    maxCost: number;
    /** For a Muse, towers in its circle; for others, Muses boosting it. */
    boosts: number;
    muses: number;
    targeting: Targeting;
    /** Damage bonus from Muses next to it, as a share (0.2 = +20%). */
    aura: number;
    /** Fire-rate bonus from Tempo Muses next to it, as a share. */
    haste: number;
    /** The path taken (-1 for none) and the price of one. */
    path: number;
    pathCost: number;
    /** The Ascension taken (-1 for none) and the price of one. */
    ascend: number;
    ascendCost: number;
    /** Damage dealt and creeps finished so far. */
    dealt: number;
    kills: number;
    /** What it is paid in: O/I, flux for a void tower, ATP for a wake tower, dark energy for a fel tower. */
    currency: Currency;
    /** Dark energy sacrificing it gives now (0 for a fel tower, or one with too little in it). */
    sacrifice: number;
  } | null;
  difficulty: DifficultyKey;
  /** Seconds until each spell is ready. */
  spells: Record<SpellKey, number>;
  /** What the next wave brings. */
  next: { kind: CreepKind; count: number; boss: boolean }[];
  /** The boss furthest along, and its life left (0 to 1). */
  boss: { kind: CreepKind; pct: number } | null;
  /** Damage and kills by tower kind this run, the most damage first. */
  report: { key: TowerKey; dealt: number; kills: number }[];
  perks: Record<PerkKey, number>;
  /** Flux (the rep currency), reps done this run, what a rep pays now (flux and O/I), and the void perks. */
  flux: number;
  reps: number;
  /** When the last rep batch counted (ms since 1970; 0 before the rep clock starts). */
  lastRepAt: number;
  fluxPerRep: number;
  repGold: number;
  fluxBoost: number;
  voidPerks: Record<VoidPerkKey, number>;
  /** O/I to summon a Rift Titan now, and the flux slaying it pays. */
  summonCost: number;
  summonReward: number;
  /** ATP, the third currency. */
  atp: number;
  /** Dark energy, the fourth currency, the endless fel upgrades it bought, and the altar that makes it. */
  de: number;
  felPerks: Record<FelPerkKey, number>;
  /** The next wave to bring fel super bosses, and which. */
  nextSuper: { wave: number; kinds: CreepKind[] };
  altar: {
    /** The whole DE each currency buys now. */
    can: { gold: number; flux: number; atp: number };
    /** Lives that can be sacrificed now (never the last). */
    lives: number;
  };
  /** The wake core: its level and stage, what the next level costs, and what it does now. */
  core: {
    level: number;
    stage: string;
    /** The stage to come, if any. */
    next: { level: number; name: string; copy: string } | null;
    cost: number;
    /** Levels the ATP buys right now with Max, and their price. */
    maxLevels: number;
    maxCost: number;
    pulses: boolean;
    damage: number;
    every: number;
    range: number;
    slow: number;
    aura: number;
    mend: number;
    pierce: number;
    /** ATP it makes each time a wave clears. */
    atp: number;
    dealt: number;
    kills: number;
    /** Towers a Radiant core boosts now. */
    boosts: number;
  };
  /** The core is the selected cell. */
  coreSelected: boolean;
  /** On a stitched map: its boards' names, and the one looked at (-1 for all). */
  boards: string[];
  board: number;
  message: string;
};

/** What the auto-chess HUD shows. */
export type ChessView = {
  phase: ChessPhase;
  round: number;
  hp: number;
  maxHp: number;
  gold: number;
  level: number;
  xp: number;
  /** XP the level needs for the next; 0 at the top level. */
  xpNext: number;
  onBoard: number;
  limit: number;
  bench: number;
  /** Shop slots, each with how many 1-star copies you own (3 merge). */
  shop: ({ kind: PieceKey; owned: number } | null)[];
  traits: {
    key: PieceKey;
    name: string;
    copy: string;
    count: number;
    step: number;
    next: number;
  }[];
  selected: { id: number; kind: PieceKey; star: number; area: Area; sell: number } | null;
  /** The boss of this round, if any. */
  boss: string | null;
  enemies: number;
  lastWin: boolean | null;
  lastDamage: number;
  /** Fast-forward: 1, 2 or 3. */
  speed: number;
  best: number;
  wins: number;
  kills: number;
  message: string;
};

/** Which sheet is open over the Court's world. */
export type CourtPanel =
  | { kind: "place"; place: PlaceKey }
  | { kind: "queen"; queen: QueenKey }
  /** Face to face with a queen: the talk screen. */
  | { kind: "talk"; queen: QueenKey }
  /** The Atelier: a look changed by hand (a queen's, or your own); from: the sheet it was opened on. */
  | { kind: "atelier"; who: QueenKey | "you"; from: "queen" | "queens" }
  | { kind: "shop" }
  | { kind: "skills" }
  | { kind: "queens" }
  | { kind: "gallery" }
  /** since: when the News was last read before this, to mark what is new. */
  | { kind: "news"; since?: number }
  | null;

/** A line of a talk: yours, hers, or a note (another queen, the Court). */
export type CourtTalkEntry = {
  id: number;
  who: "you" | "her" | "note";
  text: string;
  /** The tone of your line; how she took it; affection it won (or cost). */
  tone?: string;
  taste?: string | null;
  gain?: number;
};

/** The talk screen as it shows. */
export type CourtTalkView = {
  queen: QueenKey;
  log: CourtTalkEntry[];
  /** Lines of hers still to come: a tap on her line shows the next. */
  waiting: number;
  /** What you can say now; a tone's taste is known once you have tried the tone on her. */
  choices: { id: string; kind: string; text: string; tone?: string; taste?: string | null }[];
  ended: boolean;
  /** Sips left of the crystal wine poured in this talk (0: no bottle is open). */
  wine: number;
  /** Exchanges with her that still add affection today, of how many a day. */
  left: number;
  perDay: number;
  /** She will not talk yet (her need is not met). */
  locked: boolean;
};

/** A recite session as the screen shows it. */
export type CourtSessionView = {
  place: PlaceKey;
  skill: CourtSkillKey;
  queen: QueenKey | null;
  /** A second queen watching, when two walk with you. */
  also: QueenKey | null;
  date: boolean;
  /** A date night: crystal wine was poured for it. */
  wine: boolean;
  /** A deeper question over the wine waits on this recite: the talk comes back with her answer when it is through. */
  toast: boolean;
  phrase: string;
  words: string[];
  /** The lit word, the pass it is in (0-based), how far through the pass (0 to 1). */
  word: number;
  pass: number;
  progress: number;
  reps: number;
  /** Passes of this phrase already counted, and whether the current one is. */
  counted: number[];
  streak: number;
  totals: { xp: number; gold: number; reps: number };
  over: boolean;
  /** The words have finished and the pass waits for the tap that completes it; how long a pass takes (ms). */
  waiting: boolean;
  passMs: number;
  /** Phrases in the round, completed so far, whether the round is complete, and what it paid. */
  round: number;
  roundPhrases: number;
  roundDone: boolean;
  roundTotals: { xp: number; gold: number; reps: number; phrases: number };
};

/** What the Court's screens show. */
export type CourtView = {
  save: CourtSave;
  total: number;
  panel: CourtPanel;
  session: CourtSessionView | null;
  /** XP and gold drops floating up, newest last. */
  drops: { id: number; text: string; color: string }[];
  /** Notices about the queens and rumors, on screen for a while, newest last. */
  notices: { id: number; text: string; queen: QueenKey | null; color: string }[];
  /** News not read yet, and the queen the town is talking about today. */
  unread: number;
  buzz: QueenKey;
  /** A feeling each queen has for a while (court.hearts.arcs), and when it ends. */
  feelings: Partial<Record<QueenKey, { id: CourtArcKey; ends: number }>>;
  /** Queens out on the map looking for you. */
  out: QueenKey[];
  /** How far through your texts' phrases the Court has come in this round of them. */
  /** How far through the recite's text (or all of them) the recites are: phrases recited through, and the percent. */
  deck: { done: number; total: number; percent: number; name: string; rounds: number };
  /** Each text a recite can draw from, with its progress: "" is all of them. */
  sources: { key: string; label: string; done: number; total: number; rounds: number }[];
  /** A queen with you who asks to be fed a set of reps, and when she gives up (ms). */
  hungry: {
    queen: QueenKey;
    /** Every queen with you who wants the same: one set does for them all. */
    queens: QueenKey[];
    /** Feeding (a set of reps) or a prayer (a timed set of `minutes`). */
    kind: "feed" | "pray";
    minutes: number;
    id: string;
    text: string;
    size: number;
    until: number;
  } | null;
  /** The latest line: a queen's, or yours; and how many more wait behind it (a tap on it shows the next). */
  line: { speaker: string; text: string; color: string; queen?: QueenKey } | null;
  lineMore: number;
  /** Rehearse is up over the Court (its Sound button): the Court's clock is held. */
  away: boolean;
  /** The recite's sound was paused by hand (it starts by itself again with the next recite). */
  soundMuted: boolean;
  /** The talk screen: what has been said, her lines still to come, and what you can say now. */
  talk: CourtTalkView | null;
  /** What the queen whose sheet is open is doing by herself now (life.ts); "" for nothing to say. */
  lifeNote: string;
  /** Where you stand, if at a place, and the region you are in. */
  at: PlaceKey | null;
  region: string;
  message: string;
  /** How each queen feels now, and who she is jealous of. */
  moods: Record<QueenKey, Mood>;
  rivals: Partial<Record<QueenKey, QueenKey>>;
  /** Today's wish from each queen: passes of a skill, how many so far, and whether granted. */
  wishes: Record<
    QueenKey,
    {
      skill: CourtSkillKey;
      passes: number;
      progress: number;
      done: boolean;
      /** On an alliance day, the sister or friend who shares this wish. */
      with?: QueenKey;
    }
  >;
};

/** Starting settings for a new player, from config.json. */
export const defaultSettings: Settings = {
  ...CONFIG.settings,
  mode:
    CONFIG.settings.mode === "chaos" || CONFIG.settings.mode === "sphere"
      ? CONFIG.settings.mode
      : "field",
};

export const initialHud: Hud = {
  wave: 0,
  integrity: 100,
  hz: 8,
  oi: 0,
  combo: 0,
  blessing: 0,
  blessingReady: false,
  speaker: QUEEN,
  line: "I have been waiting in the static. Load your words, or take mine.",
  bestWave: 0,
  bestOi: 0,
  banner: "",
  gaba: false,
  shield: false,
  armory: false,
  slowed: false,
  upgrades: { sharpen: 0, tempo: 0, verse: 0 },
  potions: { salve: 0, draught: 0 },
};

export const initialChrome: Chrome = { top: 120, bottom: 250, right: 0 };

/** Puts a line in the speech box. The tower-defense and chess HUDs read it from here. */
export function setSpeech(speaker: string, line: string) {
  useGame.setState({ hud: { ...useGame.getState().hud, speaker, line } });
}

type State = {
  phase: Phase;
  tomeOpen: boolean;
  paused: boolean;
  toast: string;
  custom: boolean;
  settings: Settings;
  lines: string[];
  /** Every loaded text, read in turn; `lines` is the one in use. Empty for the built-in text. */
  texts: LoadedText[];
  folders: TextFolder[];
  textIndex: number;
  hud: Hud;
  chrome: Chrome;
  gameMode: GameMode;
  panel: Panel;
  /** The options window, which changes settings while the game runs. */
  drawer: boolean;
  /** Tab shown in the options window. */
  optionsTab: OptionsTab;
  /** The game menu (Esc), and whether opening it paused the game. */
  menu: boolean;
  menuPaused: boolean;
  /** Experience points per skill. Kept on this device only. */
  skills: Record<SkillKey, number>;
  /** The tower-defense map picked on the title screen. */
  tdMap: string;
  /** Tower-defense difficulty picked on the title screen. */
  tdDifficulty: DifficultyKey;
  /** The saved tower-defense run, if there is one. */
  tdRun: RunSummary | null;
  tdView: TdView;
  chessView: ChessView;
  courtView: CourtView | null;
};

export const useGame = create<State>(() => ({
  phase: "title",
  tomeOpen: false,
  paused: false,
  toast: "",
  custom: false,
  settings: defaultSettings,
  lines: DEFAULT_CODEX,
  texts: [],
  folders: [],
  textIndex: 0,
  hud: initialHud,
  chrome: initialChrome,
  gameMode: "arcade",
  panel: "none",
  drawer: false,
  optionsTab: "game",
  menu: false,
  menuPaused: false,
  skills: { recitation: 0, recall: 0 },
  tdMap: CONFIG.td.defaultMap,
  tdDifficulty: "normal",
  tdRun: null,
  tdView: {
    phase: "build",
    gold: 150,
    lives: 20,
    maxLives: 20,
    wave: 0,
    cleared: 0,
    kills: 0,
    bestWave: 0,
    bests: {},
    active: 0,
    pending: 0,
    onBoard: 0,
    auto: false,
    speed: 1,
    nextBonus: 0,
    bossNext: false,
    selected: null,
    canBuild: false,
    tower: null,
    perks: { damage: 0, rate: 0, range: 0, interest: 0, lives: 0, thrift: 0 },
    difficulty: "normal",
    spells: { storm: 0, still: 0 },
    next: [],
    boss: null,
    report: [],
    flux: 0,
    reps: 0,
    lastRepAt: 0,
    fluxPerRep: CONFIG.td.void.fluxPerRep,
    repGold: 0,
    fluxBoost: 0,
    voidPerks: { yield: 0, power: 0, reach: 0, tithe: 0 },
    summonCost: CONFIG.td.void.summonGold,
    summonReward: CONFIG.td.void.summonFlux,
    atp: 0,
    de: 0,
    felPerks: { power: 0, haste: 0, reach: 0, tithe: 0, barter: 0, devour: 0 },
    nextSuper: { wave: CONFIG.td.fel.supers.from, kinds: [] },
    altar: { can: { gold: 0, flux: 0, atp: 0 }, lives: 0 },
    core: {
      level: 1,
      stage: "",
      next: null,
      cost: CONFIG.td.core.cost,
      maxLevels: 0,
      maxCost: 0,
      pulses: false,
      damage: 0,
      every: CONFIG.td.core.pulse.every,
      range: CONFIG.td.core.pulse.range,
      slow: 0,
      aura: 0,
      mend: 0,
      pierce: 0,
      atp: CONFIG.td.core.atpPerWave,
      dealt: 0,
      kills: 0,
      boosts: 0,
    },
    coreSelected: false,
    boards: [],
    board: -1,
    message: "Tap a free cell to raise a tower.",
  },
  courtView: null,
  chessView: {
    phase: "plan",
    round: 1,
    hp: CONFIG.chess.startHp,
    maxHp: CONFIG.chess.startHp,
    gold: CONFIG.chess.startGold,
    level: CONFIG.chess.startLevel,
    xp: 0,
    xpNext: 0,
    onBoard: 0,
    limit: CONFIG.chess.startLevel,
    bench: 0,
    shop: [],
    traits: [],
    selected: null,
    boss: null,
    enemies: 0,
    lastWin: null,
    lastDamage: 0,
    speed: 1,
    best: 0,
    wins: 0,
    kills: 0,
    message: "Buy pieces in the shop, then press Fight.",
  },
}));
