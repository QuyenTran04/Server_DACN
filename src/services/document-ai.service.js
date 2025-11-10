const { callGeminiJSON } = require("./gemini.service");
const { callLLMJSON } = require("./llm.service");

/**
 * Sinh tài liệu học tập cho 1 bài học (lesson)
 * @param {Object} config
 * @param {string} config.lessonTitle - Tiêu đề bài học
 * @param {string} config.lessonContent - Nội dung bài học hiện tại (nếu có)
 * @param {string} config.courseTitle - Tiêu đề khóa học
 * @param {string} config.courseDescription - Mô tả khóa học
 * @param {string} config.level - Cấp độ (Beginner, Intermediate, Advanced)
 * @param {string} config.language - Ngôn ngữ (vi, en)
 * @returns {Promise<Object>} { title, content, summary, tags }
 */
async function generateLessonDocument({
  lessonTitle,
  lessonContent = "",
  courseTitle,
  courseDescription = "",
  level = "Beginner",
  language = "vi",
} = {}) {
  console.log(`[generateLessonDocument] Starting for: ${lessonTitle}`);
  try {
    const systemPrompt =
      language === "vi"
        ? `Bạn là chuyên gia giáo dục tạo tài liệu học tập chất lượng cao.
Tạo tài liệu CHI TIẾT, có ví dụ thực tế, dễ hiểu cho mức độ ${level}.
PHẢI trả JSON với structure:
{
  "title": "string - tiêu đề tài liệu",
  "content": "string - nội dung markdown chi tiết (tối thiểu 800 ký tự)",
  "summary": "string - tóm tắt 2-3 dòng",
  "tags": ["string"] - 3-5 từ khóa
}
Yêu cầu:
- Nội dung có cấu trúc rõ ràng với heading, bullet points
- Bao gồm ví dụ cụ thể, ứng dụng thực tế
- Dễ đọc, dễ hiểu, có thể highlight từng phần
- Dùng markdown format`
        : `You are an expert educator creating high-quality learning materials.
Create detailed documents with real-world examples, suitable for ${level}.
MUST return JSON with structure:
{
  "title": "string - document title",
  "content": "string - detailed markdown content (minimum 800 characters)",
  "summary": "string - 2-3 line summary",
  "tags": ["string"] - 3-5 keywords
}
Requirements:
- Well-structured content with headings, bullet points
- Include concrete examples and real-world applications
- Easy to read and understand, with highlighted sections
- Use markdown format`;

    const userPrompt =
      language === "vi"
        ? `Khóa học: ${courseTitle}
Mô tả: ${courseDescription}
Bài học: ${lessonTitle}
${lessonContent ? `Nội dung bài học hiện tại: ${lessonContent}` : ""}
Tạo tài liệu học tập chi tiết, có ví dụ, dễ hiểu cho bài học này.`
        : `Course: ${courseTitle}
Description: ${courseDescription}
Lesson: ${lessonTitle}
${lessonContent ? `Current lesson content: ${lessonContent}` : ""}
Create detailed learning material with examples, easy to understand for this lesson.`;

    const schema = {
      title: "string",
      content: "string",
      summary: "string",
      tags: ["string"],
    };

    const result = await callLLMJSON({
      system: systemPrompt,
      user: userPrompt,
      schema,
      seedObject: {
        title: lessonTitle,
        content: "",
        summary: "",
        tags: [],
      },
      lang: language,
    });

    console.log(`[generateLessonDocument] Success: ${lessonTitle}`, {
      contentLength: result.content?.length,
      hasSummary: !!result.summary,
      tagsCount: result.tags?.length || 0,
    });
    return result;
  } catch (err) {
    console.error("[Document AI Error]", {
      lesson: lessonTitle,
      error: err.message,
      stack: err.stack,
    });
    throw new Error(`Failed to generate document: ${err.message}`);
  }
}

/**
 * Tạo AI chat response để giải đáp câu hỏi về tài liệu
 * @param {Object} config
 * @param {string} config.question - Câu hỏi của người dùng
 * @param {string} config.documentContent - Nội dung tài liệu liên quan
 * @param {string} config.documentTitle - Tiêu đề tài liệu
 * @param {string} config.language - Ngôn ngữ
 * @returns {Promise<string>} Câu trả lời
 */
async function answerQuestionAboutDocument({
  question,
  documentContent = "",
  documentTitle = "",
  language = "vi",
} = {}) {
  try {
    const systemPrompt =
      language === "vi"
        ? `Bạn là gia sư hỗ trợ học tập. 
Trả lời câu hỏi của học sinh dựa trên tài liệu được cung cấp.
- Trả lời rõ ràng, dễ hiểu
- Sử dụng ví dụ từ tài liệu nếu có liên quan
- Nếu câu hỏi nằm ngoài tài liệu, hãy thông báo và cố gắng trả lời chung chung
- Giải thích từng bước nếu là câu hỏi kỹ thuật`
        : `You are a learning support tutor.
Answer the student's question based on the provided document.
- Provide clear, easy-to-understand answers
- Use examples from the document if relevant
- If the question is outside the document scope, notify and provide general guidance
- Explain step-by-step for technical questions`;

    const userPrompt =
      language === "vi"
        ? `Tài liệu: "${documentTitle}"
Nội dung tài liệu:
${documentContent}

Câu hỏi: ${question}`
        : `Document: "${documentTitle}"
Document content:
${documentContent}

Question: ${question}`;

    const response = await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.5,
    });

    return response?.answer || response?.response || JSON.stringify(response);
  } catch (err) {
    console.error("[Document Q&A Error]", err.message);
    throw new Error(`Failed to answer question: ${err.message}`);
  }
}

/**
 * Tạo ví dụ từ nội dung tài liệu
 * @param {Object} config
 * @param {string} config.topic - Chủ đề cần tạo ví dụ
 * @param {string} config.documentContent - Nội dung tài liệu
 * @param {string} config.language - Ngôn ngữ
 * @returns {Promise<string>} Ví dụ chi tiết
 */
async function generateExampleFromDocument({
  topic,
  documentContent = "",
  language = "vi",
} = {}) {
  try {
    const systemPrompt =
      language === "vi"
        ? `Bạn là chuyên gia giáo dục tạo ví dụ minh họa.
Tạo ví dụ cụ thể, dễ hiểu, liên quan đến chủ đề.
- Ví dụ phải chi tiết, bao gồm bước thực hiện
- Nếu có liên quan đến tài liệu, hãy sử dụng ngữ cảnh từ tài liệu
- Trả lời theo format markdown`
        : `You are an expert creating illustrative examples.
Create concrete, easy-to-understand examples related to the topic.
- Examples should be detailed with step-by-step execution
- If related to the document, use the document's context
- Format answer in markdown`;

    const userPrompt =
      language === "vi"
        ? `Tạo ví dụ chi tiết cho chủ đề: "${topic}"
Tài liệu liên quan:
${documentContent}

Hãy tạo ví dụ cụ thể, có thể áp dụng thực tế.`
        : `Create a detailed example for the topic: "${topic}"
Related document:
${documentContent}

Please create a concrete, practical example.`;

    const response = await callGeminiJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
    });

    return response?.example || response?.content || JSON.stringify(response);
  } catch (err) {
    console.error("[Generate Example Error]", err.message);
    throw new Error(`Failed to generate example: ${err.message}`);
  }
}

module.exports = {
  generateLessonDocument,
  answerQuestionAboutDocument,
  generateExampleFromDocument,
};
