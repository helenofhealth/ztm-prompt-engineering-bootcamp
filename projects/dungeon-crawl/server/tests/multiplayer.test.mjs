import assert from "node:assert/strict";
import test from "node:test";
import { io as connectClient } from "socket.io-client";
import { CampaignStore } from "../campaignStore.ts";
import { createGameServer } from "../gameServer.ts";
import { WindowRateLimiter } from "../rateLimiter.ts";

const hero = (name, overrides = {}) => ({
  name, gender: "female", className: "Warrior", ancestry: "Human", background: "Noble", difficulty: "Balanced", ...overrides,
});

async function openServer(options = {}) {
  const app = createGameServer({ clientOrigin: "http://localhost:5173", ...options });
  await app.initialize();
  const port = await app.listen(0);
  return { app, url: `http://127.0.0.1:${port}` };
}

async function connect(url, origin = "http://localhost:5173") {
  const extraHeaders = origin ? { Origin: origin } : {};
  const socket = connectClient(url, { transports: ["websocket"], extraHeaders, forceNew: true, reconnection: false, timeout: 2000 });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

async function connectRejected(url, origin) {
  const socket = connectClient(url, { transports: ["websocket"], extraHeaders: origin ? { Origin: origin } : {}, forceNew: true, reconnection: false, timeout: 2000 });
  await assert.rejects(new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  }));
  socket.disconnect();
}

const stateOf = (app, campaignId) => structuredClone(app.store.snapshot(app.store.getById(campaignId)));

function emitAck(socket, event, payload) {
  return new Promise(resolve => socket.emit(event, payload, resolve));
}

function nextSnapshot(socket, predicate = () => true) {
  return new Promise(resolve => {
    const listener = snapshot => {
      if (!predicate(snapshot)) return;
      socket.off("campaign:snapshot", listener);
      resolve(snapshot);
    };
    socket.on("campaign:snapshot", listener);
  });
}

async function dispose(app, clients) {
  for (const client of clients) client.disconnect();
  await app.close();
}

test("default campaign room cap is four human players", async () => {
  const { app, url } = await openServer();
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    assert.match(created.snapshot.inviteCode, /^[A-HJ-NP-Z2-9]{8}$/);
    const acceptedIds = [created.playerId];
    for (let index = 1; index <= 3; index += 1) {
      const client = await connect(url); clients.push(client);
      const joined = await emitAck(client, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero(`Player ${index}`) });
      assert.equal(joined.ok, true);
      acceptedIds.push(joined.playerId);
    }
    assert.equal(new Set(acceptedIds).size, 4);
    const fifth = await connect(url); clients.push(fifth);
    const rejected = await emitAck(fifth, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Fifth") });
    assert.equal(rejected.error.code, "CAMPAIGN_FULL");
  } finally { await dispose(app, clients); }
});

test("campaign creation and joining make distinct heroes and synchronized canonical snapshots", async () => {
  const { app, url } = await openServer();
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host Hero") });
    assert.equal(created.ok, true);
    const hostUpdate = nextSnapshot(host, snapshot => snapshot.revision === 2);
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Guest Hero", { className: "Mage", ancestry: "Elf" }) });
    const latestHost = await hostUpdate;
    assert.equal(joined.ok, true);
    assert.equal(joined.snapshot.revision, 2);
    assert.equal(latestHost.revision, joined.snapshot.revision);
    assert.deepEqual(latestHost, joined.snapshot);
    assert.equal(joined.snapshot.players.length, 2);
    assert.notEqual(joined.playerId, created.playerId);
    assert.deepEqual(joined.snapshot.players.map(player => player.name), ["Host Hero", "Guest Hero"]);
    assert.equal(joined.snapshot.players[1].hero.className, "Mage");
    assert.equal(joined.snapshot.players[1].hero.ancestry, "Elf");
    assert.equal("resumeToken" in joined.snapshot.players[0], false);
    assert.equal("resumeToken" in joined.snapshot.players[1], false);
  } finally { await dispose(app, clients); }
});

