const express = require('express');
const router = express.Router();
const Streamer = require('../models/Streamer');
const Donation = require('../models/Donation');
const BannedDonor = require('../models/BannedDonor');
const authMiddleware = require('../middleware/authMiddleware');
const { getMatchedProfanities, normalize } = require('../Utils/profanity');
const { verifyDonorToken } = require('../Utils/donorToken');

const RESERVATION_WINDOW_MINUTES = Number(process.env.INSTAPAY_RESERVATION_WINDOW_MINUTES) || 25;

// Verified against a real CIB InstaPay credit SMS:
// "...تحويل لحظي بمبلغ 10.00 جم إلى حسابك..." — CIB's real wording is pure Arabic,
// no "EGP"/"credited" English keywords appear at all. The بمبلغ ("in the amount of")
// pattern below is the one that actually matches real messages; the English-keyword
// patterns are kept as a fallback in case of a different bank/wording, with a
// last-resort "first 2-decimal number in the text" as the final safety net.
const AMOUNT_REGEXES = [
  /بمبلغ\s*([\d,]+\.\d{2})/,
  /(?:credited|credit|received|deposit(?:ed)?)\D{0,20}?(?:egp\s*)?([\d,]+\.\d{2})/i,
  /([\d,]+\.\d{2})\s*egp\b/i,
  /egp\s*([\d,]+\.\d{2})/i,
  /([\d,]+\.\d{2})/ // last resort: first 2-decimal number anywhere in the text
];

function parseAmountFromSms(text) {
  for (const re of AMOUNT_REGEXES) {
    const m = text.match(re);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val)) return val;
    }
  }
  return null;
}

async function expireStaleReservations() {
  await Donation.updateMany(
    { paymentMethod: 'instapay', instapayStatus: 'reserved', expiresAt: { $lt: new Date() } },
    { instapayStatus: 'expired', pending: false }
  );
}

// Never suggests sending MORE than requested — only ever a smaller, unique amount.
async function reserveDonation({ requestedAmount, streamer, username, message, imageUrl, donorFields = {} }) {
  const requestedCents = Math.round(requestedAmount * 100);
  const maxReductionCents = Math.min(100, Math.max(10, Math.round(requestedCents * 0.02)));

  for (let pass = 0; pass < 2; pass++) {
    for (let deltaCents = 1; deltaCents <= maxReductionCents; deltaCents++) {
      const candidateCents = requestedCents - deltaCents;
      if (candidateCents <= 0) break;
      const candidateAmount = candidateCents / 100;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + RESERVATION_WINDOW_MINUTES * 60000);

      try {
        const donation = await new Donation({
          streamerToken: streamer.overlayToken,
          username,
          message,
          imageUrl,
          amount: candidateAmount,
          paymentMethod: 'instapay',
          instapayStatus: 'reserved',
          requestedAmount,
          reservedAmount: candidateAmount,
          reservedAt: now,
          expiresAt,
          pending: true,
          ...donorFields
        }).save();
        return donation;
      } catch (err) {
        if (err.code === 11000) continue; // amount taken by another pending reservation, try next
        throw err;
      }
    }
    // Band exhausted — sweep stale reservations once and retry the whole band once more.
    if (pass === 0) await expireStaleReservations();
  }

  const err = new Error('Reservation pool exhausted');
  err.code = 'POOL_EXHAUSTED';
  throw err;
}

function emitPaidDonation(req, donation, streamer) {
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
    isPaid: true,
    ...(donation.audioUrl ? { audioUrl: donation.audioUrl } : {}),
    ...(donation.donorVerified ? { donorVerified: true, donorAvatarUrl: donation.donorAvatarUrl } : {})
  };

  if (!buffer[streamer.username]) buffer[streamer.username] = [];
  buffer[streamer.username].push(minimal);
  if (buffer[streamer.username].length > 10) buffer[streamer.username].shift();

  if (typeof addToQueue === 'function') {
    addToQueue(streamer.username, minimal);
  }

  if (!streamer.paused) {
    io.to(streamer.username).emit('new-donation', minimal);
  }
}

