import assert from "node:assert/strict";
import test from "node:test";
import { io as connectClient } from "socket.io-client";
import { createGameServer } from "../gameServer.ts";

const origin = "http://localhost:5173";
const hero = (name, overrides = {}) => ({
  name, gender: "female", className: "Warrior", ancestry: "Human", background: "Noble", difficulty: "Balanced", ...overrides,
});
const sequence = (...values) => { let index = 0; return () => values[index++] ?? 0.999999; };
const emitAck = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));

async function connect(url) {
  const socket = connectClient(url, { transports: ["websocket"], extraHeaders: { Origin: origin }, forceNew: true, reconnection: false, timeout: 2_000 });
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  return socket;
}

async function openServer(random, persistence) {
  const app = createGameServer({ clientOrigin: origin, random, persistence });
  await app.initialize();
  const port = await app.listen(0);
  return { app, url: `http://127.0.0.1:${port}` };
}

async function action(socket, snapshot, action, commandId) {
  return emitAck(socket, "campaign:act", { campaignId: snapshot.campaignId, commandId, expectedRevision: snapshot.revision, action });
}

async function startFailedContract(socket, heroValue = hero("Hero")) {
  const created = await emitAck(socket, "campaign:create", { scenarioId: "lost-heir", character: heroValue });
  let result = await action(socket, created.snapshot, "study-entry", "combat_entry_01");
  assert.equal(result.ok, true);
  result = await action(socket, result.snapshot, "interpret-contract", "combat_contract_fail");
  result.resumeToken = created.resumeToken;
  result.inviteCode = created.snapshot.inviteCode;
  return result;
}

test("Lost Heir contract failure starts the Sentinel encounter; success remains exploration", async () => {
  const failedServer = await openServer(sequence(0.999999, 0, 0.999999, 0.999999));
  const failedClient = await connect(failedServer.url);
  try {
    const failed = await startFailedContract(failedClient);
    assert.equal(failed.ok, true);
    assert.equal(failed.snapshot.phase, "combat");
    assert.equal(failed.snapshot.scene, "contract");
    assert.equal(failed.snapshot.combat.status, "active");
    assert.equal(failed.snapshot.combat.enemy.name, "Crownbound Sentinel");
    assert.equal(failed.snapshot.combat.enemy.hp, 22);
    assert.equal(failed.snapshot.combat.enemy.ac, 12);
    assert.equal(failed.snapshot.combat.returnScene, "contract");
    assert.ok(failed.snapshot.sharedLog.some(entry => entry.check?.success === false));
    assert.ok(failed.snapshot.sharedLog.some(entry => entry.text.includes("tears free from the wall")));
  } finally { failedClient.disconnect(); await failedServer.app.close(); }

  const successServer = await openServer(() => 0.999999);
  const successClient = await connect(successServer.url);
  try {
    const created = await emitAck(successClient, "campaign:create", { scenarioId: "lost-heir", character: hero("Heir") });
    const entry = await action(successClient, created.snapshot, "study-entry", "success_entry_01");
    const success = await action(successClient, entry.snapshot, "interpret-contract", "success_contract_1");
    assert.equal(success.ok, true);
    assert.equal(success.snapshot.phase, "exploration");
    assert.equal(success.snapshot.combat, null);
    assert.equal(success.snapshot.scene, "victory");
  } finally { successClient.disconnect(); await successServer.app.close(); }
});

