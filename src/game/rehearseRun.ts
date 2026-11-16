/**
 * Rehearse, kept going away from its tab. One copy of its state, shared by the
 * tab and the background; the floating window's reps taken as soon as they come
 * (with XP), whether the tab is open or not; and its sound (Nonstop, the phrase's
 * or text's .wav loop) playing on when the tab closes, if its Background setting
 * is on, with the app kept running (RehearseService) while it plays: a paused
 * player is woken again, and if the phone closed the app meanwhile, the sound
 * starts again when it opens. A closed window's last phrase is never taken as
 * where you are.
 */
import { flashToast, grantSkillXp } from "@/game/engine";
import { checkState, markChecked, readReader, writeReader } from "@/game/readtext";
import { saveConfirmed } from "@/game/textFiles";
import { levelForXp, repXp } from "@/game/recite";
import { logRehearse, readReps, writeReps, wordsOf } from "@/game/reps";
import { useGame } from "@/game/store";
import { browserSay, voiceFile, voiceHere } from "@/game/voice";
import { swarmPlay, swarmStats, type SwarmPlay } from "@/game/swarm";
import { soundLog } from "@/game/soundLog";
import {
  fileLoop,
  holdAudio,
  setLiveRate,
  phraseLoop,
  voicePlayer,
  wakeAudio,
  type VoicePlayer,
  type FileLoop,
  type LoopSound,
  type PhraseLoop,
} from "@/game/phraseSound";
import {
  folderFileUrl,
  folderLoop,
  folderLoopVolume,
  folderName,
  onRenderTurn,
  outputRate,
  renderBack,
  renderHas,
  renderPlay,
  renderStop,
  type OutputRate,
} from "@/game/azsFolder";
import { readUnits } from "@/game/readtext";
import {
  askUnrestricted,
  batteryUnrestricted,
  bubbleState,
  closeBubble,
  keepAlive,
  onBubble,
  openBubble,
  takeBubbleReps,
  updateBubble,
  type BubbleSetup,
} from "@/game/repBubble";
import {
  activeOf,
  applyBubble,
  batchWaitMs,
  bubbleId,
  currentText,
  textAt,
  textGo,
  textProgress,
  textTapOn,
  closeSitting,
  voiceLayersOf,
  type RehearseSettings,
  type VoiceLayer,
  passedThrough,
  libraryOf,
  loadRehearse,
  newRehearse,
  REHEARSE_KEY,
  heardVoices,
  mainVoiceOf,
  voiceShapeOf,
  type HeardLayer,
  clampVoicePitch,
  clampVoiceRate,
  wavStyleOf,
  type LibText,
  type RehearseState,
  type WavStyle,
} from "@/game/rehearse";

// ---- The state ----

let state: RehearseState | null = null;
const subs = new Set<() => void>();

function readSaved(): RehearseState {
  try {
    const raw = localStorage.getItem(REHEARSE_KEY);
    return loadRehearse(raw ? JSON.parse(raw) : null);
  } catch {
    return newRehearse();
  }
}

/** Rehearse's state now (read once from the device, then kept here). */
export function rehearseState(): RehearseState {
  state ??= readSaved();
  return state;
}

/** A change to it: kept on the device at once, and shown wherever it is open. */
export function rehearseUpdate(fn: (s: RehearseState) => RehearseState) {
  const before = rehearseState();
  let next = fn(before);
  if (next === state) return;
  // Sittings over (another text, or long idle): into the History, at once.
  if (next.sat.length && logSittings(next)) next = { ...next, sat: [] };
  state = next;
  try {
    localStorage.setItem(REHEARSE_KEY, JSON.stringify(next));
  } catch {
    /* private mode or full */
  }
  for (const f of subs) f();
  // Another sample rate: every sound again, fresh, at it.
  if (next.settings.ttsRate !== before.settings.ttsRate) applyRate(next.settings.ttsRate);
  // The Court sounding its phrase meanwhile: as Rehearse is set now (paused, played again, another voice).
  if (next.settings !== before.settings) courtAgain();
  // Background turned on or off while it plays: the app kept running, or let rest.
  keep();
  // Moved on elsewhere (the reader, the window) with the tab closed: the sound follows.
  if (!open && alive) queueClosed();
  // A whole text running by itself, moved elsewhere (a tap, ‹ ›, the window, the reader): its voice jumps there.
  if (renderPlaying && rendered && !following) {
    const r = rendered;
    const t = currentText(next, rehearseLibrary());
    if (t?.key === r.textKey) {
      const was = before.text === next.text ? textAt(before, t.key, r.total) : -1;
      const now = textAt(next, t.key, r.total);
      if (now !== was) void seekRendered(now);
    }
  }
  // A text read through to its end (here, in the reader or a window): checked, its copy saved.
  // Just after, so a place saved in the same step (the reader's) is kept with it.
  const through = passedThrough(before, next);
  if (through.length && typeof window !== "undefined")
    window.setTimeout(() => through.forEach(autoCheck), 0);
}

/**
 * A text read through: checked as the Read tab checks it (so it shows ✓ there and
 * here), and its confirmed copy saved (Documents/confirmed_txt, in the phone app).
 * Already checked as it is now: nothing to do.
 */
function autoCheck(key: string) {
  const t = rehearseLibrary().find((x) => x.key === key);
  if (!t) return;
  const reader = readReader();
  if (checkState(reader, t.name, t.lines, t.folder) === "checked") return;
  writeReader(markChecked(reader, t.name, t.lines, Date.now(), t.folder));
  window.dispatchEvent(new Event(READER_CHANGED));
  flashToast(`“${t.name}” read through: checked ✓`);
  void saveConfirmed(t.name, t.lines, t.folder, true);
}

/** Sent when the Read tab's state (its checks) changed away from it: read it again. */
export const READER_CHANGED = "azshara-reader-changed";

let closedTimer = 0;
function queueClosed() {
  if (typeof window === "undefined") return;
  window.clearTimeout(closedTimer);
  closedTimer = window.setTimeout(() => void playClosed(), 40);
}

// ---- The Read tab's reader, opened from here ----

let readRequest: string | null = null;

