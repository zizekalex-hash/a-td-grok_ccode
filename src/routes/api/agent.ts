import { createFileRoute } from "@tanstack/react-router";
import { parseAgentRequest } from "@/lib/agents/agents";
import { AGENT_LIMIT, createLimiter } from "@/lib/agents/limit";
import { agentsConfigured, askAgent } from "@/lib/agents/ask.server";

const limiter = createLimiter(AGENT_LIMIT);

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!agentsConfigured()) {
          return reply({ error: "Agents are not configured on this server." }, 503);
        }
        const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
        if (!limiter.allow(client)) {
          return reply({ error: "Too many questions. Wait a few minutes." }, 429);
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return reply({ error: "Send JSON." }, 400);
        }
        const parsed = parseAgentRequest(body);
        if (!parsed.ok) {
          return reply({ error: parsed.error }, 400);
        }
        const result = await askAgent(parsed.request);
        if (!result.ok) {
          return reply({ error: result.error }, result.status);
        }
        return reply({ text: result.text, truncated: result.truncated });
      },
    },
  },
});
