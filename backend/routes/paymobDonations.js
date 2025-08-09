const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getAuthToken, createOrder, generatePaymentKey } = require('../paymob');
const Streamer = require('../models/Streamer');
const Donation = require('../models/Donation');
const { getMatchedProfanities, normalize } = require('../Utils/profanity');

// ✅ POST /api/paymob/start — Start a Paymob donation
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
      extra: metadata
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

// ✅ GET /api/paymob/donate — HMAC verification and donation activation
router.get('/donate', async (req, res) => {
  console.log('📥 Response callback hit!');
  const q = req.query;

  const secret = process.env.PAYMOB_HMAC;
  const providedHmac = q.hmac;

  const orderedKeys = [
    'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
    'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
    'is_voided', 'order', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type', 'source_data.type',
    'success'
  ];

  const concatenatedString = orderedKeys.map(k => q[k] || '').join('');
  const calculatedHmac = crypto
    .createHmac('sha512', secret)
    .update(concatenatedString)
    .digest('hex');

  if (calculatedHmac !== providedHmac) {
    console.warn('❌ HMAC verification failed — deleting donation');

    try {
      const result = await Donation.findOneAndDelete({ paymobTxnId: q.id });
      if (result) {
        console.log('🗑️ Donation deleted due to invalid HMAC:', result._id);
      } else {
        console.log('⚠️ No donation found to delete');
      }
    } catch (err) {
      console.error('❌ Error while deleting donation:', err.message);
    }

    return res.status(403).send('❌ Invalid HMAC — donation rejected');
  }

  console.log('✅ HMAC verified successfully');

  const donation = await Donation.findOne({ paymobTxnId: q.id });
  if (!donation) {
    console.warn('⚠️ Verified but donation not found');
    return res.status(404).send('Donation not found');
  }

  const streamer = await Streamer.findOne({ overlayToken: donation.streamerToken });
  if (!streamer) {
    console.warn('❌ Streamer not found');
    return res.status(404).send('Streamer not found');
  }

  donation.pending = false;
  await donation.save();
  console.log('✅ Donation marked as not pending');

  const io = req.app.get('io');
  const buffer = req.app.get('donationBuffer');
  const addToQueue = req.app.get('addToQueue');

  const minimal = {
    _id: donation._id,
    username: donation.username,
    message: donation.message,
    imageUrl: donation.imageUrl || streamer.defaultImageUrl,
    delayed: streamer.paused,
    timestamp: donation.timestamp,
    amount: donation.amount,   
    isPaymob: true,           
    ...(donation.audioUrl ? { audioUrl: donation.audioUrl } : {})
  };

  if (!buffer[streamer.username]) buffer[streamer.username] = [];
  buffer[streamer.username].push(minimal);
  if (buffer[streamer.username].length > 10) buffer[streamer.username].shift();

  if (typeof addToQueue === 'function') {
    addToQueue(streamer.username, minimal);
    console.log('📤 Donation added to display queue');
  }

  if (!streamer.paused) {
    io.to(streamer.username).emit('new-donation', minimal);
    console.log('📢 Donation emitted');
  } else {
    console.log('⏸️ Stream is paused, donation buffered');
  }

  res.send('✅ Thanks for your donation!');
});

module.exports = router;
