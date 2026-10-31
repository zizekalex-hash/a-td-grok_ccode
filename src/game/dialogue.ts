export type Mood =
  | "title"
  | "engage"
  | "wave"
  | "clear"
  | "low"
  | "critical"
  | "combo"
  | "blessReady"
  | "bless"
  | "leak"
  | "over"
  | "holo"
  | "read"
  | "kill";

const LINES: Record<Mood, string[]> = {
  title: [
    "I have been waiting in the static. Load your words, or take mine.",
    "The wake core answers to you. I only keep the light honest.",
    "Queen of Light, on station. Your attention is the weapon.",
  ],
  engage: [
    "Eyes open. The dark chemistry is already moving.",
    "I am with you in the fire rate. Do not go quiet.",
    "Name them as they come. A named thing can be broken.",
  ],
  wave: [
    "Another front. Adenosine lies about how heavy you are.",
    "Hold the center. I am the ring around your focus.",
    "They want the core dim. I want it singing.",
    "Fresh pressure on the glass. Answer in sentences.",
  ],
  clear: [
    "Wave secured. Breathe, but do not close the rite.",
    "Beautiful. The network hums your name.",
    "Pressure breaks. I burn clearer when you win.",
  ],
  low: [
    "Integrity is failing. Look at the core, then fire.",
    "Do not yield. I will not narrate a sleeping throne.",
    "Stay. I am still on your side of the light.",
  ],
  critical: [
    "Last light. I will not look away if you do not.",
    "One more volley. Give me the next word.",
  ],
  combo: [
    "That rhythm. Stay inside it.",
    "Your mind is loud. I want it loud.",
    "Yes. Chain them. I feel every strike.",
  ],
  blessReady: [
    "Queen's Blessing is ripe. Claim it and I will shield the core.",
    "The streak is a door. Open it.",
  ],
  bless: [
    "Blessing live. Nothing drowsy touches the core.",
    "I am in the volley. Spend me well.",
    "Rapid fire, gold ring. I am closer than the static.",
  ],
  leak: [
    "A signal got through. Answer it twice.",
    "Leak. The combo breaks. I do not.",
  ],
  over: [
    "The core went dark. I am still here. Rewrite the rite.",
    "Sleep won a round. It does not get the ending.",
    "Rise. The tome remembers what you loaded.",
  ],
  holo: [
    "Hologram live. The shell can almost hold my outline.",
    "Tilt engaged. Read me between the phrases.",
  ],
  read: [
    "Read them slowly. The flashes are for the edge of the eye. The meaning is for you.",
    "These are your sectors. I will keep the shell turning while you study.",
  ],
  kill: [
    "Pressure crowned, then broken. The wake holds.",
    "The heavy one is dust and digits. Stay crowned in attention.",
  ],
};

const lastIndex: Partial<Record<Mood, number>> = {};

export function pickLine(mood: Mood): string {
  const bank = LINES[mood];
  let i = Math.floor(Math.random() * bank.length);
  if (bank.length > 1 && i === lastIndex[mood]) i = (i + 1) % bank.length;
  lastIndex[mood] = i;
  return bank[i] ?? bank[0] ?? "";
}
