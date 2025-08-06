const express = require('express');
const router = express.Router();
const { getAuthToken, createOrder, generatePaymentKey } = require('../paymob');
const Streamer = require('../models/Streamer');
const { getMatchedProfanities, normalize } = require('../Utils/profanity');

router.post('/start', async (req, res) => {
  try {
    const {
      amount,
      username = 'Anonymous',
      message = '',
      imageUrl = '',
      streamer = 'default'
    } = req.body;

    console.log('[📥 /start] Incoming request:', { amount, username, message, imageUrl, streamer });

    const amountCents = Math.round(amount * 100);

    const badUsernameWords = getMatchedProfanities(normalize(username));
    const badMessageWords = getMatchedProfanities(normalize(message));

    if (badUsernameWords.length || badMessageWords.length) {
      const allBadWords = [...badUsernameWords, ...badMessageWords];
      const uniqueWords = [...new Set(allBadWords)].join(', ');
      console.warn('[🚫 Profanity Detected]', uniqueWords);
      return res.status(400).json({
        success: false,
        error: `❌ Profanity is not allowed. Blocked word(s): ${uniqueWords}`
      });
    }

    const user = await Streamer.findOne({ username: streamer });
    if (!user) {
      console.warn('[❌ Streamer not found]', streamer);
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }

    const token = await getAuthToken();

    // ✅ Send metadata (for webhook) when creating order
    const metadata = {
      streamer: user.username,
      message,
      imageUrl
    };
    const orderId = await createOrder(token, amountCents, metadata);
    console.log('[✅ Paymob Order Created]', { orderId });

    const billingData = {
      first_name: username || 'Anonymous',
      last_name: 'Donator',
      email: 'placeholder@example.com',
      phone_number: '01000000000',
      city: 'Cairo',
      country: 'EG',
      state: 'NA',
      street: 'Placeholder Street',
      building: '1',
      floor: '1',
      apartment: '1',
      postal_code: '12345',
      extra: metadata // 🔍 This is not used in webhook, just for record
    };

    console.log('[📤 Billing Data to Paymob]', billingData);

    const paymentToken = await generatePaymentKey(token, orderId, amountCents, username, billingData);
    console.log('[🔑 Payment Token Generated]');

    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;
    res.json({ success: true, url: iframeUrl });

  } catch (err) {
    console.error('[🔥 PAYMOB /start ERROR]', err.response?.data || err.message);
    res.status(500).json({ success: false, error: 'Payment init failed' });
  }
});

module.exports = router;
