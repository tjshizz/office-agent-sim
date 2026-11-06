# Office Agent Sim

8-bit top-down office. Employees are AI agents. The **Render server** keeps the office alive while you are away; desktop/phone are viewers.

## How it fits together

| Piece | Role |
| --- | --- |
| Render web service | Always-on office host: ticks the sim, away-work scripts, live Grok chat, SSE sync |
| Browser at your Render URL | Thin client connected to that host |
| Desktop Electron | Same client; set `VITE_OFFICE_SERVER_URL` to your Render URL |

Ambient walking/chatter is free (local lines on the server). **Grok tokens only** when you join a chat (needs `XAI_API_KEY` on Render).

## Setup

```bash
pnpm install
pnpm --filter @office-sim/shared build
pnpm --filter @office-sim/sim build
pnpm --filter @office-sim/agents build
```

### Always-on server (local)

```bash
pnpm build:web
pnpm start:web
```

Opens on `http://localhost:8080`. Agents keep working even with zero browser tabs.

### Deploy on Render

1. Push this repo to GitHub.
2. [Render](https://dashboard.render.com) → **Blueprint** → select the repo (`render.yaml`).
3. Set secret env var **`XAI_API_KEY`** on the service.
4. Deploy. Health check: `/api/health`.

Free tier may sleep after idle; first request can be slow. For true 24/7, use a paid always-on plan.

### Desktop connected to Render

Create `apps/desktop/.env`:

```bash
VITE_OFFICE_SERVER_URL=https://YOUR-SERVICE.onrender.com
```

Then:

```bash
pnpm dev
```

Without that env var, desktop runs a local office (stops when you quit).

## Controls

- Click an employee to talk
- HUD shows **Server · uptime · viewers** when connected
- **While you were away** shows the latest background task an agent finished

## Cast

Maya (Eng), Leo (Product), Sam (Design), Riley (Ops)
