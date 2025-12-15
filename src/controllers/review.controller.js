const Review = require("../models/Review");
const Course = require("../models/Course");
const Practice = require("../models/Practice");
const Quiz = require("../models/Quiz");
const PracticeSubmission = require("../models/PracticeSubmission");
const Submission = require("../models/Submission");
const mongoose = require("mongoose");

/**
 * Helper function để quy đổi điểm số thành nhãn đánh giá
 * @param {number} rating - Điểm số từ 1-10
 * @returns {object} - { label: string, color: string, stars: number }
 */
function getRatingLabel(rating) {
  if (rating >= 8) {
    return { label: "Tốt", color: "text-green-600", stars: 5 };
  } else if (rating >= 6) {
    return { label: "Khá", color: "text-blue-600", stars: 4 };
  } else if (rating >= 4) {
    return { label: "Trung bình", color: "text-yellow-600", stars: 3 };
  } else {
    return { label: "Kém", color: "text-red-600", stars: 2 };
  }
}

/**
 * Helper function để quy đổi ngược từ nhãn về khoảng điểm
 * @param {string} label - Nhãn đánh giá
 * @returns {number} - Điểm số trung bình
 */
function getRatingFromLabel(label) {
  switch (label) {
    case "Tốt": return 9;
    case "Khá": return 6.5;
    case "Trung bình": return 4.5;
    case "Kém": return 2;
    default: return 5;
  }
}

/**
 * Lấy danh sách đánh giá của một khóa học
 */
exports.getCourseReviews = async (req, res) => {
  try {
    const { courseId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Kiểm tra khóa học có tồn tại không
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    const reviews = await Review.find({
      course: courseId,
      hidden: { $ne: true }
    })
      .populate("student", "name email avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Thêm thông tin nhãn đánh giá cho mỗi review
    const reviewsWithLabels = reviews.map(review => {
      const reviewObj = review.toObject();
      reviewObj.ratingInfo = getRatingLabel(review.rating);
      return reviewObj;
    });

    const total = await Review.countDocuments({
      course: courseId,
      hidden: { $ne: true }
    });

    res.json({
      reviews: reviewsWithLabels,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: total,
      },
    });
  } catch (error) {
    console.error("[getCourseReviews] Error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

/**
 * Kiểm tra điều kiện đánh giá khóa học
 */
exports.checkReviewEligibility = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Kiểm tra khóa học có tồn tại không
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    // Lấy tất cả các bài học của khóa học
    const Lesson = require("../models/Lesson");
    const lessons = await Lesson.find({ course: courseId }).select("_id");

    if (lessons.length === 0) {
      return res.status(400).json({
        message: "Khóa học này chưa có bài học nào"
      });
    }

    const lessonIds = lessons.map(lesson => lesson._id);

    // Kiểm tra người dùng đã hoàn thành bài luyện tập nào chưa (cả Practice và PracticeSubmission)
    const completedPractice = await Practice.findOne({
      lesson: { $in: lessonIds },
      user: userId,
      completedAt: { $exists: true }
    });

    const practiceSubmission = await PracticeSubmission.findOne({
      lessonId: { $in: lessonIds },
      userId: userId,
      submittedAt: { $exists: true }
    });

    // Kiểm tra người dùng đã làm bài trắc nghiệm nào chưa (cả Quiz và Submission)
    const completedQuiz = await Quiz.findOne({
      lesson: { $in: lessonIds },
      user: userId,
      submittedAt: { $exists: true }
    });

    // Lấy quizId từ Submission thông qua Quiz model
    const quizIds = await Quiz.find({ lesson: { $in: lessonIds } }).select("_id");
    const quizIdList = quizIds.map(q => q._id);

    const submission = await Submission.findOne({
      quiz: { $in: quizIdList },
      student: userId,
      submittedAt: { $exists: true }
    });

    // Kiểm tra trong PracticeSubmission trực tiếp với courseId
    const practiceSubmissionByCourse = await PracticeSubmission.findOne({
      courseId: courseId,
      userId: userId,
      submittedAt: { $exists: true }
    });

    const hasCompletedActivity = !!(completedPractice || practiceSubmission || completedQuiz || submission || practiceSubmissionByCourse);
    const alreadyReviewed = await Review.findOne({
      student: userId,
      course: courseId
    });

    res.json({
      eligible: hasCompletedActivity && !alreadyReviewed,
      hasCompletedActivity,
      alreadyReviewed: !!alreadyReviewed,
      completedPracticeId: completedPractice?._id,
      practiceSubmissionId: practiceSubmission?._id,
      completedQuizId: completedQuiz?._id,
      submissionId: submission?._id,
    });
  } catch (error) {
    console.error("[checkReviewEligibility] Error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

/**
 * Tạo đánh giá mới cho khóa học
 */
exports.createReview = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    // Validation
    if (!rating || rating < 1 || rating > 10) {
      return res.status(400).json({ message: "Điểm đánh giá phải từ 1 đến 10" });
    }

    // Kiểm tra khóa học có tồn tại không
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    // Kiểm tra người dùng đã đánh giá chưa
    const existingReview = await Review.findOne({
      student: userId,
      course: courseId,
    });

    if (existingReview) {
      return res.status(400).json({ message: "Bạn đã đánh giá khóa học này rồi" });
    }

    // Lấy tất cả các bài học của khóa học
    const Lesson = require("../models/Lesson");
    const lessons = await Lesson.find({ course: courseId }).select("_id");

    if (lessons.length === 0) {
      return res.status(400).json({
        message: "Khóa học này chưa có bài học nào"
      });
    }

    const lessonIds = lessons.map(lesson => lesson._id);

    // Kiểm tra điều kiện đã hoàn thành bài tập chưa (cả Practice và PracticeSubmission)
    const completedPractice = await Practice.findOne({
      lesson: { $in: lessonIds },
      user: userId,
      completedAt: { $exists: true }
    });

    const practiceSubmission = await PracticeSubmission.findOne({
      lessonId: { $in: lessonIds },
      userId: userId,
      submittedAt: { $exists: true }
    });

    // Kiểm tra người dùng đã làm bài trắc nghiệm nào chưa (cả Quiz và Submission)
    const completedQuiz = await Quiz.findOne({
      lesson: { $in: lessonIds },
      user: userId,
      submittedAt: { $exists: true }
    });

    // Lấy quizId từ Submission thông qua Quiz model
    const quizIds = await Quiz.find({ lesson: { $in: lessonIds } }).select("_id");
    const quizIdList = quizIds.map(q => q._id);

    const submission = await Submission.findOne({
      quiz: { $in: quizIdList },
      student: userId,
      submittedAt: { $exists: true }
    });

    // Kiểm tra trong PracticeSubmission trực tiếp với courseId
    const practiceSubmissionByCourse = await PracticeSubmission.findOne({
      courseId: courseId,
      userId: userId,
      submittedAt: { $exists: true }
    });

    const hasCompletedActivity = !!(completedPractice || practiceSubmission || completedQuiz || submission || practiceSubmissionByCourse);

    if (!hasCompletedActivity) {
      return res.status(403).json({
        message: "Bạn phải hoàn thành ít nhất một bài luyện tập hoặc bài trắc nghiệm của khóa học này trước khi đánh giá"
      });
    }

    // Tạo đánh giá mới
    const review = new Review({
      student: userId,
      course: courseId,
      rating,
      comment,
      completedPractice: completedPractice?._id || practiceSubmission?._id || practiceSubmissionByCourse?._id,
      completedQuiz: completedQuiz?._id || submission?._id,
    });

    await review.save();

    // Cập nhật rating trung bình của khóa học
    await Course.updateRating(courseId);

    // Populate dữ liệu student để trả về
    await review.populate("student", "name email avatar");

    // Thêm thông tin nhãn đánh giá
    const reviewObj = review.toObject();
    reviewObj.ratingInfo = getRatingLabel(review.rating);

    res.status(201).json({
      message: "Đánh giá thành công!",
      review: reviewObj,
    });
  } catch (error) {
    console.error("[createReview] Error:", error);

    // Xử lý lỗi duplicate key (nếu người dùng cố gắng đánh giá lại)
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Bạn đã đánh giá khóa học này rồi"
      });
    }

    res.status(500).json({ message: "Lỗi server" });
  }
};

