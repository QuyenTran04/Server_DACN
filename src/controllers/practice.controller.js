const Practice = require("../models/Practice");
const PracticeSubmission = require("../models/PracticeSubmission");
const { generatePracticeQuestion, evaluatePracticeAnswer, getRecommendedDifficulty, normalizeDifficulty } = require("../services/practice-ai.service");
const walletService = require("../services/wallet.service");

// Hàm điều chỉnh mức độ dựa trên điểm số bài trước
function adjustDifficulty(currentDifficulty, score) {
  const difficultyLevels = ["Dễ", "Trung bình", "Khó", "Rất Khó"];
  const currentIndex = difficultyLevels.indexOf(currentDifficulty);
  
  if (currentIndex === -1) {
    return "Trung bình"; // Mặc định nếu không tìm thấy
  }

  // Điểm > 8/10 → tăng 1 mức
  if (score > 8 && currentIndex < difficultyLevels.length - 1) {
    return difficultyLevels[currentIndex + 1];
  }
  
  // Điểm < 5/10 → giảm 1 mức
  if (score < 5 && currentIndex > 0) {
    return difficultyLevels[currentIndex - 1];
  }
  
  // Điểm 5-8 → giữ nguyên
  return currentDifficulty;
}

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

    // Lấy thông tin bài luyện tập trước đó để hiển thị mức độ tiếp theo
    const previousSubmissions = await PracticeSubmission.find({
      userId,
      lessonId,
      aiProcessed: true
    })
      .sort({ submittedAt: -1 })
      .limit(1)
      .populate('practiceId');

    let nextDifficulty = "Trung bình";
    let lastScore = null;
    
    if (previousSubmissions.length > 0) {
      const lastSubmission = previousSubmissions[0];
      lastScore = lastSubmission.feedback?.score || 0;
      const lastDifficulty = lastSubmission.practiceId?.difficulty || "Trung bình";
      nextDifficulty = adjustDifficulty(lastDifficulty, lastScore);
    }

    res.json({
      practice,
      userSubmissions: submissions,
      totalAttempts: submissions.length,
      lastScore,
      nextDifficulty,
      difficultyInfo: {
        current: practice.difficulty,
        next: nextDifficulty,
        message: lastScore !== null 
          ? `Dựa trên điểm ${lastScore}/10 của bài trước, bài tiếp theo sẽ ở mức độ ${nextDifficulty}`
          : "Bài luyện tập đầu tiên sẽ ở mức độ Trung bình"
      }
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
  const { lessonId, title, lessonContent, difficulty, questionType = "open_ended" } = req.body;
  try {

    if (!lessonId || !lessonContent) {
      return res.status(400).json({
        message: "Thiếu thông tin bắt buộc: lessonId, lessonContent"
      });
    }

    // Xác định mức độ cho bài luyện tập mới
    let finalDifficulty = difficulty || "Trung bình"; // Mặc định là Trung bình

    // Nếu không truyền difficulty, sử dụng service để lấy mức độ đề xuất
    if (!difficulty) {
      const difficultyInfo = await getRecommendedDifficulty({ userId, lessonId });
      finalDifficulty = difficultyInfo.nextDifficulty;

      console.log(`[Practice.createPractice] Điều chỉnh mức độ tự động:`, {
        message: difficultyInfo.message,
        lastScore: difficultyInfo.lastScore,
        newDifficulty: finalDifficulty
      });
    }

    // Kiểm tra xem đã có bài luyện tập với mức độ này chưa
    const existingPractice = await Practice.findOne({ 
      lessonId, 
      isActive: true,
      difficulty: finalDifficulty 
    });
    
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

    // Sử dụng AI để tạo câu hỏi luyện tập với mức độ đã điều chỉnh
    const aiResult = await generatePracticeQuestion({
      lessonContent,
      difficulty: finalDifficulty,
      questionType,
      title: title || "Luyện tập"
    });

    // Đảm bảo mức độ hợp lệ trước khi lưu
    const normalizedDifficulty = normalizeDifficulty(finalDifficulty);

    const practice = new Practice({
      title: aiResult.title || title || "Luyện tập",
      // Handle both old and new format
      question: aiResult.question || (aiResult.questions?.[0]?.question || ""),
      questions: aiResult.questions || [],
      totalQuestions: aiResult.totalQuestions || (aiResult.questions?.length || 1),
      lessonId,
      courseId: req.body.courseId,
      difficulty: normalizedDifficulty,
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

// Lấy lịch sử luyện tập của người dùng - GROUP theo bài luyện tập
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

    // Lấy tất cả submissions
    const submissions = await PracticeSubmission.find({ userId, lessonId })
      .populate('practiceId')
      .populate('lessonId courseId')
      .sort({ submittedAt: -1 });

    // Group submissions theo practiceId và tính điểm trung bình cho mỗi bài
    const practiceMap = new Map();
    
    for (const submission of submissions) {
      const practiceId = submission.practiceId?._id?.toString();
      if (!practiceId) continue;

      if (!practiceMap.has(practiceId)) {
        practiceMap.set(practiceId, {
          practice: submission.practiceId,
          submissions: [],
          totalScore: 0,
          totalQuestions: 0,
          firstSubmittedAt: submission.submittedAt,
          lastSubmittedAt: submission.submittedAt,
          correctCount: 0
        });
      }

      const practiceData = practiceMap.get(practiceId);
      practiceData.submissions.push(submission);
      practiceData.totalScore += submission.feedback?.score || 0;
      practiceData.totalQuestions += 1;
      if (submission.isCorrect) practiceData.correctCount += 1;
      
      // Cập nhật thời gian
      if (submission.submittedAt < practiceData.firstSubmittedAt) {
        practiceData.firstSubmittedAt = submission.submittedAt;
      }
      if (submission.submittedAt > practiceData.lastSubmittedAt) {
        practiceData.lastSubmittedAt = submission.submittedAt;
      }
    }

    // Chuyển đổi thành mảng và tính điểm trung bình
    const practiceHistory = Array.from(practiceMap.values()).map(data => ({
      _id: data.practice._id,
      practice: data.practice,
      difficulty: data.practice.difficulty,
      title: data.practice.title,
      totalQuestions: data.totalQuestions,
      averageScore: data.totalQuestions > 0 
        ? Math.round((data.totalScore / data.totalQuestions) * 10) / 10 
        : 0,
      correctCount: data.correctCount,
      incorrectCount: data.totalQuestions - data.correctCount,
      firstSubmittedAt: data.firstSubmittedAt,
      lastSubmittedAt: data.lastSubmittedAt,
      submissions: data.submissions
    }));

    // Sắp xếp theo thời gian nộp bài gần nhất
    practiceHistory.sort((a, b) => new Date(b.lastSubmittedAt) - new Date(a.lastSubmittedAt));

    const practice = await Practice.findOne({ lessonId, isActive: true });

    // Tính điểm trung bình tổng thể
    const totalAvgScore = practiceHistory.length > 0
      ? practiceHistory.reduce((sum, p) => sum + p.averageScore, 0) / practiceHistory.length
      : 0;

    res.json({
      practiceHistory, // Danh sách bài luyện tập đã làm (grouped)
      submissions, // Giữ lại để tương thích ngược
      practice,
      totalPractices: practiceHistory.length,
      totalSubmissions: submissions.length,
      averageScore: Math.round(totalAvgScore * 10) / 10
    });
  } catch (error) {
    console.error("[Practice.getPracticeHistory] Error:", error);
    res.status(500).json({
      message: "Lỗi khi lấy lịch sử luyện tập"
    });
  }
};

// Lấy thông tin mức độ tiếp theo cho bài luyện tập
exports.getNextDifficulty = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user?._id || req.user?.id;

    // Sử dụng service để lấy thông tin mức độ đề xuất
    const difficultyInfo = await getRecommendedDifficulty({ userId, lessonId });

    res.json(difficultyInfo);
  } catch (error) {
    console.error("[Practice.getNextDifficulty] Error:", error);
    res.status(500).json({
      message: "Lỗi khi lấy thông tin mức độ"
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
