const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  streamerToken: {
    type: String,
    required: true
  },
  username: {
    type: String
  },
  amount: {
    type: Number,
    required: true
  },
  message: {
    type: String
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
  paymobOrderId: {
    type: String
  },
  paymobTxnId: {
    type: String,
    unique: true,
    sparse: true  // only enforces uniqueness when value is present
  },
  isPaymob: {
    type: Boolean,
    default: false
  },
  pending: {
    type: Boolean,
    default: false
  },
});

module.exports = mongoose.model('Donation', donationSchema);
