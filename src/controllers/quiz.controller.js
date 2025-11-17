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

    const correctAnswerStrings = (quiz.correctAnswers || []).map((s) => String(s).trim());
    const selectedStrings = (selected || []).map((s) => String(s).trim());

    // Extract option indices from selected (format: "quizId-index")
    const selectedIndices = selectedStrings
      .map((s) => {
        const parts = s.split("-");
        const idx = parseInt(parts[parts.length - 1], 10);
        return isNaN(idx) ? s : String(idx);
      });

    // Build mapping of option text/id to index
    const optionIds = (quiz.options || []).map((o, idx) => ({
      index: String(idx),
      id: o?._id?.toString() || o?.id || String(idx),
      text: o?.text || "",
    }));

    // Convert correctAnswers (text or id) to indices
    const correctIndices = correctAnswerStrings.map((ans) => {
      // Try match by id first
      let opt = optionIds.find((o) => o.id === ans);
      // If not found, try match by text
      if (!opt) {
        opt = optionIds.find((o) => o.text === ans || o.text.trim() === ans.trim());
      }
      return opt?.index || ans;
    });

    console.log("[Quiz Submit Debug]", {
      quizId,
      question: quiz.question?.substring(0, 50),
      correctAnswers: correctAnswerStrings,
      correctIndices,
      selected: selectedStrings,
      selectedIndices,
      optionsIds: optionIds.map((o) => ({ idx: o.index, id: o.id })),
    });

    const correctSet = new Set(correctIndices);
    const selectedSet = new Set(selectedIndices);

    const isCorrect =
      correctIndices.length === selectedSet.size &&
      correctIndices.every((ans) => selectedSet.has(ans));

    const submission = await Submission.create({
      student,
      quiz: quizId,
      selected: Array.from(selectedSet),
      isCorrect,
      durationSeconds,
      correctAnswersSnapshot: quiz.correctAnswers,
    });

    console.log("[Quiz Submit Result]", { isCorrect, selectedSize: selectedSet.size, correctSize: correctIndices.length });

    // Map back to option format for frontend
    const correctAnswerOptions = correctIndices.map((idx) => {
      const optIdx = parseInt(idx, 10);
      return (quiz.options || [])[optIdx];
    });

    // Add correctAnswers to submission for frontend
    const submissionWithAnswers = {
      ...submission.toObject(),
      correctAnswers: correctIndices.map((idx) => {
        const optIdx = parseInt(idx, 10);
        const opt = (quiz.options || [])[optIdx];
        return opt?._id?.toString() || opt?.id || `${quizId}-${idx}`;
      }),
    };

    res.status(201).json({ 
      isCorrect, 
      submission: submissionWithAnswers,
      correctAnswers: correctIndices,
      correctAnswerOptions,
    });
  } catch (err) {
    console.error("[Quiz Submit Error]", err);
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

// Lấy quiz theo lesson để LÀM BÀI: ẩn correctAnswers, random & giới hạn số lượng
exports.forLessonToTake = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { shuffle = "1" } = req.query;

    const quizzes = await Quiz.find({ lesson: lessonId })
      .select("_id question options correctAnswers imageUrl")
      .sort({ createdAt: 1 })
      .lean();

    if (!quizzes.length) return res.json({ lessonId, count: 0, items: [] });

    const shuffleArr = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    // Helper: ép mọi kiểu option về string
    const toPlainText = (v) => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        // xử lý các dạng phổ biến: {text:"..."}, {label:"..."}, {value:"..."} hoặc {text:{text:"..."}}
        if (typeof v.text === "string") return v.text;
        if (
          v.text &&
          typeof v.text === "object" &&
          typeof v.text.text === "string"
        )
          return v.text.text;
        if (typeof v.label === "string") return v.label;
        if (typeof v.value === "string") return v.value;
      }
      return String(v ?? "");
    };

    const norm = (s) => String(s).trim();

    const items = quizzes.map((q) => {
      const flatOptions = (q.options || []).map(toPlainText);
      const options = flatOptions.map((text, idx) => ({
        id: `${q._id}-${idx}`,
        text, // ← luôn là string
      }));

      const correctSet = new Set(
        (q.correctAnswers || []).map((x) => norm(toPlainText(x)))
      );
      const correctOptionIds = options
        .filter((op) => correctSet.has(norm(op.text)))
        .map((op) => op.id);

      const finalOptions = shuffle === "1" ? shuffleArr([...options]) : options;

      return {
        id: q._id,
        question: q.question,
        options: finalOptions,
        imageUrl: q.imageUrl || null,
        // luôn trả đáp án để FE so sánh
        correctOptionIds,
        correctAnswersText: [...correctSet], // tiện debug/log
      };
    });

    const finalItems = shuffle === "1" ? shuffleArr(items) : items;

    res.json({ lessonId, count: finalItems.length, items: finalItems });
  } catch (err) {
    console.error("forLessonToTake error:", err);
    res.status(500).json({ message: err.message });
  }
};