test("initiative uses server d20 plus Dexterity and stable ties; disconnected players are skipped by Sentinel targeting", async () => {
  const server = await openServer(sequence(0.999999, 0, 0.999999, 0.999999, 0.999999, 0, 0, 0.999999, 0));
  const clients = [];
  try {
    const host = await connect(server.url); clients.push(host);
    const guest = await connect(server.url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Mage", { className: "Mage", ancestry: "Elf" }) });
    const entry = await action(host, joined.snapshot, "study-entry", "multi_entry_01");
    assert.equal(entry.ok, true);
    const failed = await action(guest, entry.snapshot, "interpret-contract", "multi_contract_01");
    assert.equal(failed.ok, true);
    const order = failed.snapshot.combat.initiative;
    assert.deepEqual(order.map(combatant => combatant.name), ["Mage", "Host", "Crownbound Sentinel"]);
    assert.deepEqual(order.map(combatant => combatant.total), [22, 21, 20]);
    assert.equal(failed.snapshot.turnOwnerId, joined.playerId);

    const guestMiss = await emitAck(guest, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "guest_attack_miss", expectedRevision: failed.snapshot.revision, action: "attack" });
    assert.equal(guestMiss.ok, true);
    assert.equal(guestMiss.snapshot.combat.enemy.hp, 22);
    assert.equal(guestMiss.snapshot.turnOwnerId, created.playerId);
    const hostMiss = await emitAck(host, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "host_attack_miss", expectedRevision: guestMiss.snapshot.revision, action: "attack" });
    assert.equal(hostMiss.ok, true);
    const sentinelEntry = hostMiss.snapshot.combat.history.findLast(record => record.action === "enemy-attack");
    assert.equal(sentinelEntry.details.targetPlayerId, joined.playerId);
    assert.equal(sentinelEntry.details.damage, 7);
    assert.equal(hostMiss.snapshot.players[1].resources.hp, 10);

    const connectedAfterLeave = await new Promise(resolve => {
      const poll = () => {
        const snapshot = server.app.store.snapshot(server.app.store.getById(failed.snapshot.campaignId));
        if (!snapshot.players[1].connected) resolve(snapshot); else setTimeout(poll, 5);
      };
      guest.disconnect(); poll();
    });
    assert.equal(connectedAfterLeave.players[1].connected, false);
    const afterDisconnectMiss = await emitAck(host, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "host_miss_after_leave", expectedRevision: connectedAfterLeave.revision, action: "attack" });
    assert.equal(afterDisconnectMiss.ok, true);
    const skipped = afterDisconnectMiss.snapshot.combat.history.findLast(record => record.action === "enemy-attack");
    assert.equal(skipped.details.targetPlayerId, created.playerId);
    assert.ok(!afterDisconnectMiss.snapshot.combat.history.some(record => record.action === "enemy-attack" && record.details?.targetPlayerId === joined.playerId && record.round > sentinelEntry.round));
  } finally { for (const client of clients) client.disconnect(); await server.app.close(); }
});

test("equal initiative scores preserve player join order and put the Sentinel after tied players", async () => {
  const server = await openServer(sequence(0.999999, 0, 0.999999, 0.999999, 0.999999, 0.999999));
  const clients = [];
  try {
    const host = await connect(server.url); clients.push(host);
    const second = await connect(server.url); clients.push(second);
    const third = await connect(server.url); clients.push(third);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("First") });
    const joinedSecond = await emitAck(second, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Second") });
    const joinedThird = await emitAck(third, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Third") });
    const entry = await action(host, joinedThird.snapshot, "study-entry", "tie_entry_001");
    const failed = await action(second, entry.snapshot, "interpret-contract", "tie_contract_01");
    assert.equal(failed.ok, true);
    assert.deepEqual(failed.snapshot.combat.initiative.map(item => item.name), ["First", "Second", "Third", "Crownbound Sentinel"]);
    assert.deepEqual(failed.snapshot.combat.initiative.map(item => item.total), [21, 21, 21, 20]);
    assert.deepEqual(failed.snapshot.combat.initiative.map(item => item.modifier), [1, 1, 1, 0]);
    assert.notEqual(joinedSecond.playerId, joinedThird.playerId);
  } finally { for (const client of clients) client.disconnect(); await server.app.close(); }
});

