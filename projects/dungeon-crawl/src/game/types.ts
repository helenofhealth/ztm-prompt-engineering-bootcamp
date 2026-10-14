export type Scene = "gate" | "blood-door" | "well" | "armory" | "contract" | "combat" | "victory";
export type ScenarioId = "lost-heir" | "plague-below" | "dragon-hoard";
export type LogEntry = { text: string; kind?: "roll" | "danger" | "good" };
export type PartyMember = { name: string; role: string; hp: number; maxHp: number; detail: string; icon: string };

export type HeroGender = "female" | "male";
export type HeroClass = "Warrior" | "Ranger" | "Mage" | "Rogue" | "Paladin";
export type HeroAncestry = "Human" | "Elf" | "Dwarf" | "Half-Orc";
export type HeroBackground = "Noble" | "Outlander" | "Scholar" | "Mercenary";
export type Hero = { name: string; gender: HeroGender; className: HeroClass; ancestry: HeroAncestry; background: HeroBackground; difficulty: "Story" | "Balanced" | "Hard" };

// Keep this shape identical to dungeon-crawl-save-v1 for existing solo saves.
export type SaveState = {
  scenarioId: ScenarioId; scene: Scene; hp: number; maxHp: number; gold: number; xp: number; potions: number;
  inventory: string[]; log: LogEntry[]; explored: string[]; enemyHp: number; enemyMaxHp: number;
  round: number; lastRoll: number | null; hero: Hero;
};
