const mongoose = require("mongoose");
const { Schema } = mongoose;
const Chunk = require("./Chunk");
const { splitToChunks, sha1 } = require("../utils/text-chunk");
const { embedBatch } = require("../services/embedding.service");

const autoOn = String(process.env.AUTO_EMBEDDING_ENABLED || "true") === "true";

const optionSchema = new Schema(
  {
    text: { type: String }, 
    imageUrl: { type: String },
  },
  { _id: false } 
);

const quizSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    lesson: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    question: { type: String, required: true },
    imageUrl: { type: String },
    options: {
      type: [optionSchema],
      validate: (v) => Array.isArray(v) && v.length >= 2,
    },
    correctAnswers: {
      type: [String],
      required: true,
      validate: (v) => Array.isArray(v) && v.length >= 1,
    },
  },
  { timestamps: true }
);

function buildQuizText(doc) {
  // KHÔNG nhúng đáp án đúng để tránh lộ (chỉ question + options)
  const lines = [];
  if (doc.question) lines.push(doc.question);
  if (Array.isArray(doc.options)) {
    const optsText = doc.options
      .map((o, idx) => (o?.text ? `Option ${idx + 1}: ${o.text}` : null))
      .filter(Boolean)
      .join("\n");
    if (optsText) lines.push(optsText);
  }
  return lines.join("\n").trim();
}

async function reindexQuiz(doc) {
  if (!autoOn) return;
  const { _id: quizId, course, lesson } = doc || {};

  const baseText = buildQuizText(doc);
  if (!baseText) {
    await Chunk.deleteMany({ source: "quiz", sourceId: quizId });
    return;
  }

  const parts = splitToChunks(baseText, 700, 250); // quiz thường ngắn → chunk nhỏ hơn
  const { vectors, model, provider, dims } = await embedBatch(parts);

  await Chunk.deleteMany({ source: "quiz", sourceId: quizId });

  const docs = parts.map((text, i) => ({
    source: "quiz",
    sourceId: quizId,
    courseId: course,
    lessonId: lesson,
    text,
    vector: vectors[i],
    dims,
    provider,
    model,
    hash: sha1(`quiz:${quizId}:${text}`),
  }));

  if (docs.length) await Chunk.insertMany(docs, { ordered: false });
}

quizSchema.post("save", async function (doc, next) {
  try {
    await reindexQuiz(doc);
  } catch (e) {
    console.error("[Quiz.save]", e.message);
  }
  next();
});

quizSchema.post("findOneAndUpdate", async function (_res, next) {
  try {
    const doc = await this.model.findById(
      this.getQuery()._id || this.getQuery().id
    );
    if (doc) await reindexQuiz(doc);
  } catch (e) {
    console.error("[Quiz.update]", e.message);
  }
  next();
});

quizSchema.post("deleteOne", { document: true }, async function (doc, next) {
  try {
    await Chunk.deleteMany({ source: "quiz", sourceId: doc._id });
  } catch (e) {
    console.error("[Quiz.deleteOne]", e.message);
  }
  next();
});

quizSchema.post("findOneAndDelete", async function (res, next) {
  try {
    const id = res?._id || this.getQuery()._id || this.getQuery().id;
    if (id) await Chunk.deleteMany({ source: "quiz", sourceId: id });
  } catch (e) {
    console.error("[Quiz.findOneAndDelete]", e.message);
  }
  next();
});

module.exports = mongoose.model("Quiz", quizSchema);
