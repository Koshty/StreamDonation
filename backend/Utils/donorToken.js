const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
// Long-lived on purpose: bans are re-checked at donation-submission time regardless
// of token age, so a longer TTL only reduces re-sign-in friction, not ban enforcement.
const DONOR_TOKEN_TTL = '12h';

function signDonorToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: DONOR_TOKEN_TTL });
}

// Returns the decoded payload, or null if missing/invalid/expired.
function verifyDonorToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { signDonorToken, verifyDonorToken };
