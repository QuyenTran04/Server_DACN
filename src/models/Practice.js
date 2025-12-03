const mongoose = require("mongoose");
const { Schema } = mongoose;

const questionSchema = new Schema({
  id: { type: Number, required: true },
  question: { type: String, required: true },
  // expectedAnswer kept for backward compatibility but not used in new evaluations
  expectedAnswer: { type: String, default: "" },
  explanation: { type: String, default: "" }
}, { _id: false });

const practiceSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    // For backward compatibility - keep old question field
    question: { type: String, required: false },
    // New questions array
    questions: { type: [questionSchema], required: false, default: [] },
    totalQuestions: { type: Number, default: 1 },
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
    expectedAnswer: { type: String, default: "" }, // Câu trả lời mẫu (backward compatibility - not used in new evaluations)
    hints: [String], // Gợi ý cho người dùng
    tags: [String], // Tags để phân loại
    isActive: { type: Boolean, default: true },
    attempts: { type: Number, default: 0 }, // Số lần người dùng đã làm
    averageScore: { type: Number, default: 0 }, // Điểm trung bình
  },
  { timestamps: true }
);

// Validation: require either question or questions array
practiceSchema.pre('save', function(next) {
  if (!this.question && (!this.questions || this.questions.length === 0)) {
    return next(new Error('Either question or questions array must be provided'));
  }
  next();
});

practiceSchema.index({ lessonId: 1, courseId: 1 });

module.exports = mongoose.model("Practice", practiceSchema);