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
    // Map mức độ sang hướng dẫn cụ thể cho AI - CÂU HỎI ĐƠN GIẢN → KHÓ DẦN
    const difficultyGuide = {
      "Dễ": {
        description: "Câu hỏi NGẮN GỌN, ĐƠN GIẢN - trả lời được ngay trong 1-2 câu",
        examples: "Kết quả của 2+3 là bao nhiêu? Từ 'hello' trong tiếng Việt nghĩa là gì? Biến x trong đoạn code sau có giá trị bao nhiêu?",
        focus: "Câu hỏi RẤT ĐƠN GIẢN, chỉ cần nhớ/hiểu 1 khái niệm cơ bản từ bài học. Người dùng có thể trả lời NGAY LẬP TỨC trong vài giây. Câu trả lời ngắn gọn 1-2 câu hoặc 1 con số/từ.",
        answerLength: "Câu trả lời chỉ cần 1-2 câu ngắn hoặc 1 giá trị cụ thể"
      },
      "Trung bình": {
        description: "Câu hỏi yêu cầu GIẢI THÍCH hoặc ÁP DỤNG đơn giản",
        examples: "Giải thích tại sao kết quả là X? Viết đoạn code ngắn để làm Y? Tính toán kết quả theo công thức đã học?",
        focus: "Câu hỏi cần suy nghĩ một chút, áp dụng kiến thức bài học vào bài tập cụ thể. Câu trả lời khoảng 3-5 câu hoặc đoạn code ngắn.",
        answerLength: "Câu trả lời khoảng 3-5 câu hoặc đoạn code ngắn 5-10 dòng"
      },
      "Khó": {
        description: "Câu hỏi yêu cầu PHÂN TÍCH và GIẢI QUYẾT vấn đề",
        examples: "Phân tích đoạn code sau và tìm lỗi? So sánh 2 cách tiếp cận và chọn cách tốt hơn? Giải bài toán phức tạp hơn?",
        focus: "Câu hỏi đòi hỏi hiểu sâu, phân tích và vận dụng nhiều kiến thức. Câu trả lời cần giải thích chi tiết.",
        answerLength: "Câu trả lời chi tiết, có phân tích và giải thích"
      },
      "Rất Khó": {
        description: "Câu hỏi yêu cầu THIẾT KẾ và SÁNG TẠO giải pháp",
        examples: "Thiết kế giải pháp hoàn chỉnh cho vấn đề X? Tối ưu hóa và cải tiến code/quy trình? Đánh giá ưu nhược điểm của các phương pháp?",
        focus: "Câu hỏi phức tạp, cần tổng hợp kiến thức và sáng tạo. Câu trả lời cần đầy đủ và có tính hệ thống.",
        answerLength: "Câu trả lời đầy đủ, có thiết kế/giải pháp hoàn chỉnh"
      }
    };

    const guide = difficultyGuide[difficulty] || difficultyGuide["Trung bình"];

    const systemPrompt = `
Bạn là giáo viên tạo CÂU HỎI LUYỆN TẬP cho học viên. Chỉ trả về JSON hợp lệ, không kèm giải thích.

🎯 NGUYÊN TẮC QUAN TRỌNG:
1. Câu hỏi PHẢI LIÊN QUAN TRỰC TIẾP đến nội dung bài học
2. Sử dụng KHÁI NIỆM, VÍ DỤ CỤ THỂ từ bài học
3. Độ khó phải PHÙ HỢP với mức độ yêu cầu

📊 MỨC ĐỘ HIỆN TẠI: ${difficulty}
- ${guide.description}
- ${guide.focus}
- ${guide.answerLength}

${difficulty === "Dễ" ? `
🟢 MỨC DỄ - CÂU HỎI NGẮN GỌN, TRẢ LỜI NGAY:
- Câu hỏi chỉ hỏi 1 điều đơn giản
- Người dùng trả lời được trong vài giây
- Câu trả lời chỉ cần 1-2 câu hoặc 1 giá trị

