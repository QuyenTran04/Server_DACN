// Google Cloud Text-to-Speech Service
const textToSpeech = require("@google-cloud/text-to-speech");

const GOOGLE_CLOUD_TTS_API_KEY = process.env.GOOGLE_CLOUD_TTS_API_KEY;
const DEFAULT_VOICE = process.env.GOOGLE_CLOUD_TTS_VOICE || "vi-VN-Neural2-A";

async function callGoogleCloudTTS({
  text,
  voice = DEFAULT_VOICE,
  speed = 1.0,
  pitch = 0,
  outputFormat = "mp3",
  timeout = 30000,
} = {}) {
  if (!GOOGLE_CLOUD_TTS_API_KEY) {
    throw new Error("Missing GOOGLE_CLOUD_TTS_API_KEY");
  }

  const content = String(text || "").trim();
  if (!content) {
    throw new Error("Thiếu nội dung để chuyển giọng đọc.");
  }

  if (content.length > 5000) {
    throw new Error("Nội dung quá dài (tối đa 5000 ký tự).");
  }

  // Determine audio encoding
  let audioEncoding = "MP3";
  let mimeType = "audio/mp3";
  if (outputFormat.toLowerCase() === "linear16") {
    audioEncoding = "LINEAR16";
    mimeType = "audio/wav";
  } else if (outputFormat.toLowerCase() === "ogg") {
    audioEncoding = "OGG_OPUS";
    mimeType = "audio/ogg";
  }

  try {
    console.log("[GoogleCloudTTS] Request - voice:", voice, "textLen:", content.length, "speed:", speed);

    const client = new textToSpeech.TextToSpeechClient({
      apiKey: GOOGLE_CLOUD_TTS_API_KEY,
    });

    const request = {
      input: { text: content },
      voice: {
        languageCode: voice.split("-").slice(0, 2).join("-"), // e.g., "vi-VN" from "vi-VN-Neural2-A"
        name: voice,
      },
      audioConfig: {
        audioEncoding,
        speakingRate: Math.min(Math.max(speed, 0.25), 4.0), // Clamp between 0.25 and 4.0
        pitch,
      },
    };

    console.log("[GoogleCloudTTS] Sending request to Google Cloud API...");

    const [response] = await client.synthesizeSpeech(request);
    const audioContent = response.audioContent;

    if (!audioContent) {
      throw new Error("Google Cloud TTS did not return audio content.");
    }

    console.log("[GoogleCloudTTS] ✓ Success - audio size:", audioContent.length);

    // Convert Buffer to base64
    const base64Audio = audioContent.toString("base64");

    return {
      audio: base64Audio,
      mimeType,
      voice,
      speed,
      pitch,
      length: content.length,
    };
  } catch (err) {
    console.error("[GoogleCloudTTS] Error:", err.message);
    throw err;
  }
}

module.exports = { callGoogleCloudTTS };
