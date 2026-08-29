const mongoose = require('mongoose');

const bannedDonorSchema = new mongoose.Schema({
  streamerToken: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    enum: ['google', 'twitch'],
    required: true
  },
  externalId: {
    type: String,
    required: true
  },
  nameAtBan: {
    type: String
  },
  bannedAt: {
    type: Date,
    default: Date.now
  },
});

bannedDonorSchema.index({ streamerToken: 1, platform: 1, externalId: 1 }, { unique: true });

module.exports = mongoose.model('BannedDonor', bannedDonorSchema);
