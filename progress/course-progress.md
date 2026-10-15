# Zero To Mastery — Course Progress

## Bootcamp

**Zero To Mastery Prompt Engineering Bootcamp**

## Portfolio Projects

| Project | Status | GitHub Evidence |
|---|---|---|
| Snake Game | Completed | README, source, screenshot, prompts |
| Tic-Tac-Toe AI | Completed | README, source, screenshot, prompts, testing |
| Neo Career Coach | Completed | README, system prompt, examples, schema, case study |
| Dungeon Crawl RPG | Playable prototype checkpoint published; M1 pending | [Project README](../projects/dungeon-crawl/README.md), [Phase 1–4 history and verification](../projects/dungeon-crawl/DEVELOPMENT_HISTORY.md) |

## Skills Practiced

### Prompt Engineering

- Structured prompts
- System instructions
- Role and persona design
- Behavioral constraints
- Mode routing
- Prompt iteration

### AI-Assisted Development

- Generating application code
- Iterative development
- Running generated applications
- Testing generated code
- Reviewing AI-generated logic
- Correcting defects

### Software Development

- HTML
- CSS
- JavaScript
- DOM manipulation
- Game-state management
- Event handling
- Recursive algorithms
- Minimax
- React and TypeScript
- Node.js and Socket.IO
- PostgreSQL persistence and transactions
- Deterministic rules and server-authoritative multiplayer state

### AI System Design

- System prompts
- Knowledge Base architecture
- Structured state
- Command routing
- Career coaching workflows
- Portfolio automation
- AI application architecture

## Completed Portfolio Evidence

### Snake Game

- Source code
- README
- Screenshot
- Build prompts
- Debugging documentation
- AI-generated defect
- Correction
- Run instructions

### Tic-Tac-Toe AI

- Source code
- README
- Screenshot
- AI opponent design
- Game rules
- Decision logic
- Invalid-move testing
- Edge-case testing
- AI-generated defect analysis
- Correction

### Neo Career Coach

- System prompt
- Slash commands
- Mode routing tests
- Example conversation
- Progress schema
- Known limitations
- GHL + AI architecture case study

### Dungeon Crawl RPG

- **Phase 1 — Deterministic Game Rules:** extracted testable rules and retained compatibility with the existing `dungeon-crawl-save-v1` key and `SaveState` shape.
- **Phase 2 — Multiplayer Foundation and Persistence:** added Socket.IO campaign rooms, secure invite/resume credentials, server-owned state and turn validation, PostgreSQL persistence, transactional command handling, and reconnect recovery.
- **Phase 3 — Multiplayer Exploration:** added scenario-specific server-resolved checks, per-character resources, shared progression and journal, and idempotent persisted discoveries and rewards.
- **Phase 4 — Multiplayer Combat and Fantasy UI:** added the one-time Crownbound Sentinel encounter, server-controlled initiative and combat actions, persisted victory/defeat/retreat, and the redesigned two-to-four-player interface with shared narrative definitions.

The final recorded verification was `npm test` (48 passed, 0 failed, 5 PostgreSQL-related skipped), the separate PostgreSQL suite (7 passed), production build passed, and `git diff --check` passed. Two-player and four-player browser checks were completed; responsive layouts were checked at approximately 615 px and 1265 px. A 1440 px viewport and browser-console inspection were not completed. See the [detailed phase history](../projects/dungeon-crawl/DEVELOPMENT_HISTORY.md) for evidence and limitations. Phase 5 checkpoint preservation and GitHub publication are recorded below; M1 development has not started or been authorized. Public deployment is not verified.

#### Playable Prototype Checkpoint — October 15, 2026

The Dungeon Crawl RPG playable prototype checkpoint is completed and published to GitHub; the entire project is not yet complete.

- **Branch:** `feat/dungeon-crawl-prototype`
- **Verified commit:** [`1001386fe3da7ec507eb2eaedbf272daa5640d87`](https://github.com/helenofhealth/ztm-prompt-engineering-bootcamp/commit/1001386fe3da7ec507eb2eaedbf272daa5640d87)
- **GitHub project:** [Dungeon Crawl RPG](https://github.com/helenofhealth/ztm-prompt-engineering-bootcamp/tree/feat/dungeon-crawl-prototype/projects/dungeon-crawl)
- **Checkpoint evidence:** playable RPG prototype, project README and source code, game rules and narrative logic, multiplayer architecture and server components, and automated testing performed during development.
- **Preservation and publication evidence:** 27 approved changed files in the checkpoint commit, 78 files in the committed project tree, completed historical privacy review, and successful GitHub publication with independent commit verification.
- **Skills demonstrated:** prompt-driven game development; AI-assisted software engineering; game-state and combat-rule design; multiplayer architecture; automated testing and debugging; Git branching and version control; GitHub publication and authentication troubleshooting; repository privacy review.
- **Next milestone:** M1 development — not yet started or authorized.

## Next Action

Continue the Zero To Mastery curriculum. Dungeon Crawl M1 development remains pending and is not yet started or authorized; obtain separate authorization before implementation. Add future projects using the same workflow:

```text
Build
→ Test
→ Document
→ Capture Evidence
→ Add to GitHub
→ Identify GHL + AI Application
```
