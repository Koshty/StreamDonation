const express = require('express');
const router = express.Router();
const Streamer = require('../models/Streamer');

// In-memory queue to replay donations for reconnects
const donationQueue = {}; // streamer -> [donation, donation, ...]
const lastShownTimestamps = {}; // streamer -> timestamp

function isGiphyUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('giphy.com') || u.hostname.includes('giphyusercontent.com');
  } catch {
    return false;
  }
}

function addToQueue(streamer, donation) {
  if (!donationQueue[streamer]) {
    donationQueue[streamer] = [];
  }
  donationQueue[streamer].push(donation);
  if (donationQueue[streamer].length > 10) {
    donationQueue[streamer].shift(); // Remove oldest
  }
}

// POST /api/donations/test
router.post('/test', async (req, res) => {
  const io = req.app.get('io');
  const { username = 'Anonymous', message = '', imageUrl, streamer = 'default' } = req.body;

  try {
    const user = await Streamer.findOne({ username: streamer });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }

    let finalImageUrl = imageUrl?.trim();

    if (!user.allowGifs) {
      finalImageUrl = user.defaultImageUrl;
    } else if (finalImageUrl && !isGiphyUrl(finalImageUrl)) {
      return res.status(400).json({ success: false, error: 'Invalid or disallowed image.' });
    }

    if (!finalImageUrl) {
      finalImageUrl = user.defaultImageUrl;
    }

    const timestamp = Date.now();
    const donation = {
      username,
      message,
      imageUrl: finalImageUrl,
      delayed: user.paused,
      timestamp
    };

    addToQueue(streamer, donation);

    if (!user.paused) {
      lastShownTimestamps[streamer] = timestamp;
    }

    io.to(streamer).emit('new-donation', donation);

    return res.status(200).json({
      success: true,
      emitted: donation,
      message: user.paused
        ? '✅ Message sent! (Will appear after stream resumes)'
        : '✅ Message sent!',
    });

  } catch (err) {
    console.error('[DONATION POST ERROR]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/donations/replay/:streamer
router.get('/replay/:streamer', (req, res) => {
  const streamer = req.params.streamer || 'default';
  const since = lastShownTimestamps[streamer] || 0;
  const list = (donationQueue[streamer] || []).filter(d => d.timestamp > since);
  res.json({ success: true, queue: list });
});

module.exports = router;
