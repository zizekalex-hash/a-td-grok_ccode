/**
 * The hosted agents: what each one is for, the model it runs on, and the checks
 * a request must pass before anything is sent to a model. Pure and dependency-free
 * so the server route, the panel and the tests all read one source.
 */

export type AgentId = "scribe" | "coach";

export interface AgentSpec {
  id: AgentId;
  name: string;
  /** One line for the panel. */
  blurb: string;
  /** Placeholder for the message box. */
  prompt: string;
  model: "claude-sonnet-5-5" | "claude-opus-5-5";
  effort: "low" | "medium";
  /** Output cap. Adaptive thinking counts toward it, so it sits well above the text length. */
  maxTokens: number;
  system: string;
}

export const AGENT_IDS: readonly AgentId[] = ["scribe", "coach"];

export const AGENTS: Record<AgentId, AgentSpec> = {
  scribe: {
    id: "scribe",
    name: "Scribe",
    blurb: "Condenses or explains a passage you paste in. Quick, on Sonnet.",
    prompt: "Paste a passage to condense or explain.",
    model: "claude-sonnet-5-5",
    effort: "low",
    maxTokens: 1500,
    system:
      "You are Scribe, a concise writing assistant inside a word-based game. The player pastes a passage. " +
      "Summarise it or explain what it means in plain language, in at most 150 words. Stay with the passage. " +
      "If it is unclear, say so instead of guessing.",
  },
  coach: {
    id: "coach",
    name: "Coach",
    blurb: "Pacing and tactics for the recitation drill and tower defense. Deeper, on Opus.",
    prompt: "Describe what is going wrong, or what you want to get better at.",
    model: "claude-opus-5-5",
    effort: "medium",
    maxTokens: 3000,
    system:
      "You are Coach, a practice and strategy assistant for a word-based game with three modes: a recitation " +
      "drill (repeat a phrase, where each word is held for 0.9 seconds and one tap counts one repetition), a " +
      "tower defense game on a 9 by 9 grid, and auto chess (buy chess pieces, set them on your half of the board, " +
      "they fight on their own; three alike merge into a stronger piece). Give practical pacing, build and practice " +
      "advice in at most 200 words. Do not give medical, sleep or health advice. If the question is outside the " +
      "game, say that it is outside what you cover.",
  },
};

/** Longest message a player can send, in characters. */
export const MAX_MESSAGE_CHARS = 2000;

export interface AgentRequest {
  agent: AgentId;
  message: string;
}

export type ParsedRequest = { ok: true; request: AgentRequest } | { ok: false; error: string };

/** Checks a request body from the network. Returns the trimmed request or a reason to refuse it. */
export function parseAgentRequest(body: unknown): ParsedRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Send a JSON object with an agent and a message." };
  }
  const { agent, message } = body as Record<string, unknown>;
  if (typeof agent !== "string" || !(AGENT_IDS as readonly string[]).includes(agent)) {
    return { ok: false, error: "Unknown agent." };
  }
  if (typeof message !== "string") {
    return { ok: false, error: "Send a message." };
  }
  const text = message.trim();
  if (!text) {
    return { ok: false, error: "The message is empty." };
  }
  if (text.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: `Keep it under ${MAX_MESSAGE_CHARS} characters.` };
  }
  return { ok: true, request: { agent: agent as AgentId, message: text } };
}