test("exploration rejects invalid commands without state changes and serializes parallel duplicate submissions", async () => {
  const { app, url } = await openServer({ random: () => 0.99 });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const outsider = await connect(url); clients.push(outsider);
    const created = await emitAck(host, "campaign:create", { scenarioId: "plague-below", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Guest", { className: "Rogue" }) });
    const campaignId = joined.snapshot.campaignId;
    const unchanged = stateOf(app, campaignId);
    const wrongTurn = await emitAck(guest, "campaign:act", { campaignId, commandId: "guest_cmd_1", expectedRevision: joined.snapshot.revision, action: "study-entry" });
    assert.equal(wrongTurn.error.code, "WRONG_TURN");
    assert.deepEqual(stateOf(app, campaignId), unchanged);
    const stale = await emitAck(host, "campaign:act", { campaignId, commandId: "stale_cmd_1", expectedRevision: 1, action: "study-entry" });
    assert.equal(stale.error.code, "STALE_REVISION");
    assert.deepEqual(stateOf(app, campaignId), unchanged);
    const malformed = await emitAck(host, "campaign:act", { campaignId, commandId: "bad_cmd_0001", expectedRevision: joined.snapshot.revision, action: "grant-xp", xp: 99999 });
    assert.equal(malformed.error.code, "INVALID_PAYLOAD");
    assert.deepEqual(stateOf(app, campaignId), unchanged);
    const injected = await emitAck(host, "campaign:act", { campaignId, commandId: "extra_cmd_01", expectedRevision: joined.snapshot.revision, action: "study-entry", xp: 99999 });
    assert.equal(injected.error.code, "INVALID_PAYLOAD");
    assert.deepEqual(stateOf(app, campaignId), unchanged);
    const unauthorized = await emitAck(outsider, "campaign:act", { campaignId, commandId: "outsider_01", expectedRevision: joined.snapshot.revision, action: "study-entry" });
    assert.equal(unauthorized.error.code, "NOT_A_MEMBER");
    assert.deepEqual(stateOf(app, campaignId), unchanged);

    const hostUpdate = nextSnapshot(host);
    const guestUpdate = nextSnapshot(guest);
    const command = { campaignId, commandId: "study_cmd_001", expectedRevision: joined.snapshot.revision, action: "study-entry" };
    const [first, replay] = await Promise.all([emitAck(host, "campaign:act", command), emitAck(host, "campaign:act", command)]);
    assert.equal(first.ok, true);
    assert.equal(replay.ok, false);
    assert.equal(replay.error.code, "DUPLICATE_COMMAND");
    const [hostSnapshot, guestSnapshot] = await Promise.all([hostUpdate, guestUpdate]);
    assert.deepEqual(hostSnapshot, guestSnapshot);
    assert.equal(first.snapshot.revision, joined.snapshot.revision + 1);
    assert.equal(hostSnapshot.scene, "contract");
    assert.match(hostSnapshot.sharedLog.at(-1).text, /d20 \(20\).*SUCCESS/);
    assert.equal(hostSnapshot.players[0].resources.xp, 10);
    assert.equal(hostSnapshot.players[1].resources.xp, 0);
    assert.equal(hostSnapshot.turnOwnerId, joined.playerId);
    assert.equal(first.snapshot.sharedLog.at(-1).text, hostSnapshot.sharedLog.at(-1).text);
    assert.equal(first.snapshot.revision, hostSnapshot.revision);
    assert.deepEqual(stateOf(app, campaignId), hostSnapshot);

    const nextHostSnapshot = nextSnapshot(host);
    const nextGuestSnapshot = nextSnapshot(guest);
    const nextTurn = await emitAck(guest, "campaign:act", {
      campaignId, commandId: "study_cmd_002", expectedRevision: hostSnapshot.revision, action: "interpret-contract",
    });
    const [hostAfterNextTurn, guestAfterNextTurn] = await Promise.all([nextHostSnapshot, nextGuestSnapshot]);
    assert.equal(nextTurn.ok, true);
    assert.deepEqual(hostAfterNextTurn, guestAfterNextTurn);
    assert.equal(hostAfterNextTurn.players[0].resources.xp, 10);
    assert.equal(hostAfterNextTurn.players[1].resources.xp, 15);
    assert.equal(hostAfterNextTurn.scene, "victory");
    assert.equal(hostAfterNextTurn.turnOwnerId, created.playerId);
  } finally { await dispose(app, clients); }
});

test("campaign rooms are isolated and configurable player limits are enforced", async () => {
  const { app, url } = await openServer({ maxPlayers: 2 });
  const clients = [];
  try {
    const first = await connect(url); clients.push(first);
    const second = await connect(url); clients.push(second);
    const third = await connect(url); clients.push(third);
    const fourth = await connect(url); clients.push(fourth);
    const firstCampaign = await emitAck(first, "campaign:create", { scenarioId: "lost-heir", character: hero("One") });
    const firstUpdates = [];
    first.on("campaign:snapshot", snapshot => {
      if (snapshot.revision > firstCampaign.snapshot.revision) firstUpdates.push(snapshot);
    });
    const otherCampaign = await emitAck(second, "campaign:create", { scenarioId: "dragon-hoard", character: hero("Other") });
    assert.notEqual(firstCampaign.snapshot.campaignId, otherCampaign.snapshot.campaignId);
    const joined = await emitAck(third, "campaign:join", { inviteCode: firstCampaign.snapshot.inviteCode, character: hero("Guest") });
    assert.equal(joined.ok, true);
    const actionUpdate = nextSnapshot(first, snapshot => snapshot.revision === joined.snapshot.revision + 1);
    const acted = await emitAck(first, "campaign:act", {
      campaignId: firstCampaign.snapshot.campaignId, commandId: "host_leave_test", expectedRevision: joined.snapshot.revision, action: "study-entry",
    });
    assert.equal(acted.ok, true);
    await actionUpdate;
    const full = await emitAck(fourth, "campaign:join", { inviteCode: firstCampaign.snapshot.inviteCode, character: hero("Too Many") });
    assert.equal(full.error.code, "CAMPAIGN_FULL");
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(firstUpdates.length, 2);
    assert.equal(firstUpdates[0].campaignId, firstCampaign.snapshot.campaignId);
    assert.equal(firstUpdates.some(snapshot => snapshot.campaignId === otherCampaign.snapshot.campaignId), false);
    const leaveUpdate = nextSnapshot(first, snapshot => snapshot.campaignId === firstCampaign.snapshot.campaignId && snapshot.players[1]?.connected === false);
    const left = await emitAck(third, "campaign:leave", { campaignId: firstCampaign.snapshot.campaignId });
    await leaveUpdate;
    assert.deepEqual(left, { ok: true, left: true });
    assert.equal(firstUpdates[2].players[1].connected, false);
    assert.equal(firstUpdates[2].turnOwnerId, firstCampaign.playerId);
    const afterLeave = await emitAck(third, "campaign:create", { scenarioId: "plague-below", character: hero("After Leave") });
    assert.equal(afterLeave.ok, true);
  } finally { await dispose(app, clients); }
});

test("resume token restores the same player and latest snapshot after disconnect", async () => {
  const { app, url } = await openServer({ random: () => 0.99 });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "dragon-hoard", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Returning", { gender: "male", ancestry: "Dwarf" }) });
    const disconnectedUpdate = nextSnapshot(host, snapshot => snapshot.revision > joined.snapshot.revision && snapshot.players[1]?.connected === false);
    guest.disconnect();
    const disconnectedSnapshot = await disconnectedUpdate;
    assert.equal(disconnectedSnapshot.players[1].connected, false);
    const returning = await connect(url); clients.push(returning);
    const hostUpdate = nextSnapshot(host);
    const resumed = await emitAck(returning, "campaign:resume", { inviteCode: joined.snapshot.inviteCode, resumeToken: joined.resumeToken });
    const latest = await hostUpdate;
    assert.equal(resumed.ok, true);
    assert.equal(resumed.playerId, joined.playerId);
    assert.equal(resumed.snapshot.players[1].connected, true);
    assert.equal(latest.revision, resumed.snapshot.revision);
    assert.deepEqual(latest, resumed.snapshot);
    assert.equal(resumed.snapshot.players[1].hero.ancestry, "Dwarf");
    assert.equal(resumed.snapshot.players.length, 2);
    const intruder = await connect(url); clients.push(intruder);
    const invalid = await emitAck(intruder, "campaign:resume", { inviteCode: joined.snapshot.inviteCode, resumeToken: "x".repeat(48) });
    assert.equal(invalid.error.code, "INVALID_RESUME_TOKEN");
  } finally { await dispose(app, clients); }
});

