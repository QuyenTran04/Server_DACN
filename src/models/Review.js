const mongoose = require("mongoose");
const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    rating: { type: Number, min: 1, max: 10, required: true },
    comment: String,
    // Lưu thông tin về bài tập đã hoàn thành để xác thực điều kiện đánh giá
    completedPractice: { type: Schema.Types.ObjectId, ref: "Practice" }, // Có thể là Practice hoặc PracticeSubmission
    completedQuiz: { type: Schema.Types.ObjectId, ref: "Quiz" }, // Có thể là Quiz hoặc Submission
    // Đánh giá có được hiển thị công khai không
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Index để đảm bảo mỗi học viên chỉ đánh giá một khóa học một lần
reviewSchema.index({ student: 1, course: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Review", reviewSchema);
