# Dungeon Crawl: The Lost Heir

A dark-fantasy, browser-based RPG prototype starring Eleni, the Lost Heir. Built with React, TypeScript, and Vite as the first milestone toward a synchronized multiplayer dungeon crawler.

## Current features

- Eleni's Warrior character sheet, HP, attributes, XP, gold, and equipment
- Three selectable campaign scenarios: The Lost Heir, The Plague Below, and The Dragon's Hoard
- A New Game scenario picker with distinct opening narration, location choices, and scenario-specific encounter flavor
- Three simulated AI companions: Brom Ironvein, Lyra Thornwhisper, and Mira Voss
- Branching exploration through the royal contract, blood-sealed door, whispering well, and forgotten armory
- d20 skill checks, turn-based combat, healing potions, enemy HP, and rewards
- Adventure journal, inventory view, and browser-local auto-save
- Responsive dark-fantasy interface

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

## Production build

```bash
npm run build
npm run preview
```

The production files are written to `dist/`.

## Deployment

The frontend can be deployed to a static host such as GitHub Pages, Netlify, or Vercel. This prototype saves state in the current browser's local storage, so saves do not yet synchronize across devices.

For the multiplayer milestone, add a Node.js server with Socket.IO and a PostgreSQL database. The server must validate actions and own authoritative campaign state; clients should never decide combat outcomes or write game state directly. Deploy the frontend and server separately or on a host that supports persistent WebSocket connections. Store database URLs and any AI-provider keys in server-side environment variables.

## Planned multiplayer architecture

- Campaign rooms with invite codes
- Authenticated player identities and turn ownership
- Server-authoritative combat, dice rolls, and inventory
- Socket.IO room broadcasts and reconnect recovery
- PostgreSQL campaign, character, event, and save records
- Optional AI Game Master for narration and NPC dialogue, isolated from deterministic rules

## Start a different scenario

Choose **New game** in the header, then select a campaign. Starting a new scenario resets the current run in this browser and begins a fresh campaign. The three current scenarios share the core exploration/combat mechanics, with distinct openings, first choices, and scenario-specific location and enemy narration.

## Current limitations

This is a playable prototype, not yet an online multiplayer service. Companion actions are simulated; there is no backend, account system, cross-device save, or AI API integration in this version.