/** Opens a text (by its key) in the Read tab's reader, at the place it is at; closing it comes back here. */
export function requestReader(key: string) {
  readRequest = key;
  window.dispatchEvent(new CustomEvent("azshara-drill-tab", { detail: "read" }));
}

/** The text asked for (once). */
export function takeReaderRequest(): string | null {
  const k = readRequest;
  readRequest = null;
  return k;
}

/** Back to Rehearse (the reader opened from it closed). */
export function backToRehearse() {
  window.dispatchEvent(new CustomEvent("azshara-drill-tab", { detail: "rehearse" }));
}

export function subscribeRehearse(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** The Read tab's texts now. */
export function rehearseLibrary(): LibText[] {
  const g = useGame.getState();
  return libraryOf(g.texts, g.custom, g.lines, g.folders);
}

/** The sitting on a text, if idle long enough: over, into the History. */
export function closeIdleSitting() {
  rehearseUpdate((s) => closeSitting(s, Date.now()));
}

/** Sittings over go into the History (Reps' log): each text's name as it is now. False: not written (kept for next time). */
function logSittings(s: RehearseState): boolean {
  try {
    const lib = rehearseLibrary();
    let reps = readReps();
    for (const c of s.sat) {
      if (c.reps <= 0) continue;
      const t = lib.find((x) => x.key === c.key);
      reps = logRehearse(reps, {
        at: c.start,
        text: t ? (t.folder ? `${t.folder} / ${t.name}` : t.name) : "a text",
        phrases: c.reps,
        passes: c.passes,
        ms: c.ms,
      });
    }
    writeReps(reps);
    return true;
  } catch {
    return false;
  }
}

/** Recitation XP for reps of a phrase (and the new level, if it went up). */
export function repXpFor(text: string, n: number) {
  const before = levelForXp(useGame.getState().skills.recitation);
  grantSkillXp("recitation", repXp(wordsOf(text), n));
  const after = levelForXp(useGame.getState().skills.recitation);
  if (after > before) flashToast(`Recitation level ${after}`);
}

// ---- The floating window ----

/** The phrase last sent to the window: what it shows then is not a choice made there. */
let sent = "";
let shown = false;

export function bubbleShown(): boolean {
  return shown;
}

function setShown(on: boolean) {
  if (on === shown) return;
  shown = on;
  for (const f of subs) f();
}

/** Opens the window with this (or says why it did not open). */
export async function showBubble(setup: BubbleSetup): Promise<string> {
  sent = setup.current;
  const msg = await openBubble(setup);
  if (!msg) setShown(true);
  return msg;
}

/** What the window shows, brought up to date. */
export async function sendBubble(setup: BubbleSetup) {
  sent = setup.current;
  await updateBubble(setup);
}

export async function hideBubble() {
  await closeBubble();
  setShown(false);
}

let taking: Promise<void> | null = null;

/**
 * Takes what was counted on the window: its reps (with their XP) and, if it is
 * open and moved there, the phrase it shows. One at a time.
 */
export function takeBubble(): Promise<void> {
  taking ??= (async () => {
    try {
      const r = await takeBubbleReps();
      if (!r) return;
      setShown(r.shown);
      const { state: next, xp } = applyBubble(rehearseState(), r, rehearseLibrary(), sent);
      if (r.shown && r.current) sent = r.current;
      for (const x of xp) repXpFor(x.text, x.n);
      rehearseUpdate(() => next);
      if (!open) void playClosed();
    } finally {
      taking = null;
    }
  })();
  return taking;
}

let started = false;

/** From the app's start: the window's reps counted as they come, and when the app comes back. */
export function startRehearseBackground() {
  if (started || typeof document === "undefined") return;
  started = true;
  // The app's sample rate, from the start.
  applyRate(rehearseState().settings.ttsRate);
  // A sitting long idle (the app away meanwhile, or closed): over, into the History; and again each minute.
  closeIdleSitting();
  window.setInterval(closeIdleSitting, 60_000);
  void onBubble(() => void takeBubble());
  document.addEventListener("visibilitychange", () => {
    if (alive) wakeAudio();
    if (!document.hidden) void takeBubble();
  });
  void bubbleState().then((b) => {
    setShown(b.shown);
    void takeBubble();
  });
  // Playing in the background when the phone closed the app: it plays on.
  if (wasPlaying() && rehearseState().settings.background) void playClosed();
  // A .tts.wav made while the tab is closed: it loops (the tab, open, starts it itself).
  window.addEventListener("azshara-tts-made", () => {
    if (!open && rehearseState().settings.background) void playClosed();
  });
}

// ---- The sample rate ----

/** The rate applied, and what the phone said of it (a USB DAC, the rate it was set to). */
let rateNow = 0;
let rateInfo: OutputRate | null = null;
const rateSubs = new Set<() => void>();

export function outputInfo(): OutputRate | null {
  return rateInfo;
}

export function subscribeOutput(fn: () => void): () => void {
  rateSubs.add(fn);
  return () => {
    rateSubs.delete(fn);
  };
}

/**
 * The app's sample rate: the live sound made at it, files looped at it (or at
 * their own, if lower), a USB DAC asked to run at it. Changed while it plays:
 * every sound stops and starts again, fresh, at the new rate (the tab, open,
 * plays its own; closed, the background's), and a whole text pre-rendered is
 * made again at it.
 */
function applyRate(rate: number) {
  if (rate === rateNow) return;
  const first = rateNow === 0;
  rateNow = rate;
  const changed = setLiveRate(rate);
  if (!first) soundLog(`Sample rate: ${rate / 1000} kHz, every sound started again at it`);
  void outputRate(rate).then((r) => {
    rateInfo = r;
    for (const f of rateSubs) f();
  });
  if (first || !changed) return;
  stopRehearseSound();
  stopRender();
  // The Court's own voices too: what it sounds is played again at the new rate (rehearseUpdate).
  stopCourtVoices();
  courtHush();
  window.setTimeout(() => {
    if (!open && rehearseState().settings.background) void playClosed();
  }, 0);
}

// ---- The sound ----

let loop: PhraseLoop | null = null;
let wav: FileLoop | null = null;
/** What plays now: the Nonstop phrase, and the .wav's address. */
let loopText = "";
let wavUrl = "";
let alive = false;
/** Whether the tab is open (it plays the sound itself then). */
let open = false;

/** .wav files picked by hand in a browser, by name (lower case), for this visit. */
export const pickedWavs = new Map<string, string>();

const PLAYING_KEY = "azshara-rehearse-playing";
const ASKED_KEY = "azshara-unrestricted-asked";

function wasPlaying(): boolean {
  try {
    return localStorage.getItem(PLAYING_KEY) === "1";
  } catch {
    return false;
  }
}

let watchdog = 0;

/** Playing in the background or not: the app kept running (and asked once to be Unrestricted), the players kept awake. */
function keep() {
  const on = !!(loopText || wavUrl || voiceText || ttsKey) && rehearseState().settings.background;
  if (on === alive) return;
  alive = on;
  void keepAlive(on);
  holdAudio(on);
  window.clearInterval(watchdog);
  try {
    if (on) localStorage.setItem(PLAYING_KEY, "1");
    else localStorage.removeItem(PLAYING_KEY);
  } catch {
    /* private mode */
  }
  if (!on) return;
  // A player paused by the phone (or another app's sound) is woken again.
  watchdog = window.setInterval(wakeAudio, 3000);
  void askOnce();
}

/** The first time it plays in the background: Android asked to let the app always run. */
async function askOnce() {
  try {
    if (localStorage.getItem(ASKED_KEY)) return;
    if ((await batteryUnrestricted()) !== false) return;
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    return;
  }
  await askUnrestricted();
}

/** The phrase's sound all the time (null: off). */
export function playNonstop(text: string | null, sound?: LoopSound) {
  loop ??= phraseLoop();
  if (text && sound) {
    loop.play(text, sound);
    loopText = text;
  } else {
    loop.stop();
    loopText = "";
  }
  keep();
}

/** A .wav looped as it is, in a style (null: off). */
export async function playWav(url: string | null, gain = 1, style?: WavStyle): Promise<boolean> {
  wav ??= fileLoop();
  if (!url) {
    wav.stop();
    wavUrl = "";
    keep();
    return false;
  }
  wavUrl = url;
  keep();
  const ok = await wav.play(url, gain, style);
  if (ok && style) wav.style(style);
  if (!ok && wavUrl === url) {
    wavUrl = "";
    keep();
  }
  return ok;
}

export function wavGain(gain: number) {
  wav?.gain(gain);
}

export function wavStyle(style: WavStyle) {
  wav?.style(style);
}

export function stopRehearseSound() {
  playNonstop(null);
  void playWav(null);
  void playVoice(null);
  void playTts(null);
}

// ---- The .tts.wav loop ----

/** What loops now: its path in the azs-folder (the phone plays it) or its address (a browser). */
let ttsKey = "";
let ttsWeb: FileLoop | null = null;
let ttsAsk = 0;

/**
 * A .tts.wav looped as it is (null: off). On the phone a file of the azs-folder
 * (by its path there), played by the phone itself a piece at a time: any length
 * and rate, in the background too. In a browser, a file picked by hand.
 */
export async function playTts(
  where: { path: string } | { url: string } | null,
  volume = 1,
): Promise<boolean> {
  const ask = ++ttsAsk;
  const key = where ? ("path" in where ? where.path : where.url) : "";
  if (!where || !key) {
    if (ttsKey) {
      void folderLoop(null);
      ttsWeb?.stop();
    }
    ttsKey = "";
    keep();
    return false;
  }
  const was = ttsKey;
  ttsKey = key;
  keep();
  let ok: boolean;
  if ("path" in where) {
    if (was && was !== key) ttsWeb?.stop();
    ok = await folderLoop(where.path, volume);
  } else {
    if (was && was !== key) void folderLoop(null);
    ttsWeb ??= fileLoop();
    ok = await ttsWeb.play(where.url, volume);
  }
  // Not there (or not playable): whatever looped before stops too.
  if (!ok && ask === ttsAsk && ttsKey === key) {
    void folderLoop(null);
    ttsWeb?.stop();
    ttsKey = "";
    keep();
  }
  return ok;
}

export function ttsGain(volume: number) {
  if (!ttsKey) return;
  void folderLoopVolume(volume);
  ttsWeb?.gain(volume);
}

/** The phrase's (or text's) .tts.wav with the tab closed, if it loops. */
async function closedTts(a: { dir: string; name: string }, on: boolean, volume: number) {
  if (!on || !a.name) {
    void playTts(null);
    return;
  }
  const file = `${a.name}.tts.wav`;
  const url = pickedWavs.get(file.toLowerCase());
  if (url) void playTts({ url }, volume);
  else if (await folderName()) void playTts({ path: `${a.dir}/${file}` }, volume);
  else void playTts(null);
}

// ---- The robot voice ----

/** The main voice (layer 1's first voice): it says the phrase, or reads a whole text a phrase at a time. */
let mainVoice: VoicePlayer | null = null;
/** The place the main voice last read through (said: not again there, till it moves). */
let readerSaid = "";
let voiceText = "";
let voiceAsk = 0;
let browserStop: (() => void) | null = null;
/** The background voices' mix, started again a moment after the last change (not at every step). */
let swarmTimer = 0;
let swarmNext: SwarmPlay | null = null;

/** Every live voice stops (the main voice, the background mix, the browser's). */
function stopVoices() {
  mainVoice?.stop();
  queueSwarm(null);
  readerSaid = "";
  browserStop?.();
  browserStop = null;
}

/**
 * The background mix plays this: at once if it only moved on (a new phrase) or
 * stops; otherwise (layers or voices changed) after a short pause, so a number
 * stepped up and down is mixed again once, not at every step.
 */
function queueSwarm(p: SwarmPlay | null) {
  if (typeof window === "undefined") return;
  window.clearTimeout(swarmTimer);
  const st = swarmStats();
  const same = !!p && !!swarmNext && swarmNext.key === p.key;
  swarmNext = p;
  if (!p || same || !st.running) {
    swarmPlay(p);
    return;
  }
  swarmTimer = window.setTimeout(() => swarmPlay(swarmNext), 600);
}

/** Where the text being repped is: its key, the phrase, its passes, and the next phrase's words. */
function readerPlace(s: RehearseState) {
  const t = currentText(s, rehearseLibrary());
  if (!t) return null;
  const units = readUnits(t.lines);
  const at = textAt(s, t.key, units.length);
  const passes = textProgress(s, t.key).passes;
  return {
    key: t.key,
    at,
    tag: `${t.key}#${passes}#${at}`,
    next: units[at + 1]?.text ?? units[0]?.text ?? "",
  };
}

/** The main voice has read a phrase and its silence: on by itself, the text goes on (as a tap). */
function readerEnded(key: string, at: number) {
  const s = rehearseState();
  if (!s.settings.voiceAuto || s.settings.paused || s.view !== "texts") return;
  const t = currentText(s, rehearseLibrary());
  if (!t || t.key !== key) return;
  const total = readUnits(t.lines).length;
  if (textAt(s, t.key, total) !== at) return;
  advanceByVoice(t, at, total);
}

/** How a layer's voice says it (its voice, rate and pitch, in Rehearse's engine). */
const sayOf = (set: RehearseSettings, l: VoiceLayer) => ({
  ...set,
  voiceName: l.voiceName,
  voiceRate: l.voiceRate,
  voicePitch: l.voicePitch,
});

/**
 * What the background mix plays: every heard voice but the main one, each
 * layer saying the phrase or (whole texts) reading the whole text by itself.
 */
function swarmOf(st: RehearseState, text: string, heard: HeardLayer[]): SwarmPlay | null {
  const set = st.settings;
  const texts = st.view === "texts";
  const t = texts ? currentText(st, rehearseLibrary()) : undefined;
  const units = t ? readUnits(t.lines).map((u) => u.text) : [];
  const phrases = texts && units.length ? units : [text];
  const phrase = texts && t ? textAt(st, t.key, units.length) : 0;
  // Layers with the same voice share their sayings.
  const voiceKeys: string[] = [];
  const voiceOf = (l: VoiceLayer) => {
    const k = JSON.stringify([l.voiceName, l.voiceRate, l.voicePitch]);
    let i = voiceKeys.indexOf(k);
    if (i < 0) i = voiceKeys.push(k) - 1;
    return i;
  };
  const says: VoiceLayer[] = [];
  const layers: SwarmPlay["layers"] = { phrase: [], text: [] };
  for (const h of heard) {
    // Layer 1's first voice is the main voice: played by itself, live.
    const vs = h.index === 0 ? h.voices.slice(1) : h.voices;
    if (!vs.some((v) => v.gain > 0)) continue;
    const voice = voiceOf(h.layer);
    says[voice] = h.layer;
    const mode = texts && h.layer.voiceWhole && units.length ? "text" : "phrase";
    layers[mode].push({
      voices: vs.map((v) => ({ at: v.at, speed: v.speed, gain: v.gain })),
      mode,
      loop: h.layer.voiceLoop,
      gapSec: h.layer.voiceGapMs / 1000,
      reverse: h.layer.voiceReverse,
      robot: h.layer.voiceRobot,
      robotHz: h.layer.voiceRobotHz,
      panHz: h.layer.voicePanHz,
      voice,
    });
  }
  if (!layers.phrase.length && !layers.text.length) return null;
  const list = texts && t ? `text:${t.key}:${hash(t.lines.join("\n"))}` : `phrase:${text}`;
  return {
    key: JSON.stringify([layers, voiceKeys, set.voiceEngine, set.ttsRate]),
    list,
    phrases,
    phrase,
    layers,
    aheadSec: set.mixAheadSec,
    say: (voice: number, words: string) => voiceFile(words, sayOf(set, says[voice]!)),
  };
}

/**
 * The robot voice, shaped by Rehearse's settings; null (or the voice off) stops
 * it. The main voice (layer 1's first voice) says the phrase (Repeats times,
 * then waits for the tap; 0: over and over) or, on a whole text with layer 1
 * reading the whole text, reads it a phrase at a time (on by itself, or
 * waiting for the tap). Every other voice is background, mixed into one sound
 * (the swarm): a layer saying the phrase says it over and over; a layer reading
 * the whole text has each voice read it by itself from its first phrase. Gives
 * back why it could not ("" when it plays).
 */
export async function playVoice(text: string | null): Promise<string> {
  const st = rehearseState();
  const set = st.settings;
  const ask = ++voiceAsk;
  const where = text && set.voice ? await voiceHere() : null;
  if (ask !== voiceAsk) return "";
  // Every sound paused: no voice (a whole text's render goes on being made, to be ready on play).
  if (set.paused) {
    stopVoices();
    stopRenderPlay();
    if (text && set.voice && where === "phone" && renderWanted(st)) renderCheck();
    voiceText = "";
    keep();
    return "";
  }
  // A whole text pre-rendered runs by itself (the phone app). Till its render is
  // ready, the live voices play, as without it.
  if (text && set.voice && where === "phone" && renderWanted(st)) {
    renderCheck();
    if (renderReady(st)) {
      stopVoices();
      voiceText = text;
      keep();
      return "";
    }
  } else stopRender();
  const texts = st.view === "texts";
  const heard = heardVoices(set);
  if (!text || !set.voice || !heard.length) {
    stopVoices();
    voiceText = "";
    keep();
    return "";
  }
  const main = heard[0]!.index === 0 ? heard[0]! : null;
  const mainAt = mainVoiceOf(heard);
  // Whole texts, layer 1 reading the whole text: the main voice reads it, a phrase at a time.
  const place = texts && main?.layer.voiceWhole && mainAt ? readerPlace(st) : null;
  // Read here already, and waiting for the tap (or, on by itself now: on to the next).
  const sayAgain = !place || place.tag !== readerSaid;
  const readerDone = place
    ? () => {
        readerSaid = place.tag;
        readerEnded(place.key, place.at);
      }
    : undefined;
  if (place && !sayAgain && set.voiceAuto) readerEnded(place.key, place.at);
  if (where === "browser") {
    // The browser's own voice: the main voice only (it says one thing at a time).
    browserStop?.();
    browserStop = null;
    const l = (main ?? heard[0]!).layer;
    if (place) {
      if (sayAgain) browserStop = browserSay(text, { ...set, ...l }, readerDone);
    } else browserStop = browserSay(text, { ...set, ...l });
    voiceText = text;
    keep();
    return "";
  }
  if (!where) return "No voice here: this browser has no text-to-speech.";
  voiceText = text;
  keep();
  try {
    // The background: every other voice, mixed into one.
    queueSwarm(swarmOf(st, text, heard));
    mainVoice ??= voicePlayer();
    if (!main || !mainAt) {
      mainVoice.stop();
      readerSaid = "";
      return "";
    }
    const mainUrl = await voiceFile(text, sayOf(set, main.layer));
    if (ask !== voiceAsk) return "";
    let ok = true;
    if (place) {
      // Read a phrase at a time: said (Repeats times, at least once) with its silence, then the next (or the tap).
      if (sayAgain)
        ok = await mainVoice.play(mainUrl, voiceShapeOf(main.layer), {
          voices: [mainAt],
          times: Math.max(1, set.voiceRepeats),
          once: readerDone,
          tag: place.tag,
        });
      // The next phrase said ahead (kept by the phone): no wait between the two.
      if (place.next) void voiceFile(place.next, sayOf(set, main.layer)).catch(() => {});
    } else {
      // Said Repeats times, then quiet till the tap (a tap: again); 0: over and over.
      ok = await mainVoice.play(mainUrl, voiceShapeOf(main.layer), {
        voices: [mainAt],
        times: set.voiceRepeats,
        tag: set.voiceRepeats > 0 ? `${st.lastTap}` : "",
      });
      readerSaid = "";
    }
    if (!ok && ask === voiceAsk) soundLog("The main voice's sound could not be played", "error");
    return ok || ask !== voiceAsk ? "" : "The voice's sound could not be played.";
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    if (ask === voiceAsk) {
      soundLog(`The main voice could not say it: ${m}`, "error");
      mainVoice?.stop();
    }
    return m;
  }
}

/** The tab opened or closed: closed, the sound plays on (Background on) or stops. */
export function rehearseOpen(on: boolean) {
  open = on;
  if (on) {
    // The tab plays its own phrase now: the Court's, if it was sounding, is quiet.
    courtQuiet();
    return;
  }
  if (rehearseState().settings.background) void playClosed();
  else stopRehearseSound();
}

let playing = 0;

/** The reader's phrase sound has the phrase player (one for the whole app, so two never play at once). */
let reading = false;

/**
 * The Read tab's phrase sound: the phrase being read, through the same player as
 * Rehearse's (shaped by Rehearse's settings); null gives the player back (to
 * Rehearse's own sound, if it plays on).
 */
export function readerSound(text: string | null) {
  const set = rehearseState().settings;
  if (text) {
    reading = true;
    playNonstop(text, set);
    return;
  }
  if (!reading) return;
  reading = false;
  if (open) return;
  if (set.background) void playClosed();
  else playNonstop(null);
}

/** With the tab closed: what the state asks for (after the window, or the reader, moved it on). */
async function playClosed() {
  const s = rehearseState();
  if (!s.settings.background) return;
  // The Court has the players while a phrase is recited there: Rehearse's own sound waits.
  if (courtHas) return;
  const ask = ++playing;
  const a = activeOf(s, rehearseLibrary());
  const set = s.settings;
  // The robot voice follows the phrase too (paused: it stops, there).
  void playVoice(set.voice && a.text ? a.text : null);
  // The reader has the phrase player meanwhile.
  if (reading) {
    /* its phrase plays */
  } else if (set.nonstop && set.sound && a.text && !set.paused) playNonstop(a.text, set);
  else playNonstop(null);
  void closedTts(a, set.ttsLoop && !set.paused, set.ttsVolume);
  if (!set.wavLoop || !a.name || set.paused) {
    void playWav(null);
    return;
  }
  const file = `${a.name}.wav`.toLowerCase();
  const url =
    pickedWavs.get(file) ??
    ((await folderName()) ? await folderFileUrl(`${a.dir}/${a.name}.wav`) : null);
  if (ask !== playing || open) return;
  await playWav(url, set.wavVolume, wavStyleOf(set));
}

// ---- The Court: its phrase, and what its queens say, sounded as Rehearse is set ----

/** The Court has the players: the phrase recited there sounds, and Rehearse's own sound waits. */
let courtHas = false;
let courtAsk = 0;
/** What the Court sounds now: its phrase and the pass it is at (sounded again when Rehearse's settings change). */
let courtText = "";
let courtTag = "";
/** The main voice saying the Court's phrase (its background is the shared mix, as Rehearse's). */
let courtMain: VoicePlayer | null = null;
let courtBrowser: (() => void) | null = null;
let courtBrowserKey = "";
/** Till when a tap's burst of the phrase's sound plays (ms since 1970), and what ends it. */
let courtTapUntil = 0;
let courtTapTimer = 0;
/** A queen's line said aloud, once: its own player (or the browser's voice). */
let sayPlayer: VoicePlayer | null = null;
let sayBrowser: (() => void) | null = null;
let sayAsk = 0;

/** Every voice saying the Court's phrase stops (the main voice, the others, the browser's). */
function stopCourtVoices() {
  // Its background is the shared mix: stopped only while the Court has it.
  if (courtHas) queueSwarm(null);
  courtMain?.stop();
  courtBrowser?.();
  courtBrowser = null;
  courtBrowserKey = "";
}

/** The Court's sound stops where it is (Rehearse's own is not started again: whoever calls this plays next). */
function courtQuiet() {
  courtAsk += 1;
  sayAsk += 1;
  stopCourtVoices();
  sayPlayer?.stop();
  sayBrowser?.();
  sayBrowser = null;
  window.clearTimeout(courtTapTimer);
  courtTapUntil = 0;
  courtHas = false;
}

/** Rehearse's settings changed while the Court sounds its phrase (paused, played again, another voice): as set now. */
function courtAgain() {
  if (courtHas && courtText) void courtSound(courtText, courtTag);
}

/** How many times a pass the main voice says the Court's phrase, as Rehearse is set, in words. */
function mainSays(set: RehearseSettings, loop: boolean): string {
  if (set.voiceRepeats === 1) return "the main voice once a pass";
  if (set.voiceRepeats > 1) return `the main voice ${set.voiceRepeats} times a pass`;
  return loop ? "over and over" : "once a pass";
}

/** What of Rehearse's sound the Court would use now, in a few words (for its screens). */
export function courtSoundNote(): string {
  const set = rehearseState().settings;
  if (set.paused) return "Rehearse's sound is paused (Play all sound, there, starts it again)";
  const parts: string[] = [];
  if (set.sound)
    parts.push(set.nonstop ? "the phrase's sound, all the time" : "the phrase's sound on a tap");
  if (set.voice) {
    const heard = heardVoices(set);
    if (heard.length) {
      const n = heard.reduce((a, h) => a + h.voices.length, 0);
      parts.push(
        `the robot voice (${n} voice${n === 1 ? "" : "s"}, ${mainSays(set, heard[0]!.layer.voiceLoop)})`,
      );
    }
  }
  if (!parts.length) return "nothing: Rehearse's Sound and Robot voice are both off";
  return `${parts.join(" and ")}, at ${set.ttsRate / 1000} kHz`;
}

/**
 * The browser's own voice says the Court's phrase (it says one thing at a time:
 * the main voice only): `times` times, each with its silence; 0: as its loop is
 * set. The same saying again: it goes on as it is.
 */
function courtBrowserSay(
  text: string,
  s: Parameters<typeof browserSay>[1],
  times: number,
  tag: string,
) {
  const key = JSON.stringify([
    text,
    s.voiceName,
    s.voiceRate,
    s.voicePitch,
    s.voiceVolume,
    s.voiceLoop,
    s.voiceGapMs,
    times,
    tag,
  ]);
  if (courtBrowser && key === courtBrowserKey) return;
  courtBrowser?.();
  courtBrowserKey = key;
  if (times <= 0) {
    courtBrowser = browserSay(text, s);
    return;
  }
  let left = times;
  const again = () => {
    left -= 1;
    if (left > 0 && courtBrowserKey === key) courtBrowser = browserSay(text, s, again);
  };
  courtBrowser = browserSay(text, s, again);
}

/**
 * The phrase being recited in the Court (null: none) sounds as Rehearse is set.
 * Its bytes sound all the time while it is up, when Rehearse's Sound and Nonstop
 * are on (with Nonstop off it sounds on each tap: courtTapSound). The robot
 * voice says it, when Rehearse's Robot voice is on, as on a single phrase
 * there: every layer heard, with its voices (stacked layers multiplied, as many
 * live as the sample rate allows) and its shape; the main voice says it Repeats
 * times and then waits (0: over and over), and here a pass is the tap: each new
 * `tag` (a pass) has it say it again. A layer not said over and over is said
 * once a pass. Pause all sound, there, quiets it here too. Rehearse's own sound
 * waits meanwhile, and comes back after, if it plays on in the background.
 */
export async function courtSound(text: string | null, tag = ""): Promise<void> {
  const set = rehearseState().settings;
  const ask = ++courtAsk;
  courtText = text ?? "";
  courtTag = text ? tag : "";
  if (!text) {
    stopCourtVoices();
    if (!courtHas) return;
    courtHas = false;
    if (Date.now() >= courtTapUntil) playNonstop(null);
    // Rehearse's own sound again (its tab, if open, plays it itself).
    if (!open && set.background) void playClosed();
    return;
  }
  if (open) return;
  if (!courtHas) {
    courtHas = true;
    // Rehearse's own phrase is quiet while the Court's sounds.
    void playWav(null);
    void playTts(null);
    stopVoices();
    stopRenderPlay();
  }
  if (set.sound && set.nonstop && !set.paused) playNonstop(text, set);
  else if (Date.now() >= courtTapUntil) playNonstop(null);
  const heard = set.voice && !set.paused ? heardVoices(set) : [];
  if (!heard.length) {
    stopCourtVoices();
    return;
  }
  const where = await voiceHere();
  if (ask !== courtAsk) return;
  if (!where) return;
  const main = heard[0]!;
  // Over and over by itself: a new pass changes nothing. Else each pass says it again.
  const mainTag = set.voiceRepeats === 0 && main.layer.voiceLoop ? "" : tag;
  if (where === "browser") {
    courtBrowserSay(text, { ...set, ...main.layer }, set.voiceRepeats, mainTag);
    return;
  }
  try {
    // The background (every voice but the main one), mixed into one as in Rehearse: its
    // layers say the Court's phrase; a layer not said over and over, again each pass.
    const once = heard.some((h) => !h.layer.voiceLoop);
    const bg = swarmOf({ ...rehearseState(), view: "phrases" }, text, heard);
    queueSwarm(bg && { ...bg, list: `court:${text}${once ? `:${tag}` : ""}` });
    const mainAt = mainVoiceOf(heard);
    courtMain ??= voicePlayer();
    if (!mainAt) {
      courtMain.stop();
      return;
    }
    const url = await voiceFile(text, sayOf(set, main.layer));
    if (ask !== courtAsk) return;
    await courtMain.play(url, voiceShapeOf(main.layer), {
      voices: [mainAt],
      times: set.voiceRepeats,
      tag: mainTag,
    });
  } catch {
    if (ask === courtAsk) stopCourtVoices();
  }
}

/**
 * A tap that completes a pass in the Court: with Rehearse's Sound on and Nonstop
 * off, the phrase's sound plays once through (its length, as set), as a tap does there.
 */
export function courtTapSound(text: string) {
  const set = rehearseState().settings;
  if (open || !text || !set.sound || set.nonstop || set.paused) return;
  const ms = Math.min(3000, Math.max(120, set.signalMs));
  playNonstop(text, set);
  courtTapUntil = Date.now() + ms;
  window.clearTimeout(courtTapTimer);
  courtTapTimer = window.setTimeout(() => {
    courtTapUntil = 0;
    // Unless Nonstop has been turned on meanwhile, the burst is over.
    const now = rehearseState().settings;
    if (!(courtHas && now.sound && now.nonstop && !now.paused)) playNonstop(null);
  }, ms);
}

/**
 * A queen's line said aloud, once, in Rehearse's robot voice: the layer of its
 * main voice, with its shape and its voices (at most `most` of them, the
 * nearest first, so her words stay words), at her own pitch and pace (each
 * multiplies Rehearse's). Nothing when Rehearse's Robot voice is off or every
 * sound is paused there.
 */
export async function courtSay(
  text: string,
  her: { pitch: number; rate: number },
  most = 12,
): Promise<void> {
  const set = rehearseState().settings;
  const ask = ++sayAsk;
  if (open || !text || !set.voice || set.paused) return;
  const heard = heardVoices(set);
  const main = heard[0];
  if (!main) return;
  const layer = main.layer;
  const where = await voiceHere();
  if (ask !== sayAsk || !where) return;
  const says = {
    ...set,
    voiceName: layer.voiceName,
    voiceRate: clampVoiceRate(layer.voiceRate * her.rate),
    voicePitch: clampVoicePitch(layer.voicePitch * her.pitch),
  };
  if (where === "browser") {
    sayBrowser?.();
    sayBrowser = browserSay(text, {
      ...says,
      voiceLoop: false,
      voiceGapMs: 0,
      voiceVolume: layer.voiceVolume,
    });
    return;
  }
  try {
    const url = await voiceFile(text, says);
    if (ask !== sayAsk) return;
    sayPlayer ??= voicePlayer();
    const voices = main.voices.slice(0, Math.max(1, Math.floor(most)));
    await sayPlayer.play(url, voiceShapeOf(layer), {
      voices,
      times: 1,
      // Her own voice as she says it; its copies reversed, if the layer is.
      reverse: layer.voiceReverse,
      mainForward: true,
      tag: String(ask),
    });
  } catch {
    /* no voice for this line */
  }
}

/** A queen's line stops being said (she is cut short: the talk is left, or a session starts). */
export function courtHush() {
  sayAsk += 1;
  sayPlayer?.stop();
  sayBrowser?.();
  sayBrowser = null;
}

// ---- A whole text pre-rendered (Texts, Pre-render on, the phone app): it runs by itself ----

export interface RenderStatus {
  /** Being made: how far (0..1), and what it is doing (or why it could not). */
  busy: boolean;
  part: number;
  note: string;
  /** Made and playing: the main voice moves the phrases. */
  playing: boolean;
}

let rStatus: RenderStatus = { busy: false, part: 0, note: "", playing: false };
const rSubs = new Set<() => void>();

function setRender(p: Partial<RenderStatus>) {
  rStatus = { ...rStatus, ...p };
  for (const f of rSubs) f();
}

export function renderStatus(): RenderStatus {
  return rStatus;
}

export function subscribeRender(fn: () => void): () => void {
  rSubs.add(fn);
  return () => {
    rSubs.delete(fn);
  };
}

interface Rendered {
  key: string;
  textKey: string;
  /** The main voice's track: where each phrase starts in it (s). */
  main: { name: string; rate: number; turns: number[] };
  /** The other voices' track (none: the main voice alone). */
  back: { name: string; rate: number } | null;
  total: number;
}

let rendered: Rendered | null = null;
let renderJob: { key: string; stop: boolean } | null = null;
/** A render that could not be made: not tried again till something in it changes. */
let renderFailed = "";
let renderTimer = 0;
let renderPlaying = false;
/** How the main voice plays now: on by itself, or a phrase a tap. */
let renderMode: "auto" | "tap" = "auto";
/** The place moved by the voice itself (so its voice does not jump). */
let following = false;
const RENDERS_KEY = "azshara-renders-v3";

/** The text being repped is rendered as it is set now (it runs by itself). */
function renderReady(s: RehearseState): boolean {
  const r = rendered;
  if (!r) return false;
  const t = currentText(s, rehearseLibrary());
  return !!t && t.key === r.textKey && r.key === renderKeyOf(s.settings, t.lines);
}

/** Whether the text is rendered to run by itself: Texts, the voice on, Pre-render on. */
export function renderWanted(s: RehearseState): boolean {
  return s.view === "texts" && s.settings.voice && s.settings.voiceRecord;
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + text.length.toString(16);
}

/** What a render is made of: it is made again when any of it changes. */
function renderKeyOf(set: RehearseSettings, lines: string[]): string {
  return hash(JSON.stringify([lines, set.voiceEngine, voiceLayersOf(set), set.ttsRate]));
}

/** Renders made before (their turns), oldest first: as many as the phone keeps (this one and the one before). */
function keptRenders(): Rendered[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RENDERS_KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter(
          (r): r is Rendered =>
            !!r &&
            typeof r === "object" &&
            typeof r.key === "string" &&
            !!r.main &&
            Array.isArray(r.main.turns),
        )
      : [];
  } catch {
    return [];
  }
}

