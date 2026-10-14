import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { addLostHeirSilverKey, claimRewardOnce, getHeroAbilityModifier, getHeroAttackBonus, resolveCheck, resolvePotionHealing, rollDie, rollEnemyDamage, rollPlayerAttack } from "../src/game/rules.ts";
import { availableExplorationActions, explorationActions } from "../src/game/multiplayerExploration.ts";
import type { Hero, ScenarioId } from "../src/game/types.ts";
import type { CampaignPlayer, CampaignSnapshot, CombatActionId, CombatActionRecord, CombatantInitiative, ExplorationActionId, ExplorationCheck, MultiplayerCombatState, MultiplayerResources } from "../src/multiplayer/protocol.ts";

type PrivatePlayer = CampaignPlayer & { resumeHash: Buffer | null; socketId: string | null };
type Campaign = {
  snapshot: CampaignSnapshot;
  players: PrivatePlayer[];
  rewardClaims: Set<string>;
  commandIds: Set<string>;
};

export type PersistedCampaign = {
  snapshot: CampaignSnapshot;
  players: Array<Omit<PrivatePlayer, "resumeHash" | "socketId"> & { resumeHash: string | null }>;
  rewardClaims: string[];
};

export type CampaignBackup = {
  snapshot: CampaignSnapshot;
  players: PrivatePlayer[];
  rewardClaims: string[];
  commandIds: string[];
};

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const sentinelVictoryMarker = "__reward_claimed__:lost-heir:sentinel-victory";
const hpByClass: Record<Hero["className"], number> = { Warrior: 24, Ranger: 21, Mage: 17, Rogue: 20, Paladin: 26 };
const newInviteCode = () => Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
const hashToken = (token: string) => createHash("sha256").update(token).digest();
const sameHash = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);
const resourcesFor = (hero: Hero): MultiplayerResources => {
  const baseHp = hpByClass[hero.className];
  const maxHp = Math.max(12, baseHp + (hero.difficulty === "Story" ? 6 : hero.difficulty === "Hard" ? -4 : 0));
  return { hp: maxHp, maxHp, xp: 0, gold: 25, potions: 2, inventory: [`${hero.className} starting gear`] };
};

export class CampaignStore {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly inviteCodes = new Map<string, string>();

  constructor(readonly maxPlayers = 4, private readonly random: () => number = Math.random) {}

  get campaignCount() { return this.campaigns.size; }

  capture(campaign: Campaign): CampaignBackup {
    return {
      snapshot: structuredClone(campaign.snapshot),
      players: campaign.players.map(player => ({
        ...player,
        hero: structuredClone(player.hero),
        resources: { ...player.resources, inventory: [...player.resources.inventory] },
        resumeHash: player.resumeHash ? Buffer.from(player.resumeHash) : null,
      })),
      rewardClaims: [...campaign.rewardClaims],
      commandIds: [...campaign.commandIds],
    };
  }

  restore(backup: CampaignBackup) {
    const campaign: Campaign = {
      snapshot: structuredClone(backup.snapshot),
      players: backup.players.map(player => ({
        ...player,
        hero: structuredClone(player.hero),
        resources: { ...player.resources, inventory: [...player.resources.inventory] },
        resumeHash: player.resumeHash ? Buffer.from(player.resumeHash) : null,
      })),
      rewardClaims: new Set(backup.rewardClaims),
      commandIds: new Set(backup.commandIds),
    };
    this.register(campaign);
    return campaign;
  }

  toPersisted(campaign: Campaign): PersistedCampaign {
    return {
      snapshot: structuredClone(campaign.snapshot),
      players: campaign.players.map(({ resumeHash, socketId: _socketId, ...player }) => ({
        ...player,
        hero: structuredClone(player.hero),
        resources: { ...player.resources, inventory: [...player.resources.inventory] },
        resumeHash: resumeHash?.toString("hex") ?? null,
      })),
      rewardClaims: [...campaign.rewardClaims],
    };
  }

