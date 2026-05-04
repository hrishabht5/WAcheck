# CheckWA — WhatsApp Number Validator

A premium SaaS tool for bulk WhatsApp number validation. Supports two independent engines: a scraping engine powered by `whatsapp-web.js` and an official Meta WABA API engine. Results stream to the browser in real time via Socket.io.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Engines](#engines)
- [CSV Format](#csv-format)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Development](#development)

---

## Architecture

```
Browser (Next.js :3000)
    │  HTTP REST (upload, validate, export)
    │  WebSocket (Socket.io — progress, logs, QR)
    ▼
Express Server (:3001)
    ├── scrapingEngine.js  ← whatsapp-web.js + Puppeteer/Chromium
    └── wabaEngine.js      ← Meta Graph API v18.0
```

**Data flow:**

1. User uploads a CSV → `POST /upload` parses and deduplicates numbers, returns a `jobId`.
2. User selects an engine and clicks **Start Validation** → `POST /validate` starts an async loop.
3. Per-number results stream to all connected sockets as `progress` and `log` events.
4. On completion, `validation_done` fires and the **Export** button activates.
5. `GET /export/:jobId` streams a CSV of valid numbers only.

Jobs are held in memory for the lifetime of the server process. Restart clears all jobs.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 18 | LTS recommended |
| npm | ≥ 9 | Included with Node.js |
| Chromium | auto | Downloaded by Puppeteer on first run (~150 MB) |
| WhatsApp account | — | Required for Mode A only |
| Meta WABA access | — | Required for Mode B only |

---

## Quick Start

```bash
# Clone / open the project
cd checkwa

# Terminal 1 — backend
cd backend
npm install
npm run dev        # http://localhost:3001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Open **http://localhost:3000** in your browser.

> **First run note:** Puppeteer downloads Chromium automatically on the first `npm run dev` in the backend. This takes 1–3 minutes depending on network speed. The terminal will appear to hang — that is normal.

---

## Configuration

### Backend

The backend reads one environment variable:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP/WebSocket server port |

Create `backend/.env` if you need to override:

```env
PORT=3001
```

### Frontend

The frontend hardcodes `http://localhost:3001` as the backend origin. To point at a different host, update two files:

- `frontend/lib/socket.ts` — Socket.io connection URL
- `frontend/components/UploadZone.tsx`, `ExportButton.tsx`, `app/page.tsx` — `fetch()` base URLs

For production, extract these into a `NEXT_PUBLIC_API_URL` environment variable.

---

## Engines

### Mode A — Scraping Engine

Uses `whatsapp-web.js` to drive a headless Chromium instance authenticated to your WhatsApp account.

**How it works:**
1. Click **Connect WhatsApp** in the dashboard header.
2. A QR code appears in a modal overlay.
3. Open WhatsApp on your phone → **Linked Devices** → **Link a Device** → scan.
4. The session is persisted in `.wwebjs_auth/` — subsequent runs skip the QR scan.
5. Each number lookup calls `client.isRegisteredUser(jid)` with a **2-second delay** between requests to avoid rate-limiting and account flags.

**Throughput:** ~30 numbers/minute (enforced by the 2-second delay).

**Risk:** Automated use of personal WhatsApp accounts can result in temporary or permanent bans. Use a dedicated account. The 2-second delay is the minimum safe interval.

### Mode B — WABA API Engine

Uses the official [Meta Business Platform API](https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers) `/contacts` endpoint.

**Required credentials:**
- **Phone Number ID** — from Meta for Developers → your app → WhatsApp → API Setup
- **Access Token** — a permanent system user token or a temporary test token

**How it works:**
Each number is sent to `POST https://graph.facebook.com/v18.0/{phoneNumberId}/contacts` with `blocking: "wait"`. The API responds synchronously with `status: "valid"` or `status: "invalid"`.

**Throughput:** Limited by Meta's API rate limits (varies by tier). No artificial delay is added.

---

## CSV Format

The parser scans **every cell in every row** of the uploaded file. Any cell that normalizes to a valid E.164 number is accepted. You do not need a specific column layout.

**Valid E.164 format:** `+` followed by 7–15 digits.

```
+14155551234
+447911123456
+919876543210
```

**Normalization applied before validation:**
- Whitespace, dashes `-`, parentheses `()`, and dots `.` are stripped.
- A leading `+` is added if absent.

**Duplicates** are silently removed. Each number appears once in the job.

**File size limit:** 10 MB.

---

## Project Structure

```
checkwa/
├── backend/
│   ├── server.js                 Express app, Socket.io, route definitions
│   ├── engines/
│   │   ├── scrapingEngine.js     whatsapp-web.js client lifecycle + validation loop
│   │   └── wabaEngine.js         Meta Graph API /contacts caller
│   └── utils/
│       └── csvProcessor.js       CSV parsing, E.164 normalization, deduplication
├── frontend/
│   ├── app/
│   │   ├── layout.tsx            Root layout, metadata, global CSS import
│   │   ├── page.tsx              Dashboard — state management and layout
│   │   └── globals.css           Glassmorphism CSS variables and utilities
│   ├── components/
│   │   ├── EngineSelector.tsx    Mode A/B toggle + WABA credential inputs
│   │   ├── QRModal.tsx           Fullscreen QR overlay (Socket.io driven)
│   │   ├── UploadZone.tsx        Drag-and-drop CSV uploader
│   │   ├── ProgressBar.tsx       3-segment animated progress bar
│   │   ├── TerminalLog.tsx       Auto-scrolling real-time log window
│   │   └── ExportButton.tsx      Downloads Cleaned_Numbers.csv
│   └── lib/
│       └── socket.ts             Singleton Socket.io client
├── docs/
│   ├── API.md                    HTTP and Socket.io reference
│   └── RUNBOOK.md                Operational runbook
├── CHANGELOG.md
├── SETUP.md
└── .gitignore
```

---

## API Reference

See [`docs/API.md`](docs/API.md) for the complete HTTP endpoint and Socket.io event reference.

---

## Development

```bash
# Backend — hot reload via nodemon
cd backend && npm run dev

# Frontend — Next.js dev server with Fast Refresh
cd frontend && npm run dev

# Frontend — type check (no emit)
cd frontend && npx tsc --noEmit

# Frontend — production build
cd frontend && npm run build
```

The `.wwebjs_auth/` directory stores the WhatsApp session. Delete it to force a new QR scan.
