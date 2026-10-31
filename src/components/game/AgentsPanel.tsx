import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { AGENT_IDS, AGENTS, MAX_MESSAGE_CHARS, type AgentId } from "@/lib/agents/agents";
import { askAgent } from "@/lib/agents/client";
import { NarratorForm } from "@/components/game/NarratorForm";
import { useGame } from "@/game/store";

/** The Android build has no server behind it, so the agents stay off there. */
const OFFLINE = import.meta.env.VITE_OFFLINE_BUILD === "1";

type Reply =
  | { state: "pending" }
  | { state: "done"; text: string; truncated: boolean }
  | { state: "failed"; error: string };

export function AgentsPanel() {
  const [agent, setAgent] = useState<AgentId>("scribe");
  const [message, setMessage] = useState("");
  const [replies, setReplies] = useState<Partial<Record<AgentId, Reply>>>({});
  const inFlight = useRef<AbortController[]>([]);
  const spec = AGENTS[agent];
  const trimmed = message.trim();
  const busy = Object.values(replies).some((reply) => reply?.state === "pending");

  useEffect(() => () => inFlight.current.forEach((controller) => controller.abort()), []);

  /** Sends the message to each listed agent at once. Each answer lands as it arrives. */
  function ask(ids: AgentId[]) {
    if (!trimmed || busy) return;
    inFlight.current.forEach((controller) => controller.abort());
    const controllers = ids.map(() => new AbortController());
    inFlight.current = controllers;
    setReplies(Object.fromEntries(ids.map((id) => [id, { state: "pending" }])));
    ids.forEach((id, i) => {
      void askAgent(id, trimmed, controllers[i].signal).then((outcome) => {
        if (controllers[i].signal.aborted) return;
        const reply: Reply = outcome.ok
          ? { state: "done", text: outcome.text, truncated: outcome.truncated }
          : { state: "failed", error: outcome.error };
        setReplies((previous) => ({ ...previous, [id]: reply }));
      });
    });
  }

  const shown = AGENT_IDS.filter((id) => replies[id]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-bg/90 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="glass flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-cyan/30 px-3 py-2">
          <div>
            <h2 className="font-display text-sm tracking-[0.16em] text-cyan">AGENTS</h2>
            <p className="text-xs text-muted">Your own model as narrator, and hosted helpers.</p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => useGame.setState({ panel: "none" })}
            aria-label="Close agents"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <NarratorForm />

          <h3 className="font-display mt-6 border-t border-cyan/30 pt-4 text-xs tracking-[0.16em] text-cyan">
            HOSTED HELPERS
          </h3>
          {OFFLINE && (
            <p className="glass my-3 p-3 text-sm text-muted">
              Scribe and Coach need the hosted build. The Android build runs fully offline, so they are switched off
              here. The narrator above still works with a model your phone can reach.
            </p>
          )}

          <div className="mt-2 grid grid-cols-2 gap-2">
            {AGENT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="btn flex-col items-start py-2 text-left"
                data-on={agent === id}
                aria-pressed={agent === id}
                onClick={() => setAgent(id)}
              >
                <span className="font-display text-xs tracking-wider">{AGENTS[id].name}</span>
                <span className="text-xs normal-case tracking-normal opacity-80">{AGENTS[id].blurb}</span>
              </button>
            ))}
          </div>

          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              ask([agent]);
            }}
          >
            <label htmlFor="agent-message" className="text-xs tracking-wider text-muted">
              {spec.prompt}
            </label>
            <textarea
              id="agent-message"
              className="mt-1 w-full rounded-md border border-cyan/40 bg-bg/60 p-2 text-sm text-fg"
              rows={5}
              maxLength={MAX_MESSAGE_CHARS}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={OFFLINE}
            />
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
              <span className="shrink-0 whitespace-nowrap">
                {message.length} / {MAX_MESSAGE_CHARS}
              </span>
              <span>Sent to Anthropic through this server. Keep private text out.</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="submit" className="btn" disabled={OFFLINE || busy || !trimmed}>
                <Send className="size-4" aria-hidden />
                {busy ? "Thinking" : `Ask ${spec.name}`}
              </button>
              <button
                type="button"
                className="btn"
                disabled={OFFLINE || busy || !trimmed}
                onClick={() => ask(AGENT_IDS.slice())}
              >
                Ask both
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Ask both sends your message to each agent at once, so it uses about twice the credits.
            </p>
          </form>

          <div role="status" aria-live="polite" className="mt-3 space-y-4 text-sm leading-relaxed">
            {shown.map((id) => {
              const reply = replies[id];
              return (
                <section key={id}>
                  <h3 className="font-display text-xs tracking-wider text-cyan">{AGENTS[id].name}</h3>
                  {reply?.state === "pending" && <p className="text-muted">Thinking</p>}
                  {reply?.state === "failed" && <p className="text-danger">{reply.error}</p>}
                  {reply?.state === "done" && (
                    <>
                      <p className="whitespace-pre-wrap text-fg">{reply.text}</p>
                      {reply.truncated && (
                        <p className="mt-2 text-xs text-muted">The answer was cut short. Ask for less, or ask a follow-up.</p>
                      )}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
