// routes/ai.routes.js
const express = require("express");
const router = express.Router();
const {
  generateCourseDraft,
  createCourseFromDraft,
} = require("../controllers/aiCourse.controller");
const { requireAuth } = require("../middlewares/auth"); // đảm bảo đã có
const { postChat } = require("../controllers/ai.controller");


router.post("/courses/draft", requireAuth, generateCourseDraft);
router.post("/courses", requireAuth, createCourseFromDraft);
router.post("/chat", requireAuth, postChat);

module.exports = router;
