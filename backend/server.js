const express = require('express');
const http = require('http');
const { randomUUID } = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { extractNumbers } = require('./utils/csvProcessor');
const scrapingEngine = require('./engines/scrapingEngine');
const wabaEngine = require('./engines/wabaEngine');

const app = express();
const httpServer = http.createServer(app);

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.warn('[WARN] API_KEY not set — endpoints are unprotected. Set API_KEY in .env before exposing to any network.');
}

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGIN, methods: ['GET', 'POST'] },
});

// Authenticate Socket.io connections when API_KEY is configured
io.use((socket, next) => {
  if (!API_KEY) return next();
  const key = socket.handshake.auth?.apiKey;
  if (key !== API_KEY) return next(new Error('Unauthorized'));
  next();
});

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const validateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// In-memory job store — keyed by jobId
const jobs = {};

// Prune completed/errored jobs older than 30 minutes to cap memory growth
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of Object.entries(jobs)) {
    if ((job.status === 'done' || job.status === 'error') && job.createdAt < cutoff) {
      delete jobs[id];
    }
  }
}, 5 * 60 * 1000);

// ARC-11: health endpoint — no auth required so load-balancers and uptime monitors can probe freely
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    whatsappReady: scrapingEngine.isReady(),
    jobs: Object.keys(jobs).length,
  });
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('init_scraping', () => {
    if (!scrapingEngine.isReady()) {
      scrapingEngine.initClient(io);
    } else {
      io.emit('client_ready', true);
      io.emit('log', { text: 'WhatsApp client already connected', type: 'info' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Upload CSV — WABA credentials bound to job here so they never travel in the validate call
app.post('/upload', uploadLimiter, requireApiKey, upload.single('csv'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded' });
  }
  try {
    const numbers = extractNumbers(req.file.buffer);
    if (numbers.length === 0) {
      return res.status(400).json({ error: 'No valid E.164 phone numbers found in CSV' });
    }
    const jobId = randomUUID();
    jobs[jobId] = {
      numbers,
      results: [],
      status: 'pending',
      createdAt: Date.now(),
      phoneNumberId: req.body.phoneNumberId || null,
      accessToken: req.body.accessToken || null,
    };
    res.json({ jobId, count: numbers.length, preview: numbers.slice(0, 5) });
  } catch (err) {
    console.error('[Upload error]', err);
    res.status(500).json({ error: 'CSV parsing failed. Check file format.' });
  }
});

// ARC-01: job-status endpoint — allows clients to recover state after reconnection
app.get('/jobs/:jobId', requireApiKey, (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found or expired.' });

  const verified = job.results.filter((r) => r.status === 'valid').length;
  const invalid  = job.results.filter((r) => r.status !== 'valid').length;

  res.json({
    jobId:   req.params.jobId,
    status:  job.status,
    total:   job.numbers.length,
    verified,
    invalid,
    pending: job.numbers.length - job.results.length,
  });
});

// Start validation — credentials come from the server-side job store, not the request body
app.post('/validate', validateLimiter, requireApiKey, async (req, res) => {
  const { jobId, engine, socketId } = req.body;

  // ARC-02: reject unknown engine values early
  if (!['waba', 'scraping'].includes(engine)) {
    return res.status(400).json({ error: "engine must be 'waba' or 'scraping'" });
  }

  if (!jobId || !jobs[jobId]) {
    return res.status(400).json({ error: 'Invalid or expired jobId. Upload a CSV first.' });
  }

  const job = jobs[jobId];
  if (job.status === 'running') {
    return res.status(409).json({ error: 'Validation already running for this job.' });
  }

  job.status = 'running';
  res.status(202).json({ message: 'Validation started', jobId }); // ARC-03: 202 for async work

  // Scope events to the requesting socket — prevents PII leaking to other connected clients
  const emit = (event, data) => {
    if (socketId) {
      io.to(socketId).emit(event, data);
    } else {
      io.emit(event, data);
    }
  };

  try {
    emit('log', { text: `Starting validation of ${job.numbers.length} numbers via ${engine === 'waba' ? 'WABA API' : 'Scraping Engine'}`, type: 'info' });

    let results;
    if (engine === 'waba') {
      const { phoneNumberId, accessToken } = job;
      // ARC-05: release credentials from the job object immediately — engine has its own copies
      job.phoneNumberId = null;
      job.accessToken   = null;
      if (!phoneNumberId || !accessToken) {
        emit('log', { text: 'ERROR: Phone Number ID and Access Token are required for WABA mode', type: 'error' });
        job.status = 'error';
        return;
      }
      results = await wabaEngine.validateNumbers(job.numbers, phoneNumberId, accessToken, emit, jobId);
    } else {
      if (!scrapingEngine.isReady()) {
        emit('log', { text: 'ERROR: WhatsApp client not connected. Scan QR first.', type: 'error' });
        job.status = 'error';
        return;
      }
      results = await scrapingEngine.validateNumbers(job.numbers, emit, jobId);
    }

    job.results = results;
    job.status = 'done';
    const validCount = results.filter((r) => r.status === 'valid').length;
    emit('log', { text: `Validation complete. ${validCount}/${results.length} valid numbers.`, type: 'success' });
    emit('validation_done', { jobId });
  } catch (err) {
    job.status = 'error';
    console.error(`[Job ${jobId} error]`, err);
    emit('log', { text: 'Validation failed due to an internal error.', type: 'error' });
  }
});

// Export valid numbers as CSV
app.get('/export/:jobId', requireApiKey, (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job || job.status !== 'done') {
    return res.status(404).json({ error: 'Job not found or not complete.' });
  }

  const valid = job.results.filter((r) => r.status === 'valid');
  const csv = 'Phone Number\n' + valid.map((r) => r.number).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="Cleaned_Numbers.csv"');
  res.send(csv);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`CheckWA backend running on http://localhost:${PORT}`);
});

// ARC-10: graceful shutdown — allow in-flight requests to complete before the process exits
async function shutdown(signal) {
  console.log(`[${signal}] Shutting down gracefully...`);
  await scrapingEngine.destroyClient();
  httpServer.close(() => {
    console.log('[shutdown] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
