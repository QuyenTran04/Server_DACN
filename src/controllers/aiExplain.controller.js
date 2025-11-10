const mongoose = require("mongoose");
const Quiz = require("../models/Quiz");
const Lesson = require("../models/Lesson");
const Course = require("../models/Course");
const Submission = require("../models/Submission");
const Chunk = require("../models/Chunk");
const { callLLMJSON } = require("../services/llm.service");
const {
  analyzeCourseStyle,
  generateSystemPrompt,
  buildUserPrompt,
  getStyleHint,
  extractKeyVocabulary,
  autoWrapCode,
} = require("../utils/dynamicPrompt.helper");
/**
 * Kiểm tra độ dài của explanation để tránh lan man
 * @param {string} text - Văn bản cần kiểm tra
 * @param {number} maxWords - Số từ tối đa (mặc định 160)
 * @returns {string} - Văn bản sau khi trim/cắt ngắn
 */
function trimToWordLimit(text, maxWords = 160) {
  if (!text || typeof text !== "string" || maxWords <= 0) return "";
  const normalized = text.trim();
  if (!normalized) return "";

  // Không cắt ngắn khi nội dung chứa code fence để tránh làm hỏng Markdown
  if (normalized.includes("```")) {
    return normalized;
  }

  const tokens = normalized.match(/\S+\s*/g);
  if (!tokens) return normalized;
  if (tokens.length <= maxWords) return normalized;

  const trimmed = tokens.slice(0, maxWords).join("").trimEnd();
  return `${trimmed}...`;
}

/**
 * Đảm bảo Markdown code fence luôn được đóng/mở đầy đủ
 * @param {string} text
 * @returns {string}
 */
function ensureCodeFenceIntegrity(text) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.replace(/\s+$/, "");
  const matches = trimmed.match(/```/g);
  if (matches && matches.length % 2 !== 0) {
    return `${trimmed}\n\`\`\``;
  }
  return trimmed;
}

/**
 * Body:
 * {
 *   quizId: string (bắt buộc),
 *   submissionId?: string,        // nếu muốn giải thích theo lựa chọn của HS
 *   selected?: string[],          // nếu chưa có submission
 *   lang?: "vi"|"en" (mặc định "vi")
 * }
 */
