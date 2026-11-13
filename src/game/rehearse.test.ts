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
  soundRate,
  soundMs,
  MAX_SOUND_SAMPLES,
  textRep,
  textPass,
  textPercent,
  SPENT_GAP_MS,
  VOICE_PRESETS,
  voicePresetOf,
  voiceShapeOf,
  voiceSpeeds,
  copyVoiceLayer,
  deleteVoiceLayer,
  setVoiceLayer,
  voiceCount,
  voiceLayersOf,
  libraryOf,
  currentText,
  applyBubble,
  bubbleId,
  activeOf,
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
    const long = `${"word ".repeat(120)}end.`;
    assert.equal(phrasesOf(long)[0], long, "a long sentence is kept whole");
    assert.equal(addPhrases(newRehearse(), [long], 1, ids).state.items[0]!.text, long);
    const back = loadRehearse({
      items: [
        { id: "a", text: " x ", count: 4.7, last: 5, at: 1 },
        { id: "a", text: "dup id" },
        { id: "", text: "no id" },
        { id: "b", text: "" },
      ],
      current: "zzz",
      settings: {
        signalMs: 9_999_999,
        amp: 100,
        rawRate: 2,
        layers: { rgb: -1, gray: 0.5 },
        emit: "full",
        tapHeight: 1,
      },
    });
    assert.equal(back.items.length, 1);
    assert.deepEqual(back.items[0], { id: "a", text: "x", count: 4, last: 5, at: 1 });
    assert.equal(back.current, "", "an unknown current is dropped");
    assert.equal(back.settings.signalMs, 600_000, "ten minutes at most");
    assert.equal(back.settings.amp, 100, "above full scale is kept (the output clips it)");
    assert.equal(back.settings.rawRate, 2, "below 1000 too");
    assert.equal(back.settings.mode, "steady");
    assert.equal(back.settings.nonstop, false);
    assert.deepEqual(back.settings.layers, { rgb: 0, gray: 0.5, bits: 0.36 });
    assert.equal(back.settings.emit, "full");
    assert.equal(back.settings.tapHeight, 5);
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

  it("can take the bytes four at a time, as 32-bit samples, or both mixed", () => {
    // "abcd" little-endian is 0x64636261; "efgh" 0x68676665: two samples, centred.
    const p = rawSamples(phraseBytes("abcdefgh"), "pcm32");
    assert.equal(p.length, 2);
    assert.ok(Math.abs(p[0]! + p[1]!) < 1e-6, "no offset");
    assert.ok(p[1]! > p[0]!);
    // Four bytes or less cannot swing as 32-bit: the 8-bit samples instead.
    assert.equal(rawSamples(phraseBytes("abc"), "pcm32").length, 3);
    for (const encoding of ["u8", "pcm32", "both"] as const) {
      const sig = phraseSignal("The chloride gradient is reversed.", 48_000, {
        signalMs: 500,
        amp: 0.9,
        rawRate: 8000,
        encoding,
      });
      assert.equal(sig.length, 24_000, encoding);
      const peak = sig.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      assert.ok(Math.abs(peak - 0.9) < 1e-6, `${encoding}: peak ${peak}`);
    }
    const u8 = phraseSignal("Oxygenation here", 8000, { signalMs: 100, amp: 1, rawRate: 8000 });
    const both = phraseSignal("Oxygenation here", 8000, {
      signalMs: 100,
      amp: 1,
      rawRate: 8000,
      encoding: "both",
    });
    assert.notDeepEqual(both, u8, "both is a mix, not the 8-bit alone");
    assert.equal(defaultSettings().encoding, "u8");
    assert.equal(loadRehearse({ settings: { encoding: "pcm32" } }).settings.encoding, "pcm32");
    assert.equal(loadRehearse({ settings: { encoding: "mp3" } }).settings.encoding, "u8");
  });

  it("makes a very long sound at a lower rate, so it fits in memory", () => {
    const opts = {
      signalMs: 900,
      amp: 1,
      rawRate: 8000,
      mode: "steady" as const,
      plays: 9,
      topSpeed: 9,
    };
    assert.equal(soundRate(48_000, opts), 48_000);
    assert.equal(soundMs({ ...opts, signalMs: 600_000 }), 600_000);
    const r = soundRate(48_000, { ...opts, signalMs: 600_000 });
    assert.equal(r, 9600);
    assert.ok(r * 600 <= MAX_SOUND_SAMPLES);
    assert.equal(soundMs({ ...opts, mode: "cycle", signalMs: 900, plays: 9 }), 8100);
    // A peak far above 1 is kept: the sound is float32 (the phone clips it on the way out).
    const loud = phraseSignal("abc", 8000, { signalMs: 10, amp: 100, rawRate: 8000 });
    assert.equal(Math.round(loud.reduce((m, v) => Math.max(m, Math.abs(v)), 0)), 100);
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
      soundOf("ab", 100, { ...opts, mode: "cycle", signalMs: 600_000, plays: 10 }).length,
      10 * 6000,
      "a cycle keeps within ten minutes",
    );
    const back = load({ settings: { mode: "cycle", plays: 50_000, topSpeed: 0, nonstop: true } });
    assert.equal(back.settings.mode, "cycle");
    assert.equal(back.settings.plays, 9999);
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
      loadRehearse({ settings: { wavVolume: 30_000, wavLoop: false } }).settings.wavVolume,
      10_000,
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
    const back = loadRehearse({ ...s, settings: { batch: 0, repSeconds: 99_999 } });
    assert.equal(back.lastTap, 10_900);
    assert.equal(back.settings.batch, 1);
    assert.equal(back.settings.repSeconds, 3600);
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
    assert.deepEqual(textProgress(s, key), { at: 0, passes: 1, reps: 12, last: 300, spentMs: 200 });
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
    assert.deepEqual(textProgress(s, key), { at: 0, passes: 0, reps: 0, last: 0, spentMs: 0 });
    const back = loadRehearse({
      view: "texts",
      text: key,
      progress: { [key]: { at: 2.5, passes: -1, reps: 7, last: 9 }, "": { at: 1 } },
    });
    assert.equal(back.view, "texts");
    assert.equal(back.text, key);
    assert.deepEqual(back.progress, { [key]: { at: 2, passes: 0, reps: 7, last: 9, spentMs: 0 } });
    assert.equal(loadRehearse({ view: "nope" }).view, "phrases");
  });

  it("shares a text with the Read tab's reader: its reps, passes, time and place", () => {
    const key = "Book";
    let s = textTap(newRehearse(), key, 10, 1_000);
    s = textGo(s, key, 4, 10);
    s = textRep(s, key, 61_000);
    assert.deepEqual(textProgress(s, key), {
      at: 4,
      passes: 0,
      reps: 2,
      last: 61_000,
      spentMs: 60_000,
    });
    // A long break counts as SPENT_GAP_MS at most.
    s = textRep(s, key, 61_000 + 3_600_000);
    assert.equal(textProgress(s, key).spentMs, 60_000 + SPENT_GAP_MS);
    s = textPass(s, key);
    assert.equal(textProgress(s, key).passes, 1);
    assert.equal(textProgress(s, key).at, 0);
    assert.equal(textPercent(4, 10), 40);
    assert.equal(textPercent(1, 3), 33.3);
    assert.equal(textPercent(0, 0), 0);
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
    assert.equal(defaultSettings().phraseSize, 18);
    assert.equal(loadRehearse({ settings: { phraseSize: 5000 } }).settings.phraseSize, 400);
    assert.equal(loadRehearse({ settings: { phraseSize: 2 } }).settings.phraseSize, 4);
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
    assert.deepEqual(parseLevels("99999, 9, -1, x"), [10_000, 9, 0]);
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
      settings: { ...wavSettingsOf(w), wavShape: "zigzag", wavCycles: 5000, wavLevels: [] },
    });
    assert.equal(back.settings.wavShape, "flat");
    assert.equal(back.settings.wavCycles, 512);
    assert.deepEqual(back.settings.wavLevels, [1], "none: as it is");
    assert.deepEqual(
      loadRehearse({ settings: wavSettingsOf(w) }).settings.wavLevels,
      [0.5, 0.5, 2, 1],
    );
  });
});

