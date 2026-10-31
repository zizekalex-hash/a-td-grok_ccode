import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chatCompletion, chatUrl, cleanReply, type Fetch } from "./openai.ts";
import {
  applyOverrides,
  describeEvent,
  fitLine,
  gate,
  isHttpUrl,
  type NarratorSettings,
} from "./narrator.ts";

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ok = (content: unknown) => reply({ choices: [{ message: { role: "assistant", content } }] });

const BASE: NarratorSettings = {
  enabled: false,
  name: "Ysera",
  baseUrl: "http://localhost:1234/v1",
  model: "local-model",
  apiKey: "",
  systemPrompt: "You are Ysera.",
  temperature: 0.8,
  maxTokens: 80,
  timeoutMs: 1000,
  cooldownMs: 6000,
  events: { leak: "Core hit" },
  priorityEvents: ["over"],
};

describe("chatUrl", () => {
  it("adds the chat path to an API root, with or without a trailing slash", () => {
    assert.equal(chatUrl("http://localhost:1234/v1"), "http://localhost:1234/v1/chat/completions");
    assert.equal(chatUrl("http://localhost:1234/v1/"), "http://localhost:1234/v1/chat/completions");
  });

  it("keeps a full chat completions URL as it is", () => {
    assert.equal(
      chatUrl("https://api.example.com/v1/chat/completions"),
      "https://api.example.com/v1/chat/completions",
    );
  });
});

describe("chatCompletion", () => {
  it("posts an OpenAI-style request and returns the reply text", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake: Fetch = async (url, init) => {
      seen = { url, init };
      return ok("  The core holds.  ");
    };
    const outcome = await chatCompletion(
      {
        baseUrl: "http://localhost:1234/v1",
        model: "local-model",
        messages: [{ role: "user", content: "Event: Core hit" }],
        temperature: 0.5,
        maxTokens: 40,
      },
      fake,
    );
    assert.deepEqual(outcome, { ok: true, text: "The core holds." });
    assert.ok(seen);
    const { url, init } = seen as { url: string; init: RequestInit };
    assert.equal(url, "http://localhost:1234/v1/chat/completions");
    assert.equal(init.method, "POST");
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "local-model");
    assert.equal(body.max_tokens, 40);
    assert.equal(body.temperature, 0.5);
    assert.equal(body.stream, false);
    assert.deepEqual(body.messages, [{ role: "user", content: "Event: Core hit" }]);
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.authorization, undefined);
  });

  it("sends the key as a bearer token only when there is one", async () => {
    let auth: string | undefined;
    const fake: Fetch = async (_url, init) => {
      auth = (init.headers as Record<string, string>).authorization;
      return ok("hi");
    };
    await chatCompletion(
      { baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "m", messages: [] },
      fake,
    );
    assert.equal(auth, "Bearer sk-test");
  });

  it("reads replies sent as a list of text parts, or in the legacy text field", async () => {
    const parts = await chatCompletion(
      { baseUrl: "http://x/v1", model: "m", messages: [] },
      async () =>
        ok([
          { type: "text", text: "Hold " },
          { type: "text", text: "the line." },
        ]),
    );
    assert.deepEqual(parts, { ok: true, text: "Hold the line." });
    const legacy = await chatCompletion(
      { baseUrl: "http://x/v1", model: "m", messages: [] },
      async () => reply({ choices: [{ text: "Wave cleared." }] }),
    );
    assert.deepEqual(legacy, { ok: true, text: "Wave cleared." });
  });

  it("reports the server's error message and status", async () => {
    const outcome = await chatCompletion(
      { baseUrl: "http://x/v1", model: "m", messages: [] },
      async () => reply({ error: { message: "model not loaded" } }, 404),
    );
    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && outcome.status === 404 && outcome.error.includes("model not loaded"));
  });

  it("treats an empty reply as a failure", async () => {
    const outcome = await chatCompletion(
      { baseUrl: "http://x/v1", model: "m", messages: [] },
      async () => ok("<think>hmm"),
    );
    assert.deepEqual(outcome, { ok: false, error: "The model sent back no text." });
  });

  it("turns a network failure into a reason, without throwing", async () => {
    const outcome = await chatCompletion(
      { baseUrl: "http://localhost:1/v1", model: "m", messages: [] },
      async () => {
        throw new TypeError("Failed to fetch");
      },
    );
    assert.ok(
      !outcome.ok &&
        outcome.error.includes("Could not reach http://localhost:1/v1/chat/completions"),
    );
  });

  it("gives up after the timeout", async () => {
    const hang: Fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const outcome = await chatCompletion(
      { baseUrl: "http://x/v1", model: "m", messages: [], timeoutMs: 20 },
      hang,
    );
    assert.ok(!outcome.ok && outcome.error.includes("No answer"));
  });

  it("says when the caller cancelled", async () => {
    const controller = new AbortController();
    const hang: Fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const pending = chatCompletion(
      { baseUrl: "http://x/v1", model: "m", messages: [], signal: controller.signal },
      hang,
    );
    controller.abort();
    const outcome = await pending;
    assert.ok(!outcome.ok && outcome.aborted === true);
  });
});

