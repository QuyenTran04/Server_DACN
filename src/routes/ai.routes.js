// routes/ai.routes.js
const express = require("express");
const router = express.Router();
const {
  generateCourseDraft,
  createCourseFromDraft,
} = require("../controllers/aiCourse.controller");
const { requireAuth } = require("../middlewares/auth");
const { postChat } = require("../controllers/ai.controller");
const { explainQuiz } = require("../controllers/aiExplain.controller");

router.post("/courses/draft", requireAuth, generateCourseDraft);
router.post("/courses", requireAuth, createCourseFromDraft);
router.post("/chat", requireAuth, postChat);
router.post("/explain-quiz", requireAuth, explainQuiz);

module.exports = router;