test("attack natural 20, victory reward, and fresh-command contract retries cannot restart the Sentinel", async () => {
  const server = await openServer(sequence(0.999999, 0, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999, 0, 0.999999, 0.999999));
  const client = await connect(server.url);
  try {
    const failed = await startFailedContract(client);
    const first = await emitAck(client, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "attack_first_01", expectedRevision: failed.snapshot.revision, action: "attack" });
    assert.equal(first.ok, true);
    const attackRecord = first.snapshot.combat.history.find(record => record.action === "attack");
    assert.equal(attackRecord.details.die, 20);
    assert.match(attackRecord.text, /Natural 20/);
    assert.equal(attackRecord.details.damage, 11);
    assert.equal(first.snapshot.combat.enemy.hp, 11);
    assert.equal(first.snapshot.players[0].resources.hp, 17);
    const won = await emitAck(client, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "attack_finish_01", expectedRevision: first.snapshot.revision, action: "attack" });
    assert.equal(won.ok, true);
    assert.equal(won.snapshot.combat.status, "victory");
    assert.equal(won.snapshot.phase, "exploration");
    assert.equal(won.snapshot.scene, "contract");
    assert.equal(won.snapshot.players[0].resources.xp, 60);
    assert.equal(won.snapshot.players[0].resources.gold, 40);
    assert.equal(won.snapshot.explorationProgress.discoveries.filter(value => value === "sentinel-victory").length, 1);

    const beforeRetry = structuredClone(won.snapshot);
    const retry = await action(client, won.snapshot, "interpret-contract", "combat_retry_fail");
    assert.equal(retry.ok, true);
    assert.equal(retry.snapshot.phase, "exploration");
    assert.equal(retry.snapshot.scene, "contract");
    assert.equal(retry.snapshot.combat.status, "victory");
    assert.equal(retry.snapshot.combat.enemy.hp, 0);
    assert.deepEqual(retry.snapshot.combat.initiative, beforeRetry.combat.initiative);
    assert.deepEqual(retry.snapshot.players.map(player => player.resources), beforeRetry.players.map(player => player.resources));
    assert.equal(retry.snapshot.explorationProgress.discoveries.filter(value => value === "sentinel-victory").length, 1);
    assert.match(retry.snapshot.sharedLog.at(-1).text, /Sentinel has already been defeated/);
    assert.match(retry.snapshot.sharedLog.at(-1).text, /FAILURE/);

    const duplicate = await action(client, retry.snapshot, "interpret-contract", "combat_retry_fail");
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.error.code, "DUPLICATE_COMMAND");
    assert.deepEqual(server.app.store.snapshot(server.app.store.getById(retry.snapshot.campaignId)), retry.snapshot);
  } finally { client.disconnect(); await server.app.close(); }
});

test("the player landing the defeating attack receives the one-time reward", async () => {
  const server = await openServer(sequence(0.999999, 0, 0.999999, 0.999999));
  const clients = [];
  try {
    const host = await connect(server.url); clients.push(host);
    const guest = await connect(server.url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Rogue", { className: "Rogue", ancestry: "Elf" }) });
    const entry = await action(host, joined.snapshot, "study-entry", "owner_entry_01");
    const failed = await action(guest, entry.snapshot, "interpret-contract", "owner_contract_1");
    assert.equal(failed.snapshot.turnOwnerId, joined.playerId);
    const guestHit = await emitAck(guest, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "rogue_hit_0001", expectedRevision: failed.snapshot.revision, action: "attack" });
    assert.equal(guestHit.ok, true);
    assert.equal(guestHit.snapshot.combat.enemy.hp, 11);
    assert.equal(guestHit.snapshot.turnOwnerId, created.playerId);
    const hostFinishes = await emitAck(host, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "host_finish_0001", expectedRevision: guestHit.snapshot.revision, action: "attack" });
    assert.equal(hostFinishes.ok, true);
    assert.equal(hostFinishes.snapshot.players[0].resources.xp, 60);
    assert.equal(hostFinishes.snapshot.players[0].resources.gold, 40);
    assert.equal(hostFinishes.snapshot.players[1].resources.xp, 0);
    assert.equal(hostFinishes.snapshot.players[1].resources.gold, 25);
  } finally { for (const client of clients) client.disconnect(); await server.app.close(); }
});

