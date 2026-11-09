import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addPhrases,
  countRep,
  currentPhrase,
  defaultSettings,
  loadRehearse,
  newRehearse,
  phraseBytes,
  phraseSignal,
  phrasesOf,
  batchWaitMs,
  cycleSignal,
  tapReady,
  fileBase,
  phraseFileNames,
  wavSampleRate,
  cycleSpeeds,
  loadRehearse as load,
  rawSamples,
  soundOf,
  removePhrase,
  resetCount,
  resetCounts,
  signalFit,
  step,
  totalReps,
  textTap,
  textStep,
  textGo,
  textAt,
  textProgress,
  resetText,
  textFileBase,
  textFileNames,
  TEXT_FOLDER,
  wavGainAt,
  wavCurve,
  curvePoints,
  levelOf,
  steadyGain,
  parseLevels,
  levelsText,
  presetOf,
  WAV_PRESETS,
  wavStyleOf,
  wavSettingsOf,
  type WavStyle,
} from "./rehearse.ts";

const ids = (i: number) => `p${i}`;

describe("rehearse: phrases and their counts", () => {
  it("adds phrases once each, counts a rep a tap, resets one or all and keeps the phrases", () => {
    let s = newRehearse();
    const made = addPhrases(
      s,
      ["Stay with the cyan.", "  stay  WITH the cyan. ", "Keep it sharp", ""],
      1,
      ids,
    );
    assert.equal(made.added, 2, "the same phrase in other case or spacing is skipped");
    s = made.state;
    assert.equal(currentPhrase(s)?.text, "Stay with the cyan.");
    s = countRep(s, "p0", 10);
    s = countRep(s, "p0", 20);
    s = countRep(s, "p1", 30);
    assert.equal(s.items[0]!.count, 2);
    assert.equal(s.items[0]!.last, 20);
    assert.equal(totalReps(s), 3);
    s = resetCount(s, "p0");
    assert.equal(s.items[0]!.count, 0);
    assert.equal(s.items.length, 2, "the phrase stays");
    assert.equal(totalReps(s), 1);
    s = resetCounts(s);
    assert.equal(totalReps(s), 0);
    assert.equal(s.items.length, 2);
  });

  it("moves round the list, and removing the current phrase moves to the next", () => {
    let s = addPhrases(newRehearse(), ["a b", "c d", "e f"], 1, ids).state;
    s = step(s, -1);
    assert.equal(currentPhrase(s)?.id, "p2", "before the first is the last");
    s = step(s, 1);
    s = step(s, 1);
    assert.equal(currentPhrase(s)?.id, "p1");
    s = removePhrase(s, "p1");
    assert.equal(currentPhrase(s)?.id, "p2");
    s = removePhrase(s, "p2");
    assert.equal(currentPhrase(s)?.id, "p0");
  });

  it("takes phrases from a text, list marks off, and checks a save", () => {
    assert.deepEqual(phrasesOf("- One phrase. Two phrase!\n2. Three\n\n"), [
      "One phrase.",
      "Two phrase!",
      "Three",
    ]);
    assert.deepEqual(phrasesOf("Keep this. Whole", false), ["Keep this. Whole"]);
    const back = loadRehearse({
      items: [
        { id: "a", text: " x ", count: 4.7, last: 5, at: 1 },
        { id: "a", text: "dup id" },
        { id: "", text: "no id" },
        { id: "b", text: "" },
      ],
      current: "zzz",
      settings: {
        signalMs: 99_999,
        amp: 3,
        rawRate: 2,
        layers: { rgb: -1, gray: 0.5 },
        emit: "full",
        tapHeight: 1,
      },
    });
    assert.equal(back.items.length, 1);
    assert.deepEqual(back.items[0], { id: "a", text: "x", count: 4, last: 5, at: 1 });
    assert.equal(back.current, "", "an unknown current is dropped");
    assert.equal(back.settings.signalMs, 60_000);
    assert.equal(back.settings.amp, 1);
    assert.equal(back.settings.rawRate, 2, "below 1000 too");
    assert.equal(back.settings.mode, "steady");
    assert.equal(back.settings.nonstop, false);
    assert.deepEqual(back.settings.layers, { rgb: 0, gray: 0.5, bits: 0.36 });
    assert.equal(back.settings.emit, "full");
    assert.equal(back.settings.tapHeight, 15);
    const d = defaultSettings();
    assert.equal(d.signalMs, 900);
    assert.equal(d.amp, 0.9);
    assert.deepEqual(d.layers, { rgb: 0.36, gray: 0.36, bits: 0.36 });
  });
});

