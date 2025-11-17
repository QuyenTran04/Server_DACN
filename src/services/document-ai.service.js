const { callGeminiJSON } = require("./gemini.service");
const { callLLMJSON } = require("./llm.service");
const {
  extractKeyVocabulary,
  autoWrapCode,
} = require("../utils/dynamicPrompt.helper");

function isProgrammingCourse(courseTitle = "", lessonTitle = "") {
  const text = `${courseTitle} ${lessonTitle}`.toLowerCase();
  return /lập\s*trình|programming|code|python|javascript|js|java|c\+\+|react|node|sql|database|api|backend|frontend|web|app|software/i.test(text);
}

const MIN_CONTENT_CHARS = 2500; // Tăng để tài liệu chi tiết hơn
const MAX_CONTEXT_CHARS = 3200;
const MAX_DOC_ATTEMPTS = 2;
const DOC_SECTIONS = {
  vi: [
    "## Mục tiêu học tập",
    "## Kiến thức cốt lõi",
    "## Quy trình / Công thức",
    "## Ví dụ thực tiễn",
    "## Bài tập luyện tập",
    "## Ghi nhớ & tiếp tục học",
  ],
  en: [
    "## Learning Objectives",
    "## Core Knowledge",
    "## Process / Formula",
    "## Practical Examples",
    "## Practice & Challenges",
    "## Key Takeaways & Next Steps",
  ],
};

function clampText(text = "", limit = MAX_CONTEXT_CHARS) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit)}...`;
}

function splitIntoBullets(text = "", language = "vi") {
  const placeholder =
    language === "vi"
      ? "- Nội dung đang cập nhật từ bản thảo bài học."
      : "- Content will be expanded from the lesson outline.";
  const segments = text
    .replace(/\r/g, "\n")
    .split(/[\n\.]+/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 6);
  return segments.length
    ? segments.map((segment) => `- ${segment}`)
    : [placeholder];
}

function sanitizeTags(rawTags = [], fallbackTerms = [], lessonTitle = "") {
  const normalized = Array.isArray(rawTags) ? rawTags : [];
  const tags = normalized
    .map((tag) => String(tag || "").trim())
    .filter(Boolean);
  for (const term of fallbackTerms) {
    if (tags.length >= 6) break;
    if (!tags.includes(term)) tags.push(term);
  }
  if (!tags.length && lessonTitle) {
    tags.push(lessonTitle);
  }
  return tags.slice(0, 6);
}

function hasRequiredStructure(content = "") {
  if (!content) return false;
  const headingMatches = content.match(/(^|\n)##\s+/g) || [];
  return headingMatches.length >= 4;
}

function coversKeyTerms(content = "", keyTerms = []) {
  if (!keyTerms?.length) return true;
  const haystack = content.toLowerCase();
  return keyTerms.some((term) => haystack.includes(term.toLowerCase()));
}

function buildSystemPrompt(language = "vi", level = "Beginner") {
  if (language === "vi") {
    return `Bạn là chuyên gia thiết kế tài liệu học tập cấp ${level}.
Tạo tài liệu chi tiết gắn với nội dung bài học, dùng markdown và giải thích dễ hiểu.
Trả về JSON hợp lệ với các trường yêu cầu.`;
  }
  return `You are an instructional designer building ${level} lesson documents.
Return comprehensive markdown content tightly aligned to the lesson, strictly as valid JSON.`;
}

function buildUserPrompt(context) {
  const {
    courseTitle,
    courseDescription,
    lessonTitle,
    condensedContent,
    keyTerms,
    language,
    level,
  } = context;
  const sections = DOC_SECTIONS[language] || DOC_SECTIONS.en;
  const structureLines = sections
    .map((section, idx) => `${idx + 1}. ${section}`)
    .join("\n");
  const keywordLine = keyTerms?.length
    ? language === "vi"
      ? `Từ khóa bắt buộc phải giải thích: ${keyTerms.join(", ")}.`
      : `Key concepts that must be covered: ${keyTerms.join(", ")}.`
    : "";
  const baseVi = `
Khóa học: ${courseTitle || "Chưa xác định"}
Mô tả: ${courseDescription || "Chưa có mô tả"}
Cấp độ: ${level}
Bài học: ${lessonTitle}
Nội dung phác thảo/ghi chú hiện có:
${condensedContent || "Chưa có nội dung, hãy tự tạo tài liệu hoàn chỉnh."}
${keywordLine}

