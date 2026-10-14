import { useEffect, useMemo, useRef, useState } from "react";
import { addLostHeirSilverKey, claimRewardOnce, getHeroAbilityScores, hasRewardClaim, resolveCheck, resolvePotionHealing, rollDie, rollEnemyDamage, rollPlayerAttack, validateSaveData } from "./game/rules";
import { getSceneNarrative, scenarioTaglines, scenarioTitles } from "./game/narrative";
import type { Hero, HeroAncestry, HeroBackground, HeroClass, HeroGender, LogEntry, PartyMember, SaveState, ScenarioId, Scene } from "./game/types";
import MultiplayerLobby from "./multiplayer/MultiplayerLobby";

type Scenario = { id: ScenarioId; title: string; tagline: string; gateChoices: [string, string, string, string] };
const REWARD_MARKER_PREFIX = "__reward_claimed__:";
const rewardMarker = (scenarioId: ScenarioId, rewardId: string) => `${REWARD_MARKER_PREFIX}${scenarioId}:${rewardId}`;
const visibleExploredChoices = (explored: string[]) => explored.filter(value => !value.startsWith(REWARD_MARKER_PREFIX));
const defaultHero: Hero = { name: "Adventurer", gender: "female", className: "Warrior", ancestry: "Human", background: "Noble", difficulty: "Balanced" };
const classDetails: Record<HeroClass, { hp: number; weapon: string; armor: string; attackBonus: number; damage: string }> = {
  Warrior: { hp: 24, weapon: "Ancestral Longsword", armor: "Reinforced Armor", attackBonus: 5, damage: "1d8 + 3 damage" },
  Ranger: { hp: 21, weapon: "Recurve Longbow", armor: "Trail-worn Leather", attackBonus: 5, damage: "1d8 + 3 damage" },
  Mage: { hp: 17, weapon: "Runed Staff", armor: "Warded Robes", attackBonus: 5, damage: "1d8 + 3 arcane damage" },
  Rogue: { hp: 20, weapon: "Twin Daggers", armor: "Shadow Leather", attackBonus: 6, damage: "1d8 + 3 damage" },
  Paladin: { hp: 26, weapon: "Oathbound Blade", armor: "Sanctified Plate", attackBonus: 5, damage: "1d8 + 3 radiant damage" },
};

