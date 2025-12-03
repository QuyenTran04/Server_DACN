const Course = require("../controllers/course.controller");
const middleware = require("../middlewares/auth");
const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");

router.post(
  "/createCourse",
  middleware.requireAuth,
  upload.single("imageUrl"),
  Course.createCourse
);
router.get(
  "/my",
  middleware.requireAuth,
  Course.getMyCourses
);
router.get(
  "/getCourses",
  Course.getCourses
);
router.get(
  "/getCoursesByInstructor/:instructorId",
  middleware.requireAuth,
  Course.getCoursesByInstructor
);
router.put(
  "/updateCourse/:id",
  middleware.requireAuth,
  upload.single("imageUrl"),
  Course.updateCourse
);
router.get("/getCourseById/:id", middleware.requireAuth, Course.getCourseById);
router.patch(
  "/:id/publish",
  middleware.requireAuth,
  Course.publishCourse
);
router.delete(
  "/:id",
  middleware.requireAuth,
  Course.deleteCourse
);

module.exports = router;