Cấu trúc bắt buộc (giữ nguyên tiêu đề, dùng markdown):
${structureLines}

Yêu cầu:
- Mỗi mục có giải thích chi tiết, kết hợp ví dụ và ứng dụng thực tế
- Nội dung tối thiểu 1200 ký tự, ưu tiên thông tin bám sát bài học
- Thêm 3-4 bài tập ở phần "${sections[4].replace("## ", "" )}"
- Trả JSON duy nhất với các trường title, content, summary, tags.`.trim();
  const baseEn = `
Course: ${courseTitle || "Untitled"}
Description: ${courseDescription || "No description"}
Level: ${level}
Lesson: ${lessonTitle}
Existing outline/notes:
${condensedContent || "No outline provided. Build the full document yourself."}
${keywordLine}

MANDATORY STRUCTURE (use exact markdown headings):
${structureLines}

Requirements:
- Each section must be detailed, include explanations, and reference real scenarios
- Minimum 1200 characters, stay aligned with the lesson focus
- In section "${sections[4].replace("## ", "" )}" add 3-4 practice tasks
- Return a single JSON object with title, content, summary, tags.`.trim();
  return language === "vi" ? baseVi : baseEn;
}

function normalizeDocumentPayload(rawDoc = {}, context) {
  const title =
    rawDoc.title?.trim() ||
    (context.language === "vi"
      ? `Tài liệu: ${context.lessonTitle}`
      : `Lesson Notes: ${context.lessonTitle}`);
  const summary =
    rawDoc.summary?.trim() ||
    (context.language === "vi"
      ? `Tổng hợp kiến thức chính của "${context.lessonTitle}".`
      : `Summary of the key points for "${context.lessonTitle}".`);
  const tags = sanitizeTags(rawDoc.tags, context.keyTerms, context.lessonTitle);
  let content = (rawDoc.content || "").trim();
  // Remove existing code block wrappers
  content = content.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
  
  // Only wrap in code block for programming courses
  if (isProgrammingCourse(courseTitle, context.lessonTitle)) {
    content = autoWrapCode(content);
  }
  return {
    title,
    summary,
    tags,
    content,
  };
}

function isDocumentValid(doc, context) {
  if (!doc?.content) return false;
  if (doc.content.length < MIN_CONTENT_CHARS) return false;
  if (!hasRequiredStructure(doc.content)) return false;
  if (!coversKeyTerms(doc.content, context.keyTerms)) return false;
  return true;
}

function buildFallbackDocument(context) {
  const sections = DOC_SECTIONS[context.language] || DOC_SECTIONS.en;
  const keyTermList = context.keyTerms;
  const keyTermText = keyTermList.length
    ? keyTermList.join(", ")
    : context.lessonTitle;
  const localized =
    context.language === "vi"
      ? {
          intro: `- Hiểu rõ mục tiêu của bài "${context.lessonTitle}".\n- Nắm vững các khái niệm: ${keyTermText}.\n- Liên hệ với tình huống thực tế trong khóa "${context.courseTitle}".`,
          process: `- Trình bày lại từng bước hoặc công thức chính liên quan tới ${keyTermText}.\n- Giải thích điều kiện áp dụng và lưu ý quan trọng.`,
          examples: `- Ví dụ 1: Áp dụng ${context.lessonTitle} trong công việc thực tế.\n- Ví dụ 2: Kết hợp ${keyTermList[0] || context.lessonTitle} với công cụ khác.`,
          practice: `1. Viết lại kiến thức bằng lời của bạn.\n2. Áp dụng ${context.lessonTitle} vào bài toán bạn đang theo đuổi.\n3. Tìm thêm một ví dụ trong lĩnh vực của bạn.`,
          recap: `- Ôn lại các công thức/kiến thức cốt lõi.\n- Soạn ghi chú cá nhân cho bài tiếp theo.\n- Ghi lại câu hỏi cần giải đáp.` ,
          overview: context.condensedContent
            ? `Bản thảo hiện có nhấn mạnh: ${context.condensedContent}`
            : `Chưa có nội dung mẫu, hãy khai thác toàn bộ kiến thức quanh chủ đề "${context.lessonTitle}".`,
        }
      : {
          intro: `- Understand what "${context.lessonTitle}" tries to achieve.\n- Master concepts such as ${keyTermText}.\n- Connect the lesson with real scenarios inside "${context.courseTitle}".`,
          process: `- Reiterate the core workflow or formula for ${keyTermText}.\n- Explain when to apply it and common pitfalls.`,
          examples: `- Example 1: Apply ${context.lessonTitle} in a realistic project.\n- Example 2: Combine ${keyTermList[0] || context.lessonTitle} with another tool or method.`,
          practice: `1. Rewrite the key knowledge in your own words.\n2. Apply ${context.lessonTitle} to a personal/work scenario.\n3. Draft one extra example that fits your context.`,
          recap: `- Revisit the most critical formulas or heuristics.\n- Prepare personal notes for the next lesson.\n- List follow-up questions for your instructor.`,
          overview: context.condensedContent
            ? `The current outline highlights: ${context.condensedContent}`
            : `No outline was provided, so cover all relevant knowledge about "${context.lessonTitle}".`,
        };
  const bulletSource =
    context.lessonContent ||
    context.courseDescription ||
    `${context.lessonTitle} ${context.courseTitle}`;
  const bulletContent = splitIntoBullets(bulletSource, context.language).join(
    "\n"
  );
  const fallback = (
    [
      `# ${context.lessonTitle}`,
      `${sections[0]}\n${localized.intro}`,
      `${sections[1]}\n${localized.overview}\n\n${bulletContent}`,
      `${sections[2]}\n${localized.process}`,
      `${sections[3]}\n${localized.examples}`,
      `${sections[4]}\n${localized.practice}`,
      `${sections[5]}\n${localized.recap}`,
    ].join("\n\n")
  );
  return {
    title:
      context.language === "vi"
        ? `Tài liệu: ${context.lessonTitle}`
        : `Lesson Notes: ${context.lessonTitle}`,
    summary:
      context.language === "vi"
        ? `Tài liệu tổng hợp đầy đủ nội dung bài "${context.lessonTitle}".`
        : `Comprehensive summary for "${context.lessonTitle}".`,
    tags: sanitizeTags([], context.keyTerms, context.lessonTitle),
    content: fallback,
  };
}

