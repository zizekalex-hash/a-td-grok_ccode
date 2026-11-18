import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanVoice, ownVoice, VOICE_AUTO, VOICE_REHEARSE, type PhoneVoice } from "./hervoice.ts";
import { loadTalk } from "./converse.ts";
import { newSave, QUEEN_KEYS } from "./rules.ts";

const v = (name: string, locale: string, more: Partial<PhoneVoice> = {}): PhoneVoice => ({
  name,
  locale,
  ...more,
});
const phone = [
  v("en-us-x-iol", "en-US"),
  v("en-us-x-sfg", "en-US"),
  v("en-gb-x-rjs", "en-GB"),
  v("en-au-x-aua", "en-AU"),
  v("en-us-x-net", "en-US", { network: true }),
  v("en-in-x-ahp", "en-IN", { notInstalled: true }),
  v("de-de-x-nfh", "de-DE"),
  v("fr-fr-x-vlf", "fr-FR"),
];

describe("each queen's own voice", () => {
  it("picks a different voice for each queen while they last, never Rehearse's own", () => {
    const mine = "en-us-x-iol";
    const got = QUEEN_KEYS.map((_, i) => ownVoice(phone, i, mine));
    for (const name of got) {
      assert.notEqual(name, mine, "not the voice Rehearse is set to");
      assert.ok(/^en-/.test(name), `${name}: the language of Rehearse's voice`);
      assert.ok(!["en-us-x-net", "en-in-x-ahp"].includes(name), "none that needs a network or is not installed");
    }
    assert.equal(new Set(got.slice(0, 3)).size, 3, "three voices: the first three queens differ");
    assert.equal(got[3], got[0], "then they come round again");
    assert.equal(ownVoice(phone, 2, mine), ownVoice(phone, 2, mine), "the same queen, the same voice");
  });

  it("follows the language of Rehearse's voice, and English when that is unknown", () => {
    assert.equal(ownVoice([...phone, v("de-de-x-deb", "de-DE")], 0, "de-de-x-nfh"), "de-de-x-deb");
    assert.ok(/^en-/.test(ownVoice(phone, 0, "")));
    assert.ok(/^en-/.test(ownVoice(phone, 5, "a voice the phone does not have")));
  });

  it("makes do with what there is", () => {
    assert.equal(ownVoice([], 0, "x"), "", "no voices: Rehearse's own");
    assert.equal(ownVoice([v("only", "en-US")], 4, "only"), "only", "one voice: that one");
    assert.equal(ownVoice([v("ja-a", "ja-JP"), v("ja-b", "ja-JP")], 1, ""), "ja-b", "no English: any");
    // Only network voices: better those than none.
    assert.equal(ownVoice([v("n1", "en-US", { network: true })], 0, ""), "n1");
    assert.equal(ownVoice(phone, -3, ""), ownVoice(phone, 0, ""));
  });

  it("keeps a chosen voice in the save, and reads a save defensively", () => {
    assert.equal(cleanVoice("en-gb-x-rjs"), "en-gb-x-rjs");
    assert.equal(cleanVoice(VOICE_REHEARSE), VOICE_REHEARSE);
    for (const junk of [null, undefined, 5, {}, [], "x".repeat(500)]) assert.equal(cleanVoice(junk), VOICE_AUTO);
    const fresh = newSave();
    for (const q of QUEEN_KEYS) assert.equal(fresh.sound.voices[q], VOICE_AUTO);
    const save = newSave();
    loadTalk(save, { sound: { lines: false, voices: { jaina: "en-gb-x-rjs", ysera: "=", azshara: 9, nobody: "x" } } });
    assert.equal(save.sound.lines, false);
    assert.equal(save.sound.phrase, true);
    assert.equal(save.sound.voices.jaina, "en-gb-x-rjs");
    assert.equal(save.sound.voices.ysera, VOICE_REHEARSE);
    assert.equal(save.sound.voices.azshara, VOICE_AUTO);
    assert.deepEqual(Object.keys(save.sound.voices).sort(), [...QUEEN_KEYS].sort());
    // A save from before voices: every queen's is picked for her.
    const old = newSave();
    loadTalk(old, { sound: { phrase: false } });
    assert.equal(old.sound.phrase, false);
    for (const q of QUEEN_KEYS) assert.equal(old.sound.voices[q], VOICE_AUTO);
  });
});
