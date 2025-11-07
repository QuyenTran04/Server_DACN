/**
 * Subject-specific prompt templates
 * Mỗi môn học có phong cách giải thích riêng
 */

const SUBJECT_STYLES = {
  // Toán học
  "toán": {
    name: "Toán",
    systemPrompt: (lang) =>
      lang === "vi"
        ? `Bạn là giáo viên Toán. Giải thích:
1. Nguyên lý/định lý cơ bản
2. Công thức và các bước giải
3. Ví dụ cụ thể với số liệu thực tế
Đi từ đơn giản đến phức tạp. Không dài dòng, tập trung vào logic.`
        : `You are a Math teacher. Explain:
1. Core principle/theorem
2. Formula and solving steps
3. Concrete example with real numbers
Simple to complex. Concise, logic-focused.`,
    userPromptTemplate: (lang, context) =>
      lang === "vi"
        ? `[NGUYÊN LÝ/ĐỊNH LÝ]
${context.principle || "(không có)"}

[VÍ DỤ LIÊN QUAN TỪ BÀI HỌC]
${context.examples || "(không có)"}

[HƯỚNG DẪN]
- Giải thích tại sao đáp án đúng là đúng dựa trên nguyên lý toán học
- Nếu học sinh chọn sai, chỉ ra lỗi sai (nhầm công thức, tính toán sai, v.v.)
- Đưa ra 1-2 ví dụ số cụ thể
- Tối đa 150 từ`
        : `[PRINCIPLE/THEOREM]
${context.principle || "(none)"}

[RELATED EXAMPLES FROM LESSON]
${context.examples || "(none)"}

[INSTRUCTIONS]
- Explain why the correct answer is correct based on math principle
- If student chose wrong, point out the error (formula confusion, calculation error, etc.)
- Give 1-2 concrete numeric examples
- Max 150 words`,
  },

  // Vật lý
  "vật lý": {
    name: "Vật lý",
    systemPrompt: (lang) =>
      lang === "vi"
        ? `Bạn là giáo viên Vật lý. Giải thích:
1. Nguyên lý vật lý (định luật, hiện tượng)
2. Công thức và mối liên hệ giữa các đại lượng
3. Ứng dụng thực tế hoặc thí nghiệm
Rõ ràng, cô đọng. Tránh ký hiệu phức tạp nếu không cần thiết.`
        : `You are a Physics teacher. Explain:
1. Physics principle (law, phenomenon)
2. Formula and relationships between quantities
3. Real-world application or experiment
Clear, concise. Avoid complex notation if unnecessary.`,
    userPromptTemplate: (lang, context) =>
      lang === "vi"
        ? `[HIỆN TƯỢNG/ĐỊNH LUẬT]
${context.phenomenon || "(không có)"}

[NGỮ CẢNH LIÊN QUAN]
${context.context || "(không có)"}

[HƯỚNG DẪN]
- Giải thích hiện tượng vật lý đằng sau đáp án đúng
- Nếu học sinh chọn sai, chỉ ra sự hiểu lầm về định luật/hiện tượng
- Đưa 1 ví dụ ứng dụng thực tế cụ thể
- Tối đa 150 từ`
        : `[PHENOMENON/LAW]
${context.phenomenon || "(none)"}

[RELATED CONTEXT]
${context.context || "(none)"}

[INSTRUCTIONS]
- Explain the physics principle behind the correct answer
- If student chose wrong, point out the misconception about law/phenomenon
- Give 1 concrete real-world application example
- Max 150 words`,
  },

  // Hóa học
  "hóa": {
    name: "Hóa học",
    systemPrompt: (lang) =>
      lang === "vi"
        ? `Bạn là giáo viên Hóa học. Giải thích:
1. Phản ứng hóa học hoặc khái niệm cơ bản
2. Cơ chế và điều kiện phản ứng
3. Ứng dụng trong công nghiệp hoặc đời sống hàng ngày
Dễ hiểu, tránh ngôn ngữ quá học thuật.`
        : `You are a Chemistry teacher. Explain:
1. Chemical reaction or basic concept
2. Mechanism and reaction conditions
3. Industrial or everyday application
Simple language, avoid overly academic terms.`,
    userPromptTemplate: (lang, context) =>
      lang === "vi"
        ? `[PHẢN ỨNG/KHÁI NIỆM]
${context.reaction || "(không có)"}

[ĐIỀU KIỆN VÀ NGỮ CẢNH]
${context.conditions || "(không có)"}

[HƯỚNG DẪN]
- Giải thích tại sao đáp án đúng dựa trên phản ứng/khái niệm
- Nếu học sinh chọn sai, chỉ ra lỗi (nhầm sản phẩm, điều kiện sai, v.v.)
- Đưa 1 ví dụ ứng dụng thực tế (đời sống hoặc công nghiệp)
- Tối đa 150 từ`
        : `[REACTION/CONCEPT]
${context.reaction || "(none)"}

[CONDITIONS AND CONTEXT]
${context.conditions || "(none)"}

[INSTRUCTIONS]
- Explain why the correct answer is right based on reaction/concept
- If student chose wrong, point out the error (wrong product, wrong condition, etc.)
- Give 1 real-world application example (everyday or industrial)
- Max 150 words`,
  },

  // Tiếng Anh
  "tiếng anh": {
    name: "Tiếng Anh",
    systemPrompt: (lang) =>
      lang === "vi"
        ? `Bạn là giáo viên Tiếng Anh. Giải thích:
1. Quy tắc ngữ pháp hoặc cách dùng từ vựng
2. Ví dụ câu cấu trúc tương tự
3. Trường hợp ngoại lệ (nếu có)
Rõ ràng, dễ áp dụng. Không quá lý thuyết.`
        : `You are an English teacher. Explain:
1. Grammar rule or vocabulary usage
2. Similar sentence structure examples
3. Exceptions (if any)
Clear, applicable. Not overly theoretical.`,
    userPromptTemplate: (lang, context) =>
      lang === "vi"
        ? `[QUY TẮC/CÁC DÙNG TỪ]
${context.rule || "(không có)"}

[VÍ DỤ LIÊN QUAN]
${context.examples || "(không có)"}

[HƯỚNG DẪN]
- Giải thích quy tắc/cách dùng của đáp án đúng
- Nếu học sinh chọn sai, chỉ ra sai lầm (thời gian sai, cấu trúc sai, v.v.)
- Đưa 1-2 ví dụ câu cấu trúc tương tự
- Tối đa 150 từ`
        : `[RULE/USAGE]
${context.rule || "(none)"}

[RELATED EXAMPLES]
${context.examples || "(none)"}

[INSTRUCTIONS]
- Explain the rule/usage of the correct answer
- If student chose wrong, point out the error (wrong tense, structure, etc.)
- Give 1-2 examples with similar sentence structure
- Max 150 words`,
  },

  // Văn học
  "văn": {
    name: "Văn học",
    systemPrompt: (lang) =>
      lang === "vi"
        ? `Bạn là giáo viên Văn học. Giải thích:
1. Ý chính của đoạn/tác phẩm trong ngữ cảnh
2. Chứng cứ hoặc chi tiết hỗ trợ
3. Ý nghĩa hoặc kỹ thuật văn học (nếu liên quan)
Chính xác, không phiên bản, tập trung vào ngữ cảnh.`
        : `You are a Literature teacher. Explain:
1. Main idea of passage/work in context
2. Supporting evidence or details
3. Meaning or literary technique (if relevant)
Precise, not interpretive, context-focused.`,
    userPromptTemplate: (lang, context) =>
      lang === "vi"
        ? `[NGỮ CẢNH/ĐOẠN VĂN]
${context.passage || "(không có)"}

[ÝNH TƯỞNG CHÍNH CỦA BÀI HỌC]
${context.mainIdea || "(không có)"}

[HƯỚNG DẪN]
- Giải thích tại sao đáp án đúng dựa trên ngữ cảnh của tác phẩm
- Nếu học sinh chọn sai, chỉ ra hiểu lầm về ý tưởng/chi tiết
- Đưa chứng cứ hoặc chi tiết cụ thể từ bài học hỗ trợ
- Tối đa 150 từ`
        : `[CONTEXT/PASSAGE]
${context.passage || "(none)"}

[MAIN IDEA OF LESSON]
${context.mainIdea || "(none)"}

[INSTRUCTIONS]
- Explain why the correct answer is right based on work context
- If student chose wrong, point out the misconception about idea/detail
- Provide specific evidence or details from lesson to support
- Max 150 words`,
  },

  // Sinh học
  "sinh": {
    name: "Sinh học",
    systemPrompt: (lang) =>
      lang === "vi"
        ? `Bạn là giáo viên Sinh học. Giải thích:
1. Cơ chế sinh học hoặc khái niệm cơ bản
2. Quá trình hoặc chu kỳ sống
3. Ứng dụng trong y tế hoặc chăn nuôi
Dễ hình dung, từng bước. Tránh ký hiệu khoa học phức tạp nếu không cần.`
        : `You are a Biology teacher. Explain:
1. Biological mechanism or basic concept
2. Process or life cycle
3. Application in medicine or agriculture
Visual, step-by-step. Avoid complex scientific notation if unnecessary.`,
    userPromptTemplate: (lang, context) =>
      lang === "vi"
        ? `[CƠ CHẾ/QUÁ TRÌNH SINH HỌC]
${context.mechanism || "(không có)"}

[NGỮ CẢNH LIÊN QUAN]
${context.context || "(không có)"}

[HƯỚNG DẪN]
- Giải thích cơ chế sinh học đằng sau đáp án đúng
- Nếu học sinh chọn sai, chỉ ra sai lầm về quy trình hoặc khái niệm
- Đưa 1 ví dụ ứng dụng thực tế (y tế hoặc chăn nuôi)
- Tối đa 150 từ`
        : `[BIOLOGICAL MECHANISM/PROCESS]
${context.mechanism || "(none)"}

[RELATED CONTEXT]
${context.context || "(none)"}

[INSTRUCTIONS]
- Explain the biological mechanism behind the correct answer
- If student chose wrong, point out misconception about process/concept
- Give 1 real-world application example (medicine or agriculture)
- Max 150 words`,
  },
};

