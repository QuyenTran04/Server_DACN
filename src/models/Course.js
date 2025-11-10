const mongoose = require("mongoose");
const { Schema } = mongoose;
const Chunk = require("./Chunk");
const { splitToChunks, sha1 } = require("../utils/text-chunk");
const { embedBatch } = require("../services/embedding.service");

const autoOn = String(process.env.AUTO_EMBEDDING_ENABLED || "true") === "true";

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true },
    price: { type: Number, default: 0, min: 0 },
    imageUrl: String,
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    instructor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    published: { type: Boolean, default: false },
    explanationGuideline: {
      type: String,
      enum: [
        "technical",
        "science",
        "math",
        "language",
        "humanities",
        "business",
        "arts",
        "auto",
      ],
      default: "auto",
      description:
        "Phong cách giải thích AI. 'auto' = tự phân tích từ title/description",
    },
  },
  { timestamps: true }
);

async function reindexCourse(doc) {
  if (!autoOn) return;
  const { _id: courseId, title, description } = doc || {};

  const baseText = [title || "", description || ""].filter(Boolean).join("\n");
  if (!baseText.trim()) {
    await Chunk.deleteMany({ source: "course", sourceId: courseId });
    return;
  }

  const parts = splitToChunks(baseText);
  if (!parts.length) {
    await Chunk.deleteMany({ source: "course", sourceId: courseId });
    return;
  }

  const { vectors, model, provider, dims } = await embedBatch(parts);

  await Chunk.deleteMany({ source: "course", sourceId: courseId });

  const docs = parts.map((text, i) => ({
    source: "course",
    sourceId: courseId,
    courseId,
    sourceIdStr: String(courseId),
    courseIdStr: String(courseId),
    text,
    vector: vectors[i],
    dims,
    provider,
    model,
    hash: sha1(`course:${courseId}:${text}`),
  }));

  if (docs.length) await Chunk.insertMany(docs, { ordered: false });
}

courseSchema.post("save", async function (doc, next) {
  try {
    await reindexCourse(doc);
  } catch (e) {
    console.error("[Course.save]", e.message);
  }
  next();
});

courseSchema.post("findOneAndUpdate", async function (_res, next) {
  try {
    const doc = await this.model.findById(
      this.getQuery()._id || this.getQuery().id
    );
    if (doc) await reindexCourse(doc);
  } catch (e) {
    console.error("[Course.update]", e.message);
  }
  next();
});

courseSchema.post("deleteOne", { document: true }, async function (doc, next) {
  try {
    await Chunk.deleteMany({ source: "course", sourceId: doc._id });
  } catch (e) {
    console.error("[Course.deleteOne]", e.message);
  }
  next();
});

courseSchema.post("findOneAndDelete", async function (res, next) {
  try {
    const id = res?._id || this.getQuery()._id || this.getQuery().id;
    if (id) await Chunk.deleteMany({ source: "course", sourceId: id });
  } catch (e) {
    console.error("[Course.findOneAndDelete]", e.message);
  }
  next();
});

module.exports = mongoose.model("Course", courseSchema);
