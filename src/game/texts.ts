/**
 * The loaded texts: loading more adds to them, it never replaces them. A text
 * already loaded (the same lines) is not added twice; a different text with a
 * name already taken gets a number, "notes (2)". Texts only leave the list when
 * removed with their ✕. No path aliases, so the tests can load it.
 */

export interface TextFile {
  name: string;
  lines: string[];
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

/** The texts after loading `incoming` on top of `have`, at most `max` in all. */
export function mergeTexts(
  have: TextFile[],
  incoming: TextFile[],
  max: number,
): { texts: TextFile[]; added: number; already: number; full: number } {
  const texts = [...have];
  let added = 0;
  let already = 0;
  let full = 0;
  for (const t of incoming) {
    if (!t.lines.length) continue;
    if (texts.some((h) => same(h.lines, t.lines))) {
      already += 1;
      continue;
    }
    if (texts.length >= max) {
      full += 1;
      continue;
    }
    let name = t.name;
    for (let n = 2; texts.some((h) => h.name === name); n++) name = `${t.name} (${n})`;
    texts.push({ name, lines: t.lines });
    added += 1;
  }
  return { texts, added, already, full };
}
