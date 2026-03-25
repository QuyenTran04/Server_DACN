const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  otp: { type: String, required: true },
  type: { type: String, enum: ["register", "reset_password"], default: "register" },
  expiresAt: { type: Date, required: true, index: true },
  verified: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  tempData: { type: mongoose.Schema.Types.Mixed }, // Lưu tạm thông tin đăng ký
}, { timestamps: true });

// Tự động xóa OTP hết hạn
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);
