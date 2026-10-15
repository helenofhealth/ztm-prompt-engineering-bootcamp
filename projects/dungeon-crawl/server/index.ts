import { createGameServer } from "./gameServer.ts";
import { PostgresCampaignPersistence } from "./persistence.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL first.");
const persistence = new PostgresCampaignPersistence(databaseUrl);
await persistence.migrate();

const gameServer = createGameServer({ persistence });
await gameServer.initialize();
const port = await gameServer.listen();
console.log(`Dungeon Crawl multiplayer server listening on http://127.0.0.1:${port}`);

const stop = () => { void gameServer.close().then(() => process.exit(0)); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
