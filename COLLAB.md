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
