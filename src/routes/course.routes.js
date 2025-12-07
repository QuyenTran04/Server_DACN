const Course = require("../controllers/course.controller");
const middleware = require("../middlewares/auth");
const express = require("express");
const router = express.Router();

// Chỉ giữ lại các route cần thiết cho việc xem khóa học
// Đã xóa route tạo khóa học thủ công
router.get(
  "/getCourses",
  Course.getCourses
);
router.get(
  "/my",
  middleware.requireAuth,
  Course.getMyCourses
);
router.get(
  "/getCoursesByInstructor/:instructorId",
  middleware.requireAuth,
  Course.getCoursesByInstructor
);
router.get("/getCourseById/:id", middleware.requireAuth, Course.getCourseById);

module.exports = router;