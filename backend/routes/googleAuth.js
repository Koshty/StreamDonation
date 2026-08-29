const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const Streamer = require('../models/Streamer');
const BannedDonor = require('../models/BannedDonor');
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

    const externalId = payload.sub;
    const name = payload.name || 'Anonymous';
    const picture = payload.picture || '';

    const banned = await BannedDonor.findOne({ streamerToken: streamerDoc.overlayToken, platform: 'google', externalId });
    if (banned) {
      return res.status(403).json({ success: false, error: 'You are not permitted to donate to this streamer.' });
    }

    const donorToken = signDonorToken({ platform: 'google', externalId, name, picture, streamer: streamerDoc.username });

    res.json({ success: true, donorToken, name, picture });
  } catch (err) {
    console.error('[GOOGLE /verify ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
