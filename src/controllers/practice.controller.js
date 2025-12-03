const Practice = require("../models/Practice");
const PracticeSubmission = require("../models/PracticeSubmission");
const { generatePracticeQuestion, evaluatePracticeAnswer } = require("../services/practice-ai.service");
const walletService = require("../services/wallet.service");

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
  let walletCharge = null;
  const userId = req.user?._id || req.user?.id;
  try {
    const { lessonId, title, lessonContent, difficulty = "medium", questionType = "open_ended" } = req.body;

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

    try {
      walletCharge = await walletService.chargeForAction(userId, "aiPractice", {
        lessonId,
        difficulty,
      });
    } catch (err) {
      if (err.code === "INSUFFICIENT_BALANCE") {
        return res.status(402).json({
          message: "Khong du xu de tao bai luyen tap bang AI",
          balance: err.balance ?? 0,
          required: err.required,
          pricing: walletService.getPricing(),
        });
      }
      throw err;
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
      // Handle both old and new format
      question: aiResult.question || (aiResult.questions?.[0]?.question || ""),
      questions: aiResult.questions || [],
      totalQuestions: aiResult.totalQuestions || (aiResult.questions?.length || 1),
      lessonId,
      courseId: req.body.courseId,
      difficulty,
      questionType,
      lessonContent,
      // expectedAnswer removed - AI will evaluate naturally
      hints: aiResult.hints || [],
      tags: aiResult.tags || []
    });

    await practice.save();

    const response = practice.toObject();

    // Include wallet information if there was a charge
    if (walletCharge && !walletCharge.skipped) {
      response.wallet = walletCharge.wallet;
      response.transaction = walletCharge.transaction;
    }

    res.status(201).json(response);
  } catch (error) {
    console.error("[Practice.createPractice] Error:", error);
    if (walletCharge && !walletCharge.skipped) {
      try {
        await walletService.refundCharge(
          userId,
          walletCharge,
          "refund_create_practice_failed",
          { error: error.message, lessonId }
        );
      } catch (refundErr) {
        console.error("[Practice.createPractice] Refund error:", refundErr.message);
      }
    }
    res.status(500).json({
      message: "Lỗi khi tạo bài luyện tập"
    });
  }
};

// Nộp câu trả lời luyện tập
// Nop cau tra loi luyen tap
exports.submitPracticeAnswer = async (req, res) => {
  try {
    console.log("[Practice.submitPracticeAnswer] ===== NEW REQUEST =====");
    console.log("  - URL:", req.originalUrl);
    console.log("  - HTTP Method:", req.method);
    console.log("  - Params:", req.params);
    console.log("  - Body:", req.body);
    console.log("  - Headers:", req.headers.authorization ? "Has Authorization" : "No Authorization");

    const { id: practiceId } = req.params;
    const { answer, question, answerType = "text", language = "javascript" } = req.body;
    const userId = req.user?._id || req.user?.id;

    // Handle different answer formats
    let answerText = "";
    if (typeof answer === "string") {
      answerText = answer;
    } else if (answer && typeof answer === "object" && answer.answer) {
      answerText = answer.answer;
    } else {
      answerText = JSON.stringify(answer || "");
    }

    // Handle question from request body - priority order
    let questionText = "";
    if (question) {
      questionText = question;
    } else if (answer && typeof answer === "object" && answer.question) {
      questionText = answer.question;
    }

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

    // Use the question from request body (this is the correct current question)
    const questionForEval = questionText.trim() || practice.question;

    // Debug logging
    console.log("[Practice.submitPracticeAnswer] Debug:");
    console.log("  - Request question:", questionText);
    console.log("  - Practice.question:", practice.question);
    console.log("  - Final question sent to AI:", questionForEval);
    console.log("  - User answer:", answerText.trim());

    const feedbackResult = await evaluatePracticeAnswer({
      question: questionForEval,
      userAnswer: answerText.trim(),
      expectedAnswer: "", // Empty - don't compare with expected answer
      lessonContent: practice.lessonContent,
      difficulty: practice.difficulty,
      answerType,
      language
    });

    const submission = new PracticeSubmission({
      practiceId,
      userId,
      lessonId: practice.lessonId._id,
      courseId: practice.courseId._id,
      answer: answerText.trim(),
      answerType,
      language: answerType === 'code' ? language : undefined,
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
