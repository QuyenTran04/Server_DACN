const express = require("express");
const {
  getPracticeByLesson,
  createPractice,
  submitPracticeAnswer,
  getPracticeHistory,
  deletePractice,
} = require("../controllers/practice.controller");
const { requireAuth } = require("../middlewares/auth");

const router = express.Router();

// Tất cả routes đều cần xác thực
router.use(requireAuth);

// Lấy bài luyện tập theo bài học
router.get("/lesson/:lessonId", getPracticeByLesson);

// Tạo bài luyện tập mới
router.post("/", createPractice);

// Nộp câu trả lời luyện tập
router.post("/:id/submit", submitPracticeAnswer);

// Lấy lịch sử luyện tập
router.get("/history/:userId/:lessonId", getPracticeHistory);

// Xóa bài luyện tập (chỉ admin/instructor)
router.delete("/:id", deletePractice);

module.exports = router;