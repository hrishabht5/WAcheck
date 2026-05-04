const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { extractNumbers } = require('./utils/csvProcessor');
const scrapingEngine = require('./engines/scrapingEngine');
const wabaEngine = require('./engines/wabaEngine');

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// In-memory job store — keyed by jobId
const jobs = {};

// Initialize WhatsApp scraping client when a socket connects and requests it
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

// Upload CSV and extract numbers
app.post('/upload', upload.single('csv'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded' });
  }
  try {
    const numbers = extractNumbers(req.file.buffer);
    if (numbers.length === 0) {
      return res.status(400).json({ error: 'No valid E.164 phone numbers found in CSV' });
    }
    const jobId = Date.now().toString();
    jobs[jobId] = { numbers, results: [], status: 'pending' };
    res.json({ jobId, count: numbers.length, preview: numbers.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ error: `CSV parsing failed: ${err.message}` });
  }
});

// Start validation job
app.post('/validate', async (req, res) => {
  const { jobId, engine, phoneNumberId, accessToken } = req.body;

  if (!jobId || !jobs[jobId]) {
    return res.status(400).json({ error: 'Invalid or expired jobId. Upload a CSV first.' });
  }

  const job = jobs[jobId];
  if (job.status === 'running') {
    return res.status(409).json({ error: 'Validation already running for this job.' });
  }

  job.status = 'running';
  res.json({ message: 'Validation started', jobId });

  // Run validation asynchronously — push updates via Socket.io
  try {
    io.emit('log', { text: `Starting validation of ${job.numbers.length} numbers via ${engine === 'waba' ? 'WABA API' : 'Scraping Engine'}`, type: 'info' });

    let results;
    if (engine === 'waba') {
      if (!phoneNumberId || !accessToken) {
        io.emit('log', { text: 'ERROR: Phone Number ID and Access Token are required for WABA mode', type: 'error' });
        job.status = 'error';
        return;
      }
      results = await wabaEngine.validateNumbers(job.numbers, phoneNumberId, accessToken, io, jobId);
    } else {
      if (!scrapingEngine.isReady()) {
        io.emit('log', { text: 'ERROR: WhatsApp client not connected. Scan QR first.', type: 'error' });
        job.status = 'error';
        return;
      }
      results = await scrapingEngine.validateNumbers(job.numbers, io, jobId);
    }

    job.results = results;
    job.status = 'done';
    const validCount = results.filter((r) => r.status === 'valid').length;
    io.emit('log', { text: `Validation complete. ${validCount}/${results.length} valid numbers.`, type: 'success' });
    io.emit('validation_done', { jobId });
  } catch (err) {
    job.status = 'error';
    io.emit('log', { text: `Fatal error: ${err.message}`, type: 'error' });
  }
});

// Export valid numbers as CSV
app.get('/export/:jobId', (req, res) => {
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