test("disconnecting the active turn owner advances to the next connected player and reconnect preserves membership", async () => {
  const { app, url } = await openServer({ random: () => 0.99 });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Guest") });
    const campaignId = joined.snapshot.campaignId;
    const afterDisconnect = nextSnapshot(guest, snapshot => snapshot.revision > joined.snapshot.revision && snapshot.players[0].connected === false);
    host.disconnect();
    const disconnected = await afterDisconnect;
    assert.equal(disconnected.turnOwnerId, joined.playerId);
    assert.equal(disconnected.players.length, 2);

    const afterAction = nextSnapshot(guest, snapshot => snapshot.revision === disconnected.revision + 1);
    const action = await emitAck(guest, "campaign:act", {
      campaignId, commandId: "guest_after_disconnect", expectedRevision: disconnected.revision, action: "study-entry",
    });
    const continued = await afterAction;
    assert.equal(action.ok, true);
    assert.equal(continued.turnOwnerId, joined.playerId);

    const returning = await connect(url); clients.push(returning);
    const resumed = await emitAck(returning, "campaign:resume", { inviteCode: created.snapshot.inviteCode, resumeToken: created.resumeToken });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.snapshot.players.length, 2);
    assert.equal(resumed.snapshot.players[0].connected, true);
    assert.equal(resumed.snapshot.players[1].playerId, joined.playerId);
    assert.equal(resumed.snapshot.turnOwnerId, joined.playerId);
  } finally { await dispose(app, clients); }
});

