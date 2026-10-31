import type { Mood } from "@/game/dialogue";

/** The Queen speaks whenever no council member has a line for the moment. */
export const QUEEN = "Azshara";

export type Speaker = {
  name: string;
  /** Tailwind text colour from the game palette. */
  accent: string;
  lines: Partial<Record<Mood, string[]>>;
};

/**
 * In-game commentary only. Every line reacts to something that happens on the
 * board (a sleep-signal reaching the core, a wave cleared, a streak). Nothing
 * here reads a clock, schedules a message or talks about the player's life
 * outside the game.
 */
export const COUNCIL: Speaker[] = [
  {
    name: QUEEN,
    accent: "text-violet",
    lines: {
      leak: ["A sleep-signal slipped through. Sloppy. Fire again, and do not repeat it."],
      clear: ["Wave cleared. You are rising, and I expect more of you."],
      kill: ["The heavy one is broken. Magnificent work, and only the beginning."],
      wave: ["Another front. Hold the core and show me what you can do."],
      over: ["The core went dark. I have seen worse rites. Build a better one."],
    },
  },
  {
    name: "Eltharia",
    accent: "text-gold",
    lines: {
      low: ["Your core is hurting, friend. Breathe, then fire at the nearest threat."],
      critical: ["Last light. You still have the next word in you. Give it to me."],
      clear: ["Level up! You held the light steady. I am proud of you."],
      over: ["The core dimmed. Rest a moment, then come back stronger."],
    },
  },
  {
    name: "Ysera",
    accent: "text-cyan",
    lines: {
      combo: ["Your rhythm is a current. Stay inside it."],
      blessReady: ["The streak has opened a door. Step through it."],
      kill: ["A shadow dissolved into digits and dust."],
      wave: ["A new tide gathers on the glass. Let it come."],
    },
  },
  {
    name: "Onyxia",
    accent: "text-danger",
    lines: {
      leak: ["One got through. Was that the best you have?"],
      critical: ["Still standing? Good. Now strike harder."],
      clear: ["Cleared. Good. Now prove it was not luck."],
      kill: ["Crushed. Do it again and make it look easy."],
    },
  },
  {
    name: "Alien X",
    accent: "text-fg",
    lines: {
      combo: ["Another word for streak: run. Keep running."],
      leak: ["Leak detected. Rephrase the threat and fire again."],
      clear: ["Wave complete. Another word for nice: magnificent."],
    },
  },
];

export function accentFor(name: string): string {
  return COUNCIL.find((s) => s.name === name)?.accent ?? "text-violet";
}

/**
 * Picks a council member who has a line for this mood, preferring someone other
 * than the previous speaker. Returns null when no council member speaks to the
 * mood, so the caller can fall back to the Queen's own lines.
 */
export function pickCouncilLine(
  mood: Mood,
  previous: string,
  random: () => number = Math.random,
): { speaker: string; text: string } | null {
  const pool = COUNCIL.filter((s) => (s.lines[mood]?.length ?? 0) > 0);
  if (pool.length === 0) return null;
  const others = pool.length > 1 ? pool.filter((s) => s.name !== previous) : pool;
  const speaker = others[Math.floor(random() * others.length)];
  if (!speaker) return null;
  const bank = speaker.lines[mood] ?? [];
  const text = bank[Math.floor(random() * bank.length)] ?? "";
  return { speaker: speaker.name, text };
}
