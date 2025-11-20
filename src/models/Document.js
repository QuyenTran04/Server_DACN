const mongoose = require("mongoose");
const { Schema } = mongoose;
const Chunk = require("./Chunk");
const { splitToChunks, sha1 } = require("../utils/text-chunk");
const { embedBatch } = require("../services/embedding.service");

const autoOn = String(process.env.AUTO_EMBEDDING_ENABLED || "true") === "true";

const documentSchema = new Schema(
  {
    lesson: {
      type: Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      enum: ["text", "markdown", "html", "pdf"],
      default: "markdown",
    },
    generatedByAI: {
      type: Boolean,
      default: false,
    },
    fileUrl: String,
    summary: String,
    tags: [String],
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);
async function reindexDocument(doc) {
  if (!autoOn) return;

  const {
    _id: documentId,
    lesson: lessonId,
    course: courseId,
    title,
    content,
  } = doc || {};

  const baseText = [title || "", content || ""].filter(Boolean).join("\n");

  if (!baseText.trim()) {
    await Chunk.deleteMany({ source: "document", lessonId });
    return;
  }

  const parts = splitToChunks(baseText);
  if (!parts.length) {
    await Chunk.deleteMany({ source: "document", lessonId });
    return;
  }

  const { vectors, model, provider, dims } = await embedBatch(parts);

  // XÓA tất cả chunk document của bài học này
  await Chunk.deleteMany({ source: "document", lessonId });

  // TẠO lại chunk document mới cho bài học
  const docs = parts.map((text, i) => ({
    source: "document",
    sourceId: documentId,
    courseId,
    lessonId,

    sourceIdStr: String(documentId),
    courseIdStr: String(courseId),
    lessonIdStr: String(lessonId),

    text,
    vector: vectors[i],
    dims,
    provider,
    model,
    hash: sha1(`document:${documentId}:${text}`),
  }));

  if (docs.length) {
    await Chunk.insertMany(docs, { ordered: false });
  }
}
// Tự embed khi tạo / sửa / xoá document

documentSchema.post("save", async function (doc, next) {
  try {
    await reindexDocument(doc);
  } catch (e) {
    console.error("[Document.save]", e.message);
  }
  next();
});

documentSchema.post("findOneAndUpdate", async function (_res, next) {
  try {
    const doc = await this.model.findById(
      this.getQuery()._id || this.getQuery().id
    );
    if (doc) await reindexDocument(doc);
  } catch (e) {
    console.error("[Document.update]", e.message);
  }
  next();
});

documentSchema.post("deleteOne", { document: true }, async function (doc, next) {
  try {
    await Chunk.deleteMany({ source: "document", lessonId: doc.lesson });
  } catch (e) {
    console.error("[Document.deleteOne]", e.message);
  }
  next();
});

documentSchema.post("findOneAndDelete", async function (res, next) {
  try {
    const lessonId =
      res?.lesson || this.getQuery().lesson || this.getQuery().lessonId;
    if (lessonId) {
      await Chunk.deleteMany({ source: "document", lessonId });
    }
  } catch (e) {
    console.error("[Document.findOneAndDelete]", e.message);
  }
  next();
});


documentSchema.index({ course: 1, lesson: 1 });
documentSchema.index({ course: 1 });

module.exports = mongoose.model("Document", documentSchema);
