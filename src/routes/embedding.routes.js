const router = require("express").Router();
const { reindexLesson } = require("../controllers/embedding.controller");
// thêm middleware auth/role nếu cần

router.post("/lessons/:id/reindex", reindexLesson);
module.exports = router;
