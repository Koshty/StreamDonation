const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  streamerToken: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  imageUrl: { // ✅ Added field
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  shown: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('Donation', donationSchema);
