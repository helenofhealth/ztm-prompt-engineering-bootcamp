import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { io as connectClient } from "socket.io-client";
import { createGameServer } from "../gameServer.ts";
import { PostgresCampaignPersistence } from "../persistence.ts";

const clientOrigin = "http://localhost:5173";
const databaseUrl = process.env.DATABASE_TEST_URL;
const hero = (name, overrides = {}) => ({
  name, gender: "female", className: "Warrior", ancestry: "Human", background: "Noble", difficulty: "Balanced", ...overrides,
});

async function connect(url) {
  const socket = connectClient(url, { transports: ["websocket"], extraHeaders: { Origin: clientOrigin }, forceNew: true, reconnection: false, timeout: 2_000 });
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  return socket;
}

const emitAck = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));

class MemoryPersistence {
  rows = new Map();
  commands = new Map();
  failNextCommand = false;

  async loadAll() { return structuredClone([...this.rows.values()]); }

  async commit(campaign, expectedRevision, commandId) {
    const id = campaign.snapshot.campaignId;
    const previous = this.rows.get(id);
    if (expectedRevision === null ? previous !== undefined : previous?.campaign.snapshot.revision !== expectedRevision) throw new Error("revision conflict");
    const ids = this.commands.get(id) ?? new Set();
    if (commandId && ids.has(commandId)) throw new Error("duplicate command");
    if (commandId && this.failNextCommand) { this.failNextCommand = false; throw new Error("injected persistence failure"); }
    if (commandId) ids.add(commandId);
    this.commands.set(id, ids);
    this.rows.set(id, structuredClone({ campaign, commandIds: [...ids] }));
  }
}

async function temporaryDatabase(t) {
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = `dc_test_${randomBytes(8).toString("hex")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const persistence = new PostgresCampaignPersistence(databaseUrl, { schema });
  await persistence.migrate();
  t.after(async () => {
    try {
      await persistence.close();
    } finally {
      try {
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    }
  });
  return { persistence, admin, schema };
}

async function startServer(persistence, random = () => 0.99) {
  const app = createGameServer({ persistence, clientOrigin, random });
  await app.initialize();
  const port = await app.listen(0);
  return { app, url: `http://127.0.0.1:${port}` };
}

test("commit failure leaves the in-memory campaign at its last committed state", async () => {
  const persistence = new MemoryPersistence();
  const app = createGameServer({ persistence, clientOrigin, random: () => 0.99 });
  await app.initialize();
  const port = await app.listen(0);
  const url = `http://127.0.0.1:${port}`;
  const client = await connect(url);
  try {
    const created = await emitAck(client, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const committed = structuredClone(app.store.snapshot(app.store.getById(created.snapshot.campaignId)));
    let broadcasts = 0;
    client.on("campaign:snapshot", () => { broadcasts += 1; });
    persistence.failNextCommand = true;
    const failed = await emitAck(client, "campaign:act", {
      campaignId: created.snapshot.campaignId,
      commandId: "storage_fail_001",
      expectedRevision: committed.revision,
      action: "study-entry",
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.error.code, "SERVER_ERROR");
    assert.deepEqual(app.store.snapshot(app.store.getById(created.snapshot.campaignId)), committed);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(broadcasts, 0);
    assert.equal(persistence.rows.get(created.snapshot.campaignId).campaign.snapshot.revision, committed.revision);
  } finally {
    client.disconnect();
    await app.close();
  }
});

test("campaign hydration restores credentials and command deduplication across server instances", async () => {
  const persistence = new MemoryPersistence();
  const first = await startServer(persistence);
  const firstClients = [];
  let inviteCode;
  let hostToken;
  let guestToken;
  let campaignId;
  try {
    const host = await connect(first.url); firstClients.push(host);
    const guest = await connect(first.url); firstClients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Persisted Host") });
    inviteCode = created.snapshot.inviteCode;
    campaignId = created.snapshot.campaignId;
    hostToken = created.resumeToken;
    const joined = await emitAck(guest, "campaign:join", { inviteCode, character: hero("Persisted Guest", { className: "Mage", ancestry: "Elf" }) });
    guestToken = joined.resumeToken;
    const command = {
      campaignId, commandId: "memory_restart_action", expectedRevision: joined.snapshot.revision, action: "study-entry",
    };
    const accepted = await emitAck(host, "campaign:act", command);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.snapshot.players[0].resources.xp, 10);
    const left = await emitAck(guest, "campaign:leave", { campaignId });
    assert.deepEqual(left, { ok: true, left: true });
    assert.equal(JSON.stringify(persistence.rows.get(campaignId)).includes(hostToken), false);
  } finally {
    firstClients.forEach(client => client.disconnect());
    await first.app.close();
  }

  const second = await startServer(persistence);
  const returning = await connect(second.url);
  const departed = await connect(second.url);
  try {
    const resumed = await emitAck(returning, "campaign:resume", { inviteCode, resumeToken: hostToken });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.snapshot.players[0].resources.xp, 10);
    assert.equal(resumed.snapshot.players[0].resources.hp, resumed.snapshot.players[0].resources.maxHp);
    assert.equal(resumed.snapshot.players[0].resources.gold, 25);
    assert.deepEqual(resumed.snapshot.players[0].resources.inventory, ["Warrior starting gear"]);
    assert.equal(resumed.snapshot.players[1].hero.className, "Mage");
    assert.equal(resumed.snapshot.players[1].connected, false);
    assert.equal(resumed.snapshot.scene, "contract");
    assert.equal(resumed.snapshot.turnOwnerId, resumed.playerId);
    assert.ok(resumed.snapshot.sharedLog.some(entry => entry.check?.label === "Royal history" && entry.check.success));
    const replay = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "memory_restart_action", expectedRevision: resumed.snapshot.revision, action: "study-entry",
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.error.code, "DUPLICATE_COMMAND");
    assert.equal(second.app.store.snapshot(second.app.store.getById(campaignId)).players[0].resources.xp, 10);
    const revoked = await emitAck(departed, "campaign:resume", { inviteCode, resumeToken: guestToken });
    assert.equal(revoked.ok, false);
    assert.equal(revoked.error.code, "INVALID_RESUME_TOKEN");
  } finally {
    returning.disconnect(); departed.disconnect();
    await second.app.close();
  }
});

