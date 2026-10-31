/** Between-wave armory: upgrades to the text weapon and potions for the core. */

export type UpgradeKey = "sharpen" | "tempo" | "verse";
export type PotionKey = "salve" | "draught";

export const UPGRADES: {
  key: UpgradeKey;
  name: string;
  copy: string;
  max: number;
  cost: (level: number) => number;
}[] = [
  {
    key: "sharpen",
    name: "Sharper ink",
    copy: "Every word you fire hits harder.",
    max: 5,
    cost: (level) => 30 + 20 * level,
  },
  {
    key: "tempo",
    name: "Quicker tongue",
    copy: "Shorter pause between shots.",
    max: 5,
    cost: (level) => 30 + 20 * level,
  },
  {
    key: "verse",
    name: "Longer verse",
    copy: "Each shot carries more whole words from your text, and more damage with them.",
    max: 4,
    cost: (level) => 40 + 25 * level,
  },
];

export const POTIONS: {
  key: PotionKey;
  name: string;
  copy: string;
  cost: number;
  max: number;
}[] = [
  {
    key: "salve",
    name: "Core salve",
    copy: "Restores 30 integrity to the wake core.",
    cost: 35,
    max: 3,
  },
  {
    key: "draught",
    name: "Clarity draught",
    copy: "Slows every sleep-signal for six seconds.",
    cost: 60,
    max: 3,
  },
];

export const SALVE_HEAL = 30;
export const DRAUGHT_SECONDS = 6;
export const DRAUGHT_SLOW = 0.6;

export function upgradeSpec(key: UpgradeKey) {
  const spec = UPGRADES.find((u) => u.key === key);
  if (!spec) throw new Error(`Unknown upgrade ${key}`);
  return spec;
}

export function potionSpec(key: PotionKey) {
  const spec = POTIONS.find((p) => p.key === key);
  if (!spec) throw new Error(`Unknown potion ${key}`);
  return spec;
}

/** Damage multiplier from Sharper ink: +15% per level. */
export function damageMultiplier(sharpen: number): number {
  return 1 + 0.15 * sharpen;
}

/** Fire-interval multiplier from Quicker tongue: -10% per level, never below half. */
export function cooldownMultiplier(tempo: number): number {
  return Math.max(0.5, 1 - 0.1 * tempo);
}

/** Longest shot text in characters, from Longer verse: 22, then +10 per level. */
export function verseChars(verse: number): number {
  return 22 + 10 * verse;
}
