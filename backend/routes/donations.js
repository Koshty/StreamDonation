const express = require('express');
const router = express.Router();

// Optional: use your profanity filter module here
// const { profanity } = require('glin-profanity');

// Utility: Check if image URL is GIPHY
const isGiphyUrl = (url) => {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.endsWith('giphy.com') 
    );
  } catch (err) {
    return false;
  }
};

// POST /api/donations/test
router.post('/test', (req, res) => {
  const io = req.app.get('io');
  const { username = 'Anonymous', message = '', imageUrl = '' } = req.body;

  // ✅ Sanitize message if profanity filter is enabled
  // const cleanMessage = profanity.censor(message);

  // ✅ Enforce GIPHY-only for imageUrl
  if (imageUrl && !isGiphyUrl(imageUrl)) {
    return res.status(400).json({
      success: false,
      error: 'Only GIPHY-hosted images are allowed.',
    });
  }

  const testDonation = {
    username,
    message, // change to `cleanMessage` if using profanity filtering
    imageUrl,
  };

  // Broadcast to connected WebSocket clients
  io.emit('new-donation', testDonation);

  res.status(200).json({ success: true, emitted: testDonation });
});

module.exports = router;
