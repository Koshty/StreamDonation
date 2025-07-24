const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Streamer = require('../models/Streamer');
const Donation = require('../models/Donation');
const leoProfanity = require('leo-profanity');

// ✅ Load built-in English list
leoProfanity.loadDictionary();

// ✅ Load Arabic profanity words (optional)
try {
  const arabicWords = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../Utils/arabic.json'), 'utf-8')
  );
  leoProfanity.add(arabicWords.words);
} catch (err) {
  console.warn('⚠️ Arabic wordlist not loaded:', err.message);
}

// ✅ Normalize Arabic/English input
function normalizeProfanityInput(text) {
  return text
    .replace(/[\u064B-\u0652]/g, '')     // Remove diacritics
    .replace(/ـ+/g, '')                  // Remove tatweel
    .replace(/\s+/g, '')                 // Remove spaces
    .replace(/[^\u0621-\u064Aa-zA-Z]/g, '') // Remove symbols
    .replace(/(.)\1{2,}/g, '$1')         // Collapse repeated letters
    .normalize('NFC');
}

// ✅ Manual "contains-style" profanity match
function containsProfanity(text) {
  const badWords = leoProfanity.list();
  return badWords.some(word => text.includes(word));
}

// In-memory queue and timestamps
const donationQueue = {}; // streamer -> [donation]
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
    donationQueue[streamer].shift(); // remove oldest
  }
}

// ✅ POST /api/donations/test
router.post('/test', async (req, res) => {
  const io = req.app.get('io');
  const { username = 'Anonymous', message = '', imageUrl, streamer = 'default' } = req.body;

  const cleanUsername = normalizeProfanityInput(username);
  const cleanMessage = normalizeProfanityInput(message);

  if (containsProfanity(cleanUsername) || containsProfanity(cleanMessage)) {
    return res.status(400).json({
      success: false,
      error: '❌ Profanity is not allowed in username or message.',
    });
  }

  try {
    const user = await Streamer.findOne({ username: streamer });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }

    let finalImageUrl = imageUrl?.trim();

    if (!user.allowGifs) {
      finalImageUrl = user.defaultImageUrl;
    } else if (finalImageUrl && !isGiphyUrl(finalImageUrl) && !user.defaultImageUrl) {
      return res.status(400).json({ success: false, error: 'Invalid or disallowed image.' });
    }

    if (!finalImageUrl) {
      finalImageUrl = user.defaultImageUrl;
    }

    const timestamp = Date.now();

    // ✅ Save to MongoDB
    const newDonation = new Donation({
      streamerToken: user.overlayToken,
      username,
      amount: 0, // You can change this if needed
      message,
      imageUrl: finalImageUrl, // ✅ ADD THIS
      timestamp,
      shown: false
    });

    await newDonation.save();

    const donation = {
      _id: newDonation._id,
      username,
      message,
      imageUrl: finalImageUrl,
      delayed: user.paused,
      timestamp
    };

    // ✅ Push to in-memory queue
    addToQueue(streamer, donation);

    // ✅ Update last shown timestamp if not paused
    if (!user.paused) {
      lastShownTimestamps[streamer] = timestamp;
    }

    // ✅ Emit to overlay
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

// ✅ GET /api/donations/replay/:streamer
router.get('/replay/:streamer', (req, res) => {
  const streamer = req.params.streamer || 'default';
  const since = lastShownTimestamps[streamer] || 0;
  const list = (donationQueue[streamer] || []).filter(d => d.timestamp > since && !d.shown);
  res.json({ success: true, queue: list });
});

// ✅ GET /api/donations/resolve/:username
router.get('/resolve/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const streamer = await Streamer.findOne({ username });
    if (!streamer) {
      return res.status(404).json({ success: false, error: 'Streamer not found' });
    }
    res.json({ success: true, overlayToken: streamer.overlayToken });
  } catch (err) {
    console.error('[Donation Resolve Error]', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ✅ GET /api/donations/history/:token
router.get('/history/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const donations = await Donation.find({ streamerToken: token })
      .sort({ timestamp: -1 })
      .limit(50); // or paginate later

    res.json({ success: true, donations });
  } catch (err) {
    console.error('[Donation History Error]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch donation history' });
  }
});

// ✅ DELETE /api/donations/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Donation.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Donation not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Donation Delete Error]', err);
    res.status(500).json({ success: false, error: 'Failed to delete donation' });
  }
});

// ✅ POST /api/donations/mark-shown/:id
router.post('/mark-shown/:id', async (req, res) => {
  try {
    const updated = await Donation.findByIdAndUpdate(
      req.params.id,
      { shown: true },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Donation not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Mark as Shown Error]', err);
    res.status(500).json({ success: false, error: 'Failed to mark donation as shown' });
  }
});

module.exports = router;
