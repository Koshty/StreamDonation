const express = require('express');
const router = express.Router();

// POST /api/donations/test
router.post('/test', (req, res) => {
  const io = req.app.get('io');

  // Example payload — you can change message or imageUrl as needed
  const testDonation = {
    username: req.body.username || 'Anonymous',
    message: req.body.message || 'بس بس',
    imageUrl: req.body.imageUrl || '', // can be a GIF or PNG link
  };

  // Emit to WebSocket clients
  io.emit('new-donation', testDonation);

  res.status(200).json({ success: true, emitted: testDonation });
});

module.exports = router;
