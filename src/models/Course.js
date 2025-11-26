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
    // Rating trung bình của khóa học (thang điểm 10)
    avgRating: { type: Number, default: 0, min: 0, max: 10 },
    // Tổng số người đã đánh giá
    totalReviews: { type: Number, default: 0 },
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

/**
 * Cập nhật rating trung bình của khóa học
 * Được gọi khi có thay đổi về đánh giá
 */
async function updateCourseRating(courseId) {
  try {
    const Review = require("./Review");
    if (!courseId) return { avgRating: 0, totalReviews: 0 };

    let courseObjId;
    try {
      courseObjId =
        typeof courseId === "string"
          ? new mongoose.Types.ObjectId(courseId)
          : courseId;
    } catch (_e) {
      // Nếu không chuyển được ObjectId thì trả về mặc định
      return { avgRating: 0, totalReviews: 0 };
    }

    const stats = await Review.aggregate([
      { $match: { course: courseObjId, hidden: { $ne: true } } },
      {
        $group: {
          _id: "$course",
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const ratingData = stats[0] || { avgRating: 0, totalReviews: 0 };

    await Course.findByIdAndUpdate(courseId, {
      avgRating: Math.round(ratingData.avgRating * 10) / 10, // Làm tròn 1 chữ số thập phân
      totalReviews: ratingData.totalReviews,
    });

    return ratingData;
  } catch (error) {
    console.error("[updateCourseRating] Error:", error);
    return { avgRating: 0, totalReviews: 0 };
  }
}

// Export helper function để sử dụng trong review controller
courseSchema.statics.updateRating = updateCourseRating;

module.exports = mongoose.model("Course", courseSchema);
