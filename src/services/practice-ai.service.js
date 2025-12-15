const { callGeminiJSON } = require("../services/gemini.service");
const PracticeSubmission = require("../models/PracticeSubmission");
const Practice = require("../models/Practice");

// Hàm đảm bảo mức độ hợp lệ
function normalizeDifficulty(difficulty) {
  const validDifficulties = ["Dễ", "Trung bình", "Khó", "Rất Khó"];

  if (validDifficulties.includes(difficulty)) {
    return difficulty;
  }

  // Map các giá trị tiếng Anh sang tiếng Việt
  const difficultyMap = {
    "easy": "Dễ",
    "medium": "Trung bình",
    "hard": "Khó",
    "very hard": "Rất Khó",
    "very_hard": "Rất Khó",
    "Easy": "Dễ",
    "Medium": "Trung bình",
    "Hard": "Khó",
    "Very Hard": "Rất Khó"
  };

  return difficultyMap[difficulty] || "Trung bình";
}

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
  difficulty = "Trung bình",
  questionType = "open_ended",
  title = "Luyện tập",
}) => {
  try {
    // Map mức độ sang hướng dẫn cụ thể cho AI
    const difficultyGuide = {
      "Dễ": {
        description: "Câu hỏi cơ bản, kiểm tra hiểu biết về khái niệm chính",
        examples: "Giải thích khái niệm X là gì? Liệt kê các bước thực hiện Y? Mô tả đặc điểm của Z?",
        focus: "Nhớ lại và hiểu khái niệm cơ bản từ bài học"
      },
      "Trung bình": {
        description: "Câu hỏi yêu cầu áp dụng kiến thức vào tình huống cụ thể",
        examples: "Làm thế nào để áp dụng X trong tình huống Y? So sánh A và B? Phân tích ưu nhược điểm của Z?",
        focus: "Áp dụng và phân tích kiến thức từ bài học"
      },
      "Khó": {
        description: "Câu hỏi yêu cầu tư duy phản biện và giải quyết vấn đề phức tạp",
        examples: "Đánh giá hiệu quả của phương pháp X trong trường hợp Y? Đề xuất giải pháp cho vấn đề Z? Tại sao A lại quan trọng hơn B trong ngữ cảnh C?",
        focus: "Phân tích sâu, đánh giá và đề xuất giải pháp"
      },
      "Rất Khó": {
        description: "Câu hỏi yêu cầu tổng hợp kiến thức, sáng tạo và tư duy cấp cao",
        examples: "Thiết kế một hệ thống/giải pháp hoàn chỉnh cho vấn đề X? Phân tích và so sánh nhiều phương pháp khác nhau? Đề xuất cải tiến cho Y dựa trên nguyên lý Z?",
        focus: "Tổng hợp, sáng tạo và tư duy hệ thống"
      }
    };

    const guide = difficultyGuide[difficulty] || difficultyGuide["Trung bình"];

    const systemPrompt = `
Bạn là giáo viên tạo bài luyện tập cho học viên. Chỉ trả về JSON hợp lệ, không kèm giải thích.

QUAN TRỌNG - TẠO CÂU HỎI BÁM SÁT NỘI DUNG BÀI HỌC:
- Câu hỏi PHẢI dựa trên nội dung CỤ THỂ trong bài học
- KHÔNG tạo câu hỏi chung chung không liên quan đến bài học
- Trích dẫn các khái niệm, ví dụ, thuật ngữ CHÍNH XÁC từ bài học
- Câu hỏi phải giúp học viên ôn tập và hiểu sâu nội dung đã học

ĐỂ TẠO CÂU HỎI TỐT:
1. Đọc kỹ toàn bộ nội dung bài học
2. Xác định các khái niệm chính, ví dụ cụ thể, và thuật ngữ quan trọng
3. Tạo câu hỏi yêu cầu học viên PHẢI dựa vào nội dung bài học để trả lời
4. Sử dụng chính xác các thuật ngữ, ví dụ trong bài học
5. Tránh các câu hỏi có thể trả lời bằng kiến thức chung

MỨC ĐỘ: ${difficulty}
- Mô tả: ${guide.description}
- Ví dụ: ${guide.examples}
- Tập trung: ${guide.focus}
- CHỈ SỬ DỤNG CÁC MỨC ĐỘ: "Dễ", "Trung bình", "Khó", "Rất Khó"

Định dạng BẮT BUỘC:
{
  "title": "Luyện tập: Tên bài học",
  "questions": [
    {
      "id": 1,
      "question": "Nội dung câu hỏi 1 BÁM SÁT bài học",
      "explanation": "Giải thích câu hỏi 1 và liên hệ với nội dung bài học"
    },
    {
      "id": 2,
      "question": "Nội dung câu hỏi 2 BÁM SÁT bài học",
      "explanation": "Giải thích câu hỏi 2 và liên hệ với nội dung bài học"
    },
    {
      "id": 3,
      "question": "Nội dung câu hỏi 3 BÁM SÁT bài học",
      "explanation": "Giải thích câu hỏi 3 và liên hệ với nội dung bài học"
    }
  ],
  "totalQuestions": 3,
  "hints": ["Gợi ý 1 liên quan đến bài học", "Gợi ý 2 liên quan đến bài học"],
  "tags": ["tag1", "tag2"]
}

QUY TẮC TẠO CÂU HỎI:
✅ Sử dụng thuật ngữ, khái niệm CỤ THỂ từ bài học
✅ Tham chiếu đến ví dụ, tình huống trong bài học
✅ Yêu cầu áp dụng kiến thức đã học vào tình huống mới
✅ Phù hợp với mức độ ${difficulty}
✅ Mức độ phải là một trong: "Dễ", "Trung bình", "Khó", "Rất Khó"

❌ KHÔNG tạo câu hỏi chung chung
❌ KHÔNG hỏi về kiến thức ngoài bài học
❌ KHÔNG sử dụng "easy", "medium", "hard" - chỉ dùng tiếng Việt
❌ KHÔNG tạo expectedAnswer - AI sẽ đánh giá tự nhiên`;

    const userPrompt = `
📚 NỘI DUNG BÀI HỌC:
${lessonContent}

🎯 YÊU CẦU:
- Mức độ: ${difficulty} (${guide.description})
- Tiêu đề: ${title}
- Tạo chính xác 3 câu hỏi BÁM SÁT nội dung bài học trên
- Mỗi câu hỏi phải tham chiếu đến khái niệm/ví dụ CỤ THỂ trong bài học
- Độ khó phù hợp với mức ${difficulty}

💡 HƯỚNG DẪN CHO MỨC ${difficulty}:
${guide.focus}

Ví dụ câu hỏi: ${guide.examples}

QUY TẮC QUAN TRỌNG:
- PHẢI đọc kỹ toàn bộ nội dung bài học trước khi tạo câu hỏi
- Tạo câu hỏi về các khái niệm, ví dụ, code example CÓ TRONG BÀI HỌC
- KHÔNG tạo câu hỏi về kiến thức chung
- Mỗi câu hỏi phải YÊU CẦU học viên DỰA VÀO NỘI DUNG BÀI HỌC để trả lời

Hãy tạo JSON hợp lệ theo đúng định dạng. Title sẽ là "Luyện tập: ${title}".`;

    const aiResult = await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      maxOutputTokens: 1000,
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
  difficulty = "Trung bình",
  answerType = "text",
  language = "javascript",
}) => {
  try {
    // Hướng dẫn đánh giá theo mức độ
    const difficultyEvalGuide = {
      "Dễ": "Đánh giá xem học viên có hiểu đúng khái niệm cơ bản không. Chấp nhận câu trả lời đơn giản nhưng chính xác.",
      "Trung bình": "Đánh giá khả năng áp dụng kiến thức. Yêu cầu giải thích rõ ràng và có ví dụ minh họa.",
      "Khó": "Đánh giá tư duy phản biện và khả năng phân tích. Yêu cầu phân tích sâu, so sánh và đánh giá.",
      "Rất Khó": "Đánh giá khả năng tổng hợp và sáng tạo. Yêu cầu giải pháp hoàn chỉnh, có tính hệ thống và sáng tạo."
    };

    const evalGuide = difficultyEvalGuide[difficulty] || difficultyEvalGuide["Trung bình"];

    const systemPrompt = `
Bạn là chuyên gia đánh giá bài luyện tập. Hãy phân tích câu trả lời của học viên một cách khách quan, chỉ rõ vấn đề và đưa ra giải thích cụ thể.

MỨC ĐỘ BÀI TẬP: ${difficulty}
TIÊU CHÍ ĐÁNH GIÁ: ${evalGuide}

YÊU CẦU ĐÁNH GIÁ:
- Đánh giá dựa trên nội dung bài học đã cung cấp
- Phân tích sâu hiểu biết của học viên về vấn đề
- Chỉ ra chính xác đâu là điểm đúng, đâu là điểm chưa chính xác
- Giải thích tại sao một cách tiếp cận đúng và cách khác chưa đúng
- Đưa ra ví dụ cụ thể từ bài học để minh họa
- Điểm số phải phản ánh đúng mức độ bài tập

Định dạng JSON (chỉ trả về object duy nhất):

{
  "score": 7.5,
  "feedback": "Phân tích chi tiết câu trả lời dựa trên nội dung bài học: [chỉ rõ điểm đúng, điểm sai, và giải thích tại sao]. Ví dụ từ bài học: [minh họa bằng ví dụ từ bài học].",
  "suggestions": "Để cải thiện, bạn nên: [hướng dẫn cụ thể từng bước dựa trên bài học]. Ví dụ áp dụng: [ví dụ cụ thể từ bài học]."
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

// Xuất hàm normalizeDifficulty để sử dụng ở controller
exports.normalizeDifficulty = normalizeDifficulty;

// Lấy lịch sử và điều chỉnh mức độ dựa trên kết quả trước đó
exports.getRecommendedDifficulty = async ({ userId, lessonId }) => {
  try {
    // Lấy tất cả các bài nộp của user trong bài học này
    const submissions = await PracticeSubmission.find({
      userId,
      lessonId,
      aiProcessed: true
    })
      .sort({ submittedAt: -1 })
      .populate('practiceId');

    if (submissions.length === 0) {
      return {
        nextDifficulty: "Trung bình",
        lastScore: null,
        lastDifficulty: null,
        message: "Bài luyện tập đầu tiên sẽ ở mức độ Trung bình",
        totalSubmissions: 0,
        averageScore: 0
      };
    }

    // Lấy bài nộp gần nhất
    const lastSubmission = submissions[0];
    const lastScore = lastSubmission.feedback?.score || 0;
    const lastDifficulty = lastSubmission.practiceId?.difficulty || "Trung bình";

    // Tính điểm trung bình của tất cả các bài đã nộp
    const averageScore = submissions.reduce((sum, sub) => sum + (sub.feedback?.score || 0), 0) / submissions.length;

    // Điều chỉnh mức độ dựa trên điểm gần nhất
    const difficultyLevels = ["Dễ", "Trung bình", "Khó", "Rất Khó"];
    const currentIndex = difficultyLevels.indexOf(lastDifficulty);

    let nextDifficulty = lastDifficulty;

    if (currentIndex !== -1) {
      if (lastScore > 8 && currentIndex < difficultyLevels.length - 1) {
        nextDifficulty = difficultyLevels[currentIndex + 1];
      } else if (lastScore < 5 && currentIndex > 0) {
        nextDifficulty = difficultyLevels[currentIndex - 1];
      }
    }

    let message = "";
    if (lastScore > 8) {
      message = `Xuất sắc! Điểm ${lastScore}/10 → Tăng lên mức độ ${nextDifficulty}`;
    } else if (lastScore < 5) {
      message = `Điểm ${lastScore}/10 → Giảm xuống mức độ ${nextDifficulty} để ôn tập`;
    } else {
      message = `Điểm ${lastScore}/10 → Giữ nguyên mức độ ${nextDifficulty}`;
    }

    return {
      nextDifficulty,
      lastScore,
      lastDifficulty,
      message,
      totalSubmissions: submissions.length,
      averageScore: Math.round(averageScore * 10) / 10, // Làm tròn 1 chữ số thập phân
      difficultyLevels,
      scoringRules: {
        increase: "Điểm > 8/10 → Tăng 1 mức",
        maintain: "Điểm 5-8/10 → Giữ nguyên",
        decrease: "Điểm < 5/10 → Giảm 1 mức"
      }
    };
  } catch (error) {
    console.error("[PracticeAI.getRecommendedDifficulty] Error:", error);
    return {
      nextDifficulty: "Trung bình",
      lastScore: null,
      lastDifficulty: null,
      message: "Lỗi khi lấy thông tin, sử dụng mức độ mặc định",
      totalSubmissions: 0,
      averageScore: 0
    };
  }
};