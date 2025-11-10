const { generateLessonDocument } = require("../services/document-ai.service");
const { callLLMJSON } = require("../services/llm.service");

exports.testGenerateDocument = async (req, res) => {
  try {
    console.log("[TEST] Starting document generation test...");
    
    const docData = await generateLessonDocument({
      lessonTitle: "Lập Trình Python Cơ Bản",
      lessonContent: "Học các kiến thức cơ bản về Python",
      courseTitle: "Lập Trình Python Toàn Tập",
      courseDescription: "Khóa học lập trình Python từ cơ bản đến nâng cao",
      level: "Beginner",
      language: "vi",
    });

    console.log("[TEST] Generated document:", {
      title: docData.title,
      contentLen: docData.content?.length,
      summaryLen: docData.summary?.length,
      tagsCount: docData.tags?.length,
    });

    res.json({
      success: true,
      data: docData,
    });
  } catch (err) {
    console.error("[TEST] Error:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack,
    });
  }
};

exports.testCourseDraft = async (req, res) => {
  try {
    console.log("[TEST] Testing course draft generation...");
    console.log("[TEST] GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
    
    const systemPrompt = `Bạn là trợ lý xây dựng khóa học. Trả về JSON với schema:
{
  "title": "string",
  "description": "string",
  "categoryName": "string",
  "imagePrompt": "string",
  "lessons": [{"title": "string", "content": "string"}],
  "quizzes": []
}`;

    const userPrompt = `
Chủ đề: Lập Trình Python
Đối tượng: Người mới bắt đầu
Cấp độ: Beginner
Số bài học: 2
Tạo lộ trình học Python cơ bản.`;

    const schema = {
      title: "string",
      description: "string",
      categoryName: "string",
      imagePrompt: "string",
      lessons: [{ title: "string", content: "string" }],
      quizzes: [],
    };

    console.log("[TEST] Calling LLM...");
    const result = await callLLMJSON({
      system: systemPrompt,
      user: userPrompt,
      schema,
      seedObject: { categoryName: "Khác", imagePrompt: "", lessons: [], quizzes: [] },
      lang: "vi",
    });

    console.log("[TEST] Result:", {
      title: result.title,
      lessonsCount: result.lessons?.length,
      has_description: !!result.description,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("[TEST] Course draft error:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack,
    });
  }
};

exports.testGeminiDirect = async (req, res) => {
  try {
    console.log("[TEST] Testing Gemini API directly...");
    const key = process.env.GEMINI_API_KEY;
    
    if (!key) {
      return res.status(400).json({
        error: "GEMINI_API_KEY not found in .env",
      });
    }

    const axios = require("axios");
    const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

    console.log("[TEST] URL:", url.replace(key, "***"));
    console.log("[TEST] Model:", MODEL);

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                text: `Trả lời "OK" bằng JSON: {"message": "OK"}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      },
      { timeout: 30000 }
    );

    console.log("[TEST] ✓ Gemini response received");
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("[TEST] Response text:", text);

    res.json({
      success: true,
      text: text,
      status: response.status,
    });
  } catch (err) {
    console.error("[TEST] Gemini direct error:", {
      message: err.message,
      status: err?.response?.status,
      data: err?.response?.data,
    });
    res.status(500).json({
      success: false,
      error: err.message,
      status: err?.response?.status,
      data: err?.response?.data,
    });
  }
};
