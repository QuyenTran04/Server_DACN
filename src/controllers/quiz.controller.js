const Quiz = require("../models/Quiz");
const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const Submission = require("../models/Submission"); // nếu cần nộp bài
const upload = require("../middlewares/upload"); // multer memoryStorage: upload.single('file')

const { normalizeQuizPayload } = require("../utils/quiz-normalize");
const {
  textFromPdfBuffer,
  textFromImageBuffer,
} = require("../services/ocr.service");
const ai = require("../services/gemini.service"); // unified (gpt/gemini tuỳ AI_PROVIDER)

// -------- CRUD --------
exports.list = async (req, res) => {
  try {
    const { course, lesson, q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (course) filter.course = course;
    if (lesson) filter.lesson = lesson;
    if (q) filter.question = { $regex: q, $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Quiz.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Quiz.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.detail = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Không tìm thấy" });
    res.json({ quiz });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { course, lesson, imageUrl } = req.body;
    if (!course || !lesson)
      return res.status(400).json({ message: "Thiếu course/lesson" });
    const [okCourse, okLesson] = await Promise.all([
      Course.findById(course),
      Lesson.findById(lesson),
    ]);
    if (!okCourse || !okLesson)
      return res.status(404).json({ message: "Course/Lesson không tồn tại" });

    const { question, options, correctAnswers } = normalizeQuizPayload(
      req.body
    );
    if (!question || options.length < 2 || correctAnswers.length < 1) {
      return res
        .status(400)
        .json({
          message: "Thiếu dữ liệu hợp lệ (question/options/correctAnswers)",
        });
    }

    const quiz = await Quiz.create({
      course,
      lesson,
      question,
      imageUrl,
      options,
      correctAnswers,
    });
    res.status(201).json({ quiz });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const { question, options, correctAnswers } = normalizeQuizPayload(
      req.body
    );

    const quiz = await Quiz.findByIdAndUpdate(
      req.params.id,
      {
        ...(question && { question }),
        ...(imageUrl && { imageUrl }),
        ...(options && { options }),
        ...(correctAnswers && { correctAnswers }),
      },
      { new: true, runValidators: true }
    );
    if (!quiz) return res.status(404).json({ message: "Không tìm thấy" });
    res.json({ quiz });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await Quiz.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Không tìm thấy" });
    res.json({ message: "Đã xoá" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// -------- Nộp bài (Tuỳ chọn) --------
// Body: { selected: [string], durationSeconds? }
exports.submit = async (req, res) => {
  try {
    const student = req.user?.id; // requireAuth đã gán
    const quizId = req.params.id;
    const { selected = [], durationSeconds } = req.body;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz không tồn tại" });

    const correctSet = new Set(
      quiz.correctAnswers.map((s) => String(s).trim())
    );
    const selectedSet = new Set((selected || []).map((s) => String(s).trim()));

    const isCorrect =
      quiz.correctAnswers.length === selectedSet.size &&
      quiz.correctAnswers.every((ans) => selectedSet.has(String(ans).trim()));

    const submission = await Submission.create({
      student,
      quiz: quizId,
      selected: Array.from(selectedSet),
      isCorrect,
      durationSeconds,
      correctAnswersSnapshot: quiz.correctAnswers,
    });

    res.status(201).json({ isCorrect, submission });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// -------- Import PDF/Ảnh -> AI tạo câu hỏi --------
exports.importMiddleware = upload.single("file"); // field name: file

// form-data: file, course, lesson, maxQuestions?, lang?
exports.importFromFile = async (req, res) => {
  try {
    const { course, lesson, maxQuestions , lang = "vie+eng" } = req.body;
    if (!course || !lesson)
      return res.status(400).json({ message: "Thiếu course/lesson" });
    if (!req.file)
      return res.status(400).json({ message: "Thiếu file (field name: file)" });

    const [okCourse, okLesson] = await Promise.all([
      Course.findById(course),
      Lesson.findById(lesson),
    ]);
    if (!okCourse || !okLesson)
      return res.status(404).json({ message: "Course/Lesson không tồn tại" });

    const mime = req.file.mimetype;
    let rawText = "";
    if (mime === "application/pdf") {
      rawText = await textFromPdfBuffer(req.file.buffer);
    } else if (/^image\//.test(mime)) {
      rawText = await textFromImageBuffer(req.file.buffer, lang);
    } else {
      return res
        .status(400)
        .json({ message: `Không hỗ trợ mimetype: ${mime}` });
    }

    if (!rawText || rawText.length < 20) {
      return res
        .status(422)
        .json({ message: "OCR không đủ nội dung để tạo quiz" });
    }

    // AI: [{content, options[], answer?}]
    let items = await ai.extractQuestions(rawText, {
      maxQuestions: Number(maxQuestions) || 10,
    });

    // Lấp đáp án thiếu (tùy chọn)
    for (const it of items) {
      if (!it.answer) {
        try {
          it.answer = await ai.solveQuestion({
            content: it.content,
            options: it.options,
          });
        } catch {}
      }
    }

    // Map -> đúng model
    const docs = [];
    for (const it of items) {
      const payload = normalizeQuizPayload({
        question: it.content,
        options: it.options,
        correctAnswers: it.answer ? [it.answer] : [],
      });

      if (
        payload.question &&
        payload.options.length >= 2 &&
        payload.correctAnswers.length >= 1
      ) {
        docs.push({
          course,
          lesson,
          question: payload.question,
          options: payload.options,
          correctAnswers: payload.correctAnswers,
        });
      }
    }

    if (!docs.length)
      return res.status(422).json({ message: "Không tạo được câu hỏi hợp lệ" });

    const inserted = await Quiz.insertMany(docs); // run schema validators
    res.status(201).json({
      message: `Đã tạo ${inserted.length} câu hỏi`,
      count: inserted.length,
      items: inserted,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Lỗi import quiz" });
  }
};

// -------- Thống kê nhanh theo lesson/course (tuỳ chọn) --------
exports.statsByLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const total = await Quiz.countDocuments({ lesson: lessonId });
    res.json({ lessonId, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.removeAllByLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    console.log("removeAllByLesson called for lessonId:", lessonId);
    const lesson = await Lesson.findById(lessonId).select("course");
    if (!lesson) {
      return res.status(404).json({ message: "Không tìm thấy bài học" });
    }

    const course = await Course.findById(lesson.course).select("instructor");
    if (!course) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy khóa học của bài học này" });
    }

 
    const isOwner =
      String(course.instructor) === String(req.user?.id || req.user?._id);
    const isAdmin = req.user?.role === "admin";
    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xóa quiz của bài học này" });
    }


    const quizIds = await Quiz.find({ lesson: lessonId }).distinct("_id");

    if (!quizIds.length) {
      return res.json({
        message: "Không có câu hỏi nào để xóa",
        deletedQuizzes: 0,
        deletedSubmissions: 0,
      });
    }

    const [quizDel, subDel] = await Promise.all([
      Quiz.deleteMany({ _id: { $in: quizIds } }),
      Submission.deleteMany({ quiz: { $in: quizIds } }),
    ]);

    return res.json({
      message: "Đã xóa tất cả câu hỏi của bài học",
      deletedQuizzes: quizDel.deletedCount || 0,
      deletedSubmissions: subDel.deletedCount || 0,
      lessonId,
    });
  } catch (err) {
    console.error("removeAllByLesson error:", err);
    return res
      .status(500)
      .json({ message: "Lỗi server khi xóa quiz theo lesson" });
  }
};