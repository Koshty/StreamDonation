const express = require('express');
const router = express.Router();
const axios = require('axios');
const Streamer = require('../models/Streamer');
const Donation = require('../models/Donation');
const BannedDonor = require('../models/BannedDonor');
const authMiddleware = require('../middleware/authMiddleware');
const { getAppAccessToken } = require('./twitchAuth');

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;

// POST /api/donors/ban/:donationId — ban the verified donor behind a past donation
router.post('/ban/:donationId', authMiddleware, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.donationId);
    if (!donation || !donation.donorVerified || !donation.donorPlatform) {
      return res.status(404).json({ success: false, error: 'No verified donor found for this donation.' });
    }

    const externalId = donation.donorPlatform === 'twitch' ? donation.twitchId : donation.googleId;
    if (!externalId) {
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
      { streamerToken: streamerDoc.overlayToken, platform: donation.donorPlatform, externalId },
      { nameAtBan: donation.username, bannedAt: new Date() },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[DONORS /ban ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/donors/ban-by-username/:streamer — pre-emptively ban a Twitch user who's never donated
router.post('/ban-by-username/:streamer', authMiddleware, async (req, res) => {
  try {
    const { streamer } = req.params;
    const { username } = req.body;

    if (req.user.username !== streamer) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }
    if (!TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
      return res.status(500).json({ success: false, error: 'Twitch is not configured on this server.' });
    }

    const streamerDoc = await Streamer.findOne({ username: streamer });
    if (!streamerDoc) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }

    const appToken = await getAppAccessToken();
    const lookupRes = await axios.get('https://api.twitch.tv/helix/users', {
      headers: { Authorization: `Bearer ${appToken}`, 'Client-Id': TWITCH_CLIENT_ID },
      params: { login: username.trim().toLowerCase() }
    });
    const user = lookupRes.data && lookupRes.data.data && lookupRes.data.data[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'No Twitch user found with that username.' });
    }

    await BannedDonor.findOneAndUpdate(
      { streamerToken: streamerDoc.overlayToken, platform: 'twitch', externalId: user.id },
      { nameAtBan: user.display_name, bannedAt: new Date() },
      { upsert: true }
    );

    res.json({ success: true, name: user.display_name });
  } catch (err) {
    console.error('[DONORS /ban-by-username ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/donors/banned/:streamer — list current bans
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
    console.error('[DONORS /banned ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/donors/banned/:id — unban
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
    console.error('[DONORS /banned DELETE ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
