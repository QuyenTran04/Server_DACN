/**
 * Dynamic prompt generation từ course metadata
 * Hệ thống tổng quát cho tất cả khóa học
 */

/**
 * Phân tích course để xác định phong cách giải thích
 * @param {Object} course - Course object với title, description, content
 * @returns {Object} - { style, keywords, explanation }
 */
function analyzeCourseStyle(course = {}) {
  const { title = "", description = "" } = course;
  const combined = `${title} ${description}`.toLowerCase();

  // Keywords để nhận diện loại khóa học
  const stylePatterns = {
    technical: {
      keywords: [
        "code",
        "algorithm",
        "function",
        "program",
        "software",
        "database",
        "framework",
        "library",
        "api",
        "syntax",
        "lập trình",
        "thuật toán",
        "hàm",
        "chương trình",
        "phần mềm",
        "cơ sở dữ liệu",
      ],
      style: "technical",
    },
    science: {
      keywords: [
        "physics",
        "chemistry",
        "biology",
        "science",
        "experiment",
        "vật lý",
        "hóa học",
        "sinh học",
        "khoa học",
        "thực nghiệm",
      ],
      style: "science",
    },
    math: {
      keywords: [
        "math",
        "calculus",
        "algebra",
        "geometry",
        "equation",
        "theorem",
        "toán",
        "vi tích phân",
        "đại số",
        "hình học",
        "phương trình",
        "định lý",
      ],
      style: "math",
    },
    language: {
      keywords: [
        "language",
        "grammar",
        "vocabulary",
        "sentence",
        "writing",
        "speaking",
        "english",
        "spanish",
        "french",
        "german",
        "tiếng",
        "ngữ pháp",
        "từ vựng",
        "viết",
      ],
      style: "language",
    },
    humanities: {
      keywords: [
        "history",
        "literature",
        "philosophy",
        "culture",
        "society",
        "thought",
        "lịch sử",
        "văn học",
        "triết học",
        "văn hóa",
        "xã hội",
      ],
      style: "humanities",
    },
    business: {
      keywords: [
        "business",
        "economics",
        "marketing",
        "finance",
        "management",
        "entrepreneurship",
        "kinh doanh",
        "kinh tế",
        "tiếp thị",
        "tài chính",
        "quản lý",
      ],
      style: "business",
    },
    arts: {
      keywords: [
        "art",
        "design",
        "music",
        "drawing",
        "painting",
        "creative",
        "aesthetic",
        "nghệ thuật",
        "thiết kế",
        "âm nhạc",
        "vẽ",
      ],
      style: "arts",
    },
  };

  // Đếm keywords match
  let maxScore = 0;
  let detectedStyle = "general";

  for (const [key, pattern] of Object.entries(stylePatterns)) {
    const score = pattern.keywords.filter((kw) =>
      combined.includes(kw)
    ).length;
    if (score > maxScore) {
      maxScore = score;
      detectedStyle = pattern.style;
    }
  }

  return {
    style: detectedStyle,
    confidence: maxScore > 0 ? "high" : "low",
    keywords: detectedStyle,
  };
}

/**
 * Tạo system prompt dựa trên phong cách khóa học
 * @param {string} style - Phong cách ('technical', 'science', 'math', 'language', 'humanities', 'business', 'arts', 'general')
 * @param {string} lang - Ngôn ngữ ('vi' hoặc 'en')
 * @returns {string} - System prompt
 */