test("potion consumes the turn and triggers Sentinel damage; full-health potion is rejected", async () => {
  const server = await openServer(sequence(0.999999, 0, 0.999999, 0.999999, 0, 0.999999, 0.999999, 0.999999));
  const client = await connect(server.url);
  try {
    const failed = await startFailedContract(client, hero("Mage", { className: "Mage", ancestry: "Human" }));
    const before = structuredClone(failed.snapshot);
    const fullHealth = await emitAck(client, "campaign:combat:act", { campaignId: before.campaignId, commandId: "potion_full_001", expectedRevision: before.revision, action: "potion" });
    assert.equal(fullHealth.ok, false);
    assert.equal(fullHealth.error.code, "ACTION_UNAVAILABLE");
    assert.equal(server.app.store.snapshot(server.app.store.getById(before.campaignId)).players[0].resources.potions, 2);
    const miss = await emitAck(client, "campaign:combat:act", { campaignId: before.campaignId, commandId: "mage_attack_miss", expectedRevision: before.revision, action: "attack" });
    assert.equal(miss.ok, true);
    assert.equal(miss.snapshot.players[0].resources.hp, 10);
    const healed = await emitAck(client, "campaign:combat:act", { campaignId: before.campaignId, commandId: "mage_potion_001", expectedRevision: miss.snapshot.revision, action: "potion" });
    assert.equal(healed.ok, true);
    const potionRecord = healed.snapshot.combat.history.findLast(record => record.action === "potion");
    assert.equal(potionRecord.details.rolled, 10);
    assert.equal(potionRecord.details.restored, 7);
    assert.equal(potionRecord.details.hpAfter, 17);
    assert.equal(healed.snapshot.players[0].resources.potions, 1);
    assert.equal(healed.snapshot.players[0].resources.hp, 10);
    assert.equal(healed.snapshot.combat.history.filter(record => record.action === "enemy-attack").length, 2);
    assert.match(potionRecord.text, /10 HP rolled; 7 HP restored/);
  } finally { client.disconnect(); await server.app.close(); }
});

test("party defeat gives no Sentinel reward and retreat recovers downed heroes exactly once", async () => {
  const rolls = [0.999999, 0, 0.999999, 0.999999];
  const server = await openServer(() => rolls.length ? rolls.shift() : (serverAttackRandom++ % 2 === 0 ? 0 : 0.999999));
  let serverAttackRandom = 0;
  const client = await connect(server.url);
  try {
    const failed = await startFailedContract(client);
    let snapshot = failed.snapshot;
    for (let turn = 0; turn < 4; turn += 1) {
      const result = await emitAck(client, "campaign:combat:act", { campaignId: snapshot.campaignId, commandId: `miss_cycle_${turn}01`, expectedRevision: snapshot.revision, action: "attack" });
      assert.equal(result.ok, true);
      snapshot = result.snapshot;
    }
    assert.equal(snapshot.combat.status, "defeat");
    assert.equal(snapshot.phase, "combat");
    assert.equal(snapshot.players[0].resources.hp, 0);
    assert.equal(snapshot.players[0].resources.xp, 10);
    assert.equal(snapshot.players[0].resources.gold, 25);
    assert.equal(snapshot.combat.rewardClaimed, false);
    const retreat = await emitAck(client, "campaign:combat:retreat", { campaignId: snapshot.campaignId, commandId: "retreat_party_01", expectedRevision: snapshot.revision });
    assert.equal(retreat.ok, true);
    assert.equal(retreat.snapshot.phase, "exploration");
    assert.equal(retreat.snapshot.scene, "gate");
    assert.equal(retreat.snapshot.players[0].resources.hp, 12);
    assert.equal(retreat.snapshot.players[0].resources.xp, 10);
    assert.equal(retreat.snapshot.players[0].resources.gold, 25);
    assert.equal(retreat.snapshot.combat.recovered, true);
    const repeated = await emitAck(client, "campaign:combat:retreat", { campaignId: snapshot.campaignId, commandId: "retreat_party_02", expectedRevision: retreat.snapshot.revision });
    assert.equal(repeated.ok, false);
    assert.equal(repeated.error.code, "ACTION_UNAVAILABLE");
  } finally { client.disconnect(); await server.app.close(); }
});