async function requestDocument(context, attempt = 1) {
  const systemPrompt = buildSystemPrompt(context.language, context.level);
  const userPrompt = buildUserPrompt(context);
  const schema = {
    title: "string",
    content: "string",
    summary: "string",
    tags: ["string"],
  };
  const seedObject = {
    title: context.lessonTitle,
    summary: "",
    content: "",
    tags: context.keyTerms.slice(0, 4),
  };
  const result = await callLLMJSON({
    system: systemPrompt,
    user: userPrompt,
    schema,
    seedObject,
    lang: context.language,
  });
  const normalized = normalizeDocumentPayload(result, context);
  console.log(
    `[generateLessonDocument] Attempt ${attempt} result for ${context.lessonTitle}:`,
    {
      contentLength: normalized.content?.length || 0,
      tags: normalized.tags?.length || 0,
    }
  );
  return normalized;
}

async function createDocumentWithRetry(context) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_DOC_ATTEMPTS; attempt++) {
    try {
      const doc = await requestDocument(context, attempt);
      if (isDocumentValid(doc, context)) {
        return doc;
      }
      lastError = new Error("AI returned incomplete document");
      console.warn(
        `[generateLessonDocument] Invalid document for ${context.lessonTitle} (attempt ${attempt})`
      );
    } catch (err) {
      lastError = err;
      console.error(
        `[generateLessonDocument] Attempt ${attempt} failed for ${context.lessonTitle}:`,
        err.message
      );
    }
  }
  if (lastError) throw lastError;
  throw new Error("Unable to build lesson document");
}

