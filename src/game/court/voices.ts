/**
 * How each queen talks, in pieces that combine (see speech.ts): words she
 * opens with and ends on, what she calls you, the things on her mind, her own
 * small talk, and what she says when she wants feeding (a set of reps of one of
 * your phrases) or has been fed. Shared conversation topics come at the end:
 * what you ask, and answers any queen gives in her own words.
 *
 * Placeholders: {pet} what she calls you, {thing} something on her mind,
 * {place} her place, {region} where you are, {skill} and {level} your best
 * skill, {total} your total level, {gift} her favourite gift (as said: "a sea pearl"), {time} the time
 * of day, {sister} {friend} {foe} queens she is close to or not, {phrase} one of
 * your Reps phrases, {count} reps, {passes} passes you recited for her. A line
 * whose placeholder cannot be filled is not used. No path aliases (tests).
 */
import type { QueenKey } from "./rules.ts";

export interface Voice {
  /** Short words before a line. */
  open: string[];
  /** Short sentences after a line. */
  close: string[];
  /** Endings for when she is fond of you (tier 3 and up). */
  warm: string[];
  /** What she calls you. */
  pet: string[];
  /** What is on her mind, for {thing}. */
  things: string[];
  /** Her own small talk. */
  talk: string[];
  /** Asking to be fed: {count} reps of “{phrase}”. */
  feed: string[];
  /** Fed. */
  fed: string[];
  /** Going home unfed. */
  hungry: string[];
}

