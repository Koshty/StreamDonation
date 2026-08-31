const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Streamer = require('../models/Streamer');
const Donation = require('../models/Donation');
const BannedDonor = require('../models/BannedDonor');
const generateTTS = require('../Utils/generateTTS');
const { hasProfanity, getMatchedProfanities } = require('../Utils/profanity');
const { verifyDonorToken } = require('../Utils/donorToken');

const donationQueue = {};
const lastShownTimestamps = {};

function isGiphyUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('giphy.com') || u.hostname.includes('giphyusercontent.com');
  } catch {
    return false;
  }
}

function addToQueue(streamer, donation) {
  if (!donationQueue[streamer]) donationQueue[streamer] = [];
  donationQueue[streamer].push(donation);
  if (donationQueue[streamer].length > 10) donationQueue[streamer].shift();
}

router.post('/test', async (req, res) => {
  const io = req.app.get('io');
  let { username = '', message = '', imageUrl, streamer = 'default', donorToken } = req.body;

  username = username.trim();
  message = message.trim();

  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'You must provide a message in free mode.'
    });
  }

  const donorPayload = verifyDonorToken(donorToken);
  const verified = !!(donorPayload && donorPayload.streamer === streamer);

  if (verified) {
    username = donorPayload.name;
  } else if (!username) {
    username = 'Anonymous';
  }

  const badMessageWords = getMatchedProfanities(message);
  const badUsernameWords = verified ? [] : getMatchedProfanities(username);

  if (badUsernameWords.length || badMessageWords.length) {
    const allBadWords = [...badUsernameWords, ...badMessageWords];
    const uniqueWords = [...new Set(allBadWords)].join(', ');
    return res.status(400).json({
      success: false,
      error: `Profanity is not allowed. Blocked word(s): ${uniqueWords}`
    });
  }

  try {
    const user = await Streamer.findOne({ username: streamer });
    if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });

    if (user.donationMode === 'paid') {
      return res.status(400).json({
        success: false,
        error: 'This streamer requires a donation amount — use the amount field.'
      });
    }

    if (user.requireVerifiedDonor && !verified) {
      return res.status(400).json({
        success: false,
        error: 'This streamer requires verified sign-in to donate.'
      });
    }

    if (verified) {
      const banned = await BannedDonor.findOne({
        streamerToken: user.overlayToken,
        platform: donorPayload.platform,
        externalId: donorPayload.externalId
      });
      if (banned) {
        return res.status(403).json({ success: false, error: 'You are not permitted to donate to this streamer.' });
      }
    }

    let finalImageUrl = imageUrl?.trim();
    if (!user.allowGifs) {
      finalImageUrl = user.defaultImageUrl;
    } else if (finalImageUrl && !isGiphyUrl(finalImageUrl) && !user.defaultImageUrl) {
      return res.status(400).json({ success: false, error: 'Invalid or disallowed image.' });
    }
    if (!finalImageUrl) finalImageUrl = user.defaultImageUrl;

    const timestamp = Date.now();
    const newDonation = new Donation({
      streamerToken: user.overlayToken,
      username,
      amount: 0,
      message,
      imageUrl: finalImageUrl,
      timestamp,
      shown: false,
      ...(verified ? {
        donorVerified: true,
        donorPlatform: donorPayload.platform,
        ...(donorPayload.platform === 'twitch' ? { twitchId: donorPayload.externalId } : { googleId: donorPayload.externalId }),
        donorAvatarUrl: donorPayload.picture
      } : {})
    });

    await newDonation.save();

    let audioUrl = null;
    if (user.allowTTS && message) {
      try {
        audioUrl = await generateTTS({ username, message, isPaid: false, donationId: newDonation._id });
        if (audioUrl) {
          newDonation.audioUrl = audioUrl;
          await newDonation.save();
        }
      } catch (err) {
        console.warn('🛑 TTS generation failed:', err.message);
      }
    }

    const donation = {
      _id: newDonation._id,
      username,
      message,
      imageUrl: finalImageUrl,
      delayed: user.paused,
      timestamp,
      ...(audioUrl ? { audioUrl } : {}),
      ...(verified ? { donorVerified: true, donorPlatform: donorPayload.platform, donorAvatarUrl: donorPayload.picture } : {})
    };

    addToQueue(streamer, donation);

    io.to(streamer).emit('new-donation', donation);
    return res.status(200).json({
      success: true,
      emitted: donation,
      message: user.paused
        ? 'Message sent! (Will appear after stream resumes)'
        : 'Message sent!'
    });
  } catch (err) {
    console.error('[DONATION POST ERROR]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ✅ GET /api/donations/replay/:streamer
router.get('/replay/:streamer', async (req, res) => {
  try {
    const streamerUsername = req.params.streamer;
    const streamer = await Streamer.findOne({ username: streamerUsername });
    if (!streamer) {
      return res.status(404).json({ success: false, queue: [], error: 'Streamer not found' });
    }

    // Pull unseen donations from DB (oldest first so they play in order)
    const queue = await Donation.find({
      streamerToken: streamer.overlayToken,
      shown: false
    })
    .sort({ timestamp: 1 })
    .limit(50); // or whatever buffer size you like

    return res.json({ success: true, queue });
  } catch (err) {
    console.error('[Replay Error]', err);
    return res.status(500).json({ success: false, queue: [], error: 'Server error' });
  }
});


// ✅ GET /api/donations/resolve/:username
router.get('/resolve/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const streamer = await Streamer.findOne({ username });
    if (!streamer) return res.status(404).json({ success: false, error: 'Streamer not found' });
    res.json({ success: true, overlayToken: streamer.overlayToken });
  } catch (err) {
    console.error('[Donation Resolve Error]', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ✅ GET /api/donations/history/:token
router.get('/history/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { paid } = req.query;

    const query = { streamerToken: token };
    if (paid === 'true') query.isPaid = true;
    if (paid === 'false') query.isPaid = false;

    const donations = await Donation.find(query)
      .sort({ timestamp: -1 })
      .limit(50);

    res.json({ success: true, donations });
  } catch (err) {
    console.error('[Donation History Error]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch donation history' });
  }
});

// ✅ DELETE /api/donations/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Donation.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Donation not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Donation Delete Error]', err);
    res.status(500).json({ success: false, error: 'Failed to delete donation' });
  }
});

