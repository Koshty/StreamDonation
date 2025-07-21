const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

router.get('/:streamer', (req, res) => {
  const { streamer } = req.params;
  const configPath = path.join(__dirname, '../configs', `${streamer}.json`);

  if (!fs.existsSync(configPath)) {
    return res.status(404).json({ error: 'Streamer config not found' });
  }

  const config = require(configPath);
  config.giphyKey = process.env.GIPHY_API_KEY;
  res.json(config);
});

module.exports = router;
