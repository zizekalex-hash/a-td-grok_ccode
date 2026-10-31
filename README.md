# a-td

Azshara's Signal Defense: a holographic tower-defense game built with TanStack Start, React and Vite. Your text is the ammunition.

## Run locally

```sh
npm install
npm run dev              # http://localhost:8080
```

## Check and build

```sh
npm run typecheck
npm run lint
npm run build            # production output goes to .vercel/output
npm run preview:restart  # serves the build on http://127.0.0.1:8081
```

## Menu, options and cfg

Esc (or the Menu button on a phone) opens the game menu, which holds the fight: Resume, Options, Controls, Tome, Restart, Quit to title. Options has tabs for Game, Display (frame-rate cap and counter, render resolution, interface size), Text, Sound (on/off and volume), Controls (every key and tap) and Advanced. Option changes show at once, with the game running.

Advanced is the cfg: every number, switch and name in `config.json` as a searchable list (`td.startGold`, `chess.pieces.knight.maxHit`, ...). Edits are checked (a value that must be above 0 stays above 0, lists keep their length), saved on the device, and apply after a restart; ↺ puts one value back and Reset all puts back the shipped config. Export, Copy and Import move a cfg file (options and cfg changes together) between devices. If the game ever fails to start with your changes, the next start leaves them off and Advanced says so, so a bad value cannot lock you out.

## Court

A small world you walk around by tapping: tap the ground to walk there, a building or spot to walk to its door and open it, a queen to walk up and talk. Nothing to hold, so it suits a tablet.

Three regions, each its own map:

- The Realm: the Training Yard, Whispering Forest, Ember Mine, the Gilded Inn, Starlit Library, the Void, the Shadow Sanctum, the Shire, Azshara's Palace and the Moon Market.
- Moonshore Isles (the ferry on the Realm's east edge, open at total level 30): Kul Harbor, the Coral Grotto, Windrunner Spire and the Moon Temple, on sand among the waves.
- Ashen Peaks (the road on the Realm's west edge, open at total level 50): the Black Forge, the Blade Arena, Ember Springs and the Feast Hall, among lava.

The maps are drawn in detail, all in code so they work offline: cobbled streets in the Realm, boardwalks on the Isles and flagstones in the Peaks, grass that grows over the edges, shallows and foam along every shore, oaks, pines and palms, snow-capped and lava-seamed mountains, and a building for every place (a castle with towers and banners for the Palace, domes for the Library and Temple, striped stalls at the Market, a mine and a grotto in the rock, tall towers for the Spire and the Sanctum, a forge, an arena, hot springs, and timbered houses with lit windows). Water glints, lava breathes and bubbles, stars twinkle in the void, chimneys smoke, gates swirl, and each region has its own life: fireflies in the Realm, glitter and gulls on the Isles, embers and falling ash in the Peaks.

The Court lives: you walk it as a hooded wanderer with a cape in your style's colour, townsfolk stroll the streets (sailors on the Isles' boardwalks, smiths with lanterns in the Peaks) and boats sail off the Isles. Day turns to night by your device's clock: from dusk the map darkens and windows, doors and gates glow (court.night: on or off, and how dark). Every place's window opens with a banner of its scenery.

Walking to a gate takes you through it; the way home is always open. Each place trains two of 20 skills, one in the Fire style (the warrior's way: Strength, Woodcutting, Mining, Charisma, Lore, Magic, Stamina, Smithing, Archery, Cooking) and one in the Water style (the flowing way: Grace, Herbalism, Crystal-singing, Song, Serenity, Dream, Harmony, Fishing, Dance, Alchemy). Switch style at the top. Levels follow RuneScape's curve to 99.

To train, recite in rounds: a round is 3 phrases, each read 3 times (both changeable: − and + for passes while you play, phrases a round on the round's summary). A random phrase from your texts lights up one word at a time (0.9 s a word to start; − and + change it while you play) with the whole phrase shown below. When the words finish, the big button turns gold: tap it, or anywhere in the middle of the screen (or press Space), to complete the pass, and the next one starts at once. Nothing is ever missed: a pass waits for its tap. A tap while the words are still lighting up does nothing, so to read faster, lower the time per word. Every pass pays XP for each letter, each word and the pass itself, so longer phrases pay more; finishing a phrase adds a bonus, and a streak of passes multiplies the XP, up to double. Passes also pay gold, most at the Forest and the Mine. After the last phrase, the round is complete: see what it paid, then Continue for another round or Leave. XP drops float up the side, RuneScape-style. Phrases are always whole sentences, never cut off mid-sentence (court.maxPhraseWords only prefers shorter ones). The lit word stays on one line and the whole phrase shrinks to fit the screen, so nothing is cut off. The current phrase also flashes, whole, in the middle of the screen: it fades in, holds and fades out again and again, as large as fits (court.flash: how often, how long, size and opacity; or off). The queen you recite for watches from a small portrait at the top with what she says. The pass bar fills by itself and the map is not redrawn behind the recite screen, so reading stays smooth.

Eleven queens. In the Realm: Eltharia at the Inn, Alexstrasza in the Shire, Ysera in the Void, Onyxia by the Mine, Azshara in her palace and her dark sister Xal'atath in the Shadow Sanctum (total level 90). On the Isles: Jaina at Kul Harbor, Tyrande at the Moon Temple and Sylvanas on Windrunner Spire. In the Peaks: Sinestra at the Black Forge and Valeera at the Blade Arena. Each loves one style, three skills and one gift. Most ask for levels before more than hello (Alexstrasza total level 30, Ysera Serenity 5, Onyxia Strength 10, Azshara total level 70, Jaina Fishing 5, Tyrande Dance 10, Sylvanas Archery 15, Sinestra Smithing 10, Valeera total level 80). The Queens list groups them by region; Go walks you to any of them, through the gates if she is in another region. Recite where a queen can see you and she grows fonder (more in her style, on a streak), and you get +25% XP for the audience; level a skill she loves and she is thrilled; gifts from the Moon Market help, her favourite double. Affection goes Stranger, Noticed, Curious, Fond, Smitten, Devoted; from Curious on she will go on a date: a set of phrases with triple affection and extra XP. The Elixir of Focus doubles XP for 20 passes. Charm her tries one of your best lines.

The queens feel things. Each has nine moods, shown on her face and in the air around her: aloof, smiling, delighted (laughing), blushing (looking away, flustered), smitten (heart catchlights, petals), adoring (eyes closed in bliss, hearts), jealous (a pout under a storm), longing (a tear in the rain) and fierce (a burning look in a flare). Her tier sets her everyday mood, and moments change it for a while: her favourite gift, a skill she loves levelling, her wish granted, a streak of 8 while she watches. She misses you: come back after 12 hours away and she says so, teary, with a reunion bonus. She gets jealous: give a gift to or date another queen in her region (or her rival anywhere) once she is Curious or more, and she pouts, says so, and gives half the affection for reciting until you make up (a gift, or whole phrases recited for her). Every day each queen wishes for 15 passes of one of her skills (a gold "!" over her on the map until it is granted; any place that trains it counts) and pays affection and gold when you grant it. She remembers the passes you recite for her and tells you at 50, 200, 500, 1000 and 2500. Every mood you see goes into the Gallery (in the Queens list): 99 portraits to collect, each new one worth gold; locked ones say how to see them. Large portraits move: she blinks and breathes, hearts float and rain falls (still for anyone who asks for less motion). They move cheaply: the pictures themselves stay still and only fades and a gentle scale animate, and the map paints each portrait once at the size it is drawn. She wears more as she falls for you: more gems, a second necklace, glints in her hair, and a golden halo when Devoted.

Each queen stands in her own place's scenery (Azshara's moonlit palace windows, Eltharia's lanterns and bottles, Jaina's harbor with ships, Tyrande's temple moon, Sylvanas's spire, Sinestra's forge, Valeera's arena, Xal'atath's tendrils and watching eye, and so on), wears her own outfit (a regal fan collar, a laced corset, dragon scales, a priestess robe, a naval coat, armour, ranger leathers, a void gown) and has something in her hair (flowers, pearls, feathers, a leafy vine, fine chains or beads): look.outfit and look.adorn in config.json.

The Court talks. Notices about the queens (who saw you with whom, a good word from a sister, a wish granted, a new tier, a new portrait, a memory) stay on screen for 8 seconds as cards with her portrait; tap one to see her, or to dismiss it while reciting. Everything said is kept in News & rumors (the newspaper button at the top, with a count of what is new). While you walk the map the town gossips every 40 seconds or so: who loves what, who wishes for what today, who misses you, who is jealous, which sisters talked about you all night, which rivals are not speaking, what people say about you. Every day one queen is the talk of the town (🔥): everything you do for her counts ×1.5 ♥ until midnight. The queens have bonds. Azshara and Xal'atath are sisters, and so are Alexstrasza and Ysera; Jaina and Tyrande, Eltharia and Valeera, Onyxia and Sinestra are friends; Azshara and Tyrande, Alexstrasza and Onyxia, Jaina and Sylvanas, Sylvanas and Tyrande, Ysera and Xal'atath, Valeera and Sinestra are rivals. Sisters and friends never grow jealous of each other: court one, and the others who know you put in a good word (+6 ♥). Rivals grow jealous wherever they are. Charm a queen and she may talk about her sister, friend or rival instead. Her sheet shows your story (together since, dates, gifts, what the town says about her) and her bonds; tap one to go to her. All of it is tuned in court.news: how long notices stay, how often the town talks, the bonus, the bonds and every line.

The queens come to find you. While you walk the map, a queen who knows you may leave her place (an empty ring marks where she stood) and walk to you: warmer queens come more often, and so does the talk of the town, a lonely queen and an upset one. When she finds you she says so: how many hours she counted if she missed you, what she thinks of her rival if she is jealous, or simply that she wanted to see you. She stands beside you, follows you for a few minutes and watches you recite wherever you go (with the XP bonus for her audience). Then she goes home: happy if you talked to her, gave her a gift or recited while she was there, hurt if you ignored her. Sisters, friends and rivals who meet on the way react to each other. Feelings last real minutes and show on her face, her sheet and the Queens list: lonely, looking for you, with you (×1.25 ♥), happy, hurt (×0.75 ♥ for 90 minutes, and she won't come to you), upset and softened. Tuned in court.presence and court.hearts.arcs.

The queens are drawn in a dark fantasy style: each stands in a night scene lit from behind in her colour, with a glowing rune circle round her head, wild flowing hair with light in it, rim-lit skin, glowing eyes, a spiked golden crown for Azshara and golden chains with gems. court.portraits.style switches back to the earlier, brighter look ("classic"). The portraits keep their glamorous drawn look, with soft candlelit skin, full glossy lips and gently waving hair with soft shadows and a shine band.

Every queen has her own portrait, drawn in code from her look in `config.json` (skin, hair, sheen and style, eyes with winged liner and eyeshadow, lipstick, elf or round ears, dragon horns, a crown, void crown, tiara, circlet or hood, earrings, gown and colours), so it works offline: on the map, in her window (washed in her colour; tap her portrait there or in the Queens list to see it full screen), beside her lines, large on the recite screen while she watches (glowing brighter with your streak), and on the title. With a model connected in the Narrator settings, the queens answer level-ups, gifts and dates in their own words; without one they use their scripted lines. Everything is tuned in the `court` block of `config.json`, the map included. The Court is separate from the other modes.

## Your texts

Load .txt (title screen, tome, Options → Text) takes one file or several at once. Several are read in turn, in name order (1, 2, 3 ... 10): the shots carry phrases from text 1 until it has been read through, then text 2 takes over, and after the last, text 1 comes back. The field, the binary rain and the core show the text in use. Two sliders in Options → Game set the timing: Pause between phrases (the least time between two phrases on shots, 300 ms to start) and Pause between texts (a break after a text has been read through, before the next one, or the same one again, starts; 2 s to start). Shots inside a pause fly plain; spells always carry a phrase. The tome and Options → Text list the loaded texts: tap one to switch to it now, Next for the next, ✕ to drop one. Up to 30 texts stay on the device between visits; pasted text replaces them.

## Tuning

Game parameters live in `src/game/config.json`: starting settings and slider ranges, the binary rain, wave and spawn rates for every mode, enemy stats, the core-level bonus from the recitation drill, the default text, and the narrator. Edit values there rather than in the code, then run `npm test`; `src/game/config.test.ts` catches out-of-range or missing values. Changes ship with the next build.

## Tower defense

Waves never end. Each one is bigger and tougher: hit points grow faster than linearly, creeps speed up and gain armor from wave 20, a boss closes every fifth wave (Sleep Pressure, Circadian Tide, Somnus in turn) and an extra boss joins every 25th. Call the next wave at any time, even while others are running: they stack, and calling early pays bonus O/I. Auto calls each wave once the last has finished spawning; the speed button runs the game at 1×, 2× or 3×.

Ten towers (Ink, Verse, Sigil, Comma, Echo, Cipher, Focus, Muse, Archive, Eraser) each have five levels, then mastery levels whose price grows by half each time, so there is always something to spend on. Each firing tower can aim at the first, last, toughest or closest creep. The Library sells upgrades for every tower. Creeps include swarms (melatonin), armor (galanin), splitters (theta into sleep spindles), self-healing (REM) and healers (glycine).

Seven maps, picked on the title screen once Tower defense is chosen: Coil, Spiral (longest lane, easiest), Zigzag (core on the bottom edge), Crossing (the lane crosses itself twice), Sprint (short lane, hard, starts with more O/I), Columns (lanes up and down the columns) and Arrow (one straight row, the hardest, starts with the most O/I). The board behind the title switches as you pick, and the game remembers the pick and the best wave on each map. Maps live in `td.maps` in `config.json`: each is a list of waypoints on the 9 by 9 grid, from the gate to the core, so new ones need no code.

Tower phrases (settings, Flash & pace) sets which shots carry a phrase: each tower's first shot, then every Nth. It starts at every 3rd; the other shots fly as plain sparks, which is calmer at 3× and lighter on the battery.

At level 5 every tower can take one of two paths, once, for three times its price: Ink becomes Torrent (faster) or Needle (harder, through armor), Verse Epic or Couplet, Sigil Glyphstorm or Brand (a burning blast), Comma Full Stop or Ellipsis (slows a group), Echo Resonance or Thunder, Cipher Wildfire or Inferno, Focus Lens (boss melter) or Wide Beam, Muse Choir or Tempo (neighbours fire faster), Archive Ledger or Scriptorium (kills pay more). Mastery levels go on after a path. At level 10 (★5) a tower with a path can take one of two Ascensions, for eight times its price: Ink Fountain Pen or Calligraphy, Verse Saga or Sonnet, Sigil Seal of Ages or Runeburst, Comma Semicolon or Caesura, Echo Chorus or Storm Bell, Cipher Cinder Script or Firestorm, Focus Sunlance or Prism, Muse Anthem or Allegro, Archive Treasury or Patronage, Eraser Oblivion or Expunge. They stack on the path. Each tower's panel shows the damage it has dealt and the creeps it has finished.

Muse and Eraser do not fire; each affects everything inside the circle drawn when it is selected, and that circle grows with its level (to 2.9 cells). A Muse makes towers in its circle deal more damage, the burns they leave included; selecting it marks the towers it boosts with gold corners, and selecting any other tower draws a line to each Muse boosting it. An Eraser makes creeps in its circle take more damage from everything (Redact: more still; Strike-through: they also lose half their armor); marked creeps wear a pink ring. Several Erasers do not stack: the strongest counts.

Max upgrades a tower as many levels as the O/I allows in one tap. A tower that has not fired yet, built since the last wave was called, sells back in full (the Sell button says Undo), so a mis-tap costs nothing. A boss on the board shows its life left at the start of the next-wave line. The Library's "This run" and the game-over screen show damage and kills by tower kind, sold towers included. Each map earns bronze, silver and gold stars for clearing waves 10, 25 and 50, per difficulty.

Two spells sit in the button row: Ink Storm strikes every creep on the board through armor (bosses take half), scaled to the wave, and Stillness slows them all for four seconds. Each carries a phrase across the board and then cools down (50 and 35 seconds of game time).

The header shows what the next wave brings, kind by kind, and its boss. Easy, Normal and Hard (picked under the maps) change creep life, starting O/I and lives; best waves are kept per map and difficulty.

The run saves itself on the device whenever a wave is called or cleared, when the app goes to the background, and when you quit to the title. The title screen then offers Continue (with the wave and map), so closing the app on a tablet no longer loses a long run; a new defense asks for a second tap before it replaces the save.

Keys on a keyboard: 1 to 9 and 0 build on the selected cell, N calls a wave, A toggles auto, F changes speed, U upgrades, M upgrades as far as the O/I goes, S sells, T changes targeting, Q casts Ink Storm, E casts Stillness, Space holds.

All of it is tuned in the `td` block of `config.json`.

## Android app

Every push that changes the game builds an APK on GitHub (the Android APK workflow). The newest one is the `apk-latest` release: open the [releases page](https://github.com/zizekalex-hash/a-td/releases/tag/apk-latest) on the phone, download `azshara-signal-defense.apk` and open it. Android installs it as an update of the app already there, keeping saved settings and progress. The title screen and the settings drawer show the build, such as `v1.0.15`, and Android shows the same number under App info.

Updates install in place because every build is numbered one higher and signed with the same key, `mobile/android/app/sideload.keystore` (password `android`). Keep that file: an APK signed with any other key has to replace the app by uninstalling it first. The key is for installing the app yourself; publishing to a store would need a private release key.

## Auto chess

An auto battler with chess pieces. Each round, buy pieces from a shop of five, set them on your half of an 8 by 8 board (the lower four rows), and press Fight: your pieces and the other side's then march and fight on their own. Pieces move their chess way: pawns march straight ahead (one that reaches the far row becomes a queen for the fight), knights jump in an L, bishops slide on the diagonals, rooks along ranks and files, the queen any way, the king one square at a time.

- Hits roll like RuneScape: the attacker's accuracy against the target's defence, then 1 to the max hit. Red splats are damage, blue 0 a miss, green healing, gold a shield. Life bars are green on red, with a blue mana bar under them.
- Attacks fill mana; a full bar casts the piece's ability: Fork (knight, two sure hits), Bless (bishop, heals the most hurt ally), Castle (rook, a shield), Decree (queen, hits the target and everything next to it) and Check (king, a heavy hit that stuns).
- Three copies of a piece at the same stars merge into one with a star more (★★, then ★★★). Alike pieces on the board light up traits: Phalanx (pawns), Cavalry (knights), Clergy (bishops), Ramparts (rooks), Regency (queens), Majesty (kings).
- Gold comes each round (5, plus 1 for every 10 you hold up to 5, plus 1 for a win). A new shop costs 2; 4 gold buys 4 XP. Your level is how many pieces the board takes, and higher levels bring dearer pieces to the shop. Free places on the board fill from the bench when the fight starts.
- Rounds never end and the other side grows each time, with a boss every fifth round. A lost round costs life: more each round, plus each enemy piece still standing. Long fights go into overtime, where every hit grows, so none stall.
- Attacks carry phrases from your text (Phrases on hits: the first attack and every Nth); abilities and promotions always do.

Tap a piece to see it and sell it; tap a square or bench slot to move it there, or drag it. Tap an enemy piece to read about it. Keys: 1 to 5 buy, G or Enter fights, D new shop, X buys XP, S sells, F changes speed, Space holds. All of it is tuned in the `chess` block of `config.json`: pieces, abilities, traits, shop odds, levels, income and how the other side grows.

## Narrator (bring your own model)

Ysera can voice game events (battle started, core hit, wave cleared, run over) with lines from any OpenAI-compatible chat API. The browser calls the model directly with `fetch`, so it works with a model on your own machine and in the offline Android build.

1. Start a server. LM Studio: load a model, start the local server on port 1234 and turn on CORS in its server settings. Ollama: base URL `http://localhost:11434/v1`, and set `OLLAMA_ORIGINS` to the page's origin (or `*`).
2. In the game, open Agents, check the base URL and model under Narrator, press Test, then switch it on. Or set `narrator.enabled`, `baseUrl` and `model` in `config.json`.
3. The system prompt, the event names the model sees, the cooldown between requests and the token cap are in the `narrator` block of `config.json`.

Only the event and a few numbers (wave, integrity, score) are sent, never the loaded text. Keep API keys out of `config.json`: it is bundled into the page, so a key there is readable by anyone who opens a deployed build. Enter keys in the in-game form instead, which keeps them in that browser only. A page served over https can reach `http://localhost`, but not a plain http address on another machine.

## Notes

- Sign-in and the database are off (see `.grok/app-env.json`), so no `.env` file is needed.
- The Agents panel (Scribe and Coach) calls `/api/agent`, which needs `ANTHROPIC_API_KEY` set on the server. Without it the route answers 503 and the panel says agents are not configured. The Android build has no server, so the panel is switched off there. The route is open to anyone who can reach the deployment; requests are limited per client address, best effort per running instance.
- `.grok/`, `AGENTS.md`, `scripts/grok-pwa-*` and `public/__grok/` are platform files from the Grok app-builder workspace. Keep the branding injector in place.