function generateSystemPrompt(style = "general", lang = "vi") {
  const systemPrompts = {
    technical: {
      vi: `Bạn là giảng viên kỹ thuật. Giải thích:
1. Khái niệm cốt lõi (concept)
2. Cách thực hiện (implementation/cách làm)
3. Ví dụ code/ứng dụng cụ thể
Rõ ràng, dễ hiểu, tránh lý thuyết quá phức tạp. Tập trung vào thực hành.`,
      en: `You are a technical instructor. Explain:
1. Core concept
2. How to implement/apply it
3. Concrete code or practical example
Clear, practical, avoid over-complexity. Focus on hands-on learning.`,
    },
    science: {
      vi: `Bạn là giáo viên khoa học. Giải thích:
1. Nguyên lý/hiện tượng khoa học
2. Cơ chế hoặc quy luật
3. Ứng dụng thực tế hoặc thí nghiệm
Dễ hình dung, từng bước, tránh ký hiệu quá phức tạp. Liên hệ với đời sống.`,
      en: `You are a science instructor. Explain:
1. Scientific principle or phenomenon
2. Mechanism or law
3. Real-world application or experiment
Visual, step-by-step, avoid complex notation. Connect to real life.`,
    },
    math: {
      vi: `Bạn là giáo viên toán. Giải thích:
1. Nguyên lý/định lý toán học
2. Công thức và các bước giải
3. Ví dụ số cụ thể
Từ đơn giản đến phức tạp. Tập trung vào logic, không dài dòng.`,
      en: `You are a math instructor. Explain:
1. Mathematical principle or theorem
2. Formula and solution steps
3. Concrete numeric examples
Simple to complex. Logic-focused, concise.`,
    },
    language: {
      vi: `Bạn là giáo viên ngôn ngữ. Giải thích:
1. Quy tắc ngữ pháp hoặc cách dùng
2. Ví dụ câu cấu trúc tương tự
3. Cách sử dụng trong ngữ cảnh
Rõ ràng, dễ áp dụng. Không quá lý thuyết.
LUÔN sử dụng Markdown format (- thay vì *, **bold** cho emphasis).`,
      en: `You are a language instructor. Explain:
1. Grammar rule or usage
2. Similar sentence structure examples
3. Usage in context
Clear, applicable. Not overly theoretical.
ALWAYS use Markdown format (- instead of *, **bold** for emphasis).`,
    },
    humanities: {
      vi: `Bạn là giáo viên nhân văn. Giải thích:
1. Ý tưởng chính hoặc bối cảnh
2. Chứng cứ hoặc chi tiết hỗ trợ
3. Ý nghĩa hoặc ảnh hưởng
Chính xác, dựa vào ngữ cảnh, không phỏng đoán. Sâu sắc nhưng dễ hiểu.`,
      en: `You are a humanities instructor. Explain:
1. Main idea or context
2. Supporting evidence or details
3. Significance or impact
Precise, context-based, no speculation. Insightful yet accessible.`,
    },
    business: {
      vi: `Bạn là giáo viên kinh doanh. Giải thích:
1. Khái niệm hoặc nguyên lý kinh tế
2. Ứng dụng trong thực tế kinh doanh
3. Ví dụ cụ thể từ thị trường hoặc trường hợp
Thực tế, cụ thể. Liên hệ đến quyết định kinh doanh.`,
      en: `You are a business instructor. Explain:
1. Business concept or economic principle
2. Real-world business application
3. Concrete market or case examples
Practical, specific. Relate to business decisions.`,
    },
    arts: {
      vi: `Bạn là giáo viên nghệ thuật. Giải thích:
1. Khái niệm hoặc kỹ thuật nghệ thuật
2. Cách áp dụng hoặc thực hành
3. Ví dụ từ tác phẩm hoặc trường hợp cụ thể
Sáng tạo, linh hoạt. Khuyến khích hiểu sâu từ góc độ đa chiều.`,
      en: `You are an arts instructor. Explain:
1. Art concept or technique
2. How to apply or practice it
3. Examples from works or specific cases
Creative, flexible. Encourage multi-faceted understanding.`,
    },
    general: {
      vi: `Bạn là giáo viên. Giải thích:
1. Khái niệm hoặc nguyên lý chính
2. Cách áp dụng hoặc thực hành
3. Ví dụ cụ thể
Rõ ràng, dễ hiểu, không lan man.
LUÔN sử dụng Markdown format (- thay vì *, **bold** cho emphasis).`,
      en: `You are an instructor. Explain:
1. Main concept or principle
2. How to apply or practice
3. Concrete examples
Clear, understandable, concise.
ALWAYS use Markdown format (- instead of *, **bold** for emphasis).`,
    },
  };

  const prompts = systemPrompts[style] || systemPrompts.general;
  return prompts[lang] || prompts.vi;
}

