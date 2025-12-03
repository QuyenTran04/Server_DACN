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
        // Nếu không parse được, xem như đây là feedback tự nhiên
        return {
          score: 6, // Mặc định trung bình khi không có điểm rõ ràng
          feedback: aiResult.length > 50 ? aiResult : "AI đang xử lý phản hồi của bạn. Vui lòng thử lại.",
          suggestions: "Hãy thử phát triển thêm ý tưởng của bạn với các ví dụ cụ thể.",
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
        score: Math.min(10, Math.max(0, parseFloat(data.score) || 6)), // Mặc định 6 nếu không có điểm
        feedback: data.feedback || data.response || data.message || "Cảm ơn bạn đã chia sẻ suy nghĩ của mình!",
        suggestions: data.suggestions || data.improvement || data.guide || "Tiếp tục phát triển ý tưởng của bạn với các ví dụ thực tế hơn nhé!",
        strengths: Array.isArray(data.strengths) ? data.strengths : [],
        improvements: Array.isArray(data.improvements) ? data.improvements : [],
        correctAspects: Array.isArray(data.correctAspects) ? data.correctAspects : [],
        incorrectAspects: Array.isArray(data.incorrectAspects) ? data.incorrectAspects : [],
      };

      // Debug logging - chi tiết hơn
      console.log("[PracticeAI.normalizeEvaluation] Feedback processed:");
      console.log("  - Score:", result.score);
      console.log("  - Feedback length:", result.feedback.length);
      console.log("  - Has suggestions:", !!result.suggestions);

      return result;
    }
  } catch (err) {
    console.error("[PracticeAI.normalizeEvaluation] Error:", err);
  }

  // Fallback với thông điệp thân thiện
  return {
    score: 6,
    feedback: "Anh/cô đã đọc câu trả lời của em rồi. Em đã có những suy nghĩ rất thú vị! Hãy tiếp tục phát triển ý tưởng của mình nhé.",
    suggestions: "Thử nghĩ thêm về các ví dụ thực tế liên quan đến vấn đề này xem sao!",
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
      "explanation": "Giải thích câu hỏi 1"
    },
    {
      "id": 2,
      "question": "Nội dung câu hỏi 2",
      "explanation": "Giải thích câu hỏi 2"
    },
    {
      "id": 3,
      "question": "Nội dung câu hỏi 3",
      "explanation": "Giải thích câu hỏi 3"
    }
  ],
  "totalQuestions": 3
}

LƯU Ý QUAN TRỌNG:
- KHÔNG tạo expectedAnswer - AI sẽ đánh giá tự nhiên dựa trên câu trả lời của người dùng
- Tạo câu hỏi mở, khuyến khích suy nghĩ và sáng tạo
- Tập trung vào việc áp dụng kiến thức thay vì nhớ lại thông tin`;

    const userPrompt = `
Nội dung bài học:
${lessonContent}

Yêu cầu:
- Độ khó: ${difficulty}
- Tiêu đề gợi ý: ${title}
- Tạo chính xác 3 câu hỏi MỞ, khuyến khích suy nghĩ và sáng tạo
- Mỗi câu hỏi tập trung vào việc áp dụng kiến thức vào thực tế
- KHÔNG tạo câu hỏi chỉ cần nhớ lại thông tin
- Đặt câu hỏi "Tại sao?", "Làm thế nào?", "Phân tích...", "So sánh...", "Đề xuất..."

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
Bạn là chuyên gia đánh giá bài luyện tập. Hãy phân tích câu trả lời của học viên một cách khách quan, chỉ rõ vấn đề và đưa ra giải thích cụ thể.

YÊU CẦU ĐÁNH GIÁ:
- Phân tích sâu hiểu biết của học viên về vấn đề
- Chỉ ra chính xác đâu là điểm đúng, đâu là điểm chưa chính xác
- Giải thích tại sao một cách tiếp cận đúng và cách khác chưa đúng
- Đưa ra ví dụ cụ thể để minh họa

Định dạng JSON (chỉ trả về object duy nhất):

{
  "score": 7.5,
  "feedback": "Phân tích chi tiết câu trả lời: [chỉ rõ điểm đúng, điểm sai, và giải thích tại sao]. Ví dụ cụ thể: [minh họa bằng ví dụ thực tế].",
  "suggestions": "Để cải thiện, bạn nên: [hướng dẫn cụ thể từng bước]. Ví dụ áp dụng: [ví dụ cụ thể]."
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

PHÂN TÍCH VÀ ĐÁNH GIÁ CHI TIẾT:

### 🎯 CẤU TRÚC PHÂN TÍCH:

**1. PHÂN TÍCH CÂU TRẢ LỜI:**
- Xác định các luận điểm chính trong câu trả lời
- Đánh giá tính chính xác của từng luận điểm
- Chỉ ra mâu thuẫn hoặc thiếu sót (nếu có)

**2. GIẢI THÍCH LÝ THUYẾT:**
- Giải thích tại sao một phương pháp đúng và phương pháp khác sai
- Trích dẫn các nguyên tắc/cơ sở lý thuyết liên quan
- Cho thấy mối liên hệ giữa lý thuyết và thực tế

**3. VÍ DỤ MINH HỌA:**
- Đưa ra ví dụ cụ thể để minh họa cho điểm đúng
- Đưa ra ví dụ counter-example để chỉ ra điểm chưa chính xác
- So sánh các cách tiếp cận khác nhau

**ĐẶC BIỆT VỀ CODE:**
${answerType === 'code' ? `
- Phân tích thuật toán và độ phức tạp (Big O)
- Đánh giá best practices và design patterns
- Chỉ ra các vấn đề về performance, scalability
- Giải thích trade-offs giữa các giải pháp khác nhau` : ''}

### 📝 YÊU CẦU ĐÁNH GIÁ:

**CHẤT LƯỢNG CAO (score 7-10):**
- Phân tích sâu: chỉ ra các điểm chính xác và tại sao chúng chính xác
- Giải thích rõ ràng cơ sở lý thuyết đằng sau
- Đưa ra ví dụ thực tế minh họa
- Gợi ý cách mở rộng hoặc áp dụng cao hơn

**CẦN CẢI THIỆN (score 4-6):**
- Chỉ rõ điểm nào đúng và điểm nào cần cải thiện
- Giải thích tại sao điểm đó chưa chính xác
- Đưa ra ví dụ counter để minh họa
- Hướng dẫn cách tiếp cận đúng hơn

**CẦN HỖ TRỢ (score 0-3):**
- Phân tích các hiểu lầm cơ bản
- Giải thích lại khái niệm từ đầu
- Đưa ra các ví dụ đơn giản, dễ hiểu
- Xây dựng lại lộ trình hiểu đúng

### 💡 NGUYÊN TẮC ĐÁNH GIÁ:
- **Khách quan** - dựa trên logic và bằng chứng
- **Cụ thể** - chỉ rõ điểm nào, tại sao, như thế nào
- **Có cơ sở** - giải thích dựa trên lý thuyết đã học
- ${answerType === 'code' ? 'Tư duy algorithm quan trọng hơn syntax' : 'Kiến thức phải đúng và đầy đủ'}
`;

    const aiResult = await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.3, // Giảm để phản hồi khách quan và chính xác hơn
      maxOutputTokens: 1500, // Đủ để có feedback chi tiết
    });

    return normalizeEvaluation(aiResult);
  } catch (error) {
    console.error("[PracticeAI.evaluatePracticeAnswer] Error:", error);
    throw new Error("Không thể đánh giá câu trả lời");
  }
};