test("PostgreSQL restores campaign state, revoked credentials, and accepted command IDs after restart", { skip: !databaseUrl }, async t => {
  const { persistence, schema } = await temporaryDatabase(t);
  const first = await startServer(persistence);
  const clients = [];
  let saved;
  let inviteCode;
  let hostToken;
  let guestToken;
  let acceptedCommand;
  try {
    const host = await connect(first.url); clients.push(host);
    const guest = await connect(first.url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "plague-below", character: hero("Host") });
    inviteCode = created.snapshot.inviteCode;
    hostToken = created.resumeToken;
    const joined = await emitAck(guest, "campaign:join", { inviteCode, character: hero("Guest", { className: "Mage", ancestry: "Elf" }) });
    guestToken = joined.resumeToken;
    const action = {
      campaignId: created.snapshot.campaignId,
      commandId: "postgres_action_001",
      expectedRevision: joined.snapshot.revision,
      action: "study-entry",
    };
    const [accepted, duplicate] = await Promise.all([
      emitAck(host, "campaign:act", action),
      emitAck(host, "campaign:act", action),
    ]);
    assert.equal(accepted.ok, true);
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.error.code, "DUPLICATE_COMMAND");
    acceptedCommand = "postgres_action_001";
    const left = await emitAck(guest, "campaign:leave", { campaignId: created.snapshot.campaignId });
    assert.deepEqual(left, { ok: true, left: true });
  } finally {
    for (const client of clients) client.disconnect();
    await first.app.close();
  }
  const secondPersistence = new PostgresCampaignPersistence(databaseUrl, { schema });
  await secondPersistence.migrate();
  const storedAfterShutdown = await secondPersistence.loadAll();
  saved = structuredClone(storedAfterShutdown[0].campaign.snapshot);
  assert.equal(saved.players[0].resources.xp, 10);
  assert.equal(saved.players[0].resources.inventory.length, 1);
  assert.equal(saved.players[0].resources.gold, 25);
  assert.equal(saved.players[1].hero.className, "Mage");
  assert.equal(saved.turnOwnerId, saved.players[0].playerId);

  const second = await startServer(secondPersistence);
  const resumedHost = await connect(second.url);
  const revokedGuest = await connect(second.url);
  try {
    const host = await emitAck(resumedHost, "campaign:resume", { inviteCode, resumeToken: hostToken });
    assert.equal(host.ok, true);
    assert.equal(host.snapshot.revision, saved.revision + 1);
    assert.equal(host.snapshot.turnOwnerId, saved.turnOwnerId);
    assert.deepEqual(host.snapshot.sharedLog.slice(0, saved.sharedLog.length), saved.sharedLog);
    assert.equal(host.snapshot.sharedLog.length, saved.sharedLog.length + 1);
    assert.equal(host.snapshot.sharedLog.at(-1).text, "Host reconnected.");
    assert.deepEqual(host.snapshot.players.map(player => player.hero), saved.players.map(player => player.hero));
    assert.deepEqual(host.snapshot.players.map(player => player.resources), saved.players.map(player => player.resources));
    const replay = await emitAck(resumedHost, "campaign:act", {
      campaignId: host.snapshot.campaignId,
      commandId: acceptedCommand,
      expectedRevision: host.snapshot.revision,
      action: "study-entry",
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.error.code, "DUPLICATE_COMMAND");
    const revoked = await emitAck(revokedGuest, "campaign:resume", { inviteCode, resumeToken: guestToken });
    assert.equal(revoked.ok, false);
    assert.equal(revoked.error.code, "INVALID_RESUME_TOKEN");
  } finally {
    resumedHost.disconnect(); revokedGuest.disconnect();
    await second.app.close();
  }
});

