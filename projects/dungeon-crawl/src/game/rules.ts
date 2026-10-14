import type { Hero, HeroAncestry, HeroBackground, HeroClass, LogEntry, SaveState, ScenarioId, Scene } from "./types";
import type { Ability } from "../multiplayer/protocol";

export type RandomSource = () => number;

const classAbilityScores: Record<HeroClass, Record<Ability, number>> = {
  Warrior: { STR: 16, DEX: 12, CON: 15, INT: 10, WIS: 13, CHA: 14 },
  Ranger: { STR: 12, DEX: 16, CON: 13, INT: 12, WIS: 15, CHA: 10 },
  Mage: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 14, CHA: 13 },
  Rogue: { STR: 10, DEX: 17, CON: 13, INT: 14, WIS: 12, CHA: 14 },
  Paladin: { STR: 16, DEX: 10, CON: 16, INT: 10, WIS: 13, CHA: 15 },
};
const ancestryAbilityBonuses: Record<HeroAncestry, Partial<Record<Ability, number>>> = {
  Human: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
  Elf: { DEX: 2, WIS: 1 },
  Dwarf: { CON: 2, STR: 1 },
  "Half-Orc": { STR: 2, CON: 1 },
};

export const getHeroAbilityScores = (hero: Hero): Record<Ability, number> => Object.fromEntries(
  (Object.keys(classAbilityScores[hero.className]) as Ability[]).map(ability => [
    ability,
    classAbilityScores[hero.className][ability] + (ancestryAbilityBonuses[hero.ancestry][ability] ?? 0),
  ]),
) as Record<Ability, number>;

export const getHeroAbilityModifier = (hero: Hero, ability: Ability): number => Math.floor((getHeroAbilityScores(hero)[ability] - 10) / 2);

// Mirrors the class attack bonuses used by the solo combat UI.
export const getHeroAttackBonus = (hero: Hero): number => hero.className === "Rogue" ? 6 : 5;

export const rollDie = (sides: number, random: RandomSource = Math.random): number => Math.floor(random() * sides) + 1;

export type CheckResult = { die: number; bonus: number; total: number; dc: number; success: boolean };

// Natural 20 succeeds and natural 1 fails for checks, as in the current solo game.
export const resolveCheck = (die: number, bonus = 0, dc = 12): CheckResult => ({
  die,
  bonus,
  total: die + bonus,
  dc,
  success: die === 20 || (die !== 1 && die + bonus >= dc),
});

export type PlayerAttackResult = { die: number; damageDie: number | null; bonus: number; total: number; ac: number; hit: boolean; damage: number };

// Natural 20 auto-hits; there is no extra critical damage or natural-1 miss rule.
export const rollPlayerAttack = (bonus: number, ac = 12, random: RandomSource = Math.random): PlayerAttackResult => {
  const die = rollDie(20, random);
  const total = die + bonus;
  const hit = total >= ac || die === 20;
  const damageDie = hit ? rollDie(8, random) : null;
  return { die, damageDie, bonus, total, ac, hit, damage: damageDie === null ? 0 : damageDie + 3 };
};

export type Difficulty = "Story" | "Balanced" | "Hard";
export type DamageRoll = { die: number; bonus: number; total: number; sides: 4 | 6 | 8 };

export const rollEnemyDamage = (difficulty: Difficulty, random: RandomSource = Math.random): DamageRoll => {
  const sides = difficulty === "Story" ? 4 : difficulty === "Hard" ? 8 : 6;
  const bonus = difficulty === "Story" ? 0 : difficulty === "Hard" ? 2 : 1;
  const die = rollDie(sides, random);
  return { die, bonus, total: die + bonus, sides };
};

export type PotionHealing = { dieOne: number; dieTwo: number; rolled: number; hp: number; restored: number };

export const resolvePotionHealing = (hp: number, maxHp: number, dieOne: number, dieTwo: number): PotionHealing => {
  const rolled = dieOne + dieTwo + 2;
  const nextHp = Math.min(maxHp, hp + rolled);
  return { dieOne, dieTwo, rolled, hp: nextHp, restored: nextHp - hp };
};

export type RewardClaimResult = { claimed: boolean; marker: string; pendingClaims: Set<string> };

export const hasRewardClaim = (explored: readonly string[], scenarioId: ScenarioId, rewardId: string, markerPrefix: string): boolean =>
  explored.includes(`${markerPrefix}${scenarioId}:${rewardId}`);

// Return a new pending set so the React ref can synchronously guard rapid clicks.
export const claimRewardOnce = (
  explored: readonly string[],
  pendingClaims: ReadonlySet<string>,
  scenarioId: ScenarioId,
  rewardId: string,
  markerPrefix: string,
): RewardClaimResult => {
  const marker = `${markerPrefix}${scenarioId}:${rewardId}`;
  if (hasRewardClaim(explored, scenarioId, rewardId, markerPrefix) || pendingClaims.has(marker)) return { claimed: false, marker, pendingClaims: new Set(pendingClaims) };
  const nextPending = new Set(pendingClaims);
  nextPending.add(marker);
  return { claimed: true, marker, pendingClaims: nextPending };
};

export const addLostHeirSilverKey = (scenarioId: ScenarioId, inventory: readonly string[], contractRewardClaimed: boolean): string[] => {
  if (scenarioId !== "lost-heir" || !contractRewardClaimed || inventory.includes("Silver key")) return [...inventory];
  return [...inventory, "Silver key"];
};