const initialParty: PartyMember[] = [
  { name: "Brom Ironvein", role: "Dwarf Guardian", hp: 28, maxHp: 28, detail: "Front-line protector", icon: "🛡️" },
  { name: "Lyra Thornwhisper", role: "Elven Ranger", hp: 20, maxHp: 20, detail: "Scout and archer", icon: "🏹" },
  { name: "Mira Voss", role: "Human Mage", hp: 18, maxHp: 18, detail: "Arcane investigator", icon: "🔮" },
];
const starterInventory = ["Ancestral longsword", "Reinforced armor", "Shield", "5 torches", "50 ft rope", "Flint & steel", "3 days of rations", "Signet of the First King"];
const scenarios: Record<ScenarioId, Scenario> = {
  "lost-heir": { id: "lost-heir", title: scenarioTitles["lost-heir"].solo, tagline: scenarioTaglines["lost-heir"], gateChoices: ["Inspect the royal contract", "Approach the blood-sealed door", "Investigate the whispering well", "Search the forgotten armory"] },
  "plague-below": { id: "plague-below", title: scenarioTitles["plague-below"].solo, tagline: scenarioTaglines["plague-below"], gateChoices: ["Inspect the quarantine ledger", "Open the sealed infirmary", "Investigate the spore well", "Search the abandoned supply vault"] },
  "dragon-hoard": { id: "dragon-hoard", title: scenarioTitles["dragon-hoard"].solo, tagline: scenarioTaglines["dragon-hoard"], gateChoices: ["Read the runic bargain", "Approach the obsidian door", "Investigate the wishing pool", "Search the fallen treasure vault"] }
};
const scenarioCopy: Record<ScenarioId, {
  questTitle: string; questDescription: string; objectives: [string, string, string]; hubName: string; victoryTease: string;
  doorHeading: string; doorPrompt: string; doorAction: string; doorDescription: string; doorCheck: string; doorForceAction: string; doorForceDescription: string; doorReturn: string;
  contractHeading: string; contractPrompt: string; contractAction: string; contractDescription: string; contractCheck: string; contractSuccess: string; contractFailure: string; contractReturn: string; contractReturnDescription: string;
  wellHeading: string; wellPrompt: string; wellAskSuccess: string; wellAskFailure: string; wellLookAction: string; wellLookDescription: string; wellLookSuccess: string; wellLookFailure: string; wellReturn: string;
  armoryHeading: string; armoryPrompt: string; armorySearchAction: string; armorySearchDescription: string; armorySearchSuccess: string; armorySearchFailure: string; armoryTracksSuccess: string; armoryTracksFailure: string; armoryReturn: string;
  enemyName: string; enemyDescriptor: string; enemyArrival: string; enemyDefeat: string;
}> = {
  "lost-heir": {
    questTitle: "The Gate That Breathes", questDescription: "Discover why the ancient gate recognizes your bloodline.", objectives: ["Explore the entry chamber", "Investigate the royal contract", "Find a way deeper"], hubName: "the central chamber", victoryTease: "The next gate is stirring.",
    doorHeading: "THE BLOOD-SEALED DOOR", doorPrompt: "MAKE A CHOICE", doorAction: "Touch the seal with your signet", doorDescription: "Use your lineage to open the door.", doorCheck: "Royal bloodline", doorForceAction: "Break the seal by force", doorForceDescription: "Test your strength against ancient magic.", doorReturn: "Retreat to the chamber",
    contractHeading: "THE ROYAL CONTRACT", contractPrompt: "YOUR BLOODLINE", contractAction: "Place the signet in the pedestal", contractDescription: "Test whether the relic recognizes its heir.", contractCheck: "Heir's Instinct", contractSuccess: "The signet unlocks the hidden cache. You find a silver key. +15 XP.", contractFailure: "The pedestal rejects the signet.", contractReturn: "Return to the chamber", contractReturnDescription: "Keep exploring before risking the contract.",
    wellHeading: "THE WHISPERING WELL", wellPrompt: "SEEK THE TRUTH", wellAskSuccess: "Mira identifies a memory echo, not proof of betrayal. +10 XP.", wellAskFailure: "The magic resists Mira's spell. The warning remains unexplained.", wellLookAction: "Look into the water", wellLookDescription: "Face the voice yourself.", wellLookSuccess: "A forgotten royal memory surfaces. +10 XP.", wellLookFailure: "A cold hand brushes your mind. You lose 2 HP.", wellReturn: "Return to the central chamber",
    armoryHeading: "THE FORGOTTEN ARMORY", armoryPrompt: "SEARCH THE RUINS", armorySearchAction: "Search behind the fallen statue", armorySearchDescription: "Recover whatever the golden light is guarding.", armorySearchSuccess: "You recover a ward charm and 10 gold. +15 XP.", armorySearchFailure: "The statue shifts, and something stirs in the darkness.", armoryTracksSuccess: "The tracks belong to a heavy armored construct. +5 XP.", armoryTracksFailure: "The tracks disappear beneath a sheet of dust.", armoryReturn: "Return to the central chamber",
    enemyName: "Crownbound Sentinel", enemyDescriptor: "Royal construct", enemyArrival: "A Crownbound Sentinel tears free from the wall!", enemyDefeat: "The sentinel collapses into a storm of black ash. The chamber falls silent.",
  },
  "plague-below": {
    questTitle: "The Bells Below", questDescription: "Trace the outbreak and discover what is still ringing beneath the quarantine.", objectives: ["Explore the mine entrance", "Inspect the quarantine ledger", "Find the source of the bells"], hubName: "the mine entrance", victoryTease: "The quarantine bells ring below.",
    doorHeading: "THE SEALED INFIRMARY", doorPrompt: "QUARANTINE SEAL", doorAction: "Examine the quarantine seal", doorDescription: "Look for a way through without releasing what is inside.", doorCheck: "Quarantine protocol", doorForceAction: "Break the infirmary seal", doorForceDescription: "Force the sealed door before whatever is inside breaks through.", doorReturn: "Return to the mine entrance",
    contractHeading: "THE QUARANTINE LEDGER", contractPrompt: "CONTAINMENT RECORD", contractAction: "Study the final ledger entry", contractDescription: "Look for a clue to the quarantine's failure.", contractCheck: "Containment records", contractSuccess: "You decipher the final entry in the quarantine ledger. +15 XP.", contractFailure: "The final entry is obscured by damage.", contractReturn: "Return to the mine entrance", contractReturnDescription: "Keep exploring before risking the ledger.",
    wellHeading: "THE SPORE WELL", wellPrompt: "TRACE THE INFECTION", wellAskSuccess: "Mira identifies the well's echo as an old quarantine warning. +10 XP.", wellAskFailure: "The well's magic resists Mira's spell. Its warning remains unexplained.", wellLookAction: "Study the spores below", wellLookDescription: "Peer into the shaft and trace the infection's source.", wellLookSuccess: "A memory of the quarantine surfaces in the water. +10 XP.", wellLookFailure: "A cold presence brushes your mind. You lose 2 HP.", wellReturn: "Return to the mine entrance",
    armoryHeading: "THE SUPPLY VAULT", armoryPrompt: "SEARCH THE VAULT", armorySearchAction: "Search the sealed supply cabinet", armorySearchDescription: "Recover what the damaged cabinet is hiding.", armorySearchSuccess: "You recover a ward charm and 10 gold. +15 XP.", armorySearchFailure: "The cabinet gives way, and something stirs among the supplies.", armoryTracksSuccess: "The tracks lead to a heavy quarantine warden. +5 XP.", armoryTracksFailure: "The tracks vanish beneath a drift of spores.", armoryReturn: "Return to the mine entrance",
    enemyName: "Spore-Twisted Warden", enemyDescriptor: "Infected quarantine warden", enemyArrival: "A Spore-Twisted Warden staggers out of the mist!", enemyDefeat: "The infected warden collapses in a cloud of pale spores.",
  },
  "dragon-hoard": {
    questTitle: "The Name in the Hoard", questDescription: "Uncover the terms of the dragon's bargain before it claims your name.", objectives: ["Explore the cavern", "Read the runic bargain", "Discover the guardian's passage"], hubName: "the cavern", victoryTease: "Something vast stirs above the hoard.",
    doorHeading: "THE OBSIDIAN DOOR", doorPrompt: "THE DRAGON'S OFFER", doorAction: "Trace the obsidian runes", doorDescription: "Read the offer etched into the door before answering.", doorCheck: "Runic bargain", doorForceAction: "Force the obsidian door", doorForceDescription: "Test your strength against the dragon-glass seal.", doorReturn: "Return to the cavern",
    contractHeading: "THE RUNIC BARGAIN", contractPrompt: "PRICE OF THE HOARD", contractAction: "Read the terms etched in dragon glass", contractDescription: "Test your understanding of the bargain's price.", contractCheck: "Bargain's Terms", contractSuccess: "The runes reveal the price demanded by the hoard. +15 XP.", contractFailure: "The runes resist your interpretation.", contractReturn: "Return to the cavern", contractReturnDescription: "Keep exploring before risking the bargain.",
    wellHeading: "THE WISHING POOL", wellPrompt: "SEEK THE PRICE", wellAskSuccess: "Mira identifies the pool's magic as a bargain that demands a memory. +10 XP.", wellAskFailure: "The pool's enchantment resists Mira's spell. Its price remains unclear.", wellLookAction: "Look into the pool", wellLookDescription: "Face the reflection that moves before you do.", wellLookSuccess: "A memory of an ancient bargain surfaces in the water. +10 XP.", wellLookFailure: "A cold presence brushes your mind. You lose 2 HP.", wellReturn: "Return to the cavern",
    armoryHeading: "THE FALLEN TREASURE VAULT", armoryPrompt: "SEARCH THE TREASURE", armorySearchAction: "Search behind the fallen coffer", armorySearchDescription: "Recover whatever the golden light is guarding.", armorySearchSuccess: "You recover a ward charm and 10 gold. +15 XP.", armorySearchFailure: "The coffer shifts, and something stirs among the coins.", armoryTracksSuccess: "The tracks belong to a dragon-forged guardian. +5 XP.", armoryTracksFailure: "The tracks disappear beneath scattered coins.", armoryReturn: "Return to the cavern",
    enemyName: "Hoardbound Guardian", enemyDescriptor: "Dragon-forged guardian", enemyArrival: "A Hoardbound Guardian unfolds from a pile of coins!", enemyDefeat: "The guardian breaks apart into black glass and gold.",
  },
};
const migrateLegacyRewardClaims = (state: SaveState): SaveState => {
  const explored = new Set(state.explored);
  const copy = scenarioCopy[state.scenarioId];
  const successfulCheck = (label: string) => state.log.some(entry => entry.text.startsWith(`${label}: d20 (`) && entry.text.includes(" — SUCCESS"));
  const markers: string[] = [];
  const claimIf = (condition: boolean, rewardId: string) => {
    const marker = rewardMarker(state.scenarioId, rewardId);
    if (condition && !explored.has(marker)) markers.push(marker);
  };

  claimIf(explored.has(scenarios[state.scenarioId].gateChoices[0]) && successfulCheck(state.scenarioId === "lost-heir" ? "Royal history" : state.scenarioId === "plague-below" ? "Medical investigation" : "Arcane lore"), "gate-research");
  claimIf(explored.has(copy.contractAction) && successfulCheck(copy.contractCheck), "contract-insight");
  const signetSucceeded = explored.has(copy.doorAction) && successfulCheck(copy.doorCheck);
  const forceSucceeded = explored.has(copy.doorForceAction) && successfulCheck("Strength");
  claimIf(signetSucceeded || forceSucceeded, "sealed-door-key");
  claimIf(signetSucceeded, "sealed-door-insight");
  claimIf(explored.has("Ask Mira to examine the magic") && successfulCheck("Arcana"), "well-arcana");
  claimIf(explored.has(copy.wellLookAction) && successfulCheck("Wisdom"), "well-observation");
  claimIf(explored.has(copy.armorySearchAction) && successfulCheck("Investigation"), "vault-cache");
  claimIf(explored.has("Take a torch and study the tracks") && successfulCheck("Perception"), "tracks");

  return markers.length ? { ...state, explored: [...state.explored, ...markers] } : state;
};
const initialState: SaveState = {
  scenarioId: "lost-heir", scene: "gate", hp: 24, maxHp: 24, gold: 25, xp: 0, potions: 2, hero: defaultHero,
  inventory: starterInventory, log: [
    { text: "Campaign started: Adventurer, the Lost Heir. Your signet has awakened.", kind: "good" },
    { text: "Brom, Lyra, and Mira join your expedition." },
    { text: "The gate whispers: “The rightful heir has come home.”", kind: "danger" },
  ], explored: [], enemyHp: 22, enemyMaxHp: 22, round: 1, lastRoll: null,
};

const SAVE_VALIDATION_CONFIG = {
  fallback: initialState,
  scenarioIds: Object.keys(scenarios) as ScenarioId[],
  sceneIds: ["gate", "blood-door", "well", "armory", "contract", "combat", "victory"] as Scene[],
  classBaseHp: Object.fromEntries(Object.entries(classDetails).map(([name, details]) => [name, details.hp])) as Record<HeroClass, number>,
  ancestries: ["Human", "Elf", "Dwarf", "Half-Orc"] as HeroAncestry[],
  backgrounds: ["Noble", "Outlander", "Scholar", "Mercenary"] as HeroBackground[],
  rewardMarkerPrefix: REWARD_MARKER_PREFIX,
  rewardIds: ["gate-research", "contract-insight", "sealed-door-key", "sealed-door-insight", "well-arcana", "well-observation", "vault-cache", "tracks"],
} as const;

