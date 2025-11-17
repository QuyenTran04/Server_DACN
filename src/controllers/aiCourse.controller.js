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
const { generateDetailedLessonDocument } = require("../services/document-detailed.service");
const { scheduleDocumentGeneration, scheduleDocumentGenerationForLesson } = require("../services/document-generation.service");

const AUTO_LESSON_MIN = 6;
const AUTO_LESSON_MAX = 20;
const QUIZ_MIN_PER_LESSON = 12;
const QUIZ_MAX_PER_LESSON = 40;

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
// POST /api/ai/courses/draft
exports.generateCourseDraft = async (req, res) => {
  try {
    console.log(`[generateCourseDraft] Starting...`);
    const {
      prompt,
      targetAudience,
      level = "Beginner",
    } = req.body || {};
    const includeQuizzes = true;
    const isVocab = isVocabularyCourse(prompt);
    console.log(`[generateCourseDraft] Input:`, {
      prompt,
      targetAudience,
      level,
      isVocab,
    });
    if (!prompt)
      return res
        .status(400)
        .json({ message: "Thiáº¿u prompt (chá»§ Ä‘á»/má»¥c tiÃªu khÃ³a há»c)." });
    // Fetch existing categories
    const existingCategories = await Category.find().select("name").lean();
    const categoryList = existingCategories.map((c) => c.name);
    const categoryOptions =
      categoryList.length > 0
        ? categoryList.join(", ")
        : "Láº­p TrÃ¬nh, Thiáº¿t Káº¿, Kinh Doanh, Ngoáº¡i Ngá»¯, KhÃ¡c";
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
    const userPrompt = `
Chủ đề: ${prompt}
Đối tượng: ${targetAudience || "người mới bắt đầu"}
Cấp độ: ${level}
Mục tiêu: xây lộ trình học hợp lý, bao quát kiến thức cần thiết mà không bỏ sót ý chính.
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
      seedObject: { categoryName: "KhÃ¡c", imagePrompt: "", lessons: [], quizzes: [] },
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
        .json({ message: "AI tráº£ dá»¯ liá»‡u chÆ°a Ä‘á»§ trÆ°á»ng tá»‘i thiá»ƒu." });
    }
    // Chuáº©n hoÃ¡ quizzes
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
      categoryName: String(draftRaw.categoryName || "KhÃ¡c").trim(),
      imagePrompt: String(draftRaw.imagePrompt || "").trim(),
      lessons: boundedLessons,
      quizzes,
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
        const docData = await generateDetailedLessonDocument({
          lessonTitle: firstOriginalLesson.title,
          lessonContent: firstOriginalLesson.content || "",
          courseTitle: draft.title,
          courseDescription: draft.description,
          level: draft.level || "Beginner",
        });

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

    // 🎯 TẠO DOCUMENT BÀI 1 NGAY (với timeout 60s)
    let firstLessonReady = false;
    if (lessonDocs.length > 0) {
      const firstLesson = lessonDocs[0];
      const firstOriginalLesson = draft.lessons[0];
      
      try {
        console.log(`[startCourseCreation] 🔄 Tạo document bài 1: "${firstOriginalLesson.title}"`);
        
        // Add timeout 60 giây để tránh hang
        const docPromise = generateDetailedLessonDocument({
          lessonTitle: firstOriginalLesson.title,
          lessonContent: firstOriginalLesson.content || "",
          courseTitle: draft.title,
          courseDescription: draft.description,
          level: draft.level || "Beginner",
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Document generation timeout (60s)")), 60000)
        );

        const docData = await Promise.race([docPromise, timeoutPromise]);

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
        });
        
        // Fallback: create minimal document if generation fails
        try {
          console.log(`[startCourseCreation] 🔄 Creating fallback document...`);
          await Document.create({
            lesson: firstLesson._id,
            course: courseDoc._id,
            title: firstOriginalLesson.title,
            content: `# ${firstOriginalLesson.title}\n\n${firstOriginalLesson.content || "Nội dung sẽ được cập nhật..."}`,
            contentType: "markdown",
            generatedByAI: false,
            summary: "Tài liệu được tạo tự động",
            tags: [],
            order: 0,
          });
          firstLessonReady = true;
          console.log(`[startCourseCreation] ✅ Fallback document created`);
        } catch (fallbackErr) {
          console.error(`[startCourseCreation] ❌ Fallback also failed:`, fallbackErr.message);
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

          // Add timeout 120s cho stream (bài 2+ có expansion logic)
          const docPromise = generateDetailedLessonDocument({
            lessonTitle: lesson.title,
            lessonContent: lesson.content || "",
            courseTitle: course.title,
            courseDescription: course.description,
            level: "Beginner",
          });

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Document generation timeout for lesson ${i + 1}`)), 120000)
          );

          const docData = await Promise.race([docPromise, timeoutPromise]);

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
          
          // Try fallback: create minimal document
          try {
            console.log(`[streamCourseCreation] 🔄 Creating fallback document for bài ${i + 1}...`);
            await Document.create({
              lesson: lesson._id,
              course: courseId,
              title: lesson.title,
              content: `# ${lesson.title}\n\n${lesson.content || "Nội dung sẽ được cập nhật..."}`,
              contentType: "markdown",
              generatedByAI: false,
              summary: "Tài liệu được tạo tự động",
              tags: [],
              order: i,
            });
            
            sendEvent("lesson_ready", {
              lessonIndex: i,
              lessonId: lesson._id,
              title: lesson.title,
              message: `Bài ${i + 1} sẵn sàng (fallback)`,
            });
            console.log(`[streamCourseCreation] ✅ Fallback document for bài ${i + 1} created`);
          } catch (fallbackErr) {
            console.error(`[streamCourseCreation] ❌ Fallback also failed for bài ${i + 1}:`, fallbackErr.message);
            sendEvent("lesson_error", {
              lessonIndex: i,
              message: `Lỗi khi tạo tài liệu bài ${i + 1}: ${err.message}`,
            });
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
          const docData = await generateDetailedLessonDocument({
            lessonTitle: firstOriginalLesson.title,
            lessonContent: firstOriginalLesson.content || "",
            courseTitle: draft.title,
            courseDescription: draft.description,
            level: draft.level || "Beginner",
          });

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
              const docData = await generateDetailedLessonDocument({
                lessonTitle: originalLesson.title,
                lessonContent: originalLesson.content || "",
                courseTitle: draft.title,
                courseDescription: draft.description,
                level: draft.level || "Beginner",
              });

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
