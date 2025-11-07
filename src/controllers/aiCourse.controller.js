// controllers/aiCourse.controller.js
const Course = require("../models/Course");
const Category = require("../models/Category");
const Lesson = require("../models/Lesson");
const Quiz = require("../models/Quiz");

const { generateCourseDraftJSON } = require("../services/gemini.service");
const { callLLMJSON } = require("../services/llm.service");
const { normalizeQuizItems } = require("../services/quiz-ai.service");
const { ensureLessons, indexByLetter } = require("../utils/quiz-normalize");

// POST /api/ai/courses/draft
exports.generateCourseDraft = async (req, res) => {
  try {
    const {
      prompt,
      targetAudience,
      level = "Beginner",
      language = "vi",
      numLessons = 8,
      includeQuizzes = true,
    } = req.body || {};

    if (!prompt)
      return res
        .status(400)
        .json({ message: "Thiếu prompt (chủ đề/mục tiêu khóa học)." });

    const systemPrompt = `
Bạn là trợ lý xây dựng khóa học cho LMS. Bắt buộc trả JSON theo schema:
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
          "correctAnswers": [string] // ví dụ ["A"] hoặc ["A","C"]
        }
      ]
    }
  ]
}
Ngôn ngữ trả về: ${language}.
Yêu cầu: dàn bài rõ ràng, tăng dần độ khó; mô tả súc tích; KHÔNG markdown.
${includeQuizzes ? "Có quizzes phù hợp từng bài." : "Không sinh quizzes."}
    `.trim();


    const userPrompt = `
Chủ đề: ${prompt}
Đối tượng: ${targetAudience || "người mới bắt đầu"}
Cấp độ: ${level}
Số bài học mong muốn: ${numLessons}
Mục tiêu: xây lộ trình học hợp lý, có mục tiêu từng bài.
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
            { question: "string", options: [{ text: "string", imageUrl: "string" }], correctAnswers: ["A"] },
          ],
        },
      ],
    };
    const draftRaw = await callLLMJSON({
      system: systemPrompt,
      user: userPrompt,
      schema,
      seedObject: { categoryName: "KhA�c", imagePrompt: "", lessons: [], quizzes: [] },
      lang: language,
    });
    const lessons = ensureLessons(draftRaw.lessons).slice(
      0,
      Number(numLessons) || 8
    );
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
        .json({ message: "AI trả dữ liệu chưa đủ trường tối thiểu." });
    }

    // Chuẩn hoá quizzes
    let quizzes = [];
    if (includeQuizzes && Array.isArray(draftRaw.quizzes)) {
      quizzes = draftRaw.quizzes
        .map((qset) => ({
          lessonIndex: Math.min(
            Math.max(0, qset.lessonIndex ?? 0),
            lessons.length - 1
          ),
          items: normalizeQuizItems(qset.items),
        }))
        .filter((q) => q.items?.length);
    }

    const result = {
      title: String(draftRaw.title).trim(),
      description: String(draftRaw.description).trim(),
      categoryName: String(draftRaw.categoryName || "Khác").trim(),
      imagePrompt: String(draftRaw.imagePrompt || "").trim(),
      lessons,
      quizzes,
    };


    return res.json(result);
  } catch (err) {
    console.error("generateCourseDraft error:", err?.stack || err);
    return res.status(500).json({
      message: "Không tạo được bản nháp khóa học.",
      reason: err?.message || "unknown",
      status: err?.status || 500,
    });
  }
};

// POST /api/ai/courses
exports.createCourseFromDraft = async (req, res) => {
  const session = await Course.startSession();
  session.startTransaction();
  try {
    const { draft, instructorId, categoryId } = req.body || {};
    if (
      !draft?.title ||
      !draft?.description ||
      !Array.isArray(draft?.lessons)
    ) {
      return res.status(400).json({ message: "Draft không hợp lệ." });
    }
    if (!instructorId) {
      return res.status(400).json({ message: "Thiếu instructorId." });
    }

    // 1) Category
    let categoryObjectId = categoryId;
    if (!categoryObjectId) {
      const name = (draft.categoryName || "Khác").trim();
      let cat = await Category.findOne({ name }).session(session);
      if (!cat) {
        [cat] = await Category.create([{ name }], { session });
      }
      categoryObjectId = cat._id;
    }

    // 2) Course
    const [courseDoc] = await Course.create(
      [
        {
          title: draft.title,
          description: draft.description,
          imageUrl: draft.imageUrl || null, // nếu bạn tạo ảnh từ imagePrompt
          category: categoryObjectId,
          instructor: instructorId,
          price: draft.price ?? 0,
          published: false,
        },
      ],
      { session }
    );

    // 3) Lessons
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

    // 4) Quizzes (nếu có)
    if (Array.isArray(draft.quizzes)) {
      for (const qset of draft.quizzes) {
        const idx = Math.min(
          Math.max(0, qset.lessonIndex ?? 0),
          lessonDocs.length - 1
        );
        const lessonRef = lessonDocs[idx]?._id;
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
                // Nếu correctAnswers là ["A","C"] => không đổi; nếu trả index => map về chữ
                correctAnswers: Array.isArray(item.correctAnswers)
                  ? item.correctAnswers
                  : [indexByLetter(item.correctAnswers ?? 0)],
              },
            ],
            { session }
          );
        }
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "Khóa học đã được tạo (ở trạng thái nháp).",
      courseId: courseDoc._id,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("createCourseFromDraft error:", err);
    return res.status(500).json({ message: "Tạo khóa học thất bại." });
  }
};
