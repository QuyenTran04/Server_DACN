const mongoose = require("mongoose");
const { Schema } = mongoose;

const practiceSubmissionSchema = new Schema(
  {
    practiceId: { type: Schema.Types.ObjectId, ref: "Practice", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    answer: { type: String, required: true },
    answerType: { type: String, enum: ["text", "code"], default: "text" },
    language: { type: String }, // Language for code answers
    feedback: {
      score: { type: Number, min: 0, max: 10 },
      feedback: { type: String, required: true },
      suggestions: { type: String },
      strengths: [String],
      improvements: [String],
      correctAspects: [String],
      incorrectAspects: [String]
    },
    attemptNumber: { type: Number, default: 1 },
    timeSpent: { type: Number, default: 0 }, // Thời gian làm bài (giây)
    submittedAt: { type: Date, default: Date.now },
    isCorrect: { type: Boolean, default: false },
    aiProcessed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

practiceSubmissionSchema.index({ practiceId: 1, userId: 1 });
practiceSubmissionSchema.index({ userId: 1, lessonId: 1 });

module.exports = mongoose.model("PracticeSubmission", practiceSubmissionSchema);