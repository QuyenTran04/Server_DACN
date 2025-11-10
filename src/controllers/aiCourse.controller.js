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
const { generateLessonDocument } = require("../services/document-ai.service");

const AUTO_LESSON_MIN = 6;
const AUTO_LESSON_MAX = 15;
const QUIZ_MIN_PER_LESSON = 1;
// const QUIZ_MAX_PER_LESSON = Infinity; // no cap

const MIN_LESSON_TARGET = Math.min(AUTO_LESSON_MIN, AUTO_LESSON_MAX);

function ensureLessonCoverage(lessons = [], topicHint = "chu de") {
  const filled = [...lessons];
  const safeHint = topicHint || "chu de";
  while (filled.length < MIN_LESSON_TARGET) {
    const index = filled.length + 1;
    filled.push({
      title: `Bai bo sung ${index}`,
      content: `Tong hop cac khai niem quan trong lien quan den ${safeHint}. Trinh bay ly thuyet cot loi, vi du thuc te va bai tap ung dung de dam bao kien thuc toan dien.`,
    });
  }
  return filled;
}

function buildFallbackQuizItems(lessonTitle = "Bai hoc") {
  const safeTitle = lessonTitle || "Bai hoc";
  return [
    {
      question: `Noi dung chinh cua bai "${safeTitle}" la gi?`,
      options: [
        { text: `Cac khai niem va trong tam cua "${safeTitle}"` },
        { text: "Mot chu de khong lien quan" },
        { text: "Chi tiet ngoai le khong duoc de cap" },
        { text: "Mot hoat dong giai tri" },
      ],
      correctAnswers: [`Cac khai niem va trong tam cua "${safeTitle}"`],
    },
    {
      question: `Ung dung thuc tien nao duoc nhan manh trong bai "${safeTitle}"?`,
      options: [
        { text: `Cach ap dung "${safeTitle}" vao bai toan thuc te` },
        { text: "Mot tro choi van dong" },
        { text: "Mot cong viec khong lien quan" },
        { text: "Mot thuc don mon an" },
      ],
      correctAnswers: [`Cach ap dung "${safeTitle}" vao bai toan thuc te`],
    },
  ];
}

function recommendQuizCountForLesson(content = "") {
  const text = String(content || "");
  const words = text.split(/\s+/).filter(Boolean).length;
  const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 0).length;
  const base = Math.max(Math.round(words / 250), Math.round(sentences / 5));
  const target = Math.max(1, base || 1);
  return target;
}

