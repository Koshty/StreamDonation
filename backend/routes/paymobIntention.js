// backend/routes/paymobIntention.js
const express = require('express');
const router = express.Router();

const { createIntention } = require('../paymob'); // your updated helper
// If you have these utilities/models already, wire them in (optional)
let getMatchedProfanities, normalize, Streamer;
try {
  ({ getMatchedProfanities, normalize } = require('../Utils/profanity'));
  Streamer = require('../models/Streamer');
} catch { /* optional in case paths differ */ }

router.post('/intention/start', async (req, res) => {
  try {
    const {
      amount,               // number or string
      username = 'Anonymous',
      message = '',
      imageUrl = '',
      streamer              // streamer username if you use it
    } = req.body;

    // Basic validation
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    // Optional: profanity check (if your project uses it)
    if (getMatchedProfanities && normalize) {
      const bads = [
        ...getMatchedProfanities(normalize(username || '')),
        ...getMatchedProfanities(normalize(message || ''))
      ];
      if (bads.length) {
        return res.status(400).json({ success: false, error: `❌ Profanity: ${[...new Set(bads)].join(', ')}` });
      }
    }

    // Optional: ensure streamer exists (if you use it)
    let overlayToken;
    if (Streamer && streamer) {
      const s = await Streamer.findOne({ username: streamer });
      if (!s) return res.status(404).json({ success: false, error: 'Streamer not found' });
      overlayToken = s.overlayToken;
    }

    const amount_cents = Math.round(amountNum * 100);

    // Offer Card + Wallet in the same unified checkout
    const payment_methods = []
    if (process.env.PAYMOB_CARD_INTEGRATION_ID)   payment_methods.push(Number(process.env.PAYMOB_CARD_INTEGRATION_ID));
    if (process.env.PAYMOB_WALLET_INTEGRATION_ID) payment_methods.push(Number(process.env.PAYMOB_WALLET_INTEGRATION_ID));
    if (!payment_methods.length) {
      return res.status(500).json({ success: false, error: 'No Paymob integration IDs configured' });
    }

    // Minimal billing data (expand if you like)
    const billing_data = {
      first_name: username || 'Anonymous',
      last_name: '.',
      email: 'donor@example.com',
      phone_number: '01000000000',
      apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA',
      city: 'Cairo', country: 'EG', state: 'NA', postal_code: '00000'
    };

    // Pass useful context to Paymob (will be echoed in events)
    const extras = {
      streamer: streamer || 'default',
      overlayToken,
      donorMessage: message,
      donorImageUrl: imageUrl
    };

    const intention = await createIntention({
      amount_cents,
      currency: 'EGP',
      payment_methods,
      billing_data,
      items: [{ name: 'Donation', amount: amount_cents, quantity: 1, description: 'Stream donation' }],
      customer: {},
      extras
    });

    // Build Paymob Unified Checkout URL
    const url =
      `https://accept.paymob.com/unifiedcheckout/?publicKey=${process.env.PAYMOB_PUBLIC_KEY}` +
      `&clientSecret=${encodeURIComponent(intention.client_secret)}`;

    return res.json({
      success: true,
      url,
      intentionId: intention.id,
      status: intention.status // typically "intended"
    });
  } catch (err) {
    console.error('[🔥 /api/paymob/intention/start]', err?.response?.data || err.message);
    return res.status(500).json({ success: false, error: 'Failed to start intention checkout' });
  }
});

module.exports = router;
