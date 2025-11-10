const mongoose = require("mongoose");
const { Schema } = mongoose;

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

documentSchema.index({ course: 1, lesson: 1 });
documentSchema.index({ course: 1 });

module.exports = mongoose.model("Document", documentSchema);