VÍ DỤ CÂU HỎI MỨC DỄ:
- "Trong Python, lệnh print('Hello') sẽ in ra gì?"
- "2 + 3 * 4 = ?"
- "Từ 'apple' nghĩa là gì?"
- "CSS property nào dùng để đổi màu chữ?"
- "Biến let x = 5; x có giá trị bao nhiêu?"
` : ''}

${difficulty === "Trung bình" ? `
🟡 MỨC TRUNG BÌNH - CÂU HỎI CẦN SUY NGHĨ:
- Yêu cầu áp dụng kiến thức vào bài tập cụ thể
- Cần giải thích ngắn gọn hoặc viết code đơn giản
- Câu trả lời khoảng 3-5 câu

VÍ DỤ CÂU HỎI MỨC TRUNG BÌNH:
- "Viết vòng lặp for in ra các số từ 1 đến 5"
- "Giải thích tại sao kết quả của đoạn code sau là X?"
- "Tính diện tích hình chữ nhật có chiều dài 5, chiều rộng 3"
` : ''}

${difficulty === "Khó" ? `
🟠 MỨC KHÓ - CÂU HỎI PHÂN TÍCH:
- Yêu cầu phân tích, so sánh, tìm lỗi
- Cần hiểu sâu kiến thức bài học
- Câu trả lời cần giải thích chi tiết

VÍ DỤ CÂU HỎI MỨC KHÓ:
- "Tìm và sửa lỗi trong đoạn code sau: ..."
- "So sánh 2 cách tiếp cận A và B, cách nào tốt hơn?"
- "Phân tích độ phức tạp của thuật toán sau"
` : ''}

${difficulty === "Rất Khó" ? `
🔴 MỨC RẤT KHÓ - CÂU HỎI THIẾT KẾ:
- Yêu cầu thiết kế giải pháp hoàn chỉnh
- Cần tổng hợp nhiều kiến thức
- Câu trả lời cần đầy đủ và có hệ thống

VÍ DỤ CÂU HỎI MỨC RẤT KHÓ:
- "Thiết kế hệ thống quản lý X với các yêu cầu..."
- "Tối ưu hóa đoạn code sau để chạy nhanh hơn"
- "Đề xuất giải pháp hoàn chỉnh cho vấn đề Y"
` : ''}

Định dạng JSON BẮT BUỘC:
{
  "title": "Luyện tập: Tên bài học",
  "questions": [
    {
      "id": 1,
      "question": "Câu hỏi 1 - phù hợp mức độ ${difficulty}",
      "explanation": "Kiến thức cần dùng từ bài học"
    },
    {
      "id": 2,
      "question": "Câu hỏi 2 - phù hợp mức độ ${difficulty}",
      "explanation": "Kiến thức cần dùng từ bài học"
    },
    {
      "id": 3,
      "question": "Câu hỏi 3 - phù hợp mức độ ${difficulty}",
      "explanation": "Kiến thức cần dùng từ bài học"
    }
  ],
  "totalQuestions": 3,
  "hints": ["Gợi ý 1", "Gợi ý 2"],
  "tags": ["practice", "${difficulty.toLowerCase()}"]
}`;

    const userPrompt = `
📚 NỘI DUNG BÀI HỌC:
${lessonContent}

🎯 YÊU CẦU TẠO CÂU HỎI:
- Tiêu đề: ${title}
- Mức độ: ${difficulty}
- Tạo chính xác 3 câu hỏi

📊 ĐỘ KHÓ CÂU HỎI - MỨC ${difficulty}:
${guide.description}
${guide.focus}
${guide.answerLength}

${difficulty === "Dễ" ? `
⚡ LƯU Ý QUAN TRỌNG CHO MỨC DỄ:
- Câu hỏi PHẢI NGẮN GỌN, dễ hiểu
- Người dùng có thể trả lời NGAY trong vài giây
- Chỉ hỏi 1 điều đơn giản, không hỏi nhiều ý
- Câu trả lời chỉ cần 1-2 câu hoặc 1 giá trị cụ thể
- KHÔNG yêu cầu viết code dài, giải thích phức tạp