function keepRender(r: Rendered) {
  try {
    const all = [...keptRenders().filter((x) => x.key !== r.key), r].slice(-2);
    localStorage.setItem(RENDERS_KEY, JSON.stringify(all));
  } catch {
    /* full: made again next time */
  }
}

function renderCheck() {
  if (typeof window === "undefined") return;
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => void renderNow(), 800);
}

async function renderNow() {
  const s = rehearseState();
  if (!renderWanted(s)) return stopRender();
  const t = currentText(s, rehearseLibrary());
  const units = t ? readUnits(t.lines).map((u) => u.text) : [];
  if (!t || !units.length) return stopRender();
  const key = renderKeyOf(s.settings, t.lines);
  if (rendered?.key === key) return playRendered();
  if (renderJob?.key === key || renderFailed === key) return;
  if (renderJob) renderJob.stop = true;
  stopRenderPlay();
  // Made before with these settings, and still in the cache: at once.
  const kept = keptRenders().find((x) => x.key === key);
  if (
    kept &&
    kept.textKey === t.key &&
    (await renderHas(kept.main.name)) &&
    (!kept.back || (await renderHas(kept.back.name)))
  ) {
    rendered = kept;
    return playRendered();
  }
  const job = { key, stop: false };
  renderJob = job;
  rendered = null;
  setRender({ busy: true, part: 0, note: "Rendering the whole text…", playing: false });
  try {
    const { renderText } = await import("@/game/ttsExport");
    const r = await renderText(
      units,
      s.settings,
      { main: `text-${key}.main.wav`, back: `text-${key}.back.wav` },
      (note, part) => {
        if (renderJob === job) setRender({ note, part });
      },
      () => job.stop,
    );
    if (renderJob !== job) return;
    renderJob = null;
    rendered = {
      key,
      textKey: t.key,
      main: { name: r.main.name, rate: r.main.rate, turns: r.main.turns },
      back: r.back && { name: r.back.name, rate: r.back.rate },
      total: units.length,
    };
    keepRender(rendered);
    setRender({ busy: false, part: 1, note: "" });
    await playRendered();
  } catch (e) {
    if (renderJob !== job) return;
    renderJob = null;
    const m = String((e as Error)?.message ?? e);
    if (m !== "Stopped") renderFailed = key;
    setRender({
      busy: false,
      part: 0,
      note: m === "Stopped" ? "" : `Not rendered (taps move it, as without): ${m}`,
    });
  }
}

