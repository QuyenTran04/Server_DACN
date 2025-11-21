const { callGeminiJSON } = require("../services/gemini.service");

function normalizeQuestionResponse(aiResult, { title }) {
  try {
    let data = aiResult;

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return {
          title,
          question: data.trim(),
          expectedAnswer: "",
          hints: ["Hãy suy nghĩ về nội dung bài học và trả lời ngắn gọn"],
          tags: ["practice", "review"],
          explanation: "Câu hỏi luyện tập do AI tạo từ nội dung bài học",
        };
      }
    }

    if (Array.isArray(data)) {
      data = data[0] || {};
    }

    if (data && typeof data === "object") {
      return {
        title: data.title || title,
        question: data.question || data.prompt || data.content || "",
        expectedAnswer: data.expectedAnswer || data.answer || "",
        hints: data.hints || [],
        tags: data.tags || ["practice"],
        explanation: data.explanation || "",
      };
    }
  } catch (err) {
    console.error("[PracticeAI.normalizeQuestionResponse] Error:", err);
  }

  return {
    title,
    question: "Hãy tóm tắt nội dung chính của bài học và chú ý các điểm chính.",
    expectedAnswer: "",
    hints: ["Đọc kỹ nội dung và trích xuất ý chính"],
    tags: ["practice"],
    explanation: "",
  };
}

function normalizeEvaluation(aiResult) {
  try {
    let data = aiResult;

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return {
          score: 6,
          feedback: String(data).trim(),
          suggestions: "Hãy xem lại nội dung bài học để bổ sung.",
          strengths: [],
          improvements: [],
          correctAspects: [],
          incorrectAspects: [],
        };
      }
    }

    if (Array.isArray(data)) {
      data = data[0] || {};
    }

    if (data && typeof data === "object") {
      const score = Math.min(10, Math.max(0, parseFloat(data.score) || 5));
      return {
        score,
        feedback: data.feedback || "Hãy đọc kỹ nội dung bài học và cải thiện bài làm.",
        suggestions: data.suggestions || "",
        strengths: data.strengths || [],
        improvements: data.improvements || [],
        correctAspects: data.correctAspects || [],
        incorrectAspects: data.incorrectAspects || [],
      };
    }
  } catch (err) {
    console.error("[PracticeAI.normalizeEvaluation] Error:", err);
  }

  return {
    score: 5,
    feedback: "Có lỗi khi đánh giá câu trả lời. Vui lòng thử lại.",
    suggestions: "Hãy kiểm tra lại câu trả lời và nộp lại.",
    strengths: [],
    improvements: [],
    correctAspects: [],
    incorrectAspects: [],
  };
}

// Tạo câu hỏi luyện tập từ nội dung bài học
exports.generatePracticeQuestion = async ({
  lessonContent,
  difficulty = "medium",
  questionType = "open_ended",
  title = "Luyện tập",
}) => {
  try {
    const systemPrompt = `
Bạn là giáo viên tạo bài luyện tập cho học viên. Chỉ trả về JSON hợp lệ, không kèm giải thích.
Định dạng:
{
  "title": "Tiêu đề",
  "question": "Nội dung câu hỏi chi tiết",
  "expectedAnswer": "Gợi ý trả lời mẫu (nếu có)",
  "hints": ["Gợi ý 1", "Gợi ý 2"],
  "tags": ["tag1", "tag2"],
  "explanation": "Giải thích ngắn về câu hỏi"
}`;

    const userPrompt = `
Nội dung bài học:
${lessonContent}

Yêu cầu:
- Độ khó: ${difficulty}
- Loại câu hỏi: ${questionType === "open_ended" ? "Tự luận" : "Trắc nghiệm"}
- Tiêu đề gợi ý: ${title}
`;

    const aiResult = await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      maxOutputTokens: 800,
    });

    return normalizeQuestionResponse(aiResult, { title });
  } catch (error) {
    console.error("[PracticeAI.generateQuestion] Error:", error);
    throw new Error("Không thể tạo câu hỏi luyện tập");
  }
};

// Đánh giá câu trả lời của người dùng
exports.evaluatePracticeAnswer = async ({
  question,
  userAnswer,
  expectedAnswer = "",
  lessonContent,
  difficulty = "medium",
}) => {
  try {
    const systemPrompt = `
Bạn là giáo viên đánh giá bài làm. Chỉ trả về JSON hợp lệ, không kèm giải thích ngoài JSON.
Định dạng:
{
  "score": 7.5,
  "feedback": "Nhận xét chi tiết",
  "suggestions": "Gợi ý cải thiện",
  "strengths": ["Điểm mạnh 1"],
  "improvements": ["Cần cải thiện 1"],
  "correctAspects": ["Phần đúng 1"],
  "incorrectAspects": ["Phần sai 1"]
}`;

    const userPrompt = `
Câu hỏi:
${question}

Câu trả lời của học viên:
${userAnswer}

${expectedAnswer ? `Câu trả lời gợi ý: ${expectedAnswer}` : ""}

Nội dung bài học tham khảo:
${lessonContent}

Độ khó: ${difficulty}
`;

    const aiResult = await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxOutputTokens: 1000,
    });

    return normalizeEvaluation(aiResult);
  } catch (error) {
    console.error("[PracticeAI.evaluateAnswer] Error:", error);
    // Return fallback evaluation
    return {
      score: 5,
      feedback: "Co loi khi danh gia cau tra loi. Vui long thu lai.",
      suggestions: "Hay kiem tra lai cau tra loi va nop lai.",
      strengths: [],
      improvements: [],
      correctAspects: [],
      incorrectAspects: [],
    };
  }
};
