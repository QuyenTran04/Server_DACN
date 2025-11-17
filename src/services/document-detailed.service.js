const { callLLMJSON } = require("./llm.service");
const {
  extractKeyVocabulary,
} = require("../utils/dynamicPrompt.helper");

const MIN_CONTENT_CHARS = 2500; // Đảm bảo tài liệu đầy đủ chi tiết

async function generateDetailedLessonDocument({
  lessonTitle = "",
  lessonContent = "",
  courseTitle = "",
  courseDescription = "",
  level = "Beginner",
  language = "vi",
} = {}) {
  try {
    console.log(`[generateDetailedLessonDocument] Starting for: ${lessonTitle}`);

    const keyTerms = extractKeyVocabulary(
      lessonContent || `${lessonTitle} ${courseTitle} ${courseDescription}`,
      12
    );

    const systemPrompt =
      language === "vi"
        ? `Bạn là một chuyên gia giáo dục với kinh nghiệm dạy học ở cấp ${level}.
Chuyên môn: ${courseTitle}

CÔNG VIỆC CHÍNH:
Tạo tài liệu học tập HOÀN CHỈNH, CHI TIẾT, TOÀN DIỆN và THỰC TIỄN.
- Tài liệu phải có thể đứng độc lập - học viên có thể tự học từ đó mà không cần tài liệu khác
- Không được làm tắt hay bỏ qua bất kỳ khái niệm nào
- Mỗi khái niệm phải giải thích "tại sao" không chỉ "là gì"

TIÊU CHUAN CHẤT LƯỢNG:
1. Nội dung tối thiểu 2000 ký tự, ưu tiên chất lượng
2. Cấu trúc logic, dễ theo dõi, phù hợp cho tự học
3. Giải thích kỹ từng khái niệm, tránh dùng thuật ngữ chưa được giải thích
4. Bao gồm ít nhất 4-5 ví dụ thực tế, cụ thể, dễ hiểu
5. Cung cấp công thức, quy trình, bước thực hiện rõ ràng với hình minh họa (nếu cần)
6. Có 4-5 bài tập luyện tập từ cơ bản đến nâng cao, kèm gợi ý hoặc hướng dẫn

Trả về JSON hợp lệ với các trường: title, content, summary, tags.`
        : `You are an expert educator at the ${level} level.
Create COMPREHENSIVE, DETAILED, and PRACTICAL lesson documents.

Requirements:
1. Minimum 2000 characters, prioritize quality over length
2. Logical structure, easy to follow
3. Clear explanations of each concept
4. At least 3-4 real-world examples
5. Include formulas / processes / step-by-step procedures
6. Provide practice exercises with guidance

Return valid JSON with fields: title, content, summary, tags.`;

    const userPrompt =
      language === "vi"
        ? `KHÓA HỌC: ${courseTitle}
MÔ TẢ: ${courseDescription}
CẤP ĐỘ: ${level}
BÀI HỌC: ${lessonTitle}

HƯỚNG DẪN NỘI DUNG BÀI HỌC:
${lessonContent || "Chưa có nội dung - hãy tự tạo tài liệu hoàn chỉnh dựa trên tiêu đề và thông tin khóa học"}

LƯU Ý QUAN TRỌNG:
- Nếu nội dung hướng dẫn ngắn, HÃY TỰ MỞ RỘNG thành tài liệu CHI TIẾT và TOÀN DIỆN
- Không được chỉ lặp lại nội dung hướng dẫn, phải tạo thêm kiến thức sâu sắc
- Tài liệu phải đủ chi tiết để học viên có thể tự học mà không cần thêm tài liệu khác

TỪ KHÓA BẮT BUỘC PHẢI GIẢI THÍCH: ${keyTerms.join(", ")}

CẤU TRÚC BẮT BUỘC:

### 1. Mục tiêu học tập
- Liệt kê 4-5 mục tiêu cụ thể học viên cần đạt được
- Sử dụng công thức "Sau bài học này, bạn sẽ có thể..."

### 2. Kiến thức cốt lõi
- Định nghĩa và giải thích các khái niệm chính
- Liên hệ với kiến thức trước đó
- Tổng hợp ý chính dưới dạng danh sách dễ nhớ

### 3. Chi tiết & Giải thích chuyên sâu
- Mở rộng từng khái niệm từ phần 2
- Giải thích "tại sao" không chỉ "là gì"
- Đề cập đến các trường hợp đặc biệt, ngoại lệ
- Liên hệ lý thuyết với thực tiễn

### 4. Quy trình / Công thức / Bước thực hiện
- Trình bày từng bước cụ thể
- Sử dụng thẻ code, bảng hoặc hình ảnh (markdown) nếu cần
- Cung cấp công thức, chỉ dẫn áp dụng
- Giải thích mỗi bước và ý nghĩa

### 5. Ví dụ thực tiễn & Case Studies
- Cung cấp ít nhất 3 ví dụ thực tế, cụ thể
- Các ví dụ nên từ đơn giản đến phức tạp
- Bao gồm cả tình huống thành công và thất bại
- Giải thích cách áp dụng vào công việc thực tế

### 6. Bài tập luyện tập & Thử thách
- Tạo 4-5 bài tập từ cơ bản đến nâng cao
- Kèm theo gợi ý hoặc hướng dẫn giải
- Bao gồm cả câu hỏi lý thuyết và bài tập thực hành

### 7. Ghi nhớ & Tiếp tục học
- Tóm tắt các điểm chính
- Gợi ý các bài học liên quan hoặc nâng cao
- Danh sách tài liệu tham khảo thêm

Lưu ý:
- Viết bằng tiếng Việt, rõ ràng và dễ hiểu
- Sử dụng markdown để định dạng
- Không sử dụng quá nhiều kỹ thuật, nếu cần thì giải thích kỹ
- Tối ưu cho học viên tự học`
        : `COURSE: ${courseTitle}
DESCRIPTION: ${courseDescription}
LEVEL: ${level}
LESSON: ${lessonTitle}
CONTENT/OUTLINE:
${lessonContent || "No outline provided - create a comprehensive document based on the title"}

KEY TERMS TO EXPLAIN: ${keyTerms.join(", ")}

MANDATORY STRUCTURE:

### 1. Learning Objectives
- List 4-5 specific objectives the learner should achieve
- Use format: "After this lesson, you will be able to..."

### 2. Core Knowledge
- Define and explain main concepts
- Connect to previous knowledge
- Summarize key points in easy-to-remember format

### 3. Detailed Explanation & Deep Dive
- Expand on each concept from section 2
- Explain "why" not just "what"
- Address special cases and exceptions
- Link theory to practice

### 4. Process / Formula / Step-by-Step Guide
- Present procedures step by step
- Use code blocks, tables, or diagrams (markdown) if needed
- Provide formulas and application guidelines
- Explain each step and its significance

### 5. Real-World Examples & Case Studies
- Provide at least 3 concrete examples
- Progress from simple to complex
- Include both success and failure scenarios
- Explain practical application

### 6. Practice & Challenges
- Create 4-5 exercises from basic to advanced
- Include hints or solution guidance
- Mix theoretical questions and practical tasks

### 7. Key Takeaways & Next Steps
- Summarize main points
- Suggest related or advanced topics
- List additional references

Notes:
- Write in clear, professional English
- Use markdown formatting
- Avoid excessive jargon; explain technical terms
- Optimize for self-learners`;

    const schema = {
      title: "string",
      content: "string",
      summary: "string",
      tags: ["string"],
    };

    const result = await callLLMJSON({
      system: systemPrompt,
      user: userPrompt,
      schema,
      lang: language,
    });

    console.log(`[generateDetailedLessonDocument] Success:`, {
      contentLength: result.content?.length || 0,
      hasSummary: !!result.summary,
      tagsCount: result.tags?.length || 0,
    });

    // Validate content length - if too short, retry with expansion prompt
    if ((result.content || "").length < MIN_CONTENT_CHARS) {
      console.warn(
        `[generateDetailedLessonDocument] Content too short (${result.content?.length}/${MIN_CONTENT_CHARS}), requesting expansion`
      );
      
      // Retry with expansion prompt
      const expansionPrompt =
        language === "vi"
          ? `⚠️ URGENT: Tài liệu cần HOÀN THIỆN NGAY - KHÔNG ĐƯỢC BỎ QUA

Tài liệu hiện tại (chỉ ${result.content?.length} ký tự - QUÁ NGẮN):
${result.content}

BẮT BUỘC PHẢI LÀM:
1. ⭐ MỞ RỘNG nội dung thêm 3-5 lần (từ ${result.content?.length} lên >=2500 ký tự)
2. ⭐ THÊM 5+ ví dụ thực tế CỤ THỂ, CÓ SỐ LIỆU
3. ⭐ THÊM công thức, quy trình từng bước chi tiết (nếu là kỹ thuật)
4. ⭐ THÊM 5+ bài tập luyện tập với ĐÁP ÁN HƯỚNG DẪN
5. ⭐ GIẢI THÍCH "TẠI SAO" không chỉ "LÀ GÌ" cho mỗi khái niệm
6. ⭐ TỔNG CỘNG phải >=2500 ký tự, không được ít hơn

Bài học: "${lessonTitle}"
Khóa học: "${courseTitle}"
Ngôn ngữ: Tiếng Việt

HÀNH ĐỘNG: Viết lại TOÀN BỘ tài liệu sao cho:
- Học viên có thể tự học mà KHÔNG cần tài liệu thêm
- CHI TIẾT, DỄ HIỂU, CÓ VÍ DỤ CỤ THỂ
- Kèm bài tập để học viên thực hành

Đây là bài học QUAN TRỌNG - KHÔNG ĐƯỢC BỎ QUA!`
          : `You created the following document, but it's TOO SHORT and LACKS DETAIL:

${result.content}

TAKE ACTION NOW:
1. EXPAND content at least double
2. ADD detailed examples, formulas, step-by-step procedures
3. ADD specific practice exercises with solution guidance
4. THOROUGHLY EXPLAIN each concept
5. TOTAL must be 2500+ characters

Lesson: ${lessonTitle}
Course: ${courseTitle}

Create an EXPANDED, DETAILED and COMPREHENSIVE document.`;

      const expansionResult = await callLLMJSON({
        system: systemPrompt,
        user: expansionPrompt,
        schema,
        lang: language,
      });

      if (expansionResult.content && expansionResult.content.length > result.content.length) {
        console.log(
          `[generateDetailedLessonDocument] Content expanded: ${result.content.length} → ${expansionResult.content.length}`
        );
        return {
          title: expansionResult.title || result.title || lessonTitle,
          content: expansionResult.content,
          summary:
            expansionResult.summary ||
            result.summary ||
            `Tài liệu chi tiết cho bài "${lessonTitle}" trong khóa "${courseTitle}"`,
          tags: Array.isArray(expansionResult.tags)
            ? expansionResult.tags
            : Array.isArray(result.tags)
            ? result.tags
            : keyTerms.slice(0, 5),
        };
      }
    }

    return {
      title: result.title || lessonTitle,
      content: result.content || "",
      summary:
        result.summary ||
        `Tài liệu chi tiết cho bài "${lessonTitle}" trong khóa "${courseTitle}"`,
      tags: Array.isArray(result.tags) ? result.tags : keyTerms.slice(0, 5),
    };
  } catch (err) {
    console.error("[generateDetailedLessonDocument] Error:", err.message);
    throw err;
  }
}

module.exports = {
  generateDetailedLessonDocument,
};
