// controllers/aiCourse.controller.js
const Course = require("../models/Course");
const Category = require("../models/Category");
const Lesson = require("../models/Lesson");
const Quiz = require("../models/Quiz");
const Document = require("../models/Document");
const { callLLMJSON } = require("../services/llm.service");
const { normalizeQuizItems } = require("../services/quiz-ai.service");
const { ensureLessons, indexByLetter } = require("../utils/quiz-normalize");
const { extractKeyVocabulary } = require("../utils/dynamicPrompt.helper");
const { generateDetailedLessonDocument, generateDetailedLessonDocumentWithTimeout } = require("../services/document-detailed-improved.service");
const { scheduleDocumentGeneration, scheduleDocumentGenerationForLesson } = require("../services/document-generation.service");

const AUTO_LESSON_MIN = 6;
const AUTO_LESSON_MAX = 20;
const QUIZ_MIN_PER_LESSON = 12;
const QUIZ_MAX_PER_LESSON = 40;

// Helper functions for enhanced fallback content
function generateEnhancedFallbackContent({ lessonTitle, lessonContent, courseTitle, level }) {
  // Extract key concepts from lesson title and content
  const keyConcepts = extractKeyConceptsFromTitle(lessonTitle);

  const sections = [
    `## Mục tiêu học tập`,
    `Sau khi hoàn thành bài học này, bạn sẽ có thể:`,
    `- Hiểu rõ khái niệm và bản chất của "${lessonTitle}"`,
    `- Nắm vững các kiến thức cốt lõi và nguyên lý hoạt động`,
    `- Vận dụng được kỹ thuật vào thực tế trong lĩnh vực ${courseTitle}`,
    `- Có nền tảng vững chắc cho các bài học tiếp theo`,

    `## Kiến thức cốt lõi`,
    `### 1. Định nghĩa và bản chất`,
    `${lessonTitle} là một khái niệm/kỹ thuật quan trọng trong lĩnh vực ${courseTitle}. Đây là kiến thức nền tảng mà mọi học viên cần nắm vững để có thể phát triển thêm các kỹ năng chuyên sâu.`,
    ``,
    `### 2. Các thành phần chính`,
    generateDetailedComponents(lessonTitle, keyConcepts),

    `### 3. Nguyên lý hoạt động`,
    `${lessonTitle} hoạt động dựa trên các nguyên lý cơ bản sau:`,
    `- Nguyên lý thứ nhất: Tương tác và xử lý các thành phần`,
    `- Nguyên lý thứ hai: Điều khiển luồng thực thi`,
    `- Nguyên lý thứ ba: Tối ưu hóa và quản lý tài nguyên`,

    `## Quy trình và các bước thực hiện`,
    `### Bước-by-step implementation:`,
    `1. **Giai đoạn chuẩn bị**: Phân tích yêu cầu và thiết kế giải pháp`,
    `2. **Giai đoạn triển khai**: Thực hiện theo từng bước có hệ thống`,
    `3. **Giai đoạn kiểm tra**: Kiểm tra và xác minh kết quả`,
    `4. **Giai đoạn tối ưu**: Cải thiện hiệu suất và sửa lỗi`,
    ``,
    `### Công thức và quy tắc quan trọng:`,
    `- Quy tắc áp dụng: Khi nào và cách sử dụng ${lessonTitle}`,
    `- Công thức tính toán: Các biểu thức và tính toán liên quan`,
    `- Điều kiện tiên quyết: Những kiến thức cần có trước khi học`,

    `## Ví dụ thực tiễn & Case Studies`,
    generateDetailedExamples(lessonTitle, courseTitle, keyConcepts),

    `## Bài tập luyện tập`,
    generateDetailedExercises(lessonTitle, keyConcepts),

    `## Tóm tắt và hướng tiếp theo`,
    `${lessonTitle} là kiến thức nền tảng quan trọng trong khóa học ${courseTitle}. Hiểu rõ bài học này sẽ giúp bạn có nền tảng vững chắc cho các nội dung chuyên sâu hơn.`,
    ``,
    `### Điểm cần ghi nhớ:`,
    `- Nắm vững các khái niệm cơ bản của ${lessonTitle}`,
    `- Hiểu rõ nguyên lý hoạt động và cách áp dụng`,
    `- Thực hành thường xuyên để thành thạo`,
    ``,
    `### Hướng học tập tiếp theo:`,
    `- Tìm hiểu sâu hơn về các ứng dụng nâng cao của ${lessonTitle}`,
    `- Khám phá các kỹ thuật liên quan và kết hợp`,
    `- Thực hành qua các dự án thực tế`
  ];

  let content = `# ${lessonTitle}\n\n`;
  content += sections.join('\n\n');

  // Add original content if available
  if (lessonContent && lessonContent.length > 50) {
    content += `\n\n## Nội dung bổ sung từ khóa học\n\n${lessonContent}`;
  }

  // Add programming-specific content if it's a programming course
  if (isProgrammingCourse(courseTitle, lessonTitle)) {
    content += `\n\n## Code Examples and Implementation\n\n${generateCodeExamples(lessonTitle, keyConcepts)}`;
  }

  return content;
}

// Helper function to extract key concepts from title
function extractKeyConceptsFromTitle(lessonTitle) {
  const concepts = [];

  // Common programming concepts
  const programmingConcepts = ['mảng', 'chuỗi', 'array', 'string', 'biến', 'variable', 'hàm', 'function', 'lớp', 'class', 'đối tượng', 'object', 'vòng lặp', 'loop', 'điều kiện', 'condition', 'toán tử', 'operator'];

  // Extract words that might be concepts
  const words = lessonTitle.toLowerCase().split(/\s+/);
  words.forEach(word => {
    if (programmingConcepts.includes(word) || word.length > 4) {
      concepts.push(word);
    }
  });

  return concepts.length > 0 ? concepts : ['khái niệm chính', 'kỹ thuật cơ bản'];
}

// Helper function to generate detailed components
function generateDetailedComponents(lessonTitle, concepts) {
  let components = `Các thành phần chính của ${lessonTitle} bao gồm:\n\n`;

  concepts.forEach((concept, index) => {
    components += `- **Thành phần ${index + 1}: ${concept}**\n`;
    components += `  - Mô tả: Đây là yếu tố quan trọng trong cấu trúc của ${lessonTitle}\n`;
    components += `  - Chức năng: Đảm bảo hoạt động chính xác và hiệu quả\n`;
    components += `  - Liên quan: Tương tác với các thành phần khác trong hệ thống\n\n`;
  });

  return components;
}

// Helper function to generate detailed examples
function generateDetailedExamples(lessonTitle, courseTitle, concepts) {
  let examples = `### Ví dụ 1: Áp dụng cơ bản\n`;
  examples += `**Bối cảnh**: Một tình huống thực tế trong lĩnh vực ${courseTitle}\n`;
  examples += `**Giải pháp**: Sử dụng ${lessonTitle} để giải quyết vấn đề theo các bước:\n`;
  examples += `1. Phân tích vấn đề và xác định yêu cầu\n`;
  examples += `2. Áp dụng nguyên lý của ${lessonTitle}\n`;
  examples += `3. Triển khai và kiểm tra kết quả\n\n`;

  examples += `### Ví dụ 2: Case study nâng cao\n`;
  examples += `**Tình huống**: Một doanh nghiệp trong ngành ${courseTitle} đã áp dụng thành công ${lessonTitle}\n`;
  examples += `**Kết quả**: Đạt được cải thiện đáng kể về hiệu suất và chất lượng\n`;
  examples += `**Bài học kinh nghiệm**: Các yếu tố then chốt tạo nên thành công\n\n`;

  return examples;
}

