import { PostgresCampaignPersistence } from "./persistence.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL first.");
const persistence = new PostgresCampaignPersistence(databaseUrl);
try {
  await persistence.migrate();
  console.log("Dungeon Crawl multiplayer database schema is up to date.");
} finally {
  await persistence.close();
}
