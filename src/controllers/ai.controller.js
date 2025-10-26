const axios = require("axios");
const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const Enrollment = require("../models/Enrollment");
const Submission = require("../models/Submission");
const { buildLearningContext } = require("../utils/ai-context");
const { chatWithGemini } = require("../services/gemini.service"); // fallback

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

    // >>> PHẲNG
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
