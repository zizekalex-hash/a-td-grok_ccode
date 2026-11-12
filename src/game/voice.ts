/**
 * Rehearse's robot voice: the phone's text-to-speech (AzsVoicePlugin.java) says
 * a phrase into a .wav, played here with copies, speed-ups and the robot ring
 * (phraseSound.ts voicePlayer). In a browser there is no such engine: the
 * browser's own voice says it (its rate, pitch and voice; one copy, no robot).
 */
import type { RehearseSettings } from "@/game/rehearse";

export interface VoiceInfo {
  name: string;
  locale: string;
  network?: boolean;
  notInstalled?: boolean;
}

interface AzsVoiceApi {
  engines(): Promise<{ engines: { name: string; label: string }[]; default: string }>;
  voices(o: { engine: string }): Promise<{ voices: VoiceInfo[] }>;
  synth(o: {
    text: string;
    engine: string;
    voice: string;
    rate: number;
    pitch: number;
  }): Promise<{ file: string }>;
}

let plugin: Promise<{ api: AzsVoiceApi; convert: (p: string) => string } | null> | null = null;

/** The phone's voice plugin, in the Android app only (wrapped: a plugin is not a promise's result). */
function native() {
  plugin ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }) =>
      Capacitor.getPlatform() === "android"
        ? {
            api: registerPlugin<AzsVoiceApi>("AzsVoice"),
            convert: (p: string) => Capacitor.convertFileSrc(p),
          }
        : null,
    )
    .catch(() => null);
  return plugin;
}

const speech = () =>
  typeof globalThis.speechSynthesis !== "undefined" ? globalThis.speechSynthesis : null;

/** Which voice there is: the phone's engines (everything), the browser's (plain), or none. */
export async function voiceHere(): Promise<"phone" | "browser" | null> {
  if (await native()) return "phone";
  return speech() ? "browser" : null;
}

/** The phone's voice engines (none in a browser). */
export async function voiceEngines(): Promise<{ name: string; label: string }[]> {
  const n = await native();
  if (!n) return [];
  try {
    return (await n.api.engines()).engines;
  } catch {
    return [];
  }
}

/** An engine's voices (in a browser: the browser's). */
export async function voiceList(engine: string): Promise<VoiceInfo[]> {
  const n = await native();
  if (n) {
    try {
      return (await n.api.voices({ engine })).voices;
    } catch {
      return [];
    }
  }
  const sp = speech();
  if (!sp) return [];
  const list = () => sp.getVoices().map((v) => ({ name: v.name, locale: v.lang }));
  if (list().length) return list();
  // The browser lists its voices a little after the page starts.
  return new Promise((done) => {
    const t = setTimeout(() => done(list()), 1500);
    sp.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(t);
        done(list());
      },
      { once: true },
    );
  });
}

type VoiceSay = Pick<RehearseSettings, "voiceEngine" | "voiceName" | "voiceRate" | "voicePitch">;

/** The phrase said into a .wav by the phone, as an address the page can play (throws why it could not). */
export async function voiceFile(text: string, s: VoiceSay): Promise<string> {
  const n = await native();
  if (!n) throw new Error("The phone's voice is in the Android app");
  const r = await n.api.synth({
    text,
    engine: s.voiceEngine,
    voice: s.voiceName,
    rate: s.voiceRate,
    pitch: s.voicePitch,
  });
  return n.convert(r.file);
}

/**
 * In a browser: the browser's voice says it (again and again after gapMs, if it
 * loops). Gives back what stops it.
 */
export function browserSay(
  text: string,
  s: VoiceSay & Pick<RehearseSettings, "voiceLoop" | "voiceGapMs" | "voiceVolume">,
): () => void {
  const sp = speech();
  if (!sp) return () => {};
  let live = true;
  let timer = 0;
  const say = () => {
    if (!live) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Math.max(0.1, Math.min(10, s.voiceRate));
    u.pitch = Math.max(0, Math.min(2, s.voicePitch));
    u.volume = Math.max(0, Math.min(1, s.voiceVolume));
    const v = sp.getVoices().find((x) => x.name === s.voiceName);
    if (v) u.voice = v;
    u.onend = () => {
      if (live && s.voiceLoop) timer = window.setTimeout(say, s.voiceGapMs);
    };
    sp.speak(u);
  };
  sp.cancel();
  say();
  return () => {
    live = false;
    window.clearTimeout(timer);
    sp.cancel();
  };
}