describe("rehearse: the floating window and the background", () => {
  const lib = libraryOf(
    [{ name: "Long", lines: ["One here now. Two here now. Three here now."] }],
    true,
    [],
    [{ name: "Zip", texts: [{ name: "In", lines: ["Only this one here."] }] }],
  );

  it("lists the Read tab's texts, the built-in one when there are none of your own", () => {
    assert.deepEqual(
      lib.map((t) => t.key),
      ["Long", "Zip/In"],
    );
    assert.equal(libraryOf([], false, ["x y z"], [])[0]!.builtIn, true);
    assert.equal(currentText({ ...newRehearse(), text: "Zip/In" }, lib)?.name, "In");
    assert.equal(currentText(newRehearse(), lib)?.name, "Long", "none chosen: the first");
    assert.equal(defaultSettings().background, true);
    assert.equal(loadRehearse({ settings: { background: false } }).settings.background, false);
  });

  it("never puts a text back to its start from a closed window, or from what it was sent", () => {
    let s = textTap(newRehearse(), "Long", 3, 1);
    s = textTap(s, "Long", 3, 2);
    assert.equal(textAt(s, "Long", 3), 2);
    const stale = { reps: [], current: bubbleId(0, "Long"), shown: false };
    assert.equal(
      textAt(applyBubble(s, stale, lib, "").state, "Long", 3),
      2,
      "closed: not followed",
    );
    const same = { reps: [], current: bubbleId(0, "Long"), shown: true };
    assert.equal(
      textAt(applyBubble(s, same, lib, bubbleId(0, "Long")).state, "Long", 3),
      2,
      "what this side sent it: not followed",
    );
    assert.equal(
      textAt(applyBubble(s, same, lib, bubbleId(2, "Long")).state, "Long", 3),
      0,
      "moved there: followed",
    );
  });

  it("knows what plays now, and its file", () => {
    let s = addPhrases(newRehearse(), ["Hold it.", "hold it"], 1, ids).state;
    assert.deepEqual(activeOf(s, lib), {
      text: "Hold it.",
      dir: "input_perphrase",
      name: "Hold it",
    });
    s = { ...s, view: "texts", text: "Zip/In" };
    assert.deepEqual(activeOf(s, lib), {
      text: "Only this one here.",
      dir: "input_pertext",
      name: "Zip - In",
    });
  });

  it("counts the window's taps, a text's moving on, with their XP", () => {
    const s = addPhrases(newRehearse(), ["Hold it"], 1, ids).state;
    const take = {
      reps: [
        { id: bubbleId(2, "Long"), n: 10, at: 50 },
        { id: "p0", n: 1, at: 60 },
        { id: "gone", n: 1, at: 70 },
      ],
      current: bubbleId(0, "Long"),
      shown: true,
    };
    const r = applyBubble(s, take, lib, bubbleId(0, "Long"));
    assert.deepEqual(textProgress(r.state, "Long"), {
      at: 0,
      passes: 1,
      reps: 10,
      last: 50,
      spentMs: 0,
    });
    assert.equal(r.state.items[0]!.count, 1);
    assert.deepEqual(r.xp, [
      { text: "Three here now.", n: 10 },
      { text: "Hold it", n: 1 },
    ]);
  });
});

