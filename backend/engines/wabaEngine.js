const axios = require('axios');

async function validateNumbers(numbers, phoneNumberId, accessToken, io, jobId) {
  const results = [];
  const total = numbers.length;
  let verified = 0;
  let invalid = 0;

  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i];
    const pending = total - i - 1;

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/contacts`,
        {
          blocking: 'wait',
          contacts: [num],
          force_check: false,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const contact = response.data?.contacts?.[0];
      const isValid = contact?.status === 'valid';

      if (isValid) {
        verified++;
        results.push({ number: num, status: 'valid', waId: contact.wa_id });
        io.emit('log', { text: `Checking ${num}... SUCCESS (wa_id: ${contact.wa_id})`, type: 'success' });
      } else {
        invalid++;
        results.push({ number: num, status: 'invalid' });
        io.emit('log', { text: `Checking ${num}... INVALID`, type: 'error' });
      }
    } catch (err) {
      invalid++;
      const errMsg = err.response?.data?.error?.message || err.message;
      results.push({ number: num, status: 'error' });
      io.emit('log', { text: `Checking ${num}... ERROR: ${errMsg}`, type: 'error' });
    }

    io.emit('progress', { jobId, verified, invalid, pending, total, current: i + 1 });
  }

  return results;
}

module.exports = { validateNumbers };