/**
 * Lấy style prompt cho một môn học
 * @param {string} categoryName - Tên category (e.g., "Toán", "Vật lý")
 * @param {string} lang - Ngôn ngữ ('vi' hoặc 'en')
 * @returns {Object} { systemPrompt, userPromptTemplate, subjectName }
 */
function getSubjectPromptStyle(categoryName = "", lang = "vi") {
  if (!categoryName) {
    return getDefaultPromptStyle(lang);
  }

  const normalizedName = categoryName.toLowerCase().trim();

  // Tìm match chính xác hoặc partial match
  let matched = SUBJECT_STYLES[normalizedName];
  if (!matched) {
    // Thử partial match
    for (const [key, style] of Object.entries(SUBJECT_STYLES)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        matched = style;
        break;
      }
    }
  }

  if (!matched) {
    return getDefaultPromptStyle(lang);
  }

  return {
    systemPrompt: matched.systemPrompt(lang),
    userPromptTemplate: matched.userPromptTemplate,
    subjectName: matched.name,
  };
}

/**
 * Default prompt style khi không tìm thấy môn học cụ thể
 */
function getDefaultPromptStyle(lang = "vi") {
  return {
    systemPrompt:
      lang === "vi"
        ? `Bạn là trợ giảng môn học. Giải thích:
1. Nguyên lý/khái niệm chính
2. Cách áp dụng hoặc ví dụ
Rõ ràng, cô đọng. Không đưa ra toàn bộ đáp án.`
        : `You are a teaching assistant. Explain:
1. Core principle/concept
2. Application or example
Clear, concise. Don't reveal all answers.`,
    userPromptTemplate: (lang, context) =>
      lang === "vi"
        ? `[KHÁI NIỆM CHÍNH]
${context.mainConcept || "(không có)"}

[VÍ DỤ LIÊN QUAN]
${context.examples || "(không có)"}

[HƯỚNG DẪN]
- Giải thích tại sao đáp án đúng
- Nếu học sinh chọn sai, chỉ ra lỗi
- Đưa 1-2 ví dụ cụ thể
- Tối đa 150 từ`
        : `[MAIN CONCEPT]
${context.mainConcept || "(none)"}

[RELATED EXAMPLES]
${context.examples || "(none)"}

[INSTRUCTIONS]
- Explain why the correct answer is right
- If student chose wrong, point out the error
- Give 1-2 concrete examples
- Max 150 words`,
    subjectName: "Chung",
  };
}

