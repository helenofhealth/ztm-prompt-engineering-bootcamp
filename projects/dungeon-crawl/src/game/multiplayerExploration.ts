import type { CampaignScene, ExplorationActionId, Ability } from "../multiplayer/protocol";
import type { ScenarioId } from "./types";

export type ExplorationActionDefinition = {
  scene: CampaignScene | readonly CampaignScene[];
  title: Record<ScenarioId, string>;
  description: Record<ScenarioId, string>;
  check?: Record<ScenarioId, { label: string; ability: Ability; dc: number }>;
  rewardIds?: readonly string[];
};

const all = <T,>(lostHeir: T, plagueBelow: T, dragonHoard: T): Record<ScenarioId, T> => ({
  "lost-heir": lostHeir,
  "plague-below": plagueBelow,
  "dragon-hoard": dragonHoard,
});

export const explorationActions: Record<ExplorationActionId, ExplorationActionDefinition> = {
  "study-entry": {
    scene: "gate",
    title: all("Inspect the royal contract", "Inspect the quarantine ledger", "Read the runic bargain"),
    description: all("Study the pedestal and statues before committing.", "Search the quarantine records for clues to the outbreak.", "Study the runes before making a bargain."),
    check: all(
      { label: "Royal history", ability: "INT", dc: 12 },
      { label: "Medical investigation", ability: "INT", dc: 12 },
      { label: "Arcane lore", ability: "INT", dc: 12 },
    ),
    rewardIds: ["entry-study"],
  },
  "approach-sealed-door": {
    scene: "gate",
    title: all("Approach the blood-sealed door", "Open the sealed infirmary", "Approach the obsidian door"),
    description: all("Answer the voice calling you Majesty.", "Examine the sealed room where the first cases vanished.", "Approach the door that radiates heat."),
  },
  "investigate-well": {
    scene: "gate",
    title: all("Investigate the whispering well", "Investigate the spore well", "Investigate the wishing pool"),
    description: all("Find the source of the warning about Brom.", "Trace the source of the strange spores.", "Look into the pool that reflects another sky."),
  },
  "search-vault": {
    scene: "gate",
    title: all("Search the forgotten armory", "Search the abandoned supply vault", "Search the fallen treasure vault"),
    description: all("Look for supplies and clues among abandoned weapons.", "Search for clean supplies and protective gear.", "Search without waking the dragon."),
  },
  "interpret-contract": {
    scene: "contract",
    title: all("Place the signet in the pedestal", "Study the final ledger entry", "Read the terms etched in dragon glass"),
    description: all("Test whether the relic recognizes its heir.", "Look for a clue to the quarantine's failure.", "Test your understanding of the bargain's price."),
    check: all(
      { label: "Heir's Instinct", ability: "CHA", dc: 13 },
      { label: "Containment records", ability: "INT", dc: 13 },
      { label: "Bargain's Terms", ability: "INT", dc: 13 },
    ),
    rewardIds: ["contract-insight"],
  },
  "read-seal": {
    scene: "blood-door",
    title: all("Touch the seal with your signet", "Examine the quarantine seal", "Trace the obsidian runes"),
    description: all("Use your lineage to open the door.", "Look for a way through without releasing what is inside.", "Read the offer etched into the door before answering."),
    check: all(
      { label: "Royal bloodline", ability: "CHA", dc: 13 },
      { label: "Quarantine protocol", ability: "INT", dc: 13 },
      { label: "Runic bargain", ability: "INT", dc: 13 },
    ),
    rewardIds: ["sealed-door-key", "sealed-door-insight"],
  },
  "force-seal": {
    scene: "blood-door",
    title: all("Break the seal by force", "Break the infirmary seal", "Force the obsidian door"),
    description: all("Test your strength against ancient magic.", "Force the door before whatever is inside breaks through.", "Test your strength against the dragon-glass seal."),
    check: all(
      { label: "Strength", ability: "STR", dc: 14 },
      { label: "Strength", ability: "STR", dc: 14 },
      { label: "Strength", ability: "STR", dc: 14 },
    ),
    rewardIds: ["sealed-door-key"],
  },
  "analyze-well": {
    scene: "well",
    title: all("Study the well's magic", "Study the spore well's echo", "Trace the pool's magic"),
    description: all("Study the well's enchantment.", "Study the well's quarantine echo.", "Trace the pool's bargain magic."),
    check: all(
      { label: "Arcana", ability: "INT", dc: 12 },
      { label: "Arcana", ability: "INT", dc: 12 },
      { label: "Arcana", ability: "INT", dc: 12 },
    ),
    rewardIds: ["well-arcana"],
  },
  "study-well": {
    scene: "well",
    title: all("Look into the water", "Study the spores below", "Look into the pool"),
    description: all("Face the voice yourself.", "Peer into the shaft and trace the infection's source.", "Face the reflection that moves before you do."),
    check: all(
      { label: "Wisdom", ability: "WIS", dc: 13 },
      { label: "Wisdom", ability: "WIS", dc: 13 },
      { label: "Wisdom", ability: "WIS", dc: 13 },
    ),
    rewardIds: ["well-observation"],
  },
  "search-cache": {
    scene: "armory",
    title: all("Search behind the fallen statue", "Search the sealed supply cabinet", "Search behind the fallen coffer"),
    description: all("Recover what the golden light is guarding.", "Recover what the damaged cabinet is hiding.", "Recover what the golden light is guarding."),
    check: all(
      { label: "Investigation", ability: "INT", dc: 12 },
      { label: "Investigation", ability: "INT", dc: 12 },
      { label: "Investigation", ability: "INT", dc: 12 },
    ),
    rewardIds: ["vault-cache"],
  },
  "study-tracks": {
    scene: "armory",
    title: all("Take a torch and study the tracks", "Study the warden's tracks", "Study the guardian's tracks"),
    description: all("Look for clues before disturbing anything.", "Follow the trail without disturbing the supplies.", "Read the tracks among the scattered coins."),
    check: all(
      { label: "Perception", ability: "WIS", dc: 11 },
      { label: "Perception", ability: "WIS", dc: 11 },
      { label: "Perception", ability: "WIS", dc: 11 },
    ),
    rewardIds: ["tracks"],
  },
  "return-to-gate": {
    scene: ["contract", "blood-door", "well", "armory"],
    title: all("Return to the central chamber", "Return to the mine entrance", "Return to the cavern"),
    description: all("Leave the contract for now.", "Leave the ledger for now.", "Leave the bargain for now."),
  },
  "continue-expedition": {
    scene: "victory",
    title: all("Continue expedition", "Continue expedition", "Continue expedition"),
    description: all("Return to the central chamber with what you learned.", "Return to the mine entrance with what you learned.", "Return to the cavern with what you learned."),
  },
};

export const sceneTitles: Record<ScenarioId, Record<CampaignScene, string>> = {
  "lost-heir": { gate: "Entry chamber", contract: "The royal contract", "blood-door": "The blood-sealed door", well: "The whispering well", armory: "The forgotten armory", victory: "Discovery secured" },
  "plague-below": { gate: "Mine entrance", contract: "The quarantine ledger", "blood-door": "The sealed infirmary", well: "The spore well", armory: "The supply vault", victory: "Discovery secured" },
  "dragon-hoard": { gate: "The cavern", contract: "The runic bargain", "blood-door": "The obsidian door", well: "The wishing pool", armory: "The fallen treasure vault", victory: "Discovery secured" },
};

export const allExplorationActionIds = Object.keys(explorationActions) as ExplorationActionId[];

export function availableExplorationActions(scenarioId: ScenarioId, scene: CampaignScene, claimedRewards: readonly string[]) {
  return allExplorationActionIds.filter(id => {
    const definition = explorationActions[id];
    if (definition.scene !== scene && !(Array.isArray(definition.scene) && definition.scene.includes(scene))) return false;
    return !definition.rewardIds?.length || definition.rewardIds.some(reward => !claimedRewards.includes(reward));
  });
}
