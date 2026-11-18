/**
 * Each queen's own voice. In the Court the main voice (the one you listen to:
 * it says the phrase you recite, and her lines) is hers, not the voice Rehearse
 * is set to; the background voices stay Rehearse's. Hers is one of the voices
 * the phone has: chosen on her sheet, or picked for her here, a different one
 * for each queen while they last. Pure, so the tests can load it.
 */

/** A voice the phone has (voice.ts VoiceInfo, as much of it as is needed here). */
export interface PhoneVoice {
  name: string;
  locale: string;
  network?: boolean;
  notInstalled?: boolean;
}

/** Her voice is picked for her (ownVoice). */
export const VOICE_AUTO = "";
/** She speaks in the voice Rehearse is set to. */
export const VOICE_REHEARSE = "=";

/** A voice's name as a save may hold it: text of a sane length, else picked for her. */
export function cleanVoice(v: unknown): string {
  return typeof v === "string" && v.length <= 160 ? v : VOICE_AUTO;
}

/** The language of a locale: "en" of "en-US" or "en_GB". */
const lang = (locale: string) => locale.toLowerCase().split(/[-_]/)[0] ?? "";

/**
 * The voice picked for a queen from those the phone has: one that speaks the
 * language of Rehearse's voice (`mine`; English when that is unknown) and can
 * be used without a network, never Rehearse's own while there is another, and
 * a different one for each `slot` (her place among the queens) till they run
 * out. "" when the phone has none to give: she speaks in Rehearse's voice.
 */
export function ownVoice(list: PhoneVoice[], slot: number, mine: string): string {
  const here = list.filter((v) => v.name && !v.network && !v.notInstalled);
  const all = here.length ? here : list.filter((v) => v.name);
  const spoken = lang(all.find((v) => v.name === mine)?.locale ?? "") || "en";
  const same = all.filter((v) => lang(v.locale) === spoken);
  const names = [...new Set((same.length ? same : all).map((v) => v.name))].sort();
  const others = names.length > 1 ? names.filter((n) => n !== mine) : names;
  if (!others.length) return "";
  const at = Math.max(0, Math.floor(slot)) % others.length;
  return others[at]!;
}
