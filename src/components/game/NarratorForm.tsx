import { useState } from "react";
import { SpeakerLine } from "@/components/game/Chrome";
import { CONFIG } from "@/game/config";
import {
  narratorLastError,
  narratorOverrides,
  narratorSettings,
  saveNarratorOverrides,
  testNarrator,
} from "@/game/narrator";
import { isHttpUrl } from "@/lib/narrator/narrator";

type Draft = { enabled: boolean; baseUrl: string; model: string; apiKey: string };

type Status =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "saved" }
  | { state: "reply"; text: string }
  | { state: "error"; text: string };

function initialDraft(): Draft {
  const settings = narratorSettings();
  return {
    enabled: settings.enabled,
    baseUrl: settings.baseUrl,
    model: settings.model,
    // Only a key typed on this device is shown; one in config.json stays out of the form.
    apiKey: narratorOverrides().apiKey ?? "",
  };
}

/** A plain http address to anything but this machine is blocked on an https page. */
function blockedAsMixedContent(baseUrl: string): boolean {
  if (typeof window === "undefined" || window.location.protocol !== "https:") return false;
  try {
    const url = new URL(baseUrl);
    return url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** Settings for the narrator: which OpenAI-compatible model voices the game's events. */
export function NarratorForm() {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [saved, setSaved] = useState<Draft>(initialDraft);
  const [status, setStatus] = useState<Status>(() => {
    const error = narratorLastError();
    return error ? { state: "error", text: `Last attempt in game: ${error}` } : { state: "idle" };
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const urlOk = isHttpUrl(draft.baseUrl);
  const name = CONFIG.narrator.name;

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (status.state === "saved") setStatus({ state: "idle" });
  };

  const save = () => {
    if (!urlOk)
      return setStatus({
        state: "error",
        text: "Enter an address that starts with http:// or https://.",
      });
    saveNarratorOverrides({
      enabled: draft.enabled,
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
    });
    const next = initialDraft();
    setDraft(next);
    setSaved(next);
    setStatus({ state: "saved" });
  };

  /** The switch applies at once; the address, model and key wait for Save. */
  const toggle = () => {
    const enabled = !draft.enabled;
    saveNarratorOverrides({ ...narratorOverrides(), enabled });
    setDraft((d) => ({ ...d, enabled }));
    setSaved((d) => ({ ...d, enabled }));
    setStatus({ state: "idle" });
  };

  const reset = () => {
    saveNarratorOverrides(null);
    const next = initialDraft();
    setDraft(next);
    setSaved(next);
    setStatus({ state: "idle" });
  };

  const test = async () => {
    if (!urlOk)
      return setStatus({
        state: "error",
        text: "Enter an address that starts with http:// or https://.",
      });
    setStatus({ state: "testing" });
    const outcome = await testNarrator({
      ...narratorSettings(),
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim() || CONFIG.narrator.model,
      apiKey: draft.apiKey.trim() || CONFIG.narrator.apiKey,
    });
    setStatus(
      outcome.ok ? { state: "reply", text: outcome.text } : { state: "error", text: outcome.error },
    );
  };

  return (
    <section aria-labelledby="narrator-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="narrator-title" className="font-display text-xs tracking-[0.16em] text-cyan">
            NARRATOR · YOUR MODEL
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {name} comments on the fight with lines from any OpenAI-compatible model, such as LM
            Studio, Ollama or OpenAI.
          </p>
        </div>
        <button
          type="button"
          className="btn shrink-0"
          data-on={draft.enabled}
          aria-pressed={draft.enabled}
          aria-label={`${name} narrator`}
          onClick={toggle}
        >
          {draft.enabled ? "On" : "Off"}
        </button>
      </div>

      <form
        className="mt-3 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div>
          <label htmlFor="narrator-url" className="text-xs tracking-wider text-muted uppercase">
            API base URL
          </label>
          <input
            id="narrator-url"
            className="text-input mt-1"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={draft.baseUrl}
            placeholder="http://localhost:1234/v1"
            onChange={(e) => edit({ baseUrl: e.target.value })}
          />
          {blockedAsMixedContent(draft.baseUrl) && (
            <p className="mt-1 text-xs text-danger">
              This page is served over https, so the browser blocks a plain http address unless it
              is localhost.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="narrator-model" className="text-xs tracking-wider text-muted uppercase">
            Model
          </label>
          <input
            id="narrator-model"
            className="text-input mt-1"
            autoComplete="off"
            spellCheck={false}
            value={draft.model}
            placeholder={CONFIG.narrator.model}
            onChange={(e) => edit({ model: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="narrator-key" className="text-xs tracking-wider text-muted uppercase">
            API key (optional)
          </label>
          <input
            id="narrator-key"
            className="text-input mt-1"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft.apiKey}
            placeholder="Not needed for a local server"
            onChange={(e) => edit({ apiKey: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted">
            Saved in this browser only. It is sent to the address above and nowhere else.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="submit" className="btn" disabled={!dirty}>
            Save
          </button>
          <button
            type="button"
            className="btn"
            disabled={status.state === "testing"}
            onClick={() => void test()}
          >
            {status.state === "testing" ? "Testing" : "Test"}
          </button>
          <button type="button" className="btn" onClick={reset}>
            Reset
          </button>
        </div>
      </form>

      <div role="status" aria-live="polite" className="mt-2 min-h-5 text-sm">
        {status.state === "saved" && (
          <p className="text-gold">
            Saved.{" "}
            {!CONFIG.ui.showSpeech
              ? "Spoken lines are hidden in battle for now."
              : saved.enabled
                ? `${name} speaks in the next fight.`
                : `Switch ${name} on to hear it.`}
          </p>
        )}
        {status.state === "reply" && (
          <SpeakerLine speaker={name} text={status.text} className="text-fg" />
        )}
        {status.state === "error" && <p className="text-danger">{status.text}</p>}
      </div>
      {!CONFIG.ui.showSpeech && (
        <p className="mt-2 text-xs leading-relaxed text-gold">
          Spoken lines are hidden in battle (ui.showSpeech in config.json), so the narrator sends
          nothing during a fight. Test still works here.
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Only the event and a few numbers, such as the wave and the core's integrity, are sent. Your
        loaded text is not. Defaults come from config.json; Reset goes back to them.
      </p>
    </section>
  );
}
