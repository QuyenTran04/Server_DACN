const { callLLMJSON } = require("./llm.service");
const {
  extractKeyVocabulary,
} = require("../utils/dynamicPrompt.helper");

const MIN_CONTENT_CHARS = 3000; // Đảm bảo tài liệu đầy đủ chi tiết nhưng ít nghiêm ngặt hơn

/**
 * Strip code block wrapper from content if AI accidentally wrapped entire content in code block
 * @param {string} content - The content to clean
 * @returns {string} - Content without code block wrapper
 */
function stripContentCodeBlock(content) {
  if (!content || typeof content !== 'string') return content;
  
  let cleaned = content.trim();
  
  // Check if content starts with code block and ends with code block
  const codeBlockPattern = /^```(?:markdown|python|javascript|java|cpp|c\+\+|html|css|json|text|plain)?\s*\n?([\s\S]*?)\n?```\s*$/i;
  const match = cleaned.match(codeBlockPattern);
  
  if (match) {
    console.log('[stripContentCodeBlock] Detected and removed code block wrapper from content');
    cleaned = match[1].trim();
  }
  
  return cleaned;
}

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
1. Nội dung TỐI THIỂU 3000 ký tự, ưu tiên chất lượng và chi tiết
2. Cấu trúc logic, dễ theo dõi, phù hợp cho tự học
3. Giải thích kỹ từng khái niệm, tránh dùng thuật ngữ chưa được giải thích
4. Bao gồm ít nhất 4-5 ví dụ thực tế, cụ thể, có số liệu, dễ hiểu
5. Cung cấp công thức, quy trình, bước thực hiện rõ ràng với hình minh họa (nếu cần)
6. Có 4-5 bài tập luyện tập từ cơ bản đến nâng cao, kèm gợi ý hoặc hướng dẫn chi tiết
7. Mỗi section phải có nội dung phong phú, không ngắn gọn

Trả về JSON hợp lệ với các trường: title, content, summary, tags.

