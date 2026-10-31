import { CONFIG } from "@/game/config";
import type { Mood } from "@/game/dialogue";
import {
  applyOverrides,
  describeEvent,
  fitLine,
  gate,
  type Facts,
  type NarratorOverrides,
  type NarratorSettings,
} from "@/lib/narrator/narrator";
import { chatCompletion, type ChatOutcome } from "@/lib/narrator/openai";

/**
 * The narrator: game events go to the player's own OpenAI-compatible model, and the
 * line it sends back replaces the scripted one in the speech box. Off unless enabled
 * in config.json or the in-game Narrator form. Only the event and a few numbers are
 * sent, never the loaded text.
 */

const OVERRIDES_KEY = "azshara-narrator-v1";
/** After a failed request the narrator stays quiet this long, so a server that is down is not hammered. */
const RETRY_AFTER_MS = 30_000;

let cached: NarratorSettings | null = null;
let inFlight: AbortController | null = null;
let lastSentAt = -Infinity;
let quietUntil = 0;
let lastError = "";

function readOverrides(): unknown {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** The settings in effect: config.json, with this device's changes on top. */
export function narratorSettings(): NarratorSettings {
  cached ??= applyOverrides(CONFIG.narrator, readOverrides());
  return cached;
}

/** This device's changes only, for the form. */
export function narratorOverrides(): NarratorOverrides {
  const raw = readOverrides();
  return typeof raw === "object" && raw !== null ? (raw as NarratorOverrides) : {};
}

/** Saves this device's changes, or clears them with null. */
export function saveNarratorOverrides(overrides: NarratorOverrides | null) {
  try {
    if (overrides) localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    else localStorage.removeItem(OVERRIDES_KEY);
  } catch {
    /* private mode / quota */
  }
  cached = null;
  quietUntil = 0;
  lastError = "";
}

/** Why the last request failed, or an empty string. */
export function narratorLastError(): string {
  return lastError;
}

function ask(
  settings: NarratorSettings,
  label: string,
  facts: Facts,
  signal?: AbortSignal,
): Promise<ChatOutcome> {
  return chatCompletion({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    timeoutMs: settings.timeoutMs,
    signal,
    messages: [
      { role: "system", content: settings.systemPrompt },
      { role: "user", content: describeEvent(label, facts) },
    ],
  });
}

/**
 * Sends a game event to the model when the narrator is on and the event is one it
 * covers. `speak` gets the reply. Never blocks the game and never throws.
 */
export function narrate(mood: Mood, facts: Facts, speak: (speaker: string, text: string) => void) {
  const settings = narratorSettings();
  const label = settings.events[mood];
  // Nothing would show the line while spoken lines are hidden, so nothing is sent.
  if (!settings.enabled || !label || !CONFIG.ui.showSpeech) return;
  const now = performance.now();
  const priority = settings.priorityEvents.includes(mood);
  const decision = gate(
    { busy: inFlight !== null, lastSentAt, quietUntil },
    now,
    settings.cooldownMs,
    priority,
  );
  if (decision === "skip") return;
  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  lastSentAt = now;
  void ask(settings, label, facts, controller.signal).then((outcome) => {
    if (inFlight === controller) inFlight = null;
    if (outcome.ok) {
      lastError = "";
      speak(settings.name, fitLine(outcome.text));
    } else if (!outcome.aborted) {
      lastError = outcome.error;
      quietUntil = performance.now() + RETRY_AFTER_MS;
    }
  });
}

/** Drops a request in flight, for example when the player switches mode. */
export function cancelNarration() {
  inFlight?.abort();
  inFlight = null;
}

/** One request with the given settings, for the form's test button. */
export async function testNarrator(settings: NarratorSettings): Promise<ChatOutcome> {
  const outcome = await ask(settings, "Connection test. Greet the player in one line.", {
    Mode: "title screen",
  });
  return outcome.ok ? { ok: true, text: fitLine(outcome.text) } : outcome;
}

let personaInFlight: AbortController | null = null;
let personaSentAt = -Infinity;

/**
 * One line in a character's voice from the connected model, for the Court's
 * queens. Only when the narrator is switched on; at most one request at a time,
 * no more often than its cooldown. `speak` gets the line; on any failure nothing
 * happens and the scripted line already shown stays.
 */
export function speakAs(persona: string, situation: string, speak: (text: string) => void) {
  const settings = narratorSettings();
  if (!settings.enabled) return;
  const now = performance.now();
  if (personaInFlight || now < quietUntil || now - personaSentAt < settings.cooldownMs) return;
  personaSentAt = now;
  const controller = new AbortController();
  personaInFlight = controller;
  void chatCompletion({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    timeoutMs: settings.timeoutMs,
    signal: controller.signal,
    messages: [
      {
        role: "system",
        content:
          `You are ${persona}, in a playful, cartoonish fantasy game. The player, Alien X, levels skills by reciting ` +
          "phrases from texts and is courting you. Answer with one short in-character line of at most 25 words: " +
          "warm, flirtatious and teasing, but tasteful and never explicit. No lists, no emoji, no stage directions.",
      },
      { role: "user", content: situation },
    ],
  }).then((outcome) => {
    if (personaInFlight === controller) personaInFlight = null;
    if (outcome.ok) {
      lastError = "";
      speak(fitLine(outcome.text));
    } else if (!outcome.aborted) {
      lastError = outcome.error;
      quietUntil = performance.now() + RETRY_AFTER_MS;
    }
  });
}
