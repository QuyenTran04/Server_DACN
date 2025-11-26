const express = require("express");
const router = express.Router();
const {
  getCourseReviews,
  checkReviewEligibility,
  createReview,
  updateReview,
  deleteReview,
  getUserReview,
} = require("../controllers/review.controller");
const { requireAuth } = require("../middlewares/auth");

// Public routes
router.get("/course/:courseId", getCourseReviews);

// Protected routes - cần đăng nhập
router.use(requireAuth);

// Kiểm tra điều kiện đánh giá
router.get("/check-eligibility/:courseId", checkReviewEligibility);

// Lấy đánh giá của người dùng hiện tại
router.get("/user/:courseId", getUserReview);

// Tạo đánh giá mới
router.post("/course/:courseId", createReview);

// Cập nhật đánh giá
router.put("/:reviewId", updateReview);

// Xóa đánh giá
router.delete("/:reviewId", deleteReview);

module.exports = router;