⚠️ QUAN TRỌNG VỀ FORMAT:
- Field "content" phải là MARKDOWN THUẦN TÚY, KHÔNG được wrap trong code block (\`\`\`markdown hoặc \`\`\`python)
- Chỉ dùng code block cho các đoạn CODE THỰC SỰ bên trong nội dung (ví dụ: code JavaScript, Python)
- KHÔNG wrap toàn bộ nội dung trong một code block lớn`
        : `You are an expert educator at the ${level} level.
Create COMPREHENSIVE, DETAILED, and PRACTICAL lesson documents.

Requirements:
1. MINIMUM 3000 characters, prioritize quality and detail over length
2. Logical structure, easy to follow
3. Clear explanations of each concept
4. At least 4-5 real-world examples with specific data
5. Include formulas / processes / step-by-step procedures
6. Provide 4-5 practice exercises with detailed guidance
7. Every section must be comprehensive, not brief

Return valid JSON with fields: title, content, summary, tags.

IMPORTANT FORMAT RULES:
- Field "content" must be PLAIN MARKDOWN, NOT wrapped in code blocks (\`\`\`markdown or \`\`\`python)
- Only use code blocks for ACTUAL CODE snippets inside the content
- DO NOT wrap the entire content in a single large code block`;

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

CẤU TRÚC BẮT BUỘC (8 SECTIONS - PHẢI TUÂN THỦ CHÍNH XÁC):

### 1. Giới thiệu & Tầm quan trọng (300-400 từ)
- "${lessonTitle}" là gì? Định nghĩa đầy đủ
- Tại sao quan trọng trong ${courseTitle}?
- Ứng dụng thực tế trong công việc/cuộc sống
- Lợi ích khi nắm vững kiến thức này

### 2. Kiến thức nền tảng (500-700 từ)
- Các khái niệm cơ bản cần biết trước
- Thuật ngữ và định nghĩa chi tiết
- Nguyên lý hoạt động cơ bản
- Mối liên hệ với kiến thức đã học

### 3. Kiến thức chuyên sâu (800-1000 từ)
- Giải thích CHI TIẾT từng khái niệm
- Phân tích TẠI SAO và NHƯ THẾ NÀO
- Các trường hợp đặc biệt, ngoại lệ
- So sánh các phương pháp/cách tiếp cận khác nhau
- Ưu điểm, nhược điểm của từng cách

### 4. Quy trình thực hiện chi tiết (400-600 từ)
- Các bước thực hiện CỤ THỂ từ A-Z
- Công thức, thuật toán (nếu có)
- Tips và tricks từ kinh nghiệm thực tế
- Các lỗi thường gặp và cách tránh
- Best practices trong ngành

### 5. Ví dụ thực tế (800-1000 từ)
- Tạo ÍT NHẤT 6 ví dụ CỤ THỂ
- Mỗi ví dụ có: Bối cảnh, Vấn đề, Giải pháp, Kết quả, Bài học
- Ví dụ 1-2: Cơ bản - Dễ hiểu, phù hợp người mới
- Ví dụ 3-4: Trung bình - Phức tạp hơn
- Ví dụ 5-6: Nâng cao - Case study thực tế

### 6. Ứng dụng thực tế & Tips chuyên gia (500-700 từ)
- Cách áp dụng trong công việc/cuộc sống thực tế
- Tips và tricks từ chuyên gia trong ngành
- Các công cụ/tài nguyên hữu ích
- Những sai lầm thường gặp và cách tránh

### 7. Bài tập thực hành (600-800 từ)
- Tạo 6 bài tập với HƯỚNG DẪN GIẢI
- Bài 1-2: Cơ bản
- Bài 3-4: Trung bình
- Bài 5-6: Nâng cao

### 8. Tổng kết & Lộ trình tiếp theo (300-400 từ)
- Tóm tắt các điểm quan trọng nhất
- Checklist kiến thức cần nắm vững
- Các bước tiếp theo để học sâu hơn
- Tài liệu tham khảo bổ sung

Lưu ý QUAN TRỌNG:
- Viết bằng tiếng Việt, rõ ràng và dễ hiểu
- Sử dụng markdown để định dạng chuyên nghiệp
- Không sử dụng quá nhiều kỹ thuật, nếu cần thì giải thích kỹ
- Tối ưu cho học viên tự học - tài liệu phải ĐỦ ĐẦY để không cần tham khảo thêm
- Mỗi section phải có nội dung phong phú, không viết ngắn gọn
- TỔNG ĐỘ DÀI TÀI LIỆU PHẢI >= 3000 ký tự`
        : `COURSE: ${courseTitle}
DESCRIPTION: ${courseDescription}
LEVEL: ${level}
LESSON: ${lessonTitle}
CONTENT/OUTLINE:
${lessonContent || "No outline provided - create a comprehensive document based on the title"}

KEY TERMS TO EXPLAIN: ${keyTerms.join(", ")}

MANDATORY STRUCTURE (8 SECTIONS - MUST FOLLOW EXACTLY):

### 1. Introduction & Importance (300-400 words)
- What is "${lessonTitle}"? Complete definition
- Why is it important in ${courseTitle}?
- Real-world applications
- Benefits of mastering this knowledge

### 2. Foundation Knowledge (500-700 words)
- Basic concepts to know beforehand
- Terminology and detailed definitions
- Basic operating principles
- Connection with previous knowledge

### 3. In-Depth Knowledge (800-1000 words)
- DETAILED explanation of each concept
- Analysis of WHY and HOW
- Special cases and exceptions
- Comparison of different approaches
- Pros and cons of each method

### 4. Detailed Process (400-600 words)
- Step-by-step implementation from A-Z
- Formulas, algorithms (if applicable)
- Tips and tricks from real experience
- Common mistakes and how to avoid them
- Industry best practices

### 5. Real Examples (800-1000 words)
- AT LEAST 6 CONCRETE examples
- Each example has: Context, Problem, Solution, Result, Lesson
- Examples 1-2: Basic - Easy to understand
- Examples 3-4: Intermediate - More complex
- Examples 5-6: Advanced - Real case studies

### 6. Real-World Applications & Expert Tips (500-700 words)
- How to apply in real work/life
- Tips and tricks from industry experts
- Useful tools/resources
- Common mistakes and how to avoid them

### 7. Practice Exercises (600-800 words)
- 6 exercises with DETAILED solution guides
- Exercises 1-2: Basic
- Exercises 3-4: Intermediate
- Exercises 5-6: Advanced

### 8. Summary & Next Steps (300-400 words)
- Summary of key points
- Knowledge checklist
- Next steps for deeper learning
- Additional references

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
1. ⭐ MỞ RỘNG nội dung thêm 2-3 lần (từ ${result.content?.length} lên >=3000 ký tự)
2. ⭐ THÊM 5+ ví dụ thực tế CỤ THỂ, CÓ SỐ LIỆU, CÓ PHÂN TÍCH
3. ⭐ THÊM công thức, quy trình từng bước chi tiết (nếu là kỹ thuật)
4. ⭐ THÊM 5+ bài tập luyện tập với ĐÁP ÁN HƯỚNG DẪN chi tiết
5. ⭐ GIẢI THÍCH "TẠI SAO" không chỉ "LÀ GÌ" cho mỗi khái niệm
6. ⭐ TỔNG CỘNG phải >=3000 ký tự, không được ít hơn
7. ⭐ MỖI SECTION phải có nội dung phong phú, không ngắn gọn

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
1. EXPAND content at least 2-3 times
2. ADD detailed examples with specific data, formulas, step-by-step procedures
3. ADD 5+ specific practice exercises with detailed solution guidance
4. THOROUGHLY EXPLAIN each concept with "why" not just "what"
5. TOTAL must be 3000+ characters
6. Every section must be comprehensive, not brief

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
          content: stripContentCodeBlock(expansionResult.content),
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
      content: stripContentCodeBlock(result.content || ""),
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
