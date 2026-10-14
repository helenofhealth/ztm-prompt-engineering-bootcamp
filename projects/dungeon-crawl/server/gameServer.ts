import { createServer, type Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { CampaignStore, type CampaignBackup, type CampaignRecord } from "./campaignStore.ts";
import { DuplicatePersistentCommandError, PersistenceConflictError, type CampaignPersistence } from "./persistence.ts";
import { WindowRateLimiter } from "./rateLimiter.ts";
import { allExplorationActionIds } from "../src/game/multiplayerExploration.ts";
import { hasExactKeys, isHero, isScenarioId } from "../src/multiplayer/protocol.ts";
import type {
  Ack, CampaignActionRequest, CampaignSnapshot, ClientToServerEvents, CombatActionRequest, CombatRetreatRequest, CreateCampaignRequest,
  Identity, InterServerEvents, JoinCampaignRequest, ProtocolErrorCode, ResumeCampaignRequest,
  ServerToClientEvents, SocketData,
} from "../src/multiplayer/protocol.ts";

type Options = {
  maxPlayers?: number; clientOrigin?: string; random?: () => number;
  joinLimit?: number; joinIpLimit?: number; joinWindowMs?: number;
  createLimit?: number; createIpLimit?: number; createWindowMs?: number;
  joinRoom?: (socket: GameSocket, room: string) => Promise<void> | void;
  leaveRoom?: (socket: GameSocket, room: string) => Promise<void> | void;
  persistence?: CampaignPersistence;
};
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type Failure = { ok: false; error: { code: ProtocolErrorCode; message: string } };
const fail = (code: ProtocolErrorCode, message: string): Failure => ({ ok: false, error: { code, message } });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const roomFor = (campaignId: string) => `campaign:${campaignId}`;
const identity = (playerId: string, resumeToken: string, snapshot: CampaignSnapshot): Identity => ({ playerId, resumeToken, snapshot });
const isAction = (value: unknown): value is CampaignActionRequest => isRecord(value)
  && hasExactKeys(value, ["campaignId", "commandId", "expectedRevision", "action"])
  && typeof value.campaignId === "string"
  && typeof value.commandId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(value.commandId)
  && Number.isSafeInteger(value.expectedRevision) && (value.expectedRevision as number) >= 1
  && typeof value.action === "string" && (allExplorationActionIds as string[]).includes(value.action);
const isCombatAction = (value: unknown): value is CombatActionRequest => isRecord(value)
  && hasExactKeys(value, ["campaignId", "commandId", "expectedRevision", "action"])
  && typeof value.campaignId === "string"
  && typeof value.commandId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(value.commandId)
  && Number.isSafeInteger(value.expectedRevision) && (value.expectedRevision as number) >= 1
  && (value.action === "attack" || value.action === "potion");
const isCombatRetreat = (value: unknown): value is CombatRetreatRequest => isRecord(value)
  && hasExactKeys(value, ["campaignId", "commandId", "expectedRevision"])
  && typeof value.campaignId === "string"
  && typeof value.commandId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(value.commandId)
  && Number.isSafeInteger(value.expectedRevision) && (value.expectedRevision as number) >= 1;

export function createGameServer(options: Options = {}) {
  const maxPlayers = options.maxPlayers ?? Number(process.env.CAMPAIGN_MAX_PLAYERS ?? 4);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 32) throw new Error("CAMPAIGN_MAX_PLAYERS must be an integer from 1 to 32");
  const clientOrigin = options.clientOrigin ?? process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const joinLimit = options.joinLimit ?? Number(process.env.CAMPAIGN_JOIN_LIMIT ?? 8);
  const joinIpLimit = options.joinIpLimit ?? Number(process.env.CAMPAIGN_JOIN_IP_LIMIT ?? 32);
  const joinWindowMs = options.joinWindowMs ?? Number(process.env.CAMPAIGN_JOIN_WINDOW_MS ?? 60_000);
  const createLimit = options.createLimit ?? Number(process.env.CAMPAIGN_CREATE_LIMIT ?? 2);
  const createIpLimit = options.createIpLimit ?? Number(process.env.CAMPAIGN_CREATE_IP_LIMIT ?? 10);
  const createWindowMs = options.createWindowMs ?? Number(process.env.CAMPAIGN_CREATE_WINDOW_MS ?? 60_000);
  for (const [name, value] of Object.entries({ joinLimit, joinIpLimit, joinWindowMs, createLimit, createIpLimit, createWindowMs })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  }
  const joinIpWindow = new WindowRateLimiter(joinWindowMs);
  const createIpWindow = new WindowRateLimiter(createWindowMs);
  const joinSocketWindow = new WindowRateLimiter(joinWindowMs);
  const createSocketWindow = new WindowRateLimiter(createWindowMs);
  const joinRoom = options.joinRoom ?? ((socket, room) => socket.join(room));
  const leaveRoom = options.leaveRoom ?? ((socket, room) => socket.leave(room));
  const httpServer: HttpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: { origin: clientOrigin, methods: ["GET", "POST"], credentials: false },
    maxHttpBufferSize: 16_000,
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, origin === clientOrigin);
    },
  });
  const store = new CampaignStore(maxPlayers, options.random);
  const persistence = options.persistence;
  const cleanupInterval = setInterval(() => {
    joinIpWindow.cleanup();
    createIpWindow.cleanup();
  }, Math.min(joinWindowMs, createWindowMs, 60_000));
  cleanupInterval.unref();
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T,>(operation: () => Promise<T> | T): Promise<T> => {
    const result = queue.then(operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const emitSnapshot = (campaign: ReturnType<CampaignStore["create"]>["campaign"]) => {
    io.to(roomFor(campaign.snapshot.campaignId)).emit("campaign:snapshot", store.snapshot(campaign));
  };
  const setMember = (socket: GameSocket, campaignId: string, playerId: string) => {
    socket.data.campaignId = campaignId;
    socket.data.playerId = playerId;
  };
  const ackIfAvailable = <T,>(ack: unknown, result: Ack<T>) => {
    if (typeof ack === "function") (ack as (value: Ack<T>) => void)(result);
  };
  const persist = async (campaign: CampaignRecord, expectedRevision: number | null, commandId?: string) => {
    if (persistence) await persistence.commit(store.toPersisted(campaign), expectedRevision, commandId);
  };
  const restore = (backup: CampaignBackup) => store.restore(backup);

  io.on("connection", (socket: GameSocket) => {
    socket.on("campaign:create", (payload: CreateCampaignRequest, ack) => {
      void serialize(async () => {
        const ip = socket.handshake.address || "unknown";
        if (!createSocketWindow.consume(socket.id, createLimit) || !createIpWindow.consume(ip, createIpLimit)) {
          return ackIfAvailable<Identity>(ack, fail("RATE_LIMITED", "Too many campaign creation attempts. Wait and try again."));
        }
        if (socket.data.campaignId) return ackIfAvailable<Identity>(ack, fail("ALREADY_IN_CAMPAIGN", "This connection already belongs to a campaign."));
        if (!isRecord(payload) || !hasExactKeys(payload, ["scenarioId", "character"]) || !isScenarioId(payload.scenarioId) || !isHero(payload.character)) return ackIfAvailable<Identity>(ack, fail("INVALID_PAYLOAD", "Provide a valid scenario and character."));
        const { campaign, player, resumeToken } = store.create(payload.scenarioId, payload.character, socket.id);
        try {
          await joinRoom(socket, roomFor(campaign.snapshot.campaignId));
          await persist(campaign, null);
        } catch {
          store.rollbackCreate(campaign.snapshot.campaignId);
          try { await socket.leave(roomFor(campaign.snapshot.campaignId)); } catch { /* Best-effort rollback. */ }
          return ackIfAvailable<Identity>(ack, fail("SERVER_ERROR", "Could not create the campaign."));
        }
        setMember(socket, campaign.snapshot.campaignId, player.playerId);
        const result = identity(player.playerId, resumeToken, store.snapshot(campaign));
        ackIfAvailable(ack, { ok: true, ...result });
        emitSnapshot(campaign);
      }).catch(() => ackIfAvailable<Identity>(ack, fail("SERVER_ERROR", "Could not create the campaign.")));
    });

    socket.on("campaign:join", (payload: JoinCampaignRequest, ack) => {
      void serialize(async () => {
        const now = Date.now();
        const ip = socket.handshake.address || "unknown";
        if (!joinSocketWindow.consume(socket.id, joinLimit, now) || !joinIpWindow.consume(ip, joinIpLimit, now)) return ackIfAvailable<Identity>(ack, fail("RATE_LIMITED", "Too many join attempts. Wait and try again."));
        if (socket.data.campaignId) return ackIfAvailable<Identity>(ack, fail("ALREADY_IN_CAMPAIGN", "This connection already belongs to a campaign."));
        if (!isRecord(payload) || !hasExactKeys(payload, ["inviteCode", "character"]) || typeof payload.inviteCode !== "string" || !/^[A-HJ-NP-Z2-9]{8}$/i.test(payload.inviteCode) || !isHero(payload.character)) return ackIfAvailable<Identity>(ack, fail("INVALID_PAYLOAD", "Provide a valid invite code and character."));
        const campaign = store.findByInvite(payload.inviteCode);
        if (!campaign) return ackIfAvailable<Identity>(ack, fail("CAMPAIGN_NOT_FOUND", "No active campaign matches that invite code."));
        if (campaign.snapshot.phase === "combat") return ackIfAvailable<Identity>(ack, fail("ACTION_UNAVAILABLE", "New players can join after the encounter ends so initiative remains stable."));
        if (store.activePlayerCount(campaign) >= maxPlayers) return ackIfAvailable<Identity>(ack, fail("CAMPAIGN_FULL", "This campaign has reached its player limit."));
        const previous = store.capture(campaign);
        const { player, resumeToken } = store.join(campaign, payload.character, socket.id);
        try {
          await joinRoom(socket, roomFor(campaign.snapshot.campaignId));
          await persist(campaign, previous.snapshot.revision);
        } catch {
          restore(previous);
          try { await socket.leave(roomFor(campaign.snapshot.campaignId)); } catch { /* Best-effort rollback. */ }
          return ackIfAvailable<Identity>(ack, fail("SERVER_ERROR", "Could not join the campaign."));
        }
        setMember(socket, campaign.snapshot.campaignId, player.playerId);
        ackIfAvailable(ack, { ok: true, ...identity(player.playerId, resumeToken, store.snapshot(campaign)) });
        emitSnapshot(campaign);
      }).catch(() => ackIfAvailable<Identity>(ack, fail("SERVER_ERROR", "Could not join the campaign.")));
    });

    socket.on("campaign:resume", (payload: ResumeCampaignRequest, ack) => {
      void serialize(async () => {
        if (socket.data.campaignId) return ackIfAvailable<Identity>(ack, fail("ALREADY_IN_CAMPAIGN", "This connection already belongs to a campaign."));
        if (!isRecord(payload) || !hasExactKeys(payload, ["inviteCode", "resumeToken"]) || typeof payload.inviteCode !== "string" || !/^[A-HJ-NP-Z2-9]{8}$/i.test(payload.inviteCode) || typeof payload.resumeToken !== "string" || payload.resumeToken.length < 40 || payload.resumeToken.length > 100) return ackIfAvailable<Identity>(ack, fail("INVALID_PAYLOAD", "Provide a valid invite code and resume token."));
        const campaign = store.findByInvite(payload.inviteCode);
        if (!campaign) return ackIfAvailable<Identity>(ack, fail("CAMPAIGN_NOT_FOUND", "This campaign is no longer available."));
        const previous = store.capture(campaign);
        const resumed = store.resume(campaign, payload.resumeToken, socket.id);
        if (!resumed) return ackIfAvailable<Identity>(ack, fail("INVALID_RESUME_TOKEN", "That resume token is not valid for this campaign."));
        try {
          await joinRoom(socket, roomFor(campaign.snapshot.campaignId));
          await persist(campaign, previous.snapshot.revision);
        } catch {
          restore(previous);
          try { await socket.leave(roomFor(campaign.snapshot.campaignId)); } catch { /* Best-effort rollback. */ }
          return ackIfAvailable<Identity>(ack, fail("SERVER_ERROR", "Could not resume the campaign."));
        }
        setMember(socket, campaign.snapshot.campaignId, resumed.player.playerId);
        if (resumed.previousSocketId && resumed.previousSocketId !== socket.id) io.sockets.sockets.get(resumed.previousSocketId)?.disconnect(true);
        ackIfAvailable(ack, { ok: true, ...identity(resumed.player.playerId, payload.resumeToken, store.snapshot(campaign)) });
        emitSnapshot(campaign);
      }).catch(() => ackIfAvailable<Identity>(ack, fail("SERVER_ERROR", "Could not resume the campaign.")));
    });

    socket.on("campaign:act", (payload: CampaignActionRequest, ack) => {
      void serialize(async () => {
        if (!isAction(payload)) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("INVALID_PAYLOAD", "The action payload is malformed."));
        const campaignId = socket.data.campaignId;
        const playerId = socket.data.playerId;
        if (!campaignId || !playerId || campaignId !== payload.campaignId) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("NOT_A_MEMBER", "Join this campaign before sending actions."));
        const record = store.getById(payload.campaignId);
        if (!record) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("NOT_A_MEMBER", "Campaign membership is no longer active."));
        const player = record.players.find(value => value.playerId === playerId && value.socketId === socket.id && value.connected);
        if (!player) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("NOT_A_MEMBER", "This connection is not an active campaign member."));
        if (store.hasCommand(record, payload.commandId)) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("DUPLICATE_COMMAND", "That command was already received."));
        if (record.snapshot.turnOwnerId !== playerId) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("WRONG_TURN", "It is another player's turn."));
        if (payload.expectedRevision !== record.snapshot.revision) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("STALE_REVISION", "The campaign changed. Use the latest snapshot and try again."));
        if (!store.canResolveExploration(record, payload.action)) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("ACTION_UNAVAILABLE", "That exploration action is not available in the current campaign phase or scene."));
        const previous = store.capture(record);
        try {
          store.addCommand(record, payload.commandId);
          store.resolveExploration(record, playerId, payload.action);
          await persist(record, previous.snapshot.revision, payload.commandId);
        } catch (error) {
          restore(previous);
          const code = error instanceof DuplicatePersistentCommandError ? "DUPLICATE_COMMAND" : error instanceof PersistenceConflictError ? "STALE_REVISION" : "SERVER_ERROR";
          const message = code === "DUPLICATE_COMMAND" ? "That command was already received." : code === "STALE_REVISION" ? "The campaign changed. Use the latest snapshot and try again." : "Could not resolve the action.";
          return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail(code, message));
        }
        const result = store.snapshot(record);
        ackIfAvailable(ack, { ok: true, snapshot: result });
        emitSnapshot(record);
      }).catch(() => ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("SERVER_ERROR", "Could not resolve the action.")));
    });

    socket.on("campaign:combat:act", (payload: CombatActionRequest, ack) => {
      void serialize(async () => {
        if (!isCombatAction(payload)) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("INVALID_PAYLOAD", "The combat action payload is malformed."));
        const campaignId = socket.data.campaignId;
        const playerId = socket.data.playerId;
        if (!campaignId || !playerId || campaignId !== payload.campaignId) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("NOT_A_MEMBER", "Join this campaign before sending actions."));
        const record = store.getById(payload.campaignId);
        if (!record) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("NOT_A_MEMBER", "Campaign membership is no longer active."));
        const player = record.players.find(value => value.playerId === playerId && value.socketId === socket.id && value.connected);
        if (!player) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("NOT_A_MEMBER", "This connection is not an active campaign member."));
        if (store.hasCommand(record, payload.commandId)) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("DUPLICATE_COMMAND", "That command was already received."));
        if (record.snapshot.phase !== "combat" || record.snapshot.turnOwnerId !== playerId) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("WRONG_TURN", "It is not your active combat turn."));
        if (payload.expectedRevision !== record.snapshot.revision) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("STALE_REVISION", "The campaign changed. Use the latest snapshot and try again."));
        if (!store.canResolveCombat(record, payload.action)) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("ACTION_UNAVAILABLE", "That combat action is unavailable right now."));
        const previous = store.capture(record);
        try {
          store.addCommand(record, payload.commandId);
          store.resolveCombatAction(record, playerId, payload.action);
          await persist(record, previous.snapshot.revision, payload.commandId);
        } catch (error) {
          restore(previous);
          const code = error instanceof DuplicatePersistentCommandError ? "DUPLICATE_COMMAND" : error instanceof PersistenceConflictError ? "STALE_REVISION" : "SERVER_ERROR";
          return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail(code, code === "SERVER_ERROR" ? "Could not resolve the combat action." : "The campaign changed or this action was already accepted."));
        }
        const result = store.snapshot(record);
        ackIfAvailable(ack, { ok: true, snapshot: result });
        emitSnapshot(record);
      }).catch(() => ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("SERVER_ERROR", "Could not resolve the combat action.")));
    });

    socket.on("campaign:combat:retreat", (payload: CombatRetreatRequest, ack) => {
      void serialize(async () => {
        if (!isCombatRetreat(payload)) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("INVALID_PAYLOAD", "The retreat payload is malformed."));
        const campaignId = socket.data.campaignId;
        const playerId = socket.data.playerId;
        if (!campaignId || !playerId || campaignId !== payload.campaignId) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("NOT_A_MEMBER", "Join this campaign before sending actions."));
        const record = store.getById(payload.campaignId);
        if (!record) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("NOT_A_MEMBER", "Campaign membership is no longer active."));
        const player = record.players.find(value => value.playerId === playerId && value.socketId === socket.id && value.connected);
        if (!player) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("NOT_A_MEMBER", "This connection is not an active campaign member."));
        if (store.hasCommand(record, payload.commandId)) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("DUPLICATE_COMMAND", "That command was already received."));
        if (payload.expectedRevision !== record.snapshot.revision) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("STALE_REVISION", "The campaign changed. Use the latest snapshot and try again."));
        if (!store.canRetreatFromDefeat(record)) return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("ACTION_UNAVAILABLE", "Retreat is available only after the party is defeated."));
        const previous = store.capture(record);
        try {
          store.addCommand(record, payload.commandId);
          store.retreatFromDefeat(record);
          record.snapshot.revision += 1;
          await persist(record, previous.snapshot.revision, payload.commandId);
        } catch (error) {
          restore(previous);
          const code = error instanceof DuplicatePersistentCommandError ? "DUPLICATE_COMMAND" : error instanceof PersistenceConflictError ? "STALE_REVISION" : "SERVER_ERROR";
          return ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail(code, "Could not retreat from combat."));
        }
        ackIfAvailable(ack, { ok: true, snapshot: store.snapshot(record) });
        emitSnapshot(record);
      }).catch(() => ackIfAvailable<{ snapshot: CampaignSnapshot }>(ack, fail("SERVER_ERROR", "Could not retreat from combat.")));
    });

    socket.on("campaign:leave", (payload, ack) => {
      void serialize(async () => {
        const { campaignId, playerId } = socket.data;
        if (!isRecord(payload) || !hasExactKeys(payload, ["campaignId"]) || typeof payload.campaignId !== "string" || !campaignId || !playerId || payload.campaignId !== campaignId) {
          return ackIfAvailable<{ left: true }>(ack, fail("NOT_A_MEMBER", "This connection is not a member of that campaign."));
        }
        const campaign = store.getById(campaignId);
        if (!campaign) return ackIfAvailable<{ left: true }>(ack, fail("NOT_A_MEMBER", "This connection is not an active campaign member."));
        const previous = store.capture(campaign);
        const previousResumeHash = store.leave(campaign, playerId, socket.id);
        if (!previousResumeHash) return ackIfAvailable<{ left: true }>(ack, fail("NOT_A_MEMBER", "This connection is not an active campaign member."));
        try {
          await leaveRoom(socket, roomFor(campaignId));
          await persist(campaign, previous.snapshot.revision);
        } catch {
          restore(previous);
          try { await joinRoom(socket, roomFor(campaignId)); } catch { /* Best-effort rollback. */ }
          return ackIfAvailable<{ left: true }>(ack, fail("SERVER_ERROR", "Could not leave the campaign."));
        }
        socket.data.campaignId = undefined;
        socket.data.playerId = undefined;
        ackIfAvailable(ack, { ok: true, left: true });
        emitSnapshot(campaign);
      }).catch(() => ackIfAvailable<{ left: true }>(ack, fail("SERVER_ERROR", "Could not leave the campaign.")));
    });

    socket.on("disconnect", () => {
      joinSocketWindow.delete(socket.id);
      createSocketWindow.delete(socket.id);
      void serialize(async () => {
        const { campaignId, playerId } = socket.data;
        if (!campaignId || !playerId) return;
        const campaign = store.getById(campaignId);
        if (campaign) {
          const previous = store.capture(campaign);
          if (store.disconnect(campaign, playerId, socket.id)) {
            try {
              await persist(campaign, previous.snapshot.revision);
              emitSnapshot(campaign);
            } catch {
              restore(previous);
            }
          }
        }
      });
    });
  });

  return {
    io,
    httpServer,
    store,
    initialize: async () => {
      if (!persistence) return;
      const records = await persistence.loadAll();
      for (const { campaign: data, commandIds } of records) {
        const restored = store.restorePersisted(data, commandIds);
        if (restored.changed) await persist(restored.campaign, restored.expectedRevision);
      }
    },
    listen: (port = Number(process.env.PORT ?? 3001), host = process.env.HOST ?? "127.0.0.1") => new Promise<number>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, host, () => {
        httpServer.off("error", reject);
        const address = httpServer.address();
        resolve(address && typeof address !== "string" ? address.port : port);
      });
    }),
    close: async () => {
      clearInterval(cleanupInterval);
      await new Promise<void>(resolve => io.close(() => resolve()));
      await queue;
      await persistence?.close?.();
    },
  };
}
