const axios = require('axios');
const { randomDelay, exponentialBackoff } = require('../utils/delays');

const WABA_MIN_BATCH_DELAY_MS     = parseInt(process.env.WABA_MIN_BATCH_DELAY_MS,     10) || 800;
const WABA_MAX_BATCH_DELAY_MS     = parseInt(process.env.WABA_MAX_BATCH_DELAY_MS,     10) || 2000;
const WABA_MAX_CONSECUTIVE_ERRORS = parseInt(process.env.WABA_MAX_CONSECUTIVE_ERRORS, 10) || 5;
const WABA_RETRY_AFTER_DEFAULT_MS = parseInt(process.env.WABA_RETRY_AFTER_DEFAULT_MS, 10) || 60000;
const WABA_BACKOFF_BASE_MS        = parseInt(process.env.WABA_BACKOFF_BASE_MS,        10) || 3000;
const WABA_BACKOFF_MAX_MS         = parseInt(process.env.WABA_BACKOFF_MAX_MS,         10) || 60000;

async function validateNumbers(numbers, phoneNumberId, accessToken, emit, jobId) {
  if (!/^\d{1,20}$/.test(phoneNumberId)) {
    throw new Error('Invalid phoneNumberId format');
  }
  if (typeof accessToken !== 'string' || accessToken.length < 10 || accessToken.length > 512) {
    throw new Error('Invalid accessToken format');
  }

  const BATCH_SIZE = 50;

  const results = [];
  const total = numbers.length;
  let verified = 0;
  let invalid = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
    const batch = numbers.slice(i, Math.min(i + BATCH_SIZE, numbers.length));
    const batchLabel = `[${i + 1}–${i + batch.length}]`;

    if (i > 0) {
      await randomDelay(WABA_MIN_BATCH_DELAY_MS, WABA_MAX_BATCH_DELAY_MS);
    }

    let batchSucceeded = false;
    let retried429 = false;

    for (let attempt = 1; attempt <= WABA_MAX_CONSECUTIVE_ERRORS; attempt++) {
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

        batchSucceeded = true;
        break;

      } catch (err) {
        if (err.response?.status === 429 && !retried429) {
          retried429 = true;
          const retryAfterMs = err.response.headers?.['retry-after']
            ? parseInt(err.response.headers['retry-after'], 10) * 1000
            : WABA_RETRY_AFTER_DEFAULT_MS;
          emit('log', {
            text: `Batch ${batchLabel} rate-limited (429). Waiting ${Math.round(retryAfterMs / 1000)}s...`,
            type: 'warn',
          });
          await new Promise((r) => setTimeout(r, retryAfterMs));
          emit('log', { text: `Retrying batch ${batchLabel}.`, type: 'info' });
          continue;
        }

        consecutiveErrors++;
        const raw = err.response?.data?.error?.message || err.message || 'Unknown error';
        const safeMsg = raw.replace(/[A-Za-z0-9\-_.~+/]{20,}/g, '[REDACTED]');
        emit('log', {
          text: `Batch ${batchLabel} ERROR (attempt ${attempt}/${WABA_MAX_CONSECUTIVE_ERRORS}): ${safeMsg}`,
          type: 'error',
        });

        if (attempt < WABA_MAX_CONSECUTIVE_ERRORS) {
          await exponentialBackoff(attempt, WABA_BACKOFF_BASE_MS, WABA_BACKOFF_MAX_MS);
        }
      }
    }

    if (!batchSucceeded) {
      for (const num of batch) {
        invalid++;
        results.push({ number: num, status: 'error' });
      }
      emit('log', {
        text: `Batch ${batchLabel} failed after ${WABA_MAX_CONSECUTIVE_ERRORS} attempts.`,
        type: 'error',
      });

      if (consecutiveErrors >= WABA_MAX_CONSECUTIVE_ERRORS) {
        const remaining = numbers.slice(i + BATCH_SIZE);
        for (const num of remaining) {
          invalid++;
          results.push({ number: num, status: 'error' });
        }
        emit('log', {
          text: `Aborting: ${WABA_MAX_CONSECUTIVE_ERRORS} consecutive batch failures. Check credentials.`,
          type: 'error',
        });
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
