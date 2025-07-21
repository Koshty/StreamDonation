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

router.post('/test', (req, res) => {
  const io = req.app.get('io');
  const { username = 'Anonymous', message = '', imageUrl, streamer = 'default' } = req.body;

  const configPath = path.join(__dirname, '../configs', `${streamer}.json`);
  let config = { defaultImageUrl: '', allowGifs: true };

  if (fs.existsSync(configPath)) {
    config = require(configPath);
  }

  let finalImageUrl = imageUrl?.trim();

  // If GIFs are not allowed, ignore submitted image and use default
  if (!config.allowGifs) {
    finalImageUrl = config.defaultImageUrl;
  } else {
    // If GIFs are allowed, but submitted image is not a GIPHY URL, reject
    if (finalImageUrl && !isGiphyUrl(finalImageUrl)) {
      return res.status(400).json({ success: false, error: 'Invalid or disallowed image.' });
    }
  }

  // Fallback to default if nothing valid was provided
  if (!finalImageUrl) {
    finalImageUrl = config.defaultImageUrl;
  }

  const donation = { username, message, imageUrl: finalImageUrl };
  io.emit('new-donation', donation);
  res.status(200).json({ success: true, emitted: donation });
});

module.exports = router;