describe("cleanReply", () => {
  it("drops hidden reasoning, quotes and line breaks", () => {
    assert.equal(cleanReply('<think>plan the line</think>\n"Hold the\ncore."'), "Hold the core.");
  });
});

describe("describeEvent", () => {
  it("names the event, then lists the facts one per line", () => {
    assert.equal(
      describeEvent("Core hit", { Mode: "core defense", Wave: 3, "Core integrity": "72%" }),
      "Event: Core hit\nMode: core defense\nWave: 3\nCore integrity: 72%",
    );
  });
});

describe("fitLine", () => {
  it("leaves short lines alone and cuts long ones at a word", () => {
    assert.equal(fitLine("Short line.", 40), "Short line.");
    const cut = fitLine("one two three four five six seven", 16);
    assert.ok(cut.length <= 16, cut);
    assert.ok(cut.endsWith("…"));
    assert.ok("one two three four".startsWith(cut.slice(0, -1)));
  });
});

describe("gate", () => {
  const idle = { busy: false, lastSentAt: -Infinity, quietUntil: 0 };

  it("sends when idle and past the cooldown", () => {
    assert.equal(gate(idle, 1000, 6000, false), "send");
  });

  it("holds ordinary events inside the cooldown, but not priority ones", () => {
    const recent = { ...idle, lastSentAt: 1000 };
    assert.equal(gate(recent, 3000, 6000, false), "skip");
    assert.equal(gate(recent, 3000, 6000, true), "send");
    assert.equal(gate(recent, 7000, 6000, false), "send");
  });

  it("never interrupts a request in flight for an ordinary event, and replaces it for a priority one", () => {
    const busy = { ...idle, busy: true };
    assert.equal(gate(busy, 10_000, 6000, false), "skip");
    assert.equal(gate(busy, 10_000, 6000, true), "replace");
  });

  it("stays quiet after a failure, even for priority events", () => {
    const quiet = { ...idle, quietUntil: 5000 };
    assert.equal(gate(quiet, 4000, 0, true), "skip");
    assert.equal(gate(quiet, 5000, 0, true), "send");
  });
});

describe("applyOverrides", () => {
  it("layers device settings over the defaults", () => {
    const merged = applyOverrides(BASE, {
      enabled: true,
      baseUrl: " http://192.168.1.5:11434/v1 ",
      model: "llama3",
      apiKey: "k",
    });
    assert.equal(merged.enabled, true);
    assert.equal(merged.baseUrl, "http://192.168.1.5:11434/v1");
    assert.equal(merged.model, "llama3");
    assert.equal(merged.apiKey, "k");
    assert.equal(merged.systemPrompt, BASE.systemPrompt);
  });

  it("keeps the defaults for anything missing, blank or of the wrong type", () => {
    assert.deepEqual(applyOverrides(BASE, null), BASE);
    assert.deepEqual(applyOverrides(BASE, "nope"), BASE);
    assert.deepEqual(applyOverrides(BASE, { enabled: "yes", baseUrl: "  ", model: 3 }), BASE);
  });
});

describe("isHttpUrl", () => {
  it("accepts http and https addresses only", () => {
    assert.equal(isHttpUrl("http://localhost:1234/v1"), true);
    assert.equal(isHttpUrl("https://api.openai.com/v1"), true);
    assert.equal(isHttpUrl("ftp://example.com"), false);
    assert.equal(isHttpUrl("localhost:1234"), false);
    assert.equal(isHttpUrl(""), false);
  });
});
