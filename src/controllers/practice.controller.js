const Practice = require("../models/Practice");
const PracticeSubmission = require("../models/PracticeSubmission");
const { generatePracticeQuestion, evaluatePracticeAnswer } = require("../services/practice-ai.service");

// Lấy bài luyện tập theo bài học
exports.getPracticeByLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user?._id || req.user?.id;

    const practice = await Practice.findOne({
      lessonId,
      isActive: true
    }).populate('lessonId courseId');

    if (!practice) {
      return res.status(404).json({
        message: "Chưa có bài luyện tập cho bài học này"
      });
    }

    // Kiểm tra xem người dùng đã làm bài này chưa
    const submissions = await PracticeSubmission.find({
      practiceId: practice._id,
      userId
    }).sort({ submittedAt: -1 });

    res.json({
      practice,
      userSubmissions: submissions,
      totalAttempts: submissions.length
    });
  } catch (error) {
    console.error("[Practice.getPracticeByLesson] Error:", error);
    res.status(500).json({
      message: "Lỗi khi lấy bài luyện tập"
    });
  }
};

// Tạo bài luyện tập mới
exports.createPractice = async (req, res) => {
  try {
    const { lessonId, title, lessonContent, difficulty = "medium", questionType = "open_ended" } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!lessonId || !lessonContent) {
      return res.status(400).json({
        message: "Thiếu thông tin bắt buộc: lessonId, lessonContent"
      });
    }

    // Kiểm tra xem đã có bài luyện tập chưa
    const existingPractice = await Practice.findOne({ lessonId, isActive: true });
    if (existingPractice) {
      return res.json(existingPractice);
    }

    // Sử dụng AI để tạo câu hỏi luyện tập
    const aiResult = await generatePracticeQuestion({
      lessonContent,
      difficulty,
      questionType,
      title: title || "Luyện tập"
    });

    const practice = new Practice({
      title: aiResult.title || title || "Luyện tập",
      question: aiResult.question,
      lessonId,
      courseId: req.body.courseId,
      difficulty,
      questionType,
      lessonContent,
      expectedAnswer: aiResult.expectedAnswer,
      hints: aiResult.hints || [],
      tags: aiResult.tags || []
    });

    await practice.save();

    res.status(201).json(practice);
  } catch (error) {
    console.error("[Practice.createPractice] Error:", error);
    res.status(500).json({
      message: "Lỗi khi tạo bài luyện tập"
    });
  }
};

// Nộp câu trả lời luyện tập
// Nop cau tra loi luyen tap
exports.submitPracticeAnswer = async (req, res) => {
  try {
    const { id: practiceId } = req.params;
    const { answer } = req.body;
    const userId = req.user?._id || req.user?.id;

    const answerText = typeof answer === "string" ? answer : JSON.stringify(answer || "");

    if (!answerText || !answerText.trim()) {
      return res.status(400).json({
        message: "Câu trả lời không được để trống"
      });
    }

    const practice = await Practice.findById(practiceId).populate('lessonId courseId');
    if (!practice) {
      return res.status(404).json({
        message: "Không tìm thấy bài luyện tập"
      });
    }

    const attemptCount = await PracticeSubmission.countDocuments({
      practiceId,
      userId
    });

    const feedbackResult = await evaluatePracticeAnswer({
      question: practice.question,
      userAnswer: answerText.trim(),
      expectedAnswer: practice.expectedAnswer,
      lessonContent: practice.lessonContent,
      difficulty: practice.difficulty
    });

    const submission = new PracticeSubmission({
      practiceId,
      userId,
      lessonId: practice.lessonId._id,
      courseId: practice.courseId._id,
      answer: answerText.trim(),
      feedback: feedbackResult,
      attemptNumber: attemptCount + 1,
      isCorrect: feedbackResult.score >= 7,
      aiProcessed: true
    });

    await submission.save();

    const prevAttempts = Number(practice.attempts || 0);
    const prevAvg = Number(practice.averageScore || 0);
    const safeScore = Number(feedbackResult.score || 0);
    const newAttempts = prevAttempts + 1;
    const newAvg = newAttempts > 0 ? ((prevAvg * prevAttempts) + safeScore) / newAttempts : safeScore;

    await Practice.findByIdAndUpdate(practiceId, {
      $set: {
        attempts: newAttempts,
        averageScore: newAvg
      }
    });

    res.json({
      submission,
      feedback: feedbackResult,
      attemptNumber: attemptCount + 1,
      message: "Nộp bài thành công"
    });
  } catch (error) {
    console.error("[Practice.submitPracticeAnswer] Error:", error);
    res.status(500).json({
      message: "Lỗi khi nộp câu trả lời"
    });
  }
};

// Lấy lịch sử luyện tập của người dùng
exports.getPracticeHistory = async (req, res) => {
  try {
    const { userId, lessonId } = req.params;
    const currentUserId = req.user?._id || req.user?.id;

    // Chỉ cho phép người dùng xem lịch sử của chính mình
    if (userId !== currentUserId.toString()) {
      return res.status(403).json({
        message: "Không có quyền xem lịch sử của người dùng khác"
      });
    }

    const submissions = await PracticeSubmission.find({ userId, lessonId })
      .populate('practiceId')
      .populate('lessonId courseId')
      .sort({ submittedAt: -1 });

    const practice = await Practice.findOne({ lessonId, isActive: true });

    res.json({
      submissions,
      practice,
      totalSubmissions: submissions.length,
      averageScore: submissions.length > 0
        ? submissions.reduce((sum, sub) => sum + sub.feedback.score, 0) / submissions.length
        : 0
    });
  } catch (error) {
    console.error("[Practice.getPracticeHistory] Error:", error);
    res.status(500).json({
      message: "Lỗi khi lấy lịch sử luyện tập"
    });
  }
};

// Xóa bài luyện tập
exports.deletePractice = async (req, res) => {
  try {
    const { id } = req.params;

    const practice = await Practice.findById(id);
    if (!practice) {
      return res.status(404).json({
        message: "Không tìm thấy bài luyện tập"
      });
    }

    // Soft delete
    await Practice.findByIdAndUpdate(id, { isActive: false });

    res.json({ message: "Xóa bài luyện tập thành công" });
  } catch (error) {
    console.error("[Practice.deletePractice] Error:", error);
    res.status(500).json({
      message: "Lỗi khi xóa bài luyện tập"
    });
  }
};
