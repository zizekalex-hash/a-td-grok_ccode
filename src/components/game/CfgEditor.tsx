import { useMemo, useRef, useState } from "react";
import { ClipboardCopy, Download, RotateCcw, Upload } from "lucide-react";
import {
  check,
  cvars,
  loadOverrides,
  parse,
  same,
  sanitize,
  saveOverrides,
  show,
  type CfgValue,
  type Cvar,
  type Overrides,
} from "@/game/cfg";
import { CFG_STATUS, DEFAULT_CONFIG } from "@/game/config";
import { flashToast, updateSetting } from "@/game/engine";
import { useGame, type Settings } from "@/game/store";

/** Rows shown at once; a search narrows the rest. */
const SHOWN = 60;

const SECTIONS: Record<string, string> = {
  td: "Tower defense",
  chess: "Auto chess",
  arcade: "Arcade",
  core: "Core",
  rain: "Binary rain",
  field: "Text field",
  ui: "Interface",
  settingLimits: "Slider limits",
};

function restart() {
  window.setTimeout(() => window.location.reload(), 150);
}

/** What the draft would save: the saved changes with the typed edits laid over. */
function merge(list: Cvar[], saved: Overrides, draft: Record<string, string>) {
  const next: Overrides = { ...saved };
  const errors: Record<string, string> = {};
  for (const c of list) {
    const text = draft[c.path];
    if (text === undefined) continue;
    const parsed = parse(c.kind, text);
    if (!parsed.ok) {
      errors[c.path] = parsed.reason;
      continue;
    }
    const bad = check(c.def, parsed.value);
    if (bad) {
      errors[c.path] = bad;
      continue;
    }
    if (same(parsed.value, c.def)) delete next[c.path];
    else next[c.path] = parsed.value;
  }
  return { next, errors };
}

/**
 * Options → Advanced: every value in config.json as a cvar list, like a game
 * console. Edits are kept on this device and take effect after a restart.
 */
