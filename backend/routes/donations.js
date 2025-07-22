const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

function isGiphyUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('giphy.com') || u.hostname.includes('giphyusercontent.com');
  } catch {
    return false;
  }
}

// In-memory queue to replay donations for reconnects
const donationQueue = {}; // streamer -> [donation, donation, ...]

// Save last donation timestamp per streamer to prevent replay duplicates
const lastShownTimestamps = {}; // streamer -> timestamp

function addToQueue(streamer, donation) {
  if (!donationQueue[streamer]) {
    donationQueue[streamer] = [];
  }
  donationQueue[streamer].push(donation);
  if (donationQueue[streamer].length > 10) {
    donationQueue[streamer].shift(); // remove oldest
  }
}

router.post('/test', (req, res) => {
  const io = req.app.get('io');
  const { username = 'Anonymous', message = '', imageUrl, streamer = 'default' } = req.body;

  const configPath = path.join(__dirname, '../configs', `${streamer}.json`);
  let config = { defaultImageUrl: '', allowGifs: true, paused: false };

  if (fs.existsSync(configPath)) {
    config = require(configPath);
  }

  let finalImageUrl = imageUrl?.trim();

  if (!config.allowGifs) {
    finalImageUrl = config.defaultImageUrl;
  } else if (finalImageUrl && !isGiphyUrl(finalImageUrl)) {
    return res.status(400).json({ success: false, error: 'Invalid or disallowed image.' });
  }

  if (!finalImageUrl) {
    finalImageUrl = config.defaultImageUrl;
  }

  const timestamp = Date.now();
  const donation = { username, message, imageUrl: finalImageUrl, delayed: config.paused, timestamp };

  // Save to queue
  addToQueue(streamer, donation);

  // Update last shown time only if not paused
  if (!config.paused) {
    lastShownTimestamps[streamer] = timestamp;
  }

  // Emit to all clients
  io.to(streamer).emit('new-donation', donation);

  return res.status(200).json({
    success: true,
    emitted: donation,
    message: config.paused
      ? '✅ Message sent! (Will appear after stream resumes)'
      : '✅ Message sent!',
  });
});

// Replay only unseen donations on reconnect
router.get('/replay/:streamer', (req, res) => {
  const streamer = req.params.streamer || 'default';
  const since = lastShownTimestamps[streamer] || 0;
  const list = (donationQueue[streamer] || []).filter(d => d.timestamp > since);
  res.json({ success: true, queue: list });
});

module.exports = router;
