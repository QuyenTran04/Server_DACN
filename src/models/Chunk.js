const mongoose = require("mongoose");
const { Schema } = mongoose;

const chunkSchema = new Schema(
  {
    source: {
      type: String,
      enum: ["lesson", "course", "quiz"],
      required: true,
    },
    sourceId: { type: Schema.Types.ObjectId, required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course" },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson" },
    sourceIdStr: { type: String, index: true },
    courseIdStr: { type: String, index: true },
    lessonIdStr: { type: String, index: true },

    text: { type: String, required: true },
    vector: { type: [Number], default: [] }, // Atlas Vector Search sẽ index trường này
    dims: { type: Number },

    provider: { type: String, default: "gemini" },
    model: {
      type: String,
      default: process.env.GEMINI_EMBED_MODEL || "embedding-001",
    },

    hash: { type: String, index: true },
    lang: { type: String, default: "vi" },
  },
  { timestamps: true, collection: "lms_chunks" }
);

chunkSchema.index({ source: 1, sourceId: 1 });
chunkSchema.index({ courseId: 1, lessonId: 1 });

module.exports = mongoose.model("Chunk", chunkSchema);
