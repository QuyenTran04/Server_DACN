const Chunk = require("../models/Chunk");
const { embedOne } = require("../services/embedding.service");
const mongoose = require("mongoose");

exports.semanticSearch = async (req, res) => {
  try {
    const { q, courseId, limit = 5 } = req.query;
    if (!q?.trim()) return res.status(400).json({ error: "q is required" });

    const { vector } = await embedOne(q);

    const pipeline = [
      {
        $vectorSearch: {
          index: "lms_chunks_index",
          path: "vector",
          queryVector: vector,
          numCandidates: 100,
          limit: Number(limit) || 5,
          filter: {
            ...(courseId
              ? { courseId: new mongoose.Types.ObjectId(courseId) }
              : {}),
          },
        },
      },
      {
        $project: {
          text: 1,
          source: 1,
          sourceId: 1,
          courseId: 1,
          lessonId: 1,
          _id: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    const results = await Chunk.aggregate(pipeline);
    res.json({ ok: true, count: results.length, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
