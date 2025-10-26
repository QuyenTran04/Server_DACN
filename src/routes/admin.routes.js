const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../middlewares/auth");
const admin = require("../controllers/admin.controller");

// Toàn bộ API admin yêu cầu đăng nhập + quyền admin
router.use(requireAuth, requireRole("admin"));

/* ===== 1) Khóa học & Danh mục ===== */
router.get("/courses", admin.listCourses);
router.post("/courses", admin.createCourse);
router.put("/courses/:id", admin.updateCourse);
router.delete("/courses/:id", admin.deleteCourse);
router.put("/courses/:id/assign-instructor", admin.assignInstructor);
router.put("/courses/:id/publish", admin.publishCourse);
router.put("/courses/:id/unpublish", admin.unpublishCourse);

router.get("/categories", admin.listCategories);
router.post("/categories", admin.createCategory);

/* ===== 2) Giảng viên ===== */
router.get("/instructors", admin.listInstructors);
router.post("/instructors", admin.createInstructor);
router.put("/instructors/:id", admin.updateInstructor);
router.delete("/instructors/:id", admin.deleteInstructor);

/* ===== 3) Học viên ===== */
router.get("/students", admin.listStudents);
router.get("/students/:id/progress", admin.getStudentProgress);

/* ===== 4) Thanh toán & Doanh thu ===== */
router.get("/orders", admin.listOrders);
router.put("/orders/:id/refund", admin.refundOrder);
router.get("/reports/revenue/monthly", admin.revenueByMonth);
router.get("/reports/revenue/by-course", admin.revenueByCourse);
router.get("/reports/revenue/by-instructor", admin.revenueByInstructor);

/* ===== 5) Dashboard / Thống kê ===== */
router.get("/overview", admin.overview);

/* ===== 6) Hệ thống / Phân quyền ===== */
router.put("/users/:id/role", admin.updateUserRole);

/* ===== 7) Tương tác (Review) ===== */
router.get("/reviews", admin.listReviews);
router.delete("/reviews/:id", admin.deleteReview);
router.put("/reviews/:id/hide", admin.hideReview);

/* ===== 8) Nội dung khoá học (reuse lesson/quiz controller) ===== */
router.get("/courses/:courseId/lessons", admin.listLessons);
router.post("/lessons", admin.createLesson);
router.put("/lessons/:id", admin.updateLesson);
router.delete("/lessons/:id", admin.deleteLesson);
router.patch("/courses/:courseId/lessons/reorder", admin.reorderLessons);

router.get("/quiz", admin.listQuiz);
router.post("/quiz", admin.createQuiz);
router.put("/quiz/:id", admin.updateQuiz);
router.delete("/quiz/:id", admin.deleteQuiz);

module.exports = router;
