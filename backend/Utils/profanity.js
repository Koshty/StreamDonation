const fs = require('fs');
const path = require('path');

// English: deliberately narrow — this exists to avoid a Twitch/YouTube ban,
// not to be kid-friendly. It only blocks the categories that actually risk
// that — slurs, hate symbols, sexualization of minors (illegal, not just a
// TOS issue), bestiality/extreme content, and rape/sexual-assault language.
// Ordinary profanity ("fuck", "shit", "ass"), sexual vocabulary, and mundane
// insults ("bitch", "slut", "asshole") are intentionally NOT blocked.
const BLOCKED_WORDS = [
  // Ethnic/racial slurs
  'beaner', 'beaners', 'coon', 'coons', 'darkie', 'honkey', 'jigaboo', 'jiggaboo',
  'jiggerboo', 'kike', 'negro', 'nigga', 'nigger', 'paki', 'raghead', 'slanteye',
  'spic', 'towelhead', 'wetback',
  // Homophobic / transphobic slurs
  'faggot', 'poof', 'bulldyke', 'tranny',
  // Sexualization of minors (illegal, zero tolerance)
  'jailbait', 'lolita', 'nambla', 'paedophile', 'pedobear', 'pedophile', 'pthc', 'shota', 'goatcx',
  // Hate symbols / extremist ideology
  'neonazi', 'swastika',
  // Bestiality / extreme illegal-adjacent content
  'bestiality', 'zoophilia', 'vorarephilia', 'dolcett', 'guro',
  // Sexual assault / rape threats
  'rape', 'raping', 'rapist', 'daterape'
];

// Arabic: broader on purpose — general Arabic sexual vocabulary/profanity is
// blocked here even though the English equivalent isn't, per an explicit call
// that Arabic sexual language reads as worse to this audience than English
// swearing does.
let arabicWords = [];
try {
  arabicWords = JSON.parse(fs.readFileSync(path.join(__dirname, 'arabic.json'), 'utf-8')).words;
} catch (err) {
  console.warn('⚠️ Arabic wordlist not loaded:', err.message);
}

const PROFANITY_SET = new Set([...BLOCKED_WORDS, ...arabicWords].map(w => w.toLowerCase()));

// Common leetspeak substitutions, applied before stripping remaining symbols —
// catches basic evasion like "n1gger" or "f4ggot" without touching real letters.
const LEET_MAP = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '$': 's', '@': 'a' };

// Normalizes a single token: Arabic diacritics/tatweel stripped, leetspeak
// mapped back to letters, anything left that isn't a letter removed, repeated
// letters collapsed ("niggggger" -> "nigger"), case-folded.
function normalize(word) {
  return word
    .replace(/[ً-ْ]/g, '')
    .replace(/ـ+/g, '')
    .split('').map(ch => LEET_MAP[ch] || ch).join('')
    .replace(/[^ء-يa-zA-Z]/g, '')
    .replace(/(.)\1{2,}/g, '$1')
    .normalize('NFC')
    .toLowerCase();
}

// Masking symbols ("n*gger", "f**got") don't map to a specific letter the way
// leetspeak numbers do, so a straight substitution can't recover them.
// Instead, treat each masked run as a wildcard and check for a same-length
// dictionary word matching the surrounding letters. Only applies to a token
// that's letters-symbol(s)-letters, so it won't fire on ordinary punctuation.
function wildcardMatch(rawToken) {
  const stripped = rawToken.replace(/[ً-ْ]/g, '').replace(/ـ+/g, '');
  if (!/^[ء-يa-zA-Z]+[^ء-يa-zA-Z]+[ء-يa-zA-Z]+$/.test(stripped)) return null;
  const pattern = '^' + stripped.toLowerCase().replace(/[^ء-يa-z]/g, '.') + '$';
  let re;
  try {
    re = new RegExp(pattern);
  } catch {
    return null;
  }
  for (const word of PROFANITY_SET) {
    if (word.length === stripped.length && re.test(word)) return word;
  }
  return null;
}

// Takes the RAW text (not pre-normalized) — normalizing the whole string
// before splitting would erase the whitespace this needs to tell words apart.
function getMatchedProfanities(rawText) {
  const rawTokens = String(rawText).split(/\s+/).filter(Boolean);
  const tokens = rawTokens.map(normalize);
  const matches = new Set();

  // 1) Per-word check — precise exact-word matching (no substring matching,
  // which would false-positive on innocent words like "assassin" or "grape").
  for (const w of tokens) {
    if (w && PROFANITY_SET.has(w)) matches.add(w);
  }

  // 2) Spaced-out-letters check ("n i g g e r") — merge consecutive short
  // (<=2 char) tokens and test the merged blob, since word-splitting alone
  // can't see this common evasion.
  let buffer = '';
  for (const w of tokens) {
    if (w.length > 0 && w.length <= 2) {
      buffer += w;
    } else {
      if (buffer && PROFANITY_SET.has(buffer)) matches.add(buffer);
      buffer = '';
    }
  }
  if (buffer && PROFANITY_SET.has(buffer)) matches.add(buffer);

  // 3) Masking-symbol check ("n*gger") on the original (pre-normalize) tokens.
  for (const raw of rawTokens) {
    const hit = wildcardMatch(raw);
    if (hit) matches.add(hit);
  }

  return [...matches];
}

function hasProfanity(text) {
  return getMatchedProfanities(text).length > 0;
}

module.exports = {
  hasProfanity,
  getMatchedProfanities,
  normalize
};
