const axios = require('axios');

async function validateNumbers(numbers, phoneNumberId, accessToken, emit, jobId) {
  // Reject phoneNumberId values that contain anything other than digits to prevent URL injection
  if (!/^\d{1,20}$/.test(phoneNumberId)) {
    throw new Error('Invalid phoneNumberId format');
  }
  if (typeof accessToken !== 'string' || accessToken.length < 10 || accessToken.length > 512) {
    throw new Error('Invalid accessToken format');
  }

  const BATCH_SIZE = 50;
  const MAX_CONSECUTIVE_ERRORS = 5;

  const results = [];
  const total = numbers.length;
  let verified = 0;
  let invalid = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
    const batch = numbers.slice(i, Math.min(i + BATCH_SIZE, numbers.length));

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/contacts`,
        { blocking: 'wait', contacts: batch, force_check: false },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      consecutiveErrors = 0;

      const contactMap = new Map((response.data?.contacts ?? []).map((c) => [c.input, c]));

      for (const num of batch) {
        const contact = contactMap.get(num);
        const isValid = contact?.status === 'valid';
        if (isValid) {
          verified++;
          results.push({ number: num, status: 'valid', waId: contact.wa_id });
          emit('log', { text: `Checking ${num}... SUCCESS (wa_id: ${contact.wa_id})`, type: 'success' });
        } else {
          invalid++;
          results.push({ number: num, status: 'invalid' });
          emit('log', { text: `Checking ${num}... INVALID`, type: 'error' });
        }
      }
    } catch (err) {
      consecutiveErrors++;
      const raw = err.response?.data?.error?.message || err.message || 'Unknown error';
      // Redact any long token-like strings before surfacing the error to the client
      const safeMsg = raw.replace(/[A-Za-z0-9\-_.~+/]{20,}/g, '[REDACTED]');

      for (const num of batch) {
        invalid++;
        results.push({ number: num, status: 'error' });
      }
      emit('log', { text: `Batch [${i + 1}–${i + batch.length}] ERROR: ${safeMsg}`, type: 'error' });

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        for (let j = i + BATCH_SIZE; j < numbers.length; j++) {
          invalid++;
          results.push({ number: numbers[j], status: 'error' });
        }
        emit('log', { text: `Aborting: ${MAX_CONSECUTIVE_ERRORS} consecutive batch failures.`, type: 'error' });
        emit('progress', { jobId, verified, invalid, pending: 0, total, current: total });
        break;
      }
    }

    const processed = Math.min(i + BATCH_SIZE, numbers.length);
    emit('progress', { jobId, verified, invalid, pending: total - processed, total, current: processed });
  }

  return results;
}

module.exports = { validateNumbers };
