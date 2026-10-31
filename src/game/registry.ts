import type { Mood } from "@/game/dialogue";

/** What every playable mode offers the menus, title card and settings. */
export interface GameBase {
  start(): void;
  stop(): void;
  engage(): void;
  toTitle(): void;
  togglePause(): void;
  toggleTome(): void;
  persist(): void;
  onCodex(count: number): void;
  say(mood: Mood, force?: boolean): void;
}

let active: GameBase | null = null;

export function setActiveGame(game: GameBase | null) {
  active = game;
}

export function getGame(): GameBase | null {
  return active;
}
