const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Streamer = require('../models/Streamer');
const Donation = require('../models/Donation');
const leoProfanity = require('leo-profanity');
const generateTTS = require('../Utils/generateTTS');

leoProfanity.loadDictionary();
try {
  const arabicWords = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../Utils/arabic.json'), 'utf-8')
  );
  leoProfanity.add(arabicWords.words);
} catch (err) {
  console.warn('⚠️ Arabic wordlist not loaded:', err.message);
}
leoProfanity.remove(['ass', 'bitch', 'sex', 'sexy']);

function normalizeProfanityInput(text) {
  return text
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/ـ+/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\u0621-\u064Aa-zA-Z]/g, '')
    .replace(/(.)\1{2,}/g, '$1')
    .normalize('NFC');
}

function getMatchedProfanities(text) {
  const badWords = leoProfanity.list();
  const normalizedText = normalizeProfanityInput(text);
  return badWords.filter(bad => {
    const normalizedBad = normalizeProfanityInput(bad);
    const pattern = new RegExp(`\\b${normalizedBad}\\b`, 'iu');
    return pattern.test(normalizedText);
  });
}

const donationQueue = {};
const lastShownTimestamps = {};

function isGiphyUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('giphy.com') || u.hostname.includes('giphyusercontent.com');
  } catch {
    return false;
  }
}

function addToQueue(streamer, donation) {
  if (!donationQueue[streamer]) donationQueue[streamer] = [];
  donationQueue[streamer].push(donation);
  if (donationQueue[streamer].length > 10) donationQueue[streamer].shift();
}

// ✅ POST /api/donations/test
router.post('/test', async (req, res) => {
  const io = req.app.get('io');
  const { username = 'Anonymous', message = '', imageUrl, streamer = 'default' } = req.body;

  const cleanUsername = normalizeProfanityInput(username);
  const cleanMessage = normalizeProfanityInput(message);

  const badUsernameWords = getMatchedProfanities(cleanUsername);
  const badMessageWords = getMatchedProfanities(cleanMessage);

  if (badUsernameWords.length || badMessageWords.length) {
    const allBadWords = [...badUsernameWords, ...badMessageWords];
    const uniqueWords = [...new Set(allBadWords)].join(', ');
    return res.status(400).json({
      success: false,
      error: `❌ Profanity is not allowed. Blocked word(s): ${uniqueWords}`
    });
  }

  try {
    const user = await Streamer.findOne({ username: streamer });
    if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });

    let finalImageUrl = imageUrl?.trim();
    if (!user.allowGifs) {
      finalImageUrl = user.defaultImageUrl;
    } else if (finalImageUrl && !isGiphyUrl(finalImageUrl) && !user.defaultImageUrl) {
      return res.status(400).json({ success: false, error: 'Invalid or disallowed image.' });
    }
    if (!finalImageUrl) finalImageUrl = user.defaultImageUrl;

    const timestamp = Date.now();
    const newDonation = new Donation({
      streamerToken: user.overlayToken,
      username,
      amount: 0,
      message,
      imageUrl: finalImageUrl,
      timestamp,
      shown: false
    });

    await newDonation.save();

    let audioUrl = null;
    if (user.allowTTS) {
      try {
        audioUrl = await generateTTS({ message, donationId: newDonation._id });
        if (audioUrl) {
          newDonation.audioUrl = audioUrl;
          await newDonation.save();
        }
      } catch (err) {
        console.warn('🛑 TTS generation failed:', err.message);
      }
    } else {
      console.log('🔇 TTS disabled for streamer. Skipping audio generation.');
    }

    const donation = {
      _id: newDonation._id,
      username,
      message,
      imageUrl: finalImageUrl,
      delayed: user.paused,
      timestamp,
      ...(audioUrl ? { audioUrl } : {})
    };

    addToQueue(streamer, donation);
    if (!user.paused) lastShownTimestamps[streamer] = timestamp;

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
    if (!streamer) return res.status(404).json({ success: false, error: 'Streamer not found' });
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
    const donations = await Donation.find({ streamerToken: token }).sort({ timestamp: -1 }).limit(50);
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
    if (!deleted) return res.status(404).json({ success: false, error: 'Donation not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Donation Delete Error]', err);
    res.status(500).json({ success: false, error: 'Failed to delete donation' });
  }
});

// ✅ POST /api/donations/mark-shown/:id
router.post('/mark-shown/:id', async (req, res) => {
  const io = req.app.get('io');
  const { id } = req.params;

  try {
    const donation = await Donation.findById(id);
    if (!donation) return res.status(404).json({ success: false, error: 'Not found' });

    donation.shown = true;
    await donation.save();

    if (donation.audioUrl && donation.audioUrl.startsWith('/audio/')) {
      const filename = donation.audioUrl.replace(/^\/audio\//, '');
      const filePath = path.join(__dirname, '../public/audio', filename);

      try {
        await fs.promises.access(filePath);
        await fs.promises.unlink(filePath);
        console.log('🗑️ Deleted TTS file:', filePath);
      } catch (deleteErr) {
        console.warn('⚠️ File deletion failed:', deleteErr.message);
      }
    }

    io.to(donation.streamerToken).emit('mark-shown-sync', donation._id);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error marking donation as shown:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ✅ DELETE /api/donations/clear-shown/:token
router.delete('/clear-shown/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const shownDonations = await Donation.find({ streamerToken: token, shown: true });

    for (const donation of shownDonations) {
      if (donation.audioUrl && donation.audioUrl.startsWith('/audio/')) {
        const filename = donation.audioUrl.replace(/^\/audio\//, '');
        const filePath = path.join(__dirname, '../public/audio', filename);
        try {
          await fs.promises.access(filePath);
          await fs.promises.unlink(filePath);
          console.log('🗑️ Deleted TTS file:', filePath);
        } catch (err) {
          console.warn('⚠️ Failed to delete file:', filePath, '-', err.message);
        }
      }
    }

    const result = await Donation.deleteMany({ streamerToken: token, shown: true });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('❌ Error deleting shown donations:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