test("explicit leave revokes a copied resume token", async () => {
  const { app, url } = await openServer();
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Departing") });
    const leftUpdate = nextSnapshot(host, snapshot => snapshot.revision > joined.snapshot.revision && snapshot.players[1].connected === false);
    const left = await emitAck(guest, "campaign:leave", { campaignId: joined.snapshot.campaignId });
    await leftUpdate;
    assert.deepEqual(left, { ok: true, left: true });

    const intruder = await connect(url); clients.push(intruder);
    const revoked = await emitAck(intruder, "campaign:resume", { inviteCode: created.snapshot.inviteCode, resumeToken: joined.resumeToken });
    assert.equal(revoked.ok, false);
    assert.equal(revoked.error.code, "INVALID_RESUME_TOKEN");
    assert.equal(stateOf(app, joined.snapshot.campaignId).players.length, 2);
    assert.equal(stateOf(app, joined.snapshot.campaignId).players[1].connected, false);
  } finally { await dispose(app, clients); }
});

test("accepted action replay after reconnect is rejected without another mutation", async () => {
  const { app, url } = await openServer({ random: () => 0.99 });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "dragon-hoard", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Guest") });
    const command = { campaignId: joined.snapshot.campaignId, commandId: "accepted_action_1", expectedRevision: joined.snapshot.revision, action: "study-entry" };
    const accepted = await emitAck(host, "campaign:act", command);
    assert.equal(accepted.ok, true);
    const afterDisconnect = nextSnapshot(guest, snapshot => snapshot.players[0].connected === false);
    host.disconnect();
    await afterDisconnect;
    const returning = await connect(url); clients.push(returning);
    const resumed = await emitAck(returning, "campaign:resume", { inviteCode: created.snapshot.inviteCode, resumeToken: created.resumeToken });
    assert.equal(resumed.ok, true);
    const beforeReplay = stateOf(app, joined.snapshot.campaignId);
    const replay = await emitAck(returning, "campaign:act", { ...command, expectedRevision: resumed.snapshot.revision });
    assert.equal(replay.ok, false);
    assert.equal(replay.error.code, "DUPLICATE_COMMAND");
    assert.deepEqual(stateOf(app, joined.snapshot.campaignId), beforeReplay);
  } finally { await dispose(app, clients); }
});

test("failed room join rolls back the new player and campaign revision", async () => {
  let shouldFail = false;
  const { app, url } = await openServer({ joinRoom: async (socket, room) => {
    if (shouldFail) throw new Error("simulated room adapter failure");
    await socket.join(room);
  } });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const before = stateOf(app, created.snapshot.campaignId);
    shouldFail = true;
    const failedJoin = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Orphan") });
    shouldFail = false;
    assert.equal(failedJoin.ok, false);
    assert.equal(failedJoin.error.code, "SERVER_ERROR");
    assert.deepEqual(stateOf(app, created.snapshot.campaignId), before);
  } finally { await dispose(app, clients); }
});

test("failed campaign room join leaves no orphaned campaign", async () => {
  const { app, url } = await openServer({ joinRoom: async () => { throw new Error("simulated room adapter failure"); } });
  const clients = [];
  try {
    const creator = await connect(url); clients.push(creator);
    const failed = await emitAck(creator, "campaign:create", { scenarioId: "lost-heir", character: hero("Orphan") });
    assert.equal(failed.ok, false);
    assert.equal(failed.error.code, "SERVER_ERROR");
    assert.equal(app.store.campaignCount, 0);
  } finally { await dispose(app, clients); }
});

test("failed room leave restores campaign membership and token state", async () => {
  let shouldFail = false;
  const { app, url } = await openServer({ leaveRoom: async (socket, room) => {
    if (shouldFail) throw new Error("simulated room adapter failure");
    await socket.leave(room);
  } });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Guest") });
    const before = stateOf(app, joined.snapshot.campaignId);
    shouldFail = true;
    const failed = await emitAck(guest, "campaign:leave", { campaignId: joined.snapshot.campaignId });
    shouldFail = false;
    assert.equal(failed.ok, false);
    assert.equal(failed.error.code, "SERVER_ERROR");
    assert.deepEqual(stateOf(app, joined.snapshot.campaignId), before);
    const retried = await emitAck(guest, "campaign:leave", { campaignId: joined.snapshot.campaignId });
    assert.deepEqual(retried, { ok: true, left: true });
  } finally { await dispose(app, clients); }
});

