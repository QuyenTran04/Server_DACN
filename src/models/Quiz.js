const mongoose = require("mongoose");
const { Schema } = mongoose;

const optionSchema = new Schema(
  {
    text: { type: String }, 
    imageUrl: { type: String },
  },
  { _id: false } 
);

const quizSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    lesson: { type: Schema.Types.ObjectId, ref: "Lesson", default: null },
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
    language: {
      type: String,
      enum: ["vi", "en", "fr", "de", "es", "ja", "zh", "auto"],
      default: "auto",
      description: "Ngôn ngữ của quiz. 'auto' = tự detect từ question",
    },
    metadata: {
      type: {
        source: { type: String, enum: ["manual_upload", "auto_generate", "import"] },
        title: { type: String },
        description: { type: String },
        difficulty: { type: String, enum: ["easy", "medium", "hard"] },
        timeLimit: { type: Number },
        uploadedAt: { type: Date },
        originalFileName: { type: String }
      },
      default: undefined
    },
  },
  { timestamps: true }
);



module.exports = mongoose.model("Quiz", quizSchema);
