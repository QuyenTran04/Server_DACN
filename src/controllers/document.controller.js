const Document = require("../models/Document");
const Lesson = require("../models/Lesson");
const Course = require("../models/Course");
const {
  answerQuestionAboutDocument,
  generateExampleFromDocument,
} = require("../services/document-ai.service");

// GET /api/documents/lesson/:lessonId - Lấy tài liệu của 1 bài học
exports.getDocumentByLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    console.log(`[getDocumentByLesson] Fetching document for lesson: ${lessonId}`);

    const document = await Document.findOne({
      lesson: lessonId,
    }).populate("lesson", "title content");

    console.log(`[getDocumentByLesson] Found:`, document ? "Yes" : "No");

    if (!document) {
      console.log(`[getDocumentByLesson] No document found for lesson ${lessonId}`);
      return res.status(404).json({ message: "Không tìm thấy tài liệu." });
    }

    return res.json(document);
  } catch (err) {
    console.error("[Document Error]", err.message, err.stack);
    return res.status(500).json({ message: "Lỗi lấy tài liệu.", error: err.message });
  }
};

// GET /api/documents/course/:courseId - Lấy tất cả tài liệu của khóa học
exports.getDocumentsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const documents = await Document.find({
      course: courseId,
    })
      .populate("lesson", "title order")
      .sort({ order: 1 });

    return res.json(documents);
  } catch (err) {
    console.error("[Document Error]", err.message);
    return res.status(500).json({ message: "Lỗi lấy danh sách tài liệu." });
  }
};

// POST /api/documents - Tạo/Upload tài liệu
exports.createDocument = async (req, res) => {
  try {
    const {
      lessonId,
      courseId,
      title,
      content,
      contentType = "markdown",
      summary,
      tags = [],
    } = req.body;

    if (!lessonId || !courseId || !title || !content) {
      return res
        .status(400)
        .json({ message: "Thiếu thông tin bắt buộc." });
    }

    // Kiểm tra lesson và course tồn tại
    const lesson = await Lesson.findById(lessonId);
    const course = await Course.findById(courseId);

    if (!lesson || !course) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy bài học hoặc khóa học." });
    }

    const document = await Document.create({
      lesson: lessonId,
      course: courseId,
      title,
      content,
      contentType,
      summary: summary || "",
      tags: Array.isArray(tags) ? tags : [],
      generatedByAI: false,
    });

    return res.status(201).json(document);
  } catch (err) {
    console.error("[Document Create Error]", err.message);
    return res.status(500).json({ message: "Lỗi tạo tài liệu." });
  }
};

// PUT /api/documents/:id - Cập nhật tài liệu
exports.updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, contentType, summary, tags } = req.body;

    const document = await Document.findByIdAndUpdate(
      id,
      {
        title: title || undefined,
        content: content || undefined,
        contentType: contentType || undefined,
        summary: summary || undefined,
        tags: tags || undefined,
      },
      { new: true, runValidators: true }
    );

    if (!document) {
      return res.status(404).json({ message: "Không tìm thấy tài liệu." });
    }

    return res.json(document);
  } catch (err) {
    console.error("[Document Update Error]", err.message);
    return res.status(500).json({ message: "Lỗi cập nhật tài liệu." });
  }
};

// DELETE /api/documents/:id - Xóa tài liệu
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findByIdAndDelete(id);

    if (!document) {
      return res.status(404).json({ message: "Không tìm thấy tài liệu." });
    }

    return res.json({ message: "Xóa tài liệu thành công." });
  } catch (err) {
    console.error("[Document Delete Error]", err.message);
    return res.status(500).json({ message: "Lỗi xóa tài liệu." });
  }
};

// POST /api/documents/:id/ask - AI giải đáp câu hỏi về tài liệu
exports.askAboutDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, language = "vi" } = req.body;

    if (!question) {
      return res.status(400).json({ message: "Vui lòng nhập câu hỏi." });
    }

    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({ message: "Không tìm thấy tài liệu." });
    }

    const answer = await answerQuestionAboutDocument({
      question,
      documentContent: document.content,
      documentTitle: document.title,
      language,
    });

    return res.json({
      question,
      answer,
      documentId: id,
      documentTitle: document.title,
    });
  } catch (err) {
    console.error("[Document Ask Error]", err.message);
    return res
      .status(500)
      .json({ message: "Lỗi xử lý câu hỏi: " + err.message });
  }
};

// POST /api/documents/:id/generate-example - AI tạo ví dụ từ tài liệu
exports.generateExample = async (req, res) => {
  try {
    const { id } = req.params;
    const { topic, language = "vi" } = req.body;

    if (!topic) {
      return res.status(400).json({ message: "Vui lòng nhập chủ đề." });
    }

    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({ message: "Không tìm thấy tài liệu." });
    }

    const example = await generateExampleFromDocument({
      topic,
      documentContent: document.content,
      language,
    });

    return res.json({
      topic,
      example,
      documentId: id,
      documentTitle: document.title,
    });
  } catch (err) {
    console.error("[Generate Example Error]", err.message);
    return res
      .status(500)
      .json({ message: "Lỗi tạo ví dụ: " + err.message });
  }
};

// GET /api/documents/:id - Lấy chi tiết tài liệu
exports.getDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findById(id).populate(
      "lesson",
      "title content"
    );

    if (!document) {
      return res.status(404).json({ message: "Không tìm thấy tài liệu." });
    }

    return res.json(document);
  } catch (err) {
    console.error("[Document Get Error]", err.message);
    return res.status(500).json({ message: "Lỗi lấy tài liệu." });
  }
};
