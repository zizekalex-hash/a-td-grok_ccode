/**
 * The narrator's rules, kept pure for the tests: how a game event becomes a prompt,
 * when an event may go to the model, and how device settings layer over config.json.
 */

export interface NarratorSettings {
  enabled: boolean;
  /** Who the lines are shown as. */
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  /** Shortest gap between two ordinary events sent to the model (ms). */
  cooldownMs: number;
  /** Game events that are sent, with the name the model sees. Others are not sent. */
  events: Record<string, string>;
  /** Events that skip the cooldown and replace a request in flight. */
  priorityEvents: string[];
}

/** What a player can change in game. Kept on their device, never in the build. */
export type NarratorOverrides = Partial<
  Pick<NarratorSettings, "enabled" | "baseUrl" | "model" | "apiKey">
>;

/** Numbers and labels that describe the moment, such as the wave or the core's integrity. */
export type Facts = Record<string, string | number>;

/** Longest line shown in the speech box. Longer replies are cut at a word. */
export const MAX_LINE_CHARS = 240;

/** The user message for one event: the event's name, then one fact per line. */
export function describeEvent(label: string, facts: Facts): string {
  return [
    `Event: ${label}`,
    ...Object.entries(facts).map(([key, value]) => `${key}: ${value}`),
  ].join("\n");
}

/** Caps a reply to the speech box, cutting at a word rather than inside one. */
export function fitLine(text: string, max: number = MAX_LINE_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export interface GateState {
  /** A request is in flight. */
  busy: boolean;
  /** When the last request was sent (ms). */
  lastSentAt: number;
  /** Nothing is sent before this time (ms). Set after a failure so a dead server is not hammered. */
  quietUntil: number;
}

export type Decision = "send" | "replace" | "skip";

/**
 * Whether an event goes to the model. Ordinary events wait out the cooldown and never
 * interrupt a request in flight. Priority events, such as a cleared wave or the end of
 * the run, skip the cooldown and replace a request in flight, so the line that comes
 * back fits what just happened.
 */
export function gate(
  state: GateState,
  now: number,
  cooldownMs: number,
  priority: boolean,
): Decision {
  if (now < state.quietUntil) return "skip";
  if (state.busy) return priority ? "replace" : "skip";
  if (!priority && now - state.lastSentAt < cooldownMs) return "skip";
  return "send";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Device settings over the defaults. Anything missing, blank or of the wrong type keeps the default. */
export function applyOverrides(base: NarratorSettings, raw: unknown): NarratorSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  return {
    ...base,
    enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled,
    baseUrl: text(o.baseUrl) || base.baseUrl,
    model: text(o.model) || base.model,
    apiKey: text(o.apiKey) || base.apiKey,
  };
}

/** True for an http or https address, which is all fetch can reach. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
