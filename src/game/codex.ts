import { CONFIG } from "@/game/config";

/** The text the game starts with until the player loads their own. Edit it in config.json. */
export const DEFAULT_CODEX: string[] = CONFIG.textPool;

/** A line worth keeping: anything with a letter or a digit in it, however short. */
export function keepsLine(line: string): boolean {
  return /[\p{L}\p{N}]/u.test(line);
}

/**
 * A text's lines, all of them: there is no limit on a text's length or on its
 * number of lines. Spaces are folded, a very long line is split into its
 * sentences, and lines with no letter or digit are left out.
 */
export function parseCodex(raw: string): string[] {
  const chunks = raw.split(/\n+/).flatMap((line) => {
    const t = line.replace(/\s+/g, " ").trim();
    if (!t) return [];
    if (t.length <= 180) return [t];
    return t.split(/(?<=[.!?])\s+/);
  });
  return chunks.map((s) => s.trim()).filter(keepsLine);
}