// POST /api/instapay/start — reserve a unique, reduced amount for a pending donation
router.post('/start', async (req, res) => {
  try {
    const {
      amount,
      username = 'Anonymous',
      message = '',
      imageUrl = '',
      streamer = 'default',
      donorToken
    } = req.body;

    const requestedAmount = parseFloat(amount);
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount.' });
    }

    const donorPayload = verifyDonorToken(donorToken);
    const verified = !!(donorPayload && donorPayload.streamer === streamer);
    const finalUsername = verified ? donorPayload.name : (username || 'Anonymous');

    const badMessageWords = getMatchedProfanities(normalize(message));
    const badUsernameWords = verified ? [] : getMatchedProfanities(normalize(finalUsername));
    if (badUsernameWords.length || badMessageWords.length) {
      const allBadWords = [...badUsernameWords, ...badMessageWords];
      const uniqueWords = [...new Set(allBadWords)].join(', ');
      return res.status(400).json({
        success: false,
        error: `❌ Profanity is not allowed. Blocked word(s): ${uniqueWords}`
      });
    }

    const streamerDoc = await Streamer.findOne({ username: streamer });
    if (!streamerDoc) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }
    if (!streamerDoc.instapayId) {
      return res.status(400).json({ success: false, error: 'Streamer has not configured InstaPay yet.' });
    }
    if (streamerDoc.requireVerifiedDonor && !verified) {
      return res.status(400).json({
        success: false,
        error: '❌ This streamer requires verified Google sign-in to donate.'
      });
    }

    if (verified) {
      const banned = await BannedDonor.findOne({ streamerToken: streamerDoc.overlayToken, googleId: donorPayload.googleId });
      if (banned) {
        return res.status(403).json({ success: false, error: '❌ You are not permitted to donate to this streamer.' });
      }
    }

    let donation;
    try {
      donation = await reserveDonation({
        requestedAmount,
        streamer: streamerDoc,
        username: finalUsername,
        message,
        imageUrl,
        donorFields: verified
          ? { donorVerified: true, googleId: donorPayload.googleId, donorAvatarUrl: donorPayload.picture }
          : {}
      });
    } catch (err) {
      if (err.code === 'POOL_EXHAUSTED') {
        return res.status(503).json({
          success: false,
          error: 'Too many pending donations at this amount right now — please try again shortly or choose a different amount.'
        });
      }
      throw err;
    }

    res.json({
      success: true,
      donationId: donation._id,
      reservedAmount: donation.reservedAmount,
      requestedAmount: donation.requestedAmount,
      instapayId: streamerDoc.instapayId,
      expiresAt: donation.expiresAt
    });
  } catch (err) {
    console.error('[INSTAPAY /start ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Failed to start InstaPay donation.' });
  }
});

// POST /api/instapay/sms — SMS-forwarder webhook (shared-secret auth)
router.post('/sms', async (req, res) => {
  const { text, secret } = req.body || {};
  const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const providedSecret = headerToken || secret || '';

  if (!process.env.INSTAPAY_SMS_SECRET || providedSecret !== process.env.INSTAPAY_SMS_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!text || typeof text !== 'string') {
    return res.status(200).json({ success: false, reason: 'no_text' });
  }

  const parsedAmount = parseAmountFromSms(text);
  console.log('[📩 InstaPay SMS]', { text, parsedAmount });

  if (parsedAmount === null) {
    return res.status(200).json({ success: false, reason: 'unparseable' });
  }

  try {
    await expireStaleReservations();

    const donation = await Donation.findOne({
      paymentMethod: 'instapay',
      instapayStatus: 'reserved',
      reservedAmount: parsedAmount,
      expiresAt: { $gt: new Date() }
    }).sort({ reservedAt: 1 });

    if (!donation) {
      console.log('[InstaPay SMS] No pending reservation for amount', parsedAmount);
      return res.status(200).json({ success: false, reason: 'no_match' });
    }

    const streamerDoc = await Streamer.findOne({ overlayToken: donation.streamerToken });
    if (!streamerDoc) {
      return res.status(200).json({ success: false, reason: 'streamer_not_found' });
    }

    donation.instapayStatus = 'paid';
    donation.isPaid = true;
    donation.pending = false;
    donation.matchedAt = new Date();
    donation.matchedVia = 'sms';
    donation.smsRawText = text;
    await donation.save();

    emitPaidDonation(req, donation, streamerDoc);

    res.status(200).json({ success: true, donationId: donation._id });
  } catch (err) {
    console.error('[INSTAPAY /sms ERROR]', err.message);
    res.status(200).json({ success: false, reason: 'server_error' });
  }
});

// POST /api/instapay/confirm/:id — manual "mark as paid" from the control panel
router.post('/confirm/:id', authMiddleware, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation || donation.paymentMethod !== 'instapay') {
      return res.status(404).json({ success: false, error: 'Donation not found' });
    }

    const streamerDoc = await Streamer.findOne({ overlayToken: donation.streamerToken });
    if (!streamerDoc) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }
    if (req.user.username !== streamerDoc.username) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (donation.instapayStatus !== 'reserved') {
      return res.status(409).json({ success: false, error: `Donation already ${donation.instapayStatus}` });
    }

    donation.instapayStatus = 'paid';
    donation.isPaid = true;
    donation.pending = false;
    donation.matchedAt = new Date();
    donation.matchedVia = 'manual';
    await donation.save();

    emitPaidDonation(req, donation, streamerDoc);

    res.json({ success: true });
  } catch (err) {
    console.error('[INSTAPAY /confirm ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/instapay/pending/:streamer — list reservations awaiting payment
router.get('/pending/:streamer', authMiddleware, async (req, res) => {
  try {
    const { streamer } = req.params;
    if (req.user.username !== streamer) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const streamerDoc = await Streamer.findOne({ username: streamer });
    if (!streamerDoc) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }

    await expireStaleReservations();

    const donations = await Donation.find({
      streamerToken: streamerDoc.overlayToken,
      paymentMethod: 'instapay',
      instapayStatus: 'reserved'
    }).sort({ reservedAt: -1 });

    res.json({ success: true, donations });
  } catch (err) {
    console.error('[INSTAPAY /pending ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/instapay/status/:id — public polling endpoint for the donor's browser
router.get('/status/:id', async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id).select('instapayStatus expiresAt paymentMethod');
    if (!donation || donation.paymentMethod !== 'instapay') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true, status: donation.instapayStatus, expiresAt: donation.expiresAt });
  } catch (err) {
    console.error('[INSTAPAY /status ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
module.exports.expireStaleReservations = expireStaleReservations;
