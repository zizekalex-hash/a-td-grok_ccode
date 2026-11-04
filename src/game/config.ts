/**
 * Typed view of config.json. The shape below is checked against the file by
 * `npm run typecheck`, and config.test.ts checks the values, so a bad edit is
 * caught before it reaches the game. No path aliases here: the Node tests load
 * this file directly.
 */
import raw from "./config.json" with { type: "json" };
import { bootCfg, type CfgStatus } from "./cfg.ts";
import { applyPendingRestore, deviceStore } from "./backup.ts";

/** A phrase in raw binary, standing still behind a screen (see court.wall._about). */
export interface BinaryWallConfig {
  enabled: boolean;
  opacity: number;
  minFont: number;
  maxFont: number;
  fallbackFont: number;
  fill: number;
}

export interface Range {
  min: number;
  max: number;
  step: number;
}

export interface EnemyStats {
  hp: number;
  speed: number;
  radius: number;
  leak: number;
}

export interface SpawnRule {
  kind: string;
  fromWave: number;
  chance: number;
}

export type TdTowerKey =
  | "ink"
  | "verse"
  | "sigil"
  | "comma"
  | "echo"
  | "cipher"
  | "focus"
  | "muse"
  | "archive"
  | "eraser"
  | "tachyon"
  | "railgun"
  | "antimatter"
  | "graviton"
  | "entangler"
  | "plasma"
  | "quasar"
  | "wormhole"
  | "reactor"
  | "singularity";

export type TdCreepKind =
  | "adenosine"
  | "gaba"
  | "vlpo"
  | "melatonin"
  | "galanin"
  | "theta"
  | "spindle"
  | "rem"
  | "glycine"
  | "pressure"
  | "circadian"
  | "somnus"
  | "rift";

export type TdPerkKey = "damage" | "rate" | "range" | "interest" | "lives" | "thrift";
/** Upgrades bought with flux. */
export type TdVoidPerkKey = "yield" | "power" | "reach" | "tithe";

export interface TdTowerSpec {
  name: string;
  label: string;
  /** One word for the build menu. */
  role: string;
  color: string;
  copy: string;
  cost: number;
  range: number;
  /** Shots per second at level 1. Zero for towers that do not fire. */
  rate: number;
  damage: number;
  splash?: number;
  slow?: number;
  slowTime?: number;
  /** Extra creeps an instant strike jumps to. */
  chain?: number;
  /** Damage per second while burning, and how long it lasts. */
  burn?: number;
  burnTime?: number;
  /** Share of armor ignored, 0 to 1. */
  pierce?: number;
  /** Fires a continuous beam that ramps up on one target. */
  beam?: boolean;
  ramp?: number;
  maxRamp?: number;
  /** Damage bonus for towers next to this one. */
  aura?: number;
  /** O/I paid when a wave clears. */
  income?: number;
  /** A void tower: built, upgraded and specialized with flux (td.void), not O/I. */
  void?: boolean;
  /** Fire-rate bonus for towers in its circle. */
  haste?: number;
  /** Flux paid when a wave clears. */
  fluxIncome?: number;
  /** Creeps (not bosses) at this share of life or less, in its circle or hit by it, collapse. */
  execute?: number;
  /** Extra damage creeps in range take (0.15 = +15%), and the share of their armor they lose. */
  vuln?: number;
  shred?: number;
  /** The two specializations offered at the top level. */
  paths?: TdPathSpec[];
  /** The two Ascensions offered at td.ascendLevel, after a path. */
  ascend?: TdPathSpec[];
}

/** Stats a path can scale. */
export type TdPathMult = "damage" | "rate" | "burn";
/** Stats a path can add to. haste speeds up towers next to it; bounty raises what kills pay. */
export type TdPathAdd =
  | "range"
  | "splash"
  | "slow"
  | "slowTime"
  | "chain"
  | "burn"
  | "burnTime"
  | "pierce"
  | "ramp"
  | "maxRamp"
  | "aura"
  | "income"
  | "haste"
  | "bounty"
  | "vuln"
  | "shred"
  | "execute"
  | "fluxIncome";

/** A tower specialization: multipliers and additions on its stats. */
export interface TdPathSpec {
  name: string;
  copy: string;
  mult?: Partial<Record<TdPathMult, number>>;
  add?: Partial<Record<TdPathAdd, number>>;
}

