const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const connectToMongoDB = require('./db');

// Load env vars
dotenv.config();
connectToMongoDB();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });
app.set('io', io);

// Donation buffer (max 10 per streamer)
const donationBuffer = {};
app.set('donationBuffer', donationBuffer);

// ✅ Add toQueue handler for webhook.js
const { addToQueue } = require('./routes/donations');
app.set('addToQueue', addToQueue);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // lets the InstaPay SMS webhook accept form-encoded bodies too

// ✅ Serve static files like /audio/*.wav from public/
app.use(express.static(path.join(__dirname, 'public')));

// JWT Auth
const authMiddleware = require('./middleware/authMiddleware');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/config', require('./routes/config'));
app.use('/api/streamer', authMiddleware, require('./routes/streamerControl'));

// 🧾 Regular donation routes
app.use(
  '/api/donations',
  (req, res, next) => {
    req.donationBuffer = donationBuffer;
    next();
  },
  require('./routes/donations')
);

// 🏦 InstaPay donation routes
const instapayRouter = require('./routes/instapayDonations');
app.use('/api/instapay', instapayRouter);

// ✅ Verified donor identity (Google + Twitch) + shared ban list
app.use('/api/google', require('./routes/googleAuth'));
app.use('/api/twitch', require('./routes/twitchAuth'));
app.use('/api/donors', require('./routes/donorBans'));

// Periodic sweep: flip stale InstaPay reservations past their expiry to 'expired'
setInterval(() => {
  instapayRouter.expireStaleReservations().catch(err =>
    console.error('[InstaPay expiry sweep error]', err.message)
  );
}, 2 * 60 * 1000);

// Static overlay & control panels
app.use('/overlay', express.static(path.join(__dirname, '../overlay')));
app.use('/control', express.static(path.join(__dirname, '../control')));

// HTML page routes
app.get('/', (_, res) =>
  res.sendFile(path.join(__dirname, '../control/login.html'))
);
app.get('/login', (_, res) =>
  res.sendFile(path.join(__dirname, '../control/login.html'))
);
app.get('/register', (_, res) =>
  res.sendFile(path.join(__dirname, '../control/register.html'))
);
app.get('/control', (_, res) =>
  res.sendFile(path.join(__dirname, '../control/control.html'))
);
app.get('/overlay', (_, res) =>
  res.sendFile(path.join(__dirname, '../overlay/index.html'))
);
app.get('/donate', (_, res) =>
  res.sendFile(path.join(__dirname, '../overlay/DonaterForm.html'))
);

// Public env values the frontend needs (all safe to expose client-side)
app.get('/env-config', (req, res) => {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return res.status(500).send('GIPHY key missing');
  res.json({
    giphyKey: key,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    twitchClientId: process.env.TWITCH_CLIENT_ID || ''
  });
});

// ✅ API to resolve overlay token securely
app.get('/api/overlay/resolve', async (req, res) => {
  const token = req.query.id;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    const Streamer = require('./models/Streamer');
    const streamer = await Streamer.findOne({ overlayToken: token });
    if (!streamer) return res.status(404).json({ error: 'Not found' });
    res.json({ username: streamer.username });
  } catch (err) {
    console.error('Overlay resolve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// WebSocket handling
io.on('connection', (socket) => {
  const streamer = socket.handshake.query?.s || 'default';
  socket.join(streamer);

  const buffer = donationBuffer[streamer];
  if (buffer?.length) {
    buffer.forEach((d) => socket.emit('new-donation', d));
  }

  socket.on('remove-donation', (donationId) => {
    console.log(`🧹 Removing donation ${donationId} in room: ${streamer}`);
    io.to(streamer).emit('remove-donation', donationId);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
