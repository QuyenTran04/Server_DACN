const express = require("express");
const router = express.Router();
const documentController = require("../controllers/document.controller");
const middlewares = require("../middlewares/auth");

// Health check (public)
router.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Document routes active" });
});

// GET /api/documents/lesson/:lessonId - Lấy tài liệu của 1 bài học (PUBLIC - for learning)
router.get(
  "/lesson/:lessonId",
  documentController.getDocumentByLesson
);

// GET /api/documents/course/:courseId - Lấy tất cả tài liệu của khóa học
router.get(
  "/course/:courseId",
  middlewares.requireAuth,
  documentController.getDocumentsByCourse
);

// GET /api/documents/:id - Lấy chi tiết tài liệu
router.get("/:id", middlewares.requireAuth, documentController.getDocument);

// POST /api/documents - Tạo tài liệu
router.post(
  "/",
  middlewares.requireAuth,
  documentController.createDocument
);

// PUT /api/documents/:id - Cập nhật tài liệu
router.put(
  "/:id",
  middlewares.requireAuth,
  documentController.updateDocument
);

// DELETE /api/documents/:id - Xóa tài liệu
router.delete(
  "/:id",
  middlewares.requireAuth,
  documentController.deleteDocument
);

// POST /api/documents/:id/ask - AI giải đáp câu hỏi về tài liệu
router.post(
  "/:id/ask",
  middlewares.requireAuth,
  documentController.askAboutDocument
);

// POST /api/documents/:id/generate-example - AI tạo ví dụ từ tài liệu
router.post(
  "/:id/generate-example",
  middlewares.requireAuth,
  documentController.generateExample
);

module.exports = router;