test("PostgreSQL transaction failure does not acknowledge or broadcast an action", { skip: !databaseUrl }, async t => {
  const { persistence, admin, schema } = await temporaryDatabase(t);
  const rolls = [0.99, 0, 0.99, 0.99];
  const server = await startServer(persistence, () => rolls.length ? rolls.shift() : 0.99);
  const client = await connect(server.url);
  try {
    const created = await emitAck(client, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const entry = await emitAck(client, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "postgres_combat_entry", expectedRevision: created.snapshot.revision, action: "study-entry",
    });
    const failedContract = await emitAck(client, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "postgres_combat_fail", expectedRevision: entry.snapshot.revision, action: "interpret-contract",
    });
    assert.equal(failedContract.snapshot.phase, "combat");
    const before = structuredClone(server.app.store.snapshot(server.app.store.getById(created.snapshot.campaignId)));
    await admin.query(`CREATE FUNCTION "${schema}".reject_campaign_command() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected database failure'; END $$`);
    await admin.query(`CREATE TRIGGER reject_command BEFORE INSERT ON "${schema}".dungeon_crawl_commands FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_campaign_command()`);
    let broadcasts = 0;
    client.on("campaign:snapshot", () => { broadcasts += 1; });
    const failed = await emitAck(client, "campaign:combat:act", {
      campaignId: created.snapshot.campaignId,
      commandId: "postgres_fail_001",
      expectedRevision: before.revision,
      action: "attack",
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.error.code, "SERVER_ERROR");
    assert.deepEqual(server.app.store.snapshot(server.app.store.getById(created.snapshot.campaignId)), before);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(broadcasts, 0);
    const committed = await persistence.loadAll();
    assert.equal(committed[0].campaign.snapshot.revision, before.revision);
    assert.deepEqual(committed[0].commandIds, ["postgres_combat_entry", "postgres_combat_fail"]);
    assert.equal(committed[0].commandIds.includes("postgres_fail_001"), false);
  } finally {
    client.disconnect();
    await server.app.close();
  }
});

