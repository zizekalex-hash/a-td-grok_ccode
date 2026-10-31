import type { AgentId } from "@/lib/agents/agents";

export type AskOutcome = { ok: true; text: string; truncated: boolean } | { ok: false; error: string };

/** Sends a message to the server's agent route. Never throws: failures come back as a reason. */
export async function askAgent(agent: AgentId, message: string, signal?: AbortSignal): Promise<AskOutcome> {
  try {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent, message }),
      signal,
    });
    const data = (await res.json().catch(() => ({}))) as { text?: unknown; truncated?: unknown; error?: unknown };
    if (!res.ok || typeof data.text !== "string") {
      const error = typeof data.error === "string" ? data.error : `The agent service answered ${res.status}.`;
      return { ok: false, error };
    }
    return { ok: true, text: data.text, truncated: data.truncated === true };
  } catch {
    return { ok: false, error: "Could not reach the agents. Check your connection." };
  }
}
