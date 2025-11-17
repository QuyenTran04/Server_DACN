// routes/ai.routes.js
const express = require("express");
const router = express.Router();
const {
  generateCourseDraft,
  createCourseFromDraft,
  createCourseFromDraftWithStream,
  startCourseCreation,
  streamCourseCreation,
} = require("../controllers/aiCourse.controller");
const { requireAuth } = require("../middlewares/auth");
const { requireAuthSSE } = require("../middlewares/authSSE");
const { postChat, pronounceText } = require("../controllers/ai.controller");
const { explainQuiz } = require("../controllers/aiExplain.controller");

router.post("/courses/draft", requireAuth, generateCourseDraft);
router.post("/courses/start", requireAuth, startCourseCreation);
router.get("/courses/:courseId/stream", requireAuthSSE, streamCourseCreation);
router.post("/courses/stream", requireAuth, createCourseFromDraftWithStream);
router.post("/courses", requireAuth, createCourseFromDraft);
router.post("/chat", requireAuth, postChat);
router.post("/explain-quiz", requireAuth, explainQuiz);
router.post("/tts/pronounce", requireAuth, pronounceText);

module.exports = router;
