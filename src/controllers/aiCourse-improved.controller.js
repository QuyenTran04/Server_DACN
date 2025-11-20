// Improved version of aiCourse.controller.js with better timeout handling
const Course = require("../models/Course");
const Category = require("../models/Category");
const Lesson = require("../models/Lesson");
const Quiz = require("../models/Quiz");
const Document = require("../models/Document");
const { callLLMJSON } = require("../services/llm-improved.service");
const { normalizeQuizItems } = require("../services/quiz-ai.service");
const { ensureLessons, indexByLetter } = require("../utils/quiz-normalize");
const { extractKeyVocabulary } = require("../utils/dynamicPrompt.helper");
const {
  generateDetailedLessonDocument,
  validateDocumentCompleteness
} = require("../services/document-detailed-improved.service");
const { scheduleDocumentGeneration, scheduleDocumentGenerationForLesson } = require("../services/document-generation.service");

const AUTO_LESSON_MIN = 6;
const AUTO_LESSON_MAX = 20;
const QUIZ_MIN_PER_LESSON = 12;
const QUIZ_MAX_PER_LESSON = 40;
const MIN_LESSON_TARGET = Math.min(AUTO_LESSON_MIN, AUTO_LESSON_MAX);

// Reuse helper functions from original controller
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

  const words = text.split(/\s+/).filter(Boolean).length;
  const sentences = text
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 0).length;
  const paragraphs = text
    .split(/\n{2,}/)
    .filter((s) => s.trim().length > 0).length;
  const bulletMatches = text.match(/(^|\n)\s*[-*+]\s+/g) || [];
  const headingMatches = text.match(/(^|\n)(#+|\d+\.)\s+/g) || [];
  const concepts = text.match(/\*\*[^*]+\*\*|`[^`]+`|[A-Z]{2,}/g) || [];
  const uniqueConcepts = new Set(concepts).size;

  const contentLength = words;
  const complexity = uniqueConcepts + headingMatches.length;

  const conceptScore = uniqueConcepts;
  const structureScore = headingMatches.length * 2;
  const wordScore = Math.max(Math.ceil(words / 200), 1);

  const total = conceptScore + structureScore + wordScore;

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
    const res = await callLLMJSON({ system, user, schema, timeoutMs: 120000, maxTokens: 4096 });
    const items = Array.isArray(res?.items) ? res.items : [];
    return normalizeQuizItems(items).slice(0, needed);
  } catch (err) {
    return buildFallbackQuizItems(lessonTitle, lessonContent).slice(0, needed);
  }
}

// POST /api/ai/courses/draft - Improved version with better timeout handling
exports.generateCourseDraft = async (req, res) => {
  try {
    console.log(`[generateCourseDraftImproved] Starting...`);
    const {
      prompt,
      targetAudience,
      level = "Beginner",
    } = req.body || {};
    const includeQuizzes = true;
    const isVocab = isVocabularyCourse(prompt);
    console.log(`[generateCourseDraftImproved] Input:`, {
      prompt,
      targetAudience,
      level,
      isVocab,
    });

    if (!prompt)
      return res
        .status(400)
        .json({ message: "Thiếu prompt (chủ đề/mục tiêu khóa học)." });

    const existingCategories = await Category.find().select("name").lean();
    const categoryList = existingCategories.map((c) => c.name);
    const categoryOptions =
      categoryList.length > 0
        ? categoryList.join(", ")
        : "Lập Trình, Thiết Kế, Kinh Doanh, Ngoại Ngữ, Khác";

    const vocabularyNote = isVocab ? '\nLƯU Ý: ĐÂY LÀ KHÓA HỌC TỪ VỰNG. Mỗi câu hỏi quiz PHẢI tập trung kiểm tra từ vựng (định nghĩa, ứng dụng, ví dụ sử dụng). Ưu tiên tạo câu hỏi về từ khóa chính từ nội dung bài học.' : '';

    const systemPrompt = `
Bạn là trợ lý xây dựng khóa học cho LMS. LUÔN viết bằng TIẾNG VIỆT.${vocabularyNote}
Bắt buộc trả JSON theo schema:
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
          "correctAnswers": [string]
        }
      ]
    }
  ]
}

