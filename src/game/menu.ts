import { getGame } from "@/game/registry";
import { useGame, type OptionsTab } from "@/game/store";

/** Opens the game menu. In a fight it holds the game until the menu closes. */
export function openMenu() {
  const st = useGame.getState();
  if (st.menu) return;
  const pause = st.phase === "battle" && !st.paused;
  useGame.setState({ menu: true, menuPaused: pause, paused: st.paused || pause, drawer: false });
}

/** Closes the game menu, resuming the fight if the menu held it. */
export function closeMenu() {
  const st = useGame.getState();
  if (!st.menu) return;
  useGame.setState({ menu: false, paused: st.menuPaused ? false : st.paused, menuPaused: false });
}

/** Opens the options window on a tab. Options change things live, so the fight runs on. */
export function openOptions(tab?: OptionsTab) {
  closeMenu();
  useGame.setState({ drawer: true, ...(tab ? { optionsTab: tab } : {}) });
}

export function closeOptions() {
  useGame.setState({ drawer: false });
}

/**
 * Esc closes whatever is open, the topmost first: the tome, the options,
 * the menu, a title panel. With nothing open during a fight, it opens the menu. A
 * game that already used the key (to clear a selection) marks the event handled.
 */
export function onEscape(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  // Decide after the games have seen the key.
  window.setTimeout(() => {
    if (e.defaultPrevented) return;
    const st = useGame.getState();
    if (st.tomeOpen) getGame()?.toggleTome();
    else if (st.drawer) closeOptions();
    else if (st.menu) closeMenu();
    else if (st.panel !== "none") useGame.setState({ panel: "none" });
    else if (st.phase === "battle") openMenu();
  }, 0);
}
