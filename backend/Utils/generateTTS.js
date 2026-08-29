// Utils/generateTTS.js
const fs = require("fs");
const path = require("path");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const ARABIC_VOICE = process.env.TTS_ARABIC_VOICE || "ar-EG-ShakirNeural";
const ENGLISH_VOICE = process.env.TTS_ENGLISH_VOICE || "en-US-AndrewMultilingualNeural";

function detectLanguage(text) {
  const arabicChars = (text.match(/[؀-ۿ]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return arabicChars > latinChars ? "ar" : "en";
}

// msedge-tts builds an SSML request under the hood and doesn't escape input itself.
function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function generateTTS({ username, message, isPaid, amount, donationId }) {
  const trimmedMessage = (message || "").trim();
  if (!trimmedMessage && !isPaid) return null;

  const name = (username || "Anonymous").trim();
  const lang = detectLanguage(trimmedMessage || name);

  const intro = isPaid
    ? (lang === "ar" ? `${name} تبرع بمبلغ ${amount} جنيه` : `${name} donated ${amount} pounds`)
    : (lang === "ar" ? `${name} يقول` : `${name} says`);

  let text = trimmedMessage ? `${intro}: ${trimmedMessage}` : `${intro}.`;
  if (!/[.!?؟]$/.test(text)) text += ".";

  const voice = lang === "ar" ? ARABIC_VOICE : ENGLISH_VOICE;
  const outputDir = path.join(__dirname, "../public/audio");
  const outputPath = path.join(outputDir, `${donationId}.mp3`);
  const publicUrl = `/audio/${donationId}.mp3`;

  try {
    // Git doesn't track empty directories, so a fresh deploy checkout won't have
    // this folder at all even though it exists locally — create it defensively.
    await fs.promises.mkdir(outputDir, { recursive: true });

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text));

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      audioStream.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
      audioStream.on("error", reject);
    });

    const { size } = await fs.promises.stat(outputPath);
    if (size === 0) {
      await fs.promises.unlink(outputPath).catch(() => {});
      console.warn("⚠️ TTS produced empty audio (likely no speakable characters), skipping.");
      return null;
    }

    return publicUrl;
  } catch (error) {
    console.warn("⚠️ TTS generation failed:", error.message);
    return null; // fail silently
  }
}

module.exports = generateTTS;