  restorePersisted(data: PersistedCampaign, commandIds: string[]) {
    const previouslyConnected = data.players.some(player => player.connected);
    const combat = data.snapshot.combat ?? null;
    const snapshot: CampaignSnapshot = {
      ...structuredClone(data.snapshot),
      phase: data.snapshot.phase === "combat" && !combat ? "exploration" : data.snapshot.phase ?? "exploration",
      combat,
      explorationProgress: data.snapshot.explorationProgress ?? {
        visitedScenes: [data.snapshot.scene],
        discoveries: data.rewardClaims.map(marker => marker.split(":").at(-1)!).filter(Boolean),
      },
    };
    const campaign: Campaign = {
      snapshot,
      players: data.players.map(({ resumeHash, ...player }) => ({
        ...player,
        hero: structuredClone(player.hero),
        resources: { ...player.resources, inventory: [...player.resources.inventory] },
        connected: false,
        resumeHash: resumeHash ? Buffer.from(resumeHash, "hex") : null,
        socketId: null,
      })),
      rewardClaims: new Set(data.rewardClaims),
      commandIds: new Set(commandIds),
    };
    const expectedRevision = campaign.snapshot.revision;
    if (previouslyConnected) campaign.snapshot.revision += 1;
    this.refreshPlayers(campaign);
    this.register(campaign);
    return { campaign, expectedRevision, changed: previouslyConnected };
  }

  create(scenarioId: ScenarioId, hero: Hero, socketId: string) {
    const campaignId = randomUUID();
    let inviteCode = newInviteCode();
    while (this.inviteCodes.has(inviteCode)) inviteCode = newInviteCode();
    const playerId = randomUUID();
    const resumeToken = randomBytes(32).toString("base64url");
    const player: PrivatePlayer = { playerId, name: hero.name, hero: { ...hero }, resources: resourcesFor(hero), connected: true, resumeHash: hashToken(resumeToken), socketId };
    const snapshot: CampaignSnapshot = {
      campaignId, inviteCode, scenarioId, revision: 1, phase: "exploration", scene: "gate",
      explorationProgress: { visitedScenes: ["gate"], discoveries: [] }, players: [], turnOwnerId: playerId,
      sharedLog: [{ id: randomUUID(), text: `${hero.name} founded a ${scenarioId} campaign. The party is ready to explore.`, kind: "good" }],
      combat: null,
    };
    const campaign: Campaign = { snapshot, players: [player], rewardClaims: new Set(), commandIds: new Set() };
    this.campaigns.set(campaignId, campaign);
    this.inviteCodes.set(inviteCode, campaignId);
    this.refreshPlayers(campaign);
    return { campaign, player, resumeToken };
  }

  findByInvite(inviteCode: string) {
    const id = this.inviteCodes.get(inviteCode.toUpperCase());
    return id ? this.campaigns.get(id) : undefined;
  }

  getById(campaignId: string) { return this.campaigns.get(campaignId); }

  join(campaign: Campaign, hero: Hero, socketId: string) {
    const playerId = randomUUID();
    const resumeToken = randomBytes(32).toString("base64url");
    const player: PrivatePlayer = { playerId, name: hero.name, hero: { ...hero }, resources: resourcesFor(hero), connected: true, resumeHash: hashToken(resumeToken), socketId };
    campaign.players.push(player);
    campaign.snapshot.revision += 1;
    this.appendLog(campaign, { id: randomUUID(), text: `${hero.name} joined the campaign.`, kind: "good" });
    this.ensureConnectedTurnOwner(campaign);
    this.refreshPlayers(campaign);
    return { player, resumeToken };
  }

  resume(campaign: Campaign, token: string, socketId: string) {
    const candidate = hashToken(token);
    const player = campaign.players.find(value => value.resumeHash !== null && sameHash(value.resumeHash, candidate));
    if (!player) return undefined;
    const previousSocketId = player.socketId;
    const previousConnected = player.connected;
    player.socketId = socketId;
    player.connected = true;
    campaign.snapshot.revision += 1;
    this.appendLog(campaign, { id: randomUUID(), text: `${player.name} reconnected.`, kind: "good" });
    this.ensureConnectedTurnOwner(campaign);
    this.refreshPlayers(campaign);
    return { player, previousSocketId, previousConnected };
  }

