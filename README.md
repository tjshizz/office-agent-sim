# Office Agent Sim

8-bit top-down office sim. Every employee is an AI agent you can join and chat with like Grok Bot.

## Stack

- Phaser 3 + React (shared UI/game/sim packages)
- Desktop: Electron + sql.js (`office.sqlite` in userData) + `safeStorage` for the API key
- Web: Vite + IndexedDB persistence + `localStorage` for the API key (dev proxy for xAI)
- Local simulation loop (movement, tasks, bark fallback)
- xAI Grok for ambient dialogue and live joined chats


## Setup

```bash
pnpm install
pnpm --filter @office-sim/shared build
pnpm --filter @office-sim/sim build
pnpm --filter @office-sim/agents build
```

### Desktop (Electron)

```bash
pnpm dev
```

### Web (local dev)

```bash
pnpm dev:web
```

Then open the Vite URL (default `http://localhost:5173`). Grok calls go through a Vite `/xai` proxy so the browser avoids CORS.

### Web (production server)

Serves the built app and proxies `/xai` → `https://api.x.ai` (needed for Grok outside Vite):

```bash
pnpm build:web
pnpm start:web
```

Opens on `http://localhost:8080` (or `$PORT`).

To host it publicly on **Render** (free tier):

1. Push this repo to GitHub.
2. In [Render](https://dashboard.render.com) → **New** → **Blueprint** → select the repo (uses root `render.yaml`).
3. Deploy. You’ll get a URL like `https://office-agent-sim.onrender.com`.

Or **New Web Service** → Docker → root `Dockerfile`. Set health check path to `/`.

Optional: set your xAI API key in the in-app **API key** dialog. Without a key, the office still runs offline using bark lines.

## Controls

- Click an employee whenever you want to talk to them
- Pause freezes the world clock; live chat still works
- Token meters show ambient vs chat budget


## Cast

Maya (Eng), Leo (Product), Sam (Design), Riley (Ops)