exports.explainQuiz = async (req, res) => {
  try {
    let { quizId, submissionId, selected, lang = "auto" } = req.body;
    console.log("[AI Explain] Request:", {
      quizId,
      submissionId,
      selectedCount: selected?.length,
      lang,
    });
    if (!quizId) return res.status(400).json({ error: "quizId is required" });

    // 1) Lấy quiz
    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Detect language từ quiz nếu lang là "auto"
    if (lang === "auto" && quiz.language && quiz.language !== "auto") {
      lang = quiz.language;
    } else if (lang === "auto") {
      // Fallback: detect từ question text
      const question = quiz.question || "";
      const hasEn =
        /[a-z]/i.test(question) &&
        !/[^\x00-\x7F]/.test(question.replace(/[^a-z0-9\s]/gi, ""));
      lang = hasEn ? "en" : "vi";
    }

    console.log("[AI Explain] Language:", lang);

    // 2) Lấy lesson + course
    const lesson = await Lesson.findById(quiz.lesson).lean();
    const course = await Course.findById(quiz.course).lean();

    if (!course) return res.status(404).json({ error: "Course not found" });

    // 3) Xác định phong cách giải thích (từ custom field hoặc auto-detect)
    let style = "general";
    if (course.explanationGuideline && course.explanationGuideline !== "auto") {
      style = course.explanationGuideline;
      console.log("[AI Explain] Using custom guideline:", style);
    } else {
      const courseStyle = analyzeCourseStyle(course);
      style = courseStyle.style;
      console.log("[AI Explain] Auto-detected style:", style);
    }

    console.log("[AI Explain] Course:", course.title, "| Style:", style);

    // 4) Lấy submission (nếu có) để biết HS chọn gì/đúng sai
    let picked = Array.isArray(selected) ? selected : null;
    let isCorrect = undefined;
    if (submissionId && mongoose.isValidObjectId(submissionId)) {
      const sub = await Submission.findById(submissionId).lean();
      if (sub) {
        picked = sub.selected;
        isCorrect = sub.isCorrect;
      }
    }

    // 5) Vector search để lấy ngữ cảnh liên quan
    const optionsText = (quiz.options || [])
      .map((o, i) => (o?.text ? `Option ${i + 1}: ${o.text}` : null))
      .filter(Boolean)
      .join("\n");

    const searchQueryText = [quiz.question || "", optionsText || ""]
      .filter(Boolean)
      .join("\n");

    let contextTexts = "";
    try {
      const topK = 4;
      const chunks = await Chunk.aggregate([
        {
          $vectorSearch: {
            index: "lms_chunks_vector_index",
            path: "vector",
            query: searchQueryText,
            numCandidates: 100,
            limit: topK,
          },
        },
        {
          $match: {
            $or: [{ lessonId: quiz.lesson }, { courseId: quiz.course }],
          },
        },
        { $limit: topK },
        {
          $project: {
            _id: 0,
            text: 1,
            source: 1,
            sourceId: 1,
            lessonId: 1,
            courseId: 1,
          },
        },
      ]);

      console.log("[AI Explain] Vector search found chunks:", chunks.length);
      if (chunks && chunks.length > 0) {
        contextTexts = chunks.map((c) => c.text).join("\n---\n");
      }
    } catch (vectorErr) {
      console.warn(
        "[AI Explain] Vector search error (fallback):",
        vectorErr.message
      );
    }

    // 6) Build prompt với dynamic style
    const system = generateSystemPrompt(style, lang);

    // Lấy text của đáp án học sinh chọn
    const pickedTextList = Array.isArray(picked) ? picked : [];
    const answerMap = (quiz.options || []).reduce((acc, o, idx) => {
      const key = String(idx);
      acc[key] = o?.text || null;
      return acc;
    }, {});

    const pickedTexts = pickedTextList
      .map((k) => answerMap[k] ?? `(option ${k})`)
      .filter(Boolean);

    // Build user prompt từ dynamic helper
    let user = buildUserPrompt({
      quiz,
      contextTexts,
      pickedTexts,
      lang,
      style,
    });

    // Nếu là language style, thêm yêu cầu giải thích meaning của key words
    if (style === "language") {
      const correctAnswerText = answerMap[quiz.correctAnswers?.[0]];
      const keyWords = extractKeyVocabulary(correctAnswerText || quiz.question);
      if (keyWords && keyWords.length > 0) {
        const vocabSection =
          lang === "vi"
            ? `\n\n[TỪKHÓA CẦN GIẢI THÍCH MEANING]\n${keyWords.join(", ")}`
            : `\n\n[KEY WORDS TO EXPLAIN MEANING]\n${keyWords.join(", ")}`;
        user += vocabSection;
      }
    }

    const schema = {
      type: "object",
      properties: {
        explanation: { type: "string" },
        short_hint: { type: "string" },
        examples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              meaning: { type: "string" },
            },
            required: ["content"],
            additionalProperties: false,
          },
        },
        correctness: {
          type: "string",
          enum: ["unknown", "correct", "incorrect"],
        },
      },
      required: ["explanation", "examples", "correctness"],
      additionalProperties: false,
    };

    const correctness =
      typeof isCorrect === "boolean"
        ? isCorrect
          ? "correct"
          : "incorrect"
        : "unknown";

    const seed = {
      correctness,
      short_hint: getStyleHint(style, lang),
    };

    console.log("[AI Explain] Calling LLM with style:", style);
    const ai = await callLLMJSON({
      system,
      user,
      schema,
      seedObject: seed,
      lang,
    });

    // 7) Trim explanation để tránh lan man
    const trimmedAi = {
      ...ai,
      explanation: ensureCodeFenceIntegrity(
        autoWrapCode(trimToWordLimit(ai.explanation, 160))
      ),
      short_hint: trimToWordLimit(ai.short_hint, 50),
      examples: (ai.examples || []).map((ex) => ({
        title: ex.title,
        content: ensureCodeFenceIntegrity(
          autoWrapCode(trimToWordLimit(ex.content, 120))
        ),
        meaning: trimToWordLimit(ex.meaning, 80),
      })),
    };

    console.log("[AI Explain] LLM Response trimmed");

    return res.json({
      quizId,
      lessonId: quiz.lesson,
      courseId: quiz.course,
      courseTitle: course.title,
      courseStyle: style,
      correctness,
      ...trimmedAi,
    });
  } catch (err) {
    console.error("[AI Explain]", err);
    return res
      .status(500)
      .json({ error: "Explain failed", detail: err.message });
  }
};
