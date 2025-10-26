// services/quiz-ai.service.js
// Chuẩn hoá quiz mảng đáp án (A,B,C,...) và options [{text,imageUrl?}]
exports.normalizeQuizItems = (items = []) => {
  return items
    .filter(Boolean)
    .map((it) => ({
      question: String(it.question || "").trim(),
      options: (it.options || []).map((o) => ({
        text: String(o.text || "").trim(),
        imageUrl: o.imageUrl || null,
      })),
      correctAnswers:
        Array.isArray(it.correctAnswers) && it.correctAnswers.length
          ? it.correctAnswers
          : ["A"],
    }))
    .filter((it) => it.question && it.options?.length >= 2);
};