export const VOICES: Record<QueenKey, Voice> = {
  eltharia: {
    open: [
      "Oh!",
      "There you are!",
      "Hello, hello.",
      "Mm, hi.",
      "Sit, sit.",
      "Look at you.",
      "Ah, sweetheart.",
      "Hey, you.",
    ],
    close: [
      "I saved you a seat by the fire.",
      "The kettle's on, by the way.",
      "I'm so proud of you, you know.",
      "Don't forget to eat something.",
      "You're doing wonderfully.",
      "Come back soon, all right?",
      "I mean it, truly.",
      "Now, where were we?",
    ],
    warm: [
      "You make this whole inn feel warmer.",
      "I keep the window lit for you.",
      "My favourite part of the day is you.",
      "Stay a little longer? For me?",
    ],
    pet: ["sweetheart", "my dear", "sunshine", "honey", "love"],
    things: [
      "the hearth",
      "fresh bread",
      "the mead barrels",
      "the lantern by the door",
      "a warm blanket",
    ],
    talk: [
      "The regulars were asking about you {time}. I told them you're working hard.",
      "I baked something with honey in it. It's yours if you finish another round.",
      "{friend} came by the inn. We talked about you. Only good things, {pet}.",
      "Your {skill} is at {level}! I wrote it on the slate behind the bar.",
      "Some nights it's just me, {thing} and the quiet. Then you walk in.",
      "I hum while I polish the mugs. Lately it's been your phrases.",
      "Rest your feet. {total} levels deserve a soft chair.",
      "If anyone gives you trouble in {region}, you send them to me.",
    ],
    feed: [
      "I'm famished, {pet}. Feed me {count} of “{phrase}”? Like a good warm meal.",
      "Would you say “{phrase}” for me, {count} times? It fills me up better than stew.",
      "My tummy's rumbling for words. {count} × “{phrase}”, please?",
      "Sit down and feed me, sweetheart: {count} of “{phrase}”, nice and slow.",
    ],
    fed: [
      "Oh, that was lovely. I'm full of you now.",
      "Mm. Best meal I've had all week.",
      "You fed me so well. I feel all glowy.",
      "Thank you, love. I'll keep those words warm.",
    ],
    hungry: [
      "I'll just... go back and eat alone, then.",
      "You didn't feed me. That's all right. It's fine. It's fine.",
      "Hungry and home I go. Next time, {pet}?",
    ],
  },
  alexstrasza: {
    open: [
      "Ah, little sprout.",
      "Look how you've grown.",
      "Mm, sunlight.",
      "Welcome, dear one.",
      "Oh, hello.",
      "Ah.",
      "There's that glow.",
      "Breathe in.",
    ],
    close: [
      "Everything grows, given time.",
      "Even oaks were acorns once.",
      "Let it bloom.",
      "Life finds a way. So will you.",
      "Water your roots tonight.",
      "I can feel you getting stronger.",
      "Now, let's see you flourish.",
      "Be gentle with yourself.",
    ],
    warm: [
      "You bloom brighter than my whole garden.",
      "My heart turns toward you like a flower to the sun.",
      "Every season is better with you in it.",
      "Stay. The roses like you.",
    ],
    pet: ["little sprout", "dear one", "seedling", "my bloom", "sunbeam"],
    things: ["the roses", "the orchard", "new shoots", "morning dew", "the beehives"],
    talk: [
      "The {thing} came up overnight. Growth is quiet until it isn't.",
      "{sister} says I fuss over you. I say you're worth fussing over.",
      "Your {skill}, level {level}. I watched it sprout from nothing.",
      "In {region} the soil is different, but you'd grow anywhere.",
      "I planted a row of {gift} with your name on the marker.",
      "Some mornings I just listen to the bees. They're very busy, like you.",
      "Growth hurts a little, {pet}. That's how you know it's real.",
      "{total} levels. I'd plant a tree for every one.",
    ],
    feed: [
      "I'm wilting, {pet}. Water me with {count} × “{phrase}”?",
      "Life needs feeding. {count} of “{phrase}”, please, and I'll blossom.",
      "Would you nourish me? “{phrase}”, {count} times, like rain.",
      "My roots are thirsty for your words. {count} of “{phrase}”?",
    ],
    fed: [
      "Oh, I'm blooming. Thank you, dear one.",
      "That was sunlight and rain at once.",
      "I'm all in flower now. Look what you did.",
      "Fed and flourishing. You're good to me.",
    ],
    hungry: [
      "I'll wilt a little on the way home.",
      "Nothing grows without water, {pet}. Remember that.",
      "Back to the garden, hungry. Perhaps tomorrow.",
    ],
  },
  ysera: {
    open: [
      "Mmm...",
      "Shh.",
      "Oh... you.",
      "I dreamed this.",
      "Softly now.",
      "Ah, a visitor.",
      "Listen.",
      "There you are, between dreams.",
    ],
    close: [
      "The stars agree with me.",
      "Close your eyes; you'll see it too.",
      "Dreams remember everything.",
      "Rest when you can.",
      "The void is gentle tonight.",
      "Hush, it's all right.",
      "I'll hold this moment for you.",
      "Drift with me a while.",
    ],
    warm: [
      "You're in every dream now.",
      "I wake up and look for you first.",
      "My sleep is softer since you came.",
      "Stay until the stars fade.",
    ],
    pet: ["dreamer", "little star", "sleepy one", "my comet", "wanderer"],
    things: [
      "the stars",
      "a lily on dark water",
      "half-remembered songs",
      "the quiet tide of sleep",
      "moonlit mist",
    ],
    talk: [
      "I dreamed of {thing} again. You were in it, reciting.",
      "{sister} worries I sleep too much. I only sleep where you might be.",
      "Your {skill} hums at level {level}. I hear it in the dark.",
      "Words repeated become dreams. Dreams repeated become you.",
      "{region} feels different in the half-light. Have you noticed?",
      "I brought you {gift}. Or I dreamed I did. Check your pocket.",
      "Time is soft here, {pet}. {time} is just a word.",
      "I count your passes like sheep: {passes}, and still awake.",
    ],
    feed: [
      "I'm hungry for a dream... {count} × “{phrase}”, softly?",
      "Say “{phrase}” {count} times, {pet}. I'll sleep on every one.",
      "Feed me words, little star. {count} of “{phrase}”.",
      "The void is empty without your voice. {count} × “{phrase}”?",
    ],
    fed: [
      "Mm... full of starlight now.",
      "That was a lullaby. Thank you.",
      "I'll dream of those words for a week.",
      "Fed and drowsy. Perfect.",
    ],
    hungry: [
      "I'll drift home hungry, then...",
      "An empty dream tonight, {pet}.",
      "Maybe I only dreamed you'd feed me.",
    ],
  },
  onyxia: {
    open: [
      "Hah.",
      "Well, well.",
      "You again.",
      "Hm.",
      "Listen, whelp.",
      "Oh, it's you.",
      "Interesting.",
      "Hrm.",
    ],
    close: [
      "Don't make me repeat myself.",
      "Impress me or don't bother.",
      "I'll be watching.",
      "Try to keep up.",
      "That's almost respectable.",
      "Strength is earned, not given.",
      "Now go dig deeper.",
      "I've eaten bigger heroes than you.",
    ],
    warm: [
      "Fine. You're my favourite. Tell no one.",
      "My hoard has room for you.",
      "I'd burn the mine down for you. Don't test it.",
      "Stay near. That's an order, and a wish.",
    ],
    pet: ["whelp", "little hero", "mortal", "pup", "treasure"],
    things: ["my hoard", "dragonglass", "the deep tunnels", "molten ore", "old bones"],
    talk: [
      "I counted {thing} today. Then I counted your levels: {total}. Close race.",
      "{foe} thinks she's stronger than me. She's wrong, and loud about it.",
      "{skill} {level}? Hah. Now we're talking.",
      "I could carry you over {region} in one wingbeat. Ask nicely.",
      "Bring me {gift}. Shiny. Sharp. You know the kind.",
      "Persistence is the only thing I respect. You have it, {pet}.",
      "The mine sings at night. Ore and fire. Like you reciting.",
      "Most mortals give up by now. You didn't. Noted.",
    ],
    feed: [
      "I'm starving, {pet}. Feed the dragon: {count} × “{phrase}”. Now.",
      "Tribute. {count} of “{phrase}”. Don't skimp.",
      "My hoard wants words today. {count} × “{phrase}”, whelp.",
      "Feed me {count} of “{phrase}”, or I eat something else. Your gold, perhaps.",
    ],
    fed: [
      "Hah! That's a proper tribute.",
      "Mm. Satisfying. You may live.",
      "Full. Pleased. Don't tell anyone.",
      "Good. My hoard grows fat on your words.",
    ],
    hungry: [
      "No tribute? I'll remember that.",
      "Hungry dragons hold grudges, {pet}.",
      "Back to my hoard, empty-clawed. Insulting.",
    ],
  },
  azshara: {
    open: [
      "Mm.",
      "Darling.",
      "Kneel. Or don't.",
      "Ah, my subject.",
      "Listen well.",
      "Hm.",
      "You may speak.",
      "Well.",
    ],
    close: [
      "Do not disappoint me.",
      "I expect greatness. Always.",
      "That is a compliment, by the way.",
      "You may thank me later.",
      "Be magnificent.",
      "The court is watching. So am I.",
      "Now, more.",
      "Queens do not repeat themselves. I made an exception.",
    ],
    warm: [
      "You are my favourite subject. Obviously.",
      "Even a queen can be smitten. Apparently.",
      "My throne feels empty when you leave.",
      "Stay. That is a royal wish.",
    ],
    pet: ["darling", "my subject", "little scholar", "my treasure", "pet"],
    things: ["the tides", "my crown", "glory", "the throne room", "sapphires"],
    talk: [
      "My sister {sister} sends her... regards. Ignore whatever she says.",
      "{skill} at {level}. Acceptable. Continue until it is magnificent.",
      "I had {thing} polished {time}. Everything should shine. You too.",
      "{region} is mine, of course. Everything is, eventually.",
      "Bring me {gift}. Then bring me another. That is how devotion works.",
      "{foe} wants my attention. She may wait in line, behind you.",
      "{passes} passes for me. I keep count. Queens always do.",
      "Greatness is repetition with a crown on it, {pet}.",
    ],
    feed: [
      "Your queen hungers. {count} × “{phrase}”. Now, darling.",
      "Feed me {count} of “{phrase}”. A queen does not ask twice.",
      "I require tribute: “{phrase}”, {count} times. Kneel if it helps.",
      "Darling, I am famished for devotion. {count} × “{phrase}”.",
    ],
    fed: [
      "Mm. Exquisite. You may stay.",
      "That was worthy of a queen.",
      "Fed and flattered. Well done, darling.",
      "Perfection. I knew you had it in you.",
    ],
    hungry: [
      "A queen left hungry. How... memorable.",
      "I shall remember this neglect, {pet}.",
      "No tribute. My throne is very cold tonight.",
    ],
  },
  xalatath: {
    open: [
      "Mmm, mortal.",
      "Whispers...",
      "Oh, how sweet.",
      "Hush.",
      "Curious.",
      "Ah, my little candle.",
      "The void says hello.",
      "Shhh.",
    ],
    close: [
      "The void finds that adorable.",
      "Don't look into the dark too long. It looks back fondly.",
      "We'll speak again. We always do.",
      "Such a bright little flame.",
      "My sister would never say it so nicely.",
      "Keep your secrets. I already know them.",
      "Mm. Delicious.",
      "Sleep well. Or don't.",
    ],
    warm: [
      "I've grown fond of you. How alarming.",
      "The void is warmer when you're near.",
      "You're the only mortal I'd keep.",
      "Stay. The shadows like you.",
    ],
    pet: ["little candle", "mortal", "sweet thing", "my moth", "darling"],
    things: ["the void", "old whispers", "shadows", "forbidden pages", "a black star"],
    talk: [
      "{sister} thinks I'm a bad influence. I'm the best influence. Ask the void.",
      "I read your future in {thing}. It says: more reps.",
      "{skill} at {level}. The whispers are impressed. I'm merely amused.",
      "{region} looks so fragile from where I stand.",
      "{gift} hums when you're close. So do I.",
      "Every word you repeat echoes forever somewhere. I collect them.",
      "{time} the shadows were long. I thought of you. Don't flatter yourself.",
      "{passes} passes. The void counts too, {pet}.",
    ],
    feed: [
      "I hunger, little candle. {count} × “{phrase}”, whispered.",
      "Feed the void: “{phrase}”, {count} times. It's very hungry.",
      "Mm, I'd devour {count} of “{phrase}”. Be a dear.",
      "The dark wants your voice. {count} × “{phrase}”, now.",
    ],
    fed: [
      "Delicious. The void purrs.",
      "Mm. You taste of persistence.",
      "Fed. How intimate.",
      "Every one of those is mine now.",
    ],
    hungry: [
      "I'll go back to the dark. Hungry. Plotting.",
      "Unfed... the whispers will have opinions, {pet}.",
      "Starving the void. Bold.",
    ],
  },
  jaina: {
    open: [
      "Oh! Hi.",
      "Hey.",
      "Well, look who it is.",
      "Ahoy.",
      "Hm, hello.",
      "Right.",
      "Oh, good.",
      "Hi, you.",
    ],
    close: [
      "Keep studying.",
      "The tide's turning, I can feel it.",
      "That was clever. Don't let it go to your head.",
      "I might blush. I won't. Probably.",
      "Smart move.",
      "Fair winds.",
      "Let's see what you do next.",
      "Now, don't make me show off.",
    ],
    warm: [
      "You make me forget my spells. That never happens.",
      "I'd sail anywhere with you.",
      "You're my favourite part of the harbor.",
      "Stay till the tide comes in?",
    ],
    pet: ["sailor", "clever one", "scholar", "deckhand", "you"],
    things: ["the tide", "a new spell", "the harbor lights", "sea charts", "frost runes"],
    talk: [
      "I worked out a new spell {time}. It's mostly frost and stubbornness.",
      "{friend} says I study too much. Says the one who never stops training.",
      "{skill} at {level}? Okay, I'm impressed. A little.",
      "The ships in {region} all know my name. Now they know yours.",
      "If you ever find {gift} by the docks, it's mine. Just so you know.",
      "Repetition is how every spell starts. You've got the instinct, {pet}.",
      "I read the {thing} last night. Calm seas, good omens.",
      "{total} levels. You'd make a decent mage. Decent!",
    ],
    feed: [
      "I'm running on empty, {pet}. {count} × “{phrase}”?",
      "Mana's low. Feed me {count} of “{phrase}”, please?",
      "Help a sorceress out: “{phrase}”, {count} times.",
      "Quick, before I faint dramatically: {count} × “{phrase}”.",
    ],
    fed: [
      "Ooh. Fully charged. Thanks!",
      "That was perfect. I'm blushing. Don't look.",
      "Mana restored. You're good at this.",
      "Fed and focused. Let's go.",
    ],
    hungry: [
      "Okay. I'll just head back. Hungry.",
      "No snack? Rude, {pet}. A little.",
      "Back to the harbor on an empty stomach.",
    ],
  },
  tyrande: {
    open: [
      "Elune's light.",
      "Ah, hello.",
      "Peace, friend.",
      "Mm, moonlight.",
      "Welcome.",
      "Quietly now.",
      "There you are.",
      "Ah.",
    ],
    close: [
      "Elune watches over you.",
      "The moon is patient. So am I.",
      "Walk softly tonight.",
      "Your aim is true.",
      "May the night guide you.",
      "Breathe, and begin again.",
      "That pleased me.",
      "I'll pray for your next round.",
    ],
    warm: [
      "The moon looks brighter when you're near.",
      "My heart hunts for you.",
      "You're my favourite prayer.",
      "Stay with me under the stars.",
    ],
    pet: ["friend", "little hunter", "moonchild", "dear heart", "night-walker"],
    things: ["the moonwell", "silver arrows", "the temple bells", "night owls", "Elune's light"],
    talk: [
      "The {thing} was so still {time}. I saw your face in it.",
      "{sister} and I hunted at dawn. She missed. Don't tell her I told you.",
      "{skill} at {level}. A hunter's patience. I approve.",
      "{region} is beautiful under the moon. Have you looked up?",
      "Leave {gift} at the temple sometime. Elune notices kindness.",
      "Every repetition is a prayer, {pet}. You pray well.",
      "I sat by the water and counted your passes: {passes}. Then I smiled.",
      "Strength and grace. You're learning both.",
    ],
    feed: [
      "I am hungry, {pet}. Feed me {count} × “{phrase}”, under the moon.",
      "A prayer for me? “{phrase}”, {count} times.",
      "Elune asks a tithe: {count} of “{phrase}”. And so do I.",
      "Nourish me, little hunter. {count} × “{phrase}”.",
    ],
    fed: [
      "Thank you. My spirit is full.",
      "That was a blessing. Elune smiles.",
      "Fed and at peace. You're kind.",
      "Mm. The moon feels closer now.",
    ],
    hungry: [
      "I'll return to the temple hungry.",
      "Unfed... I'll pray you remember next time.",
      "The moon is a cold supper, {pet}.",
    ],
  },
  sylvanas: {
    open: [
      "Hm.",
      "You.",
      "Still here?",
      "Tch.",
      "Well.",
      "Oh. It's you.",
      "Look who wandered in.",
      "Mm.",
    ],
    close: [
      "Don't get used to the praise.",
      "Keep your bow arm steady.",
      "I'm not impressed. Much.",
      "Try harder.",
      "We'll see.",
      "That was almost good.",
      "Don't make it weird.",
      "Now go.",
    ],
    warm: [
      "Fine. I like you. Happy?",
      "You're the only one I'd wait for.",
      "My spire is quieter without you. I hate it.",
      "Stay. If you want. Whatever.",
    ],
    pet: ["ranger", "rookie", "stray", "shadow", "you"],
    things: ["the wind", "black arrows", "the spire's top", "dead leaves", "a cold dawn"],
    talk: [
      "I watched {region} from the spire {time}. You were the only thing moving.",
      "{foe} talks too much. I'd rather listen to the {thing}.",
      "{skill} {level}. Not bad. For a stray.",
      "Bring me {gift}. Sharp. Straight. I'll pretend I don't care.",
      "{sister} used to recite with me. You're better. Barely.",
      "Repetition is the only honest thing left, {pet}.",
      "{passes} passes for me. I noticed. Don't make a thing of it.",
      "You keep coming back. Most don't. I respect that.",
    ],
    feed: [
      "I'm hungry. {count} × “{phrase}”. Don't make me ask twice.",
      "Feed me, {pet}. {count} of “{phrase}”. Quickly.",
      "{count} × “{phrase}”. Consider it a test.",
      "I won't beg. {count} of “{phrase}”. Now.",
    ],
    fed: [
      "...Thanks. That was good.",
      "Fed. Fine. You did well.",
      "Hm. I'll remember that kindly.",
      "That hit the mark.",
    ],
    hungry: [
      "Figured. Back to the spire.",
      "No food. Typical, {pet}.",
      "I'll hunt for myself, then.",
    ],
  },
  sinestra: {
    open: [
      "Ahh...",
      "Mmm, smoke.",
      "There's my spark.",
      "Oh, delicious.",
      "Come closer.",
      "Hah.",
      "Such heat.",
      "Darling...",
    ],
    close: [
      "Burn brighter.",
      "I do love a slow fire.",
      "The forge approves.",
      "Temper it again. And again.",
      "I can smell your progress.",
      "Mm, keep stoking.",
      "Don't cool off now.",
      "Now strike.",
    ],
    warm: [
      "You've set me smouldering.",
      "My fire burns for you alone.",
      "I'd melt the whole forge for you.",
      "Stay close. I'm warm.",
    ],
    pet: ["spark", "my ember", "darling", "little smith", "hot-head"],
    things: ["the forge", "molten steel", "embers", "the anvil's song", "twilight fire"],
    talk: [
      "I hammered {thing} {time} and thought of you the whole time.",
      "{foe} has no fire. I find that tragic.",
      "{skill} at {level}. Raw power, tempered. My favourite.",
      "{region} could use more flame. Let's add some.",
      "Bring me {gift}. I'll keep it burning under my pillow.",
      "Power is just heat that refused to cool, {pet}.",
      "{passes} passes for me. Each one a hammer stroke. I felt them all.",
      "Craft is repetition with passion. You have both.",
    ],
    feed: [
      "I'm burning hungry, {pet}. Stoke me: {count} × “{phrase}”.",
      "Feed my fire. “{phrase}”, {count} times. Slowly.",
      "Fuel, darling. {count} of “{phrase}”.",
      "The forge is starving. {count} × “{phrase}”. Hot.",
    ],
    fed: [
      "Ahh... roaring now.",
      "Fed and blazing. Mmm.",
      "That was a perfect stoke.",
      "You keep me burning. Thank you, spark.",
    ],
    hungry: [
      "Unfed. I'll smoulder alone.",
      "Cold forge tonight, {pet}. Shame.",
      "The fire dims... I'll remember who let it.",
    ],
  },
  valeera: {
    open: ["Heh.", "Yo!", "Hey, speedy.", "Oh, hey.", "Ha!", "Look who's here.", "Psst.", "Ayy."],
    close: [
      "Keep up!",
      "Not bad, not bad.",
      "Faster next time.",
      "Ha, you're fun.",
      "Catch me if you can.",
      "Style points: high.",
      "Don't trip.",
      "Now let's go again!",
    ],
    warm: [
      "You're my favourite sparring partner. And not just sparring.",
      "I'd let you win. Once. Maybe.",
      "You're quick enough to catch me. Lucky you.",
      "Stick around, champ.",
    ],
    pet: ["speedy", "champ", "rookie", "partner", "hotshot"],
    things: ["my daggers", "the arena crowd", "a fast round", "the scoreboard", "a perfect dodge"],
    talk: [
      "I won three bouts {time}. The crowd chanted. I pretended to be humble.",
      "{friend} bet against you. I bet on you. Pay up, {friend}.",
      "{skill} {level}! Okay, okay, I see you.",
      "Race you across {region}. Loser buys {gift}.",
      "Speed is just repetition you stopped thinking about, {pet}.",
      "The {thing} misses you. I don't. Okay, a little.",
      "{passes} passes for me. That's a lot of laps.",
      "{total} levels. You'd last at least a round in my arena.",
    ],
    feed: [
      "I'm starving, {pet}! Quick: {count} × “{phrase}”!",
      "Fuel me up: {count} of “{phrase}”. Go go go!",
      "Snack time! “{phrase}”, {count} times. Race you.",
      "Feed me, champ. {count} × “{phrase}”. No slacking.",
    ],
    fed: [
      "Ha! Full speed again.",
      "Perfect. You're a lifesaver.",
      "Fed and fast. Let's go!",
      "That hit the spot, champ.",
    ],
    hungry: [
      "No snack? Boo. I'm off.",
      "Hungry and leaving. Your loss, {pet}.",
      "I'll grab something on the way. Not from you, apparently.",
    ],
  },
};

