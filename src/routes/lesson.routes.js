const lessonController = require("../controllers/lesson.controller");
const middlewares = require("../middlewares/auth");
const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");

router.post(
  "/createLesson",
  middlewares.requireAuth,
  upload.single("videoUrl"),
  lessonController.createLesson
);

router.get(
  "/listLessonsByCourse/:courseId",
  middlewares.requireAuth,
  lessonController.listLessonsByCourse
);
module.exports = router;