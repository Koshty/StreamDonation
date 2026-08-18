const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const Streamer = require('../models/Streamer');
const Donation = require('../models/Donation');
const BannedDonor = require('../models/BannedDonor');
const authMiddleware = require('../middleware/authMiddleware');
const { signDonorToken } = require('../Utils/donorToken');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client();

// POST /api/google/verify — verify a Google Sign-In ID token, check bans, mint a donor token
router.post('/verify', async (req, res) => {
  try {
    const { credential, streamer } = req.body;
    if (!credential || !streamer) {
      return res.status(400).json({ success: false, error: 'Missing credential or streamer.' });
    }
    if (!GOOGLE_CLIENT_ID) {
      console.error('[GOOGLE /verify] GOOGLE_CLIENT_ID not configured');
      return res.status(500).json({ success: false, error: 'Google sign-in is not configured on this server.' });
    }

    const streamerDoc = await Streamer.findOne({ username: streamer });
    if (!streamerDoc) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }

    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch (err) {
      console.warn('[GOOGLE /verify] Invalid ID token:', err.message);
      return res.status(401).json({ success: false, error: 'Google sign-in failed. Please try again.' });
    }

    const googleId = payload.sub;
    const name = payload.name || 'Anonymous';
    const picture = payload.picture || '';

    const banned = await BannedDonor.findOne({ streamerToken: streamerDoc.overlayToken, googleId });
    if (banned) {
      return res.status(403).json({ success: false, error: 'You are not permitted to donate to this streamer.' });
    }

    const donorToken = signDonorToken({ googleId, name, picture, streamer: streamerDoc.username });

    res.json({ success: true, donorToken, name, picture });
  } catch (err) {
    console.error('[GOOGLE /verify ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/google/ban/:donationId — ban the donor behind a past donation
router.post('/ban/:donationId', authMiddleware, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.donationId);
    if (!donation || !donation.donorVerified || !donation.googleId) {
      return res.status(404).json({ success: false, error: 'No verified donor found for this donation.' });
    }

    const streamerDoc = await Streamer.findOne({ overlayToken: donation.streamerToken });
    if (!streamerDoc) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }
    if (req.user.username !== streamerDoc.username) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await BannedDonor.findOneAndUpdate(
      { streamerToken: streamerDoc.overlayToken, googleId: donation.googleId },
      { nameAtBan: donation.username, bannedAt: new Date() },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[GOOGLE /ban ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/google/banned/:streamer — list current bans
router.get('/banned/:streamer', authMiddleware, async (req, res) => {
  try {
    const { streamer } = req.params;
    if (req.user.username !== streamer) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const streamerDoc = await Streamer.findOne({ username: streamer });
    if (!streamerDoc) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }

    const banned = await BannedDonor.find({ streamerToken: streamerDoc.overlayToken }).sort({ bannedAt: -1 });
    res.json({ success: true, banned });
  } catch (err) {
    console.error('[GOOGLE /banned ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/google/banned/:id — unban
router.delete('/banned/:id', authMiddleware, async (req, res) => {
  try {
    const ban = await BannedDonor.findById(req.params.id);
    if (!ban) return res.status(404).json({ success: false, error: 'Not found' });

    const streamerDoc = await Streamer.findOne({ overlayToken: ban.streamerToken });
    if (!streamerDoc || req.user.username !== streamerDoc.username) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await BannedDonor.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[GOOGLE /banned DELETE ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
