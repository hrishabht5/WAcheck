# CheckWA API Reference

Backend base URL: `http://localhost:3001`
WebSocket endpoint: `ws://localhost:3001` (Socket.io)

---

## HTTP Endpoints

### POST `/upload`

Parse a CSV file and register a validation job.

**Request**

`Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `csv` | file | yes | UTF-8 encoded CSV. Max 10 MB. |

**Success — 200**

```json
{
  "jobId": "1717084800000",
  "count": 142,
  "preview": ["+14155551234", "+447911123456", "+919876543210"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | string | Opaque identifier. Pass to `/validate` and `/export`. Epoch ms timestamp. |
| `count` | number | Total deduplicated E.164 numbers extracted. |
| `preview` | string[] | First 5 numbers (for UI confirmation). |

**Errors**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | No file attached | `{ "error": "No CSV file uploaded" }` |
| 400 | No valid numbers found | `{ "error": "No valid E.164 phone numbers found in CSV" }` |
| 500 | CSV parse failure | `{ "error": "CSV parsing failed: <message>" }` |

---

### POST `/validate`

Start an asynchronous validation job. Returns immediately; per-number results are pushed via Socket.io.

**Request**

`Content-Type: application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | string | yes | ID returned by `/upload`. |
| `engine` | `"scraping"` \| `"waba"` | yes | Validation engine to use. |
| `phoneNumberId` | string | if `engine === "waba"` | Meta Phone Number ID. |
| `accessToken` | string | if `engine === "waba"` | Meta access token (Bearer). |

**Success — 200**

```json
{
  "message": "Validation started",
  "jobId": "1717084800000"
}
```

The response arrives before validation completes. Monitor `progress`, `log`, and `validation_done` socket events for real-time updates.

**Errors**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Unknown or expired `jobId` | `{ "error": "Invalid or expired jobId. Upload a CSV first." }` |
| 409 | Job already running | `{ "error": "Validation already running for this job." }` |

**Engine-specific errors** (emitted as socket `log` events, job status set to `"error"`):

- `engine === "waba"` with missing `phoneNumberId` or `accessToken`
- `engine === "scraping"` when the WhatsApp client is not connected

---

### GET `/export/:jobId`

Download a CSV of valid numbers for a completed job.

**Path parameter**

| Param | Description |
|-------|-------------|
| `jobId` | Job ID from `/upload`. |

**Success — 200**

```
Content-Type: text/csv
Content-Disposition: attachment; filename="Cleaned_Numbers.csv"

Phone Number
+14155551234
+919876543210
```

One number per line, header row `Phone Number`. Contains only entries with `status === "valid"`.

**Errors**

| Status | Condition | Body |
|--------|-----------|------|
| 404 | Job not found or status is not `"done"` | `{ "error": "Job not found or not complete." }` |

---

## Socket.io Events

All events broadcast to **all connected sockets** (`io.emit`), not only the initiating client.

The Socket.io server accepts connections from `http://localhost:3000`. CORS for other origins will fail by default.

---

### Client → Server

#### `init_scraping`

Trigger initialization of the whatsapp-web.js Puppeteer client. If the client is already ready, emits `client_ready: true` immediately without re-initializing.

**Payload:** none

**Side effects:**
- Starts Puppeteer and loads the WhatsApp Web session.
- On first run (no saved session), emits `qr` events until the code is scanned.
- Emits `client_ready: true` when authenticated.
- Emits `client_ready: false` if the client disconnects.

```js
socket.emit('init_scraping')
```

---

### Server → Client

#### `qr`

Emitted when the scraping engine generates a new QR code (before authentication, or if the session expires).

**Payload:** `string` — data URL (`data:image/png;base64,...`)

```js
socket.on('qr', (dataUrl) => {
  imgElement.src = dataUrl
})
```

---

#### `client_ready`

Emitted when the scraping engine's connection state changes.

**Payload:** `boolean`

| Value | Meaning |
|-------|---------|
| `true` | WhatsApp client authenticated and ready |
| `false` | Client disconnected |

```js
socket.on('client_ready', (ready) => {
  console.log(ready ? 'Connected' : 'Disconnected')
})
```

---

#### `log`

Emitted once per number checked and at key lifecycle events (job start, job complete, errors).

**Payload:**

```ts
{
  text: string   // Human-readable message
  type: 'success' | 'error' | 'info'
}
```

| `type` | Color convention | Example `text` |
|--------|-----------------|----------------|
| `success` | Emerald | `"Checking +14155551234... SUCCESS"` |
| `error` | Rose | `"Checking +14155551234... NOT FOUND"` |
| `info` | Indigo | `"Starting validation of 142 numbers via Scraping Engine"` |

```js
socket.on('log', ({ text, type }) => {
  appendToTerminal(text, type)
})
```

---

#### `progress`

Emitted after each number is processed. Use this to drive the progress bar.

**Payload:**

```ts
{
  jobId:    string   // The active job ID
  verified: number   // Count of valid numbers so far
  invalid:  number   // Count of invalid + error numbers so far
  pending:  number   // Numbers not yet processed (total - current)
  total:    number   // Total numbers in the job
  current:  number   // Numbers processed so far (verified + invalid)
}
```

Invariant: `verified + invalid + pending === total` at all times.

```js
socket.on('progress', ({ verified, invalid, pending, total, current }) => {
  const pct = Math.round((current / total) * 100)
  updateProgressBar(verified, invalid, pending, pct)
})
```

---

#### `validation_done`

Emitted once when the validation loop completes successfully.

**Payload:**

```ts
{
  jobId: string
}
```

After this event:
- `GET /export/:jobId` is available.
- The job's in-memory `status` is `"done"`.

```js
socket.on('validation_done', ({ jobId }) => {
  enableExportButton(jobId)
})
```

---

## Job State Machine

```
         POST /upload
              │
           "pending"
              │
         POST /validate
              │
           "running"  ──── error condition ──→  "error"
              │
     (validation loop completes)
              │
            "done"
              │
         GET /export/:jobId  →  CSV download
```

Jobs are never deleted during the server's lifetime. A job in `"error"` state cannot be restarted — upload the CSV again to get a new `jobId`.

---

## Result Object Schema

Each entry in `job.results` (used internally and serialized in the export):

```ts
// valid number (scraping engine)
{ number: string, status: 'valid' }

// valid number (WABA engine) — includes WhatsApp ID
{ number: string, status: 'valid', waId: string }

// number not on WhatsApp
{ number: string, status: 'invalid' }

// lookup threw an exception
{ number: string, status: 'error' }
```

Only `status === 'valid'` entries appear in the export CSV.
