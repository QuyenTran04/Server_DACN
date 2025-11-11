const { callGeminiJSON } = require("./gemini.service");
const { callLLMJSON } = require("./llm.service");
const {
  extractKeyVocabulary,
  autoWrapCode,
} = require("../utils/dynamicPrompt.helper");

const MIN_CONTENT_CHARS = 1100;
const MAX_CONTEXT_CHARS = 3200;
const MAX_DOC_ATTEMPTS = 2;
const DOC_SECTIONS = {
  vi: [
    "## Muc tieu hoc tap",
    "## Kien thuc cot loi",
    "## Quy trinh / Cong thuc",
    "## Vi du thuc tien",
    "## Bai tap luyen tap",
    "## Ghi nho & tiep tuc hoc",
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
      ? "- Noi dung dang cap nhat tu ban thao bai hoc."
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
    return `Ban la chuyen gia thiet ke tai lieu hoc tap cap ${level}.
Tao tai lieu chi tiet gan voi noi dung bai hoc, dung markdown va giai thich de hieu.
Tra ve JSON hop le voi cac truong yeu cau.`;
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
      ? `Tu khoa bat buoc phai giai thich: ${keyTerms.join(", ")}.`
      : `Key concepts that must be covered: ${keyTerms.join(", ")}.`
    : "";
  const baseVi = `
Khoa hoc: ${courseTitle || "Chua xac dinh"}
Mo ta: ${courseDescription || "Chua co mo ta"}
Cap do: ${level}
Bai hoc: ${lessonTitle}
Noi dung phac thao/ghi chu hien co:
${condensedContent || "Chua co noi dung, hay tu tao tai lieu hoan chinh."}
${keywordLine}

Cau truc bat buoc (giu nguyen tieu de, dung markdown):
${structureLines}

Yeu cau:
- Moi muc co giai thich chi tiet, ket hop vi du va ung dung thuc te
- Noi dung toi thieu 1200 ky tu, uu tien thong tin bam sat bai hoc
- Them 3-4 bai tap o phan "${sections[4].replace("## ", "" )}"
- Tra JSON duy nhat voi cac truong title, content, summary, tags.`.trim();
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
      ? `Tai lieu: ${context.lessonTitle}`
      : `Lesson Notes: ${context.lessonTitle}`);
  const summary =
    rawDoc.summary?.trim() ||
    (context.language === "vi"
      ? `Tong hop kien thuc chinh cua "${context.lessonTitle}".`
      : `Summary of the key points for "${context.lessonTitle}".`);
  const tags = sanitizeTags(rawDoc.tags, context.keyTerms, context.lessonTitle);
  const content = autoWrapCode((rawDoc.content || "").trim());
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
          intro: `- Hieu ro muc tieu cua bai "${context.lessonTitle}".\n- Nam vung cac khai niem: ${keyTermText}.\n- Lien he voi tinh huong thuc te trong khoa "${context.courseTitle}".`,
          process: `- Trinh bay lai tung buoc hoac cong thuc chinh lien quan toi ${keyTermText}.\n- Giai thich dieu kien ap dung va luu y quan trong.`,
          examples: `- Vi du 1: Ap dung ${context.lessonTitle} trong cong viec thuc te.\n- Vi du 2: Ket hop ${keyTermList[0] || context.lessonTitle} voi cong cu khac.`,
          practice: `1. Viet lai kien thuc bang loi cua ban.\n2. Ap dung ${context.lessonTitle} vao bai toan ban dang theo duoi.\n3. Tim them mot vi du trong linh vuc cua ban.`,
          recap: `- On lai cac cong thuc/kien thuc cot loi.\n- Soan ghi chu ca nhan cho bai tiep theo.\n- Ghi lai cau hoi can giai dap.` ,
          overview: context.condensedContent
            ? `Ban thao hien co nhan manh: ${context.condensedContent}`
            : `Chua co noi dung mau, hay khai thac toan bo kien thuc quanh chu de "${context.lessonTitle}".`,
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
  const fallback = autoWrapCode(
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
        ? `Tai lieu: ${context.lessonTitle}`
        : `Lesson Notes: ${context.lessonTitle}`,
    summary:
      context.language === "vi"
        ? `Tai lieu tong hop day du noi dung bai "${context.lessonTitle}".`
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
    input.lessonTitle?.trim() || (language === "vi" ? "Bai hoc" : "Lesson");
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
        ? `Ban la gia su ho tro hoc tap.\nTra loi cau hoi cua hoc vien du tren tai lieu cung cap.\n- Giai thich ro rang, de hieu\n- Su dung vi du trong tai lieu neu phu hop\n- Neu cau hoi nam ngoai pham vi thi thong bao ro va dua huong dan chung\n- Huong dan tung buoc neu la cau hoi ky thuat`
        : `You are a tutor helping students understand the material.\nAnswer based on the provided document.\n- Be clear and easy to understand\n- Cite examples from the document when relevant\n- If the question is out of scope, say so and give general guidance\n- Provide step-by-step reasoning for technical topics`;

    const userPrompt =
      language === "vi"
        ? `Tai lieu: "${documentTitle}"
Noi dung tai lieu:
${documentContent}

Cau hoi: ${question}`
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
        ? `Ban la chuyen gia tao vi du minh hoa.\n- Tao vi du cu the, de hieu, lien quan den chu de\n- Neu co tai lieu, hay lay ngu canh tu tai lieu\n- Tra loi bang markdown`
        : `You are an expert creating illustrative examples.\n- Produce concrete, easy-to-follow examples for the topic\n- Use the provided document context when relevant\n- Respond in markdown`;

    const userPrompt =
      language === "vi"
        ? `Tao vi du chi tiet cho chu de: "${topic}"
Tai lieu lien quan:
${documentContent}

Hay tao vi du thuc te va de ung dung.`
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
