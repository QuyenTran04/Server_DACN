const mongoose = require("mongoose");
const { Schema } = mongoose;
const Chunk = require("./Chunk");
const { splitToChunks, sha1 } = require("../utils/text-chunk");
const { embedBatch } = require("../services/embedding.service");

const autoOn = String(process.env.AUTO_EMBEDDING_ENABLED || "true") === "true";

const lessonSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    videoUrl: String,
    content: String,
    order: { type: Number, default: 0 }, 
    resources: [String], 
  },
  { timestamps: true }
);

async function reindexLesson(doc) {
  if (!autoOn) return; // cho phép tắt nhanh qua env
  const { _id: lessonId, course: courseId, title, content } = doc || {};

  // gộp text: có thể bổ sung fields khác (resources, transcript, ...)
  const baseText = [title || "", content || ""].filter(Boolean).join("\n");

  // nếu không có nội dung -> xóa chunk cũ
  if (!baseText.trim()) {
    await Chunk.deleteMany({ source: "lesson", sourceId: lessonId });
    return;
  }

  // 1) chunking
  const parts = splitToChunks(baseText);
  if (!parts.length) {
    await Chunk.deleteMany({ source: "lesson", sourceId: lessonId });
    return;
  }

  // 2) embed theo batch
  const { vectors, model, provider, dims } = await embedBatch(parts);

  // 3) xóa cũ -> chèn mới (đơn giản, an toàn)
  await Chunk.deleteMany({ source: "lesson", sourceId: lessonId });

  const docs = parts.map((text, i) => ({
    source: "lesson",
    sourceId: lessonId,
    courseId,
    lessonId,
    sourceIdStr: String(lessonId),
    courseIdStr: String(courseId),
    lessonIdStr: String(lessonId),
    text,
    vector: vectors[i],
    dims,
    provider,
    model,
    hash: sha1(`lesson:${lessonId}:${text}`),
  }));

  if (docs.length) await Chunk.insertMany(docs, { ordered: false });
}

// TỰ ĐỘNG SAU KHI TẠO / SỬA / XÓA
// create/save
lessonSchema.post("save", async function (doc, next) {
  try {
    await reindexLesson(doc);
    console.log(`[Lesson.save] Reindexed lesson ${doc._id}`);
  } catch (e) {
    console.error("[Lesson.save]", e.message);
  }
  next();
});

// findOneAndUpdate / findByIdAndUpdate
lessonSchema.post("findOneAndUpdate", async function (_res, next) {
  try {
    const doc = await this.model.findById(
      this.getQuery()._id || this.getQuery().id
    );
    if (doc) await reindexLesson(doc);
  } catch (e) {
    console.error("[Lesson.update]", e.message);
  }
  next();
});

// deleteOne({ document:true })
lessonSchema.post("deleteOne", { document: true }, async function (doc, next) {
  try {
    await Chunk.deleteMany({ source: "lesson", sourceId: doc._id });
  } catch (e) {
    console.error("[Lesson.deleteOne]", e.message);
  }
  next();
});

// findOneAndDelete / findByIdAndDelete
lessonSchema.post("findOneAndDelete", async function (res, next) {
  try {
    const id = res?._id || this.getQuery()._id || this.getQuery().id;
    if (id) await Chunk.deleteMany({ source: "lesson", sourceId: id });
  } catch (e) {
    console.error("[Lesson.findOneAndDelete]", e.message);
  }
  next();
});

module.exports = mongoose.model("Lesson", lessonSchema);
