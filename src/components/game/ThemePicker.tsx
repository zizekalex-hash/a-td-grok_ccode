import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Palette, X } from "lucide-react";
import { THEMES, type ThemeColors } from "@/game/theme";
import { subscribeTheme, themeState, themeUpdate } from "@/game/themeRun";

const COLOR_FIELDS: [keyof ThemeColors, string][] = [
  ["bg", "Background"],
  ["accent", "Main accent"],
  ["on", "On / picked"],
  ["hi", "Stands out"],
  ["fg", "Words"],
  ["muted", "Quiet words"],
  ["danger", "Warnings"],
];

/** A theme's colours at a glance: its accent, its "on" and what stands out, on its background. */
function Swatch({ c }: { c: ThemeColors }) {
  return (
    <span
      className="inline-flex h-5 w-9 shrink-0 items-center justify-center gap-0.5 rounded border"
      style={{ background: c.bg, borderColor: c.accent }}
      aria-hidden
    >
      <span className="size-2 rounded-full" style={{ background: c.accent }} />
      <span className="size-2 rounded-full" style={{ background: c.on }} />
      <span className="size-2 rounded-full" style={{ background: c.hi }} />
    </span>
  );
}

/** The look: a theme (or your own colours), and compact or roomy buttons. Put on at once. */
export function ThemePicker() {
  const t = useSyncExternalStore(subscribeTheme, themeState, themeState);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Theme">
        {THEMES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={t.id === x.id}
            data-on={t.id === x.id}
            className="btn justify-start gap-2 px-2 text-left tracking-normal normal-case"
            onClick={() => themeUpdate({ id: x.id })}
          >
            <Swatch c={x.colors} />
            <span className="min-w-0 truncate">{x.name}</span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={t.id === "custom"}
          data-on={t.id === "custom"}
          className="btn justify-start gap-2 px-2 text-left tracking-normal normal-case"
          onClick={() => themeUpdate({ id: "custom" })}
        >
          <Swatch c={t.custom} />
          <span className="min-w-0 truncate">Your own colours</span>
        </button>
      </div>
      {t.id === "custom" && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {COLOR_FIELDS.map(([k, label]) => (
              <label
                key={k}
                className="flex items-center justify-between gap-2 rounded border border-cyan/30 px-2 py-1 text-xs text-muted"
              >
                {label}
                <input
                  type="color"
                  value={t.custom[k]}
                  onChange={(e) => themeUpdate({ custom: { ...t.custom, [k]: e.target.value } })}
                  aria-label={label}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
            ))}
          </div>
          <p className="text-[0.65rem] text-muted">Start from:</p>
          <div className="flex flex-wrap gap-1">
            {THEMES.map((x) => (
              <button
                key={x.id}
                type="button"
                className="btn gap-1.5 px-1.5 text-[0.6rem] tracking-normal normal-case"
                onClick={() => themeUpdate({ custom: { ...x.colors } })}
                aria-label={`Your own colours: start from ${x.name}`}
              >
                <Swatch c={x.colors} />
                {x.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Buttons">
        {(
          [
            ["compact", "Compact"],
            ["comfortable", "Roomy"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={t.density === k}
            data-on={t.density === k}
            className="btn tracking-normal normal-case"
            onClick={() => themeUpdate({ density: k })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The palette button: the look, from anywhere it sits (a popup over the page). */
export function ThemeButton() {
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="btn stepper"
        onClick={() => setOpen(true)}
        aria-label="The look: theme and colours"
      >
        <Palette className="size-4" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="The look"
              className="glass max-h-[85dvh] w-full max-w-md overflow-y-auto p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-display text-[0.7rem] tracking-[0.14em] text-cyan uppercase">
                  The look
                </p>
                <button
                  ref={close}
                  type="button"
                  className="btn stepper"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <ThemePicker />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
