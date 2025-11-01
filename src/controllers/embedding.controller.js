const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const Quiz = require("../models/Quiz");
const Chunk = require("../models/Chunk");
const { splitToChunks, sha1 } = require("../utils/text-chunk");
const { embedBatch } = require("../services/embedding.service");

async function reindexLessonDoc(lesson) {
  const { _id: lessonId, course: courseId, title, content } = lesson || {};
  const baseText = [title || "", content || ""].filter(Boolean).join("\n");

  if (!baseText.trim()) {
    const del = await Chunk.deleteMany({
      source: "lesson",
      sourceId: lessonId,
    });
    return { inserted: 0, deleted: del.deletedCount };
  }

  const parts = splitToChunks(baseText);
  const { vectors, model, provider, dims } = await embedBatch(parts);

  const del = await Chunk.deleteMany({ source: "lesson", sourceId: lessonId });
  const docs = parts.map((text, i) => ({
    source: "lesson",
    sourceId: lessonId,
    courseId,
    lessonId,
    text,
    vector: vectors[i],
    dims,
    provider,
    model,
    hash: sha1(`lesson:${lessonId}:${text}`),
  }));
  const inserted = docs.length
    ? await Chunk.insertMany(docs, { ordered: false })
    : [];
  return { inserted: inserted.length, deleted: del.deletedCount };
}

exports.reindexLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const lesson = await Lesson.findById(id);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    const result = await reindexLessonDoc(lesson);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

async function reindexCourseDoc(course) {
  const { _id: courseId, title, description } = course || {};
  const baseText = [title || "", description || ""].filter(Boolean).join("\n");
  if (!baseText.trim()) {
    const del = await Chunk.deleteMany({
      source: "course",
      sourceId: courseId,
    });
    return { inserted: 0, deleted: del.deletedCount };
  }
  const parts = splitToChunks(baseText);
  const { vectors, model, provider, dims } = await embedBatch(parts);
  const del = await Chunk.deleteMany({ source: "course", sourceId: courseId });
  const docs = parts.map((text, i) => ({
    source: "course",
    sourceId: courseId,
    courseId,
    text,
    vector: vectors[i],
    dims,
    provider,
    model,
    hash: sha1(`course:${courseId}:${text}`),
  }));
  const inserted = docs.length
    ? await Chunk.insertMany(docs, { ordered: false })
    : [];
  return { inserted: inserted.length, deleted: del.deletedCount };
}

exports.reindexCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ error: "Course not found" });
    const result = await reindexCourseDoc(course);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// --- QUIZ ---
function buildQuizText(quiz) {
  const lines = [];
  if (quiz.question) lines.push(quiz.question);
  if (Array.isArray(quiz.options)) {
    const opts = quiz.options
      .map((o, i) => (o?.text ? `Option ${i + 1}: ${o.text}` : null))
      .filter(Boolean);
    if (opts.length) lines.push(opts.join("\n"));
  }
  return lines.join("\n").trim();
}

async function reindexQuizDoc(quiz) {
  const { _id: quizId, course, lesson } = quiz || {};
  const baseText = buildQuizText(quiz);
  if (!baseText) {
    const del = await Chunk.deleteMany({ source: "quiz", sourceId: quizId });
    return { inserted: 0, deleted: del.deletedCount };
  }
  const parts = splitToChunks(baseText, 700, 250);
  const { vectors, model, provider, dims } = await embedBatch(parts);
  const del = await Chunk.deleteMany({ source: "quiz", sourceId: quizId });
  const docs = parts.map((text, i) => ({
    source: "quiz",
    sourceId: quizId,
    courseId: course,
    lessonId: lesson,
    text,
    vector: vectors[i],
    dims,
    provider,
    model,
    hash: sha1(`quiz:${quizId}:${text}`),
  }));
  const inserted = docs.length
    ? await Chunk.insertMany(docs, { ordered: false })
    : [];
  return { inserted: inserted.length, deleted: del.deletedCount };
}

exports.reindexQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const quiz = await Quiz.findById(id);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    const result = await reindexQuizDoc(quiz);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

