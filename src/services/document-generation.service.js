const { getAgenda } = require("../configs/agenda");
const Document = require("../models/Document");
const Lesson = require("../models/Lesson");
const { generateLessonDocument } = require("./document-ai.service");

// Định nghĩa job "generateLessonDocuments"
const defineGenerateDocumentJob = () => {
  const agenda = getAgenda();

  // Xóa job cũ nếu có (tránh duplicate)
  agenda.removeUndefinedJobs = true;

  agenda.define("generateLessonDocuments", async (job, done) => {
    try {
      const { lessonId, lessonTitle, lessonContent, courseId, courseTitle, courseDescription, level } = job.attrs.data;

      console.log(`[Document Job] 🔄 Bắt đầu tạo tài liệu cho bài: ${lessonTitle}`);

      // Tạo tài liệu
      const docData = await generateLessonDocument({
        lessonTitle,
        lessonContent: lessonContent || "",
        courseTitle,
        courseDescription,
        level: level || "Beginner",
      });

      // Lưu vào DB
      await Document.create({
        lesson: lessonId,
        course: courseId,
        title: docData.title || lessonTitle,
        content: docData.content || "",
        contentType: "markdown",
        generatedByAI: true,
        summary: docData.summary || "",
        tags: docData.tags || [],
      });

      console.log(`[Document Job] ✅ Tài liệu tạo xong: ${lessonTitle}`);
      done();
    } catch (err) {
      console.error(`[Document Job] ❌ Lỗi tạo tài liệu:`, err.message);
      // Không throw, để job được mark as failed nhưng không crash server
      done(err);
    }
  });
};

// Queue job tạo tài liệu cho nhiều bài học
const scheduleDocumentGeneration = async (lessons, courseData) => {
  const agenda = getAgenda();

  const jobs = lessons.map((lesson, index) => {
    const job = agenda.create("generateLessonDocuments", {
      lessonId: lesson._id,
      lessonTitle: lesson.title,
      lessonContent: lesson.content || "",
      courseId: courseData.courseId,
      courseTitle: courseData.courseTitle,
      courseDescription: courseData.courseDescription,
      level: courseData.level || "Beginner",
    });

    // Delay tí để không chạy ngay (tránh quá tải)
    job.schedule(new Date(Date.now() + (index + 1) * 2000)); // Mỗi job delay 2s sau bài trước
    job.unique({ "data.lessonId": lesson._id }); // Chỉ 1 job cho 1 lesson

    return job;
  });

  // Save tất cả job vào DB
  await Promise.all(jobs.map((job) => job.save()));

  console.log(`[Document Service] 📋 Đã queue ${jobs.length} job tạo tài liệu`);
};

// Schedule job tạo tài liệu cho 1 bài (dùng khi tạo bài 1 cần chờ)
const scheduleDocumentGenerationForLesson = async (lesson, courseData, delayMs = 0) => {
  const agenda = getAgenda();

  const job = agenda.create("generateLessonDocuments", {
    lessonId: lesson._id,
    lessonTitle: lesson.title,
    lessonContent: lesson.content || "",
    courseId: courseData.courseId,
    courseTitle: courseData.courseTitle,
    courseDescription: courseData.courseDescription,
    level: courseData.level || "Beginner",
  });

  job.schedule(new Date(Date.now() + delayMs));
  job.unique({ "data.lessonId": lesson._id });
  await job.save();

  console.log(`[Document Service] 📝 Job tạo tài liệu cho bài "${lesson.title}" đã được queue`);
};

module.exports = {
  defineGenerateDocumentJob,
  scheduleDocumentGeneration,
  scheduleDocumentGenerationForLesson,
};
