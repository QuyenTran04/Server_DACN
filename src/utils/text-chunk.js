const crypto = require("crypto");

function splitToChunks(text, maxLen = 900, minLen = 300) {
  if (!text) return [];
  const sentences = text
    .replace(/\r/g, " ")
    .split(/(?<=[\.!\?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length <= maxLen)
      buf = (buf ? buf + " " : "") + s;
    else {
      if (buf) chunks.push(buf);
      buf = s;
    }
  }
  if (buf) chunks.push(buf);

  // gộp mẩu quá ngắn để giảm số lần gọi API
  const merged = [];
  for (const c of chunks) {
    if (merged.length && c.length < minLen)
      merged[merged.length - 1] += " " + c;
    else merged.push(c);
  }
  return merged;
}

const sha1 = (s) => crypto.createHash("sha1").update(s, "utf8").digest("hex");

module.exports = { splitToChunks, sha1 };
