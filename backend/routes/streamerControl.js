const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

function getConfigPath(streamer) {
  return path.join(__dirname, '../configs', `${streamer}.json`);
}

// GET current config for control panel
router.get('/:streamer/config', (req, res) => {
  const { streamer } = req.params;
  const configPath = getConfigPath(streamer);
  let config = {
    paused: false,
    defaultImageUrl: '',
    allowGifs: true,
  };

  if (fs.existsSync(configPath)) {
    try {
      config = { ...config, ...require(configPath) };
    } catch (err) {
      console.error('Error reading config:', err);
    }
  }

  res.json(config);
});

// POST to pause/resume donations
router.post('/:streamer/pause', (req, res) => {
  const { streamer } = req.params;
  const { paused } = req.body;
  const configPath = getConfigPath(streamer);

  let config = {};
  if (fs.existsSync(configPath)) {
    config = require(configPath);
  }

  config.paused = paused;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  res.json({ success: true, paused });
});

// 🔁 Combined save for image and allowGifs
router.post('/:streamer/settings', (req, res) => {
  const { streamer } = req.params;
  const { imageUrl, allowGifs } = req.body;

  const configPath = getConfigPath(streamer);
  let config = {};
  if (fs.existsSync(configPath)) {
    config = require(configPath);
  }

  config.defaultImageUrl = imageUrl;
  config.allowGifs = !!allowGifs;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

module.exports = router;
