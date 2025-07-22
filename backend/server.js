const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const configRoutes = require('./routes/config');
const streamerControlRoutes = require('./routes/streamerControl');
const donationRoutes = require('./routes/donations');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json());

// Serve static overlay files (CSS, JS, images, etc.)
app.use('/overlay', express.static(path.join(__dirname, '../overlay')));

// Serve overlay HTML (supports ?s=streamername)
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, '../overlay/index.html'));
});

// Serve viewer donation form
app.get('/donate', (req, res) => {
  res.sendFile(path.join(__dirname, '../overlay/DonaterForm.html'));
});

// Serve static control panel files
app.use('/control', express.static(path.join(__dirname, '../control')));

// Serve control panel HTML
app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, '../control/control.html'));
});

// Streamer config, control, and donation APIs
app.use('/config', configRoutes);
app.use('/api/streamer', streamerControlRoutes);

// Donation buffer (max 10 per streamer)
const donationBuffer = {}; // { streamerName: [donation, ...] }
app.set('donationBuffer', donationBuffer);

app.use('/api/donations', (req, res, next) => {
  req.donationBuffer = donationBuffer;
  next();
}, donationRoutes);

// Serve GIPHY API key (for frontend usage)
app.get('/env-config', (req, res) => {
  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    console.error("⚠️ GIPHY_API_KEY is not set in .env");
    return res.status(500).send('GIPHY key missing');
  }
  res.json({ giphyKey: key });
});

// WebSocket setup
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  const streamer = socket.handshake.query?.s || 'default';
  socket.join(streamer);

  const buffer = donationBuffer[streamer];
  if (buffer && buffer.length > 0) {
    // Send buffered donations to new client
    buffer.forEach(donation => {
      socket.emit('new-donation', donation);
    });
  }

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// Attach io to app so it's available in routes
app.set('io', io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📂 Overlay files served from:', path.join(__dirname, '../overlay'));
  console.log('📂 Control panel served from:', path.join(__dirname, '../control'));
});
