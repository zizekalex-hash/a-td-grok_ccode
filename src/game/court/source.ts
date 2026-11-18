/**
 * Where a recite's phrases come from: the texts of Rehearse's library (the .txt
 * files of input_pertext: your own texts, each .zip folder's, or the built-in
 * one). A recite draws from all of them mixed, or from one text chosen; and when
 * it is one text (chosen, or the only one there is), that is the text the
 * whole-text voices read all through the recite. Pure, so the tests can load it.
 * No path aliases (tests).
 */
import { hashOf, phraseUnits } from "./bag.ts";

/** A text of the library (rehearse.ts LibText, as much of it as is needed here). */
export interface SourceText {
  key: string;
  name: string;
  lines: string[];
  folder?: string;
}

/** The text chosen by its key; null for "all texts" (or a key no text has any more). */
export function chosenText<T extends SourceText>(texts: readonly T[], key: string): T | null {
  return key ? (texts.find((t) => t.key === key) ?? null) : null;
}

/** Every phrase a recite may draw from, each once: those of the chosen text, else of all the texts. */
export function unitsFrom(texts: readonly SourceText[], key: string, min: number): string[] {
  const one = chosenText(texts, key);
  return phraseUnits((one ? [one] : texts).map((t) => t.lines), min);
}

/**
 * The text the whole-text voices read during a recite: the chosen one, or the
 * only one there is; none when all of several are mixed (there is no one text
 * to read: those voices say the phrase, as the others do).
 */
export function wholeText<T extends SourceText>(texts: readonly T[], key: string): T | null {
  return chosenText(texts, key) ?? (texts.length === 1 ? texts[0]! : null);
}

/** What a text's phrases are, in a short steady name: the same words again are the same text. */
export function textMark(key: string, units: readonly string[]): string {
  return `${key}|${units.length}|${hashOf(units.join("\n"))}`;
}

/** A text's name for a list: its folder first, when it has one. */
export function labelOf(t: SourceText): string {
  return t.folder ? `${t.folder} · ${t.name}` : t.name;
}
