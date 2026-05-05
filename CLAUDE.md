# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Backend (port 3001) — run from checkwa/backend/
npm install
npm run dev        # nodemon-watched; restarts on .js/.json changes

# Frontend (port 3000) — run from checkwa/frontend/
npm install
npm run dev        # Next.js dev server
npm run build      # production build
```

Both servers must run simultaneously. There is no test suite.

## Architecture

CheckWA is a WhatsApp number validator with two independent validation engines behind a shared Express + Socket.io backend and a Next.js frontend.

### Dual-Engine Design

**Mode A — Scraping Engine** (`backend/engines/scrapingEngine.js`)
- Launches a headless Chrome via `whatsapp-web.js` + Puppeteer
- Auth state persisted to `backend/.wwebjs_auth/session-checkwa-session/` via `LocalAuth`
- The frontend sends `init_scraping` over Socket.io → `scrapingEngine.initClient(io)` → Chrome starts and emits `qr` until scanned
- An `initializing` flag prevents double-init if two sockets fire `init_scraping` simultaneously
- `destroyClient()` is called in the server shutdown handler to kill Chrome before process exit — critical for nodemon restarts (leaving Chrome alive causes "browser already running" on next start)
- Sequential validation: one `client.isRegisteredUser(jid)` call per number with a randomised delay and periodic cooldown breaks between each

**Mode B — WABA Engine** (`backend/engines/wabaEngine.js`)
- Calls Meta Graph API `POST /v18.0/{phoneNumberId}/contacts` in 50-number batches
- WABA credentials (phoneNumberId, accessToken) are submitted once at `/upload` time, stored server-side in the job object, and cleared from the job immediately after being passed to the engine (never round-tripped)

### Job Lifecycle

```
POST /upload  →  job created (status: pending)  →  POST /validate  →  status: running
→  engine runs async, emitting Socket.io progress/log events  →  status: done | error
→  GET /export/:jobId  →  CSV of valid numbers only
```

Jobs live only in memory (`server.js` `jobs` object). They are pruned 30 minutes after completion. A DB migration exists at `backend/migrations/001_initial_schema.sql` but is not yet wired up.

### Socket.io Event Contract

| Direction | Event | Payload |
|-----------|-------|---------|
| server → client | `qr` | QR data URL string |
| server → client | `client_ready` | boolean |
| server → client | `log` | `{ text, type: 'info'\|'success'\|'error'\|'warn' }` |
| server → client | `progress` | `{ jobId, verified, invalid, pending, total, current }` |
| server → client | `validation_done` | `{ jobId }` |
| client → server | `init_scraping` | — |

Events are scoped to the requesting socket via `io.to(socketId).emit()` to prevent PII leaking to other connected clients.

### Anti-Ban Rate Limiting (`backend/utils/delays.js`)

Shared utilities used by both engines:
- `randomDelay(min, max)` — uniform random pause; replaces fixed delays to avoid bot-fingerprint timing
- `exponentialBackoff(attempt, base, max)` — doubles delay each retry with ±20% jitter

Scraping engine behaviour (all configurable via env vars — see `backend/.env.example`):
- Inter-request delay: random 1.5s–4s instead of fixed 2s
- Cooldown break every 50 numbers (~15–30s pause with socket log)
- Session cap of 300 lookups per WhatsApp session; resets on reconnect
- Per-number retry with exponential backoff (up to 3 retries)

WABA engine behaviour:
- Random 0.8s–2s delay between 50-number batches
- Automatic 429 retry with `Retry-After` header respect (defaults to 60s)
- Exponential backoff on consecutive batch failures before aborting

### Key Env Vars

**backend/.env** (copy from `backend/.env.example`)
```
PORT=3001
ALLOWED_ORIGIN=http://localhost:3000
NODE_ENV=development
API_KEY=<hex string>
# Anti-ban timing — see backend/.env.example for all values and safe ranges
```

**frontend/.env.local** (copy from `frontend/.env.example`)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_KEY=<same key>
```

### HTTP Rate Limits (`server.js`)

- `POST /upload` — 30 requests / 15 min per IP
- `POST /validate` — 20 requests / 15 min per IP
- `GET /health` — no auth, no rate limit (for uptime monitors)

All other endpoints require `x-api-key` header. Socket.io connections require `socket.handshake.auth.apiKey` when `API_KEY` is set.
