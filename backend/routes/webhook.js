const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Donation = require('../models/Donation');
const Streamer = require('../models/Streamer');

function verifyHMAC(body, hmacFromQuery) {
  const keys = [
    "amount_cents", "created_at", "currency", "error_occured",
    "has_parent_transaction", "id", "integration_id", "is_3d_secure",
    "is_auth", "is_capture", "is_refunded", "is_standalone_payment",
    "is_voided", "order", "owner", "pending", "source_data_pan",
    "source_data_sub_type", "source_data_type", "success"
  ];

  const concat = keys.map(k => (body[k] ?? '')).join('');
  const calculatedHmac = crypto
    .createHmac('sha512', process.env.PAYMOB_HMAC)
    .update(concat)
    .digest('hex');

  return calculatedHmac === hmacFromQuery;
}

router.post('/paymob/webhook', async (req, res) => {
      console.log('📩 Incoming webhook payload:', JSON.stringify(req.body, null, 2));
  const hmac = req.query.hmac;
  const data = req.body;

  if (!verifyHMAC(data, hmac)) {
    console.warn('❌ Invalid HMAC — possible spoofed request');
    return res.status(403).send('Invalid HMAC');
  }

  const { success, amount_cents, billing_data } = data;

  if (success !== true && success !== 'true') {
    return res.status(400).json({ success: false, error: 'Payment failed or not completed' });
  }

  try {
    const amount = parseFloat(amount_cents) / 100;
    const username = billing_data?.first_name || 'Anonymous';
    const streamerUsername = billing_data?.extra?.streamer || 'default';

    const streamer = await Streamer.findOne({ username: streamerUsername });
    if (!streamer) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }

    const io = req.app.get('io');
    const donationBuffer = req.app.get('donationBuffer');

    const timestamp = Date.now();
    const newDonation = new Donation({
      streamerToken: streamer.overlayToken,
      username,
      amount,
      message: '', // Not passed from Paymob, you can leave blank
      imageUrl: streamer.defaultImageUrl,
      audioUrl: '',
      timestamp,
      shown: false,
    });

    await newDonation.save();

    const donation = {
      _id: newDonation._id,
      username,
      message: '',
      imageUrl: streamer.defaultImageUrl,
      delayed: streamer.paused,
      timestamp
    };

    if (!donationBuffer[streamer.username]) donationBuffer[streamer.username] = [];
    donationBuffer[streamer.username].push(donation);
    if (donationBuffer[streamer.username].length > 10) donationBuffer[streamer.username].shift();

    if (!streamer.paused) {
      io.to(streamer.overlayToken).emit('new-donation', donation);
    }

    console.log('✅ New Paymob donation emitted:', donation.username, amount);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

module.exports = router;