export function CfgEditor() {
  const settings = useGame((s) => s.settings);
  const [saved, setSaved] = useState<Overrides>(() => sanitize(DEFAULT_CONFIG, loadOverrides()));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [paste, setPaste] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => cvars(DEFAULT_CONFIG, saved), [saved]);
  const { next, errors } = useMemo(() => merge(all, saved, draft), [all, saved, draft]);
  const changed = Object.keys(next).length;
  const dirty = Object.keys(next).length !== Object.keys(saved).length || Object.entries(next).some(([k, v]) => !same(v, saved[k]));
  const hasErrors = Object.keys(errors).length > 0;

  const q = query.trim().toLowerCase();
  const matches = all.filter(
    (c) => (!section || c.path.startsWith(`${section}.`)) && (!q || c.path.toLowerCase().includes(q)),
  );

  const apply = () => {
    saveOverrides(next);
    flashToast("Cfg saved. Restarting…");
    restart();
  };

  const exportText = () => JSON.stringify({ game: "azshara-signal-defense", version: 1, settings, cfg: next }, null, 2);

  const importText = (text: string) => {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      flashToast("That is not a cfg file");
      return;
    }
    if (typeof data !== "object" || data === null) return;
    const d = data as { settings?: Partial<Settings>; cfg?: unknown };
    if (d.settings && typeof d.settings === "object") {
      for (const [key, value] of Object.entries(d.settings)) {
        if (key in settings && typeof value === typeof settings[key as keyof Settings]) {
          updateSetting(key as keyof Settings, value as Settings[keyof Settings]);
        }
      }
    }
    const cfg = sanitize(DEFAULT_CONFIG, d.cfg ?? {});
    const differs =
      Object.keys(cfg).length !== Object.keys(saved).length || Object.entries(cfg).some(([k, v]) => !same(v, saved[k]));
    if (differs) {
      saveOverrides(cfg);
      setSaved(cfg);
      flashToast("Cfg loaded. Restarting…");
      restart();
    } else {
      flashToast("Settings loaded");
    }
  };

  return (
    <div>
      <p className="text-xs leading-relaxed text-muted">
        Every number in the game&apos;s config file, by name. Edits stay on this device and apply after a restart.
        Values that would break the game are refused.
      </p>
      {CFG_STATUS.paused ? (
        <p className="mt-2 rounded-md border border-danger/60 p-2 text-xs text-danger">
          Your changes are off: the game failed to start with them. Fix them below and apply again, or reset.
        </p>
      ) : (
        <p className="mt-2 text-xs text-cyan">
          {CFG_STATUS.active > 0 ? `${CFG_STATUS.active} change${CFG_STATUS.active === 1 ? "" : "s"} active.` : "Running on the default config."}
          {dirty ? " Unapplied edits below." : ""}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Section">
        {["", ...Object.keys(SECTIONS)].map((key) => (
          <button
            key={key || "all"}
            type="button"
            data-on={section === key}
            className="rounded-full border border-cyan/40 px-2 py-1 text-[0.7rem] text-cyan data-[on=true]:border-violet data-[on=true]:bg-violet/25 data-[on=true]:text-fg"
            onClick={() => setSection(key)}
          >
            {key ? SECTIONS[key] : "All"}
          </button>
        ))}
      </div>
      <input
        type="search"
        className="text-input mt-2 w-full"
        placeholder="Search, e.g. startGold or knight"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search the cfg"
      />

      <ul className="mt-2 divide-y divide-cyan/10">
        {matches.slice(0, SHOWN).map((c) => (
          <CvarRow
            key={c.path}
            cvar={c}
            text={draft[c.path] ?? show(c.value)}
            error={errors[c.path]}
            changed={!same(next[c.path] ?? c.def, c.def)}
            onChange={(text) => setDraft((d) => ({ ...d, [c.path]: text }))}
            onReset={() => setDraft((d) => ({ ...d, [c.path]: show(c.def) }))}
          />
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted">
        {matches.length > SHOWN ? `${matches.length - SHOWN} more: narrow the search.` : `${matches.length} shown.`}{" "}
        {changed > 0 ? `${changed} differ from the defaults.` : ""}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn" disabled={!dirty || hasErrors} onClick={apply}>
          Apply &amp; restart
        </button>
        <button type="button" className="btn" disabled={!Object.keys(draft).length} onClick={() => setDraft({})}>
          Discard edits
        </button>
        <button
          type="button"
          className="btn"
          data-on={confirmReset}
          disabled={!Object.keys(saved).length && !CFG_STATUS.paused}
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true);
              return;
            }
            saveOverrides({});
            flashToast("Back to the default config. Restarting…");
            restart();
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
          {confirmReset ? "Tap to confirm" : "Reset all"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([exportText()], { type: "application/json" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "azshara.cfg";
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download className="size-4" aria-hidden />
          Export
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigator.clipboard
              ?.writeText(exportText())
              .then(() => flashToast("Cfg copied"))
              .catch(() => flashToast("Copy is not allowed here"));
          }}
        >
          <ClipboardCopy className="size-4" aria-hidden />
          Copy
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" aria-hidden />
          Import
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".cfg,.json,application/json,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void file.text().then(importText);
          e.target.value = "";
        }}
      />
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted">Paste a cfg</summary>
        <textarea className="mt-2" value={paste} placeholder="Paste exported cfg text here." onChange={(e) => setPaste(e.target.value)} />
        <button
          type="button"
          className="btn mt-2"
          disabled={!paste.trim()}
          onClick={() => {
            importText(paste);
            setPaste("");
          }}
        >
          Load pasted cfg
        </button>
      </details>
    </div>
  );
}

function CvarRow({
  cvar,
  text,
  error,
  changed,
  onChange,
  onReset,
}: {
  cvar: Cvar;
  text: string;
  error: string | undefined;
  changed: boolean;
  onChange: (text: string) => void;
  onReset: () => void;
}) {
  const id = `cvar-${cvar.path}`;
  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={`min-w-0 break-all font-mono text-[0.7rem] ${changed ? "text-gold" : "text-fg"}`}>
          {cvar.path}
        </label>
        {changed && (
          <button
            type="button"
            className="shrink-0 rounded border border-cyan/40 px-1.5 text-[0.65rem] text-cyan"
            aria-label={`Reset ${cvar.path}`}
            onClick={onReset}
          >
            ↺ {show(cvar.def as CfgValue)}
          </button>
        )}
      </div>
      {cvar.kind === "boolean" ? (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={text === "true"}
          data-on={text === "true"}
          className="btn mt-1 w-24"
          onClick={() => onChange(text === "true" ? "false" : "true")}
        >
          {text === "true" ? "On" : "Off"}
        </button>
      ) : (
        <input
          id={id}
          className="text-input mt-1 w-full"
          inputMode={cvar.kind === "string" ? "text" : "decimal"}
          value={text}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error && <p className="mt-0.5 text-[0.7rem] text-danger">{error}</p>}
    </li>
  );
}