function buildContext(input = {}) {
  const language = input.language || "vi";
  const lessonTitle =
    input.lessonTitle?.trim() || (language === "vi" ? "Bài học" : "Lesson");
  const lessonContent = (input.lessonContent || "").trim();
  const context = {
    lessonTitle,
    lessonContent,
    courseTitle: input.courseTitle?.trim() || "",
    courseDescription: (input.courseDescription || "").trim(),
    level: input.level || "Beginner",
    language,
  };
  context.condensedContent = clampText(
    lessonContent || context.courseDescription,
    MAX_CONTEXT_CHARS
  );
  context.keyTerms =
    input.keyTerms && input.keyTerms.length
      ? input.keyTerms
      : extractKeyVocabulary(
          lessonContent ||
            `${lessonTitle} ${context.courseTitle} ${context.courseDescription}`,
          10
        );
  return context;
}

async function generateLessonDocument(input = {}) {
  const context = buildContext(input);
  console.log(`[generateLessonDocument] Starting for: ${context.lessonTitle}`);
  try {
    const doc = await createDocumentWithRetry(context);
    console.log(`[generateLessonDocument] Success: ${context.lessonTitle}`, {
      contentLength: doc.content?.length,
      hasSummary: !!doc.summary,
      tagsCount: doc.tags?.length || 0,
    });
    return doc;
  } catch (err) {
    console.error("[Document AI Error]", {
      lesson: context.lessonTitle,
      error: err.message,
    });
    const fallback = buildFallbackDocument(context);
    console.warn(
      `[generateLessonDocument] Using fallback content for ${context.lessonTitle}`
    );
    return fallback;
  }
}

/**
 * Tao AI chat response de giai dap cau hoi ve tai lieu
 */
async function answerQuestionAboutDocument({
  question,
  documentContent = "",
  documentTitle = "",
  language = "vi",
} = {}) {
  try {
    const systemPrompt =
      language === "vi"
        ? `Bạn là gia sư hỗ trợ học tập.\nTrả lời câu hỏi của học viên dựa trên tài liệu cung cấp.\n- Giải thích rõ ràng, dễ hiểu\n- Sử dụng ví dụ trong tài liệu nếu phù hợp\n- Nếu câu hỏi nằm ngoài phạm vi thì thông báo rõ và đưa hướng dẫn chung\n- Hướng dẫn từng bước nếu là câu hỏi kỹ thuật`
        : `You are a tutor helping students understand the material.\nAnswer based on the provided document.\n- Be clear and easy to understand\n- Cite examples from the document when relevant\n- If the question is out of scope, say so and give general guidance\n- Provide step-by-step reasoning for technical topics`;

    const userPrompt =
      language === "vi"
        ? `Tài liệu: "${documentTitle}"
Nội dung tài liệu:
${documentContent}

Câu hỏi: ${question}`
        : `Document: "${documentTitle}"
Document content:
${documentContent}

Question: ${question}`;

    const response = await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.5,
    });

    return response?.answer || response?.response || JSON.stringify(response);
  } catch (err) {
    console.error("[Document Q&A Error]", err.message);
    throw new Error(`Failed to answer question: ${err.message}`);
  }
}

/**
 * Tao vi du tu tai lieu
 */
async function generateExampleFromDocument({
  topic,
  documentContent = "",
  language = "vi",
} = {}) {
  try {
    const systemPrompt =
      language === "vi"
        ? `Bạn là chuyên gia tạo ví dụ minh họa.\n- Tạo ví dụ cụ thể, dễ hiểu, liên quan đến chủ đề\n- Nếu có tài liệu, hãy lấy ngữ cảnh từ tài liệu\n- Trả lời bằng markdown`
        : `You are an expert creating illustrative examples.\n- Produce concrete, easy-to-follow examples for the topic\n- Use the provided document context when relevant\n- Respond in markdown`;

    const userPrompt =
      language === "vi"
        ? `Tạo ví dụ chi tiết cho chủ đề: "${topic}"
Tài liệu liên quan:
${documentContent}

Hãy tạo ví dụ thực tế và dễ ứng dụng.`
        : `Create a detailed example for the topic: "${topic}"
Related document:
${documentContent}

Please create a concrete, practical example.`;

    const response = await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
    });

    return response?.example || response?.content || JSON.stringify(response);
  } catch (err) {
    console.error("[Generate Example Error]", err.message);
    throw new Error(`Failed to generate example: ${err.message}`);
  }
}

module.exports = {
  generateLessonDocument,
  answerQuestionAboutDocument,
  generateExampleFromDocument,
};