test("party defeat requires every human to reach zero HP and recovery preserves individual resources", async () => {
  const rolls = [
    0.999999, 0, 0.999999, 0.999999, 0.999999,
    0, 0, 0.999999, 0, 0, 0.999999, 0, 0, 0.999999,
    0, 0.999999, 0, 0.999999, 0, 0.999999, 0, 0.999999,
  ];
  const server = await openServer(() => rolls.length ? rolls.shift() : 0.999999);
  const clients = [];
  try {
    const host = await connect(server.url); clients.push(host);
    const guest = await connect(server.url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Mage", { className: "Mage", ancestry: "Elf" }) });
    const entry = await action(host, joined.snapshot, "study-entry", "party_entry_001");
    const failed = await action(guest, entry.snapshot, "interpret-contract", "party_contract_01");
    assert.equal(failed.snapshot.combat.status, "active");
    let snapshot = failed.snapshot;
    let turn = 0;
    while (snapshot.combat.status === "active" && turn < 20) {
      const socket = snapshot.turnOwnerId === created.playerId ? host : guest;
      const result = await emitAck(socket, "campaign:combat:act", {
        campaignId: snapshot.campaignId, commandId: `party_miss_${String(turn++).padStart(3, "0")}`, expectedRevision: snapshot.revision, action: "attack",
      });
      assert.equal(result.ok, true);
      snapshot = result.snapshot;
    }
    assert.equal(snapshot.combat.status, "defeat");
    assert.deepEqual(snapshot.players.map(player => player.resources.hp), [0, 0]);
    assert.deepEqual(snapshot.players.map(player => player.resources.xp), [10, 0]);
    assert.deepEqual(snapshot.players.map(player => player.resources.gold), [25, 25]);
    assert.equal(snapshot.combat.rewardClaimed, false);
    const recovered = await emitAck(host, "campaign:combat:retreat", {
      campaignId: snapshot.campaignId, commandId: "party_recover_01", expectedRevision: snapshot.revision,
    });
    assert.equal(recovered.ok, true);
    assert.deepEqual(recovered.snapshot.players.map(player => player.resources.hp), [12, 12]);
    assert.deepEqual(recovered.snapshot.players.map(player => player.resources.xp), [10, 0]);
    assert.deepEqual(recovered.snapshot.players.map(player => player.resources.gold), [25, 25]);
    assert.equal(recovered.snapshot.combat.status, "defeat");
    assert.equal(recovered.snapshot.combat.recovered, true);
  } finally { for (const client of clients) client.disconnect(); await server.app.close(); }
});

test("combat rejects malformed, wrong-turn, stale, duplicate and parallel replay without duplicate damage", async () => {
  const server = await openServer(sequence(0.999999, 0, 0.999999, 0.999999));
  const clients = [];
  try {
    const host = await connect(server.url); clients.push(host);
    const guest = await connect(server.url); clients.push(guest);
    const outsider = await connect(server.url); clients.push(outsider);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Guest") });
    const entry = await action(host, joined.snapshot, "study-entry", "auth_entry_001");
    const failed = await action(guest, entry.snapshot, "interpret-contract", "auth_contract_01");
    const bad = await emitAck(guest, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "malformed_001", expectedRevision: failed.snapshot.revision, action: "attack", damage: 999 });
    assert.equal(bad.error.code, "INVALID_PAYLOAD");
    const unauthorized = await emitAck(outsider, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "outsider_001", expectedRevision: failed.snapshot.revision, action: "attack" });
    assert.equal(unauthorized.error.code, "NOT_A_MEMBER");
    const wrongTurn = await emitAck(guest, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "wrongturn_001", expectedRevision: failed.snapshot.revision, action: "attack" });
    assert.equal(wrongTurn.error.code, "WRONG_TURN");
    const stale = await emitAck(host, "campaign:combat:act", { campaignId: failed.snapshot.campaignId, commandId: "stale_combat_1", expectedRevision: failed.snapshot.revision - 1, action: "attack" });
    assert.equal(stale.error.code, "STALE_REVISION");
    const command = { campaignId: failed.snapshot.campaignId, commandId: "parallel_combat_01", expectedRevision: failed.snapshot.revision, action: "attack" };
    const [first, second] = await Promise.all([emitAck(host, "campaign:combat:act", command), emitAck(host, "campaign:combat:act", command)]);
    assert.equal([first, second].filter(result => result.ok).length, 1);
    assert.equal([first, second].find(result => !result.ok).error.code, "DUPLICATE_COMMAND");
    const state = server.app.store.snapshot(server.app.store.getById(failed.snapshot.campaignId));
    assert.equal(state.combat.history.filter(record => record.action === "attack").length, 1);
    assert.equal(state.combat.enemy.hp, 11);
    const replay = await emitAck(host, "campaign:combat:act", command);
    assert.equal(replay.error.code, "DUPLICATE_COMMAND");
    assert.equal(server.app.store.snapshot(server.app.store.getById(failed.snapshot.campaignId)).combat.enemy.hp, 11);
  } finally { for (const client of clients) client.disconnect(); await server.app.close(); }
});

