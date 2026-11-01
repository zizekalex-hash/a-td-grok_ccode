/** Small shared touches for the drill's screens. */

/** Red for what cannot be undone (the shared button style sets its own colours). */
export const DANGER = { color: "var(--color-danger)", borderColor: "var(--color-danger)" };

/** A short buzz on phones, where allowed. */
export function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here */
  }
}