/**
 * Cập nhật đánh giá
 */
exports.updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    // Validation
    if (rating && (rating < 1 || rating > 10)) {
      return res.status(400).json({ message: "Điểm đánh giá phải từ 1 đến 10" });
    }

    const review = await Review.findOne({
      _id: reviewId,
      student: userId,
    });

    if (!review) {
      return res.status(404).json({
        message: "Không tìm thấy đánh giá hoặc bạn không có quyền chỉnh sửa"
      });
    }

    // Cập nhật các trường
    if (rating) review.rating = rating;
    if (comment !== undefined) review.comment = comment;

    await review.save();

    // Cập nhật rating trung bình của khóa học
    await Course.updateRating(review.course);

    await review.populate("student", "name email avatar");

    // Thêm thông tin nhãn đánh giá
    const reviewObj = review.toObject();
    reviewObj.ratingInfo = getRatingLabel(review.rating);

    res.json({
      message: "Cập nhật đánh giá thành công!",
      review: reviewObj,
    });
  } catch (error) {
    console.error("[updateReview] Error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

/**
 * Xóa đánh giá
 */
exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    const review = await Review.findOne({
      _id: reviewId,
      student: userId,
    });

    if (!review) {
      return res.status(404).json({
        message: "Không tìm thấy đánh giá hoặc bạn không có quyền xóa"
      });
    }

    const courseId = review.course;
    await Review.findByIdAndDelete(reviewId);

    // Cập nhật rating trung bình của khóa học
    await Course.updateRating(courseId);

    res.json({ message: "Xóa đánh giá thành công!" });
  } catch (error) {
    console.error("[deleteReview] Error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

/**
 * Lấy đánh giá của người dùng hiện tại cho một khóa học
 */
exports.getUserReview = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const review = await Review.findOne({
      student: userId,
      course: courseId,
    }).populate("student", "name email avatar");

    if (!review) {
      return res.status(404).json({ message: "Bạn chưa đánh giá khóa học này" });
    }

    // Thêm thông tin nhãn đánh giá
    const reviewObj = review.toObject();
    reviewObj.ratingInfo = getRatingLabel(review.rating);

    res.json({ review: reviewObj });
  } catch (error) {
    console.error("[getUserReview] Error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};