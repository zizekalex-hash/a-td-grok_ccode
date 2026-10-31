# Handoff: continuing the Court (and its Android app)

Read this before changing anything. It is written for an AI assistant (Grok or any
other) connected to this GitHub repository, so it can carry on where the last one
stopped.

## Prompt to paste

> You are continuing development of **Azshara's Signal Defense**, a React +
> TypeScript game shipped as an Android APK. I mostly play its **Court** mode.
> Work in the public GitHub repository **`zizekalex-hash/a-td-grok_ccode`** with your
> GitHub connector tools. First read `COURT_HANDOFF.md` and the newest notes at
> the top of `COLLAB.md` there, and follow them exactly: the code map, the config
> and save rules, the speed rules and the phone layout rules. Keep what already
> works; change only what I ask. Push your work to the branch **`grok/next`** in
> that repository (never `main`), and add a dated note at the top of `COLLAB.md`
> saying what you changed and what is left. Claude (another AI) picks it up from
> there, tests it, ships the APK and answers in `COLLAB.md`.
> My request: **(write what you want here)**

## What the game is

A word-training game: the player loads their own texts (.txt files) and recites
phrases from them. It has three modes: Tower Defense, Auto Chess and **the Court**.

The Court:

- **The map.** You walk a small world by tapping. There are three regions,
  linked by gates: the Realm, the Moonshore Isles and the Ashen Peaks. They hold
  22 places in all: the Inn, the Shire, the Void, the Mine, Azshara's Palace, the
  Moon Market (a shop) and so on. There is day and night by the device's clock,
  plus townsfolk, boats and lit windows.
- **Skills.** There are 20 skills, levelled RuneScape-style up to 99. Each place
  trains one Fire-style skill and one Water-style skill; the player switches
  style at the top.
- **Reciting.** Reciting happens in rounds: 3 phrases a round, each read 3 times
  (both changeable).
  - Words light up one at a time (0.9 s a word to start). When they finish, the
    player taps the big button, or anywhere in the middle, to complete the pass.
    Nothing is ever "missed".
  - Every pass gives XP and gold. Streaks multiply XP.
  - The whole current phrase flashes in the middle of the screen
    (`court.flash`).
  - Phrases are always whole sentences and are never cut off.
- **Queens.** There are 11: Eltharia, Alexstrasza, Ysera, Onyxia, Azshara,
  Xal'atath, Jaina, Tyrande, Sylvanas, Sinestra and Valeera.
  - Affection tiers: Stranger, Noticed, Curious, Fond, Smitten, Devoted.
  - You win her over with gifts and dates (dates from Curious), and by charming
    her.
  - She has 9 moods, shown on an animated SVG portrait, and a gallery of 99
    portraits to collect.
  - She misses you after 12 h, grows jealous of rivals, wishes for passes of one
    skill each day, and remembers how many passes you recited for her.
- **News.** Queen notices are cards with her portrait that stay on screen for 8 s.
  - A News & rumors list keeps everything, with an unread count.
  - The town gossips every ~40 s while you walk the map.
  - One "talk of the town" queen a day gets ×1.5 affection.
  - Bonds between queens: sisters, friends and rivals. Sisters and friends put in
    a good word; rivals grow jealous anywhere.
- **Your story.** Each queen's sheet shows how long you have been together, your
  dates, your gifts, and what the town says about her.
- **Queens come to find you** (`court.presence`). While you walk the map, a queen
  who knows you may leave her place and walk to you.
  - She speaks when she finds you (lonely, upset, or glad), then follows you for a
    few minutes and watches you recite wherever you go.
  - Then she goes home: happy if you talked to her, gave her a gift or recited
    while she was there; hurt if you ignored her.
  - Sisters, friends and rivals who meet on the way react to each other.
- **Feelings** (`court.hearts.arcs`) last real minutes and set her mood and
  affection: lonely, looking for you, with you, happy, hurt, upset, softened.
- **Queens in their own words (optional).** With `narrator` configured to an
  OpenAI-compatible endpoint (off by default), queens can also answer in their
  own words.

## Code map (Court)

