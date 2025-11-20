const { callLLMJSON } = require("./llm.service");
const {
  extractKeyVocabulary,
} = require("../utils/dynamicPrompt.helper");

const MIN_CONTENT_CHARS = 3000;
const MAX_RETRIES = 3;
const BASE_TIMEOUT = 300000; // 5 minutes
const EXPANDED_TOKENS = 16384; // Increased from 8192

function validateDocumentCompleteness(content, lessonTitle) {
  const issues = [];

  // Check minimum length
  if (!content || content.length < MIN_CONTENT_CHARS) {
    issues.push(`Content too short: ${content?.length || 0}/${MIN_CONTENT_CHARS} characters`);
  }

  // Check for incomplete sections
  const incompleteMarkers = [
    "...", "•", "-", "*", "[", "{", "```", "# ", "## ", "### "
  ];

  const lastLines = content?.split('\n').slice(-5).join('\n') || "";
  for (const marker of incompleteMarkers) {
    if (lastLines.trim().endsWith(marker)) {
      issues.push(`Content appears to be cut off (ends with: ${marker})`);
      break;
    }
  }

  // Check for incomplete JSON-like structures
  const openBrackets = (content?.match(/\{/g) || []).length;
  const closeBrackets = (content?.match(/\}/g) || []).length;
  if (openBrackets !== closeBrackets) {
    issues.push(`Unmatched brackets: ${openBrackets} open, ${closeBrackets} close`);
  }

  // Check for incomplete code blocks
  const codeBlocks = (content?.match(/```/g) || []).length;
  if (codeBlocks % 2 !== 0) {
    issues.push(`Unclosed code blocks: ${codeBlocks} ``` markers`);
  }

  // Check if content ends mid-sentence
  const trimmed = content?.trim() || "";
  if (trimmed && !trimmed.match(/[.!?]\s*$/)) {
    issues.push("Content doesn't end with proper punctuation");
  }

  return {
    isComplete: issues.length === 0,
    issues,
    contentLength: content?.length || 0
  };
}

