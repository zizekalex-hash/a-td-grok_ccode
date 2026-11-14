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
import { wordsOf } from "@/game/reps";
import { useGame } from "@/game/store";
import { browserSay, voiceFile, voiceHere } from "@/game/voice";
import {
  fileLoop,
  holdAudio,
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
  renderHas,
  renderPlay,
  renderStop,
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
  textTap,
  voiceLayersOf,
  type RehearseSettings,
  passedThrough,
  libraryOf,
  loadRehearse,
  newRehearse,
  REHEARSE_KEY,
  liveVoiceLayers,
  voiceShapeOf,
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
  const next = fn(before);
  if (next === state) return;
  state = next;
  try {
    localStorage.setItem(REHEARSE_KEY, JSON.stringify(next));
  } catch {
    /* private mode or full */
  }
  for (const f of subs) f();
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

/** A player for each layer of voices. */
const voices: VoicePlayer[] = [];
let voiceText = "";
let voiceAsk = 0;
let browserStop: (() => void) | null = null;

/**
 * The robot voice saying a phrase, over and over with its gap (or once), shaped
 * by Rehearse's settings; null (or the voice off) stops it. Gives back why it
 * could not ("" when it plays).
 */
export async function playVoice(text: string | null): Promise<string> {
  const st = rehearseState();
  const set = st.settings;
  const ask = ++voiceAsk;
  const where = text && set.voice ? await voiceHere() : null;
  if (ask !== voiceAsk) return "";
  // A whole text pre-rendered runs by itself (the phone app). Till its render is
  // ready, the live voice says the phrases as they are tapped to, as without it.
  if (text && set.voice && where === "phone" && renderWanted(st)) {
    renderCheck();
    if (renderReady(st)) {
      for (const v of voices) v.stop();
      voiceText = text;
      keep();
      return "";
    }
  } else stopRender();
  // The layers that say the phrase (those on): those reading the whole text are in its .tts.wav.
  const layers = liveVoiceLayers(set, st.view === "texts");
  if (!text || !set.voice || !layers.length) {
    for (const v of voices) v.stop();
    browserStop?.();
    browserStop = null;
    voiceText = "";
    keep();
    return "";
  }
  if (where === "browser") {
    // The browser's own voice: the first such layer's voice, rate, pitch, loop and volume.
    browserStop?.();
    browserStop = browserSay(text, { ...set, ...layers[0]! });
    voiceText = text;
    keep();
    return "";
  }
  if (!where) return "No voice here: this browser has no text-to-speech.";
  voiceText = text;
  keep();
  try {
    // Each layer: its own voice said, played with its own shape; layers no longer there stop.
    const urls = await Promise.all(
      layers.map((l) =>
        voiceFile(text, {
          ...set,
          voiceName: l.voiceName,
          voiceRate: l.voiceRate,
          voicePitch: l.voicePitch,
        }),
      ),
    );
    if (ask !== voiceAsk) return "";
    while (voices.length < layers.length) voices.push(voicePlayer());
    for (let k = layers.length; k < voices.length; k++) voices[k]!.stop();
    const oks = await Promise.all(
      layers.map((l, k) =>
        voices[k]!.play(
          urls[k]!,
          voiceShapeOf(l),
          set.voiceRecord ? set.voiceRecordSec : 0,
          l.voiceReverse,
        ),
      ),
    );
    return oks.every(Boolean) || ask !== voiceAsk ? "" : "The voice's sound could not be played.";
  } catch (e) {
    if (ask === voiceAsk) {
      for (const v of voices) v.stop();
      voiceText = "";
      keep();
    }
    return String((e as Error)?.message ?? e);
  }
}

/** The tab opened or closed: closed, the sound plays on (Background on) or stops. */
export function rehearseOpen(on: boolean) {
  open = on;
  if (on) return;
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
  const ask = ++playing;
  const a = activeOf(s, rehearseLibrary());
  const set = s.settings;
  // The robot voice follows the phrase too.
  void playVoice(set.voice && a.text ? a.text : null);
  // The reader has the phrase player meanwhile.
  if (reading) {
    /* its phrase plays */
  } else if (set.nonstop && set.sound && a.text) playNonstop(a.text, set);
  else playNonstop(null);
  void closedTts(a, set.ttsLoop, set.ttsVolume);
  if (!set.wavLoop || !a.name) {
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
  name: string;
  /** When each phrase starts (s), its frames and rate, how many phrases. */
  turns: number[];
  frames: number;
  rate: number;
  total: number;
}

let rendered: Rendered | null = null;
let renderJob: { key: string; stop: boolean } | null = null;
/** A render that could not be made: not tried again till something in it changes. */
let renderFailed = "";
let renderTimer = 0;
let renderPlaying = false;
/** The place moved by the voice itself (so its voice does not jump). */
let following = false;
const RENDERS_KEY = "azshara-renders-v2";

/** The text being repped is rendered as it is set now (it runs by itself). */
function renderReady(s: RehearseState): boolean {
  const r = rendered;
  if (!r) return false;
  const t = currentText(s, rehearseLibrary());
  return !!t && t.key === r.textKey && r.key === renderKeyOf(s.settings, t.lines);
}

/** Whether the text runs by itself once rendered: Texts, the voice on, Pre-render on. */
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
  return hash(JSON.stringify([lines, set.voiceEngine, voiceLayersOf(set), set.voiceLead]));
}

/** Renders made before (their turns), oldest first: as many as the phone keeps (this one and the one before). */
function keptRenders(): Rendered[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RENDERS_KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter(
          (r): r is Rendered =>
            !!r && typeof r === "object" && typeof r.key === "string" && Array.isArray(r.turns),
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
  const name = `text-${key}.wav`;
  const kept = keptRenders().find((x) => x.key === key);
  if (kept && kept.textKey === t.key && (await renderHas(name))) {
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
      name,
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
      name,
      turns: r.turns,
      frames: r.frames,
      rate: r.rate,
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

const framesOf = (r: Rendered) => r.turns.map((x) => Math.round(x * r.rate));

/** The render playing, from the phrase the text is at. */
async function playRendered() {
  const r = rendered;
  if (!r || renderPlaying) return;
  const s = rehearseState();
  const t = currentText(s, rehearseLibrary());
  if (!t || t.key !== r.textKey || !renderWanted(s)) return;
  void onRenderTurn(heardTurn);
  const at = textAt(s, t.key, r.total);
  renderPlaying = true;
  // The render says it now: the live voice stops (and one on its way does not start).
  voiceAsk += 1;
  for (const v of voices) v.stop();
  browserStop?.();
  browserStop = null;
  const ok = await renderPlay(r.name, Math.round((r.turns[at] ?? 0) * r.rate), framesOf(r));
  if (!ok) {
    renderPlaying = false;
    rendered = null;
    setRender({ playing: false, note: "The render was gone: made again" });
    renderCheck();
    return;
  }
  setRender({ playing: true, note: "" });
}

async function seekRendered(at: number) {
  const r = rendered;
  if (!r || !renderPlaying) return;
  await renderPlay(r.name, Math.round((r.turns[at] ?? 0) * r.rate), framesOf(r));
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
  if (!r || !renderPlaying) return;
  const lib = rehearseLibrary();
  const s = rehearseState();
  const t = currentText(s, lib);
  if (!t || t.key !== r.textKey) return;
  const at = textAt(s, t.key, r.total);
  if (index === at || index < 0 || index >= r.total) return;
  following = true;
  try {
    if (index === (at + 1) % r.total) {
      const unit = readUnits(t.lines)[at]?.text ?? "";
      if (unit) repXpFor(unit, 1);
      rehearseUpdate((st) => textTap(st, t.key, r.total, Date.now(), 1, at));
      if (at + 1 >= r.total) flashToast(`“${t.name}”: a pass through it, by itself ✓`);
    } else rehearseUpdate((st) => textGo(st, t.key, index, r.total));
  } finally {
    following = false;
  }
  // The floating window follows (the tab, open, sends it itself).
  if (!open && shown) {
    const setup = bubbleSetupOf(rehearseState(), lib);
    if (setup) void sendBubble(setup);
  }
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
    phraseSp: set.bubblePhraseSp,
    barSp: set.bubbleBarSp,
    bottomSp: set.bubbleBottomSp,
    showBottom: set.bubbleBottom,
  };
}