export type SaveValidationConfig = {
  fallback: SaveState;
  scenarioIds: readonly ScenarioId[];
  sceneIds: readonly Scene[];
  classBaseHp: Record<HeroClass, number>;
  ancestries: readonly HeroAncestry[];
  backgrounds: readonly HeroBackground[];
  rewardMarkerPrefix: string;
  rewardIds: readonly string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isOneOf = (value: unknown, allowed: readonly string[]): boolean => typeof value === "string" && allowed.includes(value);

export const validateSaveData = (value: unknown, config: SaveValidationConfig): SaveState | null => {
  const { fallback } = config;
  if (!isRecord(value)) return null;

  const scenarioId = value.scenarioId === undefined ? fallback.scenarioId : isOneOf(value.scenarioId, config.scenarioIds) ? value.scenarioId as ScenarioId : null;
  const scene = value.scene === undefined ? fallback.scene : isOneOf(value.scene, config.sceneIds) ? value.scene as Scene : null;
  if (!scenarioId || !scene) return null;

  const rawHero = value.hero === undefined ? {} : value.hero;
  if (!isRecord(rawHero)) return null;
  const heroName = rawHero.name === undefined ? fallback.hero.name : rawHero.name;
  const gender = rawHero.gender === undefined ? fallback.hero.gender : isOneOf(rawHero.gender, ["female", "male"]) ? rawHero.gender : null;
  const className = rawHero.className === undefined ? fallback.hero.className : isOneOf(rawHero.className, Object.keys(config.classBaseHp)) ? rawHero.className : null;
  const ancestry = rawHero.ancestry === undefined ? fallback.hero.ancestry : isOneOf(rawHero.ancestry, config.ancestries) ? rawHero.ancestry : null;
  const background = rawHero.background === undefined ? fallback.hero.background : isOneOf(rawHero.background, config.backgrounds) ? rawHero.background : null;
  const difficulty = rawHero.difficulty === undefined ? fallback.hero.difficulty : isOneOf(rawHero.difficulty, ["Story", "Balanced", "Hard"]) ? rawHero.difficulty : null;
  if (typeof heroName !== "string" || !heroName.trim() || heroName.length > 100 || !gender || !className || !ancestry || !background || !difficulty) return null;
  const hero = { name: heroName, gender: gender as SaveState["hero"]["gender"], className: className as HeroClass, ancestry: ancestry as HeroAncestry, background: background as HeroBackground, difficulty: difficulty as SaveState["hero"]["difficulty"] };

  const expectedMaxHp = Math.max(12, config.classBaseHp[hero.className] + (hero.difficulty === "Story" ? 6 : hero.difficulty === "Hard" ? -4 : 0));
  const readInteger = (key: string, defaultValue: number, min: number, max: number): number | null => {
    const item = value[key] === undefined ? defaultValue : value[key];
    return typeof item === "number" && Number.isSafeInteger(item) && item >= min && item <= max ? item : null;
  };
  const maxHp = readInteger("maxHp", expectedMaxHp, 12, 300);
  const hp = readInteger("hp", Math.min(fallback.hp, maxHp ?? expectedMaxHp), 0, 300);
  const gold = readInteger("gold", fallback.gold, 0, 1_000_000_000);
  const xp = readInteger("xp", fallback.xp, 0, 1_000_000_000);
  const potions = readInteger("potions", fallback.potions, 0, 999);
  const enemyMaxHp = readInteger("enemyMaxHp", fallback.enemyMaxHp, 1, 100_000);
  const enemyHp = readInteger("enemyHp", fallback.enemyHp, 0, enemyMaxHp ?? fallback.enemyMaxHp);
  const round = readInteger("round", fallback.round, 1, 1_000_000);
  const rawLastRoll = value.lastRoll === undefined ? fallback.lastRoll : value.lastRoll;
  if (maxHp === null || hp === null || hp > maxHp || gold === null || xp === null || potions === null || enemyMaxHp === null || enemyHp === null || enemyHp > enemyMaxHp || round === null || !(rawLastRoll === null || (typeof rawLastRoll === "number" && Number.isInteger(rawLastRoll) && rawLastRoll >= 1 && rawLastRoll <= 20))) return null;

  const readStringArray = (key: string, defaultValue: string[], maxItems: number, maxLength: number): string[] | null => {
    const items = value[key] === undefined ? defaultValue : value[key];
    return Array.isArray(items) && items.length <= maxItems && items.every(item => typeof item === "string" && item.trim().length > 0 && item.length <= maxLength) ? items : null;
  };
  const inventory = readStringArray("inventory", fallback.inventory, 2_000, 200);
  const explored = readStringArray("explored", fallback.explored, 1_000, 300);
  const rawLog = value.log === undefined ? fallback.log : value.log;
  if (!inventory || !explored || !Array.isArray(rawLog) || rawLog.length > 1_000) return null;
  const log: LogEntry[] = [];
  for (const entry of rawLog) {
    if (!isRecord(entry) || typeof entry.text !== "string" || !entry.text.trim() || entry.text.length > 4_000 || (entry.kind !== undefined && !isOneOf(entry.kind, ["roll", "danger", "good"]))) return null;
    log.push(entry.kind === undefined ? { text: entry.text } : { text: entry.text, kind: entry.kind as LogEntry["kind"] });
  }
  const knownRewardIds = new Set(config.rewardIds);
  for (const item of explored) {
    if (!item.startsWith(config.rewardMarkerPrefix)) continue;
    const [markerScenario, markerId, extra] = item.slice(config.rewardMarkerPrefix.length).split(":");
    if (markerScenario !== scenarioId || !knownRewardIds.has(markerId) || extra !== undefined) return null;
  }

  return { scenarioId, scene, hp, maxHp, gold, xp, potions, inventory, log, explored, enemyHp, enemyMaxHp, round, lastRoll: rawLastRoll as number | null, hero };
};