async function generateDetailedLessonDocumentWithRetry({
  lessonTitle = "",
  lessonContent = "",
  courseTitle = "",
  courseDescription = "",
  level = "Beginner",
  language = "vi",
  retryCount = 0,
} = {}) {
  try {
    console.log(`[generateDetailedLessonDocument] Attempt ${retryCount + 1}/${MAX_RETRIES} for: ${lessonTitle}`);

    const keyTerms = extractKeyVocabulary(
      lessonContent || `${lessonTitle} ${courseTitle} ${courseDescription}`,
      12
    );

    // Enhanced prompt with completeness requirements
    const systemPrompt =
      language === "vi"
        ? `Bạn là một chuyên gia giáo dục với kinh nghiệm dạy học ở cấp ${level}.
Chuyên môn: ${courseTitle}

QUY TẮC VÀNG:
1. PHẢI HOÀN THÀNH ĐẦY ĐỦ nội dung, KHÔNG ĐƯỢC dừng giữa chừng
2. Nội dung TỐI THIỂU 3000 ký tự, không có ngoại lệ
3. Mỗi section phải có nội dung phong phú, không viết ngắn gọn
4. Kết thúc mỗi section một cách hoàn chỉnh
5. KIỂM TRA KÉO nội dung trước khi trả về - đảm bảo không có "...", "•", "-" ở cuối

CÔNG VIỆC CHÍNH:
Tạo tài liệu học tập HOÀN CHỈNH, CHI TIẾT, TOÀN DIỆN.
- Tài liệu phải đứng độc lập
- Giải thích "tại sao" không chỉ "là gì"
- Cung cấp ví dụ thực tế có số liệu
- Bao gồm bài tập có hướng dẫn

TRẢ VỀ JSON HOÀN CHỈNH với: title, content, summary, tags.`
        : `You are an expert educator at the ${level} level.

GOLDEN RULES:
1. MUST COMPLETE content fully, NEVER cut off mid-content
2. MINIMUM 3000 characters, no exceptions
3. Every section must be comprehensive, not brief
4. End each section completely
5. DOUBLE-CHECK content before returning - no trailing "...", "•", "-"

Create COMPREHENSIVE, DETAILED, PRACTICAL documents.
Return COMPLETE JSON with: title, content, summary, tags.`;

    const userPrompt =
      language === "vi"
        ? `KHÓA HỌC: ${courseTitle}
MÔ TẢ: ${courseDescription}
CẤP ĐỘ: ${level}
BÀI HỌC: ${lessonTitle}

NỘI DUNG HƯỚNG DẪN:
${lessonContent || "Tự tạo tài liệu hoàn chỉnh dựa trên tiêu đề"}

TỪ KHÓA PHẢI GIẢI THÍCH: ${keyTerms.join(", ")}

CẤU TRÚC BẮT BUỘC (PHẢI HOÀN THÀNH ĐẦY ĐỦ):

### 1. Mục tiêu học tập
- 4-5 mục tiêu cụ thể
- "Sau bài học này, bạn sẽ có thể..."

### 2. Kiến thức cốt lõi
- Định nghĩa và giải thích chi tiết
- Liên hệ kiến thức trước đó
- Tổng hợp ý chính

### 3. Chi tiết & Giải thích chuyên sâu
- Mở rộng chi tiết từng khái niệm
- Giải thích "tại sao" và "như thế nào"
- Các trường hợp đặc biệt
- Case study thực tế

### 4. Quy trình / Công thức / Bước thực hiện
- Trình bày từng bước rõ ràng
- Công thức và chỉ dẫn
- Giải thích ý nghĩa mỗi bước

### 5. Ví dụ thực tiễn & Case Studies
- ÍT NHẤT 5-6 ví dụ CỤ THỂ, CÓ SỐ LIỆU
- Từ đơn giản đến phức tạp
- Phân tích thành công/thất bại

### 6. Bài tập luyện tập
- 5-6 bài tập có hướng dẫn chi tiết
- Từ cơ bản đến nâng cao
- Cả lý thuyết và thực hành

### 7. Ghi nhớ & Tiếp theo
- Tóm tắt điểm chính
- Gợi ý tài liệu tham khảo

QUAN TRỌNG:
- VIẾT ĐẦY ĐỦ, KHÔNG TẮT NGẮN
- TỔNG ĐỘ DÀI >= 3000 ký tự
- KIỂM TRA KÉO TRƯỚC KHI GỬI`
        : `COURSE: ${courseTitle}
DESCRIPTION: ${courseDescription}
LEVEL: ${level}
LESSON: ${lessonTitle}

KEY TERMS: ${keyTerms.join(", ")}

CREATE COMPREHENSIVE DOCUMENT with ALL sections:
1. Learning Objectives
2. Core Knowledge
3. Detailed Explanation
4. Process/Steps
5. Real-World Examples (5+ cases)
6. Practice Exercises
7. Key Takeaways

REQUIREMENTS:
- MINIMUM 3000 characters
- Complete every section
- No incomplete content`;

    const schema = {
      title: "string",
      content: "string",
      summary: "string",
      tags: ["string"],
    };

    // Call with increased timeout and tokens
    const result = await callLLMJSON({
      system: systemPrompt,
      user: userPrompt,
      schema,
      lang: language,
      // Pass custom timeout and token settings if supported
    });

    console.log(`[generateDetailedLessonDocument] Generated:`, {
      contentLength: result.content?.length || 0,
      hasSummary: !!result.summary,
      tagsCount: result.tags?.length || 0,
    });

    // Validate completeness
    const validation = validateDocumentCompleteness(result.content, lessonTitle);

    if (!validation.isComplete) {
      console.warn(`[generateDetailedLessonDocument] Document incomplete:`, validation.issues);

      if (retryCount < MAX_RETRIES - 1) {
        // Retry with a more aggressive prompt
        return await generateDetailedLessonDocumentWithRetry({
          lessonTitle,
          lessonContent,
          courseTitle,
          courseDescription,
          level,
          language,
          retryCount: retryCount + 1,
        });
      } else {
        // Last attempt - try to fix the incomplete content
        console.warn(`[generateDetailedLessonDocument] Final attempt to fix incomplete content`);
        return await attemptContentRepair(result, {
          lessonTitle,
          courseTitle,
          language,
          validation
        });
      }
    }

    return {
      title: result.title || lessonTitle,
      content: result.content || "",
      summary: result.summary || `Tài liệu chi tiết cho bài "${lessonTitle}"`,
      tags: Array.isArray(result.tags) ? result.tags : keyTerms.slice(0, 5),
    };

  } catch (err) {
    console.error(`[generateDetailedLessonDocument] Error on attempt ${retryCount + 1}:`, err.message);

    if (retryCount < MAX_RETRIES - 1) {
      console.log(`[generateDetailedLessonDocument] Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
      return await generateDetailedLessonDocumentWithRetry({
        lessonTitle,
        lessonContent,
        courseTitle,
        courseDescription,
        level,
        language,
        retryCount: retryCount + 1,
      });
    }

    throw err;
  }
}

async function attemptContentRepair(incompleteResult, { lessonTitle, courseTitle, language, validation }) {
  const repairPrompt = language === "vi"
    ? `SỬA NỘI DUNG BỊ LỖI/CẮT:

Vấn đề phát hiện:
${validation.issues.map(issue => `- ${issue}`).join('\n')}

Nội dung hiện tại:
${incompleteResult.content}

HÃY HOÀN THÀNH NỘI DUNG này:
1. Hoàn thành các section bị cắt
2. Thêm ví dụ và chi tiết còn thiếu
3. Đảm bảo tổng độ dài >= 3000 ký tự
4. Kết thúc bài học một cách hoàn chỉnh

Trả về JSON HOÀN CHỈNH với: title, content, summary, tags`
    : `REPAIR INCOMPLETE CONTENT:

Issues found:
${validation.issues.map(issue => `- ${issue}`).join('\n')}

Current content:
${incompleteResult.content}

COMPLETE this content:
1. Finish any cut-off sections
2. Add missing examples and details
3. Ensure total length >= 3000 characters
4. End the lesson properly

Return COMPLETE JSON with: title, content, summary, tags`;

  try {
    const repairedResult = await callLLMJSON({
      system: "You are an editor fixing incomplete educational content. Ensure the result is complete and comprehensive.",
      user: repairPrompt,
      schema: { title: "string", content: "string", summary: "string", tags: ["string"] },
      lang: language,
    });

    const finalValidation = validateDocumentCompleteness(repairedResult.content, lessonTitle);

    if (finalValidation.isComplete && finalValidation.contentLength > validation.contentLength) {
      console.log(`[attemptContentRepair] ✅ Content repaired successfully`);
      return {
        title: repairedResult.title || incompleteResult.title || lessonTitle,
        content: repairedResult.content,
        summary: repairedResult.summary || incompleteResult.summary,
        tags: Array.isArray(repairedResult.tags) ? repairedResult.tags : incompleteResult.tags || [],
      };
    }
  } catch (err) {
    console.error(`[attemptContentRepair] Failed to repair content:`, err.message);
  }

  // If repair failed, return the original with a note
  return {
    ...incompleteResult,
    content: incompleteResult.content + "\n\n⚠️ *Lưu ý: Nội dung này có thể bị cắt ngắn do giới hạn kỹ thuật. Vui lòng làm mới trang để thử lại.*",
    summary: (incompleteResult.summary || "") + " [Có thể bị cắt ngắn]",
  };
}

module.exports = {
  generateDetailedLessonDocument: generateDetailedLessonDocumentWithRetry,
  validateDocumentCompleteness,
};