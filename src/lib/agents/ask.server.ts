import Anthropic from "@anthropic-ai/sdk";
import { AGENTS, type AgentRequest } from "@/lib/agents/agents";

export type AskResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; status: number; error: string };

let client: Anthropic | undefined;

/** The agents only answer when the server holds an API key. */
export function agentsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Sends one message to the agent's model and returns its text, or a reason it could not. */
export async function askAgent({ agent, message }: AgentRequest): Promise<AskResult> {
  const spec = AGENTS[agent];
  client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 });
  try {
    const response = await client.messages.create({
      model: spec.model,
      max_tokens: spec.maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: spec.effort },
      system: spec.system,
      messages: [{ role: "user", content: message }],
    });
    if (response.stop_reason === "refusal") {
      return { ok: false, status: 422, error: "The agent declined that one. Try asking it another way." };
    }
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();
    if (!text) {
      return { ok: false, status: 502, error: "The agent sent back nothing. Try again." };
    }
    return { ok: true, text, truncated: response.stop_reason === "max_tokens" };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, status: 429, error: "The agents are busy. Wait a minute and try again." };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, status: 502, error: "The agent service failed. Try again." };
    }
    throw error;
  }
}
