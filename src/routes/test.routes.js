const express = require("express");
const router = express.Router();
const testController = require("../controllers/test.controller");

router.get("/generate-document", testController.testGenerateDocument);
router.get("/course-draft", testController.testCourseDraft);
router.get("/gemini-direct", testController.testGeminiDirect);

module.exports = router;
