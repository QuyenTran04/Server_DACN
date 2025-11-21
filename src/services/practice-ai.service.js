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
          hints: ["Hay suy nghi ve noi dung bai hoc va tra loi ngan gon"],
          tags: ["practice", "review"],
          explanation: "Cau hoi luyen tap do AI tao tu noi dung bai hoc",
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
    question: "Hay tom tat noi dung chinh cua bai hoc va chu y cac diem chinh.",
    expectedAnswer: "",
    hints: ["Doc ky noi dung va trich xuat y chinh"],
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
          suggestions: "Hay xem lai noi dung bai hoc de bo sung.",
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
        feedback: data.feedback || "Hay doc ki noi dung bai hoc va cai thien bai lam.",
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
    feedback: "Co loi khi danh gia cau tra loi. Vui long thu lai.",
    suggestions: "Hay kiem tra lai cau tra loi va nop lai.",
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
  title = "Luyen tap",
}) => {
  try {
    const systemPrompt = `
Ban la giao vien tao bai luyen tap cho hoc vien. Chi tra ve JSON hop le, khong kem giai thich.
Dinh dang:
{
  "title": "Tieu de",
  "question": "Noi dung cau hoi chi tiet",
  "expectedAnswer": "Goi y tra loi mau (neu co)",
  "hints": ["Goi y 1", "Goi y 2"],
  "tags": ["tag1", "tag2"],
  "explanation": "Giai thich ngan ve cau hoi"
}`;

    const userPrompt = `
Noi dung bai hoc:
${lessonContent}

Yeu cau:
- Do kho: ${difficulty}
- Loai cau hoi: ${questionType === "open_ended" ? "Tu luan" : "Trac nghiem"}
- Tieu de goi y: ${title}
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
    throw new Error("Khong the tao cau hoi luyen tap");
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
Ban la giao vien danh gia bai lam. Chi tra ve JSON hop le, khong kem giai thich ngoai JSON.
Dinh dang:
{
  "score": 7.5,
  "feedback": "Nhan xet chi tiet",
  "suggestions": "Goi y cai thien",
  "strengths": ["Diem manh 1"],
  "improvements": ["Can cai thien 1"],
  "correctAspects": ["Phan dung 1"],
  "incorrectAspects": ["Phan sai 1"]
}`;

    const userPrompt = `
Cau hoi:
${question}

Cau tra loi cua hoc vien:
${userAnswer}

${expectedAnswer ? `Cau tra loi goi y: ${expectedAnswer}` : ""}

Noi dung bai hoc tham khao:
${lessonContent}

Do kho: ${difficulty}
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
