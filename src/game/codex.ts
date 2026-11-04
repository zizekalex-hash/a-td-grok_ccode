import { CONFIG } from "@/game/config";

/** The text the game starts with until the player loads their own. Edit it in config.json. */
export const DEFAULT_CODEX: string[] = CONFIG.textPool;

/** How much of a text is kept: whole texts fit (the Read tab reads them through). */
const MAX_CHARS = 1_000_000;
export const MAX_LINES = 2000;

export function parseCodex(raw: string): string[] {
  const clipped = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) : raw;
  const chunks = clipped.split(/\n+/).flatMap((line) => {
    const t = line.replace(/\s+/g, " ").trim();
    if (!t) return [];
    if (t.length <= 180) return [t];
    return t.split(/(?<=[.!?])\s+/);
  });
  const lines = chunks.map((s) => s.trim()).filter((s) => s.length > 4);
  return lines.slice(0, MAX_LINES);
}
