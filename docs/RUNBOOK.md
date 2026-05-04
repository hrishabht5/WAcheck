# CheckWA Operational Runbook

This document covers common failure modes, diagnostic steps, and deployment procedures.

---

## Table of Contents

- [Starting the Services](#starting-the-services)
- [Stopping the Services](#stopping-the-services)
- [Common Issues — Backend](#common-issues--backend)
- [Common Issues — Frontend](#common-issues--frontend)
- [Common Issues — Mode A (Scraping Engine)](#common-issues--mode-a-scraping-engine)
- [Common Issues — Mode B (WABA API)](#common-issues--mode-b-waba-api)
- [Common Issues — CSV Processing](#common-issues--csv-processing)
- [Resetting State](#resetting-state)
- [Production Deployment](#production-deployment)

---

## Starting the Services

**Standard development start (two terminals):**

```bash
# Terminal 1
cd checkwa/backend && npm run dev

# Terminal 2
cd checkwa/frontend && npm run dev
```

**Verify both are up:**

```bash
curl http://localhost:3001/      # should return Cannot GET / (404 — expected, no root handler)
curl http://localhost:3000/      # Next.js HTML response
```

---

## Stopping the Services

`Ctrl+C` in each terminal. The WhatsApp client session is preserved in `.wwebjs_auth/` — no cleanup needed between restarts.

---

## Common Issues — Backend

### Port 3001 already in use

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3001`

**Fix:**

```bash
# Find and kill the process holding the port
npx kill-port 3001

# Or on Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

---

### `Cannot find module 'whatsapp-web.js'`

**Symptom:** Server crashes on startup with a module resolution error.

**Fix:** Dependencies are not installed.

```bash
cd checkwa/backend && npm install
```

---

### Jobs lost on server restart

**Symptom:** `POST /validate` returns `"Invalid or expired jobId"` after restarting the backend.

**Cause:** Jobs are stored in memory (`const jobs = {}`). Restarting the process clears all state.

**Fix:** Re-upload the CSV to obtain a new `jobId`. This is by design in v1.0 — persistent storage is planned.

---

### `CSV parsing failed`

**Symptom:** `POST /upload` returns 500 with `CSV parsing failed: <message>`.

**Cause:** The file is malformed, binary, or not valid UTF-8.

**Fix:** Open the file in a text editor and confirm it is plain-text CSV. Re-export from Excel/Sheets as UTF-8 CSV if needed.

---

## Common Issues — Frontend

### `Failed to fetch` on upload or validate

**Symptom:** Browser console shows `Failed to fetch http://localhost:3001/...`

**Cause:** Backend is not running, or running on a different port.

**Fix:**
1. Confirm the backend is running: `curl http://localhost:3001/`
2. Check `PORT` environment variable — if overridden, update the `fetch` URLs in:
   - `frontend/components/UploadZone.tsx`
   - `frontend/components/ExportButton.tsx`
   - `frontend/app/page.tsx`
3. Check browser DevTools → Network tab for the exact error code.

---

### Socket.io events not received

**Symptom:** Progress bar and terminal log never update after starting validation.

**Diagnostic steps:**

1. Open browser DevTools → Network → filter `WS`. Confirm a WebSocket connection to `localhost:3001` exists with status `101 Switching Protocols`.
2. If the WebSocket connection is missing, the Socket.io client is not connecting. Check `frontend/lib/socket.ts` for the correct URL.
3. If connected but no events arrive, confirm the backend is running the correct `server.js` (not a stale nodemon cache — restart it).

---

### TypeScript errors after editing

```bash
cd frontend && npx tsc --noEmit
```

Errors are printed with file and line number. The most common cause is an untyped Socket.io payload — add an explicit type annotation on the event handler.

---

## Common Issues — Mode A (Scraping Engine)

### Puppeteer / Chromium download hangs on first run

**Symptom:** `npm run dev` (backend) appears frozen for several minutes.

**Cause:** Puppeteer is downloading its bundled Chromium (~150 MB). This is expected on the first run.

**Fix:** Wait. The download completes silently. On subsequent runs, startup takes 5–10 seconds.

**If download fails (corporate proxy / firewall):**

```bash
# Set proxy before install
export HTTPS_PROXY=http://your-proxy:port
cd backend && npm install
```

---

### QR code appears but scanning does nothing

**Symptom:** QR modal shows a code, phone scan appears to succeed, but `client_ready` is never emitted.

**Cause:** Stale or corrupted session data in `.wwebjs_auth/`.

**Fix:** Delete the session directory and reconnect.

```bash
# From checkwa/backend/
rm -rf .wwebjs_auth
```

Restart the backend. A fresh QR will be generated.

---

### `WhatsApp client not ready` error during validation

**Symptom:** Terminal log shows `ERROR: WhatsApp client not connected. Scan QR first.`

**Cause:** The `init_scraping` socket event was not emitted before starting validation, or the client disconnected mid-session.

**Fix:**
1. Reload the browser page.
2. Click **Connect WhatsApp** again.
3. If the QR appears, re-scan. If `Client Connected` appears immediately, try starting validation again.

---

### All numbers return `NOT FOUND` in scraping mode

**Symptom:** Validation completes with 0 valid numbers for numbers that are known to be on WhatsApp.

**Cause:** The WhatsApp JID was incorrectly formatted. As of v1.0, this is fixed (the `+` prefix is stripped before appending `@c.us`). If this recurs, check `scrapingEngine.js` line 61.

**Verify the JID format:**

```js
// Correct: "14155551234@c.us"  ← no leading +
// Wrong:   "+14155551234@c.us" ← isRegisteredUser always returns false
const jid = num.replace(/^\+/, '') + '@c.us'
```

---

### WhatsApp account flagged / rate limited

**Symptom:** Numbers start returning errors or `isRegisteredUser` throws exceptions mid-job.

**Cause:** Too many lookups too fast. The 2-second delay is the minimum safe interval — sustained bulk validation can still attract attention.

**Mitigation:**
- Use a dedicated WhatsApp account, not a personal number.
- Increase the delay: in `scrapingEngine.js`, change `2000` to `3000` or higher.
- Split large CSVs into batches of ≤ 500 numbers per session.
- Stop validation immediately if errors begin appearing.

---

## Common Issues — Mode B (WABA API)

### `GraphMethodException` / `Invalid OAuth access token`

**Symptom:** Terminal log shows `ERROR: Invalid OAuth access token - Cannot parse access token`

**Fix:** The access token is expired or malformed. Generate a new one in Meta for Developers → your app → **Access Token** or through a system user.

---

### `(#131056) Contact check failed`

**Symptom:** Some or all numbers return errors with this Meta error code.

**Cause:** The phone number being checked is in a region not available to your WABA account, or the number format is wrong.

**Fix:** Confirm numbers are in E.164 with the correct country code. Check your WABA account's permitted regions in Meta Business Manager.

---

### All numbers return `INVALID` in WABA mode

**Symptom:** 0 valid results for numbers that are known to be on WhatsApp.

**Cause:** Wrong `phoneNumberId`. The Phone Number ID is a numeric string (e.g., `123456789012345`) — it is not the phone number itself.

**Fix:**
1. Go to Meta for Developers → your app → WhatsApp → API Setup.
2. Copy the **Phone Number ID** (not the display phone number).
3. Re-enter it in the WABA credential fields.

---

## Common Issues — CSV Processing

### Numbers are skipped / count is lower than expected

**Diagnostic steps:**

1. Confirm numbers include a country code: `+91XXXXXXXXXX`, not `91XXXXXXXXXX` or `XXXXXXXXXX`.
2. Confirm no alphabetic characters are mixed in (e.g., `+1 (415) 555-WORD`).
3. Run the normalizer manually to debug:

```js
// Paste into Node REPL
const { extractNumbers } = require('./backend/utils/csvProcessor')
const fs = require('fs')
const buf = fs.readFileSync('your-file.csv')
console.log(extractNumbers(buf))
```

The regex requires `+` followed by 7–15 digits. Numbers with fewer than 7 or more than 15 digits after the `+` are dropped.

---

### `No valid E.164 phone numbers found in CSV`

**Symptom:** `POST /upload` returns 400 with this message.

**Cause:** The file contains no cells that match E.164 after normalization.

**Checklist:**
- Is the file actually CSV (not `.xlsx` saved as `.csv`)? Open in Notepad/TextEdit to verify plain text.
- Do all numbers have a `+` country code prefix, or at least a leading digit sequence ≥ 7 digits?
- Is the file encoding UTF-8? (Re-export from Excel: **Save As** → **CSV UTF-8 (Comma delimited)**).

---

## Resetting State

| What to reset | How |
|---------------|-----|
| All jobs (upload + validate results) | Restart the backend process |
| WhatsApp session (force new QR) | `rm -rf backend/.wwebjs_auth/` then restart backend |
| Frontend UI state | Reload the browser tab |
| Puppeteer Chromium cache | `rm -rf backend/node_modules/.cache/` |

---

## Production Deployment

CheckWA v1.0 is designed for local use. The following is guidance for deploying to a VPS or container.

### Backend

1. **Environment:** Set `PORT` via environment variable. Default is `3001`.
2. **Process manager:** Use PM2 to keep the backend alive.

```bash
npm install -g pm2
cd checkwa/backend
pm2 start server.js --name checkwa-backend
pm2 save
pm2 startup
```

3. **CORS:** Update `server.js` lines 14 and 20 to replace `http://localhost:3000` with your production frontend origin.
4. **Chromium on Linux:** Add these apt packages before starting:

```bash
apt-get install -y \
  libgbm-dev libxkbcommon-x11-0 libgtk-3-0 libasound2 \
  libxrandr2 libxcomposite1 libxcursor1 libxdamage1 libxi6 libxtst6
```

5. **Reverse proxy (nginx):** Proxy both HTTP and WebSocket traffic to the backend port.

```nginx
location /socket.io/ {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}

location /upload { proxy_pass http://localhost:3001; }
location /validate { proxy_pass http://localhost:3001; }
location ~^/export/ { proxy_pass http://localhost:3001; }
```

### Frontend

Build and serve with Next.js standalone output or a static CDN.

```bash
cd checkwa/frontend
npm run build
npm run start   # Next.js production server on :3000
```

Set `NEXT_PUBLIC_API_URL` in `.env.production` and update all hardcoded `http://localhost:3001` references to use it before building.

### Persistence

For multi-user or long-running deployments, replace the in-memory `jobs` object in `server.js` with a Redis or SQLite-backed store. Jobs currently live only for the lifetime of the Node.js process.