/** Where each phrase starts in the main voice's track (its frames). */
const mainFrames = (r: Rendered) => r.main.turns.map((x) => Math.round(x * r.main.rate));

/** The main voice from phrase `at`: on by itself, or (a phrase a tap) that phrase once. */
function playMain(r: Rendered, at: number): Promise<boolean> {
  const frames = mainFrames(r);
  const from = frames[at] ?? 0;
  return renderMode === "tap"
    ? renderPlay(r.main.name, from, frames, { until: frames[at + 1] ?? 0 })
    : renderPlay(r.main.name, from, frames);
}

/** The render playing: the other voices all the time, the main voice from the phrase the text is at. */
async function playRendered() {
  const r = rendered;
  if (!r) return;
  const s = rehearseState();
  const t = currentText(s, rehearseLibrary());
  if (!t || t.key !== r.textKey || !renderWanted(s) || s.settings.paused) return;
  const mode = s.settings.voiceAuto ? "auto" : "tap";
  // Playing so already (a change of mode plays the main voice again, from where it is).
  if (renderPlaying && renderMode === mode) return;
  void onRenderTurn(heardTurn);
  const at = textAt(s, t.key, r.total);
  renderPlaying = true;
  renderMode = mode;
  // The render says it now: the live voice stops (and one on its way does not start).
  voiceAsk += 1;
  stopVoices();
  // The others, round and round (the same playing already: it goes on, never jumping).
  const okBack = !r.back || (await renderBack(r.back.name));
  const ok = okBack && (await playMain(r, at));
  if (!ok) {
    renderPlaying = false;
    rendered = null;
    void renderStop();
    setRender({ playing: false, note: "The render was gone: made again" });
    renderCheck();
    return;
  }
  setRender({ playing: true, note: "" });
}

