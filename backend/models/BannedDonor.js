const mongoose = require('mongoose');

const bannedDonorSchema = new mongoose.Schema({
  streamerToken: {
    type: String,
    required: true
  },
  googleId: {
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

bannedDonorSchema.index({ streamerToken: 1, googleId: 1 }, { unique: true });

module.exports = mongoose.model('BannedDonor', bannedDonorSchema);
