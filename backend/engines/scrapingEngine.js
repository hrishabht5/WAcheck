const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { randomDelay, exponentialBackoff } = require('../utils/delays');

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

const SCRAPING_MIN_DELAY_MS    = parseInt(process.env.SCRAPING_MIN_DELAY_MS,    10) || 1500;
const SCRAPING_MAX_DELAY_MS    = parseInt(process.env.SCRAPING_MAX_DELAY_MS,    10) || 4000;
const SCRAPING_COOLDOWN_EVERY  = parseInt(process.env.SCRAPING_COOLDOWN_EVERY,  10) || 50;
const SCRAPING_COOLDOWN_MIN_MS = parseInt(process.env.SCRAPING_COOLDOWN_MIN_MS, 10) || 15000;
const SCRAPING_COOLDOWN_MAX_MS = parseInt(process.env.SCRAPING_COOLDOWN_MAX_MS, 10) || 30000;
const SCRAPING_SESSION_LIMIT   = parseInt(process.env.SCRAPING_SESSION_LIMIT,   10) || 300;
const SCRAPING_MAX_RETRIES     = parseInt(process.env.SCRAPING_MAX_RETRIES,     10) || 3;
const SCRAPING_BACKOFF_BASE_MS = parseInt(process.env.SCRAPING_BACKOFF_BASE_MS, 10) || 2000;
const SCRAPING_BACKOFF_MAX_MS  = parseInt(process.env.SCRAPING_BACKOFF_MAX_MS,  10) || 30000;

let client = null;
let clientReady = false;
let initializing = false;
let sessionCounter = 0;

async function destroyClient() {
  if (client) {
    try { await client.destroy(); } catch (_) {}
    client = null;
  }
  clientReady = false;
  initializing = false;
}

function initClient(io) {
  if (initializing) return;
  initializing = true;

  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'checkwa-session' }),
    puppeteer: {
      headless: true,
      args: [
        // --no-sandbox disables OS process isolation — only acceptable on local dev machines
        // In production, run as a non-root user or inside a container with proper namespaces
        ...(process.env.NODE_ENV !== 'production' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        '--disable-dev-shm-usage',
      ],
    },
  });

  client.on('qr', async (qr) => {
    const dataUrl = await qrcode.toDataURL(qr);
    io.emit('qr', dataUrl);
    io.emit('log', { text: 'QR code generated — scan with WhatsApp', type: 'info' });
  });

  client.on('ready', () => {
    sessionCounter = 0;
    initializing = false;
    clientReady = true;
    io.emit('client_ready', true);
    io.emit('log', { text: 'WhatsApp client connected and ready', type: 'success' });
  });

  client.on('disconnected', () => {
    initializing = false;
    clientReady = false;
    io.emit('client_ready', false);
    io.emit('log', { text: 'WhatsApp client disconnected', type: 'error' });
  });

  client.initialize();
}

function isReady() {
  return clientReady;
}

async function validateNumbers(numbers, emit, jobId) {
  if (!clientReady || !client) {
    throw new Error('WhatsApp client not ready. Please scan QR first.');
  }

  const results = [];
  const total = numbers.length;
  let verified = 0;
  let invalid = 0;

  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i];
    const pending = total - i - 1;

    if (!isReady()) {
      for (let j = i; j < numbers.length; j++) {
        invalid++;
        results.push({ number: numbers[j], status: 'error' });
      }
      emit('log', { text: 'WhatsApp client disconnected mid-job. Reconnect and retry.', type: 'error' });
      emit('progress', { jobId, verified, invalid, pending: 0, total, current: total });
      break;
    }

    if (sessionCounter >= SCRAPING_SESSION_LIMIT) {
      for (let j = i; j < numbers.length; j++) {
        invalid++;
        results.push({ number: numbers[j], status: 'error' });
      }
      emit('log', {
        text: `Session limit of ${SCRAPING_SESSION_LIMIT} lookups reached. Reconnect WhatsApp to reset.`,
        type: 'error',
      });
      emit('progress', { jobId, verified, invalid, pending: 0, total, current: total });
      break;
    }

    if (sessionCounter >= SCRAPING_SESSION_LIMIT - 10) {
      emit('log', {
        text: `Warning: ${sessionCounter}/${SCRAPING_SESSION_LIMIT} session lookups used.`,
        type: 'warn',
      });
    }

    let succeeded = false;
    let errorCount = 0;

    for (let attempt = 0; attempt <= SCRAPING_MAX_RETRIES; attempt++) {
      try {
        await randomDelay(SCRAPING_MIN_DELAY_MS, SCRAPING_MAX_DELAY_MS);

        const jid = num.replace(/^\+/, '') + '@c.us';
        const isRegistered = await withTimeout(client.isRegisteredUser(jid), 10_000);

        sessionCounter++;
        errorCount = 0;
        succeeded = true;

        if (isRegistered) {
          verified++;
          results.push({ number: num, status: 'valid' });
          emit('log', { text: `Checking ${num}... SUCCESS`, type: 'success' });
        } else {
          invalid++;
          results.push({ number: num, status: 'invalid' });
          emit('log', { text: `Checking ${num}... NOT FOUND`, type: 'error' });
        }
        break;

      } catch (err) {
        errorCount++;
        emit('log', {
          text: `Checking ${num}... ERROR (attempt ${attempt + 1}/${SCRAPING_MAX_RETRIES + 1}): ${err.message}`,
          type: 'error',
        });
        if (attempt < SCRAPING_MAX_RETRIES) {
          await exponentialBackoff(errorCount, SCRAPING_BACKOFF_BASE_MS, SCRAPING_BACKOFF_MAX_MS);
        }
      }
    }

    if (!succeeded) {
      invalid++;
      results.push({ number: num, status: 'error' });
      emit('log', { text: `Checking ${num}... FAILED after ${SCRAPING_MAX_RETRIES + 1} attempts`, type: 'error' });
    }

    emit('progress', { jobId, verified, invalid, pending, total, current: i + 1 });

    if ((i + 1) % SCRAPING_COOLDOWN_EVERY === 0 && i + 1 < total) {
      const approxSec = Math.round((SCRAPING_COOLDOWN_MIN_MS + SCRAPING_COOLDOWN_MAX_MS) / 2 / 1000);
      emit('log', {
        text: `Cooling down after ${i + 1} numbers (~${approxSec}s pause) to reduce ban risk...`,
        type: 'warn',
      });
      await randomDelay(SCRAPING_COOLDOWN_MIN_MS, SCRAPING_COOLDOWN_MAX_MS);
      emit('log', { text: 'Cooldown complete. Resuming.', type: 'info' });
    }
  }

  return results;
}

module.exports = { initClient, isReady, validateNumbers, destroyClient };
