const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: { type: String, minlength: 6, select: false },

    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student",
    },

    avatar: String,

    googleId: { type: String, index: true }, // id của user trên Google
    provider: { type: String, default: "local" }, // "local" hoặc "google"
    emailVerified: { type: Boolean, default: false },

    lastLoginAt: { type: Date },
    bio: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
