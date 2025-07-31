const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Streamer = require('../models/Streamer');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Resolve overlay token to username
router.get('/resolve-token/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const streamer = await Streamer.findOne({ overlayToken: token });
    if (!streamer) return res.status(404).json({ error: 'Streamer not found' });

    res.json({ username: streamer.username });
  } catch (err) {
    console.error('Resolve token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register new streamer
router.post('/register', async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const existing = await Streamer.findOne({
      $or: [{ email }, { username }]
    });

    if (existing) {
      return res.status(409).json({ error: 'Email or username already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newStreamer = new Streamer({
      email,
      passwordHash,
      username
    });

    await newStreamer.save();

    const token = jwt.sign(
      { id: newStreamer._id, username: newStreamer.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, username: newStreamer.username });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// Login existing streamer
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const streamer = await Streamer.findOne({ username });
    if (!streamer) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isMatch = await bcrypt.compare(password, streamer.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { id: streamer._id, username: streamer.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, username: streamer.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});


module.exports = router;