const ancestryDetails: Record<HeroAncestry, { trait: string; description: string; bonuses: Partial<Record<"STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA", number>>; story: string }> = {
  Human: { trait: "Versatile", description: "Adaptable, determined, and quick to earn trust.", bonuses: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, story: "Raised among shifting borders, you learned that courage matters more than bloodline." },
  Elf: { trait: "Keen Senses", description: "Ancient instincts, sharp senses, and graceful movement.", bonuses: { DEX: 2, WIS: 1 }, story: "Your people remember the first songs of the old forests, and one of those songs has begun to sound like a warning." },
  Dwarf: { trait: "Stoneborn", description: "Sturdy, steadfast, and trained to endure hardship.", bonuses: { CON: 2, STR: 1 }, story: "You were raised beneath mountains where every promise is carved in stone and every debt is remembered." },
  "Half-Orc": { trait: "Relentless", description: "Powerful, resilient, and impossible to intimidate easily.", bonuses: { STR: 2, CON: 1 }, story: "Between two worlds, you learned to turn other people's doubt into a strength they could never understand." },
};
const classProfiles: Record<HeroClass, { role: string; strengths: string; story: string }> = {
  Warrior: { role: "Front-line fighter", strengths: "High durability · reliable melee damage", story: "You have stood in the breach when others fled, and you know a shield can be both a promise and a warning." },
  Ranger: { role: "Scout and ranged specialist", strengths: "Precision · awareness · survival", story: "You can read a trail like a page of a book, and the tracks leading into this dungeon tell a story no one wants to hear." },
  Mage: { role: "Arcane spellcaster", strengths: "Intelligence · magical knowledge", story: "You studied the forbidden margins of old spellbooks, searching for a truth that now seems to be searching for you." },
  Rogue: { role: "Stealth and finesse", strengths: "Agility · cunning · quick strikes", story: "You survived by noticing what others overlooked: a loose stone, a false smile, and the quiet click of a trap being armed." },
  Paladin: { role: "Holy defender", strengths: "Resilience · conviction · radiant force", story: "You swore an oath when the world was at its darkest. Something in this dungeon knows the words you used." },
};
const backgroundProfiles: Record<HeroBackground, string> = {
  Noble: "Your family name opens doors—and paints a target on your back.",
  Outlander: "You trust the wilderness more than courts, cities, or easy promises.",
  Scholar: "You chase forgotten knowledge, even when the truth bites back.",
  Mercenary: "You have learned to judge a contract by its fine print and its exits.",
};
const ancestryOrder: HeroAncestry[] = ["Human", "Elf", "Dwarf", "Half-Orc"];
const classOrder: HeroClass[] = ["Warrior", "Ranger", "Mage", "Rogue", "Paladin"];
const statOrder = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
function getHeroStats(hero: Hero): [string, string, string][] {
  const scores = getHeroAbilityScores(hero);
  return statOrder.map(name => {
    const value = scores[name];
    const modifier = Math.floor((value - 10) / 2);
    return [name, String(value), modifier >= 0 ? `+${modifier}` : String(modifier)];
  });
}
function heroOriginStory(hero: Hero): string {
  const ancestry = ancestryDetails[hero.ancestry];
  const heroClass = classProfiles[hero.className];
  return `${ancestry.story} ${heroClass.story} ${backgroundProfiles[hero.background]}`;
}
function HeroAvatar({ hero, large = false }: { hero: Hero; large?: boolean }) {
  const portraitKey: `${HeroClass}:${HeroGender}:${HeroAncestry}` = `${hero.className}:${hero.gender}:${hero.ancestry}`;
  const [failedPortraits, setFailedPortraits] = useState<Record<string, string[]>>({});
  const portraits: Partial<Record<`${HeroClass}:${HeroGender}:${HeroAncestry}`, string[]>> = {
    "Warrior:female:Human": ["/images/characters/warrior-female-human-full.webp", "/images/characters/warrior-female-human.webp"],
    "Warrior:male:Human": ["/images/characters/warrior-male-human-full.webp"],
    "Warrior:female:Elf": ["/images/characters/warrior-female-elf-full.webp"],
    "Warrior:male:Elf": ["/images/characters/warrior-male-elf-full.webp"],
    "Warrior:female:Dwarf": ["/images/characters/warrior-female-dwarf-full.webp"],
    "Warrior:male:Dwarf": ["/images/characters/warrior-male-dwarf-full.webp"],
    "Warrior:female:Half-Orc": ["/images/characters/warrior-female-half-orc-full.webp"],
    "Warrior:male:Half-Orc": ["/images/characters/warrior-male-half-orc-full.webp"],
    "Mage:female:Human": ["/images/characters/mage-female-human-full.webp", "/images/characters/mage-female-human.webp"],
    "Mage:male:Human": ["/images/characters/mage-male-human-full.webp"],
    "Mage:female:Elf": ["/images/characters/mage-female-elf-full.webp"],
    "Mage:male:Elf": ["/images/characters/mage-male-elf-full.webp"],
    "Mage:female:Dwarf": ["/images/characters/mage-female-dwarf-full.webp"],
    "Mage:male:Dwarf": ["/images/characters/mage-male-dwarf-full.webp"],
    "Mage:female:Half-Orc": ["/images/characters/mage-female-half-orc-full.webp"],
    "Mage:male:Half-Orc": ["/images/characters/mage-male-half-orc-full.webp"],
    "Rogue:female:Human": ["/images/characters/rogue-female-human-full.webp", "/images/characters/rogue-female-human.webp"],
    "Rogue:male:Human": ["/images/characters/rogue-male-human-full.webp"],
    "Rogue:female:Elf": ["/images/characters/rogue-female-elf-full.webp"],
    "Rogue:male:Elf": ["/images/characters/rogue-male-elf-full.webp"],
    "Rogue:female:Dwarf": ["/images/characters/rogue-female-dwarf-full.webp"],
    "Rogue:male:Dwarf": ["/images/characters/rogue-male-dwarf-full.webp"],
    "Rogue:female:Half-Orc": ["/images/characters/rogue-female-half-orc-full.webp"],
    "Rogue:male:Half-Orc": ["/images/characters/rogue-male-half-orc-full.webp"],
    "Ranger:female:Human": ["/images/characters/ranger-female-human-full.webp", "/images/characters/ranger-female-human.webp"],
    "Ranger:male:Human": ["/images/characters/ranger-male-human-full.webp"],
    "Ranger:female:Elf": ["/images/characters/ranger-female-elf-full.webp"],
    "Ranger:male:Elf": ["/images/characters/ranger-male-elf-full.webp"],
    "Ranger:female:Dwarf": ["/images/characters/ranger-female-dwarf-full.webp"],
    "Ranger:male:Dwarf": ["/images/characters/ranger-male-dwarf-full.webp"],
    "Ranger:female:Half-Orc": ["/images/characters/ranger-female-half-orc-full.webp"],
    "Ranger:male:Half-Orc": ["/images/characters/ranger-male-half-orc-full.webp"],
    "Paladin:female:Human": ["/images/characters/paladin-female-human-full.webp", "/images/characters/paladin-female-human.webp"],
    "Paladin:male:Human": ["/images/characters/paladin-male-human-full.webp"],
    "Paladin:female:Elf": ["/images/characters/paladin-female-elf-full.webp"],
    "Paladin:male:Elf": ["/images/characters/paladin-male-elf-full.webp"],
    "Paladin:female:Dwarf": ["/images/characters/paladin-female-dwarf-full.webp"],
    "Paladin:male:Dwarf": ["/images/characters/paladin-male-dwarf-full.webp"],
    "Paladin:female:Half-Orc": ["/images/characters/paladin-female-half-orc-full.webp"],
    "Paladin:male:Half-Orc": ["/images/characters/paladin-male-half-orc-full.webp"],
  };
  const portraitCandidates = portraits[portraitKey] ?? [];
  const failedForHero = failedPortraits[portraitKey] ?? [];
  const portrait = portraitCandidates.find(candidate => !failedForHero.includes(candidate));
  const armor: Record<HeroClass, string> = { Warrior: "#9b7651", Ranger: "#55705a", Mage: "#645b91", Rogue: "#54545b", Paladin: "#b49a5d" };
  const skin: Record<HeroAncestry, string> = { Human: "#c99069", Elf: "#e0b58e", Dwarf: "#b97b56", "Half-Orc": "#8d9b69" };
  const hair: Record<HeroGender, string> = { female: "#3c2925", male: "#30231f" };
  const isElf = hero.ancestry === "Elf";
  const isDwarf = hero.ancestry === "Dwarf";
  const isOrc = hero.ancestry === "Half-Orc";
  const cape = hero.className === "Mage" ? "#37325c" : hero.className === "Paladin" ? "#6b2926" : hero.className === "Ranger" ? "#293e31" : "#332b27";
  const weapon = hero.className === "Mage" ? "staff" : hero.className === "Ranger" ? "bow" : hero.className === "Rogue" ? "dagger" : "sword";
  if (portrait) {
    return <img
      key={`${portraitKey}:${portrait}`}
      className={large ? "hero-portrait hero-portrait-large" : "hero-portrait"}
      src={portrait}
      alt={`${hero.gender} ${hero.ancestry} ${hero.className}`}
      onError={() => setFailedPortraits(current => {
        const failed = current[portraitKey] ?? [];
        return failed.includes(portrait) ? current : { ...current, [portraitKey]: [...failed, portrait] };
      })}
    />;
  }
  return <svg className={large ? "hero-art hero-art-large" : "hero-art"} viewBox="0 0 220 360" role="img" aria-label={`${hero.gender} ${hero.ancestry} ${hero.className} full-body avatar`}>
    <defs><linearGradient id="avatar-metal" x1="0" x2="1"><stop offset="0" stopColor="#655b4c"/><stop offset=".5" stopColor="#d0bd94"/><stop offset="1" stopColor="#51483c"/></linearGradient><linearGradient id="avatar-cloak" x1="0" y1="0" x2="1" y2="1"><stop stopColor={cape}/><stop offset="1" stopColor="#171715"/></linearGradient></defs>
    <ellipse cx="110" cy="337" rx="63" ry="10" fill="#000" opacity=".45"/>
    <path d="M77 144 L52 214 L70 276 L89 271 L95 206 L110 180 L125 206 L132 271 L151 276 L169 214 L143 144Z" fill="url(#avatar-cloak)" stroke="#a98b56" strokeWidth="1.5"/>
    <path d="M86 239 L82 311 L101 311 L110 248 L119 248 L128 311 L147 311 L137 239Z" fill={armor[hero.className]} stroke="#d2b77a" strokeWidth="1.5"/>
    <path d="M82 304 L78 326 L104 326 L103 310 M128 310 L127 326 L153 326 L147 304" fill="#292723" stroke="#b8a77e" strokeWidth="2"/>
    <path d="M78 144 Q110 129 142 144 L149 211 Q110 231 71 211Z" fill={armor[hero.className]} stroke="#d4bc85" strokeWidth="2"/>
    <path d="M88 148 L110 164 L132 148 L127 205 L110 217 L93 205Z" fill="#292823" stroke="#8e784f" strokeWidth="1.5"/>
    <path d="M94 163 L110 176 L126 163" fill="none" stroke="#d9c18d" strokeWidth="2"/>
    <circle cx="110" cy="188" r="6" fill={hero.className === "Mage" ? "#a7baff" : hero.className === "Paladin" ? "#e9d99d" : "#8f4b3b"} stroke="#ead9ad" strokeWidth="1.5"/>
    <path d="M79 150 L62 162 L54 204 L67 209 L87 176 M141 150 L158 162 L166 204 L153 209 L133 176" fill={armor[hero.className]} stroke="#c3a66e" strokeWidth="2"/>
    <circle cx="61" cy="207" r="9" fill={skin[hero.ancestry]} stroke="#d5b38c" strokeWidth="1.5"/><circle cx="159" cy="207" r="9" fill={skin[hero.ancestry]} stroke="#d5b38c" strokeWidth="1.5"/>
    <path d="M90 79 Q110 58 130 79 L133 122 Q127 145 110 148 Q93 145 87 122Z" fill={skin[hero.ancestry]} stroke="#3a2b25" strokeWidth="2"/>
    <path d={hero.gender === "female" ? "M86 100 Q72 69 91 54 Q112 39 130 57 Q148 76 134 111 L129 81 Q110 96 91 78Z" : "M86 88 Q82 53 108 48 Q135 49 135 86 L126 72 L95 72Z"} fill={hair[hero.gender]} stroke="#1c1715" strokeWidth="2"/>
    {hero.gender === "female" && <path d="M88 80 Q73 100 82 136 L91 146 L93 100 M132 80 Q147 100 138 136 L129 146 L127 100" fill={hair[hero.gender]}/>}
    {isElf && <><path d="M91 83 L69 69 L81 98Z" fill={skin[hero.ancestry]} stroke="#5b4938" strokeWidth="1.5"/><path d="M129 83 L151 69 L139 98Z" fill={skin[hero.ancestry]} stroke="#5b4938" strokeWidth="1.5"/></>}
    {isDwarf && <path d="M91 112 Q110 137 129 112 L125 137 L110 151 L95 137Z" fill={hair[hero.gender]} stroke="#5b382a" strokeWidth="1.5"/>}
    {isOrc && <><path d="M94 119 L99 130 L104 119 M116 119 L121 130 L126 119" fill="#f2e7c9" stroke="#f2e7c9" strokeWidth="2"/><path d="M88 99 L98 102 M122 102 L132 99" stroke="#4d5a38" strokeWidth="3"/></>}
    <path d="M96 103 L103 103 M117 103 L124 103" stroke="#30231f" strokeWidth="2.5"/><path d="M105 121 Q110 125 115 121" fill="none" stroke="#6d3e32" strokeWidth="2"/>
    {hero.className === "Warrior" && <path d="M92 145 L110 161 L128 145" fill="none" stroke="#d7c28d" strokeWidth="3"/>}
    {hero.className === "Mage" && <><path d="M83 77 L110 35 L137 77Z" fill="#423a6c" stroke="#d4bd7d" strokeWidth="2"/><circle cx="110" cy="59" r="4" fill="#b6c7ff"/></>}
    {hero.className === "Ranger" && <path d="M84 150 Q110 170 136 150" fill="none" stroke="#9e754b" strokeWidth="5"/>}
    {hero.className === "Rogue" && <path d="M85 90 L110 78 L135 90 L130 110 L90 110Z" fill="#38383e" opacity=".8"/>}
    {hero.className === "Paladin" && <path d="M110 147 L117 165 L136 168 L121 181 L125 201 L110 190 L95 201 L99 181 L84 168 L103 165Z" fill="#e4d49d" stroke="#7c6a41" strokeWidth="1.5"/>}
    {weapon === "sword" && <g transform="translate(157 169) rotate(17)"><path d="M0 0 L7 -67 L14 0Z" fill="url(#avatar-metal)" stroke="#e5d5ae" strokeWidth="1.2"/><path d="M-5 0 L19 0 L16 7 L-2 7Z" fill="#8d6539"/><path d="M6 7 L8 26" stroke="#8d6539" strokeWidth="5"/></g>}
    {weapon === "dagger" && <g transform="translate(157 185) rotate(22)"><path d="M0 0 L7 -34 L14 0Z" fill="url(#avatar-metal)" stroke="#e5d5ae" strokeWidth="1.2"/><path d="M-3 0 L17 0" stroke="#8d6539" strokeWidth="4"/></g>}
    {weapon === "staff" && <g transform="translate(163 300) rotate(5)"><path d="M0 0 L-3 -211" stroke="#9a7549" strokeWidth="6"/><circle cx="-3" cy="-220" r="11" fill="#8e9fd8" stroke="#d6d5ff" strokeWidth="2"/><circle cx="-3" cy="-220" r="4" fill="#fff"/></g>}
    {weapon === "bow" && <g transform="translate(48 174)"><path d="M0 -42 Q-27 0 0 42" fill="none" stroke="#b58a4e" strokeWidth="5"/><path d="M0 -42 L0 42" stroke="#e6d9b6" strokeWidth="1.5"/><path d="M-2 0 L20 -38" stroke="#b58a4e" strokeWidth="2"/></g>}
    <path d="M93 226 L127 226 M91 236 L129 236" stroke="#dfc58c" strokeWidth="2" opacity=".85"/>
    <path d="M102 258 L118 258" stroke="#392e23" strokeWidth="3"/>
  </svg>;
}