export type TdSpellKey = "storm" | "still";
export type TdDifficultyKey = "easy" | "normal" | "hard";

export interface TdCreepSpec {
  name: string;
  label: string;
  color: string;
  hp: number;
  speed: number;
  gold: number;
  leak: number;
  /** Radius as a share of a cell. */
  size: number;
  sides: number;
  armor?: number;
  /** Hit points regained per second. */
  regen?: number;
  /** Hit points per second given to other creeps within healRange. */
  heal?: number;
  healRange?: number;
  /** Kind it breaks into when it dies, and how many. */
  split?: string;
  splitCount?: number;
  /** Arrives in packs of swarmSize. */
  swarm?: boolean;
  boss?: boolean;
  /** Kind it calls up while walking, how often and how many. */
  summon?: string;
  summonEvery?: number;
  summonCount?: number;
}

export interface TdMapSpec {
  name: string;
  blurb: string;
  /** Corners of the lane as [column, row], from the gate to the core. */
  waypoints: number[][];
  /** Replaces td.startGold on this map. */
  startGold?: number;
  /** Two or more lanes, each from its own gate to the same core (waypoints is then the first). */
  lanes?: number[][][];
}

export interface TdPerkSpec {
  name: string;
  copy: string;
  max: number;
  baseCost: number;
  costPerLevel: number;
  amount: number;
  cap?: number;
}

export type ChessPieceKey = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
export type ChessStat = "hp" | "maxHit" | "acc" | "def";

export interface ChessAbilitySpec {
  name: string;
  copy: string;
  /** Mana to cast; 0 means the ability is passive and never cast. */
  mana: number;
  power: number;
  stunTicks?: number;
}

export interface ChessPieceSpec {
  name: string;
  /** Shop tier, 1 to 5. */
  tier: number;
  cost: number;
  hp: number;
  maxHit: number;
  /** Accuracy and defence rolls. */
  acc: number;
  def: number;
  /** Ticks between attacks. */
  speed: number;
  /** Reach in squares, counting diagonals as one. */
  range: number;
  /** Ticks between moves. */
  moveTicks: number;
  copy: string;
  ability: ChessAbilitySpec;
}

export interface ChessTraitSpec {
  name: string;
  copy: string;
  /** Applies to every piece on the board, not only this kind. */
  all: boolean;
  /** One of ChessStat: hp, maxHit, acc or def. */
  stat: string;
  /** Pieces of the kind needed for each step, and the stat bonus at it (0.3 = +30%). */
  steps: { need: number; bonus: number }[];
}

export type CourtElement = "fire" | "water";
export type CourtSkillKey =
  | "strength"
  | "grace"
  | "woodcutting"
  | "herbalism"
  | "mining"
  | "crystal"
  | "charisma"
  | "song"
  | "lore"
  | "serenity"
  | "magic"
  | "dream"
  | "stamina"
  | "harmony"
  | "smithing"
  | "fishing"
  | "archery"
  | "dance"
  | "cooking"
  | "alchemy";
export type CourtRegionKey = "realm" | "isles" | "peaks";
export type CourtPlaceKey =
  | "yard"
  | "forest"
  | "mine"
  | "inn"
  | "library"
  | "void"
  | "shire"
  | "palace"
  | "market"
  | "to_isles"
  | "to_peaks"
  | "isles_ferry"
  | "harbor"
  | "grotto"
  | "spire"
  | "temple"
  | "peaks_road"
  | "forge"
  | "arena"
  | "springs"
  | "hall"
  | "sanctum";
export type CourtQueenKey =
  | "eltharia"
  | "alexstrasza"
  | "ysera"
  | "onyxia"
  | "azshara"
  | "xalatath"
  | "jaina"
  | "tyrande"
  | "sylvanas"
  | "sinestra"
  | "valeera";
export type CourtGiftKey =
  | "flowers"
  | "mead"
  | "poems"
  | "lily"
  | "dragonglass"
  | "jewel"
  | "pearl"
  | "moonwell"
  | "arrow"
  | "ember"
  | "dagger"
  | "voidshard";
