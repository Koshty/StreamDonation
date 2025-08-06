const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Donation = require('../models/Donation');
const Streamer = require('../models/Streamer');
const generateTTS = require('../Utils/generateTTS');
const fs = require('fs');
const path = require('path');
const leoProfanity = require('leo-profanity');

// Load Arabic + English profanity
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

// Profanity helpers
function normalizeProfanityInput(text) {
  return text
    .replace(/[\u064B-\u0652]/g, '') // diacritics
    .replace(/ـ+/g, '')              // tatweel
    .replace(/\s+/g, '')
    .replace(/[^\u0621-\u064Aa-zA-Z]/g, '')
    .replace(/(.)\1{2,}/g, '$1')
    .normalize('NFC');
}
function getMatchedProfanities(text) {
  const list = leoProfanity.list();
  const normalizedText = normalizeProfanityInput(text);
  return list.filter(bad => {
    const normBad = normalizeProfanityInput(bad);
    const regex = new RegExp(`\\b${normBad}\\b`, 'iu');
    return regex.test(normalizedText);
  });
}

// ✅ Webhook endpoint
router.post('/paymob/webhook', async (req, res) => {
  console.log('📩 Received webhook from Paymob');

  const obj = req.body.obj;
  if (!obj) {
    console.warn('❌ Missing .obj in payload');
    return res.status(400).json({ error: 'Invalid payload structure' });
  }

  const { success, amount_cents, order, id, billing_data } = obj;

  if (success !== true && success !== 'true') {
    console.warn('❌ Payment not successful:', success);
    return res.status(400).json({ success: false, error: 'Payment not successful' });
  }

  try {
    console.log('✅ Payment marked as successful');

    const amount = parseFloat(amount_cents) / 100;
    let username = billing_data?.first_name?.trim() || 'Anonymous';
    let message = '';
    let imageUrl = '';
    let streamerUsername = 'default';

    try {
      const extra = JSON.parse(obj?.order?.shipping_data?.extra_description || '{}');
      message = extra.message?.trim() || '';
      imageUrl = extra.imageUrl || '';
      streamerUsername = extra.streamer || 'default';
    } catch {
      console.warn('⚠️ Failed to parse extra_description JSON');
    }

    console.log(`👤 Streamer: ${streamerUsername}, User: ${username}, Amount: ${amount}`);
    console.log(`💬 Message: "${message}" | 🖼️ Image: ${imageUrl || '[none]'}`);

    // 🔞 Profanity filtering
    const badUsername = getMatchedProfanities(normalizeProfanityInput(username));
    if (badUsername.length) {
      console.warn(`⚠️ Profane username: ${badUsername.join(', ')}`);
      username = 'Anonymous';
    }

    const badMessage = getMatchedProfanities(normalizeProfanityInput(message));
    if (badMessage.length) {
      console.warn(`⚠️ Profane message: ${badMessage.join(', ')}`);
      message = '';
    }

    const streamer = await Streamer.findOne({ username: streamerUsername });
    if (!streamer) {
      console.warn('❌ Streamer not found:', streamerUsername);
      return res.status(404).json({ error: 'Streamer not found' });
    }

    console.log(`✅ Streamer "${streamerUsername}" found in DB`);

    const io = req.app.get('io');
    const buffer = req.app.get('donationBuffer');
    const addToQueue = req.app.get('addToQueue');
    const timestamp = Date.now();

    if (!imageUrl) {
      imageUrl = streamer.defaultImageUrl;
    }

    const newDonation = new Donation({
      streamerToken: streamer.overlayToken,
      username,
      message,
      imageUrl,
      amount,
      timestamp,
      shown: false,
      pending: false,
      isPaymob: true,
      paymobTxnId: id,
      paymobOrderId: order?.id || order
    });

    await newDonation.save();
    console.log('💾 Donation saved to MongoDB:', newDonation._id);

    let audioUrl = '';
    if (streamer.allowTTS && message) {
      try {
        audioUrl = await generateTTS({ message, donationId: newDonation._id });
        if (audioUrl) {
          newDonation.audioUrl = audioUrl;
          await newDonation.save();
          console.log('🔊 TTS audio generated and saved');
        }
      } catch (err) {
        console.warn('❌ TTS generation failed:', err.message);
      }
    }

    const donation = {
      _id: newDonation._id,
      username,
      message,
      imageUrl,
      delayed: streamer.paused,
      timestamp,
      ...(audioUrl ? { audioUrl } : {})
    };

    if (!buffer[streamer.username]) buffer[streamer.username] = [];
    buffer[streamer.username].push(donation);
    if (buffer[streamer.username].length > 10) buffer[streamer.username].shift();

    console.log('🧠 Donation added to buffer');

    if (typeof addToQueue === 'function') {
      addToQueue(streamer.username, donation);
      console.log('📝 Donation added to display queue');
    }

    if (!streamer.paused) {
      io.to(streamer.username).emit('new-donation', donation);
      console.log('📢 Donation emitted via socket.io');
    } else {
      console.log('⏸️ Donation queued (stream is paused)');
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
