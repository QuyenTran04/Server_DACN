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
          questions: [{
            id: 1,
            question: data.trim(),
            expectedAnswer: "",
            explanation: "Câu hỏi luyện tập do AI tạo từ nội dung bài học",
          }],
          totalQuestions: 1,
          hints: ["Hãy suy nghĩ về nội dung bài học và trả lời ngắn gọn"],
          tags: ["practice", "review"],
        };
      }
    }

    if (Array.isArray(data)) {
      data = data[0] || {};
    }

    if (data && typeof data === "object") {
      // Nếu có mảng questions (định dạng mới)
      if (data.questions && Array.isArray(data.questions)) {
        return {
          title: data.title || title,
          questions: data.questions.map((q, index) => ({
            id: q.id || index + 1,
            question: q.question || q.content || "",
            expectedAnswer: q.expectedAnswer || q.answer || "",
            explanation: q.explanation || "",
          })),
          totalQuestions: data.totalQuestions || data.questions.length,
          hints: data.hints || [],
          tags: data.tags || ["practice"],
        };
      }

      // Nếu chỉ có 1 câu hỏi (định dạng cũ) - chuyển đổi thành mảng
      return {
        title: data.title || title,
        questions: [{
          id: 1,
          question: data.question || data.prompt || data.content || "",
          expectedAnswer: data.expectedAnswer || data.answer || "",
          explanation: data.explanation || "",
        }],
        totalQuestions: 1,
        hints: data.hints || [],
        tags: data.tags || ["practice"],
      };
    }
  } catch (err) {
    console.error("[PracticeAI.normalizeQuestionResponse] Error:", err);
  }

  // Fallback với 1 câu hỏi mặc định
  return {
    title,
    questions: [{
      id: 1,
      question: "Hãy tóm tắt nội dung chính của bài học và chú ý các điểm chính.",
      expectedAnswer: "",
      explanation: "",
    }],
    totalQuestions: 1,
    hints: ["Đọc kỹ nội dung và trích xuất ý chính"],
    tags: ["practice"],
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
          score: 5,
          feedback: "Có lỗi khi đánh giá câu trả lời. Vui lòng thử lại.",
          suggestions: "Hãy kiểm tra lại câu trả lời và nộp lại.",
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
      const result = {
        score: Math.min(10, Math.max(0, parseFloat(data.score) || 5)),
        feedback: data.feedback || data.response || "Không có nhận xét cụ thể.",
        suggestions: data.suggestions || data.improvement || "Cần cải thiện thêm.",
        strengths: Array.isArray(data.strengths) ? data.strengths : [],
        improvements: Array.isArray(data.improvements) ? data.improvements : [],
        correctAspects: Array.isArray(data.correctAspects) ? data.correctAspects : [],
        incorrectAspects: Array.isArray(data.incorrectAspects) ? data.incorrectAspects : [],
      };

      // Debug logging
      console.log("[PracticeAI.normalizeEvaluation] Feedback debug:");
      console.log("  - Original feedback:", data.feedback);
      console.log("  - Final feedback:", result.feedback);

      return result;
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

QUAN TRỌNG:
- Trả về MỘT đối tượng JSON hợp lệ duy nhất
- Đặt toàn bộ chuỗi trong dấu ngoặc kép nếu có ký tự đặc biệt
- Sử dụng escape sequences cho dấu ngoặc kép: \\"
- Không có dấu phẩy thừa ở cuối mảng hoặc đối tượng
- Đảm bảo JSON hoàn hảo

Định dạng BẮT BUỘC:
{
  "title": "Luyện tập: Tên bài học",
  "questions": [
    {
      "id": 1,
      "question": "Nội dung câu hỏi 1",
      "expectedAnswer": "Đáp án gợi ý 1",
      "explanation": "Giải thích câu hỏi 1"
    },
    {
      "id": 2,
      "question": "Nội dung câu hỏi 2",
      "expectedAnswer": "Đáp án gợi ý 2",
      "explanation": "Giải thích câu hỏi 2"
    },
    {
      "id": 3,
      "question": "Nội dung câu hỏi 3",
      "expectedAnswer": "Đáp án gợi ý 3",
      "explanation": "Giải thích câu hỏi 3"
    }
  ],
  "totalQuestions": 3
}`;

    const userPrompt = `
Nội dung bài học:
${lessonContent}

Yêu cầu:
- Độ khó: ${difficulty}
- Tiêu đề gợi ý: ${title}
- Tạo chính xác 3 câu hỏi nhỏ, mỗi câu hỏi tập trung vào một khía cảnh cụ thể
- Mỗi câu hỏi phải độc lập, ngắn gọn, rõ ràng

Hãy tạo JSON hợp lệ theo đúng định dạng trong system prompt. Title sẽ là "Luyện tập: ${title}".`;

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
  answerType = "text",
  language = "javascript",
}) => {
  try {
    const systemPrompt = `
Bạn là giáo viên chuyên môn đánh giá bài luyện tập. Hãy đưa ra phản hồi chi tiết, mang tính xây dựng và sử dụng **Markdown formatting**.

QUAN TRỌNG: Chỉ trả về JSON hợp lệ duy nhất với định dạng sau:

{
  "score": 7.5,
  "feedback": "## 📝 Đánh giá chi tiết\\n\\n### ✅ Điểm tốt\\n- **Điểm chính xác**: Câu trả lời đúng trọng tâm\\n- **Rõ ràng**: Diễn đạt mạch lạc\\n\\n### ⚠️ Cần cải thiện\\n- **Thiếu chi tiết**: Cần bổ sung thông tin\\n- **Lập luận**: Cần làm rõ hơn",
  "suggestions": "## 💡 Gợi ý cải thiện\\n\\n1. **Cụ thể hóa**: Thêm ví dụ thực tế\\n2. **Cấu trúc**: Sử dụng Mở-Thân-Kết\\n3. **Thuật ngữ**: Sử dụng từ khóa chính xác\\n\\n### 📚 Tài liệu tham khảo\\n- Xem lại mục X trong bài học\\n- Tham khảo ví dụ Y"
}`;

      const userPrompt = `
📚 CÂU HỎI:
${question}

👤 CÂU TRẢ LỜI CỦA HỌC VIÊN:
${userAnswer}
${answerType === 'code' ? `\n\n💻 NGÔN NGỮ LẬP TRÌNH: ${language}\n\n📝 CODE:\n\`\`\`${language}\n${userAnswer}\n\`\`` : ''}

📖 NỘI DUNG BÀI HỌC THAM KHẢO:
${lessonContent}

🎯 ĐỘ KHÓ: ${difficulty}

HÃY ĐÁNH GIÁ CHI TIẾT THEO CÁC TIÊU CHÍ:

### 1. TÍNH CHÍNH XÁC (40%)
- Có trả lời đúng trọng tâm câu hỏi không?
- Thông tin có chính xác theo bài học không?

### 2. TÍNH ĐẦY ĐỦ (30%)
- Có đủ thông tin cần thiết không?
- Có bỏ sót các điểm quan trọng không?

### 3. RÕ RÀNG VÀ MẠCH LẠC (30%)
- Diễn đạt có dễ hiểu không?
- Cấu trúc có logic không?

### 📝 YÊU CẦU PHẢN HỒI:

**ĐẶC BIỆT CHO CODE:**
${answerType === 'code' ? `
- **Syntax**: Cú pháp có đúng không?
- **Logic**: Logic có đúng và hiệu quả không?
- **Best practices**: Có tuân thủ coding standards không?
- **Code readability**: Code có dễ đọc và hiểu không?` : ''}

**TRƯỜNG HỢP ĐÚNG (score 7-10):**
- Nêu bật **điểm xuất sắc** và **điểm tốt**
- Gợi ý cách làm **hoàn hảo hơn**
- Tặng kèm lời khen khích lệ

**TRƯỜNG HỢP CHƯA ĐỦ (score 4-6):**
- Nêu cụ thể **thiếu sót gì**
- Chỉ **gần đúng ở điểm nào**
- Hướng dẫn **cách cải thiện**

**TRƯỜNG HỢP SAI (score 0-3):**
- Phân tích **nguyên nhân sai**
- Chỉ ra **hiểu lầm ở đâu**
- Đưa ra **lộ trình học lại**

### 💫 LƯU Ý QUAN TRỌNG:
- Luôn bắt đầu bằng lời khen hoặc động viên
- Sử dụng EMOJI phù hợp: ✅ ⚠️ ❌ 💡 📚 💪 ⌨️ 💻
- Feedback phải **xây dựng**, không chê bai
- Luôn có **gợi ý cụ thể** để cải thiện
- ${answerType === 'code' ? 'Cho code example cụ thể để cải thiện' : 'Tham khảo chính xác nội dung bài học'}
- Sử dụng **Markdown formatting** chuyên nghiệp
- ${answerType === 'code' ? 'Sử dụng code blocks cho ví dụ' : ''}
`;

    const aiResult = await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.4, // Tăng một chút để sáng tạo hơn
      maxOutputTokens: 1500, // Tăng để có feedback chi tiết hơn
    });

    return normalizeEvaluation(aiResult);
  } catch (error) {
    console.error("[PracticeAI.evaluatePracticeAnswer] Error:", error);
    throw new Error("Không thể đánh giá câu trả lời");
  }
};