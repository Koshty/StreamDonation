const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid'); // we'll use this for unique tokens

const streamerSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  overlayToken: {
    type: String,
    required: true,
    unique: true,
    default: uuidv4, // generate a unique token on creation
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  paused: { type: Boolean, default: false },
defaultImageUrl: { type: String, default: '' },
allowGifs: { type: Boolean, default: true },
allowTTS: {
  type: Boolean,
  default: true
},
// 'free' = no amount field, message-only. 'optional' = amount field shown but not
// required, donor's choice per donation. 'paid' = amount required, no free option.
donationMode: {
  type: String,
  enum: ['free', 'optional', 'paid'],
  default: 'free'
},
instapayId: { type: String, default: '' },
instapaySmsSecret: { type: String, default: '' },
requireVerifiedDonor: { type: Boolean, default: false },
authProvider: { type: String, enum: ['google', 'twitch'], default: 'google' }


});

module.exports = mongoose.model('Streamer', streamerSchema);