/** Situations a queen has lines for. {skill}, {level}, {tier}, {need}, {hours}, {rival} and {count} are filled in. */
export type CourtLineKey =
  | "greet"
  | "locked"
  | "watch"
  | "streak"
  | "levelUp"
  | "gift"
  | "giftLoved"
  | "tierUp"
  | "dateStart"
  | "dateEnd"
  /** Back after a long time away ({hours}); jealous of a rival ({rival}); made up again. */
  | "missed"
  | "jealous"
  | "reconciled"
  /** Today's wish ({count} passes of {skill}), and when you grant it. */
  | "wish"
  | "wishDone"
  /** Passes recited for her that she remembers ({count}). */
  | "memory";

/** A queen's feeling that lasts a while (court.hearts.arcs). */
export type CourtArcKey =
  | "lonely"
  | "seeking"
  | "present"
  | "satisfied"
  | "distant"
  | "confront"
  | "softened";

export interface CourtArcSpec {
  name: string;
  copy: string;
  durationMinutes: number;
  /** One of the moods in court/hearts.ts. */
  mood: string;
  affection: number;
}

/** A region of the Court's world: its own map, and where you arrive on a new game. */
export interface CourtRegionSpec {
  name: string;
  blurb: string;
  /** Colour of its name and glow. */
  tint: string;
  start: number[];
  map: string[];
}

export interface CourtPlaceSpec {
  name: string;
  /** The region it stands in. */
  region: string;
  /** Its letter on the map: lowercase marks the door or spot you stand on, uppercase the building. */
  letter: string;
  blurb: string;
  /** Skill trained in each style; empty for a place that trains none. */
  fire: string;
  water: string;
  goldMult: number;
  /** A way to another region: the place you arrive at there, and what you need to pass. */
  gate?: { to: string; toPlace: string; need: { skill: string; level: number } };
}

/** The traits a queen's portrait is drawn from. */
export interface CourtLook {
  skin: string;
  hair: string;
  /** Hair highlight, eyeshadow and lipstick; a shade of the hair or gown when left out. */
  sheen?: string;
  shadow?: string;
  lips?: string;
  hairStyle: string;
  eyes: string;
  eyeStyle: string;
  ears: string;
  horns: string;
  headpiece: string;
  accent: string;
  bg: string[];
  marking: string;
  /** gown, corset, scales, regal, void, robe, coat, armor or leather; and an adornment in her hair. */
  outfit?: string;
  adorn?: string;
}

export interface CourtQueenSpec {
  name: string;
  title: string;
  color: string;
  place: string;
  /** Where she stands, [column, row]. */
  at: number[];
  element: string;
  /** Skills she loves to see you level. */
  favored: string[];
  /** Her favourite gift, worth double. */
  gift: string;
  /** What she asks before more than hello: a skill (or "total" for total level) and a level. */
  need: { skill: string; level: number };
  date: string;
  /** How her portrait is drawn (see court._about). */
  look: CourtLook;
  /** Who she is, for a connected model. */
  persona: string;
  lines: Record<CourtLineKey, string[]>;
}