  disconnect(campaign: Campaign, playerId: string, socketId: string) {
    const player = campaign.players.find(value => value.playerId === playerId);
    if (!player || player.socketId !== socketId || !player.connected) return false;
    player.socketId = null;
    player.connected = false;
    campaign.snapshot.revision += 1;
    this.appendLog(campaign, { id: randomUUID(), text: `${player.name} disconnected.`, kind: "danger" });
    if (campaign.snapshot.phase === "combat" && campaign.snapshot.combat?.status === "active") {
      const active = campaign.snapshot.combat.initiative[campaign.snapshot.combat.initiativeIndex];
      if (active?.kind === "player" && active.playerId === playerId) {
        this.moveCombatCursor(campaign);
        this.resolveAutomatedCombatTurns(campaign);
      }
    } else if (campaign.snapshot.turnOwnerId === playerId) this.advanceTurnFrom(campaign, campaign.players.indexOf(player));
    this.refreshPlayers(campaign);
    return true;
  }

  leave(campaign: Campaign, playerId: string, socketId: string) {
    const player = campaign.players.find(value => value.playerId === playerId);
    if (!player || player.resumeHash === null) return false as const;
    const previousResumeHash = player.resumeHash;
    if (!this.disconnect(campaign, playerId, socketId)) return false;
    player.resumeHash = null;
    campaign.snapshot.sharedLog[campaign.snapshot.sharedLog.length - 1].text = `${player.name} left the campaign.`;
    return previousResumeHash;
  }

  rollbackLeave(campaign: Campaign, playerId: string, socketId: string, resumeHash: Buffer, previousSnapshot: CampaignSnapshot) {
    const player = campaign.players.find(value => value.playerId === playerId);
    if (player) {
      player.resumeHash = resumeHash;
      player.socketId = socketId;
      player.connected = true;
    }
    campaign.snapshot = previousSnapshot;
  }

