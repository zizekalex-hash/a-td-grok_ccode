import { BookOpen, Menu, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { updateSetting } from "@/game/engine";
import { openMenu } from "@/game/menu";
import { getGame } from "@/game/registry";
import { useGame } from "@/game/store";

/** The row under every battle: the tome, hold, sound and the menu. */
export function BattleButtons() {
  const paused = useGame((s) => s.paused);
  const muted = useGame((s) => s.settings.muted);
  return (
    <div className="mt-2 grid grid-cols-4 gap-2">
      <button type="button" className="btn" onClick={() => getGame()?.toggleTome()}>
        <BookOpen className="size-4" aria-hidden />
        Tome
      </button>
      <button
        type="button"
        className="btn"
        data-on={paused}
        onClick={() => getGame()?.togglePause()}
      >
        {paused ? (
          <Play className="size-4" aria-hidden />
        ) : (
          <Pause className="size-4" aria-hidden />
        )}
        {paused ? "Resume" : "Hold"}
      </button>
      <button
        type="button"
        className="btn"
        data-on={muted}
        aria-pressed={muted}
        onClick={() => updateSetting("muted", !muted)}
      >
        {muted ? (
          <VolumeX className="size-4" aria-hidden />
        ) : (
          <Volume2 className="size-4" aria-hidden />
        )}
        {muted ? "Muted" : "Sound"}
      </button>
      <MenuButton />
    </div>
  );
}

/** Opens the game menu (options, controls, restart, quit): the Esc key for a touch screen. */
export function MenuButton({
  className = "btn",
  compact = false,
  labelClass,
}: {
  className?: string;
  /** Show only the icon on phones, for a crowded row. */
  compact?: boolean;
  /** Classes for the label, when the row needs its own breakpoint. */
  labelClass?: string;
}) {
  const open = useGame((s) => s.menu || s.drawer);
  return (
    <button type="button" className={className} data-on={open} aria-label="Menu" onClick={openMenu}>
      <Menu className="size-4" aria-hidden />
      <span className={labelClass ?? (compact ? "max-[400px]:sr-only" : "max-[360px]:sr-only")}>
        Menu
      </span>
    </button>
  );
}