export interface GameConfig {
  settings: {
    flashMs: number;
    textSize: number;
    opacity: number;
    density: number;
    mode: string;
    holo: boolean;
    shake: boolean;
    muted: boolean;
    textScale: number;
    binaryOpacity: number;
    binaryPitch: number;
    wordFlashMs: number;
    gameSpeed: number;
    uiScale: number;
    fpsCap: number;
    renderScale: number;
    phraseEvery: number;
    phrasePauseMs: number;
    textPauseMs: number;
    /** Sound volume, 0 to 100. */
    volume: number;
    /** Show a frames-per-second counter. */
    showFps: boolean;
  };
  settingLimits: Record<
    | "flashMs"
    | "textSize"
    | "opacity"
    | "density"
    | "textScale"
    | "binaryOpacity"
    | "binaryPitch"
    | "wordFlashMs"
    | "gameSpeed"
    | "uiScale"
    | "fpsCap"
    | "renderScale"
    | "phraseEvery"
    | "phrasePauseMs"
    | "textPauseMs"
    | "volume",
    Range
  >;
  ui: {
    /** Show spoken lines (council and narrator). When false, only text from the tome is shown. */
    showSpeech: boolean;
  };
  rain: {
    fontSize: number;
    rowStep: number;
    speed: number;
    reducedMotionSpeed: number;
    alpha: number;
    streakMin: number;
    streakMax: number;
  };
  field: { minSize: number; maxSize: number; alpha: number };
  arcade: {
    waves: {
      baseCount: number;
      countPerWave: number;
      maxCount: number;
      baseInterval: number;
      intervalDropPerWave: number;
      minInterval: number;
      hpGrowthPerWave: number;
      bossEvery: number;
    };
    spawnRules: SpawnRule[];
    enemies: Record<"adenosine" | "gaba" | "vlpo" | "pressure", EnemyStats>;
  };
  td: {
    startGold: number;
    startLives: number;
    defaultMap: string;
    maps: Record<string, TdMapSpec>;
    maxLevel: number;
    levelGrowth: {
      damage: number;
      rate: number;
      range: number;
      slow: number;
      aura: number;
      income: number;
      vuln: number;
      fluxIncome: number;
    };
    upgradeCostFactor: number;
    masteryCostGrowth: number;
    sellRefund: number;
    earlySend: { base: number; perWave: number };
    autoSendDelay: number;
    maxActiveWaves: number;
    maxArmor: number;
    bossSlowResist: number;
    /** A path costs this many times the tower's price. */
    pathCostFactor: number;
    /** Level an Ascension opens at, and its price as a multiple of the tower's. */
    ascendLevel: number;
    ascendCostFactor: number;
    /** Largest circle a tower that does not fire (Muse, Eraser) grows to. */
    maxSupportRange: number;
    /** Waves cleared on a map for bronze, silver and gold. */
    medals: number[];
    /** Most that Scriptoria together can raise kill pay (0.6 = +60%). */
    maxBounty: number;
    spells: {
      storm: { name: string; copy: string; cooldown: number; damage: number; bossShare: number };
      still: { name: string; copy: string; cooldown: number; slow: number; time: number };
    };
    difficulties: Record<TdDifficultyKey, { name: string; copy: string; hp: number; gold: number; lives: number }>;
    waves: {
      baseCount: number;
      countPerWave: number;
      maxCount: number;
      baseInterval: number;
      intervalDropPerWave: number;
      minInterval: number;
      hpLinear: number;
      hpQuadratic: number;
      speedPerWave: number;
      maxSpeedBonus: number;
      armorFromWave: number;
      armorPerWave: number;
      maxArmorBonus: number;
      goldPerWave: number;
      clearBonusBase: number;
      clearBonusPerWave: number;
      bossEvery: number;
      extraBossEvery: number;
      bossHpPerBossWave: number;
      swarmSize: number;
      /** First wave each kind can appear in. Kinds missing here only arrive as splits or summons. */
      unlocks: Record<string, number>;
      /** How often each kind is picked, relative to the others. */
      weights: Record<string, number>;
    };
    bosses: string[];
    towers: Record<TdTowerKey, TdTowerSpec>;
    creeps: Record<TdCreepKind, TdCreepSpec>;
    perks: Record<TdPerkKey, TdPerkSpec>;
    /** Flux, the rep currency, and what it buys (see td.void._about). */
    void: {
      fluxPerRep: number;
      /** Flux a rep goes up by for every repGrowthEvery reps done in the run. */
      repGrowth: number;
      repGrowthEvery: number;
      repSeconds: number;
      /** Reps one tap can count at once (each takes repSeconds). */
      batches: number[];
      startFlux: number;
      summonGold: number;
      summonGoldPerWave: number;
      summonFlux: number;
      summonFluxPerWave: number;
      summonBoost: number;
      summonBoostMax: number;
      perks: Record<TdVoidPerkKey, TdPerkSpec>;
    };
  };
  chess: {
    startHp: number;
    startGold: number;
    startLevel: number;
    income: number;
    interestPer: number;
    maxInterest: number;
    winGold: number;
    refreshCost: number;
    xpCost: number;
    xpPerBuy: number;
    xpPerRound: number;
    levelXp: number[];
    shopSize: number;
    benchSize: number;
    odds: number[][];
    tickSeconds: number;
    maxTicks: number;
    overtimeFrom: number;
    overtimeGrowth: number;
    resultSeconds: number;
    starGrowth: number;
    starRollGrowth: number;
    maxStars: number;
    manaPerAttack: number;
    manaPerHurt: number;
    loss: { base: number; perRound: number };
    enemy: {
      budget: number;
      budgetPerRound: number;
      budgetQuadratic: number;
      unitsBase: number;
      unitsPerRound: number;
      maxUnits: number;
      tierEvery: number;
      statsFrom: number;
      statsPerRound: number;
      bossEvery: number;
      bossHp: number;
      bossHpPerBoss: number;
      bossHit: number;
      bossShare: number;
      /** Boss pieces in turn, looping; kind is a piece key. */
      bosses: { kind: string; name: string }[];
    };
    pieces: Record<ChessPieceKey, ChessPieceSpec>;
    traits: Record<ChessPieceKey, ChessTraitSpec>;
  };
  court: {
    wordMs: number;
    wordMsMin: number;
    wordMsMax: number;
    /** Phrases in a round of reciting, before the round is complete. */
    phrasesPerRound: number;
    /** Day and night on the map, by the device's clock (see court.night._about). */
    night: { enabled: boolean; darkness: number };
    /** The current phrase flashing in the middle of the recite screen (see court.flash._about). */
    flash: { enabled: boolean; everyMs: number; lifeMs: number; size: number; opacity: number };
    /** The lit word on the recite screen (see court.word._about). */
    word: { size: number; glow: number; animate: boolean; sessionFps: number };
    /** The current phrase in raw binary behind the recite screen (see court.wall._about). */
    wall: BinaryWallConfig;
    /** A bonus set from Reps after each round (see court.bonus._about). */
    bonus: {
      enabled: boolean;
      maxWords: number;
      xpMult: number;
      goldMult: number;
      affection: number;
    };
    repsPerPhrase: number;
    minPhraseWords: number;
    maxPhraseWords: number;
    walkSpeed: number;
    xp: { perLetter: number; perWord: number; perRep: number; phrasePerWord: number };
    streakStep: number;
    streakMax: number;
    goldPerWord: number;
    /** Extra XP while a queen watches. */
    watchedBonus: number;
    affection: { perWord: number; elementBonus: number; levelUp: number; dateMult: number; dateBonus: number };
    affectionTiers: { name: string; at: number }[];
    dateTier: number;
    datePhrases: number;
    dateXpMult: number;
    /** How the queens feel: missing you, jealousy, daily wishes, memories (see court.hearts._about). */
    hearts: {
      missAfterHours: number;
      reunion: number;
      jealousTier: number;
      jealousMax: number;
      jealousMult: number;
      makeUp: number;
      wishPasses: number;
      wishAffection: number;
      wishGold: number;
      /** A day's chance of an alliance (a sister or friend pair sharing one wish), and its extra affection. */
      allianceChance: number;
      allianceBonus: number;
      fierceStreak: number;
      flashSeconds: number;
      memories: number[];
      galleryGold: number;
      /** Feelings that last a while (see court.hearts.arcs._about). */
      arcs: Record<CourtArcKey, CourtArcSpec>;
    };
    /** How the queens' portraits are drawn (see court.portraits._about). */
    portraits: { style: string };
    /** Queens coming out to find you on the map (see court.presence._about). */
    presence: {
      enabled: boolean;
      tickSeconds: number;
      firstSeconds: number;
      chancePerMinute: number;
      minTier: number;
      maxOut: number;
      buzzBoost: number;
      arcBoost: number;
      speed: number;
      followDist: number;
      lingerMinutes: number;
      encounterDist: number;
      encounterMinutes: number;
      doubleRivalExtra: number;
      doubleRivalMinutes: number;
      /** Two sisters or friends (or a pair with its own lines) with you: noticed once every so many minutes. */
      groupMinutes: number;
      /** Queens in groups (see court.presence.group._about). */
      group: { togetherChance: number; banterSeconds: number; secondWatcherXp: number };
      /** A queen with you asks to be fed a set of reps (see court.presence.feed._about). */
      feed: {
        enabled: boolean;
        afterSeconds: number;
        maxWords: number;
        affection: number;
        waitMinutes: number;
        snoozeSeconds: number;
        prayChance: number;
        prayMinutes: number;
        unaskedMult: number;
        perDay: number;
      };
      lines: Record<string, string[]>;
      notices: Record<string, string[]>;
    };
    /** Notices, news, rumors and the queens' bonds (see court.news._about). */
    news: {
      noticeSeconds: number;
      dropMs: number;
      keep: number;
      gossipEverySeconds: number;
      firstGossipSeconds: number;
      buzzMult: number;
      goodWord: number;
      talkChance: number;
      /** Who is whose sister, friend or rival: each pair once. */
      bonds: Record<string, Record<string, string>>;
      rumors: Record<string, string[]>;
      talk: Record<string, string[]>;
    };
    elixir: { name: string; copy: string; cost: number; reps: number; mult: number };
    regions: Record<CourtRegionKey, CourtRegionSpec>;
    places: Record<CourtPlaceKey, CourtPlaceSpec>;
    skills: Record<CourtSkillKey, { name: string; element: string; copy: string }>;
    gifts: Record<CourtGiftKey, { name: string; copy: string; cost: number; value: number }>;
    pickupLines: string[];
    queens: Record<CourtQueenKey, CourtQueenSpec>;
  };
  /** The Read tab of the Recitation drill (see reader._about). */
  reader: {
    wordMs: number;
    wordMsMin: number;
    wordMsMax: number;
    passes: number;
    maxPasses: number;
    wordSize: number;
    phraseSize: number;
    speed: number;
    fps: number;
    auto: boolean;
    silence: number;
    phraseSilence: number;
    font: string;
    minWords: number;
    accent: string;
    panelOpacity: number;
    wordX: number;
    wordY: number;
    phraseX: number;
    phraseY: number;
    phraseChars: number;
    centered: boolean;
    miniAuto: boolean;
    bytes: boolean;
    bytesOpacity: number;
    bytesRgb: number;
    bytesGray: number;
    bytesBits: number;
    bytesSharp: boolean;
    flash: boolean;
    flashEvery: number;
    flashMs: number;
    flashSize: number;
    flashOpacity: number;
    flashColor: string;
    flashChars: number;
    flashAvoid: boolean;
    flashReverse: string;
    perHit: number;
    stream: boolean;
    streamMs: number;
    streamPerHit: number;
    streamCopies: number;
    streamAbove: boolean;
    streamBelow: boolean;
    streamSides: boolean;
    streamGap: number;
    streamOrder: string;
    flashOrder: string;
    streamFlow: string;
    streamSize: number;
    streamOpacity: number;
    streamColor: string;
    confirmedFolder: string;
  };
  /** The Reps tab of the Recitation drill (see reps._about). */
  reps: {
    setSizes: number[];
    set: number;
    maxSet: number;
    secondsPerRep: number;
    xpPerWordRep: number;
    historyKeep: number;
    /** Timed sets (see reps.timer._about). */
    timer: { minutes: number; choices: number[]; maxMinutes: number; estimateSeconds: number };
    /** The rest screen while a set runs (see reps.wall._about). */
    wall: BinaryWallConfig;
    /** The timed set's alarm (see reps.alarm._about). */
    alarm: {
      on: boolean;
      amp: number;
      bitMs: number;
      hiHz: number;
      loHz: number;
      repeats: number;
      gapMs: number;
      maxBits: number;
    };
  };
  core: { damagePerLevel: number; maxDamageBonus: number };
  textPool: string[];
  narrator: {
    enabled: boolean;
    name: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    cooldownMs: number;
    events: Record<string, string>;
    priorityEvents: string[];
  };
}

/** config.json as shipped, before any changes made in Options → Advanced. */
export const DEFAULT_CONFIG: GameConfig = structuredClone(raw satisfies GameConfig);

export const CONFIG: GameConfig = raw satisfies GameConfig;

/** Changes from Options → Advanced, laid over config.json for this run. */
/**
 * A backup chosen in Options replaces this device's saves here, at the start,
 * before anything reads one (see backup.ts). True on the visit it did.
 */
export const RESTORED: boolean = (() => {
  const store = deviceStore();
  try {
    return !!store && applyPendingRestore(store);
  } catch {
    return false;
  }
})();

export const CFG_STATUS: CfgStatus = bootCfg(CONFIG);
