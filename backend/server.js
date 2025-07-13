const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
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

// Explicitly serve overlay/index.html at /overlay
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, '../overlay/index.html'));
});

// Serve other overlay assets (JS, CSS, etc.)
app.use('/overlay', express.static(path.join(__dirname, '../overlay')));

// Import and use API routes
const donationRoutes = require('./routes/donations');
app.use('/api/donations', donationRoutes);

// Setup WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible to other routes
app.set('io', io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Overlay served from:', path.join(__dirname, '../overlay'));
});