/**
 * Tạo user prompt instruction dựa trên phong cách khóa học
 * @param {string} style - Phong cách
 * @param {string} lang - Ngôn ngữ
 * @returns {string} - User instruction template
 */
function generateUserInstruction(style = "general", lang = "vi") {
  const instructions = {
    technical: {
      vi: `[HƯỚNG DẪN GIẢI THÍCH]
- Giải thích lý do đáp án đúng dựa trên khái niệm/implementation
- Nếu học sinh chọn sai, chỉ ra lỗi lập trình hoặc hiểu lầm concept
- Đưa 1 ví dụ code hoặc ứng dụng cụ thể
- SCHEMA examples: { title?: string, content: "ví dụ code/ứng dụng", meaning?: "ghi chú/giải thích" }
- Tối đa 160 từ`,
      en: `[EXPLANATION INSTRUCTIONS]
- Explain why the correct answer is right based on concept/implementation
- If student chose wrong, point out the coding or conceptual error
- Give 1 concrete code or practical example
- SCHEMA examples: { title?: string, content: "code/application example", meaning?: "note/explanation" }
- Max 160 words`,
    },
    science: {
      vi: `[HƯỚNG DẪN GIẢI THÍCH]
- Giải thích hiện tượng/nguyên lý khoa học đằng sau đáp án đúng
- Nếu học sinh chọn sai, chỉ ra sai lầm về quy luật/cơ chế
- Đưa 1 ví dụ thực tế hoặc thí nghiệm cụ thể
- SCHEMA examples: { title?: string, content: "ví dụ", meaning?: "ghi chú" }
- Tối đa 160 từ`,
      en: `[EXPLANATION INSTRUCTIONS]
- Explain the scientific phenomenon/principle behind the correct answer
- If student chose wrong, point out misconception about law/mechanism
- Give 1 real-world or experimental example
- SCHEMA examples: { title?: string, content: "example", meaning?: "note" }
- Max 160 words`,
    },
    math: {
      vi: `[HƯỚNG DẪN GIẢI THÍCH]
- Giải thích vì sao đáp án đúng dựa trên nguyên lý/công thức toán học
- Nếu học sinh chọn sai, chỉ ra lỗi (nhầm công thức, tính toán sai, v.v.)
- Đưa 1-2 ví dụ số cụ thể
- SCHEMA examples: { title?: string, content: "ví dụ", meaning?: "ghi chú" }
- Tối đa 160 từ`,
      en: `[EXPLANATION INSTRUCTIONS]
- Explain why correct answer is right based on math principle/formula
- If student chose wrong, point out error (wrong formula, calculation, etc.)
- Give 1-2 concrete numeric examples
- SCHEMA examples: { title?: string, content: "example", meaning?: "note" }
- Max 160 words`,
    },
    language: {
      vi: `[HƯỚNG DẪN GIẢI THÍCH]
- Giải thích quy tắc/cách dùng của đáp án đúng
- PHẢI bao gồm: Định nghĩa/nghĩa của từ khóa trong câu trả lời đúng
- Nếu học sinh chọn sai, chỉ ra sai lầm (thời gian sai, cấu trúc sai, v.v.)
- Đưa 1-2 ví dụ câu cấu trúc tương tự, MỖI VÍ DỤ PHẢI CÓ GRIT CHÚ MEANING/DỊCH
- SCHEMA examples: { title?: string, content: "ví dụ câu", meaning: "dịch/ghi chú nghĩa" }
- Tối đa 160 từ`,
      en: `[EXPLANATION INSTRUCTIONS]
- Explain the rule/usage of the correct answer
- MUST include: Definition/meaning of key words in the correct answer
- If student chose wrong, point out error (wrong tense, structure, etc.)
- Give 1-2 examples with similar sentence structure, EACH EXAMPLE MUST HAVE MEANING/TRANSLATION NOTE
- SCHEMA examples: { title?: string, content: "example sentence", meaning: "translation/meaning note" }
- Max 160 words`,
    },
    humanities: {
      vi: `[HƯỚNG DẪN GIẢI THÍCH]
- Giải thích tại sao đáp án đúng dựa trên ngữ cảnh/ý tưởng bài học
- Nếu học sinh chọn sai, chỉ ra hiểu lầm về ý tưởng/chi tiết
- Đưa chứng cứ hoặc chi tiết cụ thể hỗ trợ
- SCHEMA examples: { title?: string, content: "ví dụ", meaning?: "ghi chú" }
- Tối đa 160 từ`,
      en: `[EXPLANATION INSTRUCTIONS]
- Explain why correct answer is right based on lesson context/idea
- If student chose wrong, point out misconception about idea/detail
- Provide specific evidence or supporting details
- SCHEMA examples: { title?: string, content: "example", meaning?: "note" }
- Max 160 words`,
    },
    business: {
      vi: `[HƯỚNG DẪN GIẢI THÍCH]
- Giải thích tại sao đáp án đúng dựa trên nguyên lý kinh doanh
- Nếu học sinh chọn sai, chỉ ra sai lầm về quyết định/chiến lược
- Đưa ví dụ từ thị trường hoặc trường hợp kinh doanh thực tế
- SCHEMA examples: { title?: string, content: "ví dụ", meaning?: "ghi chú" }
- Tối đa 160 từ`,
      en: `[EXPLANATION INSTRUCTIONS]
- Explain why correct answer is right based on business principle
- If student chose wrong, point out error in decision/strategy
- Give real-market or business case example
- SCHEMA examples: { title?: string, content: "example", meaning?: "note" }
- Max 160 words`,
    },
    arts: {
      vi: `[HƯỚNG DẪN GIẢI THÍCH]
- Giải thích tại sao đáp án đúng dựa trên kỹ thuật/khái niệm nghệ thuật
- Nếu học sinh chọn sai, chỉ ra sai lầm về kỹ thuật hoặc hiểu lầm concept
- Đưa ví dụ từ tác phẩm hoặc thực hành cụ thể
- SCHEMA examples: { title?: string, content: "ví dụ", meaning?: "ghi chú" }
- Tối đa 160 từ`,
      en: `[EXPLANATION INSTRUCTIONS]
- Explain why correct answer is right based on art technique/concept
- If student chose wrong, point out technique error or misconception
- Give example from artwork or specific practice
- SCHEMA examples: { title?: string, content: "example", meaning?: "note" }
- Max 160 words`,
    },
    general: {
      vi: `[HƯỚNG DẪN GIẢI THÍCH]
- Giải thích tại sao đáp án đúng
- Nếu học sinh chọn sai, chỉ ra lỗi
- Đưa 1-2 ví dụ cụ thể
- SCHEMA examples: { title?: string, content: "ví dụ", meaning?: "ghi chú" }
- Tối đa 160 từ`,
      en: `[EXPLANATION INSTRUCTIONS]
- Explain why the correct answer is right
- If student chose wrong, point out the error
- Give 1-2 concrete examples
- SCHEMA examples: { title?: string, content: "example", meaning?: "note" }
- Max 160 words`,
    },
  };

  const insts = instructions[style] || instructions.general;
  return insts[lang] || insts.vi;
}