test("no connected players pauses the encounter without running Sentinel turns after reconnect", async () => {
  const server = await openServer(sequence(0.999999, 0, 0.999999, 0.999999));
  const clients = [];
  try {
    const host = await connect(server.url); clients.push(host);
    const created = await startFailedContract(host);
    const historyLength = created.snapshot.combat.history.length;
    host.disconnect();
    const waitForDisconnect = async () => {
      for (let tries = 0; tries < 100; tries += 1) {
        const state = server.app.store.snapshot(server.app.store.getById(created.snapshot.campaignId));
        if (!state.players[0].connected) return state;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error("disconnect was not persisted in memory");
    };
    const paused = await waitForDisconnect();
    assert.equal(paused.combat.history.length, historyLength);
    assert.equal(paused.combat.status, "active");
    const returning = await connect(server.url); clients.push(returning);
    const resumed = await emitAck(returning, "campaign:resume", { inviteCode: created.inviteCode, resumeToken: created.resumeToken });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.snapshot.combat.history.length, historyLength);
    assert.equal(resumed.snapshot.turnOwnerId, resumed.playerId);
  } finally { for (const client of clients) client.disconnect(); await server.app.close(); }
});

test("campaign join is deferred while a combat initiative is active", async () => {
  const server = await openServer(sequence(0.999999, 0, 0.999999, 0.999999));
  const clients = [];
  try {
    const host = await connect(server.url); clients.push(host);
    const newcomer = await connect(server.url); clients.push(newcomer);
    const failed = await startFailedContract(host);
    const joined = await emitAck(newcomer, "campaign:join", { inviteCode: failed.snapshot.inviteCode, character: hero("Late Joiner") });
    assert.equal(joined.ok, false);
    assert.equal(joined.error.code, "ACTION_UNAVAILABLE");
    assert.equal(server.app.store.snapshot(server.app.store.getById(failed.snapshot.campaignId)).players.length, 1);
  } finally { for (const client of clients) client.disconnect(); await server.app.close(); }
});

test("failed persistence during combat leaves state unchanged and emits no success broadcast", async () => {
  const rows = new Map();
  const commands = new Map();
  const persistence = {
    failNext: false,
    async loadAll() { return []; },
    async commit(campaign, expectedRevision, commandId) {
      if (commandId && this.failNext) { this.failNext = false; throw new Error("injected failure"); }
      const id = campaign.snapshot.campaignId;
      const previous = rows.get(id);
      if (expectedRevision === null ? previous !== undefined : previous?.snapshot.revision !== expectedRevision) throw new Error("revision mismatch");
      if (commandId && commands.get(id)?.has(commandId)) throw new Error("duplicate command");
      const set = commands.get(id) ?? new Set();
      if (commandId) set.add(commandId);
      commands.set(id, set);
      rows.set(id, structuredClone(campaign));
    },
    async close() {},
  };
  const server = await openServer(sequence(0.999999, 0, 0.999999, 0.999999), persistence);
  const client = await connect(server.url);
  try {
    const failed = await startFailedContract(client);
    const before = structuredClone(server.app.store.snapshot(server.app.store.getById(failed.snapshot.campaignId)));
    persistence.failNext = true;
    await new Promise(resolve => setTimeout(resolve, 20));
    let broadcasts = 0;
    client.on("campaign:snapshot", () => { broadcasts += 1; });
    const rejected = await emitAck(client, "campaign:combat:act", { campaignId: before.campaignId, commandId: "combat_persist_fail", expectedRevision: before.revision, action: "attack" });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, "SERVER_ERROR");
    assert.deepEqual(server.app.store.snapshot(server.app.store.getById(before.campaignId)), before);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(broadcasts, 0);
    assert.equal(rows.get(before.campaignId).snapshot.revision, before.revision);
  } finally { client.disconnect(); await server.app.close(); }
});
