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
router.put("/categories/:id", admin.updateCategory);
router.delete("/categories/:id", admin.deleteCategory);

/* ===== 2) Người dùng ===== */
router.get("/users", admin.listUsers);
router.get("/creators", admin.listCreators);
router.post("/users", admin.createUser);
router.put("/users/:id", admin.updateUser);
router.patch("/users/:id", admin.updateUser);
router.delete("/users/:id", admin.deleteUser);

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

/* ===== 9) Tài liệu ===== */
router.get("/documents", admin.listDocuments);
router.post("/documents/upload", admin.uploadDocuments);
router.delete("/documents/:id", admin.deleteDocument);

/* ===== 10) Cài đặt ===== */
router.get("/settings", admin.getSettings);
router.post("/settings", admin.updateSettings);

/* ===== 11) Quản lý ví ===== */
router.get("/wallets", admin.listWallets);
router.get("/wallets/:userId/transactions", admin.getUserTransactions);
router.get("/topup-transactions", admin.listTopupTransactions);
router.post("/wallet/credit", admin.creditUserWallet);

/* ===== 12) Thông báo ===== */
router.get("/notifications", admin.getNotifications);

/* ===== 13) Nhật ký hoạt động ===== */
router.get("/activity-logs", admin.listActivityLogs);

/* ===== 14) Thông báo ===== */
const announcementCtrl = require("../controllers/announcement.controller");
router.get("/announcements", announcementCtrl.listAnnouncements);
router.post("/announcements", announcementCtrl.createAnnouncement);
router.put("/announcements/:id", announcementCtrl.updateAnnouncement);
router.delete("/announcements/:id", announcementCtrl.deleteAnnouncement);
router.patch("/announcements/:id/toggle", announcementCtrl.toggleAnnouncementStatus);

/* ===== 15) Chứng chỉ ===== */
const certificateCtrl = require("../controllers/certificate.controller");
router.get("/certificates", certificateCtrl.listCertificates);
router.post("/certificates", certificateCtrl.issueCertificate);
router.put("/certificates/:id/revoke", certificateCtrl.revokeCertificate);
router.delete("/certificates/:id", certificateCtrl.deleteCertificate);

/* ===== 16) Analytics nâng cao ===== */
router.get("/analytics/overview", admin.getAnalyticsOverview);
router.get("/analytics/enrollments", admin.getEnrollmentAnalytics);
router.get("/analytics/revenue", admin.getRevenueAnalytics);
router.get("/analytics/courses", admin.getCourseAnalytics);
router.get("/analytics/users", admin.getUserAnalytics);

module.exports = router;