QUAN TRỌNG:
- TIẾNG VIỆT: Tất cả nội dung PHẢI viết bằng tiếng Việt
- HOÀN THÀNH ĐẦY ĐỦ nội dung, không cắt ngắn
- Mỗi lesson content phải >= 500 ký tự
- DANH MỤC: Phải chọn từ: ${categoryOptions}
- ${includeQuizzes ? `Sinh đủ câu hỏi cho mỗi bài (đảm bảo chất lượng)` : "Không sinh quizzes."}
- Tối thiểu ${AUTO_LESSON_MIN} bài, tối đa ${AUTO_LESSON_MAX} bài
    `.trim();

    const userPrompt = `
Chủ đề: ${prompt}
Đối tượng: ${targetAudience || "người mới bắt đầu"}
Cấp độ: ${level}
Mục tiêu: xây lộ trình học hợp lý, bao quát kiến thức cần thiết.
    `.trim();

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
            { question: "string", options: [{ text: "string", imageUrl: "string" }], correctAnswers: ["string"] },
          ],
        },
      ],
    };

    console.log(`[generateCourseDraftImproved] Calling LLM with improved timeout...`);

    const draftRaw = await callLLMJSON({
      system: systemPrompt,
      user: userPrompt,
      schema,
      timeoutMs: 240000, // 4 minutes
      maxTokens: 16384,
      seedObject: { categoryName: "Khác", imagePrompt: "", lessons: [], quizzes: [] },
    });

    const lessons = ensureLessons(draftRaw.lessons || []);

    // Clean lesson content
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

    console.log(`[generateCourseDraftImproved] Draft received:`, {
      title: draftRaw.title,
      lessonsCount: draftRaw.lessons?.length,
      normalizedLessons: boundedLessons.length,
      quizzesCount: draftRaw.quizzes?.length,
    });

    // Apply fallbacks
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

    // Process quizzes
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
    };

    console.log(`[generateCourseDraftImproved] ✅ Success`);
    return res.json(result);
  } catch (err) {
    console.error("generateCourseDraftImproved error:", {
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

// POST /api/ai/courses/start - Improved version with better document generation
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

    console.log(`[startCourseCreationImproved] Tạo course: ${draft.title}`);

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

    console.log(`[startCourseCreationImproved] ✅ Course tạo xong: ${courseDoc._id}`);

    // Create all lessons
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

    console.log(`[startCourseCreationImproved] ✅ ${lessonDocs.length} lessons tạo xong`);

    // Create document for first lesson with improved timeout
    let firstLessonReady = false;
    if (lessonDocs.length > 0) {
      const firstLesson = lessonDocs[0];
      const firstOriginalLesson = draft.lessons[0];

      try {
        console.log(`[startCourseCreationImproved] 🔄 Tạo document bài 1: "${firstOriginalLesson.title}"`);

        const docData = await generateDetailedLessonDocument({
          lessonTitle: firstOriginalLesson.title,
          lessonContent: firstOriginalLesson.content || "",
          courseTitle: draft.title,
          courseDescription: draft.description,
          level: draft.level || "Beginner",
        });

        if (!docData || !docData.content) {
          throw new Error("Invalid document data received");
        }

        // Validate document completeness
        const validation = validateDocumentCompleteness(docData.content, firstOriginalLesson.title);
        if (!validation.isComplete) {
          console.warn(`[startCourseCreationImproved] ⚠️ Document may be incomplete:`, validation.issues);
        }

        console.log(`[startCourseCreationImproved] 📝 Document content length: ${docData.content.length}`);

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
        console.log(`[startCourseCreationImproved] ✅✅✅ Bài 1 document READY! Length: ${docData.content.length}`);
      } catch (err) {
        console.error(`[startCourseCreationImproved] ❌ Lỗi tạo document bài 1:`, {
          message: err.message,
          stack: err.stack,
        });

        // Enhanced fallback
        try {
          console.log(`[startCourseCreationImproved] 🔄 Creating enhanced fallback document...`);
          const fallbackContent = `# ${firstOriginalLesson.title}

## Mục tiêu học tập
Sau bài học này, bạn sẽ có thể:
- Hiểu các khái niệm cơ bản
- Áp dụng kiến thức vào thực tế
- Làm bài tập liên quan

## Nội dung
${firstOriginalLesson.content || "Nội dung đang được cập nhật. Vui lòng refresh trang để xem nội dung đầy đủ."}

## Lưu ý
Tài liệu này đang được hệ thống AI tự động cải thiện. Nội dung đầy đủ sẽ sớm có sẵn.

---
*Tài liệu được tạo tự động, có thể chưa đầy đủ. Vui lòng thử lại sau để có phiên bản hoàn chỉnh.*`;

          await Document.create({
            lesson: firstLesson._id,
            course: courseDoc._id,
            title: firstOriginalLesson.title,
            content: fallbackContent,
            contentType: "markdown",
            generatedByAI: false,
            summary: "Tài liệu đang được cải thiện tự động",
            tags: ["đang cập nhật"],
            order: 0,
          });
          firstLessonReady = true;
          console.log(`[startCourseCreationImproved] ✅ Enhanced fallback document created`);
        } catch (fallbackErr) {
          console.error(`[startCourseCreationImproved] ❌ Enhanced fallback failed:`, fallbackErr.message);
        }
      }
    }

    return res.status(201).json({
      message: firstLessonReady
        ? "✅ Khóa học đã được tạo! Bài 1 sẵn sàng. Các bài còn lại sẽ được tạo tự động."
        : "✅ Khóa học đã được tạo! Tài liệu sẽ được sinh tự động.",
      courseId: courseDoc._id,
      firstLessonReady,
      totalLessons: lessonDocs.length,
    });
  } catch (err) {
    console.error("startCourseCreationImproved error:", err.message);
    return res.status(500).json({
      message: "Tạo khóa học thất bại.",
      error: err.message,
    });
  }
};

// GET /api/ai/courses/:courseId/stream - Improved streaming with better error handling
exports.streamCourseCreation = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!courseId) {
      console.error("[streamCourseCreationImproved] Missing courseId");
      return res.status(400).json({ message: "Thiếu courseId." });
    }

    console.log(`[streamCourseCreationImproved] ✅ Stream started for course: ${courseId}`);

    let clientConnected = true;

    const sendEvent = (eventType, data) => {
      try {
        if (!clientConnected) {
          console.warn(`[streamCourseCreationImproved] ⚠️ Client disconnected, skipping event: ${eventType}`);
          return;
        }
        console.log(`[streamCourseCreationImproved] → ${eventType}:`, data);
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        console.error(`[streamCourseCreationImproved] ❌ Error writing event:`, err.message);
        clientConnected = false;
      }
    };

    req.on("close", () => {
      console.warn("[streamCourseCreationImproved] ⚠️ Client disconnected");
      clientConnected = false;
    });

    try {
      const course = await Course.findById(courseId);
      if (!course) {
        console.error("[streamCourseCreationImproved] Course not found:", courseId);
        sendEvent("error", { message: "Khóa học không tồn tại." });
        res.end();
        return;
      }

      const lessons = await Lesson.find({ course: courseId }).sort({ order: 1 });
      if (lessons.length === 0) {
        console.log("[streamCourseCreationImproved] No lessons found");
        sendEvent("all_lessons_completed", { totalLessons: 0, courseId });
        res.end();
        return;
      }

      console.log(`[streamCourseCreationImproved] Found ${lessons.length} lessons`);

      sendEvent("stream_connected", {
        courseId,
        totalLessons: lessons.length,
        message: "Stream kết nối thành công"
      });

      // Stream documents for lessons 2+ with improved timeout
      for (let i = 1; i < lessons.length; i++) {
        if (!clientConnected) {
          console.warn("[streamCourseCreationImproved] Client disconnected, stopping stream");
          break;
        }

        const lesson = lessons[i];

        try {
          console.log(`[streamCourseCreationImproved] Tạo document bài ${i + 1}...`);

          const docData = await generateDetailedLessonDocument({
            lessonTitle: lesson.title,
            lessonContent: lesson.content || "",
            courseTitle: course.title,
            courseDescription: course.description,
            level: "Beginner",
          });

          if (!docData || !docData.content) {
            throw new Error("Invalid document data received");
          }

          // Validate completeness
          const validation = validateDocumentCompleteness(docData.content, lesson.title);
          if (!validation.isComplete) {
            console.warn(`[streamCourseCreationImproved] ⚠️ Document ${i + 1} may be incomplete:`, validation.issues);
          }

          console.log(`[streamCourseCreationImproved] 📝 Document content length: ${docData.content.length}`);

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
            isComplete: validation.isComplete,
            contentLength: docData.content.length,
          });

          console.log(`[streamCourseCreationImproved] ✅ Bài ${i + 1} sẵn sàng`);

          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.error(`[streamCourseCreationImproved] ❌ Lỗi bài ${i + 1}:`, err.message);

          // Enhanced fallback
          try {
            console.log(`[streamCourseCreationImproved] 🔄 Creating enhanced fallback for bài ${i + 1}...`);
            const fallbackContent = `# ${lesson.title}

