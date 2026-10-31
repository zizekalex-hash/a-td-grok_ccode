import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AGENT_IDS, AGENTS, MAX_MESSAGE_CHARS, parseAgentRequest } from "./agents.ts";
import { AGENT_LIMIT, createLimiter } from "./limit.ts";

describe("parseAgentRequest", () => {
  it("accepts a known agent and trims the message", () => {
    const parsed = parseAgentRequest({ agent: "coach", message: "  how do I pace the drill?  " });
    assert.deepEqual(parsed, { ok: true, request: { agent: "coach", message: "how do I pace the drill?" } });
  });

  it("refuses bodies that are not objects", () => {
    for (const body of [null, "hi", 3, [], ["scribe", "x"]]) {
      assert.equal(parseAgentRequest(body).ok, false);
    }
  });

  it("refuses an agent outside the allow-list", () => {
    const parsed = parseAgentRequest({ agent: "oracle", message: "hello" });
    assert.deepEqual(parsed, { ok: false, error: "Unknown agent." });
    assert.equal(parseAgentRequest({ agent: ["scribe"], message: "hello" }).ok, false);
  });

  it("refuses a missing, non-text or blank message", () => {
    assert.equal(parseAgentRequest({ agent: "scribe" }).ok, false);
    assert.equal(parseAgentRequest({ agent: "scribe", message: 12 }).ok, false);
    assert.deepEqual(parseAgentRequest({ agent: "scribe", message: "   " }), {
      ok: false,
      error: "The message is empty.",
    });
  });

  it("accepts a message at the limit and refuses one past it", () => {
    const atLimit = "a".repeat(MAX_MESSAGE_CHARS);
    assert.equal(parseAgentRequest({ agent: "scribe", message: atLimit }).ok, true);
    const over = parseAgentRequest({ agent: "scribe", message: atLimit + "a" });
    assert.equal(over.ok, false);
  });
});

describe("agent definitions", () => {
  it("runs only on the allow-listed models with valid effort and caps", () => {
    const models = new Set(["claude-sonnet-5-5", "claude-opus-5-5"]);
    for (const id of AGENT_IDS) {
      const spec = AGENTS[id];
      assert.equal(spec.id, id);
      assert.ok(models.has(spec.model), `${id} uses ${spec.model}`);
      assert.ok(["low", "medium"].includes(spec.effort));
      assert.ok(spec.maxTokens > 0 && spec.maxTokens <= 4000);
      assert.ok(spec.system.length > 0);
    }
  });
});

describe("createLimiter", () => {
  it("allows up to the max inside the window and then refuses", () => {
    const limit = createLimiter({ max: 2, windowMs: 1000 });
    assert.equal(limit.allow("a", 0), true);
    assert.equal(limit.allow("a", 10), true);
    assert.equal(limit.allow("a", 20), false);
  });

  it("frees a slot once the oldest hit leaves the window", () => {
    const limit = createLimiter({ max: 2, windowMs: 1000 });
    limit.allow("a", 0);
    limit.allow("a", 500);
    assert.equal(limit.allow("a", 900), false);
    assert.equal(limit.allow("a", 1001), true);
  });

  it("keeps each client address separate", () => {
    const limit = createLimiter({ max: 1, windowMs: 1000 });
    assert.equal(limit.allow("a", 0), true);
    assert.equal(limit.allow("b", 0), true);
    assert.equal(limit.allow("a", 0), false);
  });

  it("ships a window that is longer than a single burst", () => {
    assert.ok(AGENT_LIMIT.max >= 5);
    assert.ok(AGENT_LIMIT.windowMs >= 60_000);
  });
});
