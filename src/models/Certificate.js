const mongoose = require("mongoose");
const { Schema } = mongoose;

const certificateSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    certificateNumber: { type: String, required: true, unique: true },
    issueDate: { type: Date, default: Date.now },
    completionDate: { type: Date, required: true },
    grade: { type: String, enum: ["A+", "A", "B+", "B", "C+", "C", "Pass"], default: "Pass" },
    score: { type: Number, min: 0, max: 100 },
    verificationCode: { type: String, required: true, unique: true },
    pdfUrl: String,
    isRevoked: { type: Boolean, default: false },
    revokedAt: Date,
    revokedReason: String,
  },
  { timestamps: true }
);

// Index để tìm kiếm nhanh
certificateSchema.index({ student: 1, course: 1 });
certificateSchema.index({ certificateNumber: 1 });
certificateSchema.index({ verificationCode: 1 });

module.exports = mongoose.model("Certificate", certificateSchema);