test("failed resume room join restores the disconnected player and revision", async () => {
  let shouldFail = false;
  const { app, url } = await openServer({ joinRoom: async (socket, room) => {
    if (shouldFail) throw new Error("simulated room adapter failure");
    await socket.join(room);
  } });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Returning") });
    const disconnectedUpdate = nextSnapshot(host, snapshot => snapshot.revision > joined.snapshot.revision && snapshot.players[1].connected === false);
    guest.disconnect();
    await disconnectedUpdate;
    const before = stateOf(app, joined.snapshot.campaignId);
    const returning = await connect(url); clients.push(returning);
    shouldFail = true;
    const failed = await emitAck(returning, "campaign:resume", { inviteCode: joined.snapshot.inviteCode, resumeToken: joined.resumeToken });
    shouldFail = false;
    assert.equal(failed.ok, false);
    assert.equal(failed.error.code, "SERVER_ERROR");
    assert.deepEqual(stateOf(app, joined.snapshot.campaignId), before);
    const resumed = await emitAck(returning, "campaign:resume", { inviteCode: joined.snapshot.inviteCode, resumeToken: joined.resumeToken });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.snapshot.players.length, 2);
    assert.equal(resumed.snapshot.players[1].connected, true);
  } finally { await dispose(app, clients); }
});

test("scenario contracts resolve with the acting hero's stats and award Silver key only in Lost Heir", async () => {
  const { app, url } = await openServer({ random: () => 0.99 });
  const clients = [];
  try {
    for (const scenarioId of ["lost-heir", "plague-below", "dragon-hoard"]) {
      const client = await connect(url); clients.push(client);
      const created = await emitAck(client, "campaign:create", {
        scenarioId,
        character: hero(`Hero ${scenarioId}`, { className: "Mage", ancestry: "Dwarf" }),
      });
      const study = await emitAck(client, "campaign:act", {
        campaignId: created.snapshot.campaignId, commandId: `study_${scenarioId}`, expectedRevision: created.snapshot.revision, action: "study-entry",
      });
      assert.equal(study.ok, true);
      assert.equal(study.snapshot.scene, "contract");
      assert.equal(study.snapshot.sharedLog.at(-1).check.ability, "INT");
      assert.equal(study.snapshot.sharedLog.at(-1).check.modifier, 3);
      const contract = await emitAck(client, "campaign:act", {
        campaignId: created.snapshot.campaignId, commandId: `contract_${scenarioId}`, expectedRevision: study.snapshot.revision, action: "interpret-contract",
      });
      assert.equal(contract.ok, true);
      assert.equal(contract.snapshot.scene, "victory");
      assert.equal(contract.snapshot.players[0].resources.xp, 25);
      assert.equal(contract.snapshot.players[0].resources.inventory.includes("Silver key"), scenarioId === "lost-heir");
      assert.deepEqual(contract.snapshot.explorationProgress.visitedScenes, ["gate", "contract", "victory"]);
      assert.ok(contract.snapshot.explorationProgress.discoveries.includes("entry-study"));
      assert.ok(contract.snapshot.explorationProgress.discoveries.includes("contract-insight"));
    }
  } finally { await dispose(app, clients); }
});

test("failed exploration checks preserve consequences and do not grant discoveries", async () => {
  const { app, url } = await openServer({ random: () => 0 });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const created = await emitAck(host, "campaign:create", { scenarioId: "plague-below", character: hero("Analyst") });
    const study = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "failed_study_001", expectedRevision: created.snapshot.revision, action: "study-entry",
    });
    assert.equal(study.ok, true);
    assert.equal(study.snapshot.sharedLog.at(-1).check.success, false);
    assert.equal(study.snapshot.players[0].resources.xp, 0);
    assert.equal(study.snapshot.explorationProgress.discoveries.includes("entry-study"), false);
    const contract = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "failed_contract_01", expectedRevision: study.snapshot.revision, action: "interpret-contract",
    });
    assert.equal(contract.ok, true);
    assert.equal(contract.snapshot.scene, "contract");
    assert.equal(contract.snapshot.players[0].resources.xp, 0);
    const beforeUnavailable = stateOf(app, created.snapshot.campaignId);
    const unavailable = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "wrong_scene_001", expectedRevision: beforeUnavailable.revision, action: "search-cache",
    });
    assert.equal(unavailable.ok, false);
    assert.equal(unavailable.error.code, "ACTION_UNAVAILABLE");
    assert.deepEqual(stateOf(app, created.snapshot.campaignId), beforeUnavailable);
  } finally { await dispose(app, clients); }
});

