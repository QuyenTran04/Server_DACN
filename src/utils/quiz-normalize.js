// Chuẩn hoá payload về đúng model (options[].text, correctAnswers là text)
exports.normalizeQuizPayload = (q) => {
  const question = String(q.question || q.content || "").trim();

  const options = (q.options || [])
    .map((op) => {
      if (typeof op === "string") return { text: op.trim() };
      return {
        text: String(op?.text || "").trim(),
        imageUrl: op?.imageUrl ? String(op.imageUrl).trim() : undefined,
      };
    })
    .filter((op) => op.text);

  let correctAnswers = Array.isArray(q.correctAnswers)
    ? q.correctAnswers
    : q.answer
    ? [q.answer]
    : [];
  correctAnswers = correctAnswers
    .map((a) => String(a || "").trim())
    .filter(Boolean);

  // Convert chữ cái (A, B, C, D) to option text
  const convertedAnswers = correctAnswers.map((a) => {
    const isLetter = /^[A-Z]$/.test(a);
    if (isLetter) {
      const idx = exports.indexByLetter(a);
      return options[idx]?.text || a;
    }
    return a;
  });

  const optionTexts = new Set(options.map((o) => o.text));
  correctAnswers = convertedAnswers.filter((a) => optionTexts.has(a));

  return { question, options, correctAnswers };
};
// utils/quiz-normalize.js
exports.letterByIndex = (idx) => String.fromCharCode(65 + (idx ?? 0)); // 0->A
exports.indexByLetter = (letter = "A") => Math.max(0, (letter.charCodeAt(0) || 65) - 65);

exports.ensureLessons = (lessons) => {
  const arr = Array.isArray(lessons) ? lessons : [];
  return arr
    .map((l, i) => ({ title: String(l.title || `Bài ${i+1}`).trim(), content: String(l.content || "").trim() }))
    .filter((l) => l.title);
};
