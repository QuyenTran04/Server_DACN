const mongoose = require("mongoose");
const { Schema } = mongoose;

const lessonSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    videoUrl: String,
    content: String,
    order: { type: Number, default: 0 }, 
    resources: [String], 
  },
  { timestamps: true }
);



module.exports = mongoose.model("Lesson", lessonSchema);
