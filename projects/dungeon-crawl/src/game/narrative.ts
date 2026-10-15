import type { ScenarioId } from "./types";

export type NarrativeMode = "solo" | "multiplayer";
export type SharedSceneId = "gate" | "contract" | "blood-door" | "well" | "armory";

export type SceneNarrative = {
  eyebrow: string;
  title: string;
  body: string;
  quote: string;
  art: "gate" | "contract" | "blood" | "well" | "armory";
};

type SceneVariant = Record<NarrativeMode, SceneNarrative>;

const sharedScene = (
  common: SceneNarrative,
  solo: Partial<SceneNarrative> = {},
  multiplayer: Partial<SceneNarrative> = {},
): SceneVariant => ({
  solo: { ...common, ...solo },
  multiplayer: { ...common, ...multiplayer },
});

export const scenarioTitles: Record<ScenarioId, Record<NarrativeMode, string>> = {
  "lost-heir": { solo: "The Lost Heir", multiplayer: "The Lost Heir" },
  "plague-below": { solo: "The Plague Below", multiplayer: "The Plague Below" },
  "dragon-hoard": { solo: "The Dragon's Hoard", multiplayer: "The Dragon’s Hoard" },
};

export const scenarioTaglines: Record<ScenarioId, string> = {
  "lost-heir": "What was buried was never forgotten.",
  "plague-below": "Some things should stay buried.",
  "dragon-hoard": "Every treasure has a price.",
};

const scenes: Record<ScenarioId, Record<SharedSceneId, SceneVariant>> = {
  "lost-heir": {
    gate: sharedScene({
      eyebrow: "CHAPTER I · THE LOST HEIR", title: "The Lost Heir",
      body: "Rain hammers the ruined fortress above you. The black-iron gate opens at the touch of your signet. Beyond it, ankle-deep black water surrounds four faceless statues and a bronze pedestal.",
      quote: "“The heir may claim the throne, but the throne claims the heir.”", art: "gate",
    }, { title: scenarioTitles["lost-heir"].solo }, { title: "The Entry Chamber" }),
    contract: sharedScene({
      eyebrow: "DISCOVERY · THE ROYAL CONTRACT", title: "The Throne's Price",
      body: "The inscription is not a warning but a contract. Your signet fits a hollow in the pedestal. Ancient letters rearrange themselves around your hand.",
      quote: "“Blood grants entry. Memory grants passage. A name grants the crown.”", art: "contract",
    }, {}, { title: "The Throne’s Price" }),
    "blood-door": sharedScene({
      eyebrow: "LOCATION · THE BLOOD-SEALED DOOR", title: "Someone Knows Your Name",
      body: "A crimson seal throbs on an iron door. Something pounds against the other side. A voice cries: “Your Majesty! Please, you must let me out!”",
      quote: "Brom whispers: “I've seen this crest on a tomb door. From the inside.”", art: "blood",
    }, {}, { quote: "Brom whispers: “I’ve seen this crest on a tomb door. From the inside.”" }),
    well: sharedScene({
      eyebrow: "LOCATION · THE WHISPERING WELL", title: "A Voice from Below",
      body: "Cold blue light shimmers over a circular well. Your own voice repeats: “Do not trust Brom.”",
      quote: "Brom refuses to meet your eyes. Mira says the magic is old enough to have a memory.", art: "well",
    }),
    armory: sharedScene({
      eyebrow: "LOCATION · THE FORGOTTEN ARMORY", title: "Steel Remembers",
      body: "Weapons hang in rows beneath a collapsed arch. A golden light flickers behind a fallen statue, and somewhere in the dark, a blade is being sharpened.",
      quote: "Lyra spots fresh tracks. Whatever is here has been waiting.", art: "armory",
    }),
  },
  "plague-below": {
    gate: sharedScene({
      eyebrow: "CHAPTER I · THE PLAGUE BELOW", title: "The Plague Below",
      body: "You descend into a quarantined mining city where green spores drift through the air. The evacuation bells have stopped, but something beneath the streets is still ringing them. Your party's masks are already frosting over.",
      quote: "“If you can hear the bells, the infection can hear you.”", art: "gate",
    }, { body: "You descend into a quarantined mining city where green spores drift through the air. The evacuation bells have stopped, but something beneath the streets is still ringing them. Your party's masks are already frosting over." }, {
      title: "The Mine Entrance",
      body: "You descend into a quarantined mining city where green spores drift through the air. The evacuation bells have stopped, but something beneath the streets is still ringing them. Your party’s masks are already frosting over.",
    }),
    contract: sharedScene({
      eyebrow: "DISCOVERY · THE QUARANTINE LEDGER", title: "Patient Zero",
      body: "The ledger records a quarantine that began twenty years ago. Every name is crossed out except one: the name of the city's founder.",
      quote: "“Containment failed at 03:17. Do not open the lower doors.”", art: "contract",
    }, { body: "The ledger records a quarantine that began twenty years ago. Every name is crossed out except one: the name of the city's founder." }, {
      body: "The ledger records a quarantine that began twenty years ago. Every name is crossed out except one: the name of the city’s founder.",
    }),
    "blood-door": sharedScene({
      eyebrow: "LOCATION · THE SEALED INFIRMARY", title: "Quarantine Is Not Enough",
      body: "A red quarantine seal covers the infirmary door. Something pounds from inside. A voice calls for help, then dissolves into a wet, inhuman clicking.",
      quote: "Mira whispers: “If the seal breaks, do not breathe the air.”", art: "blood",
    }),
    well: sharedScene({
      eyebrow: "LOCATION · THE SPORE WELL", title: "The Infection Listens",
      body: "A shaft descends into blue-green spores. The cloud rises and falls like a sleeping lung. From below, a voice repeats your last words a heartbeat after you speak.",
      quote: "Lyra finds boot prints leading into the shaft—but none returning.", art: "well",
    }),
    armory: sharedScene({
      eyebrow: "LOCATION · THE SUPPLY VAULT", title: "The Last Clean Supplies",
      body: "Shelves of sealed medicine and ration tins line the vault. One cabinet has been clawed open from the inside. Something scrapes behind the emergency supplies.",
      quote: "Brom raises his shield: “Take what we need. We don't linger.”", art: "armory",
    }, {}, { quote: "Brom raises his shield: “Take what we need. We don’t linger.”" }),
  },
  "dragon-hoard": {
    gate: sharedScene({
      eyebrow: "CHAPTER I · THE DRAGON’S HOARD", title: "The Dragon's Hoard",
      body: "A split mountain opens into a cavern of black glass and molten gold. Coins rain from the ceiling like sparks. Somewhere beyond the bridge, a sleeping dragon breathes—and every exhale makes the stone beneath your boots tremble.",
      quote: "“Take one coin, and the mountain takes one name.”", art: "gate",
    }, { eyebrow: "CHAPTER I · THE DRAGON'S HOARD", title: scenarioTitles["dragon-hoard"].solo }, { title: "The Cavern" }),
    contract: sharedScene({
      eyebrow: "DISCOVERY · THE RUNIC BARGAIN", title: "The Hoard's Contract",
      body: "A runic bargain is etched into dragon glass. Its terms shimmer: treasure for memory, power for a name.",
      quote: "“All debts are remembered beneath the mountain.”", art: "contract",
    }, {}, { title: "The Hoard’s Contract" }),
    "blood-door": sharedScene({
      eyebrow: "LOCATION · THE OBSIDIAN DOOR", title: "A Bargain in the Dark",
      body: "An obsidian door glows with molten seams. A voice offers treasure in exchange for one small memory.",
      quote: "Brom grips his hammer: “Dragons don't bargain unless they already have the upper hand.”", art: "blood",
    }, {}, { quote: "Brom grips his hammer: “Dragons don’t bargain unless they already have the upper hand.”" }),
    well: sharedScene({
      eyebrow: "LOCATION · THE WISHING POOL", title: "Gold Beneath the Water",
      body: "A still pool reflects a sky that cannot exist underground. Gold coins hover beneath the surface. Your reflection smiles a moment before you do.",
      quote: "Mira warns: “Wish-magic always collects its debt.”", art: "well",
    }),
    armory: sharedScene({
      eyebrow: "LOCATION · THE FALLEN TREASURE VAULT", title: "A Mountain of Temptation",
      body: "Coins and broken crowns glitter beneath a fallen stone arch. A golden light pulses inside a cracked coffer, while claw marks score the walls.",
      quote: "Lyra spots tracks far too large to belong to a wolf.", art: "armory",
    }),
  },
};

export function getSceneNarrative(scenarioId: ScenarioId, scene: SharedSceneId, mode: NarrativeMode): SceneNarrative {
  return scenes[scenarioId][scene][mode];
}
