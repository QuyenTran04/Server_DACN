const axios = require("axios");

const apiKey = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const MAX_TOKENS = Number(process.env.GEMINI_MAX_TOKENS || 2048);
const TEMPERATURE = Number(process.env.GEMINI_TEMPERATURE || 0.4);
function ensureKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
}
const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args));

const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function jitter(base) {
  return base + Math.floor(Math.random() * 150);
}

function safeParseJson(text) {
  let raw = String(text || "").trim();

  console.log(`[safeParseJson] Input (first 200 chars):`, raw.substring(0, 200));

  // 1) Gỡ code fences ```json ... ``` hoặc ```
  raw = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // 2) Thử parse trực tiếp
  try {
    const parsed = JSON.parse(raw);
    console.log(`[safeParseJson] ✓ Direct parse success`);
    return parsed;
  } catch (e) {
    console.log(`[safeParseJson] Direct parse failed:`, e.message);
  }

  // 3) Tìm object JSON đầu tiên có đủ cặp {} (simple balancing)
  const start = raw.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = raw.slice(start, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            console.log(`[safeParseJson] ✓ Bracket balance parse success`);
            return parsed;
          } catch {}
          break;
        }
      }
    }
  }

  // 4) Nỗ lực cuối: bóc object cuối chuỗi
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      console.log(`[safeParseJson] ✓ Regex match parse success`);
      return parsed;
    } catch {}
  }

  console.error(`[safeParseJson] ❌ All parse methods failed. Raw text:`, raw.substring(0, 500));
  throw new Error("AI JSON invalid");
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

async function callGeminiJSON({
  systemPrompt,
  userPrompt,
  apiKey = process.env.GEMINI_API_KEY,
  temperature = TEMPERATURE,
  maxOutputTokens = MAX_TOKENS,
  retries = 3,
}) {
  ensureKey();
  const url = geminiUrl;

  console.log(`[callGeminiJSON] Calling Gemini API with:`, {
    model: MODEL,
    temperature,
    maxOutputTokens,
    promptLen: `system:${systemPrompt?.length || 0}, user:${userPrompt?.length || 0}`,
  });

  const body = {
    contents: [
      {
        parts: [{ text: `${systemPrompt || ""}\n\n---\n${userPrompt || ""}` }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: "application/json",
    },
  };

  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      console.log(`[callGeminiJSON] Attempt ${i + 1}/${retries + 1}...`);
      const resp = await axios.post(url, body, { timeout: 60000 });
      const text =
        resp.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      console.log(`[callGeminiJSON] ✓ Response received:`, {
        textLen: text?.length,
        firstChars: text?.substring(0, 100),
      });
      return safeParseJson(text);
    } catch (e) {
      lastErr = e;
      const code = Number(String(e?.message).match(/\b(\d{3})\b/)?.[1] || 0);
      const retryable =
        code === 500 ||
        code === 502 ||
        code === 503 ||
        code === 504 ||
        String(e?.message).includes("ECONNRESET") ||
        String(e?.message).includes("timeout") ||
        String(e?.code).includes("ENOTFOUND");

      if (!retryable || i === retries) throw e;
      await sleep(jitter(300 * Math.pow(2, i))); // 300ms, ~600ms, ~1200ms (+jitter)
    }
  }
  throw lastErr;
}

// ===== High-level wrapper cho Controller =====
async function generateCourseDraftJSON({ systemPrompt, userPrompt }) {
  // Chỉ Gemini, có retry
  return await callGeminiJSON({ systemPrompt, userPrompt, retries: 2 });
}

async function chatWithGemini({ system, user }) {
  if (!process.env.GEMINI_API_KEY) {
    return "Xin lỗi, hệ thống AI đang bận. Vui lòng thử lại sau.";
  }
  try {
    const prompt = `${system}\n\nNgười dùng: ${user}\n\nGia sư:`;
    const r = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        (process.env.GEMINI_MODEL || "gemini-1.5-flash") +
        ":generateContent?key=" +
        process.env.GEMINI_API_KEY,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 15000 }
    );
    return (
      r?.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Xin lỗi, mình chưa có câu trả lời phù hợp."
    );
  } catch (e) {
    console.error("Gemini fallback error:", e?.response?.data || e.message);
    return "Xin lỗi, hệ thống AI đang bận. Vui lòng thử lại sau.";
  }
}
module.exports = {
  extractQuestions,
  solveQuestion,
  callGeminiJSON,
  generateCourseDraftJSON,
  chatWithGemini,
};