test("PostgreSQL restores exploration scene, rewards, progress, resources, and deduplication after restart", { skip: !databaseUrl }, async t => {
  const { persistence, schema } = await temporaryDatabase(t);
  const first = await startServer(persistence);
  const client = await connect(first.url);
  let inviteCode;
  let resumeToken;
  let campaignId;
  let acceptedCommand;
  try {
    const created = await emitAck(client, "campaign:create", {
      scenarioId: "lost-heir", character: hero("Persistent Explorer", { className: "Mage", ancestry: "Dwarf" }),
    });
    inviteCode = created.snapshot.inviteCode;
    resumeToken = created.resumeToken;
    campaignId = created.snapshot.campaignId;
    const actions = [
      ["phase3_entry_001", "study-entry"],
      ["phase3_contract_01", "interpret-contract"],
      ["phase3_continue_01", "continue-expedition"],
      ["phase3_door_nav_01", "approach-sealed-door"],
      ["phase3_force_seal_01", "force-seal"],
      ["phase3_cache_001", "search-cache"],
    ];
    let snapshot = created.snapshot;
    for (const [commandId, action] of actions) {
      const accepted = await emitAck(client, "campaign:act", {
        campaignId, commandId, expectedRevision: snapshot.revision, action,
      });
      assert.equal(accepted.ok, true, `${action} should be accepted`);
      snapshot = accepted.snapshot;
      acceptedCommand = commandId;
    }
    assert.equal(snapshot.scene, "victory");
    assert.equal(snapshot.players[0].resources.hp, 14);
    assert.equal(snapshot.players[0].resources.xp, 40);
    assert.equal(snapshot.players[0].resources.gold, 35);
    assert.deepEqual(snapshot.players[0].resources.inventory, ["Mage starting gear", "Silver key", "Blood-forged key", "Royal ward charm"]);
  } finally {
    client.disconnect();
    await first.app.close();
  }

  const restoredPersistence = new PostgresCampaignPersistence(databaseUrl, { schema });
  await restoredPersistence.migrate();
  const stored = await restoredPersistence.loadAll();
  assert.equal(stored.length, 1);
  const saved = stored[0].campaign.snapshot;
  assert.equal(saved.phase, "exploration");
  assert.equal(saved.scene, "victory");
  assert.deepEqual(saved.explorationProgress.visitedScenes, ["gate", "contract", "victory", "blood-door", "armory"]);
  assert.deepEqual(saved.explorationProgress.discoveries, ["entry-study", "contract-insight", "sealed-door-key", "vault-cache"]);
  assert.equal(stored[0].campaign.players[0].resources.xp, 40);
  assert.equal(stored[0].campaign.players[0].resources.gold, 35);
  assert.deepEqual(stored[0].campaign.players[0].resources.inventory, ["Mage starting gear", "Silver key", "Blood-forged key", "Royal ward charm"]);
  assert.ok(saved.sharedLog.some(entry => entry.text.includes("Blood-forged key")));

  const second = await startServer(restoredPersistence);
  const returning = await connect(second.url);
  try {
    const resumed = await emitAck(returning, "campaign:resume", { inviteCode, resumeToken });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.snapshot.scene, "victory");
    assert.deepEqual(resumed.snapshot.explorationProgress, saved.explorationProgress);
    assert.equal(resumed.snapshot.players[0].resources.hp, 14);
    assert.equal(resumed.snapshot.players[0].resources.xp, 40);
    assert.equal(resumed.snapshot.players[0].resources.gold, 35);
    assert.deepEqual(resumed.snapshot.players[0].resources.inventory, ["Mage starting gear", "Silver key", "Blood-forged key", "Royal ward charm"]);
    const duplicate = await emitAck(returning, "campaign:act", {
      campaignId, commandId: acceptedCommand, expectedRevision: resumed.snapshot.revision, action: "search-cache",
    });
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.error.code, "DUPLICATE_COMMAND");
    assert.equal(second.app.store.snapshot(second.app.store.getById(campaignId)).players[0].resources.xp, 40);
    assert.equal(second.app.store.snapshot(second.app.store.getById(campaignId)).players[0].resources.gold, 35);
    const continued = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_continue", expectedRevision: resumed.snapshot.revision, action: "continue-expedition",
    });
    assert.equal(continued.ok, true);
    const beforeRewardRetry = second.app.store.snapshot(second.app.store.getById(campaignId));
    const retry = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_retry", expectedRevision: continued.snapshot.revision, action: "study-entry",
    });
    assert.equal(retry.ok, false);
    assert.equal(retry.error.code, "ACTION_UNAVAILABLE");
    assert.deepEqual(second.app.store.snapshot(second.app.store.getById(campaignId)), beforeRewardRetry);

    const toWell = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_well_nav", expectedRevision: beforeRewardRetry.revision, action: "investigate-well",
    });
    assert.equal(toWell.ok, true);
    const wellReward = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_well_reward", expectedRevision: toWell.snapshot.revision, action: "study-well",
    });
    assert.equal(wellReward.ok, true);
    assert.equal(wellReward.snapshot.scene, "contract");
    assert.equal(wellReward.snapshot.players[0].resources.xp, 50);
    const beforeInsightRetry = second.app.store.snapshot(second.app.store.getById(campaignId));
    const insightRetry = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_insight_retry", expectedRevision: beforeInsightRetry.revision, action: "interpret-contract",
    });
    assert.equal(insightRetry.ok, false);
    assert.equal(insightRetry.error.code, "ACTION_UNAVAILABLE");
    assert.deepEqual(second.app.store.snapshot(second.app.store.getById(campaignId)), beforeInsightRetry);
    assert.equal(beforeInsightRetry.players[0].resources.xp, 50);
    assert.equal(beforeInsightRetry.explorationProgress.discoveries.includes("contract-insight"), true);
    assert.equal(beforeInsightRetry.players[0].resources.inventory.filter(item => item === "Silver key").length, 1);

    const returnFromContract = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_return_contract", expectedRevision: beforeInsightRetry.revision, action: "return-to-gate",
    });
    const returnDoor = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_return_door", expectedRevision: returnFromContract.snapshot.revision, action: "approach-sealed-door",
    });
    const beforeKeyRetry = second.app.store.snapshot(second.app.store.getById(campaignId));
    const keyRetry = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_key_retry", expectedRevision: returnDoor.snapshot.revision, action: "force-seal",
    });
    assert.equal(keyRetry.ok, false);
    assert.equal(keyRetry.error.code, "ACTION_UNAVAILABLE");
    assert.deepEqual(second.app.store.snapshot(second.app.store.getById(campaignId)), beforeKeyRetry);
    assert.equal(beforeKeyRetry.players[0].resources.inventory.filter(item => item === "Blood-forged key").length, 1);
    assert.equal(beforeKeyRetry.explorationProgress.discoveries.includes("sealed-door-key"), true);

    // The alternative seal action may still claim its unclaimed insight marker,
    // but it must not award a second key after the restored key claim.
    const alternateSeal = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_read_seal", expectedRevision: beforeKeyRetry.revision, action: "read-seal",
    });
    assert.equal(alternateSeal.ok, true);
    assert.equal(alternateSeal.snapshot.players[0].resources.xp, 65);
    assert.equal(alternateSeal.snapshot.players[0].resources.inventory.filter(item => item === "Blood-forged key").length, 1);
    assert.equal(alternateSeal.snapshot.explorationProgress.discoveries.includes("sealed-door-insight"), true);

    const beforeItemRetry = second.app.store.snapshot(second.app.store.getById(campaignId));
    const itemRetry = await emitAck(returning, "campaign:act", {
      campaignId, commandId: "phase3_restart_item_retry", expectedRevision: beforeItemRetry.revision, action: "search-cache",
    });
    assert.equal(itemRetry.ok, false);
    assert.equal(itemRetry.error.code, "ACTION_UNAVAILABLE");
    assert.deepEqual(second.app.store.snapshot(second.app.store.getById(campaignId)), beforeItemRetry);
    assert.equal(beforeItemRetry.players[0].resources.xp, 65);
    assert.equal(beforeItemRetry.players[0].resources.gold, 35);
    assert.equal(beforeItemRetry.players[0].resources.inventory.filter(item => item === "Royal ward charm").length, 1);
    assert.equal(beforeItemRetry.explorationProgress.discoveries.includes("vault-cache"), true);
  } finally {
    returning.disconnect();
    await second.app.close();
  }
});