  rollbackCreate(campaignId: string) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;
    this.campaigns.delete(campaignId);
    this.inviteCodes.delete(campaign.snapshot.inviteCode);
  }

  rollbackJoin(campaign: Campaign, playerId: string, previousSnapshot: CampaignSnapshot) {
    campaign.players = campaign.players.filter(player => player.playerId !== playerId);
    campaign.snapshot = previousSnapshot;
  }

  rollbackResume(campaign: Campaign, playerId: string, previousSocketId: string | null, previousConnected: boolean, previousSnapshot: CampaignSnapshot) {
    const player = campaign.players.find(value => value.playerId === playerId);
    if (player) {
      player.socketId = previousSocketId;
      player.connected = previousConnected;
    }
    campaign.snapshot = previousSnapshot;
  }

  activePlayerCount(campaign: Campaign) {
    return campaign.players.filter(player => player.resumeHash !== null).length;
  }

  canResolveExploration(campaign: Campaign, action: ExplorationActionId) {
    const claimedRewards = [...campaign.rewardClaims].map(marker => marker.split(":").at(-1)!).filter(Boolean);
    return campaign.snapshot.phase === "exploration"
      && availableExplorationActions(campaign.snapshot.scenarioId, campaign.snapshot.scene, claimedRewards)
        .includes(action);
  }

  resolveExploration(campaign: Campaign, playerId: string, actionId: ExplorationActionId) {
    const player = campaign.players.find(value => value.playerId === playerId)!;
    const scenarioId = campaign.snapshot.scenarioId;
    const action = explorationActions[actionId];
    const claim = (rewardId: string) => {
      const result = claimRewardOnce([...campaign.rewardClaims], new Set(), scenarioId, rewardId, "__reward_claimed__:");
      if (!result.claimed) return false;
      campaign.rewardClaims.add(result.marker);
      if (!campaign.snapshot.explorationProgress.discoveries.includes(rewardId)) {
        campaign.snapshot.explorationProgress.discoveries.push(rewardId);
      }
      return true;
    };
    const enter = (scene: CampaignSnapshot["scene"]) => {
      campaign.snapshot.scene = scene;
      if (!campaign.snapshot.explorationProgress.visitedScenes.includes(scene)) campaign.snapshot.explorationProgress.visitedScenes.push(scene);
    };
    let check: ExplorationCheck | undefined;
    let kind: "roll" | "good" | "danger" = "good";
    let text = "";
    let startsSentinel = false;

    if (actionId === "approach-sealed-door" || actionId === "investigate-well" || actionId === "search-vault") {
      const scene = actionId === "approach-sealed-door" ? "blood-door" : actionId === "investigate-well" ? "well" : "armory";
      enter(scene);
      text = `${player.name} enters ${action.title[scenarioId].toLowerCase()}.`;
    } else if (actionId === "return-to-gate") {
      enter("gate");
      text = `${player.name} returns to the entry point to plan the next step.`;
    } else if (actionId === "continue-expedition") {
      enter("gate");
      text = `${player.name} returns to the entry point with the party's discovery.`;
    } else {
      const checkSpec = action.check?.[scenarioId];
      if (!checkSpec) throw new Error(`Missing check definition for ${actionId}.`);
      const die = rollDie(20, this.random);
      const modifier = getHeroAbilityModifier(player.hero, checkSpec.ability);
      const result = resolveCheck(die, modifier, checkSpec.dc);
      check = { ...checkSpec, die, modifier, total: result.total, success: result.success };
      kind = result.success ? "good" : "danger";
      const outcome = (message: string) => `${message} ${checkSpec.label}: d20 (${die}) ${modifier >= 0 ? "+" : ""}${modifier} = ${result.total} vs DC ${checkSpec.dc} — ${result.success ? "SUCCESS" : "FAILURE"}.`;

      switch (actionId) {
        case "study-entry": {
          const rewarded = result.success && claim("entry-study");
          if (rewarded) player.resources.xp += 10;
          enter("contract");
          text = outcome(result.success
            ? `${action.title[scenarioId]} reveals a clue.${rewarded ? ` ${player.name} gains 10 XP.` : " The one-time experience reward was already claimed."}`
            : "The evidence remains unclear, but the discovery leads the party to examine the contract.");
          break;
        }
        case "interpret-contract": {
          const rewarded = result.success && claim("contract-insight");
          const sentinelAlreadyDefeated = scenarioId === "lost-heir" && this.hasDefeatedSentinel(campaign);
          if (rewarded) {
            player.resources.xp += 15;
            player.resources.inventory = addLostHeirSilverKey(scenarioId, player.resources.inventory, true);
            enter("victory");
          }
          text = outcome(result.success
            ? `${action.title[scenarioId]} reveals the terms.${rewarded ? ` ${player.name} gains 15 XP${scenarioId === "lost-heir" ? " and a Silver key" : ""}.` : " This discovery's reward was already claimed."}`
            : scenarioId === "lost-heir"
              ? sentinelAlreadyDefeated
                ? "The pedestal rejects the signet, but the Crownbound Sentinel has already been defeated; the contract remains unresolved."
                : "The pedestal rejects the signet."
              : scenarioId === "plague-below" ? "The final ledger entry is obscured by damage." : "The runes resist your interpretation.");
          startsSentinel = scenarioId === "lost-heir" && !result.success && !sentinelAlreadyDefeated;
          break;
        }
        case "read-seal": {
          const keyRewarded = result.success && claim("sealed-door-key");
          const insightRewarded = result.success && claim("sealed-door-insight");
          if (keyRewarded && !player.resources.inventory.includes("Blood-forged key")) player.resources.inventory.push("Blood-forged key");
          if (insightRewarded) player.resources.xp += 15;
          if (result.success) enter("armory");
          text = outcome(result.success
            ? `The seal yields.${keyRewarded ? " A Blood-forged key is added to this hero's inventory." : " The key was already claimed."}${insightRewarded ? " This hero gains 15 XP." : ""}`
            : scenarioId === "lost-heir" ? "The blood seal resists the signet." : scenarioId === "plague-below" ? "The quarantine seal remains intact." : "The obsidian runes keep the door closed.");
          break;
        }
        case "force-seal": {
          const keyRewarded = result.success && claim("sealed-door-key");
          if (result.success) {
            player.resources.hp = Math.max(1, player.resources.hp - 3);
            if (keyRewarded && !player.resources.inventory.includes("Blood-forged key")) player.resources.inventory.push("Blood-forged key");
            enter("armory");
          }
          text = outcome(result.success
            ? `The seal breaks. ${player.name} loses 3 HP to the recoil.${keyRewarded ? " A Blood-forged key is added to this hero's inventory." : " The key was already claimed."}`
            : "The force rebounds without opening the sealed passage.");
          break;
        }
        case "analyze-well": {
          const rewarded = result.success && claim("well-arcana");
          if (rewarded) player.resources.xp += 10;
          enter("gate");
          text = outcome(result.success
            ? `${scenarioId === "lost-heir" ? "The well's echo is a memory, not proof of betrayal." : scenarioId === "plague-below" ? "You identify the well's echo as an old quarantine warning." : "You identify the pool's magic as a bargain that demands a memory."}${rewarded ? ` ${player.name} gains 10 XP.` : " The discovery's reward was already claimed."}`
            : scenarioId === "dragon-hoard" ? "The pool's enchantment resists the examination; its price remains unclear." : "The well's magic resists the examination; its warning remains unexplained.");
          break;
        }
        case "study-well": {
          const rewarded = result.success && claim("well-observation");
          if (rewarded) player.resources.xp += 10;
          if (!result.success) player.resources.hp = Math.max(1, player.resources.hp - 2);
          enter(result.success ? "contract" : "gate");
          text = outcome(result.success
            ? `${scenarioId === "lost-heir" ? "A forgotten royal memory surfaces." : scenarioId === "plague-below" ? "A memory of the quarantine surfaces." : "A memory of an ancient bargain surfaces."}${rewarded ? ` ${player.name} gains 10 XP.` : " The discovery's reward was already claimed."}`
            : `A cold presence brushes ${player.name}'s mind; this hero loses 2 HP.`);
          break;
        }
        case "search-cache": {
          const rewarded = result.success && claim("vault-cache");
          if (rewarded) {
            player.resources.xp += 15;
            player.resources.gold += 10;
            if (!player.resources.inventory.includes("Royal ward charm")) player.resources.inventory.push("Royal ward charm");
            enter("victory");
          }
          text = outcome(result.success
            ? `${action.title[scenarioId]} reveals a ward charm and 10 gold.${rewarded ? ` ${player.name} gains 15 XP and 10 gp; the charm goes to this hero's inventory.` : " The cache reward was already claimed."}`
            : scenarioId === "plague-below" ? "The cabinet remains closed; its supplies are untouched." : scenarioId === "dragon-hoard" ? "The coffer stays shut; the coins remain undisturbed." : "The statue remains in place; the armory is undisturbed.");
          break;
        }
        case "study-tracks": {
          const rewarded = result.success && claim("tracks");
          if (rewarded) player.resources.xp += 5;
          enter("gate");
          text = outcome(result.success
            ? `${scenarioId === "lost-heir" ? "The tracks belong to a heavy armored construct." : scenarioId === "plague-below" ? "The tracks lead to a heavy quarantine warden." : "The tracks belong to a dragon-forged guardian."}${rewarded ? ` ${player.name} gains 5 XP.` : " This insight's reward was already claimed."}`
            : scenarioId === "plague-below" ? "The tracks vanish beneath a drift of spores." : scenarioId === "dragon-hoard" ? "The tracks disappear beneath scattered coins." : "The tracks disappear beneath a sheet of dust.");
          break;
        }
      }
    }
    this.appendLog(campaign, { id: randomUUID(), text, kind, ...(check ? { check } : {}) });
    if (startsSentinel) this.startSentinelEncounter(campaign, playerId);
    campaign.snapshot.revision += 1;
    if (!startsSentinel) {
      const currentIndex = campaign.players.findIndex(value => value.playerId === playerId);
      this.advanceTurnFrom(campaign, currentIndex);
    }
    this.refreshPlayers(campaign);
    return check;
  }

  canResolveCombat(campaign: Campaign, action: CombatActionId) {
    const combat = campaign.snapshot.combat;
    if (campaign.snapshot.phase !== "combat" || !combat || combat.status !== "active") return false;
    if (action === "attack") return true;
    const owner = campaign.players.find(player => player.playerId === campaign.snapshot.turnOwnerId);
    return action === "potion" && !!owner && owner.resources.potions > 0 && owner.resources.hp < owner.resources.maxHp;
  }

  resolveCombatAction(campaign: Campaign, playerId: string, action: CombatActionId) {
    const player = campaign.players.find(value => value.playerId === playerId)!;
    const combat = campaign.snapshot.combat!;
    const round = combat.round;
    if (action === "attack") {
      const result = rollPlayerAttack(getHeroAttackBonus(player.hero), combat.enemy.ac, this.random);
      const before = combat.enemy.hp;
      combat.enemy.hp = Math.max(0, before - result.damage);
      const text = `${player.name} attacks the Crownbound Sentinel: d20 (${result.die}) + ${result.bonus} = ${result.total} vs AC ${result.ac}. ${result.die === 20 ? "Natural 20! " : ""}${result.hit ? `Hit for ${result.damage} damage (d8 ${result.damageDie} + 3).` : "Miss."} Sentinel HP ${before} → ${combat.enemy.hp}.`;
      this.recordCombat(campaign, {
        id: randomUUID(), round, actorId: playerId, action: "attack", text,
        details: { kind: "attack", die: result.die, bonus: result.bonus, total: result.total, ac: result.ac, hit: result.hit, damageDie: result.damageDie, damage: result.damage, enemyHpBefore: before, enemyHpAfter: combat.enemy.hp },
      }, result.hit ? "good" : "danger");
      if (combat.enemy.hp === 0) this.finishSentinelVictory(campaign, playerId);
    } else {
      const dieOne = rollDie(4, this.random);
      const dieTwo = rollDie(4, this.random);
      const before = player.resources.hp;
      const healing = resolvePotionHealing(before, player.resources.maxHp, dieOne, dieTwo);
      player.resources.hp = healing.hp;
      player.resources.potions -= 1;
      const text = `${player.name} drinks a potion: d4 (${dieOne}) + d4 (${dieTwo}) + 2 = ${healing.rolled} HP rolled; ${healing.restored} HP restored (${before} → ${healing.hp}).`;
      this.recordCombat(campaign, {
        id: randomUUID(), round, actorId: playerId, action: "potion", text,
        details: { kind: "potion", dieOne, dieTwo, rolled: healing.rolled, restored: healing.restored, hpBefore: before, hpAfter: healing.hp, potionsAfter: player.resources.potions },
      }, "good");
    }

    if (combat.status === "active") {
      this.moveCombatCursor(campaign);
      this.resolveAutomatedCombatTurns(campaign);
    }
    campaign.snapshot.revision += 1;
    this.refreshPlayers(campaign);
  }

  canRetreatFromDefeat(campaign: Campaign) {
    return campaign.snapshot.phase === "combat" && campaign.snapshot.combat?.status === "defeat" && !campaign.snapshot.combat.recovered;
  }

  retreatFromDefeat(campaign: Campaign) {
    if (!this.canRetreatFromDefeat(campaign)) return false;
    const combat = campaign.snapshot.combat!;
    for (const player of campaign.players) {
      if (player.resources.hp === 0) player.resources.hp = Math.min(12, player.resources.maxHp);
    }
    combat.recovered = true;
    const retreatRecord: CombatActionRecord = { id: randomUUID(), round: combat.round, actorId: "party", action: "retreat", text: "The party retreats to safety. Downed characters recover with 12 HP; no Sentinel reward is granted." };
    combat.history = [...combat.history, retreatRecord].slice(-40);
    campaign.snapshot.phase = "exploration";
    campaign.snapshot.scene = "gate";
    this.appendLog(campaign, { id: randomUUID(), text: "The party retreats to safety. Downed characters recover with 12 HP; no Sentinel reward is granted.", kind: "good" });
    this.refreshPlayers(campaign);
    return true;
  }

  snapshot(campaign: Campaign) {
    return campaign.snapshot;
  }

  addCommand(campaign: Campaign, commandId: string) {
    campaign.commandIds.add(commandId);
    if (campaign.commandIds.size > 2_000) campaign.commandIds.delete(campaign.commandIds.values().next().value!);
  }

  hasCommand(campaign: Campaign, commandId: string) { return campaign.commandIds.has(commandId); }

  private refreshPlayers(campaign: Campaign) {
    campaign.snapshot.players = campaign.players.map(({ resumeHash: _resumeHash, socketId: _socketId, ...publicPlayer }) => ({
      ...publicPlayer,
      hero: { ...publicPlayer.hero },
      resources: { ...publicPlayer.resources, inventory: [...publicPlayer.resources.inventory] },
    }));
  }

  private register(campaign: Campaign) {
    const existing = this.campaigns.get(campaign.snapshot.campaignId);
    if (existing) this.inviteCodes.delete(existing.snapshot.inviteCode);
    this.campaigns.set(campaign.snapshot.campaignId, campaign);
    this.inviteCodes.set(campaign.snapshot.inviteCode, campaign.snapshot.campaignId);
  }

  private appendLog(campaign: Campaign, entry: CampaignSnapshot["sharedLog"][number]) {
    campaign.snapshot.sharedLog = [...campaign.snapshot.sharedLog, entry].slice(-100);
  }

  private advanceTurnFrom(campaign: Campaign, currentIndex: number) {
    for (let offset = 1; offset <= campaign.players.length; offset += 1) {
      const next = campaign.players[(currentIndex + offset) % campaign.players.length];
      if (next.connected) {
        campaign.snapshot.turnOwnerId = next.playerId;
        return;
      }
    }
  }

  private ensureConnectedTurnOwner(campaign: Campaign) {
    if (campaign.snapshot.phase === "combat" && campaign.snapshot.combat?.status === "active") {
      const active = campaign.snapshot.combat.initiative[campaign.snapshot.combat.initiativeIndex];
      const player = active?.kind === "player" ? campaign.players.find(value => value.playerId === active.playerId) : undefined;
      if (!player?.connected) {
        this.moveCombatCursor(campaign);
        this.resolveAutomatedCombatTurns(campaign);
      }
      return;
    }
    const owner = campaign.players.find(player => player.playerId === campaign.snapshot.turnOwnerId);
    if (!owner?.connected) {
      const ownerIndex = owner ? campaign.players.indexOf(owner) : -1;
      this.advanceTurnFrom(campaign, ownerIndex < 0 ? campaign.players.length - 1 : ownerIndex);
    }
  }

  private startSentinelEncounter(campaign: Campaign, actorId: string) {
    const initiative: CombatantInitiative[] = campaign.players.map(player => {
      const modifier = getHeroAbilityModifier(player.hero, "DEX");
      const roll = rollDie(20, this.random);
      return { kind: "player", playerId: player.playerId, name: player.name, roll, modifier, total: roll + modifier };
    });
    const sentinelRoll = rollDie(20, this.random);
    initiative.push({ kind: "sentinel", id: "crownbound-sentinel", name: "Crownbound Sentinel", roll: sentinelRoll, modifier: 0, total: sentinelRoll });
    const joinOrder = new Map(campaign.players.map((player, index) => [player.playerId, index]));
    initiative.sort((a, b) => b.total - a.total || b.modifier - a.modifier ||
      (a.kind === "player" && b.kind === "player" ? (joinOrder.get(a.playerId)! - joinOrder.get(b.playerId)!) : a.kind === "player" ? -1 : b.kind === "player" ? 1 : 0));
    const combat: MultiplayerCombatState = {
      encounterId: randomUUID(),
      enemy: { id: "crownbound-sentinel", name: "Crownbound Sentinel", hp: 22, maxHp: 22, ac: 12 },
      status: "active", returnScene: "contract", initiative, initiativeIndex: 0, round: 1,
      history: [], rewardClaimed: campaign.rewardClaims.has(sentinelVictoryMarker), recovered: false,
    };
    campaign.snapshot.combat = combat;
    campaign.snapshot.phase = "combat";
    const entries = initiative.map((entry, index) => `${index + 1}. ${entry.name} (${entry.total})`).join(" · ");
    this.recordCombat(campaign, {
      id: randomUUID(), round: 1, actorId, action: "encounter-start",
      text: `COMBAT: ${combat.enemy.name} tears free from the wall! Initiative: ${entries}.`,
    }, "danger");
    this.resolveAutomatedCombatTurns(campaign);
  }

  private recordCombat(campaign: Campaign, entry: CombatActionRecord, kind: "roll" | "good" | "danger") {
    const combat = campaign.snapshot.combat!;
    combat.history = [...combat.history, entry].slice(-40);
    campaign.snapshot.sharedLog = [...campaign.snapshot.sharedLog, { id: entry.id, text: entry.text, kind }].slice(-100);
  }

  private finishSentinelVictory(campaign: Campaign, playerId: string) {
    const combat = campaign.snapshot.combat!;
    const player = campaign.players.find(value => value.playerId === playerId)!;
    if (!campaign.rewardClaims.has(sentinelVictoryMarker)) {
      campaign.rewardClaims.add(sentinelVictoryMarker);
      if (!campaign.snapshot.explorationProgress.discoveries.includes("sentinel-victory")) campaign.snapshot.explorationProgress.discoveries.push("sentinel-victory");
      player.resources.xp += 50;
      player.resources.gold += 15;
      combat.rewardClaimed = true;
      this.recordCombat(campaign, {
        id: randomUUID(), round: combat.round, actorId: playerId, action: "victory",
        text: `${combat.enemy.name} falls. ${player.name} receives 50 XP and 15 gold. The party returns to ${combat.returnScene}.`,
      }, "good");
    } else {
      combat.rewardClaimed = true;
      this.recordCombat(campaign, {
        id: randomUUID(), round: combat.round, actorId: playerId, action: "victory",
        text: `${combat.enemy.name} falls, but its one-time reward has already been claimed.`,
      }, "good");
    }
    combat.status = "victory";
    campaign.snapshot.phase = "exploration";
    campaign.snapshot.scene = combat.returnScene;
    const index = campaign.players.findIndex(value => value.playerId === playerId);
    this.advanceTurnFrom(campaign, index);
  }

  private hasDefeatedSentinel(campaign: Campaign) {
    return campaign.rewardClaims.has(sentinelVictoryMarker)
      || campaign.snapshot.explorationProgress.discoveries.includes("sentinel-victory");
  }

  private moveCombatCursor(campaign: Campaign) {
    const combat = campaign.snapshot.combat!;
    combat.initiativeIndex += 1;
    if (combat.initiativeIndex >= combat.initiative.length) {
      combat.initiativeIndex = 0;
      combat.round += 1;
    }
  }

  private resolveAutomatedCombatTurns(campaign: Campaign) {
    const combat = campaign.snapshot.combat!;
    if (combat.status !== "active") return;
    let steps = 0;
    while (combat.status === "active" && steps++ < combat.initiative.length * 2) {
      const connectedLiving = campaign.players.some(player => player.connected && player.resources.hp > 0);
      if (!connectedLiving) {
        const next = combat.initiative.findIndex((entry, index) => index >= combat.initiativeIndex && entry.kind === "player");
        const fallback = next >= 0 ? next : combat.initiative.findIndex(entry => entry.kind === "player");
        if (fallback >= 0) {
          combat.initiativeIndex = fallback;
          campaign.snapshot.turnOwnerId = (combat.initiative[fallback] as Extract<CombatantInitiative, { kind: "player" }>).playerId;
        }
        return;
      }
      const current = combat.initiative[combat.initiativeIndex];
      if (!current) return;
      if (current.kind === "player") {
        const player = campaign.players.find(value => value.playerId === current.playerId);
        if (player?.connected && player.resources.hp > 0) {
          campaign.snapshot.turnOwnerId = current.playerId;
          return;
        }
        this.moveCombatCursor(campaign);
        continue;
      }
      const targetIndex = campaign.players
        .map((player, index) => ({ player, index }))
        .filter(({ player }) => player.connected && player.resources.hp > 0)
        .sort((a, b) => a.player.resources.hp - b.player.resources.hp || a.index - b.index)[0];
      if (!targetIndex) return;
      const target = targetIndex.player;
      const before = target.resources.hp;
      const damage = rollEnemyDamage(target.hero.difficulty, this.random);
      target.resources.hp = Math.max(0, before - damage.total);
      this.recordCombat(campaign, {
        id: randomUUID(), round: combat.round, actorId: current.id, action: "enemy-attack",
        text: `${combat.enemy.name} targets ${target.name}: d${damage.sides} (${damage.die}) + ${damage.bonus} = ${damage.total} damage. ${target.name}: ${before} → ${target.resources.hp} HP.`,
        details: { kind: "enemy-attack", targetPlayerId: target.playerId, die: damage.die, sides: damage.sides, bonus: damage.bonus, damage: damage.total, hpBefore: before, hpAfter: target.resources.hp },
      }, "danger");
      if (campaign.players.every(player => player.resources.hp === 0)) {
        combat.status = "defeat";
        campaign.snapshot.turnOwnerId = target.playerId;
        this.recordCombat(campaign, {
          id: randomUUID(), round: combat.round, actorId: current.id, action: "defeat",
          text: "Every hero is down. The Sentinel reward is not granted; retreat to recover and return to exploration.",
        }, "danger");
        return;
      }
      this.moveCombatCursor(campaign);
    }
  }
}

export type CampaignRecord = ReturnType<CampaignStore["create"]>["campaign"];
export type PlayerRecord = ReturnType<CampaignStore["create"]>["player"];