/**
 * Build full user prompt cho LLM
 * @param {Object} params - { quiz, contextTexts, pickedTexts, lang, style }
 * @returns {string} - Full user prompt
 */
function buildUserPrompt(params) {
  const {
    quiz = {},
    contextTexts = "",
    pickedTexts = [],
    lang = "vi",
    style = "general",
  } = params;

  const { question = "", options = [] } = quiz;
  const optionsText = (options || [])
    .map((o, i) => (o?.text ? `${i + 1}. ${o.text}` : null))
    .filter(Boolean)
    .join("\n");

  const instruction = generateUserInstruction(style, lang);

  const learnContextSection =
    lang === "vi"
      ? `[NGỮ CẢNH TỪ BÀI HỌC]
${contextTexts || "(không tìm thấy)"}`
      : `[LESSON CONTEXT]
${contextTexts || "(not found)"}`;

  const pickedSection =
    lang === "vi"
      ? `[HỌC SINH ĐÃ CHỌN]
${pickedTexts.length > 0 ? pickedTexts.join("; ") : "(chưa chọn)"}`
      : `[STUDENT'S CHOICE]
${pickedTexts.length > 0 ? pickedTexts.join("; ") : "(not selected)"}`;

  const markdownNote =
    lang === "vi"
      ? "\n\n[ĐỊNH DẠNG OUTPUT]\nSử dụng Markdown format:\n- Bullet points dùng `-` (không dùng `*`)\n- Bold dùng `**text**`\n- Không dùng ký tự `*` cho formatting"
      : "\n\n[OUTPUT FORMAT]\nUse Markdown format:\n- Bullet points use `-` (not `*`)\n- Bold use `**text**`\n- Don't use `*` for formatting";

  return `${instruction}

[CÂU HỎI]
${question}

${
  optionsText
    ? lang === "vi"
      ? `[PHƯƠNG ÁN]
${optionsText}`
      : `[OPTIONS]
${optionsText}`
    : ""
}

${learnContextSection}

${pickedSection}${markdownNote}`;
}

