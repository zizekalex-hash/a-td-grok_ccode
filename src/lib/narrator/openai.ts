/**
 * A small client for OpenAI-compatible chat APIs: LM Studio, Ollama, llama.cpp,
 * vLLM, OpenAI, OpenRouter and anything else that serves POST /chat/completions.
 * It uses plain fetch, never throws, and takes the fetch to use as an argument so
 * the tests can stand in for the network. No path aliases: the tests load it directly.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  /** API root such as http://localhost:1234/v1. A full …/chat/completions URL works too. */
  baseUrl: string;
  /** Sent as a bearer token when set. Local servers usually need none. */
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Gives up after this long, in ms. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type ChatOutcome =
  { ok: true; text: string } | { ok: false; error: string; status?: number; aborted?: boolean };

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 15_000;

/** The chat endpoint for an API root. */
export function chatUrl(baseUrl: string): string {
  const root = baseUrl.trim().replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(root) ? root : `${root}/chat/completions`;
}

/**
 * Drops what models often wrap around a line: hidden reasoning in <think> tags (an
 * unclosed one means the model ran out of tokens while thinking), quotes, line breaks.
 */
export function cleanReply(text: string): string {
  return text
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .trim();
}

/** The reply text from a chat completion body, in either of the shapes servers send. */
function replyText(data: unknown): string {
  const choice = (data as { choices?: unknown[] } | null)?.choices?.[0] as
    { message?: { content?: unknown }; text?: unknown } | undefined;
  const content = choice?.message?.content ?? choice?.text;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part && typeof part.text === "string" ? part.text : "",
      )
      .join("");
  }
  return "";
}

/** The server's own error message, if it sent one. */
function errorDetail(data: unknown): string {
  const error = (data as { error?: unknown } | null)?.error;
  const message =
    typeof error === "string" ? error : (error as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message.slice(0, 200) : "";
}

/** Sends one chat request. Failures come back as a reason the player can act on. */
export async function chatCompletion(
  req: ChatRequest,
  fetchImpl: Fetch = fetch,
): Promise<ChatOutcome> {
  const url = chatUrl(req.baseUrl);
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (req.signal?.aborted) controller.abort();
  req.signal?.addEventListener("abort", onAbort);

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (req.apiKey) headers.authorization = `Bearer ${req.apiKey}`;
  const body: Record<string, unknown> = { model: req.model, messages: req.messages, stream: false };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data: unknown = await res.json().catch(() => null);
    // A timeout or cancel while the body was still arriving is reported as such below.
    if (controller.signal.aborted) throw new Error("aborted");
    if (!res.ok) {
      const detail = errorDetail(data);
      return {
        ok: false,
        status: res.status,
        error: `The model server answered ${res.status}${detail ? `: ${detail}` : "."}`,
      };
    }
    const text = cleanReply(replyText(data));
    if (!text) return { ok: false, error: "The model sent back no text." };
    return { ok: true, text };
  } catch {
    if (req.signal?.aborted) return { ok: false, aborted: true, error: "Cancelled." };
    if (timedOut)
      return {
        ok: false,
        error: `No answer from the model within ${Math.round(timeoutMs / 1000)} s.`,
      };
    return {
      ok: false,
      error: `Could not reach ${url}. Check that the server is running and allows requests from this page (CORS).`,
    };
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener("abort", onAbort);
  }
}
