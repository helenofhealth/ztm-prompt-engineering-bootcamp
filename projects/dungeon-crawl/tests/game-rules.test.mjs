import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/game/rules.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const rules = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const fallback = {
  scenarioId: "lost-heir",
  scene: "gate",
  hp: 24,
  maxHp: 24,
  gold: 25,
  xp: 0,
  potions: 2,
  inventory: ["Ancestral longsword"],
  log: [{ text: "Campaign started", kind: "good" }],
  explored: [],
  enemyHp: 22,
  enemyMaxHp: 22,
  round: 1,
  lastRoll: null,
  hero: { name: "Adventurer", gender: "female", className: "Warrior", ancestry: "Human", background: "Noble", difficulty: "Balanced" },
};
const validationConfig = {
  fallback,
  scenarioIds: ["lost-heir", "plague-below", "dragon-hoard"],
  sceneIds: ["gate", "blood-door", "well", "armory", "contract", "combat", "victory"],
  classBaseHp: { Warrior: 24, Ranger: 21, Mage: 17, Rogue: 20, Paladin: 26 },
  ancestries: ["Human", "Elf", "Dwarf", "Half-Orc"],
  backgrounds: ["Noble", "Outlander", "Scholar", "Mercenary"],
  rewardMarkerPrefix: "__reward_claimed__:",
  rewardIds: ["gate-research", "contract-insight", "sealed-door-key", "sealed-door-insight", "well-arcana", "well-observation", "vault-cache", "tracks"],
};

test("d20 check preserves natural 1 failure, natural 20 success, and ordinary DC comparison", () => {
  assert.equal(rules.resolveCheck(1, 99, 12).success, false);
  assert.equal(rules.resolveCheck(20, -99, 99).success, true);
  assert.equal(rules.resolveCheck(11, 1, 12).success, true);
  assert.equal(rules.resolveCheck(10, 1, 12).success, false);
});

test("shared ability scores and modifiers match the solo character creator", () => {
  const mage = { ...fallback.hero, className: "Mage", ancestry: "Dwarf" };
  assert.equal(rules.getHeroAbilityScores(mage).INT, 16);
  assert.equal(rules.getHeroAbilityModifier(mage, "INT"), 3);
  assert.equal(rules.getHeroAbilityScores({ ...fallback.hero, className: "Ranger", ancestry: "Elf" }).WIS, 16);
  assert.equal(rules.getHeroAbilityModifier({ ...fallback.hero, className: "Ranger", ancestry: "Elf" }, "WIS"), 3);
  assert.equal(rules.getHeroAbilityScores(fallback.hero).STR, 17);
  assert.equal(rules.getHeroAbilityModifier(fallback.hero, "STR"), 3);
});

test("player attack keeps natural 20 as a hit without extra critical damage", () => {
  const values = [0.99, 0];
  const result = rules.rollPlayerAttack(5, 12, () => values.shift());
  assert.deepEqual(result, { die: 20, damageDie: 1, bonus: 5, total: 25, ac: 12, hit: true, damage: 4 });

  // Existing attack behavior does not make a natural 1 an automatic miss if the bonus reaches AC.
  const naturalOne = rules.rollPlayerAttack(11, 12, () => 0);
  assert.equal(naturalOne.hit, true);
  assert.equal(naturalOne.damage, 4);
});

test("player misses do not consume a damage die", () => {
  let calls = 0;
  const result = rules.rollPlayerAttack(5, 12, () => { calls += 1; return 0; });
  assert.equal(result.hit, false);
  assert.equal(result.damageDie, null);
  assert.equal(result.damage, 0);
  assert.equal(calls, 1);
});

test("player damage is d8+3 and enemy damage remains difficulty-based", () => {
  const hit = rules.rollPlayerAttack(5, 12, (() => { const values = [0.5, 0.5]; return () => values.shift(); })());
  assert.equal(hit.damageDie, 5);
  assert.equal(hit.damage, 8);
  assert.deepEqual(rules.rollEnemyDamage("Story", () => 0.99), { die: 4, bonus: 0, total: 4, sides: 4 });
  assert.deepEqual(rules.rollEnemyDamage("Balanced", () => 0), { die: 1, bonus: 1, total: 2, sides: 6 });
  assert.deepEqual(rules.rollEnemyDamage("Hard", () => 0.99), { die: 8, bonus: 2, total: 10, sides: 8 });
});