## Nội dung đang được cập nhật
${lesson.content || "Nội dung chi tiết đang được AI tạo. Vui lòng refresh trang để xem phiên bản đầy đủ."}

## Lưu ý
Tài liệu này đang được tự động cải thiện để đảm bảo chất lượng tốt nhất.

---
*Nội dung đầy đủ sẽ sớm có sẵn. Vui lòng thử lại sau.*`;

            await Document.create({
              lesson: lesson._id,
              course: courseId,
              title: lesson.title,
              content: fallbackContent,
              contentType: "markdown",
              generatedByAI: false,
              summary: "Đang được cải thiện tự động",
              tags: ["đang cập nhật"],
              order: i,
            });

            sendEvent("lesson_ready", {
              lessonIndex: i,
              lessonId: lesson._id,
              title: lesson.title,
              message: `Bài ${i + 1} sẵn sàng (đang cải thiện)`,
              isFallback: true,
            });
            console.log(`[streamCourseCreationImproved] ✅ Enhanced fallback for bài ${i + 1} created`);
          } catch (fallbackErr) {
            console.error(`[streamCourseCreationImproved] ❌ Enhanced fallback failed for bài ${i + 1}:`, fallbackErr.message);
            sendEvent("lesson_error", {
              lessonIndex: i,
              message: `Lỗi khi tạo tài liệu bài ${i + 1}: ${err.message}`,
            });
          }
        }
      }

      if (clientConnected) {
        sendEvent("all_lessons_completed", {
          totalLessons: lessons.length,
          courseId,
        });
        console.log(`[streamCourseCreationImproved] ✅ Tất cả bài hoàn tất`);
      }

      res.end();
    } catch (err) {
      console.error("[streamCourseCreationImproved] Error:", err.message);
      if (clientConnected) {
        sendEvent("error", {
          message: "Lỗi khi tạo tài liệu: " + err.message,
        });
      }
      res.end();
    }
  } catch (err) {
    console.error("streamCourseCreationImproved outer error:", err.message);
    res.status(500).json({ message: "Stream thất bại.", error: err.message });
  }
};