// Helper function to generate detailed exercises
function generateDetailedExercises(lessonTitle, concepts) {
  let exercises = `### Bài tập 1: Kiểm tra kiến thức nền tảng\n`;
  exercises += `1. Trình bày lại định nghĩa và bản chất của ${lessonTitle} bằng lời của bạn\n`;
  exercises += `2. Liệt kê và giải thích 5 lợi ích chính của việc áp dụng ${lessonTitle}\n`;
  exercises += `3. So sánh ưu và nhược điểm của các phương pháp khác nhau\n\n`;

  exercises += `### Bài tập 2: Thực hành có hướng dẫn\n`;
  exercises += `1. Cho một tình huống cụ thể, hãy thiết kế quy trình áp dụng ${lessonTitle}\n`;
  exercises += `2. Xác định các rủi ro tiềm ẩn và đề xuất cách khắc phục\n`;
  exercises += `3. Thiết lập các chỉ số đo lường hiệu quả\n\n`;

  exercises += `### Bài tập 3: Case study thực tế\n`;
  exercises += `1. Tìm một ví dụ thực tế về việc áp dụng ${lessonTitle} trong ngành liên quan\n`;
  exercises += `2. Phân tích các yếu tố thành công và thất bại\n`;
  exercises += `3. Đề xuất cải tiến cho tình huống đó\n\n`;

  return exercises;
}

// Helper function to check if it's a programming course
function isProgrammingCourse(courseTitle, lessonTitle) {
  const text = `${courseTitle} ${lessonTitle}`.toLowerCase();
  return /lập\s*trình|programming|code|python|javascript|java|c\+\+|react|node|sql|database|array|string|mảng|chuỗi/i.test(text);
}

// Helper function to generate code examples
function generateCodeExamples(lessonTitle, concepts) {
  let codeExamples = `### Code Example 1: Basic Implementation\n`;
  codeExamples += `Ví dụ cơ bản về ${lessonTitle} trong Java:\n`;
  codeExamples += `\`\`\`java\n`;

  if (concepts.includes('mảng') || concepts.includes('array')) {
    codeExamples += `// Khai báo và sử dụng mảng một chiều\nint[] numbers = {1, 2, 3, 4, 5};\n\n// In ra các phần tử của mảng\nfor (int i = 0; i < numbers.length; i++) {\n    System.out.println("Phần tử " + i + ": " + numbers[i]);\n}\n\n// Mảng nhiều chiều\nint[][] matrix = {\n    {1, 2, 3},\n    {4, 5, 6},\n    {7, 8, 9}\n};\n`;
  } else if (concepts.includes('chuỗi') || concepts.includes('string')) {
    codeExamples += `// Khai báo và khởi tạo chuỗi\nString greeting = "Hello, World!";\nString name = "Java";\n\n// Các phương thức xử lý chuỗi phổ biến\nSystem.out.println("Độ dài: " + greeting.length());\nSystem.out.println("Chữ hoa: " + greeting.toUpperCase());\nSystem.out.println("Chữ thường: " + greeting.toLowerCase());\n\n// Nối chuỗi\nString message = greeting + " " + name;\nSystem.out.println(message);\n`;
  } else {
    codeExamples += `// Ví dụ cơ bản về ${lessonTitle}\npublic class Main {\n    public static void main(String[] args) {\n        // Áp dụng ${lessonTitle}\n        System.out.println("Implementing ${lessonTitle}");\n        \n        // Thêm các logic cụ thể tại đây\n        // TODO: Implement your solution\n    }\n}\n`;
  }

  codeExamples += `\`\`\`\n\n`;

  return codeExamples;
}

function extractKeywordsFromContent(content) {
  const words = content.toLowerCase().split(/\s+/);
  const keywords = new Set();

  // Extract words that look like keywords (capitalized, technical terms)
  content.split(/\n/).forEach(line => {
    const matches = line.match(/\b[A-Z][a-zA-Z]+\b/g);
    if (matches) {
      matches.forEach(word => keywords.add(word));
    }
  });

  // Limit to 6 keywords
  return Array.from(keywords).slice(0, 6);
}

const MIN_LESSON_TARGET = Math.min(AUTO_LESSON_MIN, AUTO_LESSON_MAX);
function isVocabularyCourse(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  return /từ\s*vựng|vocabulary|vocab|từ\s*ngữ|word|từ\s*mới/i.test(text);
}