test("potion healing remains 2d4+2 and caps actual HP restoration", () => {
  assert.deepEqual(rules.resolvePotionHealing(10, 30, 4, 4), { dieOne: 4, dieTwo: 4, rolled: 10, hp: 20, restored: 10 });
  assert.deepEqual(rules.resolvePotionHealing(28, 30, 4, 4), { dieOne: 4, dieTwo: 4, rolled: 10, hp: 30, restored: 2 });
  assert.deepEqual(rules.resolvePotionHealing(30, 30, 1, 1), { dieOne: 1, dieTwo: 1, rolled: 4, hp: 30, restored: 0 });
});

test("reward claim guard blocks rapid duplicate claims and scopes markers by scenario", () => {
  const first = rules.claimRewardOnce([], new Set(), "lost-heir", "vault-cache", validationConfig.rewardMarkerPrefix);
  const rapidDuplicate = rules.claimRewardOnce([], first.pendingClaims, "lost-heir", "vault-cache", validationConfig.rewardMarkerPrefix);
  const otherScenario = rules.claimRewardOnce([], first.pendingClaims, "plague-below", "vault-cache", validationConfig.rewardMarkerPrefix);
  assert.equal(first.claimed, true);
  assert.equal(rapidDuplicate.claimed, false);
  assert.equal(otherScenario.claimed, true);
  assert.equal(rules.claimRewardOnce([first.marker], new Set(), "lost-heir", "vault-cache", validationConfig.rewardMarkerPrefix).claimed, false);
  assert.notEqual(first.marker, otherScenario.marker);
});

test("Lost Heir Silver key is backfilled once and not granted to other scenarios", () => {
  const legacyExplored = ["__reward_claimed__:lost-heir:contract-insight"];
  const claimed = rules.hasRewardClaim(legacyExplored, "lost-heir", "contract-insight", validationConfig.rewardMarkerPrefix);
  const backfilled = rules.addLostHeirSilverKey("lost-heir", fallback.inventory, claimed);
  assert.deepEqual(backfilled, [...fallback.inventory, "Silver key"]);
  assert.deepEqual(rules.addLostHeirSilverKey("lost-heir", backfilled, claimed), backfilled);
  assert.deepEqual(rules.addLostHeirSilverKey("plague-below", fallback.inventory, true), fallback.inventory);
  assert.equal(rules.hasRewardClaim(legacyExplored, "plague-below", "contract-insight", validationConfig.rewardMarkerPrefix), false);
});

test("save validation accepts current and legacy defaults without changing the save shape", () => {
  const current = rules.validateSaveData(fallback, validationConfig);
  assert.deepEqual(current, fallback);
  assert.deepEqual(Object.keys(current).sort(), Object.keys(fallback).sort());

  const legacy = rules.validateSaveData({ scenarioId: "lost-heir", scene: "contract", hero: { name: "Adventurer" } }, validationConfig);
  assert.ok(legacy);
  assert.equal(legacy.hp, fallback.hp);
  assert.equal(legacy.hero.className, fallback.hero.className);
  assert.deepEqual(legacy.inventory, fallback.inventory);
  assert.deepEqual(Object.keys(legacy).sort(), Object.keys(fallback).sort());
});

test("save validation rejects invalid enums, numeric ranges, nested data, and mismatched reward markers", () => {
  assert.equal(rules.validateSaveData({ ...fallback, scene: "unknown" }, validationConfig), null);
  assert.equal(rules.validateSaveData({ ...fallback, hp: Number.NaN }, validationConfig), null);
  assert.equal(rules.validateSaveData({ ...fallback, hp: 25 }, validationConfig), null);
  assert.equal(rules.validateSaveData({ ...fallback, inventory: ["ok", null] }, validationConfig), null);
  assert.equal(rules.validateSaveData({ ...fallback, log: [{ text: "bad", kind: "unknown" }] }, validationConfig), null);
  assert.equal(rules.validateSaveData({ ...fallback, explored: ["__reward_claimed__:dragon-hoard:vault-cache"] }, validationConfig), null);
  assert.equal(rules.validateSaveData(null, validationConfig), null);
});