function ensureQuizCoverage(lessons = [], quizBuckets = new Map()) {
  const ensured = [];
  for (let i = 0; i < lessons.length; i++) {
    const existingItems = quizBuckets.get(i) || [];
    const target = recommendQuizCountForLesson(lessons[i]?.content || "");
    let items = existingItems;
    if (items.length < target) {
      const fallback = buildFallbackQuizItems(lessons[i]?.title);
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
async function generateExtraQuizItems({ lessonTitle, lessonContent, needed, language = "vi" }) {
  if (needed <= 0) return [];
  const system = [
    "Ban la tro ly soan trac nghiem cho khoa hoc LMS.",
    "Tra JSON theo schema: { items: [{ question: string, options: [{text:string}], correctAnswers: [string] }] }",
    "Yeu cau: moi cau hoi co 4 phuong an, chi ra dap an dung bang text trong options, khong markdown, ngon ngu phu hop.",
  ].join("\n");
  const user = [
    `Bai hoc: ${lessonTitle || ""}`,
    `Noi dung tom tat (co the cat ngan):\n${String(lessonContent || "").slice(0, 2000)}`,
    `Hay tao ${needed} cau hoi trac nghiem phu hop voi bai hoc nay.`,
    `Ngon ngu: ${language}`,
  ].join("\n\n");
  const schema = { items: [{ question: "string", options: [{ text: "string" }], correctAnswers: ["text"] }] };
  try {
    const res = await callLLMJSON({ system, user, schema, lang: language });
    const items = Array.isArray(res?.items) ? res.items : [];
    return normalizeQuizItems(items).slice(0, needed);
  } catch (err) {
    return buildFallbackQuizItems(lessonTitle).slice(0, needed);
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
      language = "vi",
    } = req.body || {};
    const includeQuizzes = true;
    console.log(`[generateCourseDraft] Input:`, {
      prompt,
      targetAudience,
      level,
      language,
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
    const systemPrompt = `
Ban la tro ly xay dung khoa hoc cho LMS. Bat buoc tra JSON theo schema:
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
          "correctAnswers": [string] // Ghi dung text tu danh sach options
        }
      ]
    }
  ]
}
Ngon ngu tra ve: ${language}.
Yeu cau: dan bai ro rang, tung buoc de hieu; mo ta suc tich; KHONG markdown.
DANH MUC: PHAI chon categoryName tu danh sach sau: ${categoryOptions}. TUYET DOI KHONG tao danh muc moi!
${includeQuizzes ? `Sinh so luong cau hoi phu hop VOI NOI DUNG moi bai (khong co dinh). Uu tien bao phu day du kien thuc chinh, tranh lap lai.` : "Khong sinh quizzes."}
Mo ta ro muc tieu, noi dung, va goi y tai lieu cho tung bai de he thong co the sinh tai lieu bo sung day du.
Tu dong quyet dinh so luong bai hoc de bao phu kien thuc (toi thieu ${AUTO_LESSON_MIN}, toi da ${AUTO_LESSON_MAX}).
    `.trim();
    const userPrompt = `
Chu de: ${prompt}
Doi tuong: ${targetAudience || "nguoi moi bat dau"}
Cap do: ${level}
Muc tieu: xay lo trinh hoc hop ly, bao quat kien thuc can thiet ma khong bo sot y chinh.
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
      lang: language,
    });
    const lessons = ensureLessons(draftRaw.lessons || []);
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
      draftRaw.title = _t || "Khoa hoc moi";
    }
    if (!draftRaw.description) {
      const parts = [];
      const _p = String(prompt || "").trim();
      if (_p) parts.push(`Khoa hoc ve: ${_p}.`);
      if (targetAudience) parts.push(`Doi tuong: ${targetAudience}.`);
      if (level) parts.push(`Cap do: ${level}.`);
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
      message: "Khong tao duoc ban nhap khoa hoc.",
      reason: err?.message || "unknown",
      status: err?.status || 500,
      detail: process.env.NODE_ENV === "development" ? err?.message : undefined,
    });
  }
};

// POST /api/ai/courses
exports.createCourseFromDraft = async (req, res) => {
  const session = await Course.startSession();
  session.startTransaction();
  try {
    const { draft, instructorId, categoryId, language = "vi" } = req.body || {};
    if (
      !draft?.title ||
      !draft?.description ||
      !Array.isArray(draft?.lessons)
    ) {
      return res.status(400).json({ message: "Draft khong hop le." });
    }
    if (!instructorId) {
      return res.status(400).json({ message: "Thieu instructorId." });
    }

    let categoryObjectId = categoryId;
    if (!categoryObjectId) {
      const name = (draft.categoryName || "Khac").trim();
      let cat = await Category.findOne({ name }).session(session);
      if (!cat) {
        [cat] = await Category.create([{ name }], { session });
      }
      categoryObjectId = cat._id;
    }

    const [courseDoc] = await Course.create(
      [
        {
          title: draft.title,
          description: draft.description,
          imageUrl: draft.imageUrl || null,
          category: categoryObjectId,
          instructor: instructorId,
          price: draft.price ?? 0,
          published: false,
        },
      ],
      { session }
    );

    const lessonDocs = [];
    for (let i = 0; i < draft.lessons.length; i++) {
      const l = draft.lessons[i];
      const [ldoc] = await Lesson.create(
        [
          {
            course: courseDoc._id,
            title: l.title,
            content: l.content || "",
            order: i,
          },
        ],
        { session }
      );
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
          language,
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
        await Quiz.create(
          [
            {
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
            },
          ],
          { session }
        );
      }
    }

    await session.commitTransaction();
    session.endSession();

    console.log(
      `[Create Course] Bat dau sinh tai lieu cho ${lessonDocs.length} bai hoc...`
    );
    const documentErrors = [];
    for (let i = 0; i < lessonDocs.length; i++) {
      const lesson = lessonDocs[i];
      const originalLesson = draft.lessons[i];
      try {
        const docData = await generateLessonDocument({
          lessonTitle: originalLesson.title,
          lessonContent: originalLesson.content || "",
          courseTitle: draft.title,
          courseDescription: draft.description,
          level: draft.level || "Beginner",
          language,
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
      } catch (err) {
        console.error(`[GenerateDoc Error] ${originalLesson.title}:`, err.message);
        documentErrors.push({
          lesson: originalLesson.title,
          error: err.message,
        });
      }
    }

    return res.status(201).json({
      message:
        "Khoa hoc da duoc tao (o trang thai nhap) - Tai lieu duoc sinh tu dong cho tung bai hoc",
      courseId: courseDoc._id,
      documentGenerationStatus:
        documentErrors.length === 0
          ? "success"
          : `${lessonDocs.length - documentErrors.length}/${lessonDocs.length} tai lieu tao thanh cong`,
      failedDocuments: documentErrors.length ? documentErrors : undefined,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("createCourseFromDraft error:", err);
    return res.status(500).json({ message: "Tao khoa hoc that bai." });
  }
};
