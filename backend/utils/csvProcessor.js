const { parse } = require('csv-parse/sync');

function normalizeNumber(raw) {
  // Strip whitespace, dashes, parentheses, dots
  let num = String(raw).replace(/[\s\-().]/g, '');
  // Ensure leading +
  if (!num.startsWith('+')) {
    num = '+' + num;
  }
  return num;
}

function isValidE164(num) {
  // E.164: + followed by 7-15 digits
  return /^\+\d{7,15}$/.test(num);
}

function extractNumbers(buffer) {
  const content = buffer.toString('utf8');
  const records = parse(content, {
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const numbers = new Set();

  for (const row of records) {
    for (const cell of row) {
      const normalized = normalizeNumber(cell);
      if (isValidE164(normalized)) {
        numbers.add(normalized);
      }
    }
  }

  return Array.from(numbers);
}

module.exports = { extractNumbers };
