// services/gemini.service.js
// Adapter Gemini cho flow tạo quiz LMS.
// Env cần: GEMINI_API_KEY, (tùy chọn) GEMINI_MODEL=gemini-2.0-flash

const axios = require("axios");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

function ensureKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
}

/** Bóc JSON mảng một cách "chịu lỗi" */
function safeJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    if (parsed && Array.isArray(parsed.quizzes)) return parsed.quizzes;
  } catch (e) {
    const m = String(raw).match(/\[\s*{[\s\S]*}\s*\]/);
    if (m) {
      try {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) return arr;
      } catch {}
    }
  }
  return [];
}

/** Sinh danh sách câu hỏi trắc nghiệm từ text */
async function extractQuestions(text, { maxQuestions = 12 } = {}) {
  ensureKey();

  const prompt = `Bạn là trợ lý tạo trắc nghiệm cho hệ thống LMS.
Chỉ trả về JSON MẢNG, KHÔNG kèm giải thích.
Mỗi phần tử dạng: 
{ "content": "string", "options": ["string",...], "answer": "string (optional)" }
Yêu cầu:
- Ưu tiên 1 đáp án đúng (nhưng có thể đa chọn nếu văn bản yêu cầu).
- Không sinh đáp án mơ hồ kiểu "Tất cả đều đúng" trừ khi cần.
- Tối đa ${maxQuestions} câu, rõ ràng.

Văn bản nguồn:
"""${String(text || "").slice(0, 15000)}"""`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    },
    { timeout: 60000 }
  );

  const answer =
    response?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  const arr = safeJsonArray(answer);

  const normalized = arr
    .filter((q) => q && (q.content || q.question) && (q.options || q.choices))
    .map((q) => ({
      content: String(q.content || q.question).trim(),
      options: Array.isArray(q.options)
        ? q.options.map(String)
        : Array.isArray(q.choices)
        ? q.choices.map(String)
        : [],
      answer: q.answer ? String(q.answer).trim() : undefined,
    }))
    .filter(
      (q) => q.content && Array.isArray(q.options) && q.options.length >= 2
    );

  return normalized;
}

/** Giải 1 câu MCQ: trả về **nội dung đáp án đúng** (text) */
async function solveQuestion(question) {
  ensureKey();

  const { content, options } = question || {};
  if (!content || !Array.isArray(options) || options.length < 2) {
    throw new Error("Invalid question payload for solveQuestion");
  }
  const letters = options.map((_, i) => String.fromCharCode(65 + i));
  const prompt = `Chọn đáp án đúng và CHỈ trả về nội dung đáp án (không kèm chữ cái).
Câu hỏi: ${content}
Đáp án:
${options.map((op, i) => `${letters[i]}. ${op}`).join("\n")}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.0 },
    },
    { timeout: 60000 }
  );

  return (
    response?.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ""
  );
}

module.exports = {
  extractQuestions,
  solveQuestion,
};
