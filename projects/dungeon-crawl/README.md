# Dungeon Crawl: The Lost Heir

A dark-fantasy, browser-based RPG prototype starring Eleni, the Lost Heir. Built with React, TypeScript, and Vite as the first milestone toward a synchronized multiplayer dungeon crawler.

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

At launch, choose **Load saved game** to continue the last adventure stored in this browser, or **Start a new game** to choose a campaign and create a hero. Character setup includes name, gender (female or male), class, ancestry, and background. The live avatar and starting-stat sheet update with the selected class and ancestry; difficulty is selected in a separate confirmation dialog. Starting a new adventure replaces the current single save in this browser. The three current scenarios share core exploration/combat mechanics, with distinct openings, first choices, and scenario-specific location and enemy narration.

## Current limitations

This is a playable prototype, not yet an online multiplayer service. Companion actions are simulated; there is no backend, account system, cross-device save, or AI API integration in this version.
