# Changelog

All notable changes to CheckWA are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Persistent job storage (SQLite or Redis) to survive server restarts
- Rate-limit configuration via environment variable (`SCRAPING_DELAY_MS`)
- Multi-user session support (per-socket WhatsApp client instances)
- Webhook callback on `validation_done` for headless / CI use cases
- Country-code auto-prefix option for CSVs without `+` prefix

---

## [1.0.0] — 2026-05-04

Initial release.

### Added

**Backend**
- Express HTTP server on configurable port (default `3001`)
- Socket.io server with CORS scoped to `http://localhost:3000`
- `POST /upload` — multipart CSV ingestion, E.164 normalization, deduplication, in-memory job store
- `POST /validate` — async validation dispatcher; returns immediately, streams results via Socket.io
- `GET /export/:jobId` — streams `Cleaned_Numbers.csv` of valid numbers only
- `scrapingEngine.js` — `whatsapp-web.js` client with `LocalAuth` session persistence, QR-to-data-URL conversion, 2-second inter-request delay, correct JID formatting (`+` stripped before `@c.us`)
- `wabaEngine.js` — Meta Graph API v18.0 `/contacts` with `blocking: "wait"` for synchronous responses; surfaces `wa_id` on valid results
- `csvProcessor.js` — `csv-parse` integration, strips dashes/spaces/parens/dots, validates E.164 regex `^\+\d{7,15}$`, deduplicates via `Set`

**Socket.io events (server → client)**
- `qr` — QR code as PNG data URL
- `client_ready` — boolean connection state
- `log` — per-number and lifecycle log entries with `type: success | error | info`
- `progress` — `{ jobId, verified, invalid, pending, total, current }` after each number
- `validation_done` — `{ jobId }` on loop completion

**Socket.io events (client → server)**
- `init_scraping` — initialize or re-attach to the scraping client

**Frontend**
- Next.js 14 App Router with TypeScript
- Glassmorphism design system: `backdrop-filter: blur(16px)`, CSS custom properties, `.glass-card` and `.gradient-border` utilities
- `EngineSelector` — animated Mode A / Mode B toggle; WABA credential fields animate in on Mode B selection
- `QRModal` — fullscreen frosted-glass overlay, live QR image swap on each `qr` event, auto-dismiss on `client_ready`
- `UploadZone` — drag-and-drop CSV upload with `POST /upload`, visual state for idle / dragging / uploading / done
- `ProgressBar` — 3-segment Framer Motion animated bar (emerald = verified, rose = invalid, indigo = pending); stat pills below
- `TerminalLog` — macOS-style terminal header, JetBrains Mono font, color-coded log entries, 200-entry rolling buffer, auto-scroll
- `ExportButton` — blob download via `URL.createObjectURL`, disabled until `validation_done`
- Singleton Socket.io client (`lib/socket.ts`) with WebSocket transport
- Connection status pill in header (pulsing dot for Mode A)
- Session-complete summary card with success rate percentage

**Tooling**
- `nodemon` for backend hot-reload in dev
- Tailwind CSS 3 + PostCSS + Autoprefixer
- TypeScript strict mode, zero type errors at ship

### Fixed
- `scrapingEngine`: strip `+` from E.164 numbers before appending `@c.us` to form the WhatsApp JID — without this, `isRegisteredUser` always returned `false`
- `QRModal`: stabilize `onConnected` prop with `useCallback` in parent to prevent `init_scraping` from being emitted on every parent re-render