async function reindexCourseData(course) {
  const { _id: courseId, title, description } = course || {};
  const baseText = [title || "", description || ""].filter(Boolean).join("\n");
  if (!baseText.trim()) return 0;

  const parts = splitToChunks(baseText);
  const { vectors, model, provider, dims } = await embedBatch(parts);

  await Chunk.deleteMany({ source: "course", sourceId: courseId });
  const docs = parts.map((text, i) => ({
    source: "course",
    sourceId: courseId,
    courseId,
    sourceIdStr: String(courseId),
    courseIdStr: String(courseId),
    text,
    vector: vectors[i],
    dims,
    provider,
    model,
    hash: sha1(`course:${courseId}:${text}`),
  }));

  if (docs.length) await Chunk.insertMany(docs, { ordered: false });
  return docs.length;
}

/** Reindex toàn bộ Lesson trong 1 course */
async function reindexLessonsInCourse(courseId) {
  const lessons = await Lesson.find({ course: courseId });
  let total = 0;

  for (const L of lessons) {
    const baseText = [L.title || "", L.content || ""]
      .filter(Boolean)
      .join("\n");
    if (!baseText.trim()) continue;

    const parts = splitToChunks(baseText);
    const { vectors, model, provider, dims } = await embedBatch(parts);

    await Chunk.deleteMany({ source: "lesson", sourceId: L._id });

    const docs = parts.map((text, i) => ({
      source: "lesson",
      sourceId: L._id,
      courseId,
      lessonId: L._id,
      sourceIdStr: String(L._id),
      courseIdStr: String(courseId),
      lessonIdStr: String(L._id),
      text,
      vector: vectors[i],
      dims,
      provider,
      model,
      hash: sha1(`lesson:${L._id}:${text}`),
    }));

    if (docs.length) await Chunk.insertMany(docs, { ordered: false });
    total += docs.length;
  }
  return total;
}

/** Reindex toàn bộ Quiz trong 1 course */
async function reindexQuizzesInCourse(courseId) {
  const lessons = await Lesson.find({ course: courseId }).select("_id");
  const lessonIds = lessons.map((l) => l._id);
  const quizzes = await Quiz.find({ lesson: { $in: lessonIds } });
  let total = 0;

  for (const Q of quizzes) {
    const question = Q.question || "";
    const optionsText = Array.isArray(Q.options)
      ? Q.options
          .map((o, i) => (o?.text ? `Option ${i + 1}: ${o.text}` : ""))
          .join("\n")
      : "";
    const baseText = [question, optionsText].filter(Boolean).join("\n");

    if (!baseText.trim()) continue;

    const parts = splitToChunks(baseText, 700, 250);
    const { vectors, model, provider, dims } = await embedBatch(parts);

    await Chunk.deleteMany({ source: "quiz", sourceId: Q._id });

    const docs = parts.map((text, i) => ({
      source: "quiz",
      sourceId: Q._id,
      courseId,
      lessonId: Q.lesson,
      sourceIdStr: String(Q._id),
      courseIdStr: String(courseId),
      lessonIdStr: String(Q.lesson),
      text,
      vector: vectors[i],
      dims,
      provider,
      model,
      hash: sha1(`quiz:${Q._id}:${text}`),
    }));

    if (docs.length) await Chunk.insertMany(docs, { ordered: false });
    total += docs.length;
  }
  return total;
}

/** === API chính: reindex toàn bộ course === */
exports.reindexAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({});
    let totalCourses = 0,
      totalLessons = 0,
      totalQuizzes = 0;

    for (const course of courses) {
      console.log(`🔄 Reindexing course: ${course.title}`);
      const cCount = await reindexCourseData(course);
      const lCount = await reindexLessonsInCourse(course._id);
      const qCount = await reindexQuizzesInCourse(course._id);

      totalCourses += cCount;
      totalLessons += lCount;
      totalQuizzes += qCount;
    }

    res.json({
      ok: true,
      message: "Reindex completed for all courses",
      summary: {
        courseVectors: totalCourses,
        lessonVectors: totalLessons,
        quizVectors: totalQuizzes,
        total: totalCourses + totalLessons + totalQuizzes,
      },
    });
  } catch (e) {
    console.error("Reindex all courses error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
