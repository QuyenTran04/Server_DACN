const axios = require("axios");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RAW_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001"; // nên dùng model này
const OUTPUT_DIM = parseInt(process.env.GEMINI_EMBED_DIM || "3072", 10); // đặt 768/1536/3072

// Luôn có tiền tố "models/"
const MODEL_ID = RAW_MODEL.startsWith("models/")
  ? RAW_MODEL
  : `models/${RAW_MODEL}`;

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${RAW_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;

function isNonEmptyString(s) {
  return typeof s === "string" && s.trim().length > 0;
}

// Chuẩn hoá L2 cho vector (khuyến nghị khi dùng 768/1536)
function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

exports.embedBatch = async (texts) => {
  if (!Array.isArray(texts) || texts.length === 0)
    throw new Error("No text provided for embedding");
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

  const cleaned = texts
    .map((t) => (typeof t === "string" ? t.replace(/\u0000/g, "") : ""))
    .map((t) => t.trim())
    .filter(isNonEmptyString);
  if (cleaned.length === 0)
    throw new Error("All texts are empty after cleaning");

  const MAX_LEN = 4000;
  const capped = cleaned.map((t) =>
    t.length > MAX_LEN ? t.slice(0, MAX_LEN) : t
  );

  // Mỗi request có "model", "content", và "output_dimensionality"
  const makePayload = (arr) => ({
    requests: arr.map((t) => ({
      model: MODEL_ID,
      content: { parts: [{ text: t }] },
      output_dimensionality: OUTPUT_DIM, // <<< quan trọng để rút về 768
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
    // Chuẩn hoá khi không phải 3072
    const normalized = OUTPUT_DIM !== 3072 ? vectors.map(l2Normalize) : vectors;

    return normalized;
  }

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
    model: RAW_MODEL,
    provider: "gemini",
    dims: vectors[0]?.length || OUTPUT_DIM, // lấy đúng chiều thực tế trả về
  };
};

exports.embedOne = async (text) => {
  const { vectors, model, provider, dims } = await exports.embedBatch([text]);
  return { vector: vectors[0], model, provider, dims };
};
