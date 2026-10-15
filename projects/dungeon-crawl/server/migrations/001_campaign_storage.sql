CREATE TABLE IF NOT EXISTS dungeon_crawl_campaigns (
  campaign_id text PRIMARY KEY,
  invite_code varchar(8) NOT NULL UNIQUE,
  revision bigint NOT NULL CHECK (revision >= 1),
  campaign_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dungeon_crawl_commands (
  campaign_id text NOT NULL REFERENCES dungeon_crawl_campaigns(campaign_id) ON DELETE CASCADE,
  command_id varchar(100) NOT NULL,
  accepted_revision bigint NOT NULL CHECK (accepted_revision >= 1),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, command_id)
);

CREATE INDEX IF NOT EXISTS dungeon_crawl_commands_campaign_idx
  ON dungeon_crawl_commands (campaign_id, accepted_at);