function escapeRegExp(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureLessonCoverage(lessons = [], topicHint = "chủ đề") {
  const filled = [...lessons];
  const safeHint = topicHint || "chủ đề";
  while (filled.length < MIN_LESSON_TARGET) {
    const index = filled.length + 1;
    filled.push({
      title: `Bài bổ sung ${index}`,
      content: `Tổng hợp các khái niệm quan trọng liên quan đến ${safeHint}. Trình bày lý thuyết cốt lõi, ví dụ thực tế và bài tập ứng dụng để đảm bảo kiến thức toàn diện.`,
    });
  }
  return filled;
}

function buildFallbackQuizItems(lessonTitle = "Bài học", lessonContent = "") {
  const safeTitle = lessonTitle || "Bài học";
  const text = String(lessonContent || "").trim();
  if (!text) return [];

  const sentences = (text.match(/[^.!?\n]+[.!?]?/g) || [])
    .map((s) => s.trim())
    .filter((s) => s.length >= 30);
  const keyTerms = extractKeyVocabulary(text, 8).filter(Boolean);
  if (!sentences.length || !keyTerms.length) return [];

  const fillerOptions = [
    "Một nội dung không có trong bài học",
    "Một ví dụ ngoài phạm vi bài",
    "Một khái niệm khác chưa được đề cập",
  ];
  const usedSentences = new Set();
  const fallbackItems = [];

  for (const term of keyTerms) {
    const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
    const sentence = sentences.find(
      (s) => regex.test(s) && !usedSentences.has(s)
    );
    if (!sentence) continue;

    usedSentences.add(sentence);
    const blankSentence = sentence.replace(regex, "_____");
    const distractorCandidates = keyTerms.filter((t) => t !== term);
    const optionTexts = [];
    const addOption = (value) => {
      const normalized = String(value || "").trim();
      if (
        normalized &&
        !optionTexts.some(
          (opt) => opt.toLowerCase() === normalized.toLowerCase()
        )
      ) {
        optionTexts.push(normalized);
      }
    };

    addOption(term);
    distractorCandidates.slice(0, 3).forEach(addOption);
    for (const filler of fillerOptions) {
      if (optionTexts.length >= 4) break;
      addOption(filler);
    }
    while (optionTexts.length < 4) {
      addOption(`Lựa chọn khác ${optionTexts.length + 1}`);
    }

    fallbackItems.push({
      question: `Điền từ thích hợp để hoàn thành kiến thức trong bài "${safeTitle}": ${blankSentence}`,
      options: optionTexts.slice(0, 4).map((text) => ({ text })),
      correctAnswers: [term],
    });

    if (fallbackItems.length >= QUIZ_MIN_PER_LESSON) break;
  }

  return fallbackItems;
}

function recommendQuizCountForLesson(content = "") {
  const text = String(content || "");
  if (!text.trim().length) return QUIZ_MIN_PER_LESSON;

  // Phân tích nội dung chi tiết
  const words = text.split(/\s+/).filter(Boolean).length;
  const sentences = text
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 0).length;
  const paragraphs = text
    .split(/\n{2,}/)
    .filter((s) => s.trim().length > 0).length;
  const bulletMatches = text.match(/(^|\n)\s*[-*+]\s+/g) || [];
  const headingMatches = text.match(/(^|\n)(#+|\d+\.)\s+/g) || [];
  
  // Detect key concepts/terms (UPPERCASE, bold, code)
  const concepts = text.match(/\*\*[^*]+\*\*|`[^`]+`|[A-Z]{2,}/g) || [];
  const uniqueConcepts = new Set(concepts).size;

  // Scoring dựa vào complexity
  const contentLength = words;
  const complexity = uniqueConcepts + headingMatches.length;
  
  // 1 concept ≈ 1 quiz, 150 từ ≈ 1 quiz, 1 heading ≈ 2 quiz
  const conceptScore = uniqueConcepts;
  const structureScore = headingMatches.length * 2;
  const wordScore = Math.max(Math.ceil(words / 200), 1);
  
  const total = conceptScore + structureScore + wordScore;
  
  // Min 5, Max 35 - flexible based on actual content
  const recommended = Math.max(
    Math.min(total, QUIZ_MAX_PER_LESSON),
    Math.min(QUIZ_MIN_PER_LESSON, 5)
  );
  
  console.log(`[recommendQuizCountForLesson] ${words} words, ${complexity} concepts, ${headingMatches.length} headings → ${recommended} quiz`);
  
  return recommended;
}

function ensureQuizCoverage(lessons = [], quizBuckets = new Map()) {
  const ensured = [];
  for (let i = 0; i < lessons.length; i++) {
    const existingItems = quizBuckets.get(i) || [];
    const target = recommendQuizCountForLesson(lessons[i]?.content || "");
    let items = existingItems;
    if (items.length < target) {
      const fallback = buildFallbackQuizItems(
        lessons[i]?.title,
        lessons[i]?.content
      );
      const needed = Math.max(0, target - items.length);
      if (needed > 0) {
        items = items.concat(fallback.slice(0, needed));
      }
    }
    if (items.length) {
      ensured.push({ lessonIndex: i, items });
    }
  }
  return ensured;
}
// Export for on-demand quiz generation
exports.generateExtraQuizItems = async function generateExtraQuizItems({ lessonTitle, lessonContent, needed, language = "vi", isVocab = false }) {
  if (needed <= 0) return [];
  const vocabNote = isVocab ? "Đây là khóa học từ vựng. Tất cả câu hỏi PHẢI kiểm tra từ vựng (định nghĩa, ứng dụng, ví dụ). Ưu tiên từ khóa chính từ nội dung." : "";
  const system = [
    "Bạn là trợ lý soạn trắc nghiệm cho khóa học LMS.",
    "Trả JSON theo schema: { items: [{ question: string, options: [{text:string}], correctAnswers: [string] }] }",
    "Yêu cầu: mỗi câu hỏi có 4 phương án, chỉ ra đáp án đúng bằng text trong options, không markdown, ngôn ngữ phù hợp.",
    "Chỉ tạo câu hỏi dựa trên kiến thức có trong nội dung bài học được cung cấp, không tự ý bổ sung kiến thức ngoài.",
    "Mỗi câu hỏi phải rõ ràng liên hệ đến thông tin cụ thể của bài học (ý chính, bước thực hành, số liệu hoặc định nghĩa).",
    vocabNote,
  ].filter(Boolean).join("\n");
  const user = [
    `Bài học: ${lessonTitle || ""}`,
    `Nội dung tóm tắt (có thể cắt ngắn):\n${String(lessonContent || "").slice(0, 2000)}`,
    `Hãy tạo ${needed} câu hỏi trắc nghiệm phù hợp với bài học này.`,
      ].join("\n\n");
  const schema = { items: [{ question: "string", options: [{ text: "string" }], correctAnswers: ["text"] }] };
  try {
    const res = await callLLMJSON({ system, user, schema });
    const items = Array.isArray(res?.items) ? res.items : [];
    return normalizeQuizItems(items).slice(0, needed);
  } catch (err) {
    return buildFallbackQuizItems(lessonTitle, lessonContent).slice(0, needed);
  }
}
// Function to analyze assessment and determine level
function analyzeAssessmentLevel(assessment = {}) {
  if (!assessment || !assessment.answers) {
    return "Beginner";
  }

  const { answers, category, topic } = assessment;
  let score = 0;
  let totalQuestions = 0;

  // Universal questions that apply to all topics
  if (answers.current_level !== undefined) {
    // This is a scale from 0-5 directly representing level
    score += answers.current_level;
    totalQuestions++;
  }

  if (answers.practical_experience !== undefined) {
    // Scale from 0-4, convert to 0-5 scale
    score += (answers.practical_experience / 4) * 5;
    totalQuestions++;
  }

  // Category-specific scoring
  if (category === 'programming') {
    // Programming basics (0-4)
    if (answers.programming_basics !== undefined) {
      score += (answers.programming_basics / 4) * 5;
      totalQuestions++;
    }
    // Project experience (0-4)
    if (answers.project_experience !== undefined) {
      score += (answers.project_experience / 4) * 5;
      totalQuestions++;
    }
  } else if (category === 'design') {
    // Design tools (0-4)
    if (answers.design_tools !== undefined) {
      score += (answers.design_tools / 4) * 5;
      totalQuestions++;
    }
    // Design principles (0-4)
    if (answers.design_principles !== undefined) {
      score += (answers.design_principles / 4) * 5;
      totalQuestions++;
    }
  } else if (category === 'business') {
    // Business knowledge (0-4)
    if (answers.business_knowledge !== undefined) {
      score += (answers.business_knowledge / 4) * 5;
      totalQuestions++;
    }
    // Management experience (0-4)
    if (answers.management_experience !== undefined) {
      score += (answers.management_experience / 4) * 5;
      totalQuestions++;
    }
  }

  // Language learning specific
  if (answers.language_level !== undefined) {
    score += (answers.language_level / 4) * 5;
    totalQuestions++;
  }

  // Data analysis specific
  if (answers.technical_skills !== undefined) {
    score += (answers.technical_skills / 4) * 5;
    totalQuestions++;
  }

  // Calculate average score (0-5 scale)
  const averageScore = totalQuestions > 0 ? score / totalQuestions : 0;

  console.log(`[analyzeAssessmentLevel] Topic: ${topic}, Category: ${category}, Score: ${averageScore.toFixed(2)}/${totalQuestions} questions`);

  // Map score to level with more granular thresholds
  if (averageScore >= 4.2) return "Advanced";
  if (averageScore >= 3.0) return "Intermediate";
  if (averageScore >= 1.5) return "Beginner";
  return "Beginner";
}

// POST /api/ai/courses/draft
exports.generateCourseDraft = async (req, res) => {
  try {
    console.log(`[generateCourseDraft] Starting...`);
    const {
      prompt,
      targetAudience,
      assessment,
    } = req.body || {};
    const includeQuizzes = true;
    const isVocab = isVocabularyCourse(prompt);

    // Analyze assessment to determine level
    const assessedLevel = analyzeAssessmentLevel(assessment);

    console.log(`[generateCourseDraft] Input:`, {
      prompt,
      targetAudience,
      assessedLevel,
      assessment: assessment ? { category: assessment.category, answersCount: Object.keys(assessment.answers || {}).length } : null,
      isVocab,
    });
    if (!prompt)
      return res
        .status(400)
        .json({ message: "Thiếu prompt (chủ đề/mục tiêu khóa học)." });
    // Fetch existing categories
    const existingCategories = await Category.find().select("name").lean();
    const categoryList = existingCategories.map((c) => c.name);
    const categoryOptions =
      categoryList.length > 0
        ? categoryList.join(", ")
        : "Lập Trình, Thiết Kế, Kinh Doanh, Ngoại Ngữ, Khác";
    const vocabularyNote = isVocab ? '\nLƯU Ý: ĐÂY LÀ KHÓA HỌC TỪ VỰNG. Mỗi câu hỏi quiz PHẢI tập trung kiểm tra từ vựng (định nghĩa, ứng dụng, ví dụ sử dụng). Ưu tiên tạo câu hỏi về từ khóa chính từ nội dung bài học.' : '';
    const systemPrompt = `
Bạn là trợ lý xây dựng khóa học cho LMS. LUÔN viết bằng TIẾNG VIỆT.${vocabularyNote} Bắt buộc trả JSON theo schema:
{
  "title": string,
  "description": string,
  "categoryName": string,
  "imagePrompt": string,
  "lessons": [{"title": string, "content": string}],
  "quizzes": [
    {
      "lessonIndex": number,
      "items": [
        {
          "question": string,
          "options": [{"text": string, "imageUrl"?: string}],
          "correctAnswers": [string] // Ghi đúng text từ danh sách options
        }
      ]
    }
  ]
}
TIẾNG VIỆT: Tất cả nội dung (title, description, lessons, quizzes) PHẢI viết bằng tiếng Việt, phù hợp với người học Việt Nam.
Yêu cầu: dàn bài rõ ràng, từng bước dễ hiểu; mô tả súc tích; KHÔNG markdown code block.
DANH MỤC: PHẢI chọn categoryName từ danh sách sau: ${categoryOptions}. TUYỆT ĐỐI KHÔNG tạo danh mục mới!
${includeQuizzes ? `Sinh số lượng câu hỏi phù hợp VỚI NỘI DUNG mỗi bài (không cố định). Ưu tiên bao phủ đầy đủ kiến thức chính, tránh lặp lại.` : "Không sinh quizzes."}
Mô tả rõ mục tiêu, nội dung và gợi ý tài liệu cho từng bài để hệ thống có thể sinh tài liệu bổ sung đầy đủ.
Tự động quyết định số lượng bài học để bao phủ kiến thức (tối thiểu ${AUTO_LESSON_MIN}, tối đa ${AUTO_LESSON_MAX}).
    `.trim();
    // Create enhanced prompt with assessment insights
    let assessmentInsights = "";
    if (assessment && assessment.answers) {
      const insights = [];

      // Universal insights from dynamic questions
      if (assessment.answers.current_level >= 4) {
        insights.push("đã có kiến thức nền tảng vững chắc");
      } else if (assessment.answers.current_level <= 1) {
        insights.push("mới bắt đầu học từ đầu");
      }

      if (assessment.answers.practical_experience >= 3) {
        insights.push("có kinh nghiệm thực tế phong phú");
      } else if (assessment.answers.practical_experience <= 1) {
        insights.push("cần nhiều thực hành hơn");
      }

      // Category-specific insights from dynamic questions
      if (assessment.category === 'programming') {
        if (assessment.answers.programming_basics >= 3) insights.push("hiểu sâu về lập trình");
        if (assessment.answers.project_experience >= 3) insights.push("đã làm nhiều dự án");
        if (assessment.answers.project_experience === 0) insights.push("chưa có kinh nghiệm dự án");
      } else if (assessment.category === 'design') {
        if (assessment.answers.design_tools >= 3) insights.push("thành thạo công cụ thiết kế");
        if (assessment.answers.design_principles >= 3) insights.push("hiểu sâu về nguyên tắc thiết kế");
        if (assessment.answers.design_tools === 0) insights.push("cần học các công cụ thiết kế");
      } else if (assessment.category === 'business') {
        if (assessment.answers.business_knowledge >= 3) insights.push("có kiến thức kinh doanh tốt");
        if (assessment.answers.management_experience >= 3) insights.push("có kinh nghiệm quản lý");
      }

      // Language learning specific
      if (assessment.answers.language_level >= 3) {
        insights.push("sẵn sàng cho nội dung nâng cao");
      } else if (assessment.answers.language_level <= 1) {
        insights.push("cần bắt đầu từ những điều cơ bản nhất");
      }

      // Data analysis specific
      if (assessment.answers.technical_skills >= 3) {
        insights.push("có kỹ năng kỹ thuật tốt");
      } else if (assessment.answers.technical_skills <= 1) {
        insights.push("cần xây dựng nền tảng kỹ thuật");
      }

      // Add goals-based insights if available
      if (assessment.answers.goals) {
        const goalsText = String(assessment.answers.goals).toLowerCase();
        if (goalsText.includes('việc') || goalsText.includes('job') || goalsText.includes('career')) {
          insights.push("hướng đến ứng dụng thực tế cho công việc");
        } else if (goalsText.includes('dự án') || goalsText.includes('project')) {
          insights.push("tập trung vào kỹ năng làm dự án");
        } else if (goalsText.includes('chuyên sâu') || goalsText.includes('expert')) {
          insights.push("muốn học ở mức độ chuyên sâu");
        }
      }

      if (insights.length > 0) {
        assessmentInsights = `
Phân tích khảo sát cho thấy người học ${insights.join(", ")}. Khóa học cần được điều chỉnh cho phù hợp với trình độ và mục tiêu thực tế này.`;
      }
    }

    const userPrompt = `
Chủ đề: ${prompt}
Đối tượng: ${targetAudience || "người mới bắt đầu"}
Cấp độ: ${assessedLevel} (được xác định dựa trên khảo sát trình độ)
${assessmentInsights}
Mục tiêu: xây lộ trình học hợp lý, bao quát kiến thức cần thiết mà không bỏ sót ý chính, phù hợp với trình độ thực tế của người học.
    `.trim();
    // Use schema-guided JSON call for reliability
    const schema = {
      title: "string",
      description: "string",
      categoryName: "string",
      imagePrompt: "string",
      lessons: [{ title: "string", content: "string" }],
      quizzes: [
        {
          lessonIndex: 0,
          items: [
            { question: "string", options: [{ text: "string", imageUrl: "string" }], correctAnswers: ["Xcode"] },
          ],
        },
      ],
    };
    console.log(`[generateCourseDraft] Calling LLM to generate draft...`);
    const draftRaw = await callLLMJSON({
      system: systemPrompt,
      user: userPrompt,
      schema,
      seedObject: { categoryName: "Khác", imagePrompt: "", lessons: [], quizzes: [] },
    });
    const lessons = ensureLessons(draftRaw.lessons || []);
    // Remove code block wrappers from lesson content
    for (const lesson of lessons) {
      if (lesson.content) {
        lesson.content = lesson.content.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
      }
    }
    let boundedLessons = lessons.slice(0, AUTO_LESSON_MAX);
    boundedLessons = ensureLessonCoverage(
      boundedLessons,
      draftRaw.title || prompt
    );
    console.log(`[generateCourseDraft] Draft received:`, {
      title: draftRaw.title,
      lessonsCount: draftRaw.lessons?.length,
      normalizedLessons: boundedLessons.length,
      quizzesCount: draftRaw.quizzes?.length,
    });
    // Apply safe fallbacks so minimal fields are always present
    if (!draftRaw.title) {
      const _t = String(prompt || "").trim().slice(0, 120);
      draftRaw.title = _t || "Khóa học mới";
    }
    if (!draftRaw.description) {
      const parts = [];
      const _p = String(prompt || "").trim();
      if (_p) parts.push(`Khóa học về: ${_p}.`);
      if (targetAudience) parts.push(`Đối tượng: ${targetAudience}.`);
      if (level) parts.push(`Cấp độ: ${level}.`);
      draftRaw.description = parts.join(" ");
    }
    if (!draftRaw.title || !draftRaw.description) {
      console.error("Invalid draft structure:", draftRaw);
      return res
        .status(400)
        .json({ message: "AI trả về dữ liệu chưa đủ trường tối thiểu." });
    }
    // Chuẩn hóa quizzes
    let quizzes = [];
    if (includeQuizzes) {
      const quizBuckets = new Map();
      if (Array.isArray(draftRaw.quizzes)) {
        draftRaw.quizzes.forEach((qset) => {
          const lessonIndex = Math.min(
            Math.max(0, qset.lessonIndex ?? 0),
            Math.max(boundedLessons.length - 1, 0)
          );
          const normalizedItems = normalizeQuizItems(qset.items);
          if (!quizBuckets.has(lessonIndex)) {
            quizBuckets.set(lessonIndex, []);
          }
          quizBuckets.set(lessonIndex, [
            ...quizBuckets.get(lessonIndex),
            ...normalizedItems,
          ]);
        });
      }
      quizzes = ensureQuizCoverage(boundedLessons, quizBuckets);
    }
    const result = {
      title: String(draftRaw.title).trim(),
      description: String(draftRaw.description).trim(),
      categoryName: String(draftRaw.categoryName || "Khác").trim(),
      imagePrompt: String(draftRaw.imagePrompt || "").trim(),
      lessons: boundedLessons,
      quizzes,
      assessedLevel, // Add the assessed level based on survey
      assessmentInsights: assessmentInsights.trim(), // Include the insights generated
    };
    console.log(`[generateCourseDraft] âœ“ Success`);
    return res.json(result);
  } catch (err) {
    console.error("generateCourseDraft error:", {
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      status: err?.status,
    });
    return res.status(500).json({
      message: "Không tạo được bản nháp khóa học.",
      reason: err?.message || "unknown",
      status: err?.status || 500,
      detail: process.env.NODE_ENV === "development" ? err?.message : undefined,
    });
  }
};

// POST /api/ai/courses (cũ - giữ để backward compatibility)
exports.createCourseFromDraft = async (req, res) => {
  try {
    const { draft, instructorId, categoryId } = req.body || {};
    if (
      !draft?.title ||
      !draft?.description ||
      !Array.isArray(draft?.lessons)
    ) {
      return res.status(400).json({ message: "Bản nháp không hợp lệ." });
    }
    if (!instructorId) {
      return res.status(400).json({ message: "Thiếu instructorId." });
    }

    let categoryObjectId = categoryId;
    if (!categoryObjectId) {
      const name = (draft.categoryName || "Khác").trim();
      let cat = await Category.findOne({ name });
      if (!cat) {
        cat = await Category.create({ name });
      }
      categoryObjectId = cat._id;
    }

    const courseDoc = await Course.create({
      title: draft.title,
      description: draft.description,
      imageUrl: draft.imageUrl || null,
      category: categoryObjectId,
      instructor: instructorId,
      price: draft.price ?? 0,
      published: false,
    });

    const lessonDocs = [];
    for (let i = 0; i < draft.lessons.length; i++) {
      const l = draft.lessons[i];
      const ldoc = await Lesson.create({
        course: courseDoc._id,
        title: l.title,
        content: l.content || "",
        order: i,
      });
      lessonDocs.push(ldoc);
    }

    const quizBuckets = new Map();
    if (Array.isArray(draft.quizzes)) {
      draft.quizzes.forEach((qset) => {
        const idx = Math.min(
          Math.max(0, qset.lessonIndex ?? 0),
          lessonDocs.length - 1
        );
        const normalizedItems = normalizeQuizItems(qset.items);
        if (!quizBuckets.has(idx)) {
          quizBuckets.set(idx, []);
        }
        quizBuckets.set(idx, [
          ...quizBuckets.get(idx),
          ...normalizedItems,
        ]);
      });
    }
        // Bổ sung thêm quiz nếu còn thiếu so với mức đề xuất
    for (let i = 0; i < draft.lessons.length; i++) {
      const cur = quizBuckets.get(i) || [];
      const target = recommendQuizCountForLesson(draft.lessons[i]?.content || "");
      const needed = Math.max(0, target - cur.length);
      if (needed > 0) {
        const extra = await generateExtraQuizItems({
          lessonTitle: draft.lessons[i]?.title,
          lessonContent: draft.lessons[i]?.content,
          needed,
        });
        quizBuckets.set(i, cur.concat(extra));
      }
    }
    const ensuredQuizPlan = [];
    for (let i = 0; i < draft.lessons.length; i++) {
      const items = quizBuckets.get(i) || [];
      if (items.length) ensuredQuizPlan.push({ lessonIndex: i, items });
    }
    for (const qset of ensuredQuizPlan) {
      const lessonRef = lessonDocs[qset.lessonIndex]?._id;
      if (!lessonRef) continue;
      for (const item of qset.items || []) {
        await Quiz.create({
          course: courseDoc._id,
          lesson: lessonRef,
          question: item.question,
          options: (item.options || []).map((o) => ({
            text: o.text,
            imageUrl: o.imageUrl || null,
          })),
          correctAnswers: Array.isArray(item.correctAnswers)
            ? item.correctAnswers
            : [indexByLetter(item.correctAnswers ?? 0)],
        });
      }
    }

    console.log(
      `[Create Course] Bắt đầu sinh tài liệu cho bài đầu tiên...`
    );

    // 1️⃣ TẠO TÀI LIỆU BÀI HỌC ĐẦU TIÊN (chờ)
    let firstLessonDocCreated = false;
    if (lessonDocs.length > 0) {
      const firstLesson = lessonDocs[0];
      const firstOriginalLesson = draft.lessons[0];
      try {
        console.log(`[createCourseFromDraft]  Tạo document bài 1: "${firstOriginalLesson.title}"`);

        // Add timeout 180s để tránh hang
        const docPromise = generateDetailedLessonDocument({
          lessonTitle: firstOriginalLesson.title,
          lessonContent: firstOriginalLesson.content || "",
          courseTitle: draft.title,
          courseDescription: draft.description,
          level: draft.level || "Beginner",
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Document generation timeout (180s)")), 180000)
        );

        const docData = await Promise.race([docPromise, timeoutPromise]);

        await Document.create({
          lesson: firstLesson._id,
          course: courseDoc._id,
          title: docData.title || firstOriginalLesson.title,
          content: docData.content || "",
          contentType: "markdown",
          generatedByAI: true,
          summary: docData.summary || "",
          tags: docData.tags || [],
          order: 0,
        });
        firstLessonDocCreated = true;
        console.log(`[Create Course] ✅ Tài liệu bài 1 tạo xong`);
      } catch (err) {
        console.error(`[GenerateDoc Error] ${firstOriginalLesson.title}:`, err.message);
      }
    }

    // 2️⃣ QUEUE TÀI LIỆU BÀI 2 TRỞ ĐI (background)
    if (lessonDocs.length > 1) {
      const remainingLessons = lessonDocs.slice(1);
      const remainingDraftLessons = draft.lessons.slice(1);

      try {
        await scheduleDocumentGeneration(
          remainingLessons.map((lesson, idx) => ({
            ...lesson._doc || lesson.toObject?.() || lesson,
            _id: lesson._id,
            title: remainingDraftLessons[idx]?.title || lesson.title,
            content: remainingDraftLessons[idx]?.content || lesson.content,
          })),
          {
            courseId: courseDoc._id,
            courseTitle: draft.title,
            courseDescription: draft.description,
            level: draft.level || "Beginner",
          }
        );
        console.log(`[Create Course] 📋 Đã queue ${lessonDocs.length - 1} bài học để tạo tài liệu (background)`);
      } catch (err) {
        console.error(`[Schedule Error] Lỗi khi queue tài liệu background:`, err.message);
      }
    }

    // 3️⃣ TRẢ RESPONSE NGAY
    return res.status(201).json({
      message: firstLessonDocCreated
        ? "✅ Khóa học đã được tạo! Bài học 1 đã sẵn sàng. Tài liệu bài còn lại sẽ được tạo tự động."
        : "✅ Khóa học đã được tạo! Tài liệu sẽ được sinh tự động cho tất cả bài học.",
      courseId: courseDoc._id,
      lessonsCreated: lessonDocs.length,
      firstLessonReady: firstLessonDocCreated,
      backgroundJobsQueued: Math.max(0, lessonDocs.length - 1),
    });
  } catch (err) {
    console.error("createCourseFromDraft error:", err.message);
    return res.status(500).json({ message: "Tạo khóa học thất bại.", error: err.message });
  }
};

// POST /api/ai/courses/start - Khởi động tạo course (tạo course + bài 1)
exports.startCourseCreation = async (req, res) => {
  try {
    const { draft, instructorId, categoryId } = req.body || {};
    if (
      !draft?.title ||
      !draft?.description ||
      !Array.isArray(draft?.lessons)
    ) {
      return res.status(400).json({ message: "Bản nháp không hợp lệ." });
    }
    if (!instructorId) {
      return res.status(400).json({ message: "Thiếu instructorId." });
    }

    console.log(`[startCourseCreation] Tạo course: ${draft.title}`);

    let categoryObjectId = categoryId;
    if (!categoryObjectId) {
      const name = (draft.categoryName || "Khác").trim();
      let cat = await Category.findOne({ name });
      if (!cat) {
        cat = await Category.create({ name });
      }
      categoryObjectId = cat._id;
    }

    const courseDoc = await Course.create({
      title: draft.title,
      description: draft.description,
      imageUrl: draft.imageUrl || null,
      category: categoryObjectId,
      instructor: instructorId,
      price: draft.price ?? 0,
      published: false,
      level: draft.assessedLevel || "Beginner", // Save the assessed level from survey
    });

    console.log(`[startCourseCreation] ✅ Course tạo xong: ${courseDoc._id}`);

    // Tạo tất cả lessons
    const lessonDocs = [];
    for (let i = 0; i < draft.lessons.length; i++) {
      const l = draft.lessons[i];
      const ldoc = await Lesson.create({
        course: courseDoc._id,
        title: l.title,
        content: l.content || "",
        order: i,
      });
      lessonDocs.push(ldoc);
    }

    console.log(`[startCourseCreation] ✅ ${lessonDocs.length} lessons tạo xong`);

    // ⏭️ SKIP: Quiz creation moved to on-demand endpoint
    // Users will create quizzes from lesson page when needed

    // 🎯 TẠO DOCUMENT BÀI 1 NGAY (với timeout 180s)
    let firstLessonReady = false;
    if (lessonDocs.length > 0) {
      const firstLesson = lessonDocs[0];
      const firstOriginalLesson = draft.lessons[0];

      try {
        console.log(`[startCourseCreation] 🔄 Tạo document bài 1: "${firstOriginalLesson.title}"`);

        // Use dedicated function with timeout for lesson 1
        const docPromise = generateDetailedLessonDocumentWithTimeout({
          lessonTitle: firstOriginalLesson.title,
          lessonContent: firstOriginalLesson.content || "",
          courseTitle: draft.title,
          courseDescription: draft.description,
          level: draft.assessedLevel || "Beginner", // Use assessed level from survey
          timeoutMs: 180000, // 3 minutes for lesson 1
        });

        const docData = await docPromise; // Timeout is handled inside the function

        if (!docData || !docData.content) {
          throw new Error("Invalid document data received");
        }

        console.log(`[startCourseCreation] 📝 Document content length: ${docData.content.length}`);

        await Document.create({
          lesson: firstLesson._id,
          course: courseDoc._id,
          title: docData.title || firstOriginalLesson.title,
          content: docData.content || "",
          contentType: "markdown",
          generatedByAI: true,
          summary: docData.summary || "",
          tags: docData.tags || [],
          order: 0,
        });

        firstLessonReady = true;
        console.log(`[startCourseCreation] ✅✅✅ Bài 1 document READY! Length: ${docData.content.length}`);
      } catch (err) {
        console.error(`[startCourseCreation] ❌ Lỗi tạo document bài 1:`, {
          message: err.message,
          stack: err.stack,
          lessonTitle: firstOriginalLesson.title,
          timeout: 180000,
        });
        
        // Fallback: create enhanced document if generation fails
        try {
          console.log(`[startCourseCreation] 🔄 Creating enhanced fallback document...`);

          const enhancedContent = generateEnhancedFallbackContent({
            lessonTitle: firstOriginalLesson.title,
            lessonContent: firstOriginalLesson.content || "",
            courseTitle: draft.title,
            level: draft.assessedLevel || "Beginner",
          });

          await Document.create({
            lesson: firstLesson._id,
            course: courseDoc._id,
            title: firstOriginalLesson.title,
            content: enhancedContent,
            contentType: "markdown",
            generatedByAI: false,
            summary: "Tài liệu dự phòng được tạo tự động",
            tags: extractKeywordsFromContent(enhancedContent),
            order: 0,
          });
          firstLessonReady = true;
          console.log(`[startCourseCreation] ✅ Enhanced fallback document created, length: ${enhancedContent.length}`);
        } catch (fallbackErr) {
          console.error(`[startCourseCreation] ❌ Enhanced fallback also failed:`, fallbackErr.message);

          // Last resort: minimal document
          try {
            await Document.create({
              lesson: firstLesson._id,
              course: courseDoc._id,
              title: firstOriginalLesson.title,
              content: `# ${firstOriginalLesson.title}\n\nNội dung đang được cập nhật. Vui lòng quay lại sau.`,
              contentType: "markdown",
              generatedByAI: false,
              summary: "Tài liệu tạm thời",
              tags: [],
              order: 0,
            });
            firstLessonReady = true;
            console.log(`[startCourseCreation] ✅ Minimal fallback document created`);
          } catch (minimalErr) {
            console.error(`[startCourseCreation] ❌ All fallback attempts failed:`, minimalErr.message);
          }
        }
      }
    }

    // 🚀 Trigger stream background job cho bài 2 trở đi
    if (lessonDocs.length > 1) {
      setImmediate(async () => {
        console.log(`[startCourseCreation] 🔄 Background: bắt đầu stream bài 2+`);
        // Background job này sẽ tạo documents cho bài 2, 3... khi client kết nối
        // Xem streamCourseCreation
      });
    }

    return res.status(201).json({
      message: firstLessonReady
        ? "✅ Khóa học đã được tạo! Bài 1 sẵn sàng. Các bài còn lại sẽ được tạo tự động."
        : "✅ Khóa học đã được tạo!",
      courseId: courseDoc._id,
      firstLessonReady,
      totalLessons: lessonDocs.length,
    });
  } catch (err) {
    console.error("startCourseCreation error:", err.message);
    return res.status(500).json({
      message: "Tạo khóa học thất bại.",
      error: err.message,
    });
  }
};

