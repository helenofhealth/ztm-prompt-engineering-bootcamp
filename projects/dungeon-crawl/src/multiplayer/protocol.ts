import type { Hero, ScenarioId } from "../game/types";

export type MultiplayerResources = {
  hp: number;
  maxHp: number;
  xp: number;
  gold: number;
  potions: number;
  inventory: string[];
};

export type CampaignPhase = "exploration" | "combat" | "complete";
export type CampaignScene = "gate" | "contract" | "blood-door" | "well" | "armory" | "victory";
export type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
export type ExplorationActionId =
  | "study-entry" | "approach-sealed-door" | "investigate-well" | "search-vault"
  | "interpret-contract" | "read-seal" | "force-seal" | "analyze-well"
  | "study-well" | "search-cache" | "study-tracks" | "return-to-gate" | "continue-expedition";
export type ExplorationCheck = { label: string; ability: Ability; die: number; modifier: number; total: number; dc: number; success: boolean };
export type ExplorationProgress = { visitedScenes: CampaignScene[]; discoveries: string[] };

export type CombatantInitiative =
  | { kind: "player"; playerId: string; name: string; roll: number; modifier: number; total: number }
  | { kind: "sentinel"; id: "crownbound-sentinel"; name: string; roll: number; modifier: 0; total: number };
export type CombatActionId = "attack" | "potion";
export type CombatActionRecord = {
  id: string;
  round: number;
  actorId: string;
  action: "encounter-start" | "attack" | "enemy-attack" | "potion" | "victory" | "defeat" | "retreat";
  text: string;
  details?:
    | { kind: "attack"; die: number; bonus: number; total: number; ac: number; hit: boolean; damageDie: number | null; damage: number; enemyHpBefore: number; enemyHpAfter: number }
    | { kind: "enemy-attack"; targetPlayerId: string; die: number; sides: 4 | 6 | 8; bonus: number; damage: number; hpBefore: number; hpAfter: number }
    | { kind: "potion"; dieOne: number; dieTwo: number; rolled: number; restored: number; hpBefore: number; hpAfter: number; potionsAfter: number };
};
export type MultiplayerCombatState = {
  encounterId: string;
  enemy: { id: "crownbound-sentinel"; name: "Crownbound Sentinel"; hp: number; maxHp: number; ac: 12 };
  status: "active" | "victory" | "defeat";
  returnScene: CampaignScene;
  initiative: CombatantInitiative[];
  initiativeIndex: number;
  round: number;
  history: CombatActionRecord[];
  rewardClaimed: boolean;
  recovered: boolean;
};

export type CampaignPlayer = {
  playerId: string;
  name: string;
  hero: Hero;
  resources: MultiplayerResources;
  connected: boolean;
};

export type CampaignSnapshot = {
  campaignId: string;
  inviteCode: string;
  scenarioId: ScenarioId;
  revision: number;
  phase: CampaignPhase;
  scene: CampaignScene;
  explorationProgress: ExplorationProgress;
  players: CampaignPlayer[];
  turnOwnerId: string;
  sharedLog: { id: string; text: string; kind: "roll" | "good" | "danger"; check?: ExplorationCheck }[];
  /** Optional for compatibility with persisted campaigns created before multiplayer combat. */
  combat?: MultiplayerCombatState | null;
};

export type CreateCampaignRequest = { scenarioId: ScenarioId; character: Hero };
export type JoinCampaignRequest = { inviteCode: string; character: Hero };
export type ResumeCampaignRequest = { inviteCode: string; resumeToken: string };
export type CampaignActionRequest = {
  campaignId: string;
  commandId: string;
  expectedRevision: number;
  action: ExplorationActionId;
};
export type CombatActionRequest = {
  campaignId: string;
  commandId: string;
  expectedRevision: number;
  action: CombatActionId;
};
export type CombatRetreatRequest = { campaignId: string; commandId: string; expectedRevision: number };

export type ProtocolErrorCode =
  | "INVALID_PAYLOAD" | "INVALID_CHARACTER" | "CAMPAIGN_NOT_FOUND" | "CAMPAIGN_FULL"
  | "ALREADY_IN_CAMPAIGN" | "NOT_A_MEMBER" | "INVALID_RESUME_TOKEN" | "RATE_LIMITED"
  | "WRONG_TURN" | "STALE_REVISION" | "DUPLICATE_COMMAND" | "INVALID_ACTION"
  | "ACTION_UNAVAILABLE" | "SERVER_ERROR";
export type Ack<T> = { ok: true } & T | { ok: false; error: { code: ProtocolErrorCode; message: string } };
export type Identity = { playerId: string; resumeToken: string; snapshot: CampaignSnapshot };

export interface ClientToServerEvents {
  "campaign:create": (payload: CreateCampaignRequest, ack: (result: Ack<Identity>) => void) => void;
  "campaign:join": (payload: JoinCampaignRequest, ack: (result: Ack<Identity>) => void) => void;
  "campaign:resume": (payload: ResumeCampaignRequest, ack: (result: Ack<Identity>) => void) => void;
  "campaign:act": (payload: CampaignActionRequest, ack: (result: Ack<{ snapshot: CampaignSnapshot }>) => void) => void;
  "campaign:combat:act": (payload: CombatActionRequest, ack: (result: Ack<{ snapshot: CampaignSnapshot }>) => void) => void;
  "campaign:combat:retreat": (payload: CombatRetreatRequest, ack: (result: Ack<{ snapshot: CampaignSnapshot }>) => void) => void;
  "campaign:leave": (payload: { campaignId: string }, ack: (result: Ack<{ left: true }>) => void) => void;
}

export interface ServerToClientEvents {
  "campaign:snapshot": (snapshot: CampaignSnapshot) => void;
}

export interface InterServerEvents {}
export interface SocketData { campaignId?: string; playerId?: string }

export const isScenarioId = (value: unknown): value is ScenarioId =>
  value === "lost-heir" || value === "plague-below" || value === "dragon-hoard";

export const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

export const isHero = (value: unknown): value is Hero => {
  if (!value || typeof value !== "object") return false;
  const hero = value as Record<string, unknown>;
  return hasExactKeys(hero, ["name", "gender", "className", "ancestry", "background", "difficulty"])
    && typeof hero.name === "string" && hero.name.trim().length > 0 && hero.name.length <= 24
    && (hero.gender === "female" || hero.gender === "male")
    && ["Warrior", "Ranger", "Mage", "Rogue", "Paladin"].includes(String(hero.className))
    && ["Human", "Elf", "Dwarf", "Half-Orc"].includes(String(hero.ancestry))
    && ["Noble", "Outlander", "Scholar", "Mercenary"].includes(String(hero.background))
    && ["Story", "Balanced", "Hard"].includes(String(hero.difficulty));
};
