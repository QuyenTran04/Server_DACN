const axios = require("axios");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RAW_MODEL = process.env.GEMINI_EMBED_MODEL || "embedding-001";

// Chuẩn hoá để luôn có tiền tố "models/"
const MODEL_ID = RAW_MODEL.startsWith("models/")
  ? RAW_MODEL
  : `models/${RAW_MODEL}`;

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${RAW_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;

function isNonEmptyString(s) {
  return typeof s === "string" && s.trim().length > 0;
}

exports.embedBatch = async (texts) => {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("No text provided for embedding");
  }
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

  // 1) Làm sạch/giới hạn
  const cleaned = texts
    .map((t) => (typeof t === "string" ? t.replace(/\u0000/g, "") : ""))
    .map((t) => t.trim())
    .filter(isNonEmptyString);

  if (cleaned.length === 0)
    throw new Error("All texts are empty after cleaning");

  const MAX_LEN = 4000; // tránh INVALID_ARGUMENT do quá dài
  const capped = cleaned.map((t) =>
    t.length > MAX_LEN ? t.slice(0, MAX_LEN) : t
  );

  // 2) payload ĐÚNG CHUẨN: mỗi request có "model" + "content.parts[].text"
  const makePayload = (arr) => ({
    requests: arr.map((t) => ({
      model: MODEL_ID, // <<< QUAN TRỌNG
      content: { parts: [{ text: t }] },
    })),
  });

  async function callBatch(arr) {
    const { data } = await axios.post(GEMINI_URL, makePayload(arr), {
      timeout: 25000,
    });
    const list =
      data?.embeddings || data?.responses || data?.batchEmbeddings || [];
    const vectors = list
      .map((e) => e?.values || e?.embedding?.values || e?.embedding)
      .filter((v) => Array.isArray(v));
    if (vectors.length !== arr.length) {
      throw new Error(
        `Embedding response size mismatch: got ${vectors.length}, expected ${arr.length}`
      );
    }
    return vectors;
  }

  // 3) Gọi, nếu 400/413 do batch to → tách đôi
  async function requestWithSplit(arr) {
    try {
      return await callBatch(arr);
    } catch (err) {
      const status = err?.response?.status;
      if ((status === 400 || status === 413) && arr.length > 1) {
        const mid = Math.floor(arr.length / 2);
        const left = await requestWithSplit(arr.slice(0, mid));
        const right = await requestWithSplit(arr.slice(mid));
        return left.concat(right);
      }
      console.error(
        "[Embedding][Gemini] error:",
        JSON.stringify(err?.response?.data || err.message, null, 2)
      );
      throw err;
    }
  }

  const vectors = await requestWithSplit(capped);
  return {
    vectors,
    model: RAW_MODEL, // ví dụ "embedding-001"
    provider: "gemini",
    dims: vectors[0]?.length || 0,
  };
};

exports.embedOne = async (text) => {
  const { vectors, model, provider, dims } = await exports.embedBatch([text]);
  return { vector: vectors[0], model, provider, dims };
};
