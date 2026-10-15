# Dungeon Crawl RPG

A dark-fantasy, browser-based RPG prototype built with React, TypeScript, and Vite. It includes a local solo adventure and PostgreSQL-backed multiplayer campaigns with server-authoritative exploration and a focused combat encounter. Public deployment has not been verified.

## Current features

- Main menu with load-saved-game and new-game choices
- Redesigned character creator with live full-body vector avatars for all 40 gender/class/ancestry combinations (20 female and 20 male), five classes, four ancestries, four backgrounds, and a separate difficulty-selection dialog
- Class-specific characteristics, ancestry attribute bonuses, a readable starting-stat sheet, origin stories, weapons, armor, and inventory
- Custom hero character sheet, HP, attributes, XP, gold, and equipment
- Three selectable campaign scenarios: The Lost Heir, The Plague Below, and The Dragon's Hoard
- A New Game scenario picker with distinct opening narration, location choices, and scenario-specific encounter flavor
- Three simulated AI companions: Brom Ironvein, Lyra Thornwhisper, and Mira Voss
- Branching exploration through the royal contract, blood-sealed door, whispering well, and forgotten armory
- d20 skill checks, turn-based combat, healing potions, enemy HP, and rewards
- Adventure journal, inventory view, and browser-local auto-save
- Responsive dark-fantasy interface
- Multiplayer campaign rooms with invite codes, reconnectable player identities, shared exploration, and persistent campaign snapshots
- Server-authoritative Crownbound Sentinel combat for the Lost Heir campaign, including initiative, attacks, potions, victory, defeat, and retreat
- Redesigned multiplayer fantasy interface for two-to-four-player parties

## Requirements

- Node.js 20 or newer (Node.js 22 LTS recommended)
- npm

## Run locally

From this directory:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Multiplayer campaigns

Multiplayer campaign state is stored in PostgreSQL. It survives browser closures and Node.js server restarts. The database stores campaign snapshots and resume-token hashes; the raw resume token stays in the browser's tab-scoped `sessionStorage`. The existing solo `dungeon-crawl-save-v1` localStorage key and `SaveState` remain separate and unchanged.

### Local PostgreSQL setup

Requirements: Node.js 20.6 or newer, npm, and Docker Compose (or a local PostgreSQL 14+ server).

```bash
cp .env.example .env
```

Edit `.env` and replace the `POSTGRES_PASSWORD` and matching password in `DATABASE_URL` with a local development password. Start the local database and apply the schema:

```bash
docker compose up -d postgres
npm run db:migrate
```

For a PostgreSQL server you manage yourself, create the `dungeon_crawl_dev` database and set `DATABASE_URL` to its connection URL instead; the application database role needs permission to create and update the Dungeon Crawl schema tables. The migration is also applied automatically when the server starts, while `npm run db:migrate` is useful for checking the schema separately.

Run the frontend and server in separate terminals from this directory. To avoid colliding with existing local Vite instances, this example uses port 5176 for the frontend and 3001 for Socket.IO. Keep the URLs and origin matched exactly:

```bash
VITE_MULTIPLAYER_URL=http://127.0.0.1:3001 npm run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

```bash
CLIENT_ORIGIN=http://127.0.0.1:5176 HOST=127.0.0.1 PORT=3001 npm run dev:server
```

`dev:server` runs without filesystem watch mode so it can start reliably when Node cannot allocate a watch handle (`EMFILE`). Restart it with Ctrl+C and rerun the command after server-code changes. On systems where Node watch mode works, `npm run dev:server:watch` is available as an optional auto-restarting command. If either example port is occupied, choose another frontend port and set both `CLIENT_ORIGIN` and the browser's `VITE_MULTIPLAYER_URL` to the corresponding exact origins/URLs; `--strictPort` makes Vite fail visibly instead of silently selecting another port.

Open the Vite URL, choose **Play online**, create a campaign, then join its invite code from a second browser session. The server default room limit is four human players; set `CAMPAIGN_MAX_PLAYERS` to configure it. Campaign creation is limited to 2 attempts per socket and 10 per IP per minute by default; configure these with `CAMPAIGN_CREATE_LIMIT`, `CAMPAIGN_CREATE_IP_LIMIT`, and `CAMPAIGN_CREATE_WINDOW_MS`. Join attempts default to 8 per socket and 32 per IP per minute, configurable with `CAMPAIGN_JOIN_LIMIT`, `CAMPAIGN_JOIN_IP_LIMIT`, and `CAMPAIGN_JOIN_WINDOW_MS`. `VITE_MULTIPLAYER_URL` can override the browser's server URL (default `http://localhost:3001`). The server accepts Socket.IO browser connections only when `Origin` exactly matches `CLIENT_ORIGIN` (default `http://localhost:5173`); missing origins are rejected. Origin validation is a browser-origin policy, not authentication.

