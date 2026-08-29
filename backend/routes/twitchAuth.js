const express = require('express');
const router = express.Router();
const axios = require('axios');
const Streamer = require('../models/Streamer');
const BannedDonor = require('../models/BannedDonor');
const { signDonorToken } = require('../Utils/donorToken');

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Cached in-memory — App Access Tokens are long-lived (weeks), no need to refetch every call.
let cachedAppToken = null; // { token, expiresAt }

// Server-to-server token (client_credentials grant) used only for the public
// username lookup (pre-emptive banning) — never exposed to the frontend.
async function getAppAccessToken() {
  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 60000) {
    return cachedAppToken.token;
  }
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials'
  });
  const res = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const { access_token, expires_in } = res.data;
  cachedAppToken = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
}

// POST /api/twitch/verify — validate a Twitch user access token, check bans, mint a donor token
router.post('/verify', async (req, res) => {
  try {
    const { accessToken, streamer } = req.body;
    if (!accessToken || !streamer) {
      return res.status(400).json({ success: false, error: 'Missing accessToken or streamer.' });
    }
    if (!TWITCH_CLIENT_ID) {
      console.error('[TWITCH /verify] TWITCH_CLIENT_ID not configured');
      return res.status(500).json({ success: false, error: 'Twitch sign-in is not configured on this server.' });
    }

    const streamerDoc = await Streamer.findOne({ username: streamer });
    if (!streamerDoc) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }

    let validation;
    try {
      const validateRes = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      validation = validateRes.data;
    } catch (err) {
      console.warn('[TWITCH /verify] Token validation failed:', err.message);
      return res.status(401).json({ success: false, error: 'Twitch sign-in failed. Please try again.' });
    }

    // Reject tokens issued to a different app — the equivalent of Google ID tokens'
    // "audience" check, prevents a token from another Twitch app being replayed here.
    if (validation.client_id !== TWITCH_CLIENT_ID) {
      console.warn('[TWITCH /verify] Token client_id mismatch — possible token replay attempt');
      return res.status(401).json({ success: false, error: 'Twitch sign-in failed. Please try again.' });
    }

    const externalId = validation.user_id;
    let name = validation.login;
    let picture = '';

    try {
      const userRes = await axios.get('https://api.twitch.tv/helix/users', {
        headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID }
      });
      const user = userRes.data && userRes.data.data && userRes.data.data[0];
      if (user) {
        name = user.display_name || name;
        picture = user.profile_image_url || '';
      }
    } catch (err) {
      console.warn('[TWITCH /verify] Failed to fetch profile details, using login as name:', err.message);
    }

    const banned = await BannedDonor.findOne({ streamerToken: streamerDoc.overlayToken, platform: 'twitch', externalId });
    if (banned) {
      return res.status(403).json({ success: false, error: 'You are not permitted to donate to this streamer.' });
    }

    const donorToken = signDonorToken({ platform: 'twitch', externalId, name, picture, streamer: streamerDoc.username });

    res.json({ success: true, donorToken, name, picture });
  } catch (err) {
    console.error('[TWITCH /verify ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
module.exports.getAppAccessToken = getAppAccessToken;
