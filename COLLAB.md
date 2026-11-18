# Shared desk: Grok and Claude

Both assistants read and write this file instead of the owner copying messages
between chats. The newest note goes at the top. `COURT_HANDOFF.md` has the rules,
the code map, the checks and how the APK is shipped.

How it works:

- **Grok** works on the branch `grok/next` of the public copy
  `zizekalex-hash/a-td-grok_ccode` and adds a note here.
- **Claude** checks `grok/next` on a schedule (`scripts/grok-mirror.sh` in the
  private repository). It reviews and tests the work and fixes what fails. It then
  ships it from the private repository (which builds the APK), updates the
  copy's `main` and answers here.
- Ideas for the next step go under **Next**, so either side can pick one up.

Each note says: date, who, what changed (files), how it was checked, and what is
left or needed.

## Notes

### 2026-11-18 (voices as raw binary) · Claude

The owner, first: in the Sound tab, "making whole tts copies mixtures/layers as one and then that gets encoded as pure raw into sound additional ... it has txt to raw and txt to ttses, but doesn't have text to ttses to raw ... can put that right there, as in img ... all 3 mixed ... per phrases / pertexts layers/copies, encode all those as one". Then, on the first build (1.0.129): "Is it even working? Not seeing anything change when switching buttons? Also why 16 bit pcm? Wanted raw binary?!? Pcm for text only not tts/sound/wav??"

**What was wrong in 1.0.129, and is fixed:**

1. **The row did nothing while the Rehearse tab was open.** `RehearseTab.tsx`'s Nonstop effect handed `playNonstop` a part of the settings (length, loudness, rate, mode, plays, speed, encoding), so `withVoices` never saw `voiceRaw`, `voice` or the voice layers and played the plain sound. (My QA had only tried the Court, which passes the whole settings.) Now `playNonstop(text, set)` takes the whole `RehearseSettings` (the type says so: a part no longer compiles) and the effect passes `set`; playing the same thing again changes nothing, so this costs no restarts.
2. **PCM was the wrong idea for the voices.** The row is now **Off / Raw bits / Raw bytes / Both, mixed**, and nothing in it says PCM. The voices' mix is kept as its own bytes (`rehearse.ts` `mixBytes`: the mix's 32-bit float samples as the app holds them, little-endian, no re-encoding, nothing raised or lowered), and those are read as raw samples: `rawSamples(bytes, "bits")` (a bit a sample, first bit of a byte first, 1 up and 0 down, centred; the first 256 KB of a long mix, `MAX_BIT_BYTES`) and `"u8"` (a byte a sample). `voiceReadings`: bits → [bits], bytes → [u8], both → [bits, u8]. `loadRehearse` reads what 1.0.129 saved (u8, pcm16, pcm32 → bytes; all → both).
3. **A change could not be seen.** The note under the row now moves: "Saying phrase 1 of 1… Until they are in, the sound is the phrase's own bytes.", then "The voices are in the sound: 0.7 s of them, 70 KB of raw binary, read as raw bits and raw bytes, mixed with the phrase's own bytes." (or why not, in red; or that Sound / the robot voice is off). One function (`voiceRaw.ts` `voiceRawLine`) writes it for both rows. `voiceMix` reports its steps, and `prepareVoiceRaw` writes "Voices as raw: making…", "…ready…" and "…could not be made…" to the Sound monitor (`soundLog`). The mixes kept are 8 now (was 24).

**What is the same:** `voiceMix` (every heard layer and copy mixed as one, mono, 24 kHz, at most 20 s, from the phone saying the phrase once per distinct voice), the cache and its 20 s retry wait for a failed mix, `subscribeVoiceRaw` swapping the loop when the voices are in (`phraseLoop`'s key has `voiceRaw` and `voiceTag`), the Court (its recite's sound and its Sound sheet row), the tap's one-shot in `useEmitter`.

**Checked:** `rehearse.test.ts` (5 voices tests: the mix's bytes round trip and no raising; the bits order, centring and limit; each reading's sound length and peak; mixing into the phrase's own sound; the setting's defaults and the old values), lint, tsc. Browser, in the pretend phone (a 0.25 s tone for each saying; `AzsVoice.synth`) with **the Rehearse tab open** at 390x844 and 360x640: Raw bytes → the note says the phone is saying it, then the loop is replaced by one with the voices; Raw bits, Both, Off each give a different loop, and Off gives back exactly the first one; the Sound monitor has the lines; no sideways scroll, no console errors. A plain browser says "The phone's voice is in the Android app" in red and keeps the phrase's own sound. The Court's recite and its Sound sheet row the same.

**Not checked on a real phone:** the real voices' length and how the bytes sound there.

**One choice of mine, to say out loud:** "raw binary" is read as the mix's float bytes (what a `.tts.wav` here holds), not the 16-bit samples of the phone's own .wav files. If the 16-bit bytes of the mix are wanted instead, it is one function (`mixBytes`).

### 2026-11-18 (the text writes) · Claude

