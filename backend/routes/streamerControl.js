const express = require('express');
const router = express.Router();
const Streamer = require('../models/Streamer');
const authMiddleware = require('../middleware/authMiddleware');

// ✅ GET current config for control panel (from MongoDB)
router.get('/:streamer/config', authMiddleware, async (req, res) => {
  const { streamer } = req.params;

  if (req.user.username !== streamer) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user = await Streamer.findOne({ username: streamer });
    if (!user) return res.status(404).json({ error: 'Streamer not found' });

    res.json({
      paused: user.paused,
      defaultImageUrl: user.defaultImageUrl,
      allowGifs: user.allowGifs,
      allowTTS: user.allowTTS  ,
      freeMode: user.freeMode  ,
      instapayId: user.instapayId
    });
  } catch (err) {
    console.error('[GET CONFIG ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ POST to pause/resume donations (now with WebSocket broadcast)
router.post('/:streamer/pause', authMiddleware, async (req, res) => {
  const { streamer } = req.params;
  const { paused } = req.body;

  if (req.user.username !== streamer) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user = await Streamer.findOneAndUpdate(
      { username: streamer },
      { paused: !!paused },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Streamer not found' });

    const io = req.app.get('io');
    io.to(streamer).emit('pause-state-changed', { paused: user.paused });

    res.json({ success: true, paused: user.paused });
  } catch (err) {
    console.error('[PAUSE ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ POST to save image URL, allowGifs, allowTTS
router.post('/:streamer/settings', authMiddleware, async (req, res) => {
  const { streamer } = req.params;
  const { imageUrl, allowGifs, allowTTS,freeMode, instapayId } = req.body;

  if (req.user.username !== streamer) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user = await Streamer.findOneAndUpdate(
      { username: streamer },
      {
        defaultImageUrl: imageUrl,
        allowGifs: !!allowGifs,
        allowTTS: !!allowTTS ,
        freeMode: !!freeMode ,
        instapayId: (instapayId || '').trim()
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Streamer not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('[SETTINGS ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ GET overlay token for OBS/browser source
router.get('/:streamer/token', authMiddleware, async (req, res) => {
  const { streamer } = req.params;

  if (req.user.username !== streamer) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user = await Streamer.findOne({ username: streamer });
    if (!user) return res.status(404).json({ error: 'Streamer not found' });

    res.json({ success: true, overlayToken: user.overlayToken });
  } catch (err) {
    console.error('[TOKEN FETCH ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
