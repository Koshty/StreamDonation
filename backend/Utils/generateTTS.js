// Utils/generateTTS.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");

async function generateTTS({ message, donationId }) {
  if (!message.trim().endsWith(".")) {
    message += ".";
  }

  const ttsServer = "http://localhost:5002/api/tts";
  const speakerWavPath = "/root/egyptian_voice_short.wav"; // must match Docker container path
  const outputPath = path.join(__dirname, `../public/audio/${donationId}.wav`);
  const publicUrl = `/audio/${donationId}.wav`;

  const params = {
    text: message,
    speaker_id: "",
    style_wav: "",
    speaker_wav: speakerWavPath,
    language_id: "ar",
  };

  try {
    const response = await axios.get(ttsServer, {
      params,
      responseType: "stream",
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    return publicUrl;
  } catch (error) {
    console.warn("⚠️ TTS generation failed:", error.message);
    return null; // fail silently
  }
}

module.exports = generateTTS;
