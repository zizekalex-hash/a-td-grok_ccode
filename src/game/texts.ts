/**
 * The loaded texts: loading more adds to them, it never replaces them. A text
 * already loaded (the same lines) is not added twice; a different text with a
 * name already taken gets a number, "notes (2)". Texts only leave the list when
 * removed with their ✕. A text whose loaded copy is only its beginning (cut when
 * it was loaded: before 2 Nov the app kept at most 400 lines) is completed in
 * place when loaded again in full, keeping its name. No path aliases, so the
 * tests can load it.
 */

export interface TextFile {
  name: string;
  lines: string[];
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

/** Whether `a` is the start of `b`, and `b` longer. */
function isStart(a: string[], b: string[]): boolean {
  return a.length > 0 && a.length < b.length && a.every((l, i) => l === b[i]);
}

/** The texts after loading `incoming` on top of `have`, at most `max` in all. */
export function mergeTexts(
  have: TextFile[],
  incoming: TextFile[],
  max: number,
): { texts: TextFile[]; added: number; already: number; full: number; completed: number } {
  const texts = [...have];
  let added = 0;
  let already = 0;
  let full = 0;
  let completed = 0;
  for (const t of incoming) {
    if (!t.lines.length) continue;
    if (texts.some((h) => same(h.lines, t.lines))) {
      already += 1;
      continue;
    }
    // The same name, its loaded lines the start of these: it was cut, now it is whole.
    const cut = texts.findIndex((h) => h.name === t.name && isStart(h.lines, t.lines));
    if (cut >= 0) {
      texts[cut] = { name: t.name, lines: t.lines };
      completed += 1;
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
  return { texts, added, already, full, completed };
}
