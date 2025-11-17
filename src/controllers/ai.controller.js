const axios = require("axios");
const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const Enrollment = require("../models/Enrollment");
const Submission = require("../models/Submission");
const { buildLearningContext } = require("../utils/ai-context");
const { chatWithGemini } = require("../services/gemini.service");
const { callGoogleCloudTTS } = require("../services/google-tts.service");

const pickAnswer = (data) =>
  data?.answer ||
  data?.message ||
  data?.data ||
  data?.result ||
  JSON.stringify(data);

exports.postChat = async (req, res) => {
  try {
    const userId = req.user?._id?.toString() || req.body.userId || null;
    const {
      message,
      courseId,
      lessonId,
      uiState = {},
      progress = null,
      extra = {},
    } = req.body || {};
    if (!message?.trim())
      return res.status(400).json({ error: "message is required" });

    const context = await buildLearningContext({
      userId,
      courseId,
      lessonId,
      uiState,
      progress,
    });

    const payload = {
      message,
      userId,
      courseId,
      lessonId,
      uiState,
      progress: context.progressPct,
      context: {
        courseMeta: context.courseMeta,
        lessonMeta: context.lessonMeta,
        enrollmentMeta: context.enrollmentMeta,
        lastAttempts: context.lastAttempts,
      },
      extra,
    };

    let aiAnswer;
    try {
      const r = await axios.post(process.env.N8N_URL, payload, {
        headers: {
          [process.env.N8N_HEADER_KEY]: process.env.N8N_HEADER_VAL,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });
      aiAnswer = pickAnswer(r.data);
    } catch (err) {
      console.error("[n8n] status:", err?.response?.status);
      console.error("[n8n] data:", err?.response?.data);
      console.error("[n8n] code:", err?.code);
      // Fallback nếu n8n lỗi
      if (typeof chatWithGemini === "function") {
        const sys = [
          "Bạn là Gia sư AI trong LMS, trả lời ngắn gọn, có ví dụ sát bài.",
          `Ngôn ngữ: ${uiState?.language || "vi"}`,
          `Course: ${JSON.stringify(context.courseMeta || {})}`,
          `Lesson: ${JSON.stringify(context.lessonMeta || {})}`,
          uiState?.page === "quiz" && uiState?.isReviewMode === false
            ? "Đang làm quiz, KHÔNG tiết lộ đáp án, chỉ gợi ý hướng suy nghĩ."
            : "",
        ].join("\n");
        aiAnswer = await chatWithGemini({ system: sys, user: message });
      } else {
        return res
          .status(502)
          .json({ error: "AI agent unavailable (no fallback)" });
      }
    }

    return res.json({ answer: aiAnswer });
  } catch (e) {
    console.error("AI postChat error:", e?.response?.data || e);
    return res.status(500).json({ error: "AI agent unavailable" });
  }
};

exports.pronounceText = async (req, res) => {
  try {
    const { text, voice, speed = 1, format = "mp3" } = req.body || {};
    const content = String(text || "").trim();
    if (!content) {
      return res
        .status(400)
        .json({ message: "Nội dung cần phát âm không được để trống." });
    }
    if (content.length > 5000) {
      return res.status(400).json({
        message: "Vui lòng rút gọn đoạn cần đọc xuống dưới 5000 ký tự.",
      });
    }

    const speakingRate = Math.min(Math.max(Number(speed) || 1, 0.25), 4.0);
    
    // Use Google Cloud TTS (faster: 100-300ms vs Gemini 45-90s+)
    console.log("[pronounceText] Using Google Cloud TTS with voice:", voice);
    const result = await callGoogleCloudTTS({
      text: content,
      voice: voice || "en-US-Neural2-A",
      speed: speakingRate,
      outputFormat: format,
    });

    return res.json({
      audio: result.audio,
      mimeType: result.mimeType,
      voice: result.voice,
      speed: result.speed,
      length: result.length,
    });
  } catch (err) {
    console.error("[AI Pronounce Error]", err.message);
    const status = err?.code === 'ENOTFOUND' || err?.code === 'ETIMEDOUT' ? 503 : 500;
    return res.status(status).json({
      message: "Không thể tạo audio phát âm.",
      detail: err?.message || "unknown",
    });
  }
};

exports.explainQuiz = async (req, res) => {
  try {
    const { quizId, submissionId, selected = [], lang = "vi" } = req.body;
    
    if (!quizId) {
      return res.status(400).json({ error: "quizId is required" });
    }

    // Implementation would go here
    return res.json({ message: "Not implemented" });
  } catch (err) {
    console.error("Explain quiz error:", err);
    return res.status(500).json({ error: "Failed to explain quiz" });
  }
};