// GET /api/ai/courses/:courseId/stream - Stream tài liệu cho bài 2 trở đi
exports.streamCourseCreation = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!courseId) {
      console.error("[streamCourseCreation] Missing courseId");
      return res.status(400).json({ message: "Thiếu courseId." });
    }

    console.log(`[streamCourseCreation] ✅ Stream started for course: ${courseId}`);

    // SSE headers đã được set ở middleware authSSE
    let clientConnected = true;

    const sendEvent = (eventType, data) => {
      try {
        if (!clientConnected) {
          console.warn(`[streamCourseCreation] ⚠️ Client disconnected, skipping event: ${eventType}`);
          return;
        }
        console.log(`[streamCourseCreation] → ${eventType}:`, data);
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        console.error(`[streamCourseCreation] ❌ Error writing event:`, err.message);
        clientConnected = false;
      }
    };

    // Detect client disconnect
    req.on("close", () => {
      console.warn("[streamCourseCreation] ⚠️ Client disconnected");
      clientConnected = false;
    });

    try {
      // Lấy course + lessons từ DB
      const course = await Course.findById(courseId);
      if (!course) {
        console.error("[streamCourseCreation] Course not found:", courseId);
        sendEvent("error", { message: "Khóa học không tồn tại." });
        res.end();
        return;
      }

      const lessons = await Lesson.find({ course: courseId }).sort({ order: 1 });
      if (lessons.length === 0) {
        console.log("[streamCourseCreation] No lessons found");
        sendEvent("all_lessons_completed", { totalLessons: 0, courseId });
        res.end();
        return;
      }

      console.log(`[streamCourseCreation] Found ${lessons.length} lessons`);
      
      // Gửi event đầu tiên để confirm connection
      sendEvent("stream_connected", {
        courseId,
        totalLessons: lessons.length,
        message: "Stream kết nối thành công"
      });

      // Get course level from course data or default to Beginner
      const courseLevel = course.level || "Beginner";

      // Stream tài liệu cho bài 2 trở đi
      for (let i = 1; i < lessons.length; i++) {
        if (!clientConnected) {
          console.warn("[streamCourseCreation] Client disconnected, stopping stream");
          break;
        }

        const lesson = lessons[i];
        const originalLesson = lessons[i];

        try {
          console.log(`[streamCourseCreation] Tạo document bài ${i + 1}...`);

          // Use dedicated function with timeout for stream lessons
          const docPromise = generateDetailedLessonDocumentWithTimeout({
            lessonTitle: lesson.title,
            lessonContent: lesson.content || "",
            courseTitle: course.title,
            courseDescription: course.description,
            level: courseLevel, // Use course level from database
            timeoutMs: 240000, // 4 minutes for stream lessons
          });

          const docData = await docPromise; // Timeout is handled inside

          if (!docData || !docData.content) {
            throw new Error("Invalid document data received");
          }

          console.log(`[streamCourseCreation] 📝 Document content length: ${docData.content.length}`);

          await Document.create({
            lesson: lesson._id,
            course: courseId,
            title: docData.title || lesson.title,
            content: docData.content || "",
            contentType: "markdown",
            generatedByAI: true,
            summary: docData.summary || "",
            tags: docData.tags || [],
            order: i,
          });

          sendEvent("lesson_ready", {
            lessonIndex: i,
            lessonId: lesson._id,
            title: lesson.title,
            message: `Bài ${i + 1} đã sẵn sàng`,
          });

          console.log(`[streamCourseCreation] ✅ Bài ${i + 1} sẵn sàng`);
          
          // Thêm delay nhỏ giữa các bài để tránh overwhelm connection
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.error(`[streamCourseCreation] ❌ Lỗi bài ${i + 1}:`, err.message);
          
          // Try enhanced fallback: create structured document
          try {
            console.log(`[streamCourseCreation] 🔄 Creating enhanced fallback document for bài ${i + 1}...`);

            const enhancedContent = generateEnhancedFallbackContent({
              lessonTitle: lesson.title,
              lessonContent: lesson.content || "",
              courseTitle: course.title,
              level: courseLevel,
            });

            await Document.create({
              lesson: lesson._id,
              course: courseId,
              title: lesson.title,
              content: enhancedContent,
              contentType: "markdown",
              generatedByAI: false,
              summary: "Tài liệu dự phòng được tạo tự động",
              tags: extractKeywordsFromContent(enhancedContent),
              order: i,
            });

            sendEvent("lesson_ready", {
              lessonIndex: i,
              lessonId: lesson._id,
              title: lesson.title,
              message: `Bài ${i + 1} sẵn sàng (enhanced fallback)`,
            });
            console.log(`[streamCourseCreation] ✅ Enhanced fallback document for bài ${i + 1} created, length: ${enhancedContent.length}`);
          } catch (fallbackErr) {
            console.error(`[streamCourseCreation] ❌ Enhanced fallback also failed for bài ${i + 1}:`, fallbackErr.message);

            // Last resort: minimal document
            try {
              await Document.create({
                lesson: lesson._id,
                course: courseId,
                title: lesson.title,
                content: `# ${lesson.title}\n\nNội dung đang được cập nhật. Vui lòng quay lại sau.`,
                contentType: "markdown",
                generatedByAI: false,
                summary: "Tài liệu tạm thời",
                tags: [],
                order: i,
              });

              sendEvent("lesson_ready", {
                lessonIndex: i,
                lessonId: lesson._id,
                title: lesson.title,
                message: `Bài ${i + 1} sẵn sàng (minimal fallback)`,
              });
              console.log(`[streamCourseCreation] ✅ Minimal fallback document for bài ${i + 1} created`);
            } catch (minimalErr) {
              console.error(`[streamCourseCreation] ❌ All fallback attempts failed for bài ${i + 1}:`, minimalErr.message);
              sendEvent("lesson_error", {
                lessonIndex: i,
                message: `Lỗi khi tạo tài liệu bài ${i + 1}: ${err.message}`,
              });
            }
          }
          // Continue với bài tiếp theo
        }
      }

      // Tất cả bài đã xong
      if (clientConnected) {
        sendEvent("all_lessons_completed", {
          totalLessons: lessons.length,
          courseId,
        });
        console.log(`[streamCourseCreation] ✅ Tất cả bài hoàn tất`);
      }
      
      res.end();
    } catch (err) {
      console.error("[streamCourseCreation] Error:", err.message);
      if (clientConnected) {
        sendEvent("error", {
          message: "Lỗi khi tạo tài liệu: " + err.message,
        });
      }
      res.end();
    }
  } catch (err) {
    console.error("streamCourseCreation outer error:", err.message);
    res.status(500).json({ message: "Stream thất bại.", error: err.message });
  }
};