test("scenario-specific failure outcomes preserve exact scenes, resources, progress, and journal entries", async () => {
  const { app, url } = await openServer({ random: () => 0 });
  const clients = [];
  const scenarios = [
    { id: "lost-heir", name: "Heir", entryLabel: "Royal history", sealLabel: "Royal bloodline", sealModifier: 2, cacheFailure: "The statue remains in place; the armory is undisturbed." },
    { id: "plague-below", name: "Analyst", entryLabel: "Medical investigation", sealLabel: "Quarantine protocol", sealModifier: 0, cacheFailure: "The cabinet remains closed; its supplies are untouched." },
    { id: "dragon-hoard", name: "Delver", entryLabel: "Arcane lore", sealLabel: "Runic bargain", sealModifier: 0, cacheFailure: "The coffer stays shut; the coins remain undisturbed." },
  ];
  try {
    for (const scenario of scenarios) {
      const client = await connect(url); clients.push(client);
      let response = await emitAck(client, "campaign:create", { scenarioId: scenario.id, character: hero(scenario.name) });
      const campaignId = response.snapshot.campaignId;
      let snapshot = response.snapshot;
      const visited = ["gate"];
      const resources = { hp: 24, maxHp: 24, xp: 0, gold: 25, potions: 2, inventory: ["Warrior starting gear"] };
      const run = async (action, scene, message, label, ability, modifier, dc, adjust = () => {}) => {
        response = await emitAck(client, "campaign:act", {
          campaignId,
          commandId: `failure_${scenario.id}_${action}`,
          expectedRevision: snapshot.revision,
          action,
        });
        assert.equal(response.ok, true, `${scenario.id} ${action} should be accepted`);
        snapshot = response.snapshot;
        adjust();
        if (!visited.includes(scene)) visited.push(scene);
        assert.equal(snapshot.scene, scene, `${scenario.id} ${action} scene`);
        assert.deepEqual(snapshot.players[0].resources, resources, `${scenario.id} ${action} resources`);
        assert.deepEqual(snapshot.explorationProgress.visitedScenes, visited, `${scenario.id} ${action} visited scenes`);
        assert.deepEqual(snapshot.explorationProgress.discoveries, [], `${scenario.id} ${action} discoveries`);
        assert.deepEqual(snapshot.sharedLog.at(-1).check, {
          label, ability, dc, die: 1, modifier, total: 1 + modifier, success: false,
        });
        assert.equal(snapshot.sharedLog.at(-1).text, `${message} ${label}: d20 (1) ${modifier >= 0 ? "+" : ""}${modifier} = ${1 + modifier} vs DC ${dc} — FAILURE.`);
      };

      // The initial check leads to the contract on failure; the remaining checks
      // exercise every scenario-specific failure path without granting rewards.
      response = await emitAck(client, "campaign:act", {
        campaignId, commandId: `failure_${scenario.id}_entry`, expectedRevision: snapshot.revision, action: "study-entry",
      });
      assert.equal(response.ok, true);
      snapshot = response.snapshot;
      visited.push("contract");
      assert.equal(snapshot.scene, "contract");
      assert.deepEqual(snapshot.players[0].resources, resources);
      assert.deepEqual(snapshot.explorationProgress.visitedScenes, visited);
      assert.deepEqual(snapshot.explorationProgress.discoveries, []);
      assert.equal(snapshot.sharedLog.at(-1).text, `The evidence remains unclear, but the discovery leads the party to examine the contract. ${scenario.entryLabel}: d20 (1) +0 = 1 vs DC 12 — FAILURE.`);
      assert.equal(snapshot.sharedLog.at(-1).check.success, false);

      response = await emitAck(client, "campaign:act", { campaignId, commandId: `failure_${scenario.id}_return`, expectedRevision: snapshot.revision, action: "return-to-gate" });
      assert.equal(response.ok, true); snapshot = response.snapshot;
      response = await emitAck(client, "campaign:act", { campaignId, commandId: `failure_${scenario.id}_door`, expectedRevision: snapshot.revision, action: "approach-sealed-door" });
      assert.equal(response.ok, true); snapshot = response.snapshot; visited.push("blood-door");
      const sealText = scenario.id === "lost-heir" ? "The blood seal resists the signet." : scenario.id === "plague-below" ? "The quarantine seal remains intact." : "The obsidian runes keep the door closed.";
      await run("read-seal", "blood-door", sealText, scenario.sealLabel, scenario.id === "lost-heir" ? "CHA" : "INT", scenario.sealModifier, 13);
      await run("force-seal", "blood-door", "The force rebounds without opening the sealed passage.", "Strength", "STR", 3, 14);

      response = await emitAck(client, "campaign:act", { campaignId, commandId: `failure_${scenario.id}_return_2`, expectedRevision: snapshot.revision, action: "return-to-gate" });
      assert.equal(response.ok, true); snapshot = response.snapshot;
      response = await emitAck(client, "campaign:act", { campaignId, commandId: `failure_${scenario.id}_well`, expectedRevision: snapshot.revision, action: "investigate-well" });
      assert.equal(response.ok, true); snapshot = response.snapshot; visited.push("well");
      const wellFailure = scenario.id === "dragon-hoard" ? "The pool's enchantment resists the examination; its price remains unclear." : "The well's magic resists the examination; its warning remains unexplained.";
      await run("analyze-well", "gate", wellFailure, "Arcana", "INT", 0, 12);
      response = await emitAck(client, "campaign:act", { campaignId, commandId: `failure_${scenario.id}_well_again`, expectedRevision: snapshot.revision, action: "investigate-well" });
      assert.equal(response.ok, true); snapshot = response.snapshot;
      const hpPenalty = () => { resources.hp -= 2; };
      await run("study-well", "gate", `A cold presence brushes ${scenario.name}'s mind; this hero loses 2 HP.`, "Wisdom", "WIS", 2, 13, hpPenalty);

      response = await emitAck(client, "campaign:act", { campaignId, commandId: `failure_${scenario.id}_vault`, expectedRevision: snapshot.revision, action: "search-vault" });
      assert.equal(response.ok, true); snapshot = response.snapshot; visited.push("armory");
      await run("search-cache", "armory", scenario.cacheFailure, "Investigation", "INT", 0, 12);
      const tracksFailure = scenario.id === "lost-heir" ? "The tracks disappear beneath a sheet of dust." : scenario.id === "plague-below" ? "The tracks vanish beneath a drift of spores." : "The tracks disappear beneath scattered coins.";
      await run("study-tracks", "gate", tracksFailure, "Perception", "WIS", 2, 11);
    }
  } finally { await dispose(app, clients); }
});