VÍ DỤ CÂU HỎI MỨC DỄ PHÙ HỢP:
- "X + Y = ?" (cho số cụ thể)
- "Từ 'abc' nghĩa là gì?"
- "Lệnh này in ra kết quả gì?"
- "Đúng hay sai: [phát biểu đơn giản]?"
` : ''}

${difficulty === "Trung bình" ? `
📝 LƯU Ý CHO MỨC TRUNG BÌNH:
- Câu hỏi cần suy nghĩ một chút
- Yêu cầu áp dụng kiến thức vào bài tập
- Có thể yêu cầu viết code ngắn hoặc giải thích
` : ''}

${difficulty === "Khó" || difficulty === "Rất Khó" ? `
🔥 LƯU Ý CHO MỨC ${difficulty}:
- Câu hỏi phức tạp, cần phân tích sâu
- Có thể yêu cầu thiết kế, tối ưu, so sánh
- Câu trả lời cần chi tiết và đầy đủ
` : ''}

🔥 QUY TẮC:
1. Câu hỏi PHẢI liên quan đến nội dung bài học ở trên
2. Độ khó PHẢI phù hợp mức ${difficulty}
3. Mỗi câu hỏi có dữ liệu/ví dụ cụ thể

Tạo JSON với title "Luyện tập: ${title}".`;

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

// Lấy lịch sử và điều chỉnh mức độ dựa trên ĐIỂM TRUNG BÌNH của bài luyện tập gần nhất
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
        totalPractices: 0,
        averageScore: 0
      };
    }

    // Group submissions theo practiceId để tính điểm trung bình cho mỗi bài luyện tập
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
          lastSubmittedAt: submission.submittedAt
        });
      }

      const practiceData = practiceMap.get(practiceId);
      practiceData.submissions.push(submission);
      practiceData.totalScore += submission.feedback?.score || 0;
      practiceData.totalQuestions += 1;
      
      // Cập nhật thời gian nộp bài gần nhất
      if (submission.submittedAt > practiceData.lastSubmittedAt) {
        practiceData.lastSubmittedAt = submission.submittedAt;
      }
    }

    // Chuyển thành mảng và tính điểm trung bình cho mỗi bài
    const practiceList = Array.from(practiceMap.values()).map(data => ({
      practiceId: data.practice._id,
      difficulty: data.practice.difficulty,
      averageScore: data.totalQuestions > 0 
        ? Math.round((data.totalScore / data.totalQuestions) * 10) / 10 
        : 0,
      totalQuestions: data.totalQuestions,
      lastSubmittedAt: data.lastSubmittedAt
    }));

    // Sắp xếp theo thời gian nộp bài gần nhất
    practiceList.sort((a, b) => new Date(b.lastSubmittedAt) - new Date(a.lastSubmittedAt));

    // Lấy bài luyện tập gần nhất và điểm trung bình của nó
    const lastPractice = practiceList[0];
    const lastScore = lastPractice.averageScore; // Điểm TRUNG BÌNH của bài luyện tập gần nhất
    const lastDifficulty = lastPractice.difficulty || "Trung bình";

    // Tính điểm trung bình tổng thể của tất cả các bài
    const overallAverageScore = practiceList.length > 0
      ? practiceList.reduce((sum, p) => sum + p.averageScore, 0) / practiceList.length
      : 0;

    // Điều chỉnh mức độ dựa trên điểm TRUNG BÌNH của bài luyện tập gần nhất
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
      message = `Xuất sắc! Điểm TB bài gần nhất: ${lastScore}/10 → Tăng lên mức độ ${nextDifficulty}`;
    } else if (lastScore < 5) {
      message = `Điểm TB bài gần nhất: ${lastScore}/10 → Giảm xuống mức độ ${nextDifficulty} để ôn tập`;
    } else {
      message = `Điểm TB bài gần nhất: ${lastScore}/10 → Giữ nguyên mức độ ${nextDifficulty}`;
    }

    return {
      nextDifficulty,
      lastScore, // Điểm TRUNG BÌNH của bài luyện tập gần nhất
      lastDifficulty,
      lastPracticeQuestions: lastPractice.totalQuestions, // Số câu hỏi trong bài gần nhất
      message,
      totalSubmissions: submissions.length,
      totalPractices: practiceList.length,
      averageScore: Math.round(overallAverageScore * 10) / 10,
      difficultyLevels,
      scoringRules: {
        increase: "Điểm TB > 8/10 → Tăng 1 mức",
        maintain: "Điểm TB 5-8/10 → Giữ nguyên",
        decrease: "Điểm TB < 5/10 → Giảm 1 mức"
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
      totalPractices: 0,
      averageScore: 0
    };
  }
};