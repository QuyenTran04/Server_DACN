const Lesson = require("../models/Lesson");
const Chunk = require("../models/Chunk");
const { splitToChunks, sha1 } = require("../utils/text-chunk");
const { embedBatch } = require("../services/embedding.service");

async function reindexLessonDoc(lesson) {
  const { _id: lessonId, course: courseId, title, content } = lesson || {};
  const baseText = [title || "", content || ""].filter(Boolean).join("\n");

  if (!baseText.trim()) {
    const del = await Chunk.deleteMany({
      source: "lesson",
      sourceId: lessonId,
    });
    return { inserted: 0, deleted: del.deletedCount };
  }

  const parts = splitToChunks(baseText);
  const { vectors, model, provider, dims } = await embedBatch(parts);

  const del = await Chunk.deleteMany({ source: "lesson", sourceId: lessonId });
  const docs = parts.map((text, i) => ({
    source: "lesson",
    sourceId: lessonId,
    courseId,
    lessonId,
    text,
    vector: vectors[i],
    dims,
    provider,
    model,
    hash: sha1(`lesson:${lessonId}:${text}`),
  }));
  const inserted = docs.length
    ? await Chunk.insertMany(docs, { ordered: false })
    : [];
  return { inserted: inserted.length, deleted: del.deletedCount };
}

exports.reindexLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const lesson = await Lesson.findById(id);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    const result = await reindexLessonDoc(lesson);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
