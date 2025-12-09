const mongoose = require("mongoose");
const { Schema } = mongoose;

const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ["info", "warning", "success", "error", "maintenance"],
      default: "info",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    targetAudience: {
      type: String,
      enum: ["all", "students", "instructors", "admins"],
      default: "all",
    },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    viewCount: { type: Number, default: 0 },
    imageUrl: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Announcement", announcementSchema);