export default function App() {
  const [game, setGame] = useState<SaveState>(initialState);
  const [party, setParty] = useState(initialParty);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);
  const [showScenarioPicker, setShowScenarioPicker] = useState(false);
  const [showCharacterCreator, setShowCharacterCreator] = useState(false);
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState(() => {
    try { return Boolean(localStorage.getItem("dungeon-crawl-save-v1")); } catch { return false; }
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [pendingScenarioId, setPendingScenarioId] = useState<ScenarioId>("lost-heir");
  const [heroDraft, setHeroDraft] = useState<Hero>(defaultHero);
  const [tab, setTab] = useState<"journal" | "inventory">("journal");
  const pendingRewardClaims = useRef(new Set<string>());

  useEffect(() => {
    if (gameStarted) {
      localStorage.setItem("dungeon-crawl-save-v1", JSON.stringify(game));
      setHasSavedGame(true);
    }
  }, [game, gameStarted]);

  const activeScenario = scenarios[game.scenarioId];
  const copy = scenarioCopy[game.scenarioId];
  const exploredChoices = visibleExploredChoices(game.explored);
  const claimExplorationReward = (rewardId: string) => {
    const claim = claimRewardOnce(game.explored, pendingRewardClaims.current, game.scenarioId, rewardId, REWARD_MARKER_PREFIX);
    if (!claim.claimed) return false;
    pendingRewardClaims.current = claim.pendingClaims;
    setGame(g => g.explored.includes(claim.marker) ? g : { ...g, explored: [...g.explored, claim.marker] });
    return true;
  };
  const startScenario = (id: ScenarioId) => {
    setPendingScenarioId(id);
    setShowScenarioPicker(false);
    setShowCharacterCreator(true);
  };

  const beginAdventure = () => {
    pendingRewardClaims.current.clear();
    setLoadError(null);
    const id = pendingScenarioId;
    const selected = scenarios[id];
    const hero = { ...heroDraft, name: heroDraft.name.trim() || "Nameless Adventurer" };
    setShowDifficultyModal(false);
    const classInfo = classDetails[hero.className];
    const difficultyHp = hero.difficulty === "Story" ? 6 : hero.difficulty === "Hard" ? -4 : 0;
    const maxHp = Math.max(12, classInfo.hp + difficultyHp);
    const classGear: Record<HeroClass, string[]> = {
      Warrior: ["Ancestral longsword", "Reinforced armor", "Shield"],
      Ranger: ["Recurve longbow", "Trail-worn leather", "Twin hunting knives"],
      Mage: ["Runed staff", "Warded robes", "Spellbook"],
      Rogue: ["Twin daggers", "Shadow leather", "Lockpicks"],
      Paladin: ["Oathbound blade", "Sanctified plate", "Holy emblem"],
    };
    const scenarioGear = id === "lost-heir" ? ["Signet of the First King"] : id === "plague-below" ? ["Sealed respirator"] : ["Dragon-glass compass"];
    const next: SaveState = {
      ...initialState, scenarioId: id, scene: "gate", hero, hp: maxHp, maxHp,
      inventory: [...classGear[hero.className], "5 torches", "50 ft rope", "3 days of rations", ...scenarioGear],
      log: [
        { text: "New campaign started: " + selected.title + ".", kind: "good" },
        { text: hero.name + " begins this adventure as a " + hero.ancestry + " " + hero.className + " (" + hero.gender + ").", kind: "good" },
        { text: id === "lost-heir" ? "Your signet has awakened. Brom, Lyra, and Mira join your expedition." : id === "plague-below" ? "Brom, Lyra, and Mira join your expedition. Keep your masks sealed." : "Brom, Lyra, and Mira join your expedition. The dragon has not stirred—yet." },
        { text: getSceneNarrative(id, "gate", "solo").quote, kind: "danger" }
      ],
      explored: [], enemyHp: 22, enemyMaxHp: 22, round: 1, lastRoll: null
    };
    setGame(next); setParty(initialParty); setTab("journal"); setShowCharacterCreator(false); setShowStartScreen(false); setGameStarted(true);
  };

  const loadSavedGame = () => {
    try {
      const raw = localStorage.getItem("dungeon-crawl-save-v1");
      if (!raw) { setHasSavedGame(false); return; }
      const parsed: unknown = JSON.parse(raw);
      const validated = validateSaveData(parsed, SAVE_VALIDATION_CONFIG);
      if (!validated) {
        setLoadError("Saved campaign data is invalid or incompatible. Your existing save was left untouched.");
        return;
      }
      let loaded = validated;
      loaded = migrateLegacyRewardClaims(loaded);
      if (loaded.scenarioId === "lost-heir" && hasRewardClaim(loaded.explored, "lost-heir", "contract-insight", REWARD_MARKER_PREFIX) && !loaded.inventory.includes("Silver key")) {
        loaded = { ...loaded, inventory: addLostHeirSilverKey(loaded.scenarioId, loaded.inventory, true) };
      }
      pendingRewardClaims.current.clear();
      setLoadError(null);
      setGame(loaded); setHeroDraft(loaded.hero); setParty(initialParty); setShowStartScreen(false); setGameStarted(true);
    } catch {
      setLoadError("Saved campaign data could not be read. Your existing save was left untouched.");
    }
  };

  const addLog = (entries: LogEntry[]) => setGame(g => ({ ...g, log: [...g.log, ...entries].slice(-40) }));
  const check = (label: string, bonus = 0, dc = 12) => {
    const result = resolveCheck(rollDie(20), bonus, dc);
    addLog([{ text: `${label}: d20 (${result.die}) ${bonus >= 0 ? "+" : ""}${bonus} = ${result.total} vs DC ${dc} — ${result.success ? "SUCCESS" : "FAILURE"}`, kind: result.success ? "good" : "danger" }]);
    setGame(g => ({ ...g, lastRoll: result.die }));
    return result.success;
  };

  const updateParty = (damage: number) => setParty(p => p.map((member, i) =>
    i === 0 ? { ...member, hp: Math.max(0, member.hp - damage) } : member
  ));

  const startCombat = () => {
    setGame(g => ({ ...g, scene: "combat", enemyHp: g.enemyMaxHp, round: 1 }));
    addLog([{ text: `COMBAT: ${copy.enemyArrival}`, kind: "danger" }]);
  };

  const attack = () => {
    const bonus = classDetails[game.hero.className].attackBonus;
    const result = rollPlayerAttack(bonus);
    const afterHit = Math.max(0, game.enemyHp - result.damage);
    const entries: LogEntry[] = [{ text: `${game.hero.name} attacks: d20 (${result.die}) + ${bonus}. ${result.hit ? `Hit for ${result.damage} damage!` : "Miss!"}`, kind: result.hit ? "good" : "danger" }];
    if (afterHit <= 0) {
      entries.push({ text: copy.enemyDefeat, kind: "good" });
      setGame(g => ({ ...g, scene: "victory", enemyHp: 0, xp: g.xp + 50, gold: g.gold + 15, log: [...g.log, ...entries] }));
      return;
    }
    const enemyDamage = rollEnemyDamage(game.hero.difficulty);
    const newHp = Math.max(0, game.hp - enemyDamage.total);
    entries.push({ text: `The ${copy.enemyName} retaliates for ${enemyDamage.total} damage.`, kind: "danger" });
    if (newHp === 0) entries.push({ text: `${game.hero.name} falls unconscious. Use a healing potion or retreat.`, kind: "danger" });
    setGame(g => ({ ...g, enemyHp: afterHit, hp: newHp, round: g.round + 1, log: [...g.log, ...entries] }));
  };

  const usePotion = () => {
    if (game.potions <= 0 || game.hp === game.maxHp) return;
    const dieOne = rollDie(4);
    const dieTwo = rollDie(4);
    setGame(g => {
      const healing = resolvePotionHealing(g.hp, g.maxHp, dieOne, dieTwo);
      return { ...g, hp: healing.hp, potions: g.potions - 1, log: [...g.log, { text: `Healing potion: rolled ${healing.rolled} HP; restored ${healing.restored} HP.`, kind: "good" }] };
    });
  };

  const choose = (scene: Scene, title: string, description: string, action: () => void) => (
    <button className="choice" onClick={() => { action(); setGame(g => ({ ...g, explored: g.explored.includes(title) ? g.explored : [...g.explored, title] })); }}>
      <span className="choice-letter">{title.slice(0, 1)}</span><span><strong>{title}</strong><small>{description}</small></span><span className="arrow">↗</span>
    </button>
  );

  const sceneContent = useMemo(() => {
    switch (game.scene) {
      case "gate": case "blood-door": case "well": case "armory": case "contract": return getSceneNarrative(game.scenarioId, game.scene, "solo");
      case "combat": return game.scenarioId === "plague-below" ? { eyebrow: "ENCOUNTER · ROUND " + game.round, title: "Spore-Twisted Warden", art: "combat", body: "A quarantine warden staggers out of the mist, armor split by pale fungal growth. Spores spill from its visor as it raises a rusted blade.", quote: "“INFECTION DETECTED. PURGE INITIATED.”" } : game.scenarioId === "dragon-hoard" ? { eyebrow: "ENCOUNTER · ROUND " + game.round, title: "Hoardbound Guardian", art: "combat", body: "A dragon-forged guardian unfolds from a pile of coins. Molten light shines through its scales of black glass.", quote: "“THIEF. YOUR NAME WILL JOIN THE HOARD.”" } : { eyebrow: "ENCOUNTER · ROUND " + game.round, title: "Crownbound Sentinel", art: "combat", body: "A suit of royal armor pulls itself upright. Green fire burns inside its empty visor. Its sword points at your heart.", quote: "“UNRECOGNIZED HEIR. SUBMIT FOR JUDGMENT.”" };
      case "victory": return game.scenarioId === "plague-below" ? { eyebrow: "ENCOUNTER COMPLETE", title: "The Warden Falls", art: "victory", body: "The infected warden collapses. A sealed sample case and a brass access key remain in the debris.", quote: "Somewhere below, the quarantine bells begin to ring again." } : game.scenarioId === "dragon-hoard" ? { eyebrow: "ENCOUNTER COMPLETE", title: "The Guardian Shatters", art: "victory", body: "The guardian breaks apart into black glass and gold. A dragon-scale key gleams among the coins.", quote: "Far above, something vast shifts in its sleep." } : { eyebrow: "ENCOUNTER COMPLETE", title: "The Sentinel Falls", art: "victory", body: "The ancient armor collapses. Beneath the ash, a silver key gleams beside a fragment of a royal banner. Your signet cools for the first time since you entered.", quote: "Somewhere deeper in the dungeon, a second gate begins to open." };
    }
  }, [game.scene, game.round, game.scenarioId, activeScenario]);

  const reset = () => { setHeroDraft(defaultHero); setShowStartScreen(false); setShowScenarioPicker(true); };
  const alive = game.hp > 0;
  const heroClassInfo = classDetails[game.hero.className];

  if (showStartScreen) return (
    <div className="start-screen">
      <div className="start-emblem">✦</div>
      <div className="start-kicker">A DARK FANTASY ROLE-PLAYING ADVENTURE</div>
      <h1>DUNGEON<span>CRAWL</span></h1>
      <p className="start-tagline">Your choices shape the legend.</p>
      <div className="start-menu">
        <div className="section-kicker">YOUR ADVENTURE AWAITS</div>
        <button className="start-primary" disabled={!hasSavedGame} onClick={loadSavedGame}><span>↻</span><div><strong>Load saved game</strong><small>{hasSavedGame ? "Continue where your last adventure ended" : "No saved adventure found in this browser"}</small></div><b>→</b></button>
        <button className="start-primary" onClick={() => { setHeroDraft(defaultHero); setShowStartScreen(false); setShowScenarioPicker(true); }}><span>✦</span><div><strong>Start a new game</strong><small>Choose a campaign and create your hero</small></div><b>→</b></button>
        <button className="start-primary" onClick={() => setShowMultiplayerLobby(true)}><span>♧</span><div><strong>Play online</strong><small>Create or join a temporary shared campaign</small></div><b>→</b></button>
        {showMultiplayerLobby && <MultiplayerLobby onClose={() => setShowMultiplayerLobby(false)} />}
        {loadError && <p className="start-footnote" role="alert">{loadError}</p>}
        <p className="start-footnote">Saved games are stored in this browser on this device.</p>
      </div>
      <div className="start-worlds"><span>THE LOST HEIR</span><i>✦</i><span>THE PLAGUE BELOW</span><i>✦</i><span>THE DRAGON'S HOARD</span></div>
    </div>
  );

  return (
    <div className="app-shell">
      {showCharacterCreator && <div className="scenario-overlay creator-overlay" role="dialog" aria-modal="true" aria-labelledby="character-title"><div className="scenario-modal character-modal creator-modal">
        <div className="section-kicker">CREATE YOUR HERO · {scenarios[pendingScenarioId].title.toUpperCase()}</div>
        <h2 id="character-title">Shape your legend</h2>
        <p className="scenario-lead">Choose your lineage and calling. Your avatar, starting attributes, and origin story update as you build your hero.</p>
        <div className="creator-identity">
          <label>Character name<input value={heroDraft.name} maxLength={24} onChange={e => setHeroDraft(h => ({ ...h, name: e.target.value }))} placeholder="Enter your hero's name" /></label>
          <div className="character-field"><span>Gender</span><div className="gender-options"><button type="button" className={heroDraft.gender === "female" ? "selected" : ""} onClick={() => setHeroDraft(h => ({ ...h, gender: "female" }))}>♀ Female</button><button type="button" className={heroDraft.gender === "male" ? "selected" : ""} onClick={() => setHeroDraft(h => ({ ...h, gender: "male" }))}>♂ Male</button></div></div>
        </div>
        <div className="creator-layout">
          <section className="creator-options">
            <label>Class<select value={heroDraft.className} onChange={e => setHeroDraft(h => ({ ...h, className: e.target.value as HeroClass }))}>{classOrder.map(c => <option key={c}>{c}</option>)}</select><small>{classProfiles[heroDraft.className].role} · {classProfiles[heroDraft.className].strengths}</small></label>
            <label>Ancestry<select value={heroDraft.ancestry} onChange={e => setHeroDraft(h => ({ ...h, ancestry: e.target.value as HeroAncestry }))}>{ancestryOrder.map(a => <option key={a}>{a}</option>)}</select><small>{ancestryDetails[heroDraft.ancestry].trait} · {ancestryDetails[heroDraft.ancestry].description}</small></label>
            <label>Background<select value={heroDraft.background} onChange={e => setHeroDraft(h => ({ ...h, background: e.target.value as HeroBackground }))}>{(["Noble","Outlander","Scholar","Mercenary"] as HeroBackground[]).map(b => <option key={b}>{b}</option>)}</select><small>{backgroundProfiles[heroDraft.background]}</small></label>
            <div className="creator-class-card"><span className="section-kicker">CLASS CHARACTERISTICS</span><strong>{heroDraft.className}</strong><p>{classProfiles[heroDraft.className].strengths}</p><div className="creator-gear"><span>Weapon</span><b>{classDetails[heroDraft.className].weapon}</b></div><div className="creator-gear"><span>Armor</span><b>{classDetails[heroDraft.className].armor}</b></div></div>
            <div className="creator-class-card ancestry-card"><span className="section-kicker">ANCESTRY CHARACTERISTICS</span><strong>{heroDraft.ancestry} · {ancestryDetails[heroDraft.ancestry].trait}</strong><p>{ancestryDetails[heroDraft.ancestry].description}</p><div className="bonus-tags">{Object.entries(ancestryDetails[heroDraft.ancestry].bonuses).map(([stat, bonus]) => <span key={stat}>{stat} +{bonus}</span>)}</div></div>
          </section>
          <section className="creator-preview-column">
            <div className="avatar-stage"><div className="avatar-glow"/><HeroAvatar hero={heroDraft} large/><div className="avatar-caption"><strong>{heroDraft.name.trim() || "Nameless Adventurer"}</strong><span>{heroDraft.gender === "female" ? "Female" : "Male"} {heroDraft.ancestry} {heroDraft.className}</span><small>{classDetails[heroDraft.className].hp} base HP · {classDetails[heroDraft.className].weapon}</small></div></div>
            <div className="creator-stat-sheet"><div className="sheet-heading"><span className="section-kicker">STARTING CHARACTER SHEET</span><b>{classDetails[heroDraft.className].hp} BASE HP</b></div><div className="creator-stat-grid">{getHeroStats(heroDraft).map(([stat, score, mod]) => <div className="creator-stat" key={stat}><span>{stat}</span><strong>{score}</strong><small>{mod} modifier</small></div>)}</div><div className="sheet-notes"><div><span>Starting weapon</span><strong>{classDetails[heroDraft.className].weapon}</strong></div><div><span>Starting armor</span><strong>{classDetails[heroDraft.className].armor}</strong></div><div><span>Ancestry trait</span><strong>{ancestryDetails[heroDraft.ancestry].trait}</strong></div></div></div>
            <div className="origin-story"><span className="section-kicker">YOUR ORIGIN STORY</span><p>{heroOriginStory(heroDraft)}</p></div>
          </section>
        </div>
        <div className="character-actions"><button className="secondary-button" onClick={() => { setShowCharacterCreator(false); setShowScenarioPicker(true); }}>Back to campaigns</button><button className="primary-button" onClick={() => setShowDifficultyModal(true)}>Begin adventure ↗</button></div>
      </div></div>}
      {showDifficultyModal && <div className="scenario-overlay difficulty-overlay" role="dialog" aria-modal="true" aria-labelledby="difficulty-title"><div className="scenario-modal difficulty-modal"><div className="section-kicker">FINAL PREPARATIONS</div><h2 id="difficulty-title">Choose your difficulty</h2><p className="scenario-lead">Set the challenge before entering {scenarios[pendingScenarioId].title}. You can review the impact before committing.</p><div className="difficulty-options">
        <button className={heroDraft.difficulty === "Story" ? "difficulty-card selected" : "difficulty-card"} onClick={() => setHeroDraft(h => ({ ...h, difficulty: "Story" }))}><span className="difficulty-mark">I</span><strong>Story</strong><small>Focus on exploration and narrative.</small><ul><li>+6 starting HP</li><li>Forgiving combat pace</li><li>Best for a relaxed first run</li></ul></button>
        <button className={heroDraft.difficulty === "Balanced" ? "difficulty-card selected" : "difficulty-card"} onClick={() => setHeroDraft(h => ({ ...h, difficulty: "Balanced" }))}><span className="difficulty-mark">II</span><strong>Balanced</strong><small>A fair test of tactics and choices.</small><ul><li>Class base HP</li><li>Standard enemy damage</li><li>Recommended default</li></ul></button>
        <button className={heroDraft.difficulty === "Hard" ? "difficulty-card selected" : "difficulty-card"} onClick={() => setHeroDraft(h => ({ ...h, difficulty: "Hard" }))}><span className="difficulty-mark">III</span><strong>Hard</strong><small>Every mistake can cost you.</small><ul><li>−4 starting HP</li><li>Less room for mistakes</li><li>For experienced adventurers</li></ul></button>
      </div><div className="character-actions"><button className="secondary-button" onClick={() => setShowDifficultyModal(false)}>Back to hero</button><button className="primary-button" onClick={beginAdventure}>Enter the dungeon ↗</button></div></div></div>}{showScenarioPicker && <div className="scenario-overlay" role="dialog" aria-modal="true" aria-labelledby="scenario-title"><div className="scenario-modal"><div className="section-kicker">START A NEW CAMPAIGN</div><h2 id="scenario-title">Choose your adventure</h2><p className="scenario-lead">Pick a world to explore. Starting a new campaign resets the current run; your other browser data remains untouched.</p><div className="scenario-grid">{(Object.values(scenarios) as Scenario[]).map(s => <button key={s.id} className={"scenario-card " + s.id} onClick={() => startScenario(s.id)}><span className="scenario-symbol">{s.id === "lost-heir" ? "♛" : s.id === "plague-below" ? "☣" : "🐉"}</span><strong>{s.title}</strong><small>{s.tagline}</small><span className="scenario-start">START ADVENTURE ↗</span></button>)}</div><button className="secondary-button scenario-cancel" onClick={() => { setShowScenarioPicker(false); setShowStartScreen(true); }}>Back to main menu</button></div></div>}
      <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">✦</span><span>DUNGEON<span className="brand-muted">CRAWL</span><small> {activeScenario.title.toUpperCase()} CAMPAIGN</small></span></a><div className="top-actions"><span className="online-dot"/> <span className="prototype-label">SINGLE-PLAYER PROTOTYPE</span><button className="ghost-button" onClick={reset} title="Return to main menu">↻ <span>New game</span></button></div></header>
      <main className="layout">
        <aside className="sidebar">
          <div className="section-kicker">YOUR HERO</div>
          <div className="hero-card"><div className="hero-avatar"><HeroAvatar hero={game.hero}/></div><div><h2>{game.hero.name}</h2><p>{game.hero.ancestry} · {game.hero.className}</p><span className="level-pill">LEVEL 1 · {game.hero.gender.toUpperCase()}</span></div></div>
          <div className="stat-line"><span>❤️ Health</span><strong>{game.hp} <i>/ {game.maxHp}</i></strong></div><div className="meter"><span className={game.hp < 9 ? "low" : ""} style={{ width: `${game.hp / game.maxHp * 100}%` }}/></div>
          <div className="stat-line"><span>✦ Experience</span><strong>{game.xp} <i>/ 100 XP</i></strong></div><div className="meter xp"><span style={{ width: `${Math.min(100, game.xp)}%` }}/></div>
          <div className="stat-grid">{getHeroStats(game.hero).map(s => <div className="stat-tile" key={s[0]}><small>{s[0]}</small><strong>{s[1]}</strong><span>{s[2]}</span></div>)}</div>
          <div className="side-divider"/><div className="section-kicker">EQUIPMENT</div><div className="equipment"><span>⚔</span><div><strong>{heroClassInfo.weapon}</strong><small>{heroClassInfo.damage}</small></div></div><div className="equipment"><span>🛡</span><div><strong>{heroClassInfo.armor}</strong><small>Armor Class 16</small></div></div><div className="equipment"><span>🧪</span><div><strong>Healing Potions <b>×{game.potions}</b></strong><small>Restore 2d4 + 2 HP</small></div></div>
          <div className="side-divider"/><div className="section-kicker">PARTY COMPANIONS</div>{party.map(p => <div className="companion" key={p.name}><div className="companion-icon">{p.icon}</div><div className="companion-info"><strong>{p.name}</strong><small>{p.role}</small><div className="mini-meter"><span style={{ width: `${p.hp / p.maxHp * 100}%` }}/></div></div><b>{p.hp}<i>/{p.maxHp}</i></b></div>)}
          <div className="party-note">AI companions are simulated in this prototype. Networked player turns are planned for Phase 2.</div>
        </aside>
        <section className="main-column">
          <div className={`scene-art ${sceneContent.art}`}><div className="art-grain"/><div className="scene-badge"><span/> {sceneContent.eyebrow}</div><div className="art-title"><span>THE CHRONICLES OF</span><h1>{activeScenario.title.toUpperCase()}</h1><p>{activeScenario.tagline}</p></div><div className="art-rune">ᚷ</div></div>
          <article className="story-panel"><div className="chapter-label"><span>✦</span> {sceneContent.eyebrow}</div><h2>{sceneContent.title}</h2><p>{sceneContent.body}</p><blockquote>{sceneContent.quote}</blockquote>
            {game.scene === "combat" ? <div className="combat-panel"><div className="enemy-heading"><span>☠</span><div><strong>{copy.enemyName}</strong><small>{copy.enemyDescriptor} · AC 12</small></div><b>{game.enemyHp} / {game.enemyMaxHp} HP</b></div><div className="meter enemy-meter"><span style={{ width: `${game.enemyHp / game.enemyMaxHp * 100}%` }}/></div><div className="combat-actions"><button className="primary-button" onClick={attack} disabled={!alive || game.enemyHp <= 0}>⚔ Attack with {heroClassInfo.weapon.toLowerCase()}</button><button className="secondary-button" onClick={usePotion} disabled={game.potions <= 0 || game.hp === game.maxHp}>🧪 Drink potion ({game.potions})</button></div>{!alive && <button className="primary-button" onClick={() => { setGame(g => ({ ...g, hp: 12, scene: "gate", enemyHp: g.enemyMaxHp, log: [...g.log, { text: "The party drags you to safety. You recover with 12 HP; the encounter resets.", kind: "good" }] })); }}>Recover and retreat</button>}</div> : null}
            {game.scene === "gate" && <div className="choices"><div className="choices-heading">WHAT WILL YOU DO? <span>CHOOSE YOUR PATH</span></div>
              {choose("gate",activeScenario.gateChoices[0],game.scenarioId === "lost-heir" ? "Study the pedestal and faceless statues before committing." : game.scenarioId === "plague-below" ? "Study the quarantine records for clues to the outbreak." : "Study the runes before making a bargain.",() => { const success = check(game.scenarioId === "lost-heir" ? "Royal history" : game.scenarioId === "plague-below" ? "Medical investigation" : "Arcane lore", 1, 12); const reward = success && claimExplorationReward("gate-research"); setGame(g => ({ ...g, scene: "contract", xp: g.xp + (reward ? 10 : 0) })); })}
              {choose("gate",activeScenario.gateChoices[1],game.scenarioId === "lost-heir" ? "Answer the voice calling you Majesty." : game.scenarioId === "plague-below" ? "Investigate the sealed room where the first cases vanished." : "Approach the door that radiates heat.",() => { setGame(g => ({ ...g, scene: "blood-door" })); addLog([{ text: activeScenario.gateChoices[1] + ".", kind: "danger" }]); })}
              {choose("gate",activeScenario.gateChoices[2],game.scenarioId === "lost-heir" ? "Find the source of the warning about Brom." : game.scenarioId === "plague-below" ? "Trace the source of the strange spores." : "Look into the pool that reflects another sky.",() => { setGame(g => ({ ...g, scene: "well" })); addLog([{ text: activeScenario.gateChoices[2] + ".", kind: "danger" }]); })}
              {choose("gate",activeScenario.gateChoices[3],game.scenarioId === "lost-heir" ? "Look for supplies and clues among the abandoned weapons." : game.scenarioId === "plague-below" ? "Search for clean supplies and protective gear." : "Search for treasure without waking the dragon.",() => { setGame(g => ({ ...g, scene: "armory" })); addLog([{ text: activeScenario.gateChoices[3] + "." }]); })}
            </div>}
            {game.scene === "contract" && <div className="choices"><div className="choices-heading">{copy.contractHeading} <span>{copy.contractPrompt}</span></div>
              {choose("contract",copy.contractAction,copy.contractDescription,() => { const success = check(copy.contractCheck, 3, 13); const reward = success && claimExplorationReward("contract-insight"); setGame(g => ({ ...g, scene: success ? "victory" : "combat", xp: g.xp + (reward ? 15 : 0), inventory: reward ? addLostHeirSilverKey(game.scenarioId, g.inventory, true) : g.inventory, log: [...g.log, { text: !success ? copy.contractFailure : reward ? copy.contractSuccess : "You understand the discovery, but have already gained its experience.", kind: success ? "good" : "danger" }] })); if (!success) startCombat(); })}
              {choose("contract",copy.contractReturn,copy.contractReturnDescription,() => setGame(g => ({ ...g, scene: "gate" })))}
            </div>}
            {game.scene === "blood-door" && <div className="choices"><div className="choices-heading">{copy.doorHeading} <span>{copy.doorPrompt}</span></div>
              {choose("blood-door",copy.doorAction,copy.doorDescription,() => { const success = check(copy.doorCheck, 3, 13); if (success) { const keyReward = claimExplorationReward("sealed-door-key"); const xpReward = claimExplorationReward("sealed-door-insight"); setGame(g => ({ ...g, scene: "armory", xp: g.xp + (xpReward ? 15 : 0), inventory: keyReward ? [...g.inventory, "Blood-forged key"] : g.inventory, log: [...g.log, { text: keyReward ? `The seal breaks. You claim a key.${xpReward ? " +15 XP." : ""}` : "The seal opens, but you have already claimed what lay beyond.", kind: "good" }] })); } else startCombat(); })}
              {choose("blood-door",copy.doorForceAction,copy.doorForceDescription,() => { const success = check("Strength", 3, 14); if (success) { const keyReward = claimExplorationReward("sealed-door-key"); setGame(g => ({ ...g, scene: "armory", hp: Math.max(1, g.hp - 3), inventory: keyReward ? [...g.inventory, "Blood-forged key"] : g.inventory, log: [...g.log, { text: keyReward ? "The seal shatters. The recoil costs you 3 HP, but you claim a key." : "The seal shatters again. The recoil costs you 3 HP; the key was already claimed.", kind: "good" }] })); } else startCombat(); })}
              {choose("blood-door",copy.doorReturn,"Leave the sealed entrance for now.",() => setGame(g => ({ ...g, scene: "gate" })))}
            </div>}
            {game.scene === "well" && <div className="choices"><div className="choices-heading">{copy.wellHeading} <span>{copy.wellPrompt}</span></div>
              {choose("well","Ask Mira to examine the magic","Let Mira study the water's enchantment.",() => { const success = check("Arcana", 2, 12); const reward = success && claimExplorationReward("well-arcana"); setGame(g => ({ ...g, scene: "gate", xp: g.xp + (reward ? 10 : 0), log: [...g.log, { text: !success ? copy.wellAskFailure : reward ? copy.wellAskSuccess : "Mira's findings are clear, but you have already gained their experience.", kind: success ? "good" : "danger" }] })); })}
              {choose("well",copy.wellLookAction,copy.wellLookDescription,() => { const success = check("Wisdom", 1, 13); const reward = success && claimExplorationReward("well-observation"); setGame(g => ({ ...g, scene: success ? "contract" : "gate", hp: Math.max(1, g.hp - (success ? 0 : 2)), xp: g.xp + (reward ? 10 : 0), log: [...g.log, { text: !success ? copy.wellLookFailure : reward ? copy.wellLookSuccess : "The vision returns, but you have already gained its experience.", kind: success ? "good" : "danger" }] })); })}
              {choose("well",copy.wellReturn,"Leave the water undisturbed for now.",() => setGame(g => ({ ...g, scene: "gate" })))}
            </div>}
            {game.scene === "armory" && <div className="choices"><div className="choices-heading">{copy.armoryHeading} <span>{copy.armoryPrompt}</span></div>
              {choose("armory",copy.armorySearchAction,copy.armorySearchDescription,() => { const success = check("Investigation", 1, 12); const reward = success && claimExplorationReward("vault-cache"); setGame(g => ({ ...g, scene: success ? "victory" : "combat", xp: g.xp + (reward ? 15 : 0), gold: g.gold + (reward ? 10 : 0), inventory: reward ? [...g.inventory, "Royal ward charm"] : g.inventory, log: [...g.log, { text: !success ? copy.armorySearchFailure : reward ? copy.armorySearchSuccess : "The cache is empty of anything new; its reward has already been claimed.", kind: success ? "good" : "danger" }] })); if (!success) startCombat(); })}
              {choose("armory","Take a torch and study the tracks","Look for clues before disturbing anything.",() => { const success = check("Perception", 1, 11); const reward = success && claimExplorationReward("tracks"); setGame(g => ({ ...g, scene: "gate", xp: g.xp + (reward ? 5 : 0), log: [...g.log, { text: !success ? copy.armoryTracksFailure : reward ? copy.armoryTracksSuccess : "You recognize the tracks, but have already gained this insight.", kind: success ? "good" : "danger" }] })); })}
              {choose("armory",copy.armoryReturn,"Leave the supplies undisturbed for now.",() => setGame(g => ({ ...g, scene: "gate" })))}
            </div>}
            {game.scene === "victory" && <div className="victory-reward"><div className="reward-icon">♛</div><div><strong>Reward secured</strong><p>+50 XP · +15 gold · {copy.victoryTease}</p></div><button className="primary-button" onClick={() => { setGame(g => ({ ...g, scene: "gate", enemyHp: g.enemyMaxHp, log: [...g.log, { text: `You return to ${copy.hubName}, stronger and carrying new clues.`, kind: "good" }] })); }}>Continue expedition →</button></div>}
          </article>
          <section className="journal-panel"><div className="journal-head"><div><span className="section-kicker">CAMPAIGN RECORD</span><h3>Adventure log</h3></div><div className="tabs"><button className={tab === "journal" ? "active" : ""} onClick={() => setTab("journal")}>Journal</button><button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>Inventory</button></div></div>
            {tab === "journal" ? <div className="log-list">{game.log.slice().reverse().map((entry, i) => <div className={`log-entry ${entry.kind ?? ""}`} key={i}><span className="log-marker">{entry.kind === "danger" ? "!" : entry.kind === "good" ? "✦" : "·"}</span><p>{entry.text}</p></div>)}</div> : <div className="inventory-list">{game.inventory.map((item, i) => <span key={item + i}>✦ {item}</span>)}<span>🧪 Healing potions ×{game.potions}</span><span>◈ Gold: {game.gold} gp</span></div>}
          </section>
        </section>
        <aside className="rightbar"><div className="right-card"><div className="section-kicker">QUEST LOG</div><div className="quest-main"><span className="quest-icon">♜</span><div><strong>{copy.questTitle}</strong><small>Chapter I · Main quest</small></div></div><p>{copy.questDescription}</p><div className="quest-status"><span className="status-dot"/> In progress</div><div className="side-divider"/><div className="section-kicker">OBJECTIVES</div><div className="objective"><span className={exploredChoices.length ? "objective-check done" : "objective-check"}/><span>{copy.objectives[0]}</span></div><div className="objective"><span className={game.explored.includes(activeScenario.gateChoices[0]) ? "objective-check done" : "objective-check"}/><span>{copy.objectives[1]}</span></div><div className="objective"><span className={exploredChoices.length >= 2 ? "objective-check done" : "objective-check"}/><span>{copy.objectives[2]}</span></div><div className="side-divider"/><div className="section-kicker">CAMPAIGN DETAILS</div><div className="detail-row"><span>Difficulty</span><strong>{game.hero.difficulty}</strong></div><div className="detail-row"><span>Hero</span><strong>{game.hero.name}</strong></div><div className="detail-row"><span>Party</span><strong>4 adventurers</strong></div><div className="detail-row"><span>Gold</span><strong>◈ {game.gold} gp</strong></div><div className="detail-row"><span>Session</span><strong>Auto-saved</strong></div></div><div className="rules-card"><span>✧</span><strong>Every choice matters.</strong><p>Skill checks use a d20 plus your relevant bonus. Your campaign saves automatically in this browser.</p></div><div className="footer-note">BUILT FOR ADVENTURERS<br/>PROTOTYPE v0.1.0</div></aside>
      </main>
    </div>
  );
}
