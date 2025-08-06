const fs = require('fs');
const path = require('path');
const leoProfanity = require('leo-profanity');

leoProfanity.loadDictionary();

try {
  const arabicWords = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'arabic.json'), 'utf-8')
  );
  leoProfanity.add(arabicWords.words);
} catch (err) {
  console.warn('⚠️ Arabic wordlist not loaded:', err.message);
}

// Optional: remove weak words
leoProfanity.remove(['ass', 'bitch', 'sex', 'sexy']);


function normalize(text) {
  return text
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/ـ+/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\u0621-\u064Aa-zA-Z]/g, '')
    .replace(/(.)\1{2,}/g, '$1')
    .normalize('NFC');
}

function getMatchedProfanities(input) {
  const list = leoProfanity.list().map(normalize);
  const words = input
    .split(/\s+/)             // split by whitespace
    .map(word => normalize(word))
    .filter(Boolean);         // remove empty

  return words.filter(w => list.includes(w));
}

function hasProfanity(text) {
  return getMatchedProfanities(text).length > 0;
}

module.exports = {
  hasProfanity,
  getMatchedProfanities,
  normalize
};
