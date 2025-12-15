const express = require("express");
const {
  getPracticeByLesson,
  createPractice,
  submitPracticeAnswer,
  getPracticeHistory,
  getNextDifficulty,
  deletePractice,
} = require("../controllers/practice.controller");
const { requireAuth } = require("../middlewares/auth");

const router = express.Router();

// Tất cả routes đều cần xác thực
router.use(requireAuth);

// Lấy bài luyện tập theo bài học
router.get("/lesson/:lessonId", getPracticeByLesson);

// Lấy thông tin mức độ tiếp theo
router.get("/next-difficulty/:lessonId", getNextDifficulty);

// Lấy lịch sử luyện tập
router.get("/history/:userId/:lessonId", getPracticeHistory);

// Lấy bài luyện tập theo ID (phải đặt sau các route cụ thể hơn)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;
    const Practice = require("../models/Practice");
    const PracticeSubmission = require("../models/PracticeSubmission");
    
    const practice = await Practice.findById(id).populate('lessonId courseId');
    
    if (!practice) {
      return res.status(404).json({ message: "Không tìm thấy bài luyện tập" });
    }

    // Kiểm tra xem user đã hoàn thành bài này chưa
    const userSubmissions = await PracticeSubmission.find({
      practiceId: id,
      userId
    }).sort({ submittedAt: -1 });

    // Tính số câu đã trả lời và điểm trung bình
    const totalQuestionsAnswered = userSubmissions.length;
    const totalQuestionsInPractice = practice.questions?.length || 1;
    const isCompleted = totalQuestionsAnswered >= totalQuestionsInPractice;
    
    const averageScore = totalQuestionsAnswered > 0
      ? Math.round((userSubmissions.reduce((sum, s) => sum + (s.feedback?.score || 0), 0) / totalQuestionsAnswered) * 10) / 10
      : 0;

    const correctCount = userSubmissions.filter(s => s.isCorrect).length;
    
    res.json({ 
      practice,
      userProgress: {
        isCompleted,
        totalQuestionsAnswered,
        totalQuestionsInPractice,
        averageScore,
        correctCount,
        incorrectCount: totalQuestionsAnswered - correctCount,
        submissions: userSubmissions
      }
    });
  } catch (error) {
    console.error("[Practice.getById] Error:", error);
    res.status(500).json({ message: "Lỗi khi lấy bài luyện tập" });
  }
});

// Tạo bài luyện tập mới
router.post("/", createPractice);

// Nộp câu trả lời luyện tập
router.post("/:id/submit", submitPracticeAnswer);

// Xóa bài luyện tập (chỉ admin/instructor)
router.delete("/:id", deletePractice);

module.exports = router;