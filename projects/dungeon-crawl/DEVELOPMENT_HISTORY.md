# Dungeon Crawl RPG — Development History

Dungeon Crawl is a dark-fantasy browser RPG prototype with a local solo adventure and PostgreSQL-backed multiplayer campaigns. This document records the completed Phase 1–4 implementation and its verification evidence. The application has not been verified as a public deployment. Phase 5 is planned and has not started.

## Phase 1 — Deterministic Game Rules

The solo game's reusable rules were extracted from React presentation code into `src/game/types.ts` and `src/game/rules.ts`. Pure calculations accept explicit die values or an injected random source, making checks, attacks, damage, healing, and reward eligibility deterministic in tests. The solo UI continues to use those rules.

The phase added automated rule and compatibility tests, including current natural-roll behavior, difficulty-based enemy damage, potion healing, and one-time exploration rewards. Save validation handles malformed or older data safely, including legacy defaults and the Lost Heir Silver key backfill. The `dungeon-crawl-save-v1` localStorage key and existing `SaveState` shape remain compatible; multiplayer state is separate.

## Phase 2 — Multiplayer Foundation and Persistence

The application gained a Node.js/TypeScript Socket.IO server, campaign rooms, cryptographically generated invite codes, and server-issued player IDs and resume credentials. Resume tokens are stored as hashes on the server. A campaign has a configurable human-player cap (default four); exploration turns rotate in join order, and each character retains personal HP, XP, gold, and inventory.

The server owns campaign state and validates membership, active socket, turn, command ID, action payload, and expected revision. Clients receive canonical revisioned snapshots. Accepted state-changing commands and their deduplication records are committed transactionally before acknowledgement or broadcast. Reconnect restores the latest committed snapshot; explicit leave revokes the resume token. Rate limits and an exact browser Origin allowlist protect room operations. When the current player disconnects, the turn advances to the next connected player while the disconnected member remains eligible to reconnect.

Campaign snapshots and command records persist in PostgreSQL. Campaigns are not automatically expired or deleted. Local setup uses PostgreSQL 16 through Docker Compose, environment-based configuration, and a schema migration. The server is intended to run as one Socket.IO process; multi-instance room broadcasting is not part of this phase. Solo saves are not written to the multiplayer database.

## Phase 3 — Server-Authoritative Multiplayer Exploration

Scenario-specific investigation actions were added for the existing campaign scenes. The server selects the acting character's relevant existing stat, generates the d20 roll, applies the configured difficulty, and resolves success or failure. Accepted results update shared scene/progress and journal state while personal XP, HP, gold, and inventory remain attached to the acting character.

Discovery and reward markers prevent repeated claims, including fresh command IDs and retries. Exploration state, consequences, shared journal entries, reward markers, revisions, and command records are persisted atomically. Older Phase 2 campaign snapshots receive safe defaults for exploration fields. Automated coverage includes scenario outcomes, reward idempotency, authorization, revision checks, concurrency, persistence failures, and recovery.

## Phase 4 — Multiplayer Combat and Fantasy UI

The first multiplayer combat encounter is the Crownbound Sentinel in Lost Heir. A failed contract interpretation check can start the encounter; a successful check does not. The server creates and persists initiative and controls turn ownership. Player attacks resolve a server-generated d20 against AC; natural 20 is an automatic hit without extra critical damage. Player damage uses the existing d8+3 rule. Potion use preserves the existing 2d4+2 healing rule and HP cap. Enemy damage follows the existing difficulty dice, and enemy targeting is server-controlled.

Victory, defeat, and retreat are persisted campaign outcomes. Only the final attacker receives the one-time 50 XP and 15 gold victory reward. Party defeat grants no victory reward; retreat restores downed characters to `min(12, maximum HP)` while preserving unrelated resources. A durable encounter-completion marker prevents the Sentinel from respawning after victory, including after restart or a retry with a fresh command ID. Combat actions, enemy responses, resource changes, rewards, and command deduplication are committed atomically. Reconnect restores the canonical combat or completed-victory state.

The multiplayer UI was redesigned with a fantasy presentation for party, scene, journal, exploration, and combat. The party display supports two-to-four players, shows character resources and turn ownership, and the completed-combat summary remains visible after the campaign returns to exploration. Identical narrative content was consolidated into shared definitions while intentionally mode-specific text remained separate. Solo presentation and save compatibility were preserved.

### Verification evidence and limits

The final recorded automated verification was:

- `npm test`: 48 passed, 0 failed, 5 skipped. The skipped cases require PostgreSQL integration configuration.
- Separate PostgreSQL integration suite: 7 passed against the disposable `dungeon_crawl_test` database.
- `npm run build`: passed.
- `git diff --check`: passed.
- Browser regression: two-player and four-player campaigns were exercised with the PostgreSQL-backed server. Combat, victory presentation, refresh/reconnect, and party synchronization were checked.
- Responsive browser layouts were checked at approximately 615 px and 1265 px. A 1440 px viewport was not tested.
- Browser developer-console inspection was unavailable during the final desktop verification; no claim of a clean console is made.

The browser evidence covers the scenarios actually exercised and is not a substitute for coverage of every random branch. Multiplayer combat is limited to the Lost Heir Sentinel; other scenario-specific multiplayer encounters, multiplayer NPC companion turns, account authentication, and AI narration are not implemented. No public deployment has been verified.

## Phase 5 — Planned

Phase 5 has not started. Scope and sequencing remain subject to review and approval after Phase 4 sign-off. No Phase 5 feature is represented as implemented here.
