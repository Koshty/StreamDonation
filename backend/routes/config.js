// New version of routes/config.js using MongoDB
const express = require('express');
const router = express.Router();
const Streamer = require('../models/Streamer');

router.get('/:streamer', async (req, res) => {
  try {
    const user = await Streamer.findOne({ username: req.params.streamer });
    if (!user) return res.status(404).json({ error: 'Streamer not found' });

    res.json({
      paused: user.paused,
      defaultImageUrl: user.defaultImageUrl,
      allowGifs: user.allowGifs,
      donationMode: user.donationMode,
      requireVerifiedDonor: user.requireVerifiedDonor,
      authProvider: user.authProvider
    });
  } catch (err) {
    console.error('[CONFIG GET ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
