const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client = null;
let clientReady = false;

function initClient(io) {
  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'checkwa-session' }),
    puppeteer: {
      headless: true,
      // On Windows, puppeteer downloads Chromium automatically on first run
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', async (qr) => {
    const dataUrl = await qrcode.toDataURL(qr);
    io.emit('qr', dataUrl);
    io.emit('log', { text: 'QR code generated — scan with WhatsApp', type: 'info' });
  });

  client.on('ready', () => {
    clientReady = true;
    io.emit('client_ready', true);
    io.emit('log', { text: 'WhatsApp client connected and ready', type: 'success' });
  });

  client.on('disconnected', () => {
    clientReady = false;
    io.emit('client_ready', false);
    io.emit('log', { text: 'WhatsApp client disconnected', type: 'error' });
  });

  client.initialize();
}

function isReady() {
  return clientReady;
}

async function validateNumbers(numbers, io, jobId) {
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

    try {
      // 2-second delay to prevent bans
      await new Promise((r) => setTimeout(r, 2000));

      // JID requires number without leading '+', e.g. "14155551234@c.us"
      const jid = num.replace(/^\+/, '') + '@c.us';
      const isRegistered = await client.isRegisteredUser(jid);

      if (isRegistered) {
        verified++;
        results.push({ number: num, status: 'valid' });
        io.emit('log', { text: `Checking ${num}... SUCCESS`, type: 'success' });
      } else {
        invalid++;
        results.push({ number: num, status: 'invalid' });
        io.emit('log', { text: `Checking ${num}... NOT FOUND`, type: 'error' });
      }
    } catch (err) {
      invalid++;
      results.push({ number: num, status: 'error' });
      io.emit('log', { text: `Checking ${num}... ERROR: ${err.message}`, type: 'error' });
    }

    io.emit('progress', { jobId, verified, invalid, pending, total, current: i + 1 });
  }

  return results;
}

module.exports = { initClient, isReady, validateNumbers };