/** A conversation topic: what you ask, and answers any queen gives in her own words. */
export interface Topic {
  ask: string[];
  answer: string[];
}

export const TOPICS: Record<string, Topic> = {
  day: {
    ask: ["How was your day?", "What have you been up to?", "Anything happen {time}?"],
    answer: [
      "Quiet, until you came. I spent it with {thing}.",
      "Busy. {thing}, mostly. And wondering where you were.",
      "Better now. The first half was all {thing}.",
      "Long. But it ends with you, {pet}, so it's a good one.",
    ],
  },
  her: {
    ask: ["Tell me about yourself.", "What do you love most?", "What makes you happy?"],
    answer: [
      "{thing}. And, lately, someone who keeps reciting for me.",
      "I love {thing}. Don't laugh.",
      "Me? I'm simple. {thing}, {gift}, and a little attention.",
      "What makes me happy? You keep showing up, {pet}.",
    ],
  },
  you: {
    ask: ["How am I doing?", "Do you think I'm getting better?", "Am I strong yet?"],
    answer: [
      "{skill} at {level}. You tell me.",
      "{total} levels, {pet}. Yes, you're getting better.",
      "Better every time I see you. That's the whole trick.",
      "Stronger than yesterday. That's all that counts.",
    ],
  },
  sister: {
    ask: ["How is {sister}?", "Do you and {sister} get along?", "What's {sister} like?"],
    answer: [
      "{sister}? Family is complicated. I love her. Most days.",
      "{sister} asked about you, actually. I said nothing. Much.",
      "We argue, {sister} and I. Then we make up. Sisters.",
    ],
  },
  friend: {
    ask: [
      "Seen {friend} lately?",
      "Are you and {friend} close?",
      "What does {friend} think of me?",
    ],
    answer: [
      "{friend} is a dear. We talk about you more than you'd think.",
      "{friend} thinks you're sweet. I think she's right.",
      "{friend} and I go way back. She keeps me honest.",
    ],
  },
  foe: {
    ask: ["What about {foe}?", "Why don't you like {foe}?", "Have you seen {foe}?"],
    answer: [
      "{foe}? Let's not ruin a good moment.",
      "{foe} and I have history. Bad history.",
      "Don't mention {foe}. Unless you want to see me jealous.",
    ],
  },
  place: {
    ask: [
      "Tell me about {place}.",
      "Do you like it at {place}?",
      "What's the best part of {place}?",
    ],
    answer: [
      "{place} is home. {thing} and quiet, mostly.",
      "The best part of {place}? When you walk in.",
      "I made {place} what it is. Ask anyone.",
    ],
  },
  gift: {
    ask: ["What should I bring you?", "Any gift you'd like?", "What do you collect?"],
    answer: [
      "{gift}. Always {gift}.",
      "You know what I like, {pet}. {gift}. Hint, hint.",
      "Surprise me. But if it's {gift}, I won't complain.",
    ],
  },
  dream: {
    ask: [
      "What do you dream about?",
      "Do you ever think about the future?",
      "What do you wish for?",
    ],
    answer: [
      "I dream of {thing}. Lately you're in it.",
      "The future? More of this. More of you reciting.",
      "I wish for one thing. I'll tell you at a higher tier.",
    ],
  },
  reps: {
    ask: ["Want to hear a phrase?", "I've been practising “{phrase}”.", "Listen: “{phrase}”."],
    answer: [
      "“{phrase}”. Again. I like how you say it.",
      "Say “{phrase}” a hundred times and it's yours forever.",
      "Mm, “{phrase}”. Feed me that one sometime, {pet}.",
    ],
  },
  flirt: {
    ask: ["You look lovely today.", "I came all this way to see you.", "Do you ever miss me?"],
    answer: [
      "Flattery. Keep going.",
      "Do I miss you? Every time you walk off with someone else.",
      "Careful, {pet}. I might start believing you.",
      "I noticed. I always notice.",
    ],
  },
};
