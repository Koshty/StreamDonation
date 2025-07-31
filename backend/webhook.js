const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { Donation } = require('../models/Donation');
const { io } = require('../socket'); // make sure you have this

function verifyHMAC(body, hmac) {
  const keys = [
    "amount_cents", "created_at", "currency", "error_occured",
    "has_parent_transaction", "id", "integration_id", "is_3d_secure",
    "is_auth", "is_capture", "is_refunded", "is_standalone_payment",
    "is_voided", "order", "owner", "pending", "source_data_pan",
    "source_data_sub_type", "source_data_type", "success"
  ];
  const concatenated = keys.map(k => body[k] ?? '').join('');
  const hash = crypto.createHmac('sha512', process.env.PAYMOB_HMAC).update(concatenated).digest('hex');
  return hash === hmac;
}

router.post('/paymob-callback', async (req, res) => {
  const body = req.body;
  const hmac = req.query.hmac;

  if (!verifyHMAC(body, hmac)) {
    return res.status(403).send('Invalid HMAC');
  }

  if (body.success !== 'true') return res.sendStatus(400);

  const amount = body.amount_cents / 100;
  const name = body.billing_data?.first_name || 'Anonymous';
  const message = ''; // You can’t pass a message through Paymob unless added via `billing_data.extra`
  const streamer = 'default'; // Or resolve from your form session / extra field

  const donation = new Donation({ name, amount, message, streamer, timestamp: new Date() });
  await donation.save();

  io.to(streamer).emit('newDonation', donation);
  res.sendStatus(200);
});

module.exports = router;