Accepted actions are saved with their command IDs in one PostgreSQL transaction before the server acknowledges or broadcasts the committed snapshot. A failed database write leaves the campaign at its last committed state. Explicit leave revokes the token hash in persistent storage. Campaigns do not expire automatically and are not deleted by server restarts. The server does not automatically delete old campaigns; database operators should plan retention and backup policies before any manual cleanup.

`docker compose` stores database files in the named `dungeon_crawl_pgdata` volume. Back it up regularly; for example:

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > dungeon-crawl-backup.sql
```

Keep backups outside the project directory and test restores against a separate database before relying on them. The browser stores only a multiplayer resume token in tab-scoped `sessionStorage`. If the current turn owner disconnects, turn ownership advances to the next connected player in join order; disconnected characters remain in the roster and can resume without reclaiming the skipped turn.

Run one Socket.IO server process for a campaign deployment. PostgreSQL serializes writes by campaign revision, but Socket.IO rooms and the in-memory working snapshots are process-local; multi-instance broadcasting and cache refresh are not included in this milestone.

### Persistence tests

`npm test` always runs the Socket.IO, rules, save-compatibility, and injected database-failure tests. PostgreSQL restart and transaction-failure integration tests are skipped unless `DATABASE_TEST_URL` points to a disposable PostgreSQL database where the test role can create schemas. The tests create and drop only a unique `dc_test_*` schema within that database. Run them with:

```bash
DATABASE_TEST_URL='postgresql://dungeon_crawl:your-test-password@localhost:5432/dungeon_crawl_test' npm run test:postgres
```

## Production build

```bash
npm run build
npm run preview
```

The production files are written to `dist/`.

## Deployment

The frontend can be deployed to a static host such as GitHub Pages, Netlify, or Vercel. Solo saves remain browser-local; multiplayer campaign snapshots are stored by the separately deployed Node.js server in PostgreSQL.

The multiplayer server validates actions and owns authoritative campaign state. Deploy the frontend and server separately or on a host that supports persistent WebSocket connections, and provide a PostgreSQL connection through `DATABASE_URL`. Account authentication and AI narration remain future work.

## Current multiplayer slice and limitations

- Cryptographically generated invite codes, server-issued player IDs, and tab-scoped resume tokens
- Socket.IO campaign rooms, join-order turn ownership, synchronized PostgreSQL snapshots, and restart-safe reconnect recovery
- Server-authoritative exploration across each scenario's entry, contract, sealed passage, well, and supply/treasure vault scenes
- Character-stat d20 checks, per-character XP/HP/gold/inventory, one-time discoveries, and revisioned shared journal entries
- A server-authoritative combat slice: a failed Lost Heir contract check starts the Crownbound Sentinel encounter; players can attack or use potions, with server-controlled initiative and Sentinel turns
- Combat initiative, enemy HP, action history, personal resource changes, defeat recovery, one-time victory rewards, and the one-time Sentinel completion marker persist with the campaign; older exploration snapshots hydrate with safe defaults
- The final attacker receives the one-time 50 XP and 15 gold victory reward; other party members do not receive that finisher reward
- Multiplayer combat currently covers only the Lost Heir Sentinel. Defend, class abilities, equipment bonuses, NPC companions, and combat in the other scenarios are not included. New players must wait until the encounter ends before joining.
- No account authentication or AI narration

The [development history](DEVELOPMENT_HISTORY.md) records the scope, compatibility decisions, verification evidence, and limitations for Phases 1–4.

## Start a different scenario

At launch, choose **Load saved game** to continue the last adventure stored in this browser, or **Start a new game** to choose a campaign and create a hero. Character setup includes name, gender (female or male), class, ancestry, and background. The live avatar and starting-stat sheet update with the selected class and ancestry; difficulty is selected in a separate confirmation dialog. Starting a new adventure replaces the current single save in this browser. The three current scenarios share core exploration/combat mechanics, with distinct openings, first choices, and scenario-specific location and enemy narration.

## Current limitations

This is a playable prototype, not a publicly verified deployment. Solo companion actions are simulated. Multiplayer campaigns persist across server restarts and support server-authoritative exploration plus the Lost Heir Sentinel encounter. The other scenario encounters, multiplayer NPC companions, account authentication, and AI narration are not implemented. The current multiplayer server is designed to run as a single Socket.IO process; multi-instance room broadcasting is not included.