| File                                          | What it does                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/court/rules.ts`                     | Pure rules: skills, levels, places, queens' needs, affection tiers, phrase picking (`pickPhrase`, whole sentences), recite sessions (`startSession`, `advance`, `tapComplete`, `nextRound`, `skipPhrase`), `CourtSave` and `newSave`.                                                   |
| `src/game/court/hearts.ts`                    | Moods, feelings that last a while (`arcOf`, `setArc`, `arcMult`), gallery, missing you, jealousy (`rivalsOf`, `stirJealousy`), bonds (`bondOf`, `bondsOf`, `goodWord`), wishes, memories, `loadHearts`.                                                                                 |
| `src/game/court/presence.ts`                  | Queens who come to find you: the chance one comes out (`comeOutChance`), her lines (`presenceLine`, `foundKind`), how two queens who meet react (`encounterOf`). Her walking, following and going home are in `courtgame.ts` (`presence`, `comeOut`, `moveOutings`, `found`, `goHome`). |
| `src/game/court/news.ts`                      | Talk of the town (`buzzOf`), rumors (`rumorsNow`, `makeRumor`), queens talking about their bonds (`bondTalk`), the News list (`addNews`, `unreadNews`, `loadNews`).                                                                                                                     |
| `src/game/court/courtgame.ts`                 | The game itself: the frame loop, walking, sessions, affection, notices, gossip timer, saving, `pushView` (what the screens get).                                                                                                                                                        |
| `src/components/game/CourtHud.tsx`            | All Court screens: header, sheets (place, queen, queens, shop, skills, gallery, news), recite screen (lit word, pass bar, middle flash, notices), drops.                                                                                                                                |
| `src/game/court/portrait.ts`                  | Queen portraits as SVG (face, eyes, lips, hair, moods, tier jewels, blink and air layers).                                                                                                                                                                                              |
| `src/game/court/attire.ts`                    | Scenery behind each queen, outfits, hair adornments, place banners.                                                                                                                                                                                                                     |
| `src/game/court/art.ts`                       | Map drawing: cached board, night, live effects batched by brightness, townsfolk, boats.                                                                                                                                                                                                 |
| `src/game/court/world.ts`                     | Map parsing and path finding.                                                                                                                                                                                                                                                           |
| `src/game/court/svgkit.ts`                    | Small SVG helpers.                                                                                                                                                                                                                                                                      |
| `src/game/court/court.test.ts`                | Court tests.                                                                                                                                                                                                                                                                            |
| `src/game/store.ts`                           | Shared state: `CourtView`, `CourtPanel`.                                                                                                                                                                                                                                                |
| `src/game/config.json` + `src/game/config.ts` | Every number and line, and its type.                                                                                                                                                                                                                                                    |
| `src/styles.css`                              | Animations (`court-flash`, `court-notice`, `court-drop`, `court-fill`, breathing, blinking).                                                                                                                                                                                            |

The pure modules (`rules.ts`, `hearts.ts`, `news.ts`, `presence.ts`, `portrait.ts`, `attire.ts`,
`art.ts`, `world.ts`) use **relative imports ending in `.ts`** and no `@/` alias, so
the Node test runner can load them. Keep it that way.

## Rules that matter

### Config

- Every tunable number and every line of text goes in `src/game/config.json`
  under `court.*`, with an `_about` note in plain words.
- Add the matching type in `src/game/config.ts`. Options → Advanced then shows
  it automatically.
- `config.json` is formatted by hand. **Never run prettier or a JSON
  re-serializer over it.** Insert new text in place instead.

### Saves

- Saves live in `localStorage` under `azshara-court-v1`. They are read
  defensively (`readSave`, `loadHearts`, `loadNews`).
- To add a saved field:
  - add it to `CourtSave` and `newSave()` in `rules.ts`;
  - read it in a loader that clamps bad values;
  - add a test.
- Never break an old save: players update the app over the top of the old one.

### Speed (the player complained about lag more than once)

Do not undo any of these:

- Never draw an SVG image every frame. Portraits are painted once into bitmaps
  (`bitmaps`, `glows` caches). The map board is cached and redrawn only when its
  key changes.
- Live map effects are batched (`Levels` in `art.ts`). A "lite" mode switches on
  by itself on slow phones.
- `pushView` only updates the screens when its signature changes. Keep anything
  new that is shown in that signature.
- While the recite screen is open, the map is drawn once and then left alone.
- The pass bar is a CSS animation. Large portraits animate only opacity and
  scale.
- Anything that moves should be a CSS animation, not a React state change every
  frame.

### Phone layout

- Check 360×640, 390×844 and a desktop size. Nothing may run off the screen.
- The header must stay on one row: on narrow screens its buttons show icons only.
- Text is never cut off: whole sentences, and text that shrinks to fit.
- `.btn` in `styles.css` is not in a Tailwind layer, so Tailwind padding classes
  on a `.btn` need `!` to apply (for example `max-[520px]:px-2!`).
- Respect reduced motion.

### Style

- Plain words in the user interface and in comments.
- Each function has a one-line comment saying what it does.

## What the player likes and dislikes

- Likes: detailed, emotional, "addictive" queens and Court; lots of variety; animated
  but smooth; everything adjustable in config; tap to complete a pass; the
  phrase flash clearly visible in the middle.
- Disliked: lag; text cut off; a pass counted as "missed"; the night-elf-style
  portrait redraw (it was reverted). Improve the current portrait look gently;
  don't redesign it.

## Checks before every push

```bash
npm ci                         # once
npx tsc --noEmit -p .
npx eslint .
# The game's tests (the first half of `npm test` fails on old, unrelated
# share-card plugin tests, so run these directly):
node --experimental-strip-types --test src/game/court/court.test.ts src/game/config.test.ts src/game/cfg.test.ts src/game/recite.test.ts src/game/td/sim.test.ts src/game/chess/sim.test.ts src/game/council.test.ts src/game/layout.test.ts src/game/upgrades.test.ts src/game/rawimage.test.ts src/game/frameLimiter.test.ts
npx prettier --write <the .ts/.tsx/.css files you changed>   # not config.json
npm run build                                  # the web build
npx vite build -c vite.offline.config.ts       # the phone build (into mobile/www)
```

If you can run a browser, open the game (`npm run dev`, port 8080). Go to Court →
Enter the Court, then try what you changed at phone size. The browser console must
stay free of errors.

## Shipping the APK

- The workflow `.github/workflows/android-apk.yml` ("Android APK") runs on every
  push to **`claude/downloadable-private-content-rbnf97`** that changes `src/`,
  `offline/`, `mobile/`, `vite.offline.config.ts` or `package*.json`. You can
  also start it by hand (workflow_dispatch).
- It builds version `1.0.<run number>` and replaces the release **`apk-latest`**:
  https://github.com/zizekalex-hash/a-td/releases/tag/apk-latest
- On the phone, the player downloads `azshara-signal-defense.apk` and opens it.
  Android updates the app, and progress stays.
- **Never change `mobile/android/app/sideload.keystore`.** The workflow checks
  the signature, and a different key would stop the phone from updating the app.
- Push each change as a fast-forward of the same commit to all three branches:
  `main`, `claude/downloadable-private-content-rbnf97` (builds the APK) and
  `ccr-1f1f5b27-e8kfky`.
- A build takes about 3–4 minutes. If it fails, read the job log, fix the cause
  and push again.

## Working together (Grok and Claude)

Grok's GitHub login only reaches public repositories, so there are two:

- **`zizekalex-hash/a-td`**: private. It holds everything, including the APK
  build and its signing key, and is where the APK is built from.
- **`zizekalex-hash/a-td-grok_ccode`**: a public copy of the game code for Grok. It
  holds no saves, texts, signing key, build workflow or history. The owner can
  make it private or delete it at any time.

The copy's `main` follows the private `main`. Grok works on its `grok/next`:

1. Read the newest notes at the top of `COLLAB.md`, and the log for what changed.
2. Work on **`grok/next`** in the public copy. Push there, never to `main`.
3. Add a dated note at the top of `COLLAB.md`: what you did, how you checked it,
   and what is left or what you need from the other side.
4. Claude checks on a schedule with `scripts/grok-mirror.sh` (in the private
   repository):
   - `status` shows what Grok has that is not brought over yet;
   - `pull` applies Grok's new work to the private working tree;
   - `publish` updates the copy's `main` after every push.

   Claude reviews and tests the work, fixes what fails, commits it, pushes the
   three branches (which builds the APK), publishes the copy and answers in
   `COLLAB.md`. Grok can keep working on `grok/next`: only new commits are
   brought over each time.

## Notes

- `AGENTS.md` is the contract for the Grok App Builder sandbox (port 8080,
  `/workspace/startup.sh`, preview checks). If you work in that sandbox, follow
  it too. It does not change how the APK is built.
- `README.md` describes every feature for players. Update it when you add or
  change one.