test("sealed-door and vault rewards belong only to the character taking each action", async () => {
  const { app, url } = await openServer({ random: () => 0.99 });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const guest = await connect(url); clients.push(guest);
    const created = await emitAck(host, "campaign:create", { scenarioId: "dragon-hoard", character: hero("Host") });
    const joined = await emitAck(guest, "campaign:join", { inviteCode: created.snapshot.inviteCode, character: hero("Guest", { className: "Mage" }) });
    const approach = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "open_door_001", expectedRevision: joined.snapshot.revision, action: "approach-sealed-door",
    });
    const opened = await emitAck(guest, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "read_seal_001", expectedRevision: approach.snapshot.revision, action: "read-seal",
    });
    assert.equal(opened.snapshot.scene, "armory");
    assert.equal(opened.snapshot.players[1].resources.inventory.includes("Blood-forged key"), true);
    assert.equal(opened.snapshot.players[1].resources.xp, 15);
    assert.equal(opened.snapshot.players[0].resources.inventory.includes("Blood-forged key"), false);
    const cache = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "cache_roll_001", expectedRevision: opened.snapshot.revision, action: "search-cache",
    });
    assert.equal(cache.snapshot.scene, "victory");
    assert.equal(cache.snapshot.players[0].resources.inventory.includes("Royal ward charm"), true);
    assert.equal(cache.snapshot.players[0].resources.gold, 35);
    assert.equal(cache.snapshot.players[1].resources.gold, 25);
    assert.equal(cache.snapshot.players[1].resources.inventory.includes("Royal ward charm"), false);
  } finally { await dispose(app, clients); }
});

test("completed exploration rewards become unavailable and phase is checked on the server", async () => {
  const { app, url } = await openServer({ random: () => 0.99 });
  const clients = [];
  try {
    const host = await connect(url); clients.push(host);
    const created = await emitAck(host, "campaign:create", { scenarioId: "lost-heir", character: hero("Heir") });
    const study = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "claim_entry_001", expectedRevision: created.snapshot.revision, action: "study-entry",
    });
    const contract = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "claim_contract_01", expectedRevision: study.snapshot.revision, action: "interpret-contract",
    });
    const continueCampaign = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "continue_loop_01", expectedRevision: contract.snapshot.revision, action: "continue-expedition",
    });
    const beforeClaimedAction = stateOf(app, created.snapshot.campaignId);
    const repeat = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "repeat_entry_001", expectedRevision: beforeClaimedAction.revision, action: "study-entry",
    });
    assert.equal(repeat.ok, false);
    assert.equal(repeat.error.code, "ACTION_UNAVAILABLE");
    assert.deepEqual(stateOf(app, created.snapshot.campaignId), beforeClaimedAction);
    const record = app.store.getById(created.snapshot.campaignId);
    const previousPhase = record.snapshot.phase;
    record.snapshot.phase = "complete";
    const beforeWrongPhase = stateOf(app, created.snapshot.campaignId);
    const phaseRejected = await emitAck(host, "campaign:act", {
      campaignId: created.snapshot.campaignId, commandId: "wrong_phase_001", expectedRevision: continueCampaign.snapshot.revision, action: "approach-sealed-door",
    });
    assert.equal(phaseRejected.ok, false);
    assert.equal(phaseRejected.error.code, "ACTION_UNAVAILABLE");
    assert.deepEqual(stateOf(app, created.snapshot.campaignId), beforeWrongPhase);
    record.snapshot.phase = previousPhase;
  } finally { await dispose(app, clients); }
});

test("Phase 2 campaign snapshots hydrate with exploration defaults and existing reward markers", () => {
  const original = new CampaignStore(4, () => 0.99);
  const { campaign } = original.create("lost-heir", hero("Legacy Explorer"), "legacy-socket");
  campaign.snapshot.scene = "contract";
  campaign.snapshot.phase = "combat"; // Older pre-encounter snapshots could carry the phase without encounter data.
  campaign.rewardClaims.add("__reward_claimed__:lost-heir:entry-study");
  const persisted = original.toPersisted(campaign);
  delete persisted.snapshot.combat;
  delete persisted.snapshot.explorationProgress;

  const restoredStore = new CampaignStore(4, () => 0);
  const { campaign: restored } = restoredStore.restorePersisted(persisted, []);
  const snapshot = restoredStore.snapshot(restored);
  assert.equal(snapshot.phase, "exploration");
  assert.equal(snapshot.combat, null);
  assert.equal(snapshot.scene, "contract");
  assert.deepEqual(snapshot.explorationProgress.visitedScenes, ["contract"]);
  assert.deepEqual(snapshot.explorationProgress.discoveries, ["entry-study"]);
  assert.equal(restoredStore.canResolveExploration(restored, "interpret-contract"), true);
  assert.equal(restoredStore.canResolveExploration(restored, "study-entry"), false);
  restoredStore.resolveExploration(restored, snapshot.players[0].playerId, "interpret-contract");
  const firstEncounter = restoredStore.snapshot(restored);
  assert.equal(firstEncounter.phase, "combat");
  assert.equal(firstEncounter.combat.enemy.name, "Crownbound Sentinel");
  assert.equal(firstEncounter.combat.status, "active");
});

test("origin policy accepts only the configured origin and rejects disallowed or missing origins", async () => {
  const { app, url } = await openServer();
  const clients = [];
  try {
    const allowed = await connect(url, "http://localhost:5173"); clients.push(allowed);
    await connectRejected(url, "http://evil.example");
    await connectRejected(url, null);
  } finally { await dispose(app, clients); }
});

test("campaign creation is rate limited per IP", async () => {
  const { app, url } = await openServer({ createIpLimit: 1 });
  const clients = [];
  try {
    const first = await connect(url); clients.push(first);
    const second = await connect(url); clients.push(second);
    const created = await emitAck(first, "campaign:create", { scenarioId: "lost-heir", character: hero("First") });
    assert.equal(created.ok, true);
    const limited = await emitAck(second, "campaign:create", { scenarioId: "lost-heir", character: hero("Second") });
    assert.equal(limited.ok, false);
    assert.equal(limited.error.code, "RATE_LIMITED");
  } finally { await dispose(app, clients); }
});

test("expired rate-limit records are cleaned up", () => {
  const limiter = new WindowRateLimiter(100);
  assert.equal(limiter.consume("address-a", 2, 10), true);
  assert.equal(limiter.consume("address-b", 2, 20), true);
  assert.equal(limiter.size, 2);
  limiter.cleanup(110);
  assert.equal(limiter.size, 1);
  limiter.cleanup(120);
  assert.equal(limiter.size, 0);
});
