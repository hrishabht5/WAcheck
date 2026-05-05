const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

let client = null;
let clientReady = false;
let initializing = false;

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

    try {
      // 2-second delay to reduce ban risk
      await new Promise((r) => setTimeout(r, 2000));

      const jid = num.replace(/^\+/, '') + '@c.us';
      const isRegistered = await withTimeout(client.isRegisteredUser(jid), 10_000);

      if (isRegistered) {
        verified++;
        results.push({ number: num, status: 'valid' });
        emit('log', { text: `Checking ${num}... SUCCESS`, type: 'success' });
      } else {
        invalid++;
        results.push({ number: num, status: 'invalid' });
        emit('log', { text: `Checking ${num}... NOT FOUND`, type: 'error' });
      }
    } catch (err) {
      invalid++;
      results.push({ number: num, status: 'error' });
      emit('log', { text: `Checking ${num}... ERROR: ${err.message}`, type: 'error' });
    }

    emit('progress', { jobId, verified, invalid, pending, total, current: i + 1 });
  }

  return results;
}

module.exports = { initClient, isReady, validateNumbers, destroyClient };
