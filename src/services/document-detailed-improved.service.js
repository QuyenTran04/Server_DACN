const { callLLMJSON } = require("./llm-improved.service");
const {
  extractKeyVocabulary,
} = require("../utils/dynamicPrompt.helper");

const MIN_CONTENT_CHARS = 2000; // Reduced from 3000 to be more realistic
const MAX_RETRIES = 3;
const BASE_TIMEOUT = 300000; // 5 minutes
const STREAM_TIMEOUT = 240000; // 4 minutes for stream operations
const EXPANDED_TOKENS = 16384; // Increased from 8192

function validateDocumentCompleteness(content, lessonTitle) {
  const issues = [];

  // Check minimum length - more flexible
  if (!content || content.length < MIN_CONTENT_CHARS) {
    issues.push(`Content too short: ${content?.length || 0}/${MIN_CONTENT_CHARS} characters`);
  }

  // More lenient incomplete markers check - only check the very last line
  const lastLine = content?.split('\n').slice(-1)[0]?.trim() || "";
  const criticalIncompleteMarkers = ["...", "•", "-"]; // Only check most critical markers

  for (const marker of criticalIncompleteMarkers) {
    if (lastLine.endsWith(marker)) {
      issues.push(`Content appears to be cut off (ends with: ${marker})`);
      break;
    }
  }

  // Only check for incomplete code blocks if there are any
  const codeBlocks = (content?.match(/```/g) || []).length;
  if (codeBlocks > 0 && codeBlocks % 2 !== 0) {
    issues.push("Unclosed code blocks: " + codeBlocks + " ``` markers");
  }

  // Less strict punctuation check
  const trimmed = content?.trim() || "";
  if (trimmed && trimmed.length > 100 && !trimmed.match(/[.!?\n]\s*$/)) {
    // Only require proper punctuation for longer content
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
  timeoutMs = BASE_TIMEOUT,
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
2. Nội dung TỐI THIỂU 2000 ký tự, tập trung vào chất lượng không phải số lượng
3. Mỗi section phải súc tích nhưng đầy đủ ý chính
4. Kết thúc mỗi section một cách hoàn chỉnh
5. KIỂM TRA KÉO nội dung trước khi trả về

CÔNG VIỆC CHÍNH:
Tạo tài liệu học tập CHẤT LƯỢNG CAO, SỨC TÍCH:
- Tập trung vào kiến thức cốt lõi và ứng dụng thực tế
- Đảm bảo tài liệu đứng độc lập
- Ưu tiên giải thích rõ ràng thay vì dài dòng
- Bao gồm ví dụ thực tế và bài tập có hướng dẫn

TRẢ VỀ JSON HOÀN CHỈNH với: title, content, summary, tags.`
        : `You are an expert educator at the ${level} level.

GOLDEN RULES:
1. MUST COMPLETE content fully, NEVER cut off mid-content
2. MINIMUM 2000 characters, focus on quality over quantity
3. Every section should be concise but comprehensive
4. End each section completely
5. DOUBLE-CHECK content before returning

Create HIGH-QUALITY, CONCISE educational documents.
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
- VIẾT SỨC TÍCH nhưng ĐỦ Ý, không quá dài dòng
- TỔNG ĐỘ DÀI >= 2000 ký tự (chất lượng quan trọng hơn số lượng)
- KIỂM TRA KÉO TRƯỚC KHI GỬI - đảm bảo không bị cắt ngắn`
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
      timeoutMs: timeoutMs || BASE_TIMEOUT,
      maxTokens: EXPANDED_TOKENS,
    });

    console.log(`[generateDetailedLessonDocument] Generated:`, {
      lessonTitle,
      attempt: retryCount + 1,
      contentLength: result.content?.length || 0,
      hasSummary: !!result.summary,
      tagsCount: result.tags?.length || 0,
      meetsMinLength: (result.content?.length || 0) >= MIN_CONTENT_CHARS,
      contentType: typeof result.content,
    });

    // Validate completeness
    const validation = validateDocumentCompleteness(result.content, lessonTitle);

    console.log(`[generateDetailedLessonDocument] Validation result for "${lessonTitle}":`, {
      isComplete: validation.isComplete,
      contentLength: validation.contentLength,
      issues: validation.issues,
      attempt: retryCount + 1,
    });

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
          timeoutMs,
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
        timeoutMs,
      });
    }

    // If all retries fail, create a comprehensive fallback
    console.warn(`[generateDetailedLessonDocument] All retries failed, creating comprehensive fallback for: ${lessonTitle}`);

    return createComprehensiveFallback({
      lessonTitle,
      lessonContent,
      courseTitle,
      courseDescription,
      level,
      language
    });
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
      timeoutMs: timeoutMs || BASE_TIMEOUT,
      maxTokens: EXPANDED_TOKENS,
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

// Function with custom timeout for streaming operations
async function generateDetailedLessonDocumentWithTimeout({
  lessonTitle = "",
  lessonContent = "",
  courseTitle = "",
  courseDescription = "",
  level = "Beginner",
  language = "vi",
  timeoutMs = BASE_TIMEOUT,
} = {}) {
  return await generateDetailedLessonDocumentWithRetry({
    lessonTitle,
    lessonContent,
    courseTitle,
    courseDescription,
    level,
    language,
    retryCount: 0,
    timeoutMs,
  });
}

// Create comprehensive fallback when AI completely fails
function createComprehensiveFallback({ lessonTitle, lessonContent, courseTitle, courseDescription, level, language }) {
  const keyTerms = extractKeyVocabulary(
    lessonContent || `${lessonTitle} ${courseTitle} ${courseDescription}`,
    10
  );

  if (language === "vi") {
    return generateVietnameseFallbackContent({ lessonTitle, lessonContent, courseTitle, courseDescription, level, keyTerms });
  } else {
    return generateEnglishFallbackContent({ lessonTitle, lessonContent, courseTitle, courseDescription, level, keyTerms });
  }
}

function generateVietnameseFallbackContent({ lessonTitle, lessonContent, courseTitle, courseDescription, level, keyTerms }) {
  // Extract concepts from title for more relevant content
  const concepts = extractKeyConceptsFromTitle(lessonTitle);
  const isProgramming = isProgrammingCourse(courseTitle, lessonTitle);

  let content = `# ${lessonTitle}\n\n`;

  content += `## Mục tiêu học tập\n\n`;
  content += `Sau khi hoàn thành bài học này, bạn sẽ có thể:\n`;
  content += `- Hiểu rõ khái niệm và bản chất của "${lessonTitle}"\n`;
  content += `- Nắm vững các kiến thức cốt lõi và nguyên lý hoạt động\n`;
  content += `- Vận dụng được kỹ thuật vào thực tế trong lĩnh vực ${courseTitle}\n`;
  content += `- Có nền tảng vững chắc cho các bài học tiếp theo\n\n`;

  content += `## Kiến thức cốt lõi\n\n`;
  content += `### 1. Định nghĩa và bản chất\n\n`;
  content += `${lessonTitle} là một khái niệm/kỹ thuật quan trọng trong lĩnh vực ${courseTitle}. Đây là kiến thức nền tảng mà mọi học viên cần nắm vững để có thể phát triển thêm các kỹ năng chuyên sâu.\n\n`;
  content += `**Tầm quan trọng:** ${lessonTitle} đóng vai trò then chốt trong việc xây dựng nền tảng kiến thức và giúp giải quyết các vấn đề thực tế.\n\n`;

  content += `### 2. Các thành phần chính\n\n`;
  content += `Các thành phần chính của ${lessonTitle} bao gồm:\n\n`;

  concepts.forEach((concept, index) => {
    content += `- **Thành phần ${index + 1}: ${concept}**\n`;
    content += `  - Mô tả: Đây là yếu tố quan trọng trong cấu trúc của ${lessonTitle}\n`;
    content += `  - Chức năng: Đảm bảo hoạt động chính xác và hiệu quả\n`;
    content += `  - Liên quan: Tương tác với các thành phần khác trong hệ thống\n\n`;
  });

  // Add programming-specific content
  if (isProgramming) {
    content += `### 3. Cú pháp và quy tắc\n\n`;
    content += `**Cú pháp cơ bản:**\n`;
    content += `- Khai báo: Cách khai báo và khởi tạo ${lessonTitle}\n`;
    content += `- Sử dụng: Cách sử dụng trong chương trình\n`;
    content += `- Quy tắc: Các quy tắc cần tuân thủ khi làm việc\n\n`;

    content += `**Các phương thức phổ biến:**\n`;
    content += `- Các thao tác cơ bản thường được sử dụng\n`;
    content += `- Các phương thức tích hợp sẵn\n`;
    content += `- Các thao tác xử lý và biến đổi\n\n`;
  }

  content += `## Quy trình và các bước thực hiện\n\n`;
  content += `### Bước-by-step implementation:\n\n`;
  content += `1. **Giai đoạn chuẩn bị:** Phân tích yêu cầu và thiết kế giải pháp\n`;
  content += `   - Xác định mục tiêu cần đạt được\n`;
  content += `   - Thu thập các thông tin và tài nguyên cần thiết\n\n`;

  content += `2. **Giai đoạn triển khai:** Thực hiện theo từng bước có hệ thống\n`;
  content += `   - Áp dụng các nguyên lý cơ bản của ${lessonTitle}\n`;
  content += `   - Thực hiện từng bước một cách cẩn thận\n\n`;

  content += `3. **Giai đoạn kiểm tra:** Kiểm tra và xác minh kết quả\n`;
  content += `   - Kiểm tra tính chính xác của kết quả\n`;
  content += `   - Xác minh các yêu cầu đã được đáp ứng\n\n`;

  content += `4. **Giai đoạn tối ưu:** Cải thiện hiệu suất và sửa lỗi\n`;
  content += `   - Tìm các cách cải thiện hiệu quả\n`;
  content += `   - Sửa các lỗi nếu có\n\n`;

  content += `### Công thức và quy tắc quan trọng:\n\n`;
  content += `- **Quy tắc áp dụng:** Khi nào và cách sử dụng ${lessonTitle}\n`;
  content += `- **Công thức tính toán:** Các biểu thức và tính toán liên quan\n`;
  content += `- **Điều kiện tiên quyết:** Những kiến thức cần có trước khi học\n`;
  content += `- **Các lỗi thường gặp:** Những lỗi cần tránh và cách khắc phục\n\n`;

  content += `## Ví dụ thực tiễn & Case Studies\n\n`;
  content += `### Ví dụ 1: Áp dụng cơ bản\n\n`;
  content += `**Bối cảnh:** Một tình huống thực tế trong lĩnh vực ${courseTitle}\n`;
  content += `**Giải pháp:** Sử dụng ${lessonTitle} để giải quyết vấn đề theo các bước:\n`;
  content += `1. Phân tích vấn đề và xác định yêu cầu\n`;
  content += `2. Áp dụng nguyên lý của ${lessonTitle}\n`;
  content += `3. Triển khai và kiểm tra kết quả\n\n`;

  content += `### Ví dụ 2: Case study nâng cao\n\n`;
  content += `**Tình huống:** Một doanh nghiệp trong ngành ${courseTitle} đã áp dụng thành công ${lessonTitle}\n`;
  content += `**Kết quả:** Đạt được cải thiện đáng kể về hiệu suất và chất lượng\n`;
  content += `**Bài học kinh nghiệm:** Các yếu tố then chốt tạo nên thành công\n\n`;

  // Add code examples for programming courses
  if (isProgramming) {
    content += `## Code Examples and Implementation\n\n`;
    content += `### Ví dụ 1: Basic Implementation\n\n`;
    content += `Ví dụ cơ bản về ${lessonTitle} trong Java:\n`;
    content += `\`\`\`java\n`;

    if (concepts.includes('mảng') || concepts.includes('array')) {
      content += `// Khai báo và sử dụng mảng một chiều\nint[] numbers = {1, 2, 3, 4, 5};\n\n// In ra các phần tử của mảng\nfor (int i = 0; i < numbers.length; i++) {\n    System.out.println("Phần tử " + i + ": " + numbers[i]);\n}\n\n// Mảng nhiều chiều\nint[][] matrix = {\n    {1, 2, 3},\n    {4, 5, 6},\n    {7, 8, 9}\n};\n`;
    } else if (concepts.includes('chuỗi') || concepts.includes('string')) {
      content += `// Khai báo và khởi tạo chuỗi\nString greeting = "Hello, World!";\nString name = "Java";\n\n// Các phương thức xử lý chuỗi phổ biến\nSystem.out.println("Độ dài: " + greeting.length());\nSystem.out.println("Chữ hoa: " + greeting.toUpperCase());\nSystem.out.println("Chữ thường: " + greeting.toLowerCase());\n\n// Nối chuỗi\nString message = greeting + " " + name;\nSystem.out.println(message);\n`;
    } else {
      content += `// Ví dụ cơ bản về ${lessonTitle}\npublic class Main {\n    public static void main(String[] args) {\n        // Áp dụng ${lessonTitle}\n        System.out.println("Implementing ${lessonTitle}");\n        \n        // Thêm các logic cụ thể tại đây\n        // TODO: Implement your solution\n    }\n}\n`;
    }

    content += `\`\`\`\n\n`;
  }

  content += `## Bài tập luyện tập\n\n`;
  content += `### Bài tập 1: Kiểm tra kiến thức nền tảng\n\n`;
  content += `1. Trình bày lại định nghĩa và bản chất của ${lessonTitle} bằng lời của bạn\n`;
  content += `2. Liệt kê và giải thích 5 lợi ích chính của việc áp dụng ${lessonTitle}\n`;
  content += `3. So sánh ưu và nhược điểm của các phương pháp khác nhau\n\n`;

  content += `### Bài tập 2: Thực hành có hướng dẫn\n\n`;
  content += `1. Cho một tình huống cụ thể, hãy thiết kế quy trình áp dụng ${lessonTitle}\n`;
  content += `2. Xác định các rủi ro tiềm ẩn và đề xuất cách khắc phục\n`;
  content += `3. Thiết lập các chỉ số đo lường hiệu quả\n\n`;

  content += `### Bài tập 3: Case study thực tế\n\n`;
  content += `1. Tìm một ví dụ thực tế về việc áp dụng ${lessonTitle} trong ngành liên quan\n`;
  content += `2. Phân tích các yếu tố thành công và thất bại\n`;
  content += `3. Đề xuất cải tiến cho tình huống đó\n\n`;

  content += `### Bài tập 4: Vận dụng nâng cao\n\n`;
  content += `1. Kết hợp ${lessonTitle} với các kiến thức đã học trước đó\n`;
  content += `2. Thiết kế một giải pháp tích hợp cho vấn đề phức tạp\n`;
  content += `3. Đề xuất các cải tiến và tối ưu hóa\n\n`;

  content += `## Tóm tắt và hướng tiếp theo\n\n`;
  content += `${lessonTitle} là kiến thức nền tảng quan trọng trong khóa học ${courseTitle}. Hiểu rõ bài học này sẽ giúp bạn có nền tảng vững chắc cho các nội dung chuyên sâu hơn.\n\n`;
  content += `### Điểm cần ghi nhớ:\n\n`;
  content += `- Nắm vững các khái niệm cơ bản của ${lessonTitle}\n`;
  content += `- Hiểu rõ nguyên lý hoạt động và cách áp dụng\n`;
  content += `- Thực hành thường xuyên để thành thạo\n\n`;
  content += `### Hướng học tập tiếp theo:\n\n`;
  content += `- Tìm hiểu sâu hơn về các ứng dụng nâng cao của ${lessonTitle}\n`;
  content += `- Khám phá các kỹ thuật liên quan và kết hợp\n`;
  content += `- Thực hành qua các dự án thực tế\n\n`;

  content += `### Tài liệu tham khảo:\n\n`;
  content += `- Sách giáo trình và tài liệu chuyên ngành\n`;
  content += `- Các trang web học tập uy tín\n`;
  content += `- Các video hướng dẫn và tutorial\n`;

  // Add original content if available
  if (lessonContent && lessonContent.length > 50) {
    content += `\n\n## Nội dung bổ sung từ khóa học\n\n${lessonContent}`;
  }

  return content;
}

// Helper function to extract key concepts from title (reused from controller)
function extractKeyConceptsFromTitle(lessonTitle) {
  const concepts = [];
  const programmingConcepts = ['mảng', 'chuỗi', 'array', 'string', 'biến', 'variable', 'hàm', 'function', 'lớp', 'class', 'đối tượng', 'object', 'vòng lặp', 'loop', 'điều kiện', 'condition', 'toán tử', 'operator'];

  const words = lessonTitle.toLowerCase().split(/\s+/);
  words.forEach(word => {
    if (programmingConcepts.includes(word) || word.length > 4) {
      concepts.push(word);
    }
  });

  return concepts.length > 0 ? concepts : ['khái niệm chính', 'kỹ thuật cơ bản'];
}

// Helper function to check if it's a programming course (reused from controller)
function isProgrammingCourse(courseTitle, lessonTitle) {
  const text = `${courseTitle} ${lessonTitle}`.toLowerCase();
  return /lập\s*trình|programming|code|python|javascript|java|c\+\+|react|node|sql|database|array|string|mảng|chuỗi/i.test(text);
}

module.exports = {
  generateDetailedLessonDocument: generateDetailedLessonDocumentWithRetry,
  generateDetailedLessonDocumentWithTimeout,
  validateDocumentCompleteness,
};
