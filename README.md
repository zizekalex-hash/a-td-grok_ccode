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

Esc (or the Menu button on a phone) opens the game menu, which holds the fight: Resume, Options, Controls, Tome, Restart, Quit to title. Options has tabs for Game, Display (frame-rate cap and counter, render resolution, interface size), Text, Sound (on/off and volume), Controls (every key and tap), Backup and Advanced. Option changes show at once, with the game running.

Advanced is the cfg: every number, switch and name in `config.json` as a searchable list (`td.startGold`, `chess.pieces.knight.maxHit`, ...). Edits are checked (a value that must be above 0 stays above 0, lists keep their length), saved on the device, and apply after a restart; ↺ puts one value back and Reset all puts back the shipped config. Export, Copy and Import move a cfg file (options and cfg changes together) between devices. If the game ever fails to start with your changes, the next start leaves them off and Advanced says so, so a bad value cannot lock you out.

## Backup: move everything to another phone

Options → Backup puts everything the game keeps on the device into one file: options, loaded texts, skills and best scores, advanced settings, the Court, Reps and their history, chess, tower defense (with a run in progress) and the narrator.

- **Save a backup:** in the app, Share file (Quick Share, Drive, a chat with yourself, ...) or Save to Documents; in a browser, Save file downloads `azshara-backup-YYYY-MM-DD.json`. Copy as text puts the same file on the clipboard.
- **Load a backup:** on the other phone, install the APK, open Options → Backup, then Load file (or Paste text). It shows the backup's date, size and what it holds, and asks yes or no. Yes replaces everything the game has on that device and restarts the game, which says "Backup loaded".
- A file that is not a backup of this game, or from a newer version, is turned away with a plain message and nothing changes.
- If you set a narrator API key, it is in the file too, so send it only to yourself.
- How it works: `src/game/backup.ts`. Loading is staged and applied at the next start, before anything reads a save, so nothing still running can write its old save over the backup.

## Court

A small world you walk around by tapping: tap the ground to walk there, a building or spot to walk to its door and open it, a queen to walk up and talk. Nothing to hold, so it suits a tablet.

Three regions, each its own map:

- The Realm: the Training Yard, Whispering Forest, Ember Mine, the Gilded Inn, Starlit Library, the Void, the Shadow Sanctum, the Shire, Azshara's Palace and the Moon Market.
- Moonshore Isles (the ferry on the Realm's east edge, open at total level 30): Kul Harbor, the Coral Grotto, Windrunner Spire and the Moon Temple, on sand among the waves.
- Ashen Peaks (the road on the Realm's west edge, open at total level 50): the Black Forge, the Blade Arena, Ember Springs and the Feast Hall, among lava.

The maps are drawn in detail, all in code so they work offline: cobbled streets in the Realm, boardwalks on the Isles and flagstones in the Peaks, grass that grows over the edges, shallows and foam along every shore, oaks, pines and palms, snow-capped and lava-seamed mountains, and a building for every place (a castle with towers and banners for the Palace, domes for the Library and Temple, striped stalls at the Market, a mine and a grotto in the rock, tall towers for the Spire and the Sanctum, a forge, an arena, hot springs, and timbered houses with lit windows). Water glints, lava breathes and bubbles, stars twinkle in the void, chimneys smoke, gates swirl, and each region has its own life: fireflies in the Realm, glitter and gulls on the Isles, embers and falling ash in the Peaks.

The Court lives: you walk it as a hooded wanderer with a cape in your style's colour, townsfolk stroll the streets (sailors on the Isles' boardwalks, smiths with lanterns in the Peaks) and boats sail off the Isles. Day turns to night by your device's clock: from dusk the map darkens and windows, doors and gates glow (court.night: on or off, and how dark). Every place's window opens with a banner of its scenery.

Walking to a gate takes you through it; the way home is always open. Each place trains two of 20 skills, one in the Fire style (the warrior's way: Strength, Woodcutting, Mining, Charisma, Lore, Magic, Stamina, Smithing, Archery, Cooking) and one in the Water style (the flowing way: Grace, Herbalism, Crystal-singing, Song, Serenity, Dream, Harmony, Fishing, Dance, Alchemy). Switch style at the top. Levels follow RuneScape's curve to 99.

To train, recite in rounds: a round is 3 phrases, each read 3 times (both changeable: − and + for passes while you play, phrases a round on the round's summary). A random phrase from your texts lights up one word at a time (0.9 s a word to start; − and + change it while you play) with the whole phrase shown below. When the words finish, the big button turns gold: tap it, or anywhere in the middle of the screen (or press Space), to complete the pass, and the next one starts at once. Nothing is ever missed: a pass waits for its tap. A tap while the words are still lighting up does nothing, so to read faster, lower the time per word. Every pass pays XP for each letter, each word and the pass itself, so longer phrases pay more; finishing a phrase adds a bonus, and a streak of passes multiplies the XP, up to double. Passes also pay gold, most at the Forest and the Mine. After the last phrase, the round is complete: see what it paid, then Continue for another round or Leave. XP drops float up the side, RuneScape-style. Phrases come like cards from a shuffled deck: every phrase of your loaded texts once, in random order, and none comes again until all have (then a new shuffled round begins, and the Court says so). The recite screen shows how far through you are ("57/340 of your texts"). It carries on across sessions and restarts; loading another text adds its phrases to the ones still to come, and a removed text's phrases leave the deck. Phrases are always whole sentences, never cut off mid-sentence; one shorter than court.minPhraseWords words is joined to the next. The lit word stays on one line and the whole phrase shrinks to fit the screen, so nothing is cut off; it is kept light so slow phones keep up (no glow, no per-word animation, the game behind updated 20 times a second while you recite; `court.word`). The current phrase also flashes, whole, in the middle of the screen: it fades in, holds and fades out again and again, as large as fits (court.flash: how often, how long, size and opacity; or off). The queen you recite for watches from a small portrait at the top with what she says. The pass bar fills by itself and the map is not redrawn behind the recite screen, so reading stays smooth.

Eleven queens. In the Realm: Eltharia at the Inn, Alexstrasza in the Shire, Ysera in the Void, Onyxia by the Mine, Azshara in her palace and her dark sister Xal'atath in the Shadow Sanctum (total level 90). On the Isles: Jaina at Kul Harbor, Tyrande at the Moon Temple and Sylvanas on Windrunner Spire. In the Peaks: Sinestra at the Black Forge and Valeera at the Blade Arena. Each loves one style, three skills and one gift. Most ask for levels before more than hello (Alexstrasza total level 30, Ysera Serenity 5, Onyxia Strength 10, Azshara total level 70, Jaina Fishing 5, Tyrande Dance 10, Sylvanas Archery 15, Sinestra Smithing 10, Valeera total level 80). The Queens list groups them by region; Go walks you to any of them, through the gates if she is in another region. Recite where a queen can see you and she grows fonder (more in her style, on a streak), and you get +25% XP for the audience; level a skill she loves and she is thrilled; gifts from the Moon Market help, her favourite double. Affection goes Stranger, Noticed, Curious, Fond, Smitten, Devoted; from Curious on she will go on a date: a set of phrases with triple affection and extra XP. The Elixir of Focus doubles XP for 20 passes. Charm her tries one of your best lines.

The queens feel things. Each has nine moods, shown on her face and in the air around her: aloof, smiling, delighted (laughing), blushing (looking away, flustered), smitten (heart catchlights, petals), adoring (eyes closed in bliss, hearts), jealous (a pout under a storm), longing (a tear in the rain) and fierce (a burning look in a flare). Her tier sets her everyday mood, and moments change it for a while: her favourite gift, a skill she loves levelling, her wish granted, a streak of 8 while she watches. She misses you: come back after 12 hours away and she says so, teary, with a reunion bonus. She gets jealous: give a gift to or date another queen in her region (or her rival anywhere) once she is Curious or more, and she pouts, says so, and gives half the affection for reciting until you make up (a gift, or whole phrases recited for her). Every day each queen wishes for 15 passes of one of her skills (a gold "!" over her on the map until it is granted; any place that trains it counts) and pays affection and gold when you grant it. She remembers the passes you recite for her and tells you at 50, 200, 500, 1000 and 2500. Every mood you see goes into the Gallery (in the Queens list): 99 portraits to collect, each new one worth gold; locked ones say how to see them. Large portraits move: she blinks and breathes, hearts float and rain falls (still for anyone who asks for less motion). They move cheaply: the pictures themselves stay still and only fades and a gentle scale animate, and the map paints each portrait once at the size it is drawn. She wears more as she falls for you: more gems, a second necklace, glints in her hair, and a golden halo when Devoted.

Each queen stands in her own place's scenery (Azshara's moonlit palace windows, Eltharia's lanterns and bottles, Jaina's harbor with ships, Tyrande's temple moon, Sylvanas's spire, Sinestra's forge, Valeera's arena, Xal'atath's tendrils and watching eye, and so on), wears her own outfit (a regal fan collar, a laced corset, dragon scales, a priestess robe, a naval coat, armour, ranger leathers, a void gown) and has something in her hair (flowers, pearls, feathers, a leafy vine, fine chains or beads): look.outfit and look.adorn in config.json.

The Court talks. Notices about the queens (who saw you with whom, a good word from a sister, a wish granted, a new tier, a new portrait, a memory) stay on screen for 8 seconds as cards with her portrait; tap one to see her, or to dismiss it while reciting. Everything said is kept in News & rumors (the newspaper button at the top, with a count of what is new). While you walk the map the town gossips every 40 seconds or so: who loves what, who wishes for what today, who misses you, who is jealous, which sisters talked about you all night, which rivals are not speaking, what people say about you. Every day one queen is the talk of the town (🔥): everything you do for her counts ×1.5 ♥ until midnight. The queens have bonds. Azshara and Xal'atath are sisters, and so are Alexstrasza and Ysera; Jaina and Tyrande, Eltharia and Valeera, Onyxia and Sinestra are friends; Azshara and Tyrande, Alexstrasza and Onyxia, Jaina and Sylvanas, Sylvanas and Tyrande, Ysera and Xal'atath, Valeera and Sinestra are rivals. Sisters and friends never grow jealous of each other: court one, and the others who know you put in a good word (+6 ♥). Rivals grow jealous wherever they are. Charm a queen and she may talk about her sister, friend or rival instead. Her sheet shows your story (together since, dates, gifts, what the town says about her) and her bonds; tap one to go to her. All of it is tuned in court.news: how long notices stay, how often the town talks, the bonus, the bonds and every line.

The queens come to find you. While you walk the map, a queen who knows you may leave her place (an empty ring marks where she stood) and walk to you: warmer queens come more often, and so does the talk of the town, a lonely queen and an upset one. When she finds you she says so: how many hours she counted if she missed you, what she thinks of her rival if she is jealous, or simply that she wanted to see you. She stands beside you, follows you for a few minutes and watches you recite wherever you go (with the XP bonus for her audience). Then she goes home: happy if you talked to her, gave her a gift or recited while she was there, hurt if you ignored her. Sisters, friends and rivals who meet on the way react to each other. Feelings last real minutes and show on her face, her sheet and the Queens list: lonely, looking for you, with you (×1.25 ♥), happy, hurt (×0.75 ♥ for 90 minutes, and she won't come to you), upset and softened. Tuned in court.presence and court.hearts.arcs.

The queens are drawn in a dark fantasy style: each stands in a night scene lit from behind in her colour, with a glowing rune circle round her head, wild flowing hair with light in it, rim-lit skin, glowing eyes, a spiked golden crown for Azshara and golden chains with gems. court.portraits.style switches back to the earlier, brighter look ("classic"). The portraits keep their glamorous drawn look, with soft candlelit skin, full glossy lips and gently waving hair with soft shadows and a shine band.

Every queen has her own portrait, drawn in code from her look in `config.json` (skin, hair, sheen and style, eyes with winged liner and eyeshadow, lipstick, elf or round ears, dragon horns, a crown, void crown, tiara, circlet or hood, earrings, gown and colours), so it works offline: on the map, in her window (washed in her colour; tap her portrait there or in the Queens list to see it full screen), beside her lines, large on the recite screen while she watches (glowing brighter with your streak), and on the title. With a model connected in the Narrator settings, the queens answer level-ups, gifts and dates in their own words; without one they use their scripted lines. Everything is tuned in the `court` block of `config.json`, the map included. The Court is separate from the other modes.

### How the queens talk

Every queen speaks in her own voice, put together from pieces so she rarely says the same thing twice (`src/game/court/voices.ts`, `speech.ts`): her lines from config.json, often with one of her own openers before them and endings after (warm ones once she is fond of you, tier 3 and up), what she calls you, the things on her mind, and real details: your best skill and level, your total level, where you are, the time of day, her favourite gift, her sisters, friends and rivals, and one of your Reps phrases. That is over a hundred times as many lines as before for every queen and moment, and she does not repeat a line she said lately.

- **Conversations:** tap Charm her again within five minutes and you talk: you ask about something (her day, herself, you, her sister, a friend, a rival, her place, gifts, dreams, a phrase you practise, a compliment, or anything) and she answers in her own words, a new topic each time.
- **Queens in groups:** when a queen comes out, her sister or friend (one who knows you, from any region: Xal'atath with Azshara, Sinestra with Onyxia, ...) often comes along, and they follow you together. Two queens with you talk to each other now and then (sisters and friends warmly, rivals bickering; two rivals with you at once grow jealous, and the Court notices). Reciting with two queens with you, the second watches too: she grows fond of you and each pass pays a little more XP. One set of reps feeds every hungry queen with you. On some days a sister or friend pair share one wish (an alliance, shown on their sheets): granting it delights both, with extra affection. `court.presence.group`, `court.hearts.allianceChance`.
- **Nothing is missed:** when several queens speak at once, their lines take turns, each up long enough to read; notices wait for room on screen instead of pushing each other off; and time spent reciting or on a rep set does not count against queens waiting with you.
- **Prayer:** a timed set for a queen. Sometimes she asks for a prayer instead of feeding ("Pray 3 min of “xyz”, repeating it nonstop"), and her sheet always has **Feed her** (a set of reps) and **Pray for her** (a timed set), marked ★ when it is what she is asking for. Unasked, they please her half as much, up to 3 times a day each (`court.presence.feed`: prayChance, prayMinutes, unaskedMult, perDay). The bonus set after a round follows the drill's choice: reps, or a timer.
- **Feeding:** a queen who has found you and walks with you gets hungry after a while (`court.presence.feed`) and asks to be fed: a set of reps (the Reps set size) of one of your Reps phrases. Feed her opens the rest screen; Done counts the set in Reps and gives her affection, delights her and keeps her with you longer. A Court bonus set she watches feeds her too. Later hides her ask for a while; she waits about four minutes (talking to her makes her wait again), then goes home hungry and hurt. With nothing in Reps, she tells you where to add phrases.

### The talk pack: the queens' words, in files anyone can fill

All the Court's words live in `src/game/court/talk/`: one JSON file per queen (her voice: openers, endings, warm endings, pet names, things on her mind, small talk, feeding lines; and her lines for every moment) and `shared.json` (conversation topics, your pick-up lines, what queens say when they find you or leave, what the Court notices, rumors, talk about sisters, friends and rivals). A list there replaces the same list in config.json. To make them richer with another AI, follow GROK_TALK.md: it holds the prompt, the rules and every allowed {placeholder}. Pasted-back files are checked by `npm run talk:check` (keys, placeholders, repeats, length) before they ship.

`scripts/grok-bundle.sh [dir]` writes, from the last commit, the whole app as one readable text file (azshara-source.txt) and the talk pack with its prompt as a zip, to hand to another AI for review; never the Android signing files, CI or saves.

### Bonus set after every round

When a round of reciting is complete (3 phrases of 3 passes, or what you set), the round's summary offers a bonus (+1): a set of reps of a word or phrase from Recitation drill → Reps, picked at random from those of up to 9 words (Shuffle picks another). Its size is the set size picked in Reps (100 by default).

- Start opens the rest screen (see Reps): black, the phrase in raw binary behind the stopwatch, and the Court stops drawing meanwhile. Done opens after a second a rep.
- Done counts the set in Reps, exactly as one done there: total, time, history and Recitation XP. A set already going in Reps is offered to go on with instead.
- Here it pays as that many passes of the phrase in the round's skill, with gold, plus affection to a queen who watches.
- Continue skips it. With nothing in Reps, the summary says where to add phrases.
- Behind the recite screen, the current phrase stands in raw binary too (36%, 3 to 9 px, 1.89 px if a phrase is too long for that; `court.wall`).
- Tuning: `court.bonus` (on or off, words at most, XP and gold multipliers, affection).

## Your texts

Load .txt (title screen, tome, Options → Text) takes one file or several at once. Several are read in turn, in name order (1, 2, 3 ... 10): the shots carry phrases from text 1 until it has been read through, then text 2 takes over, and after the last, text 1 comes back. The field, the binary rain and the core show the text in use. Two sliders in Options → Game set the timing: Pause between phrases (the least time between two phrases on shots, 300 ms to start) and Pause between texts (a break after a text has been read through, before the next one, or the same one again, starts; 2 s to start). Shots inside a pause fly plain; spells always carry a phrase. Loading adds to what is loaded, from any folder and as often as you like: the texts already there stay until you take one out with its ✕ (a text already loaded is not added twice; a different one with a taken name gets a number, "notes (2)"). Pasted text is added the same way. The text in use stays in use. The tome and Options → Text list the loaded texts (one or more): tap one to switch to it now, Next for the next, ✕ to drop one. Up to 30 texts stay on the device between visits.

## Rehearse (a tap a phrase)

Recitation drill → Rehearse: your phrases, one tap a rep of the **whole phrase** (a word is a phrase of one). Write them (one a line), **Import .txt**, or **Add the loaded text's phrases**; each is kept with its own count. Tap the big area showing the phrase (its height is a setting) for a rep; ‹ › or a tap on the list picks another. Each phrase in the list has **↺** (its count back to 0, the phrase stays) and 🗑 (tap twice to take it off); **Reset all counts** and **Remove all phrases** ask with a second tap. Each rep gives Recitation XP for its words.

A tap also **sounds the phrase** and **shows it**, for as long as it is pressed (a quick tap is a flash of about 0.1 s; hold it for 1, 2 or 3 s and it stays that long), or, set so, at least the whole length. **Hold to test** does the same without a rep.

- **The sound** is the phrase's own UTF-8 bytes as raw 8-bit samples (8,000 a second), centred, fitted to the **length** (0.9 s): a phrase shorter than that repeats until it fills it (89 bytes last 11 ms: about 81 times), a longer one is sped up, pitch and pace together like tape. Then the whole wave is raised so its loudest point is the **peak loudness** (0.9), each phrase sounding its own way. It loops while held. Sound can be turned off.
- **The picture** is the phrase's bytes in the Read tab's three layers (RGB, Gray, Bits), each at 0.36 and blended so none hides another, over the whole screen; each layer and the whole picture have their own opacity.

Every number is set in the tab (⚙ Sound and picture), with − and + or typed exactly.

## Read (a whole text, phrase by phrase)

Recitation drill → Read: your texts are kept in the app (the same ones the game reads; Load .txt adds more, ✕ takes one out after asking), each with your place in it. **Load .zip (a folder)** takes a .zip of .txt files and keeps them as a **folder of their own**, named after the zip, apart from the texts loaded one by one (the games read only those): it folds open and shut, shows how many of its texts are checked, and its ✕ takes the whole folder out (after asking; your other texts stay). Its texts read, check, edit and export like any other, with their own place and check (two folders may hold texts of the same name), and a checked one is saved under Documents/confirmed_txt/<folder>/. Subfolders in the zip stay in the names (deep/spindles); pictures, other files and macOS litter are skipped; loading the same zip again adds only what is new. Up to 300 texts in all the folders. Tap one to read it from where you left off, phrase by phrase in order ("Phrase 12 / 340 · pass 2 / 3 · 3.2%", with the text's name at the top), like the Court's recite screen: only the big word in the middle (no bar), the whole phrase below lighting up word by word. Texts are kept whole, up to 2,000 lines.

- After a pass, tap the middle or Complete ✓ to go on; with **Auto** on it goes on by itself. Each pass gives Recitation XP.
- Everything changes right on the screen and is kept: seconds a word (0.9 by default), playback speed (× on top of it, 0.25× to 4×), passes per phrase, big word size, phrase size, fps (the most redraws a second, 1 to 60: lower saves battery; the screen only redraws when the next word is due anyway), font (Display, Plain, Mono), Auto. Back, Hold and Skip move through the phrases; "Fold the controls away" leaves only those.
- The settings sit in a black panel (purple by default) with four tabs, and fold away to just Back, Hold, Edit and Skip. **Tap any number to type it exactly** (0.369, or 0,369; Enter sets it); + and − still step.
  - **Play**: seconds a word, speed, passes, fps, Auto, .txt, and the **silences** (with Auto): seconds after each pass and after each phrase (0.4 to start; e.g. 0.369 and 0.999). The words stay on the screen while it waits.
  - **Look**: big word size, phrase size, **chars a line** (the phrase wraps between words at that many characters; 45 to start), panel opacity (down to 0.1, see-through), colour (purple, cyan, gold, pink, white, green, red), font, and **Locked / Drag, then lock**: unlock, drag the big word and the phrase wherever you like, lock again. **Keep centred** (on to start) keeps both in the middle across, so a drag moves them only up or down; with it off they go anywhere, and **↔ Center** puts them back in the middle across. Reset places puts them back where they started. Places are kept in the room between the header and the panel (the word stands just above its spot, the phrase hangs just below its own), so the words are never under the panel, and a longer phrase grows downwards. On Android: **Mini window now** and **Mini on leaving** (below).
  - **Bytes**: the whole text as a picture behind everything, its raw bytes as pixels in three layers: RGB (three bytes a pixel), Gray (one) and Bits (one bit a pixel, black or white), each at its own opacity (0.33 each to start; 0 leaves one out). They blend so light adds up and none hides another, and **all bytes** sets the opacity over all of them (0.12 to start). Sharp or smooth; **.png** saves the picture as the background shows it, at the screen's size. Drawn once into one still picture, so it costs nothing while you read.
  - **Flash**: every 9.9 s the whole text flashes for 9.9 ms (at least one frame), at 9 px and 0.09 opacity, a screen at a time: each screen holds as many whole phrases as fit (never one cut in two), the next flash shows the next screen, through the whole text and round again. Its **colour** (white, purple, cyan, gold, pink, green, red), **chars a line** (0: the whole width; e.g. 60: a column in the middle, less for the eyes to travel), **Clear of the panel** (on: it flashes only between the header and the panel while they show, and the screens are counted again to fit), **Order** (in order, or random: the phrases shuffled again for each round) and **Reverse** (off, phrases, words, letters: after each forward round, a reversed one: the phrases in reverse order, the text word by word backwards, or letter by letter, "abc" as "cba"; then forward again). Every one of those numbers has its own + and −. It pauses with Hold and Edit. **Test once (as set)** flashes the next screen now, exactly as set; **Test slow** shows it for 1.5 s, clearly, to see how a screen looks (both work with the flash off).
- **Words a hit** (Play): the big word shows 1 to 5 words at a time (each hit lasts the seconds set; the phrase lights them together).
- **Stream** (its own tab): a second, fast word looper over the whole text, subliminal, beside the big word: from the phrase you are reading on and round the whole text again and again, a hit every 60 ms to start (1 to 5 words a hit), in 1 to 12 copies in each place switched on (any together): **above** the word, **below** the phrase, and the **sides** (a column on the left and one on the right), **stacked** or **in a row**, with its own **spacing**; **In order** (from the phrase you read on) or **Random** (the phrases shuffled, each once, then shuffled again, so it does not mirror the big word), at its own size, opacity (0.3) and colour. Every number has + and − and can be typed. It pauses with Hold and Edit, and it is written straight into the page, so a fast stream stays light.
- **Hide all** (the crossed eye at the top) leaves only the words (and the bytes and the flash); the faint eye in the corner brings the rest back. A tap still goes on after a pass.
- **Mini window** (the small window button at the top, Android 8 and up): the reading goes on in a small window over other apps, which you can move and resize (picture in picture); it shows only the words, sized to the window. **Mini on leaving** (Look) does it by itself when you go Home while reading. Split screen and pop-up windows work too, and a small window shows only the words.
- **Checked texts**: once a text is read through and written right, **Checked: save to confirmed_txt** (on the finished screen, or the ✓ on its row in the list) marks it checked and saves it, once, into the phone's **Documents/confirmed_txt** folder (made if it is not there; in a browser, a download named confirmed_txt_name.txt). The list shows each text as ✓ Checked (with the day), Not checked yet, or Changed since checked (edited after: read it again), and how many are checked. The ✓ on a checked row unchecks it.
- **Edit** holds the reading and opens the phrase: rewrite it and Save, and the text itself is fixed (kept in the app, in the game, and in the backup); your place stays.
- **⬇ Export** (in the list) and **.txt** (while reading) save the text as a .txt: a download in a browser, the share sheet on Android (Save to Files, Drive, send to a computer).
- Reaching the end puts "Finished “text” · 340 phrases · time" in the History, and the text starts from the top next time; leaving midway puts "Read “text” · N phrases" there. The game behind rests while you read.
- Defaults: `reader` in config.json.

## Reps

Recitation drill (on the title screen), tab Reps: count reps of your own words and phrases.

- **Alarm** (on to start): when a timed set's timer is up, the phrase itself sounds, made the way Rehearse sounds a phrase: its raw bytes as a wave, at Rehearse's length (0.9 s) and **peak loudness** (0.9; both set in the Rehearse tab), three times with a short gap. In the Android app it is set with the **phone's own alarm clock**, so it rings on time with the screen off, the phone asleep or the app in the background, on the **alarm sound** (it plays in silent mode and whatever the media volume), with a buzz. How loud is the **Alarm volume** (0.36 = 36% to start; − + or typed): while it rings the phone's alarm volume goes to full (put back after) and the sound plays at that share of it, so 0.09 and 0.36 sound as different as they should (the phone's own volume has only a few steps, and some phones ignore an app setting it). **Test** plays it now as it will ring, and says how it rang ("the phone's alarm volume at full (7/7) while it rang, back to 3/7 after; the sound at 36% of that", or that the phone would not let it raise the volume, e.g. in Do Not Disturb). Elsewhere (a browser) the page plays it, at that share of the media volume. Tuned in `reps.alarm`.
- **Clear history** (History) also puts every total in Reps back to 0, so the two always agree; your words and phrases stay.

- **Add or paste:**
  - Write a word or phrase and tap Add (or Enter).
  - **Paste** pastes what you copied (from a file, a note, anywhere): one line goes into the box to add, several lines open the picker below with each line as one phrase. A long-press in the box pastes too.
  - The phrases stay in the list. Each line shows its reps and time, like "100 xyz · 5:33" (or "0 xyz · 0:00" after a reset).
- **From a text:** Load .txt (or Loaded texts, for texts already in the game) splits a text into its phrases (sentences and lines, list marks taken off, each phrase once).
  - Tick the ones you want, or Pick all new, then Add.
  - Only the added phrases are kept, not the text.
  - Phrases already on your list show their reps and time and cannot be added twice. Ones done before (in the history) say so. Load the same text again to see what is already taken.
- **A set is:** **Reps** (a number of reps: pick 10, 50 or 100, or type any number), **Timer** (a time, 1 to 9 minutes or typed: repeat it nonstop until the time is up; a long buzz, then Done adds the time) or **Both**: the two one after the other, never at once: first the reps (Done opens after a second a rep; tap "Reps done: on to the timer"), then the timer (repeat nonstop until it is up), then Done adds the reps and the time of both parts. "Timer first, then reps" turns the order round. Timed sets show ⏱ in the History, and a timer's XP counts the reps it is reckoned at (2 s a rep; `reps.timer`).
- **Start sets on a blank screen:** every set opens all black (tap to see the clock and Done).
- **A set:** tap a phrase (or its play button) and recite it that many times.
  - **Done, and again** (next to Blank screen) counts the set and starts another of the same phrase and size at once, without going back to the list.
  - **Blank the screen** on the rest screen turns it pure black (pixels off on most phones): nothing drawn, nothing updating, until you tap anywhere; a buzz when Done opens. No need to cover it with the notification shade.
  - The set has its own rest screen, over everything: black, with the word or phrase standing behind in raw binary (its letters as bytes of 0s and 1s, at 36%, 3 to 9 px, whole copies spread evenly so nothing is cut off; `reps.wall`). Nothing moves while it shows: every game below stops drawing until the set ends, to spare the battery while you recite from memory.
  - A stopwatch runs from the start of the set. Done opens after at least a second a rep (100 reps: 1:40), and nothing counts on screen meanwhile.
  - The time runs by the clock, so the screen can be off. A set in progress is still there if the app is closed and opened again.
  - Then one tap of Done adds the whole set to the total, with its time: "Completed 100 xyz in 5:33 (333 s)".
  - Totals add up: 100 in 5:33, then 200 in 10:00 after another set. The list shows each phrase's reps, time, sets, seconds a rep and last set, and the time for all of them.
  - Another starts the next set at once. Cancel asks first and adds nothing.
- **Reset all to 0:** asks yes or no first, sets every count and time back to 0 and keeps the words and phrases (for a fresh start after sleep).
- **History** (the tab next to Reps) shows everything:
  - **Totals:** today, since the last reset and all time, in reps and time.
  - **Every word and phrase:** all time, with its reps, time, sets and seconds a rep.
  - **Every set, by day:** "08:21 100 xyz · 5:33", with each day's total and resets marked (with what they cleared).
  - Resets in Reps do not clear the history. Clear history does, after asking yes or no, and leaves the totals in Reps.
  - It keeps the last 3000 sets and resets (`reps.historyKeep`).
- **In the Court:** after every round of reciting, a bonus set (+1) of one of your phrases (see Court).
- **Saving and XP:** everything is saved on the device. Each finished set gives Recitation XP.
- **Tuning:** `reps` in config.json (`secondsPerRep` is the least time per rep).

## Tuning

Game parameters live in `src/game/config.json`: starting settings and slider ranges, the binary rain, wave and spawn rates for every mode, enemy stats, the core-level bonus from the recitation drill, the default text, and the narrator. Edit values there rather than in the code, then run `npm test`; `src/game/config.test.ts` catches out-of-range or missing values. Changes ship with the next build.

## Tower defense

Waves never end. Each one is bigger and tougher: hit points grow faster than linearly, creeps speed up and gain armor from wave 20, a boss closes every fifth wave (Sleep Pressure, Circadian Tide, Somnus in turn) and an extra boss joins every 25th. Call the next wave at any time, even while others are running: they stack, and calling early pays bonus O/I. Auto calls each wave once the last has finished spawning; the speed button runs the game at 1×, 2× or 3×.

Ten towers (Ink, Verse, Sigil, Comma, Echo, Cipher, Focus, Muse, Archive, Eraser) each have five levels, then mastery levels whose price grows by half each time, so there is always something to spend on. Each firing tower can aim at the first, last, toughest or closest creep. The Library sells upgrades for every tower. Creeps include swarms (melatonin), armor (galanin), splitters (theta into sleep spindles), self-healing (REM) and healers (glycine).

Nine maps, picked on the title screen once Tower defense is chosen: Coil, Spiral (longest lane, easiest), Zigzag (core on the bottom edge), Crossing (the lane crosses itself twice), Sprint (short lane, hard, starts with more O/I), Columns (lanes up and down the columns), Arrow (one straight row, the hardest, starts with the most O/I), and two with **two lanes**: Two Gates (from opposite corners into the core in the middle) and Pincer (down both sides). On a two-lane map each gate is marked, and the creeps of a wave take the lanes in turn (splits and summons stay on their parent's lane); a map's `lanes` in `td.maps` lists them. The board behind the title switches as you pick, and the game remembers the pick and the best wave on each map. Maps live in `td.maps` in `config.json`: each is a list of waypoints on the 9 by 9 grid, from the gate to the core, so new ones need no code.

Tower phrases (settings, Flash & pace) sets which shots carry a phrase: each tower's first shot, then every Nth. It starts at every 3rd; the other shots fly as plain sparks, which is calmer at 3× and lighter on the battery.

At level 5 every tower can take one of two paths, once, for three times its price: Ink becomes Torrent (faster) or Needle (harder, through armor), Verse Epic or Couplet, Sigil Glyphstorm or Brand (a burning blast), Comma Full Stop or Ellipsis (slows a group), Echo Resonance or Thunder, Cipher Wildfire or Inferno, Focus Lens (boss melter) or Wide Beam, Muse Choir or Tempo (neighbours fire faster), Archive Ledger or Scriptorium (kills pay more). Mastery levels go on after a path. At level 10 (★5) a tower with a path can take one of two Ascensions, for eight times its price: Ink Fountain Pen or Calligraphy, Verse Saga or Sonnet, Sigil Seal of Ages or Runeburst, Comma Semicolon or Caesura, Echo Chorus or Storm Bell, Cipher Cinder Script or Firestorm, Focus Sunlance or Prism, Muse Anthem or Allegro, Archive Treasury or Patronage, Eraser Oblivion or Expunge. They stack on the path. Each tower's panel shows the damage it has dealt and the creeps it has finished.

Muse and Eraser do not fire; each affects everything inside the circle drawn when it is selected, and that circle grows with its level (to 2.9 cells). A Muse makes towers in its circle deal more damage, the burns they leave included; selecting it marks the towers it boosts with gold corners, and selecting any other tower draws a line to each Muse boosting it. An Eraser makes creeps in its circle take more damage from everything (Redact: more still; Strike-through: they also lose half their armor); marked creeps wear a pink ring. Several Erasers do not stack: the strongest counts.

Max upgrades a tower as many levels as the O/I allows in one tap. A tower that has not fired yet, built since the last wave was called, sells back in full (the Sell button says Undo), so a mis-tap costs nothing. A boss on the board shows its life left at the start of the next-wave line. The Library's "This run" and the game-over screen show damage and kills by tower kind, sold towers included. Each map earns bronze, silver and gold stars for clearing waves 10, 25 and 50, per difficulty.

Two spells sit in the button row: Ink Storm strikes every creep on the board through armor (bosses take half), scaled to the wave, and Stillness slows them all for four seconds. Each carries a phrase across the board and then cools down (50 and 35 seconds of game time).

The header shows what the next wave brings, kind by kind, and its boss. Easy, Normal and Hard (picked under the maps) change creep life, starting O/I and lives; best waves are kept per map and difficulty.

The run saves itself on the device whenever a wave is called or cleared, when the app goes to the background, and when you quit to the title. The title screen then offers Continue (with the wave and map), so closing the app on a tablet no longer loses a long run; a new defense asks for a second tap before it replaces the save.

### The void: reps into flux

A second currency, **flux** (◆, next to the O/I at the top), comes only from reps. Tap ◆ to open the **rep window**: pick one of your Reps phrases (‹ ›) and a **batch** (×1, ×10, ×20 or ×30 reps a tap), say them, tap **Rep ✓**. A batch counts only once its time has passed since the last tap that counted: 0.9 s a rep, so ×10 opens after 9 s and pays **100 flux** in one tap (the bar fills under the button; a tap sooner does nothing, and the game checks by the clock, so no fast-tapping or fast-forward makes more). Each rep pays **10 flux**, and **+1 more for every 10 reps done in the run**: the first set of 10 pays 100, the next 110, then 120, and on (each rep at its own step, so a ×30 from the start pays 330). Upgrades multiply it on top. The window shows what a rep pays now and how many reps until it goes up. The reps go into the Recitation drill too: the phrase's total and a set in the History (written every 100 reps, when the window closes, and when the run ends). If Reps has no phrase yet, the window offers the loaded text's first line. A natural time for it: once the defense is built and waves are still coming.

The rep controls are yours to arrange, and stay as set on the device:

- **The window** drags anywhere by its top bar, folds to that bar (−, which keeps a small Rep button), and has its own **size** and **opacity** (⚙), so the board shows through it.
- **The round tap buttons** stay in game even with the window closed: one at each side to start, so either thumb reaches one. Both tap the same batch under the same clock. Drag either where your thumbs rest (⚙ → Move them) and the other mirrors it; turn off the twin for a single button (then Left side / Right side puts it there). They share a size and opacity. Its ring fills as the batch's time passes and turns gold when it is ready. The phrase being repped shows under it (9 px to start; ⚙ → Phrase size, or turn it off), kept to the button's side of the screen.
- **On the board** (⚙, off to start): tapping the **core** counts the batch, and so can tapping **beside the board** (off its cells). The key **R** does too. Every way taps the same batch for the same phrase, under the same clock.

Flux buys the **void set**, ten more towers, one for each (built, upgraded, specialized and refunded in flux, never O/I; the build menu's Void tab), drawn as black orbs in a glowing ring:

- **Tachyon** (rapid, pierces), **Railgun** (sniper across the board, through all armor), **Antimatter** (wide blast; its Cascade Ascension makes what it hits collapse at 8% life), **Graviton** (gravity well: slows everything near the impact), **Entangler** (quantum strike jumping to four more), **Plasma** (splash that burns through armor), **Quasar** (a beam that ramps faster and higher than Focus).
- **Wormhole** (does not fire: towers in its circle deal 25% more damage and fire 10% faster), **Reactor** (does not fire: pays 30 flux every time a wave clears, +15 a level), **Singularity** (a black hole: creeps in its circle take 25% more damage, lose half their armor, and any but bosses at 10% life or less collapse into it).
- Each has two paths and two Ascensions, like the others.

The Library's **void** section, flux only: **Resonance** (+20% flux a rep), **Dark energy** (+12% damage for void towers), **Event horizon** (+0.15 range for void towers), **Rep tithe** (+6 O/I a rep too). And **Summon a Rift Titan** for O/I (250, +25 a wave called): a void boss walks the lane; slay it for flux (60, +12 a wave) and +5% flux a rep for the rest of the run (up to +100%); if it reaches the core it costs 3 lives. All of it is tuned in `td.void`.

Keys on a keyboard: 1 to 9 and 0 build on the selected cell, N calls a wave, A toggles auto, F changes speed, U upgrades, M upgrades as far as the O/I goes, S sells, T changes targeting, Q casts Ink Storm, E casts Stillness, Space holds.

All of it is tuned in the `td` block of `config.json`.

## Android app

Every push that changes the game builds an APK on GitHub (the Android APK workflow). The newest one is the `apk-latest` release: open the [releases page](https://github.com/zizekalex-hash/a-td/releases/tag/apk-latest) on the phone, download `azshara-signal-defense.apk` and open it. Android installs it as an update of the app already there, keeping saved settings and progress. The title screen and the settings drawer show the build, such as `v1.0.15`, and Android shows the same number under App info.

Updates install in place because every build is numbered one higher and signed with the same key, `mobile/android/app/sideload.keystore` (its password is in the APK workflow). Keep that file: an APK signed with any other key has to replace the app by uninstalling it first. The key is for installing the app yourself; publishing to a store would need a private release key.

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