/**
 * Xây dựng context cho user prompt dựa trên học phần
 * @param {Object} params - { categoryName, lesson, contextTexts, lang }
 * @returns {Object} context object cho template
 */
function buildSubjectContext(params) {
  const { categoryName = "", lesson = {}, contextTexts = "" } = params;
  const normalizedName = categoryName.toLowerCase().trim();

  const baseContext = {
    examples: contextTexts || "(không tìm thấy ngữ cảnh)",
  };

  // Thêm field cụ thể theo môn học
  if (normalizedName.includes("toán")) {
    return {
      ...baseContext,
      principle: `Bài học: ${lesson.title || "(không có)"}`,
    };
  } else if (
    normalizedName.includes("vật lý") ||
    normalizedName.includes("vật")
  ) {
    return {
      ...baseContext,
      phenomenon: `Bài học: ${lesson.title || "(không có)"}`,
      context: contextTexts,
    };
  } else if (normalizedName.includes("hóa")) {
    return {
      ...baseContext,
      reaction: `Bài học: ${lesson.title || "(không có)"}`,
      conditions: contextTexts,
    };
  } else if (normalizedName.includes("anh") || normalizedName.includes("english")) {
    return {
      ...baseContext,
      rule: `Bài học: ${lesson.title || "(không có)"}`,
    };
  } else if (normalizedName.includes("văn")) {
    return {
      ...baseContext,
      passage: contextTexts,
      mainIdea: `Bài học: ${lesson.title || "(không có)"}`,
    };
  } else if (normalizedName.includes("sinh")) {
    return {
      ...baseContext,
      mechanism: `Bài học: ${lesson.title || "(không có)"}`,
      context: contextTexts,
    };
  }

  return {
    ...baseContext,
    mainConcept: `Bài học: ${lesson.title || "(không có)"}`,
  };
}

module.exports = {
  getSubjectPromptStyle,
  getDefaultPromptStyle,
  buildSubjectContext,
};