/**
 * Extract key vocabulary/phrases từ text
 * @param {string} text - Text để extract
 * @param {number} limit - Số từ/phrases tối đa (mặc định 5)
 * @returns {string[]} - Array of key terms
 */
function extractKeyVocabulary(text = "", limit = 5) {
  if (!text || typeof text !== "string") return [];

  // Tách câu, loại bỏ từ phổ biến
  const commonWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "can",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "as",
    "if",
    "it",
    "this",
    "that",
    "these",
    "those",
    "you",
    "he",
    "she",
    "they",
    "what",
    "which",
    "who",
    "when",
    "where",
    "why",
    "how",
    "và",
    "hoặc",
    "nhưng",
    "trong",
    "trên",
    "ở",
    "để",
    "từ",
    "với",
    "bởi",
    "như",
    "nếu",
    "nó",
    "cái",
    "bạn",
    "anh",
    "cô",
    "họ",
    "gì",
    "nào",
    "ai",
    "khi",
    "ở đâu",
    "tại sao",
    "làm thế nào",
  ]);

  const words = text.toLowerCase().match(/\b[\w'-]+\b/g) || [];
  const keyTerms = words
    .filter((w) => !commonWords.has(w) && w.length > 2)
    .slice(0, limit);

  return keyTerms;
}

/**
 * Get style hint để trả về response
 * @param {string} style
 * @param {string} lang
 * @returns {string}
 */
function getStyleHint(style = "general", lang = "vi") {
  const hints = {
    technical: {
      vi: "Tập trung vào logic và implementation.",
      en: "Focus on logic and implementation.",
    },
    science: {
      vi: "Tập trung vào nguyên lý khoa học và ứng dụng.",
      en: "Focus on scientific principle and application.",
    },
    math: {
      vi: "Tập trung vào công thức và logic toán.",
      en: "Focus on formula and math logic.",
    },
    language: {
      vi: "Tập trung vào quy tắc ngôn ngữ.",
      en: "Focus on language rule.",
    },
    humanities: {
      vi: "Tập trung vào ý tưởng và ngữ cảnh.",
      en: "Focus on idea and context.",
    },
    business: {
      vi: "Tập trung vào quyết định kinh doanh.",
      en: "Focus on business decision.",
    },
    arts: {
      vi: "Tập trung vào kỹ thuật và sáng tạo.",
      en: "Focus on technique and creativity.",
    },
    general: {
      vi: "Tập trung vào nguyên lý chính.",
      en: "Focus on core principle.",
    },
  };

  const hintObj = hints[style] || hints.general;
  return hintObj[lang] || hintObj.vi;
}

module.exports = {
  analyzeCourseStyle,
  generateSystemPrompt,
  generateUserInstruction,
  buildUserPrompt,
  getStyleHint,
  extractKeyVocabulary,
};