/** The text moved elsewhere (a tap, ‹ ›, the window, the reader): the main voice goes there. */
async function seekRendered(at: number) {
  const r = rendered;
  if (!r || !renderPlaying) return;
  await playMain(r, at);
}

function stopRenderPlay() {
  if (!renderPlaying) return;
  renderPlaying = false;
  void renderStop();
  setRender({ playing: false });
}

function stopRender() {
  if (typeof window !== "undefined") window.clearTimeout(renderTimer);
  if (renderJob) {
    renderJob.stop = true;
    renderJob = null;
    setRender({ busy: false, part: 0, note: "" });
  }
  stopRenderPlay();
}

/** The render's main voice is on another phrase: the text goes there (the next one: a rep, as a tap). */
function heardTurn(index: number) {
  const r = rendered;
  // A phrase a tap: the main voice says it and waits (only a tap moves the text).
  if (!r || !renderPlaying || renderMode !== "auto") return;
  const s = rehearseState();
  const t = currentText(s, rehearseLibrary());
  if (!t || t.key !== r.textKey) return;
  const at = textAt(s, t.key, r.total);
  if (index === at || index < 0 || index >= r.total) return;
  if (index === (at + 1) % r.total) advanceByVoice(t, at, r.total);
  else {
    following = true;
    try {
      rehearseUpdate((st) => textGo(st, t.key, index, r.total));
    } finally {
      following = false;
    }
    followBubble();
  }
}

