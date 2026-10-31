import { CONFIG } from "@/game/config";

/** The text the game starts with until the player loads their own. Edit it in config.json. */
export const DEFAULT_CODEX: string[] = CONFIG.textPool;

export function parseCodex(raw: string): string[] {
  const clipped = raw.length > 500_000 ? raw.slice(0, 500_000) : raw;
  const chunks = clipped.split(/\n+/).flatMap((line) => {
    const t = line.replace(/\s+/g, " ").trim();
    if (!t) return [];
    if (t.length <= 180) return [t];
    return t.split(/(?<=[.!?])\s+/);
  });
  const lines = chunks.map((s) => s.trim()).filter((s) => s.length > 4);
  return lines.slice(0, 400);
}
