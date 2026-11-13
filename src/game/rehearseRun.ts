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
import { folderFileUrl, folderName } from "@/game/azsFolder";
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
  libraryOf,
  loadRehearse,
  newRehearse,
  REHEARSE_KEY,
  voiceLayersOf,
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
  const next = fn(rehearseState());
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
}

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
  const on = !!(loopText || wavUrl || voiceText) && rehearseState().settings.background;
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
  const set = rehearseState().settings;
  const ask = ++voiceAsk;
  if (!text || !set.voice) {
    for (const v of voices) v.stop();
    browserStop?.();
    browserStop = null;
    voiceText = "";
    keep();
    return "";
  }
  const where = await voiceHere();
  if (ask !== voiceAsk) return "";
  if (where === "browser") {
    browserStop?.();
    browserStop = browserSay(text, set);
    voiceText = text;
    keep();
    return "";
  }
  if (!where) return "No voice here: this browser has no text-to-speech.";
  voiceText = text;
  keep();
  try {
    // Each layer: its own voice said, played with its own shape; layers no longer there stop.
    const layers = voiceLayersOf(set);
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
        voices[k]!.play(urls[k]!, voiceShapeOf(l), set.voiceRecord ? set.voiceRecordSec : 0),
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