/** The main voice is through phrase `at`: the text goes on to the next, a rep (as a tap); after the last, a pass. */
function advanceByVoice(t: LibText, at: number, total: number) {
  const unit = readUnits(t.lines)[at]?.text ?? "";
  following = true;
  try {
    if (unit) repXpFor(unit, 1);
    rehearseUpdate((st) => textTapOn(st, rehearseLibrary(), t.key, total, Date.now(), 1, at));
    if (at + 1 >= total) flashToast(`“${t.name}”: a pass through it, by itself ✓`);
  } finally {
    following = false;
  }
  followBubble();
}

/** The floating window follows (the tab, open, sends it itself). */
function followBubble() {
  if (open || !shown) return;
  const setup = bubbleSetupOf(rehearseState(), rehearseLibrary());
  if (setup) void sendBubble(setup);
}

/** What the floating window shows for the text being repped (as the tab sends it). */
function bubbleSetupOf(s: RehearseState, lib: LibText[]): BubbleSetup | null {
  const t = currentText(s, lib);
  if (!t || s.view !== "texts") return null;
  const units = readUnits(t.lines);
  const at = textAt(s, t.key, units.length);
  const prog = textProgress(s, t.key);
  const set = s.settings;
  return {
    phrases: units.map((u, i) => ({ id: bubbleId(i, t.key), text: u.text, count: prog.reps })),
    current: bubbleId(at, t.key),
    batch: set.batch,
    waitMs: batchWaitMs(set),
    lastTap: s.lastTap,
    advance: true,
    title: t.name,
    passes: prog.passes,
    locked: set.locked,
    paused: set.paused,
    phraseSp: set.bubblePhraseSp,
    barSp: set.bubbleBarSp,
    bottomSp: set.bubbleBottomSp,
    showBottom: set.bubbleBottom,
  };
}
