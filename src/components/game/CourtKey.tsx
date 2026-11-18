import { useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, X } from "lucide-react";
import { NarratorForm } from "@/components/game/NarratorForm";
import { narratorOverrides, narratorSettings, saveNarratorOverrides } from "@/game/narrator";

/** Where xAI's (Grok's) models answer: an OpenAI-compatible address. */
const XAI = "https://api.x.ai/v1";

/**
 * A small window, off to the side, for a chat model's key: paste it, save, and
 * the queens speak through that model (their own lines when it is off or does
 * not answer). The key stays on this device.
 */
export function KeyButton() {
  const [open, setOpen] = useState(false);
  // Remounts the form after a preset, so it shows the new address.
  const [turn, setTurn] = useState(0);
  const on = narratorSettings().enabled;
  return (
    <>
      <button
        type="button"
        className="btn px-2!"
        data-on={on}
        onClick={() => setOpen(true)}
        aria-label={`A chat model for the queens: ${on ? "on" : "off"}. Paste a key here.`}
        title="A chat model for the queens: paste a key"
      >
        <KeyRound className="size-4" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            onClick={() => setOpen(false)}
          >
            <section
              className="glass flex max-h-[86dvh] w-full max-w-xl flex-col"
              role="dialog"
              aria-label="A chat model for the queens"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between gap-3 border-b border-cyan/30 px-3 py-2">
                <h2 className="font-display text-sm tracking-[0.16em] text-cyan uppercase">Model key</h2>
                <button type="button" className="btn" onClick={() => setOpen(false)} aria-label="Close Model key">
                  <X className="size-4" aria-hidden />
                </button>
              </header>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                <p className="text-xs text-muted">
                  With a key from a chat service, the queens say lines the model writes. Three steps:
                  tap the service, type the model's name as the service's console shows it, paste
                  the key, then Save and switch it on. Test says whether it answers. Off, or with no
                  answer, they use their own lines.
                </p>
                <button
                  type="button"
                  className="btn w-full tracking-normal normal-case"
                  onClick={() => {
                    saveNarratorOverrides({ ...narratorOverrides(), baseUrl: XAI });
                    setTurn((n) => n + 1);
                  }}
                >
                  Use Grok (xAI): fill in its address
                </button>
                <NarratorForm key={turn} />
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