describe("rehearse: no limits on phrases or texts", () => {
  it("keeps every phrase, however many and however long", () => {
    const many = Array.from({ length: 12000 }, (_, i) => `Phrase number ${i} of a long list`);
    let n = 0;
    const r = addPhrases(newRehearse(), many, 1, () => `p${n++}`);
    assert.equal(r.added, 12000);
    assert.equal(r.state.items.length, 12000);
    const long = `${"word ".repeat(4000)}end`;
    const one = addPhrases(newRehearse(), [long], 1, () => "x");
    assert.equal(one.state.items[0]!.text, long, "a very long phrase is kept whole");
    // And all of it comes back from a save.
    const back = loadRehearse(JSON.parse(JSON.stringify(r.state)));
    assert.equal(back.items.length, 12000);
    assert.equal(loadRehearse(JSON.parse(JSON.stringify(one.state))).items[0]!.text, long);
  });

  it("takes every line of a pasted or loaded .txt as a phrase", () => {
    const text = Array.from({ length: 7000 }, (_, i) => `Line ${i}`).join("\n");
    assert.equal(phrasesOf(text, false).length, 7000);
  });

  it("keeps the place of every text, and a text's key whole", () => {
    const progress: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i++)
      progress[`folder/text ${i}`] = { at: i, passes: 1, reps: 2, last: 3, spentMs: 4 };
    const key = `${"a very long folder name ".repeat(30)}/text`;
    progress[key] = { at: 7, passes: 0, reps: 0, last: 0, spentMs: 0 };
    const s = loadRehearse({ view: "texts", text: key, progress });
    assert.equal(Object.keys(s.progress).length, 5001);
    assert.equal(s.text, key);
    assert.equal(s.progress[key]!.at, 7);
    assert.equal(s.progress["folder/text 4999"]!.at, 4999);
  });
});