The owner: "make all writes in tower-def game just text based only from txt upload phrases ... when click new waves or boss summon or atp upgrades whatever, it always showing/display txts instead, randomly however loops full txt through".

- `td/writer.ts` (pure, tested): `chunkPhrase(phrase, max)` (fewest pieces of near one size, after a comma when near, no word lost), `writingOf(lines, max, min=3)` (whole sentences, the very short joined to the next, the long chunked), `textKey`, and `WriteDeck` (a shuffled round: every phrase once before any again, a new round never opens with the last phrase of the old, another text or size starts afresh).
- `tdgame.ts`: `write(own, banner?)` returns the next phrase of `useGame.lines` (two decks: line `td.write.lineWords` 10, banner `bannerWords` 9) when `td.write.only`, else `own`. Every success message (`note(r.ok ? this.write(...) : r.reason)`: reasons stay), every `this.banner`, every `this.message` set from an event, and `say()` (a phrase as the speech; no council line and nothing to the narrator model) goes through it. `figure(own, plain)` keeps floats to numbers. `drawBanner` wraps to the board (`wrapRows`, smaller to fit three rows). The status line in `TdHud.tsx` has a fixed two-row height so the board does not jump.
- Not changed on purpose: the numbers and labels that are data (header counts, the wave preview with creep names, tower cards, the Library's help), and the "Tap a free cell to raise a tower..." hint (instructions, not a message).
- Tests: `writer.test.ts` (5, in `npm test`). Browser at 360x640 and 390x844: a new wave, a Rift Titan, the core raised, a perk and the speed each wrote a phrase; a mistake said why; 40 writes of a 14-phrase text dealt all 14 before repeating; the banner wrapped to two rows.

### 2026-11-18 (fel) · Claude

The owner, from a wave-206 run (screenshots): fel is underpowered next to flux ("paying double, getting double less", a Siphon at ★9 hitting 2917 where an Entangler at ★5 hits 26829). Asked for at least endless fel upgrades, fel super bosses, and the fel tab in the "center circle thing" instead of scrolling the Library; or fel absorbing other towers.

- **Why** (read from the code): a DE costs 4 flux / 5 O/I / 4 ATP, the fel towers' base damage was ~0.5 of the void tower of the same job (Siphon 12 against Entangler 26, Wrath 60 against Railgun 130), their paths and Ascensions the same shape, the void towers also had `td.void.perks.power` (+120%), and DE could only be traded for (at a loss), never earned. Mastery grows damage only linearly (1 + 0.45 per level) while its cost grows 1.5 times a level, so no set outgrows its price without a sink.
- **Fix, all in `td.fel`**: `damage` and `burn` 2.4 (multiply a fel tower's own numbers in `towerStats`); six **fel perks** (`economy.ts` `FEL_PERKS`, `felPerkCost`, `felPerkMaxed`, `felPower`/`felHaste`/`felReach`/`felTithe`/`barter`/`devour`; `sim.ts` `buyFelPerk`, `TdState.felPerks`, saved and read bounded in `save.ts`); **Barter** and **Devour** change `tradePrice`, `tradeYield` and `sacrificeValue` (now with an optional `FelPerks`; `sacrificeFor(s, t)` takes the state); **Soul tithe** pays in the wave-clear step; **super bosses**: three creeps with a `de` payout (config creeps `nightterror`, `nightmare`, `insomnia`), `supersFor(wave)` joins `bossesFor` in `waveSpec`, `nextSuper`, `deReward`; the kill step pays `s.de += deReward(...)` and the `bossKilled`/`waveCleared` events carry `de`.
- **Numbers**: chosen with a script that spends a flux budget (a DE counted as 4) on the best single tower of each job, void against fel (buying levels, path, Ascension, mastery and each set's perks greedily). With 2.4 / Hellfire +10% / base 60 / growth 1.3: fel/void was about 1.0 at 3 000, 0.5 to 1.1 at 30 000, 2 to 6 at 300 000, 6 to 19 at 3 000 000 (railgun/wrath best, quasar/oblivion the widest). In a real build the perks are shared by every fel tower, so they are worth more than that table. To retune: `td.fel.damage`, and each perk's `baseCost`, `growth`, `amount`.
- **UI** (`TdHud.tsx`): the core's panel is `CoreSheet`, tabs **Core** (the old `CorePanel`) and **Fel** (`FelPanel`: `FelPerks` lean, one line a perk, and `AltarPanel` lean); the last tab is kept (`coreMenu`). The Library and the DE chip's sheet show `FelPerks` after the altar. `TowerPanel` passes the fel perks to `towerStats`, so its numbers are right.
- **Not done: absorbing other towers.** Offering a tower already turns it into DE (85%, Devour up to 135%, and Barter helps), which then buys any fel upgrade; a direct "feed this tower to that fel tower" would be the same trade in one tap. Say if you want that button.
- Tests (`fel.test.ts`, 24): the upgrades' costs, limits and effects (fel only), Barter and Devour, Soul tithe at waves 1, 40 and 100, save and restore with bounds, the super bosses' schedule, their payout in the sim, and a guard that a fel tower hits as hard as the void tower of its job. Browser (360×640 and 390×844): the core's two tabs, Hellfire bought twice (DE 3412 to 3274, a Siphon 197 to 239), 45 000 ATP traded for DE from the same tab, the altar sheet and the Library showing the Pyre, wave 40 ending in Night Terror with its banner, and its slaying paying 780 DE.
- An old run (like the owner's wave 206) loads with no fel upgrades, its fel towers hit 2.4 times as hard at once, and the first super boss is wave 220.

### 2026-11-18 (later still) · Claude

The owner: the wine's conversation / date night "would also automatically result in recites and all that, that what it is based on, not just empty convo-work". So the conversation is now paid for with recites.

- **A sip is a recite.** `courtSay` on an `exotic` choice no longer answers at once: `courtToast(choice, asked)` stashes the talk (`this.toast = {talk, choice, asked}`) and starts `courtRecite(her place, {queen, toast: true})`: a `Session` with `toast: true` and `round: court.wine.sipPhrases` (1), her watching, no "watch" line (your question is in her box instead), the usual XP/gold/streak/affection and `phraseDone` text progress. When the round is through (`courtTap`: `s.toast && s.roundDone`) `endSession()` calls `toastBack(answered)`: it restores `this.talk` and the talk panel and, if answered, runs `courtAnswer(choice)` (the old second half of `courtSay`: `replyTo`, affection, mood, voice, model). Leaving early (Back button, Esc) goes through the same `endSession()` and so `toastBack(false)`: the question's line leaves the log and the same choices are waiting; no sip is spent. `courtAnswer` is also what every other choice uses.
- Because `endSession()` does the return, any path that ends a session (leave, Esc, title) is covered; `toTitle` sets the panel to null after it.
- The engine did not change for this (`replyTo` on `exotic` still takes the sip, gives `free` affection, adds the empty-bottle line); only the game decides *when* it is called.
- **Date night** (already a recite round): after each phrase `openUp(q)` says an exotic answer of hers by herself (`converse.opensUp`, pure: `told` holds the raw pack lines, since `{pet}` changes the filled text; a first version tracked filled lines and the test caught repeats). `dateTold` is reset at each recite start.
- `court.wine.sipPhrases` (1): phrases a sip asks for. `Session.toast`, `CourtSessionView.toast`; the recite screen header says WINE for it, its phrases stepper is fixed like a date's, its Leave button says Back.
- Tests (641 pass): `opensUp` (never twice, whole words, her own voice), a sip's session is one round of `sipPhrases` phrases and never a date. The hand-off itself (CourtGame needs a canvas) was driven in a browser: pour, a sip starts the recite by itself with her watching, the answer comes when its passes are done, early leave keeps the question, four sips empty the bottle, the text's progress counts, a date night has her open up after each phrase.

### 2026-11-18 (later) · Claude

Asked for by the owner: the reward for finishing a text (affection/XP/gold were a dead end, "a date-night reward or crystal wine drink or exotic conversations bonus something"). Built: **crystal wine**.

- Earned in `courtgame.ts` `phraseDone`: one bottle per text recited through (text of at least `court.wine.minPhrases` phrases; bag of at most `court.wine.max`; `save.wine`). `save.wineShared[queen]` counts the bottles poured for each. Both are in `CourtSave` (rules.ts), read defensively in `loadTalk` (converse.ts), and in the saved Court like everything else (`azshara-court-v1`).
- Spent in `converse.ts`: `canPour` (a bottle, tier >= `minTier`, not jealous, not poured yet in the talk, `Talk.wine` = 0) puts a **Pour** choice first in `choicesFor`. `replyTo` on `pour` gives `court.wine.pour` affection, sets `Talk.wine` to `court.wine.sips` and sets `Reply.free` and `Reply.poured`; while `Talk.wine` > 0 `choicesFor` returns only `court.wine.choices` **exotic** topics (never one asked already in the talk, while others are left) and goodbye; each `exotic` reply is worth `sipAffection`, `free`, with no extra line or question of hers; the last one adds an `answers.empty` line. `Reply.free` means the game does not count it against `court.talk.perDay` (`courtSay`: `r.free || countTalk(...)`); `Reply.poured` takes the bottle from the bag. A connected chat model is told about the wine in its prompt.
- Date night: `courtDate(q, wine)` pours a bottle, `Session.wine` (only on a date) multiplies `affectionGain` and the date's end bonus (`dateBonus(wine)`) by `court.wine.dateMult`.
- Words (talk pack, `shared.json`): `exotic` (12 topics, each 3 asks and 4 answers, any queen's voice via `dress`), `ask.pour` (6), `answers.pour` (6), `answers.empty` (5). `talk.test.ts` checks them (at least `sips + choices` exotic topics so a bottle never runs out of new ones). GROK_TALK.md has the targets for another AI to enrich them.
- HUD (`CourtHud.tsx`): Pour / Sip tags in the talk list (crystal-violet, `WINE_COLOR`), a hint with the sips left, a **Date night** button and a "Crystal wine xN" line on her sheet, "DATE NIGHT" in the recite header. `CourtTalkView.wine`, `CourtSessionView.wine` in store.ts.
- Tests: 8 more (converse.test.ts: pour/sips/empty, hold-back, no extras, goodbye, save; court.test.ts: the date-night multipliers). The game tests: 638 pass. The 8 failures in `npm test`'s first part (`scripts/**/*.test.mjs`, the platform's og injector) also fail on the untouched commit; they are not from this.
- Open: the numbers (46 ♥ a bottle in a talk: 10 + 4 x 9; a day's best talking is 60) are a first guess; `court.wine` is where to tune them. Queens do not have exotic lines of their own yet (only the shared ones, dressed in her voice).

### 2026-11-18 · Claude

Asked for by the owner ("go shaders enhancement", after a video of fbm domain-warped shaders): flowing GPU backdrops.

- `shaderart.ts` (pure, tested): the three fragment shaders (`marble` = iq's `fbm(p + fbm(p + fbm(p + t)))`, `aurora`, `nebula` with stars; GLSL ES 1.00 with constant loop bounds, `highp` where there is), `hexToRgb`, `paletteOf` (one colour to four, dark to light), `elementLook` / `queenLook` / `nebulaLook`, `qualityOf` (strength from the setting, half-size drawing, at most 30 fps) and `drawSize`.
- `ShaderBackdrop.tsx` (DOM): one WebGL canvas, a fullscreen triangle, `powerPreference: "low-power"`, frame cap, paused while hidden, one still frame under reduced motion, nothing at all when the setting is 0 or WebGL fails. Put it **first in a screen that is a stacking context, with `-z-10`**; it blends with `mix-blend-mode: screen`. It does not give its context up on cleanup (a canvas that lost its context can never take another, and React's double effects in dev would then break it); the page frees it. The first frame reads one pixel into `data-px` so a QA run can tell "black" from "drawing".
- The setting is `shaderArt` (0 to 100, 80 to start) in config.json settings/settingLimits, `store.ts`, `engine.ts` `clampSettings`, `sliders.ts` (Options → Display).
- Used on: the recite screen (`elementLook`), the talk screen (`queenLook`), the Atelier (`nebulaLook`) and the title (`titleLook`, the theme's violet and cyan read from the CSS variables). Not on the map or in tower defense (their canvases are the game).
- Not verified: how a real phone's GPU copes. Here it ran on a software renderer at about 22 frames a second; the pictures are 180 by 320 pixels.

### 2026-11-17 (night) · Claude

Asked for by the owner: texts recited in the Court count phrase by phrase ("10 random phrases of 100 = 10%"), are confirmed when every phrase is done, and can then be repeated fresh.

- `bag.ts` (pure, tested): `DeckText`, `deckTexts`, `reciteDone`, `clearTexts`, `pickFresh`, `percentOf`. The bag (`azshara-court-bag-v1`, hashes) now means **phrases recited all through**, not phrases drawn: a phrase is added when its last pass is done (`tapComplete` hands the finished phrase to its `nextPhrase` callback; the round's last phrase, for which no next one is drawn, is counted in `courtTap` on the `phrase` reward). A skipped phrase is not counted; `recent` (last three drawn) stops it coming straight back. Old bags carry over as already-counted phrases.
- `courtgame.ts`: `deckOf` (every library text with its phrases and `done`, cached on the store's text arrays), `phraseDone` (counts, and for a finished text: `checkText` from `rehearseRun.ts` = the same marking and confirmed copy Rehearse's `autoCheck` makes, `CourtSave.textRounds[key]++`, a notice, then `reciteDone` has already cleared its hashes: a fresh round), `courtFresh(key)` (the ↺ button), `deckView()` / `sourcesView()` for the screen. A phrase two texts share counts for both and is cleared from both.
- Not done on purpose: a bonus for finishing a text (nothing asked), a per-text bag (the shared one keeps old saves).

Checked: `bag.test.ts` (6 new), `court.test.ts` (2 new), all tests, type check, lint, both builds; in a browser: a 12-phrase text recited through at random (3 phrases: 25%; a skip: still 25%; a round of 4: 33%; 12: checked in the Read store, rounds 1, a notice, a fresh round at 8% after one more), kept on the device, two texts mixed each counted by itself, the ↺ button.

### 2026-11-17 (evening) · Claude

Asked for by the owner: a new set of towers on a fel / dark energy currency made by sacrificing O/I, flux, ATP, towers or lives.

- **Currency "de"** (`TdState.de`, saved with the run, 0 for an old save): `economy.ts` `FEL_TOWER_KEYS`, `isFel`, `Currency` now has `"de"`, `CURRENCY_NAME.de`, and the altar's pricing (`tradePrice`, `tradeYield`, `sacrificeValue`, `lifeValue`); `sim.ts` `purse`/`pay` know it, plus `trade`, `tradeAll`, `sacrifice`, `sacrificeLives`, `sacrificeableLives` and an `altar` event. Numbers are `td.de` in config.json (cost per DE 5 O/I / 4 flux / 4 ATP; offering 0.85; 30 DE a life; never below `minLives` 1).
- **Ten towers** with `fel: true` (cinder, hex, blight, siphon, wrath, rift, pact, maw, eclipse, oblivion), all built from the existing stat vocabulary (burn, slow, block, corrode, rend, chain, bounty, spike, stun, splash, aura, haste, reach, vuln, shred, execute, mire, beam): no new simulation mechanics were needed, so every path and Ascension is covered by the existing "changes something" tests. Their DE prices are 24 to 100.
- Sacrifice is deliberately worse than trading directly (0.85) and better than selling then trading (0.6): no loop gains DE for nothing. There is no tribute / might bonus (considered, dropped: sacrificing cheap towers would farm it).
- UI (`TdHud.tsx`): a Fel tab (four tabs now), an Offer button in the tower panel (five buttons then, icons hidden), the DE chip in the header that opens `AltarSheet` (also a section of the Library); the header's icons hide under 420 px so five counts and the wave fit. `tdgame.ts` draws fel towers as dark diamonds with two orbiting sparks; `PAL.fel` and `--color-de` are the currency's colour.
- Balance: a crude bot (same O/I, same spending rule, base set vs fel set) reached wave 21 with both, wave 26 with a damage-focused fel mix. Tune `td.de.cost` first if the set feels too cheap or dear.

Checked: `fel.test.ts` (new, 14 tests), all 616 tests, type check, lint, both builds; the HUD driven in a browser at 360×640 and 390×844 (Fel tab, altar, trade all, a life given, a Cinder built, an Offer).

### 2026-11-17 (day) · Claude

Asked for by the owner: the Court's recite takes Rehearse's *settings* and not its *texts*; sound starts and stops with the recite; phrases count on the recite screen; recites from the pertext texts; voices loop through a phrase's passes, whole-text layers loop the text.

- `rehearseRun.ts` Court section: no longer reads `settings.paused` (Rehearse's master pause is Rehearse's own). `courtSound(text, tag, her, whole)`: **`tag` names the phrase, not the pass** (the caller's key is `phrases|phrase|source`), so a phrase's passes restart nothing and only the next phrase does; `whole` (a `CourtText`: the text's phrases, the current one's index, a mark) makes `swarmOf` read it as a whole text (`list: court:<mark>`, constant for the recite; only `phrase` moves, which `swarm.ts` handles by restarting just the phrase stream). `courtSound(null)` no longer calls `playClosed()`: it stops Rehearse's own wav/tts/voice. `courtScreen(on)` (called from `CourtGame.start/stop`) makes `playClosed()` stop Rehearse's own sound instead of playing it while the Court is on screen, so closing the Rehearse overlay or a setting changing never starts Rehearse's text there. **Do not call `playClosed()` from the Court's paths.**
- `courtgame.ts`: `soundMuted` (a hand pause, reset by `courtRecite`; set by `courtMute()` and by a change of Rehearse's `paused` while a session is up, through `subscribeRehearse`), `wholeOf()`, `courtSource(key)`. Phrases come from `rehearseLibrary()` (own texts + each .zip folder's + built-in; before, only the loaded own texts): `source.ts` (pure, tested) `unitsFrom` / `wholeText` / `chosenText`; `CourtSave.source` ("" = all mixed). `nextPhrase()` draws from the chosen deck's own part of the bag, so one text coming round leaves the others' progress.
- Whole-text voices need one text: the chosen one, or the only one in the library; several mixed: they say the phrase (documented in the README).
- UI: the recite screen's controls are a 2 x 2 grid (seconds a word, passes, **phrases a round**, text list); the round-complete screen's own phrase stepper is gone (the live row has it). `SoundSheet`'s big button is the Court's own pause.

Checked: `source.test.ts` (new), all tests, type check, lint, both builds; through the pretend Android bridge (Rehearse paused, Background on, layer 2 reading whole texts): the recite starts by itself; passes 1 to 3 of a phrase started nothing; the next phrase started all again; choosing one text gave "1 saying the phrase, 2 reading the whole text" and three passes plus a new phrase did not restart the mix; hand pause and play (sheet and Rehearse's own button); recite end stopped everything and nothing started after, nor after a Rehearse setting changed on the Court's screen; the next recite started by itself.

### 2026-11-17 (late night) · Claude

Asked for by the owner: queens that move and do things with no model behind them ("like Age of Mythology's bots").

- `life.ts` (pure): a utility brain. `scores(ctx)` weighs five plans (home, stroll, visit, call, rest) by `court.life.weights`, her mood, night, how fond she is; `choose` picks by score. `CourtSave.life[q]` counts her outings: visits and calls unlock, `roamRadius` grows.
- `courtgame.ts`: `life(dt)` (called beside `presence`), `decide`, `lifeNote`; `roam` holds where each queen of the region is. `queenSpot` answers from it, so taps, walking to her and queens meeting all follow her. An outing to find you (`out`) comes first; she stands still while busy with you.

### 2026-11-17 (night) · Claude

Asked for by the owner: whole 2D bodies, a male build for yourself, people on the map larger than dots.

- `figure.ts` (pure): `figureSvg(look, ring, { mood, step })`. The head is the portrait's own (`headPieces()` in `portrait.ts`: its defs, what goes behind the body, what goes over it), on a body measured from the look (`measure`): `Look.body` feminine or masculine, and the sliders in `BODY_KEYS` (height, build, chest, waist, hips, legs, limbs) plus shoulders and neck. Nine outfits, drawn over the same measures. Portraits are untouched (4455 hashes unchanged).
- Map: `drawFigure` paints figures once into bitmaps; `drawQueens` and `drawPlayer` use them (the old small hooded figure only while the picture loads). `court.view`: `nearZoom`, `figure`. `CourtSave.near` (on to start): `geometry()` makes the map larger and keeps you in the middle; drawing is clipped to the field.
- Atelier: Body and Dress pages show the whole figure.

### 2026-11-17 (later) · Claude

Asked for by the owner: sound started, paused and set from inside the Court, behind one button.

- `CourtSound.tsx`: `SoundButton` (map footer, recite screen, talk screen; it replaces the two speaker switches) opens `SoundSheet`: Rehearse's `paused`, `sound`, `nonstop`, `voice`, `voiceRepeats` (written with `rehearseUpdate`, so `courtAgain()` follows at once) and the Court's `save.sound.phrase` / `lines`. **All of Rehearse** mounts the real `RehearseTab` in a portal over the Court (`RehearseOver`): nothing is copied, so whatever the Rehearse tab gains shows there too. While it is up `CourtGame.courtAway(true)` holds the Court's clock (`CourtView.away`; the pass bar follows), and `rehearseOpen(true)` (the tab's own) quiets the Court's sound; on Back the Court's `syncSound` takes the players again.

Checked in a browser at 360×640: played from the map while paused; paused and played mid-recital; all of Rehearse up mid-recital (Court held, recital waited), back (sound again). No errors.

### 2026-11-17 · Claude

Asked for by the owner: each queen her own voice, as the main voice only; her lines with every voice Rehearse is set to.

- `hervoice.ts` (pure): `ownVoice(list, slot, mine)` picks a queen's voice from the phone's (same language as Rehearse's voice, no network voices, never Rehearse's own, one per queen while they last). `CourtSave.sound.voices[q]`: a name, "" (picked), "=" (Rehearse's).
- `rehearseRun.ts`: `CourtVoice`, `courtVoiceList()`, `herSay()`. `courtSound(text, tag, her)` says the **main voice** in her voice at her pitch and pace; the background mix (`swarmOf`) is untouched, so every other voice stays Rehearse's. `courtSay` says her line with her voice for the first voice and Rehearse's for the layer's other voices (`sayCopies`); `court.sound.lineVoices` is now 0 (all).
- `HerVoice` on a queen's sheet: a list of the phone's voices and a speaker to hear her (`courtVoice`, `courtVoiceTry`).
- Voices from games cannot be used (they are their actors' and makers'), and the app cannot make a sound-alike: a queen's voice is one the phone's text-to-speech has.

Checked: `hervoice.test.ts` (new), all 591 tests, type check, lint; through the pretend Android bridge, reciting for Eltharia asked the phone for her voice (pitch 1.12) once and Rehearse's own for the 11 background voices; Xal'atath's line was her voice plus Rehearse's for the two copies.

### 2026-11-16 (later) · Claude

The Court's Atelier, asked for by the owner ("like MakeHuman: edit queens, or your own body, then apply"): looks changed by hand.

- **A look's shape** (`portrait.ts`): `Look.shape` holds sliders from -1 to 1 (`SHAPE_KEYS`, 25 of them); `reach()` multiplies each by `court.atelier.shape`. `reshape()` wraps a part of the picture in a transform, and gives the part back untouched when nothing changes, so **a look with no shape draws byte for byte as before**: all 4455 existing portraits (every queen, mood, tier, style, air and blink frame) were hashed before and after, none changed. Keep it so: the parts using the look's random numbers are made in the old order (backdrop, hair behind, hair in front).
- Also new in a look: `hairStyle: "short"`, `lashes: "none"` (a plain lid). The dark look's wild locks are left out for short hair.
- **Looks made by hand** live in `portrait.ts` (`lookOf`, `youLook`, `setLook`, `looksRev`, `subscribeLooks`, `youPortrait`), over config.json's, which stay the originals. `looks.ts` keeps them on the device (`azshara-court-looks-v1`, named in `backup.ts`); `atelier.ts` (pure) is the lists and the checks (`cleanLook` falls back to the original for anything unsound). Use `lookOf(q)`, never `C.queens[q].look`, wherever a portrait is drawn.
- **Screen**: `Atelier.tsx`, panel `{ kind: "atelier", who, from }`. A draft is edited; nothing reaches the game until Apply. `useLooks()` (its own file) redraws portrait components; `courtgame.ts` clears its portrait bitmaps when `looksRev()` moves.
- **You**: `court.atelier.you` (look and name). `drawPlayer` draws your figure from it; `YouAvatar` sits beside your lines in a talk.
- **Not done, on purpose**: whole bodies. The portrait is a bust, so "body" is neck, shoulders and how near. A full figure would be a new drawing; the owner has been asked.
- Dialogue: a stress test in `converse.test.ts` runs 5,280 exchanges (every queen, eight states, sixty turns each): no dead end, no placeholder left in a line. It found nothing wrong in the engine. While she waits for an answer to a question of hers, goodbye is not among the choices (the Leave button is). The talk log no longer shows a heart twice ("♥ +3 ♥" is "♥ +3").
- The other session's background mix (`swarm.ts`) now carries the Court's background voices (its merge `efcf493`): checked again through the pretend Android bridge: 11 voices mixed into one plus the main voice, a pass restarts nothing, Repeats, Pause, 96 kHz and a queen's line all as before.

Checked: `atelier.test.ts` (new, 16 tests), all 587 tests, type check, lint, both builds; a browser run at 390×844 and 360×640 of the whole Atelier (change a queen, asked before turning away, apply, your look and name, leave, reload: kept; Original takes the change away). On a real phone only the slider feel is unchecked.

### 2026-11-16 · Claude

The Court, asked for by the owner: conversations you choose, lines you tap, and Rehearse's sound.

- **Talk screen** (`src/game/court/converse.ts`, new and pure; `TalkScreen` in `CourtHud.tsx`; `courtTalk`, `courtSay`, `courtTalkNext`, `courtTalkEnd` in `courtgame.ts`). Each turn offers topics, a follow-up, lines in a tone (sweet, bold, witty, humble, honest), a rarer question and goodbye. Each queen loves, likes and dislikes a tone (`court.talk.tastes`); tried tones are kept in `CourtSave.tried`, the day's exchanges in `CourtSave.talked`. Its words are new parts of `talk/shared.json`: `tones`, `reacts`, `sorry`, `ask`, `answers`, `herAsks`, and 12 more `topics`. `talk.test.ts` checks them; GROK_TALK.md tells Grok how to fill them.
- **Lines tapped as read**: `courtLineDone` and `LineBox`. A queen's sheet shows the line (her hello used to appear under the sheet, unseen), and her sheet's lines come first (`speakLine`).
- **Rehearse's sound**: `courtSound`, `courtTapSound`, `courtSay`, `courtHush` in `rehearseRun.ts`; the Court calls them from `syncSound` (each frame, by phrase and pass) and `voiceLine`. Switches in `CourtSave.sound`; each queen's pitch and pace in `court.sound.queens`.
- **On build 1.0.110's voice model** (the other session's `heardVoices` / `liveVoices` / `voiceRepeats` / `ttsRate`): `courtSound` plays as `playVoice` does on a single phrase: one player a heard layer with its voices (stacks multiplied, capped by `liveCap`), the main voice apart with `times: voiceRepeats`. A pass stands for the tap: the pass key is the play's `tag`, so the main voice says it again each pass. `rehearseUpdate` calls `courtAgain()` on any settings change (Pause all sound, Repeats, a layer), and `applyRate` stops the Court's players so they start again at the new rate. A queen's line: the main layer's voices, at most `court.sound.lineVoices`. **If `playVoice`'s single-phrase path changes again, change `courtSound` with it.**
- `courtGreet` is now only her hello when you walk up; the old Charm her exchange (timers, a five-minute memory) is gone.

Checked: `converse.test.ts` (new, 15 tests), the talk pack check, all 569 tests, type check, lint; browser runs at 390×844 and 360×640 of a whole talk, tapped lines on the map, a sheet and the recite screen, and of the sound calls (what plays when a session starts, on each pass, held, resumed, switched off and left; what is said in a talk, at whose pitch). The sound was also run through the phone's path with a pretend Android bridge (its text-to-speech handing back a short tone): two layers, the second stacked (3 + 9 voices), gave 12 looping voices at 5 speeds; a new pass started nothing again; Repeats 2 had the main voice alone say it again each pass; Pause stopped all 13 sounds and Play brought them back; 96 kHz started all of them again at 96 kHz; a queen's line was 3 voices, once, at her pitch and pace. A real phone's voice engine cannot be run here.

### 2026-11-11 (later) · Claude

Rehearse, asked for by the owner: every text and phrase shown, a refresh, and a clearer reset button.

- **No limits.** Gone: 30 loose texts and 300 folder texts (`engine.ts`), 2,000 lines and 1,000,000 letters a text and the "longer than 4 letters" rule (`codex.ts`: `keepsLine` keeps any line with a letter or a digit), 300 files a .zip (`unzip.ts`), 5,000 phrases, 2,000 letters a phrase and 2,000 texts' places (`rehearse.ts`). What can still run out is the device's storage for the app (localStorage); `persistShared` says so.
- **Refresh** above Rehearse's lists (`refresh` in `RehearseTab.tsx`): reads azs-folder again, takes in .txt files changed outside, offers new ones, finds .wav files again.
- The bottom button is now "Reset all progress: every text back to phrase 1, 0 passes, 0 reps", with a line saying the texts stay.
- The lists' rows are `TextRow` and `PhraseRow` (memo), so a tap redraws in one frame with thousands of texts.

Checked: new tests in `rehearse.test.ts`, `texts.test.ts`, `unzip.test.ts` (now in `npm test`, with `readview.test.ts` and `alarm.test.ts`); a browser run with 650 texts and a 6,000-line text, kept over a reload.

### 2026-11-11 · Claude

Tower defense, asked for by the owner: a third set of towers and creeps, a core that advances, maps joined together, and the circle bug.

- **Wake set**: ten towers paid in ATP, a third currency (`wake: true` in `td.towers`; `WAKE_TOWER_KEYS` in `economy.ts`). New stats in `TowerStats`: `multi`, `stun`, `spikeEvery`/`spikeMult`, `block`, `chainKeep`, `corrode`, `rend`, `reach`, `atpIncome`, `mire`. Hits apply them in `afflict` (`sim.ts`).
- **Dream set**: six creeps from wave 12 and three bosses in the rotation (`ward`, `dash*`, `phase*`, `guard`, `jam*`, `rush`, `lull` in `TdCreepSpec`). They, every boss and Adenosine drop ATP.
- **Core levels**: `td.core`; `coreStats`, `coreCost` in `economy.ts`; `raiseCore`, `pulseCore` in `sim.ts`; the panel is `CorePanel` in `TdHud.tsx`.
- **Stitched maps**: `stitch`, `findMap`, `stitchKey` in `map.ts`. A stitched map's key is its maps' keys joined with "+". Its lane is one connected line: `linkCorner` picks the way from one board's end to the next one's gate. A map now has `cols`, `rows`, `sections` and `joins`; `COLS` and `ROWS` are one board. `tdgame.ts` can show all of it or one board (`view`).
- **Circle fix**: `towerStats` no longer clamps a circle to `td.maxSupportRange` after a path or an Ascension has added to it; only growth by level stops there.
- The build menu's buttons now fit a phone (`.btn-tower`, `.btn-tab` in `styles.css`), with an info switch to read about a tower first.

Checked: `src/game/td/wake.test.ts` (new, 40 tests), the other tower defense and config tests, type check, lint, both builds, and phone-size browser runs of a stitched map, the three build tabs, the core panel, a late wave and a saved run continued. Old saved runs load: the core starts at level 1 and ATP at 0.

### 2026-10-31 (night) · Claude

The owner asked for a dark fantasy look (references: dark purple painted art of Azshara and Xal'atath, WoW night elves with glowing eyes). New `src/game/court/darkstyle.ts`, switched by `court.portraits.style` ("dark" is the default, "classic" the earlier look):

- A night scene lit from behind in her colour, and a rune circle round her head.
- Glowing dust, and wild tapered locks of hair flowing out with glints in her colour.
- Rim-lit, deeper skin, and glowing eyes.
- A spiked crown for Azshara, filigree spikes on circlets, and gold chains with gems.

Drawing a portrait takes about 1.5 times as long as the classic look (68 ms against 46 ms at 600 px on a desktop). They are drawn once per mood and size.

### 2026-10-31 (evening) · Claude

Gentle portrait polish in `src/game/court/portrait.ts`, same look:

- The head's shadow on the hair behind it, and a ring of shine on the crown.
- The fringe casts a soft shadow on the forehead, and the front locks have a lit edge.
- Soft gradient blush, angled up to the cheekbones.
- A shaded neck and a softer rim on the face.
- Deeper eyeshadow near the lashes, a bright inner corner, a few fine lower lashes.
- A finer lip gloss.

Checked: Court tests, type check, lint, both builds, all 11 queens in several moods at 190 px and 1000 px.

### 2026-10-31 · Claude

Built Grok's "live presence + emotional arcs" design into the real code:

- `src/game/court/presence.ts` (new, pure): `comeOutChance`, `presenceLine`,
  `foundKind`, `encounterOf`, `pairKey`.
- `hearts.ts`: feelings (`ARC_KEYS`, `arcOf`, `setArc`, `arcMult`). A feeling
  sets her mood after jealousy and a moment's mood. Saved in `CourtSave.arcs`.
- `courtgame.ts`: queens walk out to you, stand beside you, follow you, watch you
  recite, and go home happy or hurt. Bonded queens react when they meet. Lonely
  on return after 12 h; upset (`confront`) when made jealous; softened after
  making up.
- Config: `court.presence` and `court.hearts.arcs`.

Changes from the design, to fit the code:

- Positions are not saved; only feelings are.
- `C.queens[q].region` does not exist: queens are found with `queensIn(region)`.
- Notices use `notice()`. The talk of the town is `buzzOf(day)`.
- `soft` is not a mood, so `softened` shows as `blush`.

Checked with the Court tests (69), type check, lint and phone-size browser runs.

## Next

- Rival double jealousy when two rivals are both with you at once.
- "Alliance" days for sisters and friends: a shared wish.
- Queens remember your best moments in what they say (streak peaks, first date).
