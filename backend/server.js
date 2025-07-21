const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const configRoutes = require('./routes/config');
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

// Serve streamer-specific config (e.g., /config/Koshty)
app.use('/config', configRoutes);

// Serve GIPHY API key from .env separately
app.get('/env-config', (req, res) => {
  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    console.error("⚠️ GIPHY_API_KEY is not set in .env");
    return res.status(500).send('GIPHY key missing');
  }
  res.json({ giphyKey: key });
});

// Serve overlay/index.html at /overlay
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, '../overlay/index.html'));
});

// Serve viewer form at /donate
app.get('/donate', (req, res) => {
  res.sendFile(path.join(__dirname, '../overlay/DonaterForm.html'));
});

// Serve static overlay files (CSS, JS, etc.)
app.use('/overlay', express.static(path.join(__dirname, '../overlay')));

// Donation-related routes
const donationRoutes = require('./routes/donations');
app.use('/api/donations', donationRoutes);

// Setup WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('🖥️ Overlay served from:', path.join(__dirname, '../overlay'));
});