describe("rehearse: the floating window's look and the robot voice", () => {
  it("sizes the floating window from the app, within sense", () => {
    const d = defaultSettings();
    assert.deepEqual(
      [d.bubblePhraseSp, d.bubbleBarSp, d.bubbleBottomSp, d.bubbleBottom],
      [14, 16, 12, true],
    );
    const back = loadRehearse({
      settings: { bubblePhraseSp: 500, bubbleBarSp: 1, bubbleBottomSp: 20, bubbleBottom: false },
    }).settings;
    assert.deepEqual(
      [back.bubblePhraseSp, back.bubbleBarSp, back.bubbleBottomSp, back.bubbleBottom],
      [72, 8, 20, false],
    );
  });

  it("is off to start, plain; presets set its copies, speed-ups and robot", () => {
    const d = defaultSettings();
    assert.equal(d.voice, false);
    assert.equal(voicePresetOf(d), "plain");
    const robot = VOICE_PRESETS.find((p) => p.id === "robot")!;
    assert.equal(voicePresetOf({ ...d, ...robot.shape }), "robot");
    assert.equal(voicePresetOf({ ...d, voiceCopies: 3 }), "custom");
    assert.deepEqual(voiceSpeeds({ voiceCopies: 3, voiceSpeedUp: 1.25 }), [1, 1.25, 1.5625]);
    assert.deepEqual(Object.keys(voiceShapeOf(d)).length, 12);
    const back = loadRehearse({
      settings: {
        voice: true,
        voiceEngine: "com.reecedunn.espeak",
        voiceName: "en-us",
        voiceRate: 99,
        voicePitch: 0,
        voiceCopies: 5000,
        voiceSpeedUp: 9,
        voiceRobot: 2,
        voiceRobotHz: 0,
        voiceVolume: 50,
      },
    }).settings;
    assert.equal(back.voice, true);
    assert.equal(back.voiceEngine, "com.reecedunn.espeak");
    assert.equal(back.voiceName, "en-us");
    assert.deepEqual(
      [
        back.voiceRate,
        back.voicePitch,
        back.voiceCopies,
        back.voiceSpeedUp,
        back.voiceRobot,
        back.voiceRobotHz,
        back.voiceVolume,
      ],
      [10, 0.1, 1000, 4, 1, 1, 50],
    );
  });
});

describe("rehearse: layers of voices", () => {
  it("copies, changes and deletes layers; copies add up", () => {
    let s = { ...defaultSettings(), voiceCopies: 9, voiceName: "a" };
    assert.equal(voiceCount(s), 9);
    s = { ...s, ...copyVoiceLayer(s, 0) };
    s = { ...s, ...setVoiceLayer(s, 1, { voiceCopies: 2, voicePanHz: 3 }) };
    assert.equal(voiceLayersOf(s).length, 2);
    assert.equal(voiceCount(s), 11);
    s = { ...s, ...copyVoiceLayer(s, 0) };
    assert.equal(voiceCount(s), 20);
    s = { ...s, ...deleteVoiceLayer(s, 0) };
    assert.equal(s.voiceCopies, 2);
    assert.equal(s.voicePanHz, 3);
    assert.equal(voiceLayersOf(s).length, 2);
    const back = loadRehearse({
      settings: { voiceLayers: [{ voiceCopies: 99999, voicePanHz: 500 }] },
    });
    assert.equal(back.settings.voiceLayers[0]!.voiceCopies, 1000);
    assert.equal(back.settings.voiceLayers[0]!.voicePanHz, 100);
    assert.equal(back.settings.voiceCopiesVolume, 1);
  });
});