// 🎯 Generate quizzes on-demand
exports.generateQuizzes = async (req, res) => {
  try {
    const { lessonId, questionCount = 5 } = req.body;
    const userId = req.user?._id || req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Bạn chưa đăng nhập" });
    }

    if (!lessonId) {
      return res.status(400).json({ message: "Thiếu lessonId" });
    }

    const numQuestions = Math.min(Math.max(1, parseInt(questionCount) || 5), 20);
    
    console.log(`[generateQuizzes] User ${userId} generating ${numQuestions} questions for lesson: ${lessonId}`);

    // Fetch lesson & course info
    const lesson = await Lesson.findById(lessonId).populate('course');
    if (!lesson) {
      return res.status(404).json({ message: "Bài học không tồn tại" });
    }

    const course = lesson.course;
    if (!course) {
      return res.status(404).json({ message: "Khóa học không tồn tại" });
    }

    // Verify user is course instructor (optional - allow for now)
    // In future: only allow if user._id === course.instructor._id OR user is admin
    console.log(`[generateQuizzes] Course instructor: ${course.instructor}, User: ${userId}`);

    // Check if quizzes already exist for this lesson
    const existingQuizzes = await Quiz.countDocuments({ lesson: lessonId });
    if (existingQuizzes > 0) {
      console.warn(`[generateQuizzes] Quiz already exists for lesson ${lessonId}`);
      return res.status(409).json({ 
        message: "Bài học này đã có bộ câu hỏi rồi",
        existingCount: existingQuizzes 
      });
    }

    // Import helper functions
    const { generateExtraQuizItems } = require('./aiCourse.controller');
    const { indexByLetter } = require('../utils/quiz-normalize');
    
    // Generate quiz items using AI
    const quizItems = await generateExtraQuizItems({
      lessonTitle: lesson.title,
      lessonContent: lesson.content || "",
      needed: numQuestions,
    });

    if (!quizItems || quizItems.length === 0) {
      return res.status(500).json({ message: "Không thể tạo câu hỏi. Vui lòng thử lại" });
    }

    // Save quizzes to database
    const createdQuizzes = [];
    for (const item of quizItems) {
      const quiz = await Quiz.create({
        course: course._id,
        lesson: lessonId,
        question: item.question,
        options: (item.options || []).map((o) => ({
          text: o.text,
          imageUrl: o.imageUrl || null,
        })),
        correctAnswers: Array.isArray(item.correctAnswers)
          ? item.correctAnswers
          : [indexByLetter(item.correctAnswers ?? 0)],
      });
      createdQuizzes.push(quiz);
    }

    console.log(`[generateQuizzes] ✅ Created ${createdQuizzes.length} quizzes for lesson ${lessonId}`);

    res.status(201).json({
      message: `Đã tạo ${createdQuizzes.length} câu hỏi thành công`,
      lessonId,
      count: createdQuizzes.length,
      quizzes: createdQuizzes,
    });
  } catch (err) {
    console.error("[generateQuizzes] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
};