test("PostgreSQL restores an active Sentinel fight, initiative, resources and command deduplication after restart", { skip: !databaseUrl }, async t => {
  const { persistence, schema } = await temporaryDatabase(t);
  const rolls = [0.99, 0, 0.99, 0.99, 0.99, 0.99, 0.99];
  const first = await startServer(persistence, () => rolls.length ? rolls.shift() : 0.99);
  const client = await connect(first.url);
  let campaignId;
  let inviteCode;
  let resumeToken;
  const acceptedCommand = "postgres_combat_attack_1";
  try {
    const created = await emitAck(client, "campaign:create", { scenarioId: "lost-heir", character: hero("Combat Persist", { className: "Warrior", ancestry: "Human" }) });
    campaignId = created.snapshot.campaignId;
    inviteCode = created.snapshot.inviteCode;
    resumeToken = created.resumeToken;
    const entry = await emitAck(client, "campaign:act", {
      campaignId, commandId: "combat_persist_entry", expectedRevision: created.snapshot.revision, action: "study-entry",
    });
    const failed = await emitAck(client, "campaign:act", {
      campaignId, commandId: "combat_persist_contract", expectedRevision: entry.snapshot.revision, action: "interpret-contract",
    });
    assert.equal(failed.snapshot.phase, "combat");
    const attack = await emitAck(client, "campaign:combat:act", {
      campaignId, commandId: acceptedCommand, expectedRevision: failed.snapshot.revision, action: "attack",
    });
    assert.equal(attack.ok, true);
    assert.equal(attack.snapshot.combat.enemy.hp, 11);
    assert.equal(attack.snapshot.players[0].resources.hp, 17);
    assert.equal(attack.snapshot.combat.history.filter(entry => entry.action === "enemy-attack").length, 1);
  } finally {
    client.disconnect();
    await first.app.close();
  }

  const restoredPersistence = new PostgresCampaignPersistence(databaseUrl, { schema });
  t.after(() => restoredPersistence.close());
  const loaded = await restoredPersistence.loadAll();
  assert.equal(loaded.length, 1);
  const stored = loaded[0];
  const saved = stored.campaign.snapshot;
  assert.equal(saved.phase, "combat");
  assert.equal(saved.combat.status, "active");
  assert.equal(saved.combat.enemy.hp, 11);
  assert.equal(saved.combat.enemy.maxHp, 22);
  assert.equal(saved.players[0].resources.hp, 17);
  assert.equal(saved.players[0].resources.xp, 10);
  assert.equal(saved.players[0].resources.gold, 25);
  assert.equal(saved.combat.initiativeIndex, 0);
  assert.equal(saved.combat.round, 2);
  assert.ok(saved.combat.history.some(entry => entry.action === "attack" && entry.details.damage === 11));
  assert.ok(saved.combat.history.some(entry => entry.action === "enemy-attack" && entry.details.targetPlayerId === saved.players[0].playerId));
  assert.ok(stored.commandIds.includes(acceptedCommand));

  const second = await startServer(restoredPersistence, () => 0.99);
  const returning = await connect(second.url);
  try {
    const resumed = await emitAck(returning, "campaign:resume", { inviteCode, resumeToken });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.snapshot.combat.status, "active");
    assert.equal(resumed.snapshot.combat.enemy.hp, 11);
    assert.deepEqual(resumed.snapshot.combat.initiative, saved.combat.initiative);
    assert.equal(resumed.snapshot.combat.initiativeIndex, saved.combat.initiativeIndex);
    assert.equal(resumed.snapshot.combat.round, saved.combat.round);
    assert.deepEqual(resumed.snapshot.combat.history, saved.combat.history);
    assert.equal(resumed.snapshot.players[0].resources.hp, 17);
    assert.equal(resumed.snapshot.players[0].resources.xp, 10);
    assert.equal(resumed.snapshot.turnOwnerId, resumed.playerId);

    const replay = await emitAck(returning, "campaign:combat:act", {
      campaignId, commandId: acceptedCommand, expectedRevision: resumed.snapshot.revision, action: "attack",
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.error.code, "DUPLICATE_COMMAND");
    assert.equal(second.app.store.snapshot(second.app.store.getById(campaignId)).combat.enemy.hp, 11);

    const final = await emitAck(returning, "campaign:combat:act", {
      campaignId, commandId: "postgres_combat_finish_1", expectedRevision: resumed.snapshot.revision, action: "attack",
    });
    assert.equal(final.ok, true);
    assert.equal(final.snapshot.combat.status, "victory");
    assert.equal(final.snapshot.players[0].resources.xp, 60);
    assert.equal(final.snapshot.players[0].resources.gold, 40);
    assert.equal(final.snapshot.explorationProgress.discoveries.filter(value => value === "sentinel-victory").length, 1);
  } finally {
    returning.disconnect();
    await second.app.close();
  }
});

test("PostgreSQL preserves the one-time Sentinel victory across restart and fresh contract retries", { skip: !databaseUrl }, async t => {
  const { persistence, schema } = await temporaryDatabase(t);
  const rolls = [0.99, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
  const first = await startServer(persistence, () => rolls.length ? rolls.shift() : 0.99);
  const client = await connect(first.url);
  let campaignId;
  let inviteCode;
  let resumeToken;
  let beforeRestart;
  try {
    const created = await emitAck(client, "campaign:create", { scenarioId: "lost-heir", character: hero("One-time Sentinel") });
    campaignId = created.snapshot.campaignId;
    inviteCode = created.snapshot.inviteCode;
    resumeToken = created.resumeToken;
    const entry = await emitAck(client, "campaign:act", {
      campaignId, commandId: "sentinel_once_entry_01", expectedRevision: created.snapshot.revision, action: "study-entry",
    });
    const failed = await emitAck(client, "campaign:act", {
      campaignId, commandId: "sentinel_once_first_fail", expectedRevision: entry.snapshot.revision, action: "interpret-contract",
    });
    assert.equal(failed.ok, true);
    assert.equal(failed.snapshot.phase, "combat");

    const firstHit = await emitAck(client, "campaign:combat:act", {
      campaignId, commandId: "sentinel_once_attack_01", expectedRevision: failed.snapshot.revision, action: "attack",
    });
    const victory = await emitAck(client, "campaign:combat:act", {
      campaignId, commandId: "sentinel_once_attack_02", expectedRevision: firstHit.snapshot.revision, action: "attack",
    });
    assert.equal(victory.ok, true);
    assert.equal(victory.snapshot.combat.status, "victory");
    assert.equal(victory.snapshot.players[0].resources.xp, 60);
    assert.equal(victory.snapshot.players[0].resources.gold, 40);
    assert.equal(victory.snapshot.explorationProgress.discoveries.filter(value => value === "sentinel-victory").length, 1);
    beforeRestart = structuredClone(victory.snapshot);
  } finally {
    client.disconnect();
    await first.app.close();
  }

  const restoredPersistence = new PostgresCampaignPersistence(databaseUrl, { schema });
  const restored = await restoredPersistence.loadAll();
  assert.equal(restored.length, 1);
  assert.ok(restored[0].campaign.rewardClaims.includes("__reward_claimed__:lost-heir:sentinel-victory"));
  assert.ok(restored[0].commandIds.includes("sentinel_once_attack_02"));

  let randomCalls = 0;
  const second = await startServer(restoredPersistence, () => { randomCalls += 1; return 0; });
  const returning = await connect(second.url);
  try {
    const resumed = await emitAck(returning, "campaign:resume", { inviteCode, resumeToken });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.snapshot.combat.status, "victory");
    assert.equal(resumed.snapshot.combat.enemy.hp, 0);
    assert.equal(resumed.snapshot.players[0].resources.xp, 60);
    assert.equal(resumed.snapshot.players[0].resources.gold, 40);
    assert.equal(resumed.snapshot.explorationProgress.discoveries.filter(value => value === "sentinel-victory").length, 1);
    assert.deepEqual(resumed.snapshot.combat.initiative, beforeRestart.combat.initiative);

    const retryPayload = {
      campaignId, commandId: "sentinel_once_after_restart_fail", expectedRevision: resumed.snapshot.revision, action: "interpret-contract",
    };
    const retry = await emitAck(returning, "campaign:act", retryPayload);
    assert.equal(retry.ok, true);
    assert.equal(retry.snapshot.phase, "exploration");
    assert.equal(retry.snapshot.scene, "contract");
    assert.equal(retry.snapshot.combat.status, "victory");
    assert.equal(retry.snapshot.combat.enemy.hp, 0);
    assert.deepEqual(retry.snapshot.combat.initiative, beforeRestart.combat.initiative);
    assert.equal(retry.snapshot.players[0].resources.xp, 60);
    assert.equal(retry.snapshot.players[0].resources.gold, 40);
    assert.equal(retry.snapshot.explorationProgress.discoveries.filter(value => value === "sentinel-victory").length, 1);
    assert.match(retry.snapshot.sharedLog.at(-1).text, /Sentinel has already been defeated/);
    assert.equal(randomCalls, 1, "only the failed contract check should roll; no initiative should be rerolled");

    const afterRetry = structuredClone(second.app.store.snapshot(second.app.store.getById(campaignId)));
    const duplicate = await emitAck(returning, "campaign:act", retryPayload);
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.error.code, "DUPLICATE_COMMAND");
    assert.deepEqual(second.app.store.snapshot(second.app.store.getById(campaignId)), afterRetry);
  } finally {
    returning.disconnect();
    await second.app.close();
  }
});
