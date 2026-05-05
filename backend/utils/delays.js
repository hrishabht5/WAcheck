function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

// attempt is 1-based: attempt 1 = base ms, attempt 2 = base*2, etc., capped at max
function exponentialBackoff(attempt, base = 2000, max = 30000) {
  const raw = Math.min(base * Math.pow(2, attempt - 1), max);
  const jitter = Math.random() * raw * 0.2;
  return new Promise((r) => setTimeout(r, Math.floor(raw + jitter)));
}

module.exports = { randomDelay, exponentialBackoff };