describe("rehearse: the phrase as sound", () => {
  it("is the phrase's own bytes, centred", () => {
    const raw = rawSamples(phraseBytes("abc"));
    assert.equal(raw.length, 3);
    const mean = raw.reduce((n, v) => n + v, 0) / raw.length;
    assert.ok(Math.abs(mean) < 1e-6, "no offset");
    assert.ok(raw[2]! > raw[1]! && raw[1]! > raw[0]!, "c above b above a");
    // Bytes all the same would be silent: their bits sound instead.
    const one = rawSamples(phraseBytes("I"));
    assert.equal(one.length, 8);
    assert.ok(one.some((v) => v !== 0));
  });

  it("repeats a short phrase to fill the time, and speeds up a long one to fit it", () => {
    // 800 bytes at 8000 a second last 0.1 s: 9 plays in 0.9 s, at speed 1.
    const short = signalFit(800, 8000, 900);
    assert.equal(Math.round(short.naturalMs), 100);
    assert.equal(short.speed, 1);
    assert.equal(Math.round(short.plays), 9);
    // 14 400 bytes last 1.8 s: twice as fast, played once.
    const long = signalFit(14_400, 8000, 900);
    assert.equal(long.speed, 2);
    assert.equal(Math.round(long.plays), 1);
  });

  it("lasts exactly the set time and peaks at the set loudness, whatever the phrase", () => {
    const opts = { signalMs: 900, amp: 0.9, rawRate: 8000 };
    for (const text of [
      "abc",
      "The chloride gradient is reversed.",
      "ü ñ ✓",
      "x".repeat(20_000) + "y",
    ]) {
      const s = phraseSignal(text, 48_000, opts);
      assert.equal(s.length, 43_200, text.slice(0, 20));
      const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      assert.ok(Math.abs(peak - 0.9) < 1e-6, `${text.slice(0, 20)}: peak ${peak}`);
    }
    const quiet = phraseSignal("abc", 8000, { ...opts, amp: 0.09 });
    assert.ok(Math.abs(quiet.reduce((m, v) => Math.max(m, Math.abs(v)), 0) - 0.09) < 1e-6);
    // At the raw rate itself, a short phrase is its bytes over and over.
    const raw = rawSamples(phraseBytes("abc"));
    const at = phraseSignal("abc", 8000, { ...opts, amp: 1 });
    const k = 1 / Math.max(...raw.map(Math.abs));
    for (let i = 0; i < 9; i++) assert.ok(Math.abs(at[i]! - raw[i % 3]! * k) < 1e-6);
    assert.equal(
      phraseSignal("abc", 8000, { ...opts, amp: 0 }).every((v) => v === 0),
      true,
    );
  });

  it("runs a rising cycle: plays from x1 to x9, each at the peak, in one length each", () => {
    assert.deepEqual(cycleSpeeds(9, 9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(cycleSpeeds(3, 5), [1, 3, 5]);
    const opts = { signalMs: 100, amp: 0.9, rawRate: 8000, plays: 9, topSpeed: 9 };
    const cyc = cycleSignal("Oxygenation", 48_000, opts);
    const n = 4800;
    assert.equal(cyc.length, 9 * n, "nine plays of 100 ms");
    for (let k = 0; k < 9; k++) {
      const part = cyc.subarray(k * n, (k + 1) * n);
      const peak = part.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      assert.ok(Math.abs(peak - 0.9) < 1e-6, `play ${k + 1} at the peak (${peak})`);
    }
    // Each play higher: the ninth crosses zero far more often than the first.
    const crossings = (a: Float32Array) =>
      a.reduce((m, v, i) => m + (i && Math.sign(v) !== Math.sign(a[i - 1]!) ? 1 : 0), 0);
    assert.ok(crossings(cyc.subarray(8 * n)) > crossings(cyc.subarray(0, n)) * 3);
    // Steady is the plain signal; a long cycle keeps within a minute.
    assert.deepEqual(
      soundOf("ab", 8000, { ...opts, mode: "steady" }),
      phraseSignal("ab", 8000, opts),
    );
    assert.equal(
      soundOf("ab", 100, { ...opts, mode: "cycle", signalMs: 60_000, plays: 10 }).length,
      10 * 600,
    );
    const back = load({ settings: { mode: "cycle", plays: 500, topSpeed: 0, nonstop: true } });
    assert.equal(back.settings.mode, "cycle");
    assert.equal(back.settings.plays, 99);
    assert.equal(back.settings.topSpeed, 1);
    assert.equal(back.settings.nonstop, true);
  });
});

describe("rehearse: phrases as files", () => {
  it("names each phrase's .txt (and its .wav) after the phrase, safely and once each", () => {
    assert.equal(fileBase("Oxygenation"), "Oxygenation");
    assert.equal(fileBase("Stay with the cyan."), "Stay with the cyan");
    assert.equal(fileBase('a/b\\c: "d"?'), "a-b-c- -d-");
    assert.equal(fileBase("   "), "phrase");
    assert.equal(fileBase("x".repeat(200)).length, 80);
    assert.deepEqual(phraseFileNames(["Hold.", "hold", "Other", "HOLD!?"]), [
      "Hold",
      "hold (2)",
      "Other",
      "HOLD!-",
    ]);
    const d = defaultSettings();
    assert.equal(d.wavLoop, true);
    assert.equal(d.wavVolume, 1);
    assert.equal(
      loadRehearse({ settings: { wavVolume: 3, wavLoop: false } }).settings.wavVolume,
      1,
    );
    assert.equal(loadRehearse({ settings: { wavLoop: false } }).settings.wavLoop, false);
  });

  it("reads a .wav's sample rate from its header", () => {
    const head = new Uint8Array(44);
    const v = new DataView(head.buffer);
    head.set([...new TextEncoder().encode("RIFF")], 0);
    head.set([...new TextEncoder().encode("WAVE")], 8);
    head.set([...new TextEncoder().encode("fmt ")], 12);
    v.setUint32(16, 16, true);
    v.setUint16(20, 3, true);
    v.setUint32(24, 48_000, true);
    assert.equal(wavSampleRate(head), 48_000);
    assert.equal(wavSampleRate(new Uint8Array(44)), null, "not a wav");
  });

  it("counts a batch a tap: 10 reps after 9.9 s since the last tap that counted", () => {
    let s = addPhrases(newRehearse(), ["Oxygenation"], 1, ids).state;
    assert.equal(s.settings.batch, 1, "one a tap to start, no wait");
    assert.equal(batchWaitMs(s.settings), 0);
    s = countRep(s, "p0", 1000);
    assert.ok(tapReady(s, 1001).ready, "one a tap: no wait");
    s = { ...s, settings: { ...s.settings, batch: 10 } };
    assert.equal(batchWaitMs(s.settings), 9900);
    const soon = tapReady(s, 1000 + 9899);
    assert.equal(soon.ready, false);
    assert.equal(soon.leftMs, 1);
    assert.ok(tapReady(s, 1000 + 9900).ready);
    s = countRep(s, "p0", 1000 + 9900, 10);
    assert.equal(s.items[0]!.count, 11);
    assert.equal(s.lastTap, 10_900);
    const back = loadRehearse({ ...s, settings: { batch: 0, repSeconds: 999 } });
    assert.equal(back.lastTap, 10_900);
    assert.equal(back.settings.batch, 1);
    assert.equal(back.settings.repSeconds, 60);
  });
});

describe("rehearse: whole texts, phrase after phrase", () => {
  it("a tap does the phrase and goes to the next; past the last it counts a pass", () => {
    let s = newRehearse();
    assert.equal(s.view, "phrases");
    const key = "Book/One";
    s = textTap(s, key, 3, 100);
    assert.equal(textProgress(s, key).at, 1);
    s = textTap(s, key, 3, 200, 10);
    s = textTap(s, key, 3, 300);
    assert.deepEqual(textProgress(s, key), { at: 0, passes: 1, reps: 12, last: 300 });
    assert.equal(s.lastTap, 300, "a batch waits from a text's tap too");
    // Moving round it counts nothing.
    s = textStep(s, key, 3, -1);
    assert.equal(textAt(s, key, 3), 2);
    s = textGo(s, key, 99, 3);
    assert.equal(textAt(s, key, 3), 2);
    assert.equal(textProgress(s, key).reps, 12);
    // Edited shorter: back to its first phrase.
    assert.equal(textAt(s, key, 2), 0);
    // A tap at a given phrase (the floating window's), the last one: a pass.
    s = textTap(s, key, 3, 400, 1, 2);
    assert.equal(textProgress(s, key).passes, 2);
    assert.equal(textProgress(s, key).at, 0);
    s = resetText(s, key);
    assert.deepEqual(textProgress(s, key), { at: 0, passes: 0, reps: 0, last: 0 });
    const back = loadRehearse({
      view: "texts",
      text: key,
      progress: { [key]: { at: 2.5, passes: -1, reps: 7, last: 9 }, "": { at: 1 } },
    });
    assert.equal(back.view, "texts");
    assert.equal(back.text, key);
    assert.deepEqual(back.progress, { [key]: { at: 2, passes: 0, reps: 7, last: 9 } });
    assert.equal(loadRehearse({ view: "nope" }).view, "phrases");
  });

  it("names each text's .txt after it (and its folder), once each", () => {
    assert.equal(TEXT_FOLDER, "input_pertext");
    assert.equal(textFileBase("Chapter 1.txt"), "Chapter 1");
    assert.equal(textFileBase("a/b", "Zip"), "Zip - a-b");
    assert.deepEqual(
      textFileNames([{ name: "One" }, { name: "one.txt" }, { name: "One", folder: "F" }]),
      ["One", "one (2)", "F - One"],
    );
  });

  it("is locked to start: the tap counts, the settings wait", () => {
    assert.equal(defaultSettings().locked, true);
    assert.equal(loadRehearse({ settings: { locked: false } }).settings.locked, false);
  });
});

describe("rehearse: how the .wav plays", () => {
  const style = (o: Partial<WavStyle>): WavStyle => ({ ...WAV_PRESETS[0]!.style, ...o });

  it("is flat to start: the file as it is, one level", () => {
    const d = wavStyleOf(defaultSettings());
    assert.equal(presetOf(d), "flat");
    assert.equal(steadyGain(d), 1);
    assert.equal(curvePoints(d, 3), 2);
    assert.deepEqual([...wavCurve(d, 2)], [1, 1]);
  });

  it("fades in, holds and fades out within each loop", () => {
    const f = style({ shape: "fade", fadeIn: 0.11, fadeOut: 0.1 });
    assert.equal(presetOf(f), "fade");
    assert.equal(wavGainAt(f, 0), 0);
    assert.ok(Math.abs(wavGainAt(f, 0.055) - 0.5) < 1e-9);
    assert.equal(wavGainAt(f, 0.5), 1);
    assert.ok(Math.abs(wavGainAt(f, 0.95) - 0.5) < 1e-9);
    assert.equal(wavGainAt(f, 1), 0);
    assert.equal(steadyGain(f), null);
    // Fades over the whole: shortened to fit it.
    const over = style({ shape: "fade", fadeIn: 0.8, fadeOut: 0.8 });
    assert.ok(Math.abs(wavGainAt(over, 0.5) - 1) < 1e-9);
  });

  it("makes sine, saw and square of the loudness, as deep and as often as set", () => {
    const sine = style({ shape: "sine" });
    assert.equal(wavGainAt(sine, 0), 0);
    assert.ok(Math.abs(wavGainAt(sine, 0.5) - 1) < 1e-9);
    const saw = style({ shape: "saw", cycles: 2 });
    assert.ok(Math.abs(wavGainAt(saw, 0.25) - 0.5) < 1e-9);
    assert.ok(Math.abs(wavGainAt(saw, 0.75) - 0.5) < 1e-9);
    assert.equal(wavGainAt(saw, 1), 1, "the loop ends at the top of its last rise");
    const sq = style({ shape: "square", cycles: 4, depth: 0.5 });
    assert.equal(wavGainAt(sq, 0.1), 1);
    assert.equal(wavGainAt(sq, 0.2), 0.5, "half deep: down to half");
    assert.equal(presetOf(style({ shape: "square", cycles: 4 })), "square");
    assert.equal(presetOf(sq), "custom");
    const c = wavCurve(sq, curvePoints(sq, 2), 2);
    assert.equal(c.length, 4 * 128 + 1);
    assert.equal(Math.max(...c), 2, "at its level");
    assert.equal(curvePoints(sq, 0.001), 4 * 8 + 1, "a short loop: fewer points");
  });

  it("plays each loop at the next level, round again", () => {
    assert.deepEqual(parseLevels("0.5, 0.5 2;1"), [0.5, 0.5, 2, 1]);
    assert.deepEqual(parseLevels("9, -1, x"), [4, 0]);
    assert.equal(parseLevels(" , "), null);
    const w = style({ levels: [0.5, 0.5, 2, 1] });
    assert.equal(presetOf(w), "waves");
    assert.deepEqual(
      [0, 1, 2, 3, 4, 7].map((k) => levelOf(w, k)),
      [0.5, 0.5, 2, 1, 0.5, 1],
    );
    assert.equal(steadyGain(w), null);
    assert.equal(steadyGain(style({ levels: [0.4] })), 0.4);
    assert.equal(levelsText([0.1, 0.2]), "0.1, 0.2");
    const back = loadRehearse({
      settings: { ...wavSettingsOf(w), wavShape: "zigzag", wavCycles: 500, wavLevels: [] },
    });
    assert.equal(back.settings.wavShape, "flat");
    assert.equal(back.settings.wavCycles, 64);
    assert.deepEqual(back.settings.wavLevels, [1], "none: as it is");
    assert.deepEqual(
      loadRehearse({ settings: wavSettingsOf(w) }).settings.wavLevels,
      [0.5, 0.5, 2, 1],
    );
  });
});
