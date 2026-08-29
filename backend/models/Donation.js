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
  isPaid: {
    type: Boolean,
    default: false
  },
  pending: {
    type: Boolean,
    default: false
  },

  // InstaPay fields (only populated when paymentMethod === 'instapay')
  paymentMethod: {
    type: String,
    enum: ['free', 'instapay'],
    default: 'free'
  },
  requestedAmount: {
    type: Number
  },
  reservedAmount: {
    type: Number
  },
  instapayStatus: {
    type: String,
    enum: ['reserved', 'paid', 'expired', 'cancelled']
  },
  reservedAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  },
  matchedAt: {
    type: Date
  },
  matchedVia: {
    type: String,
    enum: ['sms', 'manual']
  },
  smsRawText: {
    type: String
  },

  // Verified donor identity (only populated when signed in via Google or Twitch)
  donorVerified: {
    type: Boolean,
    default: false
  },
  donorPlatform: {
    type: String,
    enum: ['google', 'twitch']
  },
  googleId: {
    type: String
  },
  twitchId: {
    type: String
  },
  donorAvatarUrl: {
    type: String
  },
});

// Only currently-reserved donations need a unique reservedAmount — once
// paid/expired/cancelled the amount is free to be reused by a new reservation.
donationSchema.index(
  { reservedAmount: 1 },
  { unique: true, partialFilterExpression: { instapayStatus: 'reserved' } }
);

module.exports = mongoose.model('Donation', donationSchema);
