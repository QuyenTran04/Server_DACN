const { callGeminiJSON } = require("./gemini.service");

/**
 * Gọi LLM với JSON schema
 * @param {Object} config
 * @param {string} config.system - system prompt
 * @param {string} config.user - user prompt
 * @param {Object} config.schema - JSON schema định nghĩa format response
 * @param {Object} config.seedObject - object seed với default values
 * @param {string} config.lang - ngôn ngữ ('vi' hoặc 'en')
 * @returns {Promise<Object>} parsed JSON response
 */
async function callLLMJSON({
  system,
  user,
  schema,
  seedObject = {},
  lang = "vi",
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
    const result = await callGeminiJSON({
      systemPrompt,
      userPrompt: fullUserPrompt,
      temperature: 0.3,
      maxOutputTokens: 8192,
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

module.exports = {
  callLLMJSON,
};
