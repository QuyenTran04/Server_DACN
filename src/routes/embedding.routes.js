const router = require("express").Router();
const  reindex  = require("../controllers/embedding.controller");
// thêm middleware auth/role nếu cần


router.post("/courses/reindex-all", reindex.reindexAllCourses);
router.post("/lessons/:id/reindex", reindex.reindexLesson);
router.post("/courses/:id", reindex.reindexCourse);
router.post("/quizzes/:id/reindex", reindex.reindexQuiz);

module.exports = router;
