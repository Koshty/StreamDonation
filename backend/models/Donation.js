const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  streamerToken: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: false
  },
  amount: {
    type: Number,
    required: true
  },
  message: {
    type: String,
    required: false
  },
  imageUrl: {
    type: String,
    default: ''
  },
  audioUrl: { 
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
  },
  paymobOrderId: String,
paymobTxnId: String,
isPaymob: { type: Boolean, default: false },
  pending: {
    type: Boolean,
    default: false
  },
});

module.exports = mongoose.model('Donation', donationSchema);
