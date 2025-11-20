const { callGeminiJSON } = require("./gemini.service");

/**
 * Gọi LLM với JSON schema và timeout cải thiện
 * @param {Object} config
 * @param {string} config.system - system prompt
 * @param {string} config.user - user prompt
 * @param {Object} config.schema - JSON schema định nghĩa format response
 * @param {Object} config.seedObject - object seed với default values
 * @param {string} config.lang - ngôn ngữ ('vi' hoặc 'en')
 * @param {number} config.timeoutMs - custom timeout trong milliseconds
 * @param {number} config.maxTokens - maximum output tokens
 * @returns {Promise<Object>} parsed JSON response
 */
async function callLLMJSONWithImprovedTimeout({
  system,
  user,
  schema,
  seedObject = {},
  lang = "vi",
  timeoutMs = 300000, // 5 minutes default
  maxTokens = 16384, // Increased from 8192
} = {}) {
  const systemPrompt =
    system ||
    (lang === "vi"
      ? "Bạn là trợ giảng môn học. Trả lời súc tích, dễ hiểu, dùng ví dụ cụ thể/đời thực. LUÔN trả về JSON hợp lệ."
      : "You are a teaching assistant. Explain concisely with concrete, real-world examples. ALWAYS return valid JSON.");

  const userPrompt = user || "";
  const schemaPart =
    schema && Object.keys(schema).length > 0
      ? `\n\n[RESPONSE SCHEMA]\nBạn PHẢI trả về JSON với cấu trúc:\n${JSON.stringify(schema, null, 2)}`
      : "";

  const fullUserPrompt = `${userPrompt}${schemaPart}`;

  try {
    const result = await callGeminiJSONWithImprovedTimeout({
      systemPrompt,
      userPrompt: fullUserPrompt,
      temperature: 0.3,
      maxOutputTokens: maxTokens,
      timeoutMs,
    });

    // Merge với seed object để ensure required fields tồn tại
    if (seedObject && typeof seedObject === "object") {
      return { ...seedObject, ...result };
    }

    return result;
  } catch (err) {
    console.error("[LLM Service Error]", err.message);
    throw new Error(`LLM call failed: ${err.message}`);
  }
}

/**
 * Wrapper cho callGeminiJSON với timeout tùy chỉnh
 */
async function callGeminiJSONWithImprovedTimeout({
  systemPrompt,
  userPrompt,
  apiKey = process.env.GEMINI_API_KEY,
  temperature = process.env.GEMINI_TEMPERATURE || 0.4,
  maxOutputTokens = 16384,
  timeoutMs = 300000, // 5 minutes
  retries = 3,
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.0-flash"}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  console.log(`[callGeminiJSONImproved] Calling with:`, {
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    temperature,
    maxOutputTokens,
    timeout: timeoutMs,
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
      console.log(`[callGeminiJSONImproved] Attempt ${i + 1}/${retries + 1}...`);

      const resp = await require("axios").post(url, body, {
        timeout: timeoutMs,
        // Add additional axios config for better timeout handling
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const text =
        resp.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

      console.log(`[callGeminiJSONImproved] ✓ Response received:`, {
        textLen: text?.length,
        firstChars: text?.substring(0, 100),
      });

      // Validate JSON before returning
      const parsed = safeParseJson(text);

      // Additional check for incomplete responses
      if (text.length > 0 && text.length < 100) {
        console.warn(`[callGeminiJSONImproved] ⚠️ Response suspiciously short: ${text.length} chars`);
      }

      return parsed;
    } catch (e) {
      lastErr = e;

      // Enhanced error handling
      const isTimeout = e?.code === 'ECONNABORTED' || e?.message?.includes('timeout');
      const isRateLimit = e?.response?.status === 429;
      const isServerError = e?.response?.status >= 500;

      const retryable = isTimeout || isRateLimit || isServerError ||
        String(e?.message).includes("ECONNRESET") ||
        String(e?.code).includes("ENOTFOUND");

      console.error(`[callGeminiJSONImproved] ❌ Attempt ${i + 1} failed:`, {
        message: e?.message,
        code: e?.code,
        status: e?.response?.status,
        retryable,
        isTimeout,
      });

      if (!retryable || i === retries) {
        break;
      }

      // Progressive backoff with jitter
      const baseDelay = Math.min(1000 * Math.pow(2, i), 30000); // Max 30s
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;

      console.log(`[callGeminiJSONImproved] ⏳ Waiting ${Math.round(delay)}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  console.error(`[callGeminiJSONImproved] ❌ All ${retries + 1} attempts failed`);
  throw lastErr;
}

function safeParseJson(text) {
  let raw = String(text || "").trim();

  console.log(`[safeParseJsonImproved] Input (first 200 chars):`, raw.substring(0, 200));

  // Check for obvious truncation
  const suspiciousEndings = ["...", "•", "-", "[", "{", "```", "\n", "\r"];
  const trimmed = raw.trim();
  const lastChar = trimmed[trimmed.length - 1];

  if (suspiciousEndings.includes(lastChar) && trimmed.length > 10) {
    console.warn(`[safeParseJsonImproved] ⚠️ Content appears to be cut off (ends with: "${lastChar}")`);
  }

  // 1) Remove code fences
  raw = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // 2) Try direct parse
  try {
    const parsed = JSON.parse(raw);
    console.log(`[safeParseJsonImproved] ✓ Direct parse success`);
    return parsed;
  } catch (e) {
    console.log(`[safeParseJsonImproved] Direct parse failed:`, e.message);
  }

  // 3) Try bracket balancing
  const start = raw.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (ch === '\\') {
        escapeNext = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            const candidate = raw.slice(start, i + 1);
            try {
              const parsed = JSON.parse(candidate);
              console.log(`[safeParseJsonImproved] ✓ Bracket balance parse success`);

              // Warn if we cut off content
              if (i + 1 < raw.length) {
                const remaining = raw.slice(i + 1).trim();
                if (remaining.length > 5) {
                  console.warn(`[safeParseJsonImproved] ⚠️ Truncated ${remaining.length} characters after valid JSON`);
                }
              }

              return parsed;
            } catch (err) {
              console.log(`[safeParseJsonImproved] Bracket parse failed:`, err.message);
            }
            break;
          }
        }
      }
    }
  }

  // 4) Final attempt - find last complete object
  const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const matches = [...raw.matchAll(objectRegex)];

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1][0];
    try {
      const parsed = JSON.parse(lastMatch);
      console.log(`[safeParseJsonImproved] ✓ Regex match parse success`);
      return parsed;
    } catch (e) {
      console.log(`[safeParseJsonImproved] Regex parse failed:`, e.message);
    }
  }

  console.error(`[safeParseJsonImproved] ❌ All parse methods failed. Raw text (first 500 chars):`, raw.substring(0, 500));
  throw new Error("AI JSON invalid or incomplete");
}

module.exports = {
  callLLMJSON: callLLMJSONWithImprovedTimeout,
  callGeminiJSON: callGeminiJSONWithImprovedTimeout,
  safeParseJson,
};