// POST /api/ai/courses/stream (mới - SSE stream) - DEPRECATED, giữ để backward compat
exports.createCourseFromDraftWithStream = async (req, res) => {
  try {
    const { draft, instructorId, categoryId } = req.body || {};
    if (
      !draft?.title ||
      !draft?.description ||
      !Array.isArray(draft?.lessons)
    ) {
      return res.status(400).json({ message: "Bản nháp không hợp lệ." });
    }
    if (!instructorId) {
      return res.status(400).json({ message: "Thiếu instructorId." });
    }

    // Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const sendEvent = (eventType, data) => {
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      let categoryObjectId = categoryId;
      if (!categoryObjectId) {
        const name = (draft.categoryName || "Khác").trim();
        let cat = await Category.findOne({ name });
        if (!cat) {
          cat = await Category.create({ name });
        }
        categoryObjectId = cat._id;
      }

      const courseDoc = await Course.create({
        title: draft.title,
        description: draft.description,
        imageUrl: draft.imageUrl || null,
        category: categoryObjectId,
        instructor: instructorId,
        price: draft.price ?? 0,
        published: false,
      });

      sendEvent("course_created", {
        courseId: courseDoc._id,
        title: draft.title,
        totalLessons: draft.lessons.length,
      });

      const lessonDocs = [];
      for (let i = 0; i < draft.lessons.length; i++) {
        const l = draft.lessons[i];
        const ldoc = await Lesson.create({
          course: courseDoc._id,
          title: l.title,
          content: l.content || "",
          order: i,
        });
        lessonDocs.push(ldoc);
      }

      const quizBuckets = new Map();
      if (Array.isArray(draft.quizzes)) {
        draft.quizzes.forEach((qset) => {
          const idx = Math.min(
            Math.max(0, qset.lessonIndex ?? 0),
            lessonDocs.length - 1
          );
          const normalizedItems = normalizeQuizItems(qset.items);
          if (!quizBuckets.has(idx)) {
            quizBuckets.set(idx, []);
          }
          quizBuckets.set(idx, [
            ...quizBuckets.get(idx),
            ...normalizedItems,
          ]);
        });
      }

      for (let i = 0; i < draft.lessons.length; i++) {
        const cur = quizBuckets.get(i) || [];
        const target = recommendQuizCountForLesson(draft.lessons[i]?.content || "");
        const needed = Math.max(0, target - cur.length);
        if (needed > 0) {
          const extra = await generateExtraQuizItems({
            lessonTitle: draft.lessons[i]?.title,
            lessonContent: draft.lessons[i]?.content,
            needed,
          });
          quizBuckets.set(i, cur.concat(extra));
        }
      }

      const ensuredQuizPlan = [];
      for (let i = 0; i < draft.lessons.length; i++) {
        const items = quizBuckets.get(i) || [];
        if (items.length) ensuredQuizPlan.push({ lessonIndex: i, items });
      }

      for (const qset of ensuredQuizPlan) {
        const lessonRef = lessonDocs[qset.lessonIndex]?._id;
        if (!lessonRef) continue;
        for (const item of qset.items || []) {
          await Quiz.create({
            course: courseDoc._id,
            lesson: lessonRef,
            question: item.question,
            options: (item.options || []).map((o) => ({
              text: o.text,
              imageUrl: o.imageUrl || null,
            })),
            correctAnswers: Array.isArray(item.correctAnswers)
              ? item.correctAnswers
              : [indexByLetter(item.correctAnswers ?? 0)],
          });
        }
      }

      sendEvent("quizzes_created", { totalQuizzes: ensuredQuizPlan.length });

      // 1️⃣ TẠO DOCUMENT BÀI 1 NGAY
      if (lessonDocs.length > 0) {
        const firstLesson = lessonDocs[0];
        const firstOriginalLesson = draft.lessons[0];
        try {
          console.log(`[SSE] 🔄 Tạo document bài 1: "${firstOriginalLesson.title}"`);

          // Add timeout 180s cho SSE stream
          const docPromise = generateDetailedLessonDocument({
            lessonTitle: firstOriginalLesson.title,
            lessonContent: firstOriginalLesson.content || "",
            courseTitle: draft.title,
            courseDescription: draft.description,
            level: draft.level || "Beginner",
          });

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Document generation timeout (180s)")), 180000)
          );

          const docData = await Promise.race([docPromise, timeoutPromise]);

          await Document.create({
            lesson: firstLesson._id,
            course: courseDoc._id,
            title: docData.title || firstOriginalLesson.title,
            content: docData.content || "",
            contentType: "markdown",
            generatedByAI: true,
            summary: docData.summary || "",
            tags: docData.tags || [],
            order: 0,
          });

          sendEvent("lesson_ready", {
            lessonIndex: 0,
            lessonId: firstLesson._id,
            title: firstOriginalLesson.title,
            message: "Bài 1 đã sẵn sàng",
          });

          console.log(`[SSE] ✅ Bài 1 sẵn sàng`);
        } catch (err) {
          console.error(`[SSE GenerateDoc Error] Bài 1:`, err.message);
          sendEvent("lesson_error", {
            lessonIndex: 0,
            message: "Lỗi khi tạo tài liệu bài 1",
          });
        }
      }

      // 2️⃣ QUEUE VÀ STREAM BÀI CÒN LẠI
      if (lessonDocs.length > 1) {
        const remainingLessons = lessonDocs.slice(1);
        const remainingDraftLessons = draft.lessons.slice(1);

        // Process từng bài một trong background và gửi event
        setImmediate(async () => {
          for (let i = 1; i < lessonDocs.length; i++) {
            const lesson = lessonDocs[i];
            const originalLesson = draft.lessons[i];

            try {
              console.log(`[SSE] 🔄 Tạo document bài ${i + 1}: "${originalLesson.title}"`);

              // Add timeout 240s cho các bài tiếp theo
              const docPromise = generateDetailedLessonDocument({
                lessonTitle: originalLesson.title,
                lessonContent: originalLesson.content || "",
                courseTitle: draft.title,
                courseDescription: draft.description,
                level: draft.level || "Beginner",
              });

              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Document generation timeout for lesson ${i + 1}`)), 240000)
              );

              const docData = await Promise.race([docPromise, timeoutPromise]);

              await Document.create({
                lesson: lesson._id,
                course: courseDoc._id,
                title: docData.title || originalLesson.title,
                content: docData.content || "",
                contentType: "markdown",
                generatedByAI: true,
                summary: docData.summary || "",
                tags: docData.tags || [],
                order: i,
              });

              sendEvent("lesson_ready", {
                lessonIndex: i,
                lessonId: lesson._id,
                title: originalLesson.title,
                message: `Bài ${i + 1} đã sẵn sàng`,
              });

              console.log(`[SSE] ✅ Bài ${i + 1} sẵn sàng`);
            } catch (err) {
              console.error(`[SSE GenerateDoc Error] Bài ${i + 1}:`, err.message);
              sendEvent("lesson_error", {
                lessonIndex: i,
                message: `Lỗi khi tạo tài liệu bài ${i + 1}`,
              });
            }
          }

          // Tất cả bài đã xong
          sendEvent("all_lessons_completed", {
            totalLessons: lessonDocs.length,
            courseId: courseDoc._id,
          });
          res.end();
          console.log(`[SSE] ✅ Tất cả bài đã hoàn tất`);
        });
      } else {
        sendEvent("all_lessons_completed", {
          totalLessons: lessonDocs.length,
          courseId: courseDoc._id,
        });
        res.end();
      }
    } catch (err) {
      console.error("[SSE Error]", err.message);
      sendEvent("error", {
        message: "Lỗi khi tạo khóa học: " + err.message,
      });
      res.end();
    }
  } catch (err) {
    console.error("createCourseFromDraftWithStream error:", err.message);
    res.status(500).json({ message: "Tạo khóa học thất bại.", error: err.message });
  }
};
