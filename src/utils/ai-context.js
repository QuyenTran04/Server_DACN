const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const Enrollment = require("../models/Enrollment");
const Submission = require("../models/Submission");


exports.buildLearningContext = async ({
  userId,
  courseId,
  lessonId,
  uiState,
  progress,
}) => {
  const [course, lesson] = await Promise.all([
    courseId
      ? Course.findById(courseId).select("_id title level category").lean()
      : null,
    lessonId
      ? Lesson.findById(lessonId).select("_id title order type").lean()
      : null,
  ]);

  // Enrollment (để biết tiến độ)
  let enrollment = null;
  if (userId && courseId) {
    enrollment = await Enrollment.findOne({ user: userId, course: courseId })
      .select("_id progress completedLessons")
      .lean();
  }

  // Tính progress %
  const progressPct =
    typeof progress === "number" ? progress : enrollment?.progress ?? null;

  // Lấy vài Submission gần đây (quiz) – hữu ích cho chế độ review
  let lastAttempts = [];
  if (userId && courseId && uiState?.page === "quiz") {
    lastAttempts = await Submission.find({ user: userId, course: courseId })
      .select("quiz selected isCorrect createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
  }

  return {
    courseMeta: course
      ? {
          id: course._id,
          title: course.title,
          level: course.level,
          category: course.category,
        }
      : null,
    lessonMeta: lesson
      ? {
          id: lesson._id,
          title: lesson.title,
          order: lesson.order,
          type: lesson.type,
        }
      : null,
    enrollmentMeta: enrollment || null,
    progressPct,
    lastAttempts,
  };
};
