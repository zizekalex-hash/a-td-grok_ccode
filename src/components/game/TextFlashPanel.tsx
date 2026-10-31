import { useEffect, useRef, useState } from "react";
import { CONFIG } from "@/game/config";
import { accentFor } from "@/game/council";
import { TextFlash } from "@/game/textFlash";
import { useGame } from "@/game/store";

/** How long a spoken line stays over the flashes, in ms. */
const CAPTION_MS = 4500;

/**
 * Phrases from the loaded text flashing through. It ends every battle HUD and sits
 * in the title and game-over cards. Spoken lines (the council and the narrator) only
 * show over it when ui.showSpeech is on in config.json.
 */
export function TextFlashPanel({
  className = "",
  variant = "panel",
}: {
  className?: string;
  /** "panel" stands alone; "inset" sits inside another card. */
  variant?: "panel" | "inset";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holo = useGame((s) => s.settings.holo);
  const frame = variant === "panel" ? "glass" : "rounded-md border border-cyan/30 bg-bg/50";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const flash = new TextFlash(canvas);
    flash.start();
    return () => flash.stop();
  }, []);

  return (
    <div className={`${frame} flash-panel relative overflow-hidden ${className}`} data-holo={holo}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      {CONFIG.ui.showSpeech && <SpeechCaption />}
    </div>
  );
}

/** The latest spoken line, shown over the flashes for a few seconds. */
function SpeechCaption() {
  const speaker = useGame((s) => s.hud.speaker);
  const line = useGame((s) => s.hud.line);
  const [caption, setCaption] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    // The line already showing when the panel opens is old news.
    if (first.current) {
      first.current = false;
      return;
    }
    setCaption(true);
    const id = window.setTimeout(() => setCaption(false), CAPTION_MS);
    return () => window.clearTimeout(id);
  }, [speaker, line]);

  return (
    <p
      className="flash-caption absolute inset-x-0 top-0 px-3 py-2 text-sm leading-snug text-fg"
      data-show={caption}
      aria-live="polite"
    >
      <span
        className={`font-display text-[11px] tracking-[0.18em] uppercase ${accentFor(speaker)}`}
      >
        {speaker}
      </span>{" "}
      {line}
    </p>
  );
}
