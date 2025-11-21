const mongoose = require("mongoose");
const { Schema } = mongoose;

const practiceSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    question: { type: String, required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium"
    },
    questionType: {
      type: String,
      enum: ["open_ended", "multiple_choice", "essay"],
      default: "open_ended"
    },
    lessonContent: { type: String, required: true }, // Nội dung bài học để AI tạo câu hỏi
    expectedAnswer: { type: String }, // Câu trả lời mẫu để AI so sánh
    hints: [String], // Gợi ý cho người dùng
    tags: [String], // Tags để phân loại
    isActive: { type: Boolean, default: true },
    attempts: { type: Number, default: 0 }, // Số lần người dùng đã làm
    averageScore: { type: Number, default: 0 }, // Điểm trung bình
  },
  { timestamps: true }
);

practiceSchema.index({ lessonId: 1, courseId: 1 });

module.exports = mongoose.model("Practice", practiceSchema);