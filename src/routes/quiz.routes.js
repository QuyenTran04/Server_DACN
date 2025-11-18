const express = require("express");
const router = express.Router();

const quizCtrl = require("../controllers/quiz.controller");
const { requireAuth, requireRole } = require("../middlewares/auth");

// CRUD
router.get("/", requireAuth, quizCtrl.list);
router.get("/:id", requireAuth, quizCtrl.detail);
router.post(
  "/create",
  requireAuth,
  requireRole("instructor", "admin"),
  quizCtrl.create
);
router.put(
  "/:id",
  requireAuth,
  requireRole("instructor", "admin"),
  quizCtrl.update
);
router.delete(
  "/:id",
  requireAuth,
  requireRole("instructor", "admin"),
  quizCtrl.remove
);

// Nộp bài
router.post("/:id/submit", requireAuth, quizCtrl.submit);

// Generate quizzes on-demand với AI (chỉ cần login, không cần role)
router.post(
  "/generate",
  requireAuth,
  quizCtrl.generateQuizzes
);

// Import AI từ PDF/Ảnh
router.post(
  "/import",
  requireAuth,
  requireRole("instructor", "admin"),
  quizCtrl.importMiddleware, // upload.single('file')
  quizCtrl.importFromFile
);

// Tạo bài trắc nghiệm thủ công từ file upload
router.post(
  "/upload-manual",
  requireAuth,
  requireRole("instructor", "admin"),
  quizCtrl.importMiddleware, // upload.single('file')
  quizCtrl.createManualQuiz
);

// Thống kê nhanh
router.get("/stats/lesson/:lessonId", requireAuth, quizCtrl.statsByLesson);
router.delete("/:lessonId/quizzes", requireAuth, quizCtrl.removeAllByLesson);
// Lấy quiz của 1 lesson để LÀM BÀI
router.get("/by-lesson/:lessonId/take", requireAuth, quizCtrl.forLessonToTake);
module.exports = router;
