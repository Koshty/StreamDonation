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

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  res.json(config);
});

module.exports = router;
