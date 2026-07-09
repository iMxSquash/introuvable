<div align="center">

<img src="public/favicon.svg" width="72" alt="introuvable icon" />

# introuvable

**A hidden 3D minigame standing in for a 404 page.**

[![CI](https://github.com/iMxSquash/introuvable/actions/workflows/ci.yml/badge.svg)](https://github.com/iMxSquash/introuvable/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/iMxSquash/introuvable)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

[Live demo](https://introuvable.elwen.dev) · [elwen.dev](https://elwen.dev) · [GameBlocks usage](./gameblocks_usage.md)

</div>

---

## Overview

`introuvable` ("cannot be found", in French) is the 404 experience for the [elwen.dev](https://elwen.dev) portfolio. Instead of a plain error page, a visitor who hits a missing URL is told the page has been moved to the Trash, and is invited to go find it themselves. Accepting drops them **inside** a giant macOS-style desktop, seen from within, where the requested file has shattered into fragments scattered across the desktop, the last one sitting on top of a folder at the end of a short jump-platforming course.

> [!NOTE]
> This app is intentionally **not linked from the portfolio's app registry**. The only door in is the 404 page itself, which embeds it full-screen in an iframe.

## How it works

1. The player spawns on a giant desktop, dotted with macOS-style folders.
2. Click (or tap) to move the cursor around; a keyboard fallback (WASD/arrows + Space to jump) is available.
3. Collect file fragments scattered on the desktop; a Finder-style path bar and a counter track progress.
4. Three jump-platforming courses, in the continuity of the desktop, each in a different direction and increasingly hard (the hardest ones add moving, back-and-forth platforms). Each ends on a folder whose roof holds a fragment; missing a jump sends the player back to that course's own entry, no progress lost.
5. Collecting every fragment plays a short restoration cinematic and opens a Finder window with the recovered file, ready to be reopened back on [elwen.dev](https://elwen.dev).

## Features

- Click-to-move cursor character with a WASD/arrow-key fallback, driven by a kinematic character controller and Rapier3D collisions
- Isometric follow camera locked to the player
- Fragment collection with a Finder-style HUD (path bar, counter, macOS-style toast notifications)
- Three jump-platforming courses (easy, medium, hard) in the continuity of the desktop, the harder ones adding moving back-and-forth platforms, each leading to a fragment on top of a folder; missing a jump resets to that course's own entry
- Jump support on keyboard (Space bar) and on mobile/tablet (on-screen jump button, alongside the touch joystick)
- Restoration cinematic and Finder window on completion, with a top-level redirect back to elwen.dev
- Run counter persisted in `localStorage` ("N files restored") for replayability
- Mobile support: pointer/tap input, on-screen joystick and jump button, safe-area insets, adjusted camera framing
- Accepts context from the host page via query parameters (see [Integration](#integration))

## Tech stack

- [Vite](https://vitejs.dev/) — build tooling, vanilla JS template (no framework)
- [Three.js](https://threejs.org/) — rendering
- [Rapier3D](https://rapier.rs/) (`@dimforge/rapier3d-compat`) — physics and collisions
- [Vitest](https://vitest.dev/) + [ESLint](https://eslint.org/) — tests and linting
- GameBlocks modules (`src/modules/`) — reusable math, camera, actor-motion, behavior and world utilities; see [`gameblocks_usage.md`](./gameblocks_usage.md) for what was reused as-is versus adapted

## Getting started

### Prerequisites

- Node.js 20 or later (developed with v24)
- npm 10 or later

### Installation

```bash
git clone https://github.com/iMxSquash/introuvable.git
cd introuvable
npm install
npm run dev
```

No environment variables are required to run the app locally.

### Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build the production bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest test suite |

## Project structure

```
src/
├── main.js       # bootstrap: renderer, render loop, resize
├── style.css
├── game/         # game-specific code (world, gameplay, UI)
└── modules/      # GameBlocks modules (math, camera, actor-motion, behavior, world, ui)
public/           # static assets (favicon, textures, sounds)
```

## Integration

The game is designed to run standalone, but accepts context from the page that embeds it via query parameters:

| Parameter | Description |
| --- | --- |
| `?path=/some/slug` | The URL the visitor originally tried to reach; sanitized and shown as the file name to recover in the HUD. Falls back to a generic name when absent or invalid. |
| `?theme=dark\|light` | Optional; aligns lighting/HUD styling with the host page's theme. |

On the portfolio side, the 404 page embeds `https://introuvable.elwen.dev?path={pathname}` full-screen in an iframe. `vercel.json` sets a `Content-Security-Policy: frame-ancestors` header restricting embedding to `elwen.dev` and its subdomains.

## Deployment

The app is deployed on [Vercel](https://vercel.com) as the standalone subdomain `introuvable.elwen.dev`, on top of the wildcard `*.elwen.dev` already configured for the portfolio.

> [!TIP]
> Development notes, module-by-module GameBlocks reuse decisions, and known follow-up items live in [`gameblocks_usage.md`](./gameblocks_usage.md) and [`TODO.md`](./TODO.md).