// ✅ POST /api/donations/mark-shown/:id
router.post('/mark-shown/:id', async (req, res) => {
  const io = req.app.get('io');
  const { id } = req.params;

  try {
    const donation = await Donation.findById(id);
    if (!donation) return res.status(404).json({ success: false, error: 'Not found' });

    donation.shown = true;
    await donation.save();

    if (donation.audioUrl && donation.audioUrl.startsWith('/audio/')) {
      const filename = donation.audioUrl.replace(/^\/audio\//, '');
      const filePath = path.join(__dirname, '../public/audio', filename);

      try {
        await fs.promises.access(filePath);
        await fs.promises.unlink(filePath);
        console.log('🗑️ Deleted TTS file:', filePath);
      } catch (deleteErr) {
        console.warn('⚠️ File deletion failed:', deleteErr.message);
      }
    }

    io.to(donation.streamerToken).emit('mark-shown-sync', donation._id);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error marking donation as shown:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ✅ DELETE /api/donations/clear-shown/:token
router.delete('/clear-shown/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const shownDonations = await Donation.find({ streamerToken: token, shown: true });

    for (const donation of shownDonations) {
      if (donation.audioUrl && donation.audioUrl.startsWith('/audio/')) {
        const filename = donation.audioUrl.replace(/^\/audio\//, '');
        const filePath = path.join(__dirname, '../public/audio', filename);
        try {
          await fs.promises.access(filePath);
          await fs.promises.unlink(filePath);
          console.log('🗑️ Deleted TTS file:', filePath);
        } catch (err) {
          console.warn('⚠️ Failed to delete file:', filePath, '-', err.message);
        }
      }
    }

    const result = await Donation.deleteMany({ streamerToken: token, shown: true });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('❌ Error deleting shown donations:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});


module.exports = router;
