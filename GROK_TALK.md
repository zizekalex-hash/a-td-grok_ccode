# The Court's words: a job for Grok

Everything the queens and the town say lives in 12 plain JSON files, in
`src/game/court/talk/`: one per queen (`azshara.json`, `onyxia.json`, ...) and
`shared.json`. Grok can make them richer without touching any code: it only
adds lines to the lists (and may polish the ones there). The game picks from
the lists at random and combines the pieces, so every line added multiplies the
variety.

## How to use it

1. Open Grok and paste the prompt below (everything between the two lines).
2. Give it one file: attach it, paste it, or give its link from the public copy:
   `https://raw.githubusercontent.com/zizekalex-hash/a-td-grok_ccode/main/src/game/court/talk/azshara.json`
   (the same with `eltharia`, `alexstrasza`, `ysera`, `onyxia`, `azshara`,
   `xalatath`, `jaina`, `tyrande`, `sylvanas`, `sinestra`, `valeera`, `shared`).
3. Grok answers with the whole file, bigger. Do the next file the same way.
4. Paste the files back into Claude ("talk files for the Court"). Claude
   checks them (`npm run talk:check`: every key in place, only the right
   placeholders, no repeats), merges them with what is there (so lines added
   since you downloaded the files are kept), tests and ships a new APK.

One file per answer keeps Grok within its length limit. `shared.json` is the
longest; it can be done in two halves (topics and pickupLines, then presence,
rumors and bondTalk).

---

PROMPT FOR GROK

You are writing dialogue for "the Court", a mode of a mobile game about
reciting. The player (always "you", never named) walks a small fantasy world by
tapping, recites phrases from their own texts to the beat at places to raise
skills (RuneScape-style levels to 99), and wins over eleven queens. Each queen
has an affection tier (Stranger, then warmer tiers up to devoted), moods, a
favourite gift, dates, jealousy of rivals, daily wishes ("recite N passes of a
skill for me"), and memories of passes recited for her. Queens come out to find
you on the map, walk with you, and get hungry: they ask you to "feed" them a set
of reps (for example 100 × "name the signal") of one of your practice phrases.
The town gossips about all of it.

I will give you one JSON file of the game's words. Make it much richer:

- Keep every key and the exact shape. Do not rename, remove or add keys, except
  that in shared.json you may add new topics under "topics" (each with "ask" and
  "answer" lists). Keep "_about" and "_who" as they are.
- Keep the lines already there (you may polish their wording), and add many new
  ones to every list. Targets per list, at least:
  - queen files, "voice": open 25, close 25, warm 12, pet 10, things 12,
    talk 25, feed 10, fed 10, hungry 8.
  - queen files, "lines": 10 for each moment (greet, locked, watch, streak,
    levelUp, gift, giftLoved, tierUp, dateStart, dateEnd, missed, jealous,
    reconciled, wish, wishDone, memory). "streak" rises in three steps (3, 5
    and 10 passes in a row): write its lines from impressed to thrilled, in that
    order, a third each.
  - shared.json: each topic ask 6 and answer 10; pickupLines 30; each
    presence.lines kind 8; each presence.notices kind 6; each rumors kind 8;
    each bondTalk kind 10.
- Every queen sounds like herself: read "_who" (her persona, home, element and
  favourite gift) and the lines already there, and keep her voice distinct from
  the others. Shared lines must work for any queen.
- Placeholders in curly braces are filled in by the game. Use only the ones
  allowed for that list (below), spelled exactly, and nothing else in curly
  braces. A line may use none.
- Each line one or two short sentences, at most 200 characters, no line
  repeated, no empty lines. Flirty and warm is welcome, PG-13 at most. Keep it
  in the fantasy world: no real people, brands or places. No emoji, except the
  few marks the Court's notices already use (♥ 💔 💢).
- "open" lines are short openers said before another line ("Mm.", "Darling.").
  "close" lines are short endings said after one. "warm" lines are endings for
  when she is fond of you. "pet" lines are names she calls you (a word or two,
  no placeholders). "things" are short noun phrases on her mind ("the tides").
  "talk" is her own small talk. "feed" lines ask to be fed and must contain both
  {count} and "{phrase}" (in quotes, like “{phrase}”). "fed" thanks you;
  "hungry" is her goodbye when you did not feed her.
- Answer with the complete file only, as valid JSON (double quotes, no
  comments, no trailing commas) in one json code block.

Placeholders allowed:

- queen files, everything in "voice" and in "lines", and shared.json "topics":
  {pet} what she calls you, {thing} something on her mind, {place} her home,
  {region} where you are, {skill} and {level} your best skill and its level,
  {total} your total level, {gift} her favourite gift as said in a sentence
  ("a sea pearl"), {time} the time of day ("this morning"), {sister}
  {friend} {foe} a queen she is close to or not (lines using them are only
  said when she has one), {phrase} one of your practice phrases, {passes}
  passes you recited for her.
- also in "feed", "fed" and "hungry": {count}, the number of reps.
- also in "lines": locked {need}; levelUp {skill} {level} (the skill that just
  levelled); tierUp {tier}; missed {hours}; jealous {rival}; wish {count}
  {skill}; memory {count}.
- shared.json "pickupLines": none (what you say to her).
- shared.json "presence.lines" (what she says when she finds you): seeking,
  lonely, confront, present: {hours} {rival} {passes} {streak}; leaveHappy,
  leaveHurt: none.
- shared.json "presence.notices" (what the Court notices): out, outConfront:
  {queen} {place}; found, leftHappy, leftHurt: {queen}; rivals, close: {queen}
  {other} {bond}.
- shared.json "rumors" (town gossip): every kind may use {queen} and {other},
  plus buzz {mult}; favored {skill}; gift {gift}; need {need}; wish {count}
  {skill}; longing {hours}; bond {bond}. "you" (gossip about the player) uses
  only {skill} {level} {reps}.
- shared.json "bondTalk" (a queen about a sister, friend or rival): {other}.

Here is the file:
