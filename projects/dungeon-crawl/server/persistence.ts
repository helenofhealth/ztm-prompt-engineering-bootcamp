import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type { PersistedCampaign } from "./campaignStore.ts";

export type StoredCampaign = { campaign: PersistedCampaign; commandIds: string[] };

export interface CampaignPersistence {
  loadAll(): Promise<StoredCampaign[]>;
  commit(campaign: PersistedCampaign, expectedRevision: number | null, commandId?: string): Promise<void>;
  close?(): Promise<void>;
}

export class PersistenceConflictError extends Error {
  constructor() { super("Campaign revision changed in persistent storage."); this.name = "PersistenceConflictError"; }
}

export class DuplicatePersistentCommandError extends Error {
  constructor() { super("Command ID was already committed."); this.name = "DuplicatePersistentCommandError"; }
}

type CampaignEnvelope = { version: 1; campaign: PersistedCampaign };

export class PostgresCampaignPersistence implements CampaignPersistence {
  private readonly pool: Pool;
  private closePromise: Promise<void> | undefined;

  constructor(connectionString: string, options: { max?: number; schema?: string } = {}) {
    if (!connectionString.trim()) throw new Error("DATABASE_URL is required for persistent multiplayer storage.");
    if (options.schema && !/^dc_test_[a-f0-9]+$/.test(options.schema)) throw new Error("Test schema name is invalid.");
    this.pool = new Pool({
      connectionString,
      max: options.max ?? 10,
      ...(options.schema ? { options: `-c search_path=${options.schema}` } : {}),
    });
    this.pool.on("error", () => { /* Keep database details and credentials out of client-visible logs. */ });
  }

  async migrate() {
    const sql = await readFile(fileURLToPath(new URL("./migrations/001_campaign_storage.sql", import.meta.url)), "utf8");
    const client = await this.pool.connect();
    try {
      await client.query("CREATE TABLE IF NOT EXISTS dungeon_crawl_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('dungeon_crawl_schema_migrations'))");
      const applied = await client.query("SELECT 1 FROM dungeon_crawl_schema_migrations WHERE version = '001_campaign_storage'");
      if (applied.rowCount === 0) {
        await client.query(sql);
        await client.query("INSERT INTO dungeon_crawl_schema_migrations (version) VALUES ('001_campaign_storage')");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async loadAll(): Promise<StoredCampaign[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const campaigns = await client.query<{ campaign_state: CampaignEnvelope }>(
        "SELECT campaign_state FROM dungeon_crawl_campaigns ORDER BY created_at ASC",
      );
      const commands = await client.query<{ campaign_id: string; command_id: string }>(
        "SELECT campaign_id, command_id FROM dungeon_crawl_commands ORDER BY accepted_at ASC",
      );
      await client.query("COMMIT");
      const commandsByCampaign = new Map<string, string[]>();
      for (const row of commands.rows) {
        const items = commandsByCampaign.get(row.campaign_id) ?? [];
        items.push(row.command_id);
        commandsByCampaign.set(row.campaign_id, items);
      }
      return campaigns.rows.map(({ campaign_state }) => {
        if (campaign_state?.version !== 1 || !campaign_state.campaign) throw new Error("Unsupported multiplayer campaign storage version.");
        return {
          campaign: campaign_state.campaign,
          commandIds: commandsByCampaign.get(campaign_state.campaign.snapshot.campaignId) ?? [],
        };
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async commit(campaign: PersistedCampaign, expectedRevision: number | null, commandId?: string) {
    const { snapshot } = campaign;
    if (expectedRevision === null ? snapshot.revision !== 1 : snapshot.revision !== expectedRevision + 1) {
      throw new PersistenceConflictError();
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ revision: string }>(
        "SELECT revision::text FROM dungeon_crawl_campaigns WHERE campaign_id = $1 FOR UPDATE",
        [snapshot.campaignId],
      );
      if (expectedRevision === null) {
        if (existing.rowCount !== 0) throw new PersistenceConflictError();
        await client.query(
          "INSERT INTO dungeon_crawl_campaigns (campaign_id, invite_code, revision, campaign_state) VALUES ($1, $2, $3, $4::jsonb)",
          [snapshot.campaignId, snapshot.inviteCode, snapshot.revision, JSON.stringify({ version: 1, campaign })],
        );
      } else {
        if (existing.rowCount !== 1 || Number(existing.rows[0].revision) !== expectedRevision) throw new PersistenceConflictError();
        if (commandId) {
          try {
            await client.query(
              "INSERT INTO dungeon_crawl_commands (campaign_id, command_id, accepted_revision) VALUES ($1, $2, $3)",
              [snapshot.campaignId, commandId, snapshot.revision],
            );
          } catch (error) {
            if ((error as { code?: string }).code === "23505") throw new DuplicatePersistentCommandError();
            throw error;
          }
        }
        await client.query(
          "UPDATE dungeon_crawl_campaigns SET invite_code = $2, revision = $3, campaign_state = $4::jsonb, updated_at = now() WHERE campaign_id = $1",
          [snapshot.campaignId, snapshot.inviteCode, snapshot.revision, JSON.stringify({ version: 1, campaign })],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  close() {
    this.closePromise ??= this.pool.end();
    return this.closePromise;
  }
}
