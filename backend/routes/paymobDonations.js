const express = require('express');
const router = express.Router();
const { getAuthToken, createOrder, generatePaymentKey } = require('../paymob');
const Streamer = require('../models/Streamer');
const leoProfanity = require('leo-profanity');

function normalize(text) {
  return text
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/ـ+/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\u0621-\u064Aa-zA-Z]/g, '')
    .replace(/(.)\1{2,}/g, '$1')
    .normalize('NFC');
}

function hasProfanity(text) {
  const normalized = normalize(text);
  return leoProfanity.list().some(word => new RegExp(`\\b${normalize(word)}\\b`, 'iu').test(normalized));
}

router.post('/start', async (req, res) => {
  try {
    const { amount, username = 'Anonymous', message = '', streamer = 'default' } = req.body;
    const amountCents = Math.round(amount * 100);

    if (hasProfanity(username) || hasProfanity(message)) {
      return res.status(400).json({ success: false, error: '❌ Profanity is not allowed.' });
    }

    const user = await Streamer.findOne({ username: streamer });
    if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });

    const token = await getAuthToken();
    const orderId = await createOrder(token, amountCents);
    const paymentToken = await generatePaymentKey(token, orderId, amountCents, username);

    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;
    res.json({ success: true, url: iframeUrl });
  } catch (err) {
    console.error('[PAYMOB /start ERROR]', err.response?.data || err.message);
    res.status(500).json({ success: false, error: 'Payment init failed' });
  }
});

module.